# Launch checklist

Completed on 20 Nov 2026 (Israel time):

1. The GitHub repository is public and MIT-licensed.
2. The Worker is deployed on the free tier at https://agent-ready-score.omer20sh.workers.dev (no custom domain, no paid plan).
3. A `v0.1.0` git tag and GitHub Release are the next step after this docs change lands, so `Om3rr/agent-ready-score@v0.1.0` is a stable Action pin.

Still needs the owner:

4. Publish the `v0.1.0` release to the GitHub Marketplace (you have to click publish yourself, accept the Marketplace agreement, and complete 2FA). The release edit page will be `https://github.com/Om3rr/agent-ready-score/releases/edit/v0.1.0`.
5. Sign in to npm and publish the `agent-ready-score` package so `npx agent-ready-score` works without cloning. `"private"` has already been removed from `package.json`.
6. Do not attach a refund policy, kit license, or checkout until those drafts are approved; this product’s public copy stays “Pro coming soon” with no prices until you say otherwise.
