// mkbf-line-chart.js
// Renders a line chart for LRT MKBF (Mean Distance Travelled between Delays > 5 min)

    const mkbfDataLrt = [
        {
            line: "BPLRT",
            color: "#718472",
            data: [
                { month: "Feb-25", value: 394000 },
                { month: "Mar-25", value: 398000 },
                { month: "Apr-25", value: 269000 },
                { month: "May-25", value: 244000 },
                { month: "Jun-25", value: 247000 },
                { month: "Jul-25", value: 192000 },
                { month: "Aug-25", value: 209000 },
                { month: "Sep-25", value: 253000 },
                { month: "Oct-25", value: 232000 },
                { month: "Nov-25", value: 197000 },
                { month: "Dec-25", value: 199000 },
                { month: "Jan-26", value: 200000 }
            ]
        },
        {
            line: "SPLRT",
            color: "#b8d8b9",
            data: [
                { month: "Feb-25", value: 825000 },
                { month: "Mar-25", value: 827000 },
                { month: "Apr-25", value: 829000 },
                { month: "May-25", value: 998000 },
                { month: "Jun-25", value: 1252000 },
                { month: "Jul-25", value: 1256000 },
                { month: "Aug-25", value: 840000 },
                { month: "Sep-25", value: 842000 },
                { month: "Oct-25", value: 725000 },
                { month: "Nov-25", value: 849000 },
                { month: "Dec-25", value: 1025000 },
                { month: "Jan-26", value: 860000 }
            ]
        }
    ];

let mkbfChartInstance;
function renderMkbfLineChart() {
  const months = mkbfDataLrt[0].data.map(d => d.month);
  const datasets = mkbfDataLrt.map(line => ({
    label: line.line,
    data: line.data.map(d => d.value),
    borderColor: line.color,
    backgroundColor: line.color + '33', // semi-transparent fill
    tension: 0.3,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 3
  }));

  const isDark = document.body.classList.contains('dark-mode');
  const canvasBg = isDark ? '#1c1f2b' : '#fff';

  const chartContainer = document.getElementById('mkbf-line-chart-lrt');
  // Destroy previous chart instance if exists
  if (mkbfChartInstance) {
    try {
      mkbfChartInstance.destroy();
    } catch (e) {
      // Chart.js may throw if already destroyed, ignore
    }
    mkbfChartInstance = null;
  }
  // Set chart height larger for mobile to ensure all lines are visible
  const isMobile = window.innerWidth < 600;
  const chartHeight = isMobile ? 620 : 600;
  chartContainer.innerHTML = `
    <div style="background:${canvasBg}; border: 1px solid #2b2b2b33; padding:24px 16px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.233), 0 4px 12px rgba(0, 0, 0, 0.1) ; border-radius:16px; margin-top:16px;">
      <canvas id="mkbfChartLrt" width="600" height="${chartHeight}" style="max-width:100%; height:${chartHeight}px;"></canvas>
    </div>
  `;

  const ctx = document.getElementById('mkbfChartLrt').getContext('2d');
  mkbfChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: datasets
    },
    options: {
      maintainAspectRatio: !isMobile,
      aspectRatio: isMobile ? undefined : 2.5,
      plugins: {
        legend: { display: true, labels: { color: isDark ? '#fff' : '#222', font: { family: 'Onest, sans-serif', weight: 'bold' } } },
        title: {
          display: false,
          text: 'Mean Distance Travelled between Delays > 5 min (train-km)\nMRT Lines - 12 Month Moving Average (MMA)',
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
          grid: { color: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' },
          border: { color: isDark ? '#444' : '#ccc' },
          ticks: {
            color: isDark ? '#fff' : '#222',
            font: { weight: 'bold', family: 'Onest, sans-serif' }
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: isDark ? '#fff' : '#222',
            font: { family: 'Onest, sans-serif' },
            callback: function(value) {
              return value.toLocaleString();
            }
          },
          grid: { color: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' },
          border: { color: isDark ? '#444' : '#ccc' }
        }
      }
    }
  });
}

(function() {
  if (typeof Chart === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = renderMkbfLineChart;
    document.head.appendChild(script);
  } else {
    renderMkbfLineChart();
  }
})();
