// ****************************
// :: Announcement Indicators ::
// ****************************

/**
 * Initialize announcement indicators showing NEW and MODIFIED badges
 * NEW: Items added in last 7 days
 * MODIFIED: Items that have been updated since last view
 */
function initAnnouncements() {
    const NEW_ITEM_DAYS = 7;
    const STORAGE_KEY = 'buszy_ann_state';
    const HAS_UNREAD_KEY = 'buszy_has_unread';
    
    // Get all announcement items
    const items = document.querySelectorAll('.list-group-item[data-ann-id][data-ann-date]');
    
    // Load stored state from localStorage
    const storedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const newState = {};
    
    const now = new Date();
    let hasUnreadItems = false;
    
    items.forEach(item => {
        const id = item.getAttribute('data-ann-id');
        const dateStr = item.getAttribute('data-ann-date');
        
        // Parse the announcement date
        const annDate = new Date(dateStr);
        const daysSinceAnnouncement = (now - annDate) / (1000 * 60 * 60 * 24);
        
        // Get current hash
        const currentHash = getItemHash(item);
        const storedData = storedState[id];
        const storedHash = storedData?.hash;
        
        // Determine if item is NEW: within 7 days AND (no previous record OR hash changed)
        const isNew = daysSinceAnnouncement <= NEW_ITEM_DAYS && (!storedHash || storedHash !== currentHash);
        
        // Track if any unread items exist
        if (isNew) {
            hasUnreadItems = true;
        }
        
        // If marked as read (has storedHash), don't show any badges
        // Don't show MODIFIED badge for items that have already been marked as read
        const isModified = false;
        
        // Preserve the lastSeen timestamp from previous mark-as-read action
        const lastSeenTime = storedData?.lastSeen || new Date().toISOString();
        
        // Always store all items — visiting this page marks them as read
        newState[id] = {
            hash: currentHash,
            lastSeen: lastSeenTime
        };
        
        // Render badges
        const badgeContainer = item.querySelector('.ann-badge-container');
        if (badgeContainer) {
            badgeContainer.innerHTML = '';
            
            if (isNew) {
                const newBadge = document.createElement('span');
                newBadge.className = 'ann-badge new';
                newBadge.textContent = 'NEW';
                newBadge.title = `Added ${Math.round(daysSinceAnnouncement)} day(s) ago`;
                badgeContainer.appendChild(newBadge);
            } else if (isModified) {
                const modBadge = document.createElement('span');
                modBadge.className = 'ann-badge modified';
                modBadge.textContent = 'MODIFIED';
                modBadge.title = 'This item was recently updated';
                badgeContainer.appendChild(modBadge);
            }
        }
    });
    
    // Save updated state to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    
    // Set the unread flag based on whether we found any new items
    localStorage.setItem(HAS_UNREAD_KEY, hasUnreadItems);
    
    // Update dots on current page
    const dots = document.querySelectorAll('.ann-indicator-dot');
    dots.forEach(dot => {
        if (hasUnreadItems) {
            dot.classList.add('show');
        } else {
            dot.classList.remove('show');
        }
    });
    
    // Trigger storage event so other pages get notified immediately
    window.dispatchEvent(new StorageEvent('storage', {
        key: HAS_UNREAD_KEY,
        newValue: hasUnreadItems ? 'true' : 'false',
        storageArea: localStorage
    }));
}

/**
 * Generate a hash of announcement item for change detection
 */
function getItemHash(item) {
    const content = (
        item.getAttribute('data-ann-id') +
        item.getAttribute('data-ann-date') +
        item.querySelector('.lg-ann')?.textContent +
        item.querySelector('.mb-1')?.textContent
    );
    return hashCode(content);
}

/**
 * Simple hash function for content
 */
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

/**
 * Clear all announcement badges (mark as read)
 */
function markAllAsRead() {
    const STORAGE_KEY = 'buszy_ann_state';
    const HAS_UNREAD_KEY = 'buszy_has_unread';
    const items = document.querySelectorAll('.list-group-item[data-ann-id][data-ann-date]');
    const now = new Date().toISOString();
    const newState = {};
    
    // Update all items to current state
    items.forEach(item => {
        const id = item.getAttribute('data-ann-id');
        const hash = getItemHash(item);
        newState[id] = {
            hash: hash,
            lastSeen: now
        };
        
        // Remove badges
        const badgeContainer = item.querySelector('.ann-badge-container');
        if (badgeContainer) {
            badgeContainer.innerHTML = '';
        }
    });
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    
    // Set unread flag to false
    localStorage.setItem(HAS_UNREAD_KEY, false);
    
    // Update dots on current page
    const dots = document.querySelectorAll('.ann-indicator-dot');
    dots.forEach(dot => {
        dot.classList.remove('show');
    });
    
    // Trigger storage events to update indicator dots on other pages
    window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: JSON.stringify(newState),
        storageArea: localStorage
    }));
    
    window.dispatchEvent(new StorageEvent('storage', {
        key: HAS_UNREAD_KEY,
        newValue: 'false',
        storageArea: localStorage
    }));
    
    // Show confirmation
    const btn = document.getElementById('mark-as-read-btn');
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-regular fa-check-double"></i> Marked as Read';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    }
}

// Call the functions on page load
document.addEventListener('DOMContentLoaded', function() {
    initAnnouncements();
    
    // Attach mark as read button listener
    const markAsReadBtn = document.getElementById('mark-as-read-btn');
    if (markAsReadBtn) {
        markAsReadBtn.addEventListener('click', markAllAsRead);
    }
});

