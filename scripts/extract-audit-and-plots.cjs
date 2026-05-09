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

function extractBracketedSegment(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Marker not found: ${marker}`);
  const from = start + marker.length - 1;
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
  if (end < 0) throw new Error(`No end found for marker: ${marker}`);
  return text.slice(from, end + 1);
}

function parseEscapedJsonArray(html, key) {
  const raw = extractBracketedSegment(html, `\\"${key}\\":[`);
  const decoded = JSON.parse('"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return JSON.parse(decoded);
}

(async () => {
  const pages = {
    chat: 'https://arena.ai/leaderboard/text',
    image: 'https://arena.ai/leaderboard/text-to-image',
    video: 'https://arena.ai/leaderboard/text-to-video'
  };

  const arenaPlots = { fetchedAt: new Date().toISOString(), pages: {} };
  for (const [name, url] of Object.entries(pages)) {
    const html = await fetch(url);
    const plots = parseEscapedJsonArray(html, 'plots');
    arenaPlots.pages[name] = {
      source: url,
      plotTypes: plots.map(p => p.type),
      plots
    };
    console.log(name, plots.map(p => p.type));
  }
  fs.writeFileSync(path.join('/Users/jeffrey/.openclaw/workspace_B/llm-timeline-site/data', 'arena-plots.json'), JSON.stringify(arenaPlots, null, 2));
  console.log('wrote arena-plots.json');
})();
