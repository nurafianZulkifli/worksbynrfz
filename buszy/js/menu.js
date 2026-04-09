    // Update display mode text and icon based on dark mode
    function updateDisplayModeMenu() {
        var a = document.getElementById('dark-mode-toggle-desktop');
        if (!a) return;
        var h5 = a.querySelector('h5.lg-menu');
        var icon = h5 ? h5.querySelector('i') : null;
        var isDark = document.body.classList.contains('dark-mode');
        if (h5 && icon) {
            if (isDark) {
                h5.innerHTML = '<i class="fa-regular fa-moon"></i> Theme: Dark';
            } else {
                h5.innerHTML = '<i class="fa-regular fa-sun-bright"></i> Theme: Light';
            }
        }
    }
    document.addEventListener('DOMContentLoaded', updateDisplayModeMenu);
    new MutationObserver(updateDisplayModeMenu).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Handle Other Apps link click - set flag to open installed app on index.html
    document.addEventListener('DOMContentLoaded', function() {
        var otherAppsLink = document.getElementById('other-apps-link');
        if (!otherAppsLink) return;

        otherAppsLink.addEventListener('click', function(e) {
            var isAndroid = /Android/.test(navigator.userAgent);
            var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            if (!isAndroid && !isIOS) {
                // Desktop - allow normal navigation
                return;
            }
            
            // Set flag to try opening apps on index.html
            sessionStorage.setItem('detectAppsOnLoad', 'true');
        });
    });

    // Handle Try out upcoming updates - transfer pinned bus stops
    document.addEventListener('DOMContentLoaded', function() {
        // Find the link to upcoming updates
        var upcomingUpdatesLink = Array.from(document.querySelectorAll('a.list-group-item')).find(function(link) {
            return link.href.includes('nurafianzulkifli.github.io/nrfz-dev/buszy/index.html');
        });
        
        if (!upcomingUpdatesLink) return;

        upcomingUpdatesLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get pinned bus stops from localStorage
            var pinnedBusStops = localStorage.getItem('bookmarkedBusStops');
            
            if (pinnedBusStops) {
                try {
                    // Encode the data in base64 to safely pass via URL
                    var encodedData = btoa(pinnedBusStops);
                    
                    // Create the URL with the encoded data parameter
                    var baseUrl = 'https://nurafianzulkifli.github.io/nrfz-dev/buszy/index.html';
                    var urlWithData = baseUrl + '?importPinned=' + encodeURIComponent(encodedData);
                    
                    // Navigate to the URL
                    window.location.href = urlWithData;
                } catch (error) {
                    console.error('Error transferring pinned bus stops:', error);
                    // Fallback - just navigate to the URL without data
                    window.location.href = this.href;
                }
            } else {
                // No pinned stops - just navigate
                window.location.href = this.href;
            }
        });
    });