import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";

// S93-3 item 1 (S92-3 / S93-3 §1): the eight JSON AI routes under
// /api/invoices require a validated session in EVERY environment —
// including non-production auth-disabled mode — before any pipeline or
// provider work. The principal is the middleware-established session only;
// owner headers, query parameters, body fields, and configured default
// owners never establish it.

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-s933-ai-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-s933-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-s933-ffh-${randomUUID()}.json`);
const revenueSignalsStoreFilePath = path.join(os.tmpdir(), `invoice-s933-rev-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = revenueSignalsStoreFilePath;
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-s933-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";
// The hard case is deliberate: auth is DISABLED in this non-production
// configuration, and the AI gate must still require a session.
delete process.env.INVOICE_REQUIRE_AUTH;

const [{ app }, { setJsonTaskRunnerForTests }, { createAuthSessionForEmail, createEmailSignInToken, getSessionSecret }] =
  await Promise.all([
    import("./server.js"),
    import("./ai/openaiClient.js"),
    import("./services/authSession.js")
  ]);

let jsonTaskCalls = 0;

function useCountingThrowingRunner(): void {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    jsonTaskCalls += 1;
    throw new Error("ai-gate-probe: pipeline reached the provider boundary");
  });
}

function useQueueRunner(responses: unknown[]): void {
  const queue = [...responses];
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    jsonTaskCalls += 1;
    if (!queue.length) {
      throw new Error("ai-gate-probe: mock response queue is empty");
    }
    return queue.shift() as T;
  });
}

beforeEach(async () => {
  jsonTaskCalls = 0;
  useCountingThrowingRunner();
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  await fs.rm(revenueSignalsStoreFilePath, { force: true });
});

