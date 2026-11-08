/**
 * Covers: src/lib/invoiceMath.ts (normalizeInvoice)
 * Priority area: invoice math — line amounts, subtotals, discounts, rounding, balanceDue.
 * Fixtures are synthetic; expectations are hand-computed independently of the implementation.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeInvoice } from "./invoiceMath.js";
import type { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";

function line(partial: Partial<InvoiceLineItem> & { description: string }): InvoiceLineItem {
  return {
    type: "other",
    ...partial
  } as InvoiceLineItem;
}

function invoice(
  lineItems: InvoiceLineItem[],
  extra: Partial<FinishedInvoice> = {}
): FinishedInvoice {
  return {
    documentType: "invoice",
    currency: "USD",
    lineItems,
    paymentRecords: [],
    paymentMethods: [],
    monetaryRevision: 0,
    paymentLinks: [],
    unmatchedPayments: [],
    ...extra
  } as FinishedInvoice;
}

test("derive line amount from quantity × unitPrice when amount omitted", () => {
  // Hand: 2 × 10 = 20
  const result = normalizeInvoice(
    invoice([line({ description: "Paint walls", quantity: 2, unitPrice: 10 })])
  );
  assert.equal(result.lineItems[0].amount, 20);
  assert.equal(result.subtotal, 20);
  assert.equal(result.total, 20);
  assert.equal(result.balanceDue, 20);
});

test("explicit line amount wins over quantity × unitPrice", () => {
  // Hand: stored amount 15 beats 2 × 10
  const result = normalizeInvoice(
    invoice([line({ description: "Paint walls", quantity: 2, unitPrice: 10, amount: 15 })])
  );
  assert.equal(result.lineItems[0].amount, 15);
  assert.equal(result.subtotal, 15);
  assert.equal(result.total, 15);
});

test("zero quantity and zero unitPrice produce a zero line amount", () => {
  const zeroQty = normalizeInvoice(
    invoice([line({ description: "Cancelled hours", quantity: 0, unitPrice: 85 })])
  );
  assert.equal(zeroQty.lineItems[0].amount, 0);
  assert.equal(zeroQty.subtotal, 0);
  assert.equal(zeroQty.total, 0);

  const zeroPrice = normalizeInvoice(
    invoice([line({ description: "Comped materials", quantity: 5, unitPrice: 0 })])
  );
  assert.equal(zeroPrice.lineItems[0].amount, 0);
  assert.equal(zeroPrice.subtotal, 0);
});

test("single-cent and large-quantity lines keep exact cent totals", () => {
  // Hand: 1 × 0.01 = 0.01
  const penny = normalizeInvoice(
    invoice([line({ description: "Penny fee", quantity: 1, unitPrice: 0.01 })])
  );
  assert.equal(penny.lineItems[0].amount, 0.01);
  assert.equal(penny.subtotal, 0.01);
  assert.equal(penny.total, 0.01);

  // Hand: 10000 × 0.01 = 100
  const bulk = normalizeInvoice(
    invoice([line({ description: "Bulk widgets", quantity: 10000, unitPrice: 0.01 })])
  );
  assert.equal(bulk.lineItems[0].amount, 100);
  assert.equal(bulk.subtotal, 100);
  assert.equal(bulk.total, 100);
});

test("per-line amounts round to cents before the subtotal is summed", () => {
  // Hand: round(10.004) = 10; three lines → subtotal 30 (not 30.012)
  const result = normalizeInvoice(
    invoice([
      line({ description: "A", quantity: 1, unitPrice: 10.004 }),
      line({ description: "B", quantity: 1, unitPrice: 10.004 }),
      line({ description: "C", quantity: 1, unitPrice: 10.004 })
    ])
  );
  assert.equal(result.lineItems[0].amount, 10);
  assert.equal(result.lineItems[1].amount, 10);
  assert.equal(result.lineItems[2].amount, 10);
  assert.equal(result.subtotal, 30);
  assert.equal(result.total, 30);
});

test("characterisation: IEEE float then Math.round defines half-cent line amounts", () => {
  // Characterisation of current roundToCents(quantity * unitPrice) behaviour.
  // 3 × 10.333 = 30.999… → Math.round → 31.00
  const triple = normalizeInvoice(
    invoice([line({ description: "Odd rate", quantity: 3, unitPrice: 10.333 })])
  );
  assert.equal(triple.lineItems[0].amount, 31);

  // 1.005 × 100 often yields 100.4999… in IEEE double → rounds to 1.00
  const halfish = normalizeInvoice(
    invoice([line({ description: "Half-centish", quantity: 1, unitPrice: 1.005 })])
  );
  assert.equal(halfish.lineItems[0].amount, 1);

  // 0.015 → Math.round(1.5) path → 0.02 under the current helper
  const threeHalves = normalizeInvoice(
    invoice([line({ description: "Three half-cents", amount: 0.015 })])
  );
  assert.equal(threeHalves.lineItems[0].amount, 0.02);
});

test("discount reduces total and is clamped at zero; excess discount cannot go negative", () => {
  // Hand: subtotal 100 − discount 15 = 85
  const discounted = normalizeInvoice(
    invoice(
      [
        line({ description: "Labor", quantity: 2, unitPrice: 40 }),
        line({ description: "Parts", quantity: 1, unitPrice: 20 })
      ],
      { discountAmount: 15 }
    )
  );
  assert.equal(discounted.subtotal, 100);
  assert.equal(discounted.discountAmount, 15);
  assert.equal(discounted.total, 85);
  assert.equal(discounted.balanceDue, 85);

  // Hand: subtotal 30 − 40 → max(0, −10) = 0
  const excess = normalizeInvoice(
    invoice([line({ description: "Small job", quantity: 1, unitPrice: 30 })], {
      discountAmount: 40
    })
  );
  assert.equal(excess.subtotal, 30);
  assert.equal(excess.discountAmount, 40);
  assert.equal(excess.total, 0);
  assert.equal(excess.balanceDue, 0);

  // Characterisation: negative discount inputs are clamped to 0 before use
  const negativeDiscount = normalizeInvoice(
    invoice([line({ description: "Job", quantity: 1, unitPrice: 50 })], {
      discountAmount: -12
    })
  );
  assert.equal(negativeDiscount.discountAmount, 0);
  assert.equal(negativeDiscount.total, 50);
});

test("missing amount with incomplete qty/price leaves amount undefined and contributes 0 to subtotal", () => {
  // Hand: quantity alone cannot derive; subtotal treats missing amount as 0
  const qtyOnly = normalizeInvoice(
    invoice([line({ description: "Labor TBD", quantity: 3 })])
  );
  assert.equal(qtyOnly.lineItems[0].amount, undefined);
  assert.equal(qtyOnly.subtotal, 0);
  assert.equal(qtyOnly.total, 0);

  const priceOnly = normalizeInvoice(
    invoice([line({ description: "Rate TBD", unitPrice: 75 })])
  );
  assert.equal(priceOnly.lineItems[0].amount, undefined);
  assert.equal(priceOnly.subtotal, 0);
});

test("balanceDue is preserved when provided and defaults to total when omitted", () => {
  const preserved = normalizeInvoice(
    invoice([line({ description: "Retainer", quantity: 1, unitPrice: 200 })], {
      balanceDue: 50
    })
  );
  assert.equal(preserved.total, 200);
  assert.equal(preserved.balanceDue, 50);

  const defaulted = normalizeInvoice(
    invoice([line({ description: "Retainer", quantity: 1, unitPrice: 200 })])
  );
  assert.equal(defaulted.balanceDue, 200);
});

test("missing line ids are assigned line_N in encounter order; existing ids are kept", () => {
  const result = normalizeInvoice(
    invoice([
      line({ description: "First", quantity: 1, unitPrice: 10 }),
      line({ id: "custom_line", description: "Second", quantity: 1, unitPrice: 20 }),
      line({ description: "Third", quantity: 1, unitPrice: 30 })
    ])
  );
  assert.equal(result.lineItems[0].id, "line_1");
  assert.equal(result.lineItems[1].id, "custom_line");
  assert.equal(result.lineItems[2].id, "line_3");
  // Hand: 10 + 20 + 30 = 60
  assert.equal(result.subtotal, 60);
  assert.equal(result.total, 60);
});
