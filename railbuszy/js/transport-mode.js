(() => {
    const transportTabs = document.querySelectorAll('[data-transport-mode]');
    const busContent = document.getElementById('pinned');
    const trainContent = document.getElementById('train-content');
    const categoryTabsContainer = document.querySelector('.category-tabs-container');
    const trainStatusUpdated = document.getElementById('train-status-updated');
    const trainLocateButton = document.getElementById('train-locate-button');
    const nearestTrainName = document.getElementById('nearest-train-name');
    const nearestTrainCode = document.getElementById('nearest-train-code');
    const nearestTrainStatus = document.getElementById('nearest-train-status');
    if (!transportTabs.length || !busContent || !trainContent) return;

    const transportModeKey = 'buszy-transport-mode';
    const lineColors = {
        NS: '#e2211c', EW: '#009645', CC: '#fa9e0d', DT: '#005ec8',
        TE: '#926437', NE: '#9d27b5', BP: '#708472', SE: '#708472',
        SW: '#708472', PE: '#708472', PW: '#708472'
    };
    const apiServer = window.location.hostname === 'localhost'
        ? (window.location.port === '3000' ? window.location.origin : 'http://localhost:3000')
        : 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
    let stationLocations = null;
    let stationLoading = null;

    const distanceMetres = (first, second) => {
        const radians = value => value * Math.PI / 180;
        const latitude = radians(second.latitude - first.latitude);
        const longitude = radians(second.longitude - first.longitude);
        const value = Math.sin(latitude / 2) ** 2
            + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
            * Math.sin(longitude / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    };

    const formatDistance = distance => distance < 1000
        ? `${Math.round(distance)} m away`
        : `${(distance / 1000).toFixed(1)} km away`;

    function setTransportMode(mode, persistMode, locateStation) {
        const isRail = mode === 'rail';
        transportTabs.forEach(tab => {
            const active = tab.dataset.transportMode === mode;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        busContent.hidden = isRail;
        trainContent.hidden = !isRail;
        if (categoryTabsContainer) categoryTabsContainer.hidden = isRail;
        if (persistMode) {
            localStorage.setItem(transportModeKey, mode);
            window.dispatchEvent(new CustomEvent('buszy:transport-mode-change', { detail: { mode } }));
        }
        if (isRail) {
            loadTrainStatus();
            if (locateStation) findNearbyStation();
        }
    }

    async function getStationLocations() {
        if (stationLocations) return stationLocations;
        if (stationLoading) return stationLoading;
        stationLoading = (async () => {
            const response = await fetch('json/rail-station-locations.json');
            if (!response.ok) throw new Error(`OneMap station data request failed: ${response.status}`);
            const payload = await response.json();
            if (payload.source !== 'OneMap' || !Array.isArray(payload.stations) || payload.stations.length < 50) {
                throw new Error('OneMap station data is invalid or incomplete');
            }
            stationLocations = payload.stations.map(station => ({
                name: station.name,
                code: station.code,
                latitude: Number(station.latitude),
                longitude: Number(station.longitude)
            }));
            if (stationLocations.some(station => !station.name || !station.code
                || !Number.isFinite(station.latitude) || !Number.isFinite(station.longitude))) {
                throw new Error('OneMap station data contains invalid coordinates');
            }
            return stationLocations;
        })().finally(() => {
            stationLoading = null;
        });
        return stationLoading;
    }

    function findNearbyStation() {
        nearestTrainCode.hidden = true;
        if (!navigator.geolocation) {
            nearestTrainStatus.textContent = 'Location is not supported by this browser.';
            trainLocateButton.disabled = true;
            return;
        }
        nearestTrainStatus.textContent = 'Finding the nearest MRT or LRT station...';
        trainLocateButton.disabled = true;
        navigator.geolocation.getCurrentPosition(async position => {
            try {
                const locations = await getStationLocations();
                const currentPosition = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                const nearest = locations
                    .map(station => ({ ...station, distance: distanceMetres(currentPosition, station) }))
                    .sort((first, second) => first.distance - second.distance)[0];
                nearestTrainName.textContent = nearest.name;
                const code = String(nearest.code || '').trim();
                const codeParts = code.match(/^([A-Z]+)\s*(\d+[A-Z]?)$/i);
                const linePrefix = codeParts ? codeParts[1].toUpperCase() : '';
                const lineKey = linePrefix === 'CG' ? 'EW' : linePrefix === 'CE' ? 'CC' : linePrefix;
                nearestTrainCode.textContent = codeParts ? `${linePrefix} ${codeParts[2]}` : code;
                nearestTrainCode.style.setProperty('--station-line-color', lineColors[lineKey] || '#607d96');
                nearestTrainCode.style.setProperty('--station-code-color', lineKey === 'CC' ? '#111' : '#fff');
                nearestTrainCode.hidden = !code;
                nearestTrainStatus.textContent = formatDistance(nearest.distance);
            } catch (error) {
                nearestTrainStatus.textContent = 'Nearby train stations are unavailable right now.';
                console.warn('[RailBuszy] Unable to find nearby train station:', error);
            } finally {
                trainLocateButton.disabled = false;
            }
        }, error => {
            nearestTrainStatus.textContent = error.code === 1
                ? 'Location permission is needed to find your nearest station.'
                : 'Your location is unavailable right now. Try again shortly.';
            trainLocateButton.disabled = false;
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    }

    async function loadTrainStatus() {
        if (!trainStatusUpdated) return;
        try {
            const response = await fetch(`${apiServer}/train-service-alerts`);
            if (!response.ok) throw new Error(`Train status request failed: ${response.status}`);
            const payload = await response.json();
            const alerts = Array.isArray(payload) ? payload : payload.value || [];
            document.querySelectorAll('[data-train-line] .status-icon').forEach(icon => {
                icon.style.background = '';
                icon.style.color = '';
                icon.innerHTML = '<i class="fa-regular fa-check"></i>';
            });
            alerts.forEach(alert => {
                const message = JSON.stringify(alert);
                const line = ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL', 'BPLRT', 'SKLRT', 'PGLRT']
                    .find(code => message.includes(code));
                if (!line || Number(alert.Status) === 0) return;
                const icon = document.querySelector(`[data-train-line="${line}"] .status-icon`);
                if (!icon) return;
                icon.style.background = '#e53935';
                icon.innerHTML = '<i class="fa-regular fa-triangle-exclamation"></i>';
            });
            trainStatusUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        } catch (error) {
            trainStatusUpdated.textContent = 'Live status unavailable';
            console.warn('[RailBuszy] Train service status unavailable:', error);
        }
    }

    document.querySelectorAll('#train-content [data-network-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const network = tab.dataset.networkTab;
            document.querySelectorAll('#train-content [data-network-tab]').forEach(item => {
                const active = item === tab;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', String(active));
            });
            document.querySelectorAll('#train-content [data-network-panel]').forEach(panel => {
                const active = panel.dataset.networkPanel === network;
                panel.hidden = !active;
                panel.classList.toggle('active', active);
            });
        });
    });

    transportTabs.forEach(tab => tab.addEventListener('click', () => setTransportMode(tab.dataset.transportMode, true, true)));
    trainLocateButton?.addEventListener('click', findNearbyStation);

    const requestedMode = new URLSearchParams(window.location.search).get('transport');
    const savedMode = localStorage.getItem(transportModeKey);
    const initialMode = requestedMode === 'rail' || savedMode === 'rail' ? 'rail' : 'bus';
    setTransportMode(initialMode, requestedMode === 'rail', requestedMode === 'rail');
})();
