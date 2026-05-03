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
        // Line / network list cards
        if (e.target.closest('.custom-list-item')) {
            haptic(10);
            return;
        }
        // Disruption history cards
        if (e.target.closest('.disruption-card')) {
            haptic(8);
            return;
        }
        // List group items (menu, settings, announcements)
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
