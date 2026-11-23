import { type MetricsDB } from "./metrics.js";
export interface Env {
    ASSETS?: {
        fetch: typeof fetch;
    };
    METRICS?: MetricsDB;
    /** HTML-tag token from Google Search Console. Empty until set. */
    GOOGLE_SITE_VERIFICATION?: string;
}
type ExecutionCtx = {
    waitUntil?: (p: Promise<unknown>) => void;
};
/** Emit a google-site-verification meta tag when the wrangler var is set. Empty value: no tag. */
export declare function withGoogleVerification(response: Response, env: Env): Response | Promise<Response>;
declare const _default: {
    fetch(request: Request, env: Env, ctx?: ExecutionCtx): Promise<Response>;
};
export default _default;
export declare function handleRequest(request: Request, env?: Env, ctx?: ExecutionCtx): Promise<Response>;
/** Used when assets are not bound (unit tests). The real landing lives in worker/public/index.html. */
export declare const LANDING_FALLBACK = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Agent-Ready Score</title></head><body><p>Agent-Ready Score \u2014 paste an OpenAPI spec or URL. Pro coming soon.</p></body></html>";
