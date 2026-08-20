import assert from "node:assert/strict";
import test from "node:test";
import { detectStripeKeyMode } from "./stripeBilling.js";

test("detectStripeKeyMode classifies standard secret test keys", () => {
  assert.equal(detectStripeKeyMode("sk_test_placeholder", "secret"), "test");
});

test("detectStripeKeyMode classifies official restricted test keys", () => {
  assert.equal(detectStripeKeyMode("rk_test_placeholder", "secret"), "test");
});

test("detectStripeKeyMode classifies Stripe CLI sandbox restricted test keys", () => {
  assert.equal(detectStripeKeyMode("rkcs_test_placeholder", "secret"), "test");
});

test("detectStripeKeyMode classifies standard secret live keys", () => {
  assert.equal(detectStripeKeyMode("sk_live_placeholder", "secret"), "live");
});

test("detectStripeKeyMode classifies restricted live keys as live, never test", () => {
  assert.equal(detectStripeKeyMode("rk_live_placeholder", "secret"), "live");
  assert.equal(detectStripeKeyMode("rkcs_live_placeholder", "secret"), "live");
});

test("detectStripeKeyMode fails closed for empty and unknown secret formats", () => {
  assert.equal(detectStripeKeyMode(null, "secret"), "none");
  assert.equal(detectStripeKeyMode("", "secret"), "none");
  assert.equal(detectStripeKeyMode("rkcs_sandbox_placeholder", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("rk_unknown_placeholder", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("not_a_stripe_key", "secret"), "unknown");
});

test("detectStripeKeyMode never treats unknown formats as test", () => {
  const unknowns = [
    "rkcs_sandbox_x",
    "rk_prod_x",
    "secret_test_x",
    "pk_test_on_secret_kind"
  ];
  for (const value of unknowns) {
    assert.notEqual(detectStripeKeyMode(value, "secret"), "test");
  }
});

test("detectStripeKeyMode classifies publishable keys independently", () => {
  assert.equal(detectStripeKeyMode("pk_test_placeholder", "publishable"), "test");
  assert.equal(detectStripeKeyMode("pk_live_placeholder", "publishable"), "live");
  assert.equal(detectStripeKeyMode("sk_test_placeholder", "publishable"), "unknown");
  assert.equal(detectStripeKeyMode(null, "publishable"), "none");
});

test("detectStripeKeyMode rejects embedded mid-string prefixes (startsWith only)", () => {
  assert.equal(detectStripeKeyMode("prefix_rkcs_test_embedded", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("xrkcs_test_leading", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("payload sk_test_middle", "secret"), "unknown");
  assert.notEqual(detectStripeKeyMode("prefix_rkcs_test_embedded", "secret"), "test");
});

test("detectStripeKeyMode rejects mixed-case prefixes", () => {
  assert.equal(detectStripeKeyMode("RKCS_TEST_PLACEHOLDER", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("Rkcs_test_placeholder", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("SK_TEST_PLACEHOLDER", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("Pk_Test_Placeholder", "publishable"), "unknown");
  assert.notEqual(detectStripeKeyMode("RKCS_TEST_PLACEHOLDER", "secret"), "test");
});

test("detectStripeKeyMode rejects truncated prefixes", () => {
  assert.equal(detectStripeKeyMode("rkcs_test", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("rkcs_", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("rk_", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("sk_test", "secret"), "unknown");
  assert.equal(detectStripeKeyMode("pk_test", "publishable"), "unknown");
  assert.notEqual(detectStripeKeyMode("rkcs_test", "secret"), "test");
});
