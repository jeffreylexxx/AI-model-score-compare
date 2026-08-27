import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const seedPath = path.join(root, 'data', 'seed-data.json');
const outJsonPath = path.join(root, 'data', 'site-data.json');
const outJsPath = path.join(root, 'data', 'site-data.js');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

if (seed.schemaVersion !== 2 || !seed.categories) {
  throw new Error('seed-data.json is not a verified schema v2 live snapshot. Run npm run refresh:live first.');
}

function buildCategory(tab) {
  const category = seed.categories[tab];
  if (!category?.models?.length) throw new Error(`${tab}: no live models found`);
  const groups = new Map();
  for (const model of category.models) {
    const creator = model.creator || 'Unknown';
    if (!groups.has(creator)) groups.set(creator, []);
    if (model.releaseDate && Number.isFinite(model.score)) {
      groups.get(creator).push({
        model: model.name,
        date: model.releaseDate,
        score: model.score,
        rank: model.rank,
        source: category.source
      });
    }
  }

  const series = [...groups.entries()]
    .map(([creator, points]) => ({
      company: creator,
      series: creator,
      points: points.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank)
    }))
    .filter(group => group.points.length)
    .sort((a, b) => a.series.localeCompare(b.series));

  return {
    metric: category.metric,
    description: `Current ${category.metric} scores plotted by model release date. Scores are refreshed daily from the public leaderboard.`,
    source: category.source,
    digest: category.digest,
    series,
    leaderboard: category.models
  };
}

const siteData = {
  schemaVersion: 2,
  generatedAt: seed.generatedAt,
  snapshots: seed.snapshots,
  sources: seed.sources,
  categories: {
    chat: buildCategory('chat'),
    image: buildCategory('image'),
    video: buildCategory('video')
  }
};

fs.writeFileSync(outJsonPath, `${JSON.stringify(siteData, null, 2)}\n`);
fs.writeFileSync(outJsPath, `window.SITE_DATA = ${JSON.stringify(siteData, null, 2)};\n`);
console.log(`Wrote ${outJsonPath}`);
console.log(`Wrote ${outJsPath}`);
