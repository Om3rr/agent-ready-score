import type { DiscoveryProbe, DiscoveryResult, FetchLike } from "./types.js";
import { isOpenAPIDoc, originOf, parseSpec, type OpenAPIDoc } from "./openapi.js";

export const DEFAULT_USER_AGENT = "agent-ready-score/0.1 (+https://github.com/Om3rr/agent-ready-score)";

export const WELL_KNOWN_PATHS = [
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/.well-known/api-catalog",
  "/.well-known/ai-plugin.json",
  "/.well-known/agent.json",
] as const;

export const OPENAPI_CANDIDATE_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/openapi.yml",
  "/swagger.json",
  "/swagger.yaml",
  "/api-docs",
  "/api/openapi.json",
  "/v1/openapi.json",
  "/.well-known/openapi.json",
  "/.well-known/openapi.yaml",
] as const;

const DISCOVERY_PATHS = ["/llms.txt", "/llms-full.txt", "/robots.txt", ...WELL_KNOWN_PATHS, ...OPENAPI_CANDIDATE_PATHS];

export interface LoadSpecResult {
  doc: OpenAPIDoc;
  text: string;
  url: string | null;
  discoveredFrom: string | null;
  contentType: string;
}

export async function fetchText(
  url: string,
  fetchImpl: FetchLike,
  opts: { timeoutMs: number; userAgent: string; accept?: string },
): Promise<{ ok: boolean; status: number; contentType: string; body: string }> {
  const res = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": opts.userAgent,
      accept: opts.accept || "application/json, application/yaml, text/yaml, text/plain, text/markdown, */*",
    },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  return { ok: res.ok, status: res.status, contentType, body };
}

export function looksLikeSpecUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    return /\.(json|yaml|yml)$/.test(p) || /openapi|swagger|api-docs/.test(p);
  } catch {
    return false;
  }
}

export function looksLikeHtml(contentType: string, body: string): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  const head = body.slice(0, 256).trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

/** Pull likely OpenAPI URLs out of an HTML docs page (Swagger UI, Redoc, link tags). */
export function extractSpecUrlsFromHtml(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    try {
      found.add(new URL(raw.trim(), baseUrl).href);
    } catch {
      /* ignore */
    }
  };
  const patterns = [
    /url:\s*["']([^"']+)["']/gi,
    /spec-url=["']([^"']+)["']/gi,
    /specurl["']?\s*[:=]\s*["']([^"']+)["']/gi,
    /href=["']([^"']*(?:openapi|swagger)[^"']*\.(?:json|ya?ml))["']/gi,
    /href=["']([^"']+\/(?:openapi|swagger)\.(?:json|ya?ml))["']/gi,
    /rel=["'](?:service-doc|describedby|alternate)["'][^>]*href=["']([^"']+)["']/gi,
    /href=["']([^"']+)["'][^>]*rel=["'](?:service-doc|describedby|alternate)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) add(m[1]);
  }
  return [...found].slice(0, 8);
}

export async function loadSpecFromUrl(
  url: string,
  fetchImpl: FetchLike,
  opts: { timeoutMs: number; userAgent: string },
): Promise<LoadSpecResult> {
  const first = await fetchText(url, fetchImpl, opts);
  if (first.ok) {
    if (!looksLikeHtml(first.contentType, first.body)) {
      try {
        const doc = parseSpec(first.body);
        return { doc, text: first.body, url, discoveredFrom: null, contentType: first.contentType };
      } catch {
        // Not a spec. Fall through to HTML / origin discovery.
      }
    } else {
      const extracted = extractSpecUrlsFromHtml(first.body, url);
      for (const candidate of extracted) {
        try {
          const r = await fetchText(candidate, fetchImpl, opts);
          if (!r.ok) continue;
          const doc = parseSpec(r.body);
          return { doc, text: r.body, url: candidate, discoveredFrom: url, contentType: r.contentType };
        } catch {
          /* try next */
        }
      }
    }
  }

  const origin = originOf(url);
  if (origin) {
    for (const path of OPENAPI_CANDIDATE_PATHS) {
      const candidate = origin + path;
      if (candidate === url) continue;
      try {
        const r = await fetchText(candidate, fetchImpl, { ...opts, timeoutMs: Math.min(opts.timeoutMs, 8000) });
        if (!r.ok) continue;
        const doc = parseSpec(r.body);
        return { doc, text: r.body, url: candidate, discoveredFrom: url, contentType: r.contentType };
      } catch {
        /* try next */
      }
    }
  }

  if (!first.ok) {
    throw new Error(`Could not fetch ${url} (HTTP ${first.status}).`);
  }
  throw new Error(`No OpenAPI or Swagger document was found at ${url}. Pass a spec URL or file, or host the spec at /openapi.json.`);
}

export async function probeOrigin(
  origin: string,
  fetchImpl: FetchLike,
  opts: { timeoutMs: number; userAgent: string },
): Promise<DiscoveryProbe[]> {
  const timeoutMs = Math.min(opts.timeoutMs, 6000);
  const probes: DiscoveryProbe[] = [];
  const chunks: string[][] = [];
  const size = 6;
  for (let i = 0; i < DISCOVERY_PATHS.length; i += size) {
    chunks.push(DISCOVERY_PATHS.slice(i, i + size));
  }
  for (const group of chunks) {
    const batch = await Promise.all(
      group.map(async (path) => {
        const target = origin + path;
        try {
          const r = await fetchText(target, fetchImpl, { ...opts, timeoutMs, accept: "text/plain, application/json, */*" });
          return {
            path,
            url: target,
            ok: r.ok,
            status: r.status,
            contentType: r.contentType,
            snippet: r.ok ? snippet(r.body, r.contentType) : "",
          } satisfies DiscoveryProbe;
        } catch {
          return { path, url: target, ok: false, status: null, contentType: "", snippet: "" } satisfies DiscoveryProbe;
        }
      }),
    );
    probes.push(...batch);
  }
  return probes;
}

function snippet(body: string, contentType: string): string {
  if (looksLikeHtml(contentType, body)) return "";
  return body.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function emptyDiscovery(partial: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    origin: null,
    probes: [],
    specSource: "text",
    specUrl: null,
    openapiFound: false,
    ...partial,
  };
}

export function probeOf(probes: DiscoveryProbe[], path: string): DiscoveryProbe | undefined {
  return probes.find((p) => p.path === path);
}

export function isUsableTextFile(probe: DiscoveryProbe | undefined): boolean {
  if (!probe?.ok) return false;
  if (looksLikeHtml(probe.contentType, probe.snippet)) return false;
  return probe.snippet.length > 0 || /text\/plain|text\/markdown|application\/json/i.test(probe.contentType);
}

export function isLlmsTxt(probe: DiscoveryProbe | undefined): boolean {
  if (!isUsableTextFile(probe) || !probe) return false;
  const s = probe.snippet;
  return s.startsWith("#") || s.startsWith(">") || /\[.+\]\(.+\)/.test(s) || s.toLowerCase().includes("llms");
}

export const AI_CRAWLER_TOKENS = [
  "gptbot",
  "chatgpt-user",
  "google-extended",
  "anthropic-ai",
  "claudebot",
  "claude-web",
  "perplexitybot",
  "bytespider",
  "ccbot",
  "applebot-extended",
  "cohere-ai",
  "facebookbot",
  "meta-externalagent",
  "amazonbot",
  "llms.txt",
];

export function robotsMentionsAi(snippetText: string): boolean {
  const s = snippetText.toLowerCase();
  return AI_CRAWLER_TOKENS.some((t) => s.includes(t));
}
