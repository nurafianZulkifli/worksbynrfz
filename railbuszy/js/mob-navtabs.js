if (!document.querySelector('script[data-liquid-glass]')) {
    var glassScript = document.createElement('script');
    glassScript.dataset.liquidGlass = 'true';
    glassScript.src = new URL('../../js/liquid-glass.js', document.currentScript.src).href;
    glassScript.onerror = function () { console.error('Unable to load liquid glass effects'); };
    document.head.appendChild(glassScript);
}

// Keep the shared Buszy navigation aligned with the selected transport mode.
(function () {
    var modeKey = 'buszy-transport-mode';
    var isRailTimingsPage = window.location.pathname.endsWith('/train-timings.html');
    var mode = isRailTimingsPage || localStorage.getItem(modeKey) === 'rail' ? 'rail' : 'bus';
    var historyHref = '../rail-buddy/history.html';
    var railTimingsHref = './train-timings.html';
    var busTimingsHref = './first-last.html';
    if (isRailTimingsPage) localStorage.setItem(modeKey, mode);

    function addHistoryItem(list, mobile) {
        if (!list || list.querySelector('[data-unified-history]')) return;
        var firstItem = list.querySelector('li');
        if (!firstItem) return;

        var item = document.createElement('li');
        item.className = mobile ? '' : 'nav-item';
        item.dataset.unifiedHistory = 'true';
        var link = document.createElement('a');
        link.href = historyHref;
        link.className = mobile ? '' : 'nav-link';

        var icon = document.createElement('i');
        icon.className = 'fa-regular fa-clock-rotate-left';
        if (mobile) {
            var iconWrap = document.createElement('span');
            iconWrap.className = 'icon';
            iconWrap.appendChild(icon);
            link.appendChild(iconWrap);
            var label = document.createElement('span');
            label.className = 'label';
            label.textContent = 'History';
            link.appendChild(label);
        } else {
            link.appendChild(icon);
            var desktopLabel = document.createElement('span');
            desktopLabel.textContent = 'History';
            link.appendChild(desktopLabel);
        }

        item.appendChild(link);
        firstItem.parentNode.insertBefore(item, firstItem.nextSibling);
    }

    function updateTimingsLinks(selectedMode) {
        document.querySelectorAll('.navbar-nav a, .mobile-bottom-nav a').forEach(function (link) {
            var label = link.querySelector('.label') || link.querySelector('span');
            if (label && label.textContent.trim() === 'Timings') {
                link.href = selectedMode === 'rail' ? railTimingsHref : busTimingsHref;
            }
        });
    }

    function updateHistoryVisibility(selectedMode) {
        document.querySelectorAll('[data-unified-history]').forEach(function (item) {
            item.hidden = selectedMode !== 'rail';
        });
    }

    addHistoryItem(document.querySelector('.navbar-nav'), false);
    addHistoryItem(document.querySelector('.mobile-bottom-nav ul'), true);
    updateTimingsLinks(mode);
    updateHistoryVisibility(mode);

    window.addEventListener('buszy:transport-mode-change', function (event) {
        mode = event.detail && event.detail.mode === 'rail' ? 'rail' : 'bus';
        localStorage.setItem(modeKey, mode);
        updateTimingsLinks(mode);
        updateHistoryVisibility(mode);
    });
})();

// Collapse desktop navbar labels on scroll down, restore on scroll up
(function () {
    var navbar = document.querySelector('.navbar-container');
    if (!navbar) return;
    var lastScrollY = window.scrollY;

    function updateNavbar() {
        var currentScrollY = window.scrollY;
        if (currentScrollY <= 50 || currentScrollY < lastScrollY - 4) {
            navbar.classList.remove('scrolled');
        } else if (currentScrollY > lastScrollY + 4) {
            navbar.classList.add('scrolled');
        }
        lastScrollY = currentScrollY;
    }

    updateNavbar();
    window.addEventListener('scroll', updateNavbar, { passive: true });
})();

// Collapse mobile bottom nav (labels and pill width) based on scroll direction
(function () {
    var lastScrollY = window.scrollY;
    var nav = document.querySelector('.mobile-bottom-nav');
    var ticking = false;

    function onScroll() {
        var currentScrollY = window.scrollY;
        if (!nav) return;
        if (window.innerWidth > 994) return;
        if (currentScrollY > lastScrollY + 4) {
            nav.classList.add('labels-hidden');
        } else if (currentScrollY < lastScrollY - 4) {
            nav.classList.remove('labels-hidden');
        }
        lastScrollY = currentScrollY;
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(function () {
                onScroll();
                ticking = false;
            });
            ticking = true;
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 994 && nav) {
            nav.classList.remove('labels-hidden');
        }
    });
})();

// Toggle .at-top class on the floating breadcrumb based on scroll position
function updateBreadcrumbAtTop() {
    var bc = document.getElementById('floating-breadcrumb');
    if (!bc) return;
    if (window.scrollY <= 0) {
        bc.classList.add('at-top');
    } else {
        bc.classList.remove('at-top');
    }
}
window.addEventListener('scroll', updateBreadcrumbAtTop);
window.addEventListener('DOMContentLoaded', updateBreadcrumbAtTop);