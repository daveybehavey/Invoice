import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";
import type Stripe from "stripe";

// S93-3 item 2 (S92-3 / S93-3 §2): subscription entitlement writes are
// reconciled, never unconditional. Checkout completion is linkage +
// trigger only; the retrieved subscription decides status; verified
// event receipts dedup processing; a cancellation tombstone is
// permanent for its subscription ID.

process.env.NODE_ENV = "test";
const entitlementsFilePath = path.join(
  os.tmpdir(),
  `invoice-s933-subrecon-ent-${randomUUID()}.json`
);
process.env.STRIPE_ENTITLEMENTS_STORE_FILE = entitlementsFilePath;
process.env.STRIPE_SECRET_KEY = "sk_test_s933_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_s933_placeholder";

const {
  processStripeWebhookEvent,
  reconcileStoredSubscription,
  setStripeSubscriptionRetrieverForTests,
  setStripeWebhookConstructEventForTests
} = await import("./stripeBilling.js");
const {
  beginSubscriptionEventProcessing,
  getBillingEventReceipt,
  getSubscriptionReconciliationRecord,
  hasActiveStripeEntitlement
} = await import("./billingEntitlementsStore.js");

type FakeSubscription = {
  id: string;
  object: "subscription";
  status: string;
  customer: string | { id: string };
  metadata: Record<string, string>;
};

function fakeSubscription(
  id: string,
  init: { customer?: string | { id: string }; status?: string; metadata?: Record<string, string> } = {}
): FakeSubscription {
  return {
    id,
    object: "subscription",
    status: init.status ?? "active",
    customer: init.customer ?? "cus_owner1",
    metadata: init.metadata ?? {}
  };
}

let retrieverCalls: string[] = [];
let retrieverImpl: (id: string) => Promise<FakeSubscription> = async (id) => fakeSubscription(id);
let constructImpl: (payload: string) => Record<string, unknown> = (payload) => JSON.parse(payload);

setStripeSubscriptionRetrieverForTests(async (id) => {
  retrieverCalls.push(id);
  return retrieverImpl(id) as unknown as Stripe.Subscription;
});
setStripeWebhookConstructEventForTests(async ({ rawPayload }) => {
  return constructImpl(rawPayload) as unknown as Stripe.Event;
});

