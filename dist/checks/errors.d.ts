import type { CheckResult } from "../types.js";
import { type NormalizedOperation, type OpenAPIDoc } from "../openapi.js";
export declare function checkErrors(doc: OpenAPIDoc, ops: NormalizedOperation[]): CheckResult[];
