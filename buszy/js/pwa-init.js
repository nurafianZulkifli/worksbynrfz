/**
 * Buszy PWA Initialization
 * Configures and initializes PWA functionality for the Buszy app
 */

window.addEventListener('load', () => {
  try {
    // Wait for PWA config to be available
    if (!window.PWAConfig) {
      console.error('[Buszy] PWA Config not loaded');
      return;
    }

    if (!window.PWAHelper) {
      console.error('[Buszy] PWA Helper not loaded');
      return;
    }

    const config = PWAConfig.buszy;
    
    // console.log('[Buszy] Initializing PWA with config:', config);
    
    // Initialize PWA Helper for Buszy
    window.buszyPWA = new PWAHelper({
      appName: config.appName,
      swPath: config.swPath,
      scope: config.scope,
      cacheName: config.cacheName,
      showInstallBanner: true,
      onInstalled: () => {
        // Optional: Track installation event
        if (window.gtag) {
          window.gtag('event', 'app_install', {
            app_name: 'Buszy'
          });
        }
      }
    });

    // If the first-time guide hasn't been completed, show the install banner at the top
    if (!localStorage.getItem('buszy-guide-done')) {
      const _origShow = window.buszyPWA.showInstallPrompt.bind(window.buszyPWA);
      window.buszyPWA.showInstallPrompt = function () {
        _origShow();
        const banner = document.getElementById('buszy-install-banner');
        if (banner) {
          banner.style.bottom = 'auto';
          banner.style.top = '0';
          banner.style.animation = 'slideDown 0.3s ease-out';
        }
      };
      // Prevent cookie-adjust from overriding the top position
      window.buszyPWA.adjustBannerPositionForCookies = function () {};

      const _origGuideFinish = window.guideFinish;
      window.guideFinish = function () {
        if (_origGuideFinish) _origGuideFinish();
        const banner = document.getElementById('buszy-install-banner');
        if (banner) {
          banner.style.top = 'auto';
          banner.style.bottom = '0';
          banner.style.animation = 'slideUp 0.3s ease-out';
        }
      };
    }

    console.log('[Buszy] PWA initialization complete');
  } catch (error) {
    console.error('[Buszy] Error during PWA initialization:', error);
  }
});

// Expose PWA helper to window for debugging/manual use
window.getBuszyPWAStatus = () => {
  return window.buszyPWA ? window.buszyPWA.getStatus() : null;
};

window.clearBuszyCache = () => {
  return window.buszyPWA ? window.buszyPWA.clearCache() : Promise.reject('PWA not initialized');
};
