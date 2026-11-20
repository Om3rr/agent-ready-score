import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSpec, SpecParseError, operations, specTitle, specVersion } from "../dist/index.js";
import { fixture } from "./helpers.js";

describe("parseSpec", () => {
  it("parses OpenAPI 3 YAML", () => {
    const doc = parseSpec(fixture("good.yaml"));
    assert.equal(doc.openapi, "3.1.0");
    assert.equal(specTitle(doc), "Widgets API");
    assert.equal(specVersion(doc), "OpenAPI 3.1.0");
    assert.equal(operations(doc).length, 3);
  });

  it("parses OpenAPI 3 JSON", () => {
    const doc = parseSpec(JSON.stringify({
      openapi: "3.0.3",
      info: { title: "JSON API", version: "1" },
      paths: { "/ping": { get: { operationId: "ping", responses: { "200": { description: "ok" } } } } },
    }));
    assert.equal(operations(doc).length, 1);
    assert.equal(specTitle(doc), "JSON API");
  });

  it("parses Swagger 2", () => {
    const doc = parseSpec(JSON.stringify({
      swagger: "2.0",
      info: { title: "Legacy", version: "1" },
      host: "api.example.com",
      schemes: ["https"],
      paths: { "/v1/x": { get: { operationId: "getX", responses: { "200": { description: "ok" } } } } },
    }));
    assert.equal(specVersion(doc), "Swagger 2.0");
    assert.equal(operations(doc).length, 1);
  });

  it("merges path-level parameters into operations", () => {
    const doc = parseSpec(JSON.stringify({
      openapi: "3.0.0",
      info: { title: "T", version: "1" },
      paths: {
        "/items/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: { operationId: "getItem", responses: { "200": { description: "ok" } } },
        },
      },
    }));
    assert.equal(operations(doc)[0].parameters.length, 1);
    assert.equal(operations(doc)[0].parameters[0].name, "id");
  });

  it("rejects empty input", () => {
    assert.throws(() => parseSpec("  "), SpecParseError);
  });

  it("rejects JSON that is not an object", () => {
    assert.throws(() => parseSpec("[]"), /not an OpenAPI/);
  });

  it("rejects documents without openapi or swagger", () => {
    assert.throws(() => parseSpec("info:\n  title: Nope\npaths: {}\n"), /Missing `openapi`/);
  });

  it("rejects documents without paths", () => {
    assert.throws(() => parseSpec("openapi: 3.0.0\ninfo:\n  title: X\n  version: '1'\n"), /no `paths`/);
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseSpec("{"), /Invalid JSON/);
  });

  it("ignores a leading UTF-8 BOM", () => {
    const doc = parseSpec("\uFEFF" + fixture("bad.yaml"));
    assert.equal(doc.info.title, "Mystery");
  });
});
