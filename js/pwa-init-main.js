/**
 * Main App PWA Initialization
 * Configures and initializes PWA functionality for the main Works by NRFZ app
 */

window.addEventListener('load', () => {
  try {
    // Wait for PWA config to be available
    if (!window.PWAConfig) {
      console.error('[Main App] PWA Config not loaded');
      return;
    }

    if (!window.PWAHelper) {
      console.error('[Main App] PWA Helper not loaded');
      return;
    }

    const config = PWAConfig.main;
    
    console.log('[Main App] Initializing PWA with config:', config);
    
    // Initialize PWA Helper for Main App
    window.mainPWA = new PWAHelper({
      appName: config.appName,
      swPath: config.swPath,
      scope: config.scope,
      cacheName: config.cacheName,
      showInstallBanner: true,
      onInstalled: () => {
        // Optional: Track installation event
        if (window.gtag) {
          window.gtag('event', 'app_install', {
            app_name: 'Works by NRFZ'
          });
        }
      }
    });
    
    console.log('[Main App] PWA initialization complete');
  } catch (error) {
    console.error('[Main App] Error during PWA initialization:', error);
  }
});

// Expose PWA helper to window for debugging/manual use
window.getMainPWAStatus = () => {
  return window.mainPWA ? window.mainPWA.getStatus() : null;
};

window.clearMainCache = () => {
  return window.mainPWA ? window.mainPWA.clearCache() : Promise.reject('PWA not initialized');
};
