const apiUrl = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/nearby-bus-stops';
const arrivalsApiUrl = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals';
const arrivalsSummaryCache = new Map();

function getLoadIcon(load, type) {
    if (window.SharedArrivals && typeof window.SharedArrivals.getLoadIcon === 'function') {
        return window.SharedArrivals.getLoadIcon(load, type);
    }
    let fleetIcon = '';
    if (type) {
        switch (String(type).toUpperCase()) {
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
                fleetIcon = '<i class="fa-kit fa-lta-bus" title="Bus"></i>';
        }
    }

    const loadClass = load ? String(load).toLowerCase() : 'sea';
    return `<span class="load-indicator ${loadClass}">${fleetIcon || '<i class="fa-kit fa-lta-bus" title="Bus"></i>'}</span>`;
}

function formatArrivalTimeStyled(isoString) {
    if (window.SharedArrivals && typeof window.SharedArrivals.formatArrivalTimeOrArr === 'function') {
        try {
            // Use synchronized time if available
            const now = (window.SharedArrivals && typeof window.SharedArrivals.getSynchronizedNow === 'function')
                ? window.SharedArrivals.getSynchronizedNow()
                : new Date();
            return window.SharedArrivals.formatArrivalTimeOrArr(isoString, now, false);
        } catch(e) {}
    }
    if (!isoString) return '--';
    const arrivalTime = new Date(isoString);
    if (Number.isNaN(arrivalTime.getTime())) return '--';

    // Use synchronized time if available
    const now = (window.SharedArrivals && typeof window.SharedArrivals.getSynchronizedNow === 'function')
        ? window.SharedArrivals.getSynchronizedNow()
        : new Date();
    const timeDifference = arrivalTime - now;
    if (timeDifference <= 0) {
        return '<span class="arrival-now">Arr</span>';
    }

    const savedFormat = localStorage.getItem('timeFormat') || '12-hour';
    if (savedFormat === 'mins') {
        const minutes = Math.floor(timeDifference / (1000 * 60));
        if (minutes <= 0) {
            return '<span class="arrival-now">Arr</span>';
        }
        const minText = minutes === 1 ? 'min' : 'mins';
        return `${minutes}<span class="mins"> ${minText}</span>`;
    }

    const options = savedFormat === '24-hour'
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: '2-digit', minute: '2-digit', hour12: true };

    const timeString = arrivalTime.toLocaleTimeString('en-US', options);
    if (savedFormat === '12-hour') {
        const parts = timeString.split(' ');
        if (parts.length === 2) {
            return `${parts[0]}<span style="font-size: 0.5em; margin-left: 1.5px; position: relative; display: inline-block;">${parts[1]}</span>`;
        }
    }
    return timeString;
}

function renderArrivalSummary(arrivals) {
    if (!arrivals?.length) {
        return `
            <div class="busNo-card d-flex justify-content-between">
                <span class="arrival-svc-no">--</span>
                <span class="bus-time"></span>
                <span style="display: flex; align-items: center; gap: 0.3rem;">${getLoadIcon('sea', 'SD')}</span>
            </div>
            <div class="busNo-card d-flex justify-content-between">
                <span class="arrival-svc-no">--</span>
                <span class="bus-time"></span>
                <span style="display: flex; align-items: center; gap: 0.3rem;">${getLoadIcon('sea', 'SD')}</span>
            </div>
        `;
    }
    return arrivals.map(a => `
        <div class="busNo-card d-flex justify-content-between">
            <span class="arrival-svc-no">${a.serviceNo}</span>
            <span class="bus-time">${formatArrivalTimeStyled(a.eta)}</span>
            <span style="display: flex; align-items: center; gap: 0.3rem;">${getLoadIcon(a.load, a.type)}</span>
        </div>
    `).join('');
}

