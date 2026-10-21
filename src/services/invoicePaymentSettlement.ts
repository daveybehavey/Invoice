import { randomUUID } from "node:crypto";
import type {
  PaymentLinkRecord,
  SavedInvoice,
  UnmatchedPaymentRecord
} from "../models/invoice.js";

/** The finished invoice as stored (zod output): server-owned payment-link
 * fields are always present after a parse, documentType is resolved. */
type StoredFinishedInvoice = SavedInvoice["invoiceData"]["finishedInvoice"];

/**
 * Paid-state binding for provider (Stripe) invoice payments.
 *
 * Invariants enforced here:
 * - An invoice may only reach "paid" through a settlement whose provider
 *   evidence (amount_received + currency, read from Stripe's PaymentIntent)
 *   matches a currently-active payment link minted for the invoice's current
 *   monetary revision — or, for links created before link records existed,
 *   matches the invoice's current balance exactly.
 * - Settlement is idempotent on the payment-intent id: replayed webhooks
 *   (same event, or the same intent under a new event) are no-ops.
 * - A payment that cannot be bound is captured durably as an unmatched
 *   payment for reconciliation. It never changes balance or status, and the
 *   webhook still succeeds so Stripe does not retry forever.
 * - Any monetary edit supersedes outstanding links and bumps the monetary
 *   revision, so a link issued for amount X can never settle amount Y.
 *
 * Amounts cross the provider boundary in integer minor units. Conversion
 * uses the codebase's existing two-decimal convention; currency-exponent
 * handling for zero-/three-decimal currencies is the money series' item (3)
 * and intentionally not changed here.
 */

export type StripeSettlementInput = {
  invoiceId: string;
  ownerId: string;
  eventId: string;
  paymentIntentId: string;
  /** Local payment-link record id echoed back through Stripe metadata. */
  paymentLinkRecordId?: string;
  /** Authoritative amount Stripe collected, in minor units. Null when absent. */
  amountReceivedMinor: number | null;
  /** Authoritative currency Stripe collected (ISO, any case). */
  currency: string;
  receivedAt: string;
};

export type StripeSettlementOutcome =
  | "settled"
  | "duplicate"
  | "unmatched"
  | "not_found"
  | "deleted"
  | "estimate";

export type StripeSettlementResult = {
  outcome: StripeSettlementOutcome;
  invoice?: SavedInvoice;
  reason?: string;
};

/** Two-decimal minor-unit conversion (existing codebase convention). */
export function toAmountMinor(amountMajor: number): number {
  return Math.round(Number(amountMajor) * 100);
}

export function normalizeMoneyCurrency(value: string | undefined | null): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || "usd";
}

function roundCurrencyAmount(value: number): number {
  return Math.max(0, Number(value.toFixed(2)));
}

export function calculateInvoiceBalance(
  total: number,
  paymentRecords: Array<{ amount?: number }>
): number {
  const amountPaid = paymentRecords.reduce((sum, record) => sum + Number(record?.amount ?? 0), 0);
  return roundCurrencyAmount(total - amountPaid);
}

/**
 * Stable fingerprint of every money-bearing field of a finished invoice.
 * Non-monetary edits (notes, names, dates) must NOT invalidate payment
 * links; any change here must.
 */
export function computeMonetaryFingerprint(finishedInvoice: StoredFinishedInvoice): string {
  const lineItems = (finishedInvoice.lineItems ?? []).map((lineItem) => ({
    amount: Number(lineItem.amount ?? 0),
    quantity: Number(lineItem.quantity ?? 0),
    unitPrice: Number(lineItem.unitPrice ?? 0)
  }));
  return JSON.stringify({
    currency: normalizeMoneyCurrency(finishedInvoice.currency),
    subtotal: Number(finishedInvoice.subtotal ?? 0),
    discountAmount: Number(finishedInvoice.discountAmount ?? 0),
    total: Number(finishedInvoice.total ?? 0),
    balanceDue: Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0),
    lineItems
  });
}

/** Mark every active link superseded and drop the reusable link URL. */
export function supersedeActivePaymentLinks(
  finishedInvoice: StoredFinishedInvoice,
  nowIso: string
): StoredFinishedInvoice {
  const paymentLinks = (finishedInvoice.paymentLinks ?? []).map((link) =>
    link.status === "active"
      ? { ...link, status: "superseded" as const, deactivatedAt: nowIso }
      : link
  );
  return {
    ...finishedInvoice,
    paymentLinkUrl: undefined,
    paymentLinks
  };
}

