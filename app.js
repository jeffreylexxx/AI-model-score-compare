const palette = ['#7c9cff','#4de2c5','#f59e0b','#f472b6','#a78bfa','#34d399','#fb7185','#22d3ee','#fde047','#c084fc','#60a5fa','#2dd4bf'];
const tabs = ['chat','image','video'];
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
  milestones: document.getElementById('milestone-strip'),
  arenaRankingTable: document.getElementById('arena-ranking-table'),
  arenaWinrateTable: document.getElementById('arena-winrate-table'),
  arenaEloTable: document.getElementById('arena-elo-table'),
  arenaHeatmap: document.getElementById('arena-heatmap')
};

let currentTab = 'chat';

function setStatus(message) {
  if (!message) {
    els.status.style.display = 'none';
    els.status.textContent = '';
    return;
  }
  els.status.style.display = 'block';
  els.status.textContent = message;
}

async function loadData() {
  if (window.SITE_DATA) return window.SITE_DATA;
  const res = await fetch('./data/site-data.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function extractEscapedArray(html, key) {
  const marker = `\\"${key}\\":[`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Arena ${key} not found`);
  const from = start + marker.length - 1;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error(`Arena ${key} end not found`);
  const raw = html.slice(from, end + 1);
  const jsonText = raw.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '').replace(/\\t/g, ' ');
  return JSON.parse(jsonText);
}

async function loadArenaCache() {
  const res = await fetch('./data/arena-cache.json');
  if (!res.ok) throw new Error(`Arena cache HTTP ${res.status}`);
  return await res.json();
}

function renderSummary(data) {
  const totalSeries = tabs.reduce((n,key)=> n + data.categories[key].series.length, 0);
  const totalPoints = tabs.reduce((n,key)=> n + data.categories[key].series.reduce((a,s)=>a+s.points.length,0), 0);
  const scoredPoints = tabs.reduce((n,key)=> n + data.categories[key].series.reduce((a,s)=>a+s.points.filter(p=>p.score!==null).length,0), 0);
  const cards = [
    ['Tracked families', totalSeries],
    ['Release points', totalPoints],
    ['Scored points', scoredPoints],
    ['Refresh cadence', 'Daily']
  ];
  els.summaryCards.innerHTML = cards.map(([label,value]) => `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join('');
}

function renderTabs(updateView) {
  els.tabs.innerHTML = tabs.map(tab => `<button class="tab-btn ${tab===currentTab?'active':''}" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('');
  els.tabs.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { currentTab = btn.dataset.tab; updateView(); }));
}

function modelColor(seriesLabel, modelName, fallbackColor) {
  if (currentTab !== 'image') return fallbackColor;
  if (seriesLabel === 'DALL-E / GPT IMAGES') {
    return modelName.startsWith('GPT Image') ? palette[4] : palette[0];
  }
  if (seriesLabel === 'GEMINI-IMAGEN / NANO BANANA') {
    return modelName.startsWith('Nano Banana') ? palette[3] : palette[2];
  }
  return fallbackColor;
}

function buildDatasets(category) {
  return category.series.map((series, index) => {
    const baseColor = palette[index % palette.length];
    const points = series.points
      .filter(p => p.score !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.model).localeCompare(String(b.model)))
      .map(p => ({ x: p.date, y: p.score, model: p.model, source: p.source }));

    return {
      label: series.series,
      data: points,
      borderColor: baseColor,
      backgroundColor: points.map(point => modelColor(series.series, point.model, baseColor)),
      pointBackgroundColor: points.map(point => modelColor(series.series, point.model, baseColor)),
      pointBorderColor: points.map(point => modelColor(series.series, point.model, baseColor)),
      segment: {
        borderColor(ctx) {
          return modelColor(series.series, ctx.p1.raw.model, baseColor);
        }
      },
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.28,
      spanGaps: true
    };
  }).filter(dataset => dataset.data.length > 0);
}

function getMilestones(category) {
  return category.series.flatMap(series => series.points
    .filter(point => point.score === null && point.source === 'release_only')
    .map(point => ({ series: series.series, model: point.model, date: point.date }))
  ).sort((a,b)=> new Date(a.date)-new Date(b.date));
}

function renderMilestones(category) {
  const milestones = getMilestones(category);
  if (!milestones.length) {
    els.milestones.style.display = 'none';
    els.milestones.innerHTML = '';
    return;
  }
  els.milestones.style.display = 'block';
  els.milestones.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px;color:#dbe6ff">Release milestones without verified score yet</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${milestones.map(m => `
      <div style="padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)">
        <span style="color:#fff;font-weight:600">${m.model}</span>
        <span style="color:#9eb1d3"> · ${m.date}</span>
      </div>`).join('')}</div>`;
}

function renderChart(category) {
  const ctx = els.canvas.getContext('2d');
  if (chart) chart.destroy();

  const datasets = buildDatasets(category);
  const firstDate = datasets
    .flatMap(dataset => dataset.data.map(point => point.x))
    .sort((a, b) => new Date(a) - new Date(b))[0];
  if (datasets.length === 0) {
    setStatus('This tab currently has release timeline data, but not enough scored historical points yet to draw visible lines. The table below still shows tracked releases.');
  } else {
    setStatus('');
  }

  chart = new Chart(ctx, {
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
            label(ctx) { return `${ctx.dataset.label}: ${ctx.raw.y} · ${ctx.raw.model}`; },
            afterLabel(ctx) { return ctx.raw.source ? `Source: ${ctx.raw.source}` : ''; }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month' },
          min: firstDate,
          ticks: { color: '#9eb1d3' },
          grid: { color: 'rgba(255,255,255,.06)' }
        },
        y: {
          ticks: { color: '#9eb1d3' },
          grid: { color: 'rgba(255,255,255,.06)' }
        }
      }
    }
  });
}

