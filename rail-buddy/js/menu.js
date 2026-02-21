    // Update display mode text and icon based on dark mode
    function updateDisplayModeMenu() {
        var a = document.getElementById('dark-mode-toggle-desktop');
        if (!a) return;
        var h5 = a.querySelector('h5.lg-menu');
        var icon = h5 ? h5.querySelector('i') : null;
        var isDark = document.body.classList.contains('dark-mode');
        if (h5 && icon) {
            if (isDark) {
                h5.innerHTML = '<i class="fa-regular fa-moon"></i> Display: Dark';
            } else {
                h5.innerHTML = '<i class="fa-regular fa-sun-bright"></i> Display: Light';
            }
        }
    }
    document.addEventListener('DOMContentLoaded', updateDisplayModeMenu);
    new MutationObserver(updateDisplayModeMenu).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Handle Other Apps link click - try to open installed app or fallback to web
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
            
            e.preventDefault();
            
            if (isAndroid) {
                openAndroidApp();
            } else if (isIOS) {
                openIOSApp();
            }
        });
    });

    function openAndroidApp() {
        // Try opening RailBuddy app
        var railbudyPackage = 'sg.nrfz.railbuddy';
        
        // Try RailBuddy Intent
        var railbudyIntent = 'intent://index.html#Intent;package=' + railbudyPackage + ';scheme=https;end';
        var fallbackURL = '../index.html';
        
        // Use setTimeout with fallback approach
        var startTime = Date.now();
        window.location.href = railbudyIntent;
        
        // If app doesn't exist, fallback after 1.5 seconds
        setTimeout(function() {
            // Check if we're still on the same page (app didn't open)
            if (Date.now() - startTime < 2500) {
                window.location.href = fallbackURL;
            }
        }, 2000);
    }

    function openIOSApp() {
        // Try opening RailBuddy app via URL scheme
        var railbudyScheme = 'railbuddy://';
        var fallbackURL = '../index.html';
        
        // Try opening the app
        var startTime = Date.now();
        window.location.href = railbudyScheme;
        
        // If app doesn't exist, fallback after 1.5 seconds
        setTimeout(function() {
            if (Date.now() - startTime < 2500) {
                window.location.href = fallbackURL;
            }
        }, 2000);
    }