import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSpecUrlsFromHtml, looksLikeSpecUrl, looksLikeHtml, isLlmsTxt, robotsMentionsAi } from "../dist/discover.js";
import { checkDiscoverability } from "../dist/index.js";
import { emptyDiscovery } from "../dist/discover.js";

describe("discover helpers", () => {
  it("detects spec-like URLs", () => {
    assert.equal(looksLikeSpecUrl("https://example.com/openapi.json"), true);
    assert.equal(looksLikeSpecUrl("https://example.com/swagger.yaml"), true);
    assert.equal(looksLikeSpecUrl("https://example.com/docs"), false);
  });

  it("detects HTML bodies", () => {
    assert.equal(looksLikeHtml("text/html", ""), true);
    assert.equal(looksLikeHtml("application/json", '{"openapi":"3.0.0"}'), false);
    assert.equal(looksLikeHtml("text/plain", "<!DOCTYPE html><html>"), true);
  });

  it("extracts Swagger UI and link-tag spec URLs", () => {
    const html = `
      <html><head>
        <link rel="service-doc" href="/openapi.json">
      </head>
      <script>window.ui = SwaggerUIBundle({ url: "https://example.com/v3/swagger.yaml" })</script>
    `;
    const urls = extractSpecUrlsFromHtml(html, "https://docs.example.com/docs");
    assert.ok(urls.includes("https://docs.example.com/openapi.json"));
    assert.ok(urls.includes("https://example.com/v3/swagger.yaml"));
  });

  it("recognizes llms.txt content", () => {
    assert.equal(isLlmsTxt({ ok: true, status: 200, contentType: "text/plain", snippet: "# Site\n> Hello", path: "/llms.txt", url: "x" }), true);
    assert.equal(isLlmsTxt({ ok: true, status: 200, contentType: "text/html", snippet: "", path: "/llms.txt", url: "x" }), false);
  });

  it("detects AI crawler tokens in robots.txt", () => {
    assert.equal(robotsMentionsAi("User-agent: GPTBot\nDisallow: /"), true);
    assert.equal(robotsMentionsAi("# see /llms.txt"), true);
    assert.equal(robotsMentionsAi("User-agent: *\nAllow: /"), false);
  });
});

describe("checkDiscoverability", () => {
  it("fails all site checks when probes miss, but passes a found spec", () => {
    const checks = checkDiscoverability(emptyDiscovery({
      origin: "https://api.example",
      openapiFound: true,
      specSource: "url",
      specUrl: "https://api.example/secret-spec.json",
      probes: [
        { path: "/openapi.json", url: "https://api.example/openapi.json", ok: false, status: 404, contentType: "", snippet: "" },
      ],
    }));
    assert.equal(checks.find((c) => c.id === "discover.openapi").status, "warn"); // not advertised
    assert.equal(checks.find((c) => c.id === "discover.llms_txt").status, "fail");
    assert.equal(checks.find((c) => c.id === "discover.well_known").status, "fail");
    assert.equal(checks.find((c) => c.id === "discover.robots").status, "fail");
    for (const c of checks.filter((c) => c.status !== "pass")) assert.ok(c.fix);
  });

  it("passes when llms.txt, well-known, robots, and a conventional spec path are present", () => {
    const origin = "https://api.example";
    const checks = checkDiscoverability({
      origin,
      openapiFound: true,
      specSource: "url",
      specUrl: origin + "/openapi.json",
      probes: [
        { path: "/llms.txt", url: origin + "/llms.txt", ok: true, status: 200, contentType: "text/plain", snippet: "# Example\n> API map\n- [Docs](https://api.example/docs.md)" },
        { path: "/robots.txt", url: origin + "/robots.txt", ok: true, status: 200, contentType: "text/plain", snippet: "User-agent: ClaudeBot\nAllow: /\n# llms.txt" },
        { path: "/.well-known/mcp.json", url: origin + "/.well-known/mcp.json", ok: true, status: 200, contentType: "application/json", snippet: "{}" },
        { path: "/.well-known/oauth-protected-resource", url: origin + "/.well-known/oauth-protected-resource", ok: true, status: 200, contentType: "application/json", snippet: "{}" },
        { path: "/openapi.json", url: origin + "/openapi.json", ok: true, status: 200, contentType: "application/json", snippet: "{}" },
      ],
    });
    for (const c of checks) assert.equal(c.status, "pass", c.id + " " + c.title);
  });
});
