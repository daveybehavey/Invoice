# Dead-code audit — Phase 2 (NoteBill marathon)

**Base head audited:** `3f42124b7f2bb0151f22df62041030eb2ed0d3b8`  
**Search method:** full-repo text search over `*.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs,*.md,*.json,*.jsonc,*.html` excluding `node_modules`, `.git`, `android`, `ios`, `.wrangler`. Export census of `src/**/*.ts` (non-test), then same-file occurrence classification for runtime exports with zero external hits.

## Removals (evidence-backed)

| Symbol | File | Evidence | Not an entry/public product surface |
| --- | --- | --- | --- |
| `clearSystemPromptCache` | `src/prompt/systemPrompt.ts` | Only occurrence was the export definition; no importers, no callers | Test/helper cache clear never wired; `loadSystemPrompt` remains |
| `getSavedInvoiceStoreFilePath` | `src/services/savedInvoiceStore.ts` | Only occurrence was the export definition; path already exposed via `getSavedInvoiceStoreSummary().filePath` | Not a route/CLI entry |
| `getBillingEntitlementsSnapshot` | `src/services/billingEntitlementsStore.ts` | Only occurrence was the export definition; live callers use `getBillingEntitlementsSummary` / internal `readSnapshot` | Not a route entry |
| `toAmountMinor` | `src/services/invoicePaymentSettlement.ts` | Only occurrence was the export definition; all live money paths use `toAmountMinorExact` | Dead duplicate of the superseded rounding helper; behaviour unchanged because nothing called it |

## Findings-only (not removed)

### Ambiguous / public-surface exports

- **`buildTermsSections`** (`legalFoundation.ts`) — zero external callers; sibling of live `buildTermsPlainText` / versioned Terms API. Treated as intentional public helper until a Terms-surface owner confirms otherwise.
- **Zod schema consts on `models/invoice.ts`** (e.g. `InvoiceLineItemSchema`, `TaskSchema`, …) — zero *external* importers, but composed inside the same module into live schemas/types. Not dead.
- **Many exported TypeScript `type`/`interface` aliases** — zero external name hits; still part of the typed public surface for consumers/tests. Not removed.
- **`stripeBilling.ts` symbols** (including `buildStripeCheckoutSessionCreateParams`) — payments-fenced; never edited in this phase even when a symbol looks internal-only.

### Ops / CLI scripts with no package.json reference

- `scripts/ai-intake-e2e.mjs` — zero in-repo references; presumed live manual/ops entry until owner confirms.
- `scripts/reconcile-subscriptions.ts` — zero in-repo references; presumed live ops entry (related S93-3 work) until owner confirms.

### Ambient / entry stubs

- `src/cloudflare-runtime.d.ts` — ambient types for Workers; not an importable module.
- `src/worker.ts` — Workers entry (`wrangler`); not imported by the Express app.

### Dynamic-dispatch caution

Anything referenced by string name, framework convention, or config (routes in `server.ts`, wrangler entry, Capacitor wrappers, `public/index.html` script tags) was presumed **live**. No file-based route was removed.

## What would convict remaining candidates

- For `buildTermsSections`: confirm no external package/API consumer and no planned Terms UI import, then remove.
- For ops scripts: owner confirmation they are obsolete, plus absence from runbooks.
- For unused exported types: a deliberate public-API slim pass (separate lane), not a dead-code conviction.
