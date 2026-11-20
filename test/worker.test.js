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
    assert.equal(body.includes("employer") || LANDING_FALLBACK.includes("employer"), false);
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
