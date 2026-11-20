import type { CheckResult, ToolListCost } from "../types.js";
import { type NormalizedOperation, type OpenAPIDoc } from "../openapi.js";
/** Token-cost scoring: full marks at or below LOW, zero at or above HIGH. */
export declare const TOKEN_FULL = 4000;
export declare const TOKEN_ZERO = 40000;
export declare function checkMcpWrap(_doc: OpenAPIDoc, ops: NormalizedOperation[], cost: ToolListCost): CheckResult[];
export declare function tokenBudgetScore(tokens: number): number;
