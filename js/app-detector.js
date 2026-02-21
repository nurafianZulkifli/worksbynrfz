// App Detection and Launch Logic for Index Page
// Detects if user clicked "Other Apps" and tries to open installed apps

document.addEventListener('DOMContentLoaded', function() {
    // Check if we should try to detect and open installed apps
    var shouldDetectApps = sessionStorage.getItem('detectAppsOnLoad');
    
    if (shouldDetectApps !== 'true') {
        return; // User didn't come from menu, show app selection normally
    }
    
    // Clear the flag
    sessionStorage.removeItem('detectAppsOnLoad');
    
    var isAndroid = /Android/.test(navigator.userAgent);
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isAndroid) {
        detectAndOpenAndroidApp();
    } else if (isIOS) {
        detectAndOpenIOSApp();
    }
});

function detectAndOpenAndroidApp() {
    // App packages to try - in order of preference
    var apps = [
        { name: 'Buszy', package: 'sg.nrfz.buszy' },
        { name: 'RailBuddy', package: 'sg.nrfz.railbuddy' }
    ];
    
    // Try to open the first available app
    for (var i = 0; i < apps.length; i++) {
        var app = apps[i];
        var intentUrl = 'intent://index.html#Intent;package=' + app.package + ';scheme=https;end';
        
        tryOpenApp(intentUrl, function() {
            // If no app opens, the page stays visible
            // This is handled naturally - if none open, user sees app selection
        });
        
        // For Android, we try the first one and let it work
        break;
    }
}

function detectAndOpenIOSApp() {
    // App URL schemes to try - in order of preference
    var apps = [
        { name: 'Buszy', scheme: 'buszy://' },
        { name: 'RailBuddy', scheme: 'railbuddy://' }
    ];
    
    // Store the start time to detect if app actually opened
    var appStartTime = Date.now();
    var appOpened = false;
    
    // Create a handler to detect if the app opened
    var handleVisibilityChange = function() {
        if (document.hidden) {
            // Page became hidden - app likely opened
            appOpened = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Try apps with increasing delays
    for (var i = 0; i < apps.length; i++) {
        (function(index, startTime) {
            setTimeout(function() {
                if (!appOpened) {
                    // Try this app
                    window.location.href = apps[index].scheme;
                }
            }, index * 500); // Stagger attempts by 500ms
        })(i, appStartTime);
    }
    
    // After trying all apps, clean up the listener
    setTimeout(function() {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, apps.length * 500 + 2000);
}

function tryOpenApp(url, callback) {
    // Store the current timestamp and visibility state
    var startTime = Date.now();
    var originalVisibility = document.hidden;
    
    // Set a timer to check if we're still on the page
    var checkTimer = setInterval(function() {
        var elapsed = Date.now() - startTime;
        
        // If page is not hidden after 2.5 seconds, assume app didn't open
        if (elapsed > 2500) {
            clearInterval(checkTimer);
            if (callback) callback();
        }
    }, 100);
    
    // Try to open the app
    window.location.href = url;
}
