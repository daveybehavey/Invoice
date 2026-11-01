import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";
import request from "supertest";

// SEC-06 (S52-5 / S63-3 §1 / S66-6): tokenized portal access is scoped to the
// single invoice identified by the (invoiceId, token) pair. The portal must
// never list, infer, or expose another invoice — including another invoice
// of the same owner whose customer name matches after trim/lowercase
// normalization. The portal contract therefore always returns history: []
// while the token pair continues to gate the invoice itself.

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-sec06-portal-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-sec06-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-sec06-ffh-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-rev-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-sec06-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-sec06-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";

const { app } = await import("./server.js");

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

let invoiceCounter = 0;

type InvoiceSpec = {
  finishedName?: string | null;
  structuredName?: string | null;
  total?: number;
  dueDate?: string;
};

async function saveInvoice(ownerId: string, spec: InvoiceSpec = {}): Promise<string> {
  invoiceCounter += 1;
  const invoiceNumber = `INV-SEC06-${invoiceCounter}`;
  const finishedInvoice: Record<string, unknown> = {
    invoiceNumber,
    issueDate: "2026-03-11",
    currency: "USD",
    lineItems: [
      { id: `line-${invoiceCounter}`, type: "labor", description: "Portal work", quantity: 1, unitPrice: 100, amount: 100 }
    ],
    subtotal: 100,
    total: spec.total ?? 100,
    balanceDue: spec.total ?? 100
  };
  if (spec.finishedName !== undefined && spec.finishedName !== null) {
    finishedInvoice.customerName = spec.finishedName;
  }
  if (spec.dueDate) {
    finishedInvoice.dueDate = spec.dueDate;
  }
  const structuredInvoice: Record<string, unknown> = { workSessions: [], materials: [] };
  if (spec.structuredName !== undefined && spec.structuredName !== null) {
    structuredInvoice.customerName = spec.structuredName;
  }
  const response = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      sourceNote: `Portal work completed for invoice ${invoiceNumber}`,
      invoiceData: { structuredInvoice, finishedInvoice }
    });
  assert.equal(response.status, 200);
  return response.body.invoice.invoiceId as string;
}

async function createPortalLink(ownerId: string, invoiceId: string, refresh = false): Promise<string> {
  const response = await request(app)
    .post(`/api/invoices/${invoiceId}/client-portal-link`)
    .set("x-invoice-user-id", ownerId)
    .send(refresh ? { refresh: true } : {});
  assert.equal(response.status, 200);
  const url = new URL(response.body.clientPortalUrl as string);
  const segments = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1]);
}

function getPortal(invoiceId: string, token?: string) {
  const query = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
  return request(app).get(`/api/public/invoices/${invoiceId}/portal${query}`);
}

test("SEC-06: distinct same-owner customers with names matching after trim/lowercase never leak", async () => {
  const ownerId = "sec06-owner-distinct-customers";
  const firstInvoiceId = await saveInvoice(ownerId, { finishedName: "Pool Client", total: 111 });
  const secondInvoiceId = await saveInvoice(ownerId, {
    finishedName: " pool client ",
    total: 9876,
    dueDate: "2026-12-24"
  });

  const token = await createPortalLink(ownerId, firstInvoiceId);
  const response = await getPortal(firstInvoiceId, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.history, []);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(secondInvoiceId), false, "second invoice ID must not appear");
  assert.equal(serialized.includes("9876"), false, "second invoice total must not appear");
  assert.equal(serialized.includes("2026-12-24"), false, "second invoice due date must not appear");
  assert.equal(serialized.includes("INV-SEC06-2"), false, "second invoice number must not appear");
});

test("SEC-06: an established same-customer pair still returns an empty history", async () => {
  const ownerId = "sec06-owner-same-customer";
  const firstInvoiceId = await saveInvoice(ownerId, { finishedName: "Repeat Customer" });
  const secondInvoiceId = await saveInvoice(ownerId, { finishedName: "Repeat Customer" });

  const token = await createPortalLink(ownerId, firstInvoiceId);
  const response = await getPortal(firstInvoiceId, token);
  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.invoiceId, firstInvoiceId);
  assert.deepEqual(response.body.history, []);
  assert.equal(JSON.stringify(response.body).includes(secondInvoiceId), false);
});

test("SEC-06: name variants across two invoices never produce history", async () => {
  const variants: Array<[string, string]> = [
    ["Pool Client", "Pool Client"],
    ["Pool Client", "POOL CLIENT"],
    ["Pool Client", "\tPool Client\n"],
    ["Pool  Client", "Pool Client"],
    ["Pool Client!", "Pool Client"],
    ["Café Client", "Café Client"],
    ["Café Client", "Café Client"]
  ];
  for (const [firstName, secondName] of variants) {
    const ownerId = `sec06-owner-variant-${randomUUID()}`;
    const firstInvoiceId = await saveInvoice(ownerId, { finishedName: firstName });
    await saveInvoice(ownerId, { finishedName: secondName });
    const token = await createPortalLink(ownerId, firstInvoiceId);
    const response = await getPortal(firstInvoiceId, token);
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.history,
      [],
      `history must be empty for ${JSON.stringify(firstName)} vs ${JSON.stringify(secondName)}`
    );
  }
});

