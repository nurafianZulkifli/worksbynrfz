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

function syncColorScheme() {
    const selectedDark = shouldBeDark();
    const selectedMode = selectedDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = selectedMode;
    document.body.style.colorScheme = selectedMode;

    const colorMeta = document.querySelector('meta[name="color-scheme"]');
    if (colorMeta) colorMeta.setAttribute('content', selectedMode);
}

function syncPwaMetaTheme() {
    const selectedDark = shouldBeDark();
    const selectedColor = selectedDark ? '#201a18' : '#ffffff';

    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.removeAttribute('media');
        meta.setAttribute('content', selectedColor);
    });

    const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusMeta) {
        statusMeta.setAttribute('content', selectedDark ? 'black-translucent' : 'default');
    }

    document.documentElement.style.colorScheme = selectedDark ? 'dark' : 'light';
}

function setDarkMode(isDark) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark-mode', isDark);
}

// Apply theme on page load
if (shouldBeDark()) {
    setDarkMode(true);
    updateThemeIcon('dark');
} else {
    setDarkMode(false);
    updateThemeIcon('light');
}
syncColorScheme();
syncPwaMetaTheme();

// Listen to theme toggle clicks
document.addEventListener('DOMContentLoaded', function() {
    function applyTheme(preference) {
        localStorage.setItem('theme-preference', preference);
        window._themePreference = preference;
        
        if (preference === 'dark') {
            setDarkMode(true);
            updateThemeIcon('dark');
        } else if (preference === 'light') {
            setDarkMode(false);
            updateThemeIcon('light');
        } else if (preference === 'system') {
            if (window._prefersDark) {
                setDarkMode(true);
                updateThemeIcon('dark');
            } else {
                setDarkMode(false);
                updateThemeIcon('light');
            }
        }
        syncColorScheme();
        syncPwaMetaTheme();
        updateThemeSelector();
    }

    document.querySelectorAll('[data-theme-preference]').forEach(button => {
        button.addEventListener('click', () => applyTheme(button.dataset.themePreference));
    });
    updateThemeSelector();
});

// Follow system theme changes when set to 'system' preference
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    window._prefersDark = e.matches;
    const selectedDark = shouldBeDark();
    setDarkMode(selectedDark);
    updateThemeIcon(selectedDark ? 'dark' : 'light');
    syncColorScheme();
    syncPwaMetaTheme();
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

function updateThemeSelector() {
    const preference = window._themePreference || 'system';
    document.querySelectorAll('[data-theme-preference]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.themePreference === preference));
    });
}
