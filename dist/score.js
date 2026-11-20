import { operations, specTitle, specVersion } from "./openapi.js";
import { toolListCost } from "./tokens.js";
import { checkDiscoverability } from "./checks/discoverability.js";
import { checkDocs } from "./checks/docs.js";
import { checkErrors } from "./checks/errors.js";
import { checkAuth } from "./checks/auth.js";
import { checkMcpWrap } from "./checks/mcp.js";
export const VERSION = "0.1.0";
export const CATEGORY_META = [
    { id: "discoverability", label: "Discoverability", weight: 20 },
    { id: "docs", label: "Docs quality", weight: 20 },
    { id: "errors", label: "Predictable errors", weight: 20 },
    { id: "auth", label: "Auth & identity", weight: 20 },
    { id: "mcp", label: "MCP-wrappability", weight: 20 },
];
export function scoreDocument(doc, discovery, opts = { source: "text" }) {
    const ops = operations(doc);
    const cost = toolListCost(doc, ops);
    const checks = [
        ...checkDiscoverability(discovery),
        ...checkDocs(doc, ops),
        ...checkErrors(doc, ops),
        ...checkAuth(doc, ops),
        ...checkMcpWrap(doc, ops, cost),
    ];
    const categories = CATEGORY_META.map((meta) => {
        const group = checks.filter((c) => c.category === meta.id);
        return { ...meta, score: categoryScore(group), checks: group };
    });
    const scored = categories.filter((c) => c.score != null);
    const weightSum = scored.reduce((s, c) => s + c.weight, 0) || 1;
    const overall = scored.reduce((s, c) => s + c.score * c.weight, 0) / weightSum;
    const findings = checks
        .filter((c) => c.status === "fail" || c.status === "warn")
        .map((c) => ({
        id: c.id,
        category: c.category,
        status: c.status,
        title: c.title,
        detail: c.detail,
        fix: c.fix,
    }));
    // Failed checks first, then warns; keep category order otherwise.
    findings.sort((a, b) => (a.status === b.status ? 0 : a.status === "fail" ? -1 : 1));
    return {
        ok: true,
        version: VERSION,
        source: opts.source,
        title: specTitle(doc),
        specVersion: specVersion(doc),
        score: Math.round(overall),
        categories,
        findings,
        toolList: cost,
        sampledAt: (opts.now ?? new Date()).toISOString(),
    };
}
/** Weighted average of non-skipped checks, scaled to 0-100. */
export function categoryScore(checks) {
    const active = checks.filter((c) => c.status !== "skip");
    if (!active.length)
        return null;
    const weight = active.reduce((s, c) => s + c.weight, 0) || 1;
    const raw = active.reduce((s, c) => s + clamp01(c.score) * c.weight, 0) / weight;
    return Math.round(raw * 1000) / 10; // one decimal
}
export function clamp01(n) {
    if (Number.isNaN(n))
        return 0;
    return Math.max(0, Math.min(1, n));
}
export function formatReport(report) {
    const bar = (n) => {
        if (n == null)
            return "  n/a  skipped";
        const filled = Math.round(n / 10);
        return `${String(Math.round(n)).padStart(3)}  ${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
    };
    const lines = [
        `Agent-Ready Score: ${report.score}/100  (${report.title})`,
        `${report.specVersion} · ${report.source}`,
        "",
        ...report.categories.map((c) => `  ${c.label.padEnd(22)} ${bar(c.score)}`),
        "",
        `Generated tool list: ${report.toolList.operations} operations ≈ ${report.toolList.tokens} tokens`,
    ];
    const fixes = report.findings.filter((f) => f.fix);
    if (fixes.length) {
        lines.push("", "Top fixes:");
        fixes.slice(0, 8).forEach((f, i) => {
            lines.push(`  ${i + 1}. [${f.status}] ${f.title}`);
            lines.push(`     ${f.fix}`);
        });
    }
    else {
        lines.push("", "No outstanding fixes. Nice work.");
    }
    lines.push("", "Pro coming soon");
    return lines.join("\n");
}
