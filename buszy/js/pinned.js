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
    let longPressTimer = null;
    let longPressItem = null;
    let justFinishedDragging = false;

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
                bookmarks.forEach((bookmark, index) => {
                    const busStop = Array.isArray(busStops) ? busStops.find(stop => stop.BusStopCode === bookmark.BusStopCode) : null;
                    
                    // Skip if bus stop not found
                    if (!busStop) {
                        console.warn('Bus stop not found:', bookmark.BusStopCode);
                        return;
                    }

                    const listItem = document.createElement('div');
                    listItem.className = 'list-group-item is-idle';
                    listItem.dataset.bmIndex = String(index);
                    listItem.style.display = 'flex';
                    listItem.style.justifyContent = 'space-between';
                    listItem.style.alignItems = 'center';
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
                    link.href = `art.html?BusStopCode=${encodeURIComponent(bookmark.BusStopCode)}`;
                    
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
                        if (draggableItem === listItem) e.preventDefault(); 
                    });

                    // Remove Bookmark button
                    const removeButton = document.createElement('button');
                    removeButton.innerHTML = '<i class="fa-regular fa-thumbtack-angle-slash"></i>';
                    removeButton.className = 'btn btn-unpin btn-2';
                    removeButton.style.flexShrink = '0';
                    removeButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        confirmAndRemoveBookmark(bookmark.BusStopCode);
                    });

                    listItem.appendChild(dragHandle);
                    listItem.appendChild(link);
                    listItem.appendChild(removeButton);
                    bookmarksContainer.appendChild(listItem);
                });
            } else {
                // If no bookmarks exist after re-fetching, show the message
                bookmarksContainer.appendChild(createEmptyMessage());
            }
            applyPinnedSearchFilter();
        } catch (error) {
            console.error('Error fetching bus stops:', error);
            bookmarksContainer.innerHTML = '<p class="error-msg">Error loading bus stop data.</p>';
        }
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

    // Long-press handler for mobile to show/hide drag handle
    function handleTouchStart(e) {
        const item = e.target.closest('.list-group-item');
        if (!item) return;

        longPressItem = item;
        longPressTimer = setTimeout(() => {
            if (longPressItem) {
                longPressItem.classList.toggle('handle-visible');
                longPressItem = null;
            }
        }, 500);
    }

    function handleTouchEnd(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressItem = null;
    }

    function handleTouchMove(e) {
        // Cancel long-press if user moves
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    // Setup drag to reorder listeners
    function setupDragListeners() {
        if (!bookmarksContainer) return;
        bookmarksContainer.addEventListener('mousedown', dragStart);
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

        // Dismiss grip handle on tap after dragging
        document.addEventListener('click', (e) => {
            if (justFinishedDragging) {
                justFinishedDragging = false;
                getAllItems().forEach((item) => {
                    item.classList.remove('handle-visible');
                });
            }
        });

        document.addEventListener('touchstart', (e) => {
            if (justFinishedDragging) {
                justFinishedDragging = false;
                getAllItems().forEach((item) => {
                    item.classList.remove('handle-visible');
                });
            }
        });
    }

    // Load bookmarks and setup listeners
    loadBookmarks().then(() => {
        items = [];
        setupDragListeners();
    });
});