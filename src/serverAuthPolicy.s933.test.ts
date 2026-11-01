import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import request from "supertest";

// S93-3 item 3, fix round 1 (Codex P2-1): the diagnostics gate on
// /api/system/persistence also cut off the product consumers that read
// their minimal auth policy (authRequired + authProviders) from it —
// anonymous invoice-library users were told sign-in was required and
// loadInvoices never ran. The minimal policy now lives on the public
// GET /api/auth/policy; the full persistence payload stays operator-only.

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-s933-authpolicy-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.APP_BASE_URL = "http://localhost:3000";
delete process.env.INVOICE_REQUIRE_AUTH;

const [{ app }, { createAuthSessionForEmail }] = await Promise.all([
  import("./server.js"),
  import("./services/authSession.js")
]);

const ordinarySession = createAuthSessionForEmail("authpolicy-ordinary@test.dev");
const ordinaryHeaders = { authorization: `Bearer ${ordinarySession.token}` };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
});

afterEach(() => {
  delete process.env.INVOICE_REQUIRE_AUTH;
});

test("anonymous clients can read the minimal auth policy from the public endpoint", async () => {
  const response = await request(app).get("/api/auth/policy");
  assert.equal(response.status, 200, "the public auth policy must not require a session");
  assert.deepEqual(
    Object.keys(response.body).sort(),
    ["authProviders", "authRequired"],
    "the public policy exposes exactly the two fields product consumers need"
  );
  assert.equal(response.body.authRequired, false);
  assert.ok(Array.isArray(response.body.authProviders), "authProviders must be an array");
});

test("the public policy reflects the effective requirement and never carries diagnostics fields", async () => {
  process.env.INVOICE_REQUIRE_AUTH = "true";
  const response = await request(app).get("/api/auth/policy");
  assert.equal(response.status, 200);
  assert.equal(response.body.authRequired, true, "the policy must reflect INVOICE_REQUIRE_AUTH=true");
  for (const diagnosticsField of [
    "invoiceStoreBackend",
    "configuredBackend",
    "postgresUrlConfigured",
    "nodeEnv",
    "authSessionSecretConfigured",
    "authEmailProviderConfigured",
    "authPolicyReady",
    "authWarning",
    "migrationReady",
    "productionReady",
    "defaultOwnerId",
    "warning"
  ]) {
    assert.ok(!(diagnosticsField in response.body), `${diagnosticsField} must stay behind the diagnostics gate`);
  }
});

test("the diagnostics payload stays gated while the policy is public", async () => {
  const anonymousDiagnostics = await request(app).get("/api/system/persistence");
  assert.equal(anonymousDiagnostics.status, 401, "anonymous diagnostics reads stay rejected");
  const ordinaryDiagnostics = await request(app).get("/api/system/persistence").set(ordinaryHeaders);
  assert.equal(ordinaryDiagnostics.status, 403, "non-operator diagnostics reads stay forbidden");
  const policy = await request(app).get("/api/auth/policy");
  assert.equal(policy.status, 200, "the same anonymous client can still read the auth policy");
});

test("product consumers read auth policy from the public endpoint; the diagnostics UI stays on the gated routes", async () => {
  const library = await fs.readFile(
    path.join(repoRoot, "public/features/library/invoiceLibrary.jsx"),
    "utf8"
  );
  assert.ok(library.includes('"/api/auth/policy"'), "the invoice library must load policy from the public endpoint");
  assert.ok(
    !library.includes("/api/system/persistence"),
    "the invoice library must not read the gated diagnostics route"
  );

  const manualEditor = await fs.readFile(
    path.join(repoRoot, "public/features/manual/manualInvoiceCanvas.jsx"),
    "utf8"
  );
  assert.ok(manualEditor.includes('"/api/auth/policy"'), "the manual editor must load policy from the public endpoint");
  assert.ok(
    !manualEditor.includes("/api/system/persistence"),
    "the manual editor must not read the gated diagnostics route"
  );

  const diagnosticsUi = await fs.readFile(
    path.join(repoRoot, "public/features/diagnostics/intakeDiagnostics.jsx"),
    "utf8"
  );
  assert.ok(
    diagnosticsUi.includes("/api/system/persistence"),
    "the operator diagnostics UI keeps using the gated diagnostics routes"
  );
});
