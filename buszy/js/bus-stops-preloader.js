/**
 * Bus Stops Preloader
 * On first visit, immediately fetches all bus stops and caches them
 * Uses the same fetching logic as the "re-fetch data" button in settings
 */

(function() {
  const BUS_STOPS_CACHE_KEY = 'allBusStops';
  const BUS_STOPS_PRELOADED_KEY = 'busStopsPreloaded';
  const BUS_STOPS_API_URL = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops';

  /**
   * Check if bus stops have been preloaded
   */
  function hasBeenPreloaded() {
    return localStorage.getItem(BUS_STOPS_PRELOADED_KEY) === 'true';
  }

  /**
   * Check if bus stops are cached
   */
  function isBusStopsCached() {
    try {
      const cached = localStorage.getItem(BUS_STOPS_CACHE_KEY);
      return cached && JSON.parse(cached).value && JSON.parse(cached).value.length > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get current cached bus stops count
   */
  function getCachedBusStopsCount() {
    try {
      const cached = localStorage.getItem(BUS_STOPS_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        // Handle both raw array format and API response format
        const stops = Array.isArray(data) ? data : (data.value || []);
        return Array.isArray(stops) ? stops.length : 0;
      }
    } catch (e) {
      console.warn('[Bus Stops Preloader] Error reading cache:', e);
    }
    return 0;
  }

  /**
   * Preload all bus stops immediately (same as settings re-fetch button)
   */
  async function preloadAllBusStops() {
    console.log('[Bus Stops Preloader] Starting immediate preload of ALL bus stops...');
    
    try {
      // Fetch all bus stops using pagination like settings.js does
      let allStops = [];
      let skip = 0;
      let hasMoreData = true;

      while (hasMoreData) {
        const url = `${BUS_STOPS_API_URL}?$skip=${skip}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn('[Bus Stops Preloader] API returned status:', response.status);
          return false;
        }

        const data = await response.json();

        if (!data.value || data.value.length === 0) {
          hasMoreData = false;
        } else {
          allStops = allStops.concat(data.value);
          skip += 500;
          console.log(`[Bus Stops Preloader] Fetched ${allStops.length} stops so far...`);
        }
      }

      if (allStops.length === 0) {
        console.warn('[Bus Stops Preloader] No bus stops returned from API');
        return false;
      }

      // Cache the full response for compatibility
      localStorage.setItem(BUS_STOPS_CACHE_KEY, JSON.stringify({ value: allStops }));
      localStorage.setItem(BUS_STOPS_PRELOADED_KEY, 'true');

      console.log(`[Bus Stops Preloader] ✓ Successfully preloaded and cached ${allStops.length} bus stops`);
      return true;
    } catch (error) {
      console.warn('[Bus Stops Preloader] Error preloading bus stops:', error);
      return false;
    }
  }

  /**
   * Check and preload on first visit
   */
  function checkAndPreload() {
    // Only preload if not already done AND bus stops not cached
    if (!hasBeenPreloaded() && !isBusStopsCached()) {
      console.log('[Bus Stops Preloader] First visit detected - starting immediate preload');
      
      // Start preload immediately but avoid blocking page render
      // Use requestIdleCallback if available for better performance
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => preloadAllBusStops());
      } else {
        // Fallback: start without blocking
        Promise.resolve().then(() => preloadAllBusStops());
      }
    } else {
      const count = getCachedBusStopsCount();
      if (count > 0) {
        console.log(`[Bus Stops Preloader] Bus stops already cached (${count} stops)`);
      }
    }
  }

  // Start preloading when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndPreload);
  } else {
    // If DOMContentLoaded has already fired, start immediately
    checkAndPreload();
  }

  // Expose preloader functions for manual triggering if needed
  window.BusStopsPreloader = {
    preload: preloadAllBusStops,
    isCached: isBusStopsCached,
    getCachedCount: getCachedBusStopsCount,
    hasPreloaded: hasBeenPreloaded,
    clearCache: () => {
      localStorage.removeItem(BUS_STOPS_CACHE_KEY);
      localStorage.removeItem(BUS_STOPS_PRELOADED_KEY);
      console.log('[Bus Stops Preloader] Cache cleared');
    }
  };
})();
