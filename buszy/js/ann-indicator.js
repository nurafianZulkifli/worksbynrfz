// ****************************
// :: Announcement Indicator Dot ::
// ****************************

const NEW_ITEM_DAYS = 7;
const ANN_STORAGE_KEY = 'buszy_ann_state';
const ANN_HAS_UNREAD_KEY = 'buszy_has_unread';

function applyDots(hasUnread) {
    const dots = document.querySelectorAll('.ann-indicator-dot');
    dots.forEach(dot => {
        if (hasUnread) {
            dot.classList.add('show');
        } else {
            dot.classList.remove('show');
        }
    });
}

/**
 * Fetch ann.html in the background and compute unread status directly
 * from announcement items, bypassing any stale cached flag.
 */
async function computeUnreadFromSource() {
    try {
        const response = await fetch('./ann.html', { cache: 'default' });
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const items = doc.querySelectorAll('.list-group-item[data-ann-id][data-ann-date]');
        const storedState = JSON.parse(localStorage.getItem(ANN_STORAGE_KEY) || '{}');
        const now = new Date();
        let hasUnread = false;
        const isFirstVisit = Object.keys(storedState).length === 0;

        items.forEach(item => {
            const id = item.getAttribute('data-ann-id');
            const dateStr = item.getAttribute('data-ann-date');
            const annDate = new Date(dateStr);
            const daysSince = (now - annDate) / (1000 * 60 * 60 * 24);

            // On first visit (no stored state), all items are unread regardless of age.
            // On subsequent visits, only items within NEW_ITEM_DAYS that haven't been read count.
            if (isFirstVisit || (daysSince <= NEW_ITEM_DAYS && !storedState[id]?.hash)) {
                hasUnread = true;
            }
        });

        localStorage.setItem(ANN_HAS_UNREAD_KEY, hasUnread);
        applyDots(hasUnread);
    } catch (e) {
        // Fetch failed — fall back to cached flag
    }
}

function updateAnnounceIndicatorDots() {
    const flagValue = localStorage.getItem(ANN_HAS_UNREAD_KEY);

    // Apply cached value immediately so there's no delay
    applyDots(flagValue === null || flagValue === 'true');

    // Always recompute in background to catch new announcements
    computeUnreadFromSource();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    updateAnnounceIndicatorDots();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    updateAnnounceIndicatorDots();
}

// Watch for changes to localStorage (e.g. when ann.html marks items as read)
window.addEventListener('storage', function(e) {
    if (e.key === ANN_HAS_UNREAD_KEY || e.key === ANN_STORAGE_KEY || e.key === null) {
        updateAnnounceIndicatorDots();
    }
});
