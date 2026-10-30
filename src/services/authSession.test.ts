import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  createEmailSignInToken,
  getSessionSecret,
  inspectEmailSignInToken,
  isInvoiceSessionSecretConfigured,
  verifyEmailSignInToken
} from "./authSession.js";

function signRawPayload(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

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

test("inspectEmailSignInToken returns the verified nonce and expiry for a minted token", () => {
  const minted = createEmailSignInToken("Person@Test.dev");
  const inspected = inspectEmailSignInToken(minted.token);
  assert.ok(inspected);
  assert.equal(inspected.email, "person@test.dev");
  assert.match(inspected.nonce, /^[A-Za-z0-9_-]{16,80}$/);
  assert.ok(inspected.expiresAtEpochSeconds * 1000 > Date.now());
  assert.equal(inspected.expiresAt, new Date(inspected.expiresAtEpochSeconds * 1000).toISOString());
});

test("inspectEmailSignInToken rejects pre-enforcement links without the signed format version", () => {
  const legacyToken = signRawPayload({
    kind: "email_link",
    email: "legacy@test.dev",
    nonce: "a".repeat(24),
    exp: Math.floor(Date.now() / 1000) + 600
  });
  assert.equal(inspectEmailSignInToken(legacyToken), null);
  assert.equal(verifyEmailSignInToken(legacyToken), null);
});

test("inspectEmailSignInToken rejects expired, malformed, and wrong-purpose tokens", () => {
  const expired = signRawPayload({
    kind: "email_link",
    v: 2,
    email: "expired@test.dev",
    nonce: "b".repeat(24),
    exp: Math.floor(Date.now() / 1000) - 60
  });
  assert.equal(inspectEmailSignInToken(expired), null);

  const malformedNonce = signRawPayload({
    kind: "email_link",
    v: 2,
    email: "bad-nonce@test.dev",
    nonce: "not a nonce!!",
    exp: Math.floor(Date.now() / 1000) + 600
  });
  assert.equal(inspectEmailSignInToken(malformedNonce), null);

  const wrongPurpose = signRawPayload({
    kind: "session",
    userId: "usr_000000000000000000000000",
    email: "session@test.dev",
    exp: Math.floor(Date.now() / 1000) + 600
  });
  assert.equal(inspectEmailSignInToken(wrongPurpose), null);
});

test("inspectEmailSignInToken rejects a tampered signature", () => {
  const minted = createEmailSignInToken("tampered@test.dev");
  const [encodedPayload] = minted.token.split(".");
  assert.equal(inspectEmailSignInToken(`${encodedPayload}.invalidsignature`), null);
});
