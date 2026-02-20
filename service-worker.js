/**
 * Root Service Worker (DEPRECATED)
 * This service worker is no longer used.
 * Individual apps now use scoped service workers:
 * - /buszy/service-worker.js (scope: /buszy/)
 * - /rail-buddy/service-worker.js (scope: /rail-buddy/)
 * 
 * This file unregisters itself and cleans up old cache entries.
 */

// Unregister this service worker
self.registration.unregister().then(() => {
  console.log('[Root SW] Unregistered old root service worker');
}).catch(err => {
  console.error('[Root SW] Error unregistering:', err);
});

// Clean up old global cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.delete('nrfz-cache-v2').then(() => {
      console.log('[Root SW] Deleted old nrfz-cache-v2');
      return caches.delete('nrfz-cache-v1');
    }).then(() => {
      console.log('[Root SW] Deleted old nrfz-cache-v1');
    }).catch(err => {
      console.warn('[Root SW] Error cleaning cache:', err);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('nrfz-cache-'))
          .map(name => {
            console.log('[Root SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

self.skipWaiting();