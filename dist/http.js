import { badgeSvg, formatReport, scoreSource, shieldsEndpoint } from "./index.js";
const MAX_SPEC_CHARS = 2_000_000;
const TIMEOUT_MS = 20000;
export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    },
};
export async function handleRequest(request, env = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS")
        return cors(new Response(null, { status: 204 }));
    try {
        if (path === "/api/score" && (request.method === "POST" || request.method === "GET")) {
            return cors(await handleScore(request, url));
        }
        if (path === "/badge" || path === "/badge.json" || path === "/badge.svg") {
            return cors(await handleBadge(request, url, path));
        }
    }
    catch (e) {
        console.error("agent-ready-score error", { path, message: e.message });
        return cors(json({ ok: false, error: e.message || "Internal error" }, 500));
    }
    if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404)
            return asset;
    }
    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
        return new Response(LANDING_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
}
async function handleScore(request, url) {
    const input = await readInput(request, url);
    if (!input.ok)
        return json({ ok: false, error: input.error }, 400);
    const result = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
    const status = result.ok ? 200 : 400;
    return json(result, status);
}
async function handleBadge(request, url, path) {
    const wantJson = path.endsWith(".json") ||
        url.searchParams.get("format") === "json" ||
        (request.headers.get("accept") || "").includes("application/json");
    const scoreParam = url.searchParams.get("score");
    if (scoreParam != null && scoreParam !== "") {
        const score = Number(scoreParam);
        if (Number.isNaN(score))
            return json({ ok: false, error: "score must be a number" }, 400);
        return badgeResponse(score, wantJson);
    }
    const input = await readInput(request, url);
    if (!input.ok)
        return json({ ok: false, error: input.error }, 400);
    const result = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
    if (!result.ok)
        return json(result, 400);
    return badgeResponse(result.score, wantJson);
}
function badgeResponse(score, wantJson) {
    if (wantJson) {
        return json(shieldsEndpoint(score));
    }
    return new Response(badgeSvg(score), {
        headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=300",
        },
    });
}
async function readInput(request, url) {
    if (request.method === "GET") {
        const target = url.searchParams.get("url") || url.searchParams.get("spec");
        if (!target)
            return { ok: false, error: "Provide ?url= to an OpenAPI document or API/docs site." };
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
        if (body.url)
            return { ok: true, value: { url: body.url } };
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
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
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
