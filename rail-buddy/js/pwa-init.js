/**
 * RailBuddy PWA Initialization
 * Configures and initializes PWA functionality for the RailBuddy app
 */

window.addEventListener('load', () => {
  try {
    // Wait for PWA config to be available
    if (!window.PWAConfig) {
      console.error('[RailBuddy] PWA Config not loaded');
      return;
    }

    if (!window.PWAHelper) {
      console.error('[RailBuddy] PWA Helper not loaded');
      return;
    }

    const config = PWAConfig.railBuddy;
    
    console.log('[RailBuddy] Initializing PWA with config:', config);
    
    // Initialize PWA Helper for RailBuddy
    window.railbuddyPWA = new PWAHelper({
      appName: config.appName,
      swPath: config.swPath,
      scope: config.scope,
      cacheName: config.cacheName,
      showInstallBanner: true,
      onInstalled: () => {
        // Optional: Track installation event
        if (window.gtag) {
          window.gtag('event', 'app_install', {
            app_name: 'RailBuddy'
          });
        }
      }
    });

    // If the first-time guide hasn't been completed, show the install banner at the top
    if (!localStorage.getItem('railbuddy-guide-done')) {
      const _origShow = window.railbuddyPWA.showInstallPrompt.bind(window.railbuddyPWA);
      window.railbuddyPWA.showInstallPrompt = function () {
        _origShow();
        const banner = document.getElementById('railbuddy-install-banner');
        if (banner) {
          banner.style.bottom = 'auto';
          banner.style.top = '0';
          banner.style.animation = 'slideDown 0.3s ease-out';
        }
      };
      // Prevent cookie-adjust from overriding the top position
      window.railbuddyPWA.adjustBannerPositionForCookies = function () {};

      const _origGuideFinish = window.guideFinish;
      window.guideFinish = function () {
        if (_origGuideFinish) _origGuideFinish();
        const banner = document.getElementById('railbuddy-install-banner');
        if (banner) {
          banner.style.top = 'auto';
          banner.style.bottom = '0';
          banner.style.animation = 'slideUp 0.3s ease-out';
        }
      };
    }

    console.log('[RailBuddy] PWA initialization complete');
  } catch (error) {
    console.error('[RailBuddy] Error during PWA initialization:', error);
  }
});

// Expose PWA helper to window for debugging/manual use
window.getRailBuddyPWAStatus = () => {
  return window.railbuddyPWA ? window.railbuddyPWA.getStatus() : null;
};

window.clearRailBuddyCache = () => {
  return window.railbuddyPWA ? window.railbuddyPWA.clearCache() : Promise.reject('PWA not initialized');
};
