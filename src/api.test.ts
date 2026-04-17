import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, afterEach, beforeEach, test } from "node:test";
import request from "supertest";
import Stripe from "stripe";

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-test-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_POSTGRES_URL = "";
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-ocr-metrics-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(
  os.tmpdir(),
  `invoice-flow-friction-${randomUUID()}.json`
);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(
  os.tmpdir(),
  `invoice-flow-friction-history-${randomUUID()}.json`
);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-stripe-entitlements-${randomUUID()}.json`
);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-delivery-store-${randomUUID()}.json`
);

const [
  { app },
  { setAudioTranscriptionRunnerForTests, setImageOcrRunnerForTests, setJsonTaskRunnerForTests },
  { setInvoicePaymentLinkCreatorForTests },
  { resetInvoiceEmailVerificationCacheForTests }
] = await Promise.all([
  import("./server.js"),
  import("./ai/openaiClient.js"),
  import("./services/stripeBilling.js"),
  import("./services/invoiceEmailDelivery.js")
]);

const storeFilePath = process.env.INVOICE_STORE_FILE;
if (!storeFilePath) {
  throw new Error("INVOICE_STORE_FILE is required for tests.");
}
const ocrMetricsStoreFilePath = process.env.OCR_METRICS_STORE_FILE;
if (!ocrMetricsStoreFilePath) {
  throw new Error("OCR_METRICS_STORE_FILE is required for tests.");
}
const flowFrictionReportFilePath = process.env.FLOW_FRICTION_REPORT_FILE;
if (!flowFrictionReportFilePath) {
  throw new Error("FLOW_FRICTION_REPORT_FILE is required for tests.");
}
const flowFrictionHistoryFilePath = process.env.FLOW_FRICTION_HISTORY_FILE;
if (!flowFrictionHistoryFilePath) {
  throw new Error("FLOW_FRICTION_HISTORY_FILE is required for tests.");
}
const stripeEntitlementsStoreFilePath = process.env.STRIPE_ENTITLEMENTS_STORE_FILE;
if (!stripeEntitlementsStoreFilePath) {
  throw new Error("STRIPE_ENTITLEMENTS_STORE_FILE is required for tests.");
}
const invoiceDeliveryStoreFilePath = process.env.INVOICE_DELIVERY_STORE_FILE;
if (!invoiceDeliveryStoreFilePath) {
  throw new Error("INVOICE_DELIVERY_STORE_FILE is required for tests.");
}
const nativeFetch = globalThis.fetch;

beforeEach(async () => {
  resetInvoiceEmailVerificationCacheForTests();
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  await fs.mkdir(path.dirname(ocrMetricsStoreFilePath), { recursive: true });
  await fs.rm(ocrMetricsStoreFilePath, { force: true });
  await fs.mkdir(path.dirname(flowFrictionReportFilePath), { recursive: true });
  await fs.rm(flowFrictionReportFilePath, { force: true });
  await fs.mkdir(path.dirname(flowFrictionHistoryFilePath), { recursive: true });
  await fs.rm(flowFrictionHistoryFilePath, { force: true });
  await fs.mkdir(path.dirname(stripeEntitlementsStoreFilePath), { recursive: true });
  await fs.rm(stripeEntitlementsStoreFilePath, { force: true });
  await fs.mkdir(path.dirname(invoiceDeliveryStoreFilePath), { recursive: true });
  await fs.rm(invoiceDeliveryStoreFilePath, { force: true });
  delete process.env.OCR_METRICS_EXPORT_PROVIDER;
  delete process.env.OCR_METRICS_EXPORT_URL;
  delete process.env.OCR_METRICS_GA4_MEASUREMENT_ID;
  delete process.env.OCR_METRICS_GA4_API_SECRET;
  delete process.env.OCR_METRICS_GA4_ENDPOINT;
  delete process.env.OCR_METRICS_SEGMENT_WRITE_KEY;
  delete process.env.OCR_METRICS_SEGMENT_ENDPOINT;
  delete process.env.OCR_METRICS_EXPORT_AUTOSEND;
  delete process.env.INVOICE_DEFAULT_PLAN;
  delete process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH;
  delete process.env.INVOICE_PRO_EMAILS;
  delete process.env.INVOICE_PRO_USER_IDS;
  delete process.env.INVOICE_PRO_OWNER_IDS;
  delete process.env.INVOICE_UPGRADE_URL;
  delete process.env.INVOICE_BILLING_PORTAL_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.INVOICE_LAUNCH_REQUIRE_LIVE_BILLING;
  delete process.env.INVOICE_EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP2GO_API_KEY;
  delete process.env.INVOICE_FROM_EMAIL;
  delete process.env.INVOICE_LAUNCH_TEST_EMAIL;
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  resetInvoiceEmailVerificationCacheForTests();
  setJsonTaskRunnerForTests(null);
  setImageOcrRunnerForTests(null);
  setAudioTranscriptionRunnerForTests(null);
  setInvoicePaymentLinkCreatorForTests(null);
  (globalThis as { fetch?: typeof fetch }).fetch = nativeFetch;
});

after(async () => {
  setJsonTaskRunnerForTests(null);
  setImageOcrRunnerForTests(null);
  setAudioTranscriptionRunnerForTests(null);
  setInvoicePaymentLinkCreatorForTests(null);
  await fs.rm(storeFilePath, { force: true });
  await fs.rm(ocrMetricsStoreFilePath, { force: true });
  await fs.rm(flowFrictionReportFilePath, { force: true });
  await fs.rm(flowFrictionHistoryFilePath, { force: true });
  await fs.rm(stripeEntitlementsStoreFilePath, { force: true });
  await fs.rm(invoiceDeliveryStoreFilePath, { force: true });
});

test("asks one labor pricing follow-up and does not finalize with $0 labor", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, true);
  assert.equal(response.body.invoice, undefined);
  assert.equal(
    response.body.followUp.message,
    "I see labor work, but some labor pricing is missing. Please choose how labor should be billed."
  );
  assert.equal(response.body.followUp.laborItems.length, 2);
});

test("asks labor follow-up when hours exist but labor rate is missing", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Tuesday",
          tasks: [{ description: "Tree removal and haul-off", hours: 8 }]
        },
        {
          date: "Wednesday",
          tasks: [{ description: "Lawn cleanup" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "I worked 8 hours Tuesday removing trees and Wednesday cleanup."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, true);
  assert.equal(response.body.followUp.laborItems.length, 2);
  assert.equal(response.body.followUp.laborItems[0].hours, 8);
});

test("uses explicit hours and rate in text to avoid labor follow-up", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed faucet leak" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Fixed faucet leak (2 hours @ $80/hr)."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].quantity, 2);
  assert.equal(laborLines[0].unitPrice, 80);
  assert.equal(laborLines[0].amount, 160);
});

test("polishes action-first line item descriptions without changing math", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "fixed sink", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [{ description: "replaced washer", quantity: 1, unitCost: 5, amount: 5 }]
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink 2h @ $90/hr. replaced washer $5."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].description, "Sink repair");
  assert.equal(laborLines[0].quantity, 2);
  assert.equal(laborLines[0].unitPrice, 90);
  assert.equal(laborLines[0].amount, 180);

  const materialLines = response.body.invoice.lineItems.filter(
    (lineItem: { type: string }) => lineItem.type === "material"
  );
  assert.equal(materialLines.length, 1);
  assert.equal(materialLines[0].description, "Washer replacement");
  assert.equal(materialLines[0].quantity, 1);
  assert.equal(materialLines[0].unitPrice, 5);
  assert.equal(materialLines[0].amount, 5);
});

test("converts explicit minutes with rate into hours to avoid labor follow-up", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 2",
          tasks: [{ description: "Cabinet door adjustment" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 2 cabinet door adjustment, 20 minutes at $80/hr."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].quantity, 0.33);
  assert.equal(laborLines[0].unitPrice, 80);
  assert.equal(laborLines[0].amount, 26.4);
});

test("does not ask labor follow-up for explicit no-charge labor", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Thursday",
          tasks: [{ description: "Inspect prior repair", amount: 0 }]
        }
      ],
      materials: [{ description: "Washer", quantity: 1, unitCost: 4, amount: 4 }]
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Returned Thursday to inspect prior repair, no charge. Replaced one washer $4."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.total, 4);
});

test("maps explicit free labor minutes to hours for $0 labor items", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 28",
          tasks: [{ description: "Inspection visit", amount: 0 }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 28 inspection visit, maybe 30 mins. Didn't charge for that visit."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0].quantity, 0.5);
  assert.equal(laborLines[0].unitPrice, 0);
  assert.equal(laborLines[0].amount, 0);
});

test("extracts customer name from parenthetical name + address text", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Fixed sink leak" }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Jan 30 fixed sink leak for 1 hour at $90/hr at Mike's place (Mike Johnson, 1423 Pine St)."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.customerName, "Mike Johnson");
});

test("infers service period range from multiple explicit work-session dates", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 2",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        },
        {
          date: "Jan 28",
          tasks: [{ description: "Inspection visit", amount: 0 }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 28 inspection visit (no charge). Feb 2 faucet repair (2h @ $80/hr).",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.servicePeriodStart, "Jan 28");
  assert.equal(response.body.invoice.servicePeriodEnd, "Feb 2");
  assert.ok(
    response.body.assumptions.some((assumption: string) =>
      /service period set to jan 28 to feb 2/i.test(assumption)
    )
  );
});

test("keeps explicit service period when parser already provides a range", async () => {
  useMockResponses([
    {
      servicePeriodStart: "Jan 1",
      servicePeriodEnd: "Jan 31",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Site visit", hours: 1, rate: 100, amount: 100 }]
        },
        {
          date: "Jan 20",
          tasks: [{ description: "Repair", hours: 2, rate: 100, amount: 200 }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Multiple January visits with explicit service period Jan 1 to Jan 31.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.servicePeriodStart, "Jan 1");
  assert.equal(response.body.invoice.servicePeriodEnd, "Jan 31");
});

test("extract-notes returns OCR text and warnings for image uploads", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 28 inspection visit. Jan 30 faucet repair 2h at $80/hr.",
    warnings: ["Handwriting in one line was unclear."]
  }));

  const response = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sourceType, "image");
  assert.match(response.body.extractedText, /Jan 28 inspection/i);
  assert.ok(Array.isArray(response.body.warnings));
  assert.ok(response.body.warnings.length >= 1);
  assert.equal(response.body.confidence, "medium");
  assert.ok(Array.isArray(response.body.confidenceReasons));
  assert.ok(
    response.body.confidenceReasons.includes("external_warning"),
    "expected external_warning confidence reason"
  );
});

test("extract-upload-text returns extracted text for document uploads", async () => {
  const response = await request(app)
    .post("/api/invoices/extract-upload-text")
    .attach("invoiceFile", Buffer.from("Mike Johnson\nJan 30 faucet repair 2h at $80/hr."), {
      filename: "notes.txt",
      contentType: "text/plain"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sourceType, "document");
  assert.match(response.body.extractedText, /Jan 30 faucet repair/i);
});

test("transcribe-audio returns transcript text for uploaded voice notes", async () => {
  setAudioTranscriptionRunnerForTests(async () => ({
    transcript: "Jan 30 repaired flashing, 2 hours at $95 per hour."
  }));

  const response = await request(app)
    .post("/api/invoices/transcribe-audio")
    .attach("audioFile", Buffer.from("fake-audio"), {
      filename: "voice-note.webm",
      contentType: "audio/webm"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sourceType, "audio");
  assert.match(response.body.extractedText, /repaired flashing/i);
});

test("extract-notes returns low OCR confidence for tiny extracted text", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Fix sink",
    warnings: []
  }));

  const response = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sourceType, "image");
  assert.equal(response.body.confidence, "low");
  const warnings = response.body.warnings ?? [];
  assert.ok(Array.isArray(warnings));
  assert.ok(
    warnings.some((warning: string) => /low ocr confidence|very little text/i.test(warning))
  );
  assert.ok(Array.isArray(response.body.confidenceReasons));
  assert.ok(
    response.body.confidenceReasons.includes("short_text") ||
      response.body.confidenceReasons.includes("very_low_word_count")
  );
});

test("extract-notes adds review warning when OCR output is short but not low confidence", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 30 repair labor 2h at $80/hr",
    warnings: []
  }));

  const response = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sourceType, "image");
  assert.equal(response.body.confidence, "medium");
  const warnings = response.body.warnings ?? [];
  assert.ok(Array.isArray(warnings));
  assert.ok(
    warnings.some((warning: string) => /modest amount of text|verify key fields/i.test(warning))
  );
  assert.ok(Array.isArray(response.body.confidenceReasons));
  assert.ok(
    response.body.confidenceReasons.includes("low_word_count"),
    "expected low_word_count confidence reason"
  );
});

