 // ── State ──────────────────────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let state = load();
  let _lastState = null;
  function snapshot() { _lastState = JSON.parse(JSON.stringify(state)); }

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

  // Balance counts only transactions on/after the most recent reset date
  function calcAccountBalance(acct) {
    const txns = acct.transactions;
    const resets = txns.filter(t => t.type === 'reset').sort((a, b) => new Date(b.date) - new Date(a.date));
    const resetDate = resets.length ? resets[0].date : null;
    const eligible = txns.filter(t => t.type === 'debit' || (t.type === 'credit' && t.cat !== 'Transfer'));
    const active = resetDate ? eligible.filter(t => t.date >= resetDate) : eligible;
    const totalDebits = active.filter(t => t.type === 'debit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalCredits = active.filter(t => t.type === 'credit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalSpent = Math.max(0, totalDebits - totalCredits);
    return { totalSpent, remaining: acct.allocated - totalSpent };
  }

  function calcBalance() {
    return calcAccountBalance(activeAccount());
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
    el.innerHTML = `<span class="ft-greeting-text">${greet}</span>`;
  }

  function renderAccountSwitcher() {
    const el = document.getElementById('acctSwitcherName');
    if (el) el.textContent = activeAccount().name;
  }

  function renderMonthTabs() {
    const now = new Date();
    const cur = now.getMonth(), curY = now.getFullYear();
    const minYear = 2026, minMonth = 0; // Jan 2026
    // Extend range to include state.activeMonth/Year (e.g. after a reset to a future month)
    const maxY = Math.max(curY, state.activeYear);
    const maxM = (state.activeYear > curY || (state.activeYear === curY && state.activeMonth > cur))
      ? state.activeMonth : cur;
    const tabs = [];
    for (let y = minYear; y <= maxY; y++) {
      const startM = y === minYear ? minMonth : 0;
      const endM = y === maxY ? maxM : 11;
      for (let m = startM; m <= endM; m++) {
        tabs.push({ m, y });
      }
    }
    const container = document.getElementById('monthTabs');
    container.innerHTML = tabs.reverse().map(({m, y}) => {
      const active = m === state.activeMonth && y === state.activeYear;
      const label = y !== curY ? `${MONTHS[m]} '${String(y).slice(2)}` : MONTHS[m];
      return `<button class="month-btn${active?' active':''}" onclick="setMonth(${m},${y})">${label}</button>`;
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
          ${items.map(t => t.type === 'reset' ? `
            <div class="txn-item txn-item-reset">
              <div class="txn-icon income"><i class="fa-regular fa-rotate-right"></i></div>
              <div class="txn-info">
                <div class="txn-name">New Month Reset</div>
                <div class="txn-cat">Balance restarted from this point</div>
              </div>
              <div class="txn-reset-meta">
                <span class="txn-reset-day">${new Date(t.date + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' })}</span>
                <span class="txn-reset-date">${new Date(t.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>` : `
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
  function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
  function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-SG', { weekday:'short', day:'numeric', month:'short', year:'numeric' }).toUpperCase();
  }
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function iconClass(cat) {
    if (cat === 'Memberships') return 'atm';
    if (cat === 'Transfer') return 'income';
    if (cat === 'Bills') return 'bills';
    if (['Subscriptions','Memberships','Food','Transport'].includes(cat)) return 'pos';
    return 'other';
  }
  function iconEmoji(cat) {
    const map = {
      'Subscriptions': '<i class="fa-regular fa-credit-card"></i>',
      'Memberships':   '<i class="fa-regular fa-user"></i>',
      'Transfer':      '<i class="fa-regular fa-money-bill-transfer"></i>',
      'Bills':         '<i class="fa-regular fa-file-invoice"></i>',
      'Food':          '<i class="fa-regular fa-utensils"></i>',
      'Transport':     '<i class="fa-regular fa-bus"></i>',
      'Others':        '<i class="fa-regular fa-money-bill"></i>'
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
    document.getElementById('addToCmtRow').style.display = 'none';
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
    document.getElementById('addToCmtRow').style.display = '';
    _updateAddToCmtBtn(t.name);
    setType(t.type);
    _getTxnModal().show();
  }

  function _updateAddToCmtBtn(name) {
    const btn = document.getElementById('addToCmtBtn');
    if (!btn) return;
    const exists = activeCommitments().some(
      c => c.name.trim().toLowerCase() === (name || '').trim().toLowerCase()
    );
    btn.disabled = exists;
    btn.innerHTML = exists
      ? '<i class="fa-regular fa-check"></i>&nbsp;In Commitments'
      : '<i class="fa-regular fa-list-check"></i>&nbsp;Add to Commitments';
  }

  function addTxnToCommitments() {
    const name = document.getElementById('txnName').value.trim();
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const cat = document.getElementById('txnCat').value;
    if (!name || !amount || amount <= 0) { showToast('Fill in description and amount first'); return; }
    const cmts = activeCommitments();
    if (cmts.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) {
      _updateAddToCmtBtn(name);
      showToast('Already in Commitments');
      return;
    }
    cmts.push({ id: uid(), name, amount, cat });
    save();
    _updateAddToCmtBtn(name);
    showToast(`"${name}" added to Commitments`);
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

    snapshot();
    if (editingId) {
      const txns = activeAccount().transactions;
      const idx = txns.findIndex(x => x.id === editingId);
      if (idx !== -1) txns[idx] = { ...txns[idx], name, amount, cat, date, type: currentType };
      showToast('Transaction updated', true);
    } else {
      activeAccount().transactions.push({ id: uid(), name, amount, cat, date, type: currentType });
      showToast('Transaction added', true);
    }
    save();
    closeTxnModal();
    renderAll();
  }

  function deleteCurrentTxn() {
    if (!editingId) return;
    if (!confirm('Delete this transaction?')) return;
    snapshot();
    const acct = activeAccount();
    acct.transactions = acct.transactions.filter(x => x.id !== editingId);
    save();
    closeTxnModal();
    renderAll();
    showToast('Transaction deleted', true);
  }

  // ── Commitments ────────────────────────────────────────────────────────
  let editingCommitmentId = null;

  function activeCommitments() {
    const acct = activeAccount();
    if (!acct.commitments) acct.commitments = [];
    return acct.commitments;
  }

  function paidCommitmentIds() {
    // Returns a map of commitmentId -> transactionId for the active month
    const txns = filteredTxns();
    const map = {};
    // First pass: explicitly linked transactions
    txns.forEach(t => { if (t.commitmentId) map[t.commitmentId] = t.id; });
    // Second pass: match pre-existing debit transactions by name (case-insensitive).
    // Also catches transactions whose commitmentId points to a deleted commitment (orphaned).
    const cmts = activeCommitments();
    const activeCmtIds = new Set(cmts.map(c => c.id));
    cmts.forEach(c => {
      if (!map[c.id]) {
        const match = txns.find(t =>
          t.type === 'debit' &&
          (!t.commitmentId || !activeCmtIds.has(t.commitmentId)) &&
          (t.name || '').trim().toLowerCase() === c.name.trim().toLowerCase()
        );
        if (match) map[c.id] = match.id;
      }
    });
    return map;
  }

  function _getCmtModal() {
    return bootstrap.Modal.getOrCreateInstance(document.getElementById('commitmentsModal'));
  }

  function closeCmtModal() {
    _getCmtModal().hide();
  }

  function closeCmtForm() {
    document.getElementById('cmtPanelForm').style.display = 'none';
    document.getElementById('cmtPanelList').style.display = '';
    renderCommitments();
  }

  function openCommitments() {
    renderCommitments();
    document.getElementById('cmtPanelList').style.display = '';
    document.getElementById('cmtPanelForm').style.display = 'none';
    _getCmtModal().show();
  }

  function renderCommitments() {
    const cmts = activeCommitments();
    const paid = paidCommitmentIds();
    const wrap = document.getElementById('cmtListWrap');
    const summary = document.getElementById('cmtSummary');
    const summaryText = document.getElementById('cmtSummaryText');

    const paidCount = cmts.filter(c => paid[c.id]).length;
    if (cmts.length > 0 && paidCount > 0) {
      summary.style.display = '';
      summaryText.textContent = `${paidCount} of ${cmts.length} paid this month`;
    } else {
      summary.style.display = 'none';
    }

    if (!cmts.length) {
      wrap.innerHTML = `<div class="cmt-empty"><i class="fa-regular fa-list-check"></i>No commitments yet. Add your recurring bills below.</div>`;
      return;
    }

    const unpaid = cmts.filter(c => !paid[c.id]);
    const paidList = cmts.filter(c => paid[c.id]);

    let html = '';
    if (unpaid.length) {
      html += `<div class="cmt-section-label">Unpaid</div><div class="cmt-list">`;
      html += unpaid.map(c => cmtItemHTML(c, false)).join('');
      html += `</div>`;
    }
    if (paidList.length) {
      html += `<div class="cmt-section-label">Paid</div><div class="cmt-list">`;
      html += paidList.map(c => cmtItemHTML(c, true)).join('');
      html += `</div>`;
    }
    wrap.innerHTML = html;
  }

  function nextPaymentInfo(c, isPaid) {
    const acct = activeAccount();
    let dayOfMonth = c.deductDay || null;
    if (!dayOfMonth) {
      // Infer day from the most recent paid transaction for this commitment
      const related = acct.transactions
        .filter(t => t.type === 'debit' && (t.commitmentId === c.id || t.name.trim().toLowerCase() === c.name.trim().toLowerCase()))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      if (related.length) dayOfMonth = new Date(related[0].date + 'T00:00:00').getDate();
    }
    if (!dayOfMonth) return null;
    let m = state.activeMonth, y = state.activeYear;
    if (isPaid) { m += 1; if (m > 11) { m = 0; y++; } }
    const maxDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dayOfMonth, maxDay);
    return new Date(y, m, day).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  }

  function cmtItemHTML(c, isPaid) {
    const dateLabel = nextPaymentInfo(c, isPaid);
    const dateHtml = dateLabel
      ? (isPaid
          ? `<div class="cmt-next-date next"><i class="fa-regular fa-rotate-right"></i> Next ${dateLabel}</div>`
          : `<div class="cmt-next-date due"><i class="fa-regular fa-calendar"></i> Due ${dateLabel}</div>`)
      : '';
    return `
      <div class="cmt-item${isPaid ? ' paid' : ''}" onclick="toggleCommitment('${c.id}')">
        <div class="cmt-checkbox">${isPaid ? '<i class="fa-solid fa-check"></i>' : ''}</div>
        <div class="cmt-info">
          <div class="cmt-name">${esc(c.name)}</div>
          <div class="cmt-cat">${esc(c.cat)}</div>
          ${dateHtml}
        </div>
        <div class="cmt-amount">−${fmt(c.amount)}</div>
        <button class="cmt-edit-btn" onclick="event.stopPropagation(); openAddCommitment('${c.id}')" title="Edit">
          <i class="fa-regular fa-pen"></i>
        </button>
      </div>`;
  }

  function toggleCommitment(id) {
    const cmt = activeCommitments().find(c => c.id === id);
    if (!cmt) return;
    const paid = paidCommitmentIds();
    snapshot();
    if (paid[id]) {
      // Uncheck: remove linked transaction
      const acct = activeAccount();
      acct.transactions = acct.transactions.filter(t => t.id !== paid[id]);
      showToast(`"${cmt.name}" removed from transactions`, true);
    } else {
      // Check: add a debit transaction using deductDay, today, or last day of active month
      const now = new Date();
      let txnDate;
      if (cmt.deductDay) {
        const maxDay = new Date(state.activeYear, state.activeMonth + 1, 0).getDate();
        const day = Math.min(cmt.deductDay, maxDay);
        txnDate = `${state.activeYear}-${String(state.activeMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      } else if (now.getMonth() === state.activeMonth && now.getFullYear() === state.activeYear) {
        txnDate = now.toISOString().slice(0, 10);
      } else {
        // Use last day of the active month
        txnDate = new Date(state.activeYear, state.activeMonth + 1, 0).toISOString().slice(0, 10);
      }
      activeAccount().transactions.push({
        id: uid(),
        name: cmt.name,
        amount: cmt.amount,
        cat: cmt.cat,
        date: txnDate,
        type: 'debit',
        commitmentId: id
      });
      showToast(`"${cmt.name}" added to transactions`, true);
    }
    save();
    renderCommitments();
    renderAll();
  }

  function openAddCommitment(id) {
    editingCommitmentId = id;
    const title = document.getElementById('cmtFormTitle');
    const deleteBtn = document.getElementById('deleteCmtBtn');
    if (id) {
      const cmt = activeCommitments().find(c => c.id === id);
      if (!cmt) return;
      title.innerHTML = '<i class="fa-regular fa-pen"></i>&nbsp;Edit Commitment';
      document.getElementById('cmtName').value = cmt.name;
      document.getElementById('cmtAmount').value = cmt.amount;
      document.getElementById('cmtCat').value = cmt.cat;
      document.getElementById('cmtDeductDay').value = cmt.deductDay || '';
      deleteBtn.style.display = '';
    } else {
      title.innerHTML = '<i class="fa-regular fa-plus"></i>&nbsp;New Commitment';
      document.getElementById('cmtName').value = '';
      document.getElementById('cmtAmount').value = '';
      document.getElementById('cmtCat').value = 'Subscriptions';
      document.getElementById('cmtDeductDay').value = '';
      deleteBtn.style.display = 'none';
    }
    document.getElementById('cmtPanelList').style.display = 'none';
    document.getElementById('cmtPanelForm').style.display = '';
    setTimeout(() => document.getElementById('cmtName').focus(), 100);
  }

  function saveCommitment() {
    const name = document.getElementById('cmtName').value.trim();
    const amount = parseFloat(document.getElementById('cmtAmount').value);
    const cat = document.getElementById('cmtCat').value;
    const deductDay = parseInt(document.getElementById('cmtDeductDay').value) || null;
    if (!name) { showToast('Enter a commitment name'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    if (deductDay !== null && (deductDay < 1 || deductDay > 31)) { showToast('Deduction day must be 1–31'); return; }

    snapshot();
    const cmts = activeCommitments();
    if (editingCommitmentId) {
      const idx = cmts.findIndex(c => c.id === editingCommitmentId);
      if (idx !== -1) {
        cmts[idx] = { ...cmts[idx], name, amount, cat, deductDay };
        // Update any linked transaction in the active month
        const paid = paidCommitmentIds();
        if (paid[editingCommitmentId]) {
          const txn = activeAccount().transactions.find(t => t.id === paid[editingCommitmentId]);
          if (txn) {
            txn.name = name; txn.amount = amount; txn.cat = cat;
            if (deductDay) {
              const maxDay = new Date(state.activeYear, state.activeMonth + 1, 0).getDate();
              const day = Math.min(deductDay, maxDay);
              txn.date = `${state.activeYear}-${String(state.activeMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            }
          }
        }
      }
      showToast('Commitment updated', true);
    } else {
      cmts.push({ id: uid(), name, amount, cat, deductDay });
      showToast('Commitment added', true);
    }
    save();
    closeCmtForm();
    renderAll();
  }

  function deleteCurrentCommitment() {
    if (!editingCommitmentId) return;
    const cmt = activeCommitments().find(c => c.id === editingCommitmentId);
    if (!confirm(`Delete commitment "${cmt ? cmt.name : ''}"?`)) return;
    snapshot();
    const acct = activeAccount();
    acct.commitments = acct.commitments.filter(c => c.id !== editingCommitmentId);
    save();
    closeCmtForm();
    showToast('Commitment deleted', true);
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
    snapshot();
    const acct = activeAccount();
    acct.name = name;
    acct.allocated = alloc;
    state.activeMonth = month;
    state.activeYear = year;
    save();
    closeOverlay('settingsOverlay');
    renderAll();
    showToast('Settings saved', true);
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
  function showToast(msg, undoable) {
    const el = document.getElementById('toast');
    el.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (undoable && _lastState) {
      const btn = document.createElement('button');
      btn.className = 'toast-undo-btn';
      btn.textContent = 'Undo';
      btn.onclick = undoLast;
      el.appendChild(btn);
      el.style.pointerEvents = 'auto';
    } else {
      el.style.pointerEvents = 'none';
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      el.style.pointerEvents = 'none';
    }, undoable ? 4000 : 2200);
  }

  function undoLast() {
    if (!_lastState) return;
    state = _lastState;
    _lastState = null;
    save();
    renderAll();
    clearTimeout(toastTimer);
    const el = document.getElementById('toast');
    el.classList.remove('show');
    el.style.pointerEvents = 'none';
    setTimeout(() => showToast('Reverted changes'), 150);
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
    snapshot();
    const id = uid();
    state.accounts.push({ id, name, allocated: alloc, transactions: [] });
    state.activeAccountId = id;
    save();
    closeOverlay('addAccountOverlay');
    renderAll();
    showToast('Account created', true);
  }

  function openAccountSwitcher() {
    const dropdown = document.getElementById('acctDropdown');
    const overlay = document.getElementById('acctDropdownOverlay');
    if (dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      overlay.classList.remove('open');
      unlockScroll();
      return;
    }
    renderAccountList();
    dropdown.classList.add('open');
    overlay.classList.add('open');
    lockScroll();
  }

  function closeAccountDropdown() {
    document.getElementById('acctDropdown').classList.remove('open');
    document.getElementById('acctDropdownOverlay').classList.remove('open');
    unlockScroll();
  }

  function renderAccountList() {
    const list = document.getElementById('acctList');
    list.innerHTML = state.accounts.map(a => {
      const { totalSpent, remaining: rem } = calcAccountBalance(a);
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

  function _getResetModal() {
    return bootstrap.Modal.getOrCreateInstance(document.getElementById('resetModal'));
  }

  function resetMonth() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('resetDate').value = today;
    _getResetModal().show();
  }

  function closeResetModal() {
    _getResetModal().hide();
  }

  function confirmReset() {
    const dateVal = document.getElementById('resetDate').value;
    if (!dateVal) { showToast('Please select a date'); return; }
    snapshot();
    const acct = activeAccount();
    acct.transactions.push({ id: uid(), date: dateVal, type: 'reset', name: 'New Month Reset', amount: 0, cat: '' });
    // Switch active month to the reset date so it's reflected in Transaction History
    const resetDt = new Date(dateVal + 'T00:00:00');
    state.activeMonth = resetDt.getMonth();
    state.activeYear = resetDt.getFullYear();
    save();
    closeResetModal();
    renderAll();
    showToast('Balance reset! History preserved.', true);
  }

  function deleteAccount(id) {
    const targetId = id || state.activeAccountId;
    const acct = state.accounts.find(a => a.id === targetId);
    if (!acct) return;
    if (!confirm('Delete "' + acct.name + '" and all its transactions?')) return;
    snapshot();
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
    showToast('Account deleted', true);
  }

  // ── Bootstrap modal: lock <html> scroll (style.css sets overflow-x:hidden on html which breaks Bootstrap's own lock) ──
  (function () {
    ['addModal', 'commitmentsModal', 'resetModal'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('show.bs.modal', function () {
        document.documentElement.style.overflow = 'hidden';
      });
      el.addEventListener('hidden.bs.modal', function () {
        document.documentElement.style.overflow = '';
      });
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
        nextBtn.innerHTML = '<i class="fa-regular fa-check"></i> Done';
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