// Renders shared announcements from /announcements.json, filtered by app audience.
(function () {
    const audience = location.pathname.includes('/buszy/') ? 'buszy' : 'rail-buddy';
    const jsonUrl = new URL('../announcements.json', document.currentScript.src).href;

    const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    async function load() {
        const lists = document.querySelectorAll('.announcements-list');
        if (!lists.length) return;

        try {
            const res = await fetch(jsonUrl);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const items = (await res.json())
                .filter((a) => !a.audiences || a.audiences.includes(audience))
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            const html = items.length ? items.map((a) => `
                <a href="${escapeHtml(a.href)}" data-ann-id="${escapeHtml(a.id)}" data-ann-date="${escapeHtml(a.date)}"
                    class="list-group-item list-group-item-action flex-column align-items-start">
                    <div class="d-flex">
                        <div>
                            <h5 class="lg-ann"><i class="${escapeHtml(a.icon)}"></i> ${escapeHtml(a.title)}<span
                                    class="ann-badge-container"></span></h5>
                            <small class="lg-date">${escapeHtml(a.dateLabel)}</small>
                        </div>
                    </div>
                    <p class="mb-1" style="cursor: pointer;">${escapeHtml(a.body)}</p>
                </a>`).join('') : '<div class="fetch">No announcements.</div>';

            lists.forEach((l) => { l.innerHTML = html; });
            document.dispatchEvent(new Event('sharedAnnouncementsLoaded'));
        } catch (e) {
            console.error('Failed to load announcements', e);
            lists.forEach((l) => { l.innerHTML = '<div class="fetch">Unable to load announcements.</div>'; });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
