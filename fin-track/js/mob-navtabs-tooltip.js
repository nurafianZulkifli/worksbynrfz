// ****************************
// :: Mobile Bottom Nav Long Press Tooltips — Fin Track
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.mobile-bottom-nav li');
    const tooltipLabels = {
        'index.html': 'Overview',
        './': 'Overview',
        '#': 'Overview',
        './menu.html': 'Menu',
        'menu.html': 'Menu'
    };

    let pressTimer = null;
    let isLongPress = false;

    navItems.forEach((item) => {
        const link = item.querySelector('a');
        let href = link?.getAttribute('href') || '';

        // If href is "#" or empty, determine label from current page
        if (href === '#' || href === '') {
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            href = currentPage || 'index.html';
        }

        const tooltipText = tooltipLabels[href] || link?.querySelector('.label')?.textContent?.trim() || 'Link';

        item.setAttribute('data-tooltip', tooltipText);

        item.addEventListener('pointerdown', () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                showTooltip(item);
            }, 500);
        });

        item.addEventListener('pointerup', () => {
            if (pressTimer) clearTimeout(pressTimer);
            if (!isLongPress) hideTooltip(item);
        });

        item.addEventListener('pointerleave', () => {
            if (pressTimer) clearTimeout(pressTimer);
            hideTooltip(item);
        });

        item.addEventListener('pointercancel', () => {
            if (pressTimer) clearTimeout(pressTimer);
            hideTooltip(item);
        });

        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    });

    function showTooltip(item) {
        const tooltipText = item.getAttribute('data-tooltip');
        let tooltip = item.querySelector('.nav-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'nav-tooltip';
            tooltip.textContent = tooltipText;
            item.appendChild(tooltip);
        }
        tooltip.classList.add('visible');
    }

    function hideTooltip(item) {
        const tooltip = item.querySelector('.nav-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
    }
});
