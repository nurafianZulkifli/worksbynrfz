// Moves the page's search input into the navbar once the user scrolls past it.
(function () {
    const container = document.querySelector('.selector-section .search-container');
    const wrapper = container && container.querySelector('.search-input-wrapper');
    const navContainer = document.querySelector('.navbar-container');
    const navbar = navContainer && navContainer.querySelector('.navbar');
    const results = document.querySelector('.fl-station-results, .fl-stop-results');
    if (!wrapper || !navbar) return;

    const anchor = document.createElement('div');
    anchor.className = 'nav-search-anchor';
    container.insertBefore(anchor, wrapper);

    const resultsHome = results && document.createElement('div');
    if (results) results.parentNode.insertBefore(resultsHome, results);

    const navList = navbar.querySelector('.navbar-nav');
    let inNavbar = false;

    // Track the bar every frame while docked so the list follows its transitions exactly.
    let raf = 0;
    function position() {
        if (!inNavbar || !results) return;
        const b = wrapper.getBoundingClientRect();
        const c = navContainer.getBoundingClientRect();
        const left = (b.left - c.left) + 'px';
        const width = b.width + 'px';
        if (results.style.left !== left) results.style.left = left;
        if (results.style.width !== width) results.style.width = width;
        results.style.top = (b.bottom - c.top + 10) + 'px';
    }

    function loop() {
        position();
        raf = inNavbar ? requestAnimationFrame(loop) : 0;
    }

    const desktop = window.matchMedia('(min-width: 995px)');

    // Mobile/tablet: the navbar is hidden, so the bar floats above the bottom nav instead.
    const dock = document.createElement('div');
    dock.className = 'ns-mobile-dock';
    document.body.appendChild(dock);

    let mode = null;

    // While a docked results list is open: blur the page, lock scrolling, tap outside to dismiss.
    const backdrop = document.createElement('div');
    backdrop.className = 'ns-backdrop';
    document.body.appendChild(backdrop);
    let dismissed = false;
    // Dismiss only hides the list (keeps the query and matches), so focusing or typing brings it back.
    backdrop.addEventListener('click', () => { dismissed = true; syncLock(); });
    backdrop.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    const reopen = () => { if (dismissed) { dismissed = false; syncLock(); } };
    wrapper.addEventListener('focusin', reopen);
    wrapper.addEventListener('input', reopen);
    if (results) results.addEventListener('click', reopen);

    function syncLock() {
        const open = !!(mode && results && results.childElementCount > 0 && !dismissed);
        document.documentElement.classList.toggle('ns-lock', open);
        document.body.classList.toggle('ns-results-open', open);
        document.body.classList.toggle('ns-dismissed', dismissed);
    }
    if (results) new MutationObserver(syncLock).observe(results, { childList: true });

    function undock() {
        container.insertBefore(wrapper, anchor.nextSibling);
        anchor.style.height = '';
        if (results) {
            resultsHome.parentNode.insertBefore(results, resultsHome.nextSibling);
            resultsHome.style.height = resultsHome.style.marginTop = '';
            results.style.left = results.style.width = results.style.top = '';
        }
    }

    function dockTo(target) {
        anchor.style.height = wrapper.offsetHeight + 'px';
        if (results) {
            // Keep the list's space in the page so the document height doesn't change on dock
            resultsHome.style.height = results.offsetHeight + 'px';
            resultsHome.style.marginTop = getComputedStyle(results).marginTop;
        }
        if (target === 'desktop') {
            navbar.insertBefore(wrapper, navList);
            if (results) navContainer.appendChild(results);
        } else {
            if (results) dock.appendChild(results);
            dock.appendChild(wrapper);
        }
    }

    function update() {
        const bottom = anchor.getBoundingClientRect().bottom;
        const target = desktop.matches ? 'desktop' : 'mobile';
        // Hysteresis: docking and undocking use different thresholds so a layout change can't flip-flop
        const dockAt = target === 'desktop' ? 70 : 0;
        const undockAt = target === 'desktop' ? 110 : 40;
        let next = mode;
        if (mode && mode !== target) next = null;
        else if (mode) next = bottom < undockAt ? mode : null;
        else next = bottom < dockAt ? target : null;
        if (next === mode) { position(); return; }
        if (mode) undock();
        if (next) dockTo(next);
        mode = next;
        dismissed = false;
        inNavbar = mode === 'desktop';
        document.body.classList.toggle('nav-search-on', inNavbar);
        document.body.classList.toggle('ns-mobile-on', mode === 'mobile');
        syncLock();
        if (inNavbar && !raf) raf = requestAnimationFrame(loop);
        position();
        wrapper.classList.remove('ns-in', 'ns-out');
        void wrapper.offsetWidth;
        wrapper.classList.add(mode ? 'ns-in' : 'ns-out');
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
})();
