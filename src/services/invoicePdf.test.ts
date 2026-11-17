/**
 * Covers: src/services/invoicePdf.ts (buildPdfFilename, createInvoicePdfBuffer)
 * Priority area: PDF / export data shaping — filename mapping and render-input shaping.
 * Synthetic invoices only; asserts on filename rules and extracted PDF text shaping, not visual snapshots.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse";
import { buildPdfFilename, createInvoicePdfBuffer } from "./invoicePdf.js";
import type { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";

function line(partial: Partial<InvoiceLineItem> & { description: string }): InvoiceLineItem {
  return {
    type: "other",
    ...partial
  } as InvoiceLineItem;
}

function finished(extra: Partial<FinishedInvoice> = {}): FinishedInvoice {
  return {
    documentType: "invoice",
    invoiceNumber: "NB-1001",
    issueDate: "2026-03-01",
    dueDate: "2026-03-15",
    customerName: "Synthetic Client Co",
    currency: "USD",
    lineItems: [
      line({
        id: "line_1",
        type: "labor",
        description: "Install fixtures",
        quantity: 2,
        unitPrice: 50,
        amount: 100
      })
    ],
    notes: "Thank you for your business.",
    discountAmount: 0,
    subtotal: 100,
    total: 100,
    balanceDue: 100,
    paymentRecords: [],
    paymentMethods: [],
    monetaryRevision: 0,
    paymentLinks: [],
    unmatchedPayments: [],
    ...extra
  } as FinishedInvoice;
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const parsed = await pdfParse(buffer);
  return { text: parsed.text, pages: parsed.numpages };
}

test("buildPdfFilename maps invoice vs estimate prefixes and sanitises the number", () => {
  assert.equal(buildPdfFilename("NB-1001"), "Invoice-NB-1001.pdf");
  assert.equal(buildPdfFilename("NB-1001", "invoice"), "Invoice-NB-1001.pdf");
  assert.equal(buildPdfFilename("EST-9", "estimate"), "Estimate-EST-9.pdf");

  // Spaces / punctuation → single dashes; leading/trailing dashes stripped
  assert.equal(buildPdfFilename("  Acme Invoice #12!  "), "Invoice-Acme-Invoice-12.pdf");
  assert.equal(buildPdfFilename("---"), "Invoice-Draft.pdf");
  assert.equal(buildPdfFilename(""), "Invoice-Draft.pdf");
  assert.equal(buildPdfFilename(undefined, "estimate"), "Estimate-Draft.pdf");
  assert.equal(buildPdfFilename("   ", "estimate"), "Estimate-Draft.pdf");
});

test("createInvoicePdfBuffer shapes a valid single-page invoice PDF with mapped fields", async () => {
  const buffer = await createInvoicePdfBuffer({
    invoice: finished(),
    fromDetails: "NoteBill Studio\n123 Synthetic Ave",
    billToDetails: "Synthetic Client Co\n456 Fixture Rd"
  });

  assert.ok(buffer.length > 500, "PDF buffer should be non-trivial");
  assert.equal(buffer.subarray(0, 5).toString("utf8"), "%PDF-");

  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 1);

  const { text, pages } = await extractPdfText(buffer);
  assert.equal(pages, 1);
  assert.match(text, /INVOICE/);
  assert.match(text, /Invoice #/);
  assert.match(text, /NB-1001/);
  assert.match(text, /NoteBill Studio/);
  assert.match(text, /Synthetic Client Co/);
  assert.match(text, /Install fixtures/);
  assert.match(text, /\$100\.00/);
  assert.match(text, /2026-03-01/);
  assert.match(text, /2026-03-15/);
  assert.match(text, /Thank you for your business\./);
});

test("estimate documentType labels the PDF and filename as Estimate", async () => {
  const invoice = finished({ documentType: "estimate", invoiceNumber: "E-42" });
  assert.equal(buildPdfFilename(invoice.invoiceNumber, invoice.documentType), "Estimate-E-42.pdf");

  const buffer = await createInvoicePdfBuffer({ invoice });
  const { text } = await extractPdfText(buffer);
  assert.match(text, /ESTIMATE/);
  assert.match(text, /Estimate #/);
  assert.match(text, /E-42/);
  assert.doesNotMatch(text, /INVOICE/);
});

test("missing optional due date and hidden notes are omitted from the shaped PDF", async () => {
  const withDue = await createInvoicePdfBuffer({
    invoice: finished({ dueDate: "2026-03-15", notes: "Keep this note." })
  });
  const withDueText = (await extractPdfText(withDue)).text;
  assert.match(withDueText, /2026-03-15/);
  assert.match(withDueText, /Keep this note\./);

  const withoutDue = await createInvoicePdfBuffer({
    invoice: finished({ dueDate: "   ", notes: "Secret note." }),
    notesVisible: false
  });
  const text = (await extractPdfText(withoutDue)).text;
  assert.doesNotMatch(text, /2026-03-15/);
  assert.doesNotMatch(text, /Secret note\./);
  // Issue date still present; blank due date falls back to empty (not "Not set")
  assert.match(text, /2026-03-01/);
});

test("multi-type line items group into Labor/Materials/Other when both labor and materials exist", async () => {
  const invoice = finished({
    lineItems: [
      line({
        id: "l1",
        type: "labor",
        description: "Crew hours",
        quantity: 3,
        unitPrice: 40,
        amount: 120
      }),
      line({
        id: "m1",
        type: "material",
        description: "Copper pipe",
        quantity: 4,
        unitPrice: 12.5,
        amount: 50
      }),
      line({
        id: "o1",
        type: "other",
        description: "Permit fee",
        quantity: 1,
        unitPrice: 25,
        amount: 25
      })
    ],
    subtotal: 195,
    total: 195,
    balanceDue: 195
  });

  const buffer = await createInvoicePdfBuffer({ invoice });
  const { text } = await extractPdfText(buffer);
  assert.match(text, /Labor/);
  assert.match(text, /Materials/);
  assert.match(text, /Other/);
  assert.match(text, /Crew hours/);
  assert.match(text, /Copper pipe/);
  assert.match(text, /Permit fee/);
  assert.match(text, /\$120\.00/);
  assert.match(text, /\$50\.00/);
  assert.match(text, /\$25\.00/);
  assert.match(text, /\$195\.00/);
});

test("discount shaping surfaces a negative discount row and preserves balance due", async () => {
  const invoice = finished({
    discountAmount: 15,
    subtotal: 100,
    total: 85,
    balanceDue: 85
  });
  const buffer = await createInvoicePdfBuffer({ invoice });
  const { text } = await extractPdfText(buffer);
  assert.match(text, /Discount/);
  assert.match(text, /-\$15\.00/);
  assert.match(text, /\$85\.00/);
});

test("draft invoice number and missing issue date use the documented fallbacks", async () => {
  const invoice = finished({
    invoiceNumber: "  ",
    issueDate: undefined
  });
  const buffer = await createInvoicePdfBuffer({
    invoice,
    fromDetails: ""
  });
  const { text } = await extractPdfText(buffer);
  assert.match(text, /Draft/);
  assert.match(text, /Not set/);
  assert.match(text, /Your Business/);
  assert.equal(buildPdfFilename(invoice.invoiceNumber), "Invoice-Draft.pdf");
});
