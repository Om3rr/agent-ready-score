# Demand evidence

Verified on 20 November 2026 (Asia/Jerusalem) by fetching the pages below. Only figures and claims that appear in those pages are recorded here. A BusinessWire press release cited in secondary notes was not independently retrieved (the fetch timed out), so it is not used as a source.

## Postman, 2026 State of the API Report

Source: [The 2026 State of the API Report: agents are in production, and most APIs aren't ready](https://blog.postman.com/the-2026-state-of-the-api-report-agents-are-in-production-and-most-apis-arent-ready/)

The post is filed under `/2026/11/` on the Postman blog. The page body retrieved for this file does not include a calendar day, so this document does not assert a specific day of the month.

Confirmed from the page:

- Postman surveyed **8,953** developers, architects and executives.
- **One in four** organizations now run AI agents that use APIs in production.
- **Only 13.2%** say their APIs are fully ready for those agents.
- **36.1%** say their APIs are fully or mostly agent-ready; **13.2%** say fully.
- **38.7%** still design APIs primarily for human developers reading docs; **only 5.6%** design primarily for agents.
- Fully API-first teams are **2.6×** as likely to run agents in production (**43.2%** vs **16.7%**) and **4.1×** as likely to be fully agent-ready (**30.5%** vs **7.5%**). The post states this is association, not cause.
- **37.7%** have not enabled any discovery for agents. **12.2%** say recommendations from AI agents or coding tools are already a top factor in choosing which APIs to use.
- **55.6%** are in production or already experimenting with MCP; **23.8%** are already in production.
- **39.7%** have not addressed how credentials and identity work for agents.
- **44.2%** have dedicated security controls for their APIs, but **only 24.8%** do for agents and **21.6%** for MCP.
- **49.7%** name incomplete or outdated documentation as their top collaboration blocker.

These figures are why the score weights discoverability, docs, predictable errors, auth & identity, and MCP-wrappability equally, and why a public score plus a README badge is the free surface.

## Practitioner guide: get your site agent-ready

Source: [Get your site agent-ready](https://debbie.codes/blog/get-your-site-agent-ready) by Debbie O'Brien, dated **13 November 2026**.

Confirmed from the page:

- Agents fetching HTML pay a large markup tax. On one of the author’s posts (fetched 13 November 2026) the HTML page was **54,791 bytes**, with about **71%** (39,104 bytes) outside the article; the visible words in the article were about **3,121 bytes**. The markdown copy of the same post was **4,023 bytes**, about **7%** of the HTML page.
- A practical pattern: a short map at `/llms.txt`, an optional full catalog at `/llms-full.txt`, and clean markdown copies of important pages (for example `/blog/post.md`), following [llmstxt.org](https://llmstxt.org).
- Help agents find those files with `rel="alternate"` / `rel="describedby"` links and a comment in `robots.txt` that points at `llms.txt`.
- The author notes that large search crawlers may not use `llms.txt` today; the file is still useful for agents that can fetch a URL.

This is why the discoverability category probes `/llms.txt`, `/llms-full.txt`, and `robots.txt`, not only the OpenAPI document.
