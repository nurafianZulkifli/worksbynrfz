/**
 * Main App PWA Initialization
 * Configures and initializes PWA functionality for the main Works by NRFZ app
 */

window.addEventListener('load', () => {
  // Wait for PWA config to be available
  if (!window.PWAConfig) {
    console.error('[Main App] PWA Config not loaded');
    return;
  }

  const config = PWAConfig.main;
  
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
});

// Expose PWA helper to window for debugging/manual use
window.getMainPWAStatus = () => {
  return window.mainPWA ? window.mainPWA.getStatus() : null;
};