test("OCR telemetry endpoint records confidence metrics from extract-notes", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Fix sink",
    warnings: ["Handwriting in one line was unclear."]
  }));

  const beforeResponse = await request(app).get("/api/telemetry/ocr-confidence");
  assert.equal(beforeResponse.status, 200);
  const beforeTotal =
    Number.isFinite(beforeResponse.body.totalEvents) && beforeResponse.body.totalEvents >= 0
      ? beforeResponse.body.totalEvents
      : 0;

  const extractResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });
  assert.equal(extractResponse.status, 200);

  const afterResponse = await request(app).get("/api/telemetry/ocr-confidence");
  assert.equal(afterResponse.status, 200);
  assert.ok(afterResponse.body.totalEvents >= beforeTotal + 1);
  assert.ok(Array.isArray(afterResponse.body.recentEvents));
  assert.ok(afterResponse.body.recentEvents.length > 0);
  const latestEvent = afterResponse.body.recentEvents[afterResponse.body.recentEvents.length - 1];
  assert.equal(latestEvent.confidence, "low");
  assert.ok(Array.isArray(latestEvent.confidenceReasons));
  assert.ok(latestEvent.confidenceReasons.includes("short_text"));
  assert.ok(
    latestEvent.confidenceReasons.includes("external_warning"),
    "expected external_warning confidence reason"
  );
});

test("system persistence endpoint reports active invoice backend", async () => {
  const response = await request(app).get("/api/system/persistence");
  assert.equal(response.status, 200);
  assert.equal(response.body.invoiceStoreBackend, "file");
  assert.equal(response.body.configuredBackend, "file");
  assert.equal(response.body.configuredMode, "file");
  assert.equal(response.body.postgresUrlConfigured, false);
  assert.equal(response.body.nodeEnv, "test");
  assert.equal(response.body.postgresRequired, false);
  assert.equal(response.body.migrationRequired, false);
  assert.equal(response.body.migrationReady, true);
  assert.equal(response.body.migrationWarning, null);
  assert.equal(response.body.productionReady, true);
  assert.equal(response.body.warning, null);
  assert.equal(response.body.authRequired, false);
  assert.equal(typeof response.body.authSessionSecretConfigured, "boolean");
  assert.equal(response.body.authPolicyReady, true);
  assert.equal(response.body.authWarning, null);
  assert.equal(response.body.defaultOwnerId, "local-default");
});

test("system persistence migration endpoint reports file-store summary", async () => {
  const response = await request(app).get("/api/system/persistence/migration");
  assert.equal(response.status, 200);
  assert.equal(response.body.invoiceStoreBackend, "file");
  assert.equal(response.body.configuredMode, "file");
  assert.equal(response.body.authRequired, false);
  assert.equal(typeof response.body.authSessionSecretConfigured, "boolean");
  assert.equal(response.body.authPolicyReady, true);
  assert.equal(response.body.authWarning, null);
  assert.equal(response.body.migrationRequired, false);
  assert.equal(response.body.migrationReady, true);
  assert.equal(response.body.migrationWarning, null);
  assert.equal(typeof response.body.fileStore?.filePath, "string");
  assert.equal(typeof response.body.fileStore?.invoiceCount, "number");
  assert.equal(typeof response.body.fileStore?.ownerCount, "number");
  assert.equal(typeof response.body.fileStore?.deletedCount, "number");
  assert.equal(response.body.migrationStatus?.backlogDetected, false);
  assert.equal(response.body.migrationStatus?.severity, "none");
  assert.equal(
    response.body.migrationStatus?.message,
    "No legacy file-store invoices detected."
  );
  assert.equal(
    response.body.migrationCommand,
    "npm run migrate:invoices:postgres -- --dry-run"
  );
});

test("launch diagnostics endpoint aggregates persistence, billing, delivery, and public URL readiness", async () => {
  process.env.APP_BASE_URL = "https://app.notebill.app";

  const baseline = await request(app).get("/api/system/launch");
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.ready, false);
  assert.equal(baseline.body.publicBaseUrl, "https://app.notebill.app");
  assert.equal(baseline.body.persistence?.ready, true);
  assert.equal(baseline.body.billing?.ready, false);
  assert.equal(baseline.body.delivery?.ready, false);
  assert.equal(baseline.body.publicBaseUrlReady, true);
  assert.ok(Array.isArray(baseline.body.checks));
  assert.ok(
    baseline.body.checks.some((check: { id?: string; ok?: boolean }) => check.id === "billing" && check.ok === false)
  );
  assert.ok(
    baseline.body.checks.some((check: { id?: string; ok?: boolean }) => check.id === "delivery" && check.ok === false)
  );

  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_placeholder";
  process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    if (String(input) === "https://api.resend.com/domains") {
      return new Response(
        JSON.stringify({
          data: [{ id: "dom_test_123", name: "notebill.app", status: "verified", capabilities: { sending: "enabled" } }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    throw new Error(`Unexpected fetch in launch diagnostics test: ${String(input)}`);
  }) as typeof fetch;

  const configured = await request(app).get("/api/system/launch");
  assert.equal(configured.status, 200);
  assert.equal(configured.body.ready, true);
  assert.equal(configured.body.billing?.ready, true);
  assert.equal(configured.body.delivery?.ready, true);
  assert.equal(configured.body.delivery?.verification?.ready, true);
  assert.equal(configured.body.publicBaseUrlReady, true);
  assert.equal(configured.body.warningCount, 0);
});

test("invoice library enforces auth when INVOICE_REQUIRE_AUTH is true", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "true";
  try {
    const response = await request(app).get("/api/invoices");
    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Authentication required.");
  } finally {
    delete process.env.INVOICE_REQUIRE_AUTH;
  }
});

test("invoice library allows authenticated requests when auth is required", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "true";
  try {
    const signInResponse = await request(app).post("/api/auth/session").send({ email: "owner@test.dev" });
    assert.equal(signInResponse.status, 200);
    const token = signInResponse.body.token;
    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);

    useMockResponses([structuredWithLaborPricing()]);
    const generated = await request(app).post("/api/invoices/from-input").send({
      messyInput: "Jan 10 repaired sink leak 2h @ 95/hr and pipe tape $7"
    });
    assert.equal(generated.status, 200);

    const saveResponse = await request(app)
      .post("/api/invoices/save")
      .set("authorization", `Bearer ${token}`)
      .send({
        confirmSave: true,
        sourceType: "text_input",
        invoiceData: {
          structuredInvoice: generated.body.structuredInvoice,
          finishedInvoice: generated.body.invoice
        }
      });
    assert.equal(saveResponse.status, 200);
    const savedInvoiceId = saveResponse.body.invoice.invoiceId as string;

    const listResponse = await request(app).get("/api/invoices").set("authorization", `Bearer ${token}`);
    assert.equal(listResponse.status, 200);
    assert.ok(Array.isArray(listResponse.body.invoices));
    assert.ok(listResponse.body.invoices.some((invoice: { invoiceId?: string }) => invoice.invoiceId === savedInvoiceId));
  } finally {
    delete process.env.INVOICE_REQUIRE_AUTH;
  }
});

test("OCR telemetry export endpoint reports not configured by default", async () => {
  const response = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(response.status, 200);
  assert.equal(response.body.configured, false);
  assert.equal(response.body.attempted, false);
  assert.equal(response.body.exported, false);
  assert.equal(response.body.reason, "not_configured");
});

test("OCR telemetry export endpoint posts snapshot when configured", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 30 repair labor 2h at $80/hr",
    warnings: ["Handwriting in one line was unclear."]
  }));
  process.env.OCR_METRICS_EXPORT_URL = "https://example.test/ocr-metrics";
  const fetchCalls: Array<{ url: string; options: { method?: string; body?: string } }> = [];
  (globalThis as { fetch?: typeof fetch }).fetch = (async (
    url: string | URL | Request,
    options?: RequestInit
  ) => {
    fetchCalls.push({
      url: String(url),
      options: { method: options?.method, body: String(options?.body ?? "") }
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const extractResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });
  assert.equal(extractResponse.status, 200);

  const exportResponse = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.body.configured, true);
  assert.equal(exportResponse.body.attempted, true);
  assert.equal(exportResponse.body.exported, true);
  assert.equal(exportResponse.body.reason, "exported");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, "https://example.test/ocr-metrics");
  assert.equal(fetchCalls[0]?.options.method, "POST");

  const payload = JSON.parse(fetchCalls[0]?.options.body ?? "{}");
  assert.equal(typeof payload.sentAt, "string");
  assert.ok(payload.snapshot);
  assert.ok(payload.snapshot.totalEvents >= 1);
});

test("OCR telemetry export endpoint supports GA4 provider payload", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 30 repair labor 2h at $80/hr",
    warnings: ["One line was unclear."]
  }));
  process.env.OCR_METRICS_EXPORT_PROVIDER = "ga4";
  process.env.OCR_METRICS_GA4_MEASUREMENT_ID = "G-TEST123";
  process.env.OCR_METRICS_GA4_API_SECRET = "secret-key";
  process.env.OCR_METRICS_GA4_ENDPOINT = "https://ga4.example.test/mp/collect";

  const fetchCalls: Array<{
    url: string;
    options: { method?: string; body?: string; headers?: RequestInit["headers"] };
  }> = [];
  (globalThis as { fetch?: typeof fetch }).fetch = (async (
    url: string | URL | Request,
    options?: RequestInit
  ) => {
    fetchCalls.push({
      url: String(url),
      options: {
        method: options?.method,
        body: String(options?.body ?? ""),
        headers: options?.headers
      }
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const extractResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });
  assert.equal(extractResponse.status, 200);

  const exportResponse = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.body.configured, true);
  assert.equal(exportResponse.body.provider, "ga4");
  assert.equal(exportResponse.body.reason, "exported");
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0]?.url,
    "https://ga4.example.test/mp/collect?measurement_id=G-TEST123&api_secret=secret-key"
  );

  const payload = JSON.parse(fetchCalls[0]?.options.body ?? "{}");
  assert.equal(payload.client_id, "invoice-launcher-system");
  assert.equal(Array.isArray(payload.events), true);
  assert.equal(payload.events[0]?.name, "ocr_confidence_snapshot");
  assert.equal(typeof payload.events[0]?.params?.total_events, "number");
});

test("OCR telemetry export endpoint supports Segment provider payload", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Fix sink",
    warnings: []
  }));
  process.env.OCR_METRICS_EXPORT_PROVIDER = "segment";
  process.env.OCR_METRICS_SEGMENT_WRITE_KEY = "segment-write-key";
  process.env.OCR_METRICS_SEGMENT_ENDPOINT = "https://segment.example.test/track";

  const fetchCalls: Array<{
    url: string;
    options: { method?: string; body?: string; headers?: RequestInit["headers"] };
  }> = [];
  (globalThis as { fetch?: typeof fetch }).fetch = (async (
    url: string | URL | Request,
    options?: RequestInit
  ) => {
    fetchCalls.push({
      url: String(url),
      options: {
        method: options?.method,
        body: String(options?.body ?? ""),
        headers: options?.headers
      }
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const extractResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });
  assert.equal(extractResponse.status, 200);

  const exportResponse = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.body.configured, true);
  assert.equal(exportResponse.body.provider, "segment");
  assert.equal(exportResponse.body.reason, "exported");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, "https://segment.example.test/track");

  const headers = fetchCalls[0]?.options.headers as Record<string, string> | undefined;
  assert.equal(typeof headers?.authorization, "string");
  assert.equal(headers?.authorization.startsWith("Basic "), true);

  const payload = JSON.parse(fetchCalls[0]?.options.body ?? "{}");
  assert.equal(payload.type, "track");
  assert.equal(payload.event, "OCR Confidence Snapshot Exported");
  assert.equal(payload.userId, "invoice-launcher-system");
  assert.equal(typeof payload.properties?.totalEvents, "number");
});

