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

function extractEscapedArray(html, key) {
  const marker = `\\"${key}\\":[`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`${key} marker not found`);
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
  const escaped = html.slice(from, end + 1);
  return JSON.parse(escaped.replace(/\\"/g, '"'));
}

(async () => {
  const pages = {
    chat: 'https://arena.ai/leaderboard/text',
    image: 'https://arena.ai/leaderboard/text-to-image',
    video: 'https://arena.ai/leaderboard/text-to-video'
  };
  const out = { fetchedAt: new Date().toISOString(), pages: {} };
  for (const [key, url] of Object.entries(pages)) {
    const html = await fetch(url);
    const models = extractEscapedArray(html, 'initialModels');
    const plots = extractEscapedArray(html, 'plots');
    out.pages[key] = { source: url, modelCount: models.length, plotCount: plots.length, plots };
    console.log(key, 'models', models.length, 'plots', plots.map(p => p.type).join(', '));
  }
  fs.writeFileSync(path.join('/Users/jeffrey/.openclaw/workspace_B/llm-timeline-site/data', 'arena-plots.json'), JSON.stringify(out, null, 2));
})();
