#!/usr/bin/env node
// Re-scores the public leaderboard targets and writes samples/leaderboard-<date>.json.
// Usage: npm run build && node scripts/score-leaderboard.mjs
// Then:  node scripts/build-seo-pages.mjs samples/leaderboard-<date>.json
import { readFileSync, writeFileSync } from "node:fs";
import { scoreSource } from "../dist/index.js";

const TARGETS = JSON.parse(readFileSync(new URL("./leaderboard-targets.json", import.meta.url), "utf8"));
const started = new Date();
const out = [];
const failed = [];
let i = 0;
async function worker() {
  while (i < TARGETS.length) {
    const [id, name, url, origin] = TARGETS[i++];
    try {
      const r = await scoreSource({ url }, { origin: origin || undefined, timeoutMs: 60000 });
      if (!r.ok) { failed.push({ id, name, error: r.error }); continue; }
      const checks = r.categories.flatMap((c) => c.checks);
      out.push({
        id, name, spec: url, origin: origin || null, score: r.score,
        categories: Object.fromEntries(r.categories.map((c) => [c.id, c.score])),
        checks: Object.fromEntries(checks.map((c) => [c.id, c.status])),
        operations: r.toolList?.operations ?? null, toolTokens: r.toolList?.tokens ?? null,
        fixes: checks.filter((c) => c.status === "fail" || c.status === "warn")
          .sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1))
          .slice(0, 5).map((c) => ({ status: c.status, title: c.title, fix: c.fix })),
      });
      process.stderr.write(`${id} ${r.score}\n`);
    } catch (e) {
      failed.push({ id, name, error: String(e.message || e) });
    }
  }
}
await Promise.all([1, 2, 3, 4, 5].map(worker));
out.sort((a, b) => b.score - a.score);
const day = started.toISOString().slice(0, 10);
writeFileSync(`samples/leaderboard-${day}.json`, JSON.stringify({ recorded: started.toISOString(), tool: "agent-ready-score", failed, results: out }, null, 1));
console.log(`samples/leaderboard-${day}.json: ${out.length} scored, ${failed.length} failed`);
