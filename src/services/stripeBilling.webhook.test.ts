import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import {
  processStripeWebhookEvent,
  setStripeWebhookConstructEventForTests
} from "./stripeBilling.js";

const WEBHOOK_SECRET = "whsec_test_construct_async";
const SECRET_KEY = "sk_test_construct_async_placeholder";
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-02-25.clover";

function buildCheckoutCompletedPayload(eventId: string): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${eventId}`,
        object: "checkout.session",
        customer: `cus_${eventId}`,
        subscription: `sub_${eventId}`,
        customer_email: "webhook-async@test.dev",
        metadata: {
          ownerId: "owner-webhook-async",
          userId: "user-webhook-async",
          email: "webhook-async@test.dev"
        }
      }
    }
  });
}

function unhandledPingEvent(eventId: string): Stripe.Event {
  return {
    id: eventId,
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: Math.floor(Date.now() / 1000),
    type: "ping",
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: {} }
  } as unknown as Stripe.Event;
}

test.beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  setStripeWebhookConstructEventForTests(null);
});

test.afterEach(() => {
  setStripeWebhookConstructEventForTests(null);
});

test("constructEventAsync accepts a valid raw-body signature (Workers-safe path)", async () => {
  const rawPayload = buildCheckoutCompletedPayload("evt_valid_signature");
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawPayload,
    secret: WEBHOOK_SECRET
  });
  const stripe = new Stripe(SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
  const event = await stripe.webhooks.constructEventAsync(rawPayload, signature, WEBHOOK_SECRET);
  assert.equal(event.id, "evt_valid_signature");
  assert.equal(event.type, "checkout.session.completed");
});

test("processStripeWebhookEvent verifies with the exact raw body and awaits constructEventAsync wiring", async () => {
  const rawPayload = buildCheckoutCompletedPayload("evt_wiring_raw_body");
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawPayload,
    secret: WEBHOOK_SECRET
  });
  let seenRaw: string | null = null;
  let seenSignature: string | null = null;

  setStripeWebhookConstructEventForTests(async (input) => {
    seenRaw = input.rawPayload;
    seenSignature = input.signature;
    const stripe = new Stripe(SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    // Prove the production async verifier accepts this raw body + signature.
    await stripe.webhooks.constructEventAsync(
      input.rawPayload,
      input.signature,
      input.webhookSecret
    );
    // Return an unhandled type so entitlement persistence is not exercised here.
    return unhandledPingEvent("evt_wiring_raw_body");
  });

  const result = await processStripeWebhookEvent({
    rawBody: Buffer.from(rawPayload, "utf8"),
    signature
  });

  assert.equal(seenRaw, rawPayload);
  assert.equal(seenSignature, signature);
  assert.equal(result.eventId, "evt_wiring_raw_body");
  assert.equal(result.handled, false);
});

test("processStripeWebhookEvent fails closed on an invalid signature", async () => {
  const rawPayload = buildCheckoutCompletedPayload("evt_invalid_signature");
  await assert.rejects(
    () =>
      processStripeWebhookEvent({
        rawBody: rawPayload,
        signature: "t=1,v1=deadbeef"
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(String(error.message), /signature|Webhook/i);
      return true;
    }
  );
});

test("processStripeWebhookEvent fails closed when constructEventAsync rejects asynchronously", async () => {
  setStripeWebhookConstructEventForTests(async () => {
    await Promise.resolve();
    throw new Error("SubtleCryptoProvider async rejection (simulated)");
  });

  const rawPayload = buildCheckoutCompletedPayload("evt_async_reject");
  await assert.rejects(
    () =>
      processStripeWebhookEvent({
        rawBody: rawPayload,
        signature: "t=1,v1=unused"
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /async rejection/i);
      return true;
    }
  );
});

test("processStripeWebhookEvent is idempotent for duplicate verified deliveries", async () => {
  const rawPayload = buildCheckoutCompletedPayload("evt_idempotent_async");
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawPayload,
    secret: WEBHOOK_SECRET
  });
  let verifyCount = 0;

  setStripeWebhookConstructEventForTests(async (input) => {
    verifyCount += 1;
    const stripe = new Stripe(SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    await stripe.webhooks.constructEventAsync(
      input.rawPayload,
      input.signature,
      input.webhookSecret
    );
    return unhandledPingEvent("evt_idempotent_async");
  });

  const first = await processStripeWebhookEvent({ rawBody: rawPayload, signature });
  const second = await processStripeWebhookEvent({ rawBody: rawPayload, signature });

  assert.equal(verifyCount, 2);
  assert.equal(first.handled, false);
  assert.equal(second.handled, false);
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.eventType, "ping");
  assert.equal(second.eventType, "ping");
});
