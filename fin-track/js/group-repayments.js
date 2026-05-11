// ── Storage Key ───────────────────────────────────────────────────────────
const GR_STORAGE_KEY = 'fintrack-group-split';

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
    grRenderTable();
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
        html += `<div class="gr-person-chip">
            ${grEsc(name)}
            <button class="chip-remove" onclick="grRemovePerson(${idx})" title="Remove ${grEsc(name)}">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>`;
    });

    html += `<button class="gr-add-person-btn" onclick="grOpenPersonModal()">
        <i class="fa-regular fa-user-plus"></i>&nbsp;Add
    </button>`;

    bar.innerHTML = html;
}

function grRenderTable() {
    const sess = grActiveSession();
    const wrap = document.getElementById('grTableWrap');
    const grandCard = document.getElementById('grGrandTotalCard');
    const grandAmt = document.getElementById('grGrandTotalAmt');
    const tapTip = document.getElementById('grTapTip');
    if (!wrap) return;

    if (!sess) {
        wrap.innerHTML = `<div class="gr-empty">
            <i class="fa-regular fa-users"></i>
            <div>Create a session to start splitting bills.</div>
        </div>`;
        if (grandCard) grandCard.style.display = 'none';
        if (tapTip) tapTip.style.display = 'none';
        return;
    }

    const people = sess.people || [];
    const items = sess.items || [];

    if (grandCard) {
        if (items.length) {
            grandCard.style.display = '';
            if (grandAmt) grandAmt.textContent = grFmt(grGrandTotal(sess));
        } else {
            grandCard.style.display = 'none';
        }
    }

    if (tapTip) {
        tapTip.style.display = (items.length && people.length) ? '' : 'none';
    }

    if (!items.length) {
        wrap.innerHTML = `<div class="gr-empty">
            <i class="fa-regular fa-cart-shopping"></i>
            <div>${people.length ? 'Add items to start splitting.' : 'Add people and items to start splitting.'}</div>
        </div>`;
        return;
    }

    // Build table
    let html = `<div class="gr-table-wrap"><table class="gr-table"><thead><tr>`;
    html += `<th class="col-item">Item</th>`;
    html += `<th>Total</th>`;
    people.forEach(name => {
        html += `<th>${grEsc(name)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    items.forEach(item => {
        const total = grItemTotal(item);
        html += `<tr>`;
        // Item name cell with edit button
        html += `<td class="col-item">
            <div style="display:flex; align-items:center; gap:6px; justify-content:space-between;">
                <div>
                    <div class="gr-item-name">${grEsc(item.name)}</div>
                    <div class="gr-item-meta">${grFmtShort(item.price)} &times; ${item.qty}</div>
                </div>
                <button class="gr-item-edit-btn" onclick="grOpenEditItem('${item.id}')" title="Edit item">
                    <i class="fa-regular fa-pen"></i>
                </button>
            </div>
        </td>`;
        // Row total
        html += `<td><strong>${grFmtShort(total)}</strong></td>`;
        // Per-person cells
        people.forEach((_, pIdx) => {
            const included = item.included[pIdx] !== false;
            const share = grPersonShare(item, pIdx);
            html += `<td>
                <div class="gr-person-cell ${included ? 'included' : 'excluded'}"
                     onclick="grToggleIncluded('${item.id}', ${pIdx})">
                    ${included ? grFmtShort(share) : '&mdash;'}
                </div>
            </td>`;
        });
        html += `</tr>`;
    });

    // Totals row
    html += `<tr class="gr-total-row">`;
    html += `<td class="col-item">Total</td>`;
    html += `<td>${grFmtShort(grGrandTotal(sess))}</td>`;
    people.forEach((_, pIdx) => {
        const total = grPersonTotal(sess, pIdx);
        html += `<td><span class="gr-person-total">${grFmtShort(total)}</span></td>`;
    });
    html += `</tr>`;

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
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

function grOpenPersonModal() {
    const sess = grActiveSession();
    if (!sess) { grShowToast('Create a session first'); return; }
    document.getElementById('personNameInput').value = '';
    if (!grPersonModal) grPersonModal = new bootstrap.Modal(document.getElementById('personModal'));
    grPersonModal.show();
    setTimeout(() => document.getElementById('personNameInput').focus(), 400);
}

function savePerson() {
    const sess = grActiveSession();
    if (!sess) return;
    const name = document.getElementById('personNameInput').value.trim();
    if (!name) { grShowToast('Please enter a name'); return; }
    if (sess.people.includes(name)) { grShowToast('Name already in list'); return; }

    sess.people.push(name);
    // Extend all existing items' included arrays
    sess.items.forEach(item => {
        while (item.included.length < sess.people.length) {
            item.included.push(true);
        }
    });

    grSaveState();
    closePersonModal();
    grRenderAll();
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

function openAddItem() {
    const sess = grActiveSession();
    if (!sess) { grShowToast('Create a session first'); return; }
    grEditingItemId = null;
    document.getElementById('itemSheetTitle').innerHTML = '<i class="fa-regular fa-cart-shopping"></i>&nbsp;Add Item';
    document.getElementById('itemNameInput').value = '';
    document.getElementById('itemPriceInput').value = '';
    document.getElementById('itemQtyInput').value = '1';
    document.getElementById('deleteItemBtn').style.display = 'none';
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

    if (grEditingItemId) {
        const item = sess.items.find(i => i.id === grEditingItemId);
        if (item) { item.name = name; item.price = price; item.qty = qty; }
    } else {
        const included = (sess.people || []).map(() => true);
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

// ── Toggle Person per Item ────────────────────────────────────────────────
function grToggleIncluded(itemId, personIdx) {
    const sess = grActiveSession();
    if (!sess) return;
    const item = sess.items.find(i => i.id === itemId);
    if (!item) return;
    // Ensure array covers this person index
    while (item.included.length <= personIdx) item.included.push(true);
    item.included[personIdx] = (item.included[personIdx] === false) ? true : false;
    grSaveState();
    grRenderTable();
    grRenderCoverBadge();
}

// ── Toast ─────────────────────────────────────────────────────────────────
function grShowToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Ensure active session pointer is valid
    if (grState.sessions.length && !grState.sessions.find(s => s.id === grState.activeSessionId)) {
        grState.activeSessionId = grState.sessions[0].id;
        grSaveState();
    }
    grRenderAll();
});
