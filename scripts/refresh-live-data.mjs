import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const root = path.resolve(process.cwd());
const seedPath = path.join(root, 'data', 'seed-data.json');
const cachePath = path.join(root, 'data', 'arena-cache.json');

const pages = {
  chat: {
    url: 'https://arena.ai/leaderboard/text',
    sourceLabel: 'arena.ai text leaderboard daily check',
    patterns: [
      ['GPT', /\b(gpt|chatgpt|openai|o\d)\b/i],
      ['CLAUDE OPUS', /\bclaude[-\s_]?opus\b/i],
      ['GEMINI', /\bgemini\b/i],
      ['GROK', /\bgrok\b/i],
      ['META AI', /\b(llama|meta|muse)\b/i],
      ['QWEN', /\bqwen\b/i],
      ['KIMI', /\bkimi\b/i],
      ['MINIMAX', /\b(minimax|hailuo|abab)\b/i],
      ['DEEPSEEK', /\bdeepseek\b/i],
      ['GLM', /\bglm\b/i],
      ['MIMO', /\bmimo\b/i]
    ]
  },
  image: {
    url: 'https://arena.ai/leaderboard/text-to-image',
    sourceLabel: 'arena.ai text-to-image leaderboard daily check',
    patterns: [
      ['DALL-E / GPT IMAGES', /\b(dall[-\s]?e|gpt[-\s_]?image|openai image)\b/i],
      ['GROK IMAGE', /\bgrok.*image|grok-imagine-image/i],
      ['GEMINI-IMAGEN / NANO BANANA', /\b(gemini.*image|imagen|nano[-\s]?banana)\b/i],
      ['LEONARDO AI', /\bleonardo\b/i],
      ['MIDJOURNEY', /\bmidjourney\b|\bmj[-\s]?v?\d/i],
      ['FLUX', /\bflux\b/i],
      ['SEEDREAM', /\bseedream\b/i]
    ]
  },
  video: {
    url: 'https://arena.ai/leaderboard/text-to-video',
    sourceLabel: 'arena.ai text-to-video leaderboard daily check',
    patterns: [
      ['SEEDANCE', /\b(seedance|dreamina)\b/i],
      ['WAN', /\bwan\d/i],
      ['GOOGLE VEO', /\bveo\b/i],
      ['SORA', /\bsora\b/i],
      ['KLING', /\bkling\b/i],
      ['PIKA AI', /\bpika\b/i],
      ['LUMA LABS', /\b(luma|ray)\b/i]
    ]
  }
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`${url} returned HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`${url} timed out`)));
  });
}

function extractFlightText(html) {
  const re = /self\.__next_f\.push\(\[(\d+),("(?:[^"\\]|\\.)*")\]\)<\/script>/g;
  let match;
  let joined = '';
  while ((match = re.exec(html)) !== null) {
    if (match[1] === '1') joined += JSON.parse(match[2]);
  }
  if (!joined) throw new Error('No Next.js flight text found');
  return joined;
}

function extractJsonArray(text, key) {
  const keyPos = text.indexOf(key);
  if (keyPos < 0) throw new Error(`Key not found: ${key}`);
  const from = text.indexOf('[', keyPos);
  if (from < 0) throw new Error(`Array start not found: ${key}`);

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`Array end not found: ${key}`);
  return JSON.parse(text.slice(from, end + 1));
}

function ratingsFromPlots(plots) {
  const elo = plots.find(plot => plot.type === 'bootstrap_elo_rating');
  return (elo?.data?.modelRatings || [])
    .filter(row => row?.modelDisplayName && Number.isFinite(row.rating))
    .map(row => ({
      model: row.modelDisplayName,
      score: Math.round(row.rating)
    }));
}

async function loadArenaPage(tab, info, options) {
  if (options.fromCache) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return cache.pages?.[tab]?.plots || [];
  }
  const html = await fetchText(info.url);
  const flight = extractFlightText(html);
  return extractJsonArray(flight, 'plots');
}

function findSeries(seed, tab, seriesName) {
  return seed[tab]?.find(entry => entry.series === seriesName);
}

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function alreadyTracked(series, modelName) {
  const normalized = normalizeName(modelName);
  return series.models.some(point => normalizeName(point.model) === normalized);
}

function appendNewRatings(seed, tab, info, ratings, today) {
  const additions = [];
  for (const rating of ratings) {
    const match = info.patterns.find(([, pattern]) => pattern.test(rating.model));
    if (!match) continue;
    const [seriesName] = match;
    const series = findSeries(seed, tab, seriesName);
    if (!series || alreadyTracked(series, rating.model)) continue;

    const point = {
      model: rating.model,
      date: today,
      score: rating.score,
      source: `${info.sourceLabel}; fetched ${today}`
    };
    series.models.push(point);
    additions.push({ tab, series: seriesName, ...point });
  }
  return additions;
}

async function main() {
  const options = { fromCache: process.argv.includes('--from-cache') };
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const allAdditions = [];

  for (const [tab, info] of Object.entries(pages)) {
    const plots = await loadArenaPage(tab, info, options);
    const ratings = ratingsFromPlots(plots);
    const additions = appendNewRatings(seed, tab, info, ratings, today);
    allAdditions.push(...additions);
    console.log(`${tab}: checked ${ratings.length} ratings, added ${additions.length} points`);
  }

  seed.generatedAt = new Date().toISOString();
  seed.snapshots = [
    ...(Array.isArray(seed.snapshots) ? seed.snapshots.filter(item => item?.date !== today) : []),
    {
      date: today,
      note: allAdditions.length
        ? `Daily arena.ai check added ${allAdditions.length} new scored release points.`
        : 'Daily arena.ai check found no new mapped release points.'
    }
  ];

  if (allAdditions.length) {
    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
    console.log(`Updated ${seedPath}`);
    for (const item of allAdditions) {
      console.log(`+ ${item.tab}/${item.series}: ${item.model} (${item.score})`);
    }
  } else {
    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
    console.log('No new model points added; snapshot metadata updated.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
