(() => {
    const transportTabs = document.querySelectorAll('[data-transport-mode]');
    const busContent = document.getElementById('pinned');
    const trainContent = document.getElementById('train-content');
    const categoryTabsContainer = document.querySelector('.category-tabs-container');
    const trainStatusUpdated = document.getElementById('train-status-updated');
    const trainLocateButton = document.getElementById('train-locate-button');
    const nearestTrainName = document.getElementById('nearest-train-name');
    const nearestTrainStatus = document.getElementById('nearest-train-status');
    if (!transportTabs.length || !busContent || !trainContent) return;

    const stationCacheKey = 'railbuddy_station_locations_v2';
    const transportModeKey = 'buszy-transport-mode';
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
            try {
                const cached = JSON.parse(localStorage.getItem(stationCacheKey) || 'null');
                if (Array.isArray(cached) && cached.length) {
                    stationLocations = cached;
                    return stationLocations;
                }
            } catch (error) {
                localStorage.removeItem(stationCacheKey);
            }

            const directionsResponse = await fetch('../rail-buddy/json/line-directions.json');
            if (!directionsResponse.ok) throw new Error(`Line directions request failed: ${directionsResponse.status}`);
            const directions = await directionsResponse.json();
            const lineData = await Promise.all((directions.lines || []).map(line =>
                fetch(`../rail-buddy/json/${line.stationDataFile}`).then(response => {
                    if (!response.ok) throw new Error(`Station data request failed: ${response.status}`);
                    return response.json();
                })
            ));
            const stations = [];
            lineData.forEach(line => line.branches.forEach(branch => branch.stations.forEach(station => {
                const item = { name: station.name, code: String(station.code).replace(/\s+/g, '') };
                if (!stations.some(existing => existing.name === item.name)) stations.push(item);
            })));

            const locations = await Promise.allSettled(stations.map(async station => {
                const url = new URL(`${apiServer}/station-location`);
                url.searchParams.set('name', station.name);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Station location request failed: ${response.status}`);
                const location = await response.json();
                return { ...station, latitude: Number(location.latitude), longitude: Number(location.longitude) };
            }));
            stationLocations = locations
                .filter(result => result.status === 'fulfilled'
                    && Number.isFinite(result.value.latitude)
                    && Number.isFinite(result.value.longitude))
                .map(result => result.value);
            if (!stationLocations.length) throw new Error('No train station locations were returned');
            localStorage.setItem(stationCacheKey, JSON.stringify(stationLocations));
            return stationLocations;
        })().finally(() => {
            stationLoading = null;
        });
        return stationLoading;
    }

    function findNearbyStation() {
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
                nearestTrainStatus.textContent = `${nearest.code} · ${formatDistance(nearest.distance)}`;
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
