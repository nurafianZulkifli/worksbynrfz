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