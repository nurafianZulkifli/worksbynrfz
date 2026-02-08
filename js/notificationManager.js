/**
 * NotificationManager.js
 * Centralized notification system for web, mobile, and PWA apps
 * Supports push notifications, in-app toasts, sound/vibration alerts
 */

class NotificationManager {
    constructor() {
        this.isServiceWorkerReady = false;
        this.isOnline = navigator.onLine;
        this.notificationQueue = [];
        this.lastOnlineStatusChange = 0;
        this.lastErrorNotificationTime = 0;
        this.errorNotificationCooldown = 5000; // 5 second cooldown for error notifications
        this.onlineStatusDebounceTime = 1000; // 1 second debounce
        this.permissions = {
            notification: Notification?.permission || 'default',
            audio: true,
            vibration: 'vibrate' in navigator
        };
        
        this.config = {
            autoPlay: true,
            soundDir: '/audio/',
            defaultIcon: '/img/core-img/icon-192.png',
            defaultBadge: '/img/core-img/icon-192.png'
        };

        this.notificationTypes = {
            ARRIVAL: {
                priority: 'high',
                duration: 6000,
                sound: 'arrival.mp3',
                vibration: [200, 100, 200],
                color: '#FF9800'
            },
            ALERT: {
                priority: 'high',
                duration: 5000,
                sound: 'alert.mp3',
                vibration: [100, 50, 100, 50, 100],
                color: '#f44336'
            },
            SUCCESS: {
                priority: 'normal',
                duration: 3000,
                sound: 'success.mp3',
                vibration: [100],
                color: '#4CAF50'
            },
            INFO: {
                priority: 'low',
                duration: 3000,
                sound: null,
                vibration: null,
                color: '#2196F3'
            },
            WARNING: {
                priority: 'normal',
                duration: 4000,
                sound: 'warning.mp3',
                vibration: [150, 100, 150],
                color: '#FF9800'
            }
        };

        this.init();
    }