afterEach(() => {
  setJsonTaskRunnerForTests(null);
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

function expiredSessionToken(userId: string, email: string): string {
  const encodedPayload = Buffer.from(
    JSON.stringify({ kind: "session", userId, email, exp: Math.floor(Date.now() / 1000) - 60 }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

test("anonymous requests to every JSON AI route get 401 with zero pipeline/provider invocations", async () => {
  for (const route of gatedRoutes) {
    const response = await request(app).post(route.path).send(route.body);
    assert.equal(response.status, 401, `${route.path} must reject anonymous requests`);
    assert.equal(response.body.error, "Authentication required.");
  }
  assert.equal(jsonTaskCalls, 0);
});

test("anonymous multipart /from-input is rejected before upload handling and generation", async () => {
  const response = await request(app)
    .post("/api/invoices/from-input")
    .attach("invoiceFile", Buffer.from("fake document text"), { filename: "notes.txt", contentType: "text/plain" })
    .field("messyInput", "Jan 10 fixed sink leak");
  assert.equal(response.status, 401);
  assert.equal(jsonTaskCalls, 0);
});

test("malformed, expired, and email-link tokens are not sessions: 401 with zero invocations", async () => {
  const sessionA = createAuthSessionForEmail("gate-a@test.dev");
  const emailLink = createEmailSignInToken("gate-a@test.dev");
  const badTokens = [
    "not-a-real-token",
    expiredSessionToken(sessionA.session.userId, "gate-a@test.dev"),
    emailLink.token
  ];
  for (const token of badTokens) {
    for (const route of gatedRoutes) {
      const response = await request(app)
        .post(route.path)
        .set("authorization", `Bearer ${token}`)
        .send(route.body);
      assert.equal(response.status, 401, `${route.path} must reject an invalid session token`);
    }
  }
  assert.equal(jsonTaskCalls, 0);
});

test("spoofed owner headers, query, and body fields never establish the AI principal", async () => {
  for (const route of gatedRoutes) {
    const response = await request(app)
      .post(`${route.path}?userId=spoofed-owner`)
      .set("x-invoice-user-id", "spoofed-owner")
      .set("x-user-id", "spoofed-owner")
      .send({ ...route.body, userId: "spoofed-owner", ownerId: "spoofed-owner" });
    assert.equal(response.status, 401, `${route.path} must ignore caller-selected owner inputs`);
  }
  assert.equal(jsonTaskCalls, 0);
});

test("the gate holds even when auth is explicitly disabled outside production", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "false";
  try {
    for (const route of gatedRoutes) {
      const response = await request(app).post(route.path).send(route.body);
      assert.equal(response.status, 401, `${route.path} must require a session with auth disabled`);
    }
    assert.equal(jsonTaskCalls, 0);
  } finally {
    delete process.env.INVOICE_REQUIRE_AUTH;
  }
});

test("a valid session passes the gate on every route (handler reached, never 401)", async () => {
  const sessionA = createAuthSessionForEmail("gate-a@test.dev");
  const headers = { authorization: `Bearer ${sessionA.token}` };
  for (const route of gatedRoutes) {
    const response = await request(app).post(route.path).set(headers).send(route.body);
    assert.notEqual(response.status, 401, `${route.path} must admit a valid session`);
  }
});

test("authenticated /from-input generates and records revenue telemetry under the session principal only", async () => {
  const sessionA = createAuthSessionForEmail("gate-telemetry@test.dev");
  useQueueRunner([
    {
      customerName: "Mike Johnson",
      workSessions: [
        { date: "Jan 10", tasks: [{ description: "Fixed leaking sink", hours: 2, rate: 90, amount: 180 }] }
      ],
      materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
    },
    { assumptions: ["Tax assumed 0%."], decisions: [], unparsedLines: [] }
  ]);

  const generated = await request(app)
    .post("/api/invoices/from-input")
    .set("authorization", `Bearer ${sessionA.token}`)
    .set("x-invoice-user-id", "conflicting-owner-b")
    .send({ messyInput: "Fixed leaking sink on Jan 10. 2 hours at $90/hr. Parts: washer $5. Bill Mike Johnson. No tax." });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.invoice.customerName, "Mike Johnson");

  // Control signal: a session-authenticated telemetry POST records under
  // principal A. The generated invoice_generated signal must share A's
  // owner key; a header-only signal for B must land under a different key.
  const control = await request(app)
    .post("/api/telemetry/revenue-signals")
    .set("authorization", `Bearer ${sessionA.token}`)
    .send({ event: "invoice_again_started", source: "gate-test" });
  assert.equal(control.status, 200);
  const headerOnly = await request(app)
    .post("/api/telemetry/revenue-signals")
    .set("x-invoice-user-id", "conflicting-owner-b")
    .send({ event: "invoice_again_started", source: "gate-test" });
  assert.equal(headerOnly.status, 200);

  const snapshot = JSON.parse(await fs.readFile(revenueSignalsStoreFilePath, "utf8")) as {
    recentEvents: Array<{ event: string; ownerKey: string }>;
  };
  const generatedEvents = snapshot.recentEvents.filter((event) => event.event === "invoice_generated");
  const controlEvents = snapshot.recentEvents.filter(
    (event) => event.event === "invoice_again_started"
  );
  assert.equal(generatedEvents.length, 1);
  assert.equal(controlEvents.length, 2);
  const ownerKeys = new Set(controlEvents.map((event) => event.ownerKey));
  assert.equal(ownerKeys.size, 2, "session and header-only signals must land under different owners");
  assert.ok(
    ownerKeys.has(generatedEvents[0]!.ownerKey),
    "invoice_generated telemetry must record under one of the observed owners"
  );
  // The generated signal's owner is A's: it must equal the owner key that a
  // second session-A signal produces, which we verify by exclusion — the
  // header-only key is the one NOT shared if A generated; assert directly
  // via a fresh A-only event below.
  const secondControl = await request(app)
    .post("/api/telemetry/revenue-signals")
    .set("authorization", `Bearer ${sessionA.token}`)
    .send({ event: "service_memory_reused", source: "gate-test" });
  assert.equal(secondControl.status, 200);
  const updated = JSON.parse(await fs.readFile(revenueSignalsStoreFilePath, "utf8")) as {
    recentEvents: Array<{ event: string; ownerKey: string }>;
  };
  const aKey = updated.recentEvents.find((event) => event.event === "service_memory_reused")!.ownerKey;
  assert.equal(generatedEvents[0]!.ownerKey, aKey, "generated-invoice telemetry must record principal A");
});

test("authenticated deterministic wording branch retains its result without provider work", async () => {
  const sessionA = createAuthSessionForEmail("gate-a@test.dev");
  const response = await request(app)
    .post("/api/invoices/reword-notes")
    .set("authorization", `Bearer ${sessionA.token}`)
    .send({ invoice: minimalInvoice });
  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.total, 100);
  assert.equal(jsonTaskCalls, 0, "empty-notes wording is deterministic and must not call the provider");
});

test("authenticated /edit reaches the pipeline (provider boundary) exactly once per attempt", async () => {
  const sessionA = createAuthSessionForEmail("gate-a@test.dev");
  const response = await request(app)
    .post("/api/invoices/edit")
    .set("authorization", `Bearer ${sessionA.token}`)
    .send({ invoice: minimalInvoice, instruction: "Make the wording friendlier" });
  assert.notEqual(response.status, 401);
  assert.equal(jsonTaskCalls, 1, "the counting runner must be invoked once the gate admits the request");
});
