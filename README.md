# Frontier Model Timeline

A static GitHub Pages dashboard that refreshes verified public AI model leaderboard data every day for Chat, Image, and Video.

## Live data sources

- Chat: [Artificial Analysis LLM Leaderboard](https://artificialanalysis.ai/leaderboards/models), using the Artificial Analysis Intelligence Index.
- Image: [Artificial Analysis Text-to-Image Leaderboard](https://artificialanalysis.ai/image/leaderboard/text-to-image), using its Elo score.
- Video: [Artificial Analysis Text-to-Video Leaderboard](https://artificialanalysis.ai/video/leaderboard/text-to-video), using the default with-audio Elo score.

The three scores are separate metrics and must not be compared across tabs.

## How the refresh works

1. `scripts/refresh-live-data.mjs` downloads the public server-rendered leaderboard payloads.
2. It discovers every verified scored model in the tables. Chat estimates are excluded from the ranked dataset; there is no hard-coded model or brand whitelist.
3. It validates row counts, IDs, scores, and ranks for all three modules. If one source is incomplete or its page structure changes, the command fails and the old verified data stays published.
4. It writes the current full model records and compact change history to `data/seed-data.json`.
5. `scripts/update-data.mjs` regenerates `data/site-data.json` and `data/site-data.js`; the browser redraws charts and tables from those files.
6. `.github/workflows/daily-refresh.yml` runs at 02:13 UTC (10:13 Asia/Shanghai), commits verified changes, and deploys GitHub Pages.

## Commands

```bash
npm run refresh:live
npm run verify:data
```

No npm dependencies or API keys are required.

## GitHub setup

After adding the workflow files, open repository **Settings → Pages** and set **Source** to **GitHub Actions**. Then run **Daily verified model refresh** once from the Actions tab. Scheduled workflows run only from the default branch.
