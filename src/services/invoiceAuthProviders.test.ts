import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceEmailCapabilities } from "./invoiceEmailDelivery.js";
import { getInvoiceAuthProviderCapabilities } from "./invoiceAuthProviders.js";

const RECORD_ONLY_CAPABILITIES: InvoiceEmailCapabilities = {
  provider: "none",
  configured: false,
  fromEmail: null,
  fromAddress: null,
  fromDomain: null,
  launchTestRecipientConfigured: false
};

const PROVIDER_CAPABILITIES: InvoiceEmailCapabilities = {
  provider: "resend",
  configured: true,
  fromEmail: "NoteBill <hello@notebill.app>",
  fromAddress: "hello@notebill.app",
  fromDomain: "notebill.app",
  launchTestRecipientConfigured: true
};

test("email_link is unavailable for record_only accounts (no email provider)", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    const providers = getInvoiceAuthProviderCapabilities({
      nodeEnv,
      emailCapabilities: RECORD_ONLY_CAPABILITIES,
      googleClientId: "",
      googleClientSecret: ""
    });
    const email = providers.find((provider) => provider.id === "email_link");
    assert.ok(email);
    assert.equal(email.implemented, true);
    assert.equal(email.configured, false);
    assert.equal(email.available, false, `nodeEnv=${nodeEnv} must not advertise preview-link availability`);
    assert.match(email.warning ?? "", /email delivery provider/i);
    assert.doesNotMatch(email.warning ?? "", /preview links/i);
  }
});

test("email_link is available when a delivery provider is configured", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    const providers = getInvoiceAuthProviderCapabilities({
      nodeEnv,
      emailCapabilities: PROVIDER_CAPABILITIES,
      googleClientId: "",
      googleClientSecret: ""
    });
    const email = providers.find((provider) => provider.id === "email_link");
    assert.ok(email);
    assert.equal(email.implemented, true);
    assert.equal(email.configured, true);
    assert.equal(email.available, true);
    assert.equal(email.warning, undefined);
  }
});
