const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const compression = require('compression');
const webpush = require('web-push');

// ── Sync DB (Neon PostgreSQL) ────────────────────────────────────────
// Set DATABASE_URL env var (Neon connection string) to enable sync endpoints.
let Pool = null;
if (process.env.DATABASE_URL) {
  try { Pool = require('pg').Pool; } catch (e) { console.warn('[Sync] pg module not found — run: npm install pg'); }
}

const app = express();
const PORT = process.env.PORT || 3000;
const LTA_API_KEY = process.env.LTA_API_KEY;

// ── Web Push (VAPID) Setup ───────────────────────────────────────────
// Generate keys once with: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars on Heroku.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
let pushEnabled = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@buszy.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  pushEnabled = true;
  console.log('[Push] Web Push enabled');
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled');
}

// Subscription store: "busStopCode:serviceNo" → [{subscription, threshold, notifiedUntil, arrivedNotifiedUntil}]
// Persisted to disk so subscriptions survive process restarts.
// On Heroku, the filesystem is ephemeral across dyno restarts — client-side re-registration
// (BuszyPushNotify.reRegisterAll on page load) handles that case automatically.
const SUBS_FILE = path.join(__dirname, '.push-subs.json');
const pushWatchers = new Map();

function loadWatchers() {
  try {
    const raw = fs.readFileSync(SUBS_FILE, 'utf8');
    const entries = JSON.parse(raw);
    for (const [key, watchers] of entries) pushWatchers.set(key, watchers);
    console.log(`[Push] Loaded ${pushWatchers.size} subscription keys from disk`);
  } catch { /* file missing or unreadable — start fresh */ }
}

function saveWatchers() {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify([...pushWatchers.entries()]), 'utf8');
  } catch (e) {
    console.warn('[Push] Could not persist subscriptions to disk:', e.message);
  }
}

loadWatchers();

// ── Service Alert Push Subscriptions ────────────────────────────────
// Simple array — every subscriber gets every new bus service alert.
const ALERT_SUBS_FILE = path.join(__dirname, '.alert-subs.json');
const alertWatchers = [];       // [{ subscription }]
let lastAlertTs = Date.now();   // Watermark so existing alerts don't fire on first run.

function loadAlertWatchers() {
  try {
    const raw = fs.readFileSync(ALERT_SUBS_FILE, 'utf8');
    const data = JSON.parse(raw);
    alertWatchers.push(...(data.watchers || []));
    if (data.lastAlertTs) lastAlertTs = data.lastAlertTs;
    console.log(`[AlertPush] Loaded ${alertWatchers.length} alert subscribers`);
  } catch { /* file missing — start fresh */ }
}

function saveAlertWatchers() {
  try {
    fs.writeFileSync(ALERT_SUBS_FILE, JSON.stringify({ watchers: alertWatchers, lastAlertTs }), 'utf8');
  } catch (e) {
    console.warn('[AlertPush] Could not persist alert subscriptions:', e.message);
  }
}

loadAlertWatchers();

// ── Sync Data Store ──────────────────────────────────────────────────
let syncPool = null;
const VALID_SYNC_APPS = new Set(['buszy', 'fin-track', 'rail-buddy']);
const SYNC_CODE_RE    = /^[a-z0-9]{5}-[a-z0-9]{5}$/;
const SYNC_MAX_BYTES  = 2 * 1024 * 1024; // 2 MB per entry

// In-memory rate limiter: max 60 ops per sync code per hour
const _syncRateMap = new Map();
function _syncRateOk(code) {
  const now = Date.now();
  let e = _syncRateMap.get(code);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + 3_600_000 }; _syncRateMap.set(code, e); }
  return ++e.count <= 60;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _syncRateMap) if (now > e.resetAt) _syncRateMap.delete(k);
}, 3_600_000);

if (Pool) {
  syncPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  syncPool.query(`
    CREATE TABLE IF NOT EXISTS sync_data (
      sync_code  TEXT   NOT NULL,
      app_id     TEXT   NOT NULL,
      data       TEXT   NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (sync_code, app_id)
    )
  `)
    .then(() => console.log('[Sync] sync_data table ready'))
    .catch(err => console.error('[Sync] Table init error:', err.message));
  console.log('[Sync] Database pool created');
} else {
  console.warn('[Sync] DATABASE_URL not set — /sync endpoints will return 503');
}

