import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const seedPath = path.join(root, 'data', 'seed-data.json');
const specPath = path.join(root, 'data', 'spec.json');
const outJsonPath = path.join(root, 'data', 'site-data.json');
const outJsPath = path.join(root, 'data', 'site-data.js');

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

// Future extension point:
// 1. Fetch current benchmark pages / APIs
// 2. Parse authoritative latest values
// 3. Append new snapshot records and backfill series points
// Keep writes batched to avoid rate limits.

const normalizeCategory = (key, description) => ({
  metric: spec.metrics[key].label,
  description,
  series: seed[key].map(entry => ({
    company: entry.company,
    series: entry.series,
    points: (entry.models || []).map(model => ({
      model: model.model,
      date: model.date,
      score: model.score ?? null,
      source: model.source ?? null
    }))
  }))
});

const snapshotMeta = {
  date: new Date().toISOString().slice(0, 10),
  note: 'Curated normalized release-trajectory snapshot generated from seed-data.json.'
};

const priorSnapshots = Array.isArray(seed.snapshots) ? seed.snapshots : [];
const dedupedSnapshots = [...priorSnapshots.filter(s => s?.date !== snapshotMeta.date), snapshotMeta];

const siteData = {
  generatedAt: new Date().toISOString(),
  snapshots: dedupedSnapshots,
  sources: seed.sources,
  categories: {
    chat: normalizeCategory('chat', 'Mainstream language model family score curves using a unified intelligence metric.'),
    image: normalizeCategory('image', 'Image model family quality curves using a unified arena Elo metric.'),
    video: normalizeCategory('video', 'Video generation family quality curves using a unified text-to-video Elo metric.')
  }
};

fs.writeFileSync(outJsonPath, JSON.stringify(siteData, null, 2) + '\n');
fs.writeFileSync(outJsPath, `window.SITE_DATA = ${JSON.stringify(siteData, null, 2)};\n`);
console.log(`Wrote ${outJsonPath}`);
console.log(`Wrote ${outJsPath}`);
