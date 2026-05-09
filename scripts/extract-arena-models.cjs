const https = require('https');
const fs = require('fs');
const path = require('path');

const URL = 'https://arena.ai/leaderboard/text';
const OUT = path.join(process.cwd(), 'data', 'arena-models.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractInitialModels(html) {
  const marker = '\\"initialModels\\":[';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('initialModels marker not found');
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
  if (end < 0) throw new Error('initialModels array end not found');
  const escapedJson = html.slice(from, end + 1);
  const json = JSON.parse('"' + escapedJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return JSON.parse(json);
}

function normalize(models) {
  const limit = Number.MAX_SAFE_INTEGER / 10;
  return models.map(m => ({
    id: m.id,
    organization: m.organization || null,
    provider: m.provider || null,
    publicName: m.publicName || null,
    displayName: m.displayName || null,
    userSelectable: !!m.userSelectable,
    rank: typeof m.rank === 'number' ? m.rank : null,
    rankByModality: Object.fromEntries(Object.entries(m.rankByModality || {}).filter(([,v]) => typeof v === 'number' && v < limit)),
    capabilities: m.capabilities || null
  }));
}

(async () => {
  const html = await fetch(URL);
  const models = normalize(extractInitialModels(html));
  const ranked = models.filter(m => Object.keys(m.rankByModality).length || m.rank !== null);
  const output = {
    fetchedAt: new Date().toISOString(),
    source: URL,
    totalModels: models.length,
    rankedModels: ranked.length,
    modalities: {
      chat: ranked.filter(m => typeof m.rankByModality.chat === 'number').sort((a,b)=>a.rankByModality.chat-b.rankByModality.chat),
      image: ranked.filter(m => typeof m.rankByModality.image === 'number').sort((a,b)=>a.rankByModality.image-b.rankByModality.image),
      video: ranked.filter(m => typeof m.rankByModality.video === 'number').sort((a,b)=>a.rankByModality.video-b.rankByModality.video),
      webdev: ranked.filter(m => typeof m.rankByModality.webdev === 'number').sort((a,b)=>a.rankByModality.webdev-b.rankByModality.webdev),
      search: ranked.filter(m => typeof m.rankByModality.search === 'number').sort((a,b)=>a.rankByModality.search-b.rankByModality.search)
    }
  };
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Chat top 10:`, output.modalities.chat.slice(0, 10).map(m => `${m.rankByModality.chat}. ${m.displayName}`).join(' | '));
})();
