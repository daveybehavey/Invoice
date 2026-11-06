import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  createEmailSignInToken,
  getSessionSecret,
  inspectEmailSignInToken,
  isInvoiceSessionSecretConfigured,
  verifyEmailSignInToken
} from "./authSession.js";

const PUBLIC_FALLBACK_CONSTANT = "local-invoice-session-secret";

function signRawPayload(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function readSessionSecretInChild(env: NodeJS.ProcessEnv): string {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      `import { getSessionSecret } from "./src/services/authSession.ts"; process.stdout.write(getSessionSecret());`
    ],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 0, result.stderr || "child process failed to report session secret");
  return result.stdout;
}

test("isInvoiceSessionSecretConfigured rejects empty and default secrets", () => {
  assert.equal(isInvoiceSessionSecretConfigured(undefined), false);
  assert.equal(isInvoiceSessionSecretConfigured(""), false);
  assert.equal(isInvoiceSessionSecretConfigured("   "), false);
  assert.equal(isInvoiceSessionSecretConfigured("change_me"), false);
  assert.equal(isInvoiceSessionSecretConfigured(PUBLIC_FALLBACK_CONSTANT), false);
});

test("isInvoiceSessionSecretConfigured accepts non-default values", () => {
  assert.equal(isInvoiceSessionSecretConfigured("super-strong-test-secret"), true);
  assert.equal(isInvoiceSessionSecretConfigured("prod_abc123_xyz789"), true);
});

test("getSessionSecret never uses the public constant when the env var is unset", () => {
  const previous = process.env.INVOICE_SESSION_SECRET;
  delete process.env.INVOICE_SESSION_SECRET;
  try {
    const secret = getSessionSecret();
    assert.notEqual(secret, PUBLIC_FALLBACK_CONSTANT);
    assert.notEqual(secret.trim(), "");
    assert.equal(getSessionSecret(), secret, "fallback secret must be stable within a process");
  } finally {
    if (previous === undefined) {
      delete process.env.INVOICE_SESSION_SECRET;
    } else {
      process.env.INVOICE_SESSION_SECRET = previous;
    }
  }
});

test("getSessionSecret returns the env value byte-identically when set", () => {
  const previous = process.env.INVOICE_SESSION_SECRET;
  const configured = "byte-identical-session-secret-value";
  process.env.INVOICE_SESSION_SECRET = configured;
  try {
    assert.equal(getSessionSecret(), configured);
  } finally {
    if (previous === undefined) {
      delete process.env.INVOICE_SESSION_SECRET;
    } else {
      process.env.INVOICE_SESSION_SECRET = previous;
    }
  }
});

test("two processes without INVOICE_SESSION_SECRET get different secrets and never the public constant", () => {
  const baseEnv = { ...process.env };
  delete baseEnv.INVOICE_SESSION_SECRET;
  const first = readSessionSecretInChild(baseEnv);
  const second = readSessionSecretInChild(baseEnv);
  assert.notEqual(first, PUBLIC_FALLBACK_CONSTANT);
  assert.notEqual(second, PUBLIC_FALLBACK_CONSTANT);
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.match(second, /^[A-Za-z0-9_-]+$/);
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
