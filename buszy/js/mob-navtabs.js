      // Mobile bottom nav always visible - no hide/show on scroll
        
        // Mobile bottom nav shrink on scroll
        (function () {
            var lastScrollY = 0;
            var nav = document.querySelector('.mobile-bottom-nav');
            if (!nav) return;
            
            var ticking = false;
            var isShrunken = false;
            var scrollThreshold = 10; // Require 10px scroll to trigger shrink/expand
            var minScrollToShrink = 50; // Only shrink if scrolled down at least 50px from top

            function updateNavState() {
                var currentScrollY = window.scrollY;
                
                // Always expand when at the very top
                if (currentScrollY <= 0) {
                    if (isShrunken) {
                        nav.classList.remove('shrunk');
                        isShrunken = false;
                    }
                    lastScrollY = 0;
                    return;
                }
                
                // Check if we've scrolled enough to trigger change
                var scrollDelta = Math.abs(currentScrollY - lastScrollY);
                if (scrollDelta < scrollThreshold) {
                    return; // Not enough movement to trigger
                }
                
                if (currentScrollY > lastScrollY && currentScrollY > minScrollToShrink) {
                    // Scrolling down — shrink nav
                    if (!isShrunken) {
                        nav.classList.add('shrunk');
                        isShrunken = true;
                    }
                } else if (currentScrollY < lastScrollY) {
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
                        updateNavState();
                        ticking = false;
                    });
                    ticking = true;
                }
            }, { passive: true });
            
            // Ensure nav is expanded on page load
            updateNavState();
        })();

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