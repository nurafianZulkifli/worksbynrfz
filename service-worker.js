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

        case 'SHOW_NOTIFICATION':
            handleShowNotification(event.data);
            break;

        case 'CLEAR_NOTIFICATIONS':
            handleClearNotifications(event.data);
            break;

        default:
            console.log('[Service Worker] Unknown message type:', event.data.type);
    }
});

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