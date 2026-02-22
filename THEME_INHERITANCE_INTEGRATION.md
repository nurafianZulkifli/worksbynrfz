# Theme Inheritance Integration Guide

## For nurafianzulkifli.com Main Website

To enable theme inheritance on the main website that sends users to the sub-applications, follow these steps:

### Step 1: Include the Theme Inheritance Script
Add this to your `<head>` or end of `<body>` on nurafianzulkifli.com:

```html
<script src="path/to/theme-inheritance.js"></script>
<script>
    // Enable theme sharing for child windows/iframes
    ThemeInheritance.setupThemeSharing();
</script>
```

**Alternative**: You can also reference it from the works-by-nrfz domain:
```html
<script>
    // Load and setup remote theme sharing
    const script = document.createElement('script');
    script.src = 'https://worksbynrfz.com/js/theme-inheritance.js';
    script.onload = () => {
        ThemeInheritance.setupThemeSharing();
    };
    document.head.appendChild(script);
</script>
```

### Step 2: Create Links to Sub-Applications

#### Option A: Simple Links (User's Theme Inherited Automatically)
```html
<a href="https://worksbynrfz.com/buszy/index.html">
    <i class="fa-bus"></i> Buszy - Bus Timings
</a>

<a href="https://worksbynrfz.com/rail-buddy/index.html">
    <i class="fa-train"></i> RailBuddy - Train Timings
</a>
```

Users coming from nurafianzulkifli.com will automatically inherit their theme preference if:
1. They have a previously set preference on this site in `localStorage['dark-mode']`
2. The app can detect the referrer and communicate via postMessage

#### Option B: Explicit Theme Links (Recommended for Reliability)
Pass the theme as a URL parameter:
```html
<!-- Dark Mode Links -->
<a href="https://worksbynrfz.com/buszy/index.html?mode=dark">
    <i class="fa-bus"></i> Buszy - Bus Timings (Dark)
</a>

<a href="https://worksbynrfz.com/rail-buddy/index.html?mode=dark">
    <i class="fa-train"></i> RailBuddy - Train Timings (Dark)
</a>

<!-- Light Mode Links -->
<a href="https://worksbynrfz.com/buszy/index.html?mode=light">
    <i class="fa-bus"></i> Buszy - Bus Timings (Light)
</a>

<a href="https://worksbynrfz.com/rail-buddy/index.html?mode=light">
    <i class="fa-train"></i> RailBuddy - Train Timings (Light)
</a>
```

#### Option C: Dynamic Links Based on Current Theme
```html
<script>
    // Get your current theme preference
    const isDarkMode = localStorage.getItem('dark-mode') === 'enabled';
    const modeParam = isDarkMode ? 'dark' : 'light';
    
    // Create dynamic links
    const bushyLink = `https://worksbynrfz.com/buszy/index.html?mode=${modeParam}`;
    const railBuddyLink = `https://worksbynrfz.com/rail-buddy/index.html?mode=${modeParam}`;
    
    // Use in HTML
    document.getElementById('buszy-link').href = bushyLink;
    document.getElementById('railbuddy-link').href = railBuddyLink;
</script>

<a id="buszy-link" href="#">Buszy</a>
<a id="railbuddy-link" href="#">RailBuddy</a>
```

### Step 3: Test the Implementation

1. Set your theme preference on nurafianzulkifli.com (dark or light)
2. Click one of the links to the sub-application
3. Your theme preference should automatically be applied
4. Navigate the sub-application and verify the theme persists
5. Return to nurafianzulkifli.com - your preference should remain

### How It Works (Technical Flow)

```
User on nurafianzulkifli.com with Dark Mode enabled
         ↓
    Clicks link to Buszy/RailBuddy app
         ↓
    Sub-app loads with theme-inheritance.js
         ↓
    Script checks:
    1. Is referrer from nurafianzulkifli.com? ✓
    2. Is there a theme URL parameter? (If yes, use it)
    3. Can we contact parent window for preference? (If yes, use it)
         ↓
    localStorage['dark-mode'] = 'enabled'
         ↓
    Inline script applies dark-mode class
         ↓
    User sees app in Dark Mode ✓
```

### Available Parameters

| Parameter | Format | Example | Result |
|-----------|--------|---------|--------|
| `mode` | `dark` \| `light` | `?mode=dark` | Forces specific theme |
| `theme` | `enabled` \| `disabled` | `?theme=enabled` | Forces specific theme |
| None | N/A | Regular link | Attempts postMessage inheritance |

### Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Chromium | ✓ | Full support including postMessage |
| Firefox | ✓ | Full support including postMessage |
| Safari | ✓ | Full support (iOS 13+) |
| Edge | ✓ | Full support |
| Opera | ✓ | Full support |
| IE 11 | ✓ | Basic support (URL params only) |

### Troubleshooting

**Theme not inheriting?**
- Verify the referrer header is being sent (some browsers/security settings may block it)
- Use URL parameters as a reliable fallback: `?mode=dark`
- Check browser console for errors

**postMessage not working?**
- Different domain contexts may restrict postMessage
- Solution: Always use URL parameters when sending users to different domains
- URL parameters are the most reliable method

**Theme persists but shouldn't?**
- Clear browser cache and localStorage
- The app respects local user preferences stored in app's localStorage
- First visit sets the inherited preference, subsequent visits respect local preference if changed

### Security Considerations

- The script only processes requests from referrers containing `nurafianzulkifli.com`
- URL parameters are validated and sanitized
- postMessage messages must come from the expected domain
- No sensitive data is transmitted through theme inheritance
