const STATION_CACHE_KEY = 'railbuddy_station_locations_v2';
const PLATFORM_SELECTIONS_KEY = 'railbuddy_platform_selections_v1';
const MIN_STATION_MOVEMENT_METRES = 20;
const NEARBY_STATION_RADIUS_METRES = 1000;
const ROUTE_STATION_MATCH_RADIUS_METRES = 500;
const API_SERVERS = (() => {
    const currentUrl = new URL(window.location.href);
    const productionApi = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
    if (currentUrl.hostname !== 'localhost') return [productionApi];
    const localApi = currentUrl.port === '3000' ? currentUrl.origin : 'http://localhost:3000';
    return [localApi, productionApi];
})();

let currentPosition = null;
let nearestStation = null;
let stationLocations = [];
let railNetworks = [];
let lineDirections = [];
let selectedStationName = null;
let selectedService = null;
let activeRoute = [];
let activeRouteIndex = -1;
let activeTrackingTab = 'route';
let selectedPlatform = '';
let watchId = null;
let liveMap = null;
let livePositionMarker = null;
let liveAccuracyCircle = null;
let stationMarker = null;
let mapFollowsLocation = true;

const elements = {
    status: document.getElementById('location-status'),
    locate: document.getElementById('locate-button'),
    coordinates: document.getElementById('coordinates'),
    accuracy: document.getElementById('location-accuracy'),
    picker: document.getElementById('service-picker'),
    clear: document.getElementById('clear-service'),
    currentStation: document.getElementById('current-station-control'),
    trackingCopy: document.getElementById('tracking-copy'),
    nextStops: document.getElementById('next-stops'),
    tabs: document.querySelectorAll('[data-tracking-tab]')
};

