import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, LANDING_FALLBACK } from "../dist/http.js";
import { fixture } from "./helpers.js";

function req(path, opts = {}) {
  return new Request("https://score.example" + path, opts);
}

describe("worker handler", () => {
  it("serves a landing page fallback when ASSETS is missing", async () => {
    const res = await handleRequest(req("/"));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const body = await res.text();
    assert.match(body, /Agent-Ready Score/);
    assert.match(body, /Pro coming soon/);
    assert.doesNotMatch(body, /\$\d+/);
    assert.equal(body.includes("Wonderful") || LANDING_FALLBACK.includes("Wonderful"), false);
  });

  it("scores a pasted spec via POST /api/score", async () => {
    const res = await handleRequest(req("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: fixture("good.yaml") }),
    }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.title, "Widgets API");
    assert.ok(data.score >= 70);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("rejects an empty POST", async () => {
    const res = await handleRequest(req("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.ok, false);
  });

  it("returns a Shields JSON badge for a numeric score", async () => {
    const res = await handleRequest(req("/badge?score=91&format=json"));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.message, "91");
    assert.equal(data.color, "brightgreen");
    assert.equal(data.label, "agent-ready");
  });

  it("returns an SVG badge", async () => {
    const res = await handleRequest(req("/badge.svg?score=42"));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /image\/svg\+xml/);
    const body = await res.text();
    assert.match(body, /<svg /);
    assert.match(body, />42</);
  });

  it("answers OPTIONS with CORS headers", async () => {
    const res = await handleRequest(req("/api/score", { method: "OPTIONS" }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("returns 404 for unknown paths without assets", async () => {
    const res = await handleRequest(req("/nope"));
    assert.equal(res.status, 404);
  });
});

describe("measurement endpoints", () => {
  it("accepts an allow-listed CTA event and writes it to Analytics Engine", async () => {
    const points = [];
    const env = { EVENTS: { writeDataPoint: (p) => points.push(p) } };
    const res = await handleRequest(req("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "badge_copied", path: "/", utm_source: "hn", utm_medium: "social", label: "landing" }),
    }), env);
    assert.equal(res.status, 204);
    assert.equal(points.length, 1);
    assert.equal(points[0].indexes[0], "badge_copied");
    assert.equal(points[0].blobs[4], "hn");
  });

  it("rejects unknown and server-only events from the browser", async () => {
    for (const event of ["nope", "waitlist_signup", "scan_completed", "badge_served"]) {
      const res = await handleRequest(req("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }) }));
      assert.equal(res.status, 400, event);
    }
  });

  it("logs scan_completed server-side when a spec is scored", async () => {
    const points = [];
    const env = { EVENTS: { writeDataPoint: (p) => points.push(p) } };
    const res = await handleRequest(req("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec: fixture("good.yaml") }) }), env);
    assert.equal(res.status, 200);
    assert.equal(points[0].indexes[0], "scan_completed");
    assert.ok(points[0].doubles[0] >= 70);
  });

  it("waitlist: 503 without KV, stores once with KV, never logs the email", async () => {
    const body = JSON.stringify({ email: "Dev@Example.com", utm_source: "producthunt" });
    const opts = { method: "POST", headers: { "content-type": "application/json" }, body };
    assert.equal((await handleRequest(req("/api/waitlist", opts))).status, 503);
    const store = new Map();
    const points = [];
    const env = { WAITLIST: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) }, EVENTS: { writeDataPoint: (p) => points.push(p) } };
    const first = await (await handleRequest(req("/api/waitlist", { ...opts }), env)).json();
    const again = await (await handleRequest(req("/api/waitlist", { ...opts, body }), env)).json();
    assert.equal(first.ok, true);
    assert.equal(again.already, true);
    assert.ok(store.has("waitlist:pro:dev@example.com"));
    assert.equal(points.length, 1);
    assert.equal(JSON.stringify(points).includes("example.com"), false);
    const bad = await handleRequest(req("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope" }) }), env);
    assert.equal(bad.status, 400);
  });
});

describe("static SEO pages", () => {
  it("leaderboard pages carry no prices or checkout links", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../worker/public/scores/", import.meta.url);
    const pages = ["index.html", ...readdirSync(dir).filter((d) => !d.includes(".")).map((d) => `${d}/index.html`)];
    assert.ok(pages.length >= 21);
    for (const p of pages) {
      const html = readFileSync(new URL(p, dir), "utf8");
      assert.doesNotMatch(html, /\$\d|buy\.stripe|checkout\.stripe|lemonsqueezy/i, p);
      assert.match(html, /application\/ld\+json/, p);
    }
    const landing = readFileSync(new URL("../worker/public/index.html", import.meta.url), "utf8");
    assert.doesNotMatch(landing, /\$\d|buy\.stripe|checkout\.stripe|lemonsqueezy/i);
  });
});
