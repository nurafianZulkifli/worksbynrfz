        // ── Storage Key ─────────────────────────────────────────────────────────
        const STORAGE_KEY = 'fintrack-repayments';

        // ── Helpers ─────────────────────────────────────────────────────────────
        function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
        function fmt(n) { return 'SGD ' + parseFloat(n || 0).toFixed(2); }
        function fmtDate(s) {
            const d = new Date(s + 'T00:00:00');
            return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
        }
        function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

        // ── State ───────────────────────────────────────────────────────────────
        function defaultState() { return { activeLoanId: null, loans: [] }; }

        function loadState() {
            try {
                const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
                return (s && Array.isArray(s.loans)) ? s : defaultState();
            } catch { return defaultState(); }
        }

        function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

        let state = loadState();

        function activeLoan() {
            if (!state.loans.length) return null;
            return state.loans.find(l => l.id === state.activeLoanId) || state.loans[0];
        }

        // ── Computed ────────────────────────────────────────────────────────────
        function calcLoanStats(loan) {
            if (!loan) return { lent: 0, repaid: 0, outstanding: 0, pct: 0 };
            const lent = parseFloat(loan.amount) || 0;
            const repaid = (loan.repayments || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const outstanding = Math.max(0, lent - repaid);
            const pct = lent > 0 ? Math.min((repaid / lent) * 100, 100) : 0;
            return { lent, repaid, outstanding, pct };
        }

        // ── Render ──────────────────────────────────────────────────────────────
        function renderAll() {
            renderGreeting();
            renderLoanSwitcherName();
            renderCoverBadge();
            renderSummary();
            renderRepayments();
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
            el.innerHTML = `<span class="ft-greeting-text">${greet}</span>`;
        }

        function renderLoanSwitcherName() {
            const loan = activeLoan();
            const el = document.getElementById('loanSwitcherName');
            if (el) el.textContent = loan ? loan.name : 'No Loans Yet';
        }

        function renderCoverBadge() {
            const loan = activeLoan();
            const el = document.getElementById('coverBadge');
            if (!el) return;
            if (!loan) { el.innerHTML = ''; return; }
            const { outstanding } = calcLoanStats(loan);
            const fully = outstanding <= 0;
            el.innerHTML = `<div class="outstanding-badge${fully ? ' fully-repaid' : ''}">
                <i class="fa-regular fa-${fully ? 'circle-check' : 'circle-exclamation'}"></i>
                ${fully ? 'Fully Repaid' : fmt(outstanding) + ' outstanding'}
            </div>`;
        }

        function renderSummary() {
            const loan = activeLoan();
            const card = document.getElementById('summaryCard');

            if (!loan) {
                if (card) card.style.display = 'none';
                return;
            }
            if (card) card.style.display = '';

            const { lent, repaid, outstanding, pct } = calcLoanStats(loan);

            document.getElementById('lentDisplay').textContent = fmt(lent);
            document.getElementById('repaidDisplay').textContent = fmt(repaid);

            const outEl = document.getElementById('outstandingDisplay');
            outEl.textContent = fmt(outstanding);
            outEl.className = 'balance-amount ' + (outstanding <= 0 ? 'positive' : 'negative');

            // Loan meta (date + note)
            const metaEl = document.getElementById('loanMetaDisplay');
            let metaHtml = `<div class="loan-date-label">Loan Date: ${fmtDate(loan.date)}</div>`;
            if (loan.note) metaHtml += `<div class="loan-note-display">${esc(loan.note)}</div>`;
            metaEl.innerHTML = metaHtml;

            // Progress bar
            document.getElementById('rpProgressBar').style.width = pct + '%';
            document.getElementById('rpProgressPct').textContent = pct.toFixed(0) + '% repaid';
            document.getElementById('rpProgressLeft').textContent =
                outstanding > 0 ? fmt(outstanding) + ' outstanding' : 'Fully repaid!';

            // Hide "Mark Fully Repaid" if already done
            const markBtn = document.getElementById('markRepaidBtn');
            if (markBtn) markBtn.style.display = outstanding <= 0 ? 'none' : '';
        }

        function renderRepayments() {
            const loan = activeLoan();
            const section = document.getElementById('rpSection');

            if (!loan) {
                section.innerHTML = `
                    <div class="rp-no-loans">
                        <i class="fa-regular fa-hand-holding-dollar"></i>
                        <div class="rp-no-loans-title">No loans yet</div>
                        <div class="rp-no-loans-desc">Tap the name above to add a loan — track who borrowed, how much, and when they pay you back.</div>
                    </div>`;
                return;
            }

            const repayments = (loan.repayments || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

            if (!repayments.length) {
                section.innerHTML = `<div class="empty-state"><i class="fa-regular fa-inbox"></i><div>No repayments recorded yet for ${esc(loan.name)}.</div></div>`;
                return;
            }


            // Group by date
            const groups = {};
            repayments.forEach(r => {
                if (!groups[r.date]) groups[r.date] = [];
                groups[r.date].push(r);
            });

            section.innerHTML = Object.entries(groups)
                .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                .map(([date, items]) => `
                    <div style="margin-bottom:18px">
                        <div class="txn-date-label">${fmtDate(date)}</div>
                        <div class="txn-group-card">
                            ${items.map(r => `
                                <div class="txn-item" onclick="openEditRepayment('${r.id}')">
                                    <div class="txn-icon income">
                                        <i class="fa-regular fa-money-bill-transfer"></i>
                                    </div>
                                    <div class="txn-info">
                                        <div class="txn-name">${r.note ? esc(r.note) : 'Repayment'}</div>
                                        <div class="txn-cat">Received from ${esc(loan.name)}</div>
                                    </div>
                                    <div class="txn-amount credit">+${fmt(r.amount)}</div>
                                </div>`).join('')}
                        </div>
                    </div>`).join('');
        }

        // ── Scroll Lock ─────────────────────────────────────────────────────────
        let _lockScrollY = 0, _scrollLocked = false;
        function _blockScroll(e) { e.preventDefault(); }
        function _blockScrollKeys(e) { if ([32, 33, 34, 35, 36, 38, 40].includes(e.keyCode)) e.preventDefault(); }
        function _resetScroll() { if (_scrollLocked) window.scrollTo(0, _lockScrollY); }
        function lockScroll() {
            if (_scrollLocked) return;
            _lockScrollY = window.scrollY; _scrollLocked = true;
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
        function openOverlay(id) { document.getElementById(id).classList.add('open'); lockScroll(); }
        function closeOverlay(id) { document.getElementById(id).classList.remove('open'); unlockScroll(); }
        function closeOnBackdrop(e, id) { if (e.target === document.getElementById(id)) closeOverlay(id); }

        // ── Toast ────────────────────────────────────────────────────────────────
        let toastTimer;
        function showToast(msg) {
            const el = document.getElementById('toast');
            el.textContent = msg; el.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
        }

        // ── Loan Switcher Dropdown ───────────────────────────────────────────────
        function openLoanSwitcher() {
            const dropdown = document.getElementById('loanDropdown');
            const overlay = document.getElementById('loanDropdownOverlay');
            if (dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
                overlay.classList.remove('open');
                unlockScroll();
                return;
            }
            renderLoanList();
            dropdown.classList.add('open');
            overlay.classList.add('open');
            lockScroll();
        }

        function closeLoanDropdown() {
            document.getElementById('loanDropdown').classList.remove('open');
            document.getElementById('loanDropdownOverlay').classList.remove('open');
            unlockScroll();
        }

        function renderLoanList() {
            const list = document.getElementById('loanList');
            if (!state.loans.length) {
                list.innerHTML = `<div style="padding:16px; text-align:center; color:#6b7280; font-size:0.85rem;">No loans yet. Add one below.</div>`;
                return;
            }
            list.innerHTML = state.loans.map(l => {
                const { outstanding, pct } = calcLoanStats(l);
                const active = l.id === state.activeLoanId;
                const fullyRepaid = outstanding <= 0;
                return `
                    <div class="acct-item${active ? ' active' : ''}" onclick="switchLoan('${l.id}')">
                        <div class="acct-item-icon">
                            <i class="fa-regular fa-hand-holding-dollar"></i>
                        </div>
                        <div class="acct-item-info">
                            <div class="acct-item-name">${esc(l.name)}</div>
                            <div class="acct-item-balance">${fullyRepaid ? '✓ Fully repaid' : fmt(outstanding) + ' outstanding'}</div>
                        </div>
                        ${active ? '<i class="fa-regular fa-check acct-item-check"></i>' : ''}
                        <button class="acct-delete-btn" onclick="event.stopPropagation(); deleteLoanById('${l.id}')" title="Delete loan">
                            <i class="fa-regular fa-trash"></i>
                        </button>
                    </div>`;
            }).join('');
        }

        function switchLoan(id) {
            if (!state.loans.find(l => l.id === id)) return;
            state.activeLoanId = id;
            saveState(); closeLoanDropdown(); renderAll();
        }

        // ── Add / Edit Loan ──────────────────────────────────────────────────────
        let editingLoanId = null;

        function _getLoanModal() {
            return bootstrap.Modal.getOrCreateInstance(document.getElementById('loanModal'));
        }

        function openAddLoan() {
            editingLoanId = null;
            document.getElementById('loanSheetTitle').innerHTML = '<i class="fa-regular fa-hand-holding-dollar"></i>&nbsp;New Loan';
            document.getElementById('loanName').value = '';
            document.getElementById('loanAmount').value = '';
            document.getElementById('loanDate').value = new Date().toISOString().slice(0, 10);
            document.getElementById('loanNote').value = '';
            document.getElementById('deleteLoanBtn').style.display = 'none';
            _getLoanModal().show();
            setTimeout(() => document.getElementById('loanName').focus(), 300);
        }

        function openEditLoan() {
            const loan = activeLoan();
            if (!loan) return;
            editingLoanId = loan.id;
            document.getElementById('loanSheetTitle').innerHTML = '<i class="fa-regular fa-pen"></i>&nbsp;Edit Loan';
            document.getElementById('loanName').value = loan.name;
            document.getElementById('loanAmount').value = loan.amount;
            document.getElementById('loanDate').value = loan.date;
            document.getElementById('loanNote').value = loan.note || '';
            document.getElementById('deleteLoanBtn').style.display = '';
            _getLoanModal().show();
        }

        function closeLoanModal() {
            _getLoanModal().hide();
        }

        function saveLoan() {
            const name = document.getElementById('loanName').value.trim();
            const amount = parseFloat(document.getElementById('loanAmount').value);
            const date = document.getElementById('loanDate').value;
            const note = document.getElementById('loanNote').value.trim();

            if (!name) { showToast('Enter a borrower name'); return; }
            if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
            if (!date) { showToast('Select a date'); return; }

            if (editingLoanId) {
                const loan = state.loans.find(l => l.id === editingLoanId);
                if (loan) { loan.name = name; loan.amount = amount; loan.date = date; loan.note = note; }
                showToast('Loan updated');
            } else {
                const id = uid();
                state.loans.push({ id, name, amount, date, note, repayments: [] });
                state.activeLoanId = id;
                showToast('Loan added');
            }

            saveState(); closeLoanModal(); renderAll();
        }

        function deleteLoan() {
            const loan = activeLoan();
            if (!loan) return;
            if (!confirm('Delete loan for "' + loan.name + '" and all its repayment records?')) return;
            deleteLoanById(loan.id);
        }

        function deleteLoanById(id) {
            const loan = state.loans.find(l => l.id === id);
            if (!loan) return;
            if (!confirm('Delete loan for "' + loan.name + '"?')) return;
            state.loans = state.loans.filter(l => l.id !== id);
            if (state.activeLoanId === id) {
                state.activeLoanId = state.loans.length ? state.loans[0].id : null;
            }
            saveState();
            const dropdownOpen = document.getElementById('loanDropdown').classList.contains('open');
            if (dropdownOpen) renderLoanList();
            closeLoanModal();
            renderAll();
            showToast('Loan deleted');
        }

        // ── Add / Edit Repayment ─────────────────────────────────────────────────
        let editingRpId = null;

        function _getRpModal() {
            return bootstrap.Modal.getOrCreateInstance(document.getElementById('repaymentModal'));
        }

        function openAddRepayment() {
            const loan = activeLoan();
            if (!loan) { showToast('Add a loan first'); openLoanSwitcher(); return; }
            editingRpId = null;
            document.getElementById('rpSheetTitle').innerHTML = '<i class="fa-regular fa-money-bill-transfer"></i>&nbsp;Add Repayment';
            document.getElementById('rpAmount').value = '';
            document.getElementById('rpDate').value = new Date().toISOString().slice(0, 10);
            document.getElementById('rpNote').value = '';
            document.getElementById('deleteRpBtn').style.display = 'none';
            _getRpModal().show();
            setTimeout(() => document.getElementById('rpAmount').focus(), 300);
        }

        function openEditRepayment(id) {
            const loan = activeLoan();
            if (!loan) return;
            const rp = (loan.repayments || []).find(r => r.id === id);
            if (!rp) return;
            editingRpId = id;
            document.getElementById('rpSheetTitle').innerHTML = '<i class="fa-regular fa-pen"></i>&nbsp;Edit Repayment';
            document.getElementById('rpAmount').value = rp.amount;
            document.getElementById('rpDate').value = rp.date;
            document.getElementById('rpNote').value = rp.note || '';
            document.getElementById('deleteRpBtn').style.display = '';
            _getRpModal().show();
        }

        function closeRpModal() {
            _getRpModal().hide();
        }

        function saveRepayment() {
            const loan = activeLoan();
            if (!loan) return;
            const amount = parseFloat(document.getElementById('rpAmount').value);
            const date = document.getElementById('rpDate').value;
            const note = document.getElementById('rpNote').value.trim();

            if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
            if (!date) { showToast('Select a date'); return; }

            if (!loan.repayments) loan.repayments = [];

            if (editingRpId) {
                const idx = loan.repayments.findIndex(r => r.id === editingRpId);
                if (idx !== -1) loan.repayments[idx] = { ...loan.repayments[idx], amount, date, note };
                showToast('Repayment updated');
            } else {
                loan.repayments.push({ id: uid(), amount, date, note });
                showToast('Repayment recorded');
            }

            saveState(); closeRpModal(); renderAll();
        }

        function deleteRepayment() {
            if (!editingRpId) return;
            const loan = activeLoan();
            if (!loan) return;
            if (!confirm('Delete this repayment entry?')) return;
            loan.repayments = (loan.repayments || []).filter(r => r.id !== editingRpId);
            saveState(); closeRpModal(); renderAll();
            showToast('Repayment deleted');
        }

        // Lock <html> scroll when modal opens (matches index.html pattern)
        (function () {
            const el = document.getElementById('repaymentModal');
            if (!el) return;
            el.addEventListener('show.bs.modal', function () {
                document.documentElement.style.overflow = 'hidden';
            });
            el.addEventListener('hidden.bs.modal', function () {
                document.documentElement.style.overflow = '';
            });
        })();

        (function () {
            const el = document.getElementById('loanModal');
            if (!el) return;
            el.addEventListener('show.bs.modal', function () {
                document.documentElement.style.overflow = 'hidden';
            });
            el.addEventListener('hidden.bs.modal', function () {
                document.documentElement.style.overflow = '';
            });
        })();

        function markFullyRepaid() {
            const loan = activeLoan();
            if (!loan) return;
            const { outstanding } = calcLoanStats(loan);
            if (outstanding <= 0) { showToast('Already fully repaid!'); return; }
            if (!confirm('Record a final repayment of ' + fmt(outstanding) + ' to mark ' + loan.name + ' as fully repaid?')) return;
            if (!loan.repayments) loan.repayments = [];
            loan.repayments.push({
                id: uid(),
                amount: outstanding,
                date: new Date().toISOString().slice(0, 10),
                note: 'Final repayment'
            });
            saveState(); renderAll();
            showToast('Marked as fully repaid!');
        }

        function addFirstLoan() {
            const btn = document.getElementById('loanSwitcherBtn');
            if (btn) {
                btn.classList.remove('loan-switcher-highlight');
                // Force reflow so re-adding the class restarts the animation
                void btn.offsetWidth;
                btn.classList.add('loan-switcher-highlight');
                btn.addEventListener('animationend', function handler() {
                    btn.classList.remove('loan-switcher-highlight');
                    btn.removeEventListener('animationend', handler);
                });
            }
            openAddLoan();
        }

        // ── Click-outside to close dropdown ─────────────────────────────────────
        document.addEventListener('click', function (e) {
            const btn = document.getElementById('loanSwitcherBtn');
            const dropdown = document.getElementById('loanDropdown');
            if (btn && !btn.contains(e.target) && dropdown && !dropdown.contains(e.target)) {
                closeLoanDropdown();
            }
        });

        // ── First-Time Guide ─────────────────────────────────────────────────────
        const RP_GUIDE_KEY = 'fintrack-rp-guide-done';
        let _rpGuideStep = 1;
        const RP_GUIDE_TOTAL = 2;

        function rpGuideTo(step) {
            _rpGuideStep = step;
            for (let i = 1; i <= RP_GUIDE_TOTAL; i++) {
                const s = document.getElementById('rpGuideStep' + i);
                const d = document.getElementById('rpGuideDot' + i);
                if (s) s.classList.toggle('active', i === step);
                if (d) d.classList.toggle('active', i === step);
            }
            const prevBtn = document.getElementById('rpGuidePrevBtn');
            const nextBtn = document.getElementById('rpGuideNextBtn');
            if (prevBtn) prevBtn.style.display = step > 1 ? '' : 'none';
            if (nextBtn) {
                if (step === RP_GUIDE_TOTAL) {
                    nextBtn.innerHTML = '<i class="fa-regular fa-check"></i> Done';
                    nextBtn.onclick = rpGuideFinish;
                } else {
                    nextBtn.innerHTML = 'Next <i class="fa-regular fa-chevron-right"></i>';
                    nextBtn.onclick = rpGuideNext;
                }
            }
        }

        function rpGuideNext() {
            if (_rpGuideStep < RP_GUIDE_TOTAL) rpGuideTo(_rpGuideStep + 1);
            else rpGuideFinish();
        }

        function rpGuidePrev() {
            if (_rpGuideStep > 1) rpGuideTo(_rpGuideStep - 1);
        }

        function rpGuideFinish() {
            localStorage.setItem(RP_GUIDE_KEY, '1');
            closeOverlay('rpGuideOverlay');
        }

        // ── Init ─────────────────────────────────────────────────────────────────
        if (!state.activeLoanId && state.loans.length) state.activeLoanId = state.loans[0].id;
        renderAll();

        if (!localStorage.getItem(RP_GUIDE_KEY)) {
            rpGuideTo(1);
            setTimeout(function () { openOverlay('rpGuideOverlay'); }, 800);
        }