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
}

// Initialize defaults immediately
initializeDefaultPreferences();

// Register Service Worker for notifications
let serviceWorkerReady = false;

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration);
                // Wait for the controller to be ready
                if (navigator.serviceWorker.controller) {
                    serviceWorkerReady = true;
                    console.log('Service Worker controller is ready');
                } else {
                    // Controller will be ready on next page load
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        serviceWorkerReady = true;
                        console.log('Service Worker controller is now ready');
                    });
                }
            })
            .catch(error => {
                console.warn('Service Worker registration failed:', error);
                // This is not critical - notifications will still work with fallback
            });
    }
}

// Register service worker when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerServiceWorker);
} else {
    registerServiceWorker();
}

// ****************************
// :: Bus Arrivals Fetching and Display
// ****************************
document.addEventListener('DOMContentLoaded', async () => {
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
            let busStops = JSON.parse(localStorage.getItem('allBusStops')) || [];

            // If bus stops are not cached, fetch them from the server
            if (busStops.length === 0) {
                let skip = 0;
                let hasMoreData = true;

                while (hasMoreData) {
                    const response = await fetch(`https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=${skip}`);
                    const data = await response.json();

                    if (data.value.length === 0) {
                        hasMoreData = false;
                    } else {
                        busStops = busStops.concat(data.value);
                        skip += 500; // Move to the next page
                    }
                }

                // Save the fetched bus stops to localStorage
                localStorage.setItem('allBusStops', JSON.stringify(busStops));
            }

            // Find the bus stop by BusStopCode
            const busStop = busStops.find(stop => stop.BusStopCode === busStopCode);

            if (busStop) {
                // Update title with styled bus stop code and name
                filterTitle.innerHTML = `
                    <div class="bus-stop-info">
                        <span class="bus-stop-code">
                            <img src="assets/bus-icon.png" alt="Bus Icon"> <!-- Replace with your bus icon path -->
                            <span class="bus-stop-code-text">${busStop.BusStopCode}</span>
                        </span>
                        <span class="bus-stop-description">${busStop.Description}</span>
                    </div>
                `;
            } else {
                filterTitle.textContent = `Bus Stop Not Found (${busStopCode})`;
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

    // Refresh data every 2 seconds
    setInterval(fetchBusArrivals, 2000);

    // Listen for changes in localStorage to update time format dynamically
    window.addEventListener('storage', (event) => {
        if (event.key === 'timeFormat') {
            fetchBusArrivals(); // Re-fetch and update the table with the new format
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

// Updated fetchBusArrivals function
async function fetchBusArrivals() {
    try {
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
            return;
        }

        const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
        url.searchParams.append('BusStopCode', searchInput);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch bus arrivals');
        }

        const data = await response.json();
        // console.log('API Response:', data); // Debugging line to check API response

        if (!data.Services || data.Services.length === 0) {
            const noDataHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">No Data Available</div>
                        <div class="card-body">
                            <p class="card-text">No Data Available</p>
                        </div>
                    </div>
                </div>`;
            // Only update if content has changed
            if (container.innerHTML !== noDataHTML) {
                container.innerHTML = noDataHTML;
            }
            return;
        }

        const now = new Date();

        // Create a map of destination codes to names from cached bus stops
        let destinationMap = {};
        let customDestinationMap = {};
        
        // Load custom destination code mappings
        try {
            const response = await fetch('json/destination-codes.json');
            if (response.ok) {
                customDestinationMap = await response.json();
            }
        } catch (error) {
            console.warn('Custom destination codes file not found or error loading:', error);
        }
        
        try {
            const allBusStops = JSON.parse(localStorage.getItem('allBusStops')) || [];
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
        if (topFourBuses.length > 0) {
            incomingSection.style.display = 'block';
            const isDarkMode = document.body.classList.contains('dark-mode');
            const bgColor = isDarkMode ? '#7db603' : '#94d40b';
            const newIncomingHTML = topFourBuses.map(bus => `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                    <div class="ib-time">${bus.TimeStr}</div>
                    <div class="ib-svc" style="background-color: ${bgColor};" >${bus.ServiceNo}</div>
                </div>
            `).join('');
            // Only update if content has changed
            if (incomingGrid.innerHTML !== newIncomingHTML) {
                incomingGrid.innerHTML = newIncomingHTML;
            }
        } else {
            incomingSection.style.display = 'none';
        }

        // Build new content
        const tempContainer = document.createElement('div');
        
        data.Services.forEach((service) => {
            const card = document.createElement('div');
            card.classList.add('col-12', 'col-md-4', 'col-xl-3', 'card-bt'); // Add col-sm-6 for 2 cards per row on small screens
            const isMonitored = getNotificationPreference('monitoredServices')?.[service.ServiceNo] || false;

            // Safely check if NextBus exists and has required properties
            const hasNextBus = service.NextBus && typeof service.NextBus === 'object' && Object.keys(service.NextBus).length > 0;
            const hasNextBus2 = service.NextBus2 && typeof service.NextBus2 === 'object' && Object.keys(service.NextBus2).length > 0;

            card.innerHTML = `
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center" style="flex-wrap: wrap;">
                        <div style="min-width: 0;">
                            <span class="service-no">${service.ServiceNo}</span>
                            ${hasNextBus && service.NextBus.DestinationCode ? `<div class="destination-code">To ${getDestinationName(service.NextBus.DestinationCode)}</div>` : ''}
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 0.5rem; align-items: center; flex-shrink: 0;">
                            ${service.Operator ? `<img src="assets/${service.Operator.toLowerCase()}.png" alt="${service.Operator}" class="img-fluid" style="width: 50px; margin-left: auto;">` : ''}
                                <button class="btn btn-notify btn-sm notify-btn ${isMonitored ? 'active' : ''}" 
                                data-service="${service.ServiceNo}"
                                title="Get notified when bus arrives">
                                <i class="fa-solid fa-bell"></i>
                            </button>
                            </div>
                    </div>
                    <div class="card-body">
                        <div class="card-content-art">
                            ${hasNextBus ? `
                            <div class="d-flex justify-content-between" style="flex-wrap: wrap; gap: 0.5rem;">
                                <span class="bus-time">${service.NextBus?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${service.NextBus?.Type ? `<img src="assets/${service.NextBus.Type.toLowerCase()}.png" alt="${service.NextBus.Type}" class="img-fluid" style="width: 50px;">` : ''}
                                    ${service.NextBus?.Load ? `<span class="load-indicator ${service.NextBus.Load.toLowerCase()}"> ${getLoadIcon(service.NextBus.Load)}</span>` : ''}
                                    <button class="btn btn-busloc btn-sm view-location-btn" 
                                        data-lat="${service.NextBus?.Latitude || '0.0'}" 
                                        data-lng="${service.NextBus?.Longitude || '0.0'}" 
                                        data-bus="${service.ServiceNo}" 
                                        data-type="${service.NextBus?.Type || ''}" 
                                        data-load="${service.NextBus?.Load || ''}"
                                        ${!service.NextBus || service.NextBus.Latitude === "0.0" && service.NextBus.Longitude === "0.0" || !service.NextBus.EstimatedArrival ? 'disabled' : ''}> 
                                        <i class="fa-solid fa-location-dot"></i>
                                    </button>
                                </span>
                            </div>
                            ` : `<div style="padding: 0.5rem; color: #999; font-size: 0.9rem;">No arrival data</div>`}
                            ${hasNextBus2 ? `
                            <div class="d-flex justify-content-between" style="margin-top: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                                <span class="bus-time">${service.NextBus2?.EstimatedArrival ? formatArrivalTimeOrArr(service.NextBus2.EstimatedArrival, now) : '--'}</span>
                                <span style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                    ${service.NextBus2?.Type ? `<img src="assets/${service.NextBus2.Type.toLowerCase()}.png" alt="${service.NextBus2.Type}" class="img-fluid" style="width: 50px;">` : ''}
                                    ${service.NextBus2?.Load ? `<span class="load-indicator ${service.NextBus2.Load.toLowerCase()}"> ${getLoadIcon(service.NextBus2.Load)}</span>` : ''}
                                    <button class="btn btn-busloc btn-sm view-location-btn" 
                                        data-lat="${service.NextBus2?.Latitude || '0.0'}" 
                                        data-lng="${service.NextBus2?.Longitude || '0.0'}" 
                                        data-bus="${service.ServiceNo}" 
                                        data-type="${service.NextBus2?.Type || ''}" 
                                        data-load="${service.NextBus2?.Load || ''}"
                                        ${!service.NextBus2 || service.NextBus2.Latitude === "0.0" && service.NextBus2.Longitude === "0.0" || !service.NextBus2.EstimatedArrival ? 'disabled' : ''}>
                                        <i class="fa-solid fa-location-dot"></i>
                                    </button>
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
            container.innerHTML = newHTML;
            didUpdate = true;
        }

        // Check for arrivals and send notifications
        const busStopCode = document.getElementById('bus-stop-search').value.trim();
        checkMonitoredServices(data.Services, now, busStopCode);

        // Only add event listeners if the DOM was updated
        if (didUpdate) {
            // Add event listeners to "View Bus Location" buttons
            const viewLocationButtons = document.querySelectorAll('.view-location-btn');
            viewLocationButtons.forEach((button) => {
                button.addEventListener('click', (event) => {
                    if (!map) {
                        alert('Map is not available on this device. Please try on desktop.');
                        return;
                    }
                    
                    const latitude = parseFloat(button.getAttribute('data-lat'));
                    const longitude = parseFloat(button.getAttribute('data-lng'));
                    const busNumber = button.getAttribute('data-bus');
                    const eta = button.parentElement.parentElement.querySelector('.bus-time').textContent;

                    if (!isNaN(latitude) && !isNaN(longitude)) {
                        // Show the map section
                        const mapSection = document.querySelector('.bus-location-section');
                        if (mapSection) {
                            mapSection.style.display = 'block';

                            // Invalidate the map size to fix grey areas
                            setTimeout(() => {
                                if (map && map.invalidateSize) {
                                    map.invalidateSize();
                                }
                            }, 100); // Small delay to ensure the map container is fully visible

                            // Clear all existing markers
                            map.eachLayer((layer) => {
                                if (layer instanceof L.Marker) {
                                    map.removeLayer(layer);
                                }
                            });

                            // Center the map on the selected bus location and add a marker
                            map.setView([latitude, longitude], 15);
                            const marker = L.marker([latitude, longitude]).addTo(map);

                            marker.bindPopup(`
                                        <b>Bus ${busNumber}</b><br>
                                        ${eta || '--'}
                                    `).openPopup();
                        }
                    } else {
                        alert('Bus location not available.');
                    }
                });
            });

            // Add event listeners to notify buttons
            const notifyButtons = document.querySelectorAll('.notify-btn');
            const busStopCodeForToast = document.getElementById('bus-stop-search').value.trim();
            
            // Get bus stop description for toast
            let busStopDescriptionForToast = '';
            try {
                const allBusStops = JSON.parse(localStorage.getItem('allBusStops')) || [];
                const busStop = allBusStops.find(stop => stop.BusStopCode === busStopCodeForToast);
                if (busStop) {
                    busStopDescriptionForToast = busStop.Description;
                }
            } catch (error) {
                console.error('Error fetching bus stop description:', error);
            }
            
            notifyButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    try {
                        const serviceNo = button.getAttribute('data-service');
                        const monitoredServices = getNotificationPreference('monitoredServices') || {};

                        monitoredServices[serviceNo] = !monitoredServices[serviceNo];
                        saveNotificationPreference('monitoredServices', monitoredServices);

                        button.classList.toggle('active');

                        // Show toast notification
                        const isActive = monitoredServices[serviceNo];
                        const busStopInfo = busStopDescriptionForToast ? ` at ${busStopDescriptionForToast}` : '';
                        const message = isActive
                            ? `Notifications enabled for Bus ${serviceNo}${busStopInfo}`
                            : `Notifications disabled for Bus ${serviceNo}${busStopInfo}`;
                        showToast(message, isActive ? 'success' : 'info');

                        // Request notification permission on enabling notifications
                        if (isActive) {
                            if (!('Notification' in window)) {
                                showToast('Notifications not supported on this device.', 'info');
                                return;
                            }

                            console.log(`Current notification permission: ${Notification.permission}`);

                            if (Notification.permission === 'default') {
                                console.log('Requesting notification permission for Bus ' + serviceNo + '...');
                                Notification.requestPermission()
                                    .then(permission => {
                                        console.log('Notification permission result:', permission);
                                        if (permission === 'granted') {
                                            console.log('Notifications permission granted for Bus service');
                                            showToast(`Notifications setup complete for Bus ${serviceNo}. You'll get alerts when it arrives.`, 'success');
                                        } else if (permission === 'denied') {
                                            showToast('Notifications are blocked in your browser settings. Please enable them to receive alerts.', 'info');
                                            // Uncheck the bell if user denied
                                            monitoredServices[serviceNo] = false;
                                            saveNotificationPreference('monitoredServices', monitoredServices);
                                            button.classList.remove('active');
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error requesting notification permission:', error);
                                        showToast('Could not enable notifications on this device.', 'info');
                                    });
                            } else if (Notification.permission === 'granted') {
                                console.log('Notifications permission already granted');
                                showToast(`Notifications setup complete for Bus ${serviceNo}. You'll get alerts when it arrives.`, 'success');
                            } else if (Notification.permission === 'denied') {
                                showToast('Notifications are blocked in your browser settings. Please enable them to receive alerts.', 'info');
                                // Uncheck the bell if notifications are blocked
                                monitoredServices[serviceNo] = false;
                                saveNotificationPreference('monitoredServices', monitoredServices);
                                button.classList.remove('active');
                            }
                        }
                    } catch (error) {
                        console.error('Error handling notification button click:', error);
                        showToast('Error updating notification settings. Please try again.', 'error');
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error fetching bus arrivals:', error);
        const container = document.getElementById('bus-arrivals-container');
        
        // Determine error message based on error type
        let errorMessage = 'Error loading data. Try Refreshing.';
        let errorDetails = '';
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
            errorMessage = 'Network error. Check your connection.';
            errorDetails = 'Unable to connect to the server. Please check your internet connection.';
        } else if (error.message === 'Failed to fetch bus arrivals') {
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
        
        // Show toast for mobile users
        showToast(errorMessage, 'error');
    }
}

// Function to check monitored services and send notifications
function checkMonitoredServices(services, now, busStopCode = '') {
    // Skip if Notifications API is not available
    if (!('Notification' in window)) {
        return;
    }

    try {
        const monitoredServices = getNotificationPreference('monitoredServices') || {};
        const notifiedServices = getNotificationPreference('notifiedServices') || {};

        // Get bus stop description
        let busStopDescription = '';
        if (busStopCode) {
            try {
                const allBusStops = JSON.parse(localStorage.getItem('allBusStops')) || [];
                const busStop = allBusStops.find(stop => stop.BusStopCode === busStopCode);
                if (busStop) {
                    busStopDescription = busStop.Description;
                }
            } catch (error) {
                console.warn('Error fetching bus stop description:', error);
            }
        }

        // Check if there are any monitored services
        const monitoredServiceNumbers = Object.keys(monitoredServices).filter(svc => monitoredServices[svc]);
        if (monitoredServiceNumbers.length === 0) {
            return; // No services being monitored
        }

        console.log(`Checking ${monitoredServiceNumbers.length} monitored services. Current time: ${now.toLocaleTimeString()}`);

        services.forEach((service) => {
            if (!monitoredServices[service.ServiceNo]) {
                return; // Skip if service is not monitored
            }

            // Check NextBus arrival
            if (service.NextBus?.EstimatedArrival) {
                const arrivalTime = new Date(service.NextBus.EstimatedArrival);
                const timeDifference = arrivalTime - now;
                
                // Send notification only when bus shows "Arr" status (time difference <= 0)
                const shouldNotify = timeDifference <= 0;
                const wasNotifiedBefore = notifiedServices[`${service.ServiceNo}-nextbus`];
                
                console.log(`Bus ${service.ServiceNo} (1st): timeDiff=${timeDifference}ms, shouldNotify=${shouldNotify}, alreadyNotified=${wasNotifiedBefore}, permission=${Notification.permission}`);
                
                if (shouldNotify && !wasNotifiedBefore) {
                    console.log(`🔔 Sending notification for Bus ${service.ServiceNo} (1st arrival)`);
                    sendNotification(`Bus ${service.ServiceNo} Arrives Now!`, {
                        body: `At ${busStopDescription || busStopCode}\nYour monitored bus has arrived.`,
                        icon: '/img/core-img/icon-192.png',
                        requireInteraction: false
                    });
                    notifiedServices[`${service.ServiceNo}-nextbus`] = true;
                    saveNotificationPreference('notifiedServices', notifiedServices);
                }
            } else if (!service.NextBus) {
                // Reset the notification flag if NextBus no longer exists
                delete notifiedServices[`${service.ServiceNo}-nextbus`];
                saveNotificationPreference('notifiedServices', notifiedServices);
            }

            // Check NextBus2 arrival
            if (service.NextBus2?.EstimatedArrival) {
                const arrivalTime = new Date(service.NextBus2.EstimatedArrival);
                const timeDifference = arrivalTime - now;
                
                // Send notification only when bus shows "Arr" status (time difference <= 0)
                const shouldNotify = timeDifference <= 0;
                const wasNotifiedBefore = notifiedServices[`${service.ServiceNo}-nextbus2`];
                
                console.log(`Bus ${service.ServiceNo} (2nd): timeDiff=${timeDifference}ms, shouldNotify=${shouldNotify}, alreadyNotified=${wasNotifiedBefore}, permission=${Notification.permission}`);
                
                if (shouldNotify && !wasNotifiedBefore) {
                    console.log(`🔔 Sending notification for Bus ${service.ServiceNo} (2nd arrival)`);
                    sendNotification(`Bus ${service.ServiceNo} Arrives Now!`, {
                        body: `At ${busStopDescription || busStopCode}\nYour second monitored bus has arrived.`,
                        icon: '/img/core-img/icon-192.png',
                        requireInteraction: false
                    });
                    notifiedServices[`${service.ServiceNo}-nextbus2`] = true;
                    saveNotificationPreference('notifiedServices', notifiedServices);
                }
            } else if (!service.NextBus2) {
                // Reset the notification flag if NextBus2 no longer exists
                delete notifiedServices[`${service.ServiceNo}-nextbus2`];
                saveNotificationPreference('notifiedServices', notifiedServices);
            }
        });
    } catch (error) {
        console.error('Error in checkMonitoredServices:', error);
    }
}

// Utility functions for notification preferences with fallback
function getNotificationPreference(key) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.warn(`Error reading notification preference '${key}':`, error);
        // Return in-memory fallback if localStorage fails
        return window['_notif_' + key] || null;
    }
}

