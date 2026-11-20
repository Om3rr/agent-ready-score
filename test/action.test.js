import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAction } from "../dist/action.js";

const dir = dirname(fileURLToPath(import.meta.url));
const good = join(dir, "fixtures", "good.yaml");
const bad = join(dir, "fixtures", "bad.yaml");

describe("GitHub Action entry", () => {
  let tmp;
  const saved = { ...process.env };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ars-action-"));
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("INPUT_") || k === "GITHUB_OUTPUT" || k === "GITHUB_STEP_SUMMARY") delete process.env[k];
    }
    process.env.GITHUB_OUTPUT = join(tmp, "out.txt");
    process.env.GITHUB_STEP_SUMMARY = join(tmp, "summary.md");
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes score, findings and a Shields badge, and succeeds", async () => {
    process.env.INPUT_SPEC = good;
    process.env.INPUT_SKIP_DISCOVERY = "true";
    process.env.INPUT_BADGE_PATH = join(tmp, "badge.json");
    process.env.INPUT_JSON_PATH = join(tmp, "report.json");
    const code = await runAction();
    assert.equal(code, 0);
    const out = readFileSync(process.env.GITHUB_OUTPUT, "utf8");
    assert.match(out, /^score=\d+$/m);
    assert.match(out, /^findings=\d+$/m);
    const badge = JSON.parse(readFileSync(join(tmp, "badge.json"), "utf8"));
    assert.equal(badge.schemaVersion, 1);
    assert.equal(badge.label, "agent-ready");
    const report = JSON.parse(readFileSync(join(tmp, "report.json"), "utf8"));
    assert.equal(report.ok, true);
    const summary = readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf8");
    assert.match(summary, /Agent-Ready Score:/);
    assert.match(summary, /Pro coming soon/);
  });

  it("fails the job when the score is below fail-under", async () => {
    process.env.INPUT_SPEC = bad;
    process.env.INPUT_SKIP_DISCOVERY = "true";
    process.env.INPUT_FAIL_UNDER = "90";
    const code = await runAction();
    assert.equal(code, 1);
  });

  it("fails when spec is missing", async () => {
    const code = await runAction();
    assert.equal(code, 1);
  });
});
