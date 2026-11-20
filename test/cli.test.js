import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, runCli, HELP } from "../dist/cli.js";

const dir = dirname(fileURLToPath(import.meta.url));
const good = join(dir, "fixtures", "good.yaml");
const bad = join(dir, "fixtures", "bad.yaml");

describe("parseArgs", () => {
  it("reads the target, --json and --fail-under", () => {
    const a = parseArgs(["./spec.yaml", "--json", "--fail-under", "70"]);
    assert.equal(a.target, "./spec.yaml");
    assert.equal(a.json, true);
    assert.equal(a.failUnder, 70);
    assert.equal(a.skipDiscovery, false);
  });

  it("accepts --fail-under=80 and --skip-discovery", () => {
    const a = parseArgs(["--fail-under=80", "https://example.com/openapi.json", "--skip-discovery"]);
    assert.equal(a.failUnder, 80);
    assert.equal(a.target, "https://example.com/openapi.json");
    assert.equal(a.skipDiscovery, true);
  });

  it("rejects unknown flags and bad fail-under", () => {
    assert.throws(() => parseArgs(["--wat"]), /Unknown flag/);
    assert.throws(() => parseArgs(["--fail-under", "nope"]), /between 0 and 100/);
  });

  it("sets help", () => {
    assert.equal(parseArgs(["-h"]).help, true);
  });
});

describe("runCli", () => {
  it("prints help", async () => {
    const r = await runCli(["--help"]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, HELP);
  });

  it("errors when the target is missing", async () => {
    const r = await runCli([]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Missing/);
  });

  it("scores a local file as text and supports --json plus --skip-discovery", async () => {
    const r = await runCli([good, "--json", "--skip-discovery"]);
    assert.equal(r.code, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.title, "Widgets API");
    assert.ok(report.score >= 70);
  });

  it("prints a human report with Pro coming soon and no prices", async () => {
    const r = await runCli([good, "--skip-discovery"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Agent-Ready Score: \d+\/100/);
    assert.match(r.stdout, /Pro coming soon/);
    assert.doesNotMatch(r.stdout, /\$\d+/);
  });

  it("exits 1 when the score is below --fail-under", async () => {
    const r = await runCli([bad, "--skip-discovery", "--fail-under", "90"]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /below --fail-under 90/);
    assert.match(r.stdout, /Agent-Ready Score:/);
  });

  it("reads a spec from stdin when the target is omitted and text is provided", async () => {
    const { readFileSync } = await import("node:fs");
    const r = await runCli(["--skip-discovery", "--json"], readFileSync(good, "utf8"));
    // no target, but stdin text — parseArgs has no target, runCli should use stdin
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).title, "Widgets API");
  });
});
