#!/usr/bin/env node
// Builds the static SEO/AEO pages from a recorded leaderboard JSON (real scores only):
//   worker/public/scores/index.html        public leaderboard + citable stats
//   worker/public/scores/<id>/index.html   one page per API
//   worker/public/sitemap.xml, robots.txt, llms.txt
// Usage: node scripts/build-seo-pages.mjs samples/leaderboard-2026-11-20.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { SITE, REPO, CSS, NAV, FOOT as SITE_FOOT } from "./site-chrome.mjs";
const file = process.argv[2] || "samples/leaderboard-2026-11-20.json";
const data = JSON.parse(readFileSync(file, "utf8"));
const rows = data.results.map((r) => ({ ...r, categories: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, v == null ? null : Math.round(v)])) }));
const day = data.recorded.slice(0, 10);
const dayLabel = new Date(data.recorded).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tone = (n) => (n >= 90 ? "g" : n >= 70 ? "y" : "r");
const CATS = [["discoverability", "Discoverability"], ["docs", "Docs quality"], ["errors", "Predictable errors"], ["auth", "Auth & identity"], ["mcp", "MCP-wrappability"]];
const utm = (medium, campaign, content) => `utm_source=agent-ready-score&utm_medium=${medium}&utm_campaign=${campaign}${content ? `&utm_content=${encodeURIComponent(content)}` : ""}`;

// ---- stats (computed, never typed in) ----
const scores = rows.map((r) => r.score).sort((a, b) => a - b);
const median = scores[Math.floor(scores.length / 2)];
const mean = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
const count = (pred) => rows.filter(pred).length;
const failed = (checkId) => count((r) => r.checks?.[checkId] === "fail");
const catAvg = Object.fromEntries(CATS.map(([id]) => {
  const v = rows.map((r) => r.categories[id]).filter((x) => x != null);
  return [id, Math.round(v.reduce((a, b) => a + b, 0) / v.length)];
}));
const stats = {
  n: rows.length, median, mean,
  atLeast80: count((r) => r.score >= 80), atLeast70: count((r) => r.score >= 70),
  noLlms: failed("discover.llms_txt"), noProblemJson: failed("errors.problem_json"), noWellKnown: failed("discover.well_known"),
  noExamples: failed("docs.examples"), no5xx: failed("errors.5xx"),
  over50kTokens: count((r) => (r.toolTokens || 0) > 50000),
};
const STAT_LINES = [
  `Median Agent-Ready Score across ${stats.n} well-known public APIs: ${stats.median}/100 (mean ${stats.mean}).`,
  `${stats.atLeast80} of ${stats.n} scored 80 or more; ${stats.atLeast70} of ${stats.n} scored 70 or more.`,
  `${stats.noLlms} of ${stats.n} API origins serve no /llms.txt (probed on the API host, e.g. api.example.com, not the docs site).`,
  `${stats.noProblemJson} of ${stats.n} specs never advertise application/problem+json (RFC 9457) errors.`,
  `${stats.noWellKnown} of ${stats.n} API origins expose no /.well-known MCP, OAuth protected-resource or API-catalog document.`,
  `${stats.noExamples} of ${stats.n} specs leave most operations without request or response examples; ${stats.no5xx} of ${stats.n} leave most operations without a documented 5xx response.`,
  `${stats.over50kTokens} of ${stats.n} specs would produce an MCP tool list over 50,000 tokens if wrapped naively (about 4 characters per token).`,
  (() => {
    const sorted = CATS.map(([id, l]) => [l, catAvg[id]]).sort((a, b) => a[1] - b[1]);
    return `Weakest category on average: ${sorted[0][0]} (${sorted[0][1]}/100). Strongest: ${sorted.at(-1)[0]} (${sorted.at(-1)[1]}/100).`;
  })(),
];

