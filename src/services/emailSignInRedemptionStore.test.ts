import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.INVOICE_RUNTIME_STORE_BACKEND = "file";
const storeFilePath = path.join(
  os.tmpdir(),
  `invoice-email-signin-redemption-unit-${randomUUID()}.json`
);
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = storeFilePath;

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

// The store reads Date.now() directly; drive the clock by overriding it
// for the duration of a test (the pattern used in ui.test.ts) and always
// restoring the real implementation.
async function withDrivenClock(run: (advanceTo: (epochMs: number) => void) => Promise<void>) {
  const realNow = Date.now;
  let nowMs = realNow();
  Date.now = () => nowMs;
  try {
    await run((epochMs) => {
      nowMs = epochMs;
    });
  } finally {
    Date.now = realNow;
  }
}

test("consumeEmailSignInNonce refuses a duplicate whose mutation executes after the token expires", async () => {
  await withDrivenClock(async (advanceTo) => {
    const nonce = `nonce-${randomUUID()}`;
    const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + 60;
    // Both verification requests passed the caller's pre-redemption
    // validation while the token was live; the first consumes the nonce.
    const first = await consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds });
    assert.equal(first, "consumed");
    // The second request waited in the mutation queue past the token's
    // expiry. Its stored record must not be pruned out from under the
    // presence check, and its now-expired token must not consume again.
    advanceTo((expiresAtEpochSeconds + 60) * 1000);
    const second = await consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds });
    assert.equal(second, "already_consumed");
  });
});

test("consumeEmailSignInNonce refuses a first redemption presented after the token expires", async () => {
  await withDrivenClock(async (advanceTo) => {
    const nonce = `nonce-${randomUUID()}`;
    const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + 60;
    advanceTo((expiresAtEpochSeconds + 1) * 1000);
    const outcome = await consumeEmailSignInNonce({ nonce, expiresAtEpochSeconds });
    assert.equal(outcome, "already_consumed");
  });
});

test("consumeEmailSignInNonce still prunes other spent entries once they can no longer matter", async () => {
  await withDrivenClock(async (advanceTo) => {
    const spentNonce = `nonce-${randomUUID()}`;
    const spentExpiry = Math.floor(Date.now() / 1000) + 60;
    assert.equal(
      await consumeEmailSignInNonce({ nonce: spentNonce, expiresAtEpochSeconds: spentExpiry }),
      "consumed"
    );
    advanceTo((spentExpiry + 60) * 1000);
    const freshNonce = `nonce-${randomUUID()}`;
    assert.equal(
      await consumeEmailSignInNonce({
        nonce: freshNonce,
        expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 15 * 60
      }),
      "consumed"
    );
    const stored = JSON.parse(await fs.readFile(storeFilePath, "utf8")) as {
      consumedNonces: Record<string, number>;
    };
    assert.equal(stored.consumedNonces[digestEmailSignInNonce(spentNonce)], undefined);
    assert.notEqual(stored.consumedNonces[digestEmailSignInNonce(freshNonce)], undefined);
  });
});

test("digestEmailSignInNonce is domain-separated and deterministic", () => {
  const digest = digestEmailSignInNonce("some-nonce-value");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, digestEmailSignInNonce("some-nonce-value"));
  assert.notEqual(digest, digestEmailSignInNonce("other-nonce-value"));
});
