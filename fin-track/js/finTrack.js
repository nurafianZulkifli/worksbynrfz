 // ── State ──────────────────────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let state = load();

  function defaultState() {
    const now = new Date();
    const id = uid();
    return {
      activeAccountId: id,
      activeMonth: now.getMonth(),
      activeYear: now.getFullYear(),
      accounts: [{
        id,
        name: 'Commitments',
        allocated: 0,
        transactions: []
      }]
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('fintrack'));
      if (!s) return defaultState();
      // Migrate flat state (pre-accounts structure)
      if (s.transactions && !s.accounts) {
        const id = uid();
        return {
          activeAccountId: id,
          activeMonth: s.activeMonth != null ? s.activeMonth : new Date().getMonth(),
          activeYear: s.activeYear || new Date().getFullYear(),
          accounts: [{ id, name: 'Commitments', allocated: s.allocated || 0, transactions: s.transactions || [] }]
        };
      }
      return s;
    } catch { return defaultState(); }
  }
  function save() { localStorage.setItem('fintrack', JSON.stringify(state)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function activeAccount() {
    return state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0];
  }

  // ── Computed ───────────────────────────────────────────────────────────
  function filteredTxns() {
    return activeAccount().transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === state.activeMonth && d.getFullYear() === state.activeYear;
    });
  }

  // Balance counts ALL transactions, offset by any previous reset snapshot
  function calcBalance() {
    const acct = activeAccount();
    const txns = acct.transactions;
    const totalDebits = txns.filter(t => t.type !== 'credit').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
    const totalCredits = txns.filter(t => t.type === 'credit' && t.cat !== 'Transfer').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
    const totalSpent = Math.max(0, totalDebits - totalCredits - (acct.resetOffset || 0));
    return { totalSpent, remaining: acct.allocated - totalSpent };
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function renderAll() {
    renderGreeting();
    renderAccountSwitcher();
    renderMonthTabs();
    renderBalance();
    renderTxns();
  }

  function renderGreeting() {
    const el = document.getElementById('ftGreeting');
    if (!el) return;
    const now = new Date();
    const h = now.getHours();
    let greet;
    if (h >= 5 && h < 12) greet = 'Good Morning!';
    else if (h >= 12 && h < 18) greet = 'Good Afternoon!';
    else if (h >= 18 && h < 22) greet = 'Good Evening!';
    else greet = 'Good Night!';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
    el.innerHTML = `<span class="ft-greeting-text">${greet}</span><span class="ft-greeting-date">${dateStr}</span>`;
  }

  function renderAccountSwitcher() {
    const el = document.getElementById('acctSwitcherName');
    if (el) el.textContent = activeAccount().name;
  }

  function renderMonthTabs() {
    const now = new Date();
    const cur = now.getMonth(), curY = now.getFullYear();
    const minYear = 2026, minMonth = 0; // Jan 2026
    // Only show months from Jan 2026 to current month
    const tabs = [];
    for (let y = minYear; y <= curY; y++) {
      const startM = y === minYear ? minMonth : 0;
      const endM = y === curY ? cur : 11;
      for (let m = startM; m <= endM; m++) {
        tabs.push({ m, y });
      }
    }
    const container = document.getElementById('monthTabs');
    container.innerHTML = tabs.reverse().map(({m, y}) => {
      const active = m === state.activeMonth && y === state.activeYear;
      return `<button class="month-btn${active?' active':''}" onclick="setMonth(${m},${y})">${MONTHS[m]}</button>`;
    }).join('');
    // Scroll active tab into view
    const activeBtn = container.querySelector('.month-btn.active');
    if (activeBtn) setTimeout(() => activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }), 50);
    if (window._updateMonthScrollIndicator) setTimeout(window._updateMonthScrollIndicator, 200);
    // Update chevrons after layout settles
    setTimeout(updateMonthChevrons, 300);
  }

  function updateMonthChevrons() {
    const container = document.getElementById('monthTabs');
    const indicator = document.getElementById('monthScrollIndicator');
    if (!container || !indicator) return;
    
    const hasScroll = container.scrollWidth > container.clientWidth;
    const isAtEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 10;
    
    if (hasScroll) {
      container.classList.add('has-scroll');
    } else {
      container.classList.remove('has-scroll');
    }
    
    if (hasScroll && !isAtEnd) {
      indicator.classList.add('visible');
    } else {
      indicator.classList.remove('visible');
    }
  }

  function navigateMonth() {}

  function renderBalance() {
    const { totalSpent, remaining } = calcBalance();
    const alloc = activeAccount().allocated;
    const pct = alloc > 0 ? Math.min((totalSpent / alloc) * 100, 100) : 0;

    document.getElementById('allocatedDisplay').textContent = fmt(alloc);
    document.getElementById('spentDisplay').textContent = fmt(totalSpent);
    const remEl = document.getElementById('remainingDisplay');
    remEl.textContent = fmt(Math.abs(remaining));
    remEl.className = 'balance-amount ' + (remaining >= 0 ? 'positive' : 'negative');

    const bar = document.getElementById('progressBar');
    bar.style.width = pct + '%';
    bar.className = 'ft-progress-bar' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');

    document.getElementById('progressPct').textContent = pct.toFixed(0) + '% used';
    document.getElementById('progressLeft').textContent = (remaining >= 0 ? fmt(remaining) + ' left' : fmt(Math.abs(remaining)) + ' over budget');
  }

  function renderTxns() {
    const txns = filteredTxns().sort((a,b) => new Date(b.date) - new Date(a.date));
    const section = document.getElementById('txnSection');
    if (!txns.length) {
      section.innerHTML = `<div class="empty-state"><i class="fa-regular fa-inbox"></i><div>No transactions for ${MONTH_NAMES[state.activeMonth]} ${state.activeYear}</div></div>`;
      return;
    }
    // group by date
    const groups = {};
    txns.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    section.innerHTML = Object.entries(groups).sort((a,b) => new Date(b[0]) - new Date(a[0])).map(([date, items]) => `
      <div style="margin-bottom:18px">
        <div class="txn-date-label">${fmtDate(date)}</div>
        <div class="txn-group-card">
          ${items.map(t => `
            <div class="txn-item" onclick="openEdit('${t.id}')">
              <div class="txn-icon ${iconClass(t.cat)}">${iconEmoji(t.cat)}</div>
              <div class="txn-info">
                <div class="txn-name">${esc(t.name)}</div>
                <div class="txn-cat">${esc(t.cat)}</div>
              </div>
              <div class="txn-amount ${t.type === 'debit' ? 'debit' : 'credit'}">${t.type === 'debit' ? '−' : '+'}${fmt(t.amount)}</div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function fmt(n) { return 'SGD ' + n.toFixed(2); }
  function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-SG', { weekday:'short', day:'numeric', month:'short', year:'numeric' }).toUpperCase();
  }
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function iconClass(cat) {
    if (cat === 'ATM') return 'atm';
    if (cat === 'Transfer') return 'income';
    if (cat === 'Bills') return 'bills';
    if (['Point-of-Sale','Food','Transport'].includes(cat)) return 'pos';
    return 'other';
  }
  function iconEmoji(cat) {
    const map = {
      'Point-of-Sale': '<i class="fa-regular fa-bag-shopping"></i>',
      'ATM':           '<i class="fa-regular fa-building-columns"></i>',
      'Transfer':      '<i class="fa-regular fa-money-bill-transfer"></i>',
      'Bills':         '<i class="fa-regular fa-file-invoice"></i>',
      'Food':          '<i class="fa-regular fa-utensils"></i>',
      'Transport':     '<i class="fa-regular fa-bus"></i>',
      'Others':        '<i class="fa-regular fa-credit-card"></i>'
    };
    return map[cat] || '<i class="fa-regular fa-credit-card"></i>';
  }

  // ── Month nav ──────────────────────────────────────────────────────────
  function setMonth(m, y) {
    state.activeMonth = m;
    state.activeYear = y;
    save();
    renderAll();
  }

  // ── Add / Edit ─────────────────────────────────────────────────────────
  let editingId = null;
  let currentType = 'debit';

  function _getTxnModal() {
    return bootstrap.Modal.getOrCreateInstance(document.getElementById('addModal'));
  }

  function openAdd() {
    editingId = null;
    currentType = 'debit';
    document.getElementById('sheetTitle').textContent = 'Add Transaction';
    document.getElementById('txnName').value = '';
    document.getElementById('txnAmount').value = '';
    document.getElementById('txnCat').value = 'Point-of-Sale';
    const today = new Date();
    document.getElementById('txnDate').value = today.toISOString().slice(0,10);
    document.getElementById('deleteBtn').style.display = 'none';
    setType('debit');
    _getTxnModal().show();
    setTimeout(() => document.getElementById('txnName').focus(), 300);
  }

  function openEdit(id) {
    const t = activeAccount().transactions.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    currentType = t.type;
    document.getElementById('sheetTitle').textContent = 'Edit Transaction';
    document.getElementById('txnName').value = t.name;
    document.getElementById('txnAmount').value = t.amount;
    document.getElementById('txnCat').value = t.cat;
    document.getElementById('txnDate').value = t.date;
    document.getElementById('deleteBtn').style.display = '';
    setType(t.type);
    _getTxnModal().show();
  }

  function closeTxnModal() {
    _getTxnModal().hide();
  }

  function setType(type) {
    currentType = type;
    const db = document.getElementById('typeDebit');
    const cb = document.getElementById('typeCredit');
    db.className = 'type-btn' + (type === 'debit' ? ' active-debit' : '');
    cb.className = 'type-btn' + (type === 'credit' ? ' active-credit' : '');
  }

  function saveTxn() {
    const name = document.getElementById('txnName').value.trim();
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const cat = document.getElementById('txnCat').value;
    const date = document.getElementById('txnDate').value;
    if (!name) { showToast('Please enter a description'); return; }
    if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }
    if (!date) { showToast('Please select a date'); return; }

    if (editingId) {
      const txns = activeAccount().transactions;
      const idx = txns.findIndex(x => x.id === editingId);
      if (idx !== -1) txns[idx] = { ...txns[idx], name, amount, cat, date, type: currentType };
      showToast('Transaction updated');
    } else {
      activeAccount().transactions.push({ id: uid(), name, amount, cat, date, type: currentType });
      showToast('Transaction added');
    }
    save();
    closeTxnModal();
    renderAll();
  }

  function deleteCurrentTxn() {
    if (!editingId) return;
    if (!confirm('Delete this transaction?')) return;
    const acct = activeAccount();
    acct.transactions = acct.transactions.filter(x => x.id !== editingId);
    save();
    closeTxnModal();
    renderAll();
    showToast('Transaction deleted');
  }

  // ── Settings ───────────────────────────────────────────────────────────
  function openSettings() {
    const acct = activeAccount();
    document.getElementById('settingsAcctName').value = acct.name;
    document.getElementById('settingsAllocated').value = acct.allocated;
    document.getElementById('settingsMonth').value = state.activeMonth;
    document.getElementById('settingsYear').value = state.activeYear;
    document.getElementById('deleteAccountBtn').style.display = '';
    const isFirstTime = acct.allocated === 0 && acct.transactions.length === 0;
    document.getElementById('firstTimeImpex').style.display = isFirstTime ? '' : 'none';
    openOverlay('settingsOverlay');
  }

  function saveSettings() {
    const name = document.getElementById('settingsAcctName').value.trim();
    const alloc = parseFloat(document.getElementById('settingsAllocated').value);
    const month = parseInt(document.getElementById('settingsMonth').value);
    const year = parseInt(document.getElementById('settingsYear').value);
    if (!name) { showToast('Enter an account name'); return; }
    if (!alloc || alloc <= 0) { showToast('Enter a valid allocated amount'); return; }
    if (!year || year < 2020) { showToast('Enter a valid year'); return; }
    const acct = activeAccount();
    acct.name = name;
    acct.allocated = alloc;
    state.activeMonth = month;
    state.activeYear = year;
    save();
    closeOverlay('settingsOverlay');
    renderAll();
    showToast('Settings saved');
  }

  // ── Scroll lock ─────────────────────────────────────────────────────────
  let _lockScrollY = 0;
  let _scrollLocked = false;
  function _blockScroll(e) { e.preventDefault(); }
  function _blockScrollKeys(e) {
    const keys = [32, 33, 34, 35, 36, 38, 40];
    if (keys.includes(e.keyCode)) e.preventDefault();
  }
  function _resetScroll() {
    if (_scrollLocked) window.scrollTo(0, _lockScrollY);
  }
  function lockScroll() {
    if (_scrollLocked) return;
    _lockScrollY = window.scrollY;
    _scrollLocked = true;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.addEventListener('wheel', _blockScroll, { passive: false, capture: true });
    window.addEventListener('touchmove', _blockScroll, { passive: false, capture: true });
    window.addEventListener('keydown', _blockScrollKeys, { capture: true });
    window.addEventListener('scroll', _resetScroll, { capture: true });
  }
  function unlockScroll() {
    if (!_scrollLocked) return;
    _scrollLocked = false;
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    window.removeEventListener('wheel', _blockScroll, { capture: true });
    window.removeEventListener('touchmove', _blockScroll, { capture: true });
    window.removeEventListener('keydown', _blockScrollKeys, { capture: true });
    window.removeEventListener('scroll', _resetScroll, { capture: true });
    window.scrollTo(0, _lockScrollY);
  }

  // ── Overlay ────────────────────────────────────────────────────────────
  function openOverlay(id) { 
    document.getElementById(id).classList.add('open');
    lockScroll();
  }
  function closeOverlay(id) { 
    document.getElementById(id).classList.remove('open');
    unlockScroll();
  }
  function closeOnBackdrop(e, id) { if (e.target === document.getElementById(id)) closeOverlay(id); }

  // ── Toast ──────────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ── Accounts ────────────────────────────────────────────────────────────
  function openAddAccount() {
    document.getElementById('newAcctName').value = '';
    document.getElementById('newAcctAllocated').value = '';
    openOverlay('addAccountOverlay');
    setTimeout(() => document.getElementById('newAcctName').focus(), 300);
  }

  function saveAccount() {
    const name = document.getElementById('newAcctName').value.trim();
    const alloc = parseFloat(document.getElementById('newAcctAllocated').value);
    if (!name) { showToast('Enter an account name'); return; }
    if (!alloc || alloc <= 0) { showToast('Enter a valid allocated amount'); return; }
    const id = uid();
    state.accounts.push({ id, name, allocated: alloc, transactions: [] });
    state.activeAccountId = id;
    save();
    closeOverlay('addAccountOverlay');
    renderAll();
    showToast('Account created');
  }

  function openAccountSwitcher() {
    const dropdown = document.getElementById('acctDropdown');
    if (dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      unlockScroll();
      return;
    }
    renderAccountList();
    dropdown.classList.add('open');
    lockScroll();
  }

  function closeAccountDropdown() {
    document.getElementById('acctDropdown').classList.remove('open');
    unlockScroll();
  }

  function renderAccountList() {
    const list = document.getElementById('acctList');
    list.innerHTML = state.accounts.map(a => {
      const txns = a.transactions;
      const totalDebits = txns.filter(t => t.type !== 'credit').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
      const totalCredits = txns.filter(t => t.type === 'credit' && t.cat !== 'Transfer').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
      const totalSpent = Math.max(0, totalDebits - totalCredits - (a.resetOffset || 0));
      const rem = a.allocated - totalSpent;
      const active = a.id === state.activeAccountId;
      return `
        <div class="acct-item${active ? ' active' : ''}" onclick="switchAccount('${a.id}')">
          <div class="acct-item-icon"><i class="fa-regular fa-wallet"></i></div>
          <div class="acct-item-info">
            <div class="acct-item-name">${esc(a.name)}</div>
            <div class="acct-item-balance">${fmt(rem)} remaining</div>
          </div>
          ${active ? '<i class="fa-regular fa-check acct-item-check"></i>' : ''}
          <button class="acct-delete-btn" onclick="event.stopPropagation(); deleteAccount('${a.id}')" title="Delete account">
            <i class="fa-regular fa-trash"></i>
          </button>
        </div>`;
    }).join('');
  }

  function switchAccount(id) {
    if (!state.accounts.find(a => a.id === id)) return;
    state.activeAccountId = id;
    save();
    closeAccountDropdown();
    renderAll();
  }

  function resetMonth() {
    const acct = activeAccount();
    if (!confirm('Reset balance for "' + acct.name + '"? Transactions are kept but the balance will restart from today with SGD ' + acct.allocated.toFixed(2) + ' allocated.')) return;
    const txns = acct.transactions;
    const totalDebits = txns.filter(t => t.type !== 'credit').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
    const totalCredits = txns.filter(t => t.type === 'credit' && t.cat !== 'Transfer').reduce((s,t) => s + (parseFloat(t.amount) || 0), 0);
    acct.resetOffset = Math.max(0, totalDebits - totalCredits);
    save();
    renderAll();
    showToast('Balance reset! History preserved.');
  }

  function deleteAccount(id) {
    const targetId = id || state.activeAccountId;
    const acct = state.accounts.find(a => a.id === targetId);
    if (!acct) return;
    if (!confirm('Delete "' + acct.name + '" and all its transactions?')) return;
    state.accounts = state.accounts.filter(a => a.id !== targetId);
    if (state.accounts.length === 0) {
      state = defaultState();
    } else {
      if (state.activeAccountId === targetId) state.activeAccountId = state.accounts[0].id;
    }
    save();
    closeOverlay('settingsOverlay');
    closeAccountDropdown();
    renderAll();
    showToast('Account deleted');
  }

  // ── Bootstrap modal: lock <html> scroll (style.css sets overflow-x:hidden on html which breaks Bootstrap's own lock) ──
  (function () {
    const el = document.getElementById('addModal');
    if (!el) return;
    el.addEventListener('show.bs.modal', function () {
      document.documentElement.style.overflow = 'hidden';
    });
    el.addEventListener('hidden.bs.modal', function () {
      document.documentElement.style.overflow = '';
    });
  })();

  // ── Init ───────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    const btn = document.getElementById('acctSwitcherBtn');
    const dropdown = document.getElementById('acctDropdown');
    if (btn && !btn.contains(e.target) && dropdown && !dropdown.contains(e.target)) closeAccountDropdown();
  });

  renderAll();
  if (window.location.hash === '#addAccount') {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(openAddAccount, 100);
  }
  if (window.location.hash === '#addTransaction') {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(openAdd, 300);
  }

  // ── First-Time Guide ───────────────────────────────────────────────────
  let _guideStep = 1;
  const GUIDE_KEY = 'fintrack-guide-done';

  function guideTo(step) {
    const total = 3;
    _guideStep = step;
    for (let i = 1; i <= total; i++) {
      const s = document.getElementById('guideStep' + i);
      const d = document.getElementById('guideDot' + i);
      if (s) s.classList.toggle('active', i === step);
      if (d) d.classList.toggle('active', i === step);
    }
    const prevBtn = document.getElementById('guidePrevBtn');
    const nextBtn = document.getElementById('guideNextBtn');
    if (prevBtn) prevBtn.style.display = step > 1 ? '' : 'none';
    if (nextBtn) {
      if (step === total) {
        nextBtn.innerHTML = '<i class="fa-regular fa-check"></i> Get Started';
        nextBtn.onclick = guideFinish;
      } else {
        nextBtn.innerHTML = 'Next <i class="fa-regular fa-chevron-right"></i>';
        nextBtn.onclick = guideNext;
      }
    }
  }

  function guideNext() {
    if (_guideStep < 3) guideTo(_guideStep + 1);
    else guideFinish();
  }

  function guidePrev() {
    if (_guideStep > 1) guideTo(_guideStep - 1);
  }

  function guideFinish() {
    localStorage.setItem(GUIDE_KEY, '1');
    closeOverlay('guideOverlay');
    // Move install banner to bottom now that guide is done
    const banner = document.getElementById('fintrack-install-banner');
    if (banner) {
      banner.style.transition = 'top 0.4s ease, bottom 0.4s ease';
      banner.style.top = 'auto';
      banner.style.bottom = '0';
    }
  }

  // Show guide only on first visit
  if (!localStorage.getItem(GUIDE_KEY)) {
    guideTo(1);
    setTimeout(function () { openOverlay('guideOverlay'); }, 800);
  }

  // ── Month Tabs Scroll Indicator ─────────────────────────────────────────
  (function initScrollIndicator() {
    const container = document.getElementById('monthTabs');
    const indicator = document.getElementById('monthScrollIndicator');
    if (!container || !indicator) return;

    function updateScrollIndicator() {
      const hasScroll = container.scrollWidth > container.clientWidth;
      const isAtEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 10;
      if (hasScroll && !isAtEnd) {
        indicator.classList.add('visible');
      } else {
        indicator.classList.remove('visible');
      }
    }

    setTimeout(updateScrollIndicator, 150);
    window.addEventListener('resize', updateScrollIndicator);
    container.addEventListener('scroll', updateScrollIndicator);
    indicator.addEventListener('click', () => {
      container.scrollBy({ left: 150, behavior: 'smooth' });
    });

    window._updateMonthScrollIndicator = updateScrollIndicator;
  })();

  // ── Draggable Month Tabs (matches dstabs.js pattern) ─────────────────────
  (function initDraggableTabScroll() {
    const container = document.getElementById('monthTabs');
    if (!container) return;
    let isDown = false, startX, scrollLeft, lastTouchX = 0;

    container.addEventListener('mousedown', (e) => {
      isDown = true;
      container.classList.add('dragging');
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });
    container.addEventListener('mouseleave', () => { isDown = false; container.classList.remove('dragging'); });
    container.addEventListener('mouseup', () => { isDown = false; container.classList.remove('dragging'); });
    container.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 2;
      container.scrollLeft = scrollLeft - walk;
    });

    container.addEventListener('touchstart', (e) => {
      isDown = true;
      container.classList.add('dragging');
      startX = e.touches[0].pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      lastTouchX = e.touches[0].pageX;
    }, { passive: false });
    container.addEventListener('touchend', () => { isDown = false; container.classList.remove('dragging'); }, { passive: false });
    container.addEventListener('touchmove', (e) => {
      if (!isDown) return;
      const touchX = e.touches[0].pageX - container.offsetLeft;
      const walk = (touchX - startX) * 2;
      container.scrollLeft = scrollLeft - walk;
      if (Math.abs(e.touches[0].pageX - lastTouchX) > 5) e.preventDefault();
      lastTouchX = e.touches[0].pageX;
    }, { passive: false });
    
    container.addEventListener('scroll', updateMonthChevrons);
    window.addEventListener('resize', updateMonthChevrons);
    updateMonthChevrons();
  })();