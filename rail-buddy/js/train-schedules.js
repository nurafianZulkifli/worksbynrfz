document.addEventListener('DOMContentLoaded', function() {
  const API_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

  const TRAIN_SCHEDULES_CACHE_KEY = 'railbuddy_train_schedules_cache';
  const TRAIN_SCHEDULES_DATA_KEY = 'railbuddy_train_schedules_data';
  const SELECTED_STATION_KEY = 'railbuddy_selected_station';
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

  // Station view elements
  const stationDropdown = document.getElementById('stationDropdown');
  const stationSearch = document.getElementById('stationSearch');
  const clearStationSearch = document.getElementById('clearStationSearch');
  const stationPanel = document.getElementById('stationPanel');
  const stationTitle = document.getElementById('stationTitle');
  const stationSubtitle = document.getElementById('stationSubtitle');
  const stationLiveStatus = document.getElementById('stationLiveStatus');
  const stationDirections = document.getElementById('stationDirections');
  const backToAllBtn = document.getElementById('backToAllBtn');
  const allUpdatesHeader = document.getElementById('allUpdatesHeader');
  const contentSection = document.getElementById('contentSection');

  // Polling state
  let pollingInterval = 30000; // 30 seconds default
  let pollingTimer = null;
  let etaUpdateTimer = null;
  let isPolling = false;
  let lastUpdateTime = null;

  // True when LTA feed decoded fine but has no reportable delays/cancellations
  let allTrainsOnSchedule = false;

  // Curated headway table (see json/headways.json) — LTA provides no live
  // "next train" prediction, so this is an estimate, not real-time data.
  let headwayData = null;

  async function loadHeadwayData() {
    if (headwayData) return headwayData;
    try {
      const res = await fetch('./json/headways.json');
      headwayData = await res.json();
    } catch (err) {
      console.warn('[Headway] Could not load headway estimates:', err.message);
      headwayData = null;
    }
    return headwayData;
  }

  // Determine which named period (peak/off-peak/night/early morning) applies now
  function getCurrentHeadwayPeriod(periods) {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = day === 0 || day === 6;
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    const toMinutes = (hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };

    if (!isWeekend) {
      const am = periods.weekdayPeakAM, pm = periods.weekdayPeakPM;
      if (minutesNow >= toMinutes(am.start) && minutesNow <= toMinutes(am.end)) return 'peak';
      if (minutesNow >= toMinutes(pm.start) && minutesNow <= toMinutes(pm.end)) return 'peak';
    }
    if (minutesNow >= toMinutes(periods.night.start) || minutesNow <= toMinutes(periods.earlyMorning.end)) {
      return 'night';
    }
    return 'offPeak';
  }

  // Build the estimated frequency table shown when no live delay data exists.
  // Pass lineCodesFilter (e.g. ['NSL','EWL']) to restrict to specific lines.
  function renderHeadwayEstimates(lineCodesFilter) {
    if (!headwayData) return '';

    const period = getCurrentHeadwayPeriod(headwayData.periods);
    const periodLabel = { peak: 'Peak Hours', offPeak: 'Off-Peak', night: 'Late Night' }[period];
    const keyMap = { peak: 'peak', offPeak: 'offPeak', night: 'night' };

    const entries = Object.entries(headwayData.lines)
      .filter(([code]) => !lineCodesFilter || lineCodesFilter.includes(code));

    const rows = entries.map(([code, line]) => {
      const mins = line[keyMap[period]];
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border-color, #eee);">
          <span style="font-weight: 600;">${line.name}</span>
          <span style="color: var(--text-secondary, #666); font-size: 0.9em;">~${mins} min</span>
        </div>
      `;
    }).join('');

    return `
      <div style="margin-top: 1.5em; text-align: left; max-width: 420px; margin-left: auto; margin-right: auto; border: 1px solid var(--border-color, #e0e0e0); border-radius: 8px; overflow: hidden;">
        <div style="padding: 10px 12px; background: var(--card-bg-alt, #f5f5f5); font-weight: 700; font-size: 0.85em; display: flex; justify-content: space-between;">
          <span>Period:</span>
          <span>${periodLabel}</span>
        </div>
        ${rows}
        <div style="padding: 8px 12px; font-size: 0.75em; color: var(--text-secondary, #999);">
          ~ Timings provided are estimates and may vary.
        </div>
      </div>
    `;
  }

  // ── Station View (first/last train timings + live status per station) ──
  let smrtFtLtData = [];
  let sbsFtLtData = [];
  let smrtStationCodes = {};
  let stationIndex = []; // [{ name, code, source, directions }]
  let filteredStationIndex = [];
  let selectedStation = null;

  // Map a station code prefix (e.g. "NS", "EW") to a headway line key
  const LINE_PREFIX_MAP = {
    NS: 'NSL', EW: 'EWL', CG: 'EWL', CC: 'CCL', CE: 'CCL',
    DT: 'DTL', TE: 'TEL', NE: 'NEL', BP: 'BP', SE: 'SK', SW: 'SK', PE: 'PG', PW: 'PG'
  };

  // Official line colours, keyed the same way as LINE_PREFIX_MAP's values — used for the station-code caplets
  const LINE_COLORS = {
    NSL: '#c41e3a', EWL: '#009645', CCL: '#fa9e0d', DTL: '#005ec8',
    TEL: '#926437', NEL: '#9d27b5', BP: '#708472', SK: '#708472', PG: '#708472'
  };

  function extractLinePrefixes(codeString) {
    if (!codeString) return [];
    // e.g. "NS1/EW24" or "DT1 Bukit Panjang" -> ["NS", "EW"] / ["DT"]
    const matches = codeString.match(/[A-Za-z]{2}/g) || [];
    const prefixes = matches.map(p => p.toUpperCase());
    return [...new Set(prefixes)]
      .map(p => LINE_PREFIX_MAP[p])
      .filter(Boolean);
  }

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
  // and re-renders them as caplets, e.g. "To [NS1][EW24] Jurong East"
  function formatDirectionDescription(description) {
    // Circle Line loop directions have no station codes — use the CCL line caplet instead
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

  async function loadStationData() {
    if (stationIndex.length > 0) return stationIndex;
    try {
      const [smrtRes, sbsRes, codesRes] = await Promise.all([
        fetch('json/smrt-ft-lt.json'),
        fetch('json/sbs-transit-ft-lt.json'),
        fetch('json/smrt-station-codes.json')
      ]);

      if (!smrtRes.ok || !sbsRes.ok) {
        throw new Error(`HTTP Error: SMRT ${smrtRes.status}, SBS ${sbsRes.status}`);
      }

      smrtFtLtData = await smrtRes.json();
      sbsFtLtData = await sbsRes.json();
      if (codesRes.ok) smrtStationCodes = await codesRes.json();

      stationIndex = [];

      smrtFtLtData.forEach((s, i) => {
        const code = smrtStationCodes[s.station] || '';
        // "To CG2 Changi Airport" only applies from Tanah Merah (EW4); the SMRT site
        // erroneously repeats this section on other EWL station pages.
        const directions = s.station === 'Tanah Merah'
          ? s.directions
          : s.directions.filter(d => !/changi airport/i.test(d.description));
        stationIndex.push({
          name: s.station,
          code,
          source: 'smrt',
          value: `smrt-${i}`,
          directions,
          lineKeys: extractLinePrefixes(code)
        });
      });

      sbsFtLtData.forEach((s, i) => {
        // SBS station strings look like "DT1 Bukit Panjang", "DT 1 Bukit Panjang" or "East Loop"
        const codeMatch = s.station.match(/^([A-Za-z]{2})\s*(\d+)\s+(.+)$/);
        const code = codeMatch ? `${codeMatch[1]}${codeMatch[2]}` : '';
        const displayName = codeMatch ? codeMatch[3] : s.station;
        stationIndex.push({
          name: displayName,
          code,
          source: 'sbs',
          value: `sbs-${i}`,
          directions: s.directions,
          lineKeys: extractLinePrefixes(code || s.station)
        });
      });

      filteredStationIndex = [...stationIndex];
      populateStationDropdown();
    } catch (err) {
      console.error('[StationView] Error loading station data:', err.message);
      if (stationDropdown) {
        stationDropdown.innerHTML = '<option value="">Error loading stations</option>';
      }
    }
    return stationIndex;
  }

  function populateStationDropdown() {
    if (!stationDropdown) return;
    stationDropdown.innerHTML = '<option value="">Select a station...</option>';

    const smrtGroup = document.createElement('optgroup');
    smrtGroup.label = 'SMRT';
    const sbsGroup = document.createElement('optgroup');
    sbsGroup.label = 'SBS Transit';

    filteredStationIndex.forEach(station => {
      const option = document.createElement('option');
      option.value = station.value;
      option.textContent = station.code ? `${station.code} ${station.name}` : station.name;
      (station.source === 'smrt' ? smrtGroup : sbsGroup).appendChild(option);
    });

    if (smrtGroup.children.length) stationDropdown.appendChild(smrtGroup);
    if (sbsGroup.children.length) stationDropdown.appendChild(sbsGroup);
  }

  function filterStations(term) {
    const q = term.toLowerCase().trim();
    filteredStationIndex = !q ? [...stationIndex] : stationIndex.filter(s =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
    populateStationDropdown();
  }

  // Find any live tripUpdate entries relevant to this station's lines
  function getLiveStatusForStation(station) {
    if (!allSchedules || allSchedules.length === 0) return [];
    return allSchedules.filter(sched => {
      const routeMatch = station.lineKeys.some(lk =>
        (sched.routeId || '').toUpperCase().includes(lk.replace('L', ''))
      );
      const textMatch = (sched.description || '').toLowerCase().includes(station.name.toLowerCase());
      return routeMatch || textMatch;
    });
  }

  const DAY_LABELS = {
    monday_to_friday: 'Mon - Fri',
    saturday: 'Saturday',
    sunday_public_holidays: 'Sun / Holidays',
    eve_of_public_holidays: 'Eve of Holidays'
  };

  // Map JS Date.getDay() to the matching first/last-train day key
  function getTodayDayKey() {
    const day = new Date().getDay(); // 0 = Sun ... 6 = Sat
    if (day === 0) return 'sunday_public_holidays';
    if (day === 6) return 'saturday';
    return 'monday_to_friday';
  }

  function parseHHMMToMinutes(hhmm) {
    if (!hhmm || hhmm === '--') return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  // Calculate "Arriving in X mins" label based on estimated arrival time (HH:MM format)
  // and current time. Handles midnight wraparound.
  // Examples: "Arriving in 3 mins", "Arriving in 1 min", "Arriving now"
  function calculateArrivingLabel(arrivalTimeHHMM) {
    if (!arrivalTimeHHMM || !arrivalTimeHHMM.includes(':')) {
      return 'No ETA';
    }

    try {
      const now = new Date();
      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      
      const [arrivalHour, arrivalMinute] = arrivalTimeHHMM.split(':').map(Number);
      if (Number.isNaN(arrivalHour) || Number.isNaN(arrivalMinute)) {
        return 'No ETA';
      }

      const arrivalSeconds = arrivalHour * 3600 + arrivalMinute * 60;
      let secondsUntil = arrivalSeconds - nowSeconds;

      // Handle midnight wraparound: only wrap if significantly negative (more than 12 hours)
      // This avoids wrapping when the train time is just in the past (same day)
      if (secondsUntil < -43200) { // -12 hours = -43200 seconds
        secondsUntil += 24 * 3600;
      }

      // Train has reached the platform — updateETALabels() drops it and jumps to the
      // next upcoming train on the very next tick, so this is only ever shown momentarily.
      if (secondsUntil <= 0) {
        return 'Arriving now';
      }
      // Train is upcoming — always round up to at least 1 min (never shows "Arriving now" early)
      const roundedMinutes = Math.max(1, Math.ceil(secondsUntil / 60));
      const minLabel = roundedMinutes === 1 ? 'min' : 'mins';
      return `Arriving in ${roundedMinutes} ${minLabel}`;
    } catch (e) {
      console.warn('[ETA] Failed to parse arrival time:', arrivalTimeHHMM, e);
      return 'No ETA';
    }
  }

  // Compare "now" against a direction's first/last train times for today,
  // and estimate the next train using the line's headway table.
  function computeNextTrainEstimate(direction, lineKeys) {
    const dayKey = getTodayDayKey();
    const firstMin = parseHHMMToMinutes(direction.first_train?.[dayKey]);
    let lastMin = parseHHMMToMinutes(direction.last_train?.[dayKey]);

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    if (firstMin === null && lastMin === null) {
      return { status: 'unknown', label: 'No schedule data for today' };
    }

    // Last train times past midnight (e.g. 00:50) belong to the next day
    if (lastMin !== null && firstMin !== null && lastMin < firstMin) {
      lastMin += 24 * 60;
    }

    const nowAdjusted = nowMin < firstMin ? nowMin + 24 * 60 : nowMin;
    const isRunning = firstMin !== null && lastMin !== null
      ? nowAdjusted >= firstMin && nowAdjusted <= lastMin
      : true;

    if (firstMin !== null && nowMin < firstMin && !isRunning) {
      return { status: 'before', label: `First train at ${direction.first_train[dayKey]}` };
    }
    if (lastMin !== null && !isRunning) {
      return { status: 'after', label: `Service ended — last train at ${direction.last_train[dayKey]}` };
    }

    // Running now — estimate next train using the headway table
    if (headwayData && lineKeys && lineKeys.length > 0) {
      const period = getCurrentHeadwayPeriod(headwayData.periods);
      const keyMap = { peak: 'peak', offPeak: 'offPeak', night: 'night' };
      const line = headwayData.lines[lineKeys[0]];
      if (line) {
        const headwayMin = line[keyMap[period]];
        const etaMin = nowMin + headwayMin - (nowMin % Math.round(headwayMin));
        const minutesUntilTrain = Math.round(etaMin - nowMin);
        return { status: 'running', label: `Arriving in: ${minutesUntilTrain} mins`, etaMinutes: headwayMin };
      }
    }

    return { status: 'running', label: 'Running now' };
  }

  function renderStationDirectionCard(direction, lineKeys) {
    const estimate = computeNextTrainEstimate(direction, lineKeys);
    const chipColor = { running: '#4CAF50', before: '#FF9800', after: '#999999', unknown: '#999999' }[estimate.status];
    
    // For "running" status, show next 3-4 trains as time cards
    let upcomingTrains = []; // Initialize before the if block
    let upcomingTrainsHtml = '';
    let nextTrainLabel = estimate.label; // Default to computed estimate
    
    if (estimate.status === 'running' && headwayData && lineKeys && lineKeys.length > 0) {
      const period = getCurrentHeadwayPeriod(headwayData.periods);
      const keyMap = { peak: 'peak', offPeak: 'offPeak', night: 'night' };
      const line = headwayData.lines[lineKeys[0]];
      if (line) {
        const headwayMin = line[keyMap[period]];
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        
        // Get first/last train times for filtering
        const dayKey = getTodayDayKey();
        const firstTrainStr = direction.first_train?.[dayKey];
        const lastTrainStr = direction.last_train?.[dayKey];
        const firstTrainMin = firstTrainStr && firstTrainStr !== '--' ? parseHHMMToMinutes(firstTrainStr) : null;
        const lastTrainMin = lastTrainStr && lastTrainStr !== '--' ? parseHHMMToMinutes(lastTrainStr) : null;
        
        // Compute next 3-4 trains
        const upcomingTrainSet = new Set();
        
        // First, check if a train is due right now (within 2 minutes before to 1 minute after the headway interval boundary)
        const intervalBoundary = (Math.floor(nowMin / headwayMin)) * headwayMin;
        const timeSinceBoundary = nowMin - intervalBoundary;
        
        // If we're close to a train interval (within the grace period), include it
        let startIndex = 0;
        if (timeSinceBoundary >= -2 && timeSinceBoundary <= 1) {
          // Include the train at the current interval boundary
          startIndex = 0;
        } else if (timeSinceBoundary < -2) {
          // Train is coming soon
          startIndex = 0;
        } else {
          // Move to next interval
          startIndex = 1;
        }
        
        for (let i = startIndex; i < startIndex + 4; i++) {
          let etaMin = intervalBoundary + i * headwayMin;
          
          // Ensure we don't go backwards
          if (etaMin <= nowMin) {
            etaMin += headwayMin;
          }
          
          // Handle day wraparound
          let etaHour = Math.floor(etaMin / 60);
          let etaMinute = etaMin % 60;
          let isNextDay = false;
          
          if (etaHour >= 24) {
            etaHour = etaHour % 24;
            isNextDay = true;
          }
          
          const etaStr = `${String(etaHour).padStart(2, '0')}:${String(Math.round(etaMinute)).padStart(2, '0')}`;
          const etaMinForComparison = etaHour * 60 + etaMinute;
          
          // Filter: only show if within operating hours
          let isWithinHours = true;
          
          if (isNextDay) {
            // Train is after midnight - check against first train only (next day's start)
            if (firstTrainMin !== null && etaMinForComparison < firstTrainMin) isWithinHours = false;
          } else {
            // Train is today - check first train (if after service ends, it won't show)
            if (firstTrainMin !== null && etaMinForComparison < firstTrainMin) isWithinHours = false;
            
            // Check against last train - but if last train is early morning (< 5:00), it's tomorrow's
            if (lastTrainMin !== null) {
              if (lastTrainMin < 300) {  // 5:00 AM = 300 minutes - early morning time is next day
                // Last train is tomorrow, so today's trains up to 23:59 are OK
                isWithinHours = true;
              } else {
                // Last train is today, check if this train time is before it
                if (etaMinForComparison > lastTrainMin) isWithinHours = false;
              }
            }
          }
          
          if (isWithinHours) {
            upcomingTrainSet.add(etaStr);
          }
        }
        
        upcomingTrains = Array.from(upcomingTrainSet);
        
        // Debug logging
        if (upcomingTrains.length === 0) {
          console.warn(`[Train Calc] No trains found for ${direction.description}. headway=${headwayMin}min, now=${nowMin}min, boundary=${intervalBoundary}, interval=${headwayMin}`);
        } else {
          console.log(`[Train Calc] Trains ${direction.description}: ${upcomingTrains.join(', ')} (headway=${headwayMin}, now=${nowMin})`);
        }
        
        // Calculate "Arriving in" based on first upcoming train
        if (upcomingTrains.length > 0) {
          const firstTrain = upcomingTrains[0];
          nextTrainLabel = calculateArrivingLabel(firstTrain);
        }
        
        upcomingTrainsHtml = `<div class="upcoming-trains-list" style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">${upcomingTrains.map(time => `<div class="train-time-chip" data-time="${time}">${time}</div>`).join('')}</div>`;
      }
    }

    const nextTrainChip = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 0.8em; color: var(--text-secondary, #999);">Estimated arrival</span>
        <span class="eta-label" data-train-time="${upcomingTrains.length > 0 ? upcomingTrains[0] : ''}" style="font-size: 0.85em; font-weight: 700; color: ${chipColor}; background: ${chipColor}20; padding: 3px 10px; border-radius: 12px;">
          ${nextTrainLabel}
        </span>
      </div>
      ${upcomingTrainsHtml}
    `;

    return `
      <div class="direction-card" data-upcoming-trains='${JSON.stringify(upcomingTrains)}'">
        <div style="font-weight: 700; margin-bottom: 8px;"><i class="fa-kit fa-lta-to-right"></i> ${formatDirectionDescription(direction.description)}</div>
        ${nextTrainChip}
      </div>
    `;
  }

  // North South Line schedule data includes short-turn/variant destinations (e.g. NS19, NS16, NS7) —
  // only the two full-line termini render as primary direction cards, the rest as "Service Variants".
  const NS_MAIN_TERMINI = new Set(['To NS1 EW24 Jurong East', 'To NS28 Marina South Pier']);
  function isNSVariant(description) {
    return /^To NS\d+/.test(description) && !NS_MAIN_TERMINI.has(description);
  }

  function renderServiceVariantsCard(variants) {
    if (!variants || variants.length === 0) return '';
    const rows = variants.map(d => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-color, #eee);">
        <span>${formatDirectionDescription(d.description)}</span>
      </div>
    `).join('');
    return `
      <div style="border: 1px dashed var(--border-color, #e0e0e0); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; background: var(--card-bg-alt, #f9f9f9);">
        <div style="font-weight: 700; margin-bottom: 4px; font-size: 0.9em; color: var(--text-secondary, #666);"><i class="fa-solid fa-code-branch"></i> Service Variants</div>
        <div style="font-size: 0.75em; color: var(--text-secondary, #999); margin-bottom: 8px;">
          Short trips that only run during specific periods (e.g. late nights) — Refer to station display.
        </div>
        ${rows}
      </div>
    `;
  }

  function renderStationPanel(station) {
    const titleCodes = (station.code || '').split(/[\/\s]+/).filter(c => /^[A-Za-z]{2}\d+$/.test(c));
    stationTitle.innerHTML = titleCodes.length > 0
      ? `${renderCodeCaplet(titleCodes)} ${station.name}`
      : station.name;
    stationSubtitle.innerHTML = station.source === 'smrt'
      ? '<img src="assets/stl.png" alt="SMRT" class="operator-logo">'
      : '<img src="assets/sbstl.png" alt="SBS Transit" class="operator-logo">';

    // Live status: real delay/cancellation data takes priority over the estimate
    const liveMatches = getLiveStatusForStation(station);
    if (liveMatches.length > 0) {
      stationLiveStatus.innerHTML = `
        <div style="margin-bottom: 1em;">
          ${liveMatches.map(m => createScheduleCard(m).outerHTML).join('')}
        </div>
      `;
    } else {
      stationLiveStatus.innerHTML = `
        <div class="alert alert-success" role="alert">
          <i class="fa-solid fa-circle-check"></i> <strong>No reported delays</strong>
        </div>
        ${renderHeadwayEstimates(station.lineKeys)}
      `;
    }

    const mainDirections = station.directions.filter(d => !isNSVariant(d.description));
    const variantDirections = station.directions.filter(d => isNSVariant(d.description));

    stationDirections.innerHTML = station.directions.length > 0
      ? mainDirections.map(d => renderStationDirectionCard(d, station.lineKeys)).join('') + renderServiceVariantsCard(variantDirections)
      : '<p style="color: var(--text-secondary, #666);">No timing data available.</p>';
    
    // Update ETA labels immediately after rendering
    updateETALabels();
  }

  function showStationPanel() {
    stationPanel.style.display = 'block';
    allUpdatesHeader.style.display = 'none';
    contentSection.style.display = 'none';
  }

  function hideStationPanel() {
    stationPanel.style.display = 'none';
    // No station selected — nothing to show, so keep the generic all-schedules panel hidden too
    allUpdatesHeader.style.display = 'none';
    contentSection.style.display = 'none';
    selectedStation = null;
    stationDropdown.value = '';
    localStorage.removeItem(SELECTED_STATION_KEY);
  }

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
        // LTA only emits entities for delays/cancellations — empty means everything is on schedule
        allTrainsOnSchedule = data.tripUpdates.length === 0;
        
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
        allTrainsOnSchedule = false;
      }
      
      // Cache the data
      localStorage.setItem(TRAIN_SCHEDULES_CACHE_KEY, Date.now().toString());
      localStorage.setItem(TRAIN_SCHEDULES_DATA_KEY, JSON.stringify(allSchedules));

      filteredSchedules = [...allSchedules];
      displaySchedules();
      
      // If a station is currently selected, refresh its panel with new data
      if (selectedStation) {
        renderStationPanel(selectedStation);
      }
      
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

      const searchActive = trainSearch && trainSearch.value.trim().length > 0;
      noResults.innerHTML = (allTrainsOnSchedule && !searchActive)
        ? `
          <p><i class="fa-solid fa-circle-check" style="color: #4CAF50;"></i></p>
          <p><strong>All trains running on schedule</strong></p>
          <p style="font-size: 0.85em; color: var(--text-secondary, #666);">
            LTA only reports trips with delays or cancellations — no irregularities right now.
          </p>
          ${renderHeadwayEstimates()}
        `
        : `<p><i class="fa-regular fa-inbox"></i> No train schedules found</p>`;
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

  // Create a schedule card as a Bootstrap alert — variant mirrors the severity
  // colours rail-buddy/index.html's tsa.js uses (major=danger, minor=warning, on-time=success).
  function createScheduleCard(schedule) {
    const statusVariants = {
      1: 'success', // On-time
      2: 'warning', // Delayed (<5min)
      3: 'danger'   // Heavily Delayed (>5min)
    };

    const statusText = {
      1: 'On Time',
      2: 'Minor Delay',
      3: 'Major Delay'
    };

    const variant = statusVariants[schedule.status] || 'secondary';
    const statusLabel = statusText[schedule.status] || 'Unknown';

    const card = document.createElement('div');
    card.className = `alert alert-${variant}`;
    card.setAttribute('role', 'alert');

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
            <span style="font-weight: bold; font-size: 1.1em;">
              <i class="fa-kit fa-lta-to-right"></i> Route ${schedule.routeId}
            </span>
            <span class="badge bg-${variant}">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size: 0.85em; margin-bottom: 4px; font-family: monospace;">
            Trip: ${schedule.tripId}
          </div>
          <div style="font-size: 0.8em; margin-bottom: 8px;">
            🚉 Stop #${schedule.stopSequence} (${schedule.stopId})
          </div>
          <div style="font-size: 0.8em; margin-bottom: 8px;">
            🚆 ${vehicleInfo}
          </div>
          <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 0.8em;">Arrival</div>
              <div style="font-weight: bold; font-size: 1em;">${arrivalStr}</div>
            </div>
            <div>
              <div style="font-size: 0.8em;">Departure</div>
              <div style="font-weight: bold; font-size: 1em;">${departureStr}</div>
            </div>
            <div>
              <div style="font-size: 0.8em;">Delay</div>
              <div style="font-weight: bold; font-size: 1em;">${delayText}</div>
            </div>
          </div>
        </div>
        <div style="padding-left: 12px;">
          <i class="fa-kit fa-lta-to-right" style="font-size: 1.5em;"></i>
        </div>
      </div>
    `;

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

  // A train time is considered passed — and safe to drop — the instant it reaches
  // 0 seconds, so the ETA label jumps straight to the next upcoming train.
  function hasTrainTimePassed(trainTimeHHMM) {
    const now = new Date();
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const [h, m] = trainTimeHHMM.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    let secondsUntil = (h * 3600 + m * 60) - nowSeconds;
    if (secondsUntil < -43200) secondsUntil += 24 * 3600; // midnight wraparound
    return secondsUntil <= 0;
  }

  // Real-time ETA updater - runs every second. Removes train times that have
  // passed (and been in "Arrived" state for a minute) and advances the ETA
  // label to the next remaining upcoming train.
  function updateETALabels() {
    const cards = document.querySelectorAll('.direction-card');
    if (cards.length === 0) {
      console.log('[ETA Update] No direction-card elements found');
      return;
    }

    cards.forEach(card => {
      const etaLabel = card.querySelector('.eta-label');
      let upcomingTrains = [];
      try {
        upcomingTrains = JSON.parse(card.getAttribute('data-upcoming-trains') || '[]');
      } catch (e) {
        upcomingTrains = [];
      }

      // Drop any times that have passed, removing their chip from the DOM too
      const remaining = upcomingTrains.filter(time => !hasTrainTimePassed(time));
      if (remaining.length !== upcomingTrains.length) {
        const removed = upcomingTrains.filter(time => !remaining.includes(time));
        removed.forEach(time => {
          const chip = card.querySelector(`.train-time-chip[data-time="${time}"]`);
          if (chip) chip.remove();
        });
        card.setAttribute('data-upcoming-trains', JSON.stringify(remaining));
      }

      if (etaLabel) {
        const nextTime = remaining.length > 0 ? remaining[0] : '';
        if (etaLabel.getAttribute('data-train-time') !== nextTime) {
          etaLabel.setAttribute('data-train-time', nextTime);
        }
        etaLabel.textContent = nextTime ? calculateArrivingLabel(nextTime) : 'No ETA';
      }
    });
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
    
    // Start ETA updater (updates every second)
    if (!etaUpdateTimer) {
      updateETALabels(); // Update immediately
      etaUpdateTimer = setInterval(updateETALabels, 1000);
    }
  }

  function stopPolling() {
    if (!isPolling) return; // Not polling
    
    isPolling = false;
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    
    // Stop ETA updater
    if (etaUpdateTimer) {
      clearInterval(etaUpdateTimer);
      etaUpdateTimer = null;
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
  if (trainSearch) {
    trainSearch.addEventListener('input', (e) => {
      filterSchedules(e.target.value);
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      trainSearch.value = '';
      filterSchedules('');
      trainSearch.focus();
    });
  }

  if (refreshBtn) {
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
  }

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

  // Station view event listeners
  if (stationDropdown) {
    stationDropdown.addEventListener('change', (e) => {
      const value = e.target.value;
      if (!value) {
        hideStationPanel();
        return;
      }
      selectedStation = stationIndex.find(s => s.value === value);
      if (selectedStation) {
        localStorage.setItem(SELECTED_STATION_KEY, value);
        renderStationPanel(selectedStation);
        showStationPanel();
      }
    });
  }

  if (stationSearch) {
    stationSearch.addEventListener('input', (e) => filterStations(e.target.value));
  }

  if (clearStationSearch) {
    clearStationSearch.addEventListener('click', () => {
      stationSearch.value = '';
      filterStations('');
      stationSearch.focus();
    });
  }

  if (backToAllBtn) {
    backToAllBtn.addEventListener('click', hideStationPanel);
  }

  // Initial load
  loadStationData().then(() => {
    // Restore previously selected station if available
    const savedStationValue = localStorage.getItem(SELECTED_STATION_KEY);
    if (savedStationValue) {
      stationDropdown.value = savedStationValue;
      selectedStation = stationIndex.find(s => s.value === savedStationValue);
      if (selectedStation) {
        renderStationPanel(selectedStation);
        showStationPanel();
      }
    }
  });
  loadHeadwayData().then(() => {
    // Re-render if the schedules already loaded before headway data arrived
    if (allTrainsOnSchedule) displaySchedules();
  });
  loadTrainSchedules();
  updateRefreshButtonState();

  // Load and apply saved auto-refresh preference
  const savedInterval = localStorage.getItem('trainSchedulesAutoRefresh');
  if (savedInterval) {
    const intervalMs = parseInt(savedInterval);
    if (intervalMs > 0) {
      setPollingInterval(intervalMs);
      startPolling();
    }
  } else {
    // Default to 30 seconds
    setPollingInterval(30000);
    startPolling();
  }
});
