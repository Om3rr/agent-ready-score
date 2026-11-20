import { looksTypedSchema } from "./openapi.js";
/** Same approximation used by MCP Readiness / ToolSlim: ~4 characters per token. */
export const CHARS_PER_TOKEN = 4;
export function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
/**
 * Build a compact MCP-style tools list from the OpenAPI operations and
 * estimate how many tokens that list would cost an agent every turn.
 */
export function toolListCost(doc, ops) {
    const tools = ops.map((op) => ({
        name: toolName(op),
        description: toolDescription(op),
        inputSchema: inputSchema(op),
    }));
    const payload = JSON.stringify(tools);
    return {
        operations: ops.length,
        tools: tools.length,
        chars: payload.length,
        tokens: estimateTokens(payload),
    };
}
export function toolName(op) {
    if (op.operationId && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(op.operationId)) {
        return op.operationId.slice(0, 64);
    }
    const slug = `${op.method}_${op.path}`
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
    return slug || `${op.method}_op`;
}
function toolDescription(op) {
    const parts = [op.summary, op.description].filter(Boolean);
    const text = parts.join(" — ").replace(/\s+/g, " ").trim();
    return text.slice(0, 500);
}
function inputSchema(op) {
    const properties = {};
    const required = [];
    for (const p of op.parameters) {
        const name = p.name || (p.$ref ? refName(p.$ref) : undefined);
        if (!name || properties[name])
            continue;
        const schema = p.schema && typeof p.schema === "object"
            ? { ...p.schema }
            : p.type
                ? { type: p.type }
                : p.$ref
                    ? { $ref: p.$ref }
                    : { type: "string" };
        if (p.description && typeof schema === "object" && !("description" in schema)) {
            schema.description = p.description;
        }
        properties[name] = schema;
        if (p.required)
            required.push(name);
    }
    const body = op.requestBody?.content && firstSchema(op.requestBody.content);
    if (body) {
        properties.body = looksTypedSchema(body) ? body : { type: "object" };
        if (op.requestBody?.required)
            required.push("body");
    }
    return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
    };
}
function firstSchema(content) {
    const json = content["application/json"]?.schema;
    if (json)
        return json;
    for (const m of Object.values(content)) {
        if (m?.schema)
            return m.schema;
    }
    return undefined;
}
function refName(ref) {
    const m = ref.split("/").pop();
    return m || undefined;
}
