# Theme Inheritance Feature

## Overview
This feature allows users visiting from **nurafianzulkifli.com** to automatically inherit their dark/light mode preference from the main website to the sub-applications (Buszy, RailBuddy).

## How It Works

### 1. **Theme Storage**
- Dark mode preference is stored in `localStorage` with the key `'dark-mode'`
- Values: `'enabled'` (dark mode) or `'disabled'` (light mode)

### 2. **Theme Inheritance Script** (`js/theme-inheritance.js`)
The script automatically:
1. **Detects the referrer** - Checks if the user is coming from `nurafianzulkifli.com`
2. **Looks for URL parameter** - First checks for `?mode=dark` or `?mode=light` parameter
3. **Attempts cross-window communication** - Uses `postMessage` API if parent window is accessible
4. **Sets localStorage** - Stores the inherited preference in the current app's localStorage
5. **Applies the theme** - Adds/removes the `dark-mode` CSS class to apply styling

### 3. **Implementation in HTML Files**
Each HTML entry point includes:
```html
<!-- Load theme inheritance script early -->
<script src="../js/theme-inheritance.js"></script>
<script>
    // Apply the theme from localStorage after inheritance logic runs
    if (localStorage.getItem('dark-mode') === 'enabled') {
        document.documentElement.classList.add('dark-mode');
        document.documentElement.style.background = '#121521';
    }
</script>
```

## Usage Methods

### Method 1: URL Parameter (Recommended)
Link users with the theme preference in the URL:
```html
<!-- Dark mode -->
<a href="https://worksbynrfz.com/buszy/index.html?mode=dark">Launch Buszy (Dark)</a>

<!-- Light mode -->
<a href="https://worksbynrfz.com/buszy/index.html?mode=light">Launch Buszy (Light)</a>
```

### Method 2: Main Site Theme Sharing
On the main site (nurafianzulkifli.com), include the theme-inheritance.js and call:
```javascript
ThemeInheritance.setupThemeSharing();
```
This enables the script to respond to `postMessage` requests from sub-applications.

### Method 3: Automatic (Current Implementation)
Simply link from nurafianzulkifli.com to the sub-apps:
```html
<a href="https://worksbynrfz.com/buszy/index.html">Buszy</a>
```
The referrer will be detected, and if the user has a preference on the main site, the app will:
1. Try to get the preference via postMessage
2. Default to the previously set preference if one exists
3. Use system preference or light mode as fallback

## Updated Files
- `js/theme-inheritance.js` - New theme inheritance utility script
- `index.html` - Main selection page
- `buszy/menu.html`, `buszy/index.html`, `buszy/abs.html`, `buszy/ann.html`, `buszy/art.html`, `buszy/nbs.html`, `buszy/settings.html`, `buszy/first-last.html`
- `rail-buddy/menu.html`, `rail-buddy/index.html`, `rail-buddy/ann.html`, `rail-buddy/history.html`, `rail-buddy/first-last.html`, `rail-buddy/settings.html`, `rail-buddy/system-map.html`, `rail-buddy/statistics.html`, `rail-buddy/our-networks.html`

## Technical Details

### Referrer Checking
The script checks if `document.referrer` contains `nurafianzulkifli.com`.

### Cross-Origin Limitations
Due to browser security restrictions:
- Direct localStorage access across different domains is NOT possible
- The URL parameter method is most reliable
- postMessage works only if the parent window is still open

### localStorage Keys
| Key | Possible Values | Purpose |
|-----|-----------------|---------|
| `dark-mode` | `'enabled'` or `'disabled'` | Stores user's dark mode preference |

### CSS Classes
- `dark-mode` - Applied to `<html>` and/or `<body>` elements to trigger dark mode styles
- Background color: `#121521` (dark navy)

## Future Enhancements

1. **IndexedDB Sharing** - For more persistent cross-domain preference sharing
2. **Cookie-based Sharing** - Using `SameSite=None` cookies (for Same-Site scenarios)
3. **Service Worker Caching** - Cache theme preference across app versions
4. **Analytics** - Track theme preference inheritance success rate

## Browser Support
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful fallback for older browsers
- No external dependencies required
