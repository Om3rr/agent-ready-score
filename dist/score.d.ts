import type { CategoryId, CheckResult, DiscoveryResult, Report } from "./types.js";
import { type OpenAPIDoc } from "./openapi.js";
export declare const VERSION = "0.1.0";
export declare const CATEGORY_META: Array<{
    id: CategoryId;
    label: string;
    weight: number;
}>;
export declare function scoreDocument(doc: OpenAPIDoc, discovery: DiscoveryResult, opts?: {
    source: string;
    now?: Date;
}): Report;
/** Weighted average of non-skipped checks, scaled to 0-100. */
export declare function categoryScore(checks: CheckResult[]): number | null;
export declare function clamp01(n: number): number;
export declare function formatReport(report: Report): string;
