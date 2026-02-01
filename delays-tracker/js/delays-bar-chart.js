// delays-bar-chart.js
// Renders a bar chart of incident counts by MRT line using overall.json

async function renderDelaysBarChart() {
    // Fetch both overall.json and delays.json
    const [overallRes, delaysRes] = await Promise.all([
        fetch('json/overall.json'),
        fetch('json/delays.json')
    ]);
    const overallData = await overallRes.json();
    const delaysData = await delaysRes.json();

    // Map line codes to display names and colors
    const lineInfo = {
        NSL: { name: 'NSL', color: '#e74c3c' },
        EWL: { name: 'EWL', color: '#2ecc71' },
        NEL: { name: 'NEL', color: '#9b59b6' },
        CCL: { name: 'CCL', color: '#f39c12' },
        DTL: { name: 'DTL', color: '#3498db' },
        TEL: { name: 'TEL', color: '#9d5918' },
        BP:  { name: 'BP', color: '#718472' },
        SK:  { name: 'SK', color: '#718472' },
        PG:  { name: 'PG', color: '#718472' }
    };

    // Prepare chart data for minor/major delays
    const labels = Object.values(lineInfo).map(l => l.name);
    const capletColors = Object.values(lineInfo).map(l => l.color);
    // Count minor/major delays per line
    const minorCounts = {};
    const majorCounts = {};
    labels.forEach(l => { minorCounts[l] = 0; majorCounts[l] = 0; });
    delaysData.forEach(item => {
        let type = 'minor';
        if (/major/i.test(item.title)) type = 'major';
        else if (/minor/i.test(item.title)) type = 'minor';
        else if (/delay/i.test(item.title)) type = 'minor';
        // You can refine this logic if you have a better way to detect major/minor
        const line = lineInfo[item.line]?.name;
        if (!line) return;
        if (type === 'major') majorCounts[line]++;
        else minorCounts[line]++;
    });
    // Prepare stacked data arrays
    const minorData = labels.map(l => minorCounts[l]);
    const majorData = labels.map(l => majorCounts[l]);

    // Detect dark mode
    const isDark = document.body.classList.contains('dark-mode');
    const canvasBg = isDark ? '#2e2e2e' : '#fff';

    // Create chart container with dynamic canvas background
    const chartContainer = document.getElementById('delays-bar-chart');
    chartContainer.innerHTML = `
        <div style="background:${canvasBg}; border-radius:12px; padding:24px 16px;">
            <canvas id="delaysChart" width="420" height="90" style="max-width:100%;"></canvas>
            <div class="chart-caplets" id="chart-caplets"></div>
        </div>
    `;

    // Render chart using Chart.js as a bar chart with theme styling
    const chart = new Chart(document.getElementById('delaysChart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Minor Delay',
                    data: minorData,
                    backgroundColor: 'rgba(255, 193, 7, 0.85)', // yellow/orange
                    borderColor: 'rgba(255, 193, 7, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    stack: 'delays',
                },
                {
                    label: 'Major Delay',
                    data: majorData,
                    backgroundColor: 'rgba(231, 76, 60, 0.85)', // red
                    borderColor: 'rgba(231, 76, 60, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    stack: 'delays',
                }
            ]
        },
        options: {
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: { display: true, labels: { color: isDark ? '#fff' : '#222', font: { family: 'Onest, sans-serif', weight: 'bold' } } },
                title: {
                    display: false,
                    color: isDark ? '#fff' : '#222',
                    font: { size: 16, family: 'Onest, sans-serif', weight: 'bold' }
                },
                tooltip: {
                    backgroundColor: isDark ? '#222' : '#fff',
                    titleColor: isDark ? '#fff' : '#222',
                    bodyColor: isDark ? '#fff' : '#222',
                    borderColor: isDark ? '#444' : '#ccc',
                    borderWidth: 1,
                    titleFont: { family: 'Onest, sans-serif', weight: 'bold' },
                    bodyFont: { family: 'Onest, sans-serif' }
                }
            },
            layout: {
                padding: { left: 8, right: 8, top: 8, bottom: 8 }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    border: { color: isDark ? '#444' : '#ccc' },
                    ticks: {
                        color: 'rgba(0,0,0,0)', // Hide default text
                        font: { weight: 'bold', family: 'Onest, sans-serif' },
                        callback: function(value, index) {
                            return '';
                        }
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        color: isDark ? '#fff' : '#222',
                        font: { family: 'Onest, sans-serif' },
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        },
                        stepSize: 1
                    },
                    grid: { color: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' },
                    border: { color: isDark ? '#444' : '#ccc' }
                }
            }
        }
    });

    // Render caplets as HTML elements
    const capletsContainer = document.getElementById('chart-caplets');
    labels.forEach((label, i) => {
        let capletClass = '';
        switch(label) {
            case 'NSL': capletClass = 'nsl'; break;
            case 'EWL': capletClass = 'ewl'; break;
            case 'NEL': capletClass = 'nel'; break;
            case 'CCL': capletClass = 'ccl'; break;
            case 'DTL': capletClass = 'dtl'; break;
            case 'TEL': capletClass = 'tel'; break;
            case 'BP': capletClass = 'lrt'; break;
            case 'SK': capletClass = 'lrt'; break;
            case 'PG': capletClass = 'lrt'; break;
        }
        const caplet = document.createElement('span');
        caplet.className = `chart-caplet ${capletClass}`;
        caplet.textContent = label;
        capletsContainer.appendChild(caplet);
    });
}

// Load Chart.js and render chart
(function() {
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = renderDelaysBarChart;
        document.head.appendChild(script);
    } else {
        renderDelaysBarChart();
    }
})();
