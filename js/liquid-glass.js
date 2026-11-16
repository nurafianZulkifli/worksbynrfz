// SVG displacement is optional; the CSS blur remains the fallback.
(function () {
    if (!window.ResizeObserver || !window.CSS ||
        !window.CSS.supports('backdrop-filter', 'url("#nav-glass")')) return;

    var surfaces = document.querySelectorAll(
        '.navbar-container .navbar, .mobile-bottom-nav ul, .wbnrfz-works .card, ' +
        '.wbnrfz-works .card-content, .app-card, #cv-bat .search-container, ' +
        '.inline-search-view > .container, .balance-card, .acct-dropdown, ' +
        '.dropdown-menu, .breadcrumb.breadcrumb-fixed, .breadcrumb-desktop .breadcrumb-item a, ' +
        '.eicw-nav-btn, .eicw-nav-menu'
    );
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) return;

    function updateGlass(surface) {
        var width = Math.round(surface.offsetWidth);
        var height = Math.round(surface.offsetHeight);
        if (!width || !height) return;

        canvas.width = width;
        canvas.height = height;
        var pixels = context.createImageData(width, height);
        var radius = Math.min(parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 0, width / 2, height / 2);
        var edgeWidth = Math.min(10, radius);

        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var dx = x + 0.5 - width / 2;
                var dy = y + 0.5 - height / 2;
                var qx = Math.abs(dx) - (width / 2 - radius);
                var qy = Math.abs(dy) - (height / 2 - radius);
                var ox = Math.max(qx, 0);
                var oy = Math.max(qy, 0);
                var distance = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius;
                var amount = distance <= 0 && distance > -edgeWidth ? Math.pow(1 + distance / edgeWidth, 2) * 70 : 0;
                var length = Math.sqrt(ox * ox + oy * oy);
                var nx = length ? ox / length * Math.sign(dx) : (qx > qy ? Math.sign(dx) : 0);
                var ny = length ? oy / length * Math.sign(dy) : (qy >= qx ? Math.sign(dy) : 0);
                var i = (y * width + x) * 4;
                pixels.data[i] = 128 + nx * amount;
                pixels.data[i + 1] = 128 + ny * amount;
                pixels.data[i + 2] = 128;
                pixels.data[i + 3] = 255;
            }
        }

        context.putImageData(pixels, 0, 0);
        var map = canvas.toDataURL('image/png');
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
            '<filter id="nav-glass" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
            '<feImage href="' + map + '" x="0" y="0" width="' + width + '" height="' + height + '" result="map"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="map" scale="16" xChannelSelector="R" yChannelSelector="G"/>' +
            '</filter></svg>';
        var filter = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '#nav-glass")';
        surface.style.backdropFilter = 'blur(8px) ' + filter + ' saturate(150%)';
    }

    var timers = new WeakMap();
    var observer = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            var surface = entry.target;
            clearTimeout(timers.get(surface));
            timers.set(surface, setTimeout(function () {
                updateGlass(surface);
            }, 120));
        });
    });

    function observeSurface(surface) {
        updateGlass(surface);
        observer.observe(surface);
    }

    surfaces.forEach(observeSurface);

    function observeBackToTop() {
        var button = document.getElementById('scrollUp');
        if (button) observeSurface(button);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeBackToTop);
    } else {
        observeBackToTop();
    }
})();
