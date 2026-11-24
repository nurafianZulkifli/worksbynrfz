/**
 * wake-lock.js
 * Keeps the screen awake while viewing live bus timings.
 * Uses the Screen Wake Lock API (supported on Android Chrome 84+).
 */
(function () {
    if (!('wakeLock' in navigator)) return;

    let wakeLock = null;

    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            // Wake lock may be denied when battery saver is active — fail silently
        }
    }

    async function handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    }

    // Acquire on page load
    requestWakeLock();

    // Re-acquire after tab becomes visible again (e.g. user switches apps)
    document.addEventListener('visibilitychange', handleVisibilityChange);
})();
