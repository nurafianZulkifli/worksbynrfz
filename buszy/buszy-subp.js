/* Dark Mode Functionality for Individual Pages */

// Use window properties if they exist from initial script, otherwise create them
if (typeof window._themePreference === 'undefined') {
    window._themePreference = localStorage.getItem('theme-preference') || 'system';
}
if (typeof window._prefersDark === 'undefined') {
    window._prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Determine if dark mode should be active
function shouldBeDark() {
    if (window._themePreference === 'dark') return true;
    if (window._themePreference === 'light') return false;
    if (window._themePreference === 'system') return window._prefersDark;
    return window._prefersDark; // Default to system preference
}

// Apply theme on page load
if (shouldBeDark()) {
    document.body.classList.add('dark-mode');
    updateThemeIcon('dark');
} else {
    updateThemeIcon('light');
}

// Listen to theme toggle clicks
document.addEventListener('DOMContentLoaded', function() {
    const themeToggleDesktop = document.getElementById('theme-toggle-desktop');
    const themeToggleMobile = document.getElementById('theme-toggle-mobile');
    
    function cycleTheme() {
        const themes = ['light', 'dark', 'system'];
        const currentTheme = window._themePreference || 'system';
        const currentIndex = themes.indexOf(currentTheme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        applyTheme(nextTheme);
    }
    
    function applyTheme(preference) {
        localStorage.setItem('theme-preference', preference);
        window._themePreference = preference;
        
        if (preference === 'dark') {
            document.body.classList.add('dark-mode');
            updateThemeIcon('dark');
        } else if (preference === 'light') {
            document.body.classList.remove('dark-mode');
            updateThemeIcon('light');
        } else if (preference === 'system') {
            if (window._prefersDark) {
                document.body.classList.add('dark-mode');
                updateThemeIcon('dark');
            } else {
                document.body.classList.remove('dark-mode');
                updateThemeIcon('light');
            }
        }
    }
    
    if (themeToggleDesktop) {
        themeToggleDesktop.addEventListener('click', (e) => {
            e.preventDefault();
            cycleTheme();
        });
    }
    
    if (themeToggleMobile) {
        themeToggleMobile.addEventListener('click', (e) => {
            e.preventDefault();
            cycleTheme();
        });
    }
});

// Follow system theme changes when set to 'system' preference
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    window._prefersDark = e.matches;
    if (localStorage.getItem('theme-preference') === 'system' || localStorage.getItem('theme-preference') === null) {
        if (e.matches) {
            document.body.classList.add('dark-mode');
            updateThemeIcon('dark');
        } else {
            document.body.classList.remove('dark-mode');
            updateThemeIcon('light');
        }
    }
});

// Get both toggle buttons (for backward compatibility with mobile views)
const toggleButtonDesktop = document.getElementById('dark-mode-toggle-desktop');
const toggleButtonMobile = document.getElementById('dark-mode-toggle-mobile');

// Function to update the theme icon and text with animation
function updateThemeIcon(theme) {
    const themeIconDesktop = document.getElementById('theme-icon-desktop');
    const themeIconMobile = document.getElementById('theme-icon-mobile');
    const themeTextDesktop = document.getElementById('theme-text-desktop');
    const themeTextMobile = document.getElementById('theme-text-mobile');
    const preference = window._themePreference || 'system';

    // Add animation class to both icons
    if (themeIconDesktop) themeIconDesktop.classList.add('animate');
    if (themeIconMobile) themeIconMobile.classList.add('animate');

    // Update the icon based on the theme
    if (theme === 'dark') {
        if (themeIconDesktop) {
            themeIconDesktop.classList.remove('fa-sun-bright');
            themeIconDesktop.classList.add('fa-moon-stars');
        }
        if (themeIconMobile) {
            themeIconMobile.classList.remove('fa-sun-bright');
            themeIconMobile.classList.add('fa-moon-stars');
        }
    } else {
        if (themeIconDesktop) {
            themeIconDesktop.classList.remove('fa-moon-stars');
            themeIconDesktop.classList.add('fa-sun-bright');
        }
        if (themeIconMobile) {
            themeIconMobile.classList.remove('fa-moon-stars');
            themeIconMobile.classList.add('fa-sun-bright');
        }
    }
    
    // Update display text
    let displayText = 'Theme: ';
    if (preference === 'light') {
        displayText += 'Light';
    } else if (preference === 'dark') {
        displayText += 'Dark';
    } else if (preference === 'system') {
        displayText += 'Follow System';
    }
    
    if (themeTextDesktop) themeTextDesktop.textContent = displayText;
    if (themeTextMobile) themeTextMobile.textContent = displayText;

    // Remove the animation class after the animation ends
    setTimeout(() => {
        if (themeIconDesktop) themeIconDesktop.classList.remove('animate');
        if (themeIconMobile) themeIconMobile.classList.remove('animate');
    }, 300); // Match the duration of the CSS transition
}

