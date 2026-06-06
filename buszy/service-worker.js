/**
 * Buszy Service Worker
 * Handles caching and offline functionality for Buszy app
 * Dynamically detects base path for GitHub Pages and Heroku compatibility
 * Dynamically loads version from version.json
 */

// Detect base path dynamically
const BASE_PATH = (() => {
  // Get the scope from the service worker registration
  const scope = self.registration.scope;
  // Extract base path from scope (e.g., '/nrfz-dev/buszy/' -> '/nrfz-dev/')
  const match = scope.match(/^(.*\/)buszy\/$/);
  return match ? match[1] : '/';
})();

// Default cache version (fallback if version.json is unavailable)
let CACHE_VERSION = 'v4.6.0';
let CACHE_NAME = `buszy-cache-${CACHE_VERSION}`;

// Fetch version from version.json
async function loadCacheVersion() {
  try {
    const versionPath = BASE_PATH + 'js/version.json';
    const response = await fetch(versionPath);
    if (response.ok) {
      const data = await response.json();
      const version = data.buszy || '4.5.2';
      CACHE_VERSION = `v${version}`;
      CACHE_NAME = `buszy-cache-${CACHE_VERSION}`;
      console.log('[Buszy SW] Cache version loaded:', CACHE_VERSION);
    }
  } catch (error) {
    console.warn('[Buszy SW] Could not load version.json, using default:', error);
  }
}

