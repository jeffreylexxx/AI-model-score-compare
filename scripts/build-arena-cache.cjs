const https = require('https');
const fs = require('fs');
const path = require('path');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractFlightText(html) {
  const re = /self\.__next_f\.push\(\[(\d+),("(?:[^"\\]|\\.)*")\]\)<\/script>/g;
  let m;
  let joined = '';
  while ((m = re.exec(html)) !== null) {
    if (m[1] === '1') joined += JSON.parse(m[2]);
  }
  if (!joined) throw new Error('No flight text found');
  return joined;
}

function extractJsonArray(text, key) {
  const keyPos = text.indexOf(key);
  if (keyPos < 0) throw new Error(`Key not found: ${key}`);
  const from = text.indexOf('[', keyPos);
  if (from < 0) throw new Error(`Array start not found: ${key}`);
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
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
  if (end < 0) throw new Error(`End not found for key: ${key}`);
  return JSON.parse(text.slice(from, end + 1));
}

async function main() {
  const pages = {
    chat: { url: 'https://arena.ai/leaderboard/text', modality: 'chat' },
    image: { url: 'https://arena.ai/leaderboard/text-to-image', modality: 'image' },
    video: { url: 'https://arena.ai/leaderboard/text-to-video', modality: 'video' }
  };

  const out = { generatedAt: new Date().toISOString(), pages: {} };

  for (const [tab, info] of Object.entries(pages)) {
    const html = await fetch(info.url);
    const flight = extractFlightText(html);
    const models = extractJsonArray(flight, 'initialModels');
    const plots = extractJsonArray(flight, 'plots');
    const rankedModels = models
      .filter(m => m.rankByModality && Number.isFinite(m.rankByModality[info.modality]) && m.rankByModality[info.modality] < 1e12)
      .map(m => ({
        displayName: m.displayName || m.publicName || '—',
        publicName: m.publicName || null,
        organization: m.organization || null,
        rankByModality: m.rankByModality
      }))
      .sort((a, b) => a.rankByModality[info.modality] - b.rankByModality[info.modality]);

    out.pages[tab] = {
      source: info.url,
      modality: info.modality,
      modelCount: rankedModels.length,
      plotTypes: plots.map(p => p.type),
      rankedModels,
      plots
    };
    console.log(tab, 'ranked=', rankedModels.length, 'plots=', plots.map(p => p.type).join(', '));
  }

  const outPath = path.join(process.cwd(), 'data', 'arena-cache.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
