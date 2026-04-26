// ****************************
// :: Initialize Default Preferences for First-Time Visitors
// ****************************
// Set default preferences if they don't exist
function initializeDefaultPreferences() {
    // Set default time format if not already set
    if (!localStorage.getItem('timeFormat')) {
        localStorage.setItem('timeFormat', '24-hour');
    }
    
    // Set default dark mode preference if not already set
    if (!localStorage.getItem('dark-mode')) {
        localStorage.setItem('dark-mode', 'disabled');
    }

    // Set default show fleet legend preference if not already set
    if (!localStorage.getItem('showFleetLegend')) {
        localStorage.setItem('showFleetLegend', 'enabled');
    }

    // Set default show incoming buses preference if not already set
    if (!localStorage.getItem('showIncomingBuses')) {
        localStorage.setItem('showIncomingBuses', 'enabled');
    }

    // Set default sort by arrival preference if not already set
    if (!localStorage.getItem('sortByArrival')) {
        localStorage.setItem('sortByArrival', 'enabled');
    }

    // Set default refresh interval if not already set (in seconds)
    if (!localStorage.getItem('refreshInterval')) {
        localStorage.setItem('refreshInterval', '2');
    }
}

// Initialize defaults on page load
initializeDefaultPreferences();

// ****************************
// :: Time Format Change Handling
// ****************************
// Function to handle time format change
document.addEventListener('DOMContentLoaded', () => {
    const timeFormatRadios = document.querySelectorAll('input[name="time-format"]');

    // Load the saved time format from localStorage
    const savedFormat = localStorage.getItem('timeFormat');
    if (savedFormat) {
        document.querySelector(`input[value="${savedFormat}"]`).checked = true;
    }

    // Add event listeners to update the time format
    timeFormatRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            const selectedFormat = event.target.value;
            localStorage.setItem('timeFormat', selectedFormat);
            alert(`Time format updated to ${selectedFormat}.`);
        });
    });

    // Handle fleet legend checkbox
    const showFleetLegendCheckbox = document.getElementById('show-fleet-legend');
    if (showFleetLegendCheckbox) {
        // Load the saved preference
        const showFleetLegend = localStorage.getItem('showFleetLegend') === 'enabled';
        showFleetLegendCheckbox.checked = showFleetLegend;

        // Add event listener to update the preference
        showFleetLegendCheckbox.addEventListener('change', (event) => {
            const isChecked = event.target.checked;
            localStorage.setItem('showFleetLegend', isChecked ? 'enabled' : 'disabled');
            // Dispatch custom event to notify other pages
            window.dispatchEvent(new CustomEvent('showFleetLegendChanged', { detail: { showFleetLegend: isChecked } }));
        });
    }

    // Handle incoming buses checkbox
    const showIncomingBusesCheckbox = document.getElementById('show-incoming-buses');
    if (showIncomingBusesCheckbox) {
        // Load the saved preference
        const showIncomingBuses = localStorage.getItem('showIncomingBuses') === 'enabled';
        showIncomingBusesCheckbox.checked = showIncomingBuses;

        // Add event listener to update the preference
        showIncomingBusesCheckbox.addEventListener('change', (event) => {
            const isChecked = event.target.checked;
            localStorage.setItem('showIncomingBuses', isChecked ? 'enabled' : 'disabled');
            // Dispatch custom event to notify other pages
            window.dispatchEvent(new CustomEvent('showIncomingBusesChanged', { detail: { showIncomingBuses: isChecked } }));
        });
    }

    // Handle sort by arrival time checkbox
    const showByArrivalCheckbox = document.getElementById('show-by-arrival-time');
    if (showByArrivalCheckbox) {
        const sortByArrival = localStorage.getItem('sortByArrival') !== 'disabled';
        showByArrivalCheckbox.checked = sortByArrival;

        showByArrivalCheckbox.addEventListener('change', (event) => {
            const isChecked = event.target.checked;
            localStorage.setItem('sortByArrival', isChecked ? 'enabled' : 'disabled');
            window.dispatchEvent(new CustomEvent('sortByArrivalChanged', { detail: { sortByArrival: isChecked } }));
        });
    }

    // Handle refresh interval slider
    const refreshIntervalSlider = document.getElementById('refresh-interval');
    const refreshIntervalValue = document.getElementById('refresh-interval-value');
    if (refreshIntervalSlider && refreshIntervalValue) {
        // Load the saved refresh interval
        const savedInterval = localStorage.getItem('refreshInterval') || '2';
        refreshIntervalSlider.value = savedInterval;
        refreshIntervalValue.textContent = `${savedInterval} sec`;

        // Add event listener to update the refresh interval
        refreshIntervalSlider.addEventListener('input', (event) => {
            const interval = event.target.value;
            localStorage.setItem('refreshInterval', interval);
            refreshIntervalValue.textContent = `${interval} sec`;
            // Dispatch custom event to notify other pages
            window.dispatchEvent(new CustomEvent('refreshIntervalChanged', { detail: { refreshInterval: parseFloat(interval) } }));
        });
    }
});


