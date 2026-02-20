/**
 * PWA Helper - Core PWA Functionality
 * Handles service worker registration, app status, and caching
 * App-specific init happens in individual app files
 */

class PWAHelper {
  constructor(config = {}) {
    this.appName = config.appName || 'App';
    this.installPromptEvent = null;
    this.isInstalled = false;
    this.config = config;
    this.init();
  }

  init() {
    // Check if running as standalone app
    if (window.navigator.standalone === true) {
      this.isInstalled = true;
    }

    // Register service worker
    this.registerServiceWorker();

    // Setup install prompt handling
    this.setupInstallPrompt();
  }

  /**
   * Register the service worker for this app
   */
  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn(`[${this.appName}] Service Workers not supported`);
      return;
    }

    const swPath = this.config.swPath || '/service-worker.js';
    const scope = this.config.scope || '/';

    navigator.serviceWorker.register(swPath, { scope })
      .then(registration => {

        // Check for updates every 60 seconds
        setInterval(() => {
          registration.update().catch(err => {
            console.warn(`[${this.appName}] Update check failed:`, err);
          });
        }, 60000);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              this.notifyUpdateAvailable();
            }
          });
        });
      })
      .catch(error => {
        console.error(`[${this.appName}] Service Worker registration failed:`, error);
      });
  }

  /**
   * Setup install prompt handling
   */
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.installPromptEvent = event;
      
      // Show install banner
      if (this.config.showInstallBanner !== false) {
        this.showInstallPrompt();
      }
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideInstallPrompt();
      
      // Notify app if callback provided
      if (this.config.onInstalled) {
        this.config.onInstalled();
      }
    });
  }

  /**
   * Show install prompt banner
   */
  showInstallPrompt() {
    let banner = document.getElementById(`${this.appName.toLowerCase()}-install-banner`);
    
    if (!banner) {
      banner = document.createElement('div');
      banner.id = `${this.appName.toLowerCase()}-install-banner`;
      banner.className = 'pwa-install-banner';
      banner.innerHTML = `
        <div class="pwa-banner-content">
          <div class="pwa-banner-text">
            <h3>Install ${this.appName}</h3>
            <p>Add to home screen for quick access</p>
          </div>
          <div class="pwa-banner-buttons">
            <button class="pwa-install-btn">Install</button>
            <button class="pwa-cancel-btn">Later</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(banner);
      
      // Event listeners
      banner.querySelector('.pwa-install-btn').addEventListener('click', () => {
        this.promptInstall();
      });
      
      banner.querySelector('.pwa-cancel-btn').addEventListener('click', () => {
        this.hideInstallPrompt();
        sessionStorage.setItem(`${this.appName.toLowerCase()}-install-dismissed`, 'true');
      });
    } else {
      banner.style.display = 'block';
    }
  }

  /**
   * Hide install prompt banner
   */
  hideInstallPrompt() {
    const banner = document.getElementById(`${this.appName.toLowerCase()}-install-banner`);
    if (banner) {
      banner.style.display = 'none';
    }
  }

  /**
   * Trigger browser install prompt
   */
  async promptInstall() {
    if (!this.installPromptEvent) {
      return false;
    }

    try {
      this.installPromptEvent.prompt();
      const { outcome } = await this.installPromptEvent.userChoice;
      
      this.installPromptEvent = null;
      
      return outcome === 'accepted';
    } catch (error) {
      console.error(`[${this.appName}] Error triggering install:`, error);
      return false;
    }
  }

  /**
   * Notify user of available update
   */
  notifyUpdateAvailable() {
    const message = document.createElement('div');
    message.className = 'pwa-update-banner';
    message.innerHTML = `
      <div class="pwa-update-content">
        <strong>Update Available</strong>
        <p>A new version of ${this.appName} is ready</p>
        <button onclick="location.reload()">Refresh Now</button>
      </div>
    `;
    
    document.body.appendChild(message);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      message.remove();
    }, 10000);
  }

  /**
   * Send message to service worker
   */
  sendMessage(type, data = {}) {
    if (!navigator.serviceWorker.controller) {
      return Promise.reject(new Error('No active service worker'));
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      
      channel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type, ...data },
        [channel.port2]
      );
    });
  }

  /**
   * Clear app cache
   */
  async clearCache() {
    try {
      const cacheName = this.config.cacheName;
      if (cacheName) {
        await caches.delete(cacheName);
      }
      return true;
    } catch (error) {
      console.error(`[${this.appName}] Error clearing cache:`, error);
      return false;
    }
  }

  /**
   * Get app status
   */
  getStatus() {
    return {
      appName: this.appName,
      isInstalled: this.isInstalled,
      isOnline: navigator.onLine,
      serviceWorkerActive: !!navigator.serviceWorker.controller,
      timestamp: new Date().toISOString()
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAHelper;
}
