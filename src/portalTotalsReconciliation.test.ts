import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { normalizeInvoice } from "./lib/invoiceMath.js";
import type { FinishedInvoice } from "./models/invoice.js";

// Audit loop 2026-11-04, findings NB-D-01 (P1), NB-A-04 (P2) and S53-6E
// (P2), all PROVEN at ed145761 by an executed repro (7 divergences):
//   - NB-D-01: the client portal rendered a line with quantity 2 x $10
//     and no stored amount as $0.00 (the contract derives $20), and a
//     record with status "paid" but a $24.70 balance as "Paid in full"
//     beside that balance.
//   - NB-A-04: the editor canvas summed raw qty x rate with no per-line
//     cent rounding (3 x $10.004 -> subtotal $30.012, contract $30.00)
//     and totalled ALL rows while its payload builders send only rows
//     with a description (editor total $150 vs stored total $100).
//   - S53-6E: the inspector's fallback totals ignored the discount
//     ($30 + 10% tax -> $33 instead of $29.70) and defaulted the balance
//     to the full total with amountPaid $0 alongside $20 of payments.
// The fix is one shared computation, public/utils/invoiceMoney.js,
// mirroring src/lib/invoiceMath.ts and consumed by all three surfaces.
// These tests load the real shared module, slice the real surface
// sources (the source-slice pattern of libraryOpenBalance.test.ts),
// and score them against the real normalizeInvoice contract.

type MoneyUtils = {
  roundToCents: (value: unknown) => number;
  resolveLineAmount: (item: unknown) => number;
  computeInvoiceTotals: (input: {
    lineItems?: unknown[];
    discountAmount?: unknown;
    taxRate?: unknown;
    paymentRecords?: unknown[];
  }) => {
    subtotal: number;
    discountAmount: number;
    discountedSubtotal: number;
    taxAmount: number;
    total: number;
    amountPaid: number;
    balanceDue: number;
  };
};

function loadMoneyUtils(): MoneyUtils {
  const windowObj: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = { window: windowObj, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync("public/utils/invoiceMoney.js", "utf8"), sandbox, {
    filename: "public/utils/invoiceMoney.js"
  });
  const utils = windowObj.InvoiceMoneyUtils as MoneyUtils;
  assert.ok(utils?.computeInvoiceTotals, "invoiceMoney.js must expose InvoiceMoneyUtils");
  return utils;
}

const money = loadMoneyUtils();

function finished(lineItems: unknown[], extra: Record<string, unknown> = {}): FinishedInvoice {
  return {
    lineItems,
    paymentRecords: [],
    paymentMethods: [],
    monetaryRevision: 0,
    paymentLinks: [],
    unmatchedPayments: [],
    ...extra
  } as unknown as FinishedInvoice;
}

test("shared line amounts match the invoiceMath contract (explicit amount wins, derivation, cent rounding)", () => {
  const cases: Array<{ line: Record<string, unknown>; expected: number }> = [
    { line: { description: "W", quantity: 2, unitPrice: 10 }, expected: 20 },
    { line: { description: "W", quantity: 2, unitPrice: 10, amount: 15 }, expected: 15 },
    { line: { description: "W", quantity: 1, unitPrice: 10.004 }, expected: 10 },
    { line: { description: "W", quantity: 3, unitPrice: 10.333 }, expected: 31 },
    { line: { description: "W" }, expected: 0 }
  ];
  for (const { line, expected } of cases) {
    assert.equal(money.resolveLineAmount(line), expected, `shared resolver for ${JSON.stringify(line)}`);
    assert.equal(
      normalizeInvoice(finished([line])).lineItems[0].amount ?? 0,
      expected,
      `contract amount for ${JSON.stringify(line)}`
    );
  }
  // Editor shape: qty / rate as strings resolve identically.
  assert.equal(money.resolveLineAmount({ qty: "2", rate: "10" }), 20);
  assert.equal(money.resolveLineAmount({ qty: "1", rate: "10.004" }), 10);
  assert.equal(money.resolveLineAmount({ qty: "", rate: "" }), 0);
});

