(() => {
    const PLACEHOLDER_EXAMPLES = [
        'Where do you want to go?',
        '188',
        'Blk 689A',
        'Ang Mo Kio Ave 3',
        'Keppel',
        '67',
        '83139'
    ];
    const ROTATE_INTERVAL_MS = 3000;
    const FADE_OUT_MS = 220;

    function createOverlay(input) {
        const wrapper = input.parentElement;
        if (!wrapper) return null;
        if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

        const overlay = document.createElement('span');
        overlay.className = 'animated-placeholder placeholder-in';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.textContent = input.placeholder;
        wrapper.appendChild(overlay);

        // Position relative to the input's own box (not the wrapper's), since wrappers like
        // .inline-search-input-wrap add their own padding that shifts the input around.
        // Color is intentionally left to CSS (.animated-placeholder) to match the real placeholder color.
        const syncMetrics = () => {
            const style = getComputedStyle(input);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const paddingRight = parseFloat(style.paddingRight) || 0;
            overlay.style.left = `${input.offsetLeft + paddingLeft}px`;
            overlay.style.top = `${input.offsetTop + input.offsetHeight / 2}px`;
            overlay.style.width = `${Math.max(0, input.offsetWidth - paddingLeft - paddingRight)}px`;
            overlay.style.font = style.font;
        };
        syncMetrics();
        window.addEventListener('resize', syncMetrics);
        new ResizeObserver(syncMetrics).observe(input);

        // Native placeholder is emptied out; the overlay takes over as the (now animated) visual hint.
        input.setAttribute('aria-label', input.placeholder || PLACEHOLDER_EXAMPLES[0]);
        input.placeholder = '';
        input.addEventListener('input', () => { overlay.style.display = input.value ? 'none' : ''; });

        return overlay;
    }

    function rotatePlaceholder(input) {
        if (!input) return;
        const overlay = createOverlay(input);
        if (!overlay) return;

        let index = 0;
        setInterval(() => {
            if (document.activeElement === input || input.value) return;
            overlay.classList.remove('placeholder-in');
            overlay.classList.add('placeholder-out');
            setTimeout(() => {
                index = (index + 1) % PLACEHOLDER_EXAMPLES.length;
                overlay.textContent = PLACEHOLDER_EXAMPLES[index];
                overlay.classList.remove('placeholder-out');
                void overlay.offsetWidth; // restart the fade-in animation
                overlay.classList.add('placeholder-in');
            }, FADE_OUT_MS);
        }, ROTATE_INTERVAL_MS);
    }

    document.addEventListener('DOMContentLoaded', () => {
        rotatePlaceholder(document.getElementById('bus-stop-search'));
        rotatePlaceholder(document.getElementById('inline-search-input'));
    });
})();
