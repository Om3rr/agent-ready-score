import { parse as parseYaml } from "yaml";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface ParameterObject {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
  type?: string; // Swagger 2
  example?: unknown;
  examples?: unknown;
  content?: Record<string, MediaTypeObject>;
  $ref?: string;
}

export interface MediaTypeObject {
  schema?: Record<string, unknown>;
  example?: unknown;
  examples?: unknown;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
  schema?: Record<string, unknown>; // Swagger 2
  $ref?: string;
}

export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, MediaTypeObject>;
  };
  responses?: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface PathItemObject {
  $ref?: string;
  parameters?: ParameterObject[];
  [method: string]: unknown;
}

export interface SecuritySchemeObject {
  type?: string;
  name?: string;
  in?: string;
  scheme?: string;
  flows?: Record<string, { scopes?: Record<string, string>; authorizationUrl?: string; tokenUrl?: string }>;
  openIdConnectUrl?: string;
  description?: string;
  // Swagger 2
  flow?: string;
  scopes?: Record<string, string>;
  authorizationUrl?: string;
  tokenUrl?: string;
}

export interface OpenAPIDoc {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
    termsOfService?: string;
    contact?: { name?: string; url?: string; email?: string };
  };
  externalDocs?: { url?: string; description?: string };
  servers?: Array<{ url?: string; description?: string }>;
  paths?: Record<string, PathItemObject | undefined>;
  components?: {
    securitySchemes?: Record<string, SecuritySchemeObject>;
    schemas?: Record<string, unknown>;
    examples?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
  // Swagger 2
  host?: string;
  basePath?: string;
  schemes?: string[];
  securityDefinitions?: Record<string, SecuritySchemeObject>;
  definitions?: Record<string, unknown>;
}

export interface NormalizedOperation {
  path: string;
  method: HttpMethod;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters: ParameterObject[];
  requestBody?: OperationObject["requestBody"];
  responses: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
}

export class SpecParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecParseError";
  }
}

export function parseSpec(text: string): OpenAPIDoc {
  const raw = text.replace(/^\uFEFF/, "").trim();
  if (!raw) throw new SpecParseError("The document is empty.");
  let value: unknown;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      throw new SpecParseError(`Invalid JSON: ${(e as Error).message}`);
    }
  } else {
    try {
      value = parseYaml(raw);
    } catch (e) {
      throw new SpecParseError(`Invalid YAML: ${(e as Error).message}`);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpecParseError("The document is not an OpenAPI or Swagger object.");
  }
  const doc = value as OpenAPIDoc;
  if (!doc.openapi && !doc.swagger) {
    throw new SpecParseError("Missing `openapi` or `swagger` version field. This is not a valid OpenAPI document.");
  }
  if (!doc.paths || typeof doc.paths !== "object") {
    throw new SpecParseError("The document has no `paths` object.");
  }
  return doc;
}

export function isOpenAPIDoc(value: unknown): value is OpenAPIDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as OpenAPIDoc;
  return Boolean((doc.openapi || doc.swagger) && doc.paths && typeof doc.paths === "object");
}

export function specVersion(doc: OpenAPIDoc): string {
  return doc.openapi ? `OpenAPI ${doc.openapi}` : doc.swagger ? `Swagger ${doc.swagger}` : "unknown";
}

export function specTitle(doc: OpenAPIDoc): string {
  return doc.info?.title?.trim() || "Untitled API";
}

export function operations(doc: OpenAPIDoc): NormalizedOperation[] {
  const out: NormalizedOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths || {})) {
    if (!item || typeof item !== "object") continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of HTTP_METHODS) {
      const raw = item[method];
      if (!raw || typeof raw !== "object") continue;
      const op = raw as OperationObject;
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

export function securitySchemes(doc: OpenAPIDoc): Record<string, SecuritySchemeObject> {
  return {
    ...(doc.securityDefinitions || {}),
    ...(doc.components?.securitySchemes || {}),
  };
}

export function serverOrigin(doc: OpenAPIDoc): string | null {
  const url = doc.servers?.find((s) => s.url && !s.url.includes("{"))?.url || doc.servers?.[0]?.url;
  if (url) {
    try {
      const abs = url.startsWith("http://") || url.startsWith("https://") ? url : `https://placeholder.invalid${url.startsWith("/") ? url : `/${url}`}`;
      if (abs.includes("placeholder.invalid")) {
        if (doc.host) return originOf(`${(doc.schemes?.[0] || "https")}://${doc.host}`);
        return null;
      }
      return originOf(abs);
    } catch {
      /* fall through */
    }
  }
  if (doc.host) return originOf(`${(doc.schemes?.[0] || "https")}://${doc.host}`);
  return null;
}

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function hasSchema(obj: { schema?: unknown; $ref?: string; type?: string; content?: Record<string, MediaTypeObject> } | undefined): boolean {
  if (!obj) return false;
  if (obj.$ref || obj.schema || obj.type) return true;
  if (obj.content) {
    return Object.values(obj.content).some((m) => Boolean(m?.schema) || Boolean((m as { $ref?: string })?.$ref));
  }
  return false;
}

export function mediaTypes(obj: { content?: Record<string, MediaTypeObject> } | undefined): string[] {
  return obj?.content ? Object.keys(obj.content) : [];
}

export function looksTypedSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref === "string") return true;
  if (typeof s.type === "string") return true;
  if (s.properties || s.items || s.oneOf || s.anyOf || s.allOf || s.enum) return true;
  return false;
}

export function paramIsTyped(p: ParameterObject): boolean {
  if (p.$ref) return true;
  if (p.schema) return looksTypedSchema(p.schema) || true; // presence of schema is enough
  if (typeof p.type === "string") return true;
  if (p.content) return Object.values(p.content).some((m) => looksTypedSchema(m?.schema));
  return false;
}

export function operationHasExample(op: NormalizedOperation): boolean {
  if (op.requestBody?.content) {
    for (const m of Object.values(op.requestBody.content)) {
      if (m && (m.example !== undefined || m.examples)) return true;
      if (schemaHasExample(m?.schema)) return true;
    }
  }
  for (const p of op.parameters) {
    if (p.example !== undefined || p.examples) return true;
    if (schemaHasExample(p.schema)) return true;
  }
  for (const r of Object.values(op.responses)) {
    if (r?.content) {
      for (const m of Object.values(r.content)) {
        if (m && (m.example !== undefined || m.examples)) return true;
        if (schemaHasExample(m?.schema)) return true;
      }
    }
    if (schemaHasExample(r?.schema)) return true;
  }
  return false;
}

function schemaHasExample(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as Record<string, unknown>;
  return s.example !== undefined || Boolean(s.examples);
}

export function isErrorStatus(code: string, kind: "4xx" | "5xx"): boolean {
  if (code === "default") return true;
  if (kind === "4xx" && (code === "4XX" || code === "4xx")) return true;
  if (kind === "5xx" && (code === "5XX" || code === "5xx")) return true;
  if (!/^\d{3}$/.test(code)) return false;
  const n = Number(code);
  return kind === "4xx" ? n >= 400 && n < 500 : n >= 500 && n < 600;
}

export function meaningfulText(value: string | undefined, min = 24): boolean {
  if (!value) return false;
  const t = value.replace(/\s+/g, " ").trim();
  return t.length >= min;
}

export function validOperationId(id: string | undefined): boolean {
  if (!id) return false;
  return /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(id);
}
