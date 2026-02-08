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
});


// ****************************
// :: Re-fetch Data Handling
// ****************************
// Handle re-fetch data button
const clearCacheBtn = document.getElementById('clear-cache-btn');
clearCacheBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to re-fetch data? This will delete existing cached data.')) {
        try {
            // Clear cached data
            localStorage.removeItem('allBusStops');

            // Fetch updated data from the API
            const response = await fetch('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops');
            if (!response.ok) {
                throw new Error('Failed to fetch data from the API.');
            }

            const updatedData = await response.json();

            // Save the updated data to localStorage
            localStorage.setItem('allBusStops', JSON.stringify(updatedData));

            alert('Data successfully re-fetched and updated.');
        } catch (error) {
            console.error('Error re-fetching data:', error);
            alert('An error occurred while re-fetching data. Please try again later.');
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

if ('serviceWorker' in navigator) {
    // Use relative path from settings.html to service-worker.js
    navigator.serviceWorker.register('../service-worker.js').catch((err) => {
        console.error('Service Worker registration failed:', err);
    });
}

const installBtn = document.getElementById('install-btn');
let deferredPrompt = null;

function updateInstallButton(installed) {
    if (installed) {
        installBtn.textContent = 'Installed';
        installBtn.disabled = true;
    } else {
        installBtn.textContent = 'Not installed';
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
        installBtn.disabled = true;
        installBtn.textContent = 'Install not supported';
    }
});

window.addEventListener('appinstalled', () => {
    updateInstallButton(true);
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.disabled = false;
    updateInstallButton(false);
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            updateInstallButton(true);
        }
        deferredPrompt = null;
        installBtn.disabled = true;
    } else {
        alert('Install prompt is not available. Try refreshing the page or using a supported browser.');
    }
});