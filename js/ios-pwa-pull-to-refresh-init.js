/**
 * ios-pwa-pull-to-refresh-init.js
 * Detects iOS web app mode and initializes pull-to-refresh functionality
 * NOTE: Disabled on iOS due to display issues in web app mode
 */
(function () {
    // Check if running on iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Don't initialize pull-to-refresh on iOS due to display issues
    if (isIOS()) {
        return;
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

        // Only enable in web app mode (not on iOS, as checked above)
        if (!isWebApp()) {
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
