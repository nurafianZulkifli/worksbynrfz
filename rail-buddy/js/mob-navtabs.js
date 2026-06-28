      // Mobile bottom nav always visible - no hide/show on scroll
        
        // Mobile bottom nav shrink on scroll
        (function () {
            var lastScrollY = window.scrollY;
            var nav = document.querySelector('.mobile-bottom-nav');
            if (!nav) return;
            var ticking = false;
            var isShrunken = false;
            var scrollThreshold = 8;

            function onScroll() {
                var currentScrollY = window.scrollY;
                if (currentScrollY > lastScrollY + scrollThreshold) {
                    // Scrolling down — shrink nav
                    if (!isShrunken) {
                        nav.classList.add('shrunk');
                        isShrunken = true;
                    }
                } else if (currentScrollY < lastScrollY - scrollThreshold) {
                    // Scrolling up — expand nav
                    if (isShrunken) {
                        nav.classList.remove('shrunk');
                        isShrunken = false;
                    }
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
        })();

        // Toggle .at-top class based on scroll position
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