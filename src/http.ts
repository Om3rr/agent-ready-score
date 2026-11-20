import { badgeSvg, formatReport, scoreSource, shieldsEndpoint, type ScoreResult } from "./index.js";
import { isHttpUrl } from "./escape.js";
import { bucketRoute, handleStats, scheduleTrack, type MetricsDB } from "./metrics.js";

const WORKER_NAME = "agent-ready-score";

export interface Env {
  ASSETS?: { fetch: typeof fetch };
  METRICS?: MetricsDB;
}

type ExecutionCtx = { waitUntil?: (p: Promise<unknown>) => void };

const URL_ERROR = "Only absolute http(s) URLs are supported.";
const MAX_SPEC_CHARS = 2_000_000;
const TIMEOUT_MS = 20000;

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionCtx): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};

export async function handleRequest(request: Request, env: Env = {}, ctx?: ExecutionCtx): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/stats" || path === "/stats.json" || path === "/stats.html") {
    if (request.method === "GET" || request.method === "HEAD") {
      return handleStats(env, WORKER_NAME, path === "/stats.json" ? "/stats" : path, "Agent-Ready Score");
    }
  }

  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  let response: Response;
  let scan: "success" | "fail" | null = null;
  let badge = false;
  try {
    if (path === "/api/score" && (request.method === "POST" || request.method === "GET")) {
      response = cors(await handleScore(request, url));
      scan = response.ok ? "success" : "fail";
    } else if (path === "/badge" || path === "/badge.json" || path === "/badge.svg") {
      response = cors(await handleBadge(request, url, path));
      badge = true;
      if (url.searchParams.get("url") || url.searchParams.get("spec")) {
        scan = response.ok ? "success" : "fail";
      }
    } else if (env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) response = asset;
      else if (request.method === "GET" && (path === "/" || path === "/index.html")) {
        response = new Response(LANDING_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
      } else {
        response = new Response("Not found", { status: 404 });
      }
    } else if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      response = new Response(LANDING_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
    } else {
      response = new Response("Not found", { status: 404 });
    }
  } catch (e) {
    console.error("agent-ready-score error", { path, message: (e as Error).message });
    response = cors(json({ ok: false, error: (e as Error).message || "Internal error" }, 500));
    if (path === "/api/score" || path.startsWith("/badge")) scan = "fail";
  }

  response = withSecurityHeaders(response);
  scheduleTrack(ctx, env, request, { worker: WORKER_NAME, route: bucketRoute(path), scan, badge });
  return response;
}

async function handleScore(request: Request, url: URL): Promise<Response> {
  const input = await readInput(request, url);
  if (!input.ok) return json({ ok: false, error: input.error }, 400);
  const result = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
  const status = result.ok ? 200 : 400;
  return json(result, status);
}

async function handleBadge(request: Request, url: URL, path: string): Promise<Response> {
  const wantJson =
    path.endsWith(".json") ||
    url.searchParams.get("format") === "json" ||
    (request.headers.get("accept") || "").includes("application/json");

  const scoreParam = url.searchParams.get("score");
  if (scoreParam != null && scoreParam !== "") {
    const score = Number(scoreParam);
    if (Number.isNaN(score)) return json({ ok: false, error: "score must be a number" }, 400);
    return badgeResponse(score, wantJson);
  }

  const input = await readInput(request, url);
  if (!input.ok) return json({ ok: false, error: input.error }, 400);
  const result: ScoreResult = await scoreSource(input.value, { timeoutMs: TIMEOUT_MS });
  if (!result.ok) return json(result, 400);
  return badgeResponse(result.score, wantJson);
}

function badgeResponse(score: number, wantJson: boolean): Response {
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

async function readInput(
  request: Request,
  url: URL,
): Promise<{ ok: true; value: { url?: string; specText?: string; sourceLabel?: string } } | { ok: false; error: string }> {
  if (request.method === "GET") {
    const target = url.searchParams.get("url") || url.searchParams.get("spec");
    if (!target) return { ok: false, error: "Provide ?url= to an OpenAPI document or API/docs site." };
    if (!isHttpUrl(target)) return { ok: false, error: URL_ERROR };
    return { ok: true, value: { url: target } };
  }
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let body: { url?: string; spec?: string; specText?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return { ok: false, error: "Invalid JSON body." };
    }
    const specText = body.specText ?? body.spec;
    if (specText && specText.length > MAX_SPEC_CHARS) {
      return { ok: false, error: `Spec is too large (max ${MAX_SPEC_CHARS} characters).` };
    }
    if (specText && specText.trim()) return { ok: true, value: { specText, sourceLabel: "pasted spec" } };
    if (body.url) {
      if (!isHttpUrl(body.url)) return { ok: false, error: URL_ERROR };
      return { ok: true, value: { url: String(body.url).trim() } };
    }
    return { ok: false, error: "JSON body must include `url` or `spec`." };
  }
  const text = await request.text();
  if (text.length > MAX_SPEC_CHARS) return { ok: false, error: `Spec is too large (max ${MAX_SPEC_CHARS} characters).` };
  if (/^https?:\/\//i.test(text.trim()) && !text.includes("\n")) {
    return { ok: true, value: { url: text.trim() } };
  }
  if (text.trim()) return { ok: true, value: { specText: text, sourceLabel: "pasted spec" } };
  return { ok: false, error: "Provide a `url` or an OpenAPI document." };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  if (!headers.has("x-content-type-options")) headers.set("x-content-type-options", "nosniff");
  if (/text\/html/i.test(headers.get("content-type") || "")) {
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("x-frame-options", "DENY");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function cors(res: Response): Response {
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
