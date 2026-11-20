import type { CheckResult } from "../types.js";
import { type NormalizedOperation, type OpenAPIDoc } from "../openapi.js";
export declare function checkDocs(doc: OpenAPIDoc, ops: NormalizedOperation[]): CheckResult[];
