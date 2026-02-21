// PWA Detection and Launch Logic for Index Page
// Detects if user clicked "Other Apps" and tries to open installed PWAs

document.addEventListener('DOMContentLoaded', function() {
    // Check if we should try to detect and open installed PWAs
    var shouldDetectApps = sessionStorage.getItem('detectAppsOnLoad');
    
    if (shouldDetectApps !== 'true') {
        return; // User didn't come from menu, show app selection normally
    }
    
    // Clear the flag
    sessionStorage.removeItem('detectAppsOnLoad');
    
    var isAndroid = /Android/.test(navigator.userAgent);
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isAndroid) {
        detectAndOpenAndroidPWA();
    } else if (isIOS) {
        detectAndOpenIOSPWA();
    }
});

function detectAndOpenAndroidPWA() {
    // Use getInstalledRelatedApps API to detect installed PWAs
    if (!navigator.getInstalledRelatedApps) {
        console.log('getInstalledRelatedApps not supported');
        return;
    }
    
    navigator.getInstalledRelatedApps().then(function(apps) {
        if (apps.length > 0) {
            // Found installed PWA(s) - navigate to the first one
            var appId = apps[0].id;
            
            // Simply navigate to the app URL - PWA will open in its own context
            if (appId === 'buszy') {
                window.location.href = '/buszy/';
            } else if (appId === 'railbuddy') {
                window.location.href = '/rail-buddy/';
            }
        }
    }).catch(function(err) {
        console.log('Error detecting installed PWAs:', err);
    });
}

function detectAndOpenIOSPWA() {
    // On iOS, PWAs installed as web clips can't be directly launched from browser
    // However, we can detect if we're in standalone mode
    if (window.navigator.standalone === true) {
        // We're already in a PWA - don't need to do anything
        return;
    }
    
    // For iOS, we could check using matchMedia for display-mode: standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return;
    }
    
    // Try to detect installed PWAs via related apps if available
    if (navigator.getInstalledRelatedApps) {
        navigator.getInstalledRelatedApps().then(function(apps) {
            if (apps.length > 0) {
                // Navigate to first installed app's URL
                var appId = apps[0].id;
                if (appId === 'buszy') {
                    window.location.href = '/buszy/';
                } else if (appId === 'railbuddy') {
                    window.location.href = '/rail-buddy/';
                }
            }
        });
    }
}