test("OCR telemetry export endpoint skips when no new metrics exist", async () => {
  setImageOcrRunnerForTests(async () => ({
    extractedText: "Fix sink",
    warnings: []
  }));
  process.env.OCR_METRICS_EXPORT_URL = "https://example.test/ocr-metrics";
  let fetchCount = 0;
  (globalThis as { fetch?: typeof fetch }).fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const extractResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes.png",
      contentType: "image/png"
    });
  assert.equal(extractResponse.status, 200);

  const firstExport = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(firstExport.status, 200);
  assert.equal(firstExport.body.exported, true);
  assert.equal(fetchCount, 1);

  const secondExport = await request(app).post("/api/telemetry/ocr-confidence/export").send({});
  assert.equal(secondExport.status, 200);
  assert.equal(secondExport.body.attempted, false);
  assert.equal(secondExport.body.exported, false);
  assert.equal(secondExport.body.reason, "no_new_metrics");
  assert.equal(fetchCount, 1);
});

test("flow friction telemetry endpoint reports unavailable when no snapshot exists", async () => {
  const response = await request(app).get("/api/telemetry/flow-friction");
  assert.equal(response.status, 200);
  assert.equal(response.body.available, false);
  assert.equal(response.body.reason, "missing_report");
  assert.equal(response.body.summary.totalChecks, 0);
});

test("flow friction telemetry endpoint returns summary when snapshot exists", async () => {
  await fs.writeFile(
    flowFrictionReportFilePath,
    JSON.stringify(
      {
        timestamp: "2026-02-20T15:30:00.000Z",
        baseUrl: "http://localhost:3000",
        checks: [
          { name: "single primary action on paste", pass: true, details: "Build invoice only" },
          { name: "generate hidden when open decisions", pass: false, details: "Generate button visible" }
        ],
        issues: ["Generate button visible while decisions are open."]
      },
      null,
      2
    ),
    "utf8"
  );

  const response = await request(app).get("/api/telemetry/flow-friction");
  assert.equal(response.status, 200);
  assert.equal(response.body.available, true);
  assert.equal(response.body.summary.totalChecks, 2);
  assert.equal(response.body.summary.passedChecks, 1);
  assert.equal(response.body.summary.failedChecks, 1);
  assert.equal(response.body.summary.issueCount, 1);
  assert.equal(response.body.checks[1].name, "generate hidden when open decisions");
});

test("intake trends endpoint returns empty baseline when no telemetry exists", async () => {
  const response = await request(app).get("/api/telemetry/intake-trends");
  assert.equal(response.status, 200);
  assert.equal(response.body.ocr.last24h.total, 0);
  assert.equal(response.body.ocr.last7d.total, 0);
  assert.equal(response.body.friction.historyAvailable, false);
  assert.equal(response.body.friction.last24h.runs, 0);
});

test("intake trends endpoint summarizes OCR and friction windows", async () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

  await fs.writeFile(
    flowFrictionHistoryFilePath,
    JSON.stringify(
      [
        { timestamp: oneHourAgo, totalChecks: 8, failedChecks: 1, issueCount: 1 },
        { timestamp: twoDaysAgo, totalChecks: 8, failedChecks: 2, issueCount: 1 },
        { timestamp: eightDaysAgo, totalChecks: 8, failedChecks: 4, issueCount: 2 }
      ],
      null,
      2
    ),
    "utf8"
  );

  setImageOcrRunnerForTests(async () => ({
    extractedText: "tiny",
    warnings: ["Low readability"]
  }));
  const lowResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes-low.png",
      contentType: "image/png"
    });
  assert.equal(lowResponse.status, 200);

  setImageOcrRunnerForTests(async () => ({
    extractedText: "Jan 30 faucet repair 2h at $80/hr with parts",
    warnings: []
  }));
  const highResponse = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-image"), {
      filename: "notes-high.png",
      contentType: "image/png"
    });
  assert.equal(highResponse.status, 200);

  const response = await request(app).get("/api/telemetry/intake-trends");
  assert.equal(response.status, 200);
  assert.ok(response.body.ocr.last24h.total >= 2);
  assert.ok(response.body.ocr.last7d.total >= response.body.ocr.last24h.total);
  assert.equal(response.body.friction.historyAvailable, true);
  assert.equal(response.body.friction.last24h.runs, 1);
  assert.equal(response.body.friction.last24h.totalChecks, 8);
  assert.equal(response.body.friction.last24h.failedChecks, 1);
  assert.equal(response.body.friction.last7d.runs, 2);
  assert.equal(response.body.friction.last7d.totalChecks, 16);
  assert.equal(response.body.friction.last7d.failedChecks, 3);
});

test("extract-notes rejects non-image uploads", async () => {
  const response = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", Buffer.from("fake-text"), {
      filename: "notes.txt",
      contentType: "text/plain"
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Unsupported image type/i);
});

test("extract-notes rejects files over 8MB", async () => {
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
  const response = await request(app)
    .post("/api/invoices/extract-notes")
    .attach("invoiceFile", oversized, {
      filename: "large.png",
      contentType: "image/png"
    });

  assert.equal(response.status, 413);
  assert.match(response.body.error, /max upload size is 8mb/i);
});

test("returns unparsed lines when messy notes include unrelated items", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7.\nCustomer asked about painting the fence next month."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.ok(Array.isArray(response.body.unparsedLines));
  const unparsedCombined = response.body.unparsedLines.join(" ").toLowerCase();
  assert.ok(unparsedCombined.includes("painting") || unparsedCombined.includes("fence"));
});

test("creates decisions for ambiguous billable items even when audit is empty", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: []
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.ok(Array.isArray(response.body.openDecisions));
  const hasCabinetDecision = response.body.openDecisions.some((decision: { prompt: string }) =>
    /cabinet/i.test(decision.prompt)
  );
  assert.ok(hasCabinetDecision);
});

test("deduplicates overlapping billing decisions from audit + heuristic extraction", async () => {
  useMockResponses([
    {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Jan 30",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        },
        {
          date: "Feb 2",
          tasks: [{ description: "Cabinet door adjustment", hours: 0.33, rate: 80, amount: 26.4 }]
        }
      ],
      materials: [
        { description: "cartridge", quantity: 1, unitCost: 18.75, amount: 18.75 },
        { description: "washer kit", quantity: 1, unitCost: 6, amount: 6 },
        { description: "parking", quantity: 1, unitCost: 4.5, amount: 4.5 }
      ]
    },
    {
      assumptions: ["Tax not applied until confirmed."],
      decisions: [
        {
          kind: "billing",
          prompt: "Bill cabinet door adjustment?",
          sourceSnippet: "Didn't really think about charging for that - up to you."
        }
      ],
      unparsedLines: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: [
      "Jan 30 faucet repair, about 2 hours at $80/hr.",
      "Parts: cartridge $18.75, washer kit $6, parking $4.50.",
      "Feb 2 cabinet door adjustment maybe 20 mins, up to you if bill.",
      "I sometimes add 5% tax, sometimes not."
    ].join(" ")
  });

  assert.equal(response.status, 200);
  const billingDecisions = (response.body.openDecisions ?? []).filter(
    (decision: { kind: string }) => decision.kind === "billing"
  );
  const cabinetPrompts = billingDecisions.filter((decision: { prompt: string }) =>
    /cabinet/i.test(decision.prompt)
  );
  assert.equal(cabinetPrompts.length, 1);
});

test("keeps decisions resolved when explicit resolution exists in source transcript", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: []
    },
    {
      assumptions: [],
      decisions: [
        {
          kind: "billing",
          prompt: 'Bill this item? "Tightened a cabinet hinge maybe — not sure if I should bill it"',
          sourceSnippet: "Tightened a cabinet hinge maybe — not sure if I should bill it"
        }
      ],
      unparsedLines: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it. Don't bill the cabinet hinge."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.ok(Array.isArray(response.body.openDecisions));
  assert.equal(response.body.openDecisions.length, 0);
});

test("flags unsure billing as a decision and holds pricing in fast mode", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop, not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("keeps billing decisions even when the prompt includes an hourly rate", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop, 0.75 hours at $95/hr — not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("does not resolve billing decisions from a bill-to directive", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 4",
          tasks: [
            {
              description: "Cabinet hinge adjustment",
              hours: 0.25,
              rate: 95,
              amount: 23.75
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Adjusted a cabinet hinge 0.25 hours at $95/hr — not sure if I should bill. Bill to Jill Parker.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(decisions.length > 0);
  const hasHingeDecision = decisions.some((decision: { prompt: string }) =>
    /cabinet hinge/i.test(decision.prompt)
  );
  assert.ok(hasHingeDecision);
});

test("uses prior sentence context for time-only billing uncertainty", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 3",
          tasks: [
            {
              description: "Emergency leak stop at Cafe Luna",
              hours: 0.75,
              rate: 95,
              amount: 71.25
            }
          ]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 3 emergency leak stop at Cafe Luna. 45 mins, not sure if I should bill.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  const hasLeakDecision = decisions.some((decision: { prompt: string }) =>
    /emergency leak stop/i.test(decision.prompt)
  );
  assert.ok(hasLeakDecision);

  const laborLines = response.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  const leakLine = laborLines.find((lineItem: { description: string }) =>
    /emergency leak stop/i.test(lineItem.description)
  );
  assert.ok(leakLine);
  assert.equal(leakLine.amount, undefined);
});

test("does not create a decision for ambiguous tax mention in fast mode", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Fixed leak 2h @ $90/hr. Tax? I sometimes add 7.5% depending on job.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  const decisions = response.body.openDecisions ?? [];
  assert.equal(decisions.length, 0);
});

test("fast mode skips audit and still detects decisions", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput:
      "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it.",
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const decisions = response.body.openDecisions ?? [];
  assert.ok(Array.isArray(decisions));
  const hasCabinetDecision = decisions.some((decision: { prompt: string }) =>
    /cabinet/i.test(decision.prompt)
  );
  assert.ok(hasCabinetDecision);
});

test(
  "audit timeout falls back to heuristic decisions",
  { timeout: 8000 },
  async () => {
    setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
      if (prompt.includes("Parse messy invoice/job notes")) {
        return structuredWithLaborPricing() as T;
      }
      if (prompt.includes("You are auditing a parsed invoice")) {
        return await new Promise<T>(() => {});
      }
      throw new Error("Unexpected prompt");
    });

    const start = Date.now();
    const response = await request(app).post("/api/invoices/from-input").send({
      messyInput:
        "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe — not sure if I should bill it."
    });
    const duration = Date.now() - start;

    assert.equal(response.status, 200);
    assert.ok(duration < 4500);
    const decisions = response.body.openDecisions ?? [];
    const hasCabinetDecision = decisions.some((decision: { prompt: string }) =>
      /cabinet/i.test(decision.prompt)
    );
  assert.ok(hasCabinetDecision);
  }
);

test(
  "audit timeout reports auditStatus timed_out",
  { timeout: 8000 },
  async () => {
    setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
      if (prompt.includes("Parse messy invoice/job notes")) {
        return structuredWithLaborPricing() as T;
      }
      if (prompt.includes("You are auditing a parsed invoice")) {
        return await new Promise<T>(() => {});
      }
      throw new Error("Unexpected prompt");
    });

    const response = await request(app).post("/api/invoices/from-input").send({
      messyInput: "Feb 3 fixed leak 2h @ $90/hr. Tightened a cabinet hinge maybe."
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.auditStatus, "timed_out");
  }
);

test("audit endpoint returns decisions and assumptions", async () => {
  setJsonTaskRunnerForTests(async <T>(prompt: string): Promise<T> => {
    if (prompt.includes("You are auditing a parsed invoice")) {
      return {
        assumptions: ["Tax assumed 0%."],
        decisions: [
          {
            kind: "billing",
            prompt: "Bill this item? \"Tightened cabinet hinge\"",
            sourceSnippet: "Tightened cabinet hinge maybe"
          }
        ],
        unparsedLines: ["Customer asked about fence painting"]
      } as T;
    }
    throw new Error("Unexpected prompt");
  });

  const response = await request(app).post("/api/invoices/audit").send({
    sourceText: "Feb 3 fixed leak 2h @ $90/hr. Tightened cabinet hinge maybe.",
    structuredInvoice: structuredWithLaborPricing()
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.openDecisions));
  assert.ok(response.body.openDecisions.length >= 1);
  assert.ok(
    response.body.openDecisions.some((decision: { prompt: string }) => /cabinet/i.test(decision.prompt))
  );
  const assumptions = response.body.assumptions ?? [];
  assert.ok(assumptions.some((item: string) => item.toLowerCase().includes("tax assumed")));
  const unparsed = response.body.unparsedLines ?? [];
  assert.ok(unparsed.some((item: string) => item.toLowerCase().includes("fence")));
});

