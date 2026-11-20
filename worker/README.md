# Agent-Ready Score Worker

Serves the paste-and-score landing page, `POST /api/score`, `GET /api/score?url=`, and `/badge` (SVG or Shields endpoint JSON).

This Worker is **not deployed**. CI runs `wrangler deploy --dry-run` only. There are no Cloudflare credentials in this repository.

To deploy later (needs the owner's Cloudflare account and an explicit yes):

```bash
npx wrangler deploy
```

Public copy is free-tier only ("Pro coming soon"), with no prices or checkout links.
