// ****************************
// :: Bookmark (Pin) Management for Bus Stops
// ****************************
document.addEventListener('DOMContentLoaded', async () => {
    const bookmarksContainer = document.getElementById('bookmarks-container');

    // ── Drag to Reorder Variables ────────────────────────────────
    let draggableItem = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let itemsGap = 0;
    let items = [];
    let prevRect = {};
    let autoScrollLoop = null;
    let dragLongPressTimer = null;
    let longPressItem = null;
    let justFinishedDragging = false;
    let dragModeActive = false;
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
                return window.SharedArrivals.formatArrivalTimeOrArr(isoString, new Date(), false);
            } catch (e) {
                // fallback to local implementation
            }
        }
        if (!isoString) return '--';
        const arrivalTime = new Date(isoString);
        if (Number.isNaN(arrivalTime.getTime())) return '--';

        const now = new Date();
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

    function renderArrivalSummary(arrivals, hiddenServices = []) {
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
        const visible = arrivals.filter(a => !hiddenServices.includes(a.serviceNo));
        const hiddenCount = hiddenServices.filter(s => arrivals.some(a => a.serviceNo === s)).length;
        const rows = visible.length
            ? visible.map(a => `
                <div class="busNo-card d-flex justify-content-between">
                    <span class="arrival-svc-no arrival-svc-toggle" data-svc="${a.serviceNo}" title="Tap to hide">${a.serviceNo}</span>
                    <span class="bus-time">${formatArrivalTimeStyled(a.eta)}</span>
                    <span style="display: flex; align-items: center; gap: 0.3rem;">${getLoadIcon(a.load, a.type)}</span>
                </div>
            `).join('')
            : `<div class="busNo-card"><span class="arrival-all-hidden">All hidden</span></div>`;
        return rows;
    }

    function applyArrivalFilter(summaryEl, allArrivals, busStopCode, actionCollapse) {
        const hiddenKey = `pinnedHiddenServices_${busStopCode}`;
        const hidden = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
        summaryEl.innerHTML = renderArrivalSummary(allArrivals, hidden);

        // Update footer reset slot
        const resetSlot = actionCollapse.querySelector('.arrival-filter-reset-slot');
        if (resetSlot) {
            const hiddenCount = hidden.filter(s => allArrivals.some(a => a.serviceNo === s)).length;
            if (hiddenCount > 0) {
                resetSlot.innerHTML = `<span class="arrival-filter-reset">${hiddenCount} hidden &middot; Show all</span>`;
                resetSlot.querySelector('.arrival-filter-reset').addEventListener('click', e => {
                    e.stopPropagation();
                    localStorage.removeItem(hiddenKey);
                    applyArrivalFilter(summaryEl, allArrivals, busStopCode, actionCollapse);
                    if (actionCollapse.classList.contains('show')) {
                        actionCollapse.style.maxHeight = actionCollapse.scrollHeight + 'px';
                    }
                });
            } else {
                resetSlot.innerHTML = '';
            }
        }
        summaryEl.querySelectorAll('.arrival-svc-toggle').forEach(badge => {
            badge.addEventListener('click', e => {
                e.stopPropagation();
                const svc = badge.dataset.svc;
                if (!confirm(`Hide service ${svc} from this stop?`)) return;
                const cur = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
                if (!cur.includes(svc)) cur.push(svc);
                localStorage.setItem(hiddenKey, JSON.stringify(cur));
                applyArrivalFilter(summaryEl, allArrivals, busStopCode, actionCollapse);
                if (actionCollapse.classList.contains('show')) {
                    actionCollapse.style.maxHeight = actionCollapse.scrollHeight + 'px';
                }
            });
        });
        const resetBtn = summaryEl.querySelector('.arrival-filter-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', e => {
                e.stopPropagation();
                localStorage.removeItem(hiddenKey);
                applyArrivalFilter(summaryEl, allArrivals, busStopCode, actionCollapse);
                if (actionCollapse.classList.contains('show')) {
                    actionCollapse.style.maxHeight = actionCollapse.scrollHeight + 'px';
                }
            });
        }
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
                        serviceNo: service.ServiceNo || service.ServiceNo,
                        eta: service.NextBus.EstimatedArrival,
                        load: service.NextBus.Load,
                        type: service.NextBus.Type
                    });
                }
            });

            arrivals.sort((a, b) => new Date(a.eta) - new Date(b.eta));
            const sortByArrival = localStorage.getItem('sortByArrival') !== 'disabled';
            if (sortByArrival) {
                arrivals.sort((a, b) => new Date(a.eta) - new Date(b.eta));
            }
            arrivalsSummaryCache.set(busStopCode, arrivals);
            return arrivals;
        } catch (error) {
            console.warn('[pinned.js] Failed to load arrival summary:', error);
            arrivalsSummaryCache.set(busStopCode, []);
            return [];
        }
    }

    // ── Helper Functions ─────────────────────────────────────────
    function getAllItems() {
        if (!items?.length) {
            items = Array.from(bookmarksContainer.querySelectorAll('.list-group-item'));
        }
        return items;
    }

    function getIdleItems() {
        return getAllItems().filter((item) => item.classList.contains('is-idle'));
    }

    function isItemAbove(item) {
        return item.hasAttribute('data-is-above');
    }

    function isItemToggled(item) {
        return item.hasAttribute('data-is-toggled');
    }

    function setItemsGap() {
        if (getIdleItems().length <= 1) {
            itemsGap = 0;
            return;
        }

        const item1 = getIdleItems()[0];
        const item2 = getIdleItems()[1];

        const item1Rect = item1.getBoundingClientRect();
        const item2Rect = item2.getBoundingClientRect();

        itemsGap = Math.abs(item1Rect.bottom - item2Rect.top);
    }

    function disablePageScroll() {
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
    }

    function enablePageScroll() {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
    }

    function startAutoScroll(direction) {
        if (autoScrollLoop) cancelAnimationFrame(autoScrollLoop);
        
        const scrollStep = 10;
        
        function scroll() {
            window.scrollBy(0, direction * scrollStep);
            autoScrollLoop = requestAnimationFrame(scroll);
        }
        
        autoScrollLoop = requestAnimationFrame(scroll);
    }

    function stopAutoScroll() {
        if (autoScrollLoop) {
            cancelAnimationFrame(autoScrollLoop);
            autoScrollLoop = null;
        }
    }

    function initItemsState() {
        getIdleItems().forEach((item, i) => {
            if (getAllItems().indexOf(draggableItem) > i) {
                item.dataset.isAbove = '';
            }
        });
    }

    function initDraggableItem() {
        draggableItem.classList.remove('is-idle');
        draggableItem.classList.add('is-draggable');
    }

    function unsetDraggableItem() {
        draggableItem.style.transform = '';
        draggableItem.classList.remove('is-draggable');
        draggableItem.classList.add('is-idle');
        draggableItem = null;
    }

    function unsetItemState() {
        getAllItems().forEach((item) => {
            delete item.dataset.isAbove;
            delete item.dataset.isToggled;
            item.style.transform = '';
        });
    }

    function updateIdleItemsStateAndPosition() {
        const draggableItemRect = draggableItem.getBoundingClientRect();
        const draggableItemY = draggableItemRect.top + draggableItemRect.height / 2;

        // Update state
        getIdleItems().forEach((item) => {
            const itemRect = item.getBoundingClientRect();
            const itemY = itemRect.top + itemRect.height / 2;
            if (isItemAbove(item)) {
                if (draggableItemY <= itemY) {
                    item.dataset.isToggled = '';
                } else {
                    delete item.dataset.isToggled;
                }
            } else {
                if (draggableItemY >= itemY) {
                    item.dataset.isToggled = '';
                } else {
                    delete item.dataset.isToggled;
                }
            }
        });

        // Update position
        getIdleItems().forEach((item) => {
            if (isItemToggled(item)) {
                const direction = isItemAbove(item) ? 1 : -1;
                item.style.transform = `translateY(${
                    direction * (draggableItemRect.height + itemsGap)
                }px)`;
            } else {
                item.style.transform = '';
            }
        });
    }

    function dragStart(e) {
        // Use closest to find drag handle, works even if SVG is clicked
        const dragHandle = e.target.closest('.js-drag-handle');
        if (!dragHandle) return;

        // Only allow dragging if the handle is visible
        const handleVisibility = window.getComputedStyle(dragHandle).visibility;
        if (handleVisibility === 'hidden') return;

        draggableItem = dragHandle.closest('.list-group-item');
        if (!draggableItem) return;

        pointerStartX = e.clientX || e.touches?.[0]?.clientX;
        pointerStartY = e.clientY || e.touches?.[0]?.clientY;

        setItemsGap();
        disablePageScroll();
        initDraggableItem();
        initItemsState();
        prevRect = draggableItem.getBoundingClientRect();

        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
    }

    function drag(e) {
        if (!draggableItem) return;

        e.preventDefault();

        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;

        const pointerOffsetX = clientX - pointerStartX;
        const pointerOffsetY = clientY - pointerStartY;

        draggableItem.style.transform = `translate(${pointerOffsetX}px, ${pointerOffsetY}px)`;

        updateIdleItemsStateAndPosition();

        // Auto-scroll at viewport edges
        const scrollThreshold = 100;
        const viewportHeight = window.innerHeight;

        if (clientY < scrollThreshold) {
            startAutoScroll(-1);
        } else if (clientY > viewportHeight - scrollThreshold) {
            startAutoScroll(1);
        } else {
            stopAutoScroll();
        }
    }

    function dragEnd(e) {
        if (!draggableItem) return;

        applyNewItemsOrder(e);
        cleanup();
        justFinishedDragging = true;
    }

    function applyNewItemsOrder(e) {
        const reorderedItems = [];

        getAllItems().forEach((item, index) => {
            if (item === draggableItem) {
                return;
            }
            if (!isItemToggled(item)) {
                reorderedItems[index] = item;
                return;
            }
            const newIndex = isItemAbove(item) ? index + 1 : index - 1;
            reorderedItems[newIndex] = item;
        });

        for (let index = 0; index < getAllItems().length; index++) {
            const item = reorderedItems[index];
            if (typeof item === 'undefined') {
                reorderedItems[index] = draggableItem;
            }
        }

        reorderedItems.forEach((item) => {
            bookmarksContainer.appendChild(item);
        });

        draggableItem.style.transform = '';

        requestAnimationFrame(() => {
            const rect = draggableItem.getBoundingClientRect();
            const yDiff = prevRect.y - rect.y;
            const currentPositionX = e.clientX || e.changedTouches?.[0]?.clientX;
            const currentPositionY = e.clientY || e.changedTouches?.[0]?.clientY;

            const pointerOffsetX = currentPositionX - pointerStartX;
            const pointerOffsetY = currentPositionY - pointerStartY;

            draggableItem.style.transform = `translate(${pointerOffsetX}px, ${pointerOffsetY + yDiff}px)`;
            requestAnimationFrame(() => {
                unsetDraggableItem();
            });
        });
    }

    function cleanup() {
        itemsGap = 0;
        items = [];
        unsetItemState();
        enablePageScroll();
        stopAutoScroll();
        persistBookmarkOrder();

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('touchmove', drag);
    }

    // Function to switch to the "All" tab
    function switchToAllTab() {
        const allTabButton = document.querySelector('.category-tab[data-category="all"]');
        if (allTabButton) {
            allTabButton.click();
        }
    }

    // Function to navigate to settings
    function goToSettings() {
        window.location.href = './settings.html';
    }

    // Function to create the empty state message with Add and Import links
    function createEmptyMessage() {
        const messageContainer = document.createElement('p');
        messageContainer.className = 'pin-msg';
        
        const icon = document.createElement('i');
        icon.className = 'fa-kit fa-lta-bus-stop';
        messageContainer.appendChild(icon);
        
        const textNode = document.createTextNode(' No Pinned Bus Stop. ');
        messageContainer.appendChild(textNode);
        
        const linksWrapper = document.createElement('span');
        linksWrapper.className = 'action-links-wrapper';
        
        const addLink = document.createElement('a');
        addLink.href = '#';
        addLink.className = 'action-link add-link';
        addLink.textContent = 'Add';
        addLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchToAllTab();
        });
        
        const separator = document.createTextNode(' or ');
        
        const importLink = document.createElement('a');
        importLink.href = '#';
        importLink.className = 'action-link import-link';
        importLink.textContent = 'Import';
        importLink.addEventListener('click', (e) => {
            e.preventDefault();
            goToSettings();
        });
        
        linksWrapper.appendChild(addLink);
        linksWrapper.appendChild(separator);
        linksWrapper.appendChild(importLink);
        
        messageContainer.appendChild(linksWrapper);
        
        return messageContainer;
    }

    // Function to load bookmarks from localStorage
    async function loadBookmarks() {
        const bookmarks = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];
        bookmarksContainer.innerHTML = '';

        // Check if there are no bookmarks
        if (bookmarks.length === 0) {
            bookmarksContainer.appendChild(createEmptyMessage());
            return;
        }

        try {
            // Show a "Re-fetching in progress" message
            bookmarksContainer.innerHTML = '<p class="pin-msg">Re-fetching Data In Progress, your pinned bus stops will show shortly...</p>';

            // Check if bus stops are already cached in localStorage
            let busStops = [];
            try {
                const cached = localStorage.getItem('allBusStops');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Handle both array format and API response format { value: [...] }
                    busStops = Array.isArray(parsed) ? parsed : (parsed.value || []);
                }
                if (!Array.isArray(busStops)) {
                    busStops = [];
                }
                if (busStops.length > 0) {
                    console.log('[pinned.js] Using cached bus stops:', busStops.length);
                }
            } catch (parseError) {
                console.warn('[pinned.js] Failed to parse cached bus stops:', parseError);
                busStops = [];
            }
            if (busStops.length === 0) {
                // Fetch all bus stops from the /bus-stops endpoint if not cached
                console.log('[pinned.js] Fetching bus stops from API...');
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
                console.log('[pinned.js] Fetched and cached', busStops.length, 'bus stops');
                localStorage.setItem('allBusStops', JSON.stringify(busStops));
            }

            // Clear the "Re-fetching" message and display bookmarks
            bookmarksContainer.innerHTML = '';

            if (bookmarks.length > 0) {
                const hiddenStops = getHiddenStops();
                bookmarks.forEach((bookmark, index) => {
                    const busStop = Array.isArray(busStops) ? busStops.find(stop => stop.BusStopCode === bookmark.BusStopCode) : null;
                    
                    // Skip if bus stop not found
                    if (!busStop) {
                        console.warn('Bus stop not found:', bookmark.BusStopCode);
                        return;
                    }

                    // Skip hidden stops
                    if (hiddenStops.includes(bookmark.BusStopCode)) return;

                    const listItem = document.createElement('div');
                    listItem.className = 'list-group-item is-idle';
                    listItem.dataset.bmIndex = String(index);
                    listItem.style.display = 'flex';
                    listItem.style.flexDirection = 'column';
                    listItem.style.alignItems = 'stretch';
                    listItem.style.userSelect = 'none';
                    listItem.style.touchAction = 'pan-y';

                    // Drag handle
                    const dragHandle = document.createElement('span');
                    dragHandle.className = 'js-drag-handle';
                    dragHandle.innerHTML =
                        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="18" viewBox="0 0 12 18">' +
                        '<circle cx="3" cy="3"  r="2" fill="#888"/>' +
                        '<circle cx="9" cy="3"  r="2" fill="#888"/>' +
                        '<circle cx="3" cy="9"  r="2" fill="#888"/>' +
                        '<circle cx="9" cy="9"  r="2" fill="#888"/>' +
                        '<circle cx="3" cy="15" r="2" fill="#888"/>' +
                        '<circle cx="9" cy="15" r="2" fill="#888"/>' +
                        '</svg>';

                    // Make the bus stop details clickable
                    const link = document.createElement('a');
                    link.href = 'javascript:void(0)';
                    
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

                    link.addEventListener('click', (e) => { 
                        e.preventDefault(); 
                    });

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
                            getArrivalSummaryForStop(bookmark.BusStopCode).then((arrivals) => {
                                applyArrivalFilter(summaryEl, arrivals, bookmark.BusStopCode, actionCollapse);
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
                    mainRow.appendChild(dragHandle);
                    mainRow.appendChild(link);
                    mainRow.appendChild(controls);

                    // Long press variables for pin button
                    let longPressTimer = null;
                    let pinButton = null;
                    let longPressTriggered = false;

                    let itemTouchStartX = 0;
                    let itemTouchStartY = 0;

                    // Add long press listener for pin button
                    function startPinLongPress(x, y) {
                        itemTouchStartX = x;
                        itemTouchStartY = y;
                        longPressTimer = setTimeout(() => {
                            if (!pinButton) {
                                longPressTriggered = true;
                                if (dragLongPressTimer) { clearTimeout(dragLongPressTimer); dragLongPressTimer = null; }
                                longPressItem = null;

                                // Unpin button
                                pinButton = document.createElement('button');
                                pinButton.innerHTML = '<i class="fa-regular fa-thumbtack-angle-slash"></i>';
                                pinButton.className = 'btn btn-unpin btn-2 pin-btn-fade-in';
                                pinButton.style.order = '-1';
                                pinButton.style.flexShrink = '0';
                                pinButton.addEventListener('click', (event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    confirmAndRemoveBookmark(bookmark.BusStopCode);
                                    pinButton.classList.remove('pin-btn-fade-in');
                                    pinButton.classList.add('pin-btn-fade-out');
                                    setTimeout(() => { if (pinButton && pinButton.parentNode) { pinButton.remove(); } pinButton = null; }, 300);
                                });
                                controls.insertBefore(pinButton, controls.firstChild);
                            }
                        }, 500);
                    }
                    function endPinLongPress() {
                        clearTimeout(longPressTimer);
                        if (pinButton) {
                            setTimeout(() => {
                                if (pinButton && pinButton.parentNode) {
                                    pinButton.classList.remove('pin-btn-fade-in');
                                    pinButton.classList.add('pin-btn-fade-out');
                                    setTimeout(() => { if (pinButton && pinButton.parentNode) { pinButton.remove(); } pinButton = null; }, 300);
                                }
                            }, 2000);
                        }
                    }
                    listItem.addEventListener('touchstart', (event) => { startPinLongPress(event.touches[0].clientX, event.touches[0].clientY); }, { passive: true });
                    listItem.addEventListener('touchend', () => { endPinLongPress(); });
                    listItem.addEventListener('touchmove', (event) => {
                        const dx = event.touches[0].clientX - itemTouchStartX;
                        const dy = event.touches[0].clientY - itemTouchStartY;
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(longPressTimer);
                    });
                    listItem.addEventListener('touchcancel', () => { clearTimeout(longPressTimer); });
                    listItem.addEventListener('mousedown', (event) => { if (event.button === 0) startPinLongPress(event.clientX, event.clientY); });
                    listItem.addEventListener('mouseup', () => { endPinLongPress(); });
                    listItem.addEventListener('mouseleave', () => { clearTimeout(longPressTimer); });

                    const actionCollapse = document.createElement('div');
                    actionCollapse.className = 'bus-stop-options-collapse';
                    const actionBasePath = (window.PWAConfig ? window.PWAConfig.basePath : '/');
                    actionCollapse.innerHTML = `
                        <div class="bus-stop-options-inner">
                            <div class="bus-stop-arrivals-summary card-content-art">
                                ${renderArrivalSummary([])}
                            </div>
                        </div>
                        <div class="bus-stop-options-footer">
                            <div class="arrival-filter-reset-slot"></div>
                            <a href="${actionBasePath}buszy/art.html?BusStopCode=${encodeURIComponent(bookmark.BusStopCode)}" class="btn btn-busloc btn-sm open-art-btn" title="Open arrival timings page">
                                <i class="fa-solid fa-arrow-right"></i>
                            </a>
                        </div>
                    `;

                    actionCollapse.addEventListener('click', e => e.stopPropagation());
                    listItem.appendChild(mainRow);
                    listItem.appendChild(actionCollapse);
                    listItem.addEventListener('click', () => { if (longPressTriggered) { longPressTriggered = false; return; } actionsToggleBtn.click(); });
                    bookmarksContainer.appendChild(listItem);
                });
            } else {
                // If no bookmarks exist after re-fetching, show the message
                bookmarksContainer.appendChild(createEmptyMessage());
            }
            renderHiddenStopsToggle();
            applyPinnedSearchFilter();
        } catch (error) {
            console.error('Error fetching bus stops:', error);
            bookmarksContainer.innerHTML = '<p class="error-msg">Error loading bus stop data.</p>';
        }
    }

    // ── Hide/Show stop helpers ────────────────────────────────
    function getHiddenStops() {
        return JSON.parse(localStorage.getItem('pinnedHiddenStops') || '[]');
    }
    function hideStop(busStopCode) {
        const hidden = getHiddenStops();
        if (!hidden.includes(busStopCode)) hidden.push(busStopCode);
        localStorage.setItem('pinnedHiddenStops', JSON.stringify(hidden));
    }
    function unhideStop(busStopCode) {
        const hidden = getHiddenStops().filter(c => c !== busStopCode);
        localStorage.setItem('pinnedHiddenStops', JSON.stringify(hidden));
    }

    function showHidePopup(listItem, busStopCode, description) {
        // Remove any existing popup
        document.querySelectorAll('.pin-hide-popup').forEach(p => p.remove());
        const popup = document.createElement('div');
        popup.className = 'pin-hide-popup pin-btn-fade-in';
        popup.innerHTML = `
            <span class="pin-hide-popup-msg">Hide <strong>${description}</strong>?</span>
            <div class="pin-hide-popup-actions">
                <button class="btn pin-hide-confirm">Hide</button>
                <button class="btn pin-hide-cancel">Cancel</button>
            </div>
        `;
        popup.querySelector('.pin-hide-confirm').addEventListener('click', e => {
            e.stopPropagation();
            hideStop(busStopCode);
            popup.remove();
            loadBookmarks();
        });
        popup.querySelector('.pin-hide-cancel').addEventListener('click', e => {
            e.stopPropagation();
            popup.remove();
        });
        listItem.appendChild(popup);
        // Auto-dismiss after 6s
        setTimeout(() => { if (popup.parentNode) popup.remove(); }, 6000);
    }

    function renderHiddenStopsToggle() {
        const hidden = getHiddenStops();
        const existing = bookmarksContainer.querySelector('.pin-hidden-toggle-row');
        if (existing) existing.remove();
        if (hidden.length === 0) return;
        const row = document.createElement('div');
        row.className = 'pin-hidden-toggle-row';
        row.innerHTML = `<span class="pin-hidden-toggle">${hidden.length} hidden &middot; <span class="pin-hidden-show-link">Show all</span></span>`;
        row.querySelector('.pin-hidden-show-link').addEventListener('click', () => {
            showHiddenPanel();
        });
        bookmarksContainer.appendChild(row);
    }

    function showHiddenPanel() {
        document.querySelectorAll('.pin-hidden-panel').forEach(p => p.remove());
        const hidden = getHiddenStops();
        if (hidden.length === 0) return;
        const panel = document.createElement('div');
        panel.className = 'pin-hidden-panel pin-btn-fade-in';
        let busStops = [];
        try { busStops = JSON.parse(localStorage.getItem('allBusStops') || '[]'); } catch (e) {/* */}
        panel.innerHTML = `
            <div class="pin-hidden-panel-header">Hidden bus stops <button class="pin-hidden-panel-close">&times;</button></div>
            <ul class="pin-hidden-panel-list">
                ${hidden.map(code => {
                    const stop = Array.isArray(busStops) ? busStops.find(s => s.BusStopCode === code) : null;
                    const desc = stop ? stop.Description : code;
                    return `<li data-code="${code}"><span class="pin-hidden-code">${code}</span> ${desc} <button class="pin-hidden-unhide-btn" data-code="${code}">Unhide</button></li>`;
                }).join('')}
            </ul>
        `;
        panel.querySelector('.pin-hidden-panel-close').addEventListener('click', () => panel.remove());
        panel.querySelectorAll('.pin-hidden-unhide-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                unhideStop(btn.dataset.code);
                loadBookmarks();
                panel.remove();
            });
        });
        bookmarksContainer.appendChild(panel);
    }

    // Function to confirm and remove a bookmark
    function confirmAndRemoveBookmark(busStopCode) {
        const confirmation = confirm('Are you sure you want to unpin this bus stop?');
        if (confirmation) {
            removeBookmark(busStopCode);
        }
    }

    // Function to remove a bookmark
    function removeBookmark(busStopCode) {
        const bookmarks = JSON.parse(localStorage.getItem('bookmarkedBusStops')) || [];
        const updatedBookmarks = bookmarks.filter((b) => b.BusStopCode !== busStopCode);
        localStorage.setItem('bookmarkedBusStops', JSON.stringify(updatedBookmarks));
        loadBookmarks(); // Refresh the displayed list
        alert('Bus Stop Unpinned.');
    }

    // Search filtering for pinned tab
    const searchInput = document.getElementById('bus-stop-search');

    function applyPinnedSearchFilter() {
        if (!searchInput) return;
        const query = searchInput.value.toLowerCase();
        bookmarksContainer.querySelectorAll('.list-group-item').forEach(item => {
            const code = item.querySelector('.bus-stop-code-text')?.textContent.toLowerCase() || '';
            const desc = item.querySelector('.bus-stop-description')?.textContent.toLowerCase() || '';
            item.style.display = (code.includes(query) || desc.includes(query)) ? 'flex' : 'none';
        });
    }

    // Persist bookmark order to localStorage
    function persistBookmarkOrder() {
        const bookmarks = [];
        getAllItems().forEach(item => {
            const code = item.querySelector('.bus-stop-code-text')?.textContent;
            if (code) {
                bookmarks.push({ BusStopCode: code });
            }
        });
        localStorage.setItem('bookmarkedBusStops', JSON.stringify(bookmarks));
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyPinnedSearchFilter);
    }

    // Track whether we pushed a history entry for drag mode
    let dragModeHistoryPushed = false;

    // Enter drag-rearrange mode: dims the page, highlights chosen item, shows all handles
    function enterDragMode(selectedItem) {
        if (dragModeActive) return;
        dragModeActive = true;
        document.body.classList.add('drag-mode');
        if (selectedItem) {
            selectedItem.classList.add('drag-selected');
        }
        // Push a history entry so the back button can dismiss drag mode
        history.pushState({ dragMode: true }, '');
        dragModeHistoryPushed = true;
    }

    // Exit drag-rearrange mode: restore page, remove highlights
    // Pass skipHistory=true when the back button itself triggered the exit
    function exitDragMode(skipHistory = false) {
        if (!dragModeActive) return;
        dragModeActive = false;
        document.body.classList.remove('drag-mode');
        getAllItems().forEach(item => {
            item.classList.remove('drag-selected', 'handle-visible');
        });
        // Clean up the history entry we pushed so one back press leaves the page
        if (!skipHistory && dragModeHistoryPushed) {
            dragModeHistoryPushed = false;
            history.back();
        } else {
            dragModeHistoryPushed = false;
        }
    }

    // Back button dismisses drag mode instead of navigating away
    window.addEventListener('popstate', (e) => {
        if (dragModeActive) {
            exitDragMode(true); // back button already consumed the entry
        }
    });

    // Long-press handler for desktop mouse to enter drag mode
    function handleMouseDown(e) {
        if (dragModeActive) return;
        const item = e.target.closest('.list-group-item');
        if (!item) return;

        longPressItem = item;
        dragLongPressTimer = setTimeout(() => {
            if (longPressItem) {
                enterDragMode(longPressItem);
                longPressItem = null;
            }
        }, 500);
    }

    function handleMouseEnd(e) {
        if (dragLongPressTimer) {
            clearTimeout(dragLongPressTimer);
            dragLongPressTimer = null;
        }
        longPressItem = null;
    }

    // Long-press handler for mobile to enter drag mode
    function handleTouchStart(e) {
        const item = e.target.closest('.list-group-item');
        if (!item) return;
        if (dragModeActive) return;

        longPressItem = item;
        dragLongPressTimer = setTimeout(() => {
            if (longPressItem) {
                enterDragMode(longPressItem);
                longPressItem = null;
            }
        }, 900);
    }

    function handleTouchEnd(e) {
        if (dragLongPressTimer) {
            clearTimeout(dragLongPressTimer);
            dragLongPressTimer = null;
        }
        longPressItem = null;
    }

    function handleTouchMove(e) {
        // Cancel long-press if user moves
        if (dragLongPressTimer) {
            clearTimeout(dragLongPressTimer);
            dragLongPressTimer = null;
        }
    }

    // Suppress context menu on the bookmarks container at all times
    // (prevents native long-press menu from interrupting drag-mode activation
    //  and prevents the SVG handle from triggering image save dialogs)
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('#bookmarks-container')) e.preventDefault();
    });

    // Setup drag to reorder listeners
    function setupDragListeners() {
        if (!bookmarksContainer) return;
        bookmarksContainer.addEventListener('mousedown', dragStart);
        bookmarksContainer.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseEnd);
        bookmarksContainer.addEventListener('touchstart', (e) => {
            handleTouchStart(e);
            dragStart(e);
        });
        bookmarksContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', (e) => {
            handleTouchEnd(e);
            dragEnd(e);
        });

        // Exit drag mode when tapping outside the bookmarks container
        document.addEventListener('click', (e) => {
            if (justFinishedDragging) {
                justFinishedDragging = false;
                return;
            }
            if (dragModeActive && !e.target.closest('#bookmarks-container')) {
                exitDragMode();
            }
        });

        document.addEventListener('touchstart', (e) => {
            if (justFinishedDragging) {
                justFinishedDragging = false;
                return;
            }
            if (dragModeActive && !e.target.closest('#bookmarks-container')) {
                exitDragMode();
            }
        });
    }

    // Load bookmarks and setup listeners
    loadBookmarks().then(() => {
        items = [];
        setupDragListeners();
    });
});