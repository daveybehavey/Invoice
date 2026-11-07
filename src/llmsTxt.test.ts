import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import request from "supertest";

// /llms.txt is a root-level static asset served from public/ by the same
// mechanism as /robots.txt and /sitemap.xml (express.static in this server;
// the Cloudflare assets layer in production). It previously fell through to
// the SPA shell because no public/llms.txt file existed. These tests pin the
// asset being served as text/plain with its real contents.
process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-test-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.OCR_METRICS_STORE_FILE = path.join(os.tmpdir(), `invoice-ocr-metrics-${randomUUID()}.json`);
process.env.FLOW_FRICTION_REPORT_FILE = path.join(os.tmpdir(), `invoice-flow-friction-${randomUUID()}.json`);
process.env.FLOW_FRICTION_HISTORY_FILE = path.join(os.tmpdir(), `invoice-flow-friction-history-${randomUUID()}.json`);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = path.join(os.tmpdir(), `invoice-stripe-entitlements-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = path.join(os.tmpdir(), `invoice-delivery-store-${randomUUID()}.json`);
process.env.REVENUE_SIGNALS_STORE_FILE = path.join(os.tmpdir(), `invoice-revenue-signals-${randomUUID()}.json`);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-email-signin-redemption-${randomUUID()}.json`
);
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(os.tmpdir(), `invoice-provider-usage-${randomUUID()}.json`);
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(os.tmpdir(), `invoice-launch-test-dispatch-${randomUUID()}.json`);
process.env.APP_BASE_URL = "http://localhost:3000";

const { app } = await import("./server.js");

test("GET /llms.txt serves the public llms.txt document as text/plain", async () => {
  const expected = await fs.readFile(path.resolve(process.cwd(), "public", "llms.txt"), "utf8");
  const res = await request(app).get("/llms.txt");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /^text\/plain/);
  assert.equal(res.text, expected);
  assert.ok(res.text.startsWith("# NoteBill"));
  assert.ok(!res.text.includes("<!doctype html"), "must not fall through to the SPA HTML shell");
});

test("GET /robots.txt still serves as text/plain (sibling static asset control)", async () => {
  const res = await request(app).get("/robots.txt");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /^text\/plain/);
  assert.ok(res.text.startsWith("User-agent:"));
});
