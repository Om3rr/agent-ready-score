# Sample scores

Live scores against three public OpenAPI documents, recorded **20 November 2026, 17:03 Israel time (Asia/Jerusalem)** by `scripts/sample-score.mjs` in this repository.
Discovery probes use each spec’s `servers` origin (or the hint below) for `/llms.txt`, `/.well-known/*`, and `robots.txt`.
Re-run: `npm run build && node scripts/sample-score.mjs`.

## Swagger Petstore 3

- Spec: https://petstore3.swagger.io/api/v3/openapi.json
- Fetch + score time: 3186 ms
- **Overall: 53/100**
- Title in spec: Swagger Petstore - OpenAPI 3.0
- Spec version: OpenAPI 3.0.4
- Generated tool list: 19 operations ≈ 1422 tokens

| Category | Score |
| --- | ---: |
| Discoverability | 21 |
| Docs quality | 58 |
| Predictable errors | 0 |
| Auth & identity | 87 |
| MCP-wrappability | 100 |

Top findings:

- **[fail] No llms.txt at the origin** — Publish a short curated map at https://petstore3.swagger.io/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
- **[fail] No well-known MCP, agent, OAuth, or API-catalog documents** — Add machine-readable discovery under https://petstore3.swagger.io/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
- **[fail] No robots.txt at the origin** — Add https://petstore3.swagger.io/robots.txt and mention /llms.txt or your policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, and similar).
- **[fail] Many operations have no examples** — Add `example` or `examples` on request bodies and success responses so agents can see a valid payload.
- **[fail] Many operations lack documented 4xx responses** — Document 400/401/403/404/409 responses with a schema so agents can parse failures instead of guessing.
- **[fail] Many operations lack documented 5xx responses** — Add a 500 or 5XX response with the same error schema, or a `default` response that covers unexpected failures.
- **[fail] Errors are not advertised as application/problem+json** — Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
- **[fail] No default or shared error response** — Define one error schema under components.schemas and reuse it via $ref, plus a `default` response on each operation.

Human report from the CLI:

```
Agent-Ready Score: 53/100  (Swagger Petstore - OpenAPI 3.0)
OpenAPI 3.0.4 · https://petstore3.swagger.io/api/v3/openapi.json

  Discoverability         21  ██░░░░░░░░
  Docs quality            58  ██████░░░░
  Predictable errors       0  ░░░░░░░░░░
  Auth & identity         87  █████████░
  MCP-wrappability       100  ██████████

Generated tool list: 19 operations ≈ 1422 tokens

Top fixes:
  1. [fail] No llms.txt at the origin
     Publish a short curated map at https://petstore3.swagger.io/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
  2. [fail] No well-known MCP, agent, OAuth, or API-catalog documents
     Add machine-readable discovery under https://petstore3.swagger.io/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
  3. [fail] No robots.txt at the origin
     Add https://petstore3.swagger.io/robots.txt and mention /llms.txt or your policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, and similar).
  4. [fail] Many operations have no examples
     Add `example` or `examples` on request bodies and success responses so agents can see a valid payload.
  5. [fail] Many operations lack documented 4xx responses
     Document 400/401/403/404/409 responses with a schema so agents can parse failures instead of guessing.
  6. [fail] Many operations lack documented 5xx responses
     Add a 500 or 5XX response with the same error schema, or a `default` response that covers unexpected failures.
  7. [fail] Errors are not advertised as application/problem+json
     Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
  8. [fail] No default or shared error response
     Define one error schema under components.schemas and reuse it via $ref, plus a `default` response on each operation.

Pro coming soon
```

## Stripe API

- Spec: https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
- Discovery origin hint: https://api.stripe.com
- Fetch + score time: 5247 ms
- **Overall: 65/100**
- Title in spec: Stripe API
- Spec version: OpenAPI 3.0.0
- Generated tool list: 612 operations ≈ 458437 tokens

| Category | Score |
| --- | ---: |
| Discoverability | 31 |
| Docs quality | 70 |
| Predictable errors | 80 |
| Auth & identity | 76 |
| MCP-wrappability | 70 |

Top findings:

- **[fail] No llms.txt at the origin** — Publish a short curated map at https://api.stripe.com/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
- **[fail] No well-known MCP, agent, OAuth, or API-catalog documents** — Add machine-readable discovery under https://api.stripe.com/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
- **[fail] Many operations have no examples** — Add `example` or `examples` on request bodies and success responses so agents can see a valid payload.
- **[fail] Errors are not advertised as application/problem+json** — Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
- **[fail] Generated tool list is expensive (458437 tokens, 612 operations)** — Split the API into smaller tool surfaces, shorten descriptions, and drop unused operations. A generated MCP server that exposes every path will overflow the context window.
- **[warn] OpenAPI document found, but not advertised on the origin** — Also serve the spec at https://api.stripe.com/openapi.json or https://api.stripe.com/.well-known/openapi.json so agents can find it without a bookmark.
- **[warn] robots.txt exists but has no AI-crawler or llms.txt rules** — Update https://api.stripe.com/robots.txt with an explicit policy for AI crawlers and a comment pointing at /llms.txt.
- **[warn] Uses basic, bearer but not OAuth or OIDC** — Prefer OAuth 2.0 or OpenID Connect with short-lived tokens. If a bearer or API key is required, document how agents obtain and rotate it.

