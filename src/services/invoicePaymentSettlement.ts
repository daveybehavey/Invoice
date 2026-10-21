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
 * - Provider payment records are server-owned on every write path: client
 *   saves merge the stored records under the store's serialization and can
 *   never create, modify, or delete them. Creation is no exception: a new
 *   invoice's link state, unmatched payments, and monetary revision start
 *   empty/server-initialized, and create-payload records are manual-only.
 * - A save that leaves a paid invoice with a positive exact balance
 *   reopens it to "sent" inside the same serialized mutation.
 * - "Paid" is exact: balances are computed in integer minor units from the
 *   payment records, and paid requires a post-settlement balance of exactly
 *   zero. Non-representable totals/records and overpayments are captured as
 *   unmatched with a reason — never rounded or clamped into paid.
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

/**
 * Exact two-decimal minor-unit conversion: returns the integer minor units
 * iff the major-unit value is representable in minor units (within float
 * noise), otherwise null. A value like 10.005 has no exact minor-unit form —
 * it must never be rounded into a settlement, because the rounded amount is
 * a different amount of money than the invoice demands.
 */
export function toAmountMinorExact(amountMajor: number): number | null {
  const value = Number(amountMajor);
  if (!Number.isFinite(value)) {
    return null;
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  // Float noise for invoice-scale amounts is ~1e-12; a genuinely
  // non-representable value (a third decimal place) sits ~0.5 away.
  if (Math.abs(scaled - rounded) > 1e-6) {
    return null;
  }
  return rounded;
}

/** A payment record carrying provider evidence (its dedupe/binding key). */
export function isProviderPaymentRecord(record: { providerPaymentIntentId?: string }): boolean {
  return typeof record?.providerPaymentIntentId === "string" && record.providerPaymentIntentId.length > 0;
}

/**
 * Sum payment records in integer minor units: provider records carry their
 * authoritative `amountMinor`; manual records convert exactly from their
 * major-unit amount. Returns null when any record has no exact minor-unit
 * representation — an exact paid test is then impossible and settlement
 * must not guess.
 */
export function sumPaymentRecordsMinor(
  paymentRecords: Array<{ amount?: number; amountMinor?: number }>
): number | null {
  let totalMinor = 0;
  for (const record of paymentRecords) {
    if (typeof record?.amountMinor === "number") {
      if (!Number.isInteger(record.amountMinor) || record.amountMinor < 0) {
        return null;
      }
      totalMinor += record.amountMinor;
      continue;
    }
    const exact = toAmountMinorExact(Number(record?.amount ?? 0));
    if (exact === null) {
      return null;
    }
    totalMinor += exact;
  }
  return totalMinor;
}

/**
 * Balance in integer minor units (total minus payments), or null when the
 * total or any payment record is not exactly representable. No rounding and
 * no clamping: a negative result is a real overpayment signal, not a zero.
 */
export function calculateInvoiceBalanceMinor(
  totalMajor: number,
  paymentRecords: Array<{ amount?: number; amountMinor?: number }>
): number | null {
  const totalMinor = toAmountMinorExact(totalMajor);
  if (totalMinor === null) {
    return null;
  }
  const paidMinor = sumPaymentRecordsMinor(paymentRecords);
  if (paidMinor === null) {
    return null;
  }
  return totalMinor - paidMinor;
}

export function normalizeMoneyCurrency(value: string | undefined | null): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || "usd";
}

