// ****************************
// :: Notification tap redirect (iOS opens start_url instead of art.html)
// ****************************

// Handle NOTIF_NAVIGATE message from service worker notificationclick
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'NOTIF_NAVIGATE' && event.data.url) {
            window.location.href = event.data.url;
        }
    });
}

// On page load, check if a notification was tapped and a pending nav is stored
if ('caches' in window) {
    caches.open('buszy-notif-pending').then(async cache => {
        const resp = await cache.match('pending-nav');
        if (!resp) return;
        const pending = await resp.json();
        if (pending.busStopCode && Date.now() - pending.ts < 30000) {
            await cache.delete('pending-nav');
            let dest = 'art.html?BusStopCode=' + encodeURIComponent(pending.busStopCode);
            if (pending.serviceNo) dest += '&ServiceNo=' + encodeURIComponent(pending.serviceNo);
            window.location.replace(dest);
        }
    }).catch(() => {});
}

// ****************************
// :: Dynamic Greeting Based on Time of Day
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const pinnedBusElement = document.querySelector('h2'); // Select the <h2> element

    // Function to determine the all-apps based on the current time
    function getGreeting() {
        const now = new Date();
        const hours = now.getHours();

        if (hours >= 5 && hours < 12) {
            return 'Good Morning!';
        } else if (hours >= 12 && hours < 18) {
            return 'Good Afternoon!';
        } else if (hours >= 18 && hours < 22) {
            return 'Good Evening!';
        } else {
            return 'Good Night!';
        }
    }

    // Update the <h2> element with the all-apps
    pinnedBusElement.textContent = getGreeting();
});


// ****************************
// :: Bus Stop Click Navigation
// ****************************
document.addEventListener('DOMContentLoaded', () => {
    const busStopElements = document.querySelectorAll('.bus-stop'); // Select all bus stop elements

    busStopElements.forEach((element) => {
        element.addEventListener('click', () => {
            const busStopCode = element.getAttribute('data-bus-stop-code'); // Get the bus stop code
            const busStopName = element.getAttribute('data-bus-stop-name'); // Optional: Get the bus stop name

            // Redirect to art.html with the bus stop code as a query parameter
            const url = new URL('./art.html', window.location.href);
            url.searchParams.set('BusStopCode', busStopCode);
            if (busStopName) {
                url.searchParams.set('BusStopName', busStopName); // Optional
            }
            window.location.href = url.toString();
        });
    });
});