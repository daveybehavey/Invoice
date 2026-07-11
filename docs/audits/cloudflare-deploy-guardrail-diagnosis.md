# Cloudflare Workers deployment trigger diagnosis

Date: 2026-07-11  
Mode: Green-risk read-only diagnosis with no deploy, no Cloudflare settings changes, and no secret access.

## Root cause

The documentation-only draft PR #1 triggered a Cloudflare Workers build because the connected Cloudflare Workers Builds integration is configured to watch the GitHub repository, not just application paths. The repository runbook says the preferred automation path is to push code to `https://github.com/daveybehavey/Invoice` and let Cloudflare Workers Builds pull from GitHub and publish automatically. It also records the one-time setup as Worker `notebill-app`, repository `daveybehavey/Invoice`, production branch `main`, repo root as build root, build command `npm run build`, and deploy command `npx wrangler deploy`.

Cloudflare's default Workers Builds path behavior is broad: a change to any file in a connected repository triggers a build unless Build watch paths include/exclude rules are configured. Because no repository-side GitHub Actions workflow exists in this checkout and no Cloudflare dashboard setting was changed during this diagnosis, the exact deployment trigger is the external Cloudflare Workers Builds Git integration reacting to the PR branch commit set for PR #1.

## Preview, production, or incorrectly labelled

This appears to have been a Cloudflare Workers Builds preview/build attempt for a GitHub pull request branch, not an intentional production deployment from a merge to `main`. It may have been labelled or perceived as a deployment attempt because the Cloudflare project deploy command is `npx wrangler deploy`; Cloudflare Workers Builds treats successful builds with that deploy command as deployable Worker versions. Production promotion should be reserved for the configured production branch `main`, while draft PR activity should be treated as preview/build-only or skipped by path rules.

## Files and settings inspected

- `wrangler.jsonc`: Worker name is `notebill-app`; `workers_dev` is enabled; production custom routes are declared for `app.notebill.app/*`, `notebill.app/*`, and `www.notebill.app/*`; app vars and required secret names are declared without reading secret values.
- `package.json`: Cloudflare scripts are `cf:dev`, `cf:deploy`, and `cf:check`; the configured deploy command maps to `npx wrangler deploy`, while the dry-run check maps to `npx wrangler deploy --dry-run`.
- `docs/notebill-domain-runbook.md`: documents GitHub + Cloudflare Builds as the preferred production automation path, using repository `daveybehavey/Invoice`, production branch `main`, build root repo root, build command `npm run build`, and deploy command `npx wrangler deploy`.
- `.github/workflows`: absent in the Codex checkout, so no GitHub Actions workflow in the repository was identified as responsible for the Cloudflare deployment attempt.
- Git branch/status: diagnosis was prepared as Green-risk documentation work; no app code, Ads, pricing, billing, Stripe, Google Play, production config, or Cloudflare settings were changed.

## Relevant rules

- GitHub rule: PR #1 introduced documentation-only file changes, but a connected third-party GitHub App can still receive PR/push events even when GitHub Actions workflows are absent.
- Cloudflare Workers Builds rule: connected repositories build on Git changes by default; Build watch paths are the Cloudflare-native control for skipping builds based on changed paths.
- Cloudflare branch rule: the runbook records `main` as the production branch for the `notebill-app` Worker. PR branches should not be production branches.
- Workflow rule: there is no repository workflow file under `.github/workflows`, so the repository itself is not issuing a `wrangler deploy` from GitHub Actions.
- Wrangler rule: `wrangler.jsonc` is the Worker source of truth for Worker name, entrypoint, assets, routes, vars, and required secret names; `npx wrangler deploy` is a real deploy command, while `npx wrangler deploy --dry-run` is the non-deploying check.
- Path rule: without Build watch path excludes such as `docs/*` or `docs/**`, docs-only changes are still eligible to trigger a Cloudflare Workers build.

## Recommended fix

Smallest safe guardrail: configure Cloudflare Workers Builds Build watch paths for `notebill-app` so documentation-only and audit-only changes are skipped before build/deploy. Prefer an exclude list over narrowing includes too aggressively:

- Exclude: `docs/*` and `docs/**`
- Optional additional excludes after review: `README.md`, `.github/*`, `.github/**`, Android-only release assets if they should never deploy the Worker
- Keep includes at the default `*` unless the team wants a stricter allowlist

This is intentionally a Cloudflare dashboard/build-setting guardrail rather than an app-code change. It avoids changing production runtime behavior and directly addresses the external trigger source.

If the team also wants a repository-side belt-and-suspenders check later, add a non-deploying CI workflow that reports whether a PR is docs-only. Do not add any workflow that runs `wrangler deploy` for PRs.

## Risks and tradeoffs

- Excluding all `docs/**` prevents documentation-only PRs from validating the Worker build. That is acceptable for the immediate incident because the goal is to avoid deployment attempts from docs-only changes.
- Overly broad excludes could skip needed builds if future operational files are stored under `docs/`. Keep deploy-affecting runbooks separate from code changes or manually trigger a build when documentation accompanies app changes.
- A strict include allowlist is safer against accidental deploys but has higher maintenance risk; new deploy-relevant directories could be forgotten and stop deploying.
- Changing the deploy command to `npx wrangler versions upload` would prevent automatic active deployment promotion, but it changes the production release model more than necessary for this docs-only PR issue.

## Verification plan

1. In Cloudflare, inspect Workers & Pages > `notebill-app` > Settings > Builds and record Git repository, branch, build command, deploy command, and Build watch paths. Do not reveal secrets.
2. Confirm Build watch paths exclude `docs/*` and `docs/**` while includes remain `*` unless a stricter policy is intentionally chosen.
3. Open or update a draft PR that changes only `docs/**` and confirm Cloudflare marks the build as skipped or does not start a Worker build.
4. Open a non-production test PR that changes a harmless deploy-relevant file outside `docs/**` and confirm Cloudflare creates only a preview/build for the PR branch, not a production active deployment.
5. Merge only after review; confirm a normal push/merge to `main` still follows the intended production deployment path.

## Codex environment limitations

The Codex task reported that GitHub CLI was unavailable and GitHub API access was blocked by a proxy, so it could not push its local commit or attach the diagnosis to GitHub directly. ChatGPT relayed the reviewed report to this branch and issue #4.