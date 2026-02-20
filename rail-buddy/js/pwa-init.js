/**
 * RailBuddy PWA Initialization
 * Configures and initializes PWA functionality for the RailBuddy app
 */

window.addEventListener('load', () => {
  // Wait for PWA config to be available
  if (!window.PWAConfig) {
    console.error('[RailBuddy] PWA Config not loaded');
    return;
  }

  const config = PWAConfig.railBuddy;
  
  // Initialize PWA Helper for RailBuddy
  window.railbuddyPWA = new PWAHelper({
    appName: config.appName,
    swPath: config.swPath,
    scope: config.scope,
    cacheName: config.cacheName,
    showInstallBanner: true,
    onInstalled: () => {
      console.log('RailBuddy app installed successfully');
      // Optional: Track installation event
      if (window.gtag) {
        window.gtag('event', 'app_install', {
          app_name: 'RailBuddy'
        });
      }
    }
  });

  console.log('[RailBuddy] PWA initialized');
  console.log('[RailBuddy] Config:', config);
  console.log('[RailBuddy] Status:', window.railbuddyPWA.getStatus());
});

// Expose PWA helper to window for debugging/manual use
window.getRailBuddyPWAStatus = () => {
  return window.railbuddyPWA ? window.railbuddyPWA.getStatus() : null;
};

window.clearRailBuddyCache = () => {
  return window.railbuddyPWA ? window.railbuddyPWA.clearCache() : Promise.reject('PWA not initialized');
};
