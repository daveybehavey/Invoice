/**
 * Covers: src/services/invoiceSendGate.ts
 *
 * Characterises the send / share-pack money-resolution gate as implemented today.
 * Expectations are hand-derived from the exported helpers (not reimplemented totals).
 * Fixtures are synthetic; no network, no wall-clock dependence.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceLineItem } from "../models/invoice.js";
import {
  CLIENT_PORTAL_BLOCKED_MESSAGE,
  PAYMENT_LINK_BLOCKED_MESSAGE,
  SEND_BLOCKED_MESSAGE,
  invoiceSendIsBlocked,
  invoiceSharePackIsBlocked,
  isExplicitFreeLine
} from "./invoiceSendGate.js";

function line(partial: Partial<InvoiceLineItem> & Pick<InvoiceLineItem, "description">): InvoiceLineItem {
  return {
    type: "other",
    quantity: 1,
    ...partial
  } as InvoiceLineItem;
}

test("blocked message constants stay fixed (API contract surface)", () => {
  assert.equal(
    SEND_BLOCKED_MESSAGE,
    "Cannot send while a non-waived line is $0 or a billing decision is still open."
  );
  assert.equal(
    PAYMENT_LINK_BLOCKED_MESSAGE,
    "Cannot create a payment link while a non-waived line is $0 or a billing decision is still open."
  );
  assert.equal(
    CLIENT_PORTAL_BLOCKED_MESSAGE,
    "Cannot create a client portal while a non-waived line is $0 or a billing decision is still open."
  );
});

test("invoiceSendIsBlocked: priced finite lines are not blocked", () => {
  const finishedInvoice = {
    lineItems: [line({ description: "Filter cartridge", unitPrice: 45, amount: 45 })]
  };
  assert.equal(invoiceSendIsBlocked({ finishedInvoice }), false);
  assert.equal(invoiceSendIsBlocked({ finishedInvoice, sourceNote: "" }), false);
});

test("invoiceSendIsBlocked: bare $0 amount without explicit free is blocked", () => {
  const finishedInvoice = {
    lineItems: [line({ description: "Service call", unitPrice: 0, amount: 0 })]
  };
  // Hand rule: isNonWaivedZero is true when amount===0 and not explicit-free.
  assert.equal(invoiceSendIsBlocked({ finishedInvoice }), true);
});

test("invoiceSendIsBlocked: characterisation — explicitFree true waives a $0 line", () => {
  const finishedInvoice = {
    lineItems: [
      line({ description: "Inspection visit", unitPrice: 0, amount: 0, explicitFree: true })
    ]
  };
  assert.equal(isExplicitFreeLine(finishedInvoice.lineItems[0]), true);
  assert.equal(invoiceSendIsBlocked({ finishedInvoice }), false);
});

test("invoiceSendIsBlocked: characterisation — explicitFree ignored when unitPrice is positive", () => {
  const priced = line({
    description: "Inspection visit",
    unitPrice: 75,
    amount: 75,
    explicitFree: true
  });
  // positivePrice short-circuits explicitFree in isExplicitFreeLine.
  assert.equal(isExplicitFreeLine(priced), false);
  assert.equal(invoiceSendIsBlocked({ finishedInvoice: { lineItems: [priced] } }), false);
});

test("invoiceSendIsBlocked: source-note free sentence matching the line subject waives $0", () => {
  const finishedInvoice = {
    lineItems: [line({ description: "Inspection visit", unitPrice: 0, amount: 0 })]
  };
  const sourceNote = "Inspection visit, no charge. Replaced filter cartridge for $40.";
  assert.equal(isExplicitFreeLine(finishedInvoice.lineItems[0], sourceNote), true);
  assert.equal(invoiceSendIsBlocked({ finishedInvoice, sourceNote }), false);
});

test("invoiceSendIsBlocked: missing unitPrice/amount on a described line is an open decision", () => {
  const finishedInvoice = {
    lineItems: [line({ description: "Labor hours", quantity: 2 })]
  };
  // amount and unitPrice omitted → hasOpenBillingDecision true.
  assert.equal(invoiceSendIsBlocked({ finishedInvoice }), true);
});

test("invoiceSendIsBlocked: empty lineItems array is not blocked", () => {
  assert.equal(invoiceSendIsBlocked({ finishedInvoice: { lineItems: [] } }), false);
});

test("invoiceSharePackIsBlocked: missing customer name blocks even with priced total", () => {
  assert.equal(
    invoiceSharePackIsBlocked({
      finishedInvoice: {
        customerName: "  ",
        total: 100,
        lineItems: [line({ description: "Work", unitPrice: 100, amount: 100 })]
      }
    }),
    true
  );
});

test("invoiceSharePackIsBlocked: total <= 0 blocks", () => {
  assert.equal(
    invoiceSharePackIsBlocked({
      finishedInvoice: {
        customerName: "Acme Co",
        total: 0,
        lineItems: [line({ description: "Work", unitPrice: 50, amount: 50 })]
      }
    }),
    true
  );
});

test("invoiceSharePackIsBlocked: no positively priced described line blocks", () => {
  assert.equal(
    invoiceSharePackIsBlocked({
      finishedInvoice: {
        customerName: "Acme Co",
        total: 50,
        lineItems: [line({ description: "Placeholder", unitPrice: 0, amount: 0, explicitFree: true })]
      }
    }),
    true
  );
});

test("invoiceSharePackIsBlocked: customer + priced line + positive total + send-clear passes", () => {
  assert.equal(
    invoiceSharePackIsBlocked({
      finishedInvoice: {
        customerName: "Acme Co",
        total: 120,
        lineItems: [line({ description: "Repair", unitPrice: 120, amount: 120 })]
      }
    }),
    false
  );
});
