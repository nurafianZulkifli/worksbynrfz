document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('[data-network-tab]');
    const panels = document.querySelectorAll('[data-network-panel]');

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const network = tab.dataset.networkTab;

            tabs.forEach((item) => {
                const isActive = item === tab;
                item.classList.toggle('active', isActive);
                item.setAttribute('aria-selected', String(isActive));
            });

            panels.forEach((panel) => {
                const isActive = panel.dataset.networkPanel === network;
                panel.hidden = !isActive;
                panel.classList.toggle('active', isActive);
            });
        });
    });
});