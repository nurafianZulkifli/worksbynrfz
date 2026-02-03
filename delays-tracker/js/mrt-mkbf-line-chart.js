// mkbf-line-chart.js
// Renders a line chart for MRT MKBF (Mean Distance Travelled between Delays > 5 min)

const mkbfDataMrt = [
  {
    line: "NSL",
    color: "#e1251b",
    data: [
      { month: "Jan-25", value: 2480000 },
      { month: "Feb-25", value: 2475000 },
      { month: "Mar-25", value: 1981000 },
      { month: "Apr-25", value: 1650000 },
      { month: "May-25", value: 1443000 },
      { month: "Jun-25", value: 1413000 },
      { month: "Jul-25", value: 1648000 },
      { month: "Aug-25", value: 1692000 },
      { month: "Sep-25", value: 1481000 },
      { month: "Oct-25", value: 1235000 },
      { month: "Nov-25", value: 1235000 },
      { month: "Dec-25", value: 1099000 }
    ]
  },
  {
    line: "EWL",
    color: "#00953b",
    data: [
      { month: "Jan-25", value: 1444000 },
      { month: "Feb-25", value: 1441000 },
      { month: "Mar-25", value: 1057000 },
      { month: "Apr-25", value: 1682000 },
      { month: "May-25", value: 1262000 },
      { month: "Jun-25", value: 1413000 },
      { month: "Jul-25", value: 2021000 },
      { month: "Aug-25", value: 2158000 },
      { month: "Sep-25", value: 1694000 },
      { month: "Oct-25", value: 1481000 },
      { month: "Nov-25", value: 1481000 },
      { month: "Dec-25", value: 1265000 }
    ]
  },
  {
    line: "NEL",
    color: "#9e28b5",
    data: [
      { month: "Jan-25", value: 4110000 },
      { month: "Feb-25", value: 4116000 },
      { month: "Mar-25", value: 4136000 },
      { month: "Apr-25", value: 4166000 },
      { month: "May-25", value: 4191000 },
      { month: "Jun-25", value: 4229000 },
      { month: "Jul-25", value: 4262000 },
      { month: "Aug-25", value: 4118000 },
      { month: "Sep-25", value: 4131000 },
      { month: "Oct-25", value: 2186000 },
      { month: "Nov-25", value: 2778000 },
      { month: "Dec-25", value: 2198000 }
    ]
  },
  {
    line: "CCL",
    color: "#ff9e18",
    data: [
      { month: "Jan-25", value: 921000 },
      { month: "Feb-25", value: 1063000 },
      { month: "Mar-25", value: 1244000 },
      { month: "Apr-25", value: 1067000 },
      { month: "May-25", value: 1237000 },
      { month: "Jun-25", value: 1069000 },
      { month: "Jul-25", value: 1245000 },
      { month: "Aug-25", value: 1236000 },
      { month: "Sep-25", value: 1236000 },
      { month: "Oct-25", value: 1489000 },
      { month: "Nov-25", value: 1486000 },
      { month: "Dec-25", value: 2464000 }
    ]
  },
  {
    line: "DTL",
    color: "#0055b8",
    data: [
      { month: "Jan-25", value: 8139000 },
      { month: "Feb-25", value: 8128000 },
      { month: "Mar-25", value: 8156000 },
      { month: "Apr-25", value: 2727000 },
      { month: "May-25", value: 4100000 },
      { month: "Jun-25", value: 4100000 },
      { month: "Jul-25", value: 2768000 },
      { month: "Aug-25", value: 2760000 },
      { month: "Sep-25", value: 2142000 },
      { month: "Oct-25", value: 2174000 },
      { month: "Nov-25", value: 2788000 },
      { month: "Dec-25", value: 2787000 }
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
