import { badgeSvg, formatReport, scoreSource, shieldsEndpoint } from "./index.js";
import { isHttpUrl } from "./escape.js";
import { bucketRoute, handleEvent, handleStats, handleWaitlist, scheduleTrack } from "./metrics.js";
const WORKER_NAME = "agent-ready-score";
const URL_ERROR = "Only absolute http(s) URLs are supported.";
const MAX_SPEC_CHARS = 2_000_000;
const TIMEOUT_MS = 20000;
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx);
    },
};
export async function handleRequest(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/stats" || path === "/stats.json" || path === "/stats.html") {
        if (request.method === "GET" || request.method === "HEAD") {
            return handleStats(env, WORKER_NAME, path === "/stats.json" ? "/stats" : path, "Agent-Ready Score");
        }
    }
    if (path === "/api/event")
        return handleEvent(request, env, WORKER_NAME);
    if (path === "/api/waitlist")
        return handleWaitlist(request, env, WORKER_NAME);
    if (request.method === "OPTIONS")
        return cors(new Response(null, { status: 204 }));
    let response;
    let scan = null;
    let badge = false;
    let targetUrl;
    try {
        if (path === "/api/score" && (request.method === "POST" || request.method === "GET")) {
            const scored = await handleScore(request, url);
            response = cors(scored.response);
            scan = response.ok ? "success" : "fail";
            targetUrl = scored.targetUrl;
        }
        else if (path === "/badge" || path === "/badge.json" || path === "/badge.svg") {
            const scored = await handleBadge(request, url, path);
            response = cors(scored.response);
            badge = true;
            targetUrl = scored.targetUrl;
            if (targetUrl || url.searchParams.get("url") || url.searchParams.get("spec")) {
                scan = response.ok ? "success" : "fail";
            }
        }
        else if (env.ASSETS) {
            const asset = await env.ASSETS.fetch(request);
            if (asset.status !== 404)
                response = asset;
            else if (request.method === "GET" && (path === "/" || path === "/index.html")) {
                response = new Response(LANDING_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
            }
            else {
                response = new Response("Not found", { status: 404 });
            }
        }
        else if (request.method === "GET" && (path === "/" || path === "/index.html")) {
            response = new Response(LANDING_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        else {
            response = new Response("Not found", { status: 404 });
        }
    }
    catch (e) {
        console.error("agent-ready-score error", { path, message: e.message });
        response = cors(json({ ok: false, error: e.message || "Internal error" }, 500));
        if (path === "/api/score" || path.startsWith("/badge"))
            scan = "fail";
    }
    response = withSecurityHeaders(response);
    const events = scan ? ["scan_started"] : [];
    scheduleTrack(ctx, env, request, { worker: WORKER_NAME, route: bucketRoute(path), scan, badge, targetUrl, events });
    return response;
}
async function handleScore(request, url) {
    const input = await readInput(request, url);
    if (!input.ok)
        return { response: json({ ok: false, error: input.error }, 400) };
    const result = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
    const status = result.ok ? 200 : 400;
    return { response: json(result, status), targetUrl: input.value.url };
}
async function handleBadge(request, url, path) {
    const wantJson = path.endsWith(".json") ||
        url.searchParams.get("format") === "json" ||
        (request.headers.get("accept") || "").includes("application/json");
    const scoreParam = url.searchParams.get("score");
    if (scoreParam != null && scoreParam !== "") {
        const score = Number(scoreParam);
        if (Number.isNaN(score))
            return { response: json({ ok: false, error: "score must be a number" }, 400) };
        return { response: badgeResponse(score, wantJson) };
    }
    const input = await readInput(request, url);
    if (!input.ok)
        return { response: json({ ok: false, error: input.error }, 400) };
    const result = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
    if (!result.ok)
        return { response: json(result, 400), targetUrl: input.value.url };
    return { response: badgeResponse(result.score, wantJson), targetUrl: input.value.url };
}
function badgeResponse(score, wantJson) {
    if (wantJson) {
        return json(shieldsEndpoint(score));
    }
    return new Response(badgeSvg(score), {
        headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
    });
}
async function readInput(request, url) {
    if (request.method === "GET") {
        const target = url.searchParams.get("url") || url.searchParams.get("spec");
        if (!target)
            return { ok: false, error: "Provide ?url= to an OpenAPI document or API/docs site." };
        if (!isHttpUrl(target))
            return { ok: false, error: URL_ERROR };
        return { ok: true, value: { url: target } };
    }
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        let body;
        try {
            body = (await request.json());
        }
        catch {
            return { ok: false, error: "Invalid JSON body." };
        }
        const specText = body.specText ?? body.spec;
        if (specText && specText.length > MAX_SPEC_CHARS) {
            return { ok: false, error: `Spec is too large (max ${MAX_SPEC_CHARS} characters).` };
        }
        if (specText && specText.trim())
            return { ok: true, value: { specText, sourceLabel: "pasted spec" } };
        if (body.url) {
            if (!isHttpUrl(body.url))
                return { ok: false, error: URL_ERROR };
            return { ok: true, value: { url: String(body.url).trim() } };
        }
        return { ok: false, error: "JSON body must include `url` or `spec`." };
    }
    const text = await request.text();
    if (text.length > MAX_SPEC_CHARS)
        return { ok: false, error: `Spec is too large (max ${MAX_SPEC_CHARS} characters).` };
    if (/^https?:\/\//i.test(text.trim()) && !text.includes("\n")) {
        return { ok: true, value: { url: text.trim() } };
    }
    if (text.trim())
        return { ok: true, value: { specText: text, sourceLabel: "pasted spec" } };
    return { ok: false, error: "Provide a `url` or an OpenAPI document." };
}
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
}
function withSecurityHeaders(res) {
    const headers = new Headers(res.headers);
    if (!headers.has("x-content-type-options"))
        headers.set("x-content-type-options", "nosniff");
    if (/text\/html/i.test(headers.get("content-type") || "")) {
        headers.set("referrer-policy", "strict-origin-when-cross-origin");
        headers.set("x-frame-options", "DENY");
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
function cors(res) {
    const headers = new Headers(res.headers);
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type, accept");
    return new Response(res.body, { status: res.status, headers });
}
/** Used when assets are not bound (unit tests). The real landing lives in worker/public/index.html. */
export const LANDING_FALLBACK = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Agent-Ready Score</title></head><body><p>Agent-Ready Score — paste an OpenAPI spec or URL. Pro coming soon.</p></body></html>`;
// Keep formatReport referenced so tree-shaking in tests doesn't confuse typings.
void formatReport;
