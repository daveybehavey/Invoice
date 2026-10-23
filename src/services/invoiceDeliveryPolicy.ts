import type { SavedInvoiceStatus } from "../models/invoice.js";

/**
 * Slice 0 (tax lane, design v2 Q6 + v2.1 §§C–D): the ONE pure transition
 * policy both invoice stores apply for status changes. It performs no
 * arithmetic and no I/O — each store calls it only after acquiring its
 * serialization boundary (file mutation lock / Postgres FOR UPDATE
 * transaction) and rereading the fresh record, so a delivery completion
 * can never act on a pre-delivery snapshot.
 *
 * Purposes:
 * - "delivery": a verified provider outcome (ACCEPTED) completing a
 *   send. Only a fresh `draft → sent` transition is permitted; `sent`
 *   is a no-op; `paid`/`deleted` are never mutated by delivery, and
 *   delivery never rewrites money (design invariants 3 + 4).
 * - "lifecycle": every other caller of the status endpoint
 *   (owner-driven mark-sent / mark-paid / soft delete). Behaviour is
 *   preserved from the pre-Slice-0 stores with ONE exception, the
 *   delete→restore defect (audit-verification item 2, assigned to
 *   Slice 0): a transition INTO `deleted` never rewrites money. The
 *   old leaving-paid rewrite (balanceDue = total) fired at delete
 *   time, so deleting and restoring a settled invoice resurrected its
 *   full balance as due. Deleting is not a money event; the document
 *   is stored untouched and restore returns exactly what was deleted.
 *   The broader lifecycle money reconciliation (including the manual
 *   paid → sent restore) is Slice 2's Q2 work per the Slice 0 design's
 *   status-helper scope note, and is deliberately untouched here.
 */
export type InvoiceStatusTransitionPurpose = "delivery" | "lifecycle";

export type InvoiceStatusTransitionDecision = {
  /** The status to persist. Equals the fresh status when transition is false. */
  nextStatus: SavedInvoiceStatus;
  /** True when the status actually changes. */
  transition: boolean;
  /**
   * True when the legacy mark-paid adjustment (balanceDue → 0) applies.
   * Lifecycle transitions into `paid` only; delivery never adjusts money.
   */
  zeroBalanceDue: boolean;
  /**
   * True when the legacy leaving-paid restore (balanceDue → total, for a
   * stored balance of zero) remains available. Lifecycle only, and never
   * when entering `deleted` — see the module note above.
   */
  restoreTotalOnLeavePaid: boolean;
};

export function decideInvoiceStatusTransition(input: {
  currentStatus: SavedInvoiceStatus;
  requestedStatus: SavedInvoiceStatus;
  purpose: InvoiceStatusTransitionPurpose;
}): InvoiceStatusTransitionDecision {
  const { currentStatus, requestedStatus, purpose } = input;

  if (purpose === "delivery") {
    // Only provider-ACCEPTED completion reaches this branch (callers gate
    // record_only / FAILED / UNKNOWN outcomes before invoking it).
    if (requestedStatus === "sent" && currentStatus === "draft") {
      return { nextStatus: "sent", transition: true, zeroBalanceDue: false, restoreTotalOnLeavePaid: false };
    }
    return { nextStatus: currentStatus, transition: false, zeroBalanceDue: false, restoreTotalOnLeavePaid: false };
  }

  // Lifecycle: the target status is applied verbatim; mark-paid zeroes
  // the balance; leaving paid for a non-deleted status keeps the legacy
  // restore; entering `deleted` rewrites no money at all.
  return {
    nextStatus: requestedStatus,
    transition: requestedStatus !== currentStatus,
    zeroBalanceDue: requestedStatus === "paid",
    restoreTotalOnLeavePaid:
      currentStatus === "paid" && requestedStatus !== "paid" && requestedStatus !== "deleted"
  };
}