// ── In-app push notification banner ──────────────────────────────────
// When a push arrives while the app is open, browsers suppress the OS
// pop-up banner. We show our own prominent banner instead.

// Cleans up a 'notify once' subscription from local tracking after it fires.
// Works on all pages (not just art.html/alerts.html where push-notify.js is loaded).
function _bzCleanOnceTracked(busStopCode, serviceNo) {
    if (!busStopCode || !serviceNo) return;
    try {
        const key = 'buszy_push_subs';
        const subs = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        subs.delete(busStopCode + ':' + serviceNo);
        localStorage.setItem(key, JSON.stringify([...subs]));
    } catch {}
    if (window.BuszyPushNotify) window.BuszyPushNotify.restoreButtonStates();
}

// Primary: BroadcastChannel (immediate, reliable delivery to foreground tabs)
if (typeof BroadcastChannel !== 'undefined') {
    const _bzPushCh = new BroadcastChannel('buszy-push');
    _bzPushCh.addEventListener('message', event => {
        if (event.data?.type === 'PUSH_RECEIVED') {
            const { title, body, data } = event.data;
            _bzClearPendingNotif();
            const vibPat = data?.type === 'arrived'  ? [300, 100, 300, 100, 300, 100, 300]
                         : data?.type === 'service-alert' ? [400, 150, 400]
                         : [300, 100, 300];
            if (navigator.vibrate) navigator.vibrate(vibPat);
            // OS notification is always shown by the SW; page just shows the in-app banner
            showPushBanner(title, body, data);
            if (data?.notifyMode === 'once') _bzCleanOnceTracked(data.busStopCode, data.serviceNo);
        }
    });
}

// Fallback: SW postMessage (belt-and-braces for older browsers)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'PUSH_RECEIVED') {
            const { title, body, data } = event.data;
            _bzClearPendingNotif();
            const vibPat = data?.type === 'arrived'  ? [300, 100, 300, 100, 300, 100, 300]
                         : data?.type === 'service-alert' ? [400, 150, 400]
                         : [300, 100, 300];
            if (navigator.vibrate) navigator.vibrate(vibPat);
            // OS notification is always shown by the SW; page just shows the in-app banner
            showPushBanner(title, body, data);
            if (data?.notifyMode === 'once') _bzCleanOnceTracked(data.busStopCode, data.serviceNo);
        }
    });
}

// Background / closed-app: SW stores notification in Cache; we check here on load & focus
function _bzCheckPendingNotif() {
    if (document.hidden || !('caches' in window)) return;
    caches.open('buszy-pending-notif').then(function(cache) {
        cache.match('pending').then(function(resp) {
            if (!resp) return;
            cache.delete('pending');
            resp.json().then(function(notif) {
                if (Date.now() - notif.ts < 120000) { // only show if < 2 min old
                    showPushBanner(notif.title, notif.body, notif.data);
                }
                // Always clean up 'once' tracked subscription, regardless of notification age
                if (notif.data?.notifyMode === 'once') {
                    _bzCleanOnceTracked(notif.data.busStopCode, notif.data.serviceNo);
                }
            });
        });
    });
}

function _bzClearPendingNotif() {
    if ('caches' in window) caches.open('buszy-pending-notif').then(function(c) { c.delete('pending'); });
}

// Re-fire the OS notification from page context.
// When called from a push event the browser may suppress the heads-up pop-up;
// calling showNotification() from the page can bypass that suppression.
// Uses a fresh timestamp tag so Android treats it as a NEW notification → heads-up.
function _bzShowOsNotif(title, body, data) {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready.then(function(reg) {
        var isAlert   = data && data.type === 'service-alert';
        var isArrived = data && data.type === 'arrived';
        var typeTag = isArrived ? 'arrived' : 'arriving';
        var baseTag = isAlert
            ? 'buszy-service-alert'
            : 'buszy-' + typeTag + '-' + ((data && data.serviceNo) || '') + '-' + ((data && data.busStopCode) || '');
        var freshTag = baseTag + '-' + Date.now();
        // Close only the matching type's notification, then show a brand-new one
        reg.getNotifications().then(function(all) {
            all.filter(function(n) { return n.tag.startsWith(baseTag); }).forEach(function(n) { n.close(); });
            reg.showNotification(title, {
                body: body || '',
                icon: './assets/icon-192.png',
                badge: './assets/icon-192.png',
                tag: freshTag,
                requireInteraction: true,
                silent: false,
                vibrate: isArrived ? [300, 100, 300, 100, 300, 100, 300]
                        : isAlert  ? [400, 150, 400]
                        :            [300, 100, 300],
                data: data || {}
            }).catch(function() {});
        }).catch(function() {});
    }).catch(function() {});
}

