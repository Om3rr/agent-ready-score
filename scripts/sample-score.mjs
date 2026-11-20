#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { scoreSource, formatReport } from "../dist/index.js";

const TARGETS = [
  {
    id: "petstore",
    name: "Swagger Petstore 3",
    url: "https://petstore3.swagger.io/api/v3/openapi.json",
  },
  {
    id: "stripe",
    name: "Stripe API",
    url: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    originHint: "https://api.stripe.com",
  },
  {
    id: "github",
    name: "GitHub REST API",
    url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    originHint: "https://api.github.com",
  },
];

const started = new Date();
const results = [];

for (const t of TARGETS) {
  const t0 = Date.now();
  process.stderr.write(`Scoring ${t.name}...\n`);
  const report = await scoreSource(
    { url: t.url },
    { origin: t.originHint, timeoutMs: 60000 },
  );
  const ms = Date.now() - t0;
  results.push({ target: t, ms, report });
  if (report.ok) process.stderr.write(`  ${report.score}/100 in ${ms}ms\n`);
  else process.stderr.write(`  FAILED: ${report.error}\n`);
}

const iso = started.toISOString();
const lines = [
  "# Sample scores",
  "",
  `Live scores against three public OpenAPI documents, recorded **${iso}** (UTC) by \`scripts/sample-score.mjs\` in this repository.`,
  "Discovery probes use each spec’s `servers` origin (or the hint below) for `/llms.txt`, `/.well-known/*`, and `robots.txt`.",
  "Re-run: `npm run build && node scripts/sample-score.mjs`.",
  "",
];

for (const { target, ms, report } of results) {
  lines.push(`## ${target.name}`);
  lines.push("");
  lines.push(`- Spec: ${target.url}`);
  if (target.originHint) lines.push(`- Discovery origin hint: ${target.originHint}`);
  lines.push(`- Fetch + score time: ${ms} ms`);
  if (!report.ok) {
    lines.push(`- **Error:** ${report.error}`);
    lines.push("");
    continue;
  }
  lines.push(`- **Overall: ${report.score}/100**`);
  lines.push(`- Title in spec: ${report.title}`);
  lines.push(`- Spec version: ${report.specVersion}`);
  lines.push(`- Generated tool list: ${report.toolList.operations} operations ≈ ${report.toolList.tokens} tokens`);
  lines.push("");
  lines.push("| Category | Score |");
  lines.push("| --- | ---: |");
  for (const c of report.categories) {
    lines.push(`| ${c.label} | ${c.score == null ? "n/a" : Math.round(c.score)} |`);
  }
  lines.push("");
  const fixes = report.findings.filter((f) => f.fix);
  if (fixes.length) {
    lines.push("Top findings:");
    lines.push("");
    for (const f of fixes.slice(0, 8)) {
      lines.push(`- **[${f.status}] ${f.title}** — ${f.fix}`);
    }
    lines.push("");
  }
  lines.push("Human report from the CLI:");
  lines.push("");
  lines.push("```");
  lines.push(formatReport(report));
  lines.push("```");
  lines.push("");
}

lines.push("These scores will move if the public specs or origin discovery files change.");
writeFileSync(new URL("../SAMPLES.md", import.meta.url), lines.join("\n") + "\n");
writeFileSync(new URL("../samples/last-run.json", import.meta.url), JSON.stringify({ iso, results }, null, 2));
process.stdout.write(lines.join("\n") + "\n");
