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
    const STORAGE_KEY = 'railbuddy_ann_state';
    const HAS_UNREAD_KEY = 'railbuddy_has_unread';
    
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
        
        // Determine if item is NEW: within 7 days AND no previous record (user hasn't seen it yet)
        const isNew = daysSinceAnnouncement <= NEW_ITEM_DAYS && !storedHash;
        
        // Track if any unread items exist
        if (isNew) {
            hasUnreadItems = true;
        }
        
        // If marked as read (has storedHash), don't show any badges
        // Don't show MODIFIED badge for items that have already been marked as read
        const isModified = false;
        
        // Preserve the lastSeen timestamp from previous mark-as-read action
        const lastSeenTime = storedData?.lastSeen || new Date().toISOString();
        
        // Only store items that were previously marked as read (have storedHash)
        // Don't auto-store new items unless explicitly marked as read
        if (storedHash) {
            newState[id] = {
                hash: currentHash,
                lastSeen: lastSeenTime
            };
        }
        
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
    
    // Store whether there are unread items (for indicator dots on other pages)
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
        newValue: hasUnreadItems.toString(),
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
    const STORAGE_KEY = 'railbuddy_ann_state';
    const HAS_UNREAD_KEY = 'railbuddy_has_unread';
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

// Call the function on page load
document.addEventListener('DOMContentLoaded', function() {
    initAnnouncements();
    
    // Attach mark as read button listener
    const markAsReadBtn = document.getElementById('mark-as-read-btn');
    if (markAsReadBtn) {
        markAsReadBtn.addEventListener('click', markAllAsRead);
    }
});

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
