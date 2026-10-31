import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";

// SEC-08 (S52-5 / S63-3 §2 / S66-6): the owner resolver must independently
// reject anonymous owner selection in production, even if the effective
// policy were inconsistent (production + auth disabled). The policy is read
// from process.env per request, so the harness creates fixtures under the
// test environment and then flips NODE_ENV/INVOICE_REQUIRE_AUTH for the
// resolver requests only — the deliberately inconsistent fixture.

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-sec08-resolver-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-ocr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-sec08-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-sec08-ffh-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-rev-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-sec08-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-sec08-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";

const [{ app }, { createEmailSignInToken }] = await Promise.all([
  import("./server.js"),
  import("./services/authSession.js")
]);

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

afterEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.INVOICE_REQUIRE_AUTH;
  delete process.env.INVOICE_DEFAULT_USER_ID;
});

async function saveInvoiceAsHeaderOwner(ownerId: string, invoiceNumber: string): Promise<string> {
  const response = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Resolver Client", workSessions: [], materials: [] },
        finishedInvoice: {
          invoiceNumber,
          issueDate: "2026-03-11",
          customerName: "Resolver Client",
          currency: "USD",
          lineItems: [
            { id: `line-${invoiceNumber}`, type: "labor", description: "Resolver work", quantity: 1, unitPrice: 100, amount: 100 }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    });
  assert.equal(response.status, 200);
  return response.body.invoice.invoiceId as string;
}

async function signIn(email: string): Promise<string> {
  const requested = createEmailSignInToken(email);
  const verifyResponse = await request(app).post("/api/auth/session/verify").send({ token: requested.token });
  assert.equal(verifyResponse.status, 200);
  return verifyResponse.body.token as string;
}

