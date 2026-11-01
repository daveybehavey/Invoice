/**
 * S93-3 item 2: bounded administrative reconciliation for existing
 * subscription records.
 *
 * Legacy billing records written before reconciliation existed have no
 * event watermark and are UNVERIFIED — hasActiveStripeEntitlement treats
 * them as non-granting until they are reconciled here through the same
 * retrieval path the webhook handlers use. This is the documented,
 * temporary entitlement impact of the reconciliation change: affected
 * subscribers show as non-Pro until an operator runs this command (or a
 * fresh verified subscription event reconciles them).
 *
 * Usage (IDs are always explicit — there is no scan/all mode):
 *   npx tsx scripts/reconcile-subscriptions.ts sub_123 [sub_456 ...]
 *
 * Requires the same environment as the server (STRIPE_SECRET_KEY and the
 * entitlements store configuration). Exit code is non-zero if any ID
 * fails to reconcile. Cancellation tombstones are never cleared: a
 * tombstoned subscription reports "tombstoned" and stays canceled.
 */
// Load the server's environment BEFORE any service import: the
// entitlements store resolves its backend and file path from process.env
// at module init, exactly as it does for src/server.ts. Without this the
// command silently reconciles against the default file store instead of
// the configured one. Same mechanism as src/server.ts line 1 — do not
// substitute a local .env reader.
import "dotenv/config";
import { reconcileStoredSubscription } from "../src/services/stripeBilling.js";

const subscriptionIds = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);

if (subscriptionIds.length === 0) {
  console.error("Usage: npx tsx scripts/reconcile-subscriptions.ts <subscriptionId> [moreIds...]");
  process.exit(2);
}

// Fail loudly on missing prerequisites instead of reconciling against
// the wrong configuration: retrieval needs the Stripe secret, and a
// Postgres store configured without its URL would silently fall back to
// the file backend in resolveRuntimeStateBackend.
if (!process.env.STRIPE_SECRET_KEY?.trim()) {
  console.error(
    "reconcile-subscriptions: STRIPE_SECRET_KEY is not configured (checked process env and .env); refusing to run."
  );
  process.exit(2);
}
const runtimeBackendOverride = process.env.INVOICE_RUNTIME_STORE_BACKEND?.trim().toLowerCase();
const invoiceStoreBackend = process.env.INVOICE_STORE_BACKEND?.trim().toLowerCase();
const postgresUrlConfigured = Boolean(
  process.env.INVOICE_STORE_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim()
);
if ((runtimeBackendOverride === "postgres" || invoiceStoreBackend === "postgres") && !postgresUrlConfigured) {
  console.error(
    "reconcile-subscriptions: a Postgres entitlements store is configured but INVOICE_STORE_POSTGRES_URL (or DATABASE_URL) is not set; refusing to fall back to the file store."
  );
  process.exit(2);
}

let failures = 0;
for (const subscriptionId of subscriptionIds) {
  try {
    const result = await reconcileStoredSubscription(subscriptionId);
    console.log(`${subscriptionId}: ${result.outcome}${result.status ? ` (status=${result.status})` : ""}`);
    if (result.outcome === "missing") {
      failures += 1;
    }
  } catch (error) {
    failures += 1;
    console.error(`${subscriptionId}: failed — ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failures > 0 ? 1 : 0);
