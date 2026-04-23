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