// ****************************
// :: Re-fetch Data Handling
// ****************************
// Handle re-fetch data button
const clearCacheBtn = document.getElementById('clear-cache-btn');
clearCacheBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to re-fetch data? This will delete existing cached data.')) {
        try {
            // Disable button during fetch
            clearCacheBtn.disabled = true;
            clearCacheBtn.textContent = 'Re-fetching...';

            // Clear cached data
            localStorage.removeItem('allBusStops');

            // Fetch all updated data from the API using pagination
            let allBusStops = [];
            let skip = 0;
            let hasMoreData = true;

            while (hasMoreData) {
                const response = await fetch(`https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=${skip}`);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch data from the API: ${response.status}`);
                }

                const data = await response.json();

                if (!data.value || data.value.length === 0) {
                    hasMoreData = false;
                } else {
                    allBusStops = allBusStops.concat(data.value);
                    skip += 500;
                }
            }

            // Save the updated data to localStorage
            localStorage.setItem('allBusStops', JSON.stringify(allBusStops));
            
            // Mark as preloaded
            localStorage.setItem('busStopsPreloaded', 'true');

            // Re-enable button
            clearCacheBtn.disabled = false;
            clearCacheBtn.textContent = 'Re-fetch data';

            alert(`Data successfully re-fetched and updated.\n(${allBusStops.length} bus stops cached)`);
        } catch (error) {
            console.error('Error re-fetching data:', error);
            alert('An error occurred while re-fetching data. Please try again later.');
            
            // Re-enable button
            clearCacheBtn.disabled = false;
            clearCacheBtn.textContent = 'Re-fetch data';
        }
    }
});


// ****************************
// :: Import/Export Data Handling
// ****************************
// Define the keys to export/import (new NotificationManager system)
const EXPORT_KEYS = [
    'dark-mode',           // Theme preference
    'timeFormat',          // Time display format
    'showFleetLegend',     // Fleet legend visibility
    'showIncomingBuses',   // Incoming buses visibility
    'bookmarkedBusStops',  // Saved bus stops
    'allBusStops',         // Bus stop data cache
    'notif_monitoredServices',  // Monitored bus services (NotificationManager)
    'notif_notifiedServices'     // Notification history (NotificationManager)
];

// Additional keys to export that follow patterns (dynamically found)
const DYNAMIC_EXPORT_PATTERNS = ['notif_monitoredServices_'];  // Matches notif_monitoredServices_<busStopCode>

// Export localStorage data as JSON file
const exportDataBtn = document.getElementById('export-data-btn');
if (exportDataBtn) {
    exportDataBtn.addEventListener('click', () => {
        try {
            // Get only specific localStorage items
            const data = {};
            
            // Export static keys
            EXPORT_KEYS.forEach(key => {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    data[key] = value;
                }
            });
            
            // Export dynamic keys matching patterns (e.g., notif_monitoredServices_<busStopCode>)
            DYNAMIC_EXPORT_PATTERNS.forEach(pattern => {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(pattern)) {
                        const value = localStorage.getItem(key);
                        if (value !== null) {
                            data[key] = value;
                        }
                    }
                }
            });
            
            // Create JSON string
            const jsonString = JSON.stringify(data, null, 2);
            
            // Create blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `buszy-data-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            window.URL.revokeObjectURL(url);
            
            alert('✓ Data exported successfully!');
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Error exporting data. Please try again.');
        }
    });
}

