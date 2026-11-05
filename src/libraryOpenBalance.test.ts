import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

// Audit loop 2026-11-04, finding NEW-6 (P2 PROVEN): the library's
// getInvoiceOpenBalance fallback chain reads top-level balanceDue,
// nested finishedInvoice.balanceDue, then top-level total — but never
// finishedInvoice.total. A saved invoice whose money lives only in the
// nested finished invoice (total $100, no balance anywhere) therefore
// reads as $0 open. These tests slice the real helper out of
// invoiceLibrary.jsx (the same source-slice pattern as
// firstRunActions.test.ts) and pin the full precedence chain.

const source = readFileSync("public/features/library/invoiceLibrary.jsx", "utf8");
const helper = source.slice(
  source.indexOf("  const getInvoiceOpenBalance ="),
  source.indexOf("  const mergeUpdatedInvoiceMetadata =")
);
assert.ok(helper.includes("getInvoiceOpenBalance"), "helper slice must contain getInvoiceOpenBalance");

function openBalance(invoice: unknown): number {
  return vm.runInNewContext(`${helper}\ngetInvoiceOpenBalance(${JSON.stringify(invoice ?? null)});`, {});
}

test("NEW-6: an invoice whose total exists only on the nested finished invoice reads as open", () => {
  const invoice = { invoiceData: { finishedInvoice: { total: 100 } } };
  assert.equal(openBalance(invoice), 100);
});

test("NEW-6: the pre-existing precedence is unchanged (balance beats total, top level beats nested)", () => {
  assert.equal(openBalance({ balanceDue: 40, total: 100 }), 40, "top-level balanceDue wins");
  assert.equal(
    openBalance({ invoiceData: { finishedInvoice: { balanceDue: 55 } }, total: 100 }),
    55,
    "nested balanceDue beats top-level total"
  );
  assert.equal(openBalance({ total: 100 }), 100, "top-level total is the fallback");
  assert.equal(
    openBalance({ total: 30, invoiceData: { finishedInvoice: { total: 100 } } }),
    30,
    "top-level total precedes the nested total fallback"
  );
  assert.equal(
    openBalance({ balanceDue: 0, invoiceData: { finishedInvoice: { total: 100 } } }),
    0,
    "an explicit zero balance stays zero — it is not replaced by the total"
  );
});

test("NEW-6: degenerate records still read as zero open", () => {
  assert.equal(openBalance({}), 0);
  assert.equal(openBalance(null), 0);
  assert.equal(openBalance({ balanceDue: -5 }), 0, "negative balances clamp to zero");
  assert.equal(openBalance({ invoiceData: { finishedInvoice: { total: "not-a-number" } } }), 0);
});
