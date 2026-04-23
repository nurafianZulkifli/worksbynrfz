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
