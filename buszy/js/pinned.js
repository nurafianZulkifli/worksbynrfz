// ****************************
// :: Bookmark (Pin) Management for Bus Stops
// ****************************
document.addEventListener('DOMContentLoaded', async () => {
    const bookmarksContainer = document.getElementById('bookmarks-container');

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
            let busStops = JSON.parse(localStorage.getItem('allBusStops')) || [];
            if (busStops.length === 0) {
                // Fetch all bus stops from the /bus-stops endpoint if not cached
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

            console.log('Fetched or Cached Bus Stops:', busStops); // Debugging: Log all fetched or cached bus stops

            // Clear the "Re-fetching" message and display bookmarks
            bookmarksContainer.innerHTML = '';

            if (bookmarks.length > 0) {
                bookmarks.forEach((bookmark) => {
                    const busStop = busStops.find(stop => stop.BusStopCode === bookmark.BusStopCode);

                    const listItem = document.createElement('div');
                    listItem.className = 'list-group-item';
                    listItem.style.display = 'flex';
                    listItem.style.justifyContent = 'space-between';
                    listItem.style.alignItems = 'center';

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

                    // Remove Bookmark button
                    const removeButton = document.createElement('button');
                    removeButton.innerHTML = '<i class="fa-regular fa-thumbtack-angle-slash"></i>';
                    removeButton.className = 'btn btn-unpin btn-2';
                    removeButton.addEventListener('click', (event) => {
                        event.stopPropagation(); // Prevent the click from triggering the link
                        event.preventDefault(); // Prevent default link behavior
                        confirmAndRemoveBookmark(bookmark.BusStopCode);
                    });

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

    if (searchInput) {
        searchInput.addEventListener('input', applyPinnedSearchFilter);
    }

    // Load bookmarks on page load
    loadBookmarks();
});