function roundCurrencyAmount(value: number): number {
  return Math.max(0, Number(value.toFixed(2)));
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
 * Merge the payment records of an incoming (client-supplied) document with
 * the stored ones. Provider-evidence records are server-owned: the stored
 * records are preserved verbatim and a client payload can never create,
 * modify, or delete them (deleting one would also delete the settlement
 * dedupe key). Manual records stay client-visible: an incoming manual
 * record updates its stored counterpart (provider fields stripped — a
 * manual record can never gain provider evidence from a payload), stored
 * manual records the payload omits are kept (deletion runs through the
 * remove-payment endpoint, not a whole-document save), and genuinely new
 * manual records are appended.
 */
export function mergePaymentRecords(
  existing: StoredFinishedInvoice["paymentRecords"],
  incoming: StoredFinishedInvoice["paymentRecords"]
): StoredFinishedInvoice["paymentRecords"] {
  const storedRecords = existing ?? [];
  const incomingRecords = incoming ?? [];
  const incomingById = new Map(incomingRecords.map((record) => [record.id, record]));
  const merged: StoredFinishedInvoice["paymentRecords"] = [];

  for (const stored of storedRecords) {
    if (isProviderPaymentRecord(stored)) {
      merged.push(stored);
      continue;
    }
    const update = incomingById.get(stored.id);
    merged.push(update && !isProviderPaymentRecord(update) ? stripProviderEvidence(update) : stored);
  }
  for (const candidate of incomingRecords) {
    if (isProviderPaymentRecord(candidate)) {
      continue;
    }
    if (merged.some((record) => record.id === candidate.id)) {
      continue;
    }
    merged.push(stripProviderEvidence(candidate));
  }
  return merged;
}

/**
 * Prepare the payment state of a NEWLY created invoice. Server-owned
 * payment state starts empty and server-initialized on every backend: a
 * create payload can never mint a payment link (or a link URL — an
 * installed URL with no link records would enable the legacy settlement
 * fallback), an unmatched-payment record, a monetary revision, or
 * provider settlement evidence. Forged provider state at create would
 * otherwise poison settlement twice over: a forged provider record's
 * `amountMinor` is authoritative in exact balance sums, and a forged
 * payment-intent id in a record or an unmatched entry makes the genuine
 * webhook for that intent return "duplicate" forever. Payload payment
 * records are accepted only as manual records — provider fields
 * stripped — with `amountMinor` derived server-side from the major-unit
 * amount (left absent when the amount has no exact minor-unit
 * representation, in which case exact balance computations fail closed
 * downstream).
 */
export function sanitizeCreatedInvoicePaymentState(
  finishedInvoice: StoredFinishedInvoice
): StoredFinishedInvoice {
  return {
    ...finishedInvoice,
    paymentLinkUrl: undefined,
    paymentLinks: [],
    unmatchedPayments: [],
    monetaryRevision: 0,
    paymentRecords: (finishedInvoice.paymentRecords ?? []).map((record) => {
      const manual = stripProviderEvidence(record);
      const amountMinor = toAmountMinorExact(Number(manual.amount ?? 0));
      return amountMinor === null ? manual : { ...manual, amountMinor };
    })
  };
}

/**
 * Reconcile a stored "paid" status with the balance a client save
 * produced. This runs inside the save's serialization (both backends)
 * against the merged invoice: a monetary edit that leaves a positive
 * balance reopens the invoice to "sent" — the same reopened status the
 * remove-payment path uses — instead of leaving a paid invoice with
 * money still due. The balance is derived exactly in integer minor
 * units: from the total and the merged payment records when they are
 * exactly representable, otherwise from the resulting balanceDue. When
 * no positive balance can be proven, the status is left alone.
 */
export function reconcilePaidStatusAfterSave(
  status: SavedInvoice["status"],
  finishedInvoice: StoredFinishedInvoice
): SavedInvoice["status"] {
  if (status !== "paid") {
    return status;
  }
  const derivedMinor =
    calculateInvoiceBalanceMinor(
      Number(finishedInvoice.total ?? finishedInvoice.balanceDue ?? 0),
      finishedInvoice.paymentRecords ?? []
    ) ?? toAmountMinorExact(Number(finishedInvoice.balanceDue ?? 0));
  return derivedMinor !== null && derivedMinor > 0 ? "sent" : status;
}

function stripProviderEvidence<T extends Record<string, unknown>>(record: T): T {
  const {
    provider: _provider,
    providerPaymentIntentId: _providerPaymentIntentId,
    providerEventId: _providerEventId,
    currency: _currency,
    amountMinor: _amountMinor,
    ...rest
  } = record;
  return rest as T;
}

/**
 * Prepare an incoming invoice document (from the save route) against the
 * stored one. This runs INSIDE the store's serialization (mutation lock /
 * FOR UPDATE transaction) against the freshly stored invoice — never
 * against a snapshot read earlier — so a save can never overwrite a
 * settlement that landed in between. Payment-link state and provider
 * payment records are server-owned and always taken from the stored
 * invoice; when the monetary fingerprint changed, links are superseded
 * and the monetary revision is bumped.
 */
export function applyMonetaryEditInvalidation(input: {
  existing: StoredFinishedInvoice;
  incoming: StoredFinishedInvoice;
  nowIso: string;
}): StoredFinishedInvoice {
  const { existing, incoming, nowIso } = input;
  const paymentRecords = mergePaymentRecords(existing.paymentRecords, incoming.paymentRecords);
  const serverOwned: StoredFinishedInvoice = {
    ...incoming,
    paymentRecords,
    monetaryRevision: existing.monetaryRevision ?? 0,
    paymentLinks: existing.paymentLinks ?? [],
    paymentLinkUrl: existing.paymentLinkUrl,
    unmatchedPayments: existing.unmatchedPayments ?? []
  };
  // Once provider evidence exists, the balance is a fact derived from the
  // payment records, not a client-writable field: recompute it in integer
  // minor units so a stale payload cannot resurrect a pre-settlement
  // balance (or erase the zero a settlement produced).
  const prepared = deriveBalanceFromProviderRecords(serverOwned);
  if (computeMonetaryFingerprint(existing) === computeMonetaryFingerprint(prepared)) {
    return prepared;
  }
  return {
    ...supersedeActivePaymentLinks(prepared, nowIso),
    monetaryRevision: (existing.monetaryRevision ?? 0) + 1
  };
}

function deriveBalanceFromProviderRecords(
  finishedInvoice: StoredFinishedInvoice
): StoredFinishedInvoice {
  const records = finishedInvoice.paymentRecords ?? [];
  if (!records.some((record) => isProviderPaymentRecord(record))) {
    return finishedInvoice;
  }
  const balanceMinor = calculateInvoiceBalanceMinor(
    Number(finishedInvoice.total ?? finishedInvoice.balanceDue ?? 0),
    records
  );
  if (balanceMinor === null) {
    return finishedInvoice;
  }
  return { ...finishedInvoice, balanceDue: balanceMinor / 100 };
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
  const expectedAmountMinor = toAmountMinorExact(
    Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0)
  );
  if (expectedAmountMinor === null) {
    return null;
  }
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
  const expectedBalanceMinor = toAmountMinorExact(
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
    return unmatched("missing_or_non_positive_amount", expectedBalanceMinor ?? undefined);
  }

  let settledLink: PaymentLinkRecord | undefined;
  let boundExpectedMinor: number | undefined;
  if (settlement.paymentLinkRecordId) {
    const link = links.find((candidate) => candidate.id === settlement.paymentLinkRecordId);
    if (!link) {
      return unmatched("unknown_payment_link", expectedBalanceMinor ?? undefined);
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
    boundExpectedMinor = link.amountMinor;
  } else {
    // Legacy payment (link minted before link records existed): the
    // PaymentIntent metadata cannot name a link record, so binding falls
    // back to an exact match against the invoice's current balance and
    // currency. Any monetary edit since issuance breaks the amount match.
    if (links.length > 0) {
      return unmatched("unverifiable_payment_link", expectedBalanceMinor ?? undefined);
    }
    if (expectedBalanceMinor === null) {
      return unmatched("non_representable_balance");
    }
    if (amountReceivedMinor !== expectedBalanceMinor) {
      return unmatched("amount_mismatch", expectedBalanceMinor);
    }
    if (normalizeMoneyCurrency(finishedInvoice.currency) !== receivedCurrency) {
      return unmatched("currency_mismatch", expectedBalanceMinor);
    }
    boundExpectedMinor = expectedBalanceMinor;
  }

  // Exact paid test, in integer minor units end to end. The invoice total
  // and every existing payment record must be exactly representable in
  // minor units, and the post-settlement balance must be exactly zero —
  // never a rounded or clamped approximation of zero. Anything else is
  // captured as unmatched with a reason instead of being applied.
  const invoiceTotal = Number(finishedInvoice.total ?? finishedInvoice.balanceDue ?? 0);
  const totalMinor = toAmountMinorExact(invoiceTotal);
  if (totalMinor === null) {
    return unmatched("non_representable_total", boundExpectedMinor);
  }
  const paidMinorBefore = sumPaymentRecordsMinor(finishedInvoice.paymentRecords ?? []);
  if (paidMinorBefore === null) {
    return unmatched("non_representable_payment_record", boundExpectedMinor);
  }
  const nextBalanceMinor = totalMinor - paidMinorBefore - amountReceivedMinor;
  if (nextBalanceMinor < 0) {
    return unmatched("overpayment", totalMinor);
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
  const nextBalanceDue = nextBalanceMinor / 100;
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
    status: nextBalanceMinor === 0 ? "paid" : invoice.status,
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
