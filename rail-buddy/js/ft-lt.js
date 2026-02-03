     let smrtData = [];
        let sbsData = [];
        let mergedData = [];
        let currentData = [];
        let filteredStations = [];
        let allStations = [];
        // Load all data on page load
        async function loadData() {
            try {
                // Load both datasets in parallel
                const [smrtResponse, sbsResponse] = await Promise.all([
                    fetch('json/smrt-ft-lt.json'),
                    fetch('json/sbs-transit-ft-lt.json')
                ]);

                smrtData = await smrtResponse.json();
                sbsData = await sbsResponse.json();

                // Merge both datasets
                mergeData();
                populateDropdown();
                initSearchFunctionality();
            } catch (error) {
                console.error('Error loading data:', error);
                alert('Failed to load train data. Please refresh the page.');
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
            sbsData.lines.forEach((line, lineIdx) => {
                line.stations.forEach((station, stationIdx) => {
                    mergedData.push({
                        name: station.name,
                        value: `sbs-${lineIdx}-${stationIdx}`,
                        operator: 'sbs',
                        line: line.service.split('(')[0].trim(),
                        data: { line: line, station: station, sbsData: sbsData }
                    });
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
                    option.textContent = station.name;
                    smrtGroup.appendChild(option);
                });
                dropdown.appendChild(smrtGroup);
            }

            if (sbsStations.length > 0) {
                // Group SBS by line
                const lineGroups = {};
                sbsStations.forEach(station => {
                    if (!lineGroups[station.line]) {
                        lineGroups[station.line] = [];
                    }
                    lineGroups[station.line].push(station);
                });

                Object.keys(lineGroups).forEach(line => {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = `SBST - ${line}`;
                    lineGroups[line].forEach(station => {
                        const option = document.createElement('option');
                        option.value = station.value;
                        option.textContent = station.name;
                        optgroup.appendChild(option);
                    });
                    dropdown.appendChild(optgroup);
                });
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
            
            document.getElementById('stationTitle').textContent = stationData.station;
            document.getElementById('stationSubtitle').textContent = `Last updated: ${new Date(stationData.scraped_at).toLocaleDateString('en-SG')}`;

            const directionsContainer = document.getElementById('directionsContainer');

            if (stationData.directions.length === 0) {
                directionsContainer.innerHTML = '<div class="no-data">No train timing data available for this station.</div>';
                return;
            }

            stationData.directions.forEach((direction) => {
                const card = createSmrtDirectionCard(direction);
                directionsContainer.appendChild(card);
            });
        }

        // Display SBS LRT data
        function displaySbsData(data) {
            const { line, station, sbsData } = data;

            document.getElementById('stationTitle').textContent = station.name;
            document.getElementById('stationSubtitle').textContent = `${line.service.split('(')[0].trim()} - Last updated: ${new Date(sbsData.scraped_at).toLocaleDateString('en-SG')}`;

            const directionsContainer = document.getElementById('directionsContainer');
            const card = createSbsStationCard(station);
            directionsContainer.appendChild(card);
        }

        // Create SMRT direction card
        function createSmrtDirectionCard(direction) {
            const card = document.createElement('div');
            card.className = 'direction-card';

            const header = document.createElement('div');
            header.className = 'direction-header';
            header.textContent = direction.description;
            card.appendChild(header);

            const dayKeys = ['monday_to_friday', 'saturday', 'sunday_public_holidays'];
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

        // Create SBS station card
        function createSbsStationCard(station) {
            const card = document.createElement('div');
            card.className = 'station-card';

            const header = document.createElement('div');
            header.className = 'station-name';
            header.textContent = station.name;
            card.appendChild(header);

            // Check which format this station uses
            const hasExpandedFormat = station.first_train_saturdays !== undefined;

            if (hasExpandedFormat) {
              // Format 2: Weekdays | Saturdays | Sundays for First, Weekdays | Weekends for Last
              
              // First Train - Weekdays
              const firstWeekday = document.createElement('div');
              firstWeekday.className = 'time-item';
              firstWeekday.innerHTML = `
                <span class="time-label">First (Weekdays)</span>
                <span class="time-display first">${convertTo24Hour(station.first_train_weekdays) || '--'}</span>
              `;
              card.appendChild(firstWeekday);

              // First Train - Saturdays
              const firstSat = document.createElement('div');
              firstSat.className = 'time-item';
              firstSat.innerHTML = `
                <span class="time-label">First (Saturdays)</span>
                <span class="time-display first">${convertTo24Hour(station.first_train_saturdays) || '--'}</span>
              `;
              card.appendChild(firstSat);

              // First Train - Sundays
              const firstSun = document.createElement('div');
              firstSun.className = 'time-item';
              firstSun.innerHTML = `
                <span class="time-label">First (Sundays/Holidays)</span>
                <span class="time-display first">${convertTo24Hour(station.first_train_sundays) || '--'}</span>
              `;
              card.appendChild(firstSun);

              // Last Train - Weekdays
              const lastWeekdays = document.createElement('div');
              lastWeekdays.className = 'time-item';
              lastWeekdays.innerHTML = `
                <span class="time-label">Last (Weekdays)</span>
                <span class="time-display last">${convertTo24Hour(station.last_train_weekdays, true) || '--'}</span>
              `;
              card.appendChild(lastWeekdays);

              // Last Train - Weekends/Holidays
              const lastWeekends = document.createElement('div');
              lastWeekends.className = 'time-item';
              lastWeekends.innerHTML = `
                <span class="time-label">Last (Weekends/Holidays)</span>
                <span class="time-display last">${convertTo24Hour(station.last_train_weekends, true) || '--'}</span>
              `;
              card.appendChild(lastWeekends);
            } else {
              // Format 1: Weekdays | Weekends for First, unified Last
              
              // First Train - Weekdays
              const firstWeekday = document.createElement('div');
              firstWeekday.className = 'time-item';
              firstWeekday.innerHTML = `
                <span class="time-label">First (Mon-Sat)</span>
                <span class="time-display first">${convertTo24Hour(station.first_train_weekdays) || '--'}</span>
              `;
              card.appendChild(firstWeekday);

              // First Train - Weekends
              const firstWeekend = document.createElement('div');
              firstWeekend.className = 'time-item';
              firstWeekend.innerHTML = `
                <span class="time-label">First (Sun/Holidays)</span>
                <span class="time-display first">${convertTo24Hour(station.first_train_weekends) || '--'}</span>
              `;
              card.appendChild(firstWeekend);

              // Last Train
              const last = document.createElement('div');
              last.className = 'time-item';
              last.innerHTML = `
                <span class="time-label">Last Train</span>
                <span class="time-display last">${convertTo24Hour(station.last_train, true) || '--'}</span>
              `;
              card.appendChild(last);
            }

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

            // Build all stations list
            buildAllStationsList();

            // Search input listener
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                clearButton.classList.toggle('visible', query.length > 0);

                if (query.length > 0) {
                    filterStations(query);
                    updateDropdownFromFiltered();
                    resultsCount.textContent = `Found ${filteredStations.length} station${filteredStations.length !== 1 ? 's' : ''}`;
                } else {
                    filteredStations = [];
                    populateDropdown();
                    resultsCount.textContent = '';
                }
            });

            // Clear button listener
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                clearButton.classList.remove('visible');
                filteredStations = [];
                populateDropdown();
                resultsCount.textContent = '';
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
            filteredStations = allStations.filter(station =>
                station.name.toLowerCase().includes(query)
            );
        }

        // Update dropdown to show only filtered stations
        function updateDropdownFromFiltered() {
            const dropdown = document.getElementById('stationDropdown');
            dropdown.innerHTML = '<option value="">Select from results...</option>';

            // Group by operator
            const smrtStations = filteredStations.filter(s => s.operator === 'smrt');
            const sbsStations = filteredStations.filter(s => s.operator === 'sbs');

            if (smrtStations.length > 0) {
                const smrtGroup = document.createElement('optgroup');
                smrtGroup.label = 'SMRT';
                smrtStations.forEach(station => {
                    const option = document.createElement('option');
                    option.value = station.value;
                    option.textContent = station.name;
                    smrtGroup.appendChild(option);
                });
                dropdown.appendChild(smrtGroup);
            }

            if (sbsStations.length > 0) {
                // Group SBS by line
                const lineGroups = {};
                sbsStations.forEach(station => {
                    if (!lineGroups[station.line]) {
                        lineGroups[station.line] = [];
                    }
                    lineGroups[station.line].push(station);
                });

                Object.keys(lineGroups).forEach(line => {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = `SBST - ${line}`;
                    lineGroups[line].forEach(station => {
                        const option = document.createElement('option');
                        option.value = station.value;
                        option.textContent = station.name;
                        optgroup.appendChild(option);
                    });
                    dropdown.appendChild(optgroup);
                });
            }
        }

        // Event listener for dropdown
        document.getElementById('stationDropdown').addEventListener('change', (e) => {
            displayStationData(e.target.value);
        });

        // Load data when page loads
        window.addEventListener('load', loadData);