/**
 * PWA Migration Cleanup Script
 * Removes old service worker registration and cached data from the single-app era
 * Helps transition users to the new separate apps (Buszy & RailBuddy)
 */

window.addEventListener('load', async () => {

  // Step 1: Unregister old root service worker
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (let registration of registrations) {
        // Check if this is the old root-level service worker
        if (registration.scope === window.location.origin + '/' || 
            registration.scope.endsWith('/scope-unknown')) {
          
          await registration.unregister();
        }
      }
    } catch (error) {
      console.error('[PWA Migration] Error unregistering service workers:', error);
    }
  }

  // Step 2: Delete old caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => name.startsWith('nrfz-cache-'));
      
      for (let cacheName of oldCaches) {
        await caches.delete(cacheName);
      }
    } catch (error) {
      console.error('[PWA Migration] Error deleting caches:', error);
    }
  }

  // Step 3: Show migration banner if old app was installed
  if (window.navigator.standalone === true) {
    
    // Check localStorage for migration flag
    const hasMigrated = localStorage.getItem('pwa-migration-notified');
    
    if (!hasMigrated) {
      showMigrationBanner();
      localStorage.setItem('pwa-migration-notified', 'true');
    }
  }
});

/**
 * Show banner notifying about new separate apps
 */
function showMigrationBanner() {
  const banner = document.createElement('div');
  banner.id = 'pwa-migration-banner';
  banner.innerHTML = `
    <style>
      #pwa-migration-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
        color: #000;
        padding: 16px 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideDown 0.3s ease-out;
      }

      @keyframes slideDown {
        from {
          transform: translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      #pwa-migration-banner h3 {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
      }

      #pwa-migration-banner p {
        margin: 0 0 12px 0;
        font-size: 14px;
        opacity: 0.9;
      }

      #pwa-migration-banner .banner-actions {
        display: flex;
        gap: 8px;
      }

      #pwa-migration-banner button {
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }

      #pwa-migration-banner .learn-btn {
        background: #000;
        color: #fff;
      }

      #pwa-migration-banner .learn-btn:hover {
        background: #333;
      }

      #pwa-migration-banner .close-btn {
        background: rgba(0, 0, 0, 0.1);
        color: #000;
      }

      #pwa-migration-banner .close-btn:hover {
        background: rgba(0, 0, 0, 0.2);
      }
    </style>
    <h3>🎉 New Updates Available!</h3>
    <p>Buszy and RailBuddy are now separate apps. Uninstall this one and install the new versions for the best experience.</p>
    <div class="banner-actions">
      <button class="learn-btn" onclick="window.open('/', '_self')">Learn More</button>
      <button class="close-btn" onclick="this.parentElement.parentElement.remove()">Dismiss</button>
    </div>
  `;
  
  document.body.insertBefore(banner, document.body.firstChild);
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    const el = document.getElementById('pwa-migration-banner');
    if (el) {
      el.style.animation = 'slideDown 0.3s ease-out reverse';
      setTimeout(() => el.remove(), 300);
    }
  }, 10000);
}