test("chunks long messy input and merges structured invoices", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Jan 5",
          tasks: [{ description: "Fixed sink", hours: 2, rate: 100, amount: 200 }]
        }
      ],
      materials: []
    },
    {
      workSessions: [],
      materials: [{ description: "Washer", quantity: 1, unitCost: 5, amount: 5 }]
    }
  ]);

  const filler = "lorem ipsum ".repeat(180);
  const paragraphOne = `Job A: Fixed sink 2 hours at $100/hr. ${filler}`;
  const paragraphTwo = `Parts: washer $5. ${filler}`;
  const longInput = `${paragraphOne}\n\n${paragraphTwo}`;
  assert.ok(longInput.length > 4000);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: longInput,
    mode: "fast"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const lineItems = response.body.invoice?.lineItems ?? [];
  const hasLaborLine = lineItems.some(
    (lineItem: { description: string; type: string }) =>
      lineItem.type === "labor" && /sink/i.test(lineItem.description)
  );
  const hasMaterialLine = lineItems.some((lineItem: { description: string; type: string }) =>
    /washer/i.test(lineItem.description)
  );
  assert.ok(hasLaborLine);
  assert.ok(hasMaterialLine);
});

test("moves internal reminder notes to unparsed lines", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [],
      notes: "Need to order a new drill next week."
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 3 fixed leak 2h @ $90/hr. Need to order a new drill next week."
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  const notes = response.body.invoice?.notes ?? "";
  assert.ok(!notes.toLowerCase().includes("drill"));
  const unparsed = response.body.unparsedLines.join(" ").toLowerCase();
  assert.ok(unparsed.includes("drill"));
});

test("treats ambiguous tax notes as assumptions not invoice notes", async () => {
  useMockResponses([
    {
      workSessions: [
        {
          date: "Feb 3",
          tasks: [{ description: "Fixed leak", hours: 2, rate: 90, amount: 180 }]
        }
      ],
      materials: [],
      notes: "Tax may apply at 5% if applicable."
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Feb 3 fixed leak 2h @ $90/hr. Sometimes I add 5% tax."
  });

  assert.equal(response.status, 200);
  const notes = response.body.invoice?.notes ?? "";
  assert.ok(!notes.toLowerCase().includes("tax may apply"));
  const assumptions = (response.body.assumptions ?? []).join(" ").toLowerCase();
  assert.ok(assumptions.includes("tax assumed"));
});

test("does not silently assume labor hour splits when hourly input is incomplete", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, true);

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [5]
    }
  });

  assert.equal(second.status, 400);
  assert.match(second.body.error, /provide hours for every labor line item/i);
});

test("finalizes labor totals from explicit hourly values", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal"
  });

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [3, 2]
    }
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);

  const laborLines = second.body.invoice.lineItems.filter((lineItem: { type: string }) => lineItem.type === "labor");
  assert.equal(laborLines.length, 2);
  assert.deepEqual(
    laborLines.map((lineItem: { quantity: number }) => lineItem.quantity),
    [3, 2]
  );
  assert.deepEqual(
    laborLines.map((lineItem: { unitPrice: number }) => lineItem.unitPrice),
    [10, 10]
  );
  assert.deepEqual(
    laborLines.map((lineItem: { amount: number }) => lineItem.amount),
    [30, 20]
  );
  assert.equal(second.body.invoice.total, 55);
});

test("auto-generates invoice number when parsed data has none", async () => {
  useMockResponses([
    {
      issueDate: "2026-02-04",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "Fixed sink leak", hours: 2, rate: 95, amount: 190 }]
        }
      ],
      materials: []
    }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.match(response.body.invoice.invoiceNumber, /^INV-\d{8}-\d{4}$/);
});

test("auto-applies explicit discount amount from input notes", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and please add a $20 discount for delay"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.discountAmount, 20);
  assert.equal(response.body.invoice.total, 177);
});

test("does not ask discount follow-up when discount amount is missing", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and apply a discount for delay"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsFollowUp, false);
  assert.equal(response.body.invoice.discountAmount, 0);
});

test("discount endpoint can apply a manual discount to an existing invoice", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, false);

  const second = await request(app).post("/api/invoices/from-input/discount").send({
    invoice: first.body.invoice,
    discountAmount: 25,
    discountReason: "Discount for delay"
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);
  assert.equal(second.body.invoice.discountAmount, 25);
  assert.equal(second.body.invoice.total, 172);
});

test("edit endpoint applies invoice updates from instruction", async () => {
  useMockResponses([
    {
      invoice: {
        invoiceNumber: "INV-200",
        issueDate: "2026-02-05",
        customerName: "Jamie Client",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Repair work",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        notes: "Updated notes",
        subtotal: 160,
        total: 160,
        balanceDue: 160
      }
    }
  ]);

  const response = await request(app).post("/api/invoices/edit").send({
    instruction: "Change the labor rate to $80/hr.",
    invoice: {
      invoiceNumber: "INV-200",
      issueDate: "2026-02-05",
      customerName: "Jamie Client",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "Repair work",
          quantity: 2,
          unitPrice: 90,
          amount: 180
        }
      ],
      notes: "Original notes",
      subtotal: 180,
      total: 180,
      balanceDue: 180
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 80);
  assert.equal(response.body.invoice.total, 160);
});

test("does not ask discount follow-up after labor pricing when discount amount is missing", async () => {
  useMockResponses([structuredWithoutLaborPricing()]);

  const first = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak and Jan 11 tested seal; apply a discount for delay"
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.needsFollowUp, true);
  assert.equal(first.body.followUp.type, "labor_pricing");

  const second = await request(app).post("/api/invoices/from-input/labor-pricing").send({
    structuredInvoice: first.body.structuredInvoice,
    laborPricing: {
      billingType: "hourly",
      rate: 10,
      lineHours: [3, 2]
    },
    sourceText: "Jan 10 fixed sink leak and Jan 11 tested seal; apply a discount for delay"
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.needsFollowUp, false);
  assert.equal(second.body.invoice.discountAmount, 0);
});

test("reword-line keeps quantities, rates, and amounts unchanged", async () => {
  useMockResponses([{ description: "Reworded labor description" }]);

  const response = await request(app).post("/api/invoices/reword-line").send({
    lineItemId: "line_1",
    tone: "concise",
    invoice: {
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Original labor description",
          quantity: 2,
          unitPrice: 60,
          amount: 120
        }
      ],
      subtotal: 120,
      total: 120,
      balanceDue: 120
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.lineItems[0].description, "Reworded labor description");
  assert.equal(response.body.invoice.lineItems[0].quantity, 2);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 60);
  assert.equal(response.body.invoice.lineItems[0].amount, 120);
  assert.equal(response.body.invoice.total, 120);
});

test("reword-notes keeps line items and totals unchanged", async () => {
  useMockResponses([{ notes: "Payment due within 7 days. Thank you for your business." }]);

  const response = await request(app).post("/api/invoices/reword-notes").send({
    tone: "more formal",
    invoice: {
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "Original labor description",
          quantity: 2,
          unitPrice: 60,
          amount: 120
        }
      ],
      notes: "pay in 7 days thanks",
      subtotal: 120,
      total: 120,
      balanceDue: 120
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.notes, "Payment due within 7 days. Thank you for your business.");
  assert.equal(response.body.invoice.lineItems[0].description, "Original labor description");
  assert.equal(response.body.invoice.lineItems[0].quantity, 2);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 60);
  assert.equal(response.body.invoice.lineItems[0].amount, 120);
  assert.equal(response.body.invoice.total, 120);
});

test("reword-descriptions keeps notes and totals unchanged", async () => {
  useMockResponses([
    {
      lineItems: [{ id: "line_1", description: "Kitchen faucet repair service" }]
    }
  ]);

  const response = await request(app).post("/api/invoices/reword-descriptions").send({
    tone: "more formal",
    invoice: {
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "fix sink",
          quantity: 2,
          unitPrice: 60,
          amount: 120
        }
      ],
      notes: "pay in 7 days thanks",
      subtotal: 120,
      total: 120,
      balanceDue: 120
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.invoice.lineItems[0].description, "Kitchen faucet repair service");
  assert.equal(response.body.invoice.notes, "pay in 7 days thanks");
  assert.equal(response.body.invoice.lineItems[0].quantity, 2);
  assert.equal(response.body.invoice.lineItems[0].unitPrice, 60);
  assert.equal(response.body.invoice.lineItems[0].amount, 120);
  assert.equal(response.body.invoice.total, 120);
});

test("reword-full uses deterministic wording cleanup for Formal tone when notes are blank", async () => {
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    throw new Error("Model should not run for deterministic Formal full wording cleanup.");
  });

  const response = await request(app).post("/api/invoices/reword-full").send({
    tone: "Formal",
    invoice: {
      currency: "USD",
      lineItems: [
        {
          id: "line_1",
          type: "labor",
          description: "fixed sink",
          quantity: 2,
          unitPrice: 60,
          amount: 120
        },
        {
          id: "line_2",
          type: "material",
          description: "replaced washer",
          quantity: 1,
          unitPrice: 5,
          amount: 5
        }
      ],
      notes: "",
      subtotal: 125,
      total: 125,
      balanceDue: 125
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.invoice.lineItems.map((lineItem: { description: string }) => lineItem.description),
    ["Sink repair", "Washer replacement"]
  );
  assert.equal(response.body.invoice.total, 125);
});

test("export-pdf returns a downloadable pdf document", async () => {
  const response = await request(app)
    .post("/api/invoices/export-pdf")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .send({
      invoice: {
        invoiceNumber: "INV-1001",
        issueDate: "2026-02-27",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Faucet repair",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          },
          {
            id: "line-2",
            type: "material",
            description: "Washer",
            quantity: 1,
            unitPrice: 5,
            amount: 5
          }
        ],
        subtotal: 165,
        total: 165,
        balanceDue: 165,
        notes: "Thanks for your business."
      },
      fromDetails: "Acme Plumbing\n123 Main St",
      billToDetails: "Mike Johnson\n1423 Pine St",
      accentColor: "#0f9d6e",
      stylePreset: "default",
      logoUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgBxVSnoAAAAASUVORK5CYII="
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers["content-type"]), /^application\/pdf/);
  assert.match(
    String(response.headers["content-disposition"]),
    /attachment;\s*filename="Invoice-INV-1001\.pdf"/
  );
  assert.ok(Buffer.isBuffer(response.body));
  assert.ok(response.body.byteLength > 200);
  assert.match(response.body.toString("utf8", 0, 8), /^%PDF-1\./);
});

test("export-pdf accepts hidden logos without dropping the uploaded logo data", async () => {
  const response = await request(app)
    .post("/api/invoices/export-pdf")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .send({
      invoice: {
        invoiceNumber: "INV-1001",
        issueDate: "2026-02-27",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Faucet repair",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        subtotal: 160,
        total: 160,
        balanceDue: 160
      },
      fromDetails: "Acme Plumbing\n123 Main St",
      billToDetails: "Mike Johnson\n1423 Pine St",
      accentColor: "#093064",
      stylePreset: "default",
      logoVisible: false,
      logoUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgBxVSnoAAAAASUVORK5CYII="
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers["content-type"]), /^application\/pdf/);
  assert.ok(Buffer.isBuffer(response.body));
  assert.ok(response.body.byteLength > 200);
});

test("export-pdf accepts centered header layout requests", async () => {
  const response = await request(app)
    .post("/api/invoices/export-pdf")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .send({
      invoice: {
        invoiceNumber: "INV-1003",
        issueDate: "2026-02-27",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Faucet repair",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        subtotal: 160,
        total: 160,
        balanceDue: 160
      },
      fromDetails: "Acme Plumbing\n123 Main St",
      billToDetails: "Mike Johnson\n1423 Pine St",
      accentColor: "#093064",
      stylePreset: "default",
      headerLayout: "centered"
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers["content-type"]), /^application\/pdf/);
  assert.ok(Buffer.isBuffer(response.body));
  assert.ok(response.body.byteLength > 200);
});

test("export-pdf accepts airy spacing density requests", async () => {
  const response = await request(app)
    .post("/api/invoices/export-pdf")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .send({
      invoice: {
        invoiceNumber: "INV-1004",
        issueDate: "2026-02-27",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Faucet repair",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        subtotal: 160,
        total: 160,
        balanceDue: 160
      },
      fromDetails: "Acme Plumbing\n123 Main St",
      billToDetails: "Mike Johnson\n1423 Pine St",
      accentColor: "#093064",
      stylePreset: "default",
      spacingDensity: "airy"
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers["content-type"]), /^application\/pdf/);
  assert.ok(Buffer.isBuffer(response.body));
  assert.ok(response.body.byteLength > 200);
});