// Helper function to build paths with correct base
function buildPath(path) {
  return BASE_PATH + path.replace(/^\//, '');
}

// Buszy-specific assets to cache
const STATIC_ASSETS = [
  // Buszy entry
  buildPath('buszy/'),
  buildPath('buszy/index.html'),
  buildPath('buszy/manifest.json'),
  
  // Buszy styles
  buildPath('buszy/css/style-buszy.css'),
  
  // Buszy scripts
  buildPath('buszy/js/buszy-main.js'),
  buildPath('buszy/js/menu.js'),
  buildPath('buszy/js/settings.js'),
  buildPath('buszy/js/abs.js'),
  buildPath('buszy/js/ann.js'),
  buildPath('buszy/js/art.js'),
  buildPath('buszy/js/shared-arrivals.js'),
  buildPath('buszy/js/fl-bus.js'),
  buildPath('buszy/js/mob-navtabs.js'),
  buildPath('buszy/js/nbs.js'),
  buildPath('buszy/js/pinned.js'),
  buildPath('buszy/js/scrape-bus-timings.js'),
  buildPath('buszy/js/tsa.js'),
  
  // Buszy assets
  buildPath('buszy/assets/'),
  
  // Shared utilities
  buildPath('js/utils.js'),
  buildPath('js/pwa-helper.js'),
  
  // Shared CSS
  buildPath('css/style.css'),
  buildPath('css/dark-mode.css'),
  buildPath('css/style-breakpoints.css'),
  buildPath('css/bootstrap.min.css'),
  buildPath('css/animate.css'),
  buildPath('css/carousel.css'),
  buildPath('css/swiper-bundle.min.css'),
  
  // Shared JS libraries
  buildPath('js/bootstrap.min.js'),
  buildPath('js/jquery.min.js'),
  buildPath('js/popper.min.js'),
  
  // Icons
  buildPath('img/core-img/favicon.png'),
  buildPath('buszy/assets/icon-192.png'),
  buildPath('buszy/assets/icon-512.png')
];

// Install: cache Buszy assets
self.addEventListener('install', event => {
  event.waitUntil(
    loadCacheVersion().then(() => {
      return caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[Buszy SW] Some assets could not be cached:', err);
        });
      });
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    loadCacheVersion().then(() => {
      return caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('buszy-cache-') && name !== CACHE_NAME)
            .map(cacheName => {
              console.log('[Buszy SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      });
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const buszyScope = BASE_PATH + 'buszy/';
  
  // Only handle GET requests within Buszy scope
  if (request.method !== 'GET' || !url.pathname.startsWith(buszyScope)) {
    return;
  }
  
  // Cache first strategy
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Cache successful responses
        if (shouldCache(request.url)) {
          const respCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, respCopy);
          });
        }
        
        return response;
      }).catch(() => {
        // Offline fallback
        return new Response('Offline - content not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    })
  );
});

// Determine if URL should be cached
function shouldCache(url) {
  const cacheableExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.json'];
  return cacheableExtensions.some(ext => url.endsWith(ext)) || url.endsWith('/');
}

// ── Push Notification Handlers ───────────────────────────────────────

const PUSH_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Receive a push from the server and show a notification.
// event.waitUntil keeps the SW alive until showNotification resolves,
// which ensures delivery even when the web app is closed on mobile.
self.addEventListener('push', event => {
  let data = { title: 'Bus arriving soon', body: '', data: {} };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    data.body = event.data ? event.data.text() : '';
  }

  const isArrived = data.data?.type === 'arrived';
  const isAlert   = data.data?.type === 'service-alert';
  const scope = self.registration.scope;
  const options = {
    body: data.body,
    icon: scope + 'assets/icon-192.png',
    badge: scope + 'assets/icon-192.png',
    tag: isAlert
      ? 'buszy-service-alert'
      : `buszy-${isArrived ? 'arrived' : 'arriving'}-${data.data?.serviceNo}-${data.data?.busStopCode}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: isArrived ? [300, 100, 300, 100, 300, 100, 300]
           : isAlert   ? [400, 150, 400]
           :             [300, 100, 300],
    actions: isAlert
      ? [{ action: 'view', title: 'View alerts' }]
      : [{ action: 'view', title: 'View arrivals' }, { action: 'dismiss', title: 'Dismiss' }],
    data: data.data || {}
  };

  const isOnce = data.data?.notifyMode === 'once' && data.data?.busStopCode && data.data?.serviceNo;

  // Broadcast to open pages (best-effort — app may be closed)
  try {
    const bc = new BroadcastChannel('buszy-push');
    bc.postMessage({ type: 'PUSH_RECEIVED', title: data.title, body: data.body, data: data.data || {} });
    bc.close();
  } catch {}

  // Store notification so the page can show an in-app banner when it next opens
  const storePending = caches.open('buszy-pending-notif').then(cache =>
    cache.put('pending', new Response(JSON.stringify({
      title: data.title, body: data.body, data: data.data || {}, ts: Date.now()
    }), { headers: { 'Content-Type': 'application/json' } }))
  ).catch(() => {});

  // 'once' mode: tell open clients to clean up the tracked subscription
  const notifyOnce = isOnce
    ? self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => clients.forEach(c =>
          c.postMessage({ type: 'NOTIF_ONCE_FIRED', busStopCode: data.data.busStopCode, serviceNo: data.data.serviceNo })
        )).catch(() => {})
    : Promise.resolve();

  // showNotification MUST be inside event.waitUntil for reliable background delivery
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title, options),
    storePending,
    notifyOnce
  ]));
});

// Handle push subscription rotation (browser auto-renews subscriptions periodically).
// Without this, the server's stored endpoint becomes stale and pushes stop working
// even when the app is closed — the most common cause of "background push stopped".
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const vapidRes = await fetch(PUSH_SERVER + '/push/vapid-public-key');
      if (!vapidRes.ok) return;
      const vapidKey = await vapidRes.text();

      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      // Always re-register for service alerts (safe to call multiple times)
      await fetch(PUSH_SERVER + '/push/subscribe-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: newSub.toJSON() })
      });

      // Tell open pages to re-register their bus timing subscriptions with the new endpoint
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      windowClients.forEach(c =>
        c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() })
      );
    } catch (e) {
      console.error('[Buszy SW] pushsubscriptionchange error:', e);
    }
  })());
});

// Handle notification tap / action button — open or focus the arrivals page
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // 'dismiss' action — just close, no navigation
  if (event.action === 'dismiss') return;

  const { busStopCode, serviceNo, type } = event.notification.data || {};
  const scope = self.registration.scope; // e.g. "/buszy/" or "/nrfz-dev/buszy/"
  let targetUrl = scope;
  if (type === 'service-alert') {
    targetUrl = scope + 'alerts.html';
  } else if (busStopCode) {
    targetUrl = scope + 'art.html?BusStopCode=' + encodeURIComponent(busStopCode);
    if (serviceNo) targetUrl += '&ServiceNo=' + encodeURIComponent(serviceNo);
  }

  event.waitUntil((async () => {
    // Store the pending destination so any buszy page that loads can redirect correctly.
    // This is the fallback for iOS where clients.openWindow() ignores the URL and
    // always opens the manifest start_url (index.html) instead of art.html.
    try {
      const cache = await caches.open('buszy-notif-pending');
      await cache.put('pending-nav', new Response(JSON.stringify({
        busStopCode, serviceNo, url: targetUrl, ts: Date.now()
      })));
    } catch {}

    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const buszyClient = windowClients.find(c => c.url.includes('buszy'));
    if (buszyClient) {
      // postMessage is more reliable than client.navigate() across platforms
      buszyClient.postMessage({ type: 'NOTIF_NAVIGATE', url: targetUrl });
      return buszyClient.focus();
    }

    // No window open — open the target URL directly
    return clients.openWindow(targetUrl);
  })());
});

// ────────────────────────────────────────────────────────────────────

// Message handler (original)
self.addEventListener('message', event => {
  if (!event.data) return;
  
  console.log('[Buszy SW] Message received:', event.data.type);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('[Buszy SW] Cache cleared');
      });
      break;
    
    default:
      console.log('[Buszy SW] Unknown message type:', event.data.type);
  }
});
