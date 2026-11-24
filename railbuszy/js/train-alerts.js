(() => {
    const content = document.getElementById('train-alerts-content');
    if (!content) return;

    const apiUrl = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts';
    let request = null;

    function renderStatus(message, isError) {
        content.replaceChildren();
        const status = document.createElement('p');
        status.className = isError ? 'train-alert-status error-message' : 'train-alert-status';
        status.textContent = message;
        content.appendChild(status);
    }

    function getAlerts(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.value)) return data.value;
        if (data?.value && typeof data.value === 'object') return [data.value];
        if (Array.isArray(data?.data)) return data.data;
        if (data?.data && typeof data.data === 'object') return [data.data];
        if (data && typeof data === 'object' && 'Status' in data) return [data];
        throw new Error('Invalid train service alerts response');
    }

    function getMessages(alert) {
        const messages = Array.isArray(alert.Message) ? alert.Message : alert.Message ? [alert.Message] : [];
        return messages.map(message => ({
            content: String(typeof message === 'string' ? message : message?.Content || '').trim(),
            createdDate: typeof message === 'object' && message ? message.CreatedDate : ''
        })).filter(message => message.content);
    }

    function renderAlerts(alerts) {
        content.replaceChildren();
        if (!alerts.length) {
            renderStatus('No train service alerts at the moment.', false);
            return;
        }

        alerts.forEach(alert => {
            const card = document.createElement('article');
            card.className = 'list-group-item train-service-alert';

            const heading = document.createElement('div');
            heading.className = 'train-service-alert-heading';
            heading.textContent = Number(alert.Status) === 2 ? 'Major service disruption' : 'Train service alert';
            card.appendChild(heading);

            getMessages(alert).forEach(message => {
                const paragraph = document.createElement('p');
                paragraph.className = 'train-service-alert-message';
                paragraph.textContent = message.content;
                card.appendChild(paragraph);

                if (message.createdDate) {
                    const time = document.createElement('time');
                    const date = new Date(message.createdDate);
                    if (!Number.isNaN(date.getTime())) {
                        time.dateTime = date.toISOString();
                        time.textContent = date.toLocaleString();
                        card.appendChild(time);
                    }
                }
            });
            content.appendChild(card);
        });
    }

    async function loadTrainAlerts() {
        if (request) return request;
        renderStatus('Loading train service alerts...', false);
        request = fetch(apiUrl, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`Train service alerts request failed: ${response.status}`);
                return response.json();
            })
            .then(data => {
                const alerts = getAlerts(data)
                    .filter(alert => Number(alert.Status) === 1 || Number(alert.Status) === 2)
                    .filter(alert => getMessages(alert).length);
                renderAlerts(alerts);
            })
            .catch(error => {
                console.error('[Buszy] Unable to load train service alerts:', error);
                renderStatus('Train service alerts are unavailable right now. Please try again later.', true);
            })
            .finally(() => {
                request = null;
            });
        return request;
    }

    document.addEventListener('buszy:train-alerts-selected', loadTrainAlerts);
})();
