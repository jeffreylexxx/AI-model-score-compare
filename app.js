const palette = ['#7c9cff','#4de2c5','#f59e0b','#f472b6','#a78bfa','#34d399','#fb7185','#22d3ee','#fde047','#c084fc','#60a5fa','#2dd4bf'];
const tabs = ['chat', 'image', 'video'];
let currentTab = 'chat';
let chart;

const els = {
  tabs: document.getElementById('tabs'),
  metricLabel: document.getElementById('metric-label'),
  lastUpdated: document.getElementById('last-updated'),
  panelTitle: document.getElementById('panel-title'),
  panelDescription: document.getElementById('panel-description'),
  table: document.getElementById('data-table'),
  sources: document.getElementById('source-list'),
  summaryCards: document.getElementById('summary-cards'),
  canvas: document.getElementById('timelineChart'),
  status: document.getElementById('app-status'),
  tableExtraHeading: document.getElementById('table-extra-heading')
};

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatScore(value) {
  if (!Number.isFinite(value)) return '—';
  return currentTab === 'chat' ? value.toFixed(1) : value.toFixed(0);
}

function setStatus(message) {
  els.status.style.display = message ? 'block' : 'none';
  els.status.textContent = message || '';
}

async function loadData() {
  if (window.SITE_DATA) return window.SITE_DATA;
  const response = await fetch('./data/site-data.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`site-data.json returned HTTP ${response.status}`);
  return response.json();
}

function renderSummary(data) {
  const totalModels = tabs.reduce((sum, tab) => sum + data.categories[tab].leaderboard.length, 0);
  const creators = new Set(tabs.flatMap(tab => data.categories[tab].leaderboard.map(model => model.creator)));
  const latest = data.snapshots?.at(-1);
  const cards = [
    ['Ranked models', totalModels],
    ['Model creators', creators.size],
    ['Verified modules', '3 / 3'],
    ['Daily snapshot', latest?.date || '—']
  ];
  els.summaryCards.innerHTML = cards.map(([label, value]) => `
    <div class="stat-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>
  `).join('');
}

function renderTabs(updateView) {
  els.tabs.innerHTML = tabs.map(tab => `
    <button class="tab-btn ${tab === currentTab ? 'active' : ''}" data-tab="${tab}">${tab.toUpperCase()}</button>
  `).join('');
  els.tabs.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    currentTab = button.dataset.tab;
    updateView();
  }));
}

function buildDatasets(category) {
  return category.series.map((series, index) => ({
    label: series.series,
    data: series.points.map(point => ({
      x: point.date,
      y: point.score,
      model: point.model,
      rank: point.rank,
      source: point.source
    })),
    borderColor: palette[index % palette.length],
    backgroundColor: palette[index % palette.length],
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 7,
    tension: 0.2,
    spanGaps: true
  })).filter(dataset => dataset.data.length);
}

function renderChart(category) {
  if (chart) chart.destroy();
  const datasets = buildDatasets(category);
  if (!datasets.length) {
    setStatus('No verified scored models with release dates are available for this module.');
    return;
  }
  setStatus('');
  chart = new Chart(els.canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { color: '#e8eefc', usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            title(items) { return new Date(items[0].raw.x).toLocaleDateString(); },
            label(context) { return `${context.raw.model}: ${formatScore(context.raw.y)} · rank #${context.raw.rank}`; },
            afterLabel(context) { return `Creator: ${context.dataset.label}`; }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month' },
          ticks: { color: '#9eb1d3' },
          grid: { color: 'rgba(255,255,255,.06)' }
        },
        y: {
          ticks: { color: '#9eb1d3' },
          grid: { color: 'rgba(255,255,255,.06)' },
          title: { display: true, text: category.metric, color: '#9eb1d3' }
        }
      }
    }
  });
}

function extraValue(model) {
  if (currentTab === 'chat') {
    const labels = [];
    if (model.isReasoning) labels.push('Reasoning');
    if (model.isEstimated) labels.push('Estimated score');
    if (!model.isCurrent) labels.push('Deprecated');
    return labels.join(' · ') || 'Standard';
  }
  const interval = model.confidenceInterval
    ? `${model.confidenceInterval.lower.toFixed(0)}–${model.confidenceInterval.upper.toFixed(0)} CI`
    : 'CI —';
  const appearances = Number.isFinite(model.appearances) ? `${model.appearances.toLocaleString()} samples` : 'Samples —';
  return `${appearances} · ${interval}`;
}

function renderTable(category) {
  els.tableExtraHeading.textContent = currentTab === 'chat' ? 'Model type' : 'Samples / 95% CI';
  els.table.innerHTML = category.leaderboard.map(model => `
    <tr>
      <td>#${escapeHtml(model.rank)}</td>
      <td>${escapeHtml(model.name)}</td>
      <td>${escapeHtml(model.creator)}</td>
      <td>${escapeHtml(model.releaseDate)}</td>
      <td>${escapeHtml(formatScore(model.score))}</td>
      <td>${escapeHtml(extraValue(model))}</td>
    </tr>
  `).join('');
}

function renderSources(data) {
  els.sources.innerHTML = data.sources.map(source => `
    <li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a></li>
  `).join('');
}

async function main() {
  const data = await loadData();
  if (data.schemaVersion !== 2) throw new Error('Unsupported data schema');

  function updateView() {
    renderTabs(updateView);
    const category = data.categories[currentTab];
    els.metricLabel.textContent = category.metric;
    els.lastUpdated.textContent = new Date(data.generatedAt).toLocaleString();
    els.panelTitle.textContent = currentTab.toUpperCase();
    els.panelDescription.textContent = category.description;
    renderChart(category);
    renderTable(category);
  }

  renderSummary(data);
  renderSources(data);
  updateView();
}

main().catch(error => {
  console.error(error);
  setStatus(`Application failed to initialize: ${error.message}`);
});