test("shared totals match normalizeInvoice wherever the contract defines the figure (no-tax shapes)", () => {
  const shapes: Array<{ lines: unknown[]; discountAmount?: number }> = [
    { lines: [{ description: "A", quantity: 1, unitPrice: 10.004 }, { description: "B", quantity: 1, unitPrice: 10.004 }, { description: "C", quantity: 1, unitPrice: 10.004 }] },
    { lines: [{ description: "A", quantity: 2, unitPrice: 25 }, { description: "B", amount: 15 }], discountAmount: 5 },
    { lines: [{ description: "A", quantity: 1, unitPrice: 30 }], discountAmount: 40 }
  ];
  for (const shape of shapes) {
    const contract = normalizeInvoice(finished(shape.lines, { discountAmount: shape.discountAmount }));
    const shared = money.computeInvoiceTotals({ lineItems: shape.lines, discountAmount: shape.discountAmount });
    assert.equal(shared.subtotal, contract.subtotal, "subtotal parity");
    assert.equal(shared.total, contract.total, "total parity");
  }
});

test("shared totals: discount before tax, balance net of payments (the audit worked example)", () => {
  const totals = money.computeInvoiceTotals({
    lineItems: [
      { description: "A", quantity: 1, unitPrice: 10 },
      { description: "B", quantity: 1, unitPrice: 10 },
      { description: "C", quantity: 1, unitPrice: 10 }
    ],
    discountAmount: 3,
    taxRate: 10,
    paymentRecords: [{ amount: 5 }]
  });
  assert.equal(totals.subtotal, 30);
  assert.equal(totals.discountAmount, 3);
  assert.equal(totals.taxAmount, 2.7);
  assert.equal(totals.total, 29.7);
  assert.equal(totals.amountPaid, 5);
  assert.equal(totals.balanceDue, 24.7);
});

// ---------- Editor canvas (NB-A-04) ----------

const canvasSource = readFileSync("public/features/manual/manualInvoiceCanvas.jsx", "utf8");

test("NB-A-04: canvas line amounts are cent-rounded through the shared resolver", () => {
  const slice = canvasSource.slice(
    canvasSource.indexOf("  const getLineAmount ="),
    canvasSource.indexOf("  const explicitFreeSentence =")
  );
  assert.ok(slice.includes("resolveLineAmount"), "canvas slice must contain the shared getLineAmount");
  const ctx: Record<string, unknown> = { resolveLineAmount: money.resolveLineAmount };
  vm.runInNewContext(`${slice}\nthis.getLineAmount = getLineAmount;`, ctx);
  const getLineAmount = ctx.getLineAmount as (item: unknown) => number;
  assert.equal(getLineAmount({ qty: "1", rate: "10.004" }), 10);
  assert.equal(getLineAmount({ qty: "3", rate: "10.333" }), 31);
});

test("NB-A-04: canvas totals run over described rows only, via the shared computation", () => {
  assert.ok(
    canvasSource.includes("computeInvoiceTotals({"),
    "canvas must compute totals through InvoiceMoneyUtils.computeInvoiceTotals"
  );
  assert.ok(
    canvasSource.includes("lineItems: describedLines"),
    "canvas totals must be computed over describedLines (the payload rows)"
  );
  assert.ok(
    !canvasSource.includes("lineItems.reduce((sum, item) => sum + getLineAmount(item), 0)"),
    "the old all-rows subtotal reduce must be gone"
  );
});

// ---------- Inspector preview fallback (S53-6E) ----------

const inspectorSource = readFileSync("public/features/manual/inspectorPanel.jsx", "utf8");

