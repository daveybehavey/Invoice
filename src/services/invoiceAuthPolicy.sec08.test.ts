import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { InvoiceEmailCapabilities } from "./invoiceEmailDelivery.js";
import { getInvoiceAuthPolicy, resolveInvoiceRequireAuth } from "./invoiceAuthPolicy.js";

// SEC-08 (S52-5 / S63-3 §2 / S66-6): production must not be able to disable
// owner authentication. These tests pin the normative policy matrix:
//   productionReady = !(P && F) && (!R || (S && I))
// with R forced true in production and a prohibited-override warning that
// takes priority over prerequisite warnings.
// Provider environment state is isolated: Google credentials are cleared
// unless a case explicitly installs them.

const STRONG_SECRET = "super-strong-session-secret";

const EMAIL_READY: InvoiceEmailCapabilities = {
  provider: "resend",
  configured: true,
  fromEmail: "NoteBill <hello@notebill.app>",
  fromAddress: "hello@notebill.app",
  fromDomain: "notebill.app",
  launchTestRecipientConfigured: true
};

const EMAIL_NONE: InvoiceEmailCapabilities = {
  provider: "none",
  configured: false,
  fromEmail: null,
  fromAddress: null,
  fromDomain: null,
  launchTestRecipientConfigured: false
};

let savedGoogleClientId: string | undefined;
let savedGoogleClientSecret: string | undefined;

beforeEach(() => {
  savedGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  savedGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

afterEach(() => {
  if (savedGoogleClientId === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = savedGoogleClientId;
  }
  if (savedGoogleClientSecret === undefined) {
    delete process.env.GOOGLE_CLIENT_SECRET;
  } else {
    process.env.GOOGLE_CLIENT_SECRET = savedGoogleClientSecret;
  }
});

const FALSE_ALIASES = ["0", "false", "no", "off", "FALSE", " False ", "oFF", "NO", " no "];
const TRUE_ALIASES = ["1", "true", "yes", "on", "TRUE", " On ", "Yes"];

test("SEC-08: every explicit-false alias in production forces auth and is never ready", () => {
  for (const alias of FALSE_ALIASES) {
    const policy = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: alias,
      sessionSecret: STRONG_SECRET,
      emailCapabilities: EMAIL_READY
    });
    assert.equal(policy.requireAuth, true, `alias ${JSON.stringify(alias)} must not disable auth in production`);
    assert.equal(policy.productionReady, false, `alias ${JSON.stringify(alias)} must report non-ready in production`);
    assert.match(policy.warning ?? "", /INVOICE_REQUIRE_AUTH/, `alias ${JSON.stringify(alias)} warning must name the flag`);
    assert.match(policy.warning ?? "", /prohibit/i, `alias ${JSON.stringify(alias)} warning must prohibit the override`);
  }
});

test("SEC-08: prohibited-override warning takes priority over missing prerequisites", () => {
  const policy = getInvoiceAuthPolicy({
    nodeEnv: "production",
    requireAuthEnv: "false",
    sessionSecret: undefined,
    emailCapabilities: EMAIL_NONE
  });
  assert.equal(policy.requireAuth, true);
  assert.equal(policy.productionReady, false);
  assert.match(policy.warning ?? "", /INVOICE_REQUIRE_AUTH/);
  assert.match(policy.warning ?? "", /prohibit/i);
});

test("SEC-08: normalized \" Production \" environment is production", () => {
  const policy = getInvoiceAuthPolicy({
    nodeEnv: " Production ",
    requireAuthEnv: "false",
    sessionSecret: STRONG_SECRET,
    emailCapabilities: EMAIL_READY
  });
  assert.equal(policy.nodeEnv, "production");
  assert.equal(policy.requireAuth, true);
  assert.equal(policy.productionReady, false);
  assert.match(policy.warning ?? "", /prohibit/i);
});

test("SEC-08: recognized true aliases in production are ready iff secret and provider are ready", () => {
  for (const alias of TRUE_ALIASES) {
    const ready = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: alias,
      sessionSecret: STRONG_SECRET,
      emailCapabilities: EMAIL_READY
    });
    assert.equal(ready.requireAuth, true, `alias ${JSON.stringify(alias)}`);
    assert.equal(ready.productionReady, true, `alias ${JSON.stringify(alias)} with prerequisites must be ready`);
    assert.equal(ready.warning, undefined);

    const noProvider = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: alias,
      sessionSecret: STRONG_SECRET,
      emailCapabilities: EMAIL_NONE
    });
    assert.equal(noProvider.productionReady, false, `alias ${JSON.stringify(alias)} without a provider must not be ready`);

    const noSecret = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: alias,
      sessionSecret: undefined,
      emailCapabilities: EMAIL_READY
    });
    assert.equal(noSecret.productionReady, false, `alias ${JSON.stringify(alias)} without a secret must not be ready`);
    assert.match(noSecret.warning ?? "", /INVOICE_SESSION_SECRET/);
  }
});

