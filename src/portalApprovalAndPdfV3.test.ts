import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-v3-portal-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-v3-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-v3-ffh-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-rev-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-v3-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-v3-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";

const { app } = await import("./server.js");
const { createInvoicePdfBuffer } = await import("./services/invoicePdf.js");

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

async function createSavedPortalInvoice(ownerId: string, docType: "invoice" | "estimate") {
  const saveRes = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Sarah Chen", workSessions: [], materials: [] },
        finishedInvoice: {
          documentType: docType,
          invoiceNumber: "INV-V3-TEST",
          issueDate: "2026-11-26",
          customerName: "Sarah Chen",
          currency: "USD",
          lineItems: [
            { id: "l1", type: "labor", description: "Faucet install", quantity: 2, unitPrice: 95, amount: 190 }
          ],
          subtotal: 190,
          total: 190,
          balanceDue: 190,
          paymentMethods: [{ id: "pm_1", kind: "etransfer", label: "Interac e-Transfer", details: "pay@demo.com", enabled: true }],
          jobPhotos: [{ id: "ph_1", dataUrl: TINY_PNG_DATA_URL, stage: "after", caption: "New faucet" }]
        }
      }
    });
  assert.equal(saveRes.status, 200);
  const invoiceId = saveRes.body.invoice.invoiceId as string;

  const portalRes = await request(app)
    .post(`/api/invoices/${invoiceId}/client-portal-link`)
    .set("x-invoice-user-id", ownerId)
    .send({});
  assert.equal(portalRes.status, 200);
  const url = new URL(portalRes.body.clientPortalUrl as string);
  const segments = url.pathname.split("/").filter(Boolean);
  const token = decodeURIComponent(segments[segments.length - 1]);
  return { invoiceId, token };
}

test("POST /api/public/invoices/:id/portal/approve records approval with valid token and rejects invalid token", async () => {
  const { invoiceId, token } = await createSavedPortalInvoice("v3-portal-owner-1", "estimate");

  const badRes = await request(app)
    .post(`/api/public/invoices/${invoiceId}/portal/approve`)
    .send({ token: "wrong-token", approvedBy: "Sarah Chen" });
  assert.equal(badRes.status, 404);

  const okRes = await request(app)
    .post(`/api/public/invoices/${invoiceId}/portal/approve`)
    .send({
      token,
      approvedBy: "Sarah Chen",
      selectedOptionId: "tier_better",
      note: "Tuesday morning works great"
    });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.invoice.invoiceData.finishedInvoice.quoteApproval.approvedBy, "Sarah Chen");
  assert.equal(okRes.body.invoice.invoiceData.finishedInvoice.quoteApproval.selectedOptionId, "tier_better");
  assert.equal(okRes.body.invoice.ownerId, undefined, "public portal payload must never leak ownerId");
});

test("POST /api/public/invoices/:id/portal/payment-notice records non-settling notice without marking paid", async () => {
  const { invoiceId, token } = await createSavedPortalInvoice("v3-portal-owner-2", "invoice");

  const badRes = await request(app)
    .post(`/api/public/invoices/${invoiceId}/portal/payment-notice`)
    .send({ token: "bad-token", method: "Interac e-Transfer" });
  assert.equal(badRes.status, 404);

  const okRes = await request(app)
    .post(`/api/public/invoices/${invoiceId}/portal/payment-notice`)
    .send({ token, method: "Interac e-Transfer", note: "Ref #4821" });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.invoice.status, "draft", "payment notice must never auto-settle status");
  assert.equal(okRes.body.invoice.invoiceData.finishedInvoice.balanceDue, 190);
  assert.equal(
    okRes.body.invoice.invoiceData.finishedInvoice.clientPaymentNotice.method,
    "Interac e-Transfer"
  );
});

test("createInvoicePdfBuffer renders jobPhotos, paymentMethods, quoteApproval, and poweredByVisible cleanly", async () => {
  const pdfWithFooter = await createInvoicePdfBuffer({
    invoice: {
      documentType: "estimate",
      invoiceNumber: "EST-900",
      issueDate: "2026-11-26",
      customerName: "Sarah Chen",
      currency: "USD",
      lineItems: [{ id: "l1", type: "labor", description: "Install", quantity: 1, unitPrice: 120, amount: 120 }],
      paymentRecords: [],
      paymentMethods: [{ id: "pm_1", kind: "etransfer", label: "e-Transfer", details: "pay@demo.com", enabled: true }],
      jobPhotos: [{ id: "ph_1", dataUrl: TINY_PNG_DATA_URL, stage: "after", caption: "Completed" }],
      quoteApproval: { approvedBy: "Sarah Chen", approvedAt: "2026-11-26T12:00:00Z" }
    },
    fromDetails: "Apex Plumbing\napex@example.com",
    poweredByVisible: true
  });
  assert.ok(pdfWithFooter.subarray(0, 5).toString("utf8") === "%PDF-");
  assert.ok(pdfWithFooter.byteLength > 500);
});

test("V3 acquisition tools and pricing SPA routes return V3 HTML and sitemap lists all tool URLs", async () => {
  for (const route of [
    "/pricing",
    "/free-invoice-generator",
    "/contractor-estimate-template",
    "/materials-markup-calculator"
  ]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, `${route} should serve 200 HTML`);
    assert.match(res.headers["content-type"] ?? "", /text\/html/);
    assert.ok(res.text.includes("/v3/assets/"), `${route} HTML must reference V3 hashed assets`);
  }

  const sitemap = await request(app).get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  for (const pathSegment of [
    "/free-invoice-generator",
    "/contractor-estimate-template",
    "/materials-markup-calculator"
  ]) {
    assert.ok(sitemap.text.includes(pathSegment), `sitemap.xml missing ${pathSegment}`);
  }
});