function renderTable(category) {
  const rows = category.series.flatMap(series => series.points.map(point => ({ series: series.series, ...point })));
  els.table.innerHTML = rows.sort((a,b)=> new Date(a.date)-new Date(b.date)).map(row => `
    <tr>
      <td>${row.series}</td>
      <td>${row.model}</td>
      <td>${row.date}</td>
      <td>${row.score ?? '—'}</td>
      <td>${row.source ?? '—'}</td>
    </tr>`).join('');
}

function renderSources(data) {
  els.sources.innerHTML = data.sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noreferrer">${s.name}</a></li>`).join('');
}

function mRank(model, modality) {
  return model.rankByModality?.[modality] ?? Number.MAX_SAFE_INTEGER;
}

function renderArenaRanking(models) {
  if (!els.arenaRankingTable) return;
  const modality = currentTab;
  const rows = models
    .filter(m => m.rankByModality && Number.isFinite(m.rankByModality[modality]) && m.rankByModality[modality] < 1e12)
    .sort((a, b) => mRank(a, modality) - mRank(b, modality))
    .slice(0, 30);

  els.arenaRankingTable.innerHTML = rows.map(row => `
    <tr>
      <td>${mRank(row, modality)}</td>
      <td>${row.displayName || row.publicName || '—'}</td>
      <td>${row.organization || '—'}</td>
      <td>${modality.toUpperCase()}</td>
    </tr>`).join('');
}

function renderArenaPlots(plots) {
  if (!plots?.length) return;
  const winRate = plots.find(p => p.type === 'average_win_rate_bar');
  const elo = plots.find(p => p.type === 'bootstrap_elo_rating');
  const heatmap = plots.find(p => p.type === 'win_fraction_heatmap');

  if (els.arenaWinrateTable && winRate?.data?.modelWinRates) {
    els.arenaWinrateTable.innerHTML = winRate.data.modelWinRates.slice(0, 20).map((row, i) => `
      <tr><td>${i + 1}</td><td>${row.modelDisplayName}</td><td>${(row.winRate * 100).toFixed(1)}%</td></tr>
    `).join('');
  }

  if (els.arenaEloTable && elo?.data?.modelRatings) {
    els.arenaEloTable.innerHTML = elo.data.modelRatings.slice(0, 20).map((row, i) => `
      <tr><td>${i + 1}</td><td>${row.modelDisplayName}</td><td>${row.rating.toFixed(1)}</td><td>${row.ratingLower.toFixed(1)} - ${row.ratingUpper.toFixed(1)}</td></tr>
    `).join('');
  }

  if (els.arenaHeatmap && heatmap?.data?.models && heatmap?.data?.values) {
    const models = heatmap.data.models.slice(0, 12);
    const values = heatmap.data.values.slice(0, 12).map(r => r.slice(0, 12));
    const header = ['<div class="heatmap-label"></div>', ...models.map(m => `<div class="heatmap-label">${m}</div>`)].join('');
    const body = values.map((row, i) => {
      const label = `<div class="heatmap-label">${models[i]}</div>`;
      const cells = row.map(v => {
        if (v === null || Number.isNaN(v)) return '<div class="heatmap-cell" style="background:rgba(255,255,255,.06)">—</div>';
        const hue = Math.round(v * 120);
        return `<div class="heatmap-cell" style="background:hsl(${hue},70%,35%)">${(v * 100).toFixed(0)}</div>`;
      }).join('');
      return label + cells;
    }).join('');
    els.arenaHeatmap.style.gridTemplateColumns = `120px repeat(${models.length}, minmax(36px, 1fr))`;
    els.arenaHeatmap.innerHTML = header + body;
  }
}

async function main() {
  const data = await loadData();
  const arenaCache = await loadArenaCache();
  let arenaData = { rankedModels: [], plots: [] };

  async function updateView() {
    renderTabs(updateView);
    const category = data.categories[currentTab];
    arenaData = arenaCache.pages[currentTab] || { rankedModels: [], plots: [] };
    els.metricLabel.textContent = category.metric;
    els.lastUpdated.textContent = new Date(data.generatedAt).toLocaleString();
    els.panelTitle.textContent = currentTab.toUpperCase();
    els.panelDescription.textContent = category.description;
    renderMilestones(category);
    renderChart(category);
    renderTable(category);
    renderArenaRanking(arenaData.rankedModels || []);
    renderArenaPlots(arenaData.plots || []);
  }

  renderSummary(data);
  renderSources(data);
  updateView();
}

main().catch(err => {
  console.error(err);
  setStatus('Application failed to initialize. Open the browser console for details.');
});