test("SEC-08: unset, blank, and unrecognized flags in production still require auth", () => {
  for (const flag of [undefined, "", "   ", "banana", "2"]) {
    const ready = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: flag,
      sessionSecret: STRONG_SECRET,
      emailCapabilities: EMAIL_READY
    });
    assert.equal(ready.requireAuth, true, `flag ${JSON.stringify(flag)} must require auth in production`);
    assert.equal(ready.productionReady, true, `flag ${JSON.stringify(flag)} with prerequisites must be ready`);

    const noSecret = getInvoiceAuthPolicy({
      nodeEnv: "production",
      requireAuthEnv: flag,
      sessionSecret: "change_me",
      emailCapabilities: EMAIL_READY
    });
    assert.equal(noSecret.sessionSecretConfigured, false);
    assert.equal(noSecret.productionReady, false, `flag ${JSON.stringify(flag)} with an insecure secret must not be ready`);
  }
});

test("SEC-08: email-only and Google-only availability each satisfy provider readiness", () => {
  const emailOnly = getInvoiceAuthPolicy({
    nodeEnv: "production",
    requireAuthEnv: undefined,
    sessionSecret: STRONG_SECRET,
    emailCapabilities: EMAIL_READY
  });
  assert.equal(emailOnly.productionReady, true);

  process.env.GOOGLE_CLIENT_ID = "google-client-id-for-tests";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret-for-tests";
  const googleOnly = getInvoiceAuthPolicy({
    nodeEnv: "production",
    requireAuthEnv: undefined,
    sessionSecret: STRONG_SECRET,
    emailCapabilities: EMAIL_NONE
  });
  assert.equal(googleOnly.productionReady, true);
  assert.equal(
    googleOnly.providers.some((provider) => provider.id === "google" && provider.available),
    true
  );

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const neither = getInvoiceAuthPolicy({
    nodeEnv: "production",
    requireAuthEnv: undefined,
    sessionSecret: STRONG_SECRET,
    emailCapabilities: EMAIL_NONE
  });
  assert.equal(neither.productionReady, false);
  assert.match(neither.warning ?? "", /email delivery provider/i);
});

test("SEC-08: non-production preserves the existing flag contract", () => {
  for (const env of ["development", "test", "staging", " Development "]) {
    const disabled = getInvoiceAuthPolicy({
      nodeEnv: env,
      requireAuthEnv: "false",
      sessionSecret: undefined,
      emailCapabilities: EMAIL_NONE
    });
    assert.equal(disabled.requireAuth, false, `env ${JSON.stringify(env)} explicit false must disable auth`);
    assert.equal(disabled.productionReady, true, `env ${JSON.stringify(env)} auth-disabled must be policy-ready`);
    assert.equal(disabled.warning, undefined);

    const unset = getInvoiceAuthPolicy({
      nodeEnv: env,
      requireAuthEnv: undefined,
      sessionSecret: undefined,
      emailCapabilities: EMAIL_NONE
    });
    assert.equal(unset.requireAuth, false, `env ${JSON.stringify(env)} unset must default to disabled`);
    assert.equal(unset.productionReady, true);

    const required = getInvoiceAuthPolicy({
      nodeEnv: env,
      requireAuthEnv: "true",
      sessionSecret: undefined,
      emailCapabilities: EMAIL_NONE
    });
    assert.equal(required.requireAuth, true, `env ${JSON.stringify(env)} explicit true must require auth`);
    assert.equal(required.productionReady, false, `env ${JSON.stringify(env)} auth-required without prerequisites must not be ready`);
  }
});

test("SEC-08: resolveInvoiceRequireAuth enforces production regardless of the flag", () => {
  assert.equal(resolveInvoiceRequireAuth("false", "production"), true);
  assert.equal(resolveInvoiceRequireAuth("0", " Production "), true);
  assert.equal(resolveInvoiceRequireAuth("off", "PRODUCTION"), true);
  assert.equal(resolveInvoiceRequireAuth(undefined, "production"), true);
  assert.equal(resolveInvoiceRequireAuth("banana", "production"), true);
  assert.equal(resolveInvoiceRequireAuth("false", "development"), false);
  assert.equal(resolveInvoiceRequireAuth("no", "test"), false);
  assert.equal(resolveInvoiceRequireAuth(undefined, "development"), false);
  assert.equal(resolveInvoiceRequireAuth("banana", "development"), false);
  assert.equal(resolveInvoiceRequireAuth("true", "development"), true);
  assert.equal(resolveInvoiceRequireAuth("yes", "staging"), true);
});
