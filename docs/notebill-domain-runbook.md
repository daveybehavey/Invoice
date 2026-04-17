# NoteBill Public Domain Runbook

NoteBill production traffic now runs on Cloudflare Workers, with GitHub as the deployment source of truth.
Your local machine is for development only.

Live hostnames:

- `https://app.notebill.app`
- `https://notebill.app`
- `https://www.notebill.app`
- `https://notebill-app.davidiheslop.workers.dev`

## Production shape

- Cloudflare Workers runs the Express app through `src/worker.ts`.
- Cloudflare Static Assets serves the built frontend from `public/`.
- Worker routes are attached at:
  - `app.notebill.app/*`
  - `notebill.app/*`
  - `www.notebill.app/*`
- Supabase Postgres remains the durable data store.

## Local development

Run the local app when you want to develop or test changes on your machine:

```powershell
npm run dev
```

Or run the Worker locally:

```powershell
npm run cf:dev
```

Local production hosting through `cloudflared` is no longer the primary path.
The legacy `public:*` scripts remain available only as a fallback while old tunnel-era DNS records still exist.

## Deploy to Cloudflare

Dry-run the Worker bundle:

```powershell
npm run cf:check
```

Deploy the Worker:

```powershell
npm run cf:deploy
```

The Worker deploy should publish:

- `https://notebill-app.davidiheslop.workers.dev`
- zone routes for `app.notebill.app/*`, `notebill.app/*`, and `www.notebill.app/*`

## GitHub + Cloudflare Builds

The preferred automation path is now:

- push code to `https://github.com/daveybehavey/Invoice`
- let Cloudflare Workers Builds pull from GitHub
- let Cloudflare publish the new Worker version automatically

One-time Cloudflare dashboard setup:

1. Go to Cloudflare `Workers & Pages`.
2. Open the existing Worker: `notebill-app`.
3. Go to `Settings` > `Builds`.
4. Select `Connect`.
5. Authorize the Cloudflare GitHub app if prompted.
6. Select the GitHub repository: `daveybehavey/Invoice`.
7. Use the production branch: `main`.
8. Keep the Worker name matched to `wrangler.jsonc`: `notebill-app`.
9. Use the repo root as the build root.
10. Use:
    - build command: `npm run build`
    - deploy command: `npx wrangler deploy`

After that, a normal push to `main` should trigger Cloudflare to build and deploy directly from GitHub.

This repo still includes `.github/workflows/ci-and-deploy.yml`, but it is now manual-only.
That workflow is a fallback for later, once GitHub Actions billing is healthy again and a dedicated
`CLOUDFLARE_API_TOKEN` has been created for CI.

## Verify production

Run the release checks against the live Cloudflare-hosted app:

```powershell
npm run check:launch
npm run check:public-domain
npm run check:release
```

`check:launch` now defaults to `APP_BASE_URL` and validates:

- `/health`
- `/api/system/launch`
- persistence, billing, auth, email, and public-base-url readiness

`check:public-domain` validates:

- the Worker route bindings exist in Cloudflare
- `workers.dev` is healthy
- `https://app.notebill.app/health`
- `https://app.notebill.app/privacy`
- `https://notebill.app`
- `https://www.notebill.app`

## Legacy tunnel fallback

These commands are no longer the recommended production path, but they are still available if you need a temporary local-origin fallback:

```powershell
npm run public:start
npm run public:stop
```

Use them only if you intentionally want to serve traffic from your machine again.

## Email Routing (Cloudflare)

Cloudflare Email Routing is enabled for `notebill.app` and forwards these aliases to
`davidiheslop@gmail.com`:

- `contact@notebill.app`
- `info@notebill.app`
- `support@notebill.app`
- `hello@notebill.app`
- `billing@notebill.app`
- `sales@notebill.app`
