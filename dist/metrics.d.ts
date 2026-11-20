/** Privacy-preserving traffic counters for the studio Workers (D1 `studio-metrics`). */
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
}
export declare function israelDay(now?: Date): string;
export declare function israelNowIso(now?: Date): string;
export declare function isBot(request: Request): boolean;
export declare function bucketRoute(pathname: string): string;
export declare function shouldSkipRoute(route: string): boolean;
export declare function referrerHost(request: Request): string | null;
export declare function visitorHash(salt: string, ip: string, ua: string): Promise<string>;
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
    };
    daily: Array<{
        day: string;
        requests: number;
        unique_visitors: number;
        scans_success: number;
        scans_fail: number;
        badge_hits: number;
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