/**
 * Prepare an incoming invoice document (from the save route) against the
 * stored one: payment-link state is server-owned, so it is always taken
 * from the stored invoice; when the monetary fingerprint changed, links
 * are superseded and the monetary revision is bumped.
 */
export function applyMonetaryEditInvalidation(input: {
  existing: StoredFinishedInvoice;
  incoming: StoredFinishedInvoice;
  nowIso: string;
}): StoredFinishedInvoice {
  const { existing, incoming, nowIso } = input;
  const serverOwned: StoredFinishedInvoice = {
    ...incoming,
    monetaryRevision: existing.monetaryRevision ?? 0,
    paymentLinks: existing.paymentLinks ?? [],
    paymentLinkUrl: existing.paymentLinkUrl,
    unmatchedPayments: existing.unmatchedPayments ?? []
  };
  if (computeMonetaryFingerprint(existing) === computeMonetaryFingerprint(incoming)) {
    return serverOwned;
  }
  return {
    ...supersedeActivePaymentLinks(serverOwned, nowIso),
    monetaryRevision: (existing.monetaryRevision ?? 0) + 1
  };
}

/** Server-side mutation (manual payment recorded/removed) changed the balance. */
export function invalidateLinksForBalanceChange(
  finishedInvoice: StoredFinishedInvoice,
  nowIso: string
): StoredFinishedInvoice {
  return {
    ...supersedeActivePaymentLinks(finishedInvoice, nowIso),
    monetaryRevision: (finishedInvoice.monetaryRevision ?? 0) + 1
  };
}

export function findReusablePaymentLink(finishedInvoice: StoredFinishedInvoice): PaymentLinkRecord | null {
  const paymentLinkUrl = finishedInvoice.paymentLinkUrl?.trim();
  if (!paymentLinkUrl) {
    return null;
  }
  const links = finishedInvoice.paymentLinks ?? [];
  const expectedAmountMinor = toAmountMinor(
    Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0)
  );
  const active = links.find(
    (link) =>
      link.status === "active" &&
      link.invoiceRevision === (finishedInvoice.monetaryRevision ?? 0) &&
      link.amountMinor === expectedAmountMinor &&
      normalizeMoneyCurrency(link.currency) === normalizeMoneyCurrency(finishedInvoice.currency)
  );
  return active ?? null;
}

export function hasLegacyPaymentLink(finishedInvoice: StoredFinishedInvoice): boolean {
  return Boolean(finishedInvoice.paymentLinkUrl?.trim()) && (finishedInvoice.paymentLinks ?? []).length === 0;
}

/**
 * Pure settlement transform: given the stored invoice and the provider
 * evidence, decide the outcome and the next invoice state. Persistence
 * layers (file store under its mutation lock, Postgres in a transaction)
 * write the returned invoice atomically; when `changed` is false nothing
 * may be written.
 */