function runInspectorFallback(previewData: unknown, parsedLineItems: unknown, paymentRecords: unknown, props: Record<string, unknown> = {}) {
  const slice = inspectorSource.slice(
    inspectorSource.indexOf("  const previewPaymentRecords ="),
    inspectorSource.indexOf("  const previewLatestPayment =")
  );
  assert.ok(slice.includes("fallbackTotals"), "inspector slice must contain the shared fallback totals");
  const ctx: Record<string, unknown> = {
    previewData,
    parsedLineItems,
    paymentRecords,
    computeInvoiceTotals: money.computeInvoiceTotals,
    previewItems: [{}],
    taxRate: props.taxRate ?? "",
    discountAmount: props.discountAmount ?? ""
  };
  vm.createContext(ctx);
  vm.runInContext(
    `${slice}\nthis.out = { previewSubtotal, previewTaxAmount, previewTotal, previewBalanceDue, previewAmountPaid, previewPaymentsTotal };`,
    ctx
  );
  return ctx.out as Record<string, number>;
}

test("S53-6E: inspector fallback applies the discount before tax", () => {
  const out = runInspectorFallback(
    { discountAmount: 3, taxRate: "10" },
    [{ id: "l1", description: "Work", hasDescription: true, qty: 1, rate: 30, amount: 30 }],
    []
  );
  assert.equal(out.previewSubtotal, 30);
  assert.equal(out.previewTaxAmount, 2.7);
  assert.equal(out.previewTotal, 29.7);
  assert.equal(out.previewBalanceDue, 29.7);
});

test("S53-6E: inspector fallback balance and amount paid agree with the payment records", () => {
  const out = runInspectorFallback(
    { taxRate: "0" },
    [{ id: "l1", description: "Work", hasDescription: true, qty: 1, rate: 100, amount: 100 }],
    [{ amount: 20 }]
  );
  assert.equal(out.previewTotal, 100);
  assert.equal(out.previewBalanceDue, 80);
  assert.equal(out.previewAmountPaid, 20);
  assert.equal(out.previewPaymentsTotal, 20);
});

test("S53-6E: inspector fallback excludes rows without a description and honours the tax/discount props", () => {
  const out = runInspectorFallback(
    {},
    [
      { id: "l1", description: "Work", hasDescription: true, qty: 1, rate: 30, amount: 30 },
      { id: "l2", description: "Untitled line item", hasDescription: false, qty: 1, rate: 50, amount: 50 }
    ],
    [],
    { taxRate: "10", discountAmount: "3" }
  );
  assert.equal(out.previewSubtotal, 30, "the undescribed $50 row stays out of the fallback subtotal");
  assert.equal(out.previewTotal, 29.7);
});

test("S53-6E: a supplied balance without amountPaid still derives amount paid from total - balance", () => {
  const out = runInspectorFallback(
    { total: 100, balanceDue: 80, taxRate: "0" },
    [{ id: "l1", description: "Work", hasDescription: true, qty: 1, rate: 100, amount: 100 }],
    []
  );
  assert.equal(out.previewBalanceDue, 80);
  assert.equal(out.previewAmountPaid, 20);
});

test("S53-6E: finite canvas-supplied totals still bypass the fallback unchanged", () => {
  const out = runInspectorFallback(
    { subtotal: 999, taxAmount: 1, total: 1000, balanceDue: 900, amountPaid: 100, taxRate: "10" },
    [{ id: "l1", description: "Work", hasDescription: true, qty: 1, rate: 30, amount: 30 }],
    [{ amount: 20 }]
  );
  assert.equal(out.previewSubtotal, 999);
  assert.equal(out.previewTaxAmount, 1);
  assert.equal(out.previewTotal, 1000);
  assert.equal(out.previewBalanceDue, 900);
  assert.equal(out.previewAmountPaid, 100);
});