function saveNotificationPreference(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        // Also save to in-memory fallback
        window['_notif_' + key] = value;
    } catch (error) {
        console.warn(`Error saving notification preference '${key}':`, error);
        // Fallback to in-memory storage
        window['_notif_' + key] = value;
    }
}

// Refactored notification sender with improved error handling for PWA
function sendNotification(title, options = {}) {
    // Check if Notifications API is supported
    if (!('Notification' in window)) {
        console.warn('Notifications API not supported on this browser');
        return;
    }

    try {
        // Handle permission states
        if (Notification.permission === 'denied') {
            console.warn('Notifications are blocked by user');
            return; // Don't spam user if they explicitly denied
        }

        // If permission is default, request it
        if (Notification.permission === 'default') {
            console.log('Requesting notification permission for PWA...');
            Notification.requestPermission()
                .then(permission => {
                    console.log('Notification permission result:', permission);
                    if (permission === 'granted') {
                        console.log('Permission granted, sending notification...');
                        // Wait a moment for permission to be fully processed, then retry
                        setTimeout(() => {
                            sendNotificationNow(title, options);
                        }, 100);
                    }
                })
                .catch(error => {
                    console.error('Error requesting notification permission:', error);
                });
            return;
        }

        // If we reach here, permission should be 'granted'
        if (Notification.permission === 'granted') {
            console.log('Permission already granted, sending notification...');
            sendNotificationNow(title, options);
        }
    } catch (error) {
        console.error('Unexpected error in sendNotification:', error);
    }
}

