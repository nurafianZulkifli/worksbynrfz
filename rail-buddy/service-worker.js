/**
 * RailBuddy Service Worker
 * Handles caching and offline functionality for RailBuddy app
 * Dynamically detects base path for GitHub Pages and Heroku compatibility
 */

// Detect base path dynamically
const BASE_PATH = (() => {
  // Get the scope from the service worker registration
  const scope = self.registration.scope;
  // Extract base path from scope (e.g., '/nrfz-dev/rail-buddy/' -> '/nrfz-dev/')
  const match = scope.match(/^(.*\/)rail-buddy\/$/);
  return match ? match[1] : '/';
})();

const CACHE_VERSION = 'v1';
const CACHE_NAME = `rail-buddy-cache-${CACHE_VERSION}`;

// Helper function to build paths with correct base
function buildPath(path) {
  return BASE_PATH + path.replace(/^\//, '');
}

// RailBuddy-specific assets to cache
const STATIC_ASSETS = [
  // RailBuddy entry
  buildPath('rail-buddy/'),
  buildPath('rail-buddy/index.html'),
  buildPath('rail-buddy/manifest.json'),
  
  // RailBuddy styles
  buildPath('rail-buddy/css/style-tdt.css'),
  
  // RailBuddy scripts
  buildPath('rail-buddy/js/tsa.js'),
  buildPath('rail-buddy/js/menu.js'),
  buildPath('rail-buddy/js/settings.js'),
  buildPath('rail-buddy/js/delays-bar-chart.js'),
  buildPath('rail-buddy/js/ft-lt.js'),
  buildPath('rail-buddy/js/hist.js'),
  buildPath('rail-buddy/js/lrt-mkbf-line-chart.js'),
  buildPath('rail-buddy/js/mob-navtabs.js'),
  buildPath('rail-buddy/js/mrt-mkbf-line-chart.js'),
  buildPath('rail-buddy/js/scrape-sbs-transit.js'),
  buildPath('rail-buddy/js/scrape-smrt.js'),
  buildPath('rail-buddy/js/sysMap.js'),
  
  // RailBuddy assets
  buildPath('rail-buddy/assets/'),
  buildPath('rail-buddy/networks/'),
  
  // RailBuddy JSON data
  buildPath('rail-buddy/json/'),
  
  // Shared utilities
  buildPath('js/utils.js'),
  buildPath('js/pwa-helper.js'),
  
  // Shared CSS
  buildPath('css/style.css'),
  buildPath('css/dark-mode.css'),
  buildPath('css/style-breakpoints.css'),
  buildPath('css/bootstrap.min.css'),
  buildPath('css/animate.css'),
  buildPath('css/carousel.css'),
  buildPath('css/swiper-bundle.min.css'),
  
  // Shared JS libraries
  buildPath('js/bootstrap.min.js'),
  buildPath('js/jquery.min.js'),
  buildPath('js/popper.min.js'),
  
  // Icons
  buildPath('img/core-img/favicon.png'),
  buildPath('rail-buddy/assets/icon-192.png'),
  buildPath('rail-buddy/assets/icon-512.png')
];

// Install: cache RailBuddy assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[RailBuddy SW] Some assets could not be cached:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('rail-buddy-cache-') && name !== CACHE_NAME)
          .map(cacheName => {
            console.log('[RailBuddy SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const railBuddyScope = BASE_PATH + 'rail-buddy/';
  
  // Only handle GET requests within RailBuddy scope
  if (request.method !== 'GET' || !url.pathname.startsWith(railBuddyScope)) {
    return;
  }
  
  // Cache first strategy
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        // Cache successful responses
        if (shouldCache(request.url)) {
          const respCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, respCopy);
          });
        }
        
        return response;
      }).catch(() => {
        // Offline fallback
        return new Response('Offline - content not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    })
  );
});

// Determine if URL should be cached
function shouldCache(url) {
  const cacheableExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.json'];
  return cacheableExtensions.some(ext => url.endsWith(ext)) || url.endsWith('/');
}

// Message handler
self.addEventListener('message', event => {
  if (!event.data) return;
  
  console.log('[RailBuddy SW] Message received:', event.data.type);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('[RailBuddy SW] Cache cleared');
      });
      break;
    
    default:
      console.log('[RailBuddy SW] Unknown message type:', event.data.type);
  }
});