// Reuse TCP connections to DataMall (avoids TLS handshake on every request)
const ltaApi = axios.create({
  baseURL: 'https://datamall2.mytransport.sg/ltaodataservice',
  headers: {
    AccountKey: LTA_API_KEY,
    accept: 'application/json',
  },
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 10000,
});

// ── Bus Stops Cache ──────────────────────────────────────────────────
let cachedBusStops = null;
let busStopsCacheTime = 0;
const BUS_STOPS_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getAllBusStops() {
  const now = Date.now();
  if (cachedBusStops && now - busStopsCacheTime < BUS_STOPS_TTL) {
    return cachedBusStops;
  }

  let busStops = [];
  let skip = 0;
  let hasMoreData = true;

  while (hasMoreData) {
    const response = await ltaApi.get(`/BusStops?$skip=${skip}`);
    const data = response.data.value;

    if (data.length === 0) {
      hasMoreData = false;
    } else {
      busStops = busStops.concat(data);
      skip += 500;
    }
  }

  cachedBusStops = busStops;
  busStopsCacheTime = now;
  console.log(`Bus stops cache refreshed: ${busStops.length} stops`);
  return busStops;
}

// Pre-warm cache on startup
getAllBusStops().catch(err => console.error('Failed to pre-warm bus stops cache:', err.message));

// Enable gzip compression for all responses
app.use(compression());