export function settleStripePaymentOnInvoice(input: {
  invoice: SavedInvoice;
  settlement: StripeSettlementInput;
}): { outcome: StripeSettlementOutcome; reason?: string; changed: boolean; invoice: SavedInvoice } {
  const { invoice, settlement } = input;
  const finishedInvoice = invoice.invoiceData.finishedInvoice;

  if (invoice.status === "deleted") {
    return { outcome: "deleted", changed: false, invoice };
  }
  if (finishedInvoice.documentType === "estimate") {
    return { outcome: "estimate", changed: false, invoice };
  }

  const alreadySeen =
    (finishedInvoice.paymentRecords ?? []).some(
      (record) => record.providerPaymentIntentId === settlement.paymentIntentId
    ) ||
    (finishedInvoice.unmatchedPayments ?? []).some(
      (record) => record.providerPaymentIntentId === settlement.paymentIntentId
    );
  if (alreadySeen) {
    return { outcome: "duplicate", changed: false, invoice };
  }

  const amountReceivedMinor = settlement.amountReceivedMinor;
  const receivedCurrency = normalizeMoneyCurrency(settlement.currency);
  const links = finishedInvoice.paymentLinks ?? [];
  const expectedBalanceMinor = toAmountMinor(
    Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0)
  );

  const unmatched = (reason: string, expectedAmountMinor?: number) => {
    const record: UnmatchedPaymentRecord = {
      id: randomUUID(),
      provider: "stripe",
      providerPaymentIntentId: settlement.paymentIntentId,
      providerEventId: settlement.eventId,
      paymentLinkRecordId: settlement.paymentLinkRecordId,
      amountMinor: Math.max(0, Math.round(Number(amountReceivedMinor ?? 0))),
      currency: receivedCurrency,
      expectedAmountMinor,
      reason,
      receivedAt: settlement.receivedAt
    };
    return {
      outcome: "unmatched" as const,
      reason,
      changed: true,
      invoice: {
        ...invoice,
        invoiceData: {
          ...invoice.invoiceData,
          finishedInvoice: {
            ...finishedInvoice,
            unmatchedPayments: [...(finishedInvoice.unmatchedPayments ?? []), record]
          }
        }
      }
    };
  };

  if (amountReceivedMinor === null || !Number.isFinite(amountReceivedMinor) || amountReceivedMinor <= 0) {
    return unmatched("missing_or_non_positive_amount", expectedBalanceMinor);
  }

  let settledLink: PaymentLinkRecord | undefined;
  if (settlement.paymentLinkRecordId) {
    const link = links.find((candidate) => candidate.id === settlement.paymentLinkRecordId);
    if (!link) {
      return unmatched("unknown_payment_link", expectedBalanceMinor);
    }
    if (link.status !== "active") {
      return unmatched("payment_link_not_active", link.amountMinor);
    }
    if (link.invoiceRevision !== (finishedInvoice.monetaryRevision ?? 0)) {
      return unmatched("stale_payment_link", link.amountMinor);
    }
    if (link.amountMinor !== amountReceivedMinor) {
      return unmatched("amount_mismatch", link.amountMinor);
    }
    if (normalizeMoneyCurrency(link.currency) !== receivedCurrency) {
      return unmatched("currency_mismatch", link.amountMinor);
    }
    settledLink = link;
  } else {
    // Legacy payment (link minted before link records existed): the
    // PaymentIntent metadata cannot name a link record, so binding falls
    // back to an exact match against the invoice's current balance and
    // currency. Any monetary edit since issuance breaks the amount match.
    if (links.length > 0) {
      return unmatched("unverifiable_payment_link", expectedBalanceMinor);
    }
    if (amountReceivedMinor !== expectedBalanceMinor) {
      return unmatched("amount_mismatch", expectedBalanceMinor);
    }
    if (normalizeMoneyCurrency(finishedInvoice.currency) !== receivedCurrency) {
      return unmatched("currency_mismatch", expectedBalanceMinor);
    }
  }

  const paymentRecord = {
    id: randomUUID(),
    amount: roundCurrencyAmount(amountReceivedMinor / 100),
    paidAt: settlement.receivedAt.slice(0, 10),
    note: "Stripe payment",
    provider: "stripe",
    providerPaymentIntentId: settlement.paymentIntentId,
    providerEventId: settlement.eventId,
    currency: receivedCurrency,
    amountMinor: amountReceivedMinor
  };
  const nextPaymentRecords = [...(finishedInvoice.paymentRecords ?? []), paymentRecord];
  const invoiceTotal = Number(finishedInvoice.total ?? finishedInvoice.balanceDue ?? 0);
  const nextBalanceDue = calculateInvoiceBalance(invoiceTotal, nextPaymentRecords);
  const nextLinks = links.map((link) => {
    if (settledLink && link.id === settledLink.id) {
      return { ...link, status: "paid" as const, deactivatedAt: settlement.receivedAt };
    }
    if (link.status === "active") {
      return { ...link, status: "superseded" as const, deactivatedAt: settlement.receivedAt };
    }
    return link;
  });

  const settledInvoice: SavedInvoice = {
    ...invoice,
    status: nextBalanceDue <= 0 ? "paid" : invoice.status,
    invoiceData: {
      ...invoice.invoiceData,
      finishedInvoice: {
        ...finishedInvoice,
        balanceDue: nextBalanceDue,
        paymentRecords: nextPaymentRecords,
        paymentLinks: nextLinks,
        paymentLinkUrl: undefined
      }
    }
  };
  return { outcome: "settled", changed: true, invoice: settledInvoice };
}