// Helper function to check if a key is allowed for import
function isAllowedKey(key) {
    // Check static keys
    if (EXPORT_KEYS.includes(key)) {
        return true;
    }
    // Check dynamic patterns
    for (const pattern of DYNAMIC_EXPORT_PATTERNS) {
        if (key.startsWith(pattern)) {
            return true;
        }
    }
    return false;
}

// Import localStorage data from file
const importDataBtn = document.getElementById('import-data-btn');
const importFileInput = document.getElementById('import-file-input');
const importMessage = document.getElementById('import-message');

if (importDataBtn) {
    importDataBtn.addEventListener('click', () => {
        importFileInput.click();
    });
}

if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (typeof data !== 'object' || data === null) {
                    throw new Error('Invalid data format');
                }
                
                // Validate that file contains only allowed keys
                const invalidKeys = Object.keys(data).filter(key => !isAllowedKey(key));
                if (invalidKeys.length > 0) {
                    throw new Error(`Invalid keys in file: ${invalidKeys.join(', ')}`);
                }
                
                // Ask for confirmation
                const itemCount = Object.keys(data).length;
                if (!confirm(`Import ${itemCount} ${itemCount === 1 ? 'item' : 'items'} from backup? This will merge with existing data.`)) {
                    return;
                }
                
                // Import data into localStorage
                let importedCount = 0;
                for (const [key, value] of Object.entries(data)) {
                    if (isAllowedKey(key)) {
                        localStorage.setItem(key, value);
                        importedCount++;
                    }
                }
                
                // Show success message
                importMessage.textContent = `✓ Successfully imported ${importedCount} ${importedCount === 1 ? 'item' : 'items'}! Refreshing...`;
                importMessage.style.backgroundColor = '#c8e6c9';
                importMessage.style.color = '#2e7d32';
                importMessage.style.display = 'block';
                importMessage.style.borderRadius = '24px';
                
                // Reload page to apply changes
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } catch (error) {
                console.error('Error importing data:', error);
                importMessage.textContent = `✗ Error importing data: ${error.message}. Please check the file format.`;
                importMessage.style.backgroundColor = '#ffcdd2';
                importMessage.style.color = '#c62828';
                importMessage.style.display = 'block';
                importMessage.style.borderRadius = '24px';
            }
        };
        reader.readAsText(file);
        
        // Reset input
        e.target.value = '';
    });
}


// ****************************
// :: PWA Installation Handling
// ****************************
// Use centralized PWA Helper for consistent behavior across apps
// The main app initializes PWA via pwa-init.js, so we just need install button handling

let deferredPrompt = null;

function updateInstallButton(installed) {
    const installBtn = document.getElementById('install-btn');
    if (!installBtn) return;
    
    if (installed) {
        installBtn.textContent = 'Installed';
        installBtn.disabled = true;
    } else {
        installBtn.textContent = 'Install App';
        installBtn.disabled = deferredPrompt === null;
    }
}

function detectInstalled() {
    // For most browsers
    return window.matchMedia('(display-mode: standalone)').matches
        // For iOS Safari
        || window.navigator.standalone === true;
}

window.addEventListener('DOMContentLoaded', () => {
    updateInstallButton(detectInstalled());
    // Fallback for browsers that do not support beforeinstallprompt
    if (!('onbeforeinstallprompt' in window)) {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.disabled = true;
            installBtn.textContent = 'Install not supported';
        }
    }
});

window.addEventListener('appinstalled', () => {
    console.log('[Buszy Settings] App installed successfully');
    updateInstallButton(true);
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[Buszy Settings] Install prompt available');
    updateInstallButton(detectInstalled());
});

// Install button click handler
document.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('install-btn');
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('[Buszy Settings] Installation outcome:', outcome);
                if (outcome === 'accepted') {
                    updateInstallButton(true);
                }
                deferredPrompt = null;
            } else {
                alert('Install prompt is not available. Try refreshing the page or using a supported browser.');
            }
        });
    }
});