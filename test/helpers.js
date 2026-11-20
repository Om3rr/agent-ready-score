import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const dir = dirname(fileURLToPath(import.meta.url));
export const fixture = (name) => readFileSync(join(dir, "fixtures", name), "utf8");

/** Mock fetch that answers from a map of path-or-url -> { status, body, contentType }. */
export function mockFetch(map, opts = {}) {
  const calls = [];
  const fn = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    let key = url;
    try {
      const u = new URL(url);
      if (map[url] == null && map[u.pathname] != null) key = u.pathname;
      if (map[key] == null && map[u.origin + u.pathname] != null) key = u.origin + u.pathname;
    } catch { /* ignore */ }
    const hit = map[key] ?? map["*"];
    if (!hit) {
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    if (hit.error) throw hit.error;
    return new Response(hit.body ?? "", {
      status: hit.status ?? 200,
      headers: { "content-type": hit.contentType || "text/plain; charset=utf-8" },
    });
  };
  fn.calls = calls;
  return fn;
}

export const FULL_DISCOVERY = {
  "/llms.txt": {
    status: 200,
    contentType: "text/plain",
    body: "# Widgets API\n\n> A small API for agents.\n\n- [Docs](https://api.widgets.example/docs.md)\n",
  },
  "/llms-full.txt": { status: 200, contentType: "text/plain", body: "# Full catalog\n" },
  "/robots.txt": {
    status: 200,
    contentType: "text/plain",
    body: "User-agent: GPTBot\nAllow: /\n# See /llms.txt\n",
  },
  "/.well-known/mcp.json": { status: 200, contentType: "application/json", body: '{"mcp":"https://api.widgets.example/mcp"}' },
  "/.well-known/oauth-protected-resource": {
    status: 200,
    contentType: "application/json",
    body: '{"resource":"https://api.widgets.example"}',
  },
  "/.well-known/api-catalog": { status: 200, contentType: "application/json", body: '{"linkset":[]}' },
  "/openapi.json": { status: 200, contentType: "application/json", body: "{}" },
};

export function originMap(origin, paths) {
  const map = {};
  for (const [p, v] of Object.entries(paths)) map[origin + p] = v;
  return map;
}
