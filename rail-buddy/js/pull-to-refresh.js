/**
 * pull-to-refresh.js
 * Native-feel pull-to-refresh for RailBuddy.
 * Usage:  initPullToRefresh(callbackFn)
 */
(function () {
    const THRESHOLD = 64;   // px of pull needed to trigger
    const MAX_PULL  = 96;   // px cap on indicator travel

    let startY = 0;
    let pulling = false;
    let triggered = false;
    let indicator = null;

    function getIndicator() {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ptr-indicator';
            indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
            indicator.setAttribute('aria-hidden', 'true');
            document.body.appendChild(indicator);
        }
        return indicator;
    }

    function setProgress(pull) {
        const el = getIndicator();
        const clamped = Math.min(pull, MAX_PULL);
        const ratio   = Math.min(clamped / THRESHOLD, 1);
        const opacity = Math.min(ratio * 1.5, 1);
        const scale   = 0.6 + 0.4 * ratio;
        const ty      = Math.min(clamped * 0.55, 44);

        el.style.opacity   = opacity;
        el.style.transform = `translateX(-50%) translateY(${ty}px) scale(${scale}) rotate(${ratio * 270}deg)`;
        el.style.display   = 'flex';
        el.classList.toggle('ptr-ready', ratio >= 1);
    }

    function hide() {
        const el = getIndicator();
        el.classList.remove('ptr-ready');
        el.classList.add('ptr-hiding');
        setTimeout(() => {
            el.style.display = 'none';
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(0px) scale(0.6) rotate(0deg)';
            el.classList.remove('ptr-hiding');
        }, 350);
    }

    function spinAndHide() {
        const el = getIndicator();
        el.classList.add('ptr-spinning');
        setTimeout(() => {
            el.classList.remove('ptr-spinning');
            hide();
        }, 800);
    }

    window.initPullToRefresh = function (callback) {
        document.addEventListener('touchstart', function (e) {
            if (window.scrollY > 0) return;
            startY   = e.touches[0].clientY;
            pulling  = true;
            triggered = false;
        }, { passive: true });

        document.addEventListener('touchmove', function (e) {
            if (!pulling) return;
            if (window.scrollY > 0) { pulling = false; hide(); return; }

            const pull = e.touches[0].clientY - startY;
            if (pull <= 0) { hide(); return; }

            setProgress(pull);

            if (pull >= THRESHOLD && !triggered) {
                triggered = true;
                if (navigator.vibrate) navigator.vibrate(8);
            }
        }, { passive: true });

        document.addEventListener('touchend', function () {
            if (!pulling) return;
            pulling = false;

            if (triggered) {
                spinAndHide();
                callback();
            } else {
                hide();
            }
        }, { passive: true });

        document.addEventListener('touchcancel', function () {
            pulling = false;
            hide();
        }, { passive: true });
    };
})();
