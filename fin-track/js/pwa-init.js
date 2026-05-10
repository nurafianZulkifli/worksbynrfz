/**
 * FinTrack PWA Initialization
 * Configures and initializes PWA functionality for the FinTrack app
 */

window.addEventListener('load', () => {
  try {
    if (!window.PWAConfig) {
      console.error('[FinTrack] PWA Config not loaded');
      return;
    }

    if (!window.PWAHelper) {
      console.error('[FinTrack] PWA Helper not loaded');
      return;
    }

    const config = PWAConfig.finTrack;

    window.finTrackPWA = new PWAHelper({
      appName: config.appName,
      swPath: config.swPath,
      scope: config.scope,
      cacheName: config.cacheName,
      showInstallBanner: true,
      onInstalled: () => {
        if (window.gtag) {
          window.gtag('event', 'app_install', { app_name: 'FinTrack' });
        }
      }
    });

    // If the first-time guide hasn't been completed, show the install banner at the top
    if (!localStorage.getItem('fintrack-guide-done')) {
      const _origShow = window.finTrackPWA.showInstallPrompt.bind(window.finTrackPWA);
      window.finTrackPWA.showInstallPrompt = function () {
        _origShow();
        const banner = document.getElementById('fintrack-install-banner');
        if (banner) {
          banner.style.bottom = 'auto';
          banner.style.top = '0';
          banner.style.animation = 'slideDown 0.3s ease-out';
        }
      };
      // Also patch the cookie-adjust method so it doesn't re-set bottom
      window.finTrackPWA.adjustBannerPositionForCookies = function () {};
    }

    console.log('[FinTrack] PWA initialization complete');
  } catch (error) {
    console.error('[FinTrack] Error during PWA initialization:', error);
  }
});

window.getFinTrackPWAStatus = () => {
  return window.finTrackPWA ? window.finTrackPWA.getStatus() : null;
};

window.clearFinTrackCache = () => {
  return window.finTrackPWA ? window.finTrackPWA.clearCache() : Promise.reject('PWA not initialized');
};
