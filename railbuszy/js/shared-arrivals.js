(function(window){
    // Shared helper functions for bus arrival API processing (extracted from art.js)

    function getBasePath() {
        if (window.PWAConfig && window.PWAConfig.basePath) return window.PWAConfig.basePath;
        const pathname = window.location.pathname;
        const parts = pathname.split('/').filter(p => p);
        if (parts.length >= 2 && parts[1] === 'buszy') return '/' + parts[0] + '/';
        return '/';
    }

    async function fetchArrivals(busStopCode) {
        const url = new URL('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-arrivals');
        url.searchParams.append('BusStopCode', busStopCode);
        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error('Failed to fetch arrivals: ' + resp.status);
        const data = await resp.json();
        
        // Store server time offset for clock synchronization
        if (data.serverTime) {
            const serverTime = new Date(data.serverTime);
            const clientTime = new Date();
            window.__timeOffset = serverTime - clientTime;
        }
        
        return data;
    }

    function getSynchronizedNow() {
        // Returns the current time synchronized with server
        // If server time offset is available, use it; otherwise use local time
        if (window.__timeOffset !== undefined) {
            return new Date(new Date().getTime() + window.__timeOffset);
        }
        return new Date();
    }

    function getDestinationMapFromArrivals(data) {
        const destinationCodeMap = {};
        if (!data || !Array.isArray(data.Services)) return destinationCodeMap;
        data.Services.forEach(service => {
            if (service.NextBus?.DestinationCode) {
                destinationCodeMap[service.ServiceNo] = service.NextBus.DestinationCode;
            }
        });
        return destinationCodeMap;
    }

    function getLoadIcon(load, type) {
        let fleetIcon = '';
        if (type) {
            switch ((type || '').toUpperCase()) {
                case 'SD':
                case 'SINGLE DECK':
                    fleetIcon = '<i class="fa-kit fa-lta-bus" title="Single Deck"></i>';
                    break;
                case 'DD':
                case 'DOUBLE DECK':
                    fleetIcon = '<i class="fa-kit fa-lta-dd" title="Double Deck"></i>';
                    break;
                case 'BD':
                case 'BENDY':
                case 'BENDY BUS':
                    fleetIcon = '<i class="fa-kit fa-lta-bb" title="Bendy Bus"></i>';
                    break;
                default:
                    fleetIcon = '';
            }
        }
        let loadClass = '';
        if (load) loadClass = ('' + load).toLowerCase();
        return fleetIcon ? `<span class="load-indicator ${loadClass}">${fleetIcon}</span>` : '';
    }

    function formatArrivalTimeOrArr(isoString, now, isIncomingBus = false) {
        const arrivalTime = new Date(isoString);
        const timeDifference = arrivalTime - now;
        if (timeDifference === 0) return `<span class="arrival-now">Arr</span>`;
        else if (timeDifference < 0) return `<span class="arrival-now">Arr</span>`;

        const savedFormat = localStorage.getItem('timeFormat') || '12-hour';
        if (savedFormat === 'mins') {
            const minutes = Math.floor(timeDifference / (1000 * 60));
            if (minutes <= 0) return `<span class="arrival-now">Arr</span>`;
            const minText = minutes === 1 ? 'min' : 'mins';
            return `${minutes}<span class="mins"> ${minText}</span>`;
        }

        const options = savedFormat === '24-hour' ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: true };
        const timeString = arrivalTime.toLocaleTimeString('en-US', options);
        if (savedFormat === '12-hour') {
            const parts = timeString.split(' ');
            if (parts.length === 2) {
                if (isIncomingBus) return `${parts[0]}<span style="font-size: 0.5em; margin-left: 2px;">${parts[1]}</span>`;
                else return `${parts[0]}<span style="font-size: 0.5em; margin-left: 1.5px; position: relative; display: inline-block;">${parts[1]}</span>`;
            }
        }
        return timeString;
    }

    async function getBusStops() {
        if (window.getBusStops && typeof window.getBusStops === 'function') {
            try { return await window.getBusStops(); } catch(e){}
        }
        // Fallback: read localStorage or fetch
        try {
            const cached = localStorage.getItem('allBusStops');
            if (cached) return JSON.parse(cached);
        } catch (e) {}
        // Fetch paginated
        let busStops = [];
        let skip = 0;
        let hasMore = true;
        while (hasMore) {
            const resp = await fetch(`https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=${skip}`);
            if (!resp.ok) break;
            const data = await resp.json();
            if (!data.value || data.value.length === 0) { hasMore = false; break; }
            busStops = busStops.concat(data.value);
            skip += 500;
        }
        try { localStorage.setItem('allBusStops', JSON.stringify(busStops)); } catch (e) {}
        return busStops;
    }

    async function loadBusServiceTerminals() {
        if (window.loadBusServiceTerminals && typeof window.loadBusServiceTerminals === 'function') {
            try { return await window.loadBusServiceTerminals(); } catch(e){}
        }
        if (sessionStorage.__serviceTerminals) return JSON.parse(sessionStorage.__serviceTerminals);
        try {
            const basePath = getBasePath();
            const jsonPath = basePath + 'buszy/json/bus-service-data.json';
            const resp = await fetch(jsonPath);
            if (!resp.ok) return {};
            const services = await resp.json();
            const terminalMap = {};
            if (Array.isArray(services)) {
                services.forEach(s => {
                    const serviceNo = s.n || s.ServiceNo;
                    const terminalName = s.te || s.direction_routes?.[1]?.te || s.direction_routes?.['1']?.te;
                    if (serviceNo && terminalName) terminalMap[String(serviceNo)] = terminalName;
                });
            }
            try { sessionStorage.__serviceTerminals = JSON.stringify(terminalMap); } catch(e){}
            return terminalMap;
        } catch (e) { return {}; }
    }

    window.SharedArrivals = {
        getBasePath,
        fetchArrivals,
        getDestinationMapFromArrivals,
        getLoadIcon,
        formatArrivalTimeOrArr,
        getBusStops,
        loadBusServiceTerminals,
        getSynchronizedNow
    };
})(window);
