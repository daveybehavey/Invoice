import assert from "node:assert/strict";
import { test } from "node:test";
import { isInvoiceSessionSecretConfigured } from "./authSession.js";

test("isInvoiceSessionSecretConfigured rejects empty and default secrets", () => {
  assert.equal(isInvoiceSessionSecretConfigured(undefined), false);
  assert.equal(isInvoiceSessionSecretConfigured(""), false);
  assert.equal(isInvoiceSessionSecretConfigured("   "), false);
  assert.equal(isInvoiceSessionSecretConfigured("change_me"), false);
  assert.equal(isInvoiceSessionSecretConfigured("local-invoice-session-secret"), false);
});

test("isInvoiceSessionSecretConfigured accepts non-default values", () => {
  assert.equal(isInvoiceSessionSecretConfigured("super-strong-test-secret"), true);
  assert.equal(isInvoiceSessionSecretConfigured("prod_abc123_xyz789"), true);
});
