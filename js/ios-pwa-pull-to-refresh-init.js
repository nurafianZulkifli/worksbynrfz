/**
 * ios-pwa-pull-to-refresh-init.js
 * Detects iOS web app mode and initializes pull-to-refresh functionality
 */
(function () {
    // Check if running on iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Check if running as web app (PWA installed mode)
    function isWebApp() {
        // Check for PWA display mode
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
        if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
        if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
        
        // iOS-specific check
        if (navigator.standalone === true) return true;
        
        // Fallback check for iOS
        return window.navigator.standalone === true;
    }

    // Initialize pull-to-refresh when DOM is ready
    function initPullToRefreshIfSupported() {
        if (typeof initPullToRefresh !== 'function') {
            console.warn('initPullToRefresh function not found. Make sure pull-to-refresh.js is loaded.');
            return;
        }

        // Only enable on iOS and in web app mode
        if (!isIOS() || !isWebApp()) {
            return;
        }

        // Initialize pull-to-refresh with page reload callback
        initPullToRefresh(() => {
            location.reload();
        });
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPullToRefreshIfSupported);
    } else {
        initPullToRefreshIfSupported();
    }
})();
