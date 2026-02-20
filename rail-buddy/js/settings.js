// ****************************
// :: PWA Installation Handling
// ****************************
// Use centralized PWA Helper for consistent behavior across apps
// The main app initializes PWA via pwa-init.js, so we just need install button handling

let deferredPrompt = null;

function updateInstallButton(installed) {
    const installBtn = document.getElementById('install-btn');
    if (!installBtn) return;
    
    if (installed) {
        installBtn.textContent = 'Installed';
        installBtn.disabled = true;
    } else {
        installBtn.textContent = 'Install App';
        installBtn.disabled = deferredPrompt === null;
    }
}

function detectInstalled() {
    // For most browsers
    return window.matchMedia('(display-mode: standalone)').matches
        // For iOS Safari
        || window.navigator.standalone === true;
}

window.addEventListener('DOMContentLoaded', () => {
    updateInstallButton(detectInstalled());
    // Fallback for browsers that do not support beforeinstallprompt
    if (!('onbeforeinstallprompt' in window)) {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.disabled = true;
            installBtn.textContent = 'Install not supported';
        }
    }
});

window.addEventListener('appinstalled', () => {
    console.log('[RailBuddy Settings] App installed successfully');
    updateInstallButton(true);
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[RailBuddy Settings] Install prompt available');
    updateInstallButton(detectInstalled());
});

// Install button click handler
document.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('install-btn');
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('[RailBuddy Settings] Installation outcome:', outcome);
                if (outcome === 'accepted') {
                    updateInstallButton(true);
                }
                deferredPrompt = null;
            } else {
                alert('Install prompt is not available. Try refreshing the page or using a supported browser.');
            }
        });
    }
});