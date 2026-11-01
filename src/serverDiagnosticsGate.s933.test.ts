import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import request from "supertest";

// S93-3 item 3 (S92-3 / S93-3 §3): global system diagnostics and telemetry
// endpoints are operator-only, behind a session + a SEPARATE
// INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS allowlist (empty by default).
// Anonymous -> 401, valid non-operator session -> 403, and denied
// requests must produce no diagnostic reads, export-state writes, or
// outbound fetch. The OCR export response is built from an allowlist and
// never contains the export target (which embeds the GA4 API secret).

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-s933-diag-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
const ocrMetricsStoreFilePath = path.join(os.tmpdir(), `invoice-s933-diag-ocr-${randomUUID()}.json`);
process.env.OCR_METRICS_STORE_FILE = ocrMetricsStoreFilePath;
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-s933-diag-ffr-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-s933-diag-ffh-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-diag-ent-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-diag-del-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-diag-rev-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-s933-diag-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-diag-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-s933-diag-launch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";

const [{ app }, { createAuthSessionForEmail }] = await Promise.all([
  import("./server.js"),
  import("./services/authSession.js")
]);

const operatorSession = createAuthSessionForEmail("diag-operator@test.dev");
const ordinarySession = createAuthSessionForEmail("diag-ordinary@test.dev");
const operatorHeaders = { authorization: `Bearer ${operatorSession.token}` };
const ordinaryHeaders = { authorization: `Bearer ${ordinarySession.token}` };

const GA4_SECRET = "ga4-secret-sentinel-933";
const EXPORT_ENV_KEYS = [
  "OCR_METRICS_EXPORT_PROVIDER",
  "OCR_METRICS_GA4_MEASUREMENT_ID",
  "OCR_METRICS_GA4_API_SECRET",
  "OCR_METRICS_GA4_ENDPOINT",
  "OCR_METRICS_EXPORT_URL"
] as const;
const savedExportEnv = new Map<string, string | undefined>(
  EXPORT_ENV_KEYS.map((key) => [key, process.env[key]])
);

let fetchCalls: Array<{ url: string }> = [];
let fetchStatus = 200;
const nativeFetch = globalThis.fetch;