function checkoutEvent(init: {
  id: string;
  created: number;
  customer?: unknown;
  subscription?: unknown;
  email?: string;
  ownerId?: string;
  userId?: string;
}): Record<string, unknown> {
  return {
    id: init.id,
    object: "event",
    created: init.created,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${init.id}`,
        object: "checkout.session",
        customer: "customer" in init ? init.customer : "cus_owner1",
        subscription: "subscription" in init ? init.subscription : "sub_main",
        customer_email: init.email ?? "owner1@test.dev",
        metadata: {
          ownerId: init.ownerId ?? "owner-1",
          userId: init.userId ?? "owner-1",
          email: init.email ?? "owner1@test.dev"
        }
      }
    }
  };
}

function subscriptionEvent(init: {
  id: string;
  created: number;
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted";
  subscriptionId?: string;
  customer?: unknown;
  status?: string;
  ownerId?: string;
}): Record<string, unknown> {
  return {
    id: init.id,
    object: "event",
    created: init.created,
    type: init.type,
    data: {
      object: {
        id: init.subscriptionId ?? "sub_main",
        object: "subscription",
        customer: init.customer ?? "cus_owner1",
        status: init.status ?? "active",
        metadata: {
          ownerId: init.ownerId ?? "owner-1",
          userId: init.ownerId ?? "owner-1",
          email: "owner1@test.dev"
        }
      }
    }
  };
}

async function deliver(event: Record<string, unknown>) {
  return processStripeWebhookEvent({ rawBody: JSON.stringify(event), signature: "sig_test" });
}

const EMPTY_SNAPSHOT = JSON.stringify(
  { updatedAt: "", customers: {}, subscriptions: {}, eventReceipts: {} },
  null,
  2
);

beforeEach(async () => {
  await fs.mkdir(path.dirname(entitlementsFilePath), { recursive: true });
  await fs.writeFile(entitlementsFilePath, `${EMPTY_SNAPSHOT}\n`, "utf8");
  retrieverCalls = [];
  retrieverImpl = async (id) => fakeSubscription(id);
  constructImpl = (payload) => JSON.parse(payload);
});

test("checkout E1 -> deletion E2 -> replayed E1 stays canceled (the S92-3 defect)", async () => {
  const e1 = checkoutEvent({ id: "evt_e1", created: 100 });
  await deliver(e1);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);

  await deliver(subscriptionEvent({ id: "evt_e2", created: 200, type: "customer.subscription.deleted", status: "canceled" }));
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  const retrieverCallsBefore = retrieverCalls.length;
  const replay = await deliver(e1);
  assert.equal(replay.handled, true);
  assert.equal(retrieverCalls.length, retrieverCallsBefore, "a completed receipt short-circuits replay");
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "canceled");
  assert.ok(record?.cancellationTombstone, "tombstone persists");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("deletion arriving before any checkout tombstones the subscription permanently", async () => {
  await deliver(subscriptionEvent({ id: "evt_del_first", created: 100, type: "customer.subscription.deleted", status: "canceled" }));
  await deliver(checkoutEvent({ id: "evt_checkout_late", created: 300 }));
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "canceled");
  assert.equal((await getBillingEventReceipt("evt_checkout_late"))?.disposition, "ignored_after_cancellation");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("equal-time update and deletion: cancellation wins in both orders", async () => {
  await deliver(checkoutEvent({ id: "evt_eq_grant", created: 100 }));
  await deliver(subscriptionEvent({ id: "evt_eq_update", created: 200, type: "customer.subscription.updated" }));
  await deliver(subscriptionEvent({ id: "evt_eq_delete", created: 200, type: "customer.subscription.deleted", status: "canceled" }));
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.status, "canceled");

  await fs.writeFile(entitlementsFilePath, `${EMPTY_SNAPSHOT}\n`, "utf8");
  await deliver(subscriptionEvent({ id: "evt_eq_delete2", created: 200, type: "customer.subscription.deleted", status: "canceled" }));
  await deliver(subscriptionEvent({ id: "evt_eq_update2", created: 200, type: "customer.subscription.updated" }));
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.status, "canceled");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("an older update after a newer reconciled event is ignored as stale (no retrieval)", async () => {
  await deliver(checkoutEvent({ id: "evt_new", created: 300 }));
  const callsAfterGrant = retrieverCalls.length;
  await deliver(subscriptionEvent({ id: "evt_old", created: 100, type: "customer.subscription.updated" }));
  assert.equal((await getBillingEventReceipt("evt_old"))?.disposition, "ignored_stale");
  assert.equal(retrieverCalls.length, callsAfterGrant, "stale events never reach retrieval");
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.status, "active");
});

test("duplicate concurrent deliveries reconcile exactly once", async () => {
  const event = checkoutEvent({ id: "evt_dup", created: 100 });
  const [first, second] = await Promise.all([deliver(event), deliver(event)]);
  assert.equal(first.handled, true);
  assert.equal(second.handled, true);
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "active");
  assert.equal(record?.reconciliationState, "verified");
  assert.equal((await getBillingEventReceipt("evt_dup"))?.disposition, "reconciled");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
});

test("overlapping generations: a stale retrieval cannot overwrite a newer commit", async () => {
  let releaseStale!: () => void;
  const staleGate = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  let call = 0;
  retrieverImpl = async (id) => {
    call += 1;
    if (call === 1) {
      await staleGate;
      return fakeSubscription(id, { status: "incomplete" });
    }
    return fakeSubscription(id, { status: "active" });
  };

  const createdProcessing = deliver(subscriptionEvent({ id: "evt_gen_a", created: 100, type: "customer.subscription.created" }));
  // Let generation A reserve + enter retrieval before B starts.
  await new Promise((resolve) => setTimeout(resolve, 25));
  await deliver(subscriptionEvent({ id: "evt_gen_b", created: 200, type: "customer.subscription.updated" }));
  releaseStale();
  await createdProcessing;

  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "active", "generation B's commit stands");
  assert.equal(record?.lastEventCreated, 200);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
});

test("retrieval paused while a deletion commits: the stale active result cannot activate", async () => {
  let releaseRetrieval!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseRetrieval = resolve;
  });
  let entered!: () => void;
  const enteredRetrieval = new Promise<void>((resolve) => {
    entered = resolve;
  });
  retrieverImpl = async (id) => {
    entered();
    await gate;
    return fakeSubscription(id, { status: "active" });
  };

  const checkoutProcessing = deliver(checkoutEvent({ id: "evt_race_checkout", created: 100 }));
  await enteredRetrieval;
  await deliver(subscriptionEvent({ id: "evt_race_delete", created: 200, type: "customer.subscription.deleted", status: "canceled" }));
  releaseRetrieval();
  await checkoutProcessing;

  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "canceled");
  assert.ok(record?.cancellationTombstone);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("retrieval failure is non-granting, writes no receipt, and redelivery retries", async () => {
  retrieverImpl = async () => {
    throw new Error("stripe timeout (simulated)");
  };
  await assert.rejects(() => deliver(checkoutEvent({ id: "evt_retry", created: 100 })), /timeout/);
  const failedRecord = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(failedRecord?.reconciliationState, "failed");
  assert.equal(await getBillingEventReceipt("evt_retry"), null, "failed events are not marked completed");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  retrieverImpl = async (id) => fakeSubscription(id);
  await deliver(checkoutEvent({ id: "evt_retry", created: 100 }));
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.reconciliationState, "verified");
  assert.equal((await getBillingEventReceipt("evt_retry"))?.disposition, "reconciled");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
});

test("retrieved identity conflicts fail closed without a grant or a receipt", async () => {
  retrieverImpl = async (id) => fakeSubscription(id, { customer: "cus_someone_else" });
  await assert.rejects(() => deliver(checkoutEvent({ id: "evt_conflict", created: 100 })), /refused/);
  assert.equal(await getBillingEventReceipt("evt_conflict"), null);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  retrieverImpl = async (id) => fakeSubscription("sub_different", {});
  await assert.rejects(() => deliver(checkoutEvent({ id: "evt_mismatch", created: 100 })), /refused/);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("an existing owner binding cannot be overwritten by a later checkout for the same subscription", async () => {
  await deliver(checkoutEvent({ id: "evt_bind_a", created: 100 }));
  await assert.rejects(
    () => deliver(checkoutEvent({ id: "evt_bind_b", created: 200, ownerId: "owner-2", userId: "owner-2", email: "owner2@test.dev" })),
    /refused/
  );
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.ownerId, "owner-1");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-2" }), false);
});

test("checkout without a subscription creates no entitlement; expanded refs resolve by ID only", async () => {
  await deliver(checkoutEvent({ id: "evt_no_sub", created: 100, subscription: null }));
  assert.equal(await getSubscriptionReconciliationRecord("sub_main"), null);
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  await deliver(
    checkoutEvent({
      id: "evt_expanded",
      created: 200,
      customer: { id: "cus_owner1", object: "customer" },
      subscription: { id: "sub_main", object: "subscription", status: "incomplete_expanded_untrusted" }
    })
  );
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.status, "active", "status comes from retrieval, never the expanded object");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
});

test("a distinct later subscription for the same owner grants after the first is canceled", async () => {
  await deliver(checkoutEvent({ id: "evt_first_buy", created: 100 }));
  await deliver(subscriptionEvent({ id: "evt_first_cancel", created: 200, type: "customer.subscription.deleted", status: "canceled" }));
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  await deliver(checkoutEvent({ id: "evt_second_buy", created: 300, subscription: "sub_second" }));
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.status, "canceled");
  assert.equal((await getSubscriptionReconciliationRecord("sub_second"))?.status, "active");
});

test("reservation abandoned mid-processing (crash) does not strand the event", async () => {
  await beginSubscriptionEventProcessing({
    event: { eventId: "evt_crash", eventCreated: 100, eventType: "checkout.session.completed" },
    subscriptionId: "sub_main",
    isDeletion: false,
    linkage: { customerId: "cus_owner1", email: "owner1@test.dev", ownerId: "owner-1", userId: "owner-1" }
  });
  assert.equal((await getSubscriptionReconciliationRecord("sub_main"))?.reconciliationState, "pending");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);

  await deliver(checkoutEvent({ id: "evt_crash", created: 100 }));
  const record = await getSubscriptionReconciliationRecord("sub_main");
  assert.equal(record?.reconciliationState, "verified");
  assert.equal((await getBillingEventReceipt("evt_crash"))?.disposition, "reconciled");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);
});

test("legacy records are non-granting until administratively reconciled; tombstones are never cleared", async () => {
  const legacySnapshot = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    customers: {},
    subscriptions: {
      sub_legacy: {
        subscriptionId: "sub_legacy",
        customerId: "cus_owner1",
        email: "owner1@test.dev",
        ownerId: "owner-1",
        userId: "owner-1",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    }
  };
  await fs.writeFile(entitlementsFilePath, `${JSON.stringify(legacySnapshot, null, 2)}\n`, "utf8");
  assert.equal(
    await hasActiveStripeEntitlement({ ownerId: "owner-1" }),
    false,
    "a legacy active status without a watermark must not grant"
  );

  retrieverImpl = async (id) => fakeSubscription(id, { customer: "cus_owner1" });
  const outcome = await reconcileStoredSubscription("sub_legacy");
  assert.equal(outcome.outcome, "verified");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);

  await deliver(subscriptionEvent({ id: "evt_legacy_cancel", created: 500, type: "customer.subscription.deleted", status: "canceled", subscriptionId: "sub_legacy" }));
  const tombstoned = await reconcileStoredSubscription("sub_legacy");
  assert.equal(tombstoned.outcome, "tombstoned");
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});

test("signature failure and invoice-payment settlement are untouched by subscription receipts", async () => {
  constructImpl = () => {
    throw new Error("No signatures found matching the expected signature for payload.");
  };
  await assert.rejects(() => deliver(checkoutEvent({ id: "evt_bad_sig", created: 100 })), /signature/i);
  assert.equal(await getSubscriptionReconciliationRecord("sub_main"), null);
  constructImpl = (payload) => JSON.parse(payload);

  const paymentResult = await processStripeWebhookEvent({
    rawBody: JSON.stringify({
      id: "evt_payment_1",
      object: "event",
      created: 100,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_1",
          object: "payment_intent",
          amount_received: 5000,
          currency: "usd",
          metadata: { paymentKind: "saved_invoice_payment", invoiceId: "inv_1", ownerId: "owner-1" }
        }
      }
    }),
    signature: "sig_test"
  });
  assert.equal(paymentResult.invoicePayment?.invoiceId, "inv_1");
  assert.equal(
    await getBillingEventReceipt("evt_payment_1"),
    null,
    "subscription receipts never consume invoice-payment settlement events"
  );
});

test("subscription created alone grants only the retrieved status (past_due grants, incomplete does not)", async () => {
  retrieverImpl = async (id) => fakeSubscription(id, { status: "past_due" });
  await deliver(subscriptionEvent({ id: "evt_created_pd", created: 100, type: "customer.subscription.created", status: "active" }));
  assert.equal(
    (await getSubscriptionReconciliationRecord("sub_main"))?.status,
    "past_due",
    "the event-carried status is not used; the retrieved status is"
  );
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), true);

  await fs.writeFile(entitlementsFilePath, `${EMPTY_SNAPSHOT}\n`, "utf8");
  retrieverImpl = async (id) => fakeSubscription(id, { status: "incomplete" });
  await deliver(subscriptionEvent({ id: "evt_created_inc", created: 100, type: "customer.subscription.created", status: "active" }));
  assert.equal(await hasActiveStripeEntitlement({ ownerId: "owner-1" }), false);
});
