// ── AppSync ─────────────────────────────────────────────────────────────────
// Shared cloud-sync module for buszy, fin-track, and rail-buddy.
// Uses a passphrase-style sync code (xxxxx-xxxxx) stored in localStorage.
// Data is stored server-side per sync code + app ID — no account required.
// ────────────────────────────────────────────────────────────────────────────

const AppSync = (() => {
  const SYNC_CODE_KEY = 'nrfz_sync_code';
  const SYNC_META_KEY = 'nrfz_sync_meta'; // { appId: { pushedAt, pulledAt } }
  const CODE_RE       = /^[a-z0-9]{5}-[a-z0-9]{5}$/;

  // localStorage keys to gather and restore per app
  const SYNC_CONFIG = {
    'buszy': {
      staticKeys: [
        'dark-mode', 'timeFormat', 'refreshInterval', 'showFleetLegend',
        'showIncomingBuses', 'sortByArrival', 'bookmarkedBusStops',
        'buszy_notif_mode', 'buszy_notif_when_arriving', 'buszy_notif_when_arrived',
      ],
      dynamicPrefixes: ['notif_monitoredServices'],
    },
    'fin-track': {
      staticKeys: ['fintrack', 'fintrack-repayments', 'fintrack-group-split'],
      dynamicPrefixes: [],
    },
    'rail-buddy': {
      staticKeys: ['railbuddy_ann_state'],
      dynamicPrefixes: [],
    },
  };

  const HEROKU_URL = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';

  function _serverUrl() {
    const h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1')
      ? 'http://localhost:3000'
      : HEROKU_URL;
  }

  // ── Code helpers ─────────────────────────────────────────────────────────
  function getCode()   { return localStorage.getItem(SYNC_CODE_KEY); }
  function setCode(c)  { localStorage.setItem(SYNC_CODE_KEY, c); }
  function clearCode() {
    localStorage.removeItem(SYNC_CODE_KEY);
    localStorage.removeItem(SYNC_META_KEY);
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}'); } catch { return {}; }
  }
  function _setMeta(appId, updates) {
    const m = getMeta();
    m[appId] = { ...(m[appId] || {}), ...updates };
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(m));
  }

  function generateCode() {
    const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const r = n => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return `${r(5)}-${r(5)}`;
  }

  // ── Data helpers ─────────────────────────────────────────────────────────
  function _gather(appId) {
    const cfg = SYNC_CONFIG[appId];
    if (!cfg) throw new Error('Unknown app: ' + appId);
    const out = {};
    for (const k of cfg.staticKeys) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
    for (const pfx of cfg.dynamicPrefixes) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(pfx)) { const v = localStorage.getItem(k); if (v !== null) out[k] = v; }
      }
    }
    return out;
  }

  async function _parseError(res) {
    try { return (await res.json()).error || `HTTP ${res.status}`; } catch { return `HTTP ${res.status}`; }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async function push(appId) {
    const code = getCode();
    if (!code) throw new Error('No sync code set');
    const res = await fetch(
      `${_serverUrl()}/sync/${encodeURIComponent(code)}/${encodeURIComponent(appId)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: _gather(appId) }) }
    );
    if (!res.ok) throw new Error(await _parseError(res));
    _setMeta(appId, { pushedAt: Date.now() });
    return await res.json();
  }

  async function pull(appId) {
    const code = getCode();
    if (!code) throw new Error('No sync code set');
    const res = await fetch(
      `${_serverUrl()}/sync/${encodeURIComponent(code)}/${encodeURIComponent(appId)}`
    );
    if (res.status === 404) return { noData: true };
    if (!res.ok) throw new Error(await _parseError(res));
    const result = await res.json();
    if (result.data) {
      for (const [k, v] of Object.entries(result.data)) localStorage.setItem(k, v);
    }
    _setMeta(appId, { pulledAt: Date.now() });
    return result;
  }

  function relTime(ts) {
    if (!ts) return 'Never';
    const d = Date.now() - ts;
    if (d < 60_000)     return 'Just now';
    if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ── Settings page UI ──────────────────────────────────────────────────────
  function _updateDisplay(appId) {
    const code    = getCode();
    const noCode  = document.getElementById('sync-no-code');
    const hasCode = document.getElementById('sync-has-code');
    if (!noCode || !hasCode) return;
    if (code) {
      noCode.style.display  = 'none';
      hasCode.style.display = 'block';
      document.getElementById('sync-code-display').textContent = code;
      const m = getMeta()[appId] || {};
      document.getElementById('sync-last-synced').textContent =
        `Last pushed: ${relTime(m.pushedAt)}  ·  Last pulled: ${relTime(m.pulledAt)}`;
    } else {
      noCode.style.display  = 'block';
      hasCode.style.display = 'none';
    }
  }

  function initUI(appId) {
    _updateDisplay(appId);
    const $ = id => document.getElementById(id);

    $('sync-generate-btn').addEventListener('click', async function () {
      const code = generateCode();
      setCode(code);
      _updateDisplay(appId);
      this.disabled = true; this.textContent = 'Creating…';
      try {
        await push(appId);
        _updateDisplay(appId);
        alert(`Your sync code:\n\n  ${code}\n\nEnter this in Settings → Sync on your other device.`);
      } catch (e) {
        clearCode(); _updateDisplay(appId);
        alert('Could not save to cloud: ' + e.message);
      } finally { this.disabled = false; this.textContent = 'Generate Sync Code'; }
    });

    $('sync-connect-btn').addEventListener('click', async function () {
      const input = $('sync-code-input').value.trim().toLowerCase();
      if (!CODE_RE.test(input)) { alert('Invalid format — expected: xxxxx-xxxxx'); return; }
      setCode(input);
      this.disabled = true; this.textContent = 'Connecting…';
      try {
        const result = await pull(appId);
        _updateDisplay(appId);
        alert(result.noData
          ? 'Connected! No data found for this code on the server yet.\nPush from your other device first.'
          : 'Connected and data pulled.\nReload the page to apply all changes.');
      } catch (e) {
        clearCode(); _updateDisplay(appId);
        alert('Could not connect: ' + e.message);
      } finally { this.disabled = false; this.textContent = 'Connect'; }
    });

    $('sync-copy-btn').addEventListener('click', () => {
      const code = getCode();
      if (!code) return;
      navigator.clipboard.writeText(code)
        .then(() => {
          $('sync-copy-btn').innerHTML = '<i class="fa-regular fa-check"></i>';
          setTimeout(() => { $('sync-copy-btn').innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
        })
        .catch(() => { alert('Copy failed. Your code: ' + code); });
    });

    $('sync-push-btn').addEventListener('click', async function () {
      this.disabled = true; this.textContent = 'Pushing…';
      try {
        await push(appId); _updateDisplay(appId);
        this.textContent = '✓ Pushed';
        setTimeout(() => { this.textContent = 'Push to Cloud'; }, 2000);
      } catch (e) {
        this.textContent = 'Push to Cloud'; alert('Push failed: ' + e.message);
      } finally { this.disabled = false; }
    });

    $('sync-pull-btn').addEventListener('click', async function () {
      this.disabled = true; this.textContent = 'Pulling…';
      try {
        const result = await pull(appId); _updateDisplay(appId);
        if (result.noData) {
          this.textContent = 'Pull from Cloud';
          alert('No data found for this sync code on the server.');
        } else {
          this.textContent = '✓ Pulled';
          setTimeout(() => { this.textContent = 'Pull from Cloud'; }, 2000);
          alert('Data pulled and applied. Reload the page to see all changes.');
        }
      } catch (e) {
        this.textContent = 'Pull from Cloud'; alert('Pull failed: ' + e.message);
      } finally { this.disabled = false; }
    });

    $('sync-disconnect-btn').addEventListener('click', function () {
      if (!confirm('Disconnect sync?\nYour local data will be kept, but this device will stop syncing.\nCloud data is not deleted — you can reconnect later with the same code.')) return;
      clearCode(); _updateDisplay(appId);
    });
  }

  return { getCode, setCode, clearCode, generateCode, push, pull, getMeta, relTime, initUI };
})();
