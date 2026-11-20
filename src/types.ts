/** Shared types for the Agent-Ready Score library. */

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export type CategoryId =
  | "discoverability"
  | "docs"
  | "errors"
  | "auth"
  | "mcp";

export interface CheckResult {
  id: string;
  category: CategoryId;
  status: CheckStatus;
  /** 0-1 contribution inside the check (skip is ignored). */
  score: number;
  /** Weight of this check inside its category. */
  weight: number;
  title: string;
  detail: string;
  /** Concrete fix when the check did not fully pass; empty on pass/skip. */
  fix: string;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  /** 0-100, or null if every check in the category was skipped. */
  score: number | null;
  weight: number;
  checks: CheckResult[];
}

export interface Finding {
  id: string;
  category: CategoryId;
  status: "fail" | "warn";
  title: string;
  detail: string;
  fix: string;
}

export interface ToolListCost {
  operations: number;
  tools: number;
  chars: number;
  /** Approximate tokens, using ~4 characters per token. */
  tokens: number;
}

export interface Report {
  ok: true;
  version: string;
  source: string;
  title: string;
  specVersion: string;
  /** Overall score 0-100. */
  score: number;
  categories: CategoryScore[];
  findings: Finding[];
  toolList: ToolListCost;
  sampledAt: string;
}

export interface ScoreError {
  ok: false;
  error: string;
  source?: string;
}

export type ScoreResult = Report | ScoreError;

export interface DiscoveryProbe {
  path: string;
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string;
  /** First ~200 characters of a text body, when useful as evidence. */
  snippet: string;
}

export interface DiscoveryResult {
  /** Origin used for site-level probes (llms.txt, well-known, robots). */
  origin: string | null;
  probes: DiscoveryProbe[];
  /** How the OpenAPI document was obtained. */
  specSource: "url" | "file" | "text" | "discovered";
  specUrl: string | null;
  openapiFound: boolean;
}

export interface FetchLike {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

export interface ScoreOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Skip origin discovery probes (unit tests, or file-only with --no-discover). */
  skipDiscovery?: boolean;
  /** Override the origin used for discovery (defaults to spec servers[0] or the input URL). */
  origin?: string;
  now?: Date;
  userAgent?: string;
}

export interface ScoreInput {
  /** HTTP(S) URL of a spec or an API/docs site. */
  url?: string;
  /** Absolute or relative path to a local spec file (CLI/Action only). */
  filePath?: string;
  /** Raw OpenAPI JSON or YAML text. */
  specText?: string;
  /** Used only for display when scoring raw text. */
  sourceLabel?: string;
}
