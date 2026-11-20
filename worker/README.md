# Agent-Ready Score Worker

Serves the paste-and-score landing page, `POST /api/score`, `GET /api/score?url=`, and `/badge` (SVG or Shields endpoint JSON). Public, privacy-preserving traffic for the last 30 days is at [`/stats.html`](https://agent-ready-score.omer20sh.workers.dev/stats.html) and [`/stats`](https://agent-ready-score.omer20sh.workers.dev/stats) (JSON). Counts are stored in the shared free D1 database `studio-metrics` (hashed unique visitors, never raw IPs) via `ctx.waitUntil` and fail open.

Live on the free `workers.dev` subdomain (no custom domain, no Workers Paid plan):

**https://agent-ready-score.omer20sh.workers.dev**

This repository does not contain Cloudflare credentials. CI still runs `wrangler deploy --dry-run` only.

```bash
npx wrangler deploy
```

Public copy is free-tier only ("Pro coming soon"), with no prices or checkout links.
