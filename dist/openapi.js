import { parse as parseYaml } from "yaml";
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
export class SpecParseError extends Error {
    constructor(message) {
        super(message);
        this.name = "SpecParseError";
    }
}
export function parseSpec(text) {
    const raw = text.replace(/^\uFEFF/, "").trim();
    if (!raw)
        throw new SpecParseError("The document is empty.");
    let value;
    if (raw.startsWith("{") || raw.startsWith("[")) {
        try {
            value = JSON.parse(raw);
        }
        catch (e) {
            throw new SpecParseError(`Invalid JSON: ${e.message}`);
        }
    }
    else {
        try {
            value = parseYaml(raw);
        }
        catch (e) {
            throw new SpecParseError(`Invalid YAML: ${e.message}`);
        }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new SpecParseError("The document is not an OpenAPI or Swagger object.");
    }
    const doc = value;
    if (!doc.openapi && !doc.swagger) {
        throw new SpecParseError("Missing `openapi` or `swagger` version field. This is not a valid OpenAPI document.");
    }
    if (!doc.paths || typeof doc.paths !== "object") {
        throw new SpecParseError("The document has no `paths` object.");
    }
    return doc;
}
export function isOpenAPIDoc(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const doc = value;
    return Boolean((doc.openapi || doc.swagger) && doc.paths && typeof doc.paths === "object");
}
export function specVersion(doc) {
    return doc.openapi ? `OpenAPI ${doc.openapi}` : doc.swagger ? `Swagger ${doc.swagger}` : "unknown";
}
export function specTitle(doc) {
    return doc.info?.title?.trim() || "Untitled API";
}
export function operations(doc) {
    const out = [];
    for (const [path, item] of Object.entries(doc.paths || {})) {
        if (!item || typeof item !== "object")
            continue;
        const shared = Array.isArray(item.parameters) ? item.parameters : [];
        for (const method of HTTP_METHODS) {
            const raw = item[method];
            if (!raw || typeof raw !== "object")
                continue;
            const op = raw;
            out.push({
                path,
                method,
                operationId: op.operationId,
                summary: op.summary,
                description: op.description,
                parameters: [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])],
                requestBody: op.requestBody,
                responses: op.responses && typeof op.responses === "object" ? op.responses : {},
                security: op.security,
            });
        }
    }
    return out;
}
export function securitySchemes(doc) {
    return {
        ...(doc.securityDefinitions || {}),
        ...(doc.components?.securitySchemes || {}),
    };
}
export function serverOrigin(doc) {
    const url = doc.servers?.find((s) => s.url && !s.url.includes("{"))?.url || doc.servers?.[0]?.url;
    if (url) {
        try {
            const abs = url.startsWith("http://") || url.startsWith("https://") ? url : `https://placeholder.invalid${url.startsWith("/") ? url : `/${url}`}`;
            if (abs.includes("placeholder.invalid")) {
                if (doc.host)
                    return originOf(`${(doc.schemes?.[0] || "https")}://${doc.host}`);
                return null;
            }
            return originOf(abs);
        }
        catch {
            /* fall through */
        }
    }
    if (doc.host)
        return originOf(`${(doc.schemes?.[0] || "https")}://${doc.host}`);
    return null;
}
export function originOf(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:")
            return null;
        return u.origin;
    }
    catch {
        return null;
    }
}
export function hasSchema(obj) {
    if (!obj)
        return false;
    if (obj.$ref || obj.schema || obj.type)
        return true;
    if (obj.content) {
        return Object.values(obj.content).some((m) => Boolean(m?.schema) || Boolean(m?.$ref));
    }
    return false;
}
export function mediaTypes(obj) {
    return obj?.content ? Object.keys(obj.content) : [];
}
export function looksTypedSchema(schema) {
    if (!schema || typeof schema !== "object")
        return false;
    const s = schema;
    if (typeof s.$ref === "string")
        return true;
    if (typeof s.type === "string")
        return true;
    if (s.properties || s.items || s.oneOf || s.anyOf || s.allOf || s.enum)
        return true;
    return false;
}
export function paramIsTyped(p) {
    if (p.$ref)
        return true;
    if (p.schema)
        return looksTypedSchema(p.schema) || true; // presence of schema is enough
    if (typeof p.type === "string")
        return true;
    if (p.content)
        return Object.values(p.content).some((m) => looksTypedSchema(m?.schema));
    return false;
}
export function operationHasExample(op) {
    if (op.requestBody?.content) {
        for (const m of Object.values(op.requestBody.content)) {
            if (m && (m.example !== undefined || m.examples))
                return true;
            if (schemaHasExample(m?.schema))
                return true;
        }
    }
    for (const p of op.parameters) {
        if (p.example !== undefined || p.examples)
            return true;
        if (schemaHasExample(p.schema))
            return true;
    }
    for (const r of Object.values(op.responses)) {
        if (r?.content) {
            for (const m of Object.values(r.content)) {
                if (m && (m.example !== undefined || m.examples))
                    return true;
                if (schemaHasExample(m?.schema))
                    return true;
            }
        }
        if (schemaHasExample(r?.schema))
            return true;
    }
    return false;
}
function schemaHasExample(schema) {
    if (!schema || typeof schema !== "object")
        return false;
    const s = schema;
    return s.example !== undefined || Boolean(s.examples);
}
export function isErrorStatus(code, kind) {
    if (code === "default")
        return true;
    if (kind === "4xx" && (code === "4XX" || code === "4xx"))
        return true;
    if (kind === "5xx" && (code === "5XX" || code === "5xx"))
        return true;
    if (!/^\d{3}$/.test(code))
        return false;
    const n = Number(code);
    return kind === "4xx" ? n >= 400 && n < 500 : n >= 500 && n < 600;
}
export function meaningfulText(value, min = 24) {
    if (!value)
        return false;
    const t = value.replace(/\s+/g, " ").trim();
    return t.length >= min;
}
export function validOperationId(id) {
    if (!id)
        return false;
    return /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(id);
}