test("export-pdf accepts hidden notes requests", async () => {
  const response = await request(app)
    .post("/api/invoices/export-pdf")
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .send({
      invoice: {
        invoiceNumber: "INV-1005",
        issueDate: "2026-02-27",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Faucet repair",
            quantity: 2,
            unitPrice: 80,
            amount: 160
          }
        ],
        notes: "Payment due in 14 days.",
        subtotal: 160,
        total: 160,
        balanceDue: 160
      },
      fromDetails: "Acme Plumbing\n123 Main St",
      billToDetails: "Mike Johnson\n1423 Pine St",
      accentColor: "#093064",
      stylePreset: "default",
      notesVisible: false
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers["content-type"]), /^application\/pdf/);
  assert.ok(Buffer.isBuffer(response.body));
  assert.ok(response.body.byteLength > 200);
});

test("export-pdf rejects invalid payment link urls", async () => {
  const response = await request(app).post("/api/invoices/export-pdf").send({
    invoice: {
      invoiceNumber: "INV-1006",
      issueDate: "2026-02-27",
      customerName: "Mike Johnson",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "Faucet repair",
          quantity: 2,
          unitPrice: 80,
          amount: 160
        }
      ],
      paymentLinkUrl: "not-a-url",
      subtotal: 160,
      total: 160,
      balanceDue: 160
    }
  });

  assert.equal(response.status, 400);
  assert.match(String(response.body.error || ""), /Invalid url/i);
});

test("export-pdf rejects invoices with no line items", async () => {
  const response = await request(app).post("/api/invoices/export-pdf").send({
    invoice: {
      invoiceNumber: "INV-1002",
      currency: "USD",
      lineItems: [],
      subtotal: 0,
      total: 0,
      balanceDue: 0
    }
  });

  assert.equal(response.status, 400);
  assert.match(String(response.body.error || ""), /Array must contain at least 1 element/);
});

test("save remains explicit-only", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const listBefore = await request(app).get("/api/invoices");
  assert.equal(listBefore.status, 200);
  assert.equal(listBefore.body.invoices.length, 0);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  assert.equal(generated.status, 200);
  assert.equal(generated.body.needsFollowUp, false);

  const listAfterGenerate = await request(app).get("/api/invoices");
  assert.equal(listAfterGenerate.status, 200);
  assert.equal(listAfterGenerate.body.invoices.length, 0);

  const rejectedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: false,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(rejectedSave.status, 400);

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(acceptedSave.status, 200);
  assert.equal(acceptedSave.body.invoice.status, "draft");

  const listAfterSave = await request(app).get("/api/invoices");
  assert.equal(listAfterSave.status, 200);
  assert.equal(listAfterSave.body.invoices.length, 1);
});

test("send endpoint records delivery and marks invoice as sent", async () => {
  const ownerId = "delivery-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DELIVERY-1",
          issueDate: "2026-03-10",
          customerName: "Delivery Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-1",
              type: "labor",
              description: "Delivery baseline",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    });
  assert.equal(saveResponse.status, 200);
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "CLIENT@Example.com" });
  assert.equal(sendResponse.status, 200);
  assert.equal(sendResponse.body.mode, "record_only");
  assert.equal(sendResponse.body.provider, "none");
  assert.equal(sendResponse.body.invoice.status, "sent");
  assert.equal(sendResponse.body.delivery.recipientEmail, "client@example.com");
  assert.equal(sendResponse.body.delivery.status, "sent");
  assert.equal(sendResponse.body.delivery.mode, "record_only");
  assert.equal(sendResponse.body.delivery.provider, "none");
  assert.equal(sendResponse.body.delivery.sendCount, 1);

  const listResponse = await request(app).get("/api/invoices").set("x-invoice-user-id", ownerId);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.invoices.length, 1);
  assert.equal(listResponse.body.invoices[0].status, "sent");
  assert.equal(listResponse.body.invoices[0].delivery.recipientEmail, "client@example.com");
  assert.equal(listResponse.body.invoices[0].delivery.status, "sent");
});

test("payment-link endpoint creates and persists a Stripe payment link for a saved invoice", async () => {
  const ownerId = "payment-link-owner";
  setInvoicePaymentLinkCreatorForTests(async () => ({
    url: "https://pay.stripe.test/plink_123",
    paymentLinkId: "plink_123"
  }));
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Payment Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PAY-1",
          issueDate: "2026-03-11",
          customerName: "Payment Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-pay-1",
              type: "labor",
              description: "Roof repair visit",
              quantity: 1,
              unitPrice: 220,
              amount: 220
            }
          ],
          subtotal: 220,
          total: 220,
          balanceDue: 220
        }
      }
    });

  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  const response = await request(app)
    .post(`/api/invoices/${invoiceId}/payment-link`)
    .set("x-invoice-user-id", ownerId)
    .send({});

  assert.equal(response.status, 200);
  assert.equal(response.body.paymentLinkUrl, "https://pay.stripe.test/plink_123");
  assert.equal(
    response.body.invoice?.invoiceData?.finishedInvoice?.paymentLinkUrl,
    "https://pay.stripe.test/plink_123"
  );

  const getResponse = await request(app)
    .get(`/api/invoices/${invoiceId}`)
    .set("x-invoice-user-id", ownerId);
  assert.equal(getResponse.status, 200);
  assert.equal(
    getResponse.body.invoice?.invoiceData?.finishedInvoice?.paymentLinkUrl,
    "https://pay.stripe.test/plink_123"
  );
});

test("send endpoint auto-creates a payment link before delivery when Stripe payments are configured", async () => {
  const ownerId = "payment-send-owner";
  let createCount = 0;
  setInvoicePaymentLinkCreatorForTests(async () => {
    createCount += 1;
    return {
      url: "https://pay.stripe.test/plink_send_123",
      paymentLinkId: "plink_send_123"
    };
  });
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";

  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Auto Pay Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-AUTO-PAY-1",
          issueDate: "2026-03-11",
          customerName: "Auto Pay Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-auto-pay-1",
              type: "labor",
              description: "Auto pay baseline",
              quantity: 1,
              unitPrice: 180,
              amount: 180
            }
          ],
          subtotal: 180,
          total: 180,
          balanceDue: 180
        }
      }
    });

  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  const response = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "pay@example.com" });

  assert.equal(response.status, 200);
  assert.equal(createCount, 1);
  assert.equal(
    response.body.invoice?.invoiceData?.finishedInvoice?.paymentLinkUrl,
    "https://pay.stripe.test/plink_send_123"
  );
  assert.equal(response.body.invoice?.status, "sent");
});

