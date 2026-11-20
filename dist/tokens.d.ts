import type { ToolListCost } from "./types.js";
import type { NormalizedOperation, OpenAPIDoc } from "./openapi.js";
/** Same approximation used by MCP Readiness / ToolSlim: ~4 characters per token. */
export declare const CHARS_PER_TOKEN = 4;
export declare function estimateTokens(text: string): number;
/**
 * Build a compact MCP-style tools list from the OpenAPI operations and
 * estimate how many tokens that list would cost an agent every turn.
 */
export declare function toolListCost(doc: OpenAPIDoc, ops: NormalizedOperation[]): ToolListCost;
export declare function toolName(op: NormalizedOperation): string;
