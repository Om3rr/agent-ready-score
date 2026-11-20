import { isLlmsTxt, isUsableTextFile, probeOf, robotsMentionsAi, WELL_KNOWN_PATHS, OPENAPI_CANDIDATE_PATHS, } from "../discover.js";
export function checkDiscoverability(discovery) {
    const origin = discovery.origin;
    const probes = discovery.probes;
    const skipped = !origin || discovery.probed === false;
    const openapi = {
        id: "discover.openapi",
        category: "discoverability",
        status: discovery.openapiFound ? "pass" : "fail",
        score: discovery.openapiFound ? 1 : 0,
        weight: 30,
        title: discovery.openapiFound ? "OpenAPI document is reachable" : "No reachable OpenAPI document",
        detail: discovery.specUrl
            ? `Spec used: ${discovery.specUrl}`
            : discovery.openapiFound
                ? "A valid OpenAPI or Swagger document was provided."
                : "Agents cannot discover operations without a machine-readable spec.",
        fix: discovery.openapiFound
            ? ""
            : "Publish an OpenAPI 3.x document at a stable URL such as /openapi.json or /.well-known/openapi.json, and link it from your docs.",
    };
    // Extra signal: the origin actually advertises the spec at a conventional path.
    const advertised = probes.some((p) => p.ok && OPENAPI_CANDIDATE_PATHS.includes(p.path));
    if (discovery.openapiFound && origin && advertised) {
        openapi.detail += " Also advertised at a conventional path on the origin.";
    }
    else if (discovery.openapiFound && origin && !advertised && probes.length) {
        openapi.status = "warn";
        openapi.score = 0.7;
        openapi.title = "OpenAPI document found, but not advertised on the origin";
        openapi.fix = `Also serve the spec at ${origin}/openapi.json or ${origin}/.well-known/openapi.json so agents can find it without a bookmark.`;
    }
    const llms = probeOf(probes, "/llms.txt");
    const llmsOk = isLlmsTxt(llms);
    const llmsCheck = skipped
        ? skip("discover.llms_txt", 25, "No origin to probe for /llms.txt", "Pass an API or docs URL, or set servers[0].url in the spec to a public origin, then publish /llms.txt.")
        : {
            id: "discover.llms_txt",
            category: "discoverability",
            status: llmsOk ? "pass" : "fail",
            score: llmsOk ? 1 : 0,
            weight: 25,
            title: llmsOk ? "llms.txt is published" : "No llms.txt at the origin",
            detail: llmsOk && llms ? `${llms.url} — ${llms.snippet.slice(0, 140)}` : origin ? `Looked at ${origin}/llms.txt` : "",
            fix: llmsOk
                ? ""
                : `Publish a short curated map at ${origin}/llms.txt (see https://llmstxt.org) and point it at clean markdown copies of your API docs.`,
        };
    const wellKnownHits = probes.filter((p) => p.ok && WELL_KNOWN_PATHS.includes(p.path));
    const wellKnownScore = skipped ? 0 : Math.min(1, wellKnownHits.length / 2);
    const wellKnownStatus = skipped ? "skip" : wellKnownHits.length >= 2 ? "pass" : wellKnownHits.length === 1 ? "warn" : "fail";
    const wellKnown = skipped
        ? skip("discover.well_known", 25, "No origin to probe for /.well-known entries", "Publish MCP or agent discovery, OAuth protected-resource metadata, or an API catalog under /.well-known/ on your API origin.")
        : {
            id: "discover.well_known",
            category: "discoverability",
            status: wellKnownStatus,
            score: wellKnownScore,
            weight: 25,
            title: wellKnownHits.length >= 2
                ? `Found ${wellKnownHits.length} well-known discovery documents`
                : wellKnownHits.length === 1
                    ? `Found one well-known document (${wellKnownHits[0].path})`
                    : "No well-known MCP, agent, OAuth, or API-catalog documents",
            detail: wellKnownHits.length
                ? wellKnownHits.map((p) => `${p.path} (${p.status})`).join(", ")
                : `Probed ${WELL_KNOWN_PATHS.length} well-known paths on ${origin}.`,
            fix: wellKnownHits.length >= 2
                ? ""
                : `Add machine-readable discovery under ${origin}/.well-known/: for example oauth-protected-resource, mcp.json or an MCP server card, and api-catalog.`,
        };
    const robots = probeOf(probes, "/robots.txt");
    const robotsOk = isUsableTextFile(robots);
    const robotsAi = robotsOk && robotsMentionsAi(robots?.snippet || "");
    let robotsStatus = "fail";
    let robotsScore = 0;
    let robotsTitle = "No robots.txt at the origin";
    let robotsFix = `Add ${origin}/robots.txt and mention /llms.txt or your policy for AI crawlers (GPTBot, ClaudeBot, Google-Extended, and similar).`;
    if (skipped) {
        /* handled below */
    }
    else if (robotsAi) {
        robotsStatus = "pass";
        robotsScore = 1;
        robotsTitle = "robots.txt mentions AI crawlers or llms.txt";
        robotsFix = "";
    }
    else if (robotsOk) {
        robotsStatus = "warn";
        robotsScore = 0.5;
        robotsTitle = "robots.txt exists but has no AI-crawler or llms.txt rules";
        robotsFix = `Update ${origin}/robots.txt with an explicit policy for AI crawlers and a comment pointing at /llms.txt.`;
    }
    const robotsCheck = skipped
        ? skip("discover.robots", 20, "No origin to probe for robots.txt", "Publish robots.txt with an explicit AI-crawler policy and a pointer to /llms.txt.")
        : {
            id: "discover.robots",
            category: "discoverability",
            status: robotsStatus,
            score: robotsScore,
            weight: 20,
            title: robotsTitle,
            detail: robotsOk && robots ? `${robots.url} — ${robots.snippet.slice(0, 140)}` : origin ? `Looked at ${origin}/robots.txt` : "",
            fix: robotsFix,
        };
    return [openapi, llmsCheck, wellKnown, robotsCheck];
}
function skip(id, weight, detail, fix) {
    return {
        id,
        category: "discoverability",
        status: "skip",
        score: 0,
        weight,
        title: "Discovery probe skipped (no public origin)",
        detail,
        fix,
    };
}
