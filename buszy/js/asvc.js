
// *****************************
// :: Bus Services Listing
// *****************************
let allServices = [];
let currentPage = 1;
let totalPages = 1;
const limit = 10;
let filteredServices = [];
let isSearchActive = false;

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

document.addEventListener('DOMContentLoaded', function() {
    // Clear saved state on fresh load or refresh; only restore on back/forward navigation
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    if (navType !== 'back_forward') {
        sessionStorage.removeItem('absvcPage');
        sessionStorage.removeItem('absvcSearch');
    }

    loadBusServices();
    setupSearchFilter();

    // Restore search input value from sessionStorage (state saved before navigating away)
    const savedSearch = sessionStorage.getItem('absvcSearch');
    if (savedSearch) {
        const searchInput = document.getElementById('service-search');
        if (searchInput) {
            searchInput.value = savedSearch;
            const clearButton = document.getElementById('search-clear');
            if (clearButton) clearButton.style.display = 'flex';
        }
    }
});

function loadBusServices() {
    const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
    const basePath = getBasePath();
    const jsonPath = basePath + 'buszy/json/bus-service-data.json';
    
    console.log('Loading services from local JSON:', jsonPath);
    
    // First load local JSON
    fetch(jsonPath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load JSON: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            allServices = data;
            console.log('Loaded', allServices.length, 'services from local JSON');
            
            // Now try to fetch operator data from API
            console.log('Attempting to fetch operator data from API:', `${API_BASE}/bus-services`);
            return fetch(`${API_BASE}/bus-services`)
                .then(apiResponse => {
                    if (!apiResponse.ok) {
                        console.warn('API response not OK:', apiResponse.status);
                        return null;
                    }
                    return apiResponse.json();
                })
                .then(apiData => {
                    if (apiData) {
                        console.log('API data received:', apiData);
                        
                        // API response is expected to be an array
                        const apiArray = Array.isArray(apiData) ? apiData : (apiData.bus_services || apiData.services || apiData.data || []);
                        console.log('API array extracted:', apiArray);
                        console.log('API array length:', apiArray.length);
                        
                        if (Array.isArray(apiArray) && apiArray.length > 0) {
                            // Build operator map from API
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
                            allServices.forEach(service => {
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
                    }
                })
                .catch(apiError => {
                    console.warn('API fetch failed - using local data only:', apiError);
                });
        })
        .then(() => {
            // Apply saved search filter if one exists, otherwise show full list
            const savedSearch = sessionStorage.getItem('absvcSearch');
            if (savedSearch) {
                const searchTerm = savedSearch.toLowerCase();
                const filtered = allServices.filter(service => {
                    const serviceNum = (service.n || '').toLowerCase();
                    const type = (service.t || '').toLowerCase();
                    const start = (service.ts || '').toLowerCase();
                    const end = (service.te || '').toLowerCase();
                    const remarks = (service.r || '').toLowerCase();
                    return serviceNum.includes(searchTerm) ||
                           type.includes(searchTerm) ||
                           start.includes(searchTerm) ||
                           end.includes(searchTerm) ||
                           remarks.includes(searchTerm);
                });
                isSearchActive = true;
                // Restore saved page within the filtered results
                displayServices(filtered, false);
            } else {
                displayServices(allServices);
            }
            const loadingMessage = document.getElementById('loading-message');
            if (loadingMessage) {
                loadingMessage.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Error loading bus services:', error);
            const loadingMessage = document.getElementById('loading-message');
            if (loadingMessage) {
                loadingMessage.innerHTML = '<p style="color: red; margin-bottom: 0rem;"><i class="fa-regular fa-circle-exclamation"></i> Error loading bus services. Please try again later.</p>';
            }
        });
}

function naturalSort(a, b) {
    // Extract service numbers
    const aNum = (a.n || '').toString();
    const bNum = (b.n || '').toString();
    
    // Split into numeric and alphabetic parts
    const aParts = aNum.match(/(\d+|\D+)/g) || [];
    const bParts = bNum.match(/(\d+|\D+)/g) || [];
    
    // Compare each part
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || '';
        const bPart = bParts[i] || '';
        
        // Check if both parts are numeric
        const aIsNum = /^\d+$/.test(aPart);
        const bIsNum = /^\d+$/.test(bPart);
        
        if (aIsNum && bIsNum) {
            // Compare numerically
            const aVal = parseInt(aPart, 10);
            const bVal = parseInt(bPart, 10);
            if (aVal !== bVal) {
                return aVal - bVal;
            }
        } else {
            // Compare alphabetically
            const comparison = aPart.localeCompare(bPart);
            if (comparison !== 0) {
                return comparison;
            }
        }
    }
    
    return 0;
}

function displayServices(services, isFiltered = false) {
    const container = document.getElementById('services-container');
    
    // Update service count display FIRST (before any early returns)
    const countElement = document.getElementById('service-count');
    if (countElement) {
        countElement.textContent = `(${services.length})`;
    }
    
    if (services.length === 0) {
        container.innerHTML = '<div class="no-services"><p><i class="fa-regular fa-circle-info"></i> No bus services found.</p></div>';
        document.getElementById('prev-button').style.display = 'none';
        document.getElementById('next-button').style.display = 'none';
        return;
    }
    
    // Sort services by service number using natural sort
    const sortedServices = services.sort(naturalSort);
    
    // Store filtered services
    filteredServices = sortedServices;
    totalPages = Math.ceil(sortedServices.length / limit);

    if (isFiltered) {
        // Search changed — always start at page 1 and clear saved page
        currentPage = 1;
        sessionStorage.removeItem('absvcPage');
    } else {
        // Full list load — restore saved page if available
        const savedPage = parseInt(sessionStorage.getItem('absvcPage')) || 1;
        currentPage = Math.min(savedPage, totalPages);
    }
    
    // Display current page
    displayPage(currentPage);
    
    // Setup pagination buttons
    setupPaginationButtons();
}

function createServiceCard(service) {
    const operator = service.op || 'Transit';
    const type = service.t || 'Regular';
    const startTerminal = service.ts || 'N/A';
    const endTerminal = service.te || 'N/A';
    const loopPoint = service.lp ? ` / Loop: ${service.lp}` : '';
    const hours = service.h || 'N/A';
    const frequency = service.f || 'N/A';
    const fare = service.c || 'N/A';
    const remarks = service.r || '';
    
    // Build frequency display
    let frequencyDisplay = `${frequency} mins`;
    if (service.freq_detail) {
        frequencyDisplay = '<i class="fa-regular fa-circle-info" style="margin-right: 0.5rem;"></i>Different frequencies by time';
    }
    
    // Determine service type class based on operator
    let typeClass = '';
    if (operator.toUpperCase() === 'GAS') {
        typeClass = 'service-type-gas';
    } else if (operator.toUpperCase() === 'SBST') {
        typeClass = 'service-type-sbst';
    } else if (operator.toUpperCase() === 'TTS') {
        typeClass = 'service-type-tts';
    } else if (operator.toUpperCase() === 'SMRT') {
        typeClass = 'service-type-smrt';
    }
    
    return `
        <a href="bus-service.html?service=${encodeURIComponent(service.n)}" style="text-decoration: none; color: inherit;">
            <div class="bus-service-card">
                <div class="service-header">
                    <div class="service-number">${service.n}</div>
                    <div class="service-type">${type}</div>
                    ${operator !== 'Transit' ? `<div class="service-type ${typeClass}">${operator}</div>` : ''}
                </div>
                
                <div class="service-routes">
                    ${startTerminal} → ${endTerminal}${loopPoint}
                </div>
            </div>
        </a>
    `;
}

function displayPage(page) {
    const container = document.getElementById('services-container');
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedServices = filteredServices.slice(startIndex, endIndex);
    
    container.innerHTML = paginatedServices.map(service => createServiceCard(service)).join('');
    sessionStorage.setItem('absvcPage', page);
}

function setupPaginationButtons() {
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    
    if (!prevButton || !nextButton) return;
    
    // Remove previous event listeners by cloning
    const newPrevButton = prevButton.cloneNode(true);
    const newNextButton = nextButton.cloneNode(true);
    prevButton.parentNode.replaceChild(newPrevButton, prevButton);
    nextButton.parentNode.replaceChild(newNextButton, nextButton);
    
    const updatedPrevButton = document.getElementById('prev-button');
    const updatedNextButton = document.getElementById('next-button');
    
    // Update buttons visibility based on current page
    updatedPrevButton.style.display = currentPage > 1 ? 'inline-block' : 'none';
    updatedNextButton.style.display = currentPage < totalPages ? 'inline-block' : 'none';
    
    // Add event listeners
    updatedPrevButton.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            displayPage(currentPage);
            setupPaginationButtons();
        }
    });
    
    updatedNextButton.addEventListener('click', function() {
        if (currentPage < totalPages) {
            currentPage++;
            displayPage(currentPage);
            setupPaginationButtons();
        }
    });
}