document.addEventListener('sharedAnnouncementsLoaded', initAnnouncements);

// Also call if DOM is already loaded (in case this script loads after DOMContentLoaded)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (!window.annInitialized) {
            initAnnouncements();
            window.annInitialized = true;
        }
    });
} else {
    if (!window.annInitialized) {
        initAnnouncements();
        window.annInitialized = true;
    }
}

    // Tab switching functionality
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

        function extractBusServiceCodes(text) {
            // Capture the service list between "bus service(s)" and the disruption status.
            const busServicesRegex = /bus services?\s*[:\-]?\s*([\s\S]*?)(?=\s+(?:have|has|are|is)\s+(?:(?:been|expected\s+to\s+be)\s+)?(?:affected|diverted|disrupted|delayed)\b|\s+(?:were|was)\s+(?:affected|diverted|disrupted|delayed)\b|[.;]|$)/i;
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
                        codesHTML += `<div class="bus-service-code" data-service-code="${code}" style="cursor: pointer; pointer-events: auto; user-select: none;">${code}</div>`;
                    });
                    codesHTML += '</div>';
                }

                const alertDiv = document.createElement('div');
                alertDiv.className = 'list-group-item list-group-item-action flex-column align-items-start';
                alertDiv.innerHTML = `
                    <div style="width: 100%; margin-bottom: 0.5em;">
                        <small class="lg-date">Bus Services Affected:</small>
                    </div>
                    ${codesHTML}
                    <p class="mb-1 alert-item-content">${linkedContent}</p>
                `;
                content.appendChild(alertDiv);
            });
        }

        function showNoAlerts() {
            const content = document.getElementById('alerts-content');
            content.innerHTML = '<div class="no-alerts"><i class="fa-regular fa-check-circle"></i>&nbsp;No alerts at the moment.</div>';
        }

        function showErrorMessage(message) {
            const content = document.getElementById('alerts-content');
            content.innerHTML = `<div class="error-message"><i class="fa-regular fa-exclamation-circle"></i> ${message}</div>`;
        }

        // Function to fetch and populate alerts
        function loadAlerts() {
            const alertsContent = document.getElementById('alerts-content');
            if (!alertsContent) return;

            const CACHE_KEY = 'buszy_ann_alerts_cache';
            const DATA_KEY = 'buszy_ann_alerts_data';
            const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

            function processAlerts(data) {
                if (!data || !data.value) {
                    showNoAlerts();
                    updateAlertsLastUpdated();
                    return;
                }

                // Support both array and object for value
                let alerts = [];
                if (Array.isArray(data.value)) {
                    alerts = data.value;
                } else if (typeof data.value === 'object') {
                    alerts = [data.value];
                }

                // Filter for bus service alerts only
                let busAlerts = [];
                alerts.forEach(alert => {
                    if (alert.Message && Array.isArray(alert.Message)) {
                        alert.Message.forEach(messageObj => {
                            const msg = messageObj.Content || '';
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

            // Check cache
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            const cacheIsFresh = cached !== null && (Date.now() - cached.ts < CACHE_TTL);

            // Show cached data if available
            if (cacheIsFresh) {
                const cachedData = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
                if (cachedData) {
                    processAlerts(cachedData);
                    return; // Don't fetch again if cache is fresh
                }
            }

            // Fetch only if cache is stale
            fetch('https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts')
                .then(r => r.json())
                .then(data => {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now() }));
                    localStorage.setItem(DATA_KEY, JSON.stringify(data));
                    processAlerts(data);
                })
                .catch(err => {
                    console.error('Error fetching alerts:', err);
                    // Show error only if we have no cached fallback
                    if (!cacheIsFresh && !JSON.parse(localStorage.getItem(DATA_KEY) || 'null')) {
                        showErrorMessage('Failed to load alerts. Please try again later.');
                    }
                });
        }

        document.addEventListener('DOMContentLoaded', function () {
            const tabButtons = document.querySelectorAll('.tab-button');
            const contentSections = document.querySelectorAll('.tab-content-section');
            const pageTitle = document.getElementById('filter-title');
            const markAsReadBtn = document.getElementById('mark-as-read-btn');
            const alertsLastUpdatedTop = document.getElementById('alerts-last-updated-top');

            tabButtons.forEach(button => {
                button.addEventListener('click', function () {
                    const tabName = this.getAttribute('data-tab');

                    // Remove active class from all buttons
                    tabButtons.forEach(btn => btn.classList.remove('active'));

                    // Hide all content sections
                    contentSections.forEach(section => section.classList.remove('active'));

                    // Add active class to clicked button
                    this.classList.add('active');

                    // Update page title and mark-as-read button visibility
                    if (tabName === 'announcements') {
                        document.getElementById('announcements-content').classList.add('active');
                        if (pageTitle) pageTitle.textContent = 'Announcements';
                        document.title = 'Announcements | Buszy';
                        if (markAsReadBtn) markAsReadBtn.style.display = 'block';
                        if (alertsLastUpdatedTop) alertsLastUpdatedTop.style.display = 'none';
                    } else if (tabName === 'alerts') {
                        document.getElementById('alerts-content-section').classList.add('active');
                        if (pageTitle) pageTitle.textContent = 'Bus Service Alerts';
                        document.title = 'Bus Service Alerts | Buszy';
                        if (markAsReadBtn) markAsReadBtn.style.display = 'none';
                        if (alertsLastUpdatedTop) alertsLastUpdatedTop.style.display = 'block';
                        // Load alerts when tab is clicked
                        loadAlerts();
                    }
                });
            });

            // Load alerts on page load if needed
            loadAlerts();
        });