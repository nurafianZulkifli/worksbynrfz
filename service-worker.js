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

    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'SHOW_NOTIFICATION':
            handleShowNotification(event.data);
            break;

        default:
            console.log('Unknown message type:', event.data.type);
    }
});

// Handle showing notifications
function handleShowNotification(data) {
    const { title, options = {} } = data;

    if (!title) {
        console.error('Notification title is required');
        return;
    }

    // Set default notification options
    const notificationOptions = {
        icon: options.icon || '/img/core-img/icon-192.png',
        badge: options.badge || '/img/core-img/icon-192.png',
        tag: options.tag || 'bus-notification',
        requireInteraction: options.requireInteraction !== undefined ? options.requireInteraction : false,
        ...options
    };

    // Show the notification
    self.registration.showNotification(title, notificationOptions)
        .catch(error => {
            console.error('Error showing notification:', error);
        });
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked:', event.notification.tag);
    event.notification.close();

    // Handle notification click - focus existing window or open new one
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                console.log('Found ' + clientList.length + ' clients');
                
                // Check if a window with the app is already open
                for (let client of clientList) {
                    console.log('Client URL:', client.url);
                    if (client.url.includes('/buszy/art.html') || client.url.includes('nrfz-dev')) {
                        console.log('Focusing existing client');
                        return client.focus();
                    }
                }
                
                // If no window is open, open the app
                console.log('Opening new window');
                if (clients.openWindow) {
                    return clients.openWindow('/buszy/art.html');
                }
            })
            .catch(error => {
                console.error('Error handling notification click:', error);
            })
    );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
    console.log('Notification closed:', event.notification.tag);
});