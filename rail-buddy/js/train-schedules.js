document.addEventListener('DOMContentLoaded', function() {
  const API_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

  const TRAIN_SCHEDULES_CACHE_KEY = 'railbuddy_train_schedules_cache';
  const TRAIN_SCHEDULES_DATA_KEY = 'railbuddy_train_schedules_data';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  let allSchedules = [];
  let filteredSchedules = [];

  const loadingSpinner = document.getElementById('loadingSpinner');
  const schedulesList = document.getElementById('schedulesList');
  const noResults = document.getElementById('noResults');
  const trainSearch = document.getElementById('trainSearch');
  const clearSearch = document.getElementById('clearSearch');
  const refreshBtn = document.getElementById('refreshBtn');
  const resultsCount = document.getElementById('resultsCount');

  // Polling state
  let pollingInterval = 30000; // 30 seconds default
  let pollingTimer = null;
  let isPolling = false;
  let lastUpdateTime = null;

  // Parse train alerts into schedule format
  function parseTrainAlerts(alerts) {
    const schedules = [];
    
    if (!alerts || alerts.length === 0) return schedules;
    
    alerts.forEach((alert, index) => {
      // Extract line name from the alert
      const lineName = alert.LineName || 'Unknown Line';
      const lineId = alert.LineID || `LINE_${index}`;
      
      // Create schedule entries from messages
      if (alert.Message && Array.isArray(alert.Message)) {
        alert.Message.forEach((msg, msgIndex) => {
          schedules.push({
            tripId: `${lineId}_${msgIndex}`,
            routeId: lineId,
            lineName: lineName,
            message: msg.Content || 'No information',
            createdDate: msg.CreatedDate || new Date().toISOString(),
            status: alert.LineStatusID || 1,
            description: `${lineName} - ${msg.Content || 'Status update'}`
          });
        });
      } else {
        // Fallback if no messages
        schedules.push({
          tripId: lineId,
          routeId: lineId,
          lineName: lineName,
          message: 'No additional information',
          createdDate: alert.LastUpdatedDate || new Date().toISOString(),
          status: alert.LineStatusID || 1,
          description: lineName
        });
      }
    });
    
    return schedules;
  }

  // Parse GTFS Realtime trip updates
  function parseGTFSTrips(trips) {
    const schedules = [];
    
    if (!trips || trips.length === 0) return schedules;
    
    trips.forEach((trip, index) => {
      // Get route and trip info
      const tripId = trip.tripId || `TRIP_${index}`;
      const routeId = trip.routeId || 'Unknown';
      const delay = trip.delay || 0;
      const vehicleId = trip.vehicleId || 'N/A';
      const vehicleLabel = trip.vehicleLabel || null;
      
      // Determine status based on delay
      let status = 1; // On time
      if (delay !== 0 && delay !== null) {
        status = Math.abs(delay) > 300 ? 3 : 2; // > 5 min = major delay
      }
      
      // Process stop time updates
      if (trip.stopTimeUpdates && Array.isArray(trip.stopTimeUpdates)) {
        trip.stopTimeUpdates.forEach((stop, stopIndex) => {
          const arrivalTime = stop.arrival?.time 
            ? new Date(stop.arrival.time * 1000) 
            : null;
          const departureTime = stop.departure?.time 
            ? new Date(stop.departure.time * 1000) 
            : null;
          
          // Determine delay status per stop
          const arrivalDelay = stop.arrival?.delay || 0;
          const departureDelay = stop.departure?.delay || 0;
          const stopDelay = departureDelay || arrivalDelay || delay;
          const stopStatus = stopDelay === 0 ? 1 : (Math.abs(stopDelay) > 300 ? 3 : 2);
          
          schedules.push({
            tripId: tripId,
            routeId: routeId,
            stopSequence: stop.stopSequence,
            stopId: stop.stopId,
            arrivalTime: arrivalTime,
            departureTime: departureTime,
            arrivalDelay: arrivalDelay,
            departureDelay: departureDelay,
            status: stopStatus,
            vehicleId: vehicleId,
            vehicleLabel: vehicleLabel,
            description: `Route ${routeId} - Trip ${tripId} - Stop ${stop.stopSequence}`,
            delayText: stopDelay > 0 ? `+${stopDelay}s` : (stopDelay < 0 ? `${stopDelay}s` : 'On time')
          });
        });
      } else {
        // Fallback if no stops
        schedules.push({
          tripId: tripId,
          routeId: routeId,
          stopSequence: 0,
          stopId: 'N/A',
          arrivalTime: null,
          departureTime: null,
          arrivalDelay: 0,
          departureDelay: delay,
          status: status,
          vehicleId: vehicleId,
          vehicleLabel: vehicleLabel,
          description: `Route ${routeId} - Trip ${tripId}`,
          delayText: delay > 0 ? `+${delay}s` : (delay < 0 ? `${delay}s` : 'On time')
        });
      }
    });
    
    return schedules;
  }

  // Load train schedules from API
  async function loadTrainSchedules() {
    try {
      loadingSpinner.style.display = 'block';
      schedulesList.style.display = 'none';
      noResults.style.display = 'none';

      // Fetch train GTFS Realtime data (parsed)
      const response = await fetch(`${API_SERVER}/train-schedules`);
      if (!response.ok) {
        throw new Error(`Failed to fetch train schedules (${response.status})`);
      }

      const data = await response.json();
      
      // Check if parsing was successful
      if (data.success === false && data.note) {
        // Library not installed - show info message
        loadingSpinner.innerHTML = `
          <div style="padding: 2em; text-align: center;">
            <p><i class="fa-regular fa-info-circle"></i></p>
            <p><strong>${data.note}</strong></p>
            <p style="font-size: 0.9em; color: var(--text-secondary, #666);">
              The server has access to live train trip data, but needs an additional library to parse it.
            </p>
            <p style="font-size: 0.85em; margin-top: 1em; font-family: monospace; color: var(--text-secondary, #666);">
              Data size: ${(data.dataSize / 1024).toFixed(2)} KB
            </p>
          </div>
        `;
        return;
      }

      // Check if we got parsed trip data
      if (data.tripUpdates && Array.isArray(data.tripUpdates)) {
        // Full GTFS Realtime data is available
        allSchedules = parseGTFSTrips(data.tripUpdates);
        
        console.log(`Loaded ${allSchedules.length} train schedules from ${data.tripUpdates.length} trip updates`);
        console.log(`Data version: ${data.dataVersion}, Incrementality: ${data.incrementality}`);
        
        if (data.alerts && Array.isArray(data.alerts) && data.alerts.length > 0) {
          console.log(`${data.alerts.length} service alerts available`);
          // You could display alerts here if desired
        }
      } else if (data.error) {
        throw new Error(data.details || data.error);
      } else {
        console.warn('Unexpected response format:', data);
        allSchedules = [];
      }
      
      // Cache the data
      localStorage.setItem(TRAIN_SCHEDULES_CACHE_KEY, Date.now().toString());
      localStorage.setItem(TRAIN_SCHEDULES_DATA_KEY, JSON.stringify(allSchedules));

      filteredSchedules = [...allSchedules];
      displaySchedules();
      updateLastUpdateDisplay();
    } catch (error) {
      console.error('Error loading train schedules:', error);
      const errorMsg = error.message || 'Unknown error. Please try again.';
      const errorDisplay = errorMsg.includes('401') || errorMsg.includes('Authentication') 
        ? 'API authentication failed. Please contact the site administrator.'
        : errorMsg;
      
      loadingSpinner.innerHTML = `
        <p style="color: var(--error-color, #dc3545);">
          <i class="fa-regular fa-exclamation-circle"></i> 
          Error loading train schedules
        </p>
        <p style="font-size: 0.85em; color: var(--text-secondary, #666); margin-top: 0.5em;">
          ${errorDisplay}
        </p>
      `;
    }
  }

  // Display schedules in the UI
  function displaySchedules() {
    loadingSpinner.style.display = 'none';
    
    if (filteredSchedules.length === 0) {
      schedulesList.style.display = 'none';
      noResults.style.display = 'block';
      resultsCount.textContent = '';
      return;
    }

    schedulesList.innerHTML = '';
    resultsCount.textContent = `${filteredSchedules.length} result${filteredSchedules.length !== 1 ? 's' : ''}`;

    filteredSchedules.forEach(schedule => {
      const card = createScheduleCard(schedule);
      schedulesList.appendChild(card);
    });

    schedulesList.style.display = 'block';
    noResults.style.display = 'none';
    
    // Show last update time if available
    if (allSchedules.length > 0 && allSchedules[0].timestamp) {
      const lastUpdate = new Date(allSchedules[0].timestamp * 1000 || Date.now());
      console.log(`Data last updated: ${lastUpdate.toLocaleTimeString('en-SG')}`);
    }
  }

  // Create a schedule card
  function createScheduleCard(schedule) {
    const card = document.createElement('div');
    card.className = 'schedule-card';
    card.style.cssText = `
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      background: var(--card-bg, #ffffff);
      transition: box-shadow 0.3s ease;
    `;

    const statusColors = {
      1: '#4CAF50', // On-time - Green
      2: '#FF9800', // Delayed (<5min) - Orange
      3: '#f44336'  // Heavily Delayed (>5min) - Red
    };

    const statusText = {
      1: 'On Time',
      2: 'Minor Delay',
      3: 'Major Delay'
    };

    const statusColor = statusColors[schedule.status] || '#999999';
    const statusLabel = statusText[schedule.status] || 'Unknown';

    // Format times if available
    const arrivalStr = schedule.arrivalTime 
      ? schedule.arrivalTime.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })
      : 'N/A';
    
    const departureStr = schedule.departureTime 
      ? schedule.departureTime.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })
      : 'N/A';

    const delayText = schedule.delayText || 'N/A';
    const vehicleInfo = schedule.vehicleLabel 
      ? `${schedule.vehicleLabel}` 
      : (schedule.vehicleId !== 'N/A' ? `Vehicle ${schedule.vehicleId}` : 'Vehicle info unavailable');

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-weight: bold; font-size: 1.1em; color: ${statusColor};">
              <i class="fa-solid fa-train"></i> Route ${schedule.routeId}
            </span>
            <span style="font-size: 0.75em; background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px;">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size: 0.85em; color: var(--text-secondary, #666666); margin-bottom: 4px; font-family: monospace;">
            Trip: ${schedule.tripId}
          </div>
          <div style="font-size: 0.8em; color: var(--text-secondary, #999999); margin-bottom: 8px;">
            🚉 Stop #${schedule.stopSequence} (${schedule.stopId})
          </div>
          <div style="font-size: 0.8em; color: var(--text-secondary, #999999); margin-bottom: 8px;">
            🚆 ${vehicleInfo}
          </div>
          <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 0.8em; color: var(--text-secondary, #999999);">Arrival</div>
              <div style="font-weight: bold; font-size: 1em;">${arrivalStr}</div>
            </div>
            <div>
              <div style="font-size: 0.8em; color: var(--text-secondary, #999999);">Departure</div>
              <div style="font-weight: bold; font-size: 1em;">${departureStr}</div>
            </div>
            <div>
              <div style="font-size: 0.8em; color: var(--text-secondary, #999999);">Delay</div>
              <div style="font-weight: bold; font-size: 1em; color: ${statusColor};">${delayText}</div>
            </div>
          </div>
        </div>
        <div style="padding-left: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: ${statusColor}20; display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-train" style="font-size: 1.5em; color: ${statusColor};"></i>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('mouseenter', () => {
      card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.boxShadow = 'none';
    });

    return card;
  }

  // Search functionality
  function filterSchedules(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      filteredSchedules = [...allSchedules];
    } else {
      filteredSchedules = allSchedules.filter(schedule => {
        const tripId = (schedule.tripId || '').toLowerCase();
        const routeId = (schedule.routeId || '').toLowerCase();
        const stopId = (schedule.stopId || '').toLowerCase();
        const description = (schedule.description || '').toLowerCase();
        
        return tripId.includes(term) || routeId.includes(term) || 
               stopId.includes(term) || description.includes(term);
      });
    }
    
    displaySchedules();
  }

  // Polling functions
  function startPolling() {
    if (isPolling) return; // Already polling
    
    isPolling = true;
    updateRefreshButtonState();
    console.log(`[Polling] Started with interval: ${pollingInterval}ms`);
    
    // Poll immediately, then set up interval
    loadTrainSchedules();
    pollingTimer = setInterval(loadTrainSchedules, pollingInterval);
  }

  function stopPolling() {
    if (!isPolling) return; // Not polling
    
    isPolling = false;
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    updateRefreshButtonState();
    console.log('[Polling] Stopped');
  }

  function setPollingInterval(intervalMs) {
    pollingInterval = intervalMs;
    console.log(`[Polling] Interval set to ${intervalMs}ms`);
    
    // Restart polling with new interval if currently active
    if (isPolling) {
      stopPolling();
      startPolling();
    }
  }

  function updateRefreshButtonState() {
    if (refreshBtn) {
      if (isPolling) {
        refreshBtn.classList.add('polling');
        refreshBtn.setAttribute('aria-label', `Stop polling (${pollingInterval / 1000}s)`);
        refreshBtn.title = `Auto-refresh every ${pollingInterval / 1000}s\n\nClick to stop`;
      } else {
        refreshBtn.classList.remove('polling');
        refreshBtn.setAttribute('aria-label', 'Refresh now');
        refreshBtn.title = 'Click to refresh or start auto-polling';
      }
    }
  }

  function updateLastUpdateDisplay() {
    lastUpdateTime = new Date();
    const timeStr = lastUpdateTime.toLocaleTimeString('en-SG', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
    
    // Update any last update time display if it exists
    const lastUpdateElement = document.getElementById('lastUpdateTime');
    if (lastUpdateElement) {
      lastUpdateElement.textContent = `Last update: ${timeStr}`;
    }
    
    console.log(`[Data] Updated at ${timeStr}`);
  }

  // Event listeners
  trainSearch.addEventListener('input', (e) => {
    filterSchedules(e.target.value);
  });

  clearSearch.addEventListener('click', () => {
    trainSearch.value = '';
    filterSchedules('');
    trainSearch.focus();
  });

  refreshBtn.addEventListener('click', () => {
    if (isPolling) {
      stopPolling();
    } else {
      // Single refresh on first click, then start polling on second
      loadTrainSchedules();
      
      // Optional: Double-click to start auto-polling
      // Can implement double-click detection if desired
    }
  });

  // Polling interval selector
  const pollingSelect = document.getElementById('pollingSelect');
  if (pollingSelect) {
    pollingSelect.addEventListener('change', (e) => {
      const intervalMs = parseInt(e.target.value);
      
      if (intervalMs === 0) {
        // Stop polling
        stopPolling();
      } else {
        // Set new interval and start polling
        setPollingInterval(intervalMs);
        if (!isPolling) {
          startPolling();
        }
      }
    });
  }

  // Keyboard shortcut: Ctrl+R or Cmd+R to toggle polling
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      if (isPolling) {
        stopPolling();
      } else {
        startPolling();
      }
    }
  });

  // Initial load
  loadTrainSchedules();
  updateRefreshButtonState();
});
