// mkbf-line-chart.js
// Renders a line chart for MRT MKBF (Mean Distance Travelled between Delays > 5 min)

const mkbfDataMrt = [
  {
    line: "NSL",
    color: "#e1251b",
    data: [
      { month: "Apr-25", value: 1650000 },
      { month: "May-25", value: 1410000 },
      { month: "Jun-25", value: 1240000 },
      { month: "Jul-25", value: 1410000 },
      { month: "Aug-25", value: 1650000 },
      { month: "Sep-25", value: 1240000 },
      { month: "Oct-25", value: 1240000 },
      { month: "Nov-25", value: 1240000 },
      { month: "Dec-25", value: 1100000 },
      { month: "Jan-26", value: 1240000 },
      { month: "Feb-26", value: 1240000 },
      { month: "Mar-26", value: 1240000 }
    ]
  },
  {
    line: "EWL",
    color: "#00953b",
    data: [
      { month: "Apr-25", value: 1260000 },
      { month: "May-25", value: 1440000 },
      { month: "Jun-25", value: 1440000 },
      { month: "Jul-25", value: 2020000 },
      { month: "Aug-25", value: 1680000 },
      { month: "Sep-25", value: 1690000 },
      { month: "Oct-25", value: 1690000 },
      { month: "Nov-25", value: 1450000 },
      { month: "Dec-25", value: 1270000 },
      { month: "Jan-26", value: 1450000 },
      { month: "Feb-26", value: 1440000 },
      { month: "Mar-26", value: 1450000 }

    ]
  },
  {
    line: "NEL",
    color: "#9e28b5",
    data: [
      { month: "Apr-25", value: 4170000 },
      { month: "May-25", value: 4190000 },
      { month: "Jun-25", value: 4230000 },
      { month: "Jul-25", value: 4260000 },
      { month: "Aug-25", value: 2140000 },
      { month: "Sep-25", value: 2160000 },
      { month: "Oct-25", value: 2170000 },
      { month: "Nov-25", value: 2190000 },
      { month: "Dec-25", value: 2200000 },
      { month: "Jan-26", value: 2210000 },
      { month: "Feb-26", value: 4420000 },
      { month: "Mar-26", value: 4450000 }

    ]
  },
  {
    line: "CCL",
    color: "#ff9e18",
    data: [
      { month: "Apr-25", value: 1240000 },
      { month: "May-25", value: 1070000 },
      { month: "Jun-25", value: 1070000 },
      { month: "Jul-25", value: 1070000 },
      { month: "Aug-25", value: 1250000 },
      { month: "Sep-25", value: 1490000 },
      { month: "Oct-25", value: 1490000 },
      { month: "Nov-25", value: 1480000 },
      { month: "Dec-25", value: 2460000 },
      { month: "Jan-26", value: 1830000 },
      { month: "Feb-26", value: 1800000 },
      { month: "Mar-26", value: 2370000 }

    ]
  },
  {
    line: "DTL",
    color: "#0055b8",
    data: [
      { month: "Apr-25", value: 2730000 },
      { month: "May-25", value: 4100000 },
      { month: "Jun-25", value: 4120000 },
      { month: "Jul-25", value: 4130000 },
      { month: "Aug-25", value: 2760000 },
      { month: "Sep-25", value: 2770000 },
      { month: "Oct-25", value: 2780000 },
      { month: "Nov-25", value: 2780000 },
      { month: "Dec-25", value: 2790000 },
      { month: "Jan-26", value: 2790000 },
      { month: "Feb-26", value: 2800000 },
      { month: "Mar-26", value: 2100000 }

    ]
  },
    {
    line: "TEL",
    color: "#9d5918",
    data: [
      { month: "Apr-25", value: 439000 },
      { month: "May-25", value: 429000 },
      { month: "Jun-25", value: 439000 },
      { month: "Jul-25", value: 373000 },
      { month: "Aug-25", value: 311000 },
      { month: "Sep-25", value: 287000 },
      { month: "Oct-25", value: 299000 },
      { month: "Nov-25", value: 287800 },
      { month: "Dec-25", value: 325000 },
      { month: "Jan-26", value: 373000 },
      { month: "Feb-26", value: 415000 },
      { month: "Mar-26", value: 374000 }

    ]
  }
];

function renderMkbfLineChart() {
  const months = mkbfDataMrt[0].data.map(d => d.month);
  const datasets = mkbfDataMrt.map(line => ({
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

  const chartContainer = document.getElementById('mkbf-line-chart-mrt');

  // Set chart height larger for mobile to ensure all lines are visible
  const isMobile = window.innerWidth < 600;
  const chartHeight = isMobile ? 620 : 600;
  chartContainer.innerHTML = `
    <div style="background:${canvasBg}; border: 1px solid #2b2b2b33; padding:24px 16px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.233), 0 4px 12px rgba(0, 0, 0, 0.1) ; border-radius:16px; margin-top:16px;">
      <canvas id="mkbfChart" width="600" height="${chartHeight}" style="max-width:100%; height:${chartHeight}px;"></canvas>
    </div>
  `;

  new Chart(document.getElementById('mkbfChart'), {
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
            callback: function (value) {
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

(function () {
  if (typeof Chart === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = renderMkbfLineChart;
    document.head.appendChild(script);
  } else {
    renderMkbfLineChart();
  }
})();
