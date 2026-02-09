const CACHE_VERSION = 'v1';
const CACHE_NAME = `nrfz-cache-${CACHE_VERSION}`;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // Simple pass-through for now
});

// Handle messages from the client (main application)
self.addEventListener('message', event => {
    if (!event.data) return;

    console.log('[Service Worker] Message received:', event.data.type);

    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'KEEP_ALIVE':
            // Keep-alive ping from client, respond to keep connection warm
            console.log('[Service Worker] Keep-alive ping received');
            event.ports[0].postMessage({ received: true });
            break;

        default:
            console.log('[Service Worker] Unknown message type:', event.data.type);
    }
});