// ****************************
// :: Mobile Bottom Nav Long Press Tooltips
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.mobile-bottom-nav li');
    const tooltipLabels = {
        'index.html': 'Home',
        './': 'Home',
        './history.html': 'History',
        'history.html': 'History',
        './first-last.html': 'Timings',
        'first-last.html': 'Timings',
        './menu.html': 'Menu',
        'menu.html': 'Menu'
    };

    let pressTimer = null;
    let isLongPress = false;

    navItems.forEach((item) => {
        const link = item.querySelector('a');
        let href = link?.getAttribute('href') || '';
        
        // If href is "#", this is the active page, so determine the label from current page
        if (href === '#') {
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            href = currentPage;
        }
        
        const tooltipText = tooltipLabels[href] || 'Link';

        // Add data attribute for tooltip
        item.setAttribute('data-tooltip', tooltipText);

        // Start long press on touch/mouse down
        item.addEventListener('pointerdown', (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                showTooltip(item);
            }, 500); // 500ms long press threshold
        });

        // Cancel on pointer up
        item.addEventListener('pointerup', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
            }
            if (!isLongPress) {
                hideTooltip(item);
            }
        });

        // Cancel on pointer leave (for mouse users)
        item.addEventListener('pointerleave', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
            }
            hideTooltip(item);
        });

        // Cancel on pointer cancel
        item.addEventListener('pointercancel', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
            }
            hideTooltip(item);
        });

        // Disable right-click context menu on nav items
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
        if (tooltip) {
            tooltip.classList.remove('visible');
        }
    }
});
