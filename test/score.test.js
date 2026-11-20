import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSpec,
  scoreDocument,
  scoreSource,
  formatReport,
  categoryScore,
  tokenBudgetScore,
  checkDocs,
  checkErrors,
  checkAuth,
  checkMcpWrap,
  operations,
  toolListCost,
} from "../dist/index.js";
import { fixture, mockFetch, FULL_DISCOVERY, originMap } from "./helpers.js";
import { emptyDiscovery } from "../dist/discover.js";

const good = () => parseSpec(fixture("good.yaml"));
const bad = () => parseSpec(fixture("bad.yaml"));

function cat(report, id) {
  return report.categories.find((c) => c.id === id);
}

describe("scoreDocument", () => {
  it("scores a complete spec with full discovery in the 90s or above", async () => {
    const origin = "https://api.widgets.example";
    const fetchImpl = mockFetch({
      ...originMap(origin, FULL_DISCOVERY),
      [origin + "/openapi.json"]: { status: 200, contentType: "application/json", body: fixture("good.yaml") },
    });
    const result = await scoreSource(
      { specText: fixture("good.yaml"), sourceLabel: "good.yaml" },
      { fetch: fetchImpl, origin },
    );
    assert.equal(result.ok, true);
    assert.ok(result.score >= 90, `expected >= 90, got ${result.score}`);
    assert.equal(result.title, "Widgets API");
    assert.equal(result.findings.filter((f) => f.status === "fail").length, 0);
    assert.ok(cat(result, "docs").score >= 90);
    assert.ok(cat(result, "errors").score >= 90);
    assert.ok(cat(result, "auth").score >= 90);
    assert.ok(cat(result, "mcp").score >= 90);
    assert.ok(cat(result, "discoverability").score >= 80);
  });

  it("scores a thin spec low, and every failed check includes a fix", () => {
    const report = scoreDocument(bad(), emptyDiscovery({ openapiFound: true, specSource: "file" }));
    assert.ok(report.score <= 40, `expected <= 40, got ${report.score}`);
    assert.ok(report.findings.some((f) => f.status === "fail"));
    for (const f of report.findings) {
      assert.ok(f.fix && f.fix.length > 10, `missing fix for ${f.id}`);
    }
  });

  it("keeps overall score in 0-100 and lists all five categories", () => {
    const report = scoreDocument(good(), emptyDiscovery({ openapiFound: true, specSource: "text" }));
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.deepEqual(report.categories.map((c) => c.id), [
      "discoverability", "docs", "errors", "auth", "mcp",
    ]);
  });

  it("marks discovery checks as skip when no origin is available", () => {
    const doc = parseSpec(`openapi: 3.0.0
info: { title: Local, version: "1" }
paths:
  /x:
    get:
      operationId: getX
      responses: { "200": { description: ok } }
`);
    const report = scoreDocument(doc, emptyDiscovery({ openapiFound: true, specSource: "text" }));
    const skipped = cat(report, "discoverability").checks.filter((c) => c.status === "skip");
    assert.ok(skipped.length >= 3);
    assert.equal(cat(report, "discoverability").score != null, true); // openapi check still counts
  });

  it("formatReport includes the score, categories, and a fix or a success line", () => {
    const report = scoreDocument(bad(), emptyDiscovery({ openapiFound: true, specSource: "text" }));
    const text = formatReport(report);
    assert.match(text, /Agent-Ready Score: \d+\/100/);
    assert.match(text, /Discoverability/);
    assert.match(text, /Top fixes:/);
    assert.match(text, /Pro coming soon/);
    assert.doesNotMatch(text, /\$\d+/);
  });
});

describe("categoryScore", () => {
  it("returns null when every check is skipped", () => {
    assert.equal(categoryScore([{ status: "skip", score: 0, weight: 1 }]), null);
  });

  it("weights checks and scales to 0-100", () => {
    const n = categoryScore([
      { status: "pass", score: 1, weight: 3 },
      { status: "fail", score: 0, weight: 1 },
    ]);
    assert.equal(n, 75);
  });
});

describe("docs checks", () => {
  it("passes the good fixture on summaries, descriptions, examples, and info", () => {
    const doc = good();
    const checks = checkDocs(doc, operations(doc));
    for (const c of checks) assert.equal(c.status, "pass", c.id + " " + c.detail);
  });

  it("fails the bad fixture on descriptions and examples", () => {
    const doc = bad();
    const checks = checkDocs(doc, operations(doc));
    const desc = checks.find((c) => c.id === "docs.descriptions");
    const ex = checks.find((c) => c.id === "docs.examples");
    assert.equal(desc.status, "fail");
    assert.equal(ex.status, "fail");
    assert.match(desc.fix, /description/i);
  });
});

