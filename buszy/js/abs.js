
// Suppress context menu on the bus stops container
// (prevents native long-press menu from interfering with touch interactions)
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.list-group')) e.preventDefault();
});

// *****************************
// :: Service Parameter Redirect
// *****************************
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const serviceParam = urlParams.get('service');
    
    if (serviceParam) {
        console.log('Service parameter detected:', serviceParam);
        
        // Get base path - with fallback if PWAConfig not yet available
        let basePath = '/';
        if (window.PWAConfig && window.PWAConfig.basePath) {
            basePath = window.PWAConfig.basePath;
        } else {
            // Fallback: derive from current pathname
            const pathname = window.location.pathname;
            const parts = pathname.split('/').filter(p => p);
            if (parts.length >= 2 && parts[1] === 'buszy') {
                basePath = '/' + parts[0] + '/';
            }
        }
        
        // Redirect directly to bus-service.html using replace to avoid back button issues
        window.location.replace(`${basePath}buszy/bus-service.html?service=${encodeURIComponent(serviceParam)}`);
    }
})();


// *********************************
// :: Bus Stop Search and Pagination
// *********************************
document.addEventListener('DOMContentLoaded', async () => {
    // Clear saved state on fresh load or refresh; only restore on back/forward navigation
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    if (navType !== 'back_forward') {
        sessionStorage.removeItem('absBusSearch');
        sessionStorage.removeItem('absBusPage');
    }

    const searchInput = document.getElementById('bus-stop-search');
    const apiUrl = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops';
    const listGroup = document.querySelector('.list-group');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    const limit = 10;
    let allBusStops = [];
    let currentDisplayList = []; // Track the current list being displayed (full or filtered)
    let currentPage = 1;
    let totalPages = 1;
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
                const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
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
            if (sortByArrival) arrivals.sort((a, b) => new Date(a.eta) - new Date(b.eta));
            arrivalsSummaryCache.set(busStopCode, arrivals);
            return arrivals;
        } catch (error) {
            console.warn('[abs.js] Failed to load arrival summary:', error);
            arrivalsSummaryCache.set(busStopCode, []);
            return [];
        }
    }

    // Function to fetch all bus stops in batches
    async function fetchAllBusStops() {
        let allBusStops = [];
        let skip = 0;
        const batchSize = 500;
        let hasError = false;

        while (true) {
            try {
                console.log(`Fetching bus stops batch: skip=${skip}, batchSize=${batchSize}`);
                const response = await fetch(`${apiUrl}?$skip=${skip}&$top=${batchSize}`, {
                    method: 'GET',
                    headers: { accept: 'application/json' },
                });

                if (!response.ok) {
                    console.error(`API Error: ${response.status} ${response.statusText}`);
                    throw new Error(`HTTP Error: ${response.status}`);
                }

                const data = await response.json();
                
                // Validate response structure
                if (!data.value || !Array.isArray(data.value)) {
                    console.error('Invalid API response structure:', data);
                    hasError = true;
                    break;
                }
                
                allBusStops = allBusStops.concat(data.value);
                console.log(`Fetched ${data.value.length} stops, total so far: ${allBusStops.length}`);

                if (data.value.length < batchSize) {
                    console.log('Fetch complete - received less than batch size');
                    break;
                }

                skip += batchSize;
            } catch (error) {
                console.error('Error fetching bus stops batch:', error);
                hasError = true;
                break;
            }
        }
        
        if (allBusStops.length > 0) {
            console.log('Saving to localStorage:', allBusStops.length, 'stops');
            localStorage.setItem('allBusStops', JSON.stringify(allBusStops));
        } else if (hasError) {
            console.error('No bus stops fetched and fetch had errors');
        }
        
        return allBusStops;
    }

    // Function to display bus stops for the current page
    function displayBusStops(busStops, page) {
        // Ensure busStops is an array
        if (!Array.isArray(busStops)) {
            console.error('Invalid busStops data:', busStops);
            listGroup.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-triangle-exclamation"></i>Error: Invalid bus stops data. Please refresh the page.</p>';
            prevButton.style.display = 'none';
            nextButton.style.display = 'none';
            return;
        }
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedBusStops = busStops.slice(startIndex, endIndex);

        listGroup.innerHTML = '';
        if (busStops.length === 0) {
            listGroup.innerHTML = '<p class="pin-msg"><i class="fa-regular fa-face-frown"></i> No Bus Stops Found.</p>';
            prevButton.style.display = 'none';
            nextButton.style.display = 'none';
            return;
        }

        // Get bookmarked bus stops from localStorage
        const bookmarks = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];

        paginatedBusStops.forEach((busStop) => {
            const listItem = document.createElement('div');
            listItem.className = 'list-group-item';
            listItem.style.display = 'flex';
            listItem.style.flexDirection = 'column';
            listItem.style.alignItems = 'stretch';

            // Make the bus stop details clickable (navigation via open-art-btn in collapse)
            const link = document.createElement('a');
            link.href = 'javascript:void(0)';
            link.addEventListener('click', e => e.preventDefault());
            
            // Build correct image path for GitHub Pages and Heroku
            const basePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
            const busIconPath = basePath + 'buszy/assets/bus-icon.png';
            
            link.innerHTML = `
                    <div class="bus-stop-info">
                        <span class="bus-stop-code">
                            <img src="${busIconPath}" alt="Bus Icon">
                            <span class="bus-stop-code-text">${busStop.BusStopCode}</span>
                        </span>
                        <span class="bus-stop-description">${busStop.Description}</span>
                    </div>
                `;
            link.style.flexGrow = '1';
            link.style.textDecoration = 'none';
            link.style.color = 'inherit';

            const actionsToggleBtn = document.createElement('button');
            actionsToggleBtn.className = 'bus-stop-collapsible-btn';
            actionsToggleBtn.title = 'Show options';
            actionsToggleBtn.innerHTML = '<i class="fa-regular fa-chevron-down"></i>';
            actionsToggleBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const isOpen = actionCollapse.classList.contains('show');
                if (isOpen) {
                    actionCollapse.style.maxHeight = '0';
                    actionCollapse.style.opacity = '0';
                    actionCollapse.classList.remove('show');
                    actionsToggleBtn.classList.remove('active');
                } else {
                    actionCollapse.getBoundingClientRect();
                    actionCollapse.style.maxHeight = actionCollapse.scrollHeight + 'px';
                    actionCollapse.style.opacity = '1';
                    actionCollapse.classList.add('show');
                    actionsToggleBtn.classList.add('active');

                    const summaryEl = actionCollapse.querySelector('.bus-stop-arrivals-summary');
                    summaryEl.innerHTML = '<div class="busNo-card d-flex justify-content-between"><span class="bus-time">--</span><span style="display: flex; align-items: center; gap: 0.3rem;">' + getLoadIcon('sea', 'SD') + '</span></div>';
                    getArrivalSummaryForStop(busStop.BusStopCode).then((summary) => {
                        summaryEl.innerHTML = renderArrivalSummary(summary);
                        if (actionCollapse.classList.contains('show')) {
                            actionCollapse.style.maxHeight = actionCollapse.scrollHeight + 'px';
                        }
                    });
                }
            });

            const controls = document.createElement('div');
            controls.className = 'bus-stop-actions-controls';
            controls.appendChild(actionsToggleBtn);

            const mainRow = document.createElement('div');
            mainRow.className = 'bus-stop-main-row';
            mainRow.appendChild(link);
            mainRow.appendChild(controls);

            // Long press variables for bookmark button
            let longPressTimer = null;
            let bookmarkButton = null;
            let longPressTriggered = false;
            let touchStartX = 0;
            let touchStartY = 0;
            let buttonJustCreated = false;
            const isPinned = bookmarks.some((b) => b.BusStopCode === busStop.BusStopCode);

            // Function to remove the bookmark button
            function removeBookmarkButton() {
                if (bookmarkButton && bookmarkButton.parentNode) {
                    bookmarkButton.classList.remove('pin-btn-fade-in');
                    bookmarkButton.classList.add('pin-btn-fade-out');
                    setTimeout(() => {
                        if (bookmarkButton && bookmarkButton.parentNode) {
                            bookmarkButton.remove();
                        }
                        bookmarkButton = null;
                        document.removeEventListener('click', dismissBookmarkButton);
                    }, 300);
                }
            }

            // Function to dismiss the button when clicking outside
            function dismissBookmarkButton(event) {
                if (!buttonJustCreated && bookmarkButton && event.target !== bookmarkButton && !bookmarkButton.contains(event.target) && !listItem.contains(event.target)) {
                    removeBookmarkButton();
                }
            }

            // Add long press listener for bookmark button
            function startBookmarkLongPress(x, y) {
                longPressTriggered = false;
                touchStartX = x;
                touchStartY = y;
                longPressTimer = setTimeout(() => {
                    if (!bookmarkButton) {
                        longPressTriggered = true;
                        bookmarkButton = document.createElement('button');
                        bookmarkButton.innerHTML = isPinned ? '<i class="fa-regular fa-thumbtack-angle-slash"></i>' : '<i class="fa-regular fa-thumbtack-angle"></i>';
                        bookmarkButton.className = (isPinned ? 'btn btn-unpin btn-sm' : 'btn btn-toPin btn-sm') + ' pin-btn-fade-in';
                        bookmarkButton.style.order = '-1';
                        bookmarkButton.addEventListener('click', (event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            togglePinned(busStop, bookmarkButton);
                            removeBookmarkButton();
                        });
                        controls.insertBefore(bookmarkButton, controls.firstChild);
                        // Add global click listener to dismiss when clicking outside
                        buttonJustCreated = true;
                        setTimeout(() => { buttonJustCreated = false; }, 300);
                        document.addEventListener('click', dismissBookmarkButton);
                    }
                }, 500);
            }
            function endBookmarkLongPress() {
                clearTimeout(longPressTimer);
            }
            listItem.addEventListener('touchstart', (event) => { startBookmarkLongPress(event.touches[0].clientX, event.touches[0].clientY); }, { passive: true });
            listItem.addEventListener('touchend', () => { endBookmarkLongPress(); });
            listItem.addEventListener('touchmove', (event) => {
                const dx = event.touches[0].clientX - touchStartX;
                const dy = event.touches[0].clientY - touchStartY;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(longPressTimer);
            });
            listItem.addEventListener('touchcancel', () => { clearTimeout(longPressTimer); });
            listItem.addEventListener('mousedown', (event) => { if (event.button === 0) startBookmarkLongPress(event.clientX, event.clientY); });
            listItem.addEventListener('mouseup', () => { endBookmarkLongPress(); });
            listItem.addEventListener('mouseleave', () => { clearTimeout(longPressTimer); });

            const actionCollapse = document.createElement('div');
            actionCollapse.className = 'bus-stop-options-collapse';
            const actionBasePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
            actionCollapse.innerHTML = `
                <div class="bus-stop-options-inner">
                    <div class="bus-stop-arrivals-summary card-content-art">
                        ${renderArrivalSummary([])}
                    </div>
                    <a href="${actionBasePath}buszy/art.html?BusStopCode=${encodeURIComponent(busStop.BusStopCode)}" class="btn btn-busloc btn-sm open-art-btn" title="Open arrival timings page">
                        <i class="fa-solid fa-arrow-right"></i>
                    </a>
                </div>
            `;

            actionCollapse.addEventListener('click', e => e.stopPropagation());
            listItem.appendChild(mainRow);
            listItem.appendChild(actionCollapse);
            listItem.addEventListener('click', () => actionsToggleBtn.click());
            listGroup.appendChild(listItem);
        });

        prevButton.style.display = page > 1 ? 'inline-block' : 'none';
        nextButton.style.display = page < totalPages ? 'inline-block' : 'none';
    }

    // Function to toggle a bookmark
    function togglePinned(busStop, button) {
        const bookmarks = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];
        const bookmarkIndex = bookmarks.findIndex((b) => b.BusStopCode === busStop.BusStopCode);

        if (bookmarkIndex === -1) {
            // Add the pinned bus stop
            bookmarks.push(busStop);
            localStorage.setItem('bookmarkedBusStops', JSON.stringify(bookmarks));
            alert('Bus Stop Pinned.');

            // Update the button to indicate the bus stop is pinned
            button.innerHTML = '<i class="fa-regular fa-thumbtack-angle-slash"></i>';
            button.classList.remove('btn-toPin');
            button.classList.add('btn-unpin');
        } else {
            // Confirm before unpinning
            const confirmUnpin = confirm('Are you sure you want to unpin this bus stop?');
            if (!confirmUnpin) return;

            // Remove the pinned bus stop
            bookmarks.splice(bookmarkIndex, 1);
            localStorage.setItem('bookmarkedBusStops', JSON.stringify(bookmarks));
            alert('Bus Stop Unpinned.');

            // Update the button to indicate the bus stop is not pinned
            button.innerHTML = '<i class="fa-sharp fa-regular fa-thumbtack-angle"></i>';
            button.classList.remove('btn-unpin');
            button.classList.add('btn-toPin');
        }
    }

    // Load bus stops from localStorage or fetch from API
    const cachedBusStops = localStorage.getItem('allBusStops');
    let loadedFromCache = false;
    
    if (cachedBusStops) {
        try {
            const parsed = JSON.parse(cachedBusStops);
            if (Array.isArray(parsed) && parsed.length > 0) {
                allBusStops = parsed;
                loadedFromCache = true;
                console.log('Loaded bus stops from cache:', allBusStops.length);
            } else {
                console.warn('Cached data is not a valid array or is empty, fetching fresh data...');
                localStorage.removeItem('allBusStops');
            }
        } catch (parseError) {
            console.warn('Failed to parse cached bus stops, fetching fresh data:', parseError);
            localStorage.removeItem('allBusStops');
        }
    }
    
    // Fetch from API if not loaded from cache
    if (!loadedFromCache) {
        console.log('Fetching bus stops from API...');
        allBusStops = await fetchAllBusStops();
        if (!Array.isArray(allBusStops) || allBusStops.length === 0) {
            console.error('Failed to fetch or cache bus stops');
        }
    }

    // Supplement with destination-codes.json entries not already in API data
    try {
        const basePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
        const destResponse = await fetch(basePath + 'buszy/json/destination-codes.json');
        if (destResponse.ok) {
            const destCodes = await destResponse.json();
            const existingCodes = new Set(allBusStops.map(s => s.BusStopCode));
            const destEntries = Object.entries(destCodes)
                .filter(([code]) => !existingCodes.has(code))
                .map(([code, data]) => ({
                    BusStopCode: code,
                    Description: typeof data === 'string' ? data : (data.description || code),
                    RoadName: typeof data === 'string' ? '' : (data.road || '')
                }));
            if (destEntries.length > 0) {
                allBusStops = [...allBusStops, ...destEntries];
                console.log(`Supplemented with ${destEntries.length} destination-code entries`);
            }
        }
    } catch (e) {
        console.warn('Could not load destination-codes.json:', e);
    }

    totalPages = Math.ceil(allBusStops.length / limit);
    currentDisplayList = allBusStops; // Initialize display list to all stops
    
    // Restore search input value and apply filter if it exists
    const savedSearch = sessionStorage.getItem('absBusSearch');
    if (savedSearch) {
        searchInput.value = savedSearch;
        const clearButton = document.getElementById('search-clear');
        if (clearButton) {
            clearButton.style.display = 'flex';
        }
        const query = savedSearch.toLowerCase();
        const filteredBusStops = allBusStops.filter((busStop) =>
            busStop.BusStopCode.toLowerCase().includes(query) ||
            busStop.Description.toLowerCase().includes(query)
        );
        currentDisplayList = filteredBusStops;
        totalPages = Math.ceil(filteredBusStops.length / limit);
        currentPage = parseInt(sessionStorage.getItem('absBusPage')) || 1;
        currentPage = Math.min(currentPage, totalPages);
    }
    
    displayBusStops(currentDisplayList, currentPage);

    // Pagination
    prevButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            const scrollPos = window.scrollY || document.documentElement.scrollTop;
            currentPage--;
            sessionStorage.setItem('absBusPage', currentPage);
            displayBusStops(currentDisplayList, currentPage);
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollPos);
            });
        }
    });

    nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            const scrollPos = window.scrollY || document.documentElement.scrollTop;
            currentPage++;
            sessionStorage.setItem('absBusPage', currentPage);
            displayBusStops(currentDisplayList, currentPage);
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollPos);
            });
        }
    });

    // Search functionality
    const clearButton = document.getElementById('search-clear');
    
    searchInput.addEventListener('input', (event) => {
        const query = event.target.value.toLowerCase();
        let filteredBusStops;
        
        // Save search to sessionStorage
        sessionStorage.setItem('absBusSearch', event.target.value);
        
        // Show/hide clear button
        if (clearButton) {
            clearButton.style.display = event.target.value.length > 0 ? 'flex' : 'none';
        }
        
        // Switch to "All" tab when searching
        const allTab = document.querySelector('.category-tab[data-category="all"]');
        if (allTab && event.target.value.length > 0) {
            allTab.click();
        }
        
        if (query.trim() === '') {
            // If search is empty, show all bus stops
            filteredBusStops = allBusStops;
        } else {
            // Filter based on search query
            filteredBusStops = allBusStops.filter((busStop) =>
                busStop.BusStopCode.toLowerCase().includes(query) ||
                busStop.Description.toLowerCase().includes(query)
            );
        }
        
        // Update the current display list and pagination
        currentDisplayList = filteredBusStops;
        totalPages = Math.ceil(filteredBusStops.length / limit);
        currentPage = 1;
        displayBusStops(currentDisplayList, currentPage);
    });

    // Clear button functionality
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.style.display = 'none';
            sessionStorage.removeItem('absBusSearch');
            sessionStorage.removeItem('absBusPage');

            // Trigger input event to update all search filters naturally
            const inputEvent = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(inputEvent);

            // Hide bus service tab if visible
            const busServiceTab = document.getElementById('bus-service-tab');
            if (busServiceTab) busServiceTab.style.display = 'none';

            // Reset scroll indicator after layout settles
            setTimeout(() => {
                const scrollIndicator = document.getElementById('scroll-indicator');
                const categoryTabs = document.getElementById('category-tabs');
                if (scrollIndicator && categoryTabs) {
                    categoryTabs.scrollLeft = 0;
                    if (typeof window.updateScrollIndicator === 'function') {
                        window.updateScrollIndicator();
                    }
                }
            }, 100);
        });
    }
});


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
        "Fetching Bus Stop Data...",
        "This might take roughly a minute...",
        "Do re-fetch your data once in a while.",
        "This ensures you are up to date...",
        "Once loaded, everything will be cached.",
        "Cached data means faster load times!",
        "Do not navigate away during loading."
    ];

    const loadingMessageElement = document.getElementById('loading-message');
    if (!loadingMessageElement) return;
    let messageIndex = 0;

    // Function to update the loading message
    const updateLoadingMessage = () => {
        loadingMessageElement.innerHTML = `
                <svg class="spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="status" style="margin-right: 0.5em;">
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