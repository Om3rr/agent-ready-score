import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatReport, scoreSource, shieldsEndpoint } from "./index.js";
const I = (k, d = "") => (process.env[`INPUT_${k}`] ?? d).trim();
function out(k, v) {
    if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}
function summary(md) {
    if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    else
        console.log(md);
}
export async function runAction(env = process.env) {
    const spec = (env.INPUT_SPEC ?? env.INPUT_URL ?? I("SPEC") ?? I("URL") ?? "").trim();
    if (!spec) {
        console.error('::error::Input "spec" (or "url") is required.');
        return 1;
    }
    const failUnder = Number((env.INPUT_FAIL_UNDER ?? I("FAIL_UNDER", "0")) || 0);
    const skipDiscovery = /^(true|1|yes)$/i.test(env.INPUT_SKIP_DISCOVERY ?? I("SKIP_DISCOVERY", ""));
    const origin = (env.INPUT_ORIGIN ?? I("ORIGIN")) || undefined;
    let input;
    if (/^https?:\/\//i.test(spec)) {
        input = { url: spec };
    }
    else {
        const filePath = resolve(spec);
        try {
            input = { specText: readFileSync(filePath, "utf8"), sourceLabel: spec, filePath };
        }
        catch (e) {
            console.error(`::error::Could not read ${spec}: ${e.message}`);
            return 1;
        }
    }
    const result = await scoreSource(input, { skipDiscovery, origin, timeoutMs: 25000 });
    if (!result.ok) {
        console.error(`::error::${result.error}`);
        return 1;
    }
    const report = result;
    const badge = shieldsEndpoint(report.score);
    const findings = report.findings.length;
    const md = [
        formatReport(report),
        "",
        "```json",
        JSON.stringify(badge, null, 2),
        "```",
    ].join("\n");
    summary(md);
    if (I("JSON_PATH") || env.INPUT_JSON_PATH) {
        writeFileSync(env.INPUT_JSON_PATH || I("JSON_PATH"), JSON.stringify(report, null, 2));
    }
    const badgePath = env.INPUT_BADGE_PATH || I("BADGE_PATH");
    if (badgePath)
        writeFileSync(badgePath, JSON.stringify(badge, null, 2) + "\n");
    for (const f of report.findings.filter((x) => x.status === "fail").slice(0, 10)) {
        console.log(`::error title=${f.id}::${f.title}${f.fix ? " — " + f.fix : ""}`);
    }
    for (const f of report.findings.filter((x) => x.status === "warn").slice(0, 10)) {
        console.log(`::warning title=${f.id}::${f.title}${f.fix ? " — " + f.fix : ""}`);
    }
    out("score", String(report.score));
    out("findings", String(findings));
    out("badge", JSON.stringify(badge));
    for (const c of report.categories) {
        out(`score_${c.id}`, c.score == null ? "" : String(Math.round(c.score)));
    }
    if (failUnder > 0 && report.score < failUnder) {
        console.error(`::error::Score ${report.score} is below fail-under ${failUnder}.`);
        return 1;
    }
    return 0;
}
const isMain = process.argv[1] && process.argv[1].endsWith("action.js");
if (isMain) {
    runAction().then((code) => process.exit(code)).catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
