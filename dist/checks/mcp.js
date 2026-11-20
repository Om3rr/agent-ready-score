import { paramIsTyped, validOperationId } from "../openapi.js";
import { looksTypedSchema } from "../openapi.js";
/** Token-cost scoring: full marks at or below LOW, zero at or above HIGH. */
export const TOKEN_FULL = 4000;
export const TOKEN_ZERO = 40000;
export function checkMcpWrap(_doc, ops, cost) {
    const total = ops.length;
    const ids = ops.map((op) => op.operationId);
    const unique = new Set(ids.filter((id) => Boolean(id)));
    const valid = ops.filter((op) => validOperationId(op.operationId)).length;
    const uniqueValid = ops.filter((op) => validOperationId(op.operationId) && unique.has(op.operationId)).length;
    // Penalize duplicates: if two share an id, neither counts as unique-valid beyond the first.
    const dup = ids.filter((id) => id && ids.filter((x) => x === id).length > 1).length;
    const idHits = Math.max(0, uniqueValid - (dup > 0 ? Math.floor(dup / 2) : 0));
    const typed = ops.filter((op) => operationWellTyped(op)).length;
    const tokenScore = tokenBudgetScore(cost.tokens);
    const tokenStatus = tokenScore >= 0.8 ? "pass" : tokenScore >= 0.4 ? "warn" : "fail";
    return [
        ratioCheck({
            id: "mcp.operation_ids",
            titlePass: "Operations have unique, valid operationIds",
            titleFail: "Many operations are missing a usable operationId",
            weight: 35,
            total,
            hit: total ? Math.min(total, idHits) : 0,
            good: 0.95,
            ok: 0.6,
            detail: `${valid}/${total} have a valid operationId, ${unique.size} unique. These become MCP tool names.`,
            fix: "Give every operation a unique operationId that matches ^[A-Za-z][A-Za-z0-9._-]*$ (for example listWidgets, not 'list widgets').",
        }),
        ratioCheck({
            id: "mcp.param_schemas",
            titlePass: "Parameters and request bodies have typed schemas",
            titleFail: "Many operations have untyped or missing parameter schemas",
            weight: 35,
            total,
            hit: typed,
            good: 0.9,
            ok: 0.5,
            detail: `${typed}/${total} operations have typed schemas for all parameters and, when present, the request body.`,
            fix: "Add a JSON Schema (`schema` or `$ref`) to every parameter and request body. Avoid untyped `object` bags with no properties.",
        }),
        {
            id: "mcp.tool_list_tokens",
            category: "mcp",
            status: !total ? "fail" : tokenStatus,
            score: !total ? 0 : tokenScore,
            weight: 30,
            title: tokenStatus === "pass"
                ? `Generated tool list is a reasonable size (${cost.tokens} tokens)`
                : `Generated tool list is expensive (${cost.tokens} tokens, ${cost.operations} operations)`,
            detail: `${cost.operations} operations serialize to about ${cost.tokens} tokens (~${cost.chars} characters). Agents pay this cost on every turn.`,
            fix: tokenStatus === "pass"
                ? ""
                : "Split the API into smaller tool surfaces, shorten descriptions, and drop unused operations. A generated MCP server that exposes every path will overflow the context window.",
        },
    ];
}
export function tokenBudgetScore(tokens) {
    if (tokens <= TOKEN_FULL)
        return 1;
    if (tokens >= TOKEN_ZERO)
        return 0;
    return (TOKEN_ZERO - tokens) / (TOKEN_ZERO - TOKEN_FULL);
}
function operationWellTyped(op) {
    const paramsOk = op.parameters.every((p) => paramIsTyped(p));
    const body = op.requestBody;
    if (!body)
        return paramsOk;
    const contents = Object.values(body.content || {});
    if (!contents.length)
        return false;
    const schemasOk = contents.every((m) => looksTypedSchema(m?.schema) && !isEmptyObjectSchema(m?.schema));
    return paramsOk && schemasOk;
}
function isEmptyObjectSchema(schema) {
    if (!schema || typeof schema !== "object")
        return false;
    const s = schema;
    if (s.$ref)
        return false;
    if (s.type === "object" && !s.properties && !s.additionalProperties && !s.oneOf && !s.anyOf && !s.allOf) {
        return true;
    }
    return false;
}
function ratioCheck(opts) {
    if (opts.total === 0) {
        return {
            id: opts.id,
            category: "mcp",
            status: "fail",
            score: 0,
            weight: opts.weight,
            title: "The spec defines no operations to wrap as tools",
            detail: "paths is empty.",
            fix: "Add operations with operationIds and typed parameter schemas.",
        };
    }
    const ratio = opts.hit / opts.total;
    const status = ratio >= opts.good ? "pass" : ratio >= opts.ok ? "warn" : "fail";
    return {
        id: opts.id,
        category: "mcp",
        status,
        score: Math.max(0, Math.min(1, ratio)),
        weight: opts.weight,
        title: status === "pass" ? opts.titlePass : opts.titleFail,
        detail: opts.detail,
        fix: status === "pass" ? "" : opts.fix,
    };
}
