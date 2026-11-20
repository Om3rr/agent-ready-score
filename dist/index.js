import { originOf, parseSpec, serverOrigin, SpecParseError } from "./openapi.js";
import { DEFAULT_USER_AGENT, emptyDiscovery, loadSpecFromUrl, probeOrigin, } from "./discover.js";
import { scoreDocument } from "./score.js";
export { parseSpec, SpecParseError, operations, specTitle, specVersion } from "./openapi.js";
export { scoreDocument, formatReport, categoryScore, VERSION, CATEGORY_META } from "./score.js";
export { shieldsEndpoint, badgeSvg, scoreColor, scoreHex } from "./badge.js";
export { toolListCost, estimateTokens } from "./tokens.js";
export { checkDiscoverability } from "./checks/discoverability.js";
export { checkDocs } from "./checks/docs.js";
export { checkErrors } from "./checks/errors.js";
export { checkAuth } from "./checks/auth.js";
export { checkMcpWrap, tokenBudgetScore } from "./checks/mcp.js";
/**
 * Score an OpenAPI document from a URL, a local file, or raw text.
 * Discovery probes (llms.txt, well-known, robots.txt) run against the API origin
 * when one can be determined, unless `skipDiscovery` is set.
 */
export async function scoreSource(input, opts = {}) {
    const fetchImpl = opts.fetch ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 20000;
    const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    const now = opts.now ?? new Date();
    try {
        let doc;
        let source;
        let specUrl = null;
        let specSource = "text";
        let hintOrigin = opts.origin ? originOf(opts.origin) || opts.origin : null;
        if (input.specText != null && input.specText.trim() !== "") {
            doc = parseSpec(input.specText);
            source = input.sourceLabel || "pasted spec";
            specSource = "text";
        }
        else if (input.specText == null && input.filePath) {
            return {
                ok: false,
                error: "filePath is only supported in the Node CLI or Action, which reads the file and passes specText. Pass the file contents as specText in the browser or Worker.",
                source: input.filePath,
            };
        }
        else if (input.url) {
            const loaded = await loadSpecFromUrl(input.url, fetchImpl, { timeoutMs, userAgent });
            doc = loaded.doc;
            specUrl = loaded.url;
            source = loaded.discoveredFrom ? `${loaded.url} (from ${loaded.discoveredFrom})` : loaded.url || input.url;
            specSource = loaded.discoveredFrom ? "discovered" : "url";
            hintOrigin = hintOrigin || originOf(input.url);
        }
        else {
            return { ok: false, error: "Provide a spec URL, a file path, or OpenAPI text." };
        }
        const origin = hintOrigin || serverOrigin(doc);
        let discovery = emptyDiscovery({
            origin,
            specSource,
            specUrl,
            openapiFound: true,
        });
        if (!opts.skipDiscovery && origin) {
            try {
                discovery = {
                    ...discovery,
                    probes: await probeOrigin(origin, fetchImpl, { timeoutMs, userAgent }),
                };
            }
            catch {
                // Probes are best-effort; the spec itself is enough to score the other categories.
            }
        }
        return scoreDocument(doc, discovery, { source, now });
    }
    catch (e) {
        const message = e instanceof SpecParseError ? e.message : e.message || String(e);
        return {
            ok: false,
            error: message,
            source: input.url || input.filePath || input.sourceLabel,
        };
    }
}