describe("error checks", () => {
  it("passes the good fixture, including problem+json", () => {
    const doc = good();
    const checks = checkErrors(doc, operations(doc));
    for (const c of checks) assert.equal(c.status, "pass", c.id);
  });

  it("fails when 4xx/5xx responses are missing", () => {
    const doc = bad();
    const checks = checkErrors(doc, operations(doc));
    assert.equal(checks.find((c) => c.id === "errors.4xx").status, "fail");
    assert.equal(checks.find((c) => c.id === "errors.5xx").status, "fail");
    assert.equal(checks.find((c) => c.id === "errors.problem_json").status, "fail");
  });

  it("treats a default response with a schema as covering 4xx and 5xx", () => {
    const doc = parseSpec(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      paths: {
        "/x": {
          get: {
            operationId: "g",
            responses: {
              "200": { description: "ok" },
              default: { description: "err", content: { "application/json": { schema: { type: "object" } } } },
            },
          },
        },
      },
    }));
    const checks = checkErrors(doc, operations(doc));
    assert.equal(checks.find((c) => c.id === "errors.4xx").status, "pass");
    assert.equal(checks.find((c) => c.id === "errors.5xx").status, "pass");
  });
});

describe("auth checks", () => {
  it("rewards OAuth schemes with applied scopes", () => {
    const doc = good();
    const checks = checkAuth(doc, operations(doc));
    for (const c of checks) assert.equal(c.status, "pass", c.id + " " + c.title);
  });

  it("warns on bearer-only auth without OAuth", () => {
    const doc = parseSpec(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      security: [{ bearer: [] }],
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
      paths: { "/x": { get: { operationId: "g", responses: { "200": { description: "ok" } } } } },
    }));
    const checks = checkAuth(doc, operations(doc));
    assert.equal(checks.find((c) => c.id === "auth.schemes").status, "pass");
    assert.equal(checks.find((c) => c.id === "auth.oauth").status, "warn");
    assert.match(checks.find((c) => c.id === "auth.oauth").fix, /OAuth/);
  });

  it("warns when the API is explicitly public", () => {
    const doc = parseSpec(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      security: [],
      paths: { "/x": { get: { operationId: "g", responses: { "200": { description: "ok" } } } } },
    }));
    const checks = checkAuth(doc, operations(doc));
    assert.equal(checks.find((c) => c.id === "auth.schemes").status, "warn");
  });
});

describe("MCP-wrappability", () => {
  it("passes unique operationIds and typed parameters on the good fixture", () => {
    const doc = good();
    const ops = operations(doc);
    const checks = checkMcpWrap(doc, ops, toolListCost(doc, ops));
    assert.equal(checks.find((c) => c.id === "mcp.operation_ids").status, "pass");
    assert.equal(checks.find((c) => c.id === "mcp.param_schemas").status, "pass");
    assert.equal(checks.find((c) => c.id === "mcp.tool_list_tokens").status, "pass");
  });

  it("fails missing operationIds", () => {
    const doc = bad();
    const ops = operations(doc);
    const checks = checkMcpWrap(doc, ops, toolListCost(doc, ops));
    assert.equal(checks.find((c) => c.id === "mcp.operation_ids").status, "fail");
  });

  it("scores the token budget: full marks at 4000, zero at 40000", () => {
    assert.equal(tokenBudgetScore(0), 1);
    assert.equal(tokenBudgetScore(4000), 1);
    assert.equal(tokenBudgetScore(40000), 0);
    assert.ok(Math.abs(tokenBudgetScore(22000) - 0.5) < 0.001);
  });
});

describe("scoreSource", () => {
  it("returns ok:false for empty input", async () => {
    const r = await scoreSource({});
    assert.equal(r.ok, false);
    assert.match(r.error, /Provide a spec/);
  });

  it("returns ok:false for invalid text", async () => {
    const r = await scoreSource({ specText: "not a spec" });
    assert.equal(r.ok, false);
  });

  it("skipDiscovery skips origin probes instead of failing them", async () => {
    const r = await scoreSource(
      { specText: fixture("good.yaml"), sourceLabel: "good.yaml" },
      { skipDiscovery: true },
    );
    assert.equal(r.ok, true);
    const disc = r.categories.find((c) => c.id === "discoverability");
    assert.ok(disc.checks.some((c) => c.status === "skip"));
    assert.equal(disc.checks.find((c) => c.id === "discover.llms_txt").status, "skip");
    assert.ok(r.score >= 90, `expected >= 90 with discovery skipped, got ${r.score}`);
  });

  it("fetches a spec URL and can skip discovery", async () => {
    const spec = fixture("good.yaml");
    const fetchImpl = mockFetch({
      "https://cdn.example/openapi.yaml": { status: 200, contentType: "text/yaml", body: spec },
    });
    const r = await scoreSource(
      { url: "https://cdn.example/openapi.yaml" },
      { fetch: fetchImpl, skipDiscovery: true },
    );
    assert.equal(r.ok, true);
    assert.equal(r.title, "Widgets API");
  });
});
