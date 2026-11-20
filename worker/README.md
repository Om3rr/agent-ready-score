# Agent-Ready Score Worker

Serves the paste-and-score landing page, `POST /api/score`, `GET /api/score?url=`, and `/badge` (SVG or Shields endpoint JSON).

Live on the free `workers.dev` subdomain (no custom domain, no Workers Paid plan):

**https://agent-ready-score.omer20sh.workers.dev**

This repository does not contain Cloudflare credentials. CI still runs `wrangler deploy --dry-run` only.

```bash
npx wrangler deploy
```

Public copy is free-tier only ("Pro coming soon"), with no prices or checkout links.
