import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { handleRequest } from "../dist/http.js";
import { ALLOWED_EVENTS } from "../dist/metrics.js";
import { dir } from "./helpers.js";

const pub = join(dir, "..", "worker", "public");
const read = (f) => readFileSync(join(pub, f), "utf8");
const htmlFiles = (d = pub) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : []; });

describe("landing page", () => {
  it("has one H1, the URL box, nav links, and no placeholders or prices", () => {
    const html = read("index.html");
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /<input id="url" type="url"/);
    for (const href of ["/scores/", "#ci", "https://github.com/Om3rr/agent-ready-score", "https://github.com/Om3rr/mcp-readiness-cli"]) assert.ok(html.includes(`href="${href}`), href);
    assert.ok(!/this-host|YOUR_SPEC_URL/.test(html));
    assert.doesNotMatch(html, /\$\d/);
    assert.doesNotMatch(html, /lemonsqueezy|buy\.stripe|checkout\./i);
    assert.match(html, /Sample result: Stripe API/);
    assert.match(html, /We store your email only to tell you once when Pro opens/);
    assert.match(html, /data-event="price_click" data-tier="pro"/);
  });

  it("every static page fires only allowed events and carries valid JSON-LD", () => {
    const files = htmlFiles();
    assert.ok(files.length >= 36, "landing + leaderboard + 34 score pages");
    for (const f of files) {
      const html = readFileSync(f, "utf8");
      for (const m of html.matchAll(/data-event="([^"]+)"/g)) assert.ok(ALLOWED_EVENTS.includes(m[1]), `${f}: ${m[1]}`);
      assert.ok(!/data-track=/.test(html), `${f} uses pre-spec event names`);
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
    }
    assert.match(read("index.html"), /"@type":"FAQPage"/);
    assert.match(read("scores/index.html"), /"@type":"FAQPage"/);
    assert.match(read("scores/stripe/index.html"), /data-event="badge_copied"/);
  });

  it("SEO files: robots lets AI crawlers in, sitemap and llms.txt list the leaderboard", () => {
    const robots = read("robots.txt");
    for (const ua of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]) assert.match(robots, new RegExp(`User-agent: ${ua}`));
    assert.match(robots, /Sitemap: https:\/\/agent-ready-score\.omer20sh\.workers\.dev\/sitemap\.xml/);
    assert.match(read("sitemap.xml"), /\/scores\/stripe\/<\/loc>/);
    assert.match(read("llms.txt"), /^# Agent-Ready Score/);
    assert.match(read("favicon.svg"), /<svg/);
  });

  it("?url= auto-run goes through the escaped render", async () => {
    const IMG = "<img src=x onerror=alert(1)>";
    const evilSpec = JSON.stringify({ openapi: "3.1.0", info: { title: IMG, version: "1" }, paths: { "/x": { get: { operationId: "x", summary: IMG, responses: { 200: { description: "ok" } } } } } });
    const scored = await (await handleRequest(new Request("https://s.example/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec: evilSpec }) }))).json();
    const html = read("index.html");
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.equal(inline.length, 2);
    const els = {};
    const el = () => ({ addEventListener() {}, setAttribute() {}, appendChild() {}, style: {}, hidden: true, textContent: "", innerHTML: "", value: "" });
    const evilUrl = 'https://evil.example/"><img/src=x/onerror=alert(1)>';
    let posted = null;
    const ctx = vm.createContext({
      document: { getElementById: (id) => (els[id] ||= el()), querySelectorAll: () => [] },
      location: { origin: "https://s.example", search: "?url=" + encodeURIComponent(evilUrl) },
      URLSearchParams,
      fetch: async (_u, init) => { posted = JSON.parse(init.body); return { json: async () => scored }; },
    });
    for (const s of inline) vm.runInContext(s, ctx);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(posted && posted.url === evilUrl.trim());
    const out = els.result.innerHTML;
    assert.ok(out.length > 100);
    assert.doesNotMatch(out, /<img/i);
    assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(out, /badge\?url=https%3A%2F%2Fevil\.example%2F%22%3E%3Cimg/);
  });
});

it('landing: footer contact is a real mailto', () => {
  const html = readFileSync(new URL('../worker/public/index.html', import.meta.url), 'utf8');
  assert.match(html, /Contact: <a href="mailto:omer20sh@gmail\.com">omer20sh@gmail\.com<\/a>/);
});

describe('OG/meta', () => {
  it('home and /scores/ pages have og:image and a large twitter card', () => {
    const root = new URL('../worker/public/', import.meta.url).pathname;
    for (const f of ['index.html', 'scores/index.html', 'scores/stripe/index.html']) {
      const h = readFileSync(join(root, f), 'utf8');
      assert.match(h, /property="og:image" content="https:\/\/agent-ready-score\.omer20sh\.workers\.dev\/og\.png"/, f);
      assert.match(h, /name="twitter:card" content="summary_large_image"/, f);
      assert.match(h, /property="og:title"/, f); assert.match(h, /rel="canonical"/, f);
    }
    const png = readFileSync(join(root, 'og.png'));
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  });
});

it("IndexNow key file is in public assets; GSC verification hook is off when the var is empty", () => {
  const key = "058a90c481658e80a37ea02a7b07559a";
  const body = read(key + ".txt");
  assert.equal(body.trim(), key);
  const home = read("index.html");
  assert.ok(!/google-site-verification/.test(home));
});
