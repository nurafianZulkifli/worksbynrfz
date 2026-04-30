/**
 * App Version Configuration
 * Centralized version management for all apps
 * Fetches versions from version.json
 */

window.APP_VERSIONS = {};

// Fetch version configuration
fetch(new URL('../js/version.json', import.meta.url || location.href).href)
  .then(response => response.json())
  .then(data => {
    window.APP_VERSIONS = data;
    console.log('[AppVersion] Versions loaded:', window.APP_VERSIONS);
    // Dispatch event so pages can react to version being loaded
    window.dispatchEvent(new CustomEvent('versionsLoaded', { detail: data }));
  })
  .catch(error => {
    console.warn('[AppVersion] Could not load versions, using defaults:', error);
    // Fallback to defaults
    window.APP_VERSIONS = {
      buszy: '4.5.3',
      railbuddy: '4.5.3'
    };
  });