test("SEC-06: empty, whitespace, and absent names never produce history", async () => {
  const ownerId = "sec06-owner-blank-names";
  const blankFirst = await saveInvoice(ownerId, { finishedName: "" });
  await saveInvoice(ownerId, { finishedName: "" });
  const blankToken = await createPortalLink(ownerId, blankFirst);
  const blankResponse = await getPortal(blankFirst, blankToken);
  assert.equal(blankResponse.status, 200);
  assert.deepEqual(blankResponse.body.history, []);

  const whitespaceFirst = await saveInvoice(ownerId, { finishedName: "   " });
  await saveInvoice(ownerId, { finishedName: "   " });
  const whitespaceToken = await createPortalLink(ownerId, whitespaceFirst);
  const whitespaceResponse = await getPortal(whitespaceFirst, whitespaceToken);
  assert.equal(whitespaceResponse.status, 200);
  assert.deepEqual(whitespaceResponse.body.history, []);
});

test("SEC-06: a finished-name-absent invoice falling back to its structured name does not link invoices", async () => {
  const ownerId = "sec06-owner-fallback-name";
  const firstInvoiceId = await saveInvoice(ownerId, { finishedName: null, structuredName: "Fallback Client" });
  const secondInvoiceId = await saveInvoice(ownerId, { finishedName: "Fallback Client" });

  const token = await createPortalLink(ownerId, firstInvoiceId);
  const response = await getPortal(firstInvoiceId, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.history, []);
  assert.equal(JSON.stringify(response.body).includes(secondInvoiceId), false);
});

test("SEC-06: matching names across different owners never produce history", async () => {
  const firstInvoiceId = await saveInvoice("sec06-owner-alpha", { finishedName: "Shared Name" });
  await saveInvoice("sec06-owner-beta", { finishedName: "Shared Name" });

  const token = await createPortalLink("sec06-owner-alpha", firstInvoiceId);
  const response = await getPortal(firstInvoiceId, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.history, []);
});

test("SEC-06: pair enforcement — wrong pair and invalid pairs 404, missing token 400", async () => {
  const ownerId = "sec06-owner-pairs";
  const firstInvoiceId = await saveInvoice(ownerId, { finishedName: "Pair Client" });
  const secondInvoiceId = await saveInvoice(ownerId, { finishedName: "Pair Client" });
  const firstToken = await createPortalLink(ownerId, firstInvoiceId);
  await createPortalLink(ownerId, secondInvoiceId);

  const valid = await getPortal(firstInvoiceId, firstToken);
  assert.equal(valid.status, 200);

  const crossPair = await getPortal(secondInvoiceId, firstToken);
  assert.equal(crossPair.status, 404, "invoice B with invoice A's token must not resolve");

  const missingToken = await getPortal(firstInvoiceId);
  assert.equal(missingToken.status, 400);

  const invalidPair = await getPortal(firstInvoiceId, randomUUID());
  assert.equal(invalidPair.status, 404);
});

test("SEC-06: refresh rotates the token and reuse without refresh returns the same token", async () => {
  const ownerId = "sec06-owner-refresh";
  const invoiceId = await saveInvoice(ownerId, { finishedName: "Refresh Client" });

  const firstToken = await createPortalLink(ownerId, invoiceId);
  const reusedToken = await createPortalLink(ownerId, invoiceId);
  assert.equal(reusedToken, firstToken, "minting without refresh must reuse the existing token");

  const refreshedToken = await createPortalLink(ownerId, invoiceId, true);
  assert.notEqual(refreshedToken, firstToken);

  const oldTokenResponse = await getPortal(invoiceId, firstToken);
  assert.equal(oldTokenResponse.status, 404, "the pre-refresh token must stop working");

  const newTokenResponse = await getPortal(invoiceId, refreshedToken);
  assert.equal(newTokenResponse.status, 200);
  assert.equal(newTokenResponse.body.invoice.invoiceId, invoiceId);
});

test("SEC-06: the authorized invoice keeps its own projection and payment fields", async () => {
  const ownerId = "sec06-owner-projection";
  const invoiceId = await saveInvoice(ownerId, { finishedName: "Projection Client", total: 321 });
  const token = await createPortalLink(ownerId, invoiceId);

  const response = await getPortal(invoiceId, token);
  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.invoiceId, invoiceId);
  assert.equal(response.body.invoice.invoiceData.finishedInvoice.customerName, "Projection Client");
  assert.equal(response.body.invoice.invoiceData.finishedInvoice.total, 321);
  assert.equal(response.body.invoice.invoiceData.finishedInvoice.balanceDue, 321);
  assert.deepEqual(response.body.history, []);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("sourceNote"), false, "internal source notes stay out of the portal");
});
