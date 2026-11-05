import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

// Audit loop 2026-11-04, finding NEW-5 (P2, CONFIRMED by the build-lane
// follow-up): reopening a finished invoice that carries BOTH a discount
// and tax rebuilds wrong in the editor. Two defects compose:
//   (a) buildDraftFromFinishedInvoice (public/features/intake/readiness.js)
//       never copies the finished invoice's recorded discountAmount into
//       the rebuilt draft, and
//   (b) deriveTaxRate (public/features/library/invoiceLibrary.jsx and the
//       identical copy in public/launcher.jsx) infers the rate as
//       (total - subtotal) / subtotal, which reads "0" whenever a discount
//       pulls the total at or below the subtotal — the true rate is lost.
// Worked example from the audit: subtotal $100, discountAmount $10, true
// tax 10%, finished total $99. At base the reopened draft has taxRate "0"
// and no discount at all, so the editor shows $100, not $99.
//
// These tests slice the real deriveTaxRate copies out of their .jsx
// sources (the source-slice pattern of libraryOpenBalance.test.ts), load
// the real buildDraftFromFinishedInvoice by evaluating the real frontend
// modules in a vm (the audit repro's approach), compose the reopen exactly
// as openSavedInvoice / handleResumeSavedDraft do, and score the result
// with the editor's own totals formulas from manualInvoiceCanvas.jsx
// (subtotal = sum(qty * rate); effectiveDiscount = min(subtotal,
// max(0, discount)); total = (subtotal - discount) * (1 + taxRate / 100)).

const librarySource = readFileSync("public/features/library/invoiceLibrary.jsx", "utf8");
const libraryDeriveSlice = librarySource.slice(
  librarySource.indexOf("  const deriveTaxRate ="),
  librarySource.indexOf("  const persistSkipConfirm =")
);
assert.ok(libraryDeriveSlice.includes("deriveTaxRate"), "library slice must contain deriveTaxRate");

const launcherSource = readFileSync("public/launcher.jsx", "utf8");
const launcherDeriveSlice = launcherSource.slice(
  launcherSource.indexOf("function deriveTaxRate(invoice) {"),
  launcherSource.indexOf("function parseDisplayTimestamp")
);
assert.ok(launcherDeriveSlice.includes("deriveTaxRate"), "launcher slice must contain deriveTaxRate");

function makeDeriveTaxRate(slice: string): (invoice: unknown) => string {
  return (invoice: unknown) =>
    vm.runInNewContext(`${slice}\nderiveTaxRate(${JSON.stringify(invoice ?? null)});`, {});
}

const libraryTaxRate = makeDeriveTaxRate(libraryDeriveSlice);
const launcherTaxRate = makeDeriveTaxRate(launcherDeriveSlice);

type Draft = {
  taxRate: string;
  discountAmount?: unknown;
  lineItems: Array<{ qty: string; rate: string }>;
};

function loadBuildDraft(): (invoice: unknown, options?: unknown) => Draft {
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
    "public/features/intake/readiness.js"
  ]) {
    vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  const utils = windowObj.InvoiceIntakeReadiness as {
    buildDraftFromFinishedInvoice: (invoice: unknown, options?: unknown) => Draft;
  };
  assert.ok(utils?.buildDraftFromFinishedInvoice, "readiness module must expose buildDraftFromFinishedInvoice");
  return utils.buildDraftFromFinishedInvoice;
}

const buildDraft = loadBuildDraft();

// Compose the reopen exactly as the library's openSavedInvoice does:
// the derived rate is passed in as the draft's taxRate option.
function reopen(finishedInvoice: unknown, deriveTaxRate: (invoice: unknown) => string): Draft {
  return buildDraft(finishedInvoice, { taxRate: deriveTaxRate(finishedInvoice) });
}

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

const discountTaxInvoice = {
  customerName: "Ada Example",
  invoiceNumber: "INV-1001",
  lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
  subtotal: 100,
  discountAmount: 10,
  total: 99
};

test("NEW-5: deriveTaxRate recovers the true rate when a discount is present (library copy)", () => {
  assert.equal(libraryTaxRate(discountTaxInvoice), "10.00");
});

test("NEW-5: deriveTaxRate recovers the true rate when a discount is present (launcher copy)", () => {
  assert.equal(launcherTaxRate(discountTaxInvoice), "10.00");
});

test("NEW-5: reopening a discounted, taxed invoice preserves its discount, rate, and total", () => {
  const draft = reopen(discountTaxInvoice, libraryTaxRate);
  assert.notEqual(draft.discountAmount, undefined, "the rebuilt draft must carry the recorded discount");
  assert.equal(Number(draft.discountAmount), 10, "the carried discount is the recorded $10");
  assert.equal(draft.taxRate, "10.00", "the rebuilt draft carries the true 10% rate");
  assertTotal(editorTotal(draft), 99, "the editor total after reopen equals the finished total");
});

test("NEW-5: a second discount shape (larger base, smaller rate) also reopens faithfully", () => {
  const invoice = {
    lineItems: [
      { id: "line_1", description: "Materials", quantity: 1, unitPrice: 150, amount: 150 },
      { id: "line_2", description: "Labour", quantity: 2, unitPrice: 50, amount: 100 }
    ],
    subtotal: 250,
    discountAmount: 50,
    total: 210
  };
  const draft = reopen(invoice, libraryTaxRate);
  assert.equal(draft.taxRate, "5.00");
  assert.equal(Number(draft.discountAmount), 50);
  assertTotal(editorTotal(draft), 210, "rebuilt total matches the finished total");
});

test("NEW-5: a discount with no tax reopens at the discounted total", () => {
  const invoice = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    discountAmount: 10,
    total: 90
  };
  const draft = reopen(invoice, libraryTaxRate);
  assert.equal(draft.taxRate, "0");
  assertTotal(editorTotal(draft), 90, "no phantom tax is invented and the discount survives");
});

test("NEW-5: unaffected shapes reopen exactly as before (no discount involved)", () => {
  const taxedNoDiscount = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    total: 110
  };
  const draftTaxed = reopen(taxedNoDiscount, libraryTaxRate);
  assert.equal(draftTaxed.taxRate, "10.00", "the long-standing no-discount derivation is unchanged");
  assertTotal(editorTotal(draftTaxed), 110, "no-discount taxed invoice reopens at its total");

  const plainInvoice = {
    lineItems: [{ id: "line_1", description: "Labour", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    total: 100
  };
  const draftPlain = reopen(plainInvoice, libraryTaxRate);
  assert.equal(draftPlain.taxRate, "0");
  assertTotal(editorTotal(draftPlain), 100, "plain invoice reopens at its total");
});

test("NEW-5: degenerate records still derive a zero rate", () => {
  assert.equal(libraryTaxRate(null), "0");
  assert.equal(libraryTaxRate({}), "0");
  assert.equal(libraryTaxRate({ subtotal: 0, total: 0 }), "0");
  assert.equal(launcherTaxRate(null), "0");

  const fullyDiscounted = {
    lineItems: [{ id: "line_1", description: "Goodwill", quantity: 1, unitPrice: 100, amount: 100 }],
    subtotal: 100,
    discountAmount: 100,
    total: 0
  };
  const draft = reopen(fullyDiscounted, libraryTaxRate);
  assert.equal(draft.taxRate, "0", "a fully discounted invoice has no taxable base to derive from");
  assertTotal(editorTotal(draft), 0, "a fully discounted invoice reopens at zero");
});