function setupSearchFilter() {
    const searchInput = document.getElementById('service-search');
    const clearButton = document.getElementById('search-clear');
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            sessionStorage.setItem('absvcSearch', e.target.value);

            if (clearButton) {
                clearButton.style.display = e.target.value.length > 0 ? 'flex' : 'none';
            }
            
            const filtered = allServices.filter(service => {
                const serviceNum = (service.n || '').toLowerCase();
                const type = (service.t || '').toLowerCase();
                const start = (service.ts || '').toLowerCase();
                const end = (service.te || '').toLowerCase();
                const remarks = (service.r || '').toLowerCase();
                
                return serviceNum.includes(searchTerm) ||
                       type.includes(searchTerm) ||
                       start.includes(searchTerm) ||
                       end.includes(searchTerm) ||
                       remarks.includes(searchTerm);
            });
            
            // Reset to page 1 when searching
            currentPage = 1;
            isSearchActive = searchTerm.length > 0;
            
            // Display filtered results with pagination
            displayServices(filtered, true);
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            clearButton.style.display = 'none';
            sessionStorage.removeItem('absvcSearch');
            const inputEvent = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(inputEvent);
        });
    }
}


// *******************************
// :: Hide Keyboard on Outside Tap
// *******************************
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('touchstart', (event) => {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.tagName === 'INPUT' && !activeElement.contains(event.target)) {
            activeElement.blur();
        }
    });
});


