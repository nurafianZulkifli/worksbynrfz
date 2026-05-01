/**
 * haptic.js
 * Provides native-feel haptic feedback via the Vibration API
 * on key interactive elements.
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
        // Bus stop cards
        if (e.target.closest('.bus-stop')) {
            haptic(10);
            return;
        }
        // List group items (alerts, announcements, settings)
        if (e.target.closest('.list-group-item')) {
            haptic(8);
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
