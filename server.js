const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const compression = require('compression');
const webpush = require('web-push');

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

    // Real-time data — never cache (auto-refreshes every 2s on client)
    res.set('Cache-Control', 'no-store');
    res.json(response.data);
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

  const { subscription, busStopCode, serviceNo, threshold, notifyMode } = req.body;
  if (!subscription || !subscription.endpoint || !busStopCode || !serviceNo) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate threshold (1–10 minutes)
  const mins = Math.min(10, Math.max(1, parseInt(threshold, 10) || 1));
  const mode = ['once', 'day', 'always'].includes(notifyMode) ? notifyMode : 'once';
  const expiresAt = mode === 'day' ? Date.now() + 24 * 60 * 60 * 1000 : null;
  const key = `${busStopCode}:${serviceNo}`;

  if (!pushWatchers.has(key)) pushWatchers.set(key, []);
  const watchers = pushWatchers.get(key);

  // Replace existing subscription from the same endpoint (re-subscribe)
  const idx = watchers.findIndex(w => w.subscription.endpoint === subscription.endpoint);
  const entry = { subscription, threshold: mins, notifyMode: mode, expiresAt, notifiedUntil: 0, arrivedNotifiedUntil: 0 };
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

      let etaMinutes;
      try {
        const resp = await ltaApi.get(`/v3/BusArrival?BusStopCode=${busStopCode}&ServiceNo=${serviceNo}`);
        const service = resp.data.Services?.[0];
        if (!service || !service.NextBus?.EstimatedArrival) continue;
        etaMinutes = Math.max(0, Math.floor((new Date(service.NextBus.EstimatedArrival) - now) / 60000));
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
        if (etaMinutes > 0) watcher.arrivedNotifiedUntil = 0;

        // ── "Approaching" notification (within threshold but not yet at stop) ──
        if (etaMinutes > 0 && now >= watcher.notifiedUntil) {
          const payload = JSON.stringify({
            title: `Bus ${serviceNo} arriving soon`,
            body: `Stop ${busStopCode} — arriving in ${etaMinutes} min`,
            data: { busStopCode, serviceNo, type: 'approaching', notifyMode: watcher.notifyMode || 'once' }
          });
          try {
            await webpush.sendNotification(watcher.subscription, payload);
            watcher.notifiedUntil = now + 3 * 60 * 1000; // 3-minute cooldown
            console.log(`[Push] Notified approaching: stop=${busStopCode} svc=${serviceNo} eta=${etaMinutes}min mode=${watcher.notifyMode}`);
            // 'once' mode: remove this watcher after first notification
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

        // ── "Arrived" notification (bus is at the stop, eta = 0) ──
        if (etaMinutes === 0 && now >= (watcher.arrivedNotifiedUntil || 0)) {
          const payload = JSON.stringify({
            title: `Bus ${serviceNo} has arrived!`,
            body: `Stop ${busStopCode} — your bus is here`,
            data: { busStopCode, serviceNo, type: 'arrived', notifyMode: watcher.notifyMode || 'once' }
          });
          try {
            await webpush.sendNotification(watcher.subscription, payload);
            watcher.arrivedNotifiedUntil = now + 5 * 60 * 1000; // 5-minute cooldown
            console.log(`[Push] Notified arrived: stop=${busStopCode} svc=${serviceNo}`);
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
}

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