function flipEnv(overrides: Record<string, string | undefined>): () => void {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

test("SEC-08 resolver: anonymous header/query owner selection is rejected in production with the flag disabled", async () => {
  const ownerId = "resolver-header-owner";
  const invoiceId = await saveInvoiceAsHeaderOwner(ownerId, "INV-RESOLVER-1");

  const restore = flipEnv({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: "false" });
  try {
    const viaInvoiceHeader = await request(app).get(`/api/invoices/${invoiceId}`).set("x-invoice-user-id", ownerId);
    assert.equal(viaInvoiceHeader.status, 401, "x-invoice-user-id must not resolve an owner in production");

    const viaUserHeader = await request(app).get(`/api/invoices/${invoiceId}`).set("x-user-id", ownerId);
    assert.equal(viaUserHeader.status, 401, "x-user-id must not resolve an owner in production");

    const viaQuery = await request(app).get(`/api/invoices/${invoiceId}?userId=${encodeURIComponent(ownerId)}`);
    assert.equal(viaQuery.status, 401, "?userId= must not resolve an owner in production");
  } finally {
    restore();
  }
});

test("SEC-08 resolver: configured default owner is rejected in production with the flag disabled", async () => {
  const ownerId = "resolver-default-owner";
  const invoiceId = await saveInvoiceAsHeaderOwner(ownerId, "INV-RESOLVER-2");

  const restore = flipEnv({
    NODE_ENV: "production",
    INVOICE_REQUIRE_AUTH: "false",
    INVOICE_DEFAULT_USER_ID: ownerId
  });
  try {
    const response = await request(app).get(`/api/invoices/${invoiceId}`);
    assert.equal(response.status, 401, "configured default must not resolve an owner in production");
  } finally {
    restore();
  }
});

test("SEC-08 resolver: an invalid session does not unlock production fallback", async () => {
  const ownerId = "resolver-invalid-session-owner";
  const invoiceId = await saveInvoiceAsHeaderOwner(ownerId, "INV-RESOLVER-3");

  const restore = flipEnv({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: "false" });
  try {
    const response = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set("authorization", "Bearer not-a-real-session-token")
      .set("x-invoice-user-id", ownerId);
    assert.equal(response.status, 401);
  } finally {
    restore();
  }
});

test("SEC-08 resolver: a valid session wins over conflicting owner inputs in production with the flag disabled", async () => {
  const sessionToken = await signIn("resolver-session@test.dev");
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("authorization", `Bearer ${sessionToken}`)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Session Client", workSessions: [], materials: [] },
        finishedInvoice: {
          invoiceNumber: "INV-RESOLVER-4",
          issueDate: "2026-03-11",
          customerName: "Session Client",
          currency: "USD",
          lineItems: [
            { id: "line-resolver-4", type: "labor", description: "Session work", quantity: 1, unitPrice: 100, amount: 100 }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    });
  assert.equal(saveResponse.status, 200);
  const invoiceId = saveResponse.body.invoice.invoiceId as string;

  const restore = flipEnv({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: "false" });
  try {
    const response = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set("authorization", `Bearer ${sessionToken}`)
      .set("x-invoice-user-id", "attacker-selected-owner");
    assert.equal(response.status, 200, "the validated session must win over conflicting owner inputs");
    assert.equal(response.body.invoice.invoiceId, invoiceId);
  } finally {
    restore();
  }
});

test("SEC-08 resolver: production with the flag unset rejects anonymous owner selection", async () => {
  const ownerId = "resolver-unset-owner";
  const invoiceId = await saveInvoiceAsHeaderOwner(ownerId, "INV-RESOLVER-5");

  const restore = flipEnv({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: undefined });
  try {
    const response = await request(app).get(`/api/invoices/${invoiceId}`).set("x-invoice-user-id", ownerId);
    assert.equal(response.status, 401);
  } finally {
    restore();
  }
});

test("SEC-08 resolver: non-production fallback precedence is preserved", async () => {
  const chainOwner = "resolver-chain-owner";
  const invoiceId = await saveInvoiceAsHeaderOwner(chainOwner, "INV-RESOLVER-6");

  // Header x-invoice-user-id beats x-user-id and query userId.
  const step1 = await request(app)
    .get(`/api/invoices/${invoiceId}?userId=query-owner`)
    .set("x-invoice-user-id", chainOwner)
    .set("x-user-id", "other-header-owner");
  assert.equal(step1.status, 200);

  // x-user-id beats query userId.
  const step2 = await request(app).get(`/api/invoices/${invoiceId}?userId=query-owner`).set("x-user-id", chainOwner);
  assert.equal(step2.status, 200);

  // Query userId beats the configured default.
  const restore = flipEnv({ INVOICE_DEFAULT_USER_ID: "configured-default-owner" });
  try {
    const step3 = await request(app).get(`/api/invoices/${invoiceId}?userId=${chainOwner}`);
    assert.equal(step3.status, 200);

    // Configured default beats "local-default".
    const step4 = await request(app).get(`/api/invoices/${invoiceId}`);
    assert.notEqual(step4.status, 200, "configured default owner must not see the chain owner's invoice");
    const defaultInvoiceId = await saveInvoiceAsHeaderOwner("configured-default-owner", "INV-RESOLVER-7");
    const step5 = await request(app).get(`/api/invoices/${defaultInvoiceId}`);
    assert.equal(step5.status, 200, "configured default resolves when no caller input exists");
  } finally {
    restore();
  }

  // "local-default" is the final fallback.
  const localInvoiceResponse = await request(app)
    .post("/api/invoices/save")
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: { customerName: "Local Client", workSessions: [], materials: [] },
        finishedInvoice: {
          invoiceNumber: "INV-RESOLVER-8",
          issueDate: "2026-03-11",
          customerName: "Local Client",
          currency: "USD",
          lineItems: [
            { id: "line-resolver-8", type: "labor", description: "Local work", quantity: 1, unitPrice: 100, amount: 100 }
          ],
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    });
  assert.equal(localInvoiceResponse.status, 200);
  const localInvoiceId = localInvoiceResponse.body.invoice.invoiceId as string;
  const step6 = await request(app).get(`/api/invoices/${localInvoiceId}`);
  assert.equal(step6.status, 200, "\"local-default\" resolves when nothing else is configured or supplied");
});
