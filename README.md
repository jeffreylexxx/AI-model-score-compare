# Frontier Model Timeline

Dark, modern, GitHub-deployable visual timeline of frontier AI model scores across Chat, Image, and Video.

## Data strategy

- Historical release dates are seeded from public release announcements, changelogs, and curated family timelines.
- Charted scores now use a curated normalized trajectory dataset, so every plotted family connects an early scored release to later representative upgrades.
- Arena and external leaderboard links remain available as references:
  - Chat: https://arena.ai/leaderboard/text
  - Image: https://arena.ai/leaderboard/text-to-image
  - Video: https://arena.ai/leaderboard/text-to-video
- Scores should be compared within a tab, not across Chat, Image, and Video.
- The deployed site is a static snapshot. A scheduled GitHub Action checks arena.ai once per day, appends newly matched model scores to `data/seed-data.json`, regenerates `data/site-data.json` and `data/site-data.js`, then commits the snapshot back to the repository.
- The daily job runs at 02:13 UTC, which is 10:13 in Asia/Shanghai.

## Automation

- `npm run build:data` rebuilds the static data files from the current curated seed.
- `npm run refresh:live` checks the live leaderboards, appends newly matched model points, and rebuilds the static data files.
- `.github/workflows/daily-refresh.yml` runs `npm run refresh:live` daily and commits snapshot changes when there are updates.
- `.github/workflows/pages.yml` deploys the static site to GitHub Pages on pushes to `main`.

## Categories

- CHAT: GPT, Claude Opus, Grok, Gemini, Meta AI, Qwen, Kimi, MiniMax, DeepSeek, GLM, MIMO
- IMAGE: DALL-E / GPT Images, Grok Image, Gemini-Imagen / Nano Banana, Leonardo AI, Midjourney, Flux, Seedream
- VIDEO: Seedance, Wan, Google Veo, Sora, Kling, Pika AI, Luma Labs

## UI expectations

- dark background, light text
- premium/modern feel
- animated tab transitions
- interactive line chart with tooltips and legend filtering
- source transparency and data disclaimers

## Deployment

Site should work on GitHub Pages.
Daily auto-refresh should be implemented with GitHub Actions.