async function getArrivalSummaryForStop(busStopCode) {
    if (arrivalsSummaryCache.has(busStopCode)) {
        return arrivalsSummaryCache.get(busStopCode);
    }

    try {
        let data;
        if (window.SharedArrivals && typeof window.SharedArrivals.fetchArrivals === 'function') {
            data = await window.SharedArrivals.fetchArrivals(busStopCode);
        } else {
            const url = new URL(arrivalsApiUrl);
            url.searchParams.append('BusStopCode', busStopCode);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();
        }
        const arrivals = [];
        (data.Services || []).forEach((service) => {
            if (service.NextBus?.EstimatedArrival) {
                arrivals.push({
                    serviceNo: service.ServiceNo,
                    eta: service.NextBus.EstimatedArrival,
                    load: service.NextBus.Load,
                    type: service.NextBus.Type
                });
            }
        });

        const sortByArrival = localStorage.getItem('sortByArrival') !== 'disabled';
        if (sortByArrival) {
            arrivals.sort((a, b) => new Date(a.eta) - new Date(b.eta));
        }
        arrivalsSummaryCache.set(busStopCode, arrivals);
        return arrivals;
    } catch (error) {
        console.warn('[nbs.js] Failed to load arrival summary:', error);
        arrivalsSummaryCache.set(busStopCode, []);
        return [];
    }
}

// Helper function to detect Instagram in-app browser
function isInstagramInAppBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    // Instagram in-app browsers include "Instagram" in their user agent
    return /Instagram/.test(userAgent);
}

// Initialize geolocation search
function initializeGeolocationSearch() {
    const busStopsContainer = document.getElementById('bus-stops');

    // Disable navigation while loading
    const navbarContainer = document.querySelector('.navbar-container');
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    
    // Helper to enable navigation
    function enableNavigation() {
        if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
    }

    // Helper to disable navigation
    function disableNavigation() {
        if (navbarContainer) navbarContainer.classList.add('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.add('nav-disabled');
    }

    // Helper to show Instagram limitation message
    function showInstagramLimitationMessage() {
        const currentUrl = window.location.href;
        
        busStopsContainer.innerHTML = `
            <p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Location access is not available in Instagram's in-app browser.</p>
            <button id="open-default-browser-btn" class="btn btn-rfetch" style="display: block; margin: 15px auto;">
                <i class="fa-regular fa-globe"></i> Open in Default Browser
            </button>
        `;
        
        enableNavigation();
        
        const openBtn = document.getElementById('open-default-browser-btn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                // Try multiple methods to break out of Instagram's browser
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                
                if (isIOS) {
                    // iOS: Try to use Safari schema and fallback to direct navigation
                    window.location.href = 'safari-' + currentUrl;
                    setTimeout(() => {
                        window.location.href = currentUrl;
                    }, 1000);
                } else {
                    // Android: Try Chrome Intent first, then direct navigation
                    const encodedUrl = encodeURIComponent(currentUrl);
                    window.location.href = 'intent://' + currentUrl.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodedUrl + ';end';
                    setTimeout(() => {
                        window.location.href = currentUrl;
                    }, 1000);
                }
            });
        }
    }


    // Helper to show error only if nothing can be loaded
    function showLocationError() {
        busStopsContainer.innerHTML = `
            <p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Unable to retrieve your location.</p>
            <button id="retry-location-btn" class="btn btn-rfetch" style="display: block; margin: 15px auto;">
                <i class="fa-regular fa-rotate"></i> Retry
            </button>
        `;
        enableNavigation();
        const retryBtn = document.getElementById('retry-location-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                requestLocation(true); // Force location prompt
            });
        }
    }

    function requestLocation(force = false) {
        // Check if running in Instagram in-app browser
        if (isInstagramInAppBrowser()) {
            showInstagramLimitationMessage();
            return;
        }

        // Check if we have cached bus stops and not forcing a refresh
        if (!force) {
            const cachedBusStops = sessionStorage.getItem('nearbyBusStops');
            if (cachedBusStops) {
                try {
                    const busStops = JSON.parse(cachedBusStops);
                    displayBusStops(busStops, true); // true = isCached
                } catch (error) {
                    console.error('Error parsing cached bus stops:', error);
                }
                return;
            }
        }

        // Try cached location first, unless force is true
        const cachedLocation = sessionStorage.getItem('userLocation');
        if (cachedLocation && !force) {
            const { latitude, longitude } = JSON.parse(cachedLocation);
            fetchNearbyBusStops(latitude, longitude, showLocationError);
            return;
        }

        // Check if geolocation is available
        if (!navigator.geolocation) {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-circle-info"></i>Geolocation is not supported by your browser.</p>';
            enableNavigation();
            return;
        }

        // Show spinner while waiting for location
        disableNavigation();
        busStopsContainer.innerHTML = '<p class="pin-msg"><svg class="spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45"><animateTransform attributeName="transform" type="rotate" values="-90;810" keyTimes="0;1" dur="2s" repeatCount="indefinite" /><animate attributeName="stroke-dashoffset" values="0%;0%;-157.080%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" /><animate attributeName="stroke-dasharray" values="0% 314.159%;157.080% 157.080%;0% 314.159%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" /></circle></svg>Searching for nearby bus stops...</p>';

        navigator.geolocation.getCurrentPosition((position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            sessionStorage.setItem('userLocation', JSON.stringify({ latitude, longitude }));
            fetchNearbyBusStops(latitude, longitude, showLocationError);
        }, (error) => {
            console.error('Geolocation error:', error);
            showLocationError();
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }

    // Try to fetch location on load (without forcing, so cached results are used)
    requestLocation(false);

    // Add refresh event listener - don't force refresh, use cached results if available
    window.addEventListener('pageshow', (event) => {
        requestLocation(false);
    });
}

// Execute geolocation initialization immediately or on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGeolocationSearch);
} else {
    // DOM is already loaded, execute immediately
    initializeGeolocationSearch();
}

