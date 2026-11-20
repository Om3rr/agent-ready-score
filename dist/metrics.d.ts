export declare const WORKER_TZ = "Asia/Jerusalem";
export interface MetricsDB {
    prepare(sql: string): {
        bind(...args: unknown[]): {
            run(): Promise<{
                success?: boolean;
                meta?: {
                    changes?: number;
                };
            }>;
            first<T = Record<string, unknown>>(): Promise<T | null>;
            all<T = Record<string, unknown>>(): Promise<{
                results: T[];
            }>;
        };
    };
}
export interface MetricsEnv {
    METRICS?: MetricsDB;
}
export type ScanOutcome = "success" | "fail" | null;
export interface TrackOptions {
    worker: string;
    route: string;
    scan?: ScanOutcome;
    badge?: boolean;
    skip?: boolean;
    /** Target URL of a scan, used to classify "outside scans". */
    targetUrl?: string;
    events?: string[];
    /** Optional ref, including utm:source/medium/campaign stored as-is. */
    ref?: string;
}
export declare function israelDay(now?: Date): string;
export declare function israelNowIso(now?: Date): string;
export declare const AI_CRAWLERS: Array<{
    name: string;
    re: RegExp;
}>;
export type TrafficClass = "human" | "bot" | "ai_crawler" | "internal";
export declare function aiCrawlerName(ua: string): string | null;
export declare function isInternalRequest(request: Request): boolean;
export declare function classifyTraffic(request: Request): {
    class: TrafficClass;
    crawler?: string;
};
export declare function isBot(request: Request): boolean;
export declare function bucketRoute(pathname: string): string;
export declare function shouldSkipRoute(route: string): boolean;
/** Store utm:source/medium/campaign as-is; otherwise keep only the referrer host. */
export declare function normalizeRef(raw?: string | null): string | null;
export declare function referrerHost(request: Request, override?: string | null): string | null;
export declare function visitorHash(salt: string, ip: string, ua: string): Promise<string>;
export declare const ALLOWED_EVENTS: readonly ["landing_view", "scan_started", "scan_completed", "scan_failed", "badge_copied", "action_install_click", "pro_waitlist_signup", "price_click"];
export type AllowedEvent = (typeof ALLOWED_EVENTS)[number];
export declare function pepperedIpHash(ip: string): Promise<string>;
export declare function targetHostOf(url?: string | null): string | null;
export declare function isOutsideScan(request: Request, targetUrl?: string | null): Promise<boolean>;
/** Record one request. Fail-open: throws are swallowed by scheduleTrack. Never stores raw IPs. */
export declare function recordVisit(env: MetricsEnv, request: Request, opts: TrackOptions): Promise<void>;
export declare function scheduleTrack(ctx: {
    waitUntil?: (p: Promise<unknown>) => void;
} | undefined, env: MetricsEnv, request: Request, opts: TrackOptions): void;
export interface StatsPayload {
    ok: true;
    worker: string;
    timezone: string;
    generated_at: string;
    window_days: number;
    totals: {
        requests: number;
        unique_visitors: number;
        scans: {
            success: number;
            fail: number;
        };
        badge_hits: number;
        waitlist_signups: number;
        outside_scans: number;
        events: Record<string, number>;
        internal_hits: number;
        ai_crawlers: Record<string, number>;
        price_click_tiers: Record<string, number>;
    };
    daily: Array<{
        day: string;
        requests: number;
        unique_visitors: number;
        scans_success: number;
        scans_fail: number;
        badge_hits: number;
        outside_scans: number;
    }>;
    routes: Array<{
        route: string;
        count: number;
    }>;
    top_referrers: Array<{
        host: string;
        count: number;
    }>;
}
export declare function readStats(env: MetricsEnv, worker: string): Promise<StatsPayload>;
export declare function statsJsonResponse(data: StatsPayload): Response;
export declare function statsHtmlResponse(data: StatsPayload, title: string): Response;
export declare function handleStats(env: MetricsEnv, worker: string, path: string, title: string): Promise<Response>;
/** POST /api/event — for navigator.sendBeacon and small CTA pings. Rejects unknown events. */
export declare function handleEvent(request: Request, env: MetricsEnv, worker: string): Promise<Response>;
/** POST /api/waitlist — private email capture. Emails never appear in /stats. */
export declare function handleWaitlist(request: Request, env: MetricsEnv, worker: string): Promise<Response>;
