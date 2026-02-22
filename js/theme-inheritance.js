/**
 * Theme Inheritance Utility
 * If user is coming from nurafianzulkifli.com, inherit their dark mode preference
 */

window.ThemeInheritance = (() => {
  const THEME_KEY = 'dark-mode';
  const MAIN_DOMAIN = 'nurafianzulkifli.com';

  /**
   * Check if the referrer is from the main domain
   * @returns {boolean}
   */
  function isFromMainDomain() {
    try {
      const referrer = document.referrer;
      return referrer && referrer.includes(MAIN_DOMAIN);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get theme preference from URL parameter
   * @returns {string|null} 'enabled', 'disabled', or null
   */
  function getThemeFromUrlParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode') || params.get('theme');
      
      if (modeParam === 'dark' || modeParam === 'enabled') {
        return 'enabled';
      } else if (modeParam === 'light' || modeParam === 'disabled') {
        return 'disabled';
      }
    } catch (e) {
      // URL parameter reading failed, continue
    }
    return null;
  }

  /**
   * Attempt to inherit theme from parent window via postMessage
   * This works if the parent window is still open and on the same tab
   * @returns {Promise<string|null>}
   */
  function getThemeFromParentWindow() {
    return new Promise((resolve) => {
      // Listen for postMessage from parent
      const messageHandler = (event) => {
        try {
          // Verify the message is from the expected domain
          if (isFromMainDomain() && event.data && event.data.type === 'THEME_PREFERENCE') {
            window.removeEventListener('message', messageHandler);
            clearTimeout(timeout);
            
            const theme = event.data.value; // 'enabled' or 'disabled'
            resolve(theme);
          }
        } catch (e) {
          // Message handling failed
        }
      };

      // Set a timeout to avoid waiting indefinitely
      const timeout = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }, 500);

      window.addEventListener('message', messageHandler);

      // Request theme preference from parent window
      if (window.opener && isFromMainDomain()) {
        try {
          window.opener.postMessage({ type: 'REQUEST_THEME_PREFERENCE' }, '*');
        } catch (e) {
          // PostMessage failed, continue
        }
      }
    });
  }

  /**
   * Initialize theme inheritance
   * Checks for preference from main domain and applies it
   * @returns {Promise<void>}
   */
  async function init() {
    // Only proceed if coming from main domain
    if (!isFromMainDomain()) {
      return;
    }

    // First, check for theme parameter in URL
    let inheritedTheme = getThemeFromUrlParam();

    // If not in URL, try to get from parent window via postMessage
    if (!inheritedTheme) {
      inheritedTheme = await getThemeFromParentWindow();
    }

    // If we found an inherited theme and it's not already set locally
    if (inheritedTheme) {
      const currentTheme = localStorage.getItem(THEME_KEY);
      
      // Only set if not already configured locally
      if (!currentTheme) {
        localStorage.setItem(THEME_KEY, inheritedTheme);
        
        // Apply the theme immediately if DOM is ready
        if (document.documentElement || document.body) {
          if (inheritedTheme === 'enabled') {
            document.documentElement.classList.add('dark-mode');
            document.body?.classList.add('dark-mode');
          } else {
            document.documentElement.classList.remove('dark-mode');
            document.body?.classList.remove('dark-mode');
          }
        }
      }
    }
  }

  /**
   * Prepare for cross-window theme sharing
   * Place this on the main domain (nurafianzulkifli.com) to share theme with child windows
   */
  function setupThemeSharing() {
    window.addEventListener('message', (event) => {
      try {
        if (event.data && event.data.type === 'REQUEST_THEME_PREFERENCE') {
          const currentTheme = localStorage.getItem(THEME_KEY) || 'disabled';
          
          // Send theme preference back to the requesting window
          if (event.source) {
            event.source.postMessage(
              { type: 'THEME_PREFERENCE', value: currentTheme },
              '*'
            );
          }
        }
      } catch (e) {
        // Message handling failed
      }
    });
  }

  return {
    init: init,
    setupThemeSharing: setupThemeSharing,
    THEME_KEY: THEME_KEY,
    MAIN_DOMAIN: MAIN_DOMAIN
  };
})();

// Auto-initialize on script load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ThemeInheritance.init();
  });
} else {
  // DOM already loaded
  ThemeInheritance.init();
}
