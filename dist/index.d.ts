import type { ScoreInput, ScoreOptions, ScoreResult } from "./types.js";
export { parseSpec, SpecParseError, operations, specTitle, specVersion } from "./openapi.js";
export { scoreDocument, formatReport, categoryScore, VERSION, CATEGORY_META } from "./score.js";
export { escapeHtml, escapeXml, isHttpUrl } from "./escape.js";
export { shieldsEndpoint, badgeSvg, scoreColor, scoreHex } from "./badge.js";
export { toolListCost, estimateTokens } from "./tokens.js";
export { checkDiscoverability } from "./checks/discoverability.js";
export { checkDocs } from "./checks/docs.js";
export { checkErrors } from "./checks/errors.js";
export { checkAuth } from "./checks/auth.js";
export { checkMcpWrap, tokenBudgetScore } from "./checks/mcp.js";
export type { Report, ScoreResult, ScoreError, ScoreInput, ScoreOptions, CheckResult, CategoryScore, Finding, DiscoveryResult, ToolListCost, } from "./types.js";
/**
 * Score an OpenAPI document from a URL, a local file, or raw text.
 * Discovery probes (llms.txt, well-known, robots.txt) run against the API origin
 * when one can be determined, unless `skipDiscovery` is set.
 */
export declare function scoreSource(input: ScoreInput, opts?: ScoreOptions): Promise<ScoreResult>;
