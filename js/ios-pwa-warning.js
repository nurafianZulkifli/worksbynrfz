/**
 * ios-pwa-warning.js
 * Warns iOS users against installing as web app due to display issues
 * Hides the install prompt and shows a banner instead
 */
(function () {
    // Check if running on iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Check if running in Safari (which can add to home screen)
    function isSafari() {
        return /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    }

    // Create and show warning banner
    function showIOSWarning() {
        // Create banner container
        const banner = document.createElement('div');
        banner.id = 'ios-pwa-warning-banner';
        banner.setAttribute('role', 'alert');
        banner.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a3f 100%);
                color: white;
                padding: 1rem 1rem 1rem 1rem;
                margin: 0;
                text-align: center;
                font-size: 14px;
                line-height: 1.4;
                border-bottom: 2px solid #d63031;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 1rem;
            ">
                <span style="flex: 1;">
                    <strong>⚠️ Note:</strong> Web app mode is not fully supported on iOS. 
                    Use Safari browser instead for the best experience.
                </span>
                <button id="ios-warning-close" style="
                    background: rgba(255,255,255,0.3);
                    border: 1px solid rgba(255,255,255,0.5);
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    flex-shrink: 0;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.5)'" 
                   onmouseout="this.style.background='rgba(255,255,255,0.3)'">
                    Dismiss
                </button>
            </div>
        `;

        document.body.insertBefore(banner, document.body.firstChild);

        // Close button handler
        document.getElementById('ios-warning-close').addEventListener('click', () => {
            banner.style.display = 'none';
            localStorage.setItem('ios-pwa-warning-dismissed', 'true');
        });

        // Persist dismissal preference
        if (!localStorage.getItem('ios-pwa-warning-dismissed')) {
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    }

    // Prevent beforeinstallprompt event on iOS Safari
    window.addEventListener('beforeinstallprompt', (e) => {
        if (isIOS()) {
            e.preventDefault();
            return false;
        }
    });

    // Show warning on iOS Safari
    if (isIOS() && isSafari()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showIOSWarning);
        } else {
            showIOSWarning();
        }
    }
})();
