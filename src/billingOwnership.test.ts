import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAcceptedTermsVersionToSuccessPath,
  buildCheckoutResumeIdempotencyKey,
  clearCheckoutIntentSessionsForTests,
  createStripeCheckoutSession,
  resolveAuthenticatedCheckoutOwnership,
  serializeStripeRelevantCheckoutParams,
  setCheckoutSessionCreatorForTests,
  type CheckoutSessionCreatorRequestOptions
} from "./services/stripeBilling.js";
import { LEGAL_TERMS_VERSION } from "./services/legalFoundation.js";

function termsAckFields() {
  return {
    termsVersion: LEGAL_TERMS_VERSION,
    termsAccepted: true as const
  };
}

test("appendAcceptedTermsVersionToSuccessPath is stable and preserves session placeholder", () => {
  const base = "/?billing=success";
  const first = appendAcceptedTermsVersionToSuccessPath(base, LEGAL_TERMS_VERSION);
  const second = appendAcceptedTermsVersionToSuccessPath(base, LEGAL_TERMS_VERSION);
  assert.equal(first, second);
  assert.equal(first, `/?billing=success&acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`);

  const withSession = appendAcceptedTermsVersionToSuccessPath(
    "/manual?billing=success&session_id={CHECKOUT_SESSION_ID}",
    LEGAL_TERMS_VERSION
  );
  assert.match(withSession, /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(withSession, new RegExp(`acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`));
  assert.equal(
    appendAcceptedTermsVersionToSuccessPath(
      "/manual?billing=success&session_id={CHECKOUT_SESSION_ID}",
      LEGAL_TERMS_VERSION
    ),
    withSession
  );

  assert.throws(
    () => appendAcceptedTermsVersionToSuccessPath("/?billing=success", "1999-01-01.0"),
    /Unknown Terms version/i
  );
});

test("production Upgrade success paths stay stable when acceptedTermsVersion is appended", () => {
  const productionSuccessPaths = [
    "/?billing=success",
    "/invoices?billing=success",
    "/ai-intake?billing=success",
    "/import?billing=success",
    "/manual?billing=success"
  ];
  for (const successPath of productionSuccessPaths) {
    const first = appendAcceptedTermsVersionToSuccessPath(successPath, LEGAL_TERMS_VERSION);
    const second = appendAcceptedTermsVersionToSuccessPath(successPath, LEGAL_TERMS_VERSION);
    assert.equal(first, second);
    assert.equal(
      first,
      `${successPath}&acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`
    );
    const withPlaceholder = appendAcceptedTermsVersionToSuccessPath(
      `${successPath}&session_id={CHECKOUT_SESSION_ID}`,
      LEGAL_TERMS_VERSION
    );
    assert.equal(
      withPlaceholder,
      `${successPath}&session_id={CHECKOUT_SESSION_ID}&acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`
    );
  }
});

/** Deterministic Stripe-provider stub: same idempotency key → same simulated session. */
function createIdempotentProviderStub(seedSessionId: string) {
  const sessionsByKey = new Map<string, { url: string; sessionId: string }>();
  const paramsByKey = new Map<string, string>();
  let creatorCalls = 0;
  const keys: string[] = [];
  const creator = async (
    input: Parameters<typeof serializeStripeRelevantCheckoutParams>[0],
    requestOptions?: CheckoutSessionCreatorRequestOptions
  ) => {
    creatorCalls += 1;
    const key = String(requestOptions?.idempotencyKey || "");
    assert.ok(key, "provider request must include an idempotency key for resume Checkout");
    keys.push(key);
    const serialized = serializeStripeRelevantCheckoutParams(input);
    const existingParams = paramsByKey.get(key);
    if (existingParams !== undefined && existingParams !== serialized) {
      throw new Error(
        "Idempotent Stripe create received different provider params for the same idempotency key."
      );
    }
    paramsByKey.set(key, serialized);
    const existing = sessionsByKey.get(key);
    if (existing) {
      return { url: existing.url, sessionId: existing.sessionId };
    }
    const created = {
      url: `https://checkout.test/${seedSessionId}`,
      sessionId: seedSessionId,
      providerCreatedAt: "2026-08-12T18:00:00.000Z"
    };
    sessionsByKey.set(key, created);
    return created;
  };
  return {
    creator,
    get creatorCalls() {
      return creatorCalls;
    },
    get keys() {
      return keys;
    },
    get paramsByKey() {
      return paramsByKey;
    }
  };
}

test("resolveAuthenticatedCheckoutOwnership requires signed-in userId and email", () => {
  assert.throws(() => resolveAuthenticatedCheckoutOwnership(null), /sign in to upgrade/i);
  assert.throws(() => resolveAuthenticatedCheckoutOwnership({ userId: "usr_a", email: "" }), /sign in/i);
  assert.throws(() => resolveAuthenticatedCheckoutOwnership({ userId: "", email: "a@test.dev" }), /sign in/i);
});

test("resolveAuthenticatedCheckoutOwnership binds opaque userId as ownerId", () => {
  const ownership = resolveAuthenticatedCheckoutOwnership({
    userId: "usr_abcdef0123456789abcdef01",
    email: "Owner@Test.Dev"
  });
  assert.equal(ownership.ownerId, "usr_abcdef0123456789abcdef01");
  assert.equal(ownership.userId, "usr_abcdef0123456789abcdef01");
  assert.equal(ownership.email, "owner@test.dev");
});

test("createStripeCheckoutSession refuses mismatched ownerId", async () => {
  clearCheckoutIntentSessionsForTests();
  let creatorCalls = 0;
  setCheckoutSessionCreatorForTests(async () => {
    creatorCalls += 1;
    return { url: "https://checkout.test/reject", sessionId: "cs_reject" };
  });

  await assert.rejects(
    () =>
      createStripeCheckoutSession({
        ownerId: "usr_attacker",
        userId: "usr_owner_1",
        email: "owner@test.dev",
        baseUrl: "https://app.test",
        ...termsAckFields()
      }),
    /ownership must match/i
  );
  assert.equal(creatorCalls, 0);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("concurrent same owner/intent coalesce to one creator invocation within an isolate", async () => {
  clearCheckoutIntentSessionsForTests();
  let creatorCalls = 0;
  let releaseCreator: () => void = () => {
    throw new Error("releaseCreator was not initialized");
  };
  const gate = new Promise<void>((resolve) => {
    releaseCreator = resolve;
  });

  setCheckoutSessionCreatorForTests(async (_input, requestOptions) => {
    creatorCalls += 1;
    assert.ok(requestOptions?.idempotencyKey);
    await gate;
    return { url: "https://checkout.test/coalesce", sessionId: "cs_coalesce" };
  });

  const input = {
    ownerId: "usr_owner_1",
    userId: "usr_owner_1",
    email: "owner@test.dev",
    baseUrl: "https://app.test",
    resumeIntentId: "intent_concurrent_1",
    ...termsAckFields()
  };

  const firstPromise = createStripeCheckoutSession(input);
  const secondPromise = createStripeCheckoutSession(input);

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(creatorCalls, 1);
  releaseCreator();

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.sessionId, "cs_coalesce");
  assert.equal(second.sessionId, "cs_coalesce");
  assert.equal(first.url, second.url);
  assert.equal(creatorCalls, 1);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("sequential repetition invokes provider twice with the same key and resolves the same session", async () => {
  clearCheckoutIntentSessionsForTests();
  const stub = createIdempotentProviderStub("cs_sequential");
  setCheckoutSessionCreatorForTests(stub.creator);

  const first = await createStripeCheckoutSession({
    ownerId: "usr_owner_1",
    userId: "usr_owner_1",
    email: "owner@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_sequential_1"
  });
  const second = await createStripeCheckoutSession({
    ownerId: "usr_owner_1",
    userId: "usr_owner_1",
    email: "owner@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_sequential_1"
  });

  assert.equal(first.sessionId, "cs_sequential");
  assert.equal(second.sessionId, "cs_sequential");
  assert.equal(first.url, second.url);
  assert.equal(stub.creatorCalls, 2);
  assert.equal(stub.keys.length, 2);
  assert.equal(stub.keys[0], stub.keys[1]);
  assert.equal(stub.keys[0], buildCheckoutResumeIdempotencyKey("usr_owner_1", "intent_sequential_1"));

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("same owner/intent always supplies the same Stripe idempotency key", async () => {
  clearCheckoutIntentSessionsForTests();
  const stub = createIdempotentProviderStub("cs_key_stable");
  setCheckoutSessionCreatorForTests(stub.creator);

  await createStripeCheckoutSession({
    ownerId: "usr_owner_key",
    userId: "usr_owner_key",
    email: "owner-key@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_key_stable"
  });
  clearCheckoutIntentSessionsForTests();
  await createStripeCheckoutSession({
    ownerId: "usr_owner_key",
    userId: "usr_owner_key",
    email: "owner-key@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_key_stable"
  });

  assert.equal(stub.keys.length, 2);
  assert.equal(stub.keys[0], stub.keys[1]);
  assert.equal(stub.keys[0], buildCheckoutResumeIdempotencyKey("usr_owner_key", "intent_key_stable"));
  assert.ok(stub.keys[0]!.startsWith("nb_co_"));
  assert.ok(stub.keys[0]!.length <= 255);
  assert.doesNotMatch(stub.keys[0]!, /usr_owner_key|intent_key_stable|@/);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("different client click times do not change idempotency key or Stripe create params", async () => {
  clearCheckoutIntentSessionsForTests();
  const stub = createIdempotentProviderStub("cs_click_time_stable");
  const capturedParams: string[] = [];
  setCheckoutSessionCreatorForTests(async (input, requestOptions) => {
    capturedParams.push(serializeStripeRelevantCheckoutParams(input));
    assert.equal("clientReportedAcknowledgedAt" in input, false);
    assert.equal("termsAcknowledgedAt" in input, false);
    assert.equal(input.termsAccepted, true);
    assert.equal(input.termsAcceptanceMethod, "pre_checkout_disclosure");
    return stub.creator(input, requestOptions);
  });

  const first = await createStripeCheckoutSession({
    ownerId: "usr_owner_click",
    userId: "usr_owner_click",
    email: "click@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_click_stable",
    clientReportedAcknowledgedAt: "2026-08-12T10:00:00.000Z"
  });
  clearCheckoutIntentSessionsForTests();
  const second = await createStripeCheckoutSession({
    ownerId: "usr_owner_click",
    userId: "usr_owner_click",
    email: "click@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_click_stable",
    clientReportedAcknowledgedAt: "2026-08-12T10:00:45.000Z"
  });

  assert.equal(first.sessionId, second.sessionId);
  assert.equal(stub.keys[0], stub.keys[1]);
  assert.equal(capturedParams[0], capturedParams[1]);
  assert.match(capturedParams[0]!, /"termsAccepted":"true"/);
  assert.match(capturedParams[0]!, /"termsAcceptanceMethod":"pre_checkout_disclosure"/);
  assert.match(
    capturedParams[0]!,
    new RegExp(`acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`)
  );
  assert.doesNotMatch(capturedParams[0]!, /2026-08-12T10:00/);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("checkout success_url includes acceptedTermsVersion and is byte-stable", async () => {
  clearCheckoutIntentSessionsForTests();
  const captured: string[] = [];
  setCheckoutSessionCreatorForTests(async (input) => {
    captured.push(serializeStripeRelevantCheckoutParams(input));
    assert.match(
      input.successPath,
      new RegExp(`acceptedTermsVersion=${encodeURIComponent(LEGAL_TERMS_VERSION)}`)
    );
    return { url: "https://checkout.test/accepted", sessionId: "cs_accepted_terms" };
  });

  await createStripeCheckoutSession({
    ownerId: "usr_owner_accepted",
    userId: "usr_owner_accepted",
    email: "accepted@test.dev",
    baseUrl: "https://app.test",
    successPath: "/?billing=success",
    ...termsAckFields()
  });
  await createStripeCheckoutSession({
    ownerId: "usr_owner_accepted",
    userId: "usr_owner_accepted",
    email: "accepted@test.dev",
    baseUrl: "https://app.test",
    successPath: "/?billing=success",
    ...termsAckFields()
  });

  assert.equal(captured.length, 2);
  assert.equal(captured[0], captured[1]);
  assert.match(captured[0]!, /"success_url":"https:\/\/app\.test\/\?billing=success&acceptedTermsVersion=/);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("different owners with the same intent receive different idempotency keys", async () => {
  clearCheckoutIntentSessionsForTests();
  const keys: string[] = [];
  setCheckoutSessionCreatorForTests(async (input, requestOptions) => {
    keys.push(String(requestOptions?.idempotencyKey || ""));
    return {
      url: `https://checkout.test/${input.ownerId}`,
      sessionId: `cs_${input.ownerId}`
    };
  });

  await createStripeCheckoutSession({
    ownerId: "usr_owner_a",
    userId: "usr_owner_a",
    email: "a@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_shared"
  });
  await createStripeCheckoutSession({
    ownerId: "usr_owner_b",
    userId: "usr_owner_b",
    email: "b@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_shared"
  });

  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[0], buildCheckoutResumeIdempotencyKey("usr_owner_a", "intent_shared"));
  assert.equal(keys[1], buildCheckoutResumeIdempotencyKey("usr_owner_b", "intent_shared"));

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("different intents for the same owner receive different idempotency keys", async () => {
  clearCheckoutIntentSessionsForTests();
  const keys: string[] = [];
  setCheckoutSessionCreatorForTests(async (_input, requestOptions) => {
    keys.push(String(requestOptions?.idempotencyKey || ""));
    return {
      url: `https://checkout.test/${keys.length}`,
      sessionId: `cs_intent_${keys.length}`
    };
  });

  await createStripeCheckoutSession({
    ownerId: "usr_owner_intents",
    userId: "usr_owner_intents",
    email: "intents@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_one"
  });
  await createStripeCheckoutSession({
    ownerId: "usr_owner_intents",
    userId: "usr_owner_intents",
    email: "intents@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_two"
  });

  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("after clearing process-local in-flight state, same owner/intent still supplies the same provider key and session", async () => {
  clearCheckoutIntentSessionsForTests();
  const stub = createIdempotentProviderStub("cs_fresh_isolate");
  setCheckoutSessionCreatorForTests(stub.creator);

  const first = await createStripeCheckoutSession({
    ownerId: "usr_owner_fresh",
    userId: "usr_owner_fresh",
    email: "fresh@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_fresh_isolate"
  });
  clearCheckoutIntentSessionsForTests();
  const second = await createStripeCheckoutSession({
    ownerId: "usr_owner_fresh",
    userId: "usr_owner_fresh",
    email: "fresh@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_fresh_isolate"
  });

  assert.equal(first.sessionId, second.sessionId);
  assert.equal(first.sessionId, "cs_fresh_isolate");
  assert.equal(stub.creatorCalls, 2);
  assert.equal(stub.keys[0], stub.keys[1]);
  assert.equal(
    stub.keys[0],
    buildCheckoutResumeIdempotencyKey("usr_owner_fresh", "intent_fresh_isolate")
  );

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("spoofed client identity fields cannot affect ownership or the idempotency key", async () => {
  clearCheckoutIntentSessionsForTests();
  let capturedOwner = "";
  let capturedKey = "";
  setCheckoutSessionCreatorForTests(async (input, requestOptions) => {
    capturedOwner = input.ownerId;
    capturedKey = String(requestOptions?.idempotencyKey || "");
    assert.equal(input.userId, "usr_real_owner");
    assert.equal(input.clientReferenceId, "usr_real_owner");
    assert.equal(input.email, "real@test.dev");
    return { url: "https://checkout.test/spoof", sessionId: "cs_spoof" };
  });

  await assert.rejects(
    () =>
      createStripeCheckoutSession({
        ownerId: "usr_spoofed_body_owner",
        userId: "usr_real_owner",
        email: "real@test.dev",
        baseUrl: "https://app.test",
        ...termsAckFields(),
        resumeIntentId: "intent_spoof"
      }),
    /ownership must match/i
  );

  await createStripeCheckoutSession({
    ownerId: "usr_real_owner",
    userId: "usr_real_owner",
    email: "real@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_spoof"
  });

  assert.equal(capturedOwner, "usr_real_owner");
  assert.equal(capturedKey, buildCheckoutResumeIdempotencyKey("usr_real_owner", "intent_spoof"));
  assert.doesNotMatch(capturedKey, /spoofed|attacker/);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("creator failure clears only in-flight entry and permits retry with the same provider key", async () => {
  clearCheckoutIntentSessionsForTests();
  const keys: string[] = [];
  let shouldFail = true;
  setCheckoutSessionCreatorForTests(async (_input, requestOptions) => {
    keys.push(String(requestOptions?.idempotencyKey || ""));
    if (shouldFail) {
      throw new Error("simulated stripe create failure");
    }
    return { url: "https://checkout.test/retry", sessionId: "cs_retry_ok" };
  });

  await assert.rejects(
    () =>
      createStripeCheckoutSession({
        ownerId: "usr_owner_retry",
        userId: "usr_owner_retry",
        email: "retry@test.dev",
        baseUrl: "https://app.test",
        ...termsAckFields(),
        resumeIntentId: "intent_client_retry"
      }),
    /simulated stripe create failure/i
  );

  shouldFail = false;
  const retry = await createStripeCheckoutSession({
    ownerId: "usr_owner_retry",
    userId: "usr_owner_retry",
    email: "retry@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields(),
    resumeIntentId: "intent_client_retry"
  });

  assert.equal(retry.sessionId, "cs_retry_ok");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[0], buildCheckoutResumeIdempotencyKey("usr_owner_retry", "intent_client_retry"));

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});

test("idempotency key applies only when a valid resume intent exists", async () => {
  clearCheckoutIntentSessionsForTests();
  const optionsSeen: Array<CheckoutSessionCreatorRequestOptions | undefined> = [];
  setCheckoutSessionCreatorForTests(async (_input, requestOptions) => {
    optionsSeen.push(requestOptions);
    return { url: "https://checkout.test/no-intent", sessionId: "cs_no_intent" };
  });

  await createStripeCheckoutSession({
    ownerId: "usr_owner_plain",
    userId: "usr_owner_plain",
    email: "plain@test.dev",
    baseUrl: "https://app.test",
    ...termsAckFields()
  });

  assert.equal(optionsSeen.length, 1);
  assert.equal(optionsSeen[0], undefined);

  setCheckoutSessionCreatorForTests(null);
  clearCheckoutIntentSessionsForTests();
});