test("delivery opened endpoint updates tracked delivery status", async () => {
  const ownerId = "delivery-open-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Open Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DELIVERY-OPEN-1",
          issueDate: "2026-03-10",
          customerName: "Delivery Open Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-open-1",
              type: "labor",
              description: "Delivery open baseline",
              quantity: 1,
              unitPrice: 140,
              amount: 140
            }
          ],
          subtotal: 140,
          total: 140,
          balanceDue: 140
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "open@example.com" });
  assert.equal(sendResponse.status, 200);

  const openResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/delivery/opened`)
    .set("x-invoice-user-id", ownerId)
    .send({});
  assert.equal(openResponse.status, 200);
  assert.equal(openResponse.body.delivery.status, "opened");
  assert.equal(openResponse.body.delivery.openCount, 1);
  assert.equal(typeof openResponse.body.delivery.openedAt, "string");

  const getResponse = await request(app)
    .get(`/api/invoices/${invoiceId}`)
    .set("x-invoice-user-id", ownerId);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.invoice.delivery.status, "opened");
  assert.equal(getResponse.body.invoice.delivery.openCount, 1);
});

test("send endpoint uses resend provider when configured", async () => {
  const ownerId = "delivery-provider-owner";
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
  process.env.APP_BASE_URL = "https://app.notebill.app";
  const fetchCalls: Array<{ url: unknown; init: unknown }> = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: unknown) => {
    fetchCalls.push({ url: input, init });
    return new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Provider Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DELIVERY-PROVIDER-1",
          issueDate: "2026-03-11",
          customerName: "Delivery Provider Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-provider-1",
              type: "labor",
              description: "Delivery provider baseline",
              quantity: 1,
              unitPrice: 160,
              amount: 160
            }
          ],
          subtotal: 160,
          total: 160,
          balanceDue: 160
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "provider@example.com" });
  assert.equal(sendResponse.status, 200);
  assert.equal(sendResponse.body.mode, "provider");
  assert.equal(sendResponse.body.provider, "resend");
  assert.equal(sendResponse.body.delivery.mode, "provider");
  assert.equal(sendResponse.body.delivery.provider, "resend");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, "https://api.resend.com/emails");
  const fetchInit = fetchCalls[0]?.init as RequestInit | undefined;
  assert.equal(fetchInit?.method, "POST");
  const body = JSON.parse(String(fetchInit?.body ?? "{}"));
  assert.equal(body.from, "billing@notebill.app");
  assert.equal(Array.isArray(body.to), true);
  assert.equal(body.to[0], "provider@example.com");
  assert.match(String(body.html), /delivery\/opened\/pixel\?token=/);
});

test("send endpoint uses smtp2go provider when configured", async () => {
  const ownerId = "delivery-smtp2go-owner";
  process.env.INVOICE_EMAIL_PROVIDER = "smtp2go";
  process.env.SMTP2GO_API_KEY = "smtp2go_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <invoices@notebill.app>";
  process.env.APP_BASE_URL = "https://app.notebill.app";
  const fetchCalls: Array<{ url: unknown; init: unknown }> = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: unknown) => {
    fetchCalls.push({ url: input, init });
    return new Response(JSON.stringify({ data: { email_id: "smtp2go_email_123" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "SMTP2GO Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-SMTP2GO-1",
          issueDate: "2026-03-11",
          customerName: "SMTP2GO Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-smtp2go-1",
              type: "labor",
              description: "SMTP2GO provider baseline",
              quantity: 1,
              unitPrice: 160,
              amount: 160
            }
          ],
          subtotal: 160,
          total: 160,
          balanceDue: 160
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "smtp2go@example.com" });
  assert.equal(sendResponse.status, 200);
  assert.equal(sendResponse.body.mode, "provider");
  assert.equal(sendResponse.body.provider, "smtp2go");
  assert.equal(sendResponse.body.delivery.mode, "provider");
  assert.equal(sendResponse.body.delivery.provider, "smtp2go");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, "https://api.smtp2go.com/v3/email/send");
  const fetchInit = fetchCalls[0]?.init as RequestInit | undefined;
  assert.equal(fetchInit?.method, "POST");
  const body = JSON.parse(String(fetchInit?.body ?? "{}"));
  assert.equal(body.sender, "NoteBill <invoices@notebill.app>");
  assert.equal(Array.isArray(body.to), true);
  assert.equal(body.to[0], "smtp2go@example.com");
  assert.match(String(body.html_body), /delivery\/opened\/pixel\?token=/);
});

test("delivery pixel endpoint marks matching token as opened", async () => {
  const ownerId = "delivery-pixel-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Pixel Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DELIVERY-PIXEL-1",
          issueDate: "2026-03-11",
          customerName: "Delivery Pixel Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-pixel-1",
              type: "labor",
              description: "Delivery pixel baseline",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "pixel@example.com" });
  assert.equal(sendResponse.status, 200);

  const rawStore = await fs.readFile(invoiceDeliveryStoreFilePath, "utf8");
  const parsedStore = JSON.parse(rawStore);
  const trackingToken = parsedStore?.entries?.[0]?.trackingToken;
  assert.equal(typeof trackingToken, "string");
  assert.ok(trackingToken.length > 0);

  const pixelResponse = await request(app).get(
    `/api/invoices/${invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`
  );
  assert.equal(pixelResponse.status, 200);
  assert.match(String(pixelResponse.headers["content-type"] || ""), /^image\/gif/);

  const getResponse = await request(app)
    .get(`/api/invoices/${invoiceId}`)
    .set("x-invoice-user-id", ownerId);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.invoice.delivery.status, "opened");
  assert.equal(getResponse.body.invoice.delivery.openCount, 1);
});

test("account plan endpoint reports free-tier usage and remaining saves", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";

  const saveResponse = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Mike Johnson",
        workSessions: [],
        materials: [],
        notes: "Test"
      },
      finishedInvoice: {
        invoiceNumber: "INV-2001",
        issueDate: "2026-03-10",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Roof repair",
            quantity: 1,
            unitPrice: 100,
            amount: 100
          }
        ],
        subtotal: 100,
        total: 100,
        balanceDue: 100
      }
    }
  });

  assert.equal(saveResponse.status, 200);

  const planResponse = await request(app).get("/api/account/plan");
  assert.equal(planResponse.status, 200);
  assert.equal(planResponse.body.plan, "free");
  assert.equal(planResponse.body.limits.invoicesPerMonth, 2);
  assert.equal(planResponse.body.usage.invoicesCreated, 1);
  assert.equal(planResponse.body.usage.invoicesRemaining, 1);
  assert.equal(planResponse.body.canCreateInvoice, true);
  assert.equal(planResponse.body.upgradeRequired, false);
});

test("account plan endpoint includes sanitized upgrade and billing links", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_UPGRADE_URL = "https://notebill.app/upgrade";
  process.env.INVOICE_BILLING_PORTAL_URL = "https://notebill.app/billing";

  const validResponse = await request(app).get("/api/account/plan");
  assert.equal(validResponse.status, 200);
  assert.equal(validResponse.body.links?.upgradeUrl, "https://notebill.app/upgrade");
  assert.equal(validResponse.body.links?.billingPortalUrl, "https://notebill.app/billing");

  process.env.INVOICE_UPGRADE_URL = "javascript:alert(1)";
  process.env.INVOICE_BILLING_PORTAL_URL = "ftp://notebill.app/billing";

  const invalidResponse = await request(app).get("/api/account/plan");
  assert.equal(invalidResponse.status, 200);
  assert.equal(invalidResponse.body.links?.upgradeUrl, null);
  assert.equal(invalidResponse.body.links?.billingPortalUrl, null);
});

test("account plan endpoint reports stripe billing capabilities from env flags", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";

  const response = await request(app).get("/api/account/plan");
  assert.equal(response.status, 200);
  assert.equal(response.body.billing?.provider, "stripe");
  assert.equal(response.body.billing?.checkoutAvailable, true);
  assert.equal(response.body.billing?.portalAvailable, true);
  assert.equal(response.body.billing?.webhookAvailable, true);
});

test("billing diagnostics endpoint reports stripe readiness + entitlement counts", async () => {
  const baseline = await request(app).get("/api/system/billing");
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.provider, "none");
  assert.equal(baseline.body.entitlements?.subscriptionCount, 0);
  assert.equal(baseline.body.entitlements?.activeSubscriptionCount, 0);
  assert.match(String(baseline.body.warning || ""), /STRIPE_SECRET_KEY/i);

  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";

  const payload = JSON.stringify({
    id: "evt_test_billing_diag_checkout",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_billing_diag",
        object: "checkout.session",
        customer: "cus_test_billing_diag",
        subscription: "sub_test_billing_diag",
        customer_email: "diag@test.dev",
        metadata: {
          ownerId: "owner-diagnostics",
          userId: "user-diagnostics",
          email: "diag@test.dev"
        }
      }
    }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });
  const webhookResponse = await request(app)
    .post("/api/billing/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
  assert.equal(webhookResponse.status, 200);

  const afterWebhook = await request(app).get("/api/system/billing");
  assert.equal(afterWebhook.status, 200);
  assert.equal(afterWebhook.body.provider, "stripe");
  assert.equal(afterWebhook.body.capabilities?.checkoutAvailable, true);
  assert.equal(afterWebhook.body.capabilities?.webhookAvailable, true);
  assert.equal(afterWebhook.body.entitlements?.customerCount, 1);
  assert.equal(afterWebhook.body.entitlements?.subscriptionCount, 1);
  assert.equal(afterWebhook.body.entitlements?.activeSubscriptionCount, 1);
  assert.equal(afterWebhook.body.entitlements?.missingIdentityCount, 0);
  assert.equal(afterWebhook.body.entitlements?.byStatus?.active, 1);
  assert.equal(afterWebhook.body.warning, null);
});

test("billing diagnostics flags test-mode keys when live launch billing is required", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_placeholder";
  process.env.STRIPE_PRICE_ID = "price_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";
  process.env.INVOICE_LAUNCH_REQUIRE_LIVE_BILLING = "true";

  const response = await request(app).get("/api/system/billing");
  assert.equal(response.status, 200);
  assert.equal(response.body.capabilities?.secretKeyMode, "test");
  assert.equal(response.body.capabilities?.publishableKeyMode, "test");
  assert.equal(response.body.launchPolicy?.requireLiveMode, true);
  assert.match(String(response.body.warning || ""), /live billing keys/i);

  const launchResponse = await request(app).get("/api/system/launch");
  assert.equal(launchResponse.status, 200);
  assert.equal(launchResponse.body.billing?.ready, false);
  assert.match(String(launchResponse.body.billing?.warning || ""), /live billing keys/i);
});

test("delivery diagnostics endpoint reports provider readiness + send summary", async () => {
  const baseline = await request(app).get("/api/system/delivery");
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.provider, "none");
  assert.equal(baseline.body.capabilities?.configured, false);
  assert.equal(baseline.body.summary?.sentCount, 0);
  assert.match(String(baseline.body.warning || ""), /tracking-only/i);

  const ownerId = "delivery-diagnostics-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Delivery Diagnostics Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-DELIVERY-DIAG-1",
          issueDate: "2026-03-11",
          customerName: "Delivery Diagnostics Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-delivery-diag-1",
              type: "labor",
              description: "Delivery diagnostics baseline",
              quantity: 1,
              unitPrice: 115,
              amount: 115
            }
          ],
          subtotal: 115,
          total: 115,
          balanceDue: 115
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "diag-delivery@example.com" });

  const afterSend = await request(app).get("/api/system/delivery");
  assert.equal(afterSend.status, 200);
  assert.equal(afterSend.body.summary?.sentCount, 1);
  assert.equal(afterSend.body.summary?.recordOnlyCount, 1);
  assert.equal(afterSend.body.summary?.providerSendCount, 0);
  assert.equal(afterSend.body.reminders?.dueCount, 0);
});

test("delivery diagnostics exposes launch test recipient readiness", async () => {
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <billing@notebill.app>";
  process.env.INVOICE_LAUNCH_TEST_EMAIL = "launch-test@example.com";
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    if (String(input) === "https://api.resend.com/domains") {
      return new Response(
        JSON.stringify({
          data: [{ id: "dom_test_123", name: "notebill.app", status: "verified", capabilities: { sending: "enabled" } }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    throw new Error(`Unexpected fetch in delivery diagnostics test: ${String(input)}`);
  }) as typeof fetch;

  const response = await request(app).get("/api/system/delivery");
  assert.equal(response.status, 200);
  assert.equal(response.body.capabilities?.configured, true);
  assert.equal(response.body.capabilities?.fromDomain, "notebill.app");
  assert.equal(response.body.capabilities?.launchTestRecipientConfigured, true);
  assert.equal(response.body.verification?.ready, true);
  assert.equal(response.body.warning, null);
});

test("delivery diagnostics reports smtp2go provider as ready when configured", async () => {
  process.env.INVOICE_EMAIL_PROVIDER = "smtp2go";
  process.env.SMTP2GO_API_KEY = "smtp2go_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <invoices@notebill.app>";
  process.env.INVOICE_LAUNCH_TEST_EMAIL = "launch-test@example.com";

  const response = await request(app).get("/api/system/delivery");
  assert.equal(response.status, 200);
  assert.equal(response.body.provider, "smtp2go");
  assert.equal(response.body.capabilities?.configured, true);
  assert.equal(response.body.capabilities?.fromDomain, "notebill.app");
  assert.equal(response.body.capabilities?.launchTestRecipientConfigured, true);
  assert.equal(response.body.verification?.ready, true);
  assert.equal(response.body.warning, null);
});

test("delivery diagnostics warns when resend domain is not verified", async () => {
  process.env.APP_BASE_URL = "https://app.notebill.app";
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <billing@notebill.app>";
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    if (String(input) === "https://api.resend.com/domains") {
      return new Response(
        JSON.stringify({
          data: [{ id: "dom_test_123", name: "notebill.app", status: "pending", capabilities: { sending: "disabled" } }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    throw new Error(`Unexpected fetch in resend verification test: ${String(input)}`);
  }) as typeof fetch;

  const deliveryResponse = await request(app).get("/api/system/delivery");
  assert.equal(deliveryResponse.status, 200);
  assert.equal(deliveryResponse.body.verification?.ready, false);
  assert.match(String(deliveryResponse.body.warning || ""), /not verified for sending/i);

  const launchResponse = await request(app).get("/api/system/launch");
  assert.equal(launchResponse.status, 200);
  assert.equal(launchResponse.body.delivery?.ready, false);
  assert.match(String(launchResponse.body.delivery?.warning || ""), /not verified for sending/i);
});

test("delivery test endpoint sends a provider-backed launch verification email when configured", async () => {
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <billing@notebill.app>";
  process.env.APP_BASE_URL = "https://app.notebill.app";
  const fetchCalls: Array<{ url: unknown; init: unknown }> = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: unknown) => {
    fetchCalls.push({ url: input, init });
    return new Response(JSON.stringify({ id: "email_launch_test_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const response = await request(app).post("/api/system/delivery/test").send({
    recipientEmail: "qa-launch@example.com"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mode, "provider");
  assert.equal(response.body.provider, "resend");
  assert.equal(response.body.recipientEmail, "qa-launch@example.com");
  assert.equal(fetchCalls.length, 1);
  const fetchInit = fetchCalls[0]?.init as RequestInit | undefined;
  const body = JSON.parse(String(fetchInit?.body ?? "{}"));
  assert.equal(body.to[0], "qa-launch@example.com");
  assert.match(String(body.subject), /Invoice NOTEBILL-LAUNCH/);
});

test("delivery test endpoint sends a provider-backed launch verification email via smtp2go", async () => {
  process.env.INVOICE_EMAIL_PROVIDER = "smtp2go";
  process.env.SMTP2GO_API_KEY = "smtp2go_test_key";
  process.env.INVOICE_FROM_EMAIL = "NoteBill <invoices@notebill.app>";
  process.env.APP_BASE_URL = "https://app.notebill.app";
  const fetchCalls: Array<{ url: unknown; init: unknown }> = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: unknown) => {
    fetchCalls.push({ url: input, init });
    return new Response(JSON.stringify({ data: { email_id: "smtp2go_launch_test_123" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const response = await request(app).post("/api/system/delivery/test").send({
    recipientEmail: "qa-launch@example.com"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mode, "provider");
  assert.equal(response.body.provider, "smtp2go");
  assert.equal(response.body.recipientEmail, "qa-launch@example.com");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, "https://api.smtp2go.com/v3/email/send");
  const fetchInit = fetchCalls[0]?.init as RequestInit | undefined;
  const body = JSON.parse(String(fetchInit?.body ?? "{}"));
  assert.equal(body.to[0], "qa-launch@example.com");
  assert.match(String(body.subject), /Invoice NOTEBILL-LAUNCH/);
});

test("send-reminder endpoint reuses tracked recipient and bumps delivery/send timestamps", async () => {
  const ownerId = "delivery-reminder-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REMINDER-1",
          issueDate: "2026-03-11",
          customerName: "Reminder Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-reminder-1",
              type: "labor",
              description: "Reminder baseline",
              quantity: 1,
              unitPrice: 95,
              amount: 95
            }
          ],
          subtotal: 95,
          total: 95,
          balanceDue: 95
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "reminder@example.com" });
  assert.equal(sendResponse.status, 200);
  const firstSentAt = sendResponse.body.delivery?.sentAt as string;
  const firstUpdatedAt = sendResponse.body.invoice?.updatedAt as string;

  await new Promise((resolve) => setTimeout(resolve, 10));

  const reminderResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send-reminder`)
    .set("x-invoice-user-id", ownerId)
    .send({});
  assert.equal(reminderResponse.status, 200);
  assert.equal(reminderResponse.body.mode, "record_only");
  assert.equal(reminderResponse.body.provider, "none");
  assert.equal(reminderResponse.body.reminder?.recipientEmail, "reminder@example.com");
  assert.equal(reminderResponse.body.delivery?.sendCount, 2);
  assert.equal(reminderResponse.body.delivery?.recipientEmail, "reminder@example.com");
  assert.ok(Date.parse(reminderResponse.body.delivery?.sentAt) >= Date.parse(firstSentAt));
  assert.ok(Date.parse(reminderResponse.body.invoice?.updatedAt) > Date.parse(firstUpdatedAt));
});

