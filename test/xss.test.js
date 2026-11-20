import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { handleRequest } from "../dist/http.js";
import { badgeSvg, escapeHtml, escapeXml, isHttpUrl, scoreSource } from "../dist/index.js";
import { statsHtmlResponse } from "../dist/metrics.js";
import { dir } from "./helpers.js";

const IMG = "<img src=x onerror=alert(1)>";
const SCRIPT = '"><script>alert(1)</script>';
const EVIL = `${IMG}${SCRIPT}`;

const evilSpec = JSON.stringify({
  openapi: "3.1.0",
  info: { title: EVIL, version: SCRIPT, description: IMG },
  paths: {
    [`/x${SCRIPT}`]: {
      get: {
        operationId: `op${IMG}`,
        summary: EVIL,
        description: SCRIPT,
        responses: { 200: { description: IMG } },
      },
    },
  },
});

function req(path, opts = {}) {
  return new Request("https://score.example" + path, opts);
}

/** Run the landing page's real render() against a fake #result element. */
function renderLanding(data) {
  const html = readFileSync(join(dir, "..", "worker", "public", "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {};
  const el = () => ({ addEventListener() {}, style: {}, hidden: true, textContent: "", innerHTML: "", value: "" });
  const document = { getElementById: (id) => (els[id] ||= el()) };
  const ctx = vm.createContext({ document, fetch: async () => ({}) });
  vm.runInContext(script + "\n;globalThis.__render = render;", ctx);
  ctx.__render(data);
  return els.result.innerHTML;
}

function assertNoRawPayload(text) {
  assert.doesNotMatch(text, /<img/i);
  assert.doesNotMatch(text, /<script/i);
  assert.doesNotMatch(text, /"><script/);
}

describe("output escaping (XSS)", () => {
  it("escapeHtml / escapeXml escape all five special characters", () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    assert.equal(escapeXml(IMG), "&lt;img src=x onerror=alert(1)&gt;");
    assert.equal(escapeHtml(null), "");
  });

  it("accepts only http(s) URLs", () => {
    assert.ok(isHttpUrl("https://example.com/openapi.json"));
    assert.ok(isHttpUrl("http://example.com"));
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://x", "//x", "", IMG]) {
      assert.equal(isHttpUrl(bad), false, bad);
    }
  });

  it("scoreSource rejects non-http(s) URLs without fetching", async () => {
    let called = false;
    const r = await scoreSource({ url: "javascript:alert(1)" }, { fetch: async () => { called = true; return new Response(""); } });
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });

  it("/api/score and /badge reject non-http(s) url params", async () => {
    for (const path of ["/api/score?url=" + encodeURIComponent("javascript:alert(1)"), "/badge?url=" + encodeURIComponent("file:///etc/passwd")]) {
      const res = await handleRequest(req(path));
      assert.equal(res.status, 400);
      const body = await res.text();
      assert.match(body, /http\(s\)/);
      assert.doesNotMatch(body, /javascript:|file:/);
    }
    const res = await handleRequest(req("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "javascript:alert(1)" }),
    }));
    assert.equal(res.status, 400);
  });

  it("JSON responses carry nosniff so they can't be sniffed as HTML", async () => {
    const res = await handleRequest(req("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: evilSpec }),
    }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    const data = await res.json();
    assert.equal(data.title, EVIL); // raw in JSON is fine; the page must escape it
  });

  it("landing render() escapes a malicious spec's title, findings and fixes", async () => {
    const res = await handleRequest(req("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: evilSpec }),
    }));
    const data = await res.json();
    const html = renderLanding(data);
    assertNoRawPayload(html);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&quot;&gt;&lt;script&gt;/);
  });

  it("landing render() escapes hostile category/finding fields and coerces numbers", () => {
    const html = renderLanding({
      title: EVIL,
      specVersion: SCRIPT,
      score: `1${IMG}`,
      toolList: { operations: IMG, tokens: SCRIPT },
      categories: [{ label: EVIL, score: `5" onmouseover="x` }],
      findings: [{ id: SCRIPT, status: `fail ${IMG}`, title: EVIL, fix: IMG }],
    });
    assertNoRawPayload(html);
    assert.doesNotMatch(html, /onmouseover="/);
    assert.match(html, /class="lvl info"/);
  });

  it("badge SVG escapes the label as XML", async () => {
    const svg = badgeSvg(80, EVIL);
    assertNoRawPayload(svg);
    assert.match(svg, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&gt;&lt;script&gt;/);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("/badge SVG for a malicious spec URL stays clean and is sandboxed", async () => {
    const fetchSpec = async () => new Response(evilSpec, { headers: { "content-type": "application/json" } });
    const orig = globalThis.fetch;
    globalThis.fetch = fetchSpec;
    try {
      const res = await handleRequest(req("/badge?url=" + encodeURIComponent("https://evil.example/openapi.json")));
      assert.equal(res.status, 200);
      const svg = await res.text();
      assertNoRawPayload(svg);
      assert.match(res.headers.get("content-security-policy"), /sandbox/);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("/stats HTML escapes referrers and routes", async () => {
    const res = statsHtmlResponse({
      window_days: 30, timezone: "Asia/Jerusalem", generated_at: SCRIPT,
      totals: { requests: 1, unique_visitors: 1, scans: { success: 0, fail: 0 }, badge_hits: 0 },
      daily: [{ day: IMG, requests: 1, unique_visitors: 1, scans_success: 0, scans_fail: 0, badge_hits: 0 }],
      routes: [{ route: EVIL, count: 1 }],
      top_referrers: [{ host: EVIL, count: 1 }],
    }, `T${IMG}`);
    const html = await res.text();
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;img src=x/);
  });
});