Human report from the CLI:

```
Agent-Ready Score: 65/100  (Stripe API)
OpenAPI 3.0.0 · https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json

  Discoverability         31  ███░░░░░░░
  Docs quality            70  ███████░░░
  Predictable errors      80  ████████░░
  Auth & identity         76  ████████░░
  MCP-wrappability        70  ███████░░░

Generated tool list: 612 operations ≈ 458437 tokens

Top fixes:
  1. [fail] No llms.txt at the origin
     Publish a short curated map at https://api.stripe.com/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
  2. [fail] No well-known MCP, agent, OAuth, or API-catalog documents
     Add machine-readable discovery under https://api.stripe.com/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
  3. [fail] Many operations have no examples
     Add `example` or `examples` on request bodies and success responses so agents can see a valid payload.
  4. [fail] Errors are not advertised as application/problem+json
     Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
  5. [fail] Generated tool list is expensive (458437 tokens, 612 operations)
     Split the API into smaller tool surfaces, shorten descriptions, and drop unused operations. A generated MCP server that exposes every path will overflow the context window.
  6. [warn] OpenAPI document found, but not advertised on the origin
     Also serve the spec at https://api.stripe.com/openapi.json or https://api.stripe.com/.well-known/openapi.json so agents can find it without a bookmark.
  7. [warn] robots.txt exists but has no AI-crawler or llms.txt rules
     Update https://api.stripe.com/robots.txt with an explicit policy for AI crawlers and a comment pointing at /llms.txt.
  8. [warn] Uses basic, bearer but not OAuth or OIDC
     Prefer OAuth 2.0 or OpenID Connect with short-lived tokens. If a bearer or API key is required, document how agents obtain and rotate it.

Pro coming soon
```

## GitHub REST API

- Spec: https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
- Discovery origin hint: https://api.github.com
- Fetch + score time: 2411 ms
- **Overall: 36/100**
- Title in spec: GitHub v3 REST API
- Spec version: OpenAPI 3.0.3
- Generated tool list: 1281 operations ≈ 312817 tokens

| Category | Score |
| --- | ---: |
| Discoverability | 21 |
| Docs quality | 88 |
| Predictable errors | 38 |
| Auth & identity | 0 |
| MCP-wrappability | 35 |

Top findings:

- **[fail] No llms.txt at the origin** — Publish a short curated map at https://api.github.com/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
- **[fail] No well-known MCP, agent, OAuth, or API-catalog documents** — Add machine-readable discovery under https://api.github.com/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
- **[fail] No robots.txt at the origin** — Add https://api.github.com/robots.txt and mention /llms.txt or your policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, and similar).
- **[fail] Many operations lack documented 5xx responses** — Add a 500 or 5XX response with the same error schema, or a `default` response that covers unexpected failures.
- **[fail] Errors are not advertised as application/problem+json** — Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
- **[fail] No security schemes are declared** — Declare security schemes under components.securitySchemes. If the API is public, set `security: []` and still document how agents should identify themselves when you add auth later.
- **[fail] Many operations have no security requirement** — Set a top-level `security` requirement, or add `security` on each operation. Use `security: []` for the ones that are intentionally public.
- **[fail] No OAuth 2.0 or OpenID Connect scheme** — Add an OAuth 2.0 or OpenID Connect security scheme so agents can obtain scoped, revocable tokens instead of long-lived keys.

Human report from the CLI:

```
Agent-Ready Score: 36/100  (GitHub v3 REST API)
OpenAPI 3.0.3 · https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json

  Discoverability         21  ██░░░░░░░░
  Docs quality            88  █████████░
  Predictable errors      38  ████░░░░░░
  Auth & identity          0  ░░░░░░░░░░
  MCP-wrappability        35  ████░░░░░░

Generated tool list: 1281 operations ≈ 312817 tokens

Top fixes:
  1. [fail] No llms.txt at the origin
     Publish a short curated map at https://api.github.com/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.
  2. [fail] No well-known MCP, agent, OAuth, or API-catalog documents
     Add machine-readable discovery under https://api.github.com/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.
  3. [fail] No robots.txt at the origin
     Add https://api.github.com/robots.txt and mention /llms.txt or your policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, and similar).
  4. [fail] Many operations lack documented 5xx responses
     Add a 500 or 5XX response with the same error schema, or a `default` response that covers unexpected failures.
  5. [fail] Errors are not advertised as application/problem+json
     Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.
  6. [fail] No security schemes are declared
     Declare security schemes under components.securitySchemes. If the API is public, set `security: []` and still document how agents should identify themselves when you add auth later.
  7. [fail] Many operations have no security requirement
     Set a top-level `security` requirement, or add `security` on each operation. Use `security: []` for the ones that are intentionally public.
  8. [fail] No OAuth 2.0 or OpenID Connect scheme
     Add an OAuth 2.0 or OpenID Connect security scheme so agents can obtain scoped, revocable tokens instead of long-lived keys.

Pro coming soon
```

Note on GitHub’s score: the official `api.github.com.json` description used here has 1,281 operations and no `components.securitySchemes` (authentication is documented outside the spec). The Auth & identity score of 0 reflects that document, not whether GitHub the product supports OAuth.

These scores will move if the public specs or origin discovery files change.
