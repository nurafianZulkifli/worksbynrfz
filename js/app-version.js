/**
 * App Version Configuration
 * Centralized version management for all apps
 * Fetches versions from version.json
 */

window.APP_VERSIONS = {};

// Get the script's directory
function getScriptDirectory() {
  const scripts = document.getElementsByTagName('script');
  const currentScript = scripts[scripts.length - 1];
  const src = currentScript.src;
  if (src) {
    return src.substring(0, src.lastIndexOf('/') + 1);
  }
  return window.location.origin + '/js/';
}

const scriptDir = getScriptDirectory();
const versionJsonUrl = scriptDir + 'version.json';

// Fetch version configuration
fetch(versionJsonUrl)
  .then(response => response.json())
  .then(data => {
    window.APP_VERSIONS = data;
    console.log('[AppVersion] Versions loaded:', window.APP_VERSIONS);
    // Dispatch event so pages can react to version being loaded
    window.dispatchEvent(new CustomEvent('versionsLoaded', { detail: data }));
  })
  .catch(error => {
    console.warn('[AppVersion] Could not load versions from ' + versionJsonUrl, error);
    // Fallback to defaults
    window.APP_VERSIONS = {
      buszy: '4.5.x',
      railbuddy: '4.5.x'
    };
    window.dispatchEvent(new CustomEvent('versionsLoaded', { detail: window.APP_VERSIONS }));
  });
