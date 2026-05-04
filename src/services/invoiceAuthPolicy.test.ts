import assert from "node:assert/strict";
import { test } from "node:test";
import { getInvoiceAuthEmailReadiness, getInvoiceAuthPolicy, resolveInvoiceRequireAuth } from "./invoiceAuthPolicy.js";

test("resolveInvoiceRequireAuth defaults to production-only when env is unset", () => {
  assert.equal(resolveInvoiceRequireAuth(undefined, "production"), true);
  assert.equal(resolveInvoiceRequireAuth(undefined, "development"), false);
});

test("getInvoiceAuthPolicy requires both strong session secret and email provider when auth is required", () => {
  const policy = getInvoiceAuthPolicy({
    nodeEnv: "production",
    requireAuthEnv: "true",
    sessionSecret: "super-strong-session-secret",
    emailCapabilities: {
      provider: "none",
      configured: false,
      fromEmail: null,
      fromAddress: null,
      fromDomain: null,
      launchTestRecipientConfigured: false
    }
  });

  assert.equal(policy.requireAuth, true);
  assert.equal(policy.sessionSecretConfigured, true);
  assert.equal(policy.emailProviderConfigured, false);
  assert.equal(Array.isArray(policy.providers), true);
  assert.equal(policy.providers.some((provider) => provider.id === "google"), true);
  assert.equal(policy.productionReady, false);
  assert.match(policy.warning ?? "", /email delivery provider/i);
});

test("getInvoiceAuthEmailReadiness reports ready when a provider is configured", () => {
  const readiness = getInvoiceAuthEmailReadiness({
    provider: "resend",
    configured: true,
    fromEmail: "NoteBill <hello@notebill.app>",
    fromAddress: "hello@notebill.app",
    fromDomain: "notebill.app",
    launchTestRecipientConfigured: true
  });

  assert.deepEqual(readiness, { ready: true });
});
