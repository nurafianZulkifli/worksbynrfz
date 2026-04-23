// Bus First & Last Timings Page

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

document.addEventListener('DOMContentLoaded', async () => {
    // Clear saved state on fresh load or refresh; only restore on back/forward navigation
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    if (navType !== 'back_forward') {
        sessionStorage.removeItem('flBusScrollPos');
        sessionStorage.removeItem('flBusBusStop');
    }

    let allBusStops = [];
    let filteredStops = [];

    const busStopSearch = document.getElementById('busStopSearch');
    const busStopDropdown = document.getElementById('busStopDropdown');
    const contentSection = document.getElementById('contentSection');
    const servicesContainer = document.getElementById('servicesContainer');
    const clearSearch = document.getElementById('clearSearch');
    const resultsCount = document.getElementById('resultsCount');

    // Load bus stops from localStorage or fetch from API
    async function loadBusStops() {
        try {
            const cached = localStorage.getItem('allBusStops');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    // Handle both array format and API response format { value: [...] }
                    allBusStops = Array.isArray(parsed) ? parsed : (parsed.value || []);
                    if (!Array.isArray(allBusStops)) {
                        allBusStops = [];
                    }
                    console.log('[fl-bus.js] Loaded bus stops from cache:', allBusStops.length);
                } catch (parseError) {
                    console.warn('[fl-bus.js] Failed to parse cached bus stops:', parseError);
                    allBusStops = [];
                }
            } else {
                // Fetch from API if not cached - fetch all using pagination like settings.js does
                console.log('[fl-bus.js] Fetching bus stops from API...');
                let skip = 0;
                let hasMoreData = true;

                while (hasMoreData) {
                    const response = await fetch(`https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=${skip}`);
                    const data = await response.json();
                    
                    if (!data.value || data.value.length === 0) {
                        hasMoreData = false;
                    } else {
                        allBusStops = allBusStops.concat(data.value);
                        skip += 500;
                    }
                }

                console.log('[fl-bus.js] Loaded bus stops from API:', allBusStops.length);
                localStorage.setItem('allBusStops', JSON.stringify(allBusStops));
            }

            populateDropdown(allBusStops);
        } catch (error) {
            console.error('[fl-bus.js] Error loading bus stops:', error);
            busStopDropdown.innerHTML = '<option value="">Error loading bus stops</option>';
        }
    }

    // Populate dropdown with bus stops
    function populateDropdown(stops) {
        busStopDropdown.innerHTML = '<option value="">Select a bus stop...</option>';

        stops.forEach(stop => {
            const option = document.createElement('option');
            option.value = stop.BusStopCode;
            option.textContent = `${stop.BusStopCode} - ${stop.Description}`;
            busStopDropdown.appendChild(option);
        });
    }

    // Search functionality
    busStopSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query === '') {
            filteredStops = allBusStops;
            clearSearch.classList.remove('visible');
        } else {
            filteredStops = allBusStops.filter(stop =>
                stop.BusStopCode.toLowerCase().includes(query) ||
                stop.Description.toLowerCase().includes(query)
            );
            clearSearch.classList.add('visible');
        }

        // Update results count
        if (query !== '') {
            resultsCount.textContent = `${filteredStops.length} result${filteredStops.length !== 1 ? 's' : ''} found`;
        } else {
            resultsCount.textContent = '';
        }

        populateDropdown(filteredStops);
    });

    // Clear search
    clearSearch.addEventListener('click', () => {
        busStopSearch.value = '';
        busStopSearch.dispatchEvent(new Event('input'));
        busStopSearch.focus();
    });

    // Fetch destination codes from live API (like art.js does)
    async function fetchDestinationCodesForStop(busStopCode) {
        try {
            const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
            url.searchParams.append('BusStopCode', busStopCode);
            const response = await fetch(url);
            if (!response.ok) return {};

            const data = await response.json();
            const destinationCodeMap = {}; // Map service number to destination code

            if (data.Services && Array.isArray(data.Services)) {
                data.Services.forEach(service => {
                    if (service.NextBus?.DestinationCode) {
                        destinationCodeMap[service.ServiceNo] = service.NextBus.DestinationCode;
                    }
                });
            }
            return destinationCodeMap;
        } catch (error) {
            console.warn('Error fetching live destination codes:', error);
            return {};
        }
    }

    // Display bus stop data
    async function displayBusStop(busStopCode) {
        if (!busStopCode) {
            contentSection.classList.remove('active');
            return;
        }

        try {
            contentSection.classList.add('active');
            servicesContainer.classList.add('services-grid');
            servicesContainer.innerHTML = `
            <div class="loading-stops">
                <svg class="loading-spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="45">
                        <animateTransform attributeName="transform" type="rotate" values="-90;810" keyTimes="0;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dashoffset" values="0%;0%;-157.080%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="stroke-dasharray" values="0% 314.159%;157.080% 157.080%;0% 314.159%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                </svg>
                <p>Loading bus stops...</p>
            </div>
        `;
            // Fetch first/last bus data from pre-generated JSON file
            // This avoids CORS, API, and backend complexity
            const jsonUrl = 'json/first-last-bus.json';
            console.log('Fetching from JSON file:', jsonUrl);

            const response = await fetch(jsonUrl);
            console.log('Fetch response status:', response.status);

            if (!response.ok) {
                console.error('Response not OK:', response.status, response.statusText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const allStopsData = await response.json();
            console.log('All stops data loaded:', allStopsData.length, 'stops');

            // Find data for the selected bus stop
            const stopData = allStopsData.find(stop => stop.busStopCode === busStopCode);

            if (!stopData) {
                servicesContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1;">No data found for this bus stop. Data may need to be refreshed.</div>`;
                // Restore scroll position after rendering
                restoreScrollPosition();
                return;
            }

            const busServices = stopData.services || [];

            if (busServices.length === 0) {
                servicesContainer.innerHTML = '<div class="no-data" style="grid-column: 1/-1;">No bus services found for this stop.</div>';
                // Restore scroll position after rendering
                restoreScrollPosition();
                return;
            }

            // Find the bus stop details for the title
            const stop = allBusStops.find(s => s.BusStopCode === busStopCode);

            // Update title elements
            try {
                const busStopCodeEl = document.getElementById('busStopCode');
                const busStopDescriptionEl = document.getElementById('busStopDescription');

                console.log('Elements found:', {
                    busStopCodeEl: !!busStopCodeEl,
                    busStopDescriptionEl: !!busStopDescriptionEl
                });

                if (busStopCodeEl) {
                    busStopCodeEl.textContent = busStopCode;
                } else {
                    console.warn('busStopCode element not found');
                }
                if (busStopDescriptionEl) {
                    busStopDescriptionEl.textContent = stop ? stop.Description : '';
                } else {
                    console.warn('busStopDescription element not found');
                }
            } catch (titleError) {
                console.error('Error updating bus stop title elements:', titleError);
                throw titleError;
            }

            // Load destination maps (like in art.js)
            let destinationMap = {};
            let customDestinationMap = {};

            // Load custom destination code mappings from art.js approach
            try {
                const response = await fetch('json/destination-codes.json');
                if (response.ok) {
                    customDestinationMap = await response.json();
                }
            } catch (error) {
                console.warn('Custom destination codes file not found or error loading:', error);
            }

            try {
                const allBusStopsData = JSON.parse(localStorage.getItem('allBusStops')) || [];
                allBusStopsData.forEach((stop) => {
                    destinationMap[stop.BusStopCode] = stop.Description;
                });
            } catch (error) {
                console.error('Error creating destination map:', error);
            }

            // Fetch live destination codes from API (same as art.js)
            const liveDestinationCodes = await fetchDestinationCodesForStop(busStopCode);

            // Display services
            servicesContainer.innerHTML = '';

            busServices.forEach(service => {
                // If service is live, use the live destination code; otherwise use stored data
                if (liveDestinationCodes[service.service]) {
                    service.destinationCode = liveDestinationCodes[service.service];
                }
                const card = createServiceCard(service, destinationMap, customDestinationMap);
                servicesContainer.appendChild(card);
            });

            // Check if there's a service parameter in the URL and highlight it
            const serviceParam = new URLSearchParams(window.location.search).get('service');
            if (serviceParam) {
                setTimeout(() => {
                    const targetCard = document.querySelector(`.service-card[data-service="${serviceParam}"]`);
                    if (targetCard) {
                        targetCard.classList.add('highlighted');
                        // Scroll to the card
                        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 100);
            }

            // Restore scroll position after all content is rendered
            restoreScrollPosition();

        } catch (error) {
            console.error('Error fetching bus timings:', error, error.stack);
            const errorMsg = error.message || 'Unknown error';
            servicesContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1;">Error loading bus timings: ${errorMsg}<br><small style="opacity: 0.7;">Check console for details.</small></div>`;
            // Restore scroll position after error
            restoreScrollPosition();
        }
    }

    // Helper function to restore scroll position
    function restoreScrollPosition() {
        const savedScrollPos = sessionStorage.getItem('flBusScrollPos');
        if (savedScrollPos) {
            setTimeout(() => {
                window.scrollTo(0, parseInt(savedScrollPos));
                sessionStorage.removeItem('flBusScrollPos');
            }, 50);
        }
    }

    // Helper function to capitalize each word
    function capitalizeWords(str) {
        // Ensure str is a string
        if (typeof str !== 'string') {
            return String(str || '');
        }
        const acronyms = ['MRT', 'TBI', 'LRT'];
        let result = str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        acronyms.forEach(acronym => {
            result = result.replace(new RegExp(`\\b${acronym.toLowerCase()}\\b`, 'gi'), acronym);
        });
        return result;
    }

    // Function to get destination name from code or fallback to route name
    function getDestinationName(destinationCode, destinationMap, customDestinationMap) {
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

    // Create service card
    function createServiceCard(service, destinationMap, customDestinationMap) {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.setAttribute('data-service', service.service);

        // Service number header - now a link to bus-service.html
        const header = document.createElement('a');
        header.className = 'service-header';
        header.href = getBasePath() + 'buszy/bus-service.html?service=' + encodeURIComponent(service.service);
        header.style.textDecoration = 'none';
        header.style.color = 'inherit';
        header.style.display = 'block';
        header.style.cursor = 'pointer';
        header.title = 'View service details';
        header.textContent = service.service || 'Unknown Service';
        // Save scroll position and bus stop when clicking to navigate away
        header.addEventListener('click', () => {
            sessionStorage.setItem('flBusScrollPos', window.scrollY || document.documentElement.scrollTop);
            sessionStorage.setItem('flBusBusStop', busStopDropdown.value);
        });
        card.appendChild(header);

        // Route name with "To" prefix - using destination code mapping from art.js
        const routeName = document.createElement('div');
        routeName.className = 'service-route';
        const destination = service.destinationCode || service.routeName;
        const destinationName = getDestinationName(destination, destinationMap, customDestinationMap);
        routeName.innerHTML = destinationName ? `<i class="fa-kit fa-lta-to-right"></i>&nbsp;${capitalizeWords(destinationName)}` : '';
        card.appendChild(routeName);

        // Timings
        const timings = service.timings || {};
        // console.log('Service timings:', timings);

        const dayTypes = [{
                key: 'Weekdays',
                label: 'Weekdays',
                data: timings.Weekdays
            },
            {
                key: 'Saturdays',
                label: 'Saturdays',
                data: timings.Saturdays
            },
            {
                key: 'Sundays & Public Holidays',
                label: 'Sun & Public Holidays',
                data: timings['Sundays & Public Holidays']
            }
        ];

        dayTypes.forEach(day => {
            if (day.data && (day.data.firstBus || day.data.lastBus)) {
                const row = document.createElement('div');
                row.className = 'time-row';

                const dayLabel = document.createElement('div');
                dayLabel.className = 'day-label';
                dayLabel.textContent = day.label;

                const firstBusEl = document.createElement('div');
                firstBusEl.className = 'time-value first-bus';
                firstBusEl.textContent = day.data.firstBus || '--';

                const lastBusEl = document.createElement('div');
                lastBusEl.className = 'time-value last-bus';
                lastBusEl.textContent = day.data.lastBus || '--';

                row.appendChild(dayLabel);
                row.appendChild(firstBusEl);
                row.appendChild(lastBusEl);
                card.appendChild(row);
            }
        });

        return card;
    }

    // Dropdown change event
    busStopDropdown.addEventListener('change', (e) => {
        console.log('Bus stop selected:', e.target.value);
        displayBusStop(e.target.value);
    });

    // Initialize on page load
    console.log('Initializing First & Last Bus page...');
    await loadBusStops();

    // Check for URL parameter and auto-select bus stop
    const urlParams = new URLSearchParams(window.location.search);
    const busStopCodeParam = urlParams.get('BusStopCode');
    if (busStopCodeParam && busStopCodeParam.trim() !== '') {
        busStopDropdown.value = busStopCodeParam;
        busStopSearch.value = busStopCodeParam;
        clearSearch.classList.add('visible');
        displayBusStop(busStopCodeParam);
    } else if (navType === 'back_forward') {
        // Restore bus stop and selection if returning via back button
        const savedBusStop = sessionStorage.getItem('flBusBusStop');
        if (savedBusStop) {
            busStopDropdown.value = savedBusStop;
            busStopSearch.value = savedBusStop;
            clearSearch.classList.add('visible');
            displayBusStop(savedBusStop);
        }
    }
});