/**
 * haptic.js — Fin Track
 * Native-feel haptic feedback via the Vibration API on key interactive elements.
 */
(function () {
    if (!('vibrate' in navigator)) return;

    function haptic(ms) {
        navigator.vibrate(ms);
    }

    document.addEventListener('click', function (e) {
        // Bottom nav tabs
        if (e.target.closest('.mobile-bottom-nav li')) {
            haptic(8);
            return;
        }
        // Transaction items
        if (e.target.closest('.txn-item')) {
            haptic(10);
            return;
        }
        // Account switcher items
        if (e.target.closest('.acct-item')) {
            haptic(8);
            return;
        }
        // List group items (settings, menu)
        if (e.target.closest('.list-group-item')) {
            haptic(8);
            return;
        }
        // Month tabs
        if (e.target.closest('.month-btn')) {
            haptic(6);
            return;
        }
        // Buttons
        if (e.target.closest('button')) {
            haptic(6);
            return;
        }
        // Breadcrumb links
        if (e.target.closest('.breadcrumb-item a')) {
            haptic(6);
        }
    }, { passive: true });
})();
