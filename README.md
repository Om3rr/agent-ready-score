# Agent-Ready Score

Paste an OpenAPI spec, a spec URL, or an API / docs site URL. Get a **0–100 score**, a category breakdown, and a concrete fix for every failed check. Use the same engine from a CLI, a GitHub Action (with a README badge), or a paste-and-score web page.

This is the free tool. **Pro coming soon.** There are no paid plans or checkout links in this repository.

## Why this exists

Most APIs were designed for people who can read docs and ask a teammate when a call fails. Agents cannot do that. They need to *find* the API, understand each operation, parse errors, authenticate with scoped credentials, and wrap the surface as tools without overflowing the context window.

The evidence that backs this product is in [EVIDENCE.md](EVIDENCE.md). Sample scores against public specs are in [SAMPLES.md](SAMPLES.md).

## Score categories

Each category is 20% of the overall score. Failed and warned checks include a fix.

| Category | What is checked |
| --- | --- |
| **Discoverability** | `/llms.txt`, a reachable OpenAPI document (and whether the origin advertises it), `/.well-known` entries (MCP / agent discovery, OAuth protected-resource metadata, API catalog), and `robots.txt` rules for AI crawlers |
| **Docs quality** | Operation summaries, useful descriptions, request/response examples, and a meaningful `info.description` |
| **Predictable errors** | Documented 4xx and 5xx responses with schemas, `application/problem+json` (RFC 9457), and a shared or `default` error model |
| **Auth & identity** | Declared security schemes, requirements applied on operations, OAuth 2.0 / OIDC, and scopes that are both declared and used |
| **MCP-wrappability** | Unique valid `operationId`s, typed parameter and body schemas, and the token cost of a generated MCP tool list (~4 characters per token) |

## CLI

You need Node.js 20 or later. From this repo (the package is not published to npm yet):

```bash
npm ci
npm run build
node dist/cli.js ./openapi.yaml
node dist/cli.js https://petstore3.swagger.io/api/v3/openapi.json --json
node dist/cli.js ./openapi.yaml --fail-under 70
```

Once the package is published, the same command will be `npx agent-ready-score <spec-or-url> [--json] [--fail-under N]`.

`--fail-under N` exits `1` when the score is below N, so you can use it in CI. `--skip-discovery` skips origin probes. `--origin URL` sets the origin used for `llms.txt`, well-known, and robots checks.

## GitHub Action

```yaml
- uses: Om3rr/agent-ready-score@v0.1.0
  with:
    spec: ./openapi.yaml
    fail-under: '70'
    badge-path: agent-ready-badge.json
```

Inputs: `spec` (file path or URL; `url` is an alias), `fail-under`, `skip-discovery`, `origin`, `json-path`, `badge-path`.

Outputs: `score`, `findings`, `badge` (Shields.io endpoint JSON), and per-category scores.

### Badge

The Action can write Shields.io endpoint JSON:

```json
{ "schemaVersion": 1, "label": "agent-ready", "message": "82", "color": "yellow" }
```

Use the hosted badge, or point Shields at the endpoint JSON:

```markdown
![agent-ready](https://agent-ready-score.omer20sh.workers.dev/badge?url=https://petstore3.swagger.io/api/v3/openapi.json)
```

`GET /badge?url=…&format=json` returns Shields.io endpoint JSON.

## Hosted page

The Worker is live on the free `workers.dev` subdomain (no custom domain):

**https://agent-ready-score.omer20sh.workers.dev**

It serves:

- a paste-and-score landing page
- `POST /api/score` and `GET /api/score?url=`
- `GET /badge?url=` (SVG) and `GET /badge?format=json&url=` (Shields endpoint)

This repository does not contain Cloudflare credentials. CI still dry-runs deploys.

## Library

```js
import { scoreSource, formatReport } from "agent-ready-score";

const report = await scoreSource({ url: "https://example.com/openapi.json" });
if (report.ok) console.log(formatReport(report));
```

`scoreSource({ specText })` scores a pasted document. Discovery probes use `servers[0].url` (or `--origin` / `opts.origin`) when the input is a file or pasted text.

## Development

```bash
npm ci
npm test
npm run dry-run   # wrangler deploy --dry-run, not a real deploy
```

License: MIT (see [LICENSE](LICENSE)).
