import { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";
import {
  BillingEvidence,
  buildBillingEvidenceLedger,
  subjectIdentityKey
} from "./billingEvidence.js";

/** Returned as the 400 error from send / status→sent / send-reminder when money is unresolved. */
export const SEND_BLOCKED_MESSAGE =
  "Cannot send while a non-waived line is $0 or a billing decision is still open.";

/** Returned as the 400 error from POST /api/invoices/:id/payment-link. */
export const PAYMENT_LINK_BLOCKED_MESSAGE =
  "Cannot create a payment link while a non-waived line is $0 or a billing decision is still open.";

/** Returned as the 400 error from POST /api/invoices/:id/client-portal-link. */
export const CLIENT_PORTAL_BLOCKED_MESSAGE =
  "Cannot create a client portal while a non-waived line is $0 or a billing decision is still open.";

const FREE_SENTENCE_MARKERS =
  /\b(?:no charge|no-charge|didn't charge|did not charge|didnt charge|not charged|no cost|complimentary|\bfree\b)\b/i;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function lineMatchesFact(line: InvoiceLineItem, fact: BillingEvidence): boolean {
  const key = subjectIdentityKey(line.description ?? "");
  return Boolean(key) && key === fact.subjectIdentity;
}

function sourceSentenceWaivesDescription(description: string, sourceNote: string): boolean {
  const tokens = subjectIdentityKey(description)
    .split(" ")
    .filter((token) => token.length > 3);
  if (!tokens.length || !sourceNote.trim()) {
    return false;
  }
  return sourceNote.split(/[\n.!?]+/).some((sentence) => {
    if (!FREE_SENTENCE_MARKERS.test(sentence)) {
      return false;
    }
    const hay = subjectIdentityKey(sentence);
    return tokens.every((token) => hay.split(" ").includes(token));
  });
}

/**
 * Explicit free / no-charge only.
 * A stored flag, a waived ledger fact for this line, or a source sentence that
 * names the line and says free / no-charge. A bare $0 is not enough.
 */
export function isExplicitFreeLine(line: InvoiceLineItem, sourceNote = ""): boolean {
  const unit = line.unitPrice;
  const amount = line.amount;
  const positivePrice = isFiniteNumber(unit) && unit > 0;
  if (line.explicitFree === true && !positivePrice) {
    return true;
  }
  const note = sourceNote.trim();
  if (!note) {
    return false;
  }
  const waived = buildBillingEvidenceLedger(note).some(
    (fact) => fact.state === "waived" && lineMatchesFact(line, fact)
  );
  if (waived) {
    return true;
  }
  return sourceSentenceWaivesDescription(line.description ?? "", note);
}

function isNonWaivedZero(line: InvoiceLineItem, sourceNote: string): boolean {
  if (isExplicitFreeLine(line, sourceNote)) {
    return false;
  }
  if (isFiniteNumber(line.amount) && line.amount === 0) {
    return true;
  }
  return isFiniteNumber(line.unitPrice) && line.unitPrice === 0;
}

function lineAnswersFact(line: InvoiceLineItem, fact: BillingEvidence, sourceNote: string): boolean {
  if (fact.field === "quantity") {
    return isFiniteNumber(line.quantity) && line.quantity > 0;
  }
  if (isExplicitFreeLine(line, sourceNote)) {
    return true;
  }
  return isFiniteNumber(line.unitPrice) && line.unitPrice > 0;
}

function hasOpenBillingDecision(lines: InvoiceLineItem[], sourceNote: string): boolean {
  const note = sourceNote.trim();
  if (note) {
    const unresolved = buildBillingEvidenceLedger(note).filter((fact) => fact.state === "unresolved");
    for (const fact of unresolved) {
      const matches = lines.filter((line) => lineMatchesFact(line, fact));
      // A skipped subject is not on the invoice. That decision is closed.
      if (matches.length === 0) {
        continue;
      }
      if (!matches.some((line) => lineAnswersFact(line, fact, note))) {
        return true;
      }
    }
  }

  return lines.some((line) => {
    if (!(line.description ?? "").trim()) {
      return false;
    }
    if (isExplicitFreeLine(line, sourceNote)) {
      return false;
    }
    return !isFiniteNumber(line.amount) || !isFiniteNumber(line.unitPrice);
  });
}

export function invoiceSendIsBlocked(input: {
  finishedInvoice: Pick<FinishedInvoice, "lineItems">;
  sourceNote?: string;
}): boolean {
  const lines = Array.isArray(input.finishedInvoice?.lineItems) ? input.finishedInvoice.lineItems : [];
  const sourceNote = typeof input.sourceNote === "string" ? input.sourceNote : "";
  return (
    lines.some((line) => isNonWaivedZero(line, sourceNote)) || hasOpenBillingDecision(lines, sourceNote)
  );
}
