// Initialize default preferences for first-time visitors
function initializeDefaultPreferences() {
    // Set default time format if not already set
    if (!localStorage.getItem('timeFormat')) {
        localStorage.setItem('timeFormat', '24-hour');
    }

    // Set default dark mode preference if not already set
    if (!localStorage.getItem('dark-mode')) {
        localStorage.setItem('dark-mode', 'disabled');
    }

    // Set default show fleet legend preference if not already set
    if (!localStorage.getItem('showFleetLegend')) {
        localStorage.setItem('showFleetLegend', 'enabled');
    }

    // Set default show incoming buses preference if not already set
    if (!localStorage.getItem('showIncomingBuses')) {
        localStorage.setItem('showIncomingBuses', 'enabled');
    }

    // Set default refresh interval if not already set (in seconds)
    if (!localStorage.getItem('refreshInterval')) {
        localStorage.setItem('refreshInterval', '2');
    }
}

// Initialize defaults immediately
initializeDefaultPreferences();

// Load destination codes as fallback for missing stops
let destinationCodesData = null;

async function loadDestinationCodes() {
    if (destinationCodesData !== null) {
        return destinationCodesData; // Already loaded
    }
    
    try {
        const basePath = getBasePath();
        const jsonPath = basePath + 'buszy/json/destination-codes.json';
        console.log('Loading destination codes from:', jsonPath);
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`);
        }
        destinationCodesData = await response.json();
        console.log('Successfully loaded destination codes:', Object.keys(destinationCodesData).length, 'codes');
        return destinationCodesData;
    } catch (error) {
        console.warn('Error loading destination codes:', error);
        destinationCodesData = {}; // Set to empty object to avoid repeated attempts
        return destinationCodesData;
    }
}

// Get base path for the application
function getBasePath() {
    // If PWAConfig is available, use it
    if (window.PWAConfig && window.PWAConfig.basePath) {
        return window.PWAConfig.basePath;
    }

    // Otherwise, derive from the current pathname
    // For GitHub Pages: /nrfz-dev/buszy/... -> /nrfz-dev/
    // For local: /buszy/... -> /
    const pathname = window.location.pathname;
    const parts = pathname.split('/').filter(p => p); // Remove empty strings

    // parts[0] should be the first directory level
    // If parts[0] is 'buszy', we're at the root level (localhost)
    // If parts[0] is something else and parts[1] is 'buszy', we're in a subdirectory (GitHub Pages)

    if (parts.length >= 2 && parts[1] === 'buszy') {
        // Format: /something/buszy/... -> /something/
        return '/' + parts[0] + '/';
    }

    // For local or simple paths
    return '/';
}

// ****************************
// :: Bus Stop Cache (shared promise across all callers)
// ****************************

let busStopsPromise = null;
let currentLocationMarker = null; // Track the current location marker across button clicks
let currentLocationCircle = null; // Track the current location accuracy circle
let activeMapServiceNo = null; // Track which service is currently shown on the map
let busMarkers = []; // [{marker, lat, lng, estimatedArrival, busLabel}] for live position updates
let mapRefreshIntervalId = null; // Dedicated fast interval for map position updates

// Fetch only bus locations for the active map service and update markers in-place
async function refreshActiveMapMarkers() {
    if (!activeMapServiceNo || !map || busMarkers.length === 0) return;
    const mapSection = document.querySelector('.bus-location-section');
    if (!mapSection || mapSection.style.display === 'none') return;

    const searchInput = document.getElementById('bus-stop-search')?.value.trim();
    if (!searchInput) return;

    try {
        const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
        url.searchParams.append('BusStopCode', searchInput);
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();

        const activeService = data.Services?.find(s => s.ServiceNo === activeMapServiceNo);
        if (!activeService) return;

        const freshLocations = [];
        if (activeService.NextBus && activeService.NextBus.Latitude !== '0.0' && activeService.NextBus.Longitude !== '0.0') {
            freshLocations.push({ lat: parseFloat(activeService.NextBus.Latitude), lng: parseFloat(activeService.NextBus.Longitude), estimatedArrival: activeService.NextBus.EstimatedArrival || null, busLabel: 'Next Bus' });
        }
        if (activeService.NextBus2 && activeService.NextBus2.Latitude !== '0.0' && activeService.NextBus2.Longitude !== '0.0') {
            freshLocations.push({ lat: parseFloat(activeService.NextBus2.Latitude), lng: parseFloat(activeService.NextBus2.Longitude), estimatedArrival: activeService.NextBus2.EstimatedArrival || null, busLabel: 'Subsequent Bus' });
        }

        const refreshNow = new Date();
        const savedFormat = localStorage.getItem('timeFormat') || '12-hour';

        freshLocations.forEach((loc, index) => {
            const entry = busMarkers[index];
            if (!entry) return;
            if (entry.lat !== loc.lat || entry.lng !== loc.lng) {
                entry.marker.setLatLng([loc.lat, loc.lng]);
                entry.lat = loc.lat;
                entry.lng = loc.lng;
            }
            let timingHTML = '';
            if (loc.estimatedArrival) {
                const arrivalTime = new Date(loc.estimatedArrival);
                const minutes = Math.max(0, Math.floor((arrivalTime - refreshNow) / 60000));
                if (savedFormat === 'mins') {
                    timingHTML = minutes <= 0 ? '<b style="color: #7db603;">Arr</b>' : `<b>${minutes} ${minutes === 1 ? 'min' : 'mins'}</b>`;
                } else {
                    const timeStr = arrivalTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: savedFormat !== '24-hour' });
                    timingHTML = `<small style="color: #666;">Arrives at:</small><br><b>${timeStr}</b>`;
                }
            }
            entry.marker.setPopupContent(`<b>${activeMapServiceNo}</b><br><small style="color: #888;">${loc.busLabel}</small><br>${timingHTML || '<small style="color: #999;">Timing unavailable</small>'}`);
            entry.estimatedArrival = loc.estimatedArrival;
        });
    } catch (e) {
        // silently ignore; main fetch loop handles error display
    }
}

function startMapRefreshInterval() {
    if (mapRefreshIntervalId !== null) clearInterval(mapRefreshIntervalId);
    mapRefreshIntervalId = setInterval(refreshActiveMapMarkers, 3000);
}

// Calculate distance between two coordinates in meters
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Return distance in meters
}

async function loadAllBusStops() {
    try {
        const cached = localStorage.getItem('allBusStops');
        if (cached) {
            const parsed = JSON.parse(cached);
            // Handle both array format and API response format { value: [...] }
            const stops = Array.isArray(parsed) ? parsed : (parsed.value || []);
            if (Array.isArray(stops) && stops.length > 0) {
                console.log(`[art.js] Using cached bus stops: ${stops.length} stops`);
                return stops;
            }
        }
    } catch (e) {
        console.warn('Failed to read cached bus stops:', e);
    }

    console.log('[art.js] Fetching bus stops from API...');
    let busStops = [];
    let skip = 0;
    let hasMoreData = true;

    while (hasMoreData) {
        const response = await fetch(`https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=${skip}`);
        if (!response.ok) throw new Error(`Failed to fetch bus stops: ${response.status}`);
        const data = await response.json();

        if (!data.value || data.value.length === 0) {
            hasMoreData = false;
        } else {
            busStops = busStops.concat(data.value);
            skip += 500;
        }
    }

    if (busStops.length > 0) {
        console.log(`[art.js] Fetched ${busStops.length} bus stops from API`);
        localStorage.setItem('allBusStops', JSON.stringify(busStops));
    }
    return busStops;
}

function getBusStops() {
    if (!busStopsPromise) {
        busStopsPromise = loadAllBusStops().catch(err => {
            console.error('Error loading bus stops:', err);
            busStopsPromise = null; // Allow retry on next call
            return [];
        });
    }
    return busStopsPromise;
}

// ****************************
// :: Bus Arrivals Fetching and Display
// ****************************
document.addEventListener('DOMContentLoaded', async () => {
    // Apply fleet legend visibility setting
    function applyFleetLegendVisibility() {
        const showFleetLegend = localStorage.getItem('showFleetLegend') !== 'disabled';
        const legendElement = document.querySelector('.bus-load-legend');
        if (legendElement) {
            legendElement.style.display = showFleetLegend ? 'flex' : 'none';
        }
    }

    // Apply incoming buses visibility setting
    function applyIncomingBusesVisibility() {
        const showIncomingBuses = localStorage.getItem('showIncomingBuses') !== 'disabled';
        const incomingBusesElement = document.getElementById('incoming-buses-section');
        if (incomingBusesElement && incomingBusesElement.style.display !== 'none') {
            // Only hide if it's currently set to display, check the preference
            if (!showIncomingBuses) {
                incomingBusesElement.style.display = 'none';
            }
        }
    }

    // Apply both visibility settings on page load
    applyFleetLegendVisibility();
    applyIncomingBusesVisibility();

    // Listen for changes in localStorage from settings page
    window.addEventListener('showFleetLegendChanged', (event) => {
        applyFleetLegendVisibility();
    });

    window.addEventListener('showIncomingBusesChanged', (event) => {
        applyIncomingBusesVisibility();
    });

    // Also listen for storage changes (when settings are changed in another tab/window)
    window.addEventListener('storage', (event) => {
        if (event.key === 'showFleetLegend') {
            applyFleetLegendVisibility();
        }
        if (event.key === 'showIncomingBuses') {
            applyIncomingBusesVisibility();
        }
    });

    const searchInput = document.getElementById('bus-stop-search'); // Search input field
    const filterTitle = document.getElementById('filter-title'); // Title element

    // Get the BusStopCode from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const busStopCode = urlParams.get('BusStopCode');

    // Only process if busStopCode is a non-empty string
    if (busStopCode && busStopCode.trim() !== '') {
        searchInput.value = busStopCode;

        // Fetch the bus stop name from the /bus-stops endpoint
        try {
            const busStops = await getBusStops();

            // Find the bus stop by BusStopCode
            const busStop = Array.isArray(busStops) ? busStops.find(stop => stop.BusStopCode === busStopCode) : null;

            if (busStop) {
                // Update title with styled bus stop code and name
                // Build correct image path for GitHub Pages and Heroku
                const basePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
                const busIconPath = basePath + 'buszy/assets/bus-icon.png';

                filterTitle.innerHTML = `
                    <div class="bus-stop-info">
                        <span class="bus-stop-code">
                            <img src="${busIconPath}" alt="Bus Icon">
                            <span class="bus-stop-code-text">${busStop.BusStopCode}</span>
                        </span>
                        <span class="bus-stop-description">${busStop.Description}</span>
                    </div>
                `;
            } else {
                // Check destination-codes.json as fallback
                const destinationCodes = await loadDestinationCodes();
                if (destinationCodes[busStopCode]) {
                    const destCode = destinationCodes[busStopCode];
                    const description = typeof destCode === 'string' ? destCode : destCode.description;
                    console.log(`Using destination code for ${busStopCode}: ${description}`);
                    const basePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
                    const busIconPath = basePath + 'buszy/assets/bus-icon.png';
                    
                    filterTitle.innerHTML = `
                        <div class="bus-stop-info">
                            <span class="bus-stop-code">
                                <img src="${busIconPath}" alt="Bus Icon">
                                <span class="bus-stop-code-text">${busStopCode}</span>
                            </span>
                            <span class="bus-stop-description">${description}</span>
                        </div>
                    `;
                } else {
                    filterTitle.textContent = `Bus Stop Not Found (${busStopCode})`;
                }
            }
        } catch (error) {
            console.error('Error fetching bus stop name:', error);
            filterTitle.textContent = `Error Loading Bus Stop Name (${busStopCode})`;
        }

        fetchBusArrivals(); // Fetch bus arrival timings
    } else {
        filterTitle.textContent = 'Enter Bus Stop Code';
    }

    const updateUrl = () => {
        const url = new URL(window.location.href);
        const currentValue = searchInput.value.trim();

        if (currentValue) {
            url.searchParams.set('BusStopCode', currentValue);
        } else {
            url.searchParams.delete('BusStopCode');
        }

        window.history.replaceState({}, document.title, url.toString());
    };

    searchInput.addEventListener('input', debounce(() => {
        updateUrl();
        fetchBusArrivals();
    }, 300));

    // Setup dynamic refresh interval
    let refreshIntervalId = null;

    function startRefreshInterval() {
        // Clear existing interval if any
        if (refreshIntervalId !== null) {
            clearInterval(refreshIntervalId);
        }

        // Get refresh interval from localStorage (in seconds), default to 2 seconds
        const refreshSeconds = parseFloat(localStorage.getItem('refreshInterval') || '2');
        const refreshMs = refreshSeconds * 1000;

        // Start new interval
        refreshIntervalId = setInterval(fetchBusArrivals, refreshMs);
    }

    // Start the refresh interval on page load
    startRefreshInterval();
    startMapRefreshInterval();

    // Listen for refresh interval changes from settings
    window.addEventListener('refreshIntervalChanged', (event) => {
        startRefreshInterval();
    });

    // Listen for changes in localStorage to update time format dynamically
    window.addEventListener('storage', (event) => {
        if (event.key === 'timeFormat') {
            fetchBusArrivals(); // Re-fetch and update the table with the new format
        }
        if (event.key === 'refreshInterval') {
            startRefreshInterval(); // Restart interval with new value
        }
    });
});

// Debounce function to limit the rate of function calls
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Store previous content for comparison
let previousContainerHTML = '';

// Track which bus stop is currently rendered to avoid full re-renders on interval
let renderedBusStopCode = null;

// Abort controller for in-flight requests (prevents stale responses)
let currentFetchController = null;

// Cache for bus service data to check if service exists
let busServiceDataCache = null;

// Load bus service data to check which services are available
async function loadBusServiceDataForDisplay() {
    if (busServiceDataCache !== null) {
        return busServiceDataCache;
    }

    try {
        const basePath = getBasePath();
        const jsonPath = basePath + 'buszy/json/bus-service-data.json';
        const response = await fetch(jsonPath);
        if (response.ok) {
            busServiceDataCache = await response.json();
            return busServiceDataCache;
        }
    } catch (error) {
        console.warn('Could not load bus service data:', error);
        busServiceDataCache = [];
    }
    return busServiceDataCache;
}

// Check if a service exists in the bus service data
function serviceExists(serviceNo) {
    if (!busServiceDataCache || busServiceDataCache.length === 0) {
        return true; // If no data loaded, assume service exists
    }
    return busServiceDataCache.some(service => service.n === serviceNo);
}

// Updated fetchBusArrivals function
async function fetchBusArrivals() {
    try {
        // Load bus service data for checking service availability
        await loadBusServiceDataForDisplay();

        // Save current scroll position at the very start
        const scrollPosition = window.scrollY || document.documentElement.scrollTop;

        const searchInput = document.getElementById('bus-stop-search').value.trim();
        const container = document.getElementById('bus-arrivals-container');

        if (!searchInput) {
            const noDataHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">No Data</div>
                        <div class="card-body">
                            <p class="card-text">Pick a Bus stop in the Search Page.</p>
                        </div>
                    </div>
                </div>`;
            // Only update if content has changed
            if (container.innerHTML !== noDataHTML) {
                container.innerHTML = noDataHTML;
            }

            // Hide incoming buses section when no search input
            const incomingSection = document.getElementById('incoming-buses-section');
            if (incomingSection) {
                incomingSection.style.display = 'none';
            }
            return;
        }

        const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
        url.searchParams.append('BusStopCode', searchInput);

        // Abort any previous in-flight request so stale responses don't overwrite fresh ones
        if (currentFetchController) {
            currentFetchController.abort();
        }
        currentFetchController = new AbortController();

        const response = await fetch(url, {
            signal: currentFetchController.signal
        });

        if (!response.ok) {
            throw new Error('Failed to fetch bus arrivals');
        }

        const data = await response.json();

        if (!data.Services || data.Services.length === 0) {
            const basePath = getBasePath();
            const timingsUrl = `${basePath}buszy/first-last.html${searchInput ? '?BusStopCode=' + encodeURIComponent(searchInput) : ''}`;
            const noDataHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">No Data Available</div>
                        <div class="card-body">
                            <p class="card-text">No Data Available</p>
                            <div style="margin-top: 1.5rem; text-align: center;">
                                <a href="${timingsUrl}" class="btn btn-mar btn-primary" style="display: inline-block; padding: 0.5rem 1.5rem; background-color: #94d40b; color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; ">
                                    <i class="fa-regular fa-clock" style="margin-right: 0.5rem;"></i> Timings
                                </a>
                            </div>
                        </div>
                    </div>
                </div>`;
            // Only update if content has changed
            if (container.innerHTML !== noDataHTML) {
                container.innerHTML = noDataHTML;
            }

            // Also reflect "No Data Available" for incoming buses section
            const incomingSection = document.getElementById('incoming-buses-section');
            const incomingGrid = document.getElementById('incoming-buses-grid');
            if (incomingSection && incomingGrid) {
                incomingSection.style.display = 'block';
                incomingGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 1rem; color: #999;">
                        No incoming buses available
                    </div>
                `;
            }
            return;
        }

        const now = new Date();

        // Create a map of destination codes to names from cached bus stops
        let destinationMap = {};
        let customDestinationMap = {};

        // Load custom destination code mappings
        try {
            const basePath = getBasePath();
            const jsonPath = basePath + 'buszy/json/destination-codes.json';
            const response = await fetch(jsonPath);
            if (response.ok) {
                customDestinationMap = await response.json();
            }
        } catch (error) {
            console.warn('Custom destination codes file not found or error loading:', error);
        }

        try {
            const allBusStops = await getBusStops();
            allBusStops.forEach((stop) => {
                destinationMap[stop.BusStopCode] = stop.Description;
            });
        } catch (error) {
            console.error('Error creating destination map:', error);
        }

        // Function to get destination name
        function getDestinationName(destinationCode) {
            // First try to find in bus stops map
            if (destinationMap[destinationCode]) {
                return destinationMap[destinationCode];
            }
            // Then try custom destination codes mapping
            if (customDestinationMap[destinationCode]) {
                return customDestinationMap[destinationCode];
            }
            // Finally return the code itself if not found
            return destinationCode;
        }

        // Prepare incoming buses data
        const incomingBuses = [];
        data.Services.forEach((service) => {
            if (service.NextBus?.EstimatedArrival) {
                incomingBuses.push({
                    ServiceNo: service.ServiceNo,
                    EstimatedArrival: new Date(service.NextBus.EstimatedArrival),
                    TimeStr: formatArrivalTimeOrArr(service.NextBus.EstimatedArrival, now, true)
                });
            }
            if (service.NextBus2?.EstimatedArrival) {
                incomingBuses.push({
                    ServiceNo: service.ServiceNo,
                    EstimatedArrival: new Date(service.NextBus2.EstimatedArrival),
                    TimeStr: formatArrivalTimeOrArr(service.NextBus2.EstimatedArrival, now, true)
                });
            }
        });

        // Sort by arrival time and take top 4
        incomingBuses.sort((a, b) => a.EstimatedArrival - b.EstimatedArrival);
        const topFourBuses = incomingBuses.slice(0, 4);

        // Display incoming buses - only update if content has changed
        const incomingSection = document.getElementById('incoming-buses-section');
        const incomingGrid = document.getElementById('incoming-buses-grid');
        const showIncomingBuses = localStorage.getItem('showIncomingBuses') !== 'disabled';
        if (topFourBuses.length > 0 && showIncomingBuses) {
            incomingSection.style.display = 'block';
            const isDarkMode = document.body.classList.contains('dark-mode');
            const bgColor = isDarkMode ? '#7db603' : '#94d40b';
            const newIncomingHTML = topFourBuses.map(bus => {
                const isArrived = bus.TimeStr.includes('Arr');
                const arrivedClass = isArrived ? 'arrived' : '';
                let serviceUrl = getBasePath() + 'buszy/bus-service.html?service=' + bus.ServiceNo;
                if (searchInput && searchInput.trim() !== '') {
                    serviceUrl += '&highlightStop=' + encodeURIComponent(searchInput);
                }
                return `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                    <div class="ib-time ${arrivedClass}">${bus.TimeStr}</div>
                    <a href="${serviceUrl}" class="ib-svc" style="background-color: ${bgColor}; cursor: pointer; text-decoration: none; color: inherit; border-radius: 8px; padding: 4px 8px; display: inline-block;">${bus.ServiceNo}</a>
                </div>
            `;
            }).join('');
            // Only update if content has changed
            if (incomingGrid.innerHTML !== newIncomingHTML) {
                incomingGrid.innerHTML = newIncomingHTML;
            }
        } else {
            incomingSection.style.display = 'none';
        }

        // If the same bus stop and same set of services are already rendered,
        // only update arrival times and load icons in-place — no DOM rebuild.
        const existingCards = container.querySelectorAll('.card-bt[data-service]');
        const existingServiceSet = new Set([...existingCards].map(el => el.dataset.service));
        const newServiceSet = new Set(data.Services.map(s => s.ServiceNo));
        const canRefreshInPlace = renderedBusStopCode === searchInput &&
            existingServiceSet.size === newServiceSet.size && [...newServiceSet].every(s => existingServiceSet.has(s));

        if (canRefreshInPlace) {
            data.Services.forEach((service) => {
                const hasNextBus = service.NextBus && typeof service.NextBus === 'object' && Object.keys(service.NextBus).length > 0;
                const hasNextBus2 = service.NextBus2 && typeof service.NextBus2 === 'object' && Object.keys(service.NextBus2).length > 0;
                const cardContentArt = container.querySelector(`.card-bt[data-service="${service.ServiceNo}"] .card-content-art`);
                if (cardContentArt) {
                    const newContentHTML = `
                            ${hasNextBus ? `
                            <div class="busNo-card d-flex justify-content-between">
                                <span class="bus-time">${service.NextBus?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${getLoadIcon(service.NextBus?.Load, service.NextBus?.Type)}
                                </span>
                            </div>
                            ` : `<div style="padding: 0.5rem; color: #999; font-size: 0.9rem;">No arrival data</div>`}
                            ${hasNextBus2 ? `
                            <div class="busNo-card d-flex justify-content-between">
                                <span class="bus-time">${service.NextBus2?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus2.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${getLoadIcon(service.NextBus2?.Load, service.NextBus2?.Type)}
                                </span>
                            </div>
                            ` : ''}
                        `;
                    if (cardContentArt.innerHTML !== newContentHTML) {
                        cardContentArt.innerHTML = newContentHTML;
                    }
                }
            });
            return;
        }

        // Build new content
        const tempContainer = document.createElement('div');
        const busStopCode = document.getElementById('bus-stop-search').value.trim();

        data.Services.forEach((service) => {
            const card = document.createElement('div');
            card.classList.add('col-12', 'col-md-4', 'col-xl-3', 'card-bt'); // Add col-sm-6 for 2 cards per row on small screens
            card.dataset.service = service.ServiceNo;

            // Safely check if NextBus exists and has required properties
            const hasNextBus = service.NextBus && typeof service.NextBus === 'object' && Object.keys(service.NextBus).length > 0;
            const hasNextBus2 = service.NextBus2 && typeof service.NextBus2 === 'object' && Object.keys(service.NextBus2).length > 0;

            card.innerHTML = `
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center" style="flex-wrap: nowrap;">
                        <div style="min-width: 0; padding-right: 15px; flex: 1;">
                            <button class="service-no-collapsible-btn" data-service="${service.ServiceNo}" title="Click to view options">
                                <span class="service-no">${service.ServiceNo}</span>
                                <i class="fa-regular fa-chevron-down" style="transition: transform 0.3s ease; margin-left: 0.5rem;"></i>
                            </button>
                            ${hasNextBus && service.NextBus.DestinationCode ? `<div class="destination-code"><i class="fa-kit fa-lta-to-right"></i>&nbsp;${getDestinationName(service.NextBus.DestinationCode)}</div>` : ''}
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 0.5rem; align-items: center; flex-shrink: 0;">
                            ${service.Operator ? `<img src="assets/${service.Operator.toLowerCase()}.png" alt="${service.Operator}" class="img-fluid" style="width: 50px; margin-left: auto;">` : ''}
                        </div>
                    </div>
                    <div class="service-options-collapse" data-service="${service.ServiceNo}" style="display: none; max-height: 0; overflow: hidden; transition: max-height 0.3s ease;">
                        <div style="display: flex; gap: 0.5rem; padding: 0.5rem 0; margin-top: 0.5rem; padding-top: 0.5rem; flex-wrap: wrap; justify-content: center;">
                            <button class="btn btn-busloc btn-sm view-location-btn-consolidated" data-service="${service.ServiceNo}" title="View bus location on map"
                                ${!((service.NextBus?.Latitude !== "0.0" && service.NextBus?.Longitude !== "0.0") || (hasNextBus2 && service.NextBus2?.Latitude !== "0.0" && service.NextBus2?.Longitude !== "0.0")) ? 'disabled' : ''}>
                                <i class="fa-kit fa-lta-location"></i>&nbsp;Location
                            </button>
                            <a href="${getBasePath() + 'buszy/first-last.html?BusStopCode=' + busStopCode + '&service=' + service.ServiceNo}" class="btn btn-busloc btn-sm" title="View first and last bus timings">
                                <i class="fa-regular fa-clock"></i>&nbsp;Timings
                            </a>
                            <button class="btn btn-busloc btn-sm view-route-btn" data-service="${service.ServiceNo}" title="View bus route details"
                                ${!serviceExists(service.ServiceNo) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                                <i class="fa-kit fa-lta-bus-stop"></i>&nbsp;Route
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="card-content-art">
                            ${hasNextBus ? `
                            <div class="busNo-card d-flex justify-content-between">
                                <span class="bus-time">${service.NextBus?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${getLoadIcon(service.NextBus?.Load, service.NextBus?.Type)}
                                </span>
                            </div>
                            ` : `<div style="padding: 0.5rem; color: #999; font-size: 0.9rem;">No arrival data</div>`}
                            ${hasNextBus2 ? `
                            <div class="busNo-card d-flex justify-content-between">
                                <span class="bus-time">${service.NextBus2?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus2.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${getLoadIcon(service.NextBus2?.Load, service.NextBus2?.Type)}
                                </span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            tempContainer.appendChild(card);
        });

        // Only update the DOM if the content has changed
        const newHTML = tempContainer.innerHTML;
        let didUpdate = false;
        if (container.innerHTML !== newHTML) {
            // Save expanded service options before DOM update
            const expandedServices = new Set();
            document.querySelectorAll('.service-options-collapse.show').forEach(el => {
                expandedServices.add(el.getAttribute('data-service'));
            });

            container.innerHTML = newHTML;
            didUpdate = true;
            renderedBusStopCode = searchInput;

            // Restore expanded state without animation
            expandedServices.forEach(serviceNo => {
                const collapseSection = document.querySelector(`.service-options-collapse[data-service="${serviceNo}"]`);
                const button = document.querySelector(`.service-no-collapsible-btn[data-service="${serviceNo}"]`);
                if (collapseSection) {
                    collapseSection.style.display = 'block';
                    collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                    collapseSection.style.opacity = '1';
                    collapseSection.classList.add('show');
                }
                if (button) {
                    button.classList.add('active');
                }
            });
        }

        // Only add event listeners if the DOM was updated
        if (didUpdate) {
            // Add toggle functionality to service number collapsible buttons
            const collapsibleButtons = document.querySelectorAll('.service-no-collapsible-btn');
            collapsibleButtons.forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    const serviceNo = button.getAttribute('data-service');
                    const collapseSection = document.querySelector(`.service-options-collapse[data-service="${serviceNo}"]`);

                    if (collapseSection) {
                        const isVisible = collapseSection.style.display !== 'none';

                        if (isVisible) {
                            // Animate height to 0, then hide
                            collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                            // Force reflow so transition fires
                            collapseSection.getBoundingClientRect();
                            collapseSection.style.maxHeight = '0';
                            collapseSection.style.opacity = '0';
                            collapseSection.classList.remove('show');
                            button.classList.remove('active');
                            collapseSection.addEventListener('transitionend', () => {
                                collapseSection.style.display = 'none';
                            }, {
                                once: true
                            });
                        } else {
                            // Show then animate height in
                            collapseSection.style.display = 'block';
                            collapseSection.style.maxHeight = '0';
                            collapseSection.style.opacity = '0';
                            // Force reflow so transition fires
                            collapseSection.getBoundingClientRect();
                            collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                            collapseSection.style.opacity = '1';
                            collapseSection.classList.add('show');
                            button.classList.add('active');
                        }
                    }
                });
            });

            // Store location data for each service to enable cycling
            const serviceLocations = {};
            data.Services.forEach((service) => {
                const locations = [];
                if (service.NextBus && service.NextBus.Latitude !== "0.0" && service.NextBus.Longitude !== "0.0") {
                    locations.push({
                        lat: parseFloat(service.NextBus.Latitude),
                        lng: parseFloat(service.NextBus.Longitude),
                        type: service.NextBus.Type || 'N/A',
                        load: service.NextBus.Load || 'N/A',
                        estimatedArrival: service.NextBus.EstimatedArrival || null
                    });
                }
                if (service.NextBus2 && service.NextBus2.Latitude !== "0.0" && service.NextBus2.Longitude !== "0.0") {
                    locations.push({
                        lat: parseFloat(service.NextBus2.Latitude),
                        lng: parseFloat(service.NextBus2.Longitude),
                        type: service.NextBus2.Type || 'N/A',
                        load: service.NextBus2.Load || 'N/A',
                        estimatedArrival: service.NextBus2.EstimatedArrival || null
                    });
                }
                if (locations.length > 0) {
                    serviceLocations[service.ServiceNo] = {
                        locations: locations,
                        currentIndex: 0
                    };
                }
            });

            // Add event listeners to consolidated "View Bus Location" buttons
            const viewLocationButtons = document.querySelectorAll('.view-location-btn-consolidated');
            viewLocationButtons.forEach((button) => {
                button.addEventListener('click', (event) => {
                    if (!map) {
                        alert('Map is not available on this device. Please try on desktop.');
                        return;
                    }

                    const serviceNo = button.getAttribute('data-service');
                    const serviceData = serviceLocations[serviceNo];

                    if (!serviceData || serviceData.locations.length === 0) {
                        alert('Bus location not available.');
                        return;
                    }

                    // Get current time for timing calculations
                    const now = new Date();

                    // Show the map section
                    const mapSection = document.querySelector('.bus-location-section');
                    if (mapSection) {
                        mapSection.style.display = 'block';

                        // Scroll to top of page
                        window.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                        });

                        // Invalidate the map size to fix grey areas
                        setTimeout(() => {
                            if (map && map.invalidateSize) {
                                map.invalidateSize();
                            }
                        }, 100);

                        // Set active service so subsequent refreshes can update markers in-place
                        activeMapServiceNo = serviceNo;
                        // Kick off an immediate map position refresh
                        refreshActiveMapMarkers();

                        // Clear all existing bus markers (but keep location marker)
                        busMarkers.forEach(({ marker }) => map.removeLayer(marker));
                        busMarkers = [];
                        if (currentLocationMarker) {
                            map.removeLayer(currentLocationMarker);
                            currentLocationMarker = null;
                        }
                        currentLocationCircle = null;

                        // Add markers for all locations
                        let bounds = [];
                        serviceData.locations.forEach((location, index) => {
                            const latitude = location.lat;
                            const longitude = location.lng;

                            if (!isNaN(latitude) && !isNaN(longitude)) {
                                // Create FontAwesome marker icon for bus
                                const busIcon = L.divIcon({
                                    html: `<div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background-color: #7db603; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer;">
                                        <i class="fa-kit fa-lta-bus" style="color: #1a1a1a; font-size: 16px;"></i>
                                    </div>`,
                                    iconSize: [32, 32],
                                    className: 'bus-marker'
                                });

                                const marker = L.marker([latitude, longitude], {
                                    icon: busIcon
                                }).addTo(map);

                                // Add pulse effect to next bus marker (first marker)
                                if (index === 0) {
                                    const markerElement = marker.getElement();
                                    if (markerElement) {
                                        markerElement.classList.add('marker-pulse');
                                    }
                                }

                                // Store marker reference for live updates
                                busMarkers.push({
                                    marker,
                                    lat: latitude,
                                    lng: longitude,
                                    estimatedArrival: location.estimatedArrival,
                                    busLabel: index === 0 ? 'Next Bus' : 'Subsequent Bus'
                                });

                                // Determine bus label
                                const busLabel = index === 0 ? 'Next Bus' : 'Subsequent Bus';

                                // Format timing information based on user's preference
                                let timingHTML = '';
                                if (location.estimatedArrival) {
                                    const arrivalTime = new Date(location.estimatedArrival);
                                    const timeDifference = arrivalTime - now;

                                    // Get user's time format preference
                                    const savedFormat = localStorage.getItem('timeFormat') || '12-hour';

                                    // Minutes format
                                    const minutes = Math.max(0, Math.floor(timeDifference / (1000 * 60)));
                                    const minText = minutes === 1 ? 'min' : 'mins';

                                    if (savedFormat === 'mins') {
                                        timingHTML = `
                                            ${minutes <= 0 ? '<b style="color: #7db603;">Arr</b>' : `<b>${minutes} ${minText}</b>`}
                                        `;
                                    } else if (savedFormat === '24-hour') {
                                        const timeStr = arrivalTime.toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: false
                                        });
                                        timingHTML = `
                                            <small style="color: #666;">Arrives at:</small><br>
                                            <b>${timeStr}</b>
                                        `;
                                    } else { // 12-hour format
                                        const timeStr = arrivalTime.toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true
                                        });
                                        timingHTML = `
                                            <small style="color: #666;">Arrives at:</small><br>
                                            <b>${timeStr}</b>
                                        `;
                                    }
                                }

                                marker.bindPopup(`
                                    <b>${serviceNo}</b><br>
                                    <small style="color: #888;">${busLabel}</small><br>
                                    ${timingHTML || '<small style="color: #999;">Timing unavailable</small>'}
                                `);

                                bounds.push([latitude, longitude]);
                            }
                        });

                        // Add current location marker with location pin icon
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition((position) => {
                                const lat = position.coords.latitude;
                                const lng = position.coords.longitude;

                                // Remove existing location marker if it exists
                                if (currentLocationMarker) {
                                    map.removeLayer(currentLocationMarker);
                                    currentLocationMarker = null;
                                }

                                // Create FontAwesome location marker
                                const locationIcon = L.divIcon({
                                    html: `<div style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background-color: #ff4444; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;">
                                        <i class="fa-kit fa-lta-location" style="color: #fff; font-size: 18px;"></i>
                                    </div>`,
                                    iconSize: [40, 40],
                                    className: 'location-marker'
                                });

                                currentLocationMarker = L.marker([lat, lng], {
                                    icon: locationIcon
                                }).addTo(map);
                                currentLocationMarker.bindPopup(`
                                    <b>Your Location</b><br>
                                    <small style="color: #888;">Current Position</small>
                                `);

                                // Add current location to bounds
                                bounds.push([lat, lng]);

                                // Recalculate bounds to include current location
                                if (bounds.length > 0) {
                                    const latLngs = bounds.map(b => L.latLng(b[0], b[1]));
                                    map.fitBounds(L.latLngBounds(latLngs), {
                                        padding: [50, 50],
                                        maxZoom: 16,
                                        animate: false
                                    });
                                }
                            }, (error) => {
                                console.warn('Could not get current location:', error);
                                // Still fit bounds for bus locations if geolocation fails
                                if (bounds.length > 0) {
                                    const latLngs = bounds.map(b => L.latLng(b[0], b[1]));
                                    map.fitBounds(L.latLngBounds(latLngs), {
                                        padding: [50, 50],
                                        maxZoom: 16,
                                        animate: false
                                    });
                                }
                            });
                        } else {
                            // Geolocation not available, just fit bus locations
                            if (bounds.length > 0) {
                                const latLngs = bounds.map(b => L.latLng(b[0], b[1]));
                                map.fitBounds(L.latLngBounds(latLngs), {
                                    padding: [50, 50],
                                    maxZoom: 14
                                });
                            }
                        }
                    }
                });
            });

            // Add event listeners to "View Route" buttons
            const viewRouteButtons = document.querySelectorAll('.view-route-btn');
            viewRouteButtons.forEach((button) => {
                button.addEventListener('click', (event) => {
                    if (button.disabled) {
                        event.preventDefault();
                        alert('Route information is not available for this service.');
                        return;
                    }
                    const serviceNo = button.getAttribute('data-service');
                    let url = getBasePath() + 'buszy/bus-service.html?service=' + serviceNo;
                    // Pass the current bus stop code if available
                    if (busStopCode && busStopCode.trim() !== '') {
                        url += '&highlightStop=' + encodeURIComponent(busStopCode);
                    }
                    window.location.href = url;
                });
            });
        }

        // Live map update: if the map is visible for an active service, update marker positions in-place
        if (activeMapServiceNo && map && busMarkers.length > 0) {
            const mapSection = document.querySelector('.bus-location-section');
            if (mapSection && mapSection.style.display !== 'none') {
                const activeService = data.Services.find(s => s.ServiceNo === activeMapServiceNo);
                if (activeService) {
                    const freshLocations = [];
                    if (activeService.NextBus && activeService.NextBus.Latitude !== "0.0" && activeService.NextBus.Longitude !== "0.0") {
                        freshLocations.push({
                            lat: parseFloat(activeService.NextBus.Latitude),
                            lng: parseFloat(activeService.NextBus.Longitude),
                            estimatedArrival: activeService.NextBus.EstimatedArrival || null,
                            busLabel: 'Next Bus'
                        });
                    }
                    if (activeService.NextBus2 && activeService.NextBus2.Latitude !== "0.0" && activeService.NextBus2.Longitude !== "0.0") {
                        freshLocations.push({
                            lat: parseFloat(activeService.NextBus2.Latitude),
                            lng: parseFloat(activeService.NextBus2.Longitude),
                            estimatedArrival: activeService.NextBus2.EstimatedArrival || null,
                            busLabel: 'Subsequent Bus'
                        });
                    }

                    const refreshNow = new Date();
                    const savedFormat = localStorage.getItem('timeFormat') || '12-hour';

                    freshLocations.forEach((loc, index) => {
                        const entry = busMarkers[index];
                        if (!entry) return;

                        // Move marker if coordinates changed
                        if (entry.lat !== loc.lat || entry.lng !== loc.lng) {
                            entry.marker.setLatLng([loc.lat, loc.lng]);
                            entry.lat = loc.lat;
                            entry.lng = loc.lng;
                        }

                        // Always refresh popup content with latest timing
                        let timingHTML = '';
                        if (loc.estimatedArrival) {
                            const arrivalTime = new Date(loc.estimatedArrival);
                            const timeDifference = arrivalTime - refreshNow;
                            const minutes = Math.max(0, Math.floor(timeDifference / (1000 * 60)));
                            const minText = minutes === 1 ? 'min' : 'mins';
                            if (savedFormat === 'mins') {
                                timingHTML = minutes <= 0 ? '<b style="color: #7db603;">Arr</b>' : `<b>${minutes} ${minText}</b>`;
                            } else {
                                const timeStr = arrivalTime.toLocaleTimeString('en-US', {
                                    hour: '2-digit', minute: '2-digit', hour12: savedFormat !== '24-hour'
                                });
                                timingHTML = `<small style="color: #666;">Arrives at:</small><br><b>${timeStr}</b>`;
                            }
                        }
                        entry.marker.setPopupContent(`
                            <b>${activeMapServiceNo}</b><br>
                            <small style="color: #888;">${loc.busLabel}</small><br>
                            ${timingHTML || '<small style="color: #999;">Timing unavailable</small>'}
                        `);
                        entry.estimatedArrival = loc.estimatedArrival;
                    });
                }
            }
        }

    } catch (error) {
        // Silently ignore aborted requests (superseded by a newer fetch)
        if (error.name === 'AbortError') return;

        console.error('Error fetching bus arrivals:', error);
        const container = document.getElementById('bus-arrivals-container');

        // If it's a connection error, show refreshing message with spinner
        if (error instanceof TypeError && error.message.includes('fetch')) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body" style="text-align: center; padding-top: 0rem; padding-bottom: 0rem; display: flex; align-items: center; justify-content: center; gap: 1em;">
                            <svg class="spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="status">
                                                    <circle cx="50" cy="50" r="45">
                        <animateTransform attributeName="transform" type="rotate" values="-90;810" keyTimes="0;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dashoffset" values="0%;0%;-157.080%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dasharray" values="0% 314.159%;157.080% 157.080%;0% 314.159%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                            </svg>
                            <p class="card-text" style="margin: 0;">Network Lost. Retrying...</p>
                        </div>
                    </div>
                </div>`;
            return;
        }

        // Determine error message based on error type
        let errorMessage = 'Error loading data. Try Refreshing.';
        let errorDetails = '';

        if (error.message === 'Failed to fetch bus arrivals') {
            errorMessage = 'Server error. Try again later.';
            errorDetails = 'The server is temporarily unavailable. Please try again in a moment.';
        } else if (error.message.includes('JSON')) {
            errorMessage = 'Data error. Try Refreshing.';
            errorDetails = 'The server sent invalid data. Please refresh the page.';
        }

        container.innerHTML = `
            <div class="col-12">
                <div class="card">
                    <div class="card-header">Error</div>
                    <div class="card-body">
                        <p class="card-text">${errorMessage}</p>
                        ${errorDetails ? `<p class="card-text" style="font-size: 0.9em; color: #666;">${errorDetails}</p>` : ''}
                    </div>
                </div>
            </div>`;
    }
}

// Function to get load and fleet icons as FontAwesome HTML
function getLoadIcon(load, type) {
    // Get fleet type icon
    let fleetIcon = '';
    if (type) {
        switch (type.toUpperCase()) {
            case 'SD':
            case 'SINGLE DECK':
                fleetIcon = '<i class="fa-kit fa-lta-bus" title="Single Deck"></i>';
                break;
            case 'DD':
            case 'DOUBLE DECK':
                fleetIcon = '<i class="fa-kit fa-lta-dd" title="Double Deck"></i>';
                break;
            case 'BD':
            case 'BENDY':
            case 'BENDY BUS':
                fleetIcon = '<i class="fa-kit fa-lta-bb" title="Bendy Bus"></i>';
                break;
            default:
                fleetIcon = '';
        }
    }

    // Determine load class for coloring
    let loadClass = '';
    if (load) {
        loadClass = load.toLowerCase();
    }

    // Return only the fleet icon with load class
    return fleetIcon ? `<span class="load-indicator ${loadClass}">${fleetIcon}</span>` : '';
}

// Function to format ISO string to hh:mm or show "Arrive" or greyed-out time
function formatArrivalTimeOrArr(isoString, now, isIncomingBus = false) {
    const arrivalTime = new Date(isoString);

    const timeDifference = arrivalTime - now;

    if (timeDifference === 0) {
        // Show "Arr" if the time difference is exactly 0
        return `<span class="arrival-now">Arr</span>`;
    } else if (timeDifference < 0) {
        // Continue showing "Arr" if the time difference is -1 or more
        return `<span class="arrival-now">Arr</span>`;
    }

    // Get the saved time format from localStorage
    const savedFormat = localStorage.getItem('timeFormat') || '12-hour';

    if (savedFormat === 'mins') {
        // Calculate the time difference in minutes (floor to match transit display conventions)
        const minutes = Math.floor(timeDifference / (1000 * 60));
        if (minutes <= 0) {
            return `<span class="arrival-now">Arr</span>`;
        }
        const minText = minutes === 1 ? 'min' : 'mins';
        return `${minutes}<span class="mins"> ${minText}</span>`;
    }

    // Format the time based on the saved format
    const options = savedFormat === '24-hour' ?
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        } :
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };

    const timeString = arrivalTime.toLocaleTimeString('en-US', options);

    // For 12-hour format, make AM/PM smaller
    if (savedFormat === '12-hour') {
        const parts = timeString.split(' ');
        if (parts.length === 2) {
            // For incoming buses, use original style (0.5em, no position adjustment)
            if (isIncomingBus) {
                return `${parts[0]}<span style="font-size: 0.5em; margin-left: 2px;">${parts[1]}</span>`;
            } else {
                // For bus-time spans, use enhanced style with bottom alignment
                const smallerAMPM = `<span style="font-size: 0.5em; margin-left: 1.5px; position: relative; display: inline-block;">${parts[1]}</span>`;
                return `${parts[0]}${smallerAMPM}`;
            }
        }
    }

    return timeString;
}


// ****************************
// :: Clear Search Button
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const searchBusStopButton = document.getElementById('search-bus-stop-button'); // Select the "Search Bus Stop" button
    const searchInput = document.getElementById('bus-stop-search'); // Select the search input field

    if (searchBusStopButton && searchInput) {
        searchBusStopButton.addEventListener('click', () => {
            searchInput.value = ''; // Clear the search input field
            sessionStorage.removeItem('busStopSearch'); // Clear the session storage value
        });
    }
});


// ****************************
// :: Bus Location Map
// ****************************
// Initialize the map with error handling
let map;
try {
    const mapContainer = document.getElementById('bus-map');
    if (mapContainer) {
        map = L.map('bus-map').setView([1.3521, 103.8198], 12); // Default view (Singapore)

        // Add a tile layer (OneMap - Singapore)
        L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
            detectRetina: true,
            maxZoom: 19,
            minZoom: 11,
            attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
        }).addTo(map);
    }
} catch (error) {
    console.error('Error initializing map:', error);
}

// Add bus marker to the map
function addBusMarker(lat, lng, serviceNo, type, load) {
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`
        <b>Bus ${serviceNo}</b><br>
        Type: ${type || 'N/A'}<br>
        Load: ${load || 'N/A'}
    `);
}

// Add "Re-center" button functionality
const recenterMapBtn = document.getElementById('recenter-map-btn');
if (recenterMapBtn) {
    recenterMapBtn.addEventListener('click', () => {
        if (!map) return;
        const bounds = [];
        busMarkers.forEach(({ lat, lng }) => bounds.push([lat, lng]));
        if (currentLocationMarker) {
            const ll = currentLocationMarker.getLatLng();
            bounds.push([ll.lat, ll.lng]);
        }
        if (bounds.length > 0) {
            map.fitBounds(L.latLngBounds(bounds.map(b => L.latLng(b[0], b[1]))), {
                padding: [50, 50],
                maxZoom: 16,
                animate: true
            });
        }
    });
}

// Add "Current Location" button functionality
const currentLocationBtn = document.getElementById('current-location-btn');
if (currentLocationBtn) {
    currentLocationBtn.addEventListener('click', () => {
        map.locate({
            setView: true,
            maxZoom: 15
        });

        map.on('locationfound', (e) => {
            const radius = e.accuracy;

            // Remove existing location marker if it exists
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
                currentLocationMarker = null;
            }

            // Create FontAwesome location marker with red styling
            const locationIcon = L.divIcon({
                html: `<div style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background-color: #ff4444; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;">
                    <i class="fa-kit fa-lta-location" style="color: #fff; font-size: 18px;"></i>
                </div>`,
                iconSize: [40, 40],
                className: 'location-marker'
            });

            // Add a marker for the current location
            currentLocationMarker = L.marker(e.latlng, {
                icon: locationIcon
            }).addTo(map)
                .bindPopup(`You are within ${Math.round(radius)} meters from this point.`)
                .openPopup();

            // Remove existing accuracy circle if it exists
            if (currentLocationCircle) {
                map.removeLayer(currentLocationCircle);
                currentLocationCircle = null;
            }

            // Add a circle to show the accuracy radius
            currentLocationCircle = L.circle(e.latlng, radius).addTo(map);
        });

        map.on('locationerror', () => {
            alert('Unable to retrieve your location. Please ensure location services are enabled.');
        });
    });
}


// Fetch bus locations and plot them on the map
async function fetchBusLocations() {
    try {
        if (!map) {
            console.warn('Map not initialized');
            return;
        }

        const searchInput = document.getElementById('bus-stop-search').value.trim();
        const mapSection = document.querySelector('.bus-location-section'); // Map section container

        if (!searchInput) {
            console.warn('No Bus Stop Code provided.');
            if (mapSection) {
                mapSection.style.display = 'none'; // Hide the map if no input is provided
            }
            return;
        }

        const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
        url.searchParams.append('BusStopCode', searchInput);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch bus locations');
        }

        const data = await response.json();

        // Clear existing markers
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        let hasValidLocation = false; // Flag to check if any valid location exists

        // Plot each bus location from NextBus and NextBus2
        data.Services.forEach((service) => {
            const {
                ServiceNo,
                NextBus,
                NextBus2
            } = service;

            // Check NextBus location
            if (NextBus && NextBus.Latitude !== "0.0" && NextBus.Longitude !== "0.0") {
                addBusMarker(
                    parseFloat(NextBus.Latitude),
                    parseFloat(NextBus.Longitude),
                    ServiceNo,
                    NextBus.Type,
                    NextBus.Load
                );
                hasValidLocation = true; // Set flag to true if a valid location is found
            }

            // Check NextBus2 location
            if (NextBus2 && NextBus2.Latitude !== "0.0" && NextBus2.Longitude !== "0.0") {
                addBusMarker(
                    parseFloat(NextBus2.Latitude),
                    parseFloat(NextBus2.Longitude),
                    ServiceNo,
                    NextBus2.Type,
                    NextBus2.Load
                );
                hasValidLocation = true; // Set flag to true if a valid location is found
            }
        });

        console.log('Has valid location:', hasValidLocation); // Debugging

        // Force hide the map if no valid locations exist
        if (!hasValidLocation) {
            if (mapSection) {
                mapSection.style.display = 'none'; // Hide the map section
            }
            console.warn('No valid bus locations available.');
            alert('No bus locations available for this stop.');
        } else {
            // Adjust map bounds to fit all markers
            const bounds = [];
            data.Services.forEach((service) => {
                const {
                    NextBus,
                    NextBus2
                } = service;
                if (NextBus && NextBus.Latitude !== "0.0" && NextBus.Longitude !== "0.0") {
                    bounds.push([parseFloat(NextBus.Latitude), parseFloat(NextBus.Longitude)]);
                }
                if (NextBus2 && NextBus2.Latitude !== "0.0" && NextBus2.Longitude !== "0.0") {
                    bounds.push([parseFloat(NextBus2.Latitude), parseFloat(NextBus2.Longitude)]);
                }
            });

            if (bounds.length > 0) {
                map.fitBounds(bounds);
            }

            if (mapSection) {
                mapSection.style.display = 'block'; // Show the map section if valid locations exist
            }
            setTimeout(() => {
                if (map && map.invalidateSize) {
                    map.invalidateSize(); // Fix map rendering issues
                }
            }, 100); // Small delay to ensure the map container is fully visible
        }
    } catch (error) {
        console.error('Error fetching bus locations:', error);
        const mapSection = document.querySelector('.bus-location-section');
        if (mapSection) {
            mapSection.style.display = 'none'; // Hide the map in case of an error
        }
    }
}

// Fetch bus locations every 10 seconds
if (map) {
    fetchBusLocations();
}


// ****************************
// :: Loading Messages Rotation
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const loadingMessages = [
        "Loading Bus Arrival Data...",
        "Fetching All Bus Stop Data...",
        "First time use will take a lot longer...",
        "Once loaded, everything will be cached.",
        "Cached data means faster load times!"
    ];

    const loadingMessageElement = document.getElementById('loading-message');
    let messageIndex = 0;

    // Function to update the loading message
    const updateLoadingMessage = () => {
        loadingMessageElement.innerHTML = `
                <svg class="spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="status" style="margin-right: 1em;">
                    <circle cx="50" cy="50" r="45">
                        <animateTransform attributeName="transform" type="rotate" values="-90;810" keyTimes="0;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dashoffset" values="0%;0%;-157.080%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dasharray" values="0% 314.159%;157.080% 157.080%;0% 314.159%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                </svg>${loadingMessages[messageIndex]}
            `;
        messageIndex = (messageIndex + 1) % loadingMessages.length; // Cycle through messages
    };

    // Show the first message immediately
    updateLoadingMessage();

    // Change the message every 4 seconds
    setInterval(updateLoadingMessage, 4000);
});