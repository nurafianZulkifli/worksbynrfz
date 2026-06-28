// ****************************
// :: Alerts Indicator Dot ::
// ****************************

const ALERTS_HAS_ACTIVE_KEY = 'buszy_alerts_has_active';
const ALERTS_CACHE_KEY = 'buszy_alerts_cache';
const ALERTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (increased from 5 to reduce API calls)
const ALERTS_API_URL = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts';
let _alertsFetchInProgress = false; // Debounce flag to prevent simultaneous requests

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
    // Debounce: prevent multiple simultaneous requests
    if (_alertsFetchInProgress) return;
    
    _alertsFetchInProgress = true;
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
        console.debug('Alerts fetch error:', e);
    } finally {
        _alertsFetchInProgress = false;
    }
}

function updateAlertsIndicatorDots() {
    // Apply cached value immediately so there's no visible delay
    const cached = JSON.parse(localStorage.getItem(ALERTS_CACHE_KEY) || 'null');
    if (cached !== null) {
        applyAlertsDots(cached.hasActive);
    } else {
        // No cache yet — default to hidden until we know
        applyAlertsDots(false);
    }

    // Only fetch if cache is stale (not within TTL)
    // This prevents excessive API calls while allowing periodic refreshes
    const isCacheStale = cached === null || (Date.now() - cached.ts >= ALERTS_CACHE_TTL);
    if (isCacheStale) {
        fetchAndCacheAlerts();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    updateAlertsIndicatorDots();
});

if (document.readyState !== 'loading') {
    updateAlertsIndicatorDots();
}
