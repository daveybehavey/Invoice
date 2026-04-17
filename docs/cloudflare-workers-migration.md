# NoteBill Cloudflare Workers Migration

The migration is now effectively complete for production traffic.

## Current production state

- `src/worker.ts` runs the Express app on Cloudflare Workers.
- `wrangler.jsonc` deploys the Worker plus static assets from `public/`.
- Production secrets are configured in Cloudflare Worker secrets.
- Live traffic is routed through Cloudflare zone routes:
  - `app.notebill.app/*`
  - `notebill.app/*`
  - `www.notebill.app/*`
- The `workers.dev` deployment remains available at `https://notebill-app.davidiheslop.workers.dev`.

## Data and runtime

Supabase Postgres remains the durable system of record.
The runtime-critical support stores now share the same Postgres-backed snapshot path that the Worker uses in production:

- `src/services/invoiceDeliveryStore.ts`
- `src/services/billingEntitlementsStore.ts`
- `src/services/ocrMetricsStore.ts`
- `src/services/flowFrictionReport.ts`
- `src/services/flowFrictionHistory.ts`

File mode still exists for local development and tests, but it is not the production persistence path.

## What changed from the old tunnel setup

Old production flow:

- Cloudflare DNS/proxy
- Cloudflare Tunnel
- a machine running `localhost:3000`

Current production flow:

- GitHub repository
- Cloudflare Worker deployment via Wrangler
- Cloudflare zone routes on the real hostnames

That means your laptop or VM no longer has to stay online for the public site to work.

## Remaining cleanup

- The old Cloudflare Tunnel DNS records still exist underneath the zone.
- They are no longer required for the Worker-served production path, but can be retired later from the Cloudflare dashboard once you are ready to remove the fallback entirely.

## Local development

Use your machine for development only:

```powershell
npm run dev
```

Or run the Worker locally:

```powershell
npm run cf:dev
```

Dry-run the production bundle:

```powershell
npm run cf:check
```

Deploy production:

```powershell
npm run cf:deploy
```