// Enable CORS with explicit configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Define all API routes BEFORE static file serving
// Define the /bus-arrivals route
app.get('/bus-arrivals', async (req, res) => {
  try {
    const busStopCode = req.query.BusStopCode;

    if (!busStopCode) {
      return res.status(400).send('BusStopCode is required');
    }

    const response = await ltaApi.get(`/v3/BusArrival?BusStopCode=${busStopCode}`);

    // Add server timestamp for client-side clock synchronization
    // This ensures consistent time calculations across all devices
    const responseWithTime = {
      ...response.data,
      serverTime: new Date().toISOString()
    };

    // Real-time data — never cache (auto-refreshes every 2s on client)
    res.set('Cache-Control', 'no-store');
    res.json(responseWithTime);
  } catch (error) {
    console.error('Error fetching data from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-stops route with skip support (uses cached bus stops)
app.get('/bus-stops', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;
    const end = req.query.$end === 'true';

    const busStops = await getAllBusStops();

    let paginatedBusStops;
    if (end) {
      paginatedBusStops = busStops.slice(-limit);
    } else {
      paginatedBusStops = busStops.slice(skip, skip + limit);
    }

    // Bus stop list is quasi-static — cache for 1 hour client-side
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ value: paginatedBusStops });
  } catch (error) {
    console.error('Error fetching bus stops from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Define the /nearby-bus-stops route (uses cached bus stops)
app.get('/nearby-bus-stops', async (req, res) => {
  try {
    const { latitude, longitude, radius = 2 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).send('Latitude and Longitude are required');
    }

    const busStops = await getAllBusStops();

    const nearbyBusStops = busStops
      .map((busStop) => {
        const distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          busStop.Latitude,
          busStop.Longitude
        );
        return { ...busStop, distance };
      })
      .filter((busStop) => busStop.distance <= parseFloat(radius))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    // Nearby results change as user moves, but stops themselves are static
    res.set('Cache-Control', 'public, max-age=60');
    res.json(nearbyBusStops);
  } catch (error) {
    console.error('Error fetching nearby bus stops:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /train-service-alerts route
app.get('/train-service-alerts', async (req, res) => {
  try {
    const response = await ltaApi.get('/TrainServiceAlerts');

    res.set('Cache-Control', 'public, max-age=30');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching train service alerts from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-routes route with skip support
app.get('/bus-routes', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;

    const response = await ltaApi.get(`/BusRoutes?$skip=${skip}`);

    // Bus routes are quasi-static — cache for 24 hours client-side
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching bus routes from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-stop-det route (get specific bus stop details)
app.get('/bus-stop-det', async (req, res) => {
  try {
    const busStopCode = req.query.BusStopCode;

    if (!busStopCode) {
      return res.status(400).send('BusStopCode is required');
    }

    const busStops = await getAllBusStops();
    const busStop = busStops.find(stop => stop.BusStopCode === busStopCode);

    if (!busStop) {
      return res.status(404).send('Bus stop not found');
    }

    // Bus stop details are quasi-static — cache for 1 hour client-side
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(busStop);
  } catch (error) {
    console.error('Error fetching bus stop details:', error.message);
    res.status(500).send('Error fetching bus stop details');
  }
});

// Define the /bus-services route with skip support
app.get('/bus-services', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;

    const response = await ltaApi.get(`/BusServices?$skip=${skip}`);

    // Bus services are quasi-static — cache for 24 hours client-side
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching bus services from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// ── Push Notification Endpoints ─────────────────────────────────────

// Expose the VAPID public key so the frontend can subscribe
app.get('/push/vapid-public-key', (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Push notifications not configured' });
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(VAPID_PUBLIC_KEY);
});

// Subscribe: save a push subscription for a bus stop + service
app.post('/push/subscribe', express.json(), (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Push notifications not configured' });

  const { subscription, busStopCode, serviceNo, threshold, notifyMode, notifyWhen } = req.body;
  if (!subscription || !subscription.endpoint || !busStopCode || !serviceNo) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate threshold (1–10 minutes)
  const mins = Math.min(10, Math.max(1, parseInt(threshold, 10) || 1));
  const mode = ['once', 'day', 'always'].includes(notifyMode) ? notifyMode : 'once';
  const when = ['arriving', 'arrived', 'both'].includes(notifyWhen) ? notifyWhen : 'arriving';
  const expiresAt = mode === 'day' ? Date.now() + 24 * 60 * 60 * 1000 : null;
  const key = `${busStopCode}:${serviceNo}`;

  if (!pushWatchers.has(key)) pushWatchers.set(key, []);
  const watchers = pushWatchers.get(key);

  // Replace existing subscription from the same endpoint (re-subscribe)
  const idx = watchers.findIndex(w => w.subscription.endpoint === subscription.endpoint);
  const entry = { subscription, threshold: mins, notifyMode: mode, notifyWhen: when, expiresAt, notifiedUntil: 0, arrivedNotifiedUntil: 0 };
  if (idx >= 0) {
    watchers[idx] = entry;
  } else {
    watchers.push(entry);
  }

  saveWatchers();
  console.log(`[Push] Subscribed: stop=${busStopCode} svc=${serviceNo} threshold=${mins}min (total watchers: ${watchers.length})`);
  res.status(201).json({ ok: true });
});

// Unsubscribe: remove a push subscription
app.post('/push/unsubscribe', express.json(), (req, res) => {
  const { subscription, busStopCode, serviceNo } = req.body;
  if (!subscription || !subscription.endpoint || !busStopCode || !serviceNo) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const key = `${busStopCode}:${serviceNo}`;
  const watchers = pushWatchers.get(key);
  if (watchers) {
    const filtered = watchers.filter(w => w.subscription.endpoint !== subscription.endpoint);
    if (filtered.length === 0) {
      pushWatchers.delete(key);
    } else {
      pushWatchers.set(key, filtered);
    }
  }

  saveWatchers();
  console.log(`[Push] Unsubscribed: stop=${busStopCode} svc=${serviceNo}`);
  res.json({ ok: true });
});

// Subscribe to bus service alert push notifications
app.post('/push/subscribe-alerts', express.json(), (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: 'Push notifications not configured' });
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  const idx = alertWatchers.findIndex(w => w.subscription.endpoint === subscription.endpoint);
  if (idx < 0) alertWatchers.push({ subscription });
  else alertWatchers[idx].subscription = subscription;
  saveAlertWatchers();
  console.log(`[AlertPush] Subscribed: ${alertWatchers.length} total subscribers`);
  res.status(201).json({ ok: true });
});

// Unsubscribe from bus service alert push notifications
app.post('/push/unsubscribe-alerts', express.json(), (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  const idx = alertWatchers.findIndex(w => w.subscription.endpoint === subscription.endpoint);
  if (idx >= 0) alertWatchers.splice(idx, 1);
  saveAlertWatchers();
  console.log(`[AlertPush] Unsubscribed: ${alertWatchers.length} total subscribers`);
  res.json({ ok: true });
});

// ── Bus Arrival Polling Job ──────────────────────────────────────────
// Checks every 30 seconds; sends a push when the next bus is within threshold.
// A 3-minute cooldown prevents repeated notifications for the same arrival.
if (pushEnabled) {
  setInterval(async () => {
    if (pushWatchers.size === 0) return;
    const now = Date.now();

for (const [key, watchers] of [...pushWatchers.entries()]) {
        if (watchers.length === 0) continue;
        const [busStopCode, serviceNo] = key.split(':');

        // Remove expired 'day' mode watchers
        const activeWatchers = watchers.filter(w => !(w.notifyMode === 'day' && w.expiresAt && now > w.expiresAt));
        if (activeWatchers.length !== watchers.length) {
          if (activeWatchers.length === 0) { pushWatchers.delete(key); saveWatchers(); continue; }
          pushWatchers.set(key, activeWatchers);
          saveWatchers();
        }

      let etaMinutes, etaSeconds;
      try {
        const resp = await ltaApi.get(`/v3/BusArrival?BusStopCode=${busStopCode}&ServiceNo=${serviceNo}`);
        const service = resp.data.Services?.[0];
        if (!service || !service.NextBus?.EstimatedArrival) continue;
        etaSeconds = Math.max(0, Math.round((new Date(service.NextBus.EstimatedArrival) - now) / 1000));
        etaMinutes = Math.floor(etaSeconds / 60);
      } catch {
        continue; // skip on API error
      }

        for (const watcher of activeWatchers) {
        if (etaMinutes > watcher.threshold) {
          // Bus not close yet — reset cooldowns so next approach triggers notifications
          watcher.notifiedUntil = 0;
          watcher.arrivedNotifiedUntil = 0;
          continue;
        }

        // Reset arrived cooldown while bus is still approaching (not yet at stop)
        if (etaSeconds > 0) watcher.arrivedNotifiedUntil = 0;

        // ── "Approaching" notification (within threshold but not yet at stop) ──
        // Use etaSeconds so buses at <60s (etaMinutes=0) still get an approaching alert
        const wantApproaching = !watcher.notifyWhen || watcher.notifyWhen === 'arriving' || watcher.notifyWhen === 'both';
        const wantArrived    = watcher.notifyWhen === 'arrived' || watcher.notifyWhen === 'both';
        // Also fire when etaSeconds=0 if user hasn't opted into the separate 'arrived' notification —
        // prevents missed notifications when the bus ETA jumps past the threshold window in one poll cycle.
        if (wantApproaching && (etaSeconds > 0 || !wantArrived) && now >= watcher.notifiedUntil) {
          const isAtStop = etaSeconds === 0;
          const payload = JSON.stringify({
            title: isAtStop ? `Bus ${serviceNo} has arrived!` : `Bus ${serviceNo} arriving soon`,
            body: isAtStop
              ? `Stop ${busStopCode} — your bus is here`
              : `Stop ${busStopCode} — ${etaMinutes > 0 ? 'arriving in ' + etaMinutes + ' min(s)' : 'Arriving'}`,
            data: { busStopCode, serviceNo, type: isAtStop ? 'arrived' : 'approaching', notifyMode: watcher.notifyMode || 'once' }
          });
          try {
            await webpush.sendNotification(watcher.subscription, payload, {
              urgency: 'high',
              TTL: watcher.threshold * 60  // expire after the threshold window passes
            });
            watcher.notifiedUntil = now + 3 * 60 * 1000; // 3-minute cooldown
            console.log(`[Push] Notified approaching: stop=${busStopCode} svc=${serviceNo} eta=${etaMinutes}min mode=${watcher.notifyMode}`);
            // 'once' + 'arriving' only: watcher's job is done after this notification
            if ((watcher.notifyMode || 'once') === 'once' && !wantArrived) {
              const idx = activeWatchers.indexOf(watcher);
              if (idx >= 0) activeWatchers.splice(idx, 1);
              if (activeWatchers.length === 0) pushWatchers.delete(key);
              else pushWatchers.set(key, activeWatchers);
              saveWatchers();
            }
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              const idx = activeWatchers.indexOf(watcher);
              if (idx >= 0) activeWatchers.splice(idx, 1);
              if (activeWatchers.length === 0) pushWatchers.delete(key);
              else pushWatchers.set(key, activeWatchers);
              saveWatchers();
              console.log(`[Push] Removed stale subscription: stop=${busStopCode} svc=${serviceNo}`);
            }
          }
        }

        // ── "Arrived" notification (bus is at the stop, eta = 0) ──
        if (wantArrived && etaSeconds === 0 && now >= (watcher.arrivedNotifiedUntil || 0)) {
          const payload = JSON.stringify({
            title: `Bus ${serviceNo} has arrived!`,
            body: `Stop ${busStopCode} — your bus is here`,
            data: { busStopCode, serviceNo, type: 'arrived', notifyMode: watcher.notifyMode || 'once' }
          });
          try {
            await webpush.sendNotification(watcher.subscription, payload, {
              urgency: 'high',
              TTL: 120  // bus won't be at the stop for more than 2 minutes
            });
            watcher.arrivedNotifiedUntil = now + 5 * 60 * 1000; // 5-minute cooldown
            console.log(`[Push] Notified arrived: stop=${busStopCode} svc=${serviceNo}`);
            // 'once' mode: remove watcher after the arrived notification (bus is here)
            if ((watcher.notifyMode || 'once') === 'once') {
              const idx = activeWatchers.indexOf(watcher);
              if (idx >= 0) activeWatchers.splice(idx, 1);
              if (activeWatchers.length === 0) pushWatchers.delete(key);
              else pushWatchers.set(key, activeWatchers);
              saveWatchers();
            }
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              const idx = activeWatchers.indexOf(watcher);
              if (idx >= 0) activeWatchers.splice(idx, 1);
              if (activeWatchers.length === 0) pushWatchers.delete(key);
              else pushWatchers.set(key, activeWatchers);
              saveWatchers();
              console.log(`[Push] Removed stale subscription: stop=${busStopCode} svc=${serviceNo}`);
            }
          }
        }
      }
    }
  }, 30_000);

  // ── Service Alert Polling Job ──────────────────────────────────────
  // Checks every 2 minutes for new bus service alerts and notifies subscribers.
  setInterval(async () => {
    if (alertWatchers.length === 0) return;
    try {
      const resp = await ltaApi.get('/TrainServiceAlerts');
      const data = resp.data;
      if (!data || !data.value) return;

      const alerts = Array.isArray(data.value) ? data.value : [data.value];
      const newAlerts = [];
      let maxTs = lastAlertTs;

      for (const alert of alerts) {
        if (!alert.Message || !Array.isArray(alert.Message)) continue;
        for (const msgObj of alert.Message) {
          const msgLower = (msgObj.Content || '').toLowerCase();
          if (!msgLower.includes('bus service') ||
              (!msgLower.includes('affected') && !msgLower.includes('diverted') && !msgLower.includes('delayed'))) continue;
          const ts = msgObj.CreatedDate ? new Date(msgObj.CreatedDate).getTime() : 0;
          if (ts > lastAlertTs) {
            newAlerts.push({ content: msgObj.Content, ts });
            if (ts > maxTs) maxTs = ts;
          }
        }
      }

      if (newAlerts.length === 0) return;
      lastAlertTs = maxTs;
      saveAlertWatchers();

      // Extract up to 5 service codes from the first new alert for the notification body
      const raw = newAlerts[0].content;
      const busServicesRegex = /bus services?\s*[:\-]?\s*([^.]+?)(?:\s+(?:are|is)\s+(?:affected|diverted|disrupted|delayed)|\s*$)/i;
      const codeMatch = raw.match(busServicesRegex);
      let codes = '';
      if (codeMatch) {
        const matches = [...codeMatch[1].matchAll(/\b(\d{2,4}[A-Za-z]?)\b/g)].map(m => m[1]);
        const filtered = [...new Set(matches)].filter(c => { const n = parseInt(c); return n >= 10 && n <= 9999; });
        codes = filtered.slice(0, 5).join(', ');
      }
      const body = codes ? `Services ${codes} affected` : 'A bus service is affected. Tap for details.';
      const payload = JSON.stringify({
        title: 'Bus Service Alert',
        body,
        data: { type: 'service-alert' }
      });

      for (let i = alertWatchers.length - 1; i >= 0; i--) {
        try {
          await webpush.sendNotification(alertWatchers[i].subscription, payload, { urgency: 'high', TTL: 3600 });
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            alertWatchers.splice(i, 1);
            saveAlertWatchers();
          }
        }
      }
      console.log(`[AlertPush] Sent to ${alertWatchers.length} subscribers: ${body}`);
    } catch (e) {
      console.warn('[AlertPush] Polling error:', e.message);
    }
  }, 2 * 60 * 1000); // every 2 minutes

  // Keep the Heroku dyno awake while push subscriptions are active.
  // Heroku eco/free dynos sleep after 30 min of no HTTP traffic, which kills the polling job.
  // process.env.DYNO is only set on Heroku, so this only runs in production.
  if (process.env.DYNO) {
    const SELF_URL = process.env.APP_URL || 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
    setInterval(() => {
      if (pushWatchers.size === 0) return;
      https.get(SELF_URL + '/push/vapid-public-key').on('error', err => {
        console.warn('[Push] Self-ping failed:', err.message);
      });
      console.log(`[Push] Self-ping sent (${pushWatchers.size} active watcher keys)`);
    }, 25 * 60 * 1000); // every 25 minutes
  }
}

// ── Sync Routes ─────────────────────────────────────────────────────
function syncCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}
// Handle CORS preflight — explicit handlers to avoid Express wildcard matching issues
app.options('/sync/:code/:appId', (req, res) => { syncCors(req, res); res.sendStatus(204); });
app.options('/sync/:code',        (req, res) => { syncCors(req, res); res.sendStatus(204); });

// GET /sync/:code/:appId — retrieve stored data
app.get('/sync/:code/:appId', async (req, res) => {
  syncCors(req, res);
  if (!syncPool) return res.status(503).json({ error: 'Sync not available — set DATABASE_URL to enable' });
  const { code, appId } = req.params;
  if (!SYNC_CODE_RE.test(code))    return res.status(400).json({ error: 'Invalid sync code format' });
  if (!VALID_SYNC_APPS.has(appId)) return res.status(400).json({ error: 'Invalid app ID' });
  if (!_syncRateOk(code))          return res.status(429).json({ error: 'Too many requests — try again later' });
  try {
    const r = await syncPool.query(
      'SELECT data, updated_at FROM sync_data WHERE sync_code = $1 AND app_id = $2', [code, appId]);
    if (!r.rows.length) return res.status(404).json({ error: 'No data found for this sync code' });
    res.set('Cache-Control', 'no-store');
    res.json({ data: JSON.parse(r.rows[0].data), updatedAt: r.rows[0].updated_at });
  } catch (err) {
    console.error('[Sync] GET error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /sync/:code/:appId — upsert stored data
app.put('/sync/:code/:appId', express.json({ limit: '2mb' }), async (req, res) => {
  syncCors(req, res);
  if (!syncPool) return res.status(503).json({ error: 'Sync not available — set DATABASE_URL to enable' });
  const { code, appId } = req.params;
  if (!SYNC_CODE_RE.test(code))    return res.status(400).json({ error: 'Invalid sync code format' });
  if (!VALID_SYNC_APPS.has(appId)) return res.status(400).json({ error: 'Invalid app ID' });
  if (!_syncRateOk(code))          return res.status(429).json({ error: 'Too many requests — try again later' });
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing or invalid data payload' });
  const dataStr = JSON.stringify(data);
  if (Buffer.byteLength(dataStr, 'utf8') > SYNC_MAX_BYTES)
    return res.status(413).json({ error: 'Payload too large (max 2 MB)' });
  try {
    const updatedAt = Date.now();
    await syncPool.query(
      `INSERT INTO sync_data (sync_code, app_id, data, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sync_code, app_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [code, appId, dataStr, updatedAt]);
    res.json({ ok: true, updatedAt });
  } catch (err) {
    console.error('[Sync] PUT error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /sync/:code — remove all stored data for a sync code
app.delete('/sync/:code', async (req, res) => {
  syncCors(req, res);
  if (!syncPool) return res.status(503).json({ error: 'Sync not available — set DATABASE_URL to enable' });
  const { code } = req.params;
  if (!SYNC_CODE_RE.test(code)) return res.status(400).json({ error: 'Invalid sync code format' });
  if (!_syncRateOk(code))       return res.status(429).json({ error: 'Too many requests — try again later' });
  try {
    await syncPool.query('DELETE FROM sync_data WHERE sync_code = $1', [code]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sync] DELETE error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve static files (after all API routes to prevent conflicts)
app.use(express.static(path.join(__dirname))); // Serve all static files from root

// Buszy app routes
app.get('/buszy/', (req, res) => {
  res.sendFile(path.join(__dirname, 'buszy/index.html'));
});

app.get('/buszy/service-worker.js', (req, res) => {
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/buszy/');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'buszy/service-worker.js'));
});

// RailBuddy app routes
app.get('/rail-buddy/', (req, res) => {
  res.sendFile(path.join(__dirname, 'rail-buddy/index.html'));
});

app.get('/rail-buddy/service-worker.js', (req, res) => {
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/rail-buddy/');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'rail-buddy/service-worker.js'));
});

// Legacy redirects (optional - remove if not needed)
app.get('/buszy.html', (req, res) => {
  res.redirect(301, '/buszy/');
});

app.get('/rail-buddy.html', (req, res) => {
  res.redirect(301, '/rail-buddy/');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});