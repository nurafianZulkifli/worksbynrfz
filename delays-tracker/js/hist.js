

// Load disruption cards

let disruptionsData = [];
const now = new Date();
const minMonth = 11; // December (0-based)
const minYear = 2025;
const maxMonth = now.getMonth();
const maxYear = now.getFullYear();
let currentMonth = Math.max(minMonth, Math.min(maxMonth, now.getMonth()));
let currentYear = Math.max(minYear, Math.min(maxYear, now.getFullYear()));

function renderMonthLabel() {
  // Update prev/next button states
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');
  // Disable prev if at min month
  if (prevBtn) {
    if (currentYear === minYear && currentMonth === minMonth) {
      prevBtn.disabled = true;
      prevBtn.classList.add('month-nav-disabled');
    } else {
      prevBtn.disabled = false;
      prevBtn.classList.remove('month-nav-disabled');
    }
  }
  // Disable next if at max month
  if (nextBtn) {
    if (currentYear === maxYear && currentMonth === maxMonth) {
      nextBtn.disabled = true;
      nextBtn.classList.add('month-nav-disabled');
    } else {
      nextBtn.disabled = false;
      nextBtn.classList.remove('month-nav-disabled');
    }
  }
  const monthLabel = document.getElementById('month-label');
  // Cap at min (Dec 2025) and max (current month)
  if (currentYear < minYear || (currentYear === minYear && currentMonth < minMonth)) {
    currentYear = minYear;
    currentMonth = minMonth;
  }
  if (currentYear > maxYear || (currentYear === maxYear && currentMonth > maxMonth)) {
    currentYear = maxYear;
    currentMonth = maxMonth;
  }
  const date = new Date(currentYear, currentMonth);
  if (monthLabel) {
    monthLabel.textContent = date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
}

function renderDisruptionsByMonth() {
  const container = document.getElementById('disruption-cards');
  if (!container) return;
  container.innerHTML = '';
  const disruptionsThisMonth = disruptionsData.filter(item => {
    const startDate = new Date(item.start);
    return startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear;
  });
  if (disruptionsThisMonth.length === 0) {
    const noIncidents = document.createElement('p');
    noIncidents.className = 'no-incidents-reported';
    noIncidents.textContent = 'No Incidents Reported.';
    container.appendChild(noIncidents);
    return;
  }
  disruptionsThisMonth.forEach(item => {
    const card = document.createElement('div');
    card.className = 'disruption-card';
    // Determine status icon and class based on item.title
    let statusIcon = '';
    let statusClass = '';
    if (item.title && item.title.toLowerCase().includes('major')) {
      statusIcon = '<i class="fa-solid fa-diamond-exclamation"></i>';
      statusClass = 'status-major';
    } else if (item.title && item.title.toLowerCase().includes('minor')) {
      statusIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
      statusClass = 'status-minor';
    } else {
      statusIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
      statusClass = 'status-minor';
    }
    // Status icon for resolved/ongoing
    let resolvedIcon = '';
    if (item.status === 'Resolved') {
      resolvedIcon = '<i class="fa-regular fa-circle-check"></i>';
    } else {
      resolvedIcon = '<i class="fa-solid fa-circle fa-beat"></i>';
    }
    // Prepare from-to pairs for multiple routes
    let fromArr = Array.isArray(item.from) ? item.from : [item.from];
    let toArr = Array.isArray(item.to) ? item.to : [item.to];
    let routeBadges = '';
    for (let i = 0; i < Math.max(fromArr.length, toArr.length); i++) {
      let from = fromArr[i] || '';
      let to = toArr[i] || '';
      // Map line names to caplet filenames
      const capletMap = {
        'nsl': 'NSLCap.png',
        'ewl': 'EWLCap.png',
        'ccl': 'CCLCap.png',
        'dtl': 'DTLCap.png',
        'nel': 'NELCap.png',
        'tel': 'TELCap.png',
        'bp': 'BPCap.png',
        'sk': 'SKCap.png',
        'pg': 'PGCap.png'
      };
      const lineKey = item.line ? item.line.toLowerCase() : '';
      const capletFile = capletMap[lineKey] || 'NSLCap.png';
      routeBadges += `
        <span class="route-badge">
          <img src="assets/caplets/${capletFile}" alt="${item.line}" style="height: 35px; width: auto;">
          <span class="route">${from} ⇄ ${to}</span>
        </span>
      `;
    }
    card.innerHTML = `
      <div class="card-header">
        <span class="${statusClass}">${statusIcon}</span>
        <span class="type">${item.type}</span>
        <span class="status ${item.status === 'Resolved' ? 'resolved' : 'ongoing'}">${resolvedIcon} ${item.status}</span>
      </div>
      <div class="card-title">${item.title}</div>
      <div class="card-details-multi">${routeBadges}</div>
      <div class="card-time">
        ${new Date(item.start).toLocaleDateString('en-SG')} - ${new Date(item.end).toLocaleDateString('en-SG')}
      </div>
      <div class="card-tags">
        ${(item.tags || []).map(tag => `<span class="card-tag tag-${tag.toLowerCase().replace(/\s+/g, '-')}">${tag}</span>`).join(' ')}
      </div>
    `;
    container.appendChild(card);
  });
}

function changeMonth(offset) {
  currentMonth += offset;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  // Cap at min (Dec 2025) and max (current month)
  if (currentYear < minYear || (currentYear === minYear && currentMonth < minMonth)) {
    currentYear = minYear;
    currentMonth = minMonth;
  }
  if (currentYear > maxYear || (currentYear === maxYear && currentMonth > maxMonth)) {
    currentYear = maxYear;
    currentMonth = maxMonth;
  }
  renderMonthLabel();
  renderDisruptionsByMonth();
}

document.addEventListener('DOMContentLoaded', function () {
  fetch('json/delays.json')
    .then(response => response.json())
    .then(data => {
      disruptionsData = data;
      renderMonthLabel();
      renderDisruptionsByMonth();
    });

  var prevBtn = document.getElementById('prev-month');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      changeMonth(-1);
    });
  }
  var nextBtn = document.getElementById('next-month');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      changeMonth(1);
    });
  }
});