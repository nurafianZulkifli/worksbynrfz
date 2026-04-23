/**
 * Bus Service Page
 * Loads service info from JSON and bus stops from API endpoints
 */

// Get service number from URL parameters or use default
function getServiceNumberFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('service') || '3'; // Default to service 3 if not specified
}

// Get highlight stop code from URL parameters if available
function getHighlightStopFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('highlightStop') || null;
}

// Store highlight stop code for use in bus stops display
const highlightStop = getHighlightStopFromURL();

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

// Open route information in new tabs (LTG and SimplyGo)
function openRouteInfo(serviceNumber) {
    // Format service number to remove leading zeros if needed for LTG URL
    const serviceNum = String(serviceNumber).replace(/^0+/, '') || serviceNumber;
    
    // URLs for LTG and SimplyGo
    const ltgUrl = `https://landtransportguru.net/bus${serviceNum}/`;
    const simplyGoUrl = `https://svc.simplygo.com.sg/eservice/eguide/service_route.php?service=${serviceNum}`;
    
    // Open both URLs in new windows/tabs
    const ltgTab = window.open(ltgUrl, '_blank');
    const simplyGoTab = window.open(simplyGoUrl, '_blank');
    
    console.log('LTG URL:', ltgUrl, 'opened:', !!ltgTab);
    console.log('SimplyGo URL:', simplyGoUrl, 'opened:', !!simplyGoTab);
}

// Attach button click handler to open route info
function attachRouteInfoButton(serviceNumber) {
    const button = document.getElementById('open-route-info-btn');
    if (button) {
        button.onclick = function() {
            openRouteInfo(serviceNumber);
        };
    }
}

// Load bus service data from API with local JSON fallback
async function loadBusServiceData() {
    const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

    try {
        // First, load local JSON
        const localData = await loadLocalBusServiceData();
        if (!localData) return null;

        console.log('Local data loaded with', localData.length, 'services');

        // Try to fetch operator data from API
        try {
            console.log('Fetching operator data from API:', `${API_BASE}/bus-services`);
            const apiResponse = await fetch(`${API_BASE}/bus-services`);
            console.log('API response status:', apiResponse.status, apiResponse.ok);

            if (apiResponse.ok) {
                const apiData = await apiResponse.json();
                console.log('API response received:', apiData);

                // API response has data in the 'value' property
                const apiArray = apiData.value || (Array.isArray(apiData) ? apiData : (apiData.bus_services || apiData.services || apiData.data || []));
                console.log('API array extracted:', apiArray);
                console.log('API array length:', apiArray.length);

                if (Array.isArray(apiArray) && apiArray.length > 0) {
                    // Merge API operator data with local data
                    const operatorMap = {};
                    apiArray.forEach(service => {
                        const serviceNo = service.ServiceNo || service.n;
                        const operator = service.Operator || service.op;
                        console.log('API Service:', serviceNo, '-> Operator:', operator);
                        operatorMap[serviceNo] = operator;
                    });

                    console.log('Built operator map:', operatorMap);

                    // Update local data with API operators
                    let updateCount = 0;
                    localData.forEach(service => {
                        const oldOp = service.op;
                        if (operatorMap[service.n]) {
                            service.op = operatorMap[service.n];
                            updateCount++;
                            console.log('Updated service', service.n, ': "' + oldOp + '" -> "' + service.op + '"');
                        } else {
                            console.log('No operator found for service', service.n);
                        }
                    });

                    console.log('Updated', updateCount, 'services with API operators');
                } else {
                    console.warn('API array is empty or not an array');
                }
            } else {
                console.warn('API response not OK:', apiResponse.status, apiResponse.statusText);
            }
        } catch (apiError) {
            console.warn('API fetch failed - using local data only:', apiError);
        }

        console.log('Final data being returned:', localData);
        return localData;
    } catch (error) {
        console.error('Error loading bus service data:', error);
        showErrorMessage('Failed to load bus service data. Please refresh the page.');
        return null;
    }
}

