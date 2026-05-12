// ── Storage Key ───────────────────────────────────────────────────────────
const GR_STORAGE_KEY = 'fintrack-group-split';

// ── Avatar gradients ──────────────────────────────────────────────────────
const GR_GRADIENTS = [
    'linear-gradient(135deg, #42c07e 0%, #239690 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
    'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
];

// ── Helpers ───────────────────────────────────────────────────────────────
function grUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function grFmt(n) { return 'SGD ' + parseFloat(n || 0).toFixed(2); }
function grFmtShort(n) { return '$' + parseFloat(n || 0).toFixed(2); }
function grEsc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── State ─────────────────────────────────────────────────────────────────
function grDefaultState() { return { activeSessionId: null, sessions: [] }; }

function grLoadState() {
    try {
        const raw = localStorage.getItem(GR_STORAGE_KEY);
        const s = JSON.parse(raw);
        return (s && Array.isArray(s.sessions)) ? s : grDefaultState();
    } catch { return grDefaultState(); }
}

function grSaveState() {
    localStorage.setItem(GR_STORAGE_KEY, JSON.stringify(grState));
}

let grState = grLoadState();
let grEditingSessionId = null;
let grEditingItemId = null;

function grActiveSession() {
    if (!grState.sessions.length) return null;
    return grState.sessions.find(s => s.id === grState.activeSessionId) || grState.sessions[0];
}

// ── Computed ──────────────────────────────────────────────────────────────
function grItemTotal(item) {
    return (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1);
}

function grPersonShare(item, personIdx) {
    if (item.included[personIdx] === false) return 0;
    const count = item.included.filter(v => v !== false).length;
    if (count === 0) return 0;
    return grItemTotal(item) / count;
}

function grPersonTotal(session, personIdx) {
    return (session.items || []).reduce((sum, item) => sum + grPersonShare(item, personIdx), 0);
}

function grGrandTotal(session) {
    return (session.items || []).reduce((sum, item) => sum + grItemTotal(item), 0);
}

// ── Render ────────────────────────────────────────────────────────────────
function grRenderAll() {
    grRenderGreeting();
    grRenderSwitcherName();
    grRenderCoverBadge();
    grRenderPeopleBar();
    grRenderContent();
}

function grRenderGreeting() {
    const el = document.getElementById('grGreeting');
    if (!el) return;
    const h = new Date().getHours();
    let greet;
    if (h >= 5 && h < 12) greet = 'Good Morning!';
    else if (h >= 12 && h < 18) greet = 'Good Afternoon!';
    else if (h >= 18 && h < 22) greet = 'Good Evening!';
    else greet = 'Good Night!';
    el.innerHTML = `<span class="ft-greeting-text">${greet}</span>`;
}

function grRenderSwitcherName() {
    const sess = grActiveSession();
    const el = document.getElementById('sessionSwitcherName');
    if (el) el.textContent = sess ? sess.name : 'No Sessions Yet';
}

function grRenderCoverBadge() {
    const sess = grActiveSession();
    const el = document.getElementById('grCoverBadge');
    if (!el) return;
    if (!sess || !(sess.items || []).length) { el.innerHTML = ''; return; }
    const total = grGrandTotal(sess);
    el.innerHTML = `<div class="gr-total-badge">
        <i class="fa-regular fa-receipt"></i>
        Total: ${grFmt(total)}
    </div>`;
}

function grRenderPeopleBar() {
    const sess = grActiveSession();
    const bar = document.getElementById('grPeopleBar');
    if (!bar) return;

    if (!sess) {
        bar.innerHTML = `<span style="font-size:0.82rem; color:#9ca3af;">Create a session to get started.</span>`;
        return;
    }

    let html = '';
    (sess.people || []).forEach((name, idx) => {
        html += `<div class="gr-person-chip" onclick="grOpenEditPerson(${idx})" style="cursor:pointer;">
            ${grEsc(name)}
            <button class="chip-remove" onclick="event.stopPropagation(); grRemovePerson(${idx})" title="Remove ${grEsc(name)}">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>`;
    });

    html += `<button class="gr-add-person-btn" onclick="grOpenPersonModal()">
        <i class="fa-regular fa-user-plus"></i>&nbsp;Add
    </button>`;

    bar.innerHTML = html;
}