_bzCheckPendingNotif();
document.addEventListener('visibilitychange', _bzCheckPendingNotif);

function showPushBanner(title, body, data) {
    // Remove any existing banner immediately
    const existing = document.getElementById('bz-push-banner');
    if (existing) {
        clearTimeout(existing._dismissTimer);
        existing.remove();
    }

    // Build the navigation target
    const isAlert = data?.type === 'service-alert';
    let navUrl = './alerts.html';
    if (!isAlert && data?.busStopCode) {
        navUrl = './art.html?BusStopCode=' + encodeURIComponent(data.busStopCode);
        if (data.serviceNo) navUrl += '&ServiceNo=' + encodeURIComponent(data.serviceNo);
    }

    const isArrived = data?.type === 'arrived';
    const banner = document.createElement('div');
    banner.id = 'bz-push-banner';
    banner.className = 'bz-push-banner' + (isArrived ? ' bz-push-banner--arrived' : '');
    banner.innerHTML =
        '<img class="bz-push-banner-icon" src="./assets/icon-192.png" alt="">' +
        '<div class="bz-push-banner-text">' +
            '<div class="bz-push-banner-title">' + _bzEscHtml(title) + '</div>' +
            '<div class="bz-push-banner-body">' + _bzEscHtml(body) + '</div>' +
        '</div>' +
        '<button class="bz-push-banner-close" aria-label="Dismiss">\u00d7</button>' +
        '<div class="bz-push-banner-progress"></div>';

    document.body.appendChild(banner);

    // Trigger slide-in on next paint
    requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('show')));

    // Tap banner body → navigate
    banner.addEventListener('click', e => {
        if (e.target.closest('.bz-push-banner-close')) return;
        window.location.href = navUrl;
    });

    // Close button
    banner.querySelector('.bz-push-banner-close').addEventListener('click', e => {
        e.stopPropagation();
        _bzDismissBanner(banner);
    });

    // Auto-dismiss after 6 s
    banner._dismissTimer = setTimeout(() => _bzDismissBanner(banner), 6000);
}

function _bzDismissBanner(banner) {
    clearTimeout(banner._dismissTimer);
    banner.classList.remove('show');
    banner.addEventListener('transitionend', () => banner.remove(), { once: true });
}

function _bzEscHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Auto-subscribe to bus service alerts ──────────────────────────────
// Silently subscribes to bus service disruption alerts on every page load
// when notification permission is granted and the user hasn't opted out.
// Exposed as window._bzAutoSubAlerts so push-notify.js can trigger it
// immediately when the user grants notification permission.
(function () {
    const _BZ_ALERT_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
    const _BZ_ALERT_KEY    = 'buszy_alert_notif_subscribed';

    function _bzBase64ToUint8(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    async function _bzAutoSubAlerts() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (Notification.permission !== 'granted') return;
        // Respect explicit opt-out (set by alert-notify.js toggle button)
        if (localStorage.getItem(_BZ_ALERT_KEY) === 'false') return;
        try {
            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                const res = await fetch(_BZ_ALERT_SERVER + '/push/vapid-public-key');
                if (!res.ok) return;
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: _bzBase64ToUint8(await res.text())
                });
            }
            await fetch(_BZ_ALERT_SERVER + '/push/subscribe-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON() })
            });
            localStorage.setItem(_BZ_ALERT_KEY, 'true');
        } catch { /* network unavailable — will retry on next load */ }
    }

    // Expose globally so push-notify.js can call it right after permission is granted,
    // without waiting for the next page load.
    window._bzAutoSubAlerts = _bzAutoSubAlerts;

    document.addEventListener('DOMContentLoaded', _bzAutoSubAlerts);
})();

// ── Handle push subscription rotation ────────────────────────────────
// When the SW detects a subscription change (pushsubscriptionchange event),
// it notifies open pages so they can re-register bus timing subscriptions
// with the server under the new push endpoint.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
            // Delegate to push-notify.js reRegisterAll if available, otherwise retry on next load
            if (window.BuszyPushNotify && typeof window.BuszyPushNotify.reRegisterAll === 'function') {
                window.BuszyPushNotify.reRegisterAll().catch(() => {});
            }
        }
    });
}
