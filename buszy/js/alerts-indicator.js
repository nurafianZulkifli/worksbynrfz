// ****************************
// :: Alerts Indicator Dot ::
// ****************************

const ALERTS_HAS_ACTIVE_KEY = 'buszy_alerts_has_active';
const ALERTS_CACHE_KEY = 'buszy_alerts_cache';
const ALERTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const ALERTS_API_URL = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts';

function applyAlertsDots(hasActive) {
    const dots = document.querySelectorAll('.alerts-indicator-dot');
    dots.forEach(dot => {
        if (hasActive) {
            dot.classList.add('show');
        } else {
            dot.classList.remove('show');
        }
    });
}

function hasBusAlerts(data) {
    if (!data || !data.value) return false;

    let alerts = Array.isArray(data.value) ? data.value : [data.value];

    return alerts.some(alert => {
        if (!alert.Message || !Array.isArray(alert.Message)) return false;
        return alert.Message.some(msgObj => {
            const msg = (msgObj.Content || '').toLowerCase();
            return msg.includes('bus service') && (msg.includes('affected') || msg.includes('diverted') || msg.includes('delayed'));
        });
    });
}

async function fetchAndCacheAlerts() {
    try {
        const response = await fetch(ALERTS_API_URL);
        const data = await response.json();
        const hasActive = hasBusAlerts(data);

        // Cache result with timestamp
        localStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), hasActive }));
        localStorage.setItem(ALERTS_HAS_ACTIVE_KEY, hasActive);
        applyAlertsDots(hasActive);
    } catch (e) {
        // Network error — keep showing whatever was cached
    }
}

function updateAlertsIndicatorDots() {
    // Apply cached value immediately so there's no visible delay
    const cached = JSON.parse(localStorage.getItem(ALERTS_CACHE_KEY) || 'null');
    if (cached !== null) {
        applyAlertsDots(cached.hasActive);

        // Only refetch if cache is stale
        if (Date.now() - cached.ts < ALERTS_CACHE_TTL) return;
    } else {
        // No cache yet — default to hidden until we know
        applyAlertsDots(false);
    }

    fetchAndCacheAlerts();
}

document.addEventListener('DOMContentLoaded', function () {
    updateAlertsIndicatorDots();
});

if (document.readyState !== 'loading') {
    updateAlertsIndicatorDots();
}
