import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyExponent, toAmountMinorExact, toAmountMajor, supportsStripeIsoUnits } from "./currencyUnits.js";
import { assertValidSavePaymentRecordChanges, calculateInvoiceBalanceMinor, getExactCollectibleBalanceMinor, reconstructGrossTotalMinor, sanitizeDuplicatedInvoicePaymentState, settleStripePaymentOnInvoice, sumPaymentRecordsMinor } from "../services/invoicePaymentSettlement.js";
import { SavedInvoiceDataSchema } from "../models/invoice.js";

for (const [currency, exponent] of [
  ["JPY", 0], ["KRW", 0], ["VND", 0], ["CLP", 0], ["ISK", 0], ["UGX", 0],
  ["USD", 2], ["CAD", 2], ["EUR", 2],
  ["BHD", 3], ["KWD", 3], ["OMR", 3], ["JOD", 3], ["TND", 3], ["CLF", 4]
] as const) {
  test(`ISO exponent ${exponent}: ${currency}, round trip and fractional minor unit refusal`, () => {
    assert.equal(currencyExponent(currency), exponent);
    assert.equal(toAmountMinorExact(100, currency), 100 * 10 ** exponent);
    assert.equal(toAmountMajor(100 * 10 ** exponent, currency), 100);
    assert.equal(toAmountMinorExact(1 / 10 ** (exponent + 1), currency), null);
    assert.equal(toAmountMinorExact(1 / 10 ** exponent, currency), 1);
  });
}

test("Stripe presentment gate rejects 3-decimal BHD/KWD while ISO conversion stays exact", () => {
  for (const currency of ["BHD", "KWD"] as const) {
    assert.equal(currencyExponent(currency), 3);
    assert.equal(toAmountMinorExact(100, currency), 100000);
    assert.equal(toAmountMinorExact(100.123, currency), 100123);
    assert.equal(toAmountMajor(100000, currency), 100);
    assert.equal(supportsStripeIsoUnits(currency), false);
    assert.equal(getExactCollectibleBalanceMinor(SavedInvoiceDataSchema.parse({
      structuredInvoice: { customerName: "C1", workSessions: [], materials: [] },
      finishedInvoice: {
        customerName: "C1",
        currency,
        total: 100,
        balanceDue: 100,
        lineItems: [{ id: "c1", type: "labor", description: "C1", quantity: 1, unitPrice: 100, amount: 100 }]
      }
    }).finishedInvoice), null);
  }
  assert.equal(supportsStripeIsoUnits("USD"), true);
  assert.equal(supportsStripeIsoUnits("JPY"), true);
  assert.equal(supportsStripeIsoUnits("ISK"), false);
  assert.equal(supportsStripeIsoUnits("UGX"), false);
  assert.equal(supportsStripeIsoUnits("MGA"), false);
});

test("negative saved payment amounts are rejected", () => {
  const base = SavedInvoiceDataSchema.parse({
    structuredInvoice: { customerName: "C1", workSessions: [], materials: [] },
    finishedInvoice: {
      customerName: "C1",
      currency: "USD",
      total: 100,
      balanceDue: 100,
      lineItems: [{ id: "c1", type: "labor", description: "C1", quantity: 1, unitPrice: 100, amount: 100 }]
    }
  }).finishedInvoice;
  assert.throws(
    () =>
      assertValidSavePaymentRecordChanges({
        existing: { ...base, paymentRecords: [] },
        merged: {
          ...base,
          paymentRecords: [{ id: "neg", amount: -40, paidAt: "2026-11-11" }]
        }
      }),
    /Payment amount must be greater than zero/
  );
  assert.equal(sumPaymentRecordsMinor([{ amount: -40 }], "USD"), null);
  assert.equal(calculateInvoiceBalanceMinor(100, [{ amount: -40 }], "USD"), null);
});
test("unknown, missing and non-monetary currencies fail closed", () => {
  for (const currency of ["ZZZ", "XXX", "XAU", "", undefined, "toString"]) {
    assert.equal(toAmountMinorExact(100, currency), null);
    assert.throws(() => toAmountMajor(100, currency));
  }
  assert.equal(toAmountMinorExact(Infinity, "USD"), null);
  assert.equal(toAmountMinorExact(Number.MAX_SAFE_INTEGER, "BHD"), null);
  assert.equal(toAmountMinorExact(100, " jpy "), 100);
  assert.equal(toAmountMinorExact(0.1 + 0.2, "USD"), 30);
});
for (const currency of ["JPY", "USD", "BHD"]) {
  test(`${currency} manual records, collectible balance and reverse legacy reconstruction`, () => {
    const factor = 10 ** currencyExponent(currency)!;
    const finished = SavedInvoiceDataSchema.parse({
      structuredInvoice: { customerName: "C1", workSessions: [], materials: [] },
      finishedInvoice: { customerName: "C1", currency, lineItems: [{ id: "c1", type: "labor", description: "C1", quantity: 1, unitPrice: 100, amount: 100 }], total: 100, balanceDue: 60,
        paymentRecords: [{ id: "manual", amount: 40, paidAt: "2026-11-11" }] }
    }).finishedInvoice;
    assert.equal(calculateInvoiceBalanceMinor(100, finished.paymentRecords, currency), 60 * factor);
    // Collectible (= Stripe-routable) only when presentment units match ISO.
    assert.equal(
      getExactCollectibleBalanceMinor(finished),
      supportsStripeIsoUnits(currency) ? 60 * factor : null
    );
    const legacy = { ...finished, total: undefined };
    assert.equal(reconstructGrossTotalMinor(legacy), 100 * factor);
    const duplicate = sanitizeDuplicatedInvoicePaymentState(legacy);
    assert.equal(duplicate.total, 100);
    assert.equal(duplicate.balanceDue, 100);
  });
}

test("legacy JPY 10000 charge cannot settle a JPY 100 invoice as paid", () => {
  const invoiceData = SavedInvoiceDataSchema.parse({
    structuredInvoice: { customerName: "C1", workSessions: [], materials: [] },
    finishedInvoice: { customerName: "C1", currency: "JPY", total: 100, balanceDue: 100,
      lineItems: [{ id: "c1", type: "labor", description: "C1", quantity: 1, unitPrice: 100, amount: 100 }],
      paymentLinkUrl: "https://pay.stripe.test/legacy" }
  });
  const invoice = { invoiceId: "c1-legacy", ownerId: "c1", status: "sent", invoiceData } as Parameters<typeof settleStripePaymentOnInvoice>[0]["invoice"];
  const result = settleStripePaymentOnInvoice({ invoice, settlement: {
    invoiceId: "c1-legacy", ownerId: "c1", eventId: "evt_c1", paymentIntentId: "pi_c1",
    amountReceivedMinor: 10000, currency: "jpy", receivedAt: "2026-11-11T00:00:00Z"
  } });
  assert.equal(result.outcome, "unmatched");
  assert.equal(result.reason, "amount_mismatch");
  assert.equal(result.invoice.status, "sent");
  assert.equal(result.invoice.invoiceData.finishedInvoice.balanceDue, 100);
  assert.equal(result.invoice.invoiceData.finishedInvoice.paymentRecords.length, 0);
});
