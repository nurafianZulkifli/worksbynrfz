/**
 * Cookies Banner Theme Synchronization
 * Dynamically updates the cookies banner styling when the theme changes
 * Also adjusts install banner position when cookies banner is visible
 */

(function() {
    'use strict';

    // Theme color configurations
    const THEMES = {
        light: {
            bg: '#f2f3e5',
            fg: '#000',
            link: '#0070a8'
        },
        dark: {
            bg: '#1a1a1a',
            fg: '#e0e0e0',
            link: '#80a8cc'
        }
    };

    /**
     * Update the cookies banner styles based on the current theme
     */
    function updateCookiesBannerTheme() {
        const cookieBanner = document.querySelector('.cookiebanner');
        if (!cookieBanner) return;

        // Determine current theme
        const isDarkMode = document.body.classList.contains('dark-mode');
        const currentTheme = isDarkMode ? THEMES.dark : THEMES.light;

        // Update banner background and text color via inline styles
        cookieBanner.style.background = currentTheme.bg;
        cookieBanner.style.color = currentTheme.fg;

        // Update span text color
        const spans = cookieBanner.querySelectorAll('span');
        spans.forEach(span => {
            span.style.color = currentTheme.fg;
        });

        // Update link color
        const links = cookieBanner.querySelectorAll('a');
        links.forEach(link => {
            link.style.color = currentTheme.link;
        });

        // Update close button color
        const closeBtn = cookieBanner.querySelector('.cookiebanner-close');
        if (closeBtn) {
            closeBtn.style.color = currentTheme.fg;
        }

        // Add smooth transition
        cookieBanner.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        
        // Adjust install banner position
        adjustInstallBannerPosition();
    }

    /**
     * Adjust install banner position if cookies banner is visible
     */
    function adjustInstallBannerPosition() {
        const installBanner = document.querySelector('.pwa-install-banner');
        if (!installBanner) return;

        const cookieBanner = document.querySelector('.cookiebanner');
        
        if (cookieBanner && cookieBanner.offsetHeight > 0 && cookieBanner.style.display !== 'none') {
            // Cookies banner is visible, shift install banner up
            const cookieBannerHeight = cookieBanner.offsetHeight;
            installBanner.style.bottom = `${cookieBannerHeight}px`;
        } else {
            // Cookies banner not visible or not present
            installBanner.style.bottom = '0';
        }
    }

    /**
     * Watch for theme changes and update cookies banner
     */
    function watchThemeChanges() {
        // Create a MutationObserver to watch for dark-mode class changes on body
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // Delay slightly to ensure CSS is applied
                    setTimeout(updateCookiesBannerTheme, 10);
                }
            });
        });

        // Start observing the document body for class changes
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            attributeOldValue: true
        });
    }

    /**
     * Initialize the theme sync
     */
    function init() {
        // Wait for cookies banner to be inserted into the DOM
        const checkCookieBanner = setInterval(() => {
            const cookieBanner = document.querySelector('.cookiebanner');
            if (cookieBanner) {
                clearInterval(checkCookieBanner);
                updateCookiesBannerTheme();
                watchThemeChanges();
                setupCookiesBannerObserver();
            }
        }, 100);

        // Fallback timeout to stop checking after 10 seconds
        setTimeout(() => {
            clearInterval(checkCookieBanner);
        }, 10000);
        
        // Adjust install banner position on window resize
        window.addEventListener('resize', adjustInstallBannerPosition);
    }

    /**
     * Setup observer for cookies banner visibility changes
     */
    function setupCookiesBannerObserver() {
        const cookieBanner = document.querySelector('.cookiebanner');
        if (!cookieBanner) return;

        // Observe attribute and style changes on the cookies banner
        const observer = new MutationObserver(() => {
            adjustInstallBannerPosition();
        });
        
        observer.observe(cookieBanner, {
            attributes: true,
            style: true,
            attributeFilter: ['style', 'class'],
            subtree: false
        });

        // Also watch body for when cookies banner is removed/re-added
        const bodyObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Check if cookies banner was added or removed
                    const hasNewBanner = Array.from(mutation.addedNodes).some(node => 
                        node.classList && node.classList.contains('cookiebanner')
                    );
                    const hasRemovedBanner = Array.from(mutation.removedNodes).some(node => 
                        node.classList && node.classList.contains('cookiebanner')
                    );
                    
                    if (hasNewBanner || hasRemovedBanner) {
                        adjustInstallBannerPosition();
                    }
                }
            });
        });

        bodyObserver.observe(document.body, {
            childList: true,
            subtree: false
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also expose functions that can be called from theme-index.js
    window.updateCookiesBannerTheme = updateCookiesBannerTheme;
    window.adjustInstallBannerPosition = adjustInstallBannerPosition;
})();
