// Back to Top Button - Pure JS (used on pages without the jQuery scrollUp plugin)
(function () {
    'use strict';

    // If active.js/jQuery scrollUp plugin already created the button, bail out
    if (document.getElementById('scrollUp')) return;

    // Create the button
    var btn = document.createElement('a');
    btn.id = 'scrollUp';
    btn.href = '#top';
    btn.title = 'Back to Top';
    btn.innerHTML = '<i class="fa-solid fa-arrow-up-to-line"></i>';
    document.body.appendChild(btn);

    // Smooth scroll to top on click
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Show on scroll-up past threshold, hide on scroll-down (matches reference site)
    var lastScrollY = window.scrollY;
    var visible = false;
    var THRESHOLD = 200;
    var ticking = false;

    function syncBtn() {
        if (visible) {
            btn.classList.add('btt-visible');
        } else {
            btn.classList.remove('btt-visible');
        }
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(function () {
                var currentScrollY = window.scrollY;
                if (currentScrollY < THRESHOLD) {
                    visible = false;
                } else if (currentScrollY < lastScrollY - 4) {
                    // Scrolling up
                    visible = true;
                } else if (currentScrollY > lastScrollY + 4) {
                    // Scrolling down
                    visible = false;
                }
                lastScrollY = currentScrollY;
                syncBtn();
                ticking = false;
            });
            ticking = true;
        }
    });
})();