    /**
     * Initialize the notification system
     */
    async init() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            this.registerServiceWorker();
        }

        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Listen for visibility changes (tab backgrounding)
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Request notification permission on init (silent)
        if ('Notification' in window && Notification.permission === 'default') {
            this.requestPermission();
        }
    }

    /**
     * Handle visibility change (app tab backgrounded/restored)
     */
    handleVisibilityChange() {
        if (document.hidden) {
            this.logDebug('App backgrounded');
        } else {
            this.logDebug('App restored from background');
            // Reset debounce timer on visibility restore to allow immediate reconnection check
            this.lastOnlineStatusChange = 0;
            // Re-check actual network status
            if (navigator.onLine && !this.isOnline) {
                this.handleOnline();
            }
        }
    }

    /**
     * Register service worker
     */
    async registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registered:', registration);

            if (navigator.serviceWorker.controller) {
                this.isServiceWorkerReady = true;
                this.logDebug('Service Worker controller ready');
            } else {
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    this.isServiceWorkerReady = true;
                    this.logDebug('Service Worker controller now ready');
                });
            }
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    /**
     * Request notification permission
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            this.logDebug('Notification API not supported');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permissions.notification = 'granted';
            return true;
        }

        if (Notification.permission === 'denied') {
            this.permissions.notification = 'denied';
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permissions.notification = permission;
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    /**
     * Send a notification
     * @param {string} title - Notification title
     * @param {Object} options - Notification options
     * @param {string} type - Notification type (ARRIVAL, ALERT, SUCCESS, INFO, WARNING)
     */
    async notify(title, options = {}, type = 'INFO') {
        const typeConfig = this.notificationTypes[type] || this.notificationTypes.INFO;
        const mergedOptions = { ...typeConfig, ...options };

        // Always show toast
        this.showToast(title, type, mergedOptions);

        // Send push notification if online and permitted
        if (this.isOnline && this.permissions.notification === 'granted') {
            this.sendPushNotification(title, mergedOptions);
        } else if (!this.isOnline) {
            // Queue for later if offline
            this.queueNotification(title, mergedOptions);
        }

        // Play sound if enabled
        if (mergedOptions.sound && this.config.autoPlay) {
            this.playSound(mergedOptions.sound);
        }

        // Vibrate if enabled
        if (mergedOptions.vibration && this.permissions.vibration) {
            this.vibrate(mergedOptions.vibration);
        }
    }

    /**
     * Send a push notification
     */
    async sendPushNotification(title, options) {
        try {
            const notificationOptions = {
                icon: options.icon || this.config.defaultIcon,
                badge: options.badge || this.config.defaultBadge,
                tag: options.tag || 'notification',
                requireInteraction: options.priority === 'high',
                ...options
            };

            // Send via Service Worker if ready
            if (this.isServiceWorkerReady && navigator.serviceWorker.controller) {
                this.sendToServiceWorker('SHOW_NOTIFICATION', {
                    title,
                    options: notificationOptions
                });
                this.logDebug('Notification sent via Service Worker:', title);
                return;
            }

            // Fallback to direct Notification API
            if (Notification.permission === 'granted') {
                new Notification(title, notificationOptions);
                this.logDebug('Notification sent via direct API:', title);
            }
        } catch (error) {
            console.error('Error sending push notification:', error);
        }
    }

    /**
     * Show an in-app toast notification
     */
    showToast(message, type = 'INFO', options = {}) {
        let container = document.getElementById('notification-toast-container');
        if (!container) {
            container = this.createToastContainer();
        }

        const typeConfig = this.notificationTypes[type] || this.notificationTypes.INFO;
        const toast = document.createElement('div');
        const bgColor = options.color || typeConfig.color;
        const duration = options.duration || typeConfig.duration;

        toast.className = `notification-toast notification-${type.toLowerCase()}`;
        toast.style.cssText = `
            background-color: ${bgColor};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
            font-size: 13px;
            font-weight: 500;
            animation: notiSlideIn 0.3s ease forwards;
            word-wrap: break-word;
            max-width: 320px;
            text-align: center;
        `;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove after duration
        setTimeout(() => {
            toast.style.animation = 'notiSlideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Create toast container if it doesn't exist
     */
    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'notification-toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            align-items: center;
        `;
        document.body.appendChild(container);

        // Add animations if not already added
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes notiSlideIn {
                    from {
                        transform: translateY(-20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                @keyframes notiSlideOut {
                    from {
                        transform: translateY(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateY(-20px);
                        opacity: 0;
                    }
                }
                .notification-toast {
                    pointer-events: auto;
                }
            `;
            document.head.appendChild(style);
        }

        return container;
    }

    /**
     * Play sound notification
     */
    playSound(soundFile) {
        if (!this.config.autoPlay) return;

        try {
            const audio = new Audio(`${this.config.soundDir}${soundFile}`);
            audio.play().catch(error => {
                console.warn('Could not play sound:', error);
            });
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    /**
     * Vibrate device
     */
    vibrate(pattern) {
        if (!this.permissions.vibration) return;

        try {
            if ('vibrate' in navigator) {
                navigator.vibrate(pattern);
            }
        } catch (error) {
            console.warn('Vibration not available:', error);
        }
    }

    /**
     * Queue notification for offline delivery
     */
    queueNotification(title, options) {
        this.notificationQueue.push({
            title,
            options,
            timestamp: new Date(),
            id: Math.random().toString(36).substr(2, 9)
        });

        this.saveQueueToStorage();
        this.logDebug('Notification queued:', title);
    }

    /**
     * Process queued notifications when back online
     */
    async processQueue() {
        if (this.notificationQueue.length === 0) return;

        this.logDebug('Processing notification queue with', this.notificationQueue.length, 'items');

        while (this.notificationQueue.length > 0) {
            const notification = this.notificationQueue.shift();
            await this.sendPushNotification(notification.title, notification.options);
        }

        this.saveQueueToStorage();
    }

    /**
     * Save notification queue to localStorage
     */
    saveQueueToStorage() {
        try {
            localStorage.setItem('notification_queue', JSON.stringify(this.notificationQueue));
        } catch (error) {
            console.warn('Could not save notification queue:', error);
        }
    }

    /**
     * Load notification queue from localStorage
     */
    loadQueueFromStorage() {
        try {
            const queue = localStorage.getItem('notification_queue');
            if (queue) {
                this.notificationQueue = JSON.parse(queue);
                this.logDebug('Loaded', this.notificationQueue.length, 'queued notifications');
            }
        } catch (error) {
            console.warn('Could not load notification queue:', error);
        }
    }

    /**
     * Handle online event
     */
    async handleOnline() {
        // Debounce: prevent rapid successive online events
        const now = Date.now();
        if (now - this.lastOnlineStatusChange < this.onlineStatusDebounceTime) {
            return;
        }
        
        if (this.isOnline) {
            return; // Already online, ignore
        }

        this.lastOnlineStatusChange = now;
        this.isOnline = true;
        this.logDebug('App is online');
        this.loadQueueFromStorage();
        this.processQueue();
    }

    /**
     * Handle offline event
     */
    handleOffline() {
        // Debounce: prevent rapid successive offline events
        const now = Date.now();
        if (now - this.lastOnlineStatusChange < this.onlineStatusDebounceTime) {
            return;
        }

        if (!this.isOnline) {
            return; // Already offline, ignore
        }

        // Check cooldown for error notifications
        if (now - this.lastErrorNotificationTime < this.errorNotificationCooldown) {
            this.logDebug('Network error notification on cooldown');
        } else {
            this.lastErrorNotificationTime = now;
            this.notify('Network connection lost', { duration: 4000 }, 'ALERT');
        }

        this.lastOnlineStatusChange = now;
        this.isOnline = false;
        this.logDebug('App is offline');
    }

    /**
     * Send message to service worker
     */
    sendToServiceWorker(type, data) {
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type,
                ...data
            });
        }
    }

    /**
     * Get notification preferences
     */
    getPreference(key) {
        try {
            const value = localStorage.getItem(`notif_${key}`);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.warn(`Error reading preference '${key}':`, error);
            return null;
        }
    }

    /**
     * Save notification preference
     */
    savePreference(key, value) {
        try {
            localStorage.setItem(`notif_${key}`, JSON.stringify(value));
        } catch (error) {
            console.warn(`Error saving preference '${key}':`, error);
        }
    }

    /**
     * Debug logging
     */
    logDebug(...args) {
        if (localStorage.getItem('debug_notifications') === 'true') {
            console.log('[NotificationManager]', ...args);
        }
    }

    /**
     * Get device info
     */
    getDeviceInfo() {
        return {
            isAndroid: /Android/i.test(navigator.userAgent),
            isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
            isDesktop: !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
            isPWA: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
            isOnline: this.isOnline,
            hasServiceWorker: 'serviceWorker' in navigator,
            hasNotificationAPI: 'Notification' in window,
            hasVibration: 'vibrate' in navigator
        };
    }

    /**
     * Clear all notifications from specific service
     */
    clearByTag(tag) {
        if (navigator.serviceWorker.controller) {
            this.sendToServiceWorker('CLEAR_NOTIFICATIONS', { tag });
        }
    }

    /**
     * Enable debug mode
     */
    enableDebug(enabled = true) {
        if (enabled) {
            localStorage.setItem('debug_notifications', 'true');
        } else {
            localStorage.removeItem('debug_notifications');
        }
    }
}

// Create global instance
const notificationManager = new NotificationManager();
