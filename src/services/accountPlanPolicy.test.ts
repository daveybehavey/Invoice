/**
 * Covers: src/services/accountPlanPolicy.ts
 *
 * Pins free/pro plan summary behaviour with a fixed UTC clock and a stub
 * metadata repository. Env mutations are restored after each test.
 * No Stripe network calls: entitlement path is avoided by using allowlists /
 * default-plan overrides, or by omitting authSession.userId (guest → free).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  buildFreePlanLimitMessage,
  getAccountPlanSummary,
  type AccountPlanSummary
} from "./accountPlanPolicy.js";
import type { InvoiceAuthSession } from "./authSession.js";

const ENV_KEYS = [
  "INVOICE_DEFAULT_PLAN",
  "INVOICE_FREE_SAVE_LIMIT_PER_MONTH",
  "INVOICE_PRO_EMAILS",
  "INVOICE_PRO_USER_IDS",
  "INVOICE_PRO_OWNER_IDS",
  "INVOICE_UPGRADE_URL",
  "INVOICE_BILLING_PORTAL_URL",
  "NODE_ENV"
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = savedEnv[key];
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

function stubRepo(createdAts: string[]) {
  return {
    async listSavedInvoiceMetadata() {
      return createdAts.map((createdAt, index) => ({
        invoiceId: `inv-${index}`,
        createdAt,
        updatedAt: createdAt,
        status: "draft" as const,
        customerName: "Synthetic Client",
        total: 10,
        currency: "USD",
        ownerId: "owner-1"
      }));
    }
  };
}

const FIXED_NOW = new Date("2026-11-15T12:00:00.000Z");
// November 2026 UTC period: [2026-11-01T00:00:00.000Z, 2026-12-01T00:00:00.000Z)

test("getAccountPlanSummary: free plan counts only invoices inside the UTC month window", async () => {
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "3";
  const repo = stubRepo([
    "2026-10-31T23:59:59.000Z", // prior month — excluded
    "2026-11-01T00:00:00.000Z", // in window
    "2026-11-14T08:00:00.000Z", // in window
    "2026-12-01T00:00:00.000Z" // next month — excluded
  ]);

  const summary = await getAccountPlanSummary({
    ownerId: "owner-1",
    authSession: null,
    repository: repo,
    now: FIXED_NOW
  });

  assert.equal(summary.plan, "free");
  assert.equal(summary.period.start, "2026-11-01T00:00:00.000Z");
  assert.equal(summary.period.end, "2026-12-01T00:00:00.000Z");
  assert.equal(summary.usage.invoicesCreated, 2);
  assert.equal(summary.limits.invoicesPerMonth, 3);
  assert.equal(summary.usage.invoicesRemaining, 1);
  assert.equal(summary.canCreateInvoice, true);
  assert.equal(summary.upgradeRequired, false);
});

test("getAccountPlanSummary: free plan blocks create when monthly count reaches limit", async () => {
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "2";
  const repo = stubRepo(["2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"]);

  const summary = await getAccountPlanSummary({
    ownerId: "owner-1",
    repository: repo,
    now: FIXED_NOW
  });

  assert.equal(summary.usage.invoicesCreated, 2);
  assert.equal(summary.usage.invoicesRemaining, 0);
  assert.equal(summary.canCreateInvoice, false);
  assert.equal(summary.upgradeRequired, true);
});

test("getAccountPlanSummary: INVOICE_DEFAULT_PLAN=pro unlocks unlimited saves", async () => {
  process.env.INVOICE_DEFAULT_PLAN = "pro";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  const repo = stubRepo(["2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"]);

  const summary = await getAccountPlanSummary({
    ownerId: "owner-1",
    repository: repo,
    now: FIXED_NOW
  });

  assert.equal(summary.plan, "pro");
  assert.equal(summary.canCreateInvoice, true);
  assert.equal(summary.upgradeRequired, false);
  assert.equal(summary.limits.invoicesPerMonth, null);
  assert.equal(summary.usage.invoicesRemaining, null);
  assert.equal(summary.usage.invoicesCreated, 2);
});

test("getAccountPlanSummary: allowlisted email grants pro without Stripe entitlement lookup", async () => {
  process.env.INVOICE_PRO_EMAILS = "pro.tester@example.com, other@example.com";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "1";
  const authSession = {
    userId: "user-pro",
    email: "Pro.Tester@example.com",
    provider: "email"
  } as InvoiceAuthSession;

  const summary = await getAccountPlanSummary({
    ownerId: "owner-spoof-ignored",
    authSession,
    repository: stubRepo(["2026-11-05T00:00:00.000Z"]),
    now: FIXED_NOW
  });

  assert.equal(summary.plan, "pro");
  assert.equal(summary.canCreateInvoice, true);
});

test("getAccountPlanSummary: upgrade / portal links parse http(s) only", async () => {
  process.env.INVOICE_UPGRADE_URL = "https://example.com/upgrade";
  process.env.INVOICE_BILLING_PORTAL_URL = "ftp://not-allowed.example/portal";
  process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH = "10";

  const summary = await getAccountPlanSummary({
    ownerId: "owner-1",
    repository: stubRepo([]),
    now: FIXED_NOW
  });

  assert.equal(summary.links.upgradeUrl, "https://example.com/upgrade");
  assert.equal(summary.links.billingPortalUrl, null);
});

test("buildFreePlanLimitMessage: formats created/limit for free; generic otherwise", () => {
  const freeBlocked: AccountPlanSummary = {
    plan: "free",
    canCreateInvoice: false,
    upgradeRequired: true,
    links: { upgradeUrl: null, billingPortalUrl: null },
    period: { start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" },
    limits: { invoicesPerMonth: 25 },
    usage: { invoicesCreated: 25, invoicesRemaining: 0 }
  };
  assert.equal(
    buildFreePlanLimitMessage(freeBlocked),
    "Free plan limit reached (25/25 invoices this month). Upgrade to save more."
  );

  const proSummary: AccountPlanSummary = {
    ...freeBlocked,
    plan: "pro",
    canCreateInvoice: true,
    upgradeRequired: false,
    limits: { invoicesPerMonth: null },
    usage: { invoicesCreated: 3, invoicesRemaining: null }
  };
  assert.equal(buildFreePlanLimitMessage(proSummary), "Plan limit reached.");
});
