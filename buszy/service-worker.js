/**
 * Buszy Service Worker
 * Handles caching and offline functionality for Buszy app
 * Dynamically detects base path for GitHub Pages and Heroku compatibility
 */

// Detect base path dynamically
const BASE_PATH = (() => {
  // Get the scope from the service worker registration
  const scope = self.registration.scope;
  // Extract base path from scope (e.g., '/nrfz-dev/buszy/' -> '/nrfz-dev/')
  const match = scope.match(/^(.*\/)buszy\/$/);
  return match ? match[1] : '/';
})();

const CACHE_VERSION = 'v1';
const CACHE_NAME = `buszy-cache-${CACHE_VERSION}`;

// Helper function to build paths with correct base
function buildPath(path) {
  return BASE_PATH + path.replace(/^\//, '');
}

// Buszy-specific assets to cache
const STATIC_ASSETS = [
  // Buszy entry
  buildPath('buszy/'),
  buildPath('buszy/index.html'),
  buildPath('buszy/manifest.json'),
  
  // Buszy styles
  buildPath('buszy/css/style-buszy.css'),
  
  // Buszy scripts
  buildPath('buszy/js/buszy-main.js'),
  buildPath('buszy/js/menu.js'),
  buildPath('buszy/js/settings.js'),
  buildPath('buszy/js/abs.js'),
  buildPath('buszy/js/ann.js'),
  buildPath('buszy/js/art.js'),
  buildPath('buszy/js/fl-bus.js'),
  buildPath('buszy/js/mob-navtabs.js'),
  buildPath('buszy/js/nbs.js'),
  buildPath('buszy/js/pinned.js'),
  buildPath('buszy/js/scrape-bus-timings.js'),
  buildPath('buszy/js/tsa.js'),
  
  // Buszy assets
  buildPath('buszy/assets/'),
  
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
  buildPath('buszy/assets/icon-192.png'),
  buildPath('buszy/assets/icon-512.png')
];

// Install: cache Buszy assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Buszy SW] Some assets could not be cached:', err);
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
          .filter(name => name.startsWith('buszy-cache-') && name !== CACHE_NAME)
          .map(cacheName => {
            console.log('[Buszy SW] Deleting old cache:', cacheName);
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
  const buszyScope = BASE_PATH + 'buszy/';
  
  // Only handle GET requests within Buszy scope
  if (request.method !== 'GET' || !url.pathname.startsWith(buszyScope)) {
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
  
  console.log('[Buszy SW] Message received:', event.data.type);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('[Buszy SW] Cache cleared');
      });
      break;
    
    default:
      console.log('[Buszy SW] Unknown message type:', event.data.type);
  }
});
