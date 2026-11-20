# Measurement: CTA events, UTM conventions, and the 2-week test

Free tier only. No cookies, no third-party scripts, no IPs or emails in events.
This layer counts **actions** (CTA events). Route and unique-visitor counts come from studio metrics (`/stats`, D1 `studio-metrics`), which this does not replace.

## Where events go

| Sink | Binding | Cost | How to read |
| --- | --- | --- | --- |
| Workers Analytics Engine | `EVENTS` → dataset `agent_ready_events` | Free plan: 100k points/day | SQL API (below) |
| Workers Logs | `console.log("cta_event", …)` | Free plan, observability on | Dashboard → Workers → Logs, filter `cta_event` |
| Pro waitlist | `WAITLIST` KV (create before enabling) | Free plan: 1k writes/day | `wrangler kv key list --binding WAITLIST --prefix waitlist:pro:` |

## Events

| Event | Where | Fired when | `label` | `value` |
| --- | --- | --- | --- | --- |
| `page_view` | client | any page loads (`/t.js`) | – | – |
| `score_page_view` | client | click into the leaderboard from the hero | source | – |
| `scan_started` | client | Score it is pressed (or `?url=` auto-run) | `url` / `pasted-spec` | – |
| `scan_completed` | **server** | `/api/score` returns a score | spec host | score |
| `scan_failed` | **server** | `/api/score` fails | spec host | 0 |
| `badge_copied` | client | Copy badge markdown | page / API id | – |
| `badge_served` | **server** | `/badge` renders a score (README loop) | spec host | score |
| `action_install_click` | client | any "Add the GitHub Action" link | placement | – |
| `cli_copy` | client | Copy CLI command | placement | – |
| `waitlist_view` | client | Pro waitlist link clicked | placement | – |
| `waitlist_submit` | client | waitlist form submitted | placement | – |
| `waitlist_signup` | **server** | a new email stored in KV (email never logged) | – | – |
| `outbound_repo_click` | client | link to the GitHub repo | placement | – |

Server-only events are rejected by `POST /api/event`, so funnel numbers cannot be inflated from a browser.
Blob order in Analytics Engine: `event, product, path, ref, utm_source, utm_medium, utm_campaign, utm_content, label, country, origin`; `double1` = value.

## UTM conventions

`utm_source` = where the click came from, `utm_medium` = channel type, `utm_campaign` = initiative, `utm_content` = placement or variant. Lowercase, hyphens.

| Channel | utm_source | utm_medium | utm_campaign |
| --- | --- | --- | --- |
| README badge link | `badge` (score pages use `agent-ready-score` + `utm_medium=badge`) | `readme` | `badge-loop` |
| Show HN / Reddit / X / LinkedIn / Product Hunt post | `hn` / `reddit` / `x` / `linkedin` / `producthunt` | `social` | `launch-w1` |
| Directory or awesome-list entry | directory slug, e.g. `awesome-mcp-servers` | `directory` | `listing` |
| GitHub Marketplace listing | `github-marketplace` | `marketplace` | `listing` |
| Leaderboard and score pages (internal) | `agent-ready-score` | `leaderboard` / `score-page` | `scores` / `rescore` / `action` |
| Cross-link from MCP Readiness | `mcp-readiness` | `cross-sell` | `sister-tool` |

AI answer engines rarely pass UTMs, so `ref` (referrer host) is logged on every event: watch for `chatgpt.com`, `perplexity.ai`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, `www.bing.com`.

## Queries (Analytics Engine SQL API)

```sql
-- Funnel by day (Israel time is UTC+2 in winter)
SELECT toDate(timestamp) AS day, blob1 AS event, SUM(_sample_interval) AS n
FROM agent_ready_events WHERE timestamp > NOW() - INTERVAL '14' DAY
GROUP BY day, event ORDER BY day, event;

-- Which sources produce completed scans
SELECT blob5 AS source, blob4 AS ref, SUM(_sample_interval) AS n
FROM agent_ready_events WHERE blob1 = 'scan_completed' OR blob1 = 'page_view'
GROUP BY source, ref ORDER BY n DESC LIMIT 30;

-- Distinct badge adopters (spec hosts)
SELECT COUNT(DISTINCT blob9) FROM agent_ready_events WHERE blob1 = 'badge_served';
```

Run with `curl https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql -H "Authorization: Bearer $TOKEN" -d "<query>"` (a token with Account Analytics Read).

## SEO / AEO files

- `worker/public/scores/` – leaderboard + one page per API, built from a recorded run (`samples/leaderboard-*.json`). Never hand-edit scores; re-run `scripts/score-leaderboard.mjs`, then `scripts/build-seo-pages.mjs`.
- `worker/public/llms.txt`, `robots.txt` (AI crawlers allowed, `/api/` disallowed), `sitemap.xml`.
- JSON-LD: SoftwareApplication + FAQPage (landing), Dataset + ItemList + FAQPage (leaderboard), WebPage + BreadcrumbList + FAQPage (each API).
