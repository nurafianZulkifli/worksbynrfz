/**
 * PWA Configuration
 * Dynamically detects deployment environment and sets correct paths
 */

window.PWAConfig = (() => {
  // Detect the base path from current URL
  const pathname = window.location.pathname;
  
  // Determine if we're on GitHub Pages or Heroku
  let basePath = '/';
  
  // Check if deployed on GitHub Pages with /nrfz-dev/ subdirectory
  if (pathname.includes('/nrfz-dev/')) {
    basePath = '/nrfz-dev/';
  }
  
  console.log('[PWA Config] Base path detected:', basePath);
  
  return {
    basePath: basePath,
    
    buszy: {
      appName: 'Buszy',
      swPath: basePath + 'buszy/service-worker.js',
      scope: basePath + 'buszy/',
      manifestPath: basePath + 'buszy/manifest.json',
      cacheName: 'buszy-cache-v1'
    },
    
    railBuddy: {
      appName: 'RailBuddy',
      swPath: basePath + 'rail-buddy/service-worker.js',
      scope: basePath + 'rail-buddy/',
      manifestPath: basePath + 'rail-buddy/manifest.json',
      cacheName: 'rail-buddy-cache-v1'
    },
    
    getConfig: function(app) {
      if (app === 'buszy') return this.buszy;
      if (app === 'rail-buddy') return this.railBuddy;
      return null;
    }
  };
})();

// Verify configuration
console.log('[PWA Config] Buszy config:', PWAConfig.buszy);
console.log('[PWA Config] RailBuddy config:', PWAConfig.railBuddy);
