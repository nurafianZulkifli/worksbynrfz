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

  // ── GTFS static schedule (stop_times.txt) — processed dynamically per station/trip when the API returns it ──
  let gtfsByStation = new Map(); // stop_id -> sorted [{ tripId, stopSequence, arrivalTime, departureTime, arrivalMinutes, departureMinutes }]
  let gtfsByTrip = new Map();    // trip_id -> sorted [{ stopId, stopSequence, arrivalTime, departureTime }]
  let gtfsByStationCode = new Map(); // base station code (e.g. "CC6", stripped of "_A"/"_B" platform suffix) -> merged entries

  // GTFS times can exceed 24:00 (e.g. "25:10:00") for post-midnight service, so parse as raw minutes
  function gtfsTimeToMinutes(hhmmss) {
    if (!hhmmss) return null;
    const [h, m] = hhmmss.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function processGTFSStopTimes(stopTimes) {
    gtfsByStation = new Map();
    gtfsByTrip = new Map();
    gtfsByStationCode = new Map();
    if (!Array.isArray(stopTimes)) return;

    stopTimes.forEach(st => {
      if (!st.stop_id || !st.trip_id) return;
      const entry = {
        tripId: st.trip_id,
        stopId: st.stop_id,
        stopSequence: st.stop_sequence,
        arrivalTime: st.arrival_time,
        departureTime: st.departure_time,
        arrivalMinutes: gtfsTimeToMinutes(st.arrival_time),
        departureMinutes: gtfsTimeToMinutes(st.departure_time),
        headsign: st.stop_headsign || null
      };
      if (!gtfsByStation.has(entry.stopId)) gtfsByStation.set(entry.stopId, []);
      gtfsByStation.get(entry.stopId).push(entry);
      if (!gtfsByTrip.has(entry.tripId)) gtfsByTrip.set(entry.tripId, []);
      gtfsByTrip.get(entry.tripId).push(entry);
    });

    gtfsByStation.forEach(list => list.sort((a, b) => (a.departureMinutes ?? 0) - (b.departureMinutes ?? 0)));
    gtfsByTrip.forEach(list => list.sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0)));

    // GTFS stop_ids carry a platform suffix (e.g. "CC6_B") that never matches our plain station codes,
    // so also index everything under the base code with the suffix stripped.
    gtfsByStation.forEach((entries, stopId) => {
      const baseCode = stopId.replace(/_[A-Za-z0-9]+$/, '').toUpperCase();
      if (!gtfsByStationCode.has(baseCode)) gtfsByStationCode.set(baseCode, []);
      gtfsByStationCode.get(baseCode).push(...entries);
    });
    gtfsByStationCode.forEach(list => list.sort((a, b) => (a.departureMinutes ?? 0) - (b.departureMinutes ?? 0)));

    console.log(`[GTFS Static] Processed ${stopTimes.length} stop times into ${gtfsByStation.size} stations (${gtfsByStationCode.size} base codes), ${gtfsByTrip.size} trips`);
  }

  // Best-effort match: station codes (e.g. "NS1/EW24") tried against GTFS stop_id keys and base codes.
  // Source data can have a stray space inside a code (e.g. "CC 33"), so extract via regex rather than a naive split.
  // Interchanges have one code per line (e.g. "NS27/CC33/TE20") — merge every line's departures rather
  // than stopping at the first code that matches, or the other lines' trains would never show up.
  function getStaticDeparturesForStation(station) {
    if (gtfsByStation.size === 0) return [];
    const codes = ((station.code || '').match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, ''));
    const seen = new Set();
    const merged = [];
    for (const code of codes) {
      const upper = code.toUpperCase();
      const match = gtfsByStation.get(code) || gtfsByStation.get(upper) || gtfsByStation.get(code.toLowerCase()) || gtfsByStationCode.get(upper);
      (match || []).forEach(dep => {
        const key = `${dep.tripId}|${dep.stopId}|${dep.stopSequence}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(dep);
        }
      });
    }
    return merged.sort((a, b) => (a.departureMinutes ?? 0) - (b.departureMinutes ?? 0));
  }

  // The last stop of a trip (by stop_sequence) is treated as that trip's destination
  function getTripFinalStopId(tripId) {
    const stops = gtfsByTrip.get(tripId);
    return stops && stops.length > 0 ? stops[stops.length - 1].stopId : null;
  }

  // True only if at least one real GTFS trip departing this station actually terminates
  // at the direction's destination — station-code text alone (ft-lt.json) isn't proof it still runs.
  function directionHasGTFSMatch(station, direction) {
    const stationDepartures = getStaticDeparturesForStation(station);
    if (stationDepartures.length === 0) return false;

    // Loop directions (Clockwise/Anticlockwise) have no single destination stop_id to verify against
    if (/^(CLOCKWISE|ANTICLOCKWISE)\b/i.test(direction.description)) return true;

    const destCodes = (direction.description.match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, '').toUpperCase());
    if (destCodes.length === 0) return false;

    return stationDepartures.some(dep => {
      const finalStopId = getTripFinalStopId(dep.tripId);
      if (!finalStopId) return false;
      const finalBaseCode = finalStopId.replace(/_[A-Za-z0-9]+$/, '').toUpperCase();
      return destCodes.includes(finalBaseCode);
    });
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

  // Renders a direction description like "To NS1 EW24 Jurong East" with the station codes
  // swapped for their coloured caplets, e.g. "CLOCKWISE via Promenade" gets the CCL caplet.
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

  // Singapore public holidays in 2026 (MM-DD format)
  const SG_PUBLIC_HOLIDAYS = new Set([
    '01-01', // New Year's Day
    '02-09', // Chinese New Year
    '02-10', // Chinese New Year (2nd day)
    '04-10', // Good Friday
    '05-01', // Labour Day (optional, may not be observed)
    '05-24', // Vesak Day
    '06-10', // Hari Raya Haji
    '08-09', // National Day
    '10-31', // Deepavali
    '12-25'  // Christmas Day
  ]);

  // Check if a date is a Singapore public holiday
  function isSgPublicHoliday(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return SG_PUBLIC_HOLIDAYS.has(`${month}-${day}`);
  }

  // Determine today's service period type (WD/WE/PH)
  function getTodayServiceType() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

    if (isSgPublicHoliday(today)) return 'PH';
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'WE'; // Sunday or Saturday
    return 'WD'; // Monday-Friday
  }

  // Determine current time period (Peak/OffPeak) based on GTFS definitions
  // Peak hours: Weekday 06:30-09:30 and 17:30-20:30; Weekend/Holiday: no peak hours
  function getCurrentTimePeriod() {
    const now = new Date();
    const todayType = getTodayServiceType();
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    // Only weekdays have peak hours
    if (todayType !== 'WD') return 'OffPeak';

    // Weekday peak hours
    const MORNING_PEAK_START = 6 * 60 + 30;   // 06:30
    const MORNING_PEAK_END = 9 * 60 + 30;     // 09:30
    const EVENING_PEAK_START = 17 * 60 + 30;  // 17:30
    const EVENING_PEAK_END = 20 * 60 + 30;    // 20:30

    if ((minutesNow >= MORNING_PEAK_START && minutesNow <= MORNING_PEAK_END) ||
        (minutesNow >= EVENING_PEAK_START && minutesNow <= EVENING_PEAK_END)) {
      return 'Peak';
    }

    return 'OffPeak';
  }

  // Extract service period info from trip_id, only return if it matches today's time
  // Supports two GTFS formats:
  // 1. CCL style: "CCL_Anticlockwise_WD_Peak_81" → check if current time is within peak hours
  // 2. NS/EW style: "NSL_NB_WE_136" → always show for today's day type
  function parseServicePeriod(tripId) {
    const todayType = getTodayServiceType();
    const currentTimePeriod = getCurrentTimePeriod();

    // Try format 1: _(WD|WE|PH)_(Peak|OffPeak)_
    let match = tripId.match(/_(WD|WE|PH)_(Peak|OffPeak)_/);
    if (match) {
      const dayType = match[1]; // WD, WE, PH
      const peakType = match[2]; // Peak, OffPeak

      // Only show label if day type matches today
      if (dayType !== todayType) return null;

      // For weekday trips: check if peak type matches current time
      if (dayType === 'WD' && peakType !== currentTimePeriod) return null;

      // For weekend/holiday trips: don't filter by peak type (no time-based peak definition)
      // Always show the label as-is from the trip ID

      const dayLabel = { WD: 'Weekday', WE: 'Weekend', PH: 'Holiday' }[dayType] || dayType;
      return { label: `${dayLabel} ${peakType}` };
    }

    // Try format 2: _(WD|WE|PH)_
    match = tripId.match(/_(WD|WE|PH)_/);
    if (match) {
      const dayType = match[1]; // WD, WE, PH

      // Only show label if it matches today's day type
      if (dayType !== todayType) return null;

      const dayLabel = { WD: 'Weekday', WE: 'Weekend', PH: 'Holiday' }[dayType] || dayType;
      return { label: dayLabel };
    }
  }

  // Calculate "Arriving in X mins" label based on a scheduled time (HH:MM) vs now. Handles midnight wraparound.
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
      // Only wrap forward to the next day if solidly in the past (>12h), not just a same-day miss
      if (secondsUntil < -43200) secondsUntil += 24 * 3600;
      if (secondsUntil <= 0) return 'Arriving now';
      const roundedMinutes = Math.max(1, Math.ceil(secondsUntil / 60));
      const minLabel = roundedMinutes === 1 ? 'min' : 'mins';
      return `Arriving in ${roundedMinutes} ${minLabel}`;
    } catch (e) {
      console.warn('[ETA] Failed to parse arrival time:', arrivalTimeHHMM, e);
      return 'No ETA';
    }
  }

  function hasTrainTimePassed(trainTimeHHMM) {
    const now = new Date();
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const [h, m] = trainTimeHHMM.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    let secondsUntil = (h * 3600 + m * 60) - nowSeconds;
    if (secondsUntil < -43200) secondsUntil += 24 * 3600;
    return secondsUntil <= 0;
  }

  // Real GTFS departures for one direction at this station — matched by the trip's final stop_id
  // (or clockwise/anticlockwise trip_id tag for loop lines) and filtered to today's WD/WE/PH service day.
  function getDirectionDepartures(station, direction) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todayType = getTodayServiceType();
    const isLoop = /^(CLOCKWISE|ANTICLOCKWISE)\b/i.test(direction.description);
    const wantsAnticlockwise = /^ANTICLOCKWISE\b/i.test(direction.description);
    const destCodes = (direction.description.match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, '').toUpperCase());

    const matches = getStaticDeparturesForStation(station).filter(dep => {
      const dayMatch = dep.tripId.match(/_(WD|WE|PH)_/);
      if (dayMatch && dayMatch[1] !== todayType) return false;

      if (isLoop) {
        return wantsAnticlockwise ? /anticlockwise/i.test(dep.tripId) : (/clockwise/i.test(dep.tripId) && !/anticlockwise/i.test(dep.tripId));
      }

      const finalStopId = getTripFinalStopId(dep.tripId);
      if (!finalStopId) return false;
      const finalBaseCode = finalStopId.replace(/_[A-Za-z0-9]+$/, '').toUpperCase();
      return destCodes.includes(finalBaseCode);
    });

    return matches
      .filter(d => d.departureMinutes !== null)
      .map(d => {
        let etaMinutes = d.departureMinutes - nowMin;
        if (etaMinutes < -720) etaMinutes += 1440; // wrap forward only if solidly in the past (>12h)
        return { ...d, etaMinutes };
      })
      .filter(d => d.etaMinutes >= -1)
      .sort((a, b) => a.etaMinutes - b.etaMinutes);
  }

  // Renders one direction as a card: destination header, an "Estimated arrival" chip showing
  // the next real GTFS scheduled time, and pill chips for the next few upcoming departures.
  function renderStationDirectionCard(direction, station) {
    const departures = getDirectionDepartures(station, direction).slice(0, 4);
    const servicePeriod = departures.length > 0 ? parseServicePeriod(departures[0].tripId) : null;

    const upcomingTrains = departures.map(d => {
      const mins = ((d.departureMinutes % 1440) + 1440) % 1440;
      return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    });

    const chipColor = upcomingTrains.length > 0 ? '#4CAF50' : '#999999';
    const nextTrainLabel = upcomingTrains.length > 0 ? calculateArrivingLabel(upcomingTrains[0]) : 'No schedule data for today';
    const periodBadge = servicePeriod
      ? `<span style="font-size: 0.7em; font-weight: 600; color: var(--text-secondary, #999); margin-left: 6px;">${servicePeriod.label}</span>`
      : '';

    const upcomingTrainsHtml = upcomingTrains.length > 0
      ? `<div class="upcoming-trains-list" style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">${upcomingTrains.map(time => `<div class="train-time-chip" data-time="${time}">${time}</div>`).join('')}</div>`
      : '';

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
      <div class="direction-card" data-upcoming-trains='${JSON.stringify(upcomingTrains)}'>
        <div style="font-weight: 700; margin-bottom: 8px;"><i class="fa-kit fa-lta-to-right"></i> ${formatDirectionDescription(direction.description)}${periodBadge}</div>
        ${nextTrainChip}
      </div>
    `;
  }

  // Schedule data includes short-turn/variant destinations (e.g. NS19, NS16, NS7 or a loop line's
  // "Ends at X" short services) — only the full-line termini (or a loop's "Full Loop" entry) render
  // as primary direction cards, the rest collapse into "Service Variants".
  const NS_MAIN_TERMINI = new Set(['To NS1 EW24 Jurong East', 'To NS28 Marina South Pier']);
  function isVariantDirection(description) {
    if (/^To NS\d+/.test(description)) return !NS_MAIN_TERMINI.has(description);
    if (/^(CLOCKWISE|ANTICLOCKWISE)\b/i.test(description)) return /Ends at/i.test(description);
    return false;
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
          Short trips that only run during specific periods (e.g. late nights) — refer to station display.
        </div>
        ${rows}
      </div>
    `;
  }

  function renderStationPanel(station) {
    const titleCodes = ((station.code || '').match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, ''));
    stationTitle.innerHTML = titleCodes.length > 0
      ? `${renderCodeCaplet(titleCodes)} ${station.name}`
      : station.name;

    // Live status: real delay/cancellation data takes priority over the estimate
    const liveMatches = getLiveStatusForStation(station);
    if (liveMatches.length > 0) {
      stationLiveStatus.innerHTML = `
        <div style="margin-bottom: 1em;">
          ${liveMatches.map(m => createScheduleCard(m).outerHTML).join('')}
        </div>
      `;
    } else {
      const staticDepartures = getStaticDeparturesForStation(station);
      stationLiveStatus.innerHTML = `
        <div class="alert alert-success" role="alert">
          <i class="fa-solid fa-circle-check"></i> <strong>No reported delays</strong>
        </div>
        ${staticDepartures.length > 0 ? '' : renderHeadwayEstimates(station.lineKeys)}
      `;
    }

    // Only include a direction when it has real backing in the parsed GTFS stop_times data
    const gtfsDirections = station.directions.filter(d => directionHasGTFSMatch(station, d));
    const mainDirections = gtfsDirections.filter(d => !isVariantDirection(d.description));
    const variantDirections = gtfsDirections.filter(d => isVariantDirection(d.description));

    stationDirections.innerHTML = gtfsDirections.length > 0
      ? mainDirections.map(d => renderStationDirectionCard(d, station)).join('') + renderServiceVariantsCard(variantDirections)
      : '<p style="color: var(--text-secondary, #666);">No GTFS schedule data available for this station right now.</p>';

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

      // Check which shape the API returned this time
      if (data.stopTimes && Array.isArray(data.stopTimes)) {
        // Static GTFS schedule (stop_times.txt) parsed successfully — process it dynamically
        // into per-station/per-trip lookups rather than a flat delay list.
        processGTFSStopTimes(data.stopTimes);
        allSchedules = [];
        allTrainsOnSchedule = true; // no live delay feed, but real scheduled timings are available per-station
        console.log(`[GTFS Static] Loaded ${data.stopTimesCount ?? data.stopTimes.length} stop times (fetched ${data.fetchedAt})`);
      } else if (data.tripUpdates && Array.isArray(data.tripUpdates)) {
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

  // Real-time ETA updater — runs every second. Removes train times that have passed and
  // advances each card's "Estimated arrival" chip to the next remaining upcoming train.
  function updateETALabels() {
    const cards = document.querySelectorAll('.direction-card');
    if (cards.length === 0) return;

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
