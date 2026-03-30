/**
 * Bus Service Page
 * Loads service info from JSON and bus stops from API endpoints
 */

// Get service number from URL parameters or use default
function getServiceNumberFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('service') || '3'; // Default to service 3 if not specified
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
                    .catch(error => {
                        console.warn(`Failed to fetch stop ${stopCode}:`, error);
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
                return {
                    directions: directionsOrder,
                    directionDetails: directionsMap
                };
            }
        }
    } catch (error) {
        console.warn('Failed to fetch directions from API:', error);
    }

    // Fallback: use local JSON directions field
    if (localService && localService.directions) {
        console.log(`Using local directions for service ${serviceNumber}:`, localService.directions);
        const directionsMap = {};
        localService.directions.forEach(dir => {
            directionsMap[dir] = {
                direction: dir
            };
        });
        return {
            directions: localService.directions,
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
                    stops.map(s => typeof s === 'string' ? s : s.BusStopCode) :
                    [];

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

// Create and display direction selector
function createDirectionSelector(directions, onDirectionChange) {
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
        button.style.cssText = `
            padding: 8px 12px;
            border: 2px solid #7bad02;
            background-color: ${index === 0 ? '#7bad02' : 'transparent'};
            color: ${index === 0 ? '#000' : '#fff'};
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

        if (index === 0) {
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

    // Quick info cards
    document.getElementById('operating-hours').innerHTML = service.h;

    document.getElementById('fare').textContent = service.c;

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
    let currentDirection = directions[0];
    
    // Display frequency with direction info for the current direction
    if (service.freq_detail) {
        displayFrequencyDetails(service.freq_detail, service, currentDirection);
    } else if (service.direction_freqs && service.direction_freqs[currentDirection]) {
        displayFrequencyDetails(service.direction_freqs[currentDirection], service, currentDirection);
    } else {
        document.getElementById('frequency').textContent = service.f + ' mins';
    }

    // Function to update stops and terminals for selected direction
    const updateStopsForDirection = async (direction) => {
        currentDirection = direction;

        // Show loading indicator
        const stopsContainer = document.getElementById('stops-container');
        stopsContainer.innerHTML = `
            <div class="loading-stops">
                <div class="loading-spinner"></div>
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
        
        // Update operating hours if direction_hours exist
        if (service.direction_hours && service.direction_hours[direction]) {
            document.getElementById('operating-hours').innerHTML = service.direction_hours[direction];
        }
        
        // Update frequency display with direction info
        if (service.freq_detail) {
            displayFrequencyDetails(service.freq_detail, service, direction);
        } else if (service.direction_freqs && service.direction_freqs[direction]) {
            displayFrequencyDetails(service.direction_freqs[direction], service, direction);
        }

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
            populateBusStops(enrichedStops);
        }
    };

    // Create direction selector if multiple directions exist
    if (directions.length > 1) {
        createDirectionSelector(directions, updateStopsForDirection);

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
    }

    // Load stops for the first direction
    await updateStopsForDirection(currentDirection);

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
}

// Display frequency details by time period (collapsible)
function displayFrequencyDetails(freqDetail, service, currentDirection) {
    const frequencyElement = document.getElementById('frequency');

    // Use direction-specific frequencies if available, otherwise use general freq_detail
    if (service && service.direction_freqs && service.direction_freqs[currentDirection]) {
        freqDetail = service.direction_freqs[currentDirection];
        console.log(`Using direction-specific frequencies for direction ${currentDirection}`);
    }

    // Check if structure is nested (with day types) or flat (legacy)
    const isNested = freqDetail.weekdays || freqDetail.saturdays || freqDetail.sundays_holidays;

    // Detect if this is a departure times format (contains non-frequency values like location names)
    let isDepartureTimes = false;
    if (isNested) {
        // Check nested structure for location names
        for (const dayType in freqDetail) {
            if (['weekdays', 'saturdays', 'sundays_holidays'].includes(dayType)) {
                const dayValues = Object.values(freqDetail[dayType]);
                isDepartureTimes = dayValues.some(val => {
                    const isFrequency = /\d+$/.test(val) || /\d+-\d+/.test(val);
                    return !isFrequency;
                });
                if (isDepartureTimes) break;
            }
        }
    } else {
        // Check flat structure for location names
        const values = Object.values(freqDetail);
        isDepartureTimes = values.some(val => {
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
            'sundays_holidays': 'Sun/PH'
        };

        for (const [dayType, times] of Object.entries(freqDetail)) {
            if (['weekdays', 'saturdays', 'sundays_holidays'].includes(dayType)) {
                const dayLabel = dayLabels[dayType];
                html += `<div class="frequency-day-group">
                    <div class="day-label">${dayLabel}</div>`;

                for (const [timeRange, frequency] of Object.entries(times)) {
                    // Check if frequency is a number (actual frequency) or a location name
                    const isFrequency = /\d+$/.test(frequency) || /\d+-\d+/.test(frequency);
                    const displayValue = isFrequency ? `${frequency} mins` : frequency;
                    html += `
                        <div class="frequency-item">
                            <span class="time-range">${timeRange}</span>
                            <span class="freq-value">${displayValue}</span>
                        </div>
                    `;
                }
                html += '</div>';
            }
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

// Populate bus stops list (compact format: array of [code, name, description])
function populateBusStops(stops) {
    const container = document.getElementById('stops-container');
    const countElement = document.getElementById('stops-count');

    container.innerHTML = ''; // Clear existing content
    countElement.textContent = stops.length;

    stops.forEach((stop, index) => {
        const stopElement = document.createElement('div');
        stopElement.className = 'stop-item';
        stopElement.style.animationDelay = `${index * 0.05}s`;

        // Get base path for bus icon
        const basePath = getBasePath();
        const busIconPath = basePath + 'buszy/assets/bus-icon.png';

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

        // Make stop clickable to navigate to art.html
        stopElement.style.cursor = 'pointer';
        stopElement.addEventListener('click', () => {
            const basePath = getBasePath();
            const artPath = basePath + 'buszy/art.html?BusStopCode=' + stop[0];
            window.location.href = artPath;
        });

        container.appendChild(stopElement);
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
        await populateServiceData(serviceNumber, service);
    } else {
        const availableServices = data.map(s => s.n).join(', ');
        console.error('Service not found. Available:', availableServices);
        showErrorMessage(`Service ${serviceNumber} not found. Available services: ${availableServices}`);
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