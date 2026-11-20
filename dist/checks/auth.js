import { securitySchemes } from "../openapi.js";
export function checkAuth(doc, ops) {
    const schemes = securitySchemes(doc);
    const schemeEntries = Object.entries(schemes);
    const globalSec = Array.isArray(doc.security) ? doc.security : undefined;
    const applied = ops.filter((op) => securityFor(op, globalSec) !== undefined).length;
    const explicitPublic = ops.filter((op) => {
        const sec = securityFor(op, globalSec);
        return Array.isArray(sec) && sec.length === 0;
    }).length;
    const required = ops.filter((op) => {
        const sec = securityFor(op, globalSec);
        return Array.isArray(sec) && sec.some((req) => Object.keys(req).length > 0);
    }).length;
    const oauth = schemeEntries.filter(([, s]) => isOAuth(s));
    const bearerOrApiKey = schemeEntries.filter(([, s]) => isBearerOrApiKey(s));
    const scopesDeclared = oauth.some(([, s]) => Object.keys(collectScopes(s)).length > 0);
    const scopesUsed = ops.some((op) => {
        const sec = securityFor(op, globalSec) || [];
        return sec.some((req) => Object.values(req).some((arr) => Array.isArray(arr) && arr.length > 0));
    });
    const schemeCount = schemeEntries.length;
    const schemesCheck = {
        id: "auth.schemes",
        category: "auth",
        status: schemeCount > 0 ? "pass" : explicitPublic === ops.length && ops.length > 0 ? "warn" : "fail",
        score: schemeCount > 0 ? 1 : explicitPublic === ops.length && ops.length > 0 ? 0.5 : 0,
        weight: 30,
        title: schemeCount > 0
            ? `Declares ${schemeCount} security scheme${schemeCount === 1 ? "" : "s"}`
            : explicitPublic === ops.length && ops.length > 0
                ? "API is declared public (empty security), with no security schemes"
                : "No security schemes are declared",
        detail: schemeCount > 0 ? schemeEntries.map(([n, s]) => `${n} (${s.type || "unknown"})`).join(", ") : "components.securitySchemes is empty.",
        fix: schemeCount > 0
            ? ""
            : "Declare security schemes under components.securitySchemes. If the API is public, set `security: []` and still document how agents should identify themselves when you add auth later.",
    };
    const appliedRatio = ops.length ? (required + explicitPublic) / ops.length : 0;
    const appliedCheck = {
        id: "auth.applied",
        category: "auth",
        status: !ops.length ? "fail" : appliedRatio >= 0.9 ? "pass" : appliedRatio >= 0.4 ? "warn" : "fail",
        score: appliedRatio,
        weight: 25,
        title: appliedRatio >= 0.9
            ? "Security requirements are applied to operations"
            : "Many operations have no security requirement",
        detail: `${required} operations require auth, ${explicitPublic} are explicit public, ${ops.length - applied} inherit nothing.`,
        fix: appliedRatio >= 0.9
            ? ""
            : "Set a top-level `security` requirement, or add `security` on each operation. Use `security: []` for the ones that are intentionally public.",
    };
    let oauthStatus = "fail";
    let oauthScore = 0;
    let oauthTitle = "No OAuth 2.0 or OpenID Connect scheme";
    let oauthFix = "Add an OAuth 2.0 or OpenID Connect security scheme so agents can obtain scoped, revocable tokens instead of long-lived keys.";
    if (oauth.length) {
        oauthStatus = "pass";
        oauthScore = 1;
        oauthTitle = `OAuth / OIDC scheme declared (${oauth.map(([n]) => n).join(", ")})`;
        oauthFix = "";
    }
    else if (bearerOrApiKey.length) {
        oauthStatus = "warn";
        oauthScore = 0.55;
        oauthTitle = `Uses ${bearerOrApiKey.map(([, s]) => s.type === "http" ? (s.scheme || "http") : s.type).join(", ")} but not OAuth or OIDC`;
        oauthFix = "Prefer OAuth 2.0 or OpenID Connect with short-lived tokens. If a bearer or API key is required, document how agents obtain and rotate it.";
    }
    const oauthCheck = {
        id: "auth.oauth",
        category: "auth",
        status: oauthStatus,
        score: oauthScore,
        weight: 25,
        title: oauthTitle,
        detail: schemeCount ? schemeEntries.map(([n, s]) => `${n}: ${s.type}${s.scheme ? ` ${s.scheme}` : ""}`).join("; ") : "No schemes.",
        fix: oauthFix,
    };
    let scopeStatus = "fail";
    let scopeScore = 0;
    let scopeTitle = "No OAuth scopes declared or applied";
    let scopeFix = "Define scopes on the OAuth flows and list the required scopes on each operation so agents request only what they need.";
    if (scopesDeclared && scopesUsed) {
        scopeStatus = "pass";
        scopeScore = 1;
        scopeTitle = "OAuth scopes are declared and applied";
        scopeFix = "";
    }
    else if (scopesDeclared || scopesUsed) {
        scopeStatus = "warn";
        scopeScore = 0.5;
        scopeTitle = scopesDeclared ? "Scopes are declared but not applied to operations" : "Operations list scopes, but the scheme does not declare them";
    }
    else if (!oauth.length && (schemeCount > 0 || explicitPublic === ops.length)) {
        scopeStatus = "warn";
        scopeScore = 0.35;
        scopeTitle = "No scopes (no OAuth scheme)";
        scopeFix = "When you add OAuth, declare fine-grained scopes and apply them per operation.";
    }
    const scopesCheck = {
        id: "auth.scopes",
        category: "auth",
        status: scopeStatus,
        score: scopeScore,
        weight: 20,
        title: scopeTitle,
        detail: scopesDeclared ? "At least one OAuth scheme lists scopes." : "No scopes found on schemes or operations.",
        fix: scopeFix,
    };
    return [schemesCheck, appliedCheck, oauthCheck, scopesCheck];
}
function securityFor(op, globalSec) {
    if (op.security !== undefined)
        return op.security;
    return globalSec;
}
function isOAuth(s) {
    const t = (s.type || "").toLowerCase();
    return t === "oauth2" || t === "openIdConnect" || t === "openidconnect";
}
function isBearerOrApiKey(s) {
    const t = (s.type || "").toLowerCase();
    if (t === "apikey")
        return true;
    if (t === "http" && (s.scheme || "").toLowerCase() === "bearer")
        return true;
    if (t === "basic" || (t === "http" && (s.scheme || "").toLowerCase() === "basic"))
        return true;
    return false;
}
function collectScopes(s) {
    const out = { ...(s.scopes || {}) };
    if (s.flows) {
        for (const flow of Object.values(s.flows)) {
            Object.assign(out, flow.scopes || {});
        }
    }
    return out;
}
