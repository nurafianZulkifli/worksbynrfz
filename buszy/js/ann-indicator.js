// ****************************
// :: Announcement Indicator Dot ::
// ****************************

/**
 * Check if there are any unread announcements
 * and show indicator dots on announcement links
 */
function updateAnnounceIndicatorDots() {
    const HAS_UNREAD_KEY = 'buszy_has_unread';
    const STORAGE_KEY = 'buszy_ann_state';
    
    // First check if the flag is explicitly set
    const flagValue = localStorage.getItem(HAS_UNREAD_KEY);
    let hasUnread;
    
    if (flagValue !== null) {
        // Flag is set, use it
        hasUnread = flagValue === 'true';
    } else {
        // Flag not set yet - this is first load, default to showing dots
        // The ann.html page will set this flag when it loads
        hasUnread = true;
    }
    
    // Update indicator dots
    const dots = document.querySelectorAll('.ann-indicator-dot');
    dots.forEach(dot => {
        if (hasUnread) {
            dot.classList.add('show');
        } else {
            dot.classList.remove('show');
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    updateAnnounceIndicatorDots();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    updateAnnounceIndicatorDots();
}

// Watch for changes to localStorage (in case announcements page updates)
window.addEventListener('storage', function(e) {
    if (e.key === 'buszy_has_unread' || e.key === 'buszy_ann_state' || e.key === null) {
        updateAnnounceIndicatorDots();
    }
});
