// ****************************
// :: PWA Installation Handling
// ****************************

if ('serviceWorker' in navigator) {
    // Use relative path from settings.html to service-worker.js
    navigator.serviceWorker.register('../service-worker.js').catch((err) => {
        console.error('Service Worker registration failed:', err);
    });
}

const installBtn = document.getElementById('install-btn');
let deferredPrompt = null;

function updateInstallButton(installed) {
    if (installed) {
        installBtn.textContent = 'Installed';
        installBtn.disabled = true;
    } else {
        installBtn.textContent = 'Not installed';
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
        installBtn.disabled = true;
        installBtn.textContent = 'Install not supported';
    }
});

window.addEventListener('appinstalled', () => {
    updateInstallButton(true);
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.disabled = false;
    updateInstallButton(false);
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            updateInstallButton(true);
        }
        deferredPrompt = null;
        installBtn.disabled = true;
    } else {
        alert('Install prompt is not available. Try refreshing the page or using a supported browser.');
    }
});