function distanceMetres(first, second) {
    const radians = value => value * Math.PI / 180;
    const earthRadius = 6371000;
    const latitude = radians(second.latitude - first.latitude);
    const longitude = radians(second.longitude - first.longitude);
    const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitude / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(distance) {
    return distance < 1000 ? `${Math.round(distance)} m away` : `${(distance / 1000).toFixed(1)} km away`;
}

function normaliseCode(code) {
    return String(code).replace(/\s+/g, '');
}

function addStation(stations, station) {
    const code = normaliseCode(station.code);
    if (!stations.some(item => item.name === station.name && item.code === code)) stations.push({ name: station.name, code });
    (station.interchanges || []).forEach(interchange => {
        const interchangeCode = normaliseCode(interchange.code);
        if (!stations.some(item => item.name === station.name && item.code === interchangeCode)) stations.push({ name: station.name, code: interchangeCode });
    });
}

async function loadStations() {
    const directionsResponse = await fetch('json/line-directions.json');
    if (!directionsResponse.ok) throw new Error(`Line directions request failed: ${directionsResponse.status}`);
    const directions = await directionsResponse.json();
    lineDirections = Array.isArray(directions.lines) ? directions.lines : [];
    const lines = await Promise.all(lineDirections.map(line => fetch(`json/${line.stationDataFile}`).then(response => response.json())));
    railNetworks = lines;
    const stations = [];
    lines.forEach(line => line.branches.forEach(branch => branch.stations.forEach(station => addStation(stations, station))));
    return stations;
}

async function findStationCoordinates(station) {
    let lastError = null;
    for (const apiServer of API_SERVERS) {
        try {
            const url = new URL(`${apiServer}/station-location`);
            url.searchParams.set('name', station.name);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Station location request failed: ${response.status}`);
            const { latitude, longitude } = await response.json();
            return Number.isFinite(latitude) && Number.isFinite(longitude) ? { ...station, latitude, longitude } : null;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Station location request failed');
}

async function loadStationLocations() {
    const stations = await loadStations();
    try {
        const cached = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) || 'null');
        if (Array.isArray(cached) && cached.length) return cached;
    } catch (error) {
        localStorage.removeItem(STATION_CACHE_KEY);
    }

    const uniqueStations = [...new Map(stations.map(station => [station.name, station])).values()];
    // Fetch all stations concurrently (server retries/backs off on rate limits) instead of small sequential batches.
    const results = await Promise.allSettled(uniqueStations.map(station => findStationCoordinates(station)));
    const locations = [];
    results.forEach((result, resultIndex) => {
        if (result.status === 'fulfilled') {
            if (result.value) locations.push(result.value);
        } else {
            console.warn(`[where-am-i] Location unavailable for ${uniqueStations[resultIndex].name}:`, result.reason);
        }
    });
    if (!locations.length) throw new Error('No station coordinates were returned');
    localStorage.setItem(STATION_CACHE_KEY, JSON.stringify(locations));
    return locations;
}

function initializeLiveMap() {
    const mapContainer = document.getElementById('live-map');
    if (!mapContainer || !window.L) return;
    liveMap = L.map(mapContainer, { zoomControl: true }).setView([1.3521, 103.8198], 12);
    L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
        detectRetina: true,
        maxZoom: 19,
        minZoom: 11,
        attribution: '&copy; <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>'
    }).addTo(liveMap);
    liveMap.on('dragstart', () => { mapFollowsLocation = false; });
}

function updateLiveMap() {
    if (!liveMap || !currentPosition) return;
    const location = [currentPosition.latitude, currentPosition.longitude];
    const isFirstFix = !livePositionMarker;
    if (!livePositionMarker) livePositionMarker = L.circleMarker(location, { radius: 9, color: '#fff', weight: 3, fillColor: '#8f2d22', fillOpacity: 1 }).addTo(liveMap).bindPopup('Your live location');
    else livePositionMarker.setLatLng(location);
    if (!liveAccuracyCircle) liveAccuracyCircle = L.circle(location, { radius: currentPosition.accuracy || 0, color: '#8f2d22', weight: 1, fillColor: '#8f2d22', fillOpacity: .12 }).addTo(liveMap);
    else {
        liveAccuracyCircle.setLatLng(location);
        liveAccuracyCircle.setRadius(currentPosition.accuracy || 0);
    }
    // Follow the user in real time rather than waiting for the (slower) nearest station lookup to resolve.
    if (mapFollowsLocation) liveMap.setView(location, isFirstFix ? 16 : liveMap.getZoom(), { animate: !isFirstFix });
}

function updateNearestStation() {
    if (!currentPosition || !stationLocations.length) return;
    nearestStation = stationLocations.map(station => ({ ...station, distance: distanceMetres(currentPosition, station) })).sort((first, second) => first.distance - second.distance)[0];
    elements.status.textContent = `Tracking your nearest station as you move.`;

    if (!liveMap) return;
    const stationLocation = [nearestStation.latitude, nearestStation.longitude];
    if (!stationMarker) stationMarker = L.circleMarker(stationLocation, { radius: 10, color: '#fff', weight: 3, fillColor: '#d17321', fillOpacity: 1 }).addTo(liveMap);
    else stationMarker.setLatLng(stationLocation);
    stationMarker.bindPopup(`<strong>${nearestStation.name} (${nearestStation.code})</strong><br>${formatDistance(nearestStation.distance)}`);
    if (selectedService && !getServicesAtStation(nearestStation.name).some(line => line.code === selectedService)) {
        selectCurrentStation(nearestStation.name);
        return;
    }
    if (!selectedService) selectedStationName = nearestStation.name;
    advanceRouteAtNextStation();
    renderTracking();
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function getSelectedStation() {
    return stationLocations.find(station => station.name === selectedStationName) || nearestStation;
}

function getNearbyStations() {
    if (!currentPosition) return [];
    const rankedStations = stationLocations.map(station => ({ ...station, distance: distanceMetres(currentPosition, station) })).sort((first, second) => first.distance - second.distance);
    const nearbyStations = rankedStations.filter(station => station.distance <= NEARBY_STATION_RADIUS_METRES);
    return nearbyStations.length ? nearbyStations : rankedStations.slice(0, 1);
}

function getStationNetworks(stationName) {
    return railNetworks.filter(line => line.branches.some(branch => branch.stations.some(station => station.name === stationName)));
}

function getServicesAtStation(stationName) {
    return getStationNetworks(stationName);
}

function getRouteForStationPlatform(stationName, platform = '') {
    const line = railNetworks.find(network => network.code === selectedService);
    if (!line) return [];

    if (line.code === 'CCL' && stationName === 'Promenade' && platform) {
        const branchId = platform === 'a' ? 'anticlockwiseLoop' : 'clockwiseLoop';
        return line.branches.find(branch => branch.id === branchId)?.stations || [];
    }

    const branch = line.branches.find(item => item.stations.some(station => station.name === stationName));
    const route = branch?.stations || [];
    return platform === 'a' ? [...route].reverse() : route;
}

function getRouteForCurrentStation() {
    return getRouteForStationPlatform(selectedStationName, selectedPlatform);
}

function getPlatformDirection(stationName, platform) {
    const line = lineDirections.find(item => item.code === selectedService);
    return line?.stations?.[stationName]?.platforms?.[platform] || line?.platforms?.[platform] || {};
}

function stationCodeOnLine(stationName, service = selectedService) {
    const line = railNetworks.find(network => network.code === service);
    return normaliseCode(line?.branches.flatMap(branch => branch.stations).find(station => station.name === stationName)?.code || '');
}

function selectService(service) {
    selectedService = service;
    if (!service) activeTrackingTab = 'route';
    selectedPlatform = service ? getPlatformSelection() : '';
    setActiveRouteDirection();
    renderTracking();
}

function selectCurrentStation(name) {
    selectedStationName = name;
    selectedService = null;
    activeTrackingTab = 'route';
    selectedPlatform = '';
    activeRoute = [];
    activeRouteIndex = -1;
    renderTracking();
}

function advanceRouteAtNextStation() {
    if (!selectedService || activeRouteIndex < 0 || !nearestStation) return;
    const nextStation = activeRoute[activeRouteIndex + 1];
    const stationMatchRadius = Math.max(ROUTE_STATION_MATCH_RADIUS_METRES, (currentPosition?.accuracy || 0) + 100);
    if (nextStation && nextStation.name === nearestStation.name && nearestStation.distance <= stationMatchRadius) {
        selectedStationName = nextStation.name;
        activeRouteIndex += 1;
    }
}

function stepRoute(step) {
    const nextIndex = activeRouteIndex + step;
    if (!selectedService || nextIndex < 0 || nextIndex >= activeRoute.length) return;
    selectedStationName = activeRoute[nextIndex].name;
    activeRouteIndex = nextIndex;
    renderTracking();
}

function platformSelectionKey() {
    return `${selectedStationName}::${selectedService}`;
}

function getPlatformSelections() {
    try {
        return JSON.parse(localStorage.getItem(PLATFORM_SELECTIONS_KEY) || '{}');
    } catch (error) {
        localStorage.removeItem(PLATFORM_SELECTIONS_KEY);
        return {};
    }
}

function getPlatformSelection() {
    return getPlatformSelections()[platformSelectionKey()] || '';
}

function setActiveRouteDirection() {
    activeRoute = selectedService ? getRouteForCurrentStation() : [];
    activeRouteIndex = activeRoute.findIndex(station => station.name === selectedStationName);
}

function selectPlatform(platform) {
    const selections = getPlatformSelections();
    selections[platformSelectionKey()] = platform;
    localStorage.setItem(PLATFORM_SELECTIONS_KEY, JSON.stringify(selections));
    selectedPlatform = platform;
    setActiveRouteDirection();
    renderTracking();
}

function setTrackingTab(tab) {
    if (tab === 'platform' && !selectedService) return;
    activeTrackingTab = tab;
    renderTracking();
}

function updateTrackingTabs() {
    elements.tabs.forEach(tab => {
        const isActive = tab.dataset.trackingTab === activeTrackingTab;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
        tab.disabled = !selectedService && tab.dataset.trackingTab === 'platform';
    });
}

function stationCodeClass(code) {
    const prefix = normaliseCode(code).match(/^[A-Z]+/i)?.[0]?.toUpperCase();
    return ({ NS: 'mrt-nsl', EW: 'mrt-ewl', CG: 'mrt-ewl', NE: 'mrt-nel', CC: 'mrt-ccl', CE: 'mrt-ccl', DT: 'mrt-dtl', TE: 'mrt-tel', BP: 'mrt-lrt', SE: 'mrt-lrt', SW: 'mrt-lrt', PE: 'mrt-lrt', PW: 'mrt-lrt' })[prefix] || 'mrt-lrt';
}

function lineChipTextColor(color) {
    const hex = String(color || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '#000';
    const [red, green, blue] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
    return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? '#000' : '#fff';
}

function formatStationCode(code) {
    return String(code).replace(/^([A-Za-z]+)(\d+)$/, '$1 $2');
}

function renderStationCodeCaplets(codes) {
    return `<span class="station-code-caplets">${codes.map(code => `<span class="station-code-caplet ${stationCodeClass(code)}">${escapeHtml(formatStationCode(code))}</span>`).join('')}</span>`;
}

function renderPlatformTab(currentStation, currentCode) {
    const platformARoute = getRouteForStationPlatform(currentStation.name, 'a');
    const platformBRoute = getRouteForStationPlatform(currentStation.name, 'b');
    const platformANextStation = platformARoute[platformARoute.findIndex(station => station.name === currentStation.name) + 1];
    const platformBNextStation = platformBRoute[platformBRoute.findIndex(station => station.name === currentStation.name) + 1];
    const platformACodes = [currentCode, platformANextStation && normaliseCode(platformANextStation.code)].filter(Boolean);
    const platformBCodes = [currentCode, platformBNextStation && normaliseCode(platformBNextStation.code)].filter(Boolean);
    const platformA = 'Platform A';
    const platformB = 'Platform B';
    const platformOption = (platform, label, codes) => {
        const { destination, direction } = getPlatformDirection(currentStation.name, platform);
        const displayName = direction && destination ? `${direction} (to ${destination})` : direction || destination || '';
        const prefix = direction ? '' : '<span>To</span>';
        return `<button class="platform-toggle-option${selectedPlatform === platform ? ' selected' : ''}" type="button" role="radio" aria-checked="${selectedPlatform === platform}" data-platform="${platform}"><span class="platform-toggle-name">${label}</span><span class="platform-direction">${renderStationCodeCaplets(codes)}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>${prefix}<span class="platform-terminal-name">${escapeHtml(displayName)}</span></span></button>`;
    };
    elements.nextStops.innerHTML = `<section class="platform-panel" role="tabpanel" aria-labelledby="platform-tab"><p class="platform-context">${escapeHtml(currentStation.name)} (${escapeHtml(currentCode)}) · ${escapeHtml(selectedService)}</p><p class="platform-label">Choose your platform</p><div class="platform-toggle" role="radiogroup" aria-label="Platform at ${escapeHtml(currentStation.name)}">${platformOption('a', platformA, platformACodes)}${platformOption('b', platformB, platformBCodes)}</div><p class="platform-save-status" aria-live="polite">${selectedPlatform ? `${selectedPlatform === 'a' ? platformA : platformB} selected.` : 'Your choice is saved for this station and line.'}</p></section>`;
}

function renderTracking() {
    const currentStation = getSelectedStation();
    if (!currentStation) {
        elements.currentStation.innerHTML = '<p class="next-stops-loading">Finding nearby MRT and LRT stations...</p>';
        elements.picker.innerHTML = '';
        elements.nextStops.innerHTML = '';
        return;
    }

    const nearbyStations = getNearbyStations();
    const services = getServicesAtStation(currentStation.name);
    const currentStationPickerIsFocused = document.activeElement?.id === 'current-station-picker';
    if (!currentStationPickerIsFocused) {
        elements.currentStation.innerHTML = `<label class="current-station-label" for="current-station-picker">Nearby MRT &amp; LRT Stations Around You</label><select id="current-station-picker" class="current-station-picker" aria-label="Nearby MRT and LRT stations around you">${nearbyStations.map(station => `<option value="${escapeHtml(station.name)}"${station.name === currentStation.name ? ' selected' : ''}>${escapeHtml(station.name)} (${escapeHtml(station.code)})</option>`).join('')}</select>`;
    }
    elements.picker.innerHTML = services.length ? services.map(line => {
        const lineColor = /^#[0-9a-f]{6}$/i.test(line.color || '') ? line.color : '#94d40b';
        const textColor = lineChipTextColor(lineColor);
        return `<button class="service-chip${line.code === selectedService ? ' selected' : ''}" type="button" data-service="${escapeHtml(line.code)}" style="--service-color: ${lineColor}; --service-text-color: ${textColor};">${escapeHtml(line.code)}</button>`;
    }).join('') : '<span class="tracking-copy">No rail lines were found for this station.</span>';
    elements.clear.hidden = !selectedService;
    updateTrackingTabs();

    if (!selectedService || activeRouteIndex < 0) {
        elements.trackingCopy.textContent = 'Choose a line to follow its next stations.';
        elements.nextStops.innerHTML = '';
        return;
    }

    const nextStations = activeRoute.slice(activeRouteIndex + 1, activeRouteIndex + 5);
    const currentCode = stationCodeOnLine(currentStation.name);
    const hasPreviousStation = activeRouteIndex > 0;
    const hasFollowingStation = activeRouteIndex < activeRoute.length - 1;
    elements.trackingCopy.textContent = nextStations.length ? `Following ${selectedService}. Route advances when you reach ${nextStations[0].name}.` : `Following ${selectedService}.`;
    if (activeTrackingTab === 'platform') {
        renderPlatformTab(currentStation, currentCode);
        return;
    }
    const routeStepControls = `<div class="route-step-controls"><button type="button" class="route-step-button" data-route-step="-1" title="Previous station" aria-label="Previous station"${hasPreviousStation ? '' : ' disabled'}><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button><button type="button" class="route-step-button" data-route-step="1" title="Next station" aria-label="Next station"${hasFollowingStation ? '' : ' disabled'}><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></div>`;
    elements.nextStops.innerHTML = nextStations.length ? `<div class="next-stops-header"><p class="next-stops-title">Current Station: <span class="current-station-name">${renderStationCodeCaplets([currentCode])}${escapeHtml(currentStation.name)}</span></p>${routeStepControls}</div><ul class="onboard-stops-list">${nextStations.map(station => `<li>${renderStationCodeCaplets([normaliseCode(station.code)])}<span>${escapeHtml(station.name)}</span></li>`).join('')}</ul>` : '<p class="next-stops-loading">No following stations found for this route.</p>';
}

function updatePosition(position) {
    const nextPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
    const moved = !currentPosition || distanceMetres(currentPosition, nextPosition) >= MIN_STATION_MOVEMENT_METRES;
    currentPosition = nextPosition;
    elements.coordinates.textContent = `${currentPosition.latitude.toFixed(5)}, ${currentPosition.longitude.toFixed(5)}`;
    elements.accuracy.textContent = currentPosition.accuracy ? `within ${Math.round(currentPosition.accuracy)} m` : '';
    elements.status.textContent = stationLocations.length ? (nearestStation ? 'Tracking your nearest station as you move.' : 'Finding your nearest station...') : 'Loading station locations...';
    updateLiveMap();
    if (moved || !nearestStation) updateNearestStation();
}

function startLocationTracking() {
    if (!navigator.geolocation) {
        elements.status.textContent = 'This browser does not support location services.';
        return;
    }
    elements.locate.disabled = true;
    elements.status.textContent = 'Requesting your location...';
    navigator.geolocation.getCurrentPosition(position => {
        updatePosition(position);
        elements.locate.disabled = false;
    }, handleLocationError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(updatePosition, handleLocationError, { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 });
}

function handleLocationError(error) {
    elements.locate.disabled = false;
    elements.status.textContent = error.code === 1 ? 'Location permission is needed to find your nearest station.' : 'Your location is unavailable right now. Try again shortly.';
}

document.getElementById('locate-button').addEventListener('click', startLocationTracking);
elements.clear.addEventListener('click', () => selectService(null));
document.getElementById('recenter-map-btn').addEventListener('click', () => {
    mapFollowsLocation = true;
    updateLiveMap();
});
document.getElementById('collapse-map-btn').addEventListener('click', event => {
    const section = document.getElementById('live-map-section');
    const isCollapsed = section.classList.toggle('collapsed');
    event.currentTarget.title = isCollapsed ? 'Expand map' : 'Collapse map';
    event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
    event.currentTarget.querySelector('i').className = isCollapsed ? 'fa-regular fa-expand' : 'fa-regular fa-close';
    if (!isCollapsed) setTimeout(() => liveMap?.invalidateSize(), 0);
});
document.addEventListener('click', event => {
    const button = event.target.closest('[data-service]');
    if (button) selectService(button.dataset.service);
});
document.addEventListener('click', event => {
    const button = event.target.closest('[data-route-step]');
    if (button) stepRoute(Number(button.dataset.routeStep));
});
document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tracking-tab]');
    if (tab) setTrackingTab(tab.dataset.trackingTab);
});
document.addEventListener('click', event => {
    const option = event.target.closest('[data-platform]');
    if (option) selectPlatform(option.dataset.platform);
});
document.addEventListener('change', event => {
    if (event.target.matches('#current-station-picker')) selectCurrentStation(event.target.value);
});

initializeLiveMap();
loadStationLocations().then(locations => {
    stationLocations = locations;
    if (currentPosition) updateNearestStation();
}).catch(error => {
    console.error('[where-am-i] Station locations unavailable:', error);
    elements.status.textContent = 'Unable to load station locations. Check your connection and try again.';
});
startLocationTracking();