import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const root = path.resolve(process.cwd());
const seedPath = path.join(root, 'data', 'seed-data.json');

const sources = {
  chat: {
    name: 'Artificial Analysis LLM Leaderboard',
    url: 'https://artificialanalysis.ai/leaderboards/models',
    metric: 'Artificial Analysis Intelligence Index',
    minimumRows: 50
  },
  image: {
    name: 'Artificial Analysis Text-to-Image Leaderboard',
    url: 'https://artificialanalysis.ai/image/leaderboard/text-to-image',
    metric: 'Artificial Analysis Text-to-Image Elo',
    minimumRows: 20
  },
  video: {
    name: 'Artificial Analysis Text-to-Video Leaderboard (with audio)',
    url: 'https://artificialanalysis.ai/video/leaderboard/text-to-video',
    metric: 'Artificial Analysis Text-to-Video Elo (with audio)',
    minimumRows: 10
  }
};

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; FrontierModelTimeline/2.0; +https://github.com/jeffreylexxx/AI-model-score-compare)'
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error(`Too many redirects for ${url}`));
        return resolve(fetchText(new URL(response.headers.location, url).href, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`${url} returned HTTP ${response.statusCode}`));
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });
    request.setTimeout(45000, () => request.destroy(new Error(`${url} timed out`)));
    request.on('error', reject);
  });
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

function extractFlightText(html) {
  const expression = /self\.__next_f\.push\(\[(\d+),("(?:[^"\\]|\\.)*")\]\)<\/script>/g;
  let flight = '';
  for (const match of html.matchAll(expression)) {
    if (match[1] === '1') flight += JSON.parse(match[2]);
  }
  if (!flight) throw new Error('Artificial Analysis Next.js data payload was not found');
  return flight;
}

function extractBracketed(text, start, open = '[', close = ']') {
  if (text[start] !== open) throw new Error(`Expected ${open} at offset ${start}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated ${open}${close} data segment`);
}

function parseChat(flight) {
  const scorePosition = flight.indexOf('"intelligenceIndex":');
  const markerPosition = flight.lastIndexOf('"models":[', scorePosition);
  if (scorePosition < 0 || markerPosition < 0) throw new Error('LLM leaderboard model array was not found');
  const arrayStart = flight.indexOf('[', markerPosition);
  const rawModels = JSON.parse(extractBracketed(flight, arrayStart));
  return rawModels
    .filter(model => model?.id && model?.name && Number.isFinite(model.intelligenceIndex) && !model.intelligenceIndexIsEstimated)
    .sort((a, b) => b.intelligenceIndex - a.intelligenceIndex || a.name.localeCompare(b.name))
    .map((model, index) => ({
      id: model.id,
      name: model.name,
      creator: model.modelCreatorName || 'Unknown',
      creatorSlug: model.modelCreatorSlug || null,
      releaseDate: model.releaseDate || null,
      score: model.intelligenceIndex,
      rank: index + 1,
      isCurrent: !model.deprecated,
      isReasoning: Boolean(model.isReasoning),
      isEstimated: false,
      details: model
    }));
}

function parseMedia(flight) {
  const firstRow = flight.indexOf('{"formatted":{"rank":1,"elo"');
  if (firstRow < 0) throw new Error('Media leaderboard rows were not found');
  const arrayStart = flight.lastIndexOf('[', firstRow);
  const rows = JSON.parse(extractBracketed(flight, arrayStart));
  return rows
    .map(row => row?.values)
    .filter(model => model?.id && model?.name && Number.isFinite(model.elo))
    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
    .map((model, index) => ({
      id: model.id,
      name: model.name,
      creator: model.creator?.name || 'Unknown',
      creatorSlug: model.creator?.id || null,
      releaseDate: model.released || null,
      score: model.elo,
      rank: index + 1,
      isCurrent: model.isCurrent !== false,
      appearances: model.appearances ?? null,
      confidenceInterval: Number.isFinite(model.ciLower) && Number.isFinite(model.ciUpper)
        ? { lower: model.ciLower, upper: model.ciUpper, delta: model.ciDelta ?? null }
        : null,
      price: model.pricePer1kImages ?? model.pricePerMinute ?? null,
      details: model
    }));
}

function validateCategory(tab, models) {
  const { minimumRows } = sources[tab];
  if (models.length < minimumRows) {
    throw new Error(`${tab}: parsed ${models.length} rows; expected at least ${minimumRows}. Refusing to publish a partial snapshot.`);
  }
  if (models.some(model => !Number.isFinite(model.score) || model.rank < 1)) {
    throw new Error(`${tab}: invalid score or rank detected`);
  }
  if (new Set(models.map(model => model.id)).size !== models.length) {
    throw new Error(`${tab}: duplicate model IDs detected`);
  }
}

function digest(models) {
  const compact = models.map(({ id, rank, score }) => [id, rank, score]);
  return crypto.createHash('sha256').update(JSON.stringify(compact)).digest('hex').slice(0, 16);
}

function mergeHistory(previous, categories, today) {
  const history = previous?.schemaVersion === 2 && previous.history ? previous.history : {};
  for (const tab of Object.keys(categories)) {
    const previousTab = history[tab] || {};
    const nextTab = {};
    for (const model of categories[tab].models) {
      const points = Array.isArray(previousTab[model.id]) ? previousTab[model.id] : [];
      const point = { date: today, rank: model.rank, score: model.score };
      const withoutToday = points.filter(item => item?.date !== today);
      const previousPoint = withoutToday.at(-1);
      if (!previousPoint || previousPoint.rank !== point.rank || previousPoint.score !== point.score) {
        withoutToday.push(point);
      }
      nextTab[model.id] = withoutToday;
    }
    history[tab] = nextTab;
  }
  return history;
}

async function main() {
  const previous = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : {};
  const fetchedAt = new Date().toISOString();
  const today = fetchedAt.slice(0, 10);
  const categories = {};

  for (const [tab, source] of Object.entries(sources)) {
    const html = await fetchWithRetry(source.url);
    const flight = extractFlightText(html);
    const models = tab === 'chat' ? parseChat(flight) : parseMedia(flight);
    validateCategory(tab, models);
    categories[tab] = {
      metric: source.metric,
      source: source.url,
      models,
      digest: digest(models)
    };
    console.log(`${tab}: ${models.length} ranked models; top=${models[0].name} (${models[0].score.toFixed(2)}); digest=${categories[tab].digest}`);
  }

  const snapshots = [
    ...(previous?.schemaVersion === 2 && Array.isArray(previous.snapshots)
      ? previous.snapshots.filter(snapshot => snapshot?.date !== today)
      : []),
    {
      date: today,
      fetchedAt,
      counts: Object.fromEntries(Object.entries(categories).map(([tab, category]) => [tab, category.models.length])),
      digests: Object.fromEntries(Object.entries(categories).map(([tab, category]) => [tab, category.digest]))
    }
  ];

  const output = {
    schemaVersion: 2,
    generatedAt: fetchedAt,
    sources: Object.entries(sources).map(([id, source]) => ({ id, name: source.name, url: source.url })),
    categories,
    history: mergeHistory(previous, categories, today),
    snapshots
  };

  fs.writeFileSync(seedPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote verified snapshot to ${seedPath}`);
}

main().catch(error => {
  console.error(`Live refresh failed: ${error.stack || error.message}`);
  process.exit(1);
});
