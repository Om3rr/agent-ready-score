# Launch checklist (not started)

Nothing in this repository has been published, deployed, or put behind checkout. The steps below are what the owner would do, each on one line.

1. Make the GitHub repository public (it is private and MIT-licensed, ready to flip) when you want other people to use the Action and clone the CLI.
2. Create a git tag such as `v0.1.0` and a GitHub Release so `Om3rr/agent-ready-score@v0.1.0` is a stable Action pin.
3. If you want the Action listed, publish that release to the GitHub Marketplace (you have to click publish yourself).
4. Sign in to npm and publish the `agent-ready-score` package so `npx agent-ready-score` works without cloning (leave `"private": true` until that moment).
5. Sign in to a Cloudflare account and run `npx wrangler deploy` from this repo to host the landing page, `/api/score`, and `/badge` (CI only dry-runs today; no account is attached).
6. Point a custom domain and a Shields badge example at the deployed Worker, then tell the CMO the public URLs are live so launch copy can use them.
7. Do not attach a refund policy, kit license, or checkout until those drafts are approved; this product’s public copy stays “Pro coming soon” with no prices until you say otherwise.
