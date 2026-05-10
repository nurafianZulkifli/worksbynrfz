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