async function fetchNearbyBusStops(latitude, longitude, onError) {
    const busStopsContainer = document.getElementById('bus-stops');
    try {
        console.log('Fetching nearby bus stops for:', latitude, longitude);
        const response = await fetch(`${apiUrl}?latitude=${latitude}&longitude=${longitude}&radius=2`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const busStops = await response.json();
        console.log('Received bus stops:', busStops);
        if (busStops && busStops.length > 0) {
            // Cache the bus stops in sessionStorage
            sessionStorage.setItem('nearbyBusStops', JSON.stringify(busStops));
            displayBusStops(busStops, false);
        } else {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-circle-info"></i>No Bus Stops found nearby.</p>';
        }
    } catch (error) {
        console.error('Error fetching nearby bus stops:', error);
        if (typeof onError === 'function') {
            onError();
        } else {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Failed to fetch nearby bus stops. Please try again later.<br><small style="font-size: 12px; opacity: 0.7;">Error: ' + error.message + '</small></p>';
        }
    }
}


// Function to toggle pin/unpin for a bus stop
function togglePinBusStop(busStop, button) {
    // Retrieve existing pinned bus stops from localStorage
    let pinnedBusStops = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];

    // Check if the bus stop is already pinned
    const isAlreadyPinned = pinnedBusStops.some((stop) => stop.BusStopCode === busStop.BusStopCode);

    if (isAlreadyPinned) {
        // Unpin the bus stop
        const confirmUnpin = confirm(`Are you sure you want to unpin this bus stop?`);
        if (confirmUnpin) {
            pinnedBusStops = pinnedBusStops.filter((stop) => stop.BusStopCode !== busStop.BusStopCode);
            localStorage.setItem('bookmarkedBusStops', JSON.stringify(pinnedBusStops));
            alert(`Bus Stop Unpinned.`);

            // Update the button class and icon to "unpin"
            button.className = 'btn btn-toPin btn-2';
            button.innerHTML = '<i class="fa-sharp fa-regular fa-thumbtack-angle"></i>';
        }
    } else {
        // Pin the bus stop
        pinnedBusStops.push(busStop);
        localStorage.setItem('bookmarkedBusStops', JSON.stringify(pinnedBusStops));
        alert(`Bus Stop Pinned.`);

        // Update the button class and icon to "pin"
        button.className = 'btn btn-unpin btn-2';
        button.innerHTML = '<i class="fa-regular fa-thumbtack-angle-slash"></i>';
    }
}

