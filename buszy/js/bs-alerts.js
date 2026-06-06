 // Helper: convert URLs in text to clickable links
 function linkify(text) {
     const urlRegex = /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(www\.[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(go\.gov\.sg\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)/gi;
     let linked = text.replace(urlRegex, function (url) {
         let href = url;
         if (url.match(/^go\.gov\.sg\//i)) {
             href = 'https://' + url;
         } else if (!href.match(/^https?:\/\//i)) {
             href = 'http://' + href;
         }
         return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
     });
     return linked.replace(/\n/g, '<br>');
 }

 document.addEventListener('DOMContentLoaded', function () {
     // Show last updated time
     const now = new Date();
     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
     let hours = now.getHours();
     const ampm = hours >= 12 ? 'PM' : 'AM';
     hours = hours % 12;
     hours = hours ? hours : 12;
     const mins = now.getMinutes().toString().padStart(2, '0');
     const formatted = `Last updated: ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${hours}:${mins} ${ampm}`;
     const updatedDiv = document.querySelector('#alerts-last-updated');
     if (updatedDiv) updatedDiv.textContent = formatted;

     // Fetch alerts
     fetch('https://bat-lta-9eb7bbf231a2.herokuapp.com/train-service-alerts')
         .then(r => r.json())
         .then(data => {
             if (!data || !data.value) {
                 showNoAlerts();
                 return;
             }

             // Support both array and object for value
             let alerts = [];
             if (Array.isArray(data.value)) {
                 alerts = data.value;
             } else if (typeof data.value === 'object') {
                 alerts = [data.value];
             }

             // Filter for bus service alerts only (those containing "Due to... bus services... are affected")
             let busAlerts = [];
             alerts.forEach(alert => {
                 if (alert.Message && Array.isArray(alert.Message)) {
                     alert.Message.forEach(messageObj => {
                         const msg = messageObj.Content || '';
                         // Check if message contains "bus services" or "bus service" and mentions being affected
                         const msgLower = msg.toLowerCase();
                         if (msgLower.includes('bus service') && (msgLower.includes('affected') || msgLower.includes('diverted') || msgLower.includes('delayed'))) {
                             busAlerts.push({
                                 content: msg,
                                 status: alert.Status,
                                 createdDate: messageObj.CreatedDate
                             });
                         }
                     });
                 }
             });

             if (busAlerts.length === 0) {
                 showNoAlerts();
             } else {
                 displayAlerts(busAlerts);
             }
         })
         .catch(err => {
             console.error('Error fetching alerts:', err);
             showErrorMessage('Failed to load alerts. Please try again later.');
         });

     function extractBusServiceCodes(text) {
         // Extract only the portion mentioning "bus services"
         // Match "bus services" followed by codes, handling various verb patterns: "have been diverted", "are affected", etc.
         const busServicesRegex = /bus services?\s*[:\-]?\s*([^,]+?)(?:\s+(?:have|has|are|is)\s+(?:been\s+)?(?:affected|diverted|disrupted|delayed))/i;
         const match = text.match(busServicesRegex);

         if (!match) {
             return [];
         }

         // Get the portion after "bus services"
         const servicesText = match[1];

         // Extract service codes from this portion: numbers (2-4 digits) optionally followed by a letter
         const codeRegex = /\b(\d{2,4}[a-z]?)\b/gi;
         const matches = servicesText.match(codeRegex) || [];
         const codes = [...new Set(matches)].filter(code => {
             const num = parseInt(code);
             return num >= 10 && num <= 9999;
         });
         return codes;
     }

     function displayAlerts(alerts) {
         const content = document.getElementById('alerts-content');
         content.innerHTML = '';

         alerts.forEach((alert, index) => {
             const linkedContent = linkify(alert.content);
             const alertDate = new Date(alert.createdDate);

             // Format time as HH:MM
             let hours = alertDate.getHours();
             const mins = alertDate.getMinutes().toString().padStart(2, '0');
             hours = hours.toString().padStart(2, '0');
             const timeStr = `${hours}:${mins}`;

             const codes = extractBusServiceCodes(alert.content);
             let codesHTML = '';
             if (codes.length > 0) {
                 codesHTML = '<div class="bus-codes-container" style="margin: 0.5em 0;">';
                 codes.forEach(code => {
                     codesHTML += `<div class="bus-service-code"><span class="bus-service-code-text">${code}</span></div>`;
                 });
                 codesHTML += '</div>';
             }

             const alertDiv = document.createElement('div');
             alertDiv.className = 'list-group-item list-group-item-action flex-column align-items-start';
             alertDiv.innerHTML = `
                        <div style="width: 100%; margin-bottom: 0.5em;">
                            <small class="lg-date">Bus Services Affected:</small>
                        </div>
                        ${codesHTML}
                        <p class="mb-1 alert-item-content">${linkedContent}</p>
                    `;
             content.appendChild(alertDiv);
         });
     }

     function showNoAlerts() {
         const content = document.getElementById('alerts-content');
         content.innerHTML = '<div class="no-alerts" ><i class="fa-regular fa-check-circle"></i>&nbsp;No alerts at the moment.</div>';
     }

     function showErrorMessage(message) {
         const content = document.getElementById('alerts-content');
         content.innerHTML = `<div class="error-message" ><i class="fa-regular fa-exclamation-circle"></i> ${message}</div>`;
     }
 });