function stubFetch(): void {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
    fetchCalls.push({ url: String(input) });
    return new Response(JSON.stringify({ ok: fetchStatus < 300 }), {
      status: fetchStatus,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

async function seedOcrSnapshot(lastExportedUpdatedAt: string): Promise<void> {
  await fs.mkdir(path.dirname(ocrMetricsStoreFilePath), { recursive: true });
  await fs.writeFile(
    ocrMetricsStoreFilePath,
    JSON.stringify(
      {
        totalEvents: 3,
        byConfidence: { high: 2, medium: 1, low: 0 },
        byReason: {},
        recentEvents: [],
        updatedAt: "2026-10-31T00:00:00.000Z",
        exportState: {
          lastAttemptAt: "",
          lastSuccessAt: "",
          lastExportedUpdatedAt,
          lastResult: ""
        }
      },
      null,
      2
    ),
    "utf8"
  );
}

async function readExportState(): Promise<{ lastExportedUpdatedAt?: string; lastResult?: string }> {
  const parsed = JSON.parse(await fs.readFile(ocrMetricsStoreFilePath, "utf8")) as {
    exportState?: { lastExportedUpdatedAt?: string; lastResult?: string };
  };
  return parsed.exportState ?? {};
}

function configureGa4Export(): void {
  process.env.OCR_METRICS_EXPORT_PROVIDER = "ga4";
  process.env.OCR_METRICS_GA4_MEASUREMENT_ID = "G-S933TEST";
  process.env.OCR_METRICS_GA4_API_SECRET = GA4_SECRET;
  delete process.env.OCR_METRICS_GA4_ENDPOINT;
  delete process.env.OCR_METRICS_EXPORT_URL;
}

beforeEach(async () => {
  process.env.INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS = operatorSession.session.userId;
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  await seedOcrSnapshot("");
  stubFetch();
  fetchStatus = 200;
});

afterEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = nativeFetch;
  for (const key of EXPORT_ENV_KEYS) {
    const value = savedExportEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  delete process.env.INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS;
});

const gatedGets = [
  "/api/system/persistence",
  "/api/system/persistence/migration",
  "/api/system/billing",
  "/api/system/delivery",
  "/api/system/launch",
  "/api/telemetry/ocr-confidence",
  "/api/telemetry/flow-friction",
  "/api/telemetry/intake-trends",
  "/api/telemetry/revenue-signals"
];

test("anonymous requests to every diagnostics/telemetry endpoint get 401 (GET, HEAD, and export POST)", async () => {
  for (const route of gatedGets) {
    const getResponse = await request(app).get(route);
    assert.equal(getResponse.status, 401, `GET ${route} must reject anonymous requests`);
    const headResponse = await request(app).head(route);
    assert.equal(headResponse.status, 401, `HEAD ${route} must reject anonymous requests`);
  }
  const exportResponse = await request(app).post("/api/telemetry/ocr-confidence/export").send({ force: true });
  assert.equal(exportResponse.status, 401);
  assert.equal(fetchCalls.length, 0, "a denied export must not dispatch");
  const state = await readExportState();
  assert.equal(state.lastResult ?? "", "", "a denied export must not write export state");
});

test("valid non-operator sessions get 403 on every endpoint; spoofed operator inputs never authorize", async () => {
  for (const route of gatedGets) {
    const response = await request(app).get(route).set(ordinaryHeaders);
    assert.equal(response.status, 403, `GET ${route} must forbid ordinary accounts`);
  }
  const exportResponse = await request(app)
    .post("/api/telemetry/ocr-confidence/export")
    .set(ordinaryHeaders)
    .send({ force: true });
  assert.equal(exportResponse.status, 403);
  assert.equal(fetchCalls.length, 0);

  const spoofed = await request(app)
    .get(`/api/system/persistence?operator=${operatorSession.session.userId}`)
    .set("x-invoice-user-id", operatorSession.session.userId)
    .set("x-user-id", operatorSession.session.userId);
  assert.equal(spoofed.status, 401, "header/query operator claims must not authorize anonymous requests");
});

test("an empty diagnostics allowlist denies even a would-be operator", async () => {
  delete process.env.INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS;
  const response = await request(app).get("/api/system/persistence").set(operatorHeaders);
  assert.equal(response.status, 403);
});

test("the launch-test operator allowlist does not grant diagnostics access", async () => {
  process.env.INVOICE_LAUNCH_TEST_OPERATOR_USER_IDS = ordinarySession.session.userId;
  try {
    const response = await request(app).get("/api/system/billing").set(ordinaryHeaders);
    assert.equal(response.status, 403, "diagnostics uses its own separate allowlist");
  } finally {
    delete process.env.INVOICE_LAUNCH_TEST_OPERATOR_USER_IDS;
  }
});

test("an authorized operator receives the diagnostics responses with Cache-Control: no-store", async () => {
  for (const route of gatedGets) {
    const response = await request(app).get(route).set(operatorHeaders);
    assert.equal(response.status, 200, `GET ${route} must serve the operator`);
    assert.equal(response.headers["cache-control"], "no-store", `${route} must be no-store`);
  }
  const delivery = await request(app)
    .get("/api/system/delivery")
    .set(operatorHeaders)
    .set("x-invoice-user-id", "caller-selected-other-owner");
  assert.equal(delivery.status, 200);
  assert.equal(
    delivery.body.reminders?.ownerId,
    operatorSession.session.userId,
    "the reminder preview is scoped to the operator's own session identity"
  );
});

test("operator export: strict force parsing, allowlist response, and the GA4 secret never leaves the server", async () => {
  configureGa4Export();

  for (const badForce of ["false", "true", 1, 0, {}, []]) {
    const response = await request(app)
      .post("/api/telemetry/ocr-confidence/export")
      .set(operatorHeaders)
      .send({ force: badForce });
    assert.equal(response.status, 400, `force=${JSON.stringify(badForce)} must be rejected`);
  }
  assert.equal(fetchCalls.length, 0, "rejected force values must not dispatch");

  const exported = await request(app)
    .post("/api/telemetry/ocr-confidence/export")
    .set(operatorHeaders)
    .send({});
  assert.equal(exported.status, 200);
  assert.equal(exported.body.exported, true);
  assert.equal(exported.body.configured, true);
  assert.equal(exported.headers["cache-control"], "no-store");
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0]!.url.includes(GA4_SECRET), "the outbound request legitimately carries the secret");
  const exportedBody = JSON.stringify(exported.body);
  assert.ok(!exportedBody.includes(GA4_SECRET), "the response must never contain the GA4 secret");
  assert.ok(!exportedBody.includes("api_secret"), "the response must never contain the target URL");
  assert.ok(!("target" in exported.body), "the response must not carry a target field");
  assert.deepEqual(
    Object.keys(exported.body).sort(),
    ["attempted", "configured", "exported", "provider", "reason", "snapshotUpdatedAt", "statusCode"].sort()
  );

  const unchanged = await request(app)
    .post("/api/telemetry/ocr-confidence/export")
    .set(operatorHeaders)
    .send({});
  assert.equal(unchanged.body.reason, "no_new_metrics");

  const forced = await request(app)
    .post("/api/telemetry/ocr-confidence/export")
    .set(operatorHeaders)
    .send({ force: true });
  assert.equal(forced.body.exported, true);
  assert.equal(fetchCalls.length, 2, "force=true bypasses the unchanged-snapshot check");

  fetchStatus = 500;
  await seedOcrSnapshot("");
  const failed = await request(app)
    .post("/api/telemetry/ocr-confidence/export")
    .set(operatorHeaders)
    .send({});
  assert.equal(failed.body.exported, false);
  assert.equal(failed.body.statusCode, 500);
  const failedBody = JSON.stringify(failed.body);
  assert.ok(!failedBody.includes(GA4_SECRET), "failure responses must not leak the secret either");
  assert.ok(!("target" in failed.body));
});

test("/health stays public", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});