// Display the 3 nearest bus stops
function displayBusStops(busStops, isCached = true) {
    const busStopsContainer = document.getElementById('bus-stops');
    busStopsContainer.innerHTML = ''; // Clear previous results

    if (!busStops || busStops.length === 0) {
        busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-circle-info"></i>No Bus Stops found nearby.</p>';
        
        // Enable navigation and show done
        const navbarContainer = document.querySelector('.navbar-container');
        const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
        if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
        return;
    }

    // Retrieve existing pinned bus stops from localStorage
    const pinnedBusStops = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];

    busStops.forEach((busStop, idx) => {
        const distance = busStop.distance < 1
            ? `${(busStop.distance * 1000).toFixed(0)}m`
            : `${busStop.distance.toFixed(2)} km`;

        const isPinned = pinnedBusStops.some((stop) => stop.BusStopCode === busStop.BusStopCode);

        const busStopElement = document.createElement('div');
        busStopElement.className = 'bus-stop' + (idx === 0 ? ' nearest-stop' : '');
        busStopElement.dataset.busStopCode = busStop.BusStopCode;
        
        // If this is the nearest stop, remove the highlight after 4 seconds
        if (idx === 0) {
            setTimeout(() => {
                busStopElement.classList.remove('nearest-stop');
            }, 4000);
        }
        
        // Build correct image path for GitHub Pages and Heroku
        const basePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
        const busIconPath = basePath + 'buszy/assets/bus-icon.png';
        
        const distanceBadgeHtml = idx === 0
            ? `<span class="nearest-stop-badge"><i class="fa-kit fa-lta-location"></i> Nearest · ${distance}</span>`
            : `<span class="distance-badge"><i class="fa-kit fa-lta-location"></i> ${distance}</span>`;

        busStopElement.innerHTML = `
            <div class="bus-stop-main-row">
                <div class="bus-stop-info">
                    <div class="bus-stop-code-row">
                        <div class="bus-stop-code">
                            <img src="${busIconPath}" alt="Bus Icon">
                            <span class="bus-stop-code-text">${busStop.BusStopCode}</span>
                        </div>
                        <span class="distance-mobile">${distanceBadgeHtml}</span>
                    </div>
                    <div class="bus-stop-details">
                    <span class="bus-stop-description">${busStop.Description}</span>&nbsp;&nbsp;|&nbsp;
                    <span class="road-name">${busStop.RoadName}</span>
                    &nbsp;&nbsp;&nbsp;<span class="distance-desktop">${distanceBadgeHtml}</span>
                    </div>
                </div>
                <div class="bus-stop-actions-controls">
                    <button class="bus-stop-collapsible-btn" title="Show options">
                        <i class="fa-regular fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="bus-stop-options-collapse">
                <div class="bus-stop-options-inner">
                    <div class="bus-stop-arrivals-summary card-content-art">
                        ${renderArrivalSummary([])}
                    </div>
                    <a href="${basePath}buszy/art.html?BusStopCode=${encodeURIComponent(busStop.BusStopCode)}" class="btn btn-busloc btn-sm open-art-btn" title="Open arrival timings page">
                        <i class="fa-solid fa-arrow-right"></i>
                    </a>
                </div>
            </div>
        `;

        // Long press variables
        let longPressTimer = null;
        let pinButton = null;
        let longPressTriggered = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let buttonJustCreated = false;

        // Function to remove the pin button
        function removePinButton() {
            if (pinButton && pinButton.parentNode) {
                pinButton.classList.remove('pin-btn-fade-in');
                pinButton.classList.add('pin-btn-fade-out');
                setTimeout(() => {
                    if (pinButton && pinButton.parentNode) {
                        pinButton.remove();
                    }
                    pinButton = null;
                    document.removeEventListener('click', dismissPinButton);
                }, 300);
            }
        }

        // Function to dismiss the button when clicking outside
        function dismissPinButton(event) {
            if (!buttonJustCreated && pinButton && event.target !== pinButton && !pinButton.contains(event.target) && !busStopElement.contains(event.target)) {
                removePinButton();
            }
        }

        // Add long press listener for pin/unpin button
        function startPinLongPress(x, y) {
            longPressTriggered = false;
            touchStartX = x;
            touchStartY = y;
            longPressTimer = setTimeout(() => {
                if (!pinButton) {
                    longPressTriggered = true;
                    const controlsDiv = busStopElement.querySelector('.bus-stop-actions-controls');
                    pinButton = document.createElement('button');
                    pinButton.className = (isPinned ? 'btn btn-unpin btn-2' : 'btn btn-toPin btn-2') + ' pin-btn-fade-in';
                    pinButton.innerHTML = isPinned ? '<i class="fa-regular fa-thumbtack-angle-slash"></i>' : '<i class="fa-regular fa-thumbtack-angle"></i>';
                    pinButton.style.order = '-1';
                    pinButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        togglePinBusStop(busStop, pinButton);
                        removePinButton();
                    });
                    controlsDiv.insertBefore(pinButton, controlsDiv.firstChild);
                    // Add global click listener to dismiss when clicking outside
                    buttonJustCreated = true;
                    setTimeout(() => { buttonJustCreated = false; }, 300);
                    document.addEventListener('click', dismissPinButton);
                }
            }, 500);
        }
        function endPinLongPress() {
            clearTimeout(longPressTimer);
            if (longPressTriggered) { longPressTriggered = false; return; }
        }
        busStopElement.addEventListener('touchstart', (event) => { startPinLongPress(event.touches[0].clientX, event.touches[0].clientY); }, { passive: true });
        busStopElement.addEventListener('touchend', () => { endPinLongPress(); });
        busStopElement.addEventListener('touchmove', (event) => {
            const dx = event.touches[0].clientX - touchStartX;
            const dy = event.touches[0].clientY - touchStartY;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(longPressTimer);
        });
        busStopElement.addEventListener('touchcancel', () => { clearTimeout(longPressTimer); });
        busStopElement.addEventListener('mousedown', (event) => { if (event.button === 0) startPinLongPress(event.clientX, event.clientY); });
        busStopElement.addEventListener('mouseup', () => { endPinLongPress(); });
        busStopElement.addEventListener('mouseleave', () => { clearTimeout(longPressTimer); });

        // Tap anywhere on the card to expand/collapse
        busStopElement.addEventListener('click', () => {
            if (longPressTriggered) { longPressTriggered = false; return; }
            collapseButton.click();
        });

        const collapseButton = busStopElement.querySelector('.bus-stop-collapsible-btn');
        const collapseSection = busStopElement.querySelector('.bus-stop-options-collapse');
        const summaryEl = busStopElement.querySelector('.bus-stop-arrivals-summary');
        collapseButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const isOpen = collapseSection.classList.contains('show');
            if (isOpen) {
                collapseSection.style.maxHeight = '0';
                collapseSection.style.opacity = '0';
                collapseSection.classList.remove('show');
                collapseButton.classList.remove('active');
            } else {
                collapseSection.getBoundingClientRect();
                collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                collapseSection.style.opacity = '1';
                collapseSection.classList.add('show');
                collapseButton.classList.add('active');

                summaryEl.innerHTML = '<div class="busNo-card d-flex justify-content-between"><span class="bus-time">--</span><span style="display: flex; align-items: center; gap: 0.3rem;">' + getLoadIcon('sea', 'SD') + '</span></div>';
                getArrivalSummaryForStop(busStop.BusStopCode).then((summary) => {
                    summaryEl.innerHTML = renderArrivalSummary(summary);
                    if (collapseSection.classList.contains('show')) {
                        collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                    }
                });
            }
        });

        collapseSection.querySelectorAll('a').forEach((anchor) => {
            anchor.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        });

        busStopsContainer.appendChild(busStopElement);
    });

    // Add refresh button to top right with proper layout
    // Remove any existing refresh button container first
    const existingHeader = busStopsContainer.parentElement.querySelector('[data-refresh-header]');
    if (existingHeader) {
        existingHeader.remove();
    }
    
    const headerDiv = document.createElement('div');
    headerDiv.setAttribute('data-refresh-header', 'true');
    headerDiv.style.cssText = 'display: flex; justify-content: flex-end; align-items: center; margin-bottom: 15px; width: 100%;';
    headerDiv.innerHTML = `
        <button id="refresh-nearby-btn" class="btn btn-rfetch">
            <i class="fa-regular fa-rotate"></i>
        </button>
    `;
    busStopsContainer.parentElement.insertBefore(headerDiv, busStopsContainer);

    // Apply current search filter if one exists
    const searchInput = document.getElementById('bus-stop-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        busStopsContainer.querySelectorAll('.bus-stop').forEach(item => {
            const code = item.querySelector('.bus-stop-code-text')?.textContent.toLowerCase() || '';
            const desc = item.querySelector('.bus-stop-description')?.textContent.toLowerCase() || '';
            item.style.display = (code.includes(query) || desc.includes(query)) ? '' : 'none';
        });
    }

    // Enable navigation
    const navbarContainer = document.querySelector('.navbar-container');
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
    if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
}