test("reminder run endpoint previews and sends due reminders with overrides", async () => {
  const ownerId = "delivery-reminder-run-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Run Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REMINDER-RUN-1",
          issueDate: "2026-03-11",
          customerName: "Reminder Run Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-reminder-run-1",
              type: "labor",
              description: "Reminder run baseline",
              quantity: 1,
              unitPrice: 120,
              amount: 120
            }
          ],
          subtotal: 120,
          total: 120,
          balanceDue: 120
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "run-reminder@example.com" });
  assert.equal(sendResponse.status, 200);

  await mutateDeliveryStoreEntry(invoiceId, (entry) => ({
    ...entry,
    sentAt: "2026-01-01T00:00:00.000Z"
  }));

  const dryRunResponse = await request(app)
    .post("/api/invoices/reminders/run")
    .set("x-invoice-user-id", ownerId)
    .send({
      dryRun: true,
      dueAfterDays: 14
    });
  assert.equal(dryRunResponse.status, 200);
  assert.equal(dryRunResponse.body.dryRun, true);
  assert.equal(dryRunResponse.body.dueCount, 1);
  assert.equal(dryRunResponse.body.due?.[0]?.invoiceId, invoiceId);

  const runResponse = await request(app)
    .post("/api/invoices/reminders/run")
    .set("x-invoice-user-id", ownerId)
    .send({
      dueAfterDays: 14
    });
  assert.equal(runResponse.status, 200);
  assert.equal(runResponse.body.dueCount, 1);
  assert.equal(runResponse.body.sentCount, 1);
  assert.equal(runResponse.body.results?.[0]?.invoiceId, invoiceId);
  assert.equal(runResponse.body.results?.[0]?.sent, true);

  const getResponse = await request(app)
    .get(`/api/invoices/${invoiceId}`)
    .set("x-invoice-user-id", ownerId);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.invoice?.delivery?.sendCount, 2);
});

test("delivery diagnostics endpoint scopes reminder preview by request owner", async () => {
  const ownerId = "delivery-reminder-diagnostics-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Reminder Diagnostics Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-REMINDER-DIAG-1",
          issueDate: "2026-03-11",
          customerName: "Reminder Diagnostics Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-reminder-diag-1",
              type: "labor",
              description: "Reminder diagnostics baseline",
              quantity: 1,
              unitPrice: 80,
              amount: 80
            }
          ],
          subtotal: 80,
          total: 80,
          balanceDue: 80
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const sendResponse = await request(app)
    .post(`/api/invoices/${invoiceId}/send`)
    .set("x-invoice-user-id", ownerId)
    .send({ recipientEmail: "owner-reminder@example.com" });
  assert.equal(sendResponse.status, 200);

  await mutateDeliveryStoreEntry(invoiceId, (entry) => ({
    ...entry,
    sentAt: "2026-01-01T00:00:00.000Z"
  }));

  const diagnosticsResponse = await request(app)
    .get("/api/system/delivery")
    .set("x-invoice-user-id", ownerId);
  assert.equal(diagnosticsResponse.status, 200);
  assert.equal(diagnosticsResponse.body.reminders?.ownerId, ownerId);
  assert.equal(diagnosticsResponse.body.reminders?.dueCount, 1);
  assert.equal(diagnosticsResponse.body.reminders?.due?.[0]?.invoiceId, invoiceId);
});

test("checkout session endpoint returns a setup error when stripe is not configured", async () => {
  const response = await request(app).post("/api/billing/checkout-session").send({});
  assert.equal(response.status, 400);
  assert.match(String(response.body.error || ""), /STRIPE_SECRET_KEY/i);
});

test("billing portal endpoint requires an authenticated session", async () => {
  const response = await request(app).post("/api/billing/portal-session").send({});
  assert.equal(response.status, 401);
  assert.match(String(response.body.error || ""), /sign in/i);
});

test("stripe webhook checkout event grants pro access for matching signed-in user", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";

  const email = "stripe-pro@test.dev";
  const signInResponse = await request(app).post("/api/auth/session").send({ email });
  assert.equal(signInResponse.status, 200);
  const token = signInResponse.body.token as string;
  const session = signInResponse.body.session as { userId: string; email: string };

  const planBefore = await request(app).get("/api/account/plan").set("authorization", `Bearer ${token}`);
  assert.equal(planBefore.status, 200);
  assert.equal(planBefore.body.plan, "free");

  const webhookPayload = JSON.stringify({
    id: "evt_test_checkout_completed",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        customer: "cus_test_123",
        subscription: "sub_test_123",
        customer_email: email,
        metadata: {
          ownerId: session.userId,
          userId: session.userId,
          email: session.email
        }
      }
    }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: webhookPayload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });

  const webhookResponse = await request(app)
    .post("/api/billing/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(webhookPayload);
  assert.equal(webhookResponse.status, 200);
  assert.equal(webhookResponse.body.ok, true);
  assert.equal(webhookResponse.body.handled, true);
  assert.equal(webhookResponse.body.eventType, "checkout.session.completed");

  const planAfter = await request(app).get("/api/account/plan").set("authorization", `Bearer ${token}`);
  assert.equal(planAfter.status, 200);
  assert.equal(planAfter.body.plan, "pro");
});

test("stripe payment-intent webhook marks a saved invoice paid and clears balance due", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";

  const ownerId = "invoice-payment-owner";
  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", ownerId)
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName: "Paid Client",
          workSessions: [],
          materials: []
        },
        finishedInvoice: {
          invoiceNumber: "INV-PAID-1",
          issueDate: "2026-03-12",
          customerName: "Paid Client",
          currency: "USD",
          lineItems: [
            {
              id: "line-paid-1",
              type: "labor",
              description: "Repair visit",
              quantity: 1,
              unitPrice: 240,
              amount: 240
            }
          ],
          subtotal: 240,
          total: 240,
          balanceDue: 240
        }
      }
    });
  const invoiceId = saveResponse.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const webhookPayload = JSON.stringify({
    id: "evt_test_payment_intent_succeeded",
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_invoice_paid_123",
        object: "payment_intent",
        metadata: {
          paymentKind: "saved_invoice_payment",
          invoiceId,
          ownerId,
          invoiceNumber: "INV-PAID-1"
        }
      }
    }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: webhookPayload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });

  const webhookResponse = await request(app)
    .post("/api/billing/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(webhookPayload);
  assert.equal(webhookResponse.status, 200);
  assert.equal(webhookResponse.body.ok, true);
  assert.equal(webhookResponse.body.handled, true);
  assert.equal(webhookResponse.body.eventType, "payment_intent.succeeded");

  const getResponse = await request(app)
    .get(`/api/invoices/${invoiceId}`)
    .set("x-invoice-user-id", ownerId);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.invoice?.status, "paid");
  assert.equal(getResponse.body.invoice?.invoiceData?.finishedInvoice?.balanceDue, 0);
});

test("stripe webhook endpoint requires signature header", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_placeholder";

  const response = await request(app)
    .post("/api/billing/stripe/webhook")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ id: "evt_test_missing_signature", type: "checkout.session.completed", data: { object: {} } }));

  assert.equal(response.status, 400);
  assert.match(String(response.body.error || ""), /Missing Stripe signature header/i);
});

test("free-tier save limit blocks new saves but still allows updates", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";

  const firstSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Mike Johnson",
        workSessions: [],
        materials: [],
        notes: "Initial note"
      },
      finishedInvoice: {
        invoiceNumber: "INV-3001",
        issueDate: "2026-03-10",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Roof repair",
            quantity: 1,
            unitPrice: 125,
            amount: 125
          }
        ],
        notes: "Initial note",
        subtotal: 125,
        total: 125,
        balanceDue: 125
      }
    }
  });
  assert.equal(firstSave.status, 200);
  const invoiceId = firstSave.body.invoice.invoiceId as string;
  assert.ok(invoiceId);

  const blockedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Second Client",
        workSessions: [],
        materials: []
      },
      finishedInvoice: {
        invoiceNumber: "INV-3002",
        issueDate: "2026-03-10",
        customerName: "Second Client",
        currency: "USD",
        lineItems: [
          {
            id: "line-2",
            type: "labor",
            description: "Gutter cleanup",
            quantity: 1,
            unitPrice: 90,
            amount: 90
          }
        ],
        subtotal: 90,
        total: 90,
        balanceDue: 90
      }
    }
  });

  assert.equal(blockedSave.status, 402);
  assert.match(String(blockedSave.body.error || ""), /Free plan limit reached/i);

  const updateSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    invoiceId,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Mike Johnson",
        workSessions: [],
        materials: [],
        notes: "Updated note"
      },
      finishedInvoice: {
        invoiceNumber: "INV-3001",
        issueDate: "2026-03-10",
        customerName: "Mike Johnson",
        currency: "USD",
        lineItems: [
          {
            id: "line-1",
            type: "labor",
            description: "Roof repair and cleanup",
            quantity: 1,
            unitPrice: 125,
            amount: 125
          }
        ],
        notes: "Updated note",
        subtotal: 125,
        total: 125,
        balanceDue: 125
      }
    }
  });

  assert.equal(updateSave.status, 200);
  assert.equal(updateSave.body.invoice.invoiceId, invoiceId);
});

test("pro allowlist bypasses free monthly save limit", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "free";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  process.env.INVOICE_PRO_EMAILS = "pro@test.dev";

  const signInResponse = await request(app).post("/api/auth/session").send({ email: "pro@test.dev" });
  assert.equal(signInResponse.status, 200);
  const token = signInResponse.body.token as string;
  assert.ok(token);

  const buildSavePayload = (invoiceNumber: string) => ({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: {
        customerName: "Pro Client",
        workSessions: [],
        materials: []
      },
      finishedInvoice: {
        invoiceNumber,
        issueDate: "2026-03-10",
        customerName: "Pro Client",
        currency: "USD",
        lineItems: [
          {
            id: `${invoiceNumber}-line`,
            type: "labor",
            description: "Pro save",
            quantity: 1,
            unitPrice: 150,
            amount: 150
          }
        ],
        subtotal: 150,
        total: 150,
        balanceDue: 150
      }
    }
  });

  const firstSave = await request(app)
    .post("/api/invoices/save")
    .set("authorization", `Bearer ${token}`)
    .send(buildSavePayload("INV-PRO-1"));
  assert.equal(firstSave.status, 200);

  const secondSave = await request(app)
    .post("/api/invoices/save")
    .set("authorization", `Bearer ${token}`)
    .send(buildSavePayload("INV-PRO-2"));
  assert.equal(secondSave.status, 200);

  const planResponse = await request(app).get("/api/account/plan").set("authorization", `Bearer ${token}`);
  assert.equal(planResponse.status, 200);
  assert.equal(planResponse.body.plan, "pro");
  assert.equal(planResponse.body.canCreateInvoice, true);
  assert.equal(planResponse.body.upgradeRequired, false);
  assert.equal(planResponse.body.limits.invoicesPerMonth, null);
});

