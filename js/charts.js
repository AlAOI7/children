// Chart.js helpers for result page

function renderRadarChart(canvasId, categoryScores) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const labels = Object.keys(categoryScores).map(k => CATEGORY_LABELS[k] || k);
  const data = Object.values(categoryScores);
  const maxVals = Object.keys(categoryScores).map(k => CATEGORY_MAX[k] || 35);

  // Normalize to percentage of max
  const normalized = data.map((v, i) => Math.round((v / maxVals[i]) * 100));

  if (window._radarChart) window._radarChart.destroy();
  window._radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'النتيجة %',
        data: normalized,
        backgroundColor: 'rgba(108,99,255,0.2)',
        borderColor: 'rgba(108,99,255,0.9)',
        borderWidth: 2,
        pointBackgroundColor: '#6c63ff',
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: 'rgba(160,160,184,0.7)',
            stepSize: 25,
            font: { family: 'Cairo', size: 10 }
          },
          grid: { color: 'rgba(255,255,255,0.07)' },
          angleLines: { color: 'rgba(255,255,255,0.07)' },
          pointLabels: {
            color: '#a0a0b8',
            font: { family: 'Cairo', size: 12, weight: '600' }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw}%`
          }
        }
      }
    }
  });
}

function renderBarChart(canvasId, categoryScores) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const keys = Object.keys(categoryScores);
  const labels = keys.map(k => CATEGORY_LABELS[k] || k);
  const scores = keys.map(k => categoryScores[k]);
  const maxVals = keys.map(k => CATEGORY_MAX[k] || 35);

  const colors = scores.map((s, i) => {
    const pct = (s / maxVals[i]) * 100;
    if (pct < 45) return 'rgba(16,185,129,0.8)';
    if (pct < 70) return 'rgba(245,158,11,0.8)';
    return 'rgba(239,68,68,0.8)';
  });

  if (window._barChart) window._barChart.destroy();
  window._barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'النتيجة',
          data: scores,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false
        },
        {
          label: 'الحد الأقصى',
          data: maxVals,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: 8,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b8', font: { family: 'Cairo' } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#a0a0b8', font: { family: 'Cairo', size: 12 } }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#a0a0b8', font: { family: 'Cairo' }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} نقطة`
          }
        }
      }
    }
  });
}

function renderTrendChart(canvasId, results) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const sorted = [...results].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(r => formatDate(r.date));
  const totals = sorted.map(r => r.total);

  if (window._trendChart) window._trendChart.destroy();
  window._trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'مجموع النقاط',
        data: totals,
        borderColor: '#6c63ff',
        backgroundColor: 'rgba(108,99,255,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#6c63ff',
        pointRadius: 6,
        pointHoverRadius: 9,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#a0a0b8', font: { family: 'Cairo' } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} نقطة` } }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b8', font: { family: 'Cairo', size: 11 } }
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#a0a0b8', font: { family: 'Cairo' } }
        }
      }
    }
  });
}
