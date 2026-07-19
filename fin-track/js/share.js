/**
 * Share Utility for FinTrack
 * Handles generating shareable links and copying data
 */

// ── Base64 Encoding/Decoding ─────────────────────────────────────────
function encodeShareData(data) {
    try {
        const jsonStr = JSON.stringify(data);
        return btoa(unescape(encodeURIComponent(jsonStr)));
    } catch (e) {
        console.error('Share encoding error:', e);
        return null;
    }
}

function decodeShareData(encoded) {
    try {
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Share decoding error:', e);
        return null;
    }
}

// ── Repayment Share ──────────────────────────────────────────────────
function openShareRepaymentModal(loan) {
    if (!loan) return;
    
    const modal = document.getElementById('shareRepaymentModal');
    if (!modal) return;

    // Generate shareable data
    const shareData = {
        type: 'repayment',
        name: loan.name,
        amount: loan.amount,
        date: loan.date,
        note: loan.note || '',
        repayments: (loan.repayments || []).map(r => ({
            amount: r.amount,
            date: r.date,
            note: r.note || ''
        }))
    };

    // Create shareable link
    const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/share.html';
    const encoded = encodeShareData(shareData);
    const shareUrl = `${baseUrl}?data=${encodeURIComponent(encoded)}`;

    // Create formatted text for copying
    const { lent, repaid, outstanding, pct } = calcLoanStats(loan);
    let textContent = `📊 Loan Summary: ${loan.name}\n`;
    textContent += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    textContent += `Loan Amount: SGD ${parseFloat(loan.amount).toFixed(2)}\n`;
    textContent += `Loan Date: ${fmtDate(loan.date)}\n`;
    if (loan.note) textContent += `Note: ${loan.note}\n`;
    textContent += `\n💰 Repayment Status\n`;
    textContent += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    textContent += `Repaid: SGD ${repaid.toFixed(2)}\n`;
    textContent += `Outstanding: SGD ${outstanding.toFixed(2)}\n`;
    textContent += `Progress: ${pct.toFixed(0)}%\n`;
    
    if ((loan.repayments || []).length > 0) {
        textContent += `\n📝 Repayment History\n`;
        textContent += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        (loan.repayments || []).slice().reverse().forEach(r => {
            textContent += `${r.date}: SGD ${parseFloat(r.amount).toFixed(2)}`;
            if (r.note) textContent += ` (${r.note})`;
            textContent += `\n`;
        });
    }

    // Populate modal
    document.getElementById('shareRepaymentUrl').value = shareUrl;
    document.getElementById('shareRepaymentText').value = textContent;
    
    // Show modal
    const shareModal = new bootstrap.Modal(modal);
    shareModal.show();
}

// ── Group Split Share ────────────────────────────────────────────────
function openShareGroupSplitModal(session) {
    if (!session) return;

    const modal = document.getElementById('shareGroupSplitModal');
    if (!modal) return;

    // Generate shareable data
    const shareData = {
        type: 'group-split',
        name: session.name,
        people: session.people || [],
        items: (session.items || []).map(item => ({
            name: item.name,
            price: item.price,
            qty: item.qty,
            included: item.included
        }))
    };

    // Create shareable link
    const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/share.html';
    const encoded = encodeShareData(shareData);
    const shareUrl = `${baseUrl}?data=${encodeURIComponent(encoded)}`;

    // Create formatted text for copying
    const grandTotal = grGrandTotal(session);
    let textContent = `🧑‍🤝‍🧑 Group Split: ${session.name}\n`;
    textContent += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    textContent += `👥 People (${(session.people || []).length})\n`;
    (session.people || []).forEach((person, idx) => {
        const share = grPersonTotal(session, idx);
        textContent += `• ${person}: SGD ${share.toFixed(2)}\n`;
    });

    textContent += `\n🛒 Items\n`;
    (session.items || []).forEach(item => {
        const total = grItemTotal(item);
        textContent += `• ${item.name}: SGD ${total.toFixed(2)} (Qty: ${item.qty}, Price: SGD ${parseFloat(item.price).toFixed(2)})\n`;
    });

    textContent += `\n💰 Total Bill\n`;
    textContent += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    textContent += `Grand Total: SGD ${grandTotal.toFixed(2)}\n`;

    // Populate modal
    document.getElementById('shareGroupSplitUrl').value = shareUrl;
    document.getElementById('shareGroupSplitText').value = textContent;

    // Show modal
    const shareModal = new bootstrap.Modal(modal);
    shareModal.show();
}

// ── Copy to Clipboard ────────────────────────────────────────────────
function copyToClipboard(textId, buttonId) {
    const textEl = document.getElementById(textId);
    const btnEl = document.getElementById(buttonId);
    
    if (!textEl) return;

    navigator.clipboard.writeText(textEl.value).then(() => {
        // Show success state
        const originalText = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i>&nbsp;Copied!';
        btnEl.classList.add('btn-success');
        btnEl.disabled = true;

        setTimeout(() => {
            btnEl.innerHTML = originalText;
            btnEl.classList.remove('btn-success');
            btnEl.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy to clipboard');
    });
}

// ── Web Share API (for mobile) ───────────────────────────────────────
function shareViaWebShare(type, data, url) {
    if (!navigator.share) {
        // Fallback to modal copy
        if (type === 'repayment') {
            openShareRepaymentModal(data);
        } else if (type === 'group-split') {
            openShareGroupSplitModal(data);
        }
        return;
    }

    const title = type === 'repayment' ? `Loan: ${data.name}` : `Group Split: ${data.name}`;
    const text = type === 'repayment' 
        ? `Check out this loan summary: ${data.name} - SGD ${data.amount}`
        : `Check out this group split: ${data.name}`;

    navigator.share({
        title: title,
        text: text,
        url: url
    }).catch(err => {
        if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
        }
    });
}

// ── Show Toast Notification ──────────────────────────────────────────
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
