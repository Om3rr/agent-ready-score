import { hasSchema, isErrorStatus, mediaTypes, } from "../openapi.js";
export function checkErrors(doc, ops) {
    const total = ops.length;
    const with4xx = ops.filter((op) => hasDocumentedError(doc, op, "4xx")).length;
    const with5xx = ops.filter((op) => hasDocumentedError(doc, op, "5xx")).length;
    const withProblem = ops.filter((op) => usesProblemJson(doc, op)).length;
    const withShared = ops.filter((op) => hasDefaultOrSharedError(doc, op)).length;
    return [
        ratioCheck({
            id: "errors.4xx",
            titlePass: "Client errors are documented with schemas",
            titleFail: "Many operations lack documented 4xx responses",
            weight: 40,
            total,
            hit: with4xx,
            good: 0.8,
            ok: 0.4,
            detail: `${with4xx}/${total} operations document a 4xx (or default) response with a schema.`,
            fix: "Document 400/401/403/404/409 responses with a schema so agents can parse failures instead of guessing.",
        }),
        ratioCheck({
            id: "errors.5xx",
            titlePass: "Server errors are documented with schemas",
            titleFail: "Many operations lack documented 5xx responses",
            weight: 30,
            total,
            hit: with5xx,
            good: 0.6,
            ok: 0.25,
            detail: `${with5xx}/${total} operations document a 5xx (or default) response with a schema.`,
            fix: "Add a 500 or 5XX response with the same error schema, or a `default` response that covers unexpected failures.",
        }),
        ratioCheck({
            id: "errors.problem_json",
            titlePass: "Errors use application/problem+json",
            titleFail: "Errors are not advertised as application/problem+json",
            weight: 20,
            total,
            hit: withProblem,
            good: 0.5,
            ok: 0.15,
            detail: `${withProblem}/${total} operations declare application/problem+json on an error response.`,
            fix: "Advertise `application/problem+json` (RFC 9457) on 4xx/5xx responses so agents get a consistent type, title, status, and detail.",
        }),
        ratioCheck({
            id: "errors.shared",
            titlePass: "A shared or default error response is declared",
            titleFail: "No default or shared error response",
            weight: 10,
            total,
            hit: withShared,
            good: 0.7,
            ok: 0.3,
            detail: `${withShared}/${total} operations have a default response or $ref-based error body.`,
            fix: "Define one error schema under components.schemas and reuse it via $ref, plus a `default` response on each operation.",
        }),
    ];
}
function resolveResponse(doc, res) {
    if (!res?.$ref)
        return res;
    const m = /^#\/components\/responses\/([^/]+)$/.exec(res.$ref);
    if (!m)
        return res;
    const resolved = doc.components?.responses?.[decodeURIComponent(m[1])];
    return resolved || res;
}
function hasDocumentedError(doc, op, kind) {
    for (const [code, res] of Object.entries(op.responses)) {
        if (!isErrorStatus(code, kind))
            continue;
        const resolved = resolveResponse(doc, res) || res;
        if (hasSchema(resolved) || resolved?.$ref || res?.$ref)
            return true;
    }
    return false;
}
function usesProblemJson(doc, op) {
    for (const [code, res] of Object.entries(op.responses)) {
        if (!isErrorStatus(code, "4xx") && !isErrorStatus(code, "5xx"))
            continue;
        const types = mediaTypes(resolveResponse(doc, res) || res);
        if (types.some((t) => /application\/problem\+json/i.test(t)))
            return true;
    }
    return false;
}
function hasDefaultOrSharedError(doc, op) {
    const def = resolveResponse(doc, op.responses.default) || op.responses.default;
    if (def && (hasSchema(def) || def.$ref || op.responses.default?.$ref))
        return true;
    for (const [code, res] of Object.entries(op.responses)) {
        if (!isErrorStatus(code, "4xx") && !isErrorStatus(code, "5xx"))
            continue;
        if (res?.$ref)
            return true;
        if (res?.content) {
            for (const m of Object.values(res.content)) {
                const ref = m?.schema?.$ref;
                if (ref)
                    return true;
            }
        }
        if (res?.schema?.$ref)
            return true;
    }
    return false;
}
function ratioCheck(opts) {
    if (opts.total === 0) {
        return {
            id: opts.id,
            category: "errors",
            status: "fail",
            score: 0,
            weight: opts.weight,
            title: "The spec defines no operations",
            detail: "paths is empty.",
            fix: "Add operations and document their error responses.",
        };
    }
    const ratio = opts.hit / opts.total;
    const status = ratio >= opts.good ? "pass" : ratio >= opts.ok ? "warn" : "fail";
    return {
        id: opts.id,
        category: "errors",
        status,
        score: ratio,
        weight: opts.weight,
        title: status === "pass" ? opts.titlePass : opts.titleFail,
        detail: opts.detail,
        fix: status === "pass" ? "" : opts.fix,
    };
}
