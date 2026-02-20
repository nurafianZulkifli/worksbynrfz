/**
 * Buszy PWA Initialization
 * Configures and initializes PWA functionality for the Buszy app
 */

window.addEventListener('load', () => {
  // Wait for PWA config to be available
  if (!window.PWAConfig) {
    console.error('[Buszy] PWA Config not loaded');
    return;
  }

  const config = PWAConfig.buszy;
  
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
});

// Expose PWA helper to window for debugging/manual use
window.getBuszyPWAStatus = () => {
  return window.buszyPWA ? window.buszyPWA.getStatus() : null;
};

window.clearBuszyCache = () => {
  return window.buszyPWA ? window.buszyPWA.clearCache() : Promise.reject('PWA not initialized');
};
