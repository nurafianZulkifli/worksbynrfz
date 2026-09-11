(() => {
    const searchInput = document.getElementById('inline-search-input');
    const clearButton = document.getElementById('inline-search-clear');
    const filters = document.getElementById('inline-search-filters');
    const recents = document.getElementById('inline-search-recents');
    const results = document.getElementById('inline-search-results');
    if (!searchInput || !results) return;

    let busStops = [];
    let services = [];
    let filter = 'all';
    let loaded = false;
    const recentKey = 'buszy-recent-searches';

    const escapeHtml = value => String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');

    function getRecentSearches() {
        try {
            const saved = JSON.parse(localStorage.getItem(recentKey) || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (error) {
            return [];
        }
    }

    function getRecentSearchValue(search) {
        if (typeof search === 'string') return search;
        return search?.query || search?.code || '';
    }

    function saveRecentSearch(query) {
        const value = String(query || '').trim();
        if (value.length < 2) return;
        const next = [value, ...getRecentSearches().filter(item => getRecentSearchValue(item).toLowerCase() !== value.toLowerCase())].slice(0, 8);
        localStorage.setItem(recentKey, JSON.stringify(next));
        renderRecentSearches();
    }

    function renderRecentSearches() {
        if (!recents) return;
        const searches = getRecentSearches();
        recents.innerHTML = searches.length
            ? `<div class="inline-search-recent-header"><span class="inline-search-section-label">Recent searches</span><button type="button" class="clear-inline-recent-searches" id="clear-inline-recent-searches">Clear</button></div><div class="inline-search-recent-list">${searches.map(search => {
                const value = getRecentSearchValue(search);
                return `<button type="button" class="inline-search-recent" data-query="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
            }).join('')}</div>`
            : '';
        const clearRecentButton = document.getElementById('clear-inline-recent-searches');
        clearRecentButton?.addEventListener('click', () => {
            localStorage.removeItem(recentKey);
            renderRecentSearches();
        });
        recents.querySelectorAll('[data-query]').forEach(button => {
            button.addEventListener('click', () => {
                searchInput.value = button.dataset.query;
                performSearch();
            });
        });
    }

    async function loadData() {
        if (loaded) return;
        results.innerHTML = '<p class="inline-search-status">Loading stops and services...</p>';
        try {
            const cached = JSON.parse(localStorage.getItem('allBusStops') || 'null');
            busStops = Array.isArray(cached) ? cached : (cached?.value || []);

            if (!busStops.length) {
                const stopsResponse = await fetch('https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops?$skip=0');
                if (stopsResponse.ok) {
                    const stopsData = await stopsResponse.json();
                    busStops = stopsData.value || [];
                }
            }

            const servicesResponse = await fetch(new URL('./json/bus-service-data.json', window.location.href).href);
            if (servicesResponse.ok) services = await servicesResponse.json();
            loaded = true;
            results.innerHTML = '';
        } catch (error) {
            results.innerHTML = '<p class="inline-search-status">Search data is unavailable right now.</p>';
        }
    }

    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        clearButton.classList.toggle('show', Boolean(query));
        if (!query) {
            results.innerHTML = '';
            return;
        }
        if (!loaded) return;
        const matches = [];
        if (filter !== 'services') {
            busStops.filter(stop => `${stop.BusStopCode} ${stop.Description}`.toLowerCase().includes(query))
                .slice(0, 30).forEach(stop => matches.push({
                    type: 'stop', code: stop.BusStopCode, description: stop.Description
                }));
        }
        if (filter !== 'stops') {
            services.filter(service => Object.values(service).join(' ').toLowerCase().includes(query))
                .slice(0, 30).forEach(service => matches.push({
                    type: 'service', code: service.n, description: `${service.ts || 'N/A'} -> ${service.te || 'N/A'}`
                }));
        }
        results.innerHTML = matches.length ? matches.map(renderResult).join('') : '<p class="inline-search-status">No results found.</p>';
        results.querySelectorAll('[data-result-type]').forEach(result => {
            result.addEventListener('click', () => {
                const path = result.dataset.resultType === 'service'
                    ? `bus-service.html?service=${encodeURIComponent(result.dataset.resultCode)}`
                    : `art.html?BusStopCode=${encodeURIComponent(result.dataset.resultCode)}`;
                saveRecentSearch(result.dataset.resultCode);
                window.location.href = path;
            });
        });
    }

    function renderResult(result) {
        if (result.type === 'service') {
            return `<div class="bus-stop inline-search-result service-search-result" data-result-type="service" data-result-code="${escapeHtml(result.code)}">
                <div class="bus-stop-main-row">
                    <div class="bus-stop-info">
                        <div class="service-search-code">${escapeHtml(result.code)}</div>
                        <div class="bus-stop-details">
                            <span class="bus-stop-description">${escapeHtml(result.description)}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        const description = escapeHtml(result.description);
        return `<div class="bus-stop inline-search-result" data-result-type="${result.type}" data-result-code="${escapeHtml(result.code)}">
            <div class="bus-stop-main-row">
                <div class="bus-stop-info">
                    <div class="bus-stop-code-row">
                        <div class="bus-stop-code">
                            <img src="./assets/bus-icon.png" alt="Bus Icon">
                            <span class="bus-stop-code-text">${escapeHtml(result.code)}</span>
                        </div>
                    </div>
                    <div class="bus-stop-details">
                        <span class="bus-stop-description">${description}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    searchInput.addEventListener('focus', loadData);
    searchInput.addEventListener('input', performSearch);
    searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') performSearch();
    });
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        performSearch();
        searchInput.focus();
    });
    filters?.querySelectorAll('[data-filter]').forEach(button => {
        button.addEventListener('click', () => {
            filters.querySelector('.active')?.classList.remove('active');
            button.classList.add('active');
            filter = button.dataset.filter;
            performSearch();
        });
    });

    renderRecentSearches();
})();