// ****************************
// :: Loading Messages Rotation
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const loadingMessages = [
        "Loading Bus Services...",
        "Fetching service data...",
        "Preparing routes...",
        "Almost done..."
    ];

    const loadingMessageElement = document.getElementById('loading-message');
    if (!loadingMessageElement) return;
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
        messageIndex = (messageIndex + 1) % loadingMessages.length;
    };

    // Show the first message immediately
    updateLoadingMessage();

    // Change the message every 4 seconds
    setInterval(updateLoadingMessage, 4000);
});

// ****************************
// :: Mobile Swipe Navigation for Tabs
// ****************************

// Only enable swipe navigation for touches below the tabs and not when keyboard is shown
(function () {
    let touchStartX = 0;
    let touchEndX = 0;
    let isSwiping = false;
    const minSwipeDistance = 50; // Minimum px for swipe
    const tabLinks = Array.from(document.querySelectorAll('#scrollable-tabs a'));
    const tabsElem = document.getElementById('scrollable-tabs');
    const tabsContainer = tabsElem ? tabsElem.parentElement : null;
    if (!tabLinks.length || !tabsElem || !tabsContainer) return;

    // Add transition style to the container
    tabsContainer.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1)';

    // Helper: check if an input or textarea is focused (keyboard likely open)
    function isKeyboardShown() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    // Only respond to swipes below the tabs
    function isBelowTabs(y) {
        const rect = tabsElem.getBoundingClientRect();
        return y > rect.bottom;
    }

    function handleGesture() {
        if (touchEndX < touchStartX - minSwipeDistance) {
            // Swipe left: go to next tab
            const current = tabLinks.findIndex(link => link.classList.contains('active'));
            if (current !== -1 && current < tabLinks.length - 1) {
                animateSwipe(-1, () => {
                    window.location.href = tabLinks[current + 1].href;
                });
            }
        }
        if (touchEndX > touchStartX + minSwipeDistance) {
            // Swipe right: go to previous tab
            const current = tabLinks.findIndex(link => link.classList.contains('active'));
            if (current > 0) {
                animateSwipe(1, () => {
                    window.location.href = tabLinks[current - 1].href;
                });
            }
        }
    }

    function animateSwipe(direction, callback) {
        if (!tabsContainer) return callback();
        isSwiping = true;
        tabsContainer.style.transform = `translateX(${direction * 60}px)`;
        setTimeout(() => {
            tabsContainer.style.transform = '';
            isSwiping = false;
            callback();
        }, 250);
    }

    let swipeStartY = 0;

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            // Only start swipe if below tabs and keyboard is not shown
            swipeStartY = e.touches[0].clientY;
            if (isBelowTabs(swipeStartY) && !isKeyboardShown() && !isSwiping) {
                touchStartX = e.touches[0].clientX;
            } else {
                touchStartX = null;
            }
        }
    });
    document.addEventListener('touchend', function (e) {
        if (e.changedTouches.length === 1 && touchStartX !== null) {
            touchEndX = e.changedTouches[0].clientX;
            handleGesture();
        }
        touchStartX = null;
    });
})();