const FOOT = `<p class="mut" style="margin-top:40px;font-size:14px">Automated scores of public OpenAPI documents, recorded ${esc(dayLabel)}. They measure what an agent can learn from the published spec and API origin. They are not a security audit, not an endorsement, and not affiliated with any company listed. Methodology and code: <a href="${REPO}">${REPO.replace("https://", "")}</a> (MIT).</p>`;
const ACTION = (medium, content) => `${REPO}?${utm(medium, "action", content)}#github-action`;
const page = ({ title, desc, path, body, ld }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:type" content="website">
<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>${CSS}</style></head><body><div class="wrap">${NAV}<main>${body}${FOOT}</main>${SITE_FOOT}</div><script src="/t.js" defer></script></body></html>
`;

// ---- leaderboard ----
const table = `<div class="tablewrap"><table class="lb"><thead><tr><th>#</th><th>API</th><th>Score</th>${CATS.map(([, l]) => `<th>${l}</th>`).join("")}<th>MCP tool list</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="/scores/${r.id}/">${esc(r.name)}</a></td><td class="n ${tone(r.score)}">${r.score}</td>${CATS.map(([id]) => `<td>${r.categories[id] ?? "n/a"}</td>`).join("")}<td>${r.operations ?? "?"} ops · ~${(r.toolTokens ?? 0).toLocaleString("en-US")} tok</td></tr>`).join("")}</tbody></table></div>`;
const faq = [
  ["What is an Agent-Ready Score?", "A 0-100 score of how easily an AI agent can find, understand, call and recover from errors on an API, computed from its public OpenAPI document and a few well-known paths on its origin. Five categories weigh 20% each: discoverability, docs quality, predictable errors, auth and identity, and MCP-wrappability."],
  ["How were these APIs scored?", `Each public OpenAPI document was fetched and scored by the open-source agent-ready-score CLI on ${dayLabel}. Discovery checks (llms.txt, /.well-known, robots.txt) ran against the API host listed. Re-run it yourself with scripts/score-leaderboard.mjs in the repository.`],
  ["Why does a well-known API score low?", "Big specs often lack examples, a shared error model and machine-readable discovery on the API host. Some companies publish llms.txt on their docs site rather than the API host. This snapshot only credited the API host; since 20 November 2026 the live scorer also checks the docs site (for example docs.stripe.com), so a re-score can come out higher."],
  ["Is this the same as Postman's API Agent Score?", "No. Postman's score uses its own methodology across its network. This score is open source and computed from the public spec, so the numbers differ and are not comparable one to one."],
  ["How do I improve my score?", "Publish /llms.txt, advertise application/problem+json errors with one shared schema, add examples to request and response bodies, expose /.well-known discovery documents, and keep operationIds unique. Gate it in CI with the free GitHub Action."],
];
const faqLd = { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
const lbLd = {
  "@context": "https://schema.org", "@graph": [
    { "@type": "Dataset", name: `Agent-Ready Scores of ${stats.n} public APIs (${dayLabel})`, description: STAT_LINES.join(" "), url: `${SITE}/scores/`, dateModified: day, license: "https://opensource.org/licenses/MIT", creator: { "@type": "Person", name: "Omer Shacham" }, distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${REPO}/blob/main/${file}` } },
    { "@type": "ItemList", itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/scores/${r.id}/`, name: `${r.name}: ${r.score}/100` })) },
    faqLd,
  ],
};
mkdirSync("worker/public/scores", { recursive: true });
writeFileSync("worker/public/scores/index.html", page({
  title: `Agent-Ready Scores of ${stats.n} public APIs (${dayLabel})`,
  desc: `How ready are Stripe, GitHub, OpenAI, Slack and ${stats.n - 4} more APIs for AI agents? Median score ${stats.median}/100. Open-source scores with fixes for each API.`,
  path: "/scores/",
  ld: lbLd,
  body: `<h1>How agent-ready are popular APIs?</h1><p class="mut">Open-source Agent-Ready Scores of ${stats.n} well-known public APIs, recorded ${esc(dayLabel)}. Click any API for its fixes.</p>
<div class="card" id="stats"><h2 style="margin-top:0">Key numbers</h2><ul>${STAT_LINES.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="mut" style="font-size:14px">Cite as: “Agent-Ready Score leaderboard, ${esc(dayLabel)}, ${SITE}/scores/”. Raw data: <a href="${REPO}/blob/main/${file}">${file}</a>.</p></div>
${table}
<div class="card"><h2 style="margin-top:0">Score your own API</h2><p class="mut">Paste a spec URL. No sign-up. Then add the badge and gate it in CI.</p><div class="actions"><a class="btn" href="/?${utm("leaderboard", "scores", "cta")}#score">Score my API</a><a class="btn ghost" href="${ACTION("leaderboard", "scores")}" data-event="action_install_click">Add the GitHub Action</a></div></div>
<section class="faq"><h2>FAQ</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p class="mut">${esc(a)}</p>`).join("")}</section>
${data.failed?.length ? `<p class="mut" style="font-size:14px">Not scored this run (fetch failed): ${data.failed.map((f) => esc(f.name)).join(", ")}.</p>` : ""}`,
}));

// ---- one page per API ----
for (const [i, r] of rows.entries()) {
  mkdirSync(`worker/public/scores/${r.id}`, { recursive: true });
  const badge = `[![agent-ready](${SITE}/badge?url=${encodeURIComponent(r.spec)})](${SITE}/scores/${r.id}/?utm_source=badge&utm_medium=readme&utm_campaign=badge-loop)`;
  const pageFaq = [
    [`Is the ${r.name} ready for AI agents?`, `${r.name} scored ${r.score}/100 on the open-source Agent-Ready Score on ${dayLabel}, rank ${i + 1} of ${stats.n}. Top fix: ${r.fixes[0]?.title || "none"}.`],
    [`How was the ${r.name} scored?`, `The public OpenAPI document at ${r.spec} was scored by the open-source agent-ready-score CLI${r.origin ? `, with discovery checks against ${r.origin}` : ""}. Five categories weigh 20% each: discoverability, docs quality, predictable errors, auth and identity, and MCP-wrappability.`],
  ];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: `${r.name} Agent-Ready Score: ${r.score}/100`, url: `${SITE}/scores/${r.id}/`, dateModified: day, about: { "@type": "WebAPI", name: r.name, documentation: r.spec } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "API leaderboard", item: `${SITE}/scores/` }, { "@type": "ListItem", position: 2, name: r.name, item: `${SITE}/scores/${r.id}/` }] },
    { "@type": "FAQPage", mainEntity: pageFaq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ] };
  writeFileSync(`worker/public/scores/${r.id}/index.html`, page({
    title: `${r.name} Agent-Ready Score: ${r.score}/100 (${dayLabel})`,
    desc: `Is the ${r.name} ready for AI agents? It scores ${r.score}/100, rank ${i + 1} of ${stats.n}. See the category breakdown, its MCP tool-list token cost and the top fixes.`,
    path: `/scores/${r.id}/`,
    ld,
    body: `<p class="mut"><a href="/scores/">Leaderboard</a> › ${esc(r.name)}</p><h1>Is the ${esc(r.name)} ready for AI agents?</h1>
<div class="card"><div class="big ${tone(r.score)}">${r.score}<span class="mut" style="font-size:1.2rem">/100</span></div><p class="mut">Rank ${i + 1} of ${stats.n} on the <a href="/scores/">public API leaderboard</a> · recorded ${esc(dayLabel)} · spec: <code>${esc(r.spec)}</code>${r.origin ? ` · discovery probed on <code>${esc(r.origin)}</code>` : ""}</p>
<div class="tablewrap"><table>${CATS.map(([id, l]) => `<tr><td>${l}</td><td class="n ${tone(r.categories[id] ?? 0)}">${r.categories[id] ?? "n/a"}</td></tr>`).join("")}<tr><td>Generated MCP tool list</td><td>${r.operations ?? "?"} operations ≈ ${(r.toolTokens ?? 0).toLocaleString("en-US")} tokens</td></tr></table></div></div>
<h2>Top fixes</h2><ul class="fx">${r.fixes.map((f) => `<li><b class="${f.status === "fail" ? "r" : "y"}">${f.status}</b> ${esc(f.title)}<br><span class="mut">${esc(f.fix)}</span></li>`).join("") || "<li>No open fixes.</li>"}</ul>
<div class="card"><h2 style="margin-top:0">Re-score it live</h2><p class="mut">Scores change when the spec changes. Run it again now, free.</p><a class="btn" href="/?url=${encodeURIComponent(r.spec)}&amp;${utm("score-page", "rescore", r.id).replace(/&/g, "&amp;")}#score">Re-score ${esc(r.name)}</a></div>
<div class="card"><h2 style="margin-top:0">Maintain this API? Add the badge</h2><p><img src="${SITE}/badge?score=${r.score}" alt="agent-ready ${r.score}" height="20"></p><div class="codebox"><pre id="b">${esc(badge)}</pre><button type="button" class="ghost sm copy" data-copy="b" data-event="badge_copied">Copy badge</button></div><div class="actions"><a class="btn" href="${ACTION("score-page", r.id)}" data-event="action_install_click">Gate it in CI</a></div></div>
<section class="faq"><h2>FAQ</h2>${pageFaq.map(([q, a]) => `<h3>${esc(q)}</h3><p class="mut">${esc(a)}</p>`).join("")}</section>`,
  }));
}

// ---- crawl + answer-engine files ----
const urls = ["/", "/scores/", ...rows.map((r) => `/scores/${r.id}/`)];
writeFileSync("worker/public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod></url>`).join("\n")}\n</urlset>\n`);
const AI_AGENTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Bingbot"];
writeFileSync("worker/public/robots.txt", `# Agent-Ready Score. Search and AI answer engines are welcome; the API is not for crawling.\n# A summary for language models is at ${SITE}/llms.txt\n${["*", ...AI_AGENTS].map((ua) => `User-agent: ${ua}\nAllow: /\nDisallow: /api/\n`).join("\n")}\nSitemap: ${SITE}/sitemap.xml\n`);
writeFileSync("worker/public/llms.txt", `# Agent-Ready Score

> Free, open-source 0-100 score of how ready an API is for AI agents, computed from its OpenAPI document: discoverability (llms.txt, /.well-known, robots), docs quality, predictable errors (RFC 9457), auth and identity, and MCP-wrappability (tool-list token cost). Web page, CLI, GitHub Action and README badge. Pro is coming soon; there is no paid plan today. Discovery checks the API host and, since 20 November 2026, the docs site for llms.txt.

## Use it
- [Score an API](${SITE}/): paste an OpenAPI URL or document, no sign-up.
- [HTTP API](${SITE}/api/score?url=https://petstore3.swagger.io/api/v3/openapi.json): GET /api/score?url=<spec> returns JSON.
- [GitHub Action](${REPO}#github-action) and [CLI](${REPO}#cli): fail CI under a score, write a Shields badge.
- [MCP server CLI](https://github.com/Om3rr/mcp-readiness-cli): the sister tool that scans a live MCP server.

## Data
- [Leaderboard of ${stats.n} public APIs, ${dayLabel}](${SITE}/scores/): scores, category breakdown and fixes per API.
${STAT_LINES.map((l) => `- ${l}`).join("\n")}

## Per-API scores
${rows.map((r) => `- [${r.name}: ${r.score}/100](${SITE}/scores/${r.id}/)`).join("\n")}

## Optional
- [Methodology and source (MIT)](${REPO})
`);
console.log(`wrote ${urls.length} pages, sitemap, robots, llms.txt`);
console.log(JSON.stringify(stats));
