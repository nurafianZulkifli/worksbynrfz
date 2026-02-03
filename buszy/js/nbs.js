const apiUrl = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/nearby-bus-stops';

// Helper function to detect Instagram in-app browser
function isInstagramInAppBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    // Instagram in-app browsers include "Instagram" in their user agent
    return /Instagram/.test(userAgent);
}

// Unified logic for geolocation and bus stop loading
document.addEventListener('DOMContentLoaded', () => {
    const busStopsContainer = document.getElementById('bus-stops');
    busStopsContainer.innerHTML = '<p class="pin-msg"><span class="spinner"></span>Searching for nearby bus stops...</p>';

    // Disable navigation while loading
    const navbarContainer = document.querySelector('.navbar-container');
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    if (navbarContainer) navbarContainer.classList.add('nav-disabled');
    if (mobileBottomNav) mobileBottomNav.classList.add('nav-disabled');

    // Helper to enable navigation
    function enableNavigation() {
        if (navbarContainer) navbarContainer.classList.remove('nav-disabled');
        if (mobileBottomNav) mobileBottomNav.classList.remove('nav-disabled');
    }

    // Helper to show Instagram limitation message
    function showInstagramLimitationMessage() {
        const currentUrl = window.location.href;
        
        busStopsContainer.innerHTML = `
            <p class="pin-msg"><i class="fa-solid fa-triangle-exclamation"></i>Location access is not available in Instagram's in-app browser.</p>
            <button id="open-default-browser-btn" class="btn btn-rfetch" style="display: block; margin: 15px auto;">
                <i class="fa-solid fa-globe"></i> Open in Default Browser
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
            <p class="pin-msg"><i class="fa-solid fa-triangle-exclamation"></i>Unable to retrieve your location.</p>
            <button id="retry-location-btn" class="btn btn-rfetch" style="display: block; margin: 15px auto;">
                <i class="fa-solid fa-rotate"></i> Retry
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

        // Try cached location first, unless force is true
        const cachedLocation = sessionStorage.getItem('userLocation');
        if (cachedLocation && !force) {
            const { latitude, longitude } = JSON.parse(cachedLocation);
            fetchNearbyBusStops(latitude, longitude, showLocationError);
            return;
        }

        // Check if geolocation is available
        if (!navigator.geolocation) {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-solid fa-circle-info"></i>Geolocation is not supported by your browser.</p>';
            enableNavigation();
            return;
        }

        // Show spinner while waiting for location
        busStopsContainer.innerHTML = '<p class="pin-msg"><span class="spinner"></span>Searching for nearby bus stops...</p>';

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

    // Always try to fetch location on load
    requestLocation(true); // Always force location fetch on load

    // Add refresh event listener to re-fetch location
    window.addEventListener('pageshow', (event) => {
        requestLocation(true); // Always force location fetch on refresh or bfcache
    });
});

async function fetchNearbyBusStops(latitude, longitude, onError) {
    const busStopsContainer = document.getElementById('bus-stops');
    try {
        const response = await fetch(`${apiUrl}?latitude=${latitude}&longitude=${longitude}&radius=2`);
        if (!response.ok) {
            throw new Error('Failed to fetch nearby bus stops');
        }
        const busStops = await response.json();
        if (busStops && busStops.length > 0) {
            displayBusStops(busStops);
        } else {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-solid fa-circle-info"></i>No Bus Stops found nearby.</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        if (typeof onError === 'function') {
            onError();
        } else {
            busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-solid fa-triangle-exclamation"></i>Failed to fetch nearby bus stops. Please try again later.</p>';
        }
    }
}


// Function to toggle pin/unpin for a bus stop
function togglePinBusStop(busStop, pinButton) {
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
            pinButton.className = 'btn btn-toPin btn-nbs btn-sm';
            pinButton.innerHTML = '<i class="fa-sharp fa-regular fa-thumbtack-angle"></i>';
        }
    } else {
        // Pin the bus stop
        pinnedBusStops.push(busStop);
        localStorage.setItem('bookmarkedBusStops', JSON.stringify(pinnedBusStops));
        alert(`Bus Stop Pinned.`);

        // Update the button class and icon to "pin"
        pinButton.className = 'btn btn-unpin btn-nbs btn-sm';
        pinButton.innerHTML = '<i class="fa-solid fa-thumbtack-angle-slash"></i>';
    }
}

// Display the 3 nearest bus stops
function displayBusStops(busStops) {
    const busStopsContainer = document.getElementById('bus-stops');
    busStopsContainer.innerHTML = ''; // Clear previous results

    if (!busStops || busStops.length === 0) {
        busStopsContainer.innerHTML = '<p class="pin-msg"><i class="fa-solid fa-circle-info"></i>No Bus Stops found nearby.</p>';
        
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
        busStopElement.className = 'bus-stop';
        busStopElement.innerHTML = `
            <div class="bus-stop-info">
                <div class="bus-stop-code">
                    <img src="assets/bus-icon.png" alt="Bus Icon">
                    <span class="bus-stop-code-text">${busStop.BusStopCode}</span>
                </div>
                <div class="bus-stop-details">
                <span class="bus-stop-description">${busStop.Description}</span>&nbsp;&nbsp;|&nbsp;
                <span class="road-name">${busStop.RoadName}</span>&nbsp;|&nbsp;
                <span class="distance${idx === 0 ? ' distance-nearest' : ''}">${distance}</span>
                </div>
            </div>
            <button class="${isPinned ? 'btn btn-unpin btn-nbs btn-sm' : 'btn btn-toPin btn-nbs btn-sm'} pin-button">
                <i class="${isPinned ? 'fa-solid fa-thumbtack-angle-slash' : 'fa-sharp fa-regular fa-thumbtack-angle'}"></i>
            </button>
        `;

        // Add click event listener to the entire div
        busStopElement.addEventListener('click', () => {
            // Navigate to buszy.html with the BusStopCode as a query parameter
            window.location.href = `art.html?BusStopCode=${encodeURIComponent(busStop.BusStopCode)}`;
        });


        // Add click event listener to the "Pin" button
        const pinButton = busStopElement.querySelector('.pin-button');
        pinButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering the parent div's click event
            togglePinBusStop(busStop, pinButton); // Toggle pin/unpin
        });

        busStopsContainer.appendChild(busStopElement);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const searchBusStopButton = document.querySelector('a[href="buszy.html"]'); // Select the "Search Bus Stop" button
    const searchInput = document.getElementById('bus-stop-search'); // Select the search input field

    if (searchBusStopButton && searchInput) {
        searchBusStopButton.addEventListener('click', () => {
            searchInput.value = ''; // Clear the search bar
        });
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