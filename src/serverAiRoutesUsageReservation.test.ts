import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";

// Audit loop 2026-11-04, finding NEW-2 (P2 PROVEN): the eight JSON AI
// routes carry the SEC-04 session gate (requireProviderDispatchSession)
// but never reserve provider usage, so authenticated JSON AI dispatch is
// not bounded by the provider-usage counters that bound OCR and
// transcription. These tests pin the expected behavior: every JSON AI
// route must pass through reserveProviderUsage (operation class
// "json-ai") before any provider-bound work — 429 once the caller's
// window limit is reached, with no further provider invocation, and 503
// (fail closed, no provider call) when usage enforcement is unavailable.

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-new2-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-new2-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-new2-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-new2-ffh-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-new2-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-new2-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-new2-rev-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-new2-redemption-${randomUUID()}.json`
);
const usageStoreFilePath = path.join(os.tmpdir(), `invoice-new2-usage-${randomUUID()}.json`);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = usageStoreFilePath;
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-new2-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";
delete process.env.INVOICE_REQUIRE_AUTH;

const [{ app }, { setJsonTaskRunnerForTests }, { createAuthSessionForEmail }, { reserveProviderUsage }] =
  await Promise.all([
    import("./server.js"),
    import("./ai/openaiClient.js"),
    import("./services/authSession.js"),
    import("./services/providerUsageGate.js")
  ]);

let jsonTaskCalls = 0;

function useCountingThrowingRunner(): void {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    jsonTaskCalls += 1;
    throw new Error("usage-reservation-probe: pipeline reached the provider boundary");
  });
}

async function resetUsageStore(): Promise<void> {
  // The file backend re-reads the snapshot on every mutation, so
  // removing the file fully resets the gate between tests.
  await fs.rm(usageStoreFilePath, { force: true });
}

function setUsageLimits(perPrincipal: string, application: string): void {
  process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT = perPrincipal;
  process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT = application;
}

function clearUsageLimits(): void {
  delete process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT;
  delete process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT;
}

beforeEach(async () => {
  jsonTaskCalls = 0;
  useCountingThrowingRunner();
  await resetUsageStore();
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

afterEach(() => {
  setJsonTaskRunnerForTests(null);
  clearUsageLimits();
});

const minimalInvoice = {
  currency: "USD",
  lineItems: [{ id: "l1", type: "labor", description: "Sink repair", quantity: 1, unitPrice: 100, amount: 100 }],
  notes: "",
  subtotal: 100,
  total: 100,
  balanceDue: 100
};

const gatedRoutes: Array<{ path: string; body: Record<string, unknown> }> = [
  { path: "/api/invoices/from-input", body: { messyInput: "Jan 10 fixed sink leak 2h @ 95/hr" } },
  {
    path: "/api/invoices/from-input/labor-pricing",
    body: { structuredInvoice: {}, laborPricing: { billingType: "flat", flatAmount: 100 } }
  },
  { path: "/api/invoices/audit", body: { sourceText: "Jan 10 fixed sink leak", structuredInvoice: {} } },
  { path: "/api/invoices/reword-line", body: { invoice: minimalInvoice, lineItemId: "l1" } },
  { path: "/api/invoices/reword-notes", body: { invoice: minimalInvoice } },
  { path: "/api/invoices/reword-descriptions", body: { invoice: minimalInvoice } },
  { path: "/api/invoices/edit", body: { invoice: minimalInvoice, instruction: "Make the wording friendlier" } },
  { path: "/api/invoices/reword-full", body: { invoice: minimalInvoice } }
];

test("NEW-2: a JSON AI route refuses with 429 once the per-principal usage limit is reached", async () => {
  setUsageLimits("1", "100");
  const session = createAuthSessionForEmail("new2-limit@test.dev");
  const headers = { authorization: `Bearer ${session.token}` };
  const body = { invoice: minimalInvoice, instruction: "Make the wording friendlier" };

  const first = await request(app).post("/api/invoices/edit").set(headers).send(body);
  assert.notEqual(first.status, 429, "the first dispatch inside the limit must not be usage-refused");
  assert.equal(jsonTaskCalls, 1, "the admitted request must reach the provider boundary once");

  const second = await request(app).post("/api/invoices/edit").set(headers).send(body);
  assert.equal(second.status, 429, "the request beyond the limit must be refused with 429");
  assert.equal(jsonTaskCalls, 1, "a usage-refused request must not reach the provider");
});

test("NEW-2: the usage limit is shared across all eight JSON AI routes", async () => {
  setUsageLimits("1", "100");
  const session = createAuthSessionForEmail("new2-shared@test.dev");
  const headers = { authorization: `Bearer ${session.token}` };

  const first = await request(app)
    .post("/api/invoices/edit")
    .set(headers)
    .send({ invoice: minimalInvoice, instruction: "Make the wording friendlier" });
  assert.notEqual(first.status, 429);
  assert.equal(jsonTaskCalls, 1);

  for (const route of gatedRoutes) {
    const response = await request(app).post(route.path).set(headers).send(route.body);
    assert.equal(
      response.status,
      429,
      `${route.path} must be usage-refused once the shared JSON AI limit is reached`
    );
  }
  assert.equal(jsonTaskCalls, 1, "no usage-refused route may reach the provider");
});

test("NEW-2: JSON AI routes fail closed with 503 and no provider call when usage enforcement is unavailable", async () => {
  // Corrupt the usage snapshot: every reservation attempt rejects, and
  // the route must refuse service rather than dispatch unenforced.
  await fs.writeFile(usageStoreFilePath, "this is not a usage snapshot\n", "utf8");
  const session = createAuthSessionForEmail("new2-failclosed@test.dev");
  const response = await request(app)
    .post("/api/invoices/edit")
    .set("authorization", `Bearer ${session.token}`)
    .send({ invoice: minimalInvoice, instruction: "Make the wording friendlier" });
  assert.equal(response.status, 503, "a reservation failure must fail closed with 503");
  assert.equal(jsonTaskCalls, 0, "no provider call may happen when enforcement is unavailable");
});

test("NEW-2: JSON AI usage does not consume the OCR/transcription windows", async () => {
  setUsageLimits("1", "100");
  const session = createAuthSessionForEmail("new2-classes@test.dev");
  const headers = { authorization: `Bearer ${session.token}` };

  const first = await request(app)
    .post("/api/invoices/edit")
    .set(headers)
    .send({ invoice: minimalInvoice, instruction: "Make the wording friendlier" });
  assert.notEqual(first.status, 429);

  const ocr = await reserveProviderUsage({ operationClass: "ocr", principalId: session.session.userId });
  const transcription = await reserveProviderUsage({
    operationClass: "transcription",
    principalId: session.session.userId
  });
  assert.equal(ocr.admitted, true, "OCR admission must keep its own window");
  assert.equal(transcription.admitted, true, "transcription admission must keep its own window");
});