function grRenderContent() {
    const sess = grActiveSession();

    // Grand total card
    const grandCard = document.getElementById('grGrandTotalCard');
    const grandAmt = document.getElementById('grGrandTotalAmt');
    if (grandCard) {
        const hasItems = sess && (sess.items || []).length > 0;
        grandCard.style.display = hasItems ? '' : 'none';
        if (hasItems && grandAmt) grandAmt.textContent = grFmt(grGrandTotal(sess));
    }

    grRenderItemsList(sess);
    grRenderPersonCards(sess);
}

function grRenderItemsList(sess) {
    const wrap = document.getElementById('grItemsList');
    if (!wrap) return;

    if (!sess || !(sess.items || []).length) {
        wrap.innerHTML = `<div class="empty-state">
            <i class="fa-regular fa-cart-shopping"></i>
            <div>${!sess ? 'Create a session to get started.' : 'Add items to split the bill.'}</div>
        </div>`;
        return;
    }

    let html = '<div class="txn-group-card">';
    sess.items.forEach(item => {
        const total = grItemTotal(item);
        const count = (item.included || []).filter(v => v !== false).length;
        html += `<div class="txn-item" onclick="grOpenEditItem('${item.id}')">
            <div class="txn-icon" style="background:#f0fdf4;">
                <i class="fa-regular fa-utensils" style="color:#16a34a;"></i>
            </div>
            <div class="txn-info">
                <div class="txn-name">${grEsc(item.name)}</div>
                <div class="txn-cat">${grFmtShort(item.price)} &times; ${item.qty} &bull; ${count} ${count === 1 ? 'person' : 'people'}</div>
            </div>
            <div class="txn-amount debit">${grFmtShort(total)}</div>
        </div>`;
    });
    html += '</div>';
    wrap.innerHTML = html;
}