test("S53-6E: inspector parsed line amounts are cent-rounded and flag described rows", () => {
  const slice = inspectorSource.slice(
    inspectorSource.indexOf("  const parsedLineItems ="),
    inspectorSource.indexOf("  const previewItems =")
  );
  assert.ok(slice.includes("resolveLineAmount"), "inspector slice must resolve amounts via the shared helper");
  const ctx: Record<string, unknown> = {
    previewLineItems: [
      { id: "l1", description: "Work", qty: "1", rate: "10.004" },
      { id: "l2", description: "", qty: "1", rate: "50" }
    ],
    polishLineItemDescription: (text: string) => text ?? "",
    resolveLineAmount: money.resolveLineAmount
  };
  vm.runInNewContext(`${slice}\nthis.parsed = parsedLineItems;`, ctx);
  const parsed = ctx.parsed as Array<{ amount: number | null; hasDescription: boolean }>;
  assert.equal(parsed[0].amount, 10);
  assert.equal(parsed[0].hasDescription, true);
  assert.equal(parsed[1].hasDescription, false);
});

// ---------- Client portal (NB-D-01) ----------

const portalSource = readFileSync("public/features/portal/clientPortal.jsx", "utf8");

function runPortalHeader(invoice: unknown) {
  const slice = portalSource.slice(
    portalSource.indexOf("    const finishedInvoice ="),
    portalSource.indexOf("    const nextStepBody =")
  );
  assert.ok(slice.includes("resolveLineAmount"), "portal slice must use the shared line resolver");
  const ctx: Record<string, unknown> = {
    invoice,
    resolveLineAmount: money.resolveLineAmount,
    roundToCents: money.roundToCents
  };
  vm.runInNewContext(
    `${slice}\nthis.out = { total, balanceDue, isPaid, nextStepTitle };`,
    ctx
  );
  return ctx.out as { total: number; balanceDue: number; isPaid: boolean; nextStepTitle: string };
}

function portalInvoice(status: string, finishedInvoice: Record<string, unknown>) {
  return { status, invoiceData: { structuredInvoice: {}, finishedInvoice } };
}

test("NB-D-01: a 'paid' status with a positive balance is not presented as paid in full", () => {
  const out = runPortalHeader(portalInvoice("paid", { total: 29.7, balanceDue: 24.7, lineItems: [] }));
  assert.equal(out.balanceDue, 24.7);
  assert.equal(out.isPaid, false);
  assert.notEqual(out.nextStepTitle, "Paid in full");
});

test("NB-D-01: a zero balance is paid in full whatever the status label says", () => {
  const paid = runPortalHeader(portalInvoice("paid", { total: 29.7, balanceDue: 0, lineItems: [] }));
  assert.equal(paid.isPaid, true);
  assert.equal(paid.nextStepTitle, "Paid in full");
  const sent = runPortalHeader(portalInvoice("sent", { total: 100, balanceDue: 0, lineItems: [] }));
  assert.equal(sent.isPaid, true);
});

test("NB-D-01: missing totals are re-derived from the lines with the shared rules", () => {
  const out = runPortalHeader(
    portalInvoice("sent", { lineItems: [{ description: "Work", quantity: 2, unitPrice: 10 }] })
  );
  assert.equal(out.total, 20, "qty 2 x $10 with no stored amount or total derives $20, not $0");
  assert.equal(out.balanceDue, 20);
  assert.equal(out.isPaid, false);
});

test("NB-D-01: portal line rows render the shared resolved amount", () => {
  assert.ok(
    portalSource.includes("{formatMoney(resolveLineAmount(item))}"),
    "portal line rows must render resolveLineAmount(item)"
  );
  assert.ok(!portalSource.includes("formatMoney(0)"), "the old $0 substitution must be gone");
  assert.equal(money.resolveLineAmount({ quantity: 2, unitPrice: 10 }), 20);
});

test("the shared money module loads before every surface that consumes it", () => {
  const indexHtml = readFileSync("public/index.html", "utf8");
  const utilIndex = indexHtml.indexOf("/utils/invoiceMoney.js");
  assert.ok(utilIndex > -1, "index.html must load invoiceMoney.js");
  for (const consumer of [
    "/dist/features/manual/manualInvoiceCanvas.js",
    "/dist/features/manual/inspectorPanel.js",
    "/dist/features/portal/clientPortal.js"
  ]) {
    assert.ok(utilIndex < indexHtml.indexOf(consumer), `invoiceMoney.js must load before ${consumer}`);
  }
});