// Load bus service data from local JSON
async function loadLocalBusServiceData() {
    try {
        const basePath = getBasePath();
        const jsonPath = basePath + 'buszy/json/bus-service-data.json';
        console.log('Loading bus services from local JSON:', jsonPath);
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`);
        }
        const jsonData = await response.json();
        console.log('Successfully loaded', jsonData.length, 'services from local JSON');
        console.log('Local JSON data:', jsonData);
        return jsonData;
    } catch (error) {
        console.error('Error loading local bus service data:', error);
        return null;
    }
}

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

// Fetch enriched stop details from API for given stop codes
// Cache for bus stop details to avoid repeated API calls
const stopCache = new Map();

async function fetchEnrichedStopsFromAPI(serviceNumber, stopCodes) {
    try {
        const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

        console.log(`Fetching details for ${stopCodes.length} stops for service ${serviceNumber}`);

        const enrichedStops = [];
        const uncachedStops = [];
        const uncachedIndices = [];

        // First, get cached stops
        for (let i = 0; i < stopCodes.length; i++) {
            const stopCode = stopCodes[i];
            if (stopCache.has(stopCode)) {
                enrichedStops[i] = stopCache.get(stopCode);
            } else {
                uncachedStops.push(stopCode);
                uncachedIndices.push(i);
            }
        }

        // Fetch uncached stops in parallel batches (5 at a time) to avoid overwhelming the API
        const batchSize = 5;
        for (let i = 0; i < uncachedStops.length; i += batchSize) {
            const batch = uncachedStops.slice(i, i + batchSize);
            const batchIndices = uncachedIndices.slice(i, i + batchSize);

            const batchPromises = batch.map(stopCode =>
                fetch(`${API_BASE}/bus-stop-det?BusStopCode=${stopCode}`)
                .then(response => {
                    if (response.ok) return response.json();
                    throw new Error(`HTTP ${response.status}`);
                })
                .then(stopData => [
                    stopCode,
                    stopData.Description || stopCode,
                    stopData.RoadName || ''
                ])
                .catch(async (error) => {
                    console.warn(`Failed to fetch stop ${stopCode}:`, error);
                    // Check if stop exists in destination-codes.json
                    const destinationCodes = await loadDestinationCodes();
                    if (destinationCodes[stopCode]) {
                        const destCode = destinationCodes[stopCode];
                        const description = typeof destCode === 'string' ? destCode : destCode.description;
                        const road = typeof destCode === 'string' ? '' : (destCode.road || '');
                        console.log(`Using destination code for ${stopCode}: ${description}`);
                        return [stopCode, description, road];
                    }
                    return [stopCode, stopCode, ''];
                })
            );

            const results = await Promise.all(batchPromises);

            // Store results in the correct positions and cache
            results.forEach((result, idx) => {
                const originalIndex = batchIndices[idx];
                enrichedStops[originalIndex] = result;
                stopCache.set(result[0], result);
            });
        }

        return enrichedStops;
    } catch (error) {
        console.error('Error fetching enriched stops from API:', error);
        // Fallback: return stop codes only
        return stopCodes.map(code => [code, code, '']);
    }
}

// Display error message
function showErrorMessage(message) {
    const mainContent = document.querySelector('.main-content');
    mainContent.innerHTML = `
        <div class="alert alert-danger" style="margin-top: 2rem;">
            <i class="fa-solid fa-circle-exclamation"></i> ${message}
        </div>
    `;
}

// Get available directions for a service from API or local JSON
async function getServiceDirections(serviceNumber, localService) {
    const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

    try {
        console.log(`Fetching directions for service ${serviceNumber}`);
        const response = await fetch(`${API_BASE}/bus-services?ServiceNo=${serviceNumber}`);

        if (response.ok) {
            const data = await response.json();
            const apiArray = data.value || (Array.isArray(data) ? data : []);

            if (Array.isArray(apiArray) && apiArray.length > 0) {
                // Extract unique directions and their associated info
                const directionsMap = {};
                const directionsOrder = [];

                apiArray.forEach(service => {
                    if (service.ServiceNo === serviceNumber) {
                        const direction = service.Direction || '1';
                        if (!directionsMap[direction]) {
                            directionsMap[direction] = {
                                direction: direction,
                                originCode: service.OriginCode || '',
                                destinationCode: service.DestinationCode || '',
                                originDescription: service.OriginDescription || '',
                                destinationDescription: service.DestinationDescription || ''
                            };
                            directionsOrder.push(direction);
                        }
                    }
                });

                console.log(`Found ${directionsOrder.length} directions for service ${serviceNumber}:`, directionsOrder);

                // Only return if we actually found directions for this service
                if (directionsOrder.length > 0) {
                    return {
                        directions: directionsOrder,
                        directionDetails: directionsMap
                    };
                } else {
                    console.log(`Service ${serviceNumber} not found in API response, falling back to local data`);
                }
            }
        }
    } catch (error) {
        console.warn('Failed to fetch directions from API:', error);
    }

    // Fallback: use local JSON directions field
    if (localService && localService.directions) {
        console.log(`Using local directions for service ${serviceNumber}:`, localService.directions);
        const directionsMap = {};
        // Convert directions to strings to match JSON keys
        const directionsArray = localService.directions.map(d => String(d));
        directionsArray.forEach(dir => {
            directionsMap[dir] = {
                direction: dir
            };
        });
        return {
            directions: directionsArray,
            directionDetails: directionsMap
        };
    }

    return {
        directions: ['1'],
        directionDetails: {
            '1': {}
        }
    };
}

// Get stops for a specific service direction from API
async function getStopsForDirection(serviceNumber, direction) {
    const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

    try {
        console.log(`Fetching stops for service ${serviceNumber}, direction ${direction}`);
        const response = await fetch(`${API_BASE}/bus-services?ServiceNo=${serviceNumber}`);

        if (response.ok) {
            const data = await response.json();
            const apiArray = data.value || (Array.isArray(data) ? data : []);

            // Find the service with matching direction
            const serviceData = apiArray.find(s =>
                s.ServiceNo === serviceNumber && (s.Direction || '1') === direction
            );

            if (serviceData && serviceData.Stops) {
                // Parse stops if it's a JSON string, otherwise use as-is
                let stops = serviceData.Stops;
                if (typeof stops === 'string') {
                    stops = JSON.parse(stops);
                }

                // Convert API stop format to array of stop codes
                const stopCodes = Array.isArray(stops) ?
                    stops.map(s => typeof s === 'string' ? s : s.BusStopCode) : [];

                console.log(`Found ${stopCodes.length} stops for direction ${direction}:`, stopCodes);
                return stopCodes;
            }
        }

        return [];
    } catch (error) {
        console.warn(`Failed to fetch stops for direction ${direction}:`, error);
        return [];
    }
}

// Find which direction contains the highlighted stop
// Returns the direction if found in only one direction, otherwise returns null
async function findDirectionForHighlightedStop(serviceNumber, directions, highlightStop, service) {
    if (!highlightStop) {
        return null;
    }

    console.log(`Searching for highlighted stop ${highlightStop} across ${directions.length} directions`);
    
    const directionsWithStop = [];
    
    // Check each direction for the highlighted stop
    for (const direction of directions) {
        let stopCodes = await getStopsForDirection(serviceNumber, direction);

        // Fallback to local direction_routes if API returned nothing
        if (stopCodes.length === 0 && service) {
            const dirKey = String(direction);
            if (service.direction_routes && service.direction_routes[dirKey]) {
                stopCodes = service.direction_routes[dirKey].st || [];
                console.log(`Using local direction_routes for direction ${direction}, ${stopCodes.length} stops`);
            } else if (service.st) {
                stopCodes = service.st;
            }
        }

        // Compare as strings to avoid type mismatch
        if (stopCodes.map(String).includes(String(highlightStop))) {
            directionsWithStop.push(direction);
            console.log(`Found highlighted stop ${highlightStop} in direction ${direction}`);
        }
    }
    
    // If found in only one direction, return that direction
    if (directionsWithStop.length === 1) {
        console.log(`Highlighted stop ${highlightStop} is only in direction ${directionsWithStop[0]}, will navigate there`);
        return directionsWithStop[0];
    } else if (directionsWithStop.length > 1) {
        console.log(`Highlighted stop ${highlightStop} found in multiple directions:`, directionsWithStop);
        return null; // Multiple directions, use default
    } else {
        console.log(`Highlighted stop ${highlightStop} not found in any direction`);
        return null;
    }
}

// Create and display direction selector
function createDirectionSelector(directions, onDirectionChange, currentDirection = null) {
    const stopsSection = document.querySelector('.stops-section');
    if (!stopsSection) return;

    // Remove existing direction selector if any
    const existingSelector = document.querySelector('.direction-selector-container');
    if (existingSelector) {
        existingSelector.remove();
    }

    if (directions.length <= 1) {
        console.log('Only one direction or no direction info, skipping selector');
        return;
    }

    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'direction-selector-container';
    selectorContainer.style.cssText = `
        display: flex;
        gap: 10px;
        margin-bottom: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    `;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 1.5rem;
    `;

    directions.forEach((direction, index) => {
        const button = document.createElement('button');
        button.className = 'direction-button';
        button.textContent = `Direction ${direction}`;
        button.setAttribute('data-direction', direction);
        
        // Determine if this button should be active
        const isActive = currentDirection ? direction === currentDirection : index === 0;
        
        button.style.cssText = `
            padding: 8px 12px;
            border: 2px solid #7bad02;
            background-color: ${isActive ? '#7bad02' : 'transparent'};
            color: ${isActive ? '#000' : '#fff'};
            border-radius: 24px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        `;

        button.addEventListener('mouseover', function () {
            if (!this.classList.contains('active')) {
                this.style.backgroundColor = 'rgba(123, 173, 2, 0.1)';
            }
        });

        button.addEventListener('mouseout', function () {
            if (!this.classList.contains('active')) {
                this.style.backgroundColor = 'transparent';
            }
        });

        if (isActive) {
            button.classList.add('active');
        }

        button.addEventListener('click', async () => {
            // Update button states
            document.querySelectorAll('.direction-button').forEach(btn => {
                btn.classList.remove('active');
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '#7bad02';
            });

            button.classList.add('active');
            button.style.backgroundColor = '#7bad02';
            button.style.color = '#000';

            // Trigger direction change
            onDirectionChange(direction);
        });

        buttonGroup.appendChild(button);
    });

    selectorContainer.appendChild(buttonGroup);

    // Insert before the stops-container
    const stopsContainer = document.getElementById('stops-container');
    stopsContainer.parentNode.insertBefore(selectorContainer, stopsContainer);
}

// Populate page with service data (compact format)
// Version: Service 67 debug fix v3
async function populateServiceData(serviceNumber, service) {
    if (!service) {
        showErrorMessage('Service information not found. Please check the service number.');
        return;
    }

    // Update page title
    document.title = `Service ${service.n} | Buszy`;

    // Service header
    document.getElementById('service-number').textContent = service.n;
    document.getElementById('service-title').textContent = service.op ? `${service.op} ${service.t} Service ${service.n}` : `Service ${service.n}`;
    
    // Attach the route info button handler
    attachRouteInfoButton(service.n);

    // Route terminals
    document.getElementById('terminal-start').textContent = service.ts;
    document.getElementById('terminal-end').textContent = service.te;

    // Set looping point if available
    if (service.lp) {
        document.getElementById('terminal-loop').textContent = service.lp;
    } else {
        // If no looping point, hide the loop section and the first arrow before it
        const loopElement = document.querySelector('.loop');
        const arrows = document.querySelectorAll('.route-arrow');
        if (loopElement) loopElement.style.display = 'none';
        if (arrows.length > 0) {
            arrows[0].style.display = 'none'; // Hide first arrow (before loop)
        }
    }

    // Fetch directions from API
    const {
        directions,
        directionDetails
    } = await getServiceDirections(serviceNumber, service);
    let currentDirection = String(directions[0]); // Ensure direction is a string
    let lastActiveDirection = String(directions[0]); // Track the last active direction for search restore

    // Check if highlighted stop is only in one direction and auto-navigate to it
    if (highlightStop && directions.length > 1) {
        const targetDirection = await findDirectionForHighlightedStop(serviceNumber, directions, highlightStop, service);
        if (targetDirection) {
            currentDirection = String(targetDirection);
            console.log(`Auto-navigating to direction ${currentDirection} for highlighted stop ${highlightStop}`);
        }
    }

    console.log('Service object:', service);
    console.log('Has freq_detail?', !!service.freq_detail);
    console.log('Has direction_freqs?', !!service.direction_freqs);
    console.log('currentDirection:', currentDirection, 'type:', typeof currentDirection);
    if (service.direction_freqs) {
        console.log('direction_freqs[currentDirection]:', service.direction_freqs[currentDirection]);
        console.log('All direction_freqs keys:', Object.keys(service.direction_freqs));
    }

    // Display frequency with direction info for the current direction
    // (Frequency cards have been removed from the page)

    // Function to update stops and terminals for selected direction
    const updateStopsForDirection = async (direction) => {
        // Ensure direction is a string to match JSON keys
        direction = String(direction);
        currentDirection = direction;
        lastActiveDirection = direction; // Track this as the last active direction for search restore

        const stopsContainer = document.getElementById('stops-container');
        stopsContainer.innerHTML = `
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

        // Update terminals if direction_routes exist
        if (service.direction_routes && service.direction_routes[direction]) {
            const dirRoute = service.direction_routes[direction];
            document.getElementById('terminal-start').textContent = dirRoute.ts;
            document.getElementById('terminal-end').textContent = dirRoute.te;
            console.log(`Direction ${direction}: ${dirRoute.ts} → ${dirRoute.te}`);
        }

        // Update frequency display with direction info
        // (Frequency cards have been removed from the page)

        // Try to fetch stops from API first
        let stopCodes = await getStopsForDirection(serviceNumber, direction);

        // If no stops from API, fall back to local JSON direction_routes or default
        if (stopCodes.length === 0) {
            if (service.direction_routes && service.direction_routes[direction]) {
                stopCodes = service.direction_routes[direction].st || [];
                console.log('Using stops from direction_routes for direction:', direction);
            } else {
                console.log('No stops found from API, using local JSON');
                stopCodes = service.st || [];
            }
        }

        // Fetch and enrich bus stops from API
        if (stopCodes.length > 0) {
            const enrichedStops = await fetchEnrichedStopsFromAPI(serviceNumber, stopCodes);
            populateBusStops(enrichedStops, highlightStop);
        }
    };

    // Create direction selector if multiple directions exist
    if (directions.length > 1) {
        createDirectionSelector(directions, updateStopsForDirection, currentDirection);

        // Use a small timeout to ensure the DOM is ready, then click the target direction button
        setTimeout(() => {
            const targetButton = document.querySelector(`[data-direction="${currentDirection}"]`);
            if (targetButton) {
                console.log(`Auto-clicking button for direction ${currentDirection}`);
                targetButton.click();
            } else {
                console.warn(`Could not find button for direction ${currentDirection}`);
                // Fallback: load stops directly if button not found
                updateStopsForDirection(currentDirection);
            }
        }, 0);

        // Add arrow click handler to reverse/cycle direction
        const routeArrows = document.querySelectorAll('.route-arrow');
        routeArrows.forEach(arrow => {
            arrow.style.cursor = 'pointer';
            arrow.addEventListener('click', async () => {
                // Find current direction index
                const currentIndex = directions.indexOf(currentDirection);
                // Move to next direction, or back to first if at end
                const nextIndex = (currentIndex + 1) % directions.length;
                const nextDirection = directions[nextIndex];

                console.log(`Arrow clicked: switching from direction ${currentDirection} to ${nextDirection}`);

                // Update direction buttons if they exist
                const directionButtons = document.querySelectorAll('.direction-button');
                directionButtons.forEach(btn => {
                    if (btn.getAttribute('data-direction') === nextDirection) {
                        btn.click();
                    }
                });

                // If no buttons exist, update direction directly
                if (directionButtons.length === 0) {
                    await updateStopsForDirection(nextDirection);
                }
            });
        });
    } else {
        // If only one direction, load stops directly
        await updateStopsForDirection(currentDirection);
    }

    // Remarks section
    if (service.r) {
        document.getElementById('remarks-section').style.display = 'block';
        document.getElementById('remarks-content').innerHTML = `<p>${service.r}</p>`;
    }

    // Short Bus Service section (if applicable)
    if (service.sb && service.sb.length > 0) {
        document.getElementById('short-bus-section').style.display = 'block';
        const heading = service.phv ? 'Peak Hour Variant' : 'Short Bus Service';
        document.querySelector('.short-bus-service h2').innerHTML = `<i class="fa-kit fa-lta-bus"></i> ${heading}`;
        populateShortBusService(service.sb);
    }

    // Parent Bus Service section (if applicable)
    if (service.pb && service.pb.length > 0) {
        document.getElementById('parent-bus-section').style.display = 'block';
        populateParentBusService(service.pb);
    }

    // Express Variant section (if applicable)
    if (service.ev && service.ev.length > 0) {
        document.getElementById('express-variant-section').style.display = 'block';
        populateExpressVariant(service.ev);
    }

    // Route Variant section (if applicable)
    if (service.rv && service.rv.length > 0) {
        document.getElementById('route-variant-section').style.display = 'block';
        populateRouteVariant(service.rv);
    }
}

// Display frequency details by time period (collapsible)
function displayFrequencyDetails(freqDetail, service, currentDirection) {
    // Ensure direction is a string to match JSON keys
    currentDirection = String(currentDirection);
    const frequencyElement = document.getElementById('frequency');

    // Use direction-specific frequencies if available, otherwise use general freq_detail
    if (service && service.direction_freqs && service.direction_freqs[currentDirection]) {
        freqDetail = service.direction_freqs[currentDirection];
        console.log(`Using direction-specific frequencies for direction ${currentDirection}`);
    }

    // Check if structure is nested (with day types) or flat (legacy)
    // A structure is nested if any value is an object (not a string/number)
    const isNested = Object.values(freqDetail).some(val => typeof val === 'object' && val !== null);

    // Detect if this is a departure times format (contains non-frequency values like location names)
    let isDepartureTimes = false;
    if (isNested) {
        // Check nested structure for location names
        for (const dayType in freqDetail) {
            const dayValues = Object.values(freqDetail[dayType]);
            isDepartureTimes = dayValues.some(val => {
                val = String(val);
                const isFrequency = /\d+$/.test(val) || /\d+-\d+/.test(val);
                return !isFrequency;
            });
            if (isDepartureTimes) break;
        }
    } else {
        // Check flat structure for location names
        const values = Object.values(freqDetail);
        isDepartureTimes = values.some(val => {
            val = String(val);
            const isFrequency = /\d+$/.test(val) || val.includes('mins') || /\d+-\d+/.test(val);
            return !isFrequency;
        });
    }

    // Get direction-specific from/to information
    let directionInfo = '';
    if (service && service.direction_routes && service.direction_routes[currentDirection]) {
        const route = service.direction_routes[currentDirection];
        directionInfo = ` (From ${route.ts} to ${route.te})`;
    }

    const summaryText = isDepartureTimes ? 'Departure Times' : 'Vary by time';

    let html = `
        <div class="frequency-collapsible">
            <div class="frequency-header" onclick="toggleFrequencyDetails(event)">
                <span class="frequency-summary">
                    <i class="fa-regular fa-circle-info" style="margin-right: 0.5rem;"></i>
                    ${summaryText}
                </span>
                <i class="fa-regular fa-chevron-down"></i>
            </div>
            <div class="frequency-details" style="display: none;">
    `;

    if (isNested) {
        // Handle nested structure with day types
        const dayLabels = {
            'weekdays': 'Weekdays',
            'saturdays': 'Sat',
            'sundays_holidays': 'Sun/PH',
            'weekends/PH': 'Weekends/PH'
        };

        for (const [dayType, times] of Object.entries(freqDetail)) {
            // Check if this is a standard day type or a custom one (e.g., "weekdays (TP School Term)")
            const isStandardDayType = ['weekdays', 'saturdays', 'sundays_holidays', 'weekends/PH'].includes(dayType);
            const dayLabel = dayLabels[dayType] || dayType; // Use custom label if not standard

            html += `<div class="frequency-day-group">
                    <div class="day-label">${dayLabel}</div>`;

            for (const [timeRange, frequency] of Object.entries(times)) {
                // Ensure frequency is a string for regex testing
                let freqStr = String(frequency);
                // Check if frequency is a number (actual frequency) or a location name
                const isFrequency = /\d+$/.test(freqStr) || /\d+-\d+/.test(freqStr);
                const displayValue = isFrequency ? `${freqStr} mins` : freqStr;
                html += `
                        <div class="frequency-item">
                            <span class="time-range">${timeRange}</span>
                            <span class="freq-value">${displayValue}</span>
                        </div>
                    `;
            }
            html += '</div>';
        }
    } else {
        // Handle flat structure (legacy or special cases like departure times)
        for (const [timeRange, value] of Object.entries(freqDetail)) {
            // Check if value is a frequency (ends with or contains only digits/ranges) or a location name
            const isFrequency = /\d+$/.test(value) || /\d+-\d+/.test(value);
            const displayValue = isFrequency ? `${value} mins` : value;

            html += `
                <div class="frequency-item">
                    <span class="time-range">${timeRange}</span>
                    <span class="freq-value">${displayValue}</span>
                </div>
            `;
        }
    }

    html += '</div></div>';
    frequencyElement.innerHTML = html;

    // Update the main card title based on whether this is departure times
    const frequencyCardTitle = document.getElementById('frequency-title');
    if (frequencyCardTitle) {
        frequencyCardTitle.textContent = isDepartureTimes ? 'Departure Times' : 'Frequency';
    }

    // Update the h3 header in the port-summary card
    const portSummaryCard = frequencyElement.closest('.port-summary');
    if (portSummaryCard) {
        const h3 = portSummaryCard.querySelector('h3');
        if (h3) {
            h3.textContent = isDepartureTimes ? 'Departure Times' : 'Frequency';
        }
    }
}

// Toggle frequency details visibility
function toggleFrequencyDetails(event) {
    const header = event.currentTarget;
    const details = header.nextElementSibling;
    const icon = header.querySelector('i');

    if (details.style.display === 'none') {
        details.style.display = 'flex';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        details.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}

// Store all stops for search filtering
let allEnrichedStops = [];
let currentHighlightStopForSearch = null;

// Render a (possibly filtered) set of stops into the stops container
function renderFilteredStops(stops) {
    const container = document.getElementById('stops-container');
    const countElement = document.getElementById('stops-count');

    container.innerHTML = '';
    countElement.textContent = stops.length;

    if (stops.length === 0) {
        container.innerHTML = '<div class="stops-no-results"><i class="fa-regular fa-circle-exclamation"></i> No stops match your search.</div>';
        return;
    }

    const basePath = getBasePath();
    const busIconPath = basePath + 'buszy/assets/bus-icon.png';

    let highlightedElement = null;

    stops.forEach((stop, index) => {
        const stopElement = document.createElement('div');
        stopElement.className = 'stop-item';
        stopElement.style.animationDelay = `${index * 0.05}s`;

        // Only highlight the first occurrence of the highlighted stop
        if (currentHighlightStopForSearch && stop[0] === currentHighlightStopForSearch && !highlightedElement) {
            stopElement.classList.add('highlight-stop');
            highlightedElement = stopElement;
        }

        stopElement.innerHTML = `
            <div class="bus-stop-info">
                <span class="bus-stop-code">
                    <img src="${busIconPath}" alt="Bus Icon">
                    <span class="bus-stop-code-text">${stop[0]}</span>
                </span>
                <div class="bus-stop-inline">
                    <span class="bus-stop-name">${stop[1]}</span>
                    <span class="bus-stop-description">${stop[2]}</span>
                </div>
            </div>
        `;

        stopElement.style.cursor = 'pointer';
        stopElement.addEventListener('click', () => {
            window.location.href = getBasePath() + 'buszy/art.html?BusStopCode=' + stop[0];
        });

        container.appendChild(stopElement);
    });

    if (highlightedElement) {
        setTimeout(() => {
            highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

// Populate bus stops list (compact format: array of [code, name, description])
function populateBusStops(stops, highlightStop = null) {
    allEnrichedStops = stops;
    currentHighlightStopForSearch = highlightStop;

    renderFilteredStops(stops);

    // Show search bar
    const searchContainer = document.getElementById('stops-search-container');
    if (!searchContainer) return;
    searchContainer.style.display = 'block';

    // Reset search state (e.g. when direction changes)
    const searchInput = document.getElementById('stops-search-input');
    const clearButton = document.getElementById('stops-search-clear');
    if (!searchInput || !clearButton) return;
    searchInput.value = '';
    clearButton.style.display = 'none';

    // Remove stale event listeners by replacing the nodes
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    const newClear = clearButton.cloneNode(true);
    clearButton.parentNode.replaceChild(newClear, clearButton);

    newInput.addEventListener('input', (e) => {
        const query = newInput.value.trim().toLowerCase();
        newClear.style.display = query.length > 0 ? 'flex' : 'none';
        const filtered = query
            ? allEnrichedStops.filter(stop =>
                stop[0].toLowerCase().includes(query) ||
                stop[1].toLowerCase().includes(query) ||
                stop[2].toLowerCase().includes(query)
              )
            : allEnrichedStops;
        renderFilteredStops(filtered);
    });

    newClear.addEventListener('click', async () => {
        newInput.value = '';
        newClear.style.display = 'none';
        renderFilteredStops(allEnrichedStops);
        newInput.focus();
        // Restore to the last active direction if different directions exist
        if (directions.length > 1) {
            await updateStopsForDirection(lastActiveDirection);
        }
    });
}

// Populate short bus service links
function populateShortBusService(shortBusServices) {
    const container = document.getElementById('short-bus-content');
    container.innerHTML = '';

    const linkContainer = document.createElement('div');
    linkContainer.className = 'short-bus-links';

    shortBusServices.forEach((service, index) => {
        const link = document.createElement('a');
        link.href = `?service=${service}`;
        link.className = 'short-bus-button';
        link.innerHTML = `${service}`;
        link.style.animationDelay = `${index * 0.05}s`;
        linkContainer.appendChild(link);
    });

    container.appendChild(linkContainer);
}

// Populate parent bus service links
function populateParentBusService(parentBusServices) {
    const container = document.getElementById('parent-bus-content');
    container.innerHTML = '';

    const linkContainer = document.createElement('div');
    linkContainer.className = 'parent-bus-links';

    parentBusServices.forEach((service, index) => {
        const link = document.createElement('a');
        link.href = `?service=${service}`;
        link.className = 'parent-bus-button';
        link.innerHTML = `${service}`;
        link.style.animationDelay = `${index * 0.05}s`;
        linkContainer.appendChild(link);
    });

    container.appendChild(linkContainer);
}

// Populate express variant links
function populateExpressVariant(expressVariants) {
    const container = document.getElementById('express-variant-content');
    container.innerHTML = '';

    const linkContainer = document.createElement('div');
    linkContainer.className = 'express-variant-links';

    expressVariants.forEach((service, index) => {
        const link = document.createElement('a');
        link.href = `?service=${service}`;
        link.className = 'express-variant-button';
        link.innerHTML = `${service}`;
        link.style.animationDelay = `${index * 0.05}s`;
        linkContainer.appendChild(link);
    });

    container.appendChild(linkContainer);
}

// Populate route variant links
function populateRouteVariant(routeVariants) {
    const container = document.getElementById('route-variant-content');
    container.innerHTML = '';
    const linkContainer = document.createElement('div');
    linkContainer.className = 'route-variant-links';
    routeVariants.forEach((service, index) => {
        const link = document.createElement('a');
        link.href = `?service=${service}`;
        link.className = 'route-variant-button';
        link.innerHTML = `${service}`;
        link.style.animationDelay = `${index * 0.05}s`;
        linkContainer.appendChild(link);
    });
    container.appendChild(linkContainer);
}

// Initialize page
async function initializePage() {
    const serviceNumber = getServiceNumberFromURL();
    console.log('Initializing page for service:', serviceNumber);

    const data = await loadBusServiceData();
    // console.log('Data received in initializePage:', data);

    if (!data || !Array.isArray(data)) {
        console.error('No valid data received');
        return;
    }

    // console.log('Data is array with', data.length, 'services');
    // console.log('Looking for service with n === ', serviceNumber);

    const service = data.find(s => s.n === serviceNumber);
    if (service) {
        console.log('Found service:', service);
        console.log('Service keys:', Object.keys(service));
        console.log('Has direction_freqs?', 'direction_freqs' in service);
        if (service.direction_freqs) {
            console.log('direction_freqs value:', service.direction_freqs);
            console.log('direction_freqs keys:', Object.keys(service.direction_freqs));
        }
        await populateServiceData(serviceNumber, service);
    } else {
        const availableServices = data.map(s => s.n).join(', ');
        console.error('Service not found. Available:', availableServices);
        showErrorMessage(`Service ${serviceNumber} is not available. <br> Please ensure you have entered a valid service number.`);
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    initializePage();

    // Add scroll detection for frequency details scrollbar
    const frequencyDetails = document.querySelector('.frequency-details');
    if (frequencyDetails) {
        let scrollTimeout;

        frequencyDetails.addEventListener('scroll', () => {
            frequencyDetails.classList.add('scrolling');
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                frequencyDetails.classList.remove('scrolling');
            }, 1500);
        }, {
            passive: true
        });
    }
});