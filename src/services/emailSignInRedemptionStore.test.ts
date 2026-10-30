import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.INVOICE_RUNTIME_STORE_BACKEND = "file";
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-email-signin-redemption-unit-${randomUUID()}.json`
);

const { consumeEmailSignInNonce, digestEmailSignInNonce } = await import("./emailSignInRedemptionStore.js");

function futureExpiry(): number {
  return Math.floor(Date.now() / 1000) + 15 * 60;
}

test("consumeEmailSignInNonce consumes a nonce exactly once", async () => {
  const nonce = `nonce-${randomUUID()}`;
  const first = await consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds: futureExpiry() });
  assert.equal(first, "consumed");
  const second = await consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds: futureExpiry() });
  assert.equal(second, "already_consumed");
});

test("consumeEmailSignInNonce admits exactly one of many concurrent redemptions", async () => {
  const nonce = `nonce-${randomUUID()}`;
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, () =>
      consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds: futureExpiry() })
    )
  );
  assert.equal(outcomes.filter((outcome) => outcome === "consumed").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome === "already_consumed").length, 7);
});

test("consumeEmailSignInNonce keeps independently issued nonces independent", async () => {
  const first = await consumeEmailSignInNonce({
    nonce: `nonce-${randomUUID()}`,
    expiresAtEpochSeconds: futureExpiry()
  });
  const second = await consumeEmailSignInNonce({
    nonce: `nonce-${randomUUID()}`,
    expiresAtEpochSeconds: futureExpiry()
  });
  assert.equal(first, "consumed");
  assert.equal(second, "consumed");
});

test("digestEmailSignInNonce is domain-separated and deterministic", () => {
  const digest = digestEmailSignInNonce("some-nonce-value");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, digestEmailSignInNonce("some-nonce-value"));
  assert.notEqual(digest, digestEmailSignInNonce("other-nonce-value"));
});
