const CACHE_VERSION = 'v1';
const CACHE_NAME = `nrfz-cache-${CACHE_VERSION}`;
const API_CACHE_NAME = `nrfz-api-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `nrfz-runtime-${CACHE_VERSION}`;
let lastKeepAliveTime = 0;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Keep only current caches
          if (cacheName !== CACHE_NAME && 
              cacheName !== API_CACHE_NAME && 
              cacheName !== RUNTIME_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const method = event.request.method;
  
  // Only cache GET/HEAD requests
  if (method !== 'GET' && method !== 'HEAD') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache API calls for offline access and background persistence
  if (url.pathname.includes('/api/') || 
      url.pathname.includes('.json') ||
      url.pathname.includes('/arrivals')) {
    
    event.respondWith(
      // Try network first, fallback to cache
      fetch(event.request, { keepalive: true })
        .then(response => {
          // Cache successful responses
          if (response.ok) {
            const cacheResponse = response.clone();
            caches.open(API_CACHE_NAME).then(cache => {
              cache.put(event.request, cacheResponse);
            });
          }
          return response;
        })
        .catch(error => {
          // Network failed, try cache
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('[Service Worker] Serving from cache:', url.pathname);
                return cachedResponse;
              }
              // No cache available
              return new Response('Offline - no cached data', { status: 503 });
            });
        })
    );
    return;
  }

  // For other requests, use keepalive
  event.respondWith(
    fetch(event.request, { keepalive: true })
      .catch(error => {
        console.log('[Service Worker] Fetch error, trying cache:', url.pathname);
        return caches.match(event.request)
          .then(response => response || new Response('Offline', { status: 503 }));
      })
  );
});

// Handle messages from the client (main application)
self.addEventListener('message', event => {
    if (!event.data) return;

    console.log('[Service Worker] Message received:', event.data.type);

    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'SHOW_NOTIFICATION':
            handleShowNotification(event.data);
            break;

        case 'CLEAR_NOTIFICATIONS':
            handleClearNotifications(event.data);
            break;

        case 'KEEP_ALIVE':
            // Keep-alive ping from client
            lastKeepAliveTime = Date.now();
            console.log('[Service Worker] Keep-alive ping received, maintaining network connections');
            // Perform a network ping to keep connections alive
            performKeepAlivePing();
            break;

        case 'START_BACKGROUND_FETCH':
            // Start a background fetch for monitored bus data
            console.log('[Service Worker] Starting background fetch');
            startBackgroundFetch(event.data);
            break;

        default:
            console.log('[Service Worker] Unknown message type:', event.data.type);
    }
});

/**
 * Perform keep-alive ping to maintain network connectivity
 */
function performKeepAlivePing() {
    // Use fetch with keepalive to maintain the connection pool
    fetch(self.location.origin, {
        method: 'HEAD',
        cache: 'no-store',
        keepalive: true
    }).then(response => {
        console.log('[Service Worker] Keep-alive ping successful');
    }).catch(error => {
        console.log('[Service Worker] Keep-alive ping failed:', error.message);
    });
}

/**
 * Start a background fetch for critical data
 */
async function startBackgroundFetch(data) {
    try {
        if ('BackgroundFetchManager' in self.registration) {
            const requests = data.urls || [self.location.origin];
            
            const bgFetch = await self.registration.backgroundFetch.fetch(
                'bus-data-fetch',
                requests,
                {
                    title: 'Syncing bus data',
                    icons: [
                        { src: '/img/core-img/icon-192.png', sizes: '192x192' }
                    ],
                    downloadTotal: 100000
                }
            );
            
            console.log('[Service Worker] Background fetch started:', bgFetch.id);
        } else {
            console.log('[Service Worker] Background Fetch API not supported');
            // Fallback to regular sync
            await self.registration.sync.register('background-data-sync');
        }
    } catch (error) {
        console.error('[Service Worker] Error starting background fetch:', error);
    }
}

/**
 * Perform background sync
 */
async function performBackgroundSync() {
    try {
        console.log('[Service Worker] Performing background sync');
        
        // Notify all clients to process queued notifications
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(client => {
            client.postMessage({
                type: 'PERFORM_BACKGROUND_SYNC',
                timestamp: new Date().toISOString()
            });
        });
        console.log('[Service Worker] Background sync completed');
    } catch (error) {
        console.error('[Service Worker] Background sync failed:', error);
        throw error; // Ensures retry
    }
}

/**
 * Handle background sync events (runs when online after being offline)
 */
if ('sync' in self.registration) {
    self.addEventListener('sync', event => {
        console.log('[Service Worker] Background sync event:', event.tag);
        
        if (event.tag === 'background-sync') {
            event.waitUntil(
                // Notify all clients that background sync occurred
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'BACKGROUND_SYNC_COMPLETED',
                            timestamp: new Date().toISOString()
                        });
                    });
                    console.log('[Service Worker] Background sync notification sent to clients');
                }).catch(error => {
                    console.log('[Service Worker] Background sync error:', error);
                    throw error; // Retry on error
                })
            );
        }
    });
}

/**
 * Periodic background sync - attempt every 15 minutes
 */
self.addEventListener('sync', event => {
    if (event.tag === 'periodic-background-sync') {
        console.log('[Service Worker] Periodic background sync triggered');
        event.waitUntil(
            // Perform any necessary background syncs
            performBackgroundSync()
        );
    }
});

/**
 * Handle background fetch completion (when app returns to foreground)
 */
self.addEventListener('backgroundfetchsuccess', event => {
    console.log('[Service Worker] Background fetch succeeded:', event.registration.tag);
    event.waitUntil(
        // Notify clients that background fetch completed
        passMessageToClients({
            type: 'BACKGROUND_FETCH_COMPLETE',
            tag: event.registration.tag,
            timestamp: new Date().toISOString()
        })
    );
});

/**
 * Handle background fetch failure
 */
self.addEventListener('backgroundfetchfail', event => {
    console.log('[Service Worker] Background fetch failed:', event.registration.tag);
    event.waitUntil(
        passMessageToClients({
            type: 'BACKGROUND_FETCH_FAILED',
            tag: event.registration.tag,
            timestamp: new Date().toISOString()
        })
    );
});

/**
 * Handle background fetch abort
 */
self.addEventListener('backgroundfetchabort', event => {
    console.log('[Service Worker] Background fetch aborted:', event.registration.tag);
});

/**
 * Pass message to all clients
 */
async function passMessageToClients(message) {
    try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(client => {
            client.postMessage(message);
        });
    } catch (error) {
        console.error('[Service Worker] Error messaging clients:', error);
    }
}

/**
 * Handle showing notifications
 */
function handleShowNotification(data) {
    const { title, options = {} } = data;

    if (!title) {
        console.error('[Service Worker] Notification title is required');
        return;
    }

    // Set default notification options
    const notificationOptions = {
        icon: options.icon || '/img/core-img/icon-192.png',
        badge: options.badge || '/img/core-img/icon-192.png',
        tag: options.tag || 'notification',
        requireInteraction: options.requireInteraction !== undefined ? options.requireInteraction : false,
        data: {
            url: options.url || '/buszy/art.html',
            ...options.data
        },
        ...options
    };

    // Show the notification
    self.registration.showNotification(title, notificationOptions)
        .then(() => {
            console.log('[Service Worker] Notification shown:', title);
        })
        .catch(error => {
            console.error('[Service Worker] Error showing notification:', error);
        });
}

/**
 * Handle clearing notifications by tag
 */
function handleClearNotifications(data) {
    const { tag } = data;

    self.registration.getNotifications({ tag }).then(notifications => {
        notifications.forEach(notification => {
            notification.close();
        });
        console.log('[Service Worker] Cleared notifications with tag:', tag);
    }).catch(error => {
        console.error('[Service Worker] Error clearing notifications:', error);
    });
}

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] Notification clicked:', event.notification.tag);
    event.notification.close();

    const notificationData = event.notification.data || {};
    const targetUrl = notificationData.url || '/buszy/art.html';

    // Handle notification click - focus existing window or open new one
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                console.log('[Service Worker] Found ' + clientList.length + ' clients');
                
                // Check if a window with the app is already open
                for (let client of clientList) {
                    console.log('[Service Worker] Client URL:', client.url);
                    if (client.url.includes(targetUrl) || client.url.includes('nrfz-dev')) {
                        console.log('[Service Worker] Focusing existing client');
                        return client.focus();
                    }
                }
                
                // If no window is open, open the app
                console.log('[Service Worker] Opening new window:', targetUrl);
                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
            .catch(error => {
                console.error('[Service Worker] Error handling notification click:', error);
            })
    );
});

/**
 * Handle notification close
 */
self.addEventListener('notificationclose', event => {
    console.log('[Service Worker] Notification closed:', event.notification.tag);
    // Could be used for analytics/tracking
});