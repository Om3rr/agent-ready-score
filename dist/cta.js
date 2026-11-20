/**
 * First-party CTA measurement for the landing and score pages (see MEASUREMENT.md).
 * - POST /api/event     browser CTA events (allow-listed), no cookies, no IP, no email.
 * - POST /api/waitlist  free Pro waitlist (KV). No payment.
 * - logEvent()          server-side funnel events (scan_completed, scan_failed, badge_served, waitlist_signup).
 * Writes to Workers Analytics Engine when EVENTS is bound and always to Workers Logs (console.log).
 * Complements route/visitor counts from studio metrics; it never blocks or fails a request.
 */
/** Events the browser may send. Funnel truth events are server-only so they cannot be forged. */
export const CLIENT_EVENTS = new Set([
    "page_view",
    "scan_started",
    "badge_copied",
    "action_install_click",
    "cli_copy",
    "waitlist_view",
    "waitlist_submit",
    "score_page_view",
    "outbound_repo_click",
]);
export const SERVER_EVENTS = new Set(["scan_completed", "scan_failed", "badge_served", "waitlist_signup"]);
const clip = (v, n = 80) => (typeof v === "string" ? v.slice(0, n) : "");
export function logEvent(env, e, product = "agent-ready-score") {
    const row = {
        event: clip(e.event, 40),
        product,
        path: clip(e.path, 120),
        ref: clip(e.ref, 80),
        utm_source: clip(e.utm_source),
        utm_medium: clip(e.utm_medium),
        utm_campaign: clip(e.utm_campaign),
        utm_content: clip(e.utm_content),
        label: clip(e.label, 120),
        country: clip(e.country, 4),
        value: typeof e.value === "number" && Number.isFinite(e.value) ? e.value : 0,
        origin: e.server ? "server" : "client",
    };
    console.log("cta_event", JSON.stringify(row));
    try {
        env.EVENTS?.writeDataPoint({
            indexes: [row.event],
            blobs: [row.event, row.product, row.path, row.ref, row.utm_source, row.utm_medium, row.utm_campaign, row.utm_content, row.label, row.country, row.origin],
            doubles: [row.value],
        });
    }
    catch {
        /* analytics must never break a request */
    }
}
export function hostOf(u) {
    if (!u)
        return "";
    try {
        return new URL(u).hostname;
    }
    catch {
        return "invalid-url";
    }
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export async function handleEvent(request, env) {
    let body;
    try {
        const text = await request.text();
        if (text.length > 4000)
            return json({ ok: false, error: "too large" }, 413);
        body = JSON.parse(text);
    }
    catch {
        return json({ ok: false, error: "Invalid JSON body." }, 400);
    }
    if (!CLIENT_EVENTS.has(String(body.event)))
        return json({ ok: false, error: "unknown event" }, 400);
    const country = request.cf?.country;
    logEvent(env, { ...body, country, server: false });
    return new Response(null, { status: 204 });
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export async function handleWaitlist(request, env) {
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return json({ ok: false, error: "Invalid JSON body." }, 400);
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email))
        return json({ ok: false, error: "Enter a valid email." }, 400);
    if (!env.WAITLIST)
        return json({ ok: false, error: "The waitlist is not open yet." }, 503);
    const key = `waitlist:pro:${email}`;
    const existing = await env.WAITLIST.get(key);
    if (!existing) {
        await env.WAITLIST.put(key, JSON.stringify({
            at: new Date().toISOString(),
            plan: clip(body.plan, 20) || "pro",
            utm_source: clip(body.utm_source),
            utm_medium: clip(body.utm_medium),
            utm_campaign: clip(body.utm_campaign),
        }));
        // The email itself is never logged or sent to Analytics Engine.
        logEvent(env, { event: "waitlist_signup", path: "/api/waitlist", utm_source: body.utm_source, utm_medium: body.utm_medium, utm_campaign: body.utm_campaign, server: true });
    }
    return json({ ok: true, already: Boolean(existing) });
}
