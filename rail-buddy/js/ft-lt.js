     let smrtData = [];
        let sbsData = [];
        let smrtStationCodes = {};
        let mergedData = [];
        let currentData = [];
        let filteredStations = [];
        let allStations = [];
        let loadAttempts = 0;
        const maxRetries = 3;

        // Map a station code prefix (e.g. "NS", "EW") to a line key
        const LINE_PREFIX_MAP = {
            NS: 'NSL', EW: 'EWL', CG: 'EWL', CC: 'CCL', CE: 'CCL',
            DT: 'DTL', TE: 'TEL', NE: 'NEL', BP: 'BP', SE: 'SK', SW: 'SK', PE: 'PG', PW: 'PG'
        };

        // Official line colours, keyed the same way as LINE_PREFIX_MAP's values
        const LINE_COLORS = {
            NSL: '#c41e3a', EWL: '#009645', CCL: '#fa9e0d', DTL: '#005ec8',
            TEL: '#926437', NEL: '#9d27b5', BP: '#708472', SK: '#708472', PG: '#708472'
        };

        // Render one or more station codes (e.g. ["NS1", "EW24"]) as a joined caplet,
        // matching the interchange badge style used on the network map pages.
        // `labels` optionally overrides the displayed text per code (e.g. show "CCL" while colouring by "CC").
        function renderCodeCaplet(codes, labels) {
            if (!codes || codes.length === 0) return '';
            return `<span style="display: inline-flex; margin-right: 6px; vertical-align: middle;">${codes.map((code, i) => {
                const prefix = (code.match(/[A-Za-z]+/) || [''])[0].toUpperCase();
                const lineKey = LINE_PREFIX_MAP[prefix];
                const bg = LINE_COLORS[lineKey] || '#666666';
                const color = lineKey === 'CCL' ? '#000' : '#fff';
                const isFirst = i === 0;
                const isLast = i === codes.length - 1;
                const radius = codes.length === 1
                    ? '13.6px / 19.2px'
                    : isFirst ? '13.6px 0 0 13.6px / 19.2px 0 0 19.2px'
                    : isLast ? '0 13.6px 13.6px 0 / 0 19.2px 19.2px 0'
                    : '0';
                const borderStyle = codes.length === 1
                    ? 'border: 2px solid #fff;'
                    : isFirst ? 'border: 2px solid #fff; border-right: none;'
                    : isLast ? 'border: 2px solid #fff; border-left: none;'
                    : 'border-top: 2px solid #fff; border-bottom: 2px solid #fff;';
                // Always display with a space between the line prefix and number (e.g. "NE 1"),
                // regardless of whether the source data has "NE1" or "NE 1" — display-only, safe across re-scrapes.
                const label = (labels && labels[i]) || code.replace(/^([A-Za-z]+)\s*(\d+)$/, '$1 $2');
                return `<span style="background: ${bg}; color: ${color}; font-weight: bold; border-radius: ${radius}; padding: 4px 7px; font-size: 0.7em; letter-spacing: 0.5px; ${borderStyle}">${label}</span>`;
            }).join('')}</span>`;
        }

        // Extracts leading station codes from a direction description (e.g. "To NS1 EW24 Jurong East")
        // and re-renders them as caplets; Circle Line loop directions use the CCL caplet instead.
        function formatDirectionDescription(description) {
            const cwMatch = description.match(/^(CLOCKWISE|ANTICLOCKWISE)\b(.*)$/i);
            if (cwMatch) {
                const [, word, rest] = cwMatch;
                const label = word[0].toUpperCase() + word.slice(1).toLowerCase();
                return `${renderCodeCaplet(['CC'], ['CCL'])} ${label}${rest}`;
            }

            const match = description.match(/^(To\s+)((?:[A-Za-z]{2}\s*\d+\s*)+)(.+)$/);
            if (!match) return description;
            const [, prefix, codesStr, name] = match;
            const codes = (codesStr.match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, ''));
            return `${prefix}${renderCodeCaplet(codes)}${name}`;
        }
        
        // Load all data on page load
        async function loadData() {
            try {
                loadAttempts++;
                // Load both datasets in parallel
                const [smrtResponse, sbsResponse, codesResponse] = await Promise.all([
                    fetch('json/smrt-ft-lt.json'),
                    fetch('json/sbs-transit-ft-lt.json'),
                    fetch('json/smrt-station-codes.json')
                ]);

                // Check if responses are ok
                if (!smrtResponse.ok || !sbsResponse.ok) {
                    throw new Error(`HTTP Error: SMRT ${smrtResponse.status}, SBS ${sbsResponse.status}`);
                }

                smrtData = await smrtResponse.json();
                sbsData = await sbsResponse.json();
                if (codesResponse.ok) {
                    smrtStationCodes = await codesResponse.json();
                }

                // Merge both datasets
                mergeData();
                populateDropdown();
                initSearchFunctionality();
                
                // Clear any error messages on successful load
                const dropdown = document.getElementById('stationDropdown');
                if (dropdown) {
                    dropdown.classList.remove('error');
                }
            } catch (error) {
                console.error('Error loading data (attempt ' + loadAttempts + '):', error);
                
                // Show error message in UI instead of alert
                showDataLoadError(error);
                
                // Retry after delay if we haven't exceeded max retries
                if (loadAttempts < maxRetries) {
                    const delay = 1000 * loadAttempts; // Exponential backoff
                    setTimeout(() => {
                        console.log('Retrying data load...');
                        loadData();
                    }, delay);
                }
            }
        }
        
        // Display error message in the UI
        function showDataLoadError(error) {
            const dropdown = document.getElementById('stationDropdown');
            const contentSection = document.getElementById('contentSection');
            const directionsContainer = document.getElementById('directionsContainer');
            
            if (dropdown) {
                dropdown.classList.add('error');
                dropdown.innerHTML = '<option value="">Error loading data. Retrying...</option>';
            }
            
            if (directionsContainer) {
                directionsContainer.innerHTML = `
                    <div class="error-message" style="padding: 20px; background: #fee; border: 1px solid #f99; border-radius: 8px; color: #c33; text-align: center;">
                        <strong>Unable to load train data</strong>
                        <p style="margin-top: 10px; font-size: 0.9em;">${error.message}</p>
                        <p style="margin-top: 10px; font-size: 0.85em; opacity: 0.8;">The page will retry automatically...</p>
                    </div>
                `;
            }
        }

        // Merge SMRT and SBS data into one list
        function mergeData() {
            mergedData = [];

            // Add all SMRT stations
            smrtData.forEach((stationData, index) => {
                mergedData.push({
                    name: stationData.station,
                    value: `smrt-${index}`,
                    operator: 'smrt',
                    data: stationData
                });
            });

            // Add all SBS stations
            sbsData.forEach((stationData, index) => {
                mergedData.push({
                    name: stationData.station,
                    value: `sbs-${index}`,
                    operator: 'sbs',
                    data: stationData
                });
            });

            currentData = mergedData;
        }

        // Populate the dropdown with merged stations
        function populateDropdown() {
            const dropdown = document.getElementById('stationDropdown');
            dropdown.innerHTML = '<option value="">Select a station...</option>';
            
            // Group by operator
            const smrtStations = currentData.filter(s => s.operator === 'smrt');
            const sbsStations = currentData.filter(s => s.operator === 'sbs');

            if (smrtStations.length > 0) {
                const smrtGroup = document.createElement('optgroup');
                smrtGroup.label = 'SMRT';
                smrtStations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.value;
                    const code = smrtStationCodes[station.name];
                    option.textContent = code ? `${code} ${station.name}` : station.name;
                    smrtGroup.appendChild(option);
                });
                dropdown.appendChild(smrtGroup);
            }

            if (sbsStations.length > 0) {
                const sbsGroup = document.createElement('optgroup');
                sbsGroup.label = 'SBS Transit';
                sbsStations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.value;
                    option.textContent = station.name;
                    sbsGroup.appendChild(option);
                });
                dropdown.appendChild(sbsGroup);
            }
        }

        // Display data for selected station
        function displayStationData(selection) {
            if (selection === '') {
                document.getElementById('contentSection').classList.remove('active');
                return;
            }

            const contentSection = document.getElementById('contentSection');
            const directionsContainer = document.getElementById('directionsContainer');
            directionsContainer.innerHTML = '';

            const selectedStation = currentData.find(s => s.value === selection);
            if (!selectedStation) return;

            if (selectedStation.operator === 'smrt') {
                displaySmrtData(selectedStation.data);
            } else {
                displaySbsData(selectedStation.data);
            }

            contentSection.classList.add('active');
        }

        // Display SMRT MRT data
        function displaySmrtData(stationData) {
            const code = smrtStationCodes[stationData.station];
            const titleCodes = (code || '').split(/[\/\s]+/).filter(c => /^[A-Za-z]{2}\d+$/.test(c));
            document.getElementById('stationTitle').innerHTML = titleCodes.length > 0
                ? `${renderCodeCaplet(titleCodes)} ${stationData.station}`
                : stationData.station;
            document.getElementById('stationSubtitle').textContent = `Last updated: ${new Date(stationData.scraped_at).toLocaleDateString('en-SG')}`;

            const directionsContainer = document.getElementById('directionsContainer');

            // "To CG2 Changi Airport" is only a valid direction from Tanah Merah (EW4); the SMRT site
            // erroneously repeats this section on other EWL station pages, so filter it out elsewhere.
            const directions = stationData.station_slug === 'tanah-merah'
                ? stationData.directions
                : stationData.directions.filter(d => !/changi airport/i.test(d.description));

            if (directions.length === 0) {
                directionsContainer.innerHTML = '<div class="no-data">No train timing data available for this station.</div>';
                return;
            }

            directions.forEach((direction) => {
                const card = createSmrtDirectionCard(direction);
                directionsContainer.appendChild(card);
            });
        }

        // Display SBS LRT data
        function displaySbsData(stationData) {
            // SBS station strings look like "DT1 Bukit Panjang", "DT 1 Bukit Panjang" or "East Loop"
            const codeMatch = stationData.station.match(/^([A-Za-z]{2})\s*(\d+)\s+(.+)$/);
            document.getElementById('stationTitle').innerHTML = codeMatch
                ? `${renderCodeCaplet([`${codeMatch[1]}${codeMatch[2]}`])} ${codeMatch[3]}`
                : stationData.station;
            
            // Get the latest scraped_at timestamp from directions
            const latestTimestamp = stationData.directions.length > 0 
                ? stationData.directions[0].scraped_at 
                : new Date().toISOString();
            
            document.getElementById('stationSubtitle').textContent = `Last updated: ${new Date(latestTimestamp).toLocaleDateString('en-SG')}`;

            const directionsContainer = document.getElementById('directionsContainer');

            if (stationData.directions.length === 0) {
                directionsContainer.innerHTML = '<div class="no-data">No train timing data available for this station.</div>';
                return;
            }

            stationData.directions.forEach((direction) => {
                const card = createSbsDirectionCard(direction);
                directionsContainer.appendChild(card);
            });
        }

        // Create SMRT direction card
        function createSmrtDirectionCard(direction) {
            const card = document.createElement('div');
            card.className = 'direction-card';

            const header = document.createElement('div');
            header.className = 'direction-header';
            header.innerHTML = formatDirectionDescription(direction.description);
            card.appendChild(header);

            const dayKeys = ['monday_to_friday', 'saturday', 'sunday_public_holidays', 'eve_of_public_holidays'];
            const dayLabels = {
                'monday_to_friday': 'Mon - Fri',
                'saturday': 'Saturday',
                'sunday_public_holidays': 'Sun / Holidays',
                'eve_of_public_holidays': 'Eve of Holidays'
            };

            dayKeys.forEach(dayKey => {
                if (direction.first_train[dayKey] !== undefined || direction.last_train[dayKey] !== undefined) {
                    const row = document.createElement('div');
                    row.className = 'time-row';

                    const label = document.createElement('div');
                    label.className = 'day-label';
                    label.textContent = dayLabels[dayKey] || dayKey;

                    const firstTimeEl = document.createElement('div');
                    firstTimeEl.className = 'time-value first-train';
                    firstTimeEl.textContent = (direction.first_train[dayKey] || '--');

                    const lastTimeEl = document.createElement('div');
                    lastTimeEl.className = 'time-value last-train';
                    lastTimeEl.textContent = (direction.last_train[dayKey] || '--');

                    row.appendChild(label);
                    row.appendChild(firstTimeEl);
                    row.appendChild(lastTimeEl);
                    card.appendChild(row);
                }
            });

            return card;
        }

        // Format time with leading zeros, convert PM times for last trains (times in JSON are in 12-hour format)
        function convertTo24Hour(timeString, isLastTrain = false) {
            if (!timeString || timeString === '--') return timeString;
            
            const match = timeString.match(/^(\d{1,2}):(\d{2})$/);
            if (match) {
                let hour = parseInt(match[1]);
                const minute = match[2];
                
                // For last trains, times like 11:46, 12:01 are PM/early morning
                // Convert to 24-hour: 11:46 PM -> 23:46, 12:01 AM -> 00:01
                if (isLastTrain) {
                    if (hour === 12) {
                        hour = 0; // 12:xx AM is 00:xx
                    } else if (hour < 12) {
                        hour += 12; // 1-11 PM becomes 13-23
                    }
                }
                
                return `${String(hour).padStart(2, '0')}:${minute}`;
            }
            
            return timeString;
        }

        // Create SBS direction card
        function createSbsDirectionCard(direction) {
            const card = document.createElement('div');
            card.className = 'direction-card';

            const header = document.createElement('div');
            header.className = 'direction-header';
            header.innerHTML = formatDirectionDescription(direction.description);
            card.appendChild(header);

            const dayKeys = ['monday_to_friday', 'saturday', 'sunday_public_holidays','eve_of_public_holidays'];
            const dayLabels = {
                'monday_to_friday': 'Mon - Fri',
                'saturday': 'Saturday',
                'sunday_public_holidays': 'Sun / Holidays',
                'eve_of_public_holidays': 'Eve of Holidays'
            };

            dayKeys.forEach(dayKey => {
                if (direction.first_train[dayKey] !== undefined || direction.last_train[dayKey] !== undefined) {
                    const row = document.createElement('div');
                    row.className = 'time-row';

                    const label = document.createElement('div');
                    label.className = 'day-label';
                    label.textContent = dayLabels[dayKey] || dayKey;

                    const firstTimeEl = document.createElement('div');
                    firstTimeEl.className = 'time-value first-train';
                    firstTimeEl.textContent = (direction.first_train[dayKey] || '--');

                    const lastTimeEl = document.createElement('div');
                    lastTimeEl.className = 'time-value last-train';
                    lastTimeEl.textContent = (direction.last_train[dayKey] || '--');

                    row.appendChild(label);
                    row.appendChild(firstTimeEl);
                    row.appendChild(lastTimeEl);
                    card.appendChild(row);
                }
            });

            return card;
        }

        // Event listener for dropdown
        document.getElementById('stationDropdown').addEventListener('change', (e) => {
            displayStationData(e.target.value);
        });

        // Search functionality
        function initSearchFunctionality() {
            const searchInput = document.getElementById('stationSearch');
            const clearButton = document.getElementById('clearSearch');
            const resultsCount = document.getElementById('resultsCount');
            const dropdown = document.getElementById('stationDropdown');

            // Build all stations list
            buildAllStationsList();

            // Search input listener
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                clearButton.classList.toggle('visible', query.length > 0);

                if (query.length > 0) {
                    filterStations(query);
                    updateDropdownFromFiltered();
                    resultsCount.textContent = '';
                    
                    // Auto-display results if exactly one station is found
                    if (filteredStations.length === 1) {
                        displayStationData(filteredStations[0].value);
                        dropdown.classList.remove('highlight');
                    } else if (filteredStations.length > 1) {
                        // Highlight dropdown to prompt selection
                        dropdown.classList.add('highlight');
                    }
                } else {
                    filteredStations = [];
                    populateDropdown();
                    resultsCount.textContent = '';
                    dropdown.classList.remove('highlight');
                    // Clear displayed data when search is cleared
                    document.getElementById('contentSection').classList.remove('active');
                }
            });

            // Clear button listener
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                clearButton.classList.remove('visible');
                filteredStations = [];
                populateDropdown();
                resultsCount.textContent = '';
                dropdown.classList.remove('highlight');
                document.getElementById('contentSection').classList.remove('active');
                searchInput.focus();
            });
        }

        // Build a flat list of all stations
        function buildAllStationsList() {
            allStations = mergedData.map(station => ({
                ...station
            }));
        }

        // Filter stations based on search query
        function filterStations(query) {
            filteredStations = allStations.filter(station => {
                if (station.name.toLowerCase().includes(query)) return true;
                const code = smrtStationCodes[station.name];
                if (code && code.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        // Update dropdown to show only filtered stations
        function updateDropdownFromFiltered() {
            const dropdown = document.getElementById('stationDropdown');
            const resultsCount = document.getElementById('resultsCount');
            dropdown.innerHTML = `<option value="">Found ${filteredStations.length} station${filteredStations.length !== 1 ? 's' : ''}...</option>`;

            // Group by operator
            const smrtStations = filteredStations.filter(s => s.operator === 'smrt');
            const sbsStations = filteredStations.filter(s => s.operator === 'sbs');

            if (smrtStations.length > 0) {
                const smrtGroup = document.createElement('optgroup');
                smrtGroup.label = 'SMRT';
                smrtStations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.value;
                    const code = smrtStationCodes[station.name];
                    option.textContent = code ? `${code} ${station.name}` : station.name;
                    smrtGroup.appendChild(option);
                });
                dropdown.appendChild(smrtGroup);
            }

            if (sbsStations.length > 0) {
                const sbsGroup = document.createElement('optgroup');
                sbsGroup.label = 'SBS Transit';
                sbsStations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.value;
                    option.textContent = station.name;
                    sbsGroup.appendChild(option);
                });
                dropdown.appendChild(sbsGroup);
            }
        }

        // Event listener for dropdown
        document.getElementById('stationDropdown').addEventListener('change', (e) => {
            displayStationData(e.target.value);
        });

        // Load data when page loads
        window.addEventListener('load', loadData);