// Handle refresh button click using event delegation
function handleRefreshClick() {
    console.log('Refresh button clicked');
    const refreshBtn = document.getElementById('refresh-nearby-btn');
    if (!refreshBtn) {
        console.log('Refresh button not found');
        return;
    }
    
    const busStopsContainer = document.getElementById('bus-stops');
    const navbarContainer = document.querySelector('.navbar-container');
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    
    // Clear all cached data to force refresh
    console.log('Clearing cached data');
    sessionStorage.removeItem('nearbyBusStops');
    sessionStorage.removeItem('userLocation');
    
    // Disable navigation and show loading
    if (navbarContainer) navbarContainer.classList.add('nav-disabled');
    if (mobileBottomNav) mobileBottomNav.classList.add('nav-disabled');
    busStopsContainer.innerHTML = '<p class="pin-msg"><svg class="spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45"><animateTransform attributeName="transform" type="rotate" values="-90;810" keyTimes="0;1" dur="2s" repeatCount="indefinite" /><animate attributeName="stroke-dashoffset" values="0%;0%;-157.080%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" /><animate attributeName="stroke-dasharray" values="0% 314.159%;157.080% 157.080%;0% 314.159%" calcMode="spline" keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite" /></circle></svg>Refreshing nearby bus stops...</p>';
    
    // Force a new location request (don't use cached location)
    if (!navigator.geolocation) {
        console.error('Geolocation not supported');
        busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-circle-info"></i>Geolocation is not supported by your browser.</p>';
        if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
        return;
    }

    console.log('Requesting current position');
    navigator.geolocation.getCurrentPosition((position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.log('Got position:', latitude, longitude);
        sessionStorage.setItem('userLocation', JSON.stringify({ latitude, longitude }));
        fetchNearbyBusStops(latitude, longitude, () => {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Unable to refresh. Please try again.</p>';
            if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
            if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
        });
    }, (error) => {
        console.error('Geolocation error:', error);
        busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Unable to retrieve location. Please try again.<br><small style="font-size: 12px; opacity: 0.7;">Error: ' + error.message + '</small></p>';
        if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize default refresh interval if not already set (in seconds)
    if (!localStorage.getItem('refreshInterval')) {
        localStorage.setItem('refreshInterval', '2');
    }

    // Setup dynamic refresh interval for arrival times in nearby bus stops
    let refreshIntervalId = null;

    function startRefreshInterval() {
        // Clear existing interval if any
        if (refreshIntervalId !== null) {
            clearInterval(refreshIntervalId);
        }

        // Get refresh interval from localStorage (in seconds), default to 2 seconds
        const refreshSeconds = parseFloat(localStorage.getItem('refreshInterval') || '2');
        const refreshMs = refreshSeconds * 1000;

        // Start new interval - refresh only the arrival summaries in open sections
        refreshIntervalId = setInterval(() => {
            // Only refresh visible arrival summary cards
            document.querySelectorAll('.bus-stop-arrivals-summary.card-content-art').forEach((summaryEl) => {
                const busStopElement = summaryEl.closest('.bus-stop');
                if (busStopElement) {
                    const collapseSection = busStopElement.querySelector('.bus-stop-options-collapse');
                    const busStopCode = busStopElement.querySelector('.bus-stop-code-text')?.textContent;
                    if (busStopCode && collapseSection && collapseSection.classList.contains('show')) {
                        getArrivalSummaryForStop(busStopCode).then((arrivals) => {
                            summaryEl.innerHTML = renderArrivalSummary(arrivals);
                            if (collapseSection.classList.contains('show')) {
                                collapseSection.style.maxHeight = collapseSection.scrollHeight + 'px';
                            }
                        });
                    }
                }
            });
        }, refreshMs);
    }

    // Re-fetch when the tab becomes visible again after being backgrounded
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startRefreshInterval();
        }
    });

    // Listen for refresh interval changes from settings
    window.addEventListener('refreshIntervalChanged', (event) => {
        startRefreshInterval();
    });

    // Listen for storage changes from other tabs
    window.addEventListener('storage', (event) => {
        if (event.key === 'refreshInterval') {
            startRefreshInterval();
        }
    });

    // Start the refresh interval
    startRefreshInterval();

    // Select the "Search Bus Stop" button - look for links to index or ./
    const searchBusStopButton = document.querySelector('a[href="./"], a[href="index.html"]'); // Select the "Search Bus Stop" button
    const searchInput = document.getElementById('bus-stop-search'); // Select the search input field

    if (searchBusStopButton && searchInput) {
        searchBusStopButton.addEventListener('click', () => {
            searchInput.value = ''; // Clear the search bar
        });
    }

    // Search filtering for nearby tab
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            const busStopsContainer = document.getElementById('bus-stops');
            if (busStopsContainer) {
                busStopsContainer.querySelectorAll('.bus-stop').forEach(item => {
                    const code = item.querySelector('.bus-stop-code-text')?.textContent.toLowerCase() || '';
                    const desc = item.querySelector('.bus-stop-description')?.textContent.toLowerCase() || '';
                    item.style.display = (code.includes(query) || desc.includes(query)) ? '' : 'none';
                });
            }
        });
    }

    // Use event delegation for refresh button - listen on nearby-content parent
    const nearbyContent = document.getElementById('nearby-content');
    if (nearbyContent) {
        // console.log('Setting up refresh button event listener on nearby-content');
        nearbyContent.addEventListener('click', (event) => {
            if (event.target.closest('#refresh-nearby-btn')) {
                console.log('Refresh button click detected');
                handleRefreshClick();
            }
        });
    } else {
        console.warn('nearby-content container not found');
    }
});

// Populate the search bar with the BusStopCode from query parameters
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const busStopCode = urlParams.get('BusStopCode'); // Get the BusStopCode from the query parameters

    if (busStopCode) {
        const searchInput = document.getElementById('bus-stop-search'); // Select the search bar
        if (searchInput) {
            searchInput.value = busStopCode; // Populate the search bar with the BusStopCode
        }
    }
});

// Suppress context menu on the bus-stops container
// (prevents native long-press menu from interfering with touch interactions)
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#bus-stops')) e.preventDefault();
});