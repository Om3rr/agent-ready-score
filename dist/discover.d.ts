import type { DiscoveryProbe, DiscoveryResult, FetchLike } from "./types.js";
import { type OpenAPIDoc } from "./openapi.js";
export declare const DEFAULT_USER_AGENT = "agent-ready-score/0.1 (+https://github.com/Om3rr/agent-ready-score)";
export declare const WELL_KNOWN_PATHS: readonly ["/.well-known/mcp.json", "/.well-known/mcp/server-card.json", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration", "/.well-known/api-catalog", "/.well-known/ai-plugin.json", "/.well-known/agent.json"];
export declare const OPENAPI_CANDIDATE_PATHS: readonly ["/openapi.json", "/openapi.yaml", "/openapi.yml", "/swagger.json", "/swagger.yaml", "/api-docs", "/api/openapi.json", "/v1/openapi.json", "/.well-known/openapi.json", "/.well-known/openapi.yaml"];
export interface LoadSpecResult {
    doc: OpenAPIDoc;
    text: string;
    url: string | null;
    discoveredFrom: string | null;
    contentType: string;
}
export declare function fetchText(url: string, fetchImpl: FetchLike, opts: {
    timeoutMs: number;
    userAgent: string;
    accept?: string;
}): Promise<{
    ok: boolean;
    status: number;
    contentType: string;
    body: string;
}>;
export declare function looksLikeSpecUrl(url: string): boolean;
export declare function looksLikeHtml(contentType: string, body: string): boolean;
/** Pull likely OpenAPI URLs out of an HTML docs page (Swagger UI, Redoc, link tags). */
export declare function extractSpecUrlsFromHtml(html: string, baseUrl: string): string[];
export declare function loadSpecFromUrl(url: string, fetchImpl: FetchLike, opts: {
    timeoutMs: number;
    userAgent: string;
}): Promise<LoadSpecResult>;
export declare function probeOrigin(origin: string, fetchImpl: FetchLike, opts: {
    timeoutMs: number;
    userAgent: string;
}): Promise<DiscoveryProbe[]>;
export declare function emptyDiscovery(partial?: Partial<DiscoveryResult>): DiscoveryResult;
export declare function probeOf(probes: DiscoveryProbe[], path: string): DiscoveryProbe | undefined;
export declare function isUsableTextFile(probe: DiscoveryProbe | undefined): boolean;
export declare function isLlmsTxt(probe: DiscoveryProbe | undefined): boolean;
export declare const AI_CRAWLER_TOKENS: string[];
export declare function robotsMentionsAi(snippetText: string): boolean;
