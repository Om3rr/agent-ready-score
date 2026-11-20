/**
 * First-party CTA measurement for the landing and score pages (see MEASUREMENT.md).
 * - POST /api/event     browser CTA events (allow-listed), no cookies, no IP, no email.
 * - POST /api/waitlist  free Pro waitlist (KV). No payment.
 * - logEvent()          server-side funnel events (scan_completed, scan_failed, badge_served, waitlist_signup).
 * Writes to Workers Analytics Engine when EVENTS is bound and always to Workers Logs (console.log).
 * Complements route/visitor counts from studio metrics; it never blocks or fails a request.
 */
export interface CtaEnv {
    EVENTS?: {
        writeDataPoint(p: {
            blobs?: string[];
            doubles?: number[];
            indexes?: string[];
        }): void;
    };
    WAITLIST?: {
        put(key: string, value: string): Promise<void>;
        get(key: string): Promise<string | null>;
    };
}
/** Events the browser may send. Funnel truth events are server-only so they cannot be forged. */
export declare const CLIENT_EVENTS: Set<string>;
export declare const SERVER_EVENTS: Set<string>;
export declare function logEvent(env: CtaEnv, e: Record<string, unknown>, product?: string): void;
export declare function hostOf(u: string | undefined): string;
export declare function handleEvent(request: Request, env: CtaEnv): Promise<Response>;
export declare function handleWaitlist(request: Request, env: CtaEnv): Promise<Response>;
