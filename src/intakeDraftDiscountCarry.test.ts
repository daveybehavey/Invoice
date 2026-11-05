import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

// NB-A-01 prerequisite fix (design packet 2026-11-05 §1.4 flow 4, Codex
// critique Q12 disposition (b)): the intake controller's draft builder,
// buildDraftFromInvoice (public/features/intake/controller.js), carries
// NO discountAmount into the draft it builds, while the readiness reopen
// path's buildDraftFromFinishedInvoice has carried the recorded discount
// verbatim since PR #126. The intake -> manual-editor handoff therefore
// rebuilds a discounted invoice from its undiscounted subtotal: the
// packet's worked example (subtotal $30, discount $3, tax 10%, finished
// total $29.70) comes back at $33.00 through this path.
//
// These tests load the real controller module (plus its real window
// dependencies) in a vm, call the exported buildDraftFromInvoice exactly
// as the intake handoff does (invoice + tax rate override), and score the
// built draft with the editor's own totals formulas from
// manualInvoiceCanvas.jsx (subtotal = sum(qty * rate); effectiveDiscount
// = min(subtotal, max(0, discount)); total = (subtotal - discount) *
// (1 + taxRate / 100)) — the same scoring as reopenDiscountTaxRate.test.ts.

type Draft = {
  taxRate: string;
  discountAmount?: unknown;
  lineItems: Array<{ qty: string; rate: string }>;
};

function loadBuildDraftFromInvoice(): (
  invoice: unknown,
  taxOverride?: string,
  transcript?: string
) => Draft {
  const windowObj: Record<string, unknown> = {
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    },
    location: { origin: "http://localhost", search: "" }
  };
  const sandbox: Record<string, unknown> = { window: windowObj, console };
  vm.createContext(sandbox);
  for (const file of [
    "public/utils/requestIdentity.js",
    "public/utils/formatters.js",
    "public/utils/clientMemory.js",
    "public/utils/intakeHelpers.js",
    "public/features/intake/controller.js"
  ]) {
    vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  const controller = windowObj.InvoiceIntakeController as {
    buildDraftFromInvoice: (invoice: unknown, taxOverride?: string, transcript?: string) => Draft;
  };
  assert.ok(
    controller?.buildDraftFromInvoice,
    "controller module must expose buildDraftFromInvoice"
  );
  return controller.buildDraftFromInvoice;
}

const buildDraftFromInvoice = loadBuildDraftFromInvoice();

function parseNumber(value: unknown): number {
  const parsed = Number.parseFloat(value as string);
  return Number.isFinite(parsed) ? parsed : 0;
}

// The editor's totals, manualInvoiceCanvas.jsx (getLineAmount + the
// subtotal / effectiveDiscountAmount / taxAmount / total block).
function editorTotal(draft: Draft): number {
  const subtotal = draft.lineItems.reduce(
    (sum, item) => sum + parseNumber(item.qty) * parseNumber(item.rate),
    0
  );
  const effectiveDiscountAmount = Math.min(
    subtotal,
    Math.max(0, parseNumber(draft.discountAmount ?? "0"))
  );
  const discountedSubtotal = Math.max(0, subtotal - effectiveDiscountAmount);
  const taxAmount = discountedSubtotal * (parseNumber(draft.taxRate) / 100);
  return discountedSubtotal + taxAmount;
}

function assertTotal(actual: number, expected: number, message: string) {
  assert.equal(Number(actual.toFixed(2)), expected, message);
}

// The packet's worked example (nb-a01-design-packet-2026-11-05 §1.3):
// 3 lines x $10, $3 discount, 10% tax, finished total $29.70.
const workedExample = {
  customerName: "Ada Example",
  invoiceNumber: "INV-2001",
  lineItems: [
    { id: "line_1", description: "Labour", quantity: 1, unitPrice: 10, amount: 10 },
    { id: "line_2", description: "Labour", quantity: 1, unitPrice: 10, amount: 10 },
    { id: "line_3", description: "Labour", quantity: 1, unitPrice: 10, amount: 10 }
  ],
  subtotal: 30,
  discountAmount: 3,
  total: 29.7
};

test("intake draft builder carries the recorded discount (packet worked example)", () => {
  const draft = buildDraftFromInvoice(workedExample, "10");
  assert.notEqual(
    draft.discountAmount,
    undefined,
    "the built draft must carry the recorded discountAmount"
  );
  assert.equal(Number(draft.discountAmount), 3, "the carried discount is the recorded $3");
  assert.equal(draft.taxRate, "10", "the handoff tax override is preserved");
  assertTotal(editorTotal(draft), 29.7, "the editor total equals the finished total $29.70, not $33.00");
});

test("intake draft builder carries a fractional discount verbatim", () => {
  const invoice = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    discountAmount: 2.7,
    total: 97.3
  };
  const draft = buildDraftFromInvoice(invoice, "0");
  assert.equal(draft.discountAmount, "2.7", "the recorded discount crosses in string form, unaltered");
  assertTotal(editorTotal(draft), 97.3, "the rebuilt total matches the finished total");
});

test("intake draft builder: a discount with no tax rebuilds at the discounted total", () => {
  const invoice = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    discountAmount: 10,
    total: 90
  };
  const draft = buildDraftFromInvoice(invoice, "0");
  assert.equal(Number(draft.discountAmount), 10);
  assertTotal(editorTotal(draft), 90, "no phantom tax is invented and the discount survives");
});

test("intake draft builder: a fully discounted invoice rebuilds at zero", () => {
  const invoice = {
    lineItems: [{ id: "line_1", description: "Goodwill", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    discountAmount: 100,
    total: 0
  };
  const draft = buildDraftFromInvoice(invoice, "10");
  assert.equal(Number(draft.discountAmount), 100);
  assertTotal(editorTotal(draft), 0, "a fully discounted invoice rebuilds at zero even with a tax rate");
});

test("intake draft builder: unaffected shapes build exactly as before (no discount recorded)", () => {
  const taxedNoDiscount = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    total: 110
  };
  const draftTaxed = buildDraftFromInvoice(taxedNoDiscount, "10.00");
  assert.equal(draftTaxed.taxRate, "10.00", "the tax override passes through unchanged");
  assert.equal(
    Number(draftTaxed.discountAmount ?? "0"),
    0,
    "no discount is invented when none was recorded"
  );
  assertTotal(editorTotal(draftTaxed), 110, "no-discount taxed invoice rebuilds at its total");

  const plainInvoice = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    total: 100
  };
  const draftPlain = buildDraftFromInvoice(plainInvoice);
  assert.equal(Number(draftPlain.discountAmount ?? "0"), 0);
  assertTotal(editorTotal(draftPlain), 100, "plain invoice rebuilds at its total");
});