function grRenderPersonCards(sess) {
    const wrap = document.getElementById('grPersonCards');
    const section = document.getElementById('grSummarySection');
    if (!wrap || !section) return;

    if (!sess || !(sess.people || []).length || !(sess.items || []).length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    let html = '';

    (sess.people || []).forEach((name, pIdx) => {
        const total = grPersonTotal(sess, pIdx);
        const gradient = GR_GRADIENTS[pIdx % GR_GRADIENTS.length];
        const initial = name.charAt(0).toUpperCase();

        const breakdownRows = (sess.items || [])
            .filter(item => (item.included || [])[pIdx] !== false)
            .map(item => {
                const share = grPersonShare(item, pIdx);
                return `<div class="gr-person-breakdown-row">
                    <span class="gr-person-breakdown-name">${grEsc(item.name)}</span>
                    <span class="gr-person-breakdown-amount">${grFmtShort(share)}</span>
                </div>`;
            }).join('');
            

        html += `<div class="gr-person-card collapsed" id="grPersonCard-${pIdx}">
            <div class="gr-person-card-header" onclick="grTogglePersonCard(${pIdx})">
                <div class="gr-person-avatar" style="background:${gradient}">${initial}</div>
                <div class="gr-person-card-info">
                    <div class="gr-person-card-name">${grEsc(name)}</div>
                </div>
                <div class="gr-person-card-total">${grFmt(total)}</div>
                <i class="fa-regular fa-chevron-down gr-person-card-chevron"></i>
            </div>
            <div class="gr-person-card-body">
                ${breakdownRows || `<div style="color:#9ca3af; font-size:0.82rem; padding:8px 0;">Not sharing any items</div>`}
            </div>
        </div>`;
    });

    wrap.innerHTML = html;
}

function grTogglePersonCard(idx) {
    const card = document.getElementById(`grPersonCard-${idx}`);
    if (card) card.classList.toggle('collapsed');
}

// ── Session Dropdown ──────────────────────────────────────────────────────
function openSessionDropdown() {
    const dropdown = document.getElementById('sessionDropdown');
    const overlay = document.getElementById('sessionDropdownOverlay');
    const list = document.getElementById('sessionList');
    list.innerHTML = '';

    const active = grActiveSession();
    if (grState.sessions.length) {
        grState.sessions.forEach(s => {
            const isActive = active && s.id === active.id;
            const div = document.createElement('div');
            div.className = 'acct-item' + (isActive ? ' active' : '');
            div.innerHTML = `
                <div class="acct-item-info" style="flex:1; min-width:0;">
                    <div class="acct-item-name">${grEsc(s.name)}</div>
                    <div class="acct-item-balance">${(s.people || []).length} people &bull; ${(s.items || []).length} items</div>
                </div>
                ${isActive ? '<span class="acct-item-check"><i class="fa-solid fa-check"></i></span>' : ''}
                <button onclick="event.stopPropagation(); closeSessionDropdown(); grOpenEditSession('${s.id}');"
                    style="background:none; border:none; cursor:pointer; color:#9ca3af; padding:4px 8px; font-size:0.8rem; border-radius:8px; flex-shrink:0;">
                    <i class="fa-regular fa-pen"></i>
                </button>`;
            div.querySelector('.acct-item-info').addEventListener('click', () => {
                grState.activeSessionId = s.id;
                grSaveState();
                closeSessionDropdown();
                grRenderAll();
            });
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<div style="padding:12px 16px; color:#9ca3af; font-size:0.85rem; text-align:center;">No sessions yet.</div>';
    }

    dropdown.classList.add('open');
    overlay.style.cssText = 'opacity:1; visibility:visible; pointer-events:all;';
}

function closeSessionDropdown() {
    document.getElementById('sessionDropdown').classList.remove('open');
    const overlay = document.getElementById('sessionDropdownOverlay');
    overlay.style.cssText = 'opacity:0; visibility:hidden; pointer-events:none;';
}

// ── Session Modal ─────────────────────────────────────────────────────────
let grSessionModal;

function openAddSession() {
    grEditingSessionId = null;
    document.getElementById('sessionSheetTitle').innerHTML = '<i class="fa-regular fa-users"></i>&nbsp;New Session';
    document.getElementById('sessionNameInput').value = '';
    document.getElementById('deleteSessionBtn').style.display = 'none';
    if (!grSessionModal) grSessionModal = new bootstrap.Modal(document.getElementById('sessionModal'));
    grSessionModal.show();
    setTimeout(() => document.getElementById('sessionNameInput').focus(), 400);
}

function grOpenEditSession(id) {
    const sess = grState.sessions.find(s => s.id === id);
    if (!sess) return;
    grEditingSessionId = id;
    document.getElementById('sessionSheetTitle').innerHTML = '<i class="fa-regular fa-users"></i>&nbsp;Edit Session';
    document.getElementById('sessionNameInput').value = sess.name;
    document.getElementById('deleteSessionBtn').style.display = 'flex';
    if (!grSessionModal) grSessionModal = new bootstrap.Modal(document.getElementById('sessionModal'));
    grSessionModal.show();
    setTimeout(() => document.getElementById('sessionNameInput').focus(), 400);
}

function saveSession() {
    const name = document.getElementById('sessionNameInput').value.trim();
    if (!name) { grShowToast('Please enter a session name'); return; }

    if (grEditingSessionId) {
        const sess = grState.sessions.find(s => s.id === grEditingSessionId);
        if (sess) sess.name = name;
    } else {
        const newSess = { id: grUid(), name, people: [], items: [] };
        grState.sessions.push(newSess);
        grState.activeSessionId = newSess.id;
    }

    grSaveState();
    closeSessionModal();
    grRenderAll();
    grShowToast(grEditingSessionId ? 'Session updated' : 'Session created');
}

function deleteSession() {
    if (!grEditingSessionId) return;
    const idx = grState.sessions.findIndex(s => s.id === grEditingSessionId);
    if (idx === -1) return;
    grState.sessions.splice(idx, 1);
    grState.activeSessionId = grState.sessions.length ? grState.sessions[0].id : null;
    grSaveState();
    closeSessionModal();
    grRenderAll();
    grShowToast('Session deleted');
}

function closeSessionModal() {
    if (grSessionModal) grSessionModal.hide();
}

// ── Person Modal ──────────────────────────────────────────────────────────
let grPersonModal;
let grEditingPersonIdx = null;

function grOpenPersonModal() {
    const sess = grActiveSession();
    if (!sess) { grShowToast('Create a session first'); return; }
    grEditingPersonIdx = null;
    document.getElementById('personSheetTitle').innerHTML = '<i class="fa-regular fa-user-plus"></i>&nbsp;Add Person';
    document.getElementById('personNameInput').value = '';
    document.getElementById('deletePersonBtn').style.display = 'none';
    if (!grPersonModal) grPersonModal = new bootstrap.Modal(document.getElementById('personModal'));
    grPersonModal.show();
    setTimeout(() => document.getElementById('personNameInput').focus(), 400);
}

function grOpenEditPerson(idx) {
    const sess = grActiveSession();
    if (!sess) return;
    grEditingPersonIdx = idx;
    document.getElementById('personSheetTitle').innerHTML = '<i class="fa-regular fa-user-pen"></i>&nbsp;Edit Person';
    document.getElementById('personNameInput').value = sess.people[idx];
    document.getElementById('deletePersonBtn').style.display = 'flex';
    if (!grPersonModal) grPersonModal = new bootstrap.Modal(document.getElementById('personModal'));
    grPersonModal.show();
    setTimeout(() => document.getElementById('personNameInput').focus(), 400);
}

function savePerson() {
    const sess = grActiveSession();
    if (!sess) return;
    const name = document.getElementById('personNameInput').value.trim();
    if (!name) { grShowToast('Please enter a name'); return; }

    if (grEditingPersonIdx !== null) {
        // Editing existing
        const oldName = sess.people[grEditingPersonIdx];
        if (name !== oldName && sess.people.includes(name)) { grShowToast('Name already in list'); return; }
        sess.people[grEditingPersonIdx] = name;
        grSaveState();
        closePersonModal();
        grRenderAll();
        grShowToast('Name updated');
    } else {
        // Adding new
        if (sess.people.includes(name)) { grShowToast('Name already in list'); return; }
        sess.people.push(name);
        sess.items.forEach(item => {
            while (item.included.length < sess.people.length) item.included.push(true);
        });
        grSaveState();
        closePersonModal();
        grRenderAll();
    }
}

function deletePerson() {
    const sess = grActiveSession();
    if (!sess || grEditingPersonIdx === null) return;
    const name = sess.people[grEditingPersonIdx];
    sess.people.splice(grEditingPersonIdx, 1);
    sess.items.forEach(item => item.included.splice(grEditingPersonIdx, 1));
    grSaveState();
    closePersonModal();
    grRenderAll();
    grShowToast(`${name} removed`);
}

function grRemovePerson(idx) {
    const sess = grActiveSession();
    if (!sess) return;
    const name = sess.people[idx];
    sess.people.splice(idx, 1);
    sess.items.forEach(item => item.included.splice(idx, 1));
    grSaveState();
    grRenderAll();
    grShowToast(`${name} removed`);
}

function closePersonModal() {
    if (grPersonModal) grPersonModal.hide();
}

// ── Item Modal ────────────────────────────────────────────────────────────
let grItemModal;

function grPopulateItemPeopleToggles(sess, editingItem) {
    const group = document.getElementById('itemPeopleGroup');
    const container = document.getElementById('itemPeopleCheckboxes');
    if (!group || !container) return;

    if (!sess || !(sess.people || []).length) {
        group.style.display = 'none';
        return;
    }

    group.style.display = '';
    let html = '';
    sess.people.forEach((name, idx) => {
        const checked = editingItem ? editingItem.included[idx] !== false : true;
        html += `<div class="gr-person-toggle-row ${checked ? 'checked' : ''}"
                     id="grToggleRow-${idx}"
                     data-checked="${checked}"
                     onclick="grToggleRow(${idx})">
            <span class="gr-toggle-name">${grEsc(name)}</span>
            <span class="gr-toggle-check">
                ${checked ? '<i class="fa-solid fa-check" style="font-size:0.7rem;"></i>' : ''}
            </span>
        </div>`;
    });
    container.innerHTML = html;
}

function grToggleRow(idx) {
    const row = document.getElementById(`grToggleRow-${idx}`);
    if (!row) return;
    const newChecked = row.dataset.checked !== 'true';
    row.dataset.checked = String(newChecked);
    row.classList.toggle('checked', newChecked);
    const checkSpan = row.querySelector('.gr-toggle-check');
    if (checkSpan) checkSpan.innerHTML = newChecked ? '<i class="fa-solid fa-check" style="font-size:0.7rem;"></i>' : '';
}

function openAddItem() {
    const sess = grActiveSession();
    if (!sess) { grShowToast('Create a session first'); return; }
    grEditingItemId = null;
    document.getElementById('itemSheetTitle').innerHTML = '<i class="fa-regular fa-cart-shopping"></i>&nbsp;Add Item';
    document.getElementById('itemNameInput').value = '';
    document.getElementById('itemPriceInput').value = '';
    document.getElementById('itemQtyInput').value = '1';
    document.getElementById('deleteItemBtn').style.display = 'none';
    grPopulateItemPeopleToggles(sess, null);
    if (!grItemModal) grItemModal = new bootstrap.Modal(document.getElementById('itemModal'));
    grItemModal.show();
    setTimeout(() => document.getElementById('itemNameInput').focus(), 400);
}

function grOpenEditItem(id) {
    const sess = grActiveSession();
    if (!sess) return;
    const item = sess.items.find(i => i.id === id);
    if (!item) return;
    grEditingItemId = id;
    document.getElementById('itemSheetTitle').innerHTML = '<i class="fa-regular fa-cart-shopping"></i>&nbsp;Edit Item';
    document.getElementById('itemNameInput').value = item.name;
    document.getElementById('itemPriceInput').value = item.price;
    document.getElementById('itemQtyInput').value = item.qty;
    document.getElementById('deleteItemBtn').style.display = 'flex';
    grPopulateItemPeopleToggles(sess, item);
    if (!grItemModal) grItemModal = new bootstrap.Modal(document.getElementById('itemModal'));
    grItemModal.show();
    setTimeout(() => document.getElementById('itemNameInput').focus(), 400);
}

function saveItem() {
    const sess = grActiveSession();
    if (!sess) return;
    const name = document.getElementById('itemNameInput').value.trim();
    const price = parseFloat(document.getElementById('itemPriceInput').value);
    const qty = Math.max(1, parseInt(document.getElementById('itemQtyInput').value) || 1);

    if (!name) { grShowToast('Please enter an item name'); return; }
    if (isNaN(price) || price < 0) { grShowToast('Please enter a valid price'); return; }

    const included = (sess.people || []).map((_, idx) => {
        const row = document.getElementById(`grToggleRow-${idx}`);
        return row ? row.dataset.checked !== 'false' : true;
    });

    if (grEditingItemId) {
        const item = sess.items.find(i => i.id === grEditingItemId);
        if (item) { item.name = name; item.price = price; item.qty = qty; item.included = included; }
    } else {
        sess.items.push({ id: grUid(), name, price, qty, included });
    }

    grSaveState();
    closeItemModal();
    grRenderAll();
    grShowToast(grEditingItemId ? 'Item updated' : 'Item added');
}

function deleteItem() {
    const sess = grActiveSession();
    if (!sess || !grEditingItemId) return;
    const idx = sess.items.findIndex(i => i.id === grEditingItemId);
    if (idx !== -1) sess.items.splice(idx, 1);
    grSaveState();
    closeItemModal();
    grRenderAll();
    grShowToast('Item deleted');
}

function closeItemModal() {
    if (grItemModal) grItemModal.hide();
}

// ── Toast ─────────────────────────────────────────────────────────────────
function grShowToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── First-Time Guide ──────────────────────────────────────────────────────
const GR_GUIDE_KEY = 'fintrack-gr-guide-done';
let _grGuideStep = 1;
const GR_GUIDE_TOTAL = 3;

function grGuideTo(step) {
    _grGuideStep = step;
    for (let i = 1; i <= GR_GUIDE_TOTAL; i++) {
        const s = document.getElementById('grGuideStep' + i);
        const d = document.getElementById('grGuideDot' + i);
        if (s) s.classList.toggle('active', i === step);
        if (d) d.classList.toggle('active', i === step);
    }
    const prevBtn = document.getElementById('grGuidePrevBtn');
    const nextBtn = document.getElementById('grGuideNextBtn');
    if (prevBtn) prevBtn.style.display = step > 1 ? '' : 'none';
    if (nextBtn) {
        if (step === GR_GUIDE_TOTAL) {
            nextBtn.innerHTML = '<i class="fa-regular fa-check"></i> Done';
            nextBtn.onclick = grGuideFinish;
        } else {
            nextBtn.innerHTML = 'Next <i class="fa-regular fa-chevron-right"></i>';
            nextBtn.onclick = grGuideNext;
        }
    }
}

function grGuideNext() {
    if (_grGuideStep < GR_GUIDE_TOTAL) grGuideTo(_grGuideStep + 1);
    else grGuideFinish();
}

function grGuidePrev() {
    if (_grGuideStep > 1) grGuideTo(_grGuideStep - 1);
}

function grGuideFinish() {
    localStorage.setItem(GR_GUIDE_KEY, '1');
    const overlay = document.getElementById('grGuideOverlay');
    if (overlay) overlay.classList.remove('open');
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Ensure active session pointer is valid
    if (grState.sessions.length && !grState.sessions.find(s => s.id === grState.activeSessionId)) {
        grState.activeSessionId = grState.sessions[0].id;
        grSaveState();
    }
    grRenderAll();

    if (!localStorage.getItem(GR_GUIDE_KEY)) {
        grGuideTo(1);
        setTimeout(function () {
            const overlay = document.getElementById('grGuideOverlay');
            if (overlay) overlay.classList.add('open');
        }, 800);
    }
});
