import type { CheckResult } from "../types.js";
import { type NormalizedOperation, type OpenAPIDoc } from "../openapi.js";
export declare function checkAuth(doc: OpenAPIDoc, ops: NormalizedOperation[]): CheckResult[];