// Helper function to actually send the notification
function sendNotificationNow(title, options = {}) {
    try {
        const notificationOptions = {
            icon: options.icon || '/img/core-img/icon-192.png',
            badge: options.badge || '/img/core-img/icon-192.png',
            ...options
        };

        // Try Service Worker first if available and ready
        if (serviceWorkerReady && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
            try {
                console.log('Sending notification via Service Worker...');
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: title,
                    options: {
                        ...notificationOptions,
                        tag: 'bus-notification',
                        requireInteraction: false
                    }
                });
                console.log('Notification sent via Service Worker:', title);
                return;
            } catch (swError) {
                console.warn('Service Worker notification failed:', swError);
            }
        }

        // Fallback to direct Notification API (works in PWA)
        console.log('Sending notification via direct API...');
        new Notification(title, notificationOptions);
        console.log('Notification sent via direct API:', title);

    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Function to show toast notifications
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
    toast.style.cssText = `
        background-color: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add toast animations to the page
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Function to get load icon HTML based on load status
function getLoadIcon(load) {
    switch (load) {
        case 'SEA':
            return '<i class="fa-solid fa-user" title="Seats Available"></i>'; // Icon for SEA
        case 'SDA':
            return '<i class="fa-solid fa-user-group" title="Standing Available"></i>'; // Icon for SDA
        case 'LSD':
            return '<i class="fa-solid fa-people-group" title="Limited Standing"></i>'; // Icon for LSD
        default:
            return ''; // No icon for unknown load values
    }
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
        // Calculate the time difference in minutes
        const minutes = Math.ceil(timeDifference / (1000 * 60));
        const minText = minutes === 1 ? 'min' : 'mins';
        if (isIncomingBus) {
            return `${minutes}<span style="font-size: 0.7em;"> ${minText}</span>`;
        }
        return `${minutes} ${minText}`; // Singular/plural handling
    }

    // Format the time based on the saved format
    const options = savedFormat === '24-hour'
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: '2-digit', minute: '2-digit', hour12: true };

    const timeString = arrivalTime.toLocaleTimeString('en-US', options);

    // For 12-hour format with incoming buses, make AM/PM smaller
    if (isIncomingBus && savedFormat === '12-hour') {
        const parts = timeString.split(' ');
        if (parts.length === 2) {
            return `${parts[0]}<span style="font-size: 0.7em;">${parts[1]}</span>`;
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
        
        // Add a tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap contributors'
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

// Add "Current Location" button functionality
const currentLocationBtn = document.getElementById('current-location-btn');
if (currentLocationBtn) {
    currentLocationBtn.addEventListener('click', () => {
        map.locate({ setView: true, maxZoom: 15 });

        map.on('locationfound', (e) => {
            const radius = e.accuracy;

            // Add a marker for the current location
            L.marker(e.latlng).addTo(map)
                .bindPopup(`You are within ${Math.round(radius)} meters from this point.`)
                .openPopup();

            // Add a circle to show the accuracy radius
            L.circle(e.latlng, radius).addTo(map);
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
            const { ServiceNo, NextBus, NextBus2 } = service;

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
                const { NextBus, NextBus2 } = service;
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
                <span class="spinner" role="status" style="margin-right: 1em;"></span>${loadingMessages[messageIndex]}
            `;
        messageIndex = (messageIndex + 1) % loadingMessages.length; // Cycle through messages
    };

    // Show the first message immediately
    updateLoadingMessage();

    // Change the message every 4 seconds
    setInterval(updateLoadingMessage, 4000);
});
