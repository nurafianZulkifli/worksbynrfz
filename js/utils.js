/**
 * Get a query parameter value from the URL.
 * @param {string} param - The name of the query parameter.
 * @returns {string|null} - The value of the query parameter, or null if not found.
 */
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

/**
 * Detect if the current browser is Instagram's in-app browser
 * @returns {boolean} - True if running in Instagram in-app browser
 */
function isInstagramInAppBrowser() {
    const userAgent = navigator.userAgent;
    return /Instagram/i.test(userAgent);
}

/**
 * Detect if the current browser is a native mobile browser
 * @returns {boolean} - True if running in a native browser (Safari, Chrome, Firefox, etc.)
 */
function isNativeBrowser() {
    const userAgent = navigator.userAgent.toLowerCase();
    // Check for common in-app browsers with more accurate patterns
    const inAppBrowsers = /instagram|fb|fbav|\[fb|micromessenger|whatsapp|telegram|line\/|viber|tiktok|snapchat/i;
    return !inAppBrowsers.test(userAgent);
}