test("delete removes saved invoice", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  assert.equal(generated.status, 200);

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  assert.equal(acceptedSave.status, 200);
  const savedId = acceptedSave.body.invoice.invoiceId;
  assert.ok(savedId);

  const deleteResponse = await request(app).delete(`/api/invoices/${savedId}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);

  const listAfterDelete = await request(app).get("/api/invoices");
  assert.equal(listAfterDelete.status, 200);
  assert.equal(listAfterDelete.body.invoices.length, 0);
});

test("soft delete hides invoice and restore brings it back", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  const acceptedSave = await request(app).post("/api/invoices/save").send({
    confirmSave: true,
    sourceType: "text_input",
    invoiceData: {
      structuredInvoice: generated.body.structuredInvoice,
      finishedInvoice: generated.body.invoice
    }
  });

  const savedId = acceptedSave.body.invoice.invoiceId;
  const softDelete = await request(app)
    .post(`/api/invoices/${savedId}/status`)
    .send({ status: "deleted" });

  assert.equal(softDelete.status, 200);
  assert.equal(softDelete.body.invoice.status, "deleted");

  const listAfterSoftDelete = await request(app).get("/api/invoices");
  assert.equal(listAfterSoftDelete.status, 200);
  assert.equal(listAfterSoftDelete.body.invoices.length, 0);

  const listIncludingDeleted = await request(app).get("/api/invoices?includeDeleted=true");
  assert.equal(listIncludingDeleted.status, 200);
  assert.equal(listIncludingDeleted.body.invoices.length, 1);
  assert.equal(listIncludingDeleted.body.invoices[0].status, "deleted");

  const restore = await request(app).post(`/api/invoices/${savedId}/restore`);
  assert.equal(restore.status, 200);
  assert.equal(restore.body.invoice.status, "draft");

  const listAfterRestore = await request(app).get("/api/invoices");
  assert.equal(listAfterRestore.status, 200);
  assert.equal(listAfterRestore.body.invoices.length, 1);
});

test("invoice library is scoped by owner id", async () => {
  useMockResponses([structuredWithLaborPricing()]);

  const generatedA = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });
  assert.equal(generatedA.status, 200);
  const saveA = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", "owner-a")
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: generatedA.body.structuredInvoice,
        finishedInvoice: generatedA.body.invoice
      }
    });
  assert.equal(saveA.status, 200);
  const ownerAId = saveA.body.invoice.invoiceId;

  useMockResponses([structuredWithLaborPricing()]);
  const generatedB = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 11 unclogged drain 1h @ 90/hr"
  });
  assert.equal(generatedB.status, 200);
  const saveB = await request(app)
    .post("/api/invoices/save")
    .set("x-invoice-user-id", "owner-b")
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: generatedB.body.structuredInvoice,
        finishedInvoice: generatedB.body.invoice
      }
    });
  assert.equal(saveB.status, 200);
  const ownerBId = saveB.body.invoice.invoiceId;

  const listA = await request(app).get("/api/invoices").set("x-invoice-user-id", "owner-a");
  assert.equal(listA.status, 200);
  assert.equal(listA.body.invoices.length, 1);
  assert.equal(listA.body.invoices[0].invoiceId, ownerAId);

  const listB = await request(app).get("/api/invoices").set("x-invoice-user-id", "owner-b");
  assert.equal(listB.status, 200);
  assert.equal(listB.body.invoices.length, 1);
  assert.equal(listB.body.invoices[0].invoiceId, ownerBId);

  const crossOwnerRead = await request(app)
    .get(`/api/invoices/${ownerAId}`)
    .set("x-invoice-user-id", "owner-b");
  assert.equal(crossOwnerRead.status, 400);
  assert.match(crossOwnerRead.body.error, /not found/i);
});

test("recent client context returns the latest matching invoices only", async () => {
  const saveInvoice = async (
    customerName: string,
    invoiceNumber: string,
    description: string,
    notes: string
  ) =>
    request(app).post("/api/invoices/save").send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: {
          customerName,
          workSessions: [],
          materials: [],
          notes
        },
        finishedInvoice: {
          invoiceNumber,
          issueDate: "2026-03-09",
          customerName,
          currency: "USD",
          lineItems: [
            {
              id: `${invoiceNumber}-line-1`,
              type: "labor",
              description,
              quantity: 1,
              unitPrice: 100,
              amount: 100
            }
          ],
          notes,
          subtotal: 100,
          total: 100,
          balanceDue: 100
        }
      }
    });

  assert.equal((await saveInvoice("Mike Johnson", "INV-1001", "Roof leak repair", "Use gray sealant.")).status, 200);
  assert.equal((await saveInvoice("Jamie Client", "INV-2001", "Gutter cleanup", "Leaf guard note.")).status, 200);
  assert.equal(
    (await saveInvoice("Mike Johnson", "INV-1002", "Skylight reseal", "Collect deposit before material order.")).status,
    200
  );

  const response = await request(app).get("/api/invoices/recent-context").query({
    client: "mike johnson"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.matches.length, 2);
  assert.equal(response.body.matches[0].invoiceNumber, "INV-1002");
  assert.equal(response.body.matches[0].lineItemDescriptions[0], "Skylight reseal");
  assert.equal(response.body.matches[0].notes, "Collect deposit before material order.");
  assert.equal(response.body.matches[1].invoiceNumber, "INV-1001");
});

test("auth session endpoint returns token + normalized user session", async () => {
  const response = await request(app).post("/api/auth/session").send({ email: "  TEST@Example.com  " });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.token, "string");
  assert.equal(response.body.session.email, "test@example.com");
  assert.match(response.body.session.userId, /^usr_[a-f0-9]{24}$/);
  assert.equal(typeof response.body.session.expiresAt, "string");
});

test("authenticated owner id takes precedence over spoofed owner header", async () => {
  const sessionResponse = await request(app).post("/api/auth/session").send({ email: "alice@example.com" });
  assert.equal(sessionResponse.status, 200);
  const aliceToken = sessionResponse.body.token as string;

  useMockResponses([structuredWithLaborPricing()]);
  const generated = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });
  assert.equal(generated.status, 200);

  const saveResponse = await request(app)
    .post("/api/invoices/save")
    .set("authorization", `Bearer ${aliceToken}`)
    .set("x-invoice-user-id", "spoofed-owner-id")
    .send({
      confirmSave: true,
      sourceType: "text_input",
      invoiceData: {
        structuredInvoice: generated.body.structuredInvoice,
        finishedInvoice: generated.body.invoice
      }
    });

  assert.equal(saveResponse.status, 200);
  const savedInvoiceId = saveResponse.body.invoice.invoiceId as string;

  const spoofedList = await request(app).get("/api/invoices").set("x-invoice-user-id", "spoofed-owner-id");
  assert.equal(spoofedList.status, 200);
  assert.equal(spoofedList.body.invoices.length, 0);

  const authedList = await request(app).get("/api/invoices").set("authorization", `Bearer ${aliceToken}`);
  assert.equal(authedList.status, 200);
  assert.equal(authedList.body.invoices.length, 1);
  assert.equal(authedList.body.invoices[0].invoiceId, savedInvoiceId);
});

test("from-input response includes output quality gate metadata", async () => {
  useMockResponses([
    structuredWithLaborPricing(),
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed sink leak 2h @ 95/hr and pipe tape $7"
  });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.qualityGate, "object");
  assert.equal(response.body.qualityGate.status, "pass");
  assert.equal(response.body.qualityGate.blockerCount, 0);
  assert.ok(Array.isArray(response.body.qualityGate.blockers));
});

test("from-input quality gate warns on non-client-facing line wording without blocking generate", async () => {
  useMockResponses([
    {
      customerName: "Mike",
      workSessions: [
        {
          date: "Jan 10",
          tasks: [{ description: "fixed thing stuff", hours: 1, rate: 95, amount: 95 }]
        }
      ],
      materials: []
    },
    { assumptions: [], decisions: [], unparsedLines: [] }
  ]);

  const response = await request(app).post("/api/invoices/from-input").send({
    messyInput: "Jan 10 fixed thing stuff 1h @ 95/hr"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.qualityGate.status, "pass");
  assert.equal(response.body.qualityGate.blockerCount, 0);
  assert.ok(
    (response.body.qualityGate.warnings ?? []).some(
      (warning: { code?: string }) => warning.code === "description_clarity"
    )
  );
});

test("apply-decision resolves billing skip without re-running AI parse", async () => {
  setJsonTaskRunnerForTests(async () => {
    throw new Error("apply-decision should not call runJsonTask");
  });

  const response = await request(app).post("/api/invoices/apply-decision").send({
    structuredInvoice: {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Feb 2",
          tasks: [
            { description: "Faucet repair", hours: 2, rate: 80, amount: 160 },
            { description: "Cabinet door adjustment", hours: 0.33, rate: 80, amount: 26.4 }
          ]
        }
      ],
      materials: [{ description: "Parking", quantity: 1, unitCost: 4.5, amount: 4.5 }]
    },
    openDecisions: [
      {
        id: "decision-cabinet",
        kind: "billing",
        prompt: 'Bill this item? "Cabinet door adjustment"',
        sourceSnippet: "Cabinet door adjustment up to you"
      },
      {
        id: "decision-tax",
        kind: "tax",
        prompt: "Apply 5% tax?",
        sourceSnippet: "I sometimes add 5% tax."
      }
    ],
    assumptions: ["Tax assumed 0%."],
    unparsedLines: [],
    decisionAction: {
      id: "decision-cabinet",
      type: "exclude",
      kind: "billing",
      snippet: "Cabinet door adjustment"
    },
    pendingTaxRate: null
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.openDecisions.length, 1);
  assert.equal(response.body.openDecisions[0].id, "decision-tax");
  const cabinetLine = response.body.invoice.lineItems.find((line: { description: string }) =>
    /cabinet/i.test(line.description)
  );
  assert.ok(cabinetLine);
  assert.equal(cabinetLine.unitPrice, 0);
  assert.equal(cabinetLine.amount, 0);
});

test("apply-decision resolves tax decision and returns pending tax rate deterministically", async () => {
  setJsonTaskRunnerForTests(async () => {
    throw new Error("apply-decision should not call runJsonTask");
  });

  const response = await request(app).post("/api/invoices/apply-decision").send({
    structuredInvoice: {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Feb 2",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    openDecisions: [
      {
        id: "decision-tax",
        kind: "tax",
        prompt: "Apply 5% tax?",
        sourceSnippet: "I sometimes add 5% tax."
      }
    ],
    assumptions: ["Tax assumed 0%."],
    unparsedLines: [],
    decisionAction: {
      id: "decision-tax",
      type: "tax_apply",
      kind: "tax",
      snippet: "Apply tax"
    },
    pendingTaxRate: null
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.openDecisions.length, 0);
  assert.equal(response.body.pendingTaxRate, "5");
  const assumptions = response.body.assumptions ?? [];
  assert.ok(!assumptions.some((assumption: string) => /tax assumed 0%/i.test(assumption)));
});

test("apply-decision includes timing payload only when debugTiming is enabled", async () => {
  setJsonTaskRunnerForTests(async () => {
    throw new Error("apply-decision should not call runJsonTask");
  });

  const baseRequest = {
    structuredInvoice: {
      customerName: "Mike Johnson",
      workSessions: [
        {
          date: "Feb 2",
          tasks: [{ description: "Faucet repair", hours: 2, rate: 80, amount: 160 }]
        }
      ],
      materials: []
    },
    openDecisions: [
      {
        id: "decision-tax",
        kind: "tax",
        prompt: "Apply 5% tax?",
        sourceSnippet: "I sometimes add 5% tax."
      }
    ],
    assumptions: ["Tax assumed 0%."],
    unparsedLines: [],
    decisionAction: {
      id: "decision-tax",
      type: "tax_skip",
      kind: "tax",
      snippet: "No tax"
    },
    pendingTaxRate: null
  };

  const withoutDebug = await request(app).post("/api/invoices/apply-decision").send(baseRequest);
  assert.equal(withoutDebug.status, 200);
  assert.equal(withoutDebug.body._timing, undefined);

  const withDebug = await request(app)
    .post("/api/invoices/apply-decision")
    .send({ ...baseRequest, debugTiming: true });
  assert.equal(withDebug.status, 200);
  assert.equal(typeof withDebug.body._timing?.serverApplyMs, "number");
  assert.equal(typeof withDebug.body._timing?.serverTotalMs, "number");
  assert.ok(withDebug.body._timing.serverTotalMs >= withDebug.body._timing.serverApplyMs);
});

function useMockResponses(responses: unknown[]): void {
  const queue = [...responses];
  setJsonTaskRunnerForTests(async <T>(): Promise<T> => {
    if (!queue.length) {
      throw new Error("Mock response queue is empty.");
    }

    return queue.shift() as T;
  });
}

async function mutateDeliveryStoreEntry(
  invoiceId: string,
  mutate: (entry: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  const raw = await fs.readFile(invoiceDeliveryStoreFilePath, "utf8");
  const parsed = JSON.parse(raw) as { entries?: Array<Record<string, unknown>> };
  parsed.entries = (parsed.entries ?? []).map((entry) => {
    if (entry?.invoiceId !== invoiceId) {
      return entry;
    }
    return mutate(entry);
  });
  await fs.writeFile(invoiceDeliveryStoreFilePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function structuredWithoutLaborPricing() {
  return {
    customerName: undefined,
    invoiceNumber: undefined,
    issueDate: undefined,
    workSessions: [
      {
        date: "Jan 10",
        tasks: [{ description: "Fixed sink leak" }]
      },
      {
        date: "Jan 11",
        tasks: [{ description: "Tested seal" }]
      }
    ],
    materials: [{ description: "Pipe tape", quantity: 1, unitCost: 5, amount: 5 }],
    notes: undefined
  };
}

function structuredWithLaborPricing() {
  return {
    invoiceNumber: "INV-100",
    issueDate: "2026-02-04",
    workSessions: [
      {
        date: "Jan 10",
        tasks: [{ description: "Fixed sink leak", hours: 2, rate: 95, amount: 190 }]
      }
    ],
    materials: [{ description: "Pipe tape", quantity: 1, unitCost: 7, amount: 7 }]
  };
}
