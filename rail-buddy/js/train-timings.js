(function () {
  const TZ = 'Asia/Singapore';
  const MAX_PER_DIRECTION = 4;
  const MAX_RESULTS = 8;

  let data = null;
  let stations = []; // [{ name, stopIds }]
  let selected = null;
  let refreshTimer = null;
  let clockOffset = 0; // server time minus device time, so a wrong device clock doesn't skew the timings

  async function syncClock() {
    try {
      const res = await fetch(window.location.pathname, { method: 'HEAD', cache: 'no-store' });
      const serverTime = Date.parse(res.headers.get('Date'));
      if (!Number.isNaN(serverTime)) clockOffset = serverTime - Date.now();
    } catch (e) { /* keep the previous offset */ }
  }

  // Re-render on every minute boundary (timers are throttled in background tabs, so also re-sync on wake)
  function scheduleTick() {
    clearTimeout(refreshTimer);
    const msToNextMinute = 60000 - ((Date.now() + clockOffset) % 60000);
    refreshTimer = setTimeout(() => { renderStation(); scheduleTick(); }, msToNextMinute + 250);
  }

  async function refreshNow() {
    await syncClock();
    renderStation();
    scheduleTick();
  }
  const LINE_PREFIX_MAP = {
    NS: 'NSL', EW: 'EWL', CG: 'EWL', CC: 'CCL', CE: 'CCL',
    DT: 'DTL', TE: 'TEL', NE: 'NEL', BP: 'BP', SE: 'SK', SW: 'SK', PE: 'PG', PW: 'PG'
  };
  const LINE_COLORS = {
    NSL: '#e2211c', EWL: '#009645', CCL: '#fa9e0d', DTL: '#005ec8',
    TEL: '#926437', NEL: '#9d27b5', BP: '#708472', SK: '#708472', PG: '#708472'
  };

  // Same joined-pill caplet style as first-last.html
  function renderCodeCaplet(codes) {
    if (!codes || !codes.length) return '';
    return `<span class="tt-caplets">${codes.map((code, i) => {
      const prefix = (code.match(/[A-Za-z]+/) || [''])[0].toUpperCase();
      const lineKey = LINE_PREFIX_MAP[prefix];
      const bg = LINE_COLORS[lineKey] || '#666666';
      const color = lineKey === 'CCL' ? '#000' : '#fff';
      const isFirst = i === 0;
      const isLast = i === codes.length - 1;
      const radius = codes.length === 1 ? '13.6px / 19.2px'
        : isFirst ? '13.6px 0 0 13.6px / 19.2px 0 0 19.2px'
        : isLast ? '0 13.6px 13.6px 0 / 0 19.2px 19.2px 0' : '0';
      const border = codes.length === 1 ? 'border: 2px solid #fff;'
        : isFirst ? 'border: 2px solid #fff; border-right: none;'
        : isLast ? 'border: 2px solid #fff; border-left: none;'
        : 'border-top: 2px solid #fff; border-bottom: 2px solid #fff;';
      const label = code.replace(/^([A-Za-z]+)\s*(\d+)$/, '$1 $2');
      return `<span style="background:${bg};color:${color};font-weight:bold;border-radius:${radius};padding:4px 7px;font-size:0.7em;letter-spacing:0.5px;${border}">${esc(label)}</span>`;
    }).join('')}</span>`;
  }

  // Station codes aren't in the GTFS names reliably, so combine the stop IDs with the
  // codes already bundled for first-last.html (SMRT lookup + SBS "DT 18 Name" prefixes).
  const codesByName = new Map();
  const normName = n => String(n).toLowerCase().replace(/\b(mrt|lrt)\s+station\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  async function loadStationCodes() {
    try {
      const [smrt, sbs] = await Promise.all([
        fetch('json/smrt-station-codes.json').then(r => (r.ok ? r.json() : {})),
        fetch('json/sbs-transit-ft-lt.json').then(r => (r.ok ? r.json() : []))
      ]);
      Object.entries(smrt).forEach(([name, c]) => codesByName.set(normName(name), c.split('/').filter(Boolean)));
      sbs.forEach(s => {
        const m = String(s.station).match(/^((?:[A-Za-z]{2}\s*\d+\s+)+)(.+)$/);
        if (m) codesByName.set(normName(m[2]), (m[1].match(/[A-Za-z]{2}\s*\d+/g) || []).map(c => c.replace(/\s+/g, '')));
      });
    } catch (e) { /* caplets are optional */ }
  }

  function codesFor(station) {
    const fromIds = station.stopIds.map(id => (id.match(/^[A-Za-z]{2}\d+/) || [''])[0].toUpperCase()).filter(Boolean);
    if (fromIds.length) return [...new Set(fromIds)];
    return codesByName.get(normName(station.name)) || [];
  }

  const $ = id => document.getElementById(id);
  const searchInput = $('stationSearch');
  const clearBtn = $('clearSearch');
  const results = $('stationResults');
  const resultsCount = $('resultsCount');
  const contentSection = $('contentSection');
  const placeholder = $('emptyStatePlaceholder');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Current Singapore wall-clock time, independent of the device timezone
  function sgNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(Date.now() + clockOffset)).map(x => [x.type, x.value]));
    const date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    return { date, minutes: +p.hour * 60 + +p.minute + +p.second / 60 };
  }

  const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  // Dates outside every service's range (timetable expired or not yet valid) fall back to the regular weekly pattern
  let dataRange = null;
  function getDataRange() {
    if (!dataRange) {
      const starts = data.services.map(s => s.start).filter(Boolean).sort();
      const ends = data.services.map(s => s.end).filter(Boolean).sort();
      dataRange = { first: starts[0] || '', last: ends[ends.length - 1] || '' };
    }
    return dataRange;
  }

  function serviceActive(svc, date) {
    const key = ymd(date);
    if (svc.remove.includes(key)) return false;
    if (svc.add.includes(key)) return true;
    const { first, last } = getDataRange();
    const outsideAll = key > last || key < first;
    if (!outsideAll && (!svc.start || key < svc.start || key > svc.end)) return false;
    return svc.days[(date.getUTCDay() + 6) % 7] === 1;
  }

  function decode(str) {
    let acc = 0;
    return str.split(',').map(n => (acc += +n));
  }

  function fmtClock(mins) {
    const m = Math.floor(mins) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  function timeFormat() {
    return localStorage.getItem('rbTimeFormat') || 'mins';
  }

  function fmtTime(t, wait) {
    const fmt = timeFormat();
    if (fmt === 'mins') return wait === 0 ? 'Arr' : `${wait}<small> min${wait === 1 ? '' : 's'}</small>`;
    if (fmt === '24-hour') return fmtClock(t);
    const m = Math.floor(t) % 1440;
    const h = Math.floor(m / 60);
    return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}<small> ${h < 12 ? 'AM' : 'PM'}</small>`;
  }

  // Next departures per destination. GTFS times past 24:00 belong to the previous service day,
  // so yesterday's services are also checked with a -1440 offset.
  function nextTrains(station, now) {
    const byDest = new Map();
    const days = [{ date: now.date, offset: 0 }, { date: addDays(now.date, -1), offset: 1440 }];
    for (const stopId of station.stopIds) {
      for (const [si, dest, enc] of data.tt[stopId] || []) {
        const svc = data.services[si];
        for (const { date, offset } of days) {
          if (!serviceActive(svc, date)) continue;
          for (const t of decode(enc)) {
            const mins = t - offset;
            if (mins < now.minutes - 0.5) continue;
            const raw = (stopId.match(/^[A-Za-z]+(?=\d|_|$)/) || [''])[0].toUpperCase();
            // Sengkang/Punggol interchange LRT platforms are STC/PTC in the data
            const prefix = raw === 'STC' ? 'SE' : raw === 'PTC' ? 'PE' : (raw.length === 2 ? raw : '');
            // LRT loops share one destination name in both directions, so split them by platform
            let plat = /^(BP|SE|SW|PE|PW)$/.test(prefix) ? ((stopId.match(/_([A-Z])$/) || [])[1] || '') : '';
            // Bukit Panjang LRT (except Choa Chu Kang, BP1) has its platforms the other way round: Platform 1 = B, Platform 2 = A
            const svc = prefix === 'BP' && !/^BP1_/i.test(stopId) ? plat : '';
            const loop = /^(SE|SW|PE|PW)\d/i.test(stopId) ? (plat === 'A' ? 'Outer Loop' : plat === 'B' ? 'Inner Loop' : '') : '';
            if (prefix === 'BP' && !/^BP1_/i.test(stopId)) plat = plat === 'A' ? 'B' : plat === 'B' ? 'A' : plat;
            const key = prefix + '|' + dest + '|' + plat;
            if (!byDest.has(key)) byDest.set(key, { dest, prefix, plat, svc, loop, set: new Set() });
            byDest.get(key).set.add(Math.round(mins));
          }
        }
      }
    }
    const platCount = new Map();
    for (const d of byDest.values()) platCount.set(d.prefix + '|' + d.dest, (platCount.get(d.prefix + '|' + d.dest) || 0) + 1);
    return [...byDest.values()].map(d => ({
      dest: d.plat && platCount.get(d.prefix + '|' + d.dest) > 1
        ? `${d.svc ? 'Service ' + d.svc : d.loop || d.dest} (Platform ${d.plat === 'A' ? 1 : d.plat === 'B' ? 2 : d.plat})`
        : d.dest,
      prefix: d.prefix,
      times: [...d.set].sort((a, b) => a - b).slice(0, MAX_PER_DIRECTION)
    }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.dest.localeCompare(b.dest));
  }

  let lineFilter = 'ALL';

  const API_SERVER = (() => {
    const u = new URL(window.location.href);
    if (u.hostname === 'localhost' && u.port && u.port !== '3000') return 'http://localhost:3000';
    if (u.hostname === 'localhost') return u.origin;
    return 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
  })();
  const LINE_NAMES = {
    'North-South Line': 'NSL', 'East-West Line': 'EWL', 'Circle Line': 'CCL', 'Downtown Line': 'DTL',
    'Thomson-East Coast Line': 'TEL', 'North East Line': 'NEL',
    'Bukit Panjang LRT': 'BP', 'Sengkang LRT': 'SK', 'Punggol LRT': 'PG'
  };
  const SEVERITY_RANK = { major: 3, minor: 2, info: 1 };
  let disruptions = {}; // line key -> { severity, messages[] }

  function parseAlerts(json) {
    const raw = json && (json.value ?? json.data ?? json);
    const alerts = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    const out = {};
    alerts.forEach(a => {
      if (![1, 2].includes(Number(a.Status))) return;
      const msgs = Array.isArray(a.Message) ? a.Message : a.Message ? [a.Message] : [];
      msgs.forEach(m => {
        const text = typeof m === 'string' ? m : (m && m.Content) || '';
        if (!text) return;
        const lines = new Set();
        for (const [name, code] of Object.entries(LINE_NAMES)) {
          if (text.includes(name) || new RegExp('\\b' + code + '\\b').test(text)) lines.add(code);
        }
        (a.AffectedSegments || []).forEach(s => {
          const code = LINE_NAMES[s.Line] || s.Line;
          if (LINE_COLORS[code]) lines.add(code);
        });
        const severity = /major/i.test(text) ? 'major' : /minor/i.test(text) ? 'minor' : 'info';
        lines.forEach(l => {
          const cur = out[l] || (out[l] = { severity, messages: [] });
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[cur.severity]) cur.severity = severity;
          if (!cur.messages.includes(text)) cur.messages.push(text);
        });
      });
    });
    return out;
  }

  // Failure leaves disruptions empty, so the page degrades to the plain timetable
  async function loadAlerts() {
    try {
      const res = await fetch(`${API_SERVER}/train-service-alerts`);
      if (!res.ok) throw new Error(res.status);
      disruptions = parseAlerts(await res.json());
    } catch (e) {
      disruptions = {};
    }
    renderStation();
  }

  function renderBanner(lines) {
    const el = $('disruptionBanner');
    const hit = lines.filter(l => disruptions[l]);
    if (!hit.length) { el.hidden = true; el.innerHTML = ''; return; }
    const worst = hit.some(l => disruptions[l].severity === 'major') ? 'major' : 'minor';
    el.className = 'tt-banner tt-banner-' + worst;
    el.innerHTML = '<div class="tt-banner-title"><i class="fa-regular fa-diamond-exclamation"></i> Service disruption – timetable may not apply</div>' +
      hit.map(l => disruptions[l].messages.map(m => `<div class="tt-banner-msg"><strong>${esc(l)}</strong> ${esc(m)}</div>`).join('')).join('');
    el.hidden = false;
  }
  const SOON_MINUTES = 30; // directions whose next train is further away start collapsed
  const cardState = new Map(); // card key -> true (open) / false (closed), set only when the user toggles

  function toggleCard(head) {
    const card = head.closest('.tt-card');
    const open = card.classList.toggle('collapsed') === false;
    head.setAttribute('aria-expanded', open);
    cardState.set(card.dataset.key, open);
  }
  $('directionsContainer').addEventListener('click', e => {
    const head = e.target.closest('.tt-head');
    if (head) toggleCard(head);
  });
  $('directionsContainer').addEventListener('keydown', e => {
    const head = e.target.closest('.tt-head');
    if (head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleCard(head); }
  });

  // Builds the tabs from the lines actually serving the selected station
  function renderFilter(dirs) {
    const box = $('lineFilter');
    const lines = [...new Set(dirs.map(d => LINE_PREFIX_MAP[d.prefix] || d.prefix).filter(Boolean))];
    if (lineFilter !== 'ALL' && !lines.includes(lineFilter)) lineFilter = 'ALL';
    if (lines.length < 2) { box.innerHTML = ''; return; }
    const chip = (key, label, color, fg) =>
      `<button type="button" role="tab" class="tt-chip${key === lineFilter ? ' active' : ''}" data-line="${esc(key)}" aria-selected="${key === lineFilter}"${color ? ` style="--chip:${color};--chip-fg:${fg}"` : ''}>${esc(label)}</button>`;
    box.innerHTML = chip('ALL', 'All') + lines.map(l => chip(l, l, LINE_COLORS[l], l === 'CCL' ? '#000' : '#fff')).join('');
  }

  $('lineFilter').addEventListener('click', e => {
    const btn = e.target.closest('.tt-chip');
    if (!btn) return;
    lineFilter = btn.dataset.line;
    renderStation();
  });

  function renderStation() {
    if (!selected) return;
    const now = sgNow();
    $('flLink').href = 'first-last.html?station=' + encodeURIComponent(selected.name);
    $('stationSubtitle').textContent = 'Scheduled departures (timetable, not live)';
    const dirs = nextTrains(selected, now);
    renderBanner([...new Set(dirs.map(d => LINE_PREFIX_MAP[d.prefix]).filter(Boolean))]);
    renderFilter(dirs);
    // Put the selected line's code first in the title caplet (e.g. "BP 1 | NS 4" vs "NS 4 | BP 1")
    const codes = codesFor(selected);
    const lineOf = c => LINE_PREFIX_MAP[(c.match(/[A-Za-z]+/) || [''])[0].toUpperCase()];
    const ordered = lineFilter === 'ALL' ? codes : [...codes.filter(c => lineOf(c) === lineFilter), ...codes.filter(c => lineOf(c) !== lineFilter)];
    $('stationTitle').innerHTML = `${renderCodeCaplet(ordered)}<span class="tt-name"> ${esc(selected.name)}</span>`;
    const visible = (lineFilter === 'ALL' ? dirs : dirs.filter(d => (LINE_PREFIX_MAP[d.prefix] || d.prefix) === lineFilter))
      .slice()
      .sort((a, b) => (a.times[0] ?? Infinity) - (b.times[0] ?? Infinity) || a.prefix.localeCompare(b.prefix) || a.dest.localeCompare(b.dest));
    const box = $('directionsContainer');
    if (!visible.length) {
      box.innerHTML = '<div class="tt-card"><div class="tt-none">No more scheduled trains for today.</div></div>';
    } else {
      box.innerHTML = visible.map(d => {
        const lineKey = LINE_PREFIX_MAP[d.prefix];
        const badge = lineKey
          ? `<img class="tt-badge tt-badge-img" src="assets/caplets/${lineKey}Cap.svg" alt="${lineKey}" onerror="this.outerHTML='<span class=&quot;tt-badge&quot; style=&quot;background:${LINE_COLORS[lineKey]};color:${lineKey === 'CCL' ? '#000' : '#fff'}&quot;>${lineKey}</span>'">`
          : '<span class="tt-badge tt-badge-generic"><i class="fa-regular fa-train-subway"></i></span>';
        const waits = d.times.map(t => Math.max(0, Math.round(t - now.minutes)));
        const key = d.prefix + '|' + d.dest;
        const collapsed = cardState.has(key) ? !cardState.get(key) : !(waits.length && waits[0] <= SOON_MINUTES);
        const trainIcon = ['BP', 'SK', 'PG'].includes(lineKey) ? 'fa-lta-lrt' : 'fa-lta-train';
        const times = waits.map((wait, i) =>
          `<div class="tt-time"><span class="tt-mins${wait === 0 ? ' tt-arr' : ''}">${fmtTime(d.times[i], wait)}</span><i class="fa-kit ${trainIcon} tt-train"></i></div>`
        ).join('');
        const next = waits.length ? fmtTime(d.times[0], waits[0]).replace(/<\/?small>/g, '') : '';
        const disrupted = lineKey && disruptions[lineKey];
        const flag = disrupted ? '<span class="tt-flag"><i class="fa-regular fa-diamond-exclamation"></i> Disrupted</span>' : '';
        return `<div class="tt-card${collapsed ? ' collapsed' : ''}${disrupted ? ' tt-disrupted' : ''}" data-key="${esc(key)}"><div class="tt-head" role="button" tabindex="0" aria-expanded="${!collapsed}">${badge}<span class="tt-dest"><i class="fa-solid fa-circle-arrow-right"></i> ${esc(d.dest)}${flag}</span><span class="tt-next-hint${waits[0] === 0 ? ' tt-arr' : ''}">${next}</span><i class="fa-regular fa-chevron-down tt-chevron"></i></div><div class="tt-times">${times || '<span class="tt-none">No more trains today.</span>'}</div></div>`;
      }).join('');
    }
    renderExpiryNotice();
  }

  // Warns when the bundled timetable is about to run out (or already has), since the page would silently show no trains
  function renderExpiryNotice() {
    const ends = data.services.map(s => s.end).filter(Boolean).sort();
    const el = $('ttMeta');
    if (!ends.length) { el.textContent = ''; return; }
    const last = ends[ends.length - 1];
    const lastDate = new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8)));
    const daysLeft = Math.floor((lastDate - sgNow().date) / 86400000);
    if (daysLeft < 0) el.textContent = 'This timetable has expired. Showing the regular weekly timings; public holidays may differ.';
    else if (daysLeft <= 7) el.textContent = `Timetable data ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}; after that the regular weekly timings are shown.`;
    else el.textContent = '';
  }

  function selectStation(station) {
    selected = station;
    searchInput.value = station.name;
    clearBtn.classList.add('visible');
    results.innerHTML = '';
    resultsCount.textContent = '';
    contentSection.style.display = 'block';
    $('ttToolbar').hidden = false;
    placeholder.style.display = 'none';
    try { localStorage.setItem('railbuddy_tt_station', station.name); } catch (e) { /* storage unavailable */ }
    renderStation();
    scheduleTick();
  }

  function showResults(q) {
    q = q.trim().toLowerCase();
    clearBtn.classList.toggle('visible', q.length > 0);
    if (!q) { results.innerHTML = ''; resultsCount.textContent = ''; return; }
    const matches = stations.filter(s => s.name.toLowerCase().includes(q));
    resultsCount.textContent = matches.length ? '' : 'No stations found';
    results.innerHTML = '';
    matches.slice(0, MAX_RESULTS).forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tt-result';
      btn.innerHTML = `${renderCodeCaplet(codesFor(s))} <span>${esc(s.name)}</span>`;
      btn.addEventListener('click', () => selectStation(s));
      results.appendChild(btn);
    });
  }

  async function init() {
    contentSection.style.display = 'none';
    try {
      const res = await fetch('json/train-timetable.json');
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
      await loadStationCodes();
    } catch (e) {
      placeholder.querySelector('p').textContent = 'Train timetable data is unavailable right now.';
      return;
    }
    const byName = new Map();
    for (const stopId of Object.keys(data.tt)) {
      const name = data.stops[stopId] || stopId;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(stopId);
    }
    stations = [...byName].map(([name, stopIds]) => ({ name, stopIds })).sort((a, b) => a.name.localeCompare(b.name));

    searchInput.addEventListener('input', () => showResults(searchInput.value));
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      showResults('');
      selected = null;
      clearTimeout(refreshTimer);
      contentSection.style.display = 'none';
      $('ttToolbar').hidden = true;
      placeholder.style.display = '';
      try { localStorage.removeItem('railbuddy_tt_station'); } catch (e) { /* ignore */ }
      searchInput.focus();
    });

    let saved = null;
    try { saved = localStorage.getItem('railbuddy_tt_station'); } catch (e) { /* ignore */ }
    const match = saved && stations.find(s => s.name === saved);
    if (match) selectStation(match);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNow(); });
  window.addEventListener('focus', refreshNow);
  window.addEventListener('pageshow', refreshNow);
  window.addEventListener('online', refreshNow);
  syncClock().then(init);
  loadAlerts();
  setInterval(loadAlerts, 5 * 60 * 1000);
})();
