import { meaningfulText, operationHasExample } from "../openapi.js";
export function checkDocs(doc, ops) {
    const total = ops.length;
    const withSummary = ops.filter((op) => meaningfulText(op.summary, 8) || meaningfulText(op.operationId, 8) && meaningfulText(op.summary, 3)).length;
    const withSummaryOrShort = ops.filter((op) => meaningfulText(op.summary, 8)).length;
    const withDesc = ops.filter((op) => meaningfulText(op.description, 40)).length;
    const withExample = ops.filter((op) => operationHasExample(op)).length;
    const infoOk = Boolean(doc.info?.title?.trim()) && meaningfulText(doc.info?.description, 40);
    return [
        ratioCheck({
            id: "docs.summaries",
            titlePass: "Operations have summaries",
            titleFail: "Many operations lack a summary",
            weight: 30,
            total,
            hit: withSummaryOrShort,
            good: 0.9,
            ok: 0.6,
            detail: `${withSummaryOrShort}/${total} operations have a summary of at least 8 characters.`,
            fix: "Add a short `summary` to every operation so agents can pick the right tool without reading a long description.",
        }),
        ratioCheck({
            id: "docs.descriptions",
            titlePass: "Operations have useful descriptions",
            titleFail: "Many operations lack a useful description",
            weight: 35,
            total,
            hit: withDesc,
            good: 0.8,
            ok: 0.4,
            detail: `${withDesc}/${total} operations have a description of at least 40 characters.`,
            fix: "Write a `description` on each operation that says what it does, when to call it, and what it returns. Agents cannot ask a teammate.",
        }),
        ratioCheck({
            id: "docs.examples",
            titlePass: "Operations include request or response examples",
            titleFail: "Many operations have no examples",
            weight: 25,
            total,
            hit: withExample,
            good: 0.6,
            ok: 0.25,
            detail: `${withExample}/${total} operations include an example (parameter, request body, or response).`,
            fix: "Add `example` or `examples` on request bodies and success responses so agents can see a valid payload.",
        }),
        {
            id: "docs.info",
            category: "docs",
            status: infoOk ? "pass" : doc.info?.title ? "warn" : "fail",
            score: infoOk ? 1 : doc.info?.title ? 0.4 : 0,
            weight: 10,
            title: infoOk ? "API info has a title and description" : doc.info?.title ? "API title is set, but the description is thin" : "API info title or description is missing",
            detail: doc.info?.title ? `Title: ${doc.info.title}` : "No info.title.",
            fix: infoOk ? "" : "Set `info.title` and a paragraph-length `info.description` that explains what the API is for and who may call it.",
        },
    ];
}
function ratioCheck(opts) {
    if (opts.total === 0) {
        return {
            id: opts.id,
            category: "docs",
            status: "fail",
            score: 0,
            weight: opts.weight,
            title: "The spec defines no operations",
            detail: "paths is empty.",
            fix: "Add at least one path and operation to the OpenAPI document.",
        };
    }
    const ratio = opts.hit / opts.total;
    const status = ratio >= opts.good ? "pass" : ratio >= opts.ok ? "warn" : "fail";
    return {
        id: opts.id,
        category: "docs",
        status,
        score: ratio,
        weight: opts.weight,
        title: status === "pass" ? opts.titlePass : opts.titleFail,
        detail: opts.detail,
        fix: status === "pass" ? "" : opts.fix,
    };
}
