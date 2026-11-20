import { type CtaEnv } from "./cta.js";
export interface Env extends CtaEnv {
    ASSETS?: {
        fetch: typeof fetch;
    };
}
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
export declare function handleRequest(request: Request, env?: Env): Promise<Response>;
/** Used when assets are not bound (unit tests). The real landing lives in worker/public/index.html. */
export declare const LANDING_FALLBACK = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Agent-Ready Score</title></head><body><p>Agent-Ready Score \u2014 paste an OpenAPI spec or URL. Pro coming soon.</p></body></html>";
