// Helper: convert URLs in text to clickable links
function linkify(text) {
    const urlRegex = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(www\.[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(go\.gov\.sg\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;
    let linked = text.replace(urlRegex, function (url) {
        let href = url;
        if (url.match(/^go\.gov\.sg\//i)) {
            href = 'https://' + url;
        } else if (!href.match(/^https?:\/\//i)) {
            href = 'http://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    return linked.replace(/\n/g, '<br>');
}

// Cache constants (moved to global scope for periodic refresh)
// Note: ALERTS_CACHE_KEY, ALERTS_CACHE_TTL, ALERTS_REFRESH_INTERVAL, and alertsRefreshIntervalId
// are declared in alerts-indicator.js to avoid duplicate declarations
const ALERTS_API_DATA_KEY = 'buszy_alerts_api_data';
let alertsFetchInProgress = false; // Debounce flag

function fetchAndUpdateAlerts() {
    // Skip if already fetching
    if (alertsFetchInProgress) return;
    
    alertsFetchInProgress = true;
    const cached = JSON.parse(localStorage.getItem(ALERTS_CACHE_KEY) || 'null');
    const cacheIsFresh = cached !== null && (Date.now() - cached.ts < ALERTS_CACHE_TTL);
    
    if (cacheIsFresh) {
        const cachedData = JSON.parse(localStorage.getItem(ALERTS_API_DATA_KEY) || 'null');
        if (cachedData) {
            processAlertsData(cachedData);
        }
        alertsFetchInProgress = false;
        return;
    }

    fetch('https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts')
        .then(r => r.json())
        .then(data => {
            // Always update cache and display with fresh data
            localStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify({ ts: Date.now() }));
            localStorage.setItem(ALERTS_API_DATA_KEY, JSON.stringify(data));
            
            // Always refresh display to ensure accuracy
            processAlertsData(data);
        })
        .catch(err => {
            console.error('Error fetching alerts:', err);
            // Only show error if we didn't have cached data to fall back on
            const hasCache = JSON.parse(localStorage.getItem(ALERTS_API_DATA_KEY) || 'null') !== null;
            if (!hasCache) {
                showErrorMessage('Failed to load alerts. Please try again later.');
            }
        })
        .finally(() => {
            alertsFetchInProgress = false;
        });
}

function startPeriodicAlertsRefresh() {
    // Clear any existing interval
    if (alertsRefreshIntervalId !== null) clearInterval(alertsRefreshIntervalId);
    
    // Set up periodic refresh every 5 minutes
    alertsRefreshIntervalId = setInterval(() => {
        // Skip refresh if page is hidden (battery optimization)
        if (document.hidden) return;
        fetchAndUpdateAlerts();
    }, ALERTS_REFRESH_INTERVAL);
}

document.addEventListener('DOMContentLoaded', function () {
    // Set up event delegation for service code clicks
    document.addEventListener('click', function(e) {
        const badge = e.target.closest('.bus-service-code');
        if (badge && badge.hasAttribute('data-service-code')) {
            e.preventDefault();
            e.stopPropagation();
            const serviceCode = badge.getAttribute('data-service-code');
            console.log('Clicked service code:', serviceCode);
            window.location.href = `./bus-service.html?service=${serviceCode}`;
            return false;
        }
    }, true);
    
    // Show last updated time
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const mins = now.getMinutes().toString().padStart(2, '0');
    const formatted = `Last updated: ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${hours}:${mins} ${ampm}`;
    const updatedDiv = document.querySelector('#alerts-last-updated');
    if (updatedDiv) updatedDiv.textContent = formatted;

    // Initial fetch
    fetchAndUpdateAlerts();
    
    // Start periodic refresh
    startPeriodicAlertsRefresh();
});

// Pause/resume refresh based on page visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden — can stop checking
        if (alertsRefreshIntervalId !== null) {
            clearInterval(alertsRefreshIntervalId);
            alertsRefreshIntervalId = null;
        }
    } else {
        // Page is visible — restart refresh interval
        startPeriodicAlertsRefresh();
    }
});

function extractBusServiceCodes(text) {
    // Capture the service list between "bus service(s)" and the disruption status.
    const busServicesRegex = /bus services?\s*[:\-]?\s*([\s\S]*?)(?=\s+(?:have|has|are|is)\s+(?:been\s+)?(?:affected|diverted|disrupted|delayed)\b|\s+(?:were|was)\s+(?:affected|diverted|disrupted|delayed)\b|[.;]|$)/i;
    const match = text.match(busServicesRegex);

    if (!match) {
        return [];
    }

    const servicesText = match[1];

    // Allow one-digit services and letter suffixes such as 2B.
    const codeRegex = /\b(\d{1,4}[a-z]?)\b/gi;
    const matches = (servicesText.match(codeRegex) || []).map(code => code.toUpperCase());
    const codes = [...new Set(matches)].filter(code => {
        const num = parseInt(code);
        return num >= 1 && num <= 9999;
    });
    return codes;
}

function displayAlerts(alerts) {
    const content = document.getElementById('alerts-content');
    content.innerHTML = '';

    alerts.forEach((alert, index) => {
        const linkedContent = linkify(alert.content);
        const alertDate = new Date(alert.createdDate);

        // Format time as HH:MM
        let hours = alertDate.getHours();
        const mins = alertDate.getMinutes().toString().padStart(2, '0');
        hours = hours.toString().padStart(2, '0');
        const timeStr = `${hours}:${mins}`;

        const codes = extractBusServiceCodes(alert.content);
        let codesHTML = '';
        if (codes.length > 0) {
            codesHTML = '<div class="bus-codes-container" style="margin: 0.5em 0;">';
            codes.forEach(code => {
                codesHTML += `<div class="bus-service-code" data-service-code="${code}" style="cursor: pointer; pointer-events: auto; user-select: none;"><span class="bus-service-code-text">${code}</span></div>`;
            });
            codesHTML += '</div>';
        }

        const alertDiv = document.createElement('div');
        alertDiv.className = 'list-group-item list-group-item-action flex-column align-items-start';
        alertDiv.innerHTML = `
                    <div style="width: 100%; display: block; margin-bottom: 0.3em;">
                        <span class="lg-date" style="display: block; font-weight: 500;">Bus Services Affected:</span>
                    </div>
                    ${codesHTML}
                    <p class="mb-1 alert-item-content">${linkedContent}</p>
                `;
        content.appendChild(alertDiv);
    });
}

function showNoAlerts() {
    const content = document.getElementById('alerts-content');
    content.innerHTML = '<div class="no-alerts" ><i class="fa-regular fa-check-circle"></i>&nbsp;No alerts at the moment.</div>';
}

function showErrorMessage(message) {
    const content = document.getElementById('alerts-content');
    content.innerHTML = `<div class="error-message" ><i class="fa-regular fa-exclamation-circle"></i> ${message}</div>`;
}

function processAlertsData(data) {
    if (!data || !data.value) {
        showNoAlerts();
        return;
    }

    // Support both array and object for value
    let alerts = [];
    if (Array.isArray(data.value)) {
        alerts = data.value;
    } else if (typeof data.value === 'object') {
        alerts = [data.value];
    }

    // Filter for bus service alerts only (those containing "Due to... bus services... are affected")
    let busAlerts = [];
    alerts.forEach(alert => {
        if (alert.Message && Array.isArray(alert.Message)) {
            alert.Message.forEach(messageObj => {
                const msg = messageObj.Content || '';
                // Check if message contains "bus services" or "bus service" and mentions being affected
                const msgLower = msg.toLowerCase();
                if (msgLower.includes('bus service') && (msgLower.includes('affected') || msgLower.includes('diverted') || msgLower.includes('delayed'))) {
                    busAlerts.push({
                        content: msg,
                        status: alert.Status,
                        createdDate: messageObj.CreatedDate
                    });
                }
            });
        }
    });

    if (busAlerts.length === 0) {
        showNoAlerts();
    } else {
        displayAlerts(busAlerts);
    }
}