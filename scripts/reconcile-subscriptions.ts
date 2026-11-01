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
import { reconcileStoredSubscription } from "../src/services/stripeBilling.js";

const subscriptionIds = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);

if (subscriptionIds.length === 0) {
  console.error("Usage: npx tsx scripts/reconcile-subscriptions.ts <subscriptionId> [moreIds...]");
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
