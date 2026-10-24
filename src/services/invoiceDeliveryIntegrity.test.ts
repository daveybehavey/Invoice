import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

/**
 * Slice 0 (tax lane) delivery-integrity coverage, mapped to the named
 * cases in nb-tax-slice0-design-2026-10-22.md's test plan:
 *
 * - Guarded, purpose-specific status transitions in the invoice stores
 *   (invariants 1–6), including both settlement/completion orderings
 *   against the file store's real mutation lock.
 * - Append-only delivery events + durable claims (invariants 7, 8):
 *   replay counts once, conflicting keys are rejected, record_only
 *   creates no send evidence, UNKNOWN blocks until owner release.
 * - Provider-only reminder timing and the honest-migration gate
 *   (invariants 9–11): legacy aggregates never become timing evidence;
 *   a §E owner-confirmation anchor restores scheduling eligibility
 *   without inventing a send.
 * - Audit items 1 (whole-record status overwrite — closed by the
 *   transactional status writer), 2 (delete → restore resurrecting a
 *   settled balance), and 5 (emails showing the original total instead
 *   of the real balance due).
 *
 * Postgres parity (invariant 12) is structural, as with the #82
 * settlement suite: the repo has no live-Postgres test fixture. Both
 * backends apply the SAME pure transition policy
 * (invoiceDeliveryPolicy.ts) after acquiring their serialization
 * boundary (file mutation lock / SELECT … FOR UPDATE), and the policy
 * matrix itself is asserted below. Adding a live-PG fixture remains an
 * open ticket, unchanged by this slice.
 */

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
process.env.INVOICE_STORE_FILE = path.join(os.tmpdir(), `invoice-slice0-${randomUUID()}.json`);
const deliveryStoreFile = path.join(os.tmpdir(), `invoice-slice0-delivery-${randomUUID()}.json`);
process.env.INVOICE_DELIVERY_STORE_FILE = deliveryStoreFile;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
delete process.env.INVOICE_EMAIL_PROVIDER;
delete process.env.RESEND_API_KEY;
delete process.env.SMTP2GO_API_KEY;

const { createSavedInvoiceRepository } = await import("./savedInvoiceRepository.js");
const { SavedInvoiceDataSchema } = await import("../models/invoice.js");
const deliveryStore = await import("./invoiceDeliveryStore.js");
const { decideInvoiceStatusTransition } = await import("./invoiceDeliveryPolicy.js");
const scheduler = await import("./invoiceReminderScheduler.js");
const { sendInvoiceEmail } = await import("./invoiceEmailDelivery.js");

const repository = createSavedInvoiceRepository({ backend: "file" });
const BASE_URL = "https://app.notebill.test";

function invoiceData(total: number, extras: Record<string, unknown> = {}) {
  return SavedInvoiceDataSchema.parse({
    structuredInvoice: {
      customerName: "Slice Zero Client",
      workSessions: [],
      materials: []
    },
    finishedInvoice: {
      invoiceNumber: "INV-SLICE0-1",
      issueDate: "2026-03-12",
      customerName: "Slice Zero Client",
      currency: "USD",
      lineItems: [
        {
          id: "line-slice0-1",
          type: "labor",
          description: "Slice zero job",
          quantity: 1,
          unitPrice: total,
          amount: total
        }
      ],
      subtotal: total,
      total,
      balanceDue: total,
      ...extras
    }
  });
}

async function createInvoice(ownerId: string, total: number) {
  return repository.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(total)
  });
}

async function createInvoiceWithActiveLink(ownerId: string, total: number) {
  const linkRecordId = randomUUID();
  const invoice = await createInvoice(ownerId, total);
  await repository.mutateSavedInvoice({
    invoiceId: invoice.invoiceId,
    ownerId,
    mutate: (current) => ({
      ...current,
      invoiceData: {
        ...current.invoiceData,
        finishedInvoice: {
          ...current.invoiceData.finishedInvoice,
          paymentLinkUrl: "https://pay.stripe.test/plink_slice0",
          paymentLinks: [
            {
              id: linkRecordId,
              provider: "stripe" as const,
              providerPaymentLinkId: "plink_slice0",
              amountMinor: total * 100,
              currency: "USD",
              invoiceRevision: current.invoiceData.finishedInvoice.monetaryRevision,
              status: "active" as const,
              createdAt: "2026-03-12T00:00:00.000Z"
            }
          ]
        }
      }
    })
  });
  return { invoiceId: invoice.invoiceId, linkRecordId };
}

async function settleInFull(ownerId: string, invoiceId: string, linkRecordId: string, total: number) {
  return repository.settleStripeInvoicePayment({
    invoiceId,
    ownerId,
    eventId: `evt_slice0_${randomUUID()}`,
    paymentIntentId: `pi_slice0_${randomUUID()}`,
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: total * 100,
    currency: "usd",
    receivedAt: "2026-03-12T12:00:00.000Z"
  });
}

// ---------------------------------------------------------------------------
// Transition policy matrix (invariant 12: one shared contract)
// ---------------------------------------------------------------------------

test("transition policy matrix: delivery is draft->sent only and never touches money", () => {
  for (const current of ["draft", "sent", "paid", "deleted"] as const) {
    const decision = decideInvoiceStatusTransition({
      currentStatus: current,
      requestedStatus: "sent",
      purpose: "delivery"
    });
    assert.equal(decision.zeroBalanceDue, false);
    assert.equal(decision.restoreTotalOnLeavePaid, false);
    if (current === "draft") {
      assert.equal(decision.transition, true);
      assert.equal(decision.nextStatus, "sent");
    } else {
      assert.equal(decision.transition, false);
      assert.equal(decision.nextStatus, current);
    }
  }
  // Lifecycle compatibility: mark-paid zeroes; leaving paid for a
  // non-deleted status keeps the legacy restore; entering deleted
  // never rewrites money (audit item 2).
  assert.equal(
    decideInvoiceStatusTransition({ currentStatus: "sent", requestedStatus: "paid", purpose: "lifecycle" })
      .zeroBalanceDue,
    true
  );
  assert.equal(
    decideInvoiceStatusTransition({ currentStatus: "paid", requestedStatus: "sent", purpose: "lifecycle" })
      .restoreTotalOnLeavePaid,
    true
  );
  const intoDeleted = decideInvoiceStatusTransition({
    currentStatus: "paid",
    requestedStatus: "deleted",
    purpose: "lifecycle"
  });
  assert.equal(intoDeleted.zeroBalanceDue, false);
  assert.equal(intoDeleted.restoreTotalOnLeavePaid, false);
});

// ---------------------------------------------------------------------------
// Guarded completion in the file store (invariants 3, 4)
// ---------------------------------------------------------------------------

test("provider_success_transitions_draft_to_sent and preserves money", async () => {
  const ownerId = "slice0-complete-draft";
  const invoice = await createInvoice(ownerId, 200);
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const result = await repository.completeInvoiceDelivery({
    invoiceId: invoice.invoiceId,
    ownerId,
    authorizedRevision: revision
  });
  assert.equal(result.transitioned, true);
  assert.equal(result.invoice.status, "sent");
  assert.equal(result.invoice.invoiceData.finishedInvoice.balanceDue, 200);
  assert.equal(result.invoice.invoiceData.finishedInvoice.total, 200);
  assert.equal(result.invoice.invoiceData.finishedInvoice.monetaryRevision, revision);
});

test("provider_success_on_sent_is_noop and stale revision cannot complete", async () => {
  const ownerId = "slice0-complete-sent";
  const invoice = await createInvoice(ownerId, 120);
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  await repository.completeInvoiceDelivery({ invoiceId: invoice.invoiceId, ownerId, authorizedRevision: revision });

  const again = await repository.completeInvoiceDelivery({
    invoiceId: invoice.invoiceId,
    ownerId,
    authorizedRevision: revision
  });
  assert.equal(again.transitioned, false);
  assert.equal(again.invoice.status, "sent");

  // A monetary edit bumps the revision; completion authorized at the
  // old revision must refuse (invariant 2).
  const draft = await createInvoice(ownerId, 90);
  const draftRevision = draft.invoiceData.finishedInvoice.monetaryRevision;
  await repository.saveInvoiceDocument({
    ownerId,
    invoiceId: draft.invoiceId,
    sourceType: "text_input",
    invoiceData: invoiceData(300)
  });
  const edited = await repository.getSavedInvoiceById(draft.invoiceId, ownerId);
  assert.ok(edited.invoiceData.finishedInvoice.monetaryRevision > draftRevision);
  const stale = await repository.completeInvoiceDelivery({
    invoiceId: draft.invoiceId,
    ownerId,
    authorizedRevision: draftRevision
  });
  assert.equal(stale.transitioned, false);
  assert.equal(stale.invoice.status, "draft");
});

test("completion_preserves_paid_and_deleted; paid_completion_never_restores_full_balance", async () => {
  const ownerId = "slice0-complete-paid";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);
  const settled = await settleInFull(ownerId, invoiceId, linkRecordId, 240);
  assert.equal(settled.outcome, "settled");
  const paid = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(paid.status, "paid");
  assert.equal(paid.invoiceData.finishedInvoice.balanceDue, 0);

  const result = await repository.completeInvoiceDelivery({
    invoiceId,
    ownerId,
    authorizedRevision: paid.invoiceData.finishedInvoice.monetaryRevision
  });
  assert.equal(result.transitioned, false);
  assert.equal(result.invoice.status, "paid");
  assert.equal(result.invoice.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(result.invoice.invoiceData.finishedInvoice.paymentRecords?.length, 1);
});

// ---------------------------------------------------------------------------
// Settlement vs completion orderings (invariant 5)
// ---------------------------------------------------------------------------

test("settlement_commits_before_delivery_completion: completion reads settled fresh state", async () => {
  const ownerId = "slice0-order-settle-first";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);
  const draft = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const authorizedRevision = draft.invoiceData.finishedInvoice.monetaryRevision;

  // Authorization happened against the draft; settlement lands first.
  const settled = await settleInFull(ownerId, invoiceId, linkRecordId, 240);
  assert.equal(settled.outcome, "settled");

  const completion = await repository.completeInvoiceDelivery({
    invoiceId,
    ownerId,
    authorizedRevision
  });
  assert.equal(completion.transitioned, false);
  assert.equal(completion.invoice.status, "paid");
  assert.equal(completion.invoice.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(completion.invoice.invoiceData.finishedInvoice.paymentRecords?.length, 1);
  // Settlement evidence (the link record the payment bound to) survives
  // the completion attempt untouched.
  assert.equal(completion.invoice.invoiceData.finishedInvoice.paymentLinks?.length, 1);
  assert.equal(
    completion.invoice.invoiceData.finishedInvoice.paymentLinks?.[0]?.id,
    linkRecordId
  );
});

test("delivery_completion_commits_before_settlement: settlement still lands cleanly", async () => {
  const ownerId = "slice0-order-complete-first";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 180);
  const draft = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const completion = await repository.completeInvoiceDelivery({
    invoiceId,
    ownerId,
    authorizedRevision: draft.invoiceData.finishedInvoice.monetaryRevision
  });
  assert.equal(completion.transitioned, true);
  assert.equal(completion.invoice.status, "sent");

  const settled = await settleInFull(ownerId, invoiceId, linkRecordId, 180);
  assert.equal(settled.outcome, "settled");
  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(final.status, "paid");
  assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(final.invoiceData.finishedInvoice.paymentRecords?.length, 1);
});

// ---------------------------------------------------------------------------
// Settlement vs completion under genuine contention (Q3, executable half)
// ---------------------------------------------------------------------------
//
// The two ordering tests above run sequentially: each operation is
// awaited before the other starts. The tests below invoke both
// operations BEFORE awaiting either, so they genuinely contend for
// the file store's mutation lock in the same tick. withMutationLock
// chains critical sections in invocation order and each section spans
// real async file I/O, so the second operation is queued at the lock
// boundary while the first is still inside its section, and then
// observes the first's COMMITTED state. The store exposes no hook
// that could pause a section mid-flight from outside, so the
// deterministic evidence is the resolution order plus the state each
// operation observed — asserted exactly. (The barrier test after
// these two covers the design's named scenario at the flow level:
// dispatch suspended at a test-controlled barrier while settlement
// commits.)

test("settlement and completion invoked in the same tick serialize at the mutation lock (settlement first)", async () => {
  const ownerId = "slice0-race-settle-first";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);
  const draft = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const authorizedRevision = draft.invoiceData.finishedInvoice.monetaryRevision;

  const resolutionOrder: string[] = [];
  const [settled, completion] = await Promise.all([
    settleInFull(ownerId, invoiceId, linkRecordId, 240).then((result) => {
      resolutionOrder.push("settlement");
      return result;
    }),
    repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision }).then((result) => {
      resolutionOrder.push("completion");
      return result;
    })
  ]);
  assert.deepEqual(resolutionOrder, ["settlement", "completion"]);
  assert.equal(settled.outcome, "settled");
  // The completion ran second, inside its own later critical section,
  // and read the settled state: the guarded draft->sent transition
  // refused and the settlement evidence survived untouched.
  assert.equal(completion.transitioned, false);
  assert.equal(completion.invoice.status, "paid");
  assert.equal(completion.invoice.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(completion.invoice.invoiceData.finishedInvoice.paymentRecords?.length, 1);
  assert.equal(completion.invoice.invoiceData.finishedInvoice.paymentLinks?.[0]?.id, linkRecordId);
});

test("settlement and completion invoked in the same tick serialize at the mutation lock (completion first)", async () => {
  const ownerId = "slice0-race-complete-first";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 180);
  const draft = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const authorizedRevision = draft.invoiceData.finishedInvoice.monetaryRevision;

  const resolutionOrder: string[] = [];
  const [completion, settled] = await Promise.all([
    repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision }).then((result) => {
      resolutionOrder.push("completion");
      return result;
    }),
    settleInFull(ownerId, invoiceId, linkRecordId, 180).then((result) => {
      resolutionOrder.push("settlement");
      return result;
    })
  ]);
  assert.deepEqual(resolutionOrder, ["completion", "settlement"]);
  // The completion won the lock and transitioned the draft; the
  // settlement then ran against the committed "sent" invoice and
  // settled it cleanly — neither overwrote the other's commit.
  assert.equal(completion.transitioned, true);
  assert.equal(completion.invoice.status, "sent");
  assert.equal(settled.outcome, "settled");
  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(final.status, "paid");
  assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(final.invoiceData.finishedInvoice.paymentRecords?.length, 1);
  assert.equal(final.invoiceData.finishedInvoice.paymentLinks?.[0]?.id, linkRecordId);
});

test("settlement commits while a delivery dispatch is suspended at a barrier; the late completion is a guarded no-op", async () => {
  const ownerId = "slice0-race-barrier";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 300);
  const draft = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const authorizedRevision = draft.invoiceData.finishedInvoice.monetaryRevision;

  // The design's named barrier scenario (§C/§D flow level): authorize
  // the draft, reserve the claim, begin dispatch — then pause the
  // provider completion at a test-controlled barrier, exactly where a
  // real send waits on the provider round-trip.
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "barrier@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });

  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const completionFlow = (async () => {
    await barrier;
    await deliveryStore.recordInvoiceDeliveryClaimOutcome({
      ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      outcome: "accepted",
      mode: "provider",
      provider: "resend",
      providerMessageId: "email_barrier_1"
    });
    return repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision });
  })();

  // While the send is suspended, the settlement contends for the same
  // store and commits first.
  const settled = await settleInFull(ownerId, invoiceId, linkRecordId, 300);
  assert.equal(settled.outcome, "settled");

  releaseBarrier();
  const completion = await completionFlow;
  // The acceptance is durable on the claim, but the guarded
  // completion reads the settled invoice and refuses to move it: the
  // paid state, zero balance, payment record, and link all survive.
  assert.equal(completion.transitioned, false);
  assert.equal(completion.invoice.status, "paid");
  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(final.status, "paid");
  assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(final.invoiceData.finishedInvoice.paymentRecords?.length, 1);
  assert.equal(final.invoiceData.finishedInvoice.paymentLinks?.[0]?.id, linkRecordId);
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
});

// ---------------------------------------------------------------------------
// Resend action identity vs reservation (conformance Q7, race half)
// ---------------------------------------------------------------------------
//
// The send endpoint resolves a resend action in two steps: a read
// (getInvoiceDeliveryClaimByResendAction) and, when the read finds
// nothing, a reservation that establishes the action's claim. Two
// overlapping requests carrying the SAME action id can both complete
// the read before either reserves. This test reproduces that exact
// interleave deterministically: request A's read returns and A is
// suspended at a test-controlled barrier while the identical request
// B runs the full establishment (reserve resend_1 under the action
// id, dispatch, acceptance). A then resumes and performs the
// endpoint's next step — reserving the next occurrence under the
// same action id. The reservation mutation itself must resolve A to
// B's claim: one deliberate action owns exactly one claim, so A gets
// B's claim back as "existing" and no resend_2 claim is created.

test("a resend action identity resolves atomically inside reservation, across a barrier-suspended lookup", async () => {
  const ownerId = "slice0-q7-action-race";
  const invoice = await createInvoice(ownerId, 220);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const recipientEmail = "action-race@example.com";
  const resendActionId = "ui-action-race-1";

  // The invoice's initial send is already resolved (accepted), so a
  // resend action establishes the resend_1 occurrence.
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected initial reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_action_race_initial"
  });

  // Request A performs the endpoint's action lookup and observes no
  // claim — then suspends at the barrier, exactly where a real
  // request waits on store I/O before reserving.
  const lookupA = await deliveryStore.getInvoiceDeliveryClaimByResendAction({
    ownerId,
    invoiceId,
    resendActionId
  });
  assert.equal(lookupA, null);
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const requestA = (async () => {
    await barrier;
    // A's next step in the endpoint flow: the initial claim already
    // resolved, so A walks to the next resend occurrence — carrying
    // the same action id.
    return deliveryStore.reserveInvoiceDeliveryClaim({
      ownerId,
      invoiceId,
      recipientEmail,
      basePurpose: "resend",
      purpose: "resend_2",
      authorizedRevision: revision,
      resendActionId
    });
  })();

  // Request B — the identical action — runs to completion while A
  // is suspended: its lookup also finds nothing, it establishes
  // resend_1 under the action id, and the provider accepts.
  const lookupB = await deliveryStore.getInvoiceDeliveryClaimByResendAction({
    ownerId,
    invoiceId,
    resendActionId
  });
  assert.equal(lookupB, null);
  const established = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "resend",
    purpose: "resend_1",
    authorizedRevision: revision,
    resendActionId
  });
  if (established.outcome !== "reserved") throw new Error("expected resend reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: established.claim.claimId,
    generation: established.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: established.claim.claimId,
    generation: established.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_action_race_resend"
  });

  releaseBarrier();
  const resumed = await requestA;
  // A resolves to the claim its action already established — the
  // reservation did not create a second claim for the action, so no
  // second dispatch can follow from A's request.
  assert.equal(resumed.outcome, "existing");
  assert.equal(resumed.claim.claimId, established.claim.claimId);

  const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
    claims?: Array<Record<string, unknown>>;
  };
  const actionClaims = (parsed.claims ?? []).filter(
    (entry) => entry?.invoiceId === invoiceId && entry?.resendActionId === resendActionId
  );
  assert.equal(actionClaims.length, 1);
  assert.equal(actionClaims[0]?.purpose, "resend_1");
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 2);
});

// ---------------------------------------------------------------------------
// Bare-retry recovery resolves atomically inside reservation (Q7
// re-gate): the counted-recovery lookup and the recovery mint are a
// single mutation decision, so a bare retry whose pre-mutation read
// went stale cannot mint a duplicate recovery.
// ---------------------------------------------------------------------------

test("a bare retry resolves its recovery atomically inside reservation, across a barrier-suspended lookup", async () => {
  const ownerId = "slice0-q7-bare-race";
  const invoice = await createInvoice(ownerId, 240);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const recipientEmail = "bare-race@example.com";

  // The initial send was definitively rejected: resolved, uncounted.
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected initial reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend"
  });

  // Request A performs the standalone recovery lookup a caller could
  // read before reserving — it observes no counted recovery — and
  // then suspends at the barrier, exactly where a real request waits
  // on store I/O while its identical twin completes.
  const staleLookup = await deliveryStore.getLatestCountedInvoiceDeliveryResendClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    authorizedRevision: revision
  });
  assert.equal(staleLookup, null);
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const requestA = (async () => {
    await barrier;
    // A's next step is the endpoint's reservation for a bare retry.
    // Deciding from A's stale read would mint resend_2 here; the
    // reservation itself must resolve A to B's recovery claim.
    return deliveryStore.reserveInvoiceDeliveryClaim({
      ownerId,
      invoiceId,
      recipientEmail,
      basePurpose: "initial_send",
      purpose: "initial_send",
      authorizedRevision: revision,
      bareRetry: true
    });
  })();

  // Request B — the identical bare retry — runs to completion while
  // A is suspended: its reservation mints the recovery occurrence
  // and the provider accepts it.
  const recoveryB = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision,
    bareRetry: true
  });
  if (recoveryB.outcome !== "reserved") throw new Error("expected recovery reservation");
  assert.equal(recoveryB.claim.purpose, "resend_1");
  assert.equal(recoveryB.claim.basePurpose, "resend");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: recoveryB.claim.claimId,
    generation: recoveryB.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: recoveryB.claim.claimId,
    generation: recoveryB.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_bare_race_recovery"
  });

  releaseBarrier();
  const resumed = await requestA;
  // A replays the recovery B established — no second recovery claim
  // was minted from A's stale read, so no duplicate dispatch can
  // follow from A's request.
  assert.equal(resumed.outcome, "existing");
  assert.equal(resumed.claim.claimId, recoveryB.claim.claimId);

  const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
    claims?: Array<Record<string, unknown>>;
  };
  const resendClaims = (parsed.claims ?? []).filter(
    (entry) => entry?.invoiceId === invoiceId && entry?.basePurpose === "resend"
  );
  assert.equal(resendClaims.length, 1);
  assert.equal(resendClaims[0]?.purpose, "resend_1");
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
});

test("a bare retry mints no recovery while another send is in flight, then replays the counted recovery", async () => {
  const ownerId = "slice0-q7-bare-blocked";
  const invoice = await createInvoice(ownerId, 260);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const recipientEmail = "bare-blocked@example.com";

  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected initial reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend"
  });

  // A recovery attempt is already in flight under resend_1.
  const inFlight = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision,
    bareRetry: true
  });
  if (inFlight.outcome !== "reserved") throw new Error("expected recovery reservation");
  assert.equal(inFlight.claim.purpose, "resend_1");

  // A second bare retry must not mint resend_2 over the in-flight
  // recovery: the reservation resolves it to the cross-key block.
  const blocked = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision,
    bareRetry: true
  });
  assert.equal(blocked.outcome, "blocked");
  if (blocked.outcome === "blocked") {
    assert.equal(blocked.reason, "send_in_progress");
    assert.equal(blocked.claim.claimId, inFlight.claim.claimId);
  }

  // Once the in-flight recovery counts, the next bare retry replays
  // it instead of minting.
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: inFlight.claim.claimId,
    generation: inFlight.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: inFlight.claim.claimId,
    generation: inFlight.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_bare_blocked_recovery"
  });
  const replay = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision,
    bareRetry: true
  });
  assert.equal(replay.outcome, "existing");
  assert.equal(replay.claim.claimId, inFlight.claim.claimId);
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
});

// ---------------------------------------------------------------------------
// §D blocking for unresolved ACCEPTED sends (conformance Q2)
// ---------------------------------------------------------------------------

test("an ACCEPTED send with no final resolution blocks automatic reminders until DELIVERED or owner release", async () => {
  const ownerId = "slice0-q2-accepted-blocks";

  async function acceptedSend(invoiceTotal: number, recipient: string, messageId: string) {
    const invoice = await createInvoice(ownerId, invoiceTotal);
    const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
    const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
      ownerId,
      invoiceId: invoice.invoiceId,
      recipientEmail: recipient,
      basePurpose: "initial_send",
      purpose: "initial_send",
      authorizedRevision: revision
    });
    if (reservation.outcome !== "reserved") throw new Error("expected reservation");
    const claim = reservation.claim;
    await deliveryStore.beginInvoiceDeliveryDispatch({
      ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      trackingToken: randomUUID()
    });
    await deliveryStore.recordInvoiceDeliveryClaimOutcome({
      ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      outcome: "accepted",
      mode: "provider",
      provider: "resend",
      providerMessageId: messageId
    });
    const completion = await repository.completeInvoiceDelivery({
      invoiceId: invoice.invoiceId,
      ownerId,
      authorizedRevision: revision
    });
    assert.equal(completion.transitioned, true);
    return { invoiceId: invoice.invoiceId, claim };
  }

  // --- DELIVERED control: the fold is the resolution. ---
  const deliveredCase = await acceptedSend(140, "q2-delivered@example.com", "email_q2_delivered");
  const blockedTiming = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [deliveredCase.invoiceId]
  });
  // The acceptance establishes timing AND blocks (§D): both are true
  // at once — the block is additional, not instead of timing.
  assert.equal(blockedTiming[deliveredCase.invoiceId]?.hasVerifiedHistory, true);
  assert.equal(blockedTiming[deliveredCase.invoiceId]?.providerSendCount, 1);
  assert.equal(blockedTiming[deliveredCase.invoiceId]?.hasUnresolvedSend, true);
  const blockedSummary = await deliveryStore.getInvoiceDeliverySummary({
    ownerId,
    invoiceId: deliveredCase.invoiceId
  });
  assert.equal(blockedSummary?.sendCount, 1);
  assert.ok(blockedSummary?.sentAt);
  assert.deepEqual(blockedSummary?.blockingClaim, {
    claimId: deliveredCase.claim.claimId,
    reason: "awaiting_resolution"
  });
  await assert.rejects(
    scheduler.sendInvoiceReminderById({
      ownerId,
      repository,
      baseUrl: BASE_URL,
      invoiceId: deliveredCase.invoiceId
    }),
    /unresolved delivery attempt/
  );

  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: deliveredCase.claim.claimId,
    generation: deliveredCase.claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_delivered"
  });
  const resolvedTiming = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [deliveredCase.invoiceId]
  });
  assert.equal(resolvedTiming[deliveredCase.invoiceId]?.hasUnresolvedSend, false);
  const resolvedSummary = await deliveryStore.getInvoiceDeliverySummary({
    ownerId,
    invoiceId: deliveredCase.invoiceId
  });
  assert.equal(resolvedSummary?.blockingClaim, null);
  // Resolution changed neither the count nor the acceptance instant.
  assert.equal(resolvedSummary?.sendCount, 1);
  assert.equal(resolvedSummary?.sentAt, blockedSummary?.sentAt);

  // --- Owner-release control: the §C release substitutes for the
  // missing resolution without fabricating one. ---
  const releasedCase = await acceptedSend(160, "q2-released@example.com", "email_q2_released");
  const preReleaseSummary = await deliveryStore.getInvoiceDeliverySummary({
    ownerId,
    invoiceId: releasedCase.invoiceId
  });
  assert.deepEqual(preReleaseSummary?.blockingClaim, {
    claimId: releasedCase.claim.claimId,
    reason: "awaiting_resolution"
  });
  const released = await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: releasedCase.claim.claimId,
    actor: ownerId,
    reason: "Provider console confirms delivery; ending the resolution wait."
  });
  assert.equal(released.status, "released");
  // The release fabricates no outcome: the claim still records exactly
  // the acceptance it had, now with the release recorded durably.
  assert.equal(released.outcomeKind, "accepted");
  assert.equal(released.releaseActor, ownerId);
  assert.equal(released.releaseReason, "Provider console confirms delivery; ending the resolution wait.");
  assert.ok(released.releasedAt);
  const postReleaseTiming = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [releasedCase.invoiceId]
  });
  assert.equal(postReleaseTiming[releasedCase.invoiceId]?.hasUnresolvedSend, false);
  const postReleaseSummary = await deliveryStore.getInvoiceDeliverySummary({
    ownerId,
    invoiceId: releasedCase.invoiceId
  });
  assert.equal(postReleaseSummary?.blockingClaim, null);
  assert.equal(postReleaseSummary?.sendCount, 1);
  assert.equal(postReleaseSummary?.sentAt, preReleaseSummary?.sentAt);

  // And a reminder can actually be dispatched again (record_only in
  // this file — no provider configured).
  delete process.env.INVOICE_EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  const reminder = await scheduler.sendInvoiceReminderById({
    ownerId,
    repository,
    baseUrl: BASE_URL,
    invoiceId: releasedCase.invoiceId
  });
  assert.equal(reminder.mode, "record_only");
  assert.equal(reminder.recipientEmail, "q2-released@example.com");
});

// ---------------------------------------------------------------------------
// §D ACCEPTED -> FAILED fold (conformance recheck 3, Q2)
// ---------------------------------------------------------------------------

test("a final FAILED outcome resolves an ACCEPTED claim: block released, acceptance evidence preserved", async () => {
  const ownerId = "slice0-q2-accepted-failed";
  const invoice = await createInvoice(ownerId, 175);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-failed@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  const acceptedAt = "2026-03-12T12:00:00.000Z";
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_failed",
    occurredAt: acceptedAt
  });
  await repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision: revision });

  // Starting state (the Q2 defect): unresolved ACCEPTED blocks.
  const blockedSummary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.deepEqual(blockedSummary?.blockingClaim, {
    claimId: claim.claimId,
    reason: "awaiting_resolution"
  });
  assert.equal(blockedSummary?.sendCount, 1);
  assert.equal(blockedSummary?.sentAt, acceptedAt);
  await assert.rejects(
    scheduler.sendInvoiceReminderById({ ownerId, repository, baseUrl: BASE_URL, invoiceId }),
    /unresolved delivery attempt/
  );

  // The provider's final word for the same logical send: a hard
  // bounce, recorded as a FAILED outcome event on the same claim.
  const failedAt = "2026-03-14T09:30:00.000Z";
  const folded = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_failed",
    providerEventId: "evt_q2_hard_bounce",
    occurredAt: failedAt
  });
  // Acceptance evidence preserved; final failure recorded.
  assert.equal(folded.claim.outcomeKind, "accepted");
  assert.equal(folded.claim.acceptedAt, acceptedAt);
  assert.equal(folded.claim.finalFailureAt, failedAt);
  assert.equal(folded.claim.status, "outcome_recorded");

  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.blockingClaim, null);
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.sentAt, acceptedAt);
  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timing[invoiceId]?.hasUnresolvedSend, false);
  assert.equal(timing[invoiceId]?.providerSendCount, 1);

  // Finally resolved means no longer releasable as unresolved.
  await assert.rejects(
    deliveryStore.releaseInvoiceDeliveryClaim({
      ownerId,
      claimId: claim.claimId,
      actor: ownerId,
      reason: "Too late — already resolved."
    }),
    /Only an unresolved delivery claim can be released/
  );

  // The block is released for a later deliberate action: a reminder
  // can be reserved and sent (record_only here). The fold itself
  // dispatched nothing — this send is the scheduler's, after it.
  delete process.env.INVOICE_EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  const reminder = await scheduler.sendInvoiceReminderById({
    ownerId,
    repository,
    baseUrl: BASE_URL,
    invoiceId
  });
  assert.equal(reminder.mode, "record_only");
  assert.equal(reminder.recipientEmail, "q2-failed@example.com");
});

test("contradictory terminal outcomes require reconciliation: ACCEPTED then FAILED then DELIVERED blocks automatic reminders until owner release (Q2 recheck 4)", async () => {
  const ownerId = "slice0-q2-terminal-conflict";
  const invoice = await createInvoice(ownerId, 190);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-conflict@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  const acceptedAt = "2026-03-12T12:00:00.000Z";
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_conflict",
    occurredAt: acceptedAt
  });
  await repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision: revision });

  // Ordinary control state (the test above, in miniature): the final
  // FAILED alone resolves the claim — no conflict, no block.
  const failedAt = "2026-03-14T09:30:00.000Z";
  const folded = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_conflict",
    providerEventId: "evt_q2_conflict_bounce",
    occurredAt: failedAt
  });
  assert.equal(folded.claim.finalFailureAt, failedAt);
  assert.equal(folded.claim.terminalConflictAt, undefined);
  const resolvedSummary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(resolvedSummary?.blockingClaim, null);

  // The contradiction: a DELIVERED outcome for the same claim after
  // the final FAILED. Both terminal outcomes now stand on record;
  // neither may erase the other, and the acceptance evidence — kind,
  // time, count — must not move.
  const deliveredAt = "2026-03-15T10:00:00.000Z";
  const conflicted = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerEventId: "evt_q2_conflict_delivered",
    occurredAt: deliveredAt
  });
  assert.equal(conflicted.claim.outcomeKind, "accepted");
  assert.equal(conflicted.claim.acceptedAt, acceptedAt);
  assert.equal(conflicted.claim.finalFailureAt, failedAt);
  assert.equal(conflicted.claim.terminalConflictAt, deliveredAt);
  assert.equal(conflicted.claim.status, "outcome_recorded");

  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.sentAt, acceptedAt);
  assert.deepEqual(summary?.blockingClaim, {
    claimId: claim.claimId,
    reason: "awaiting_resolution"
  });
  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timing[invoiceId]?.hasUnresolvedSend, true);
  assert.equal(timing[invoiceId]?.providerSendCount, 1);
  await assert.rejects(
    scheduler.sendInvoiceReminderById({ ownerId, repository, baseUrl: BASE_URL, invoiceId }),
    /unresolved delivery attempt/
  );

  // Owner action resolves the reconciliation block; the recorded
  // evidence itself is untouched by the release.
  const released = await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: claim.claimId,
    actor: ownerId,
    reason: "Provider console shows the message was delivered; bounce was a stale relay report."
  });
  assert.equal(released.status, "released");
  assert.equal(released.terminalConflictAt, deliveredAt);
  const afterRelease = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(afterRelease?.blockingClaim, null);
  assert.equal(afterRelease?.sendCount, 1);
  assert.equal(afterRelease?.sentAt, acceptedAt);
  const timingAfter = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timingAfter[invoiceId]?.hasUnresolvedSend, false);
});

test("contradictory terminal outcomes in the other order also require reconciliation: DELIVERED then FAILED (Q2 recheck 4)", async () => {
  const ownerId = "slice0-q2-terminal-conflict-reverse";
  const invoiceId = randomUUID();
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-conflict-reverse@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  const acceptedAt = "2026-03-12T12:00:00.000Z";
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_conflict_reverse",
    occurredAt: acceptedAt
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerEventId: "evt_q2_reverse_delivered",
    occurredAt: "2026-03-13T08:00:00.000Z"
  });
  const failedAt = "2026-03-14T09:30:00.000Z";
  const conflicted = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_conflict_reverse",
    providerEventId: "evt_q2_reverse_bounce",
    occurredAt: failedAt
  });
  // The DELIVERED stands (no regression), the FAILED is recorded as
  // evidence, and the pair is represented as a terminal conflict.
  assert.equal(conflicted.claim.outcomeKind, "delivered");
  assert.equal(conflicted.claim.acceptedAt, acceptedAt);
  assert.equal(conflicted.claim.finalFailureAt, failedAt);
  assert.equal(conflicted.claim.terminalConflictAt, failedAt);
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.sentAt, acceptedAt);
  assert.deepEqual(summary?.blockingClaim, {
    claimId: claim.claimId,
    reason: "awaiting_resolution"
  });
});

// ---------------------------------------------------------------------------
// §D eligibility revalidated inside the reservation mutation
// (re-gate round 3: the scheduler's timing read is not authorization)
// ---------------------------------------------------------------------------

test("reminder eligibility is revalidated inside reservation, across a barrier-suspended timing read", async () => {
  const ownerId = "slice0-q2-reminder-race";
  const invoice = await createInvoice(ownerId, 320);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const recipientEmail = "reminder-race@example.com";

  // The initial send resolved (DELIVERED): reminder timing is clean.
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected initial reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reminder_race_initial"
  });

  // Request A performs the scheduler's eligibility read — no
  // unresolved send — and then suspends at the barrier, exactly
  // where sendInvoiceReminderById waits between its timing read and
  // its occurrence count while a twin request completes.
  const staleTiming = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(staleTiming[invoiceId]?.hasUnresolvedSend, false);
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const requestA = (async () => {
    await barrier;
    // A resumes and counts AFTER B completed: it sees B's claim, so
    // it reserves the NEXT occurrence. Deciding eligibility from A's
    // stale timing read would mint reminder_occurrence_2 here and
    // dispatch a second reminder while B's acceptance is still
    // unresolved; the reservation mutation itself must refuse.
    const priorReminderClaims = await deliveryStore.countInvoiceDeliveryClaims({
      ownerId,
      invoiceId,
      basePurpose: "reminder"
    });
    assert.equal(priorReminderClaims, 1);
    return deliveryStore.reserveInvoiceDeliveryClaim({
      ownerId,
      invoiceId,
      recipientEmail,
      basePurpose: "reminder",
      purpose: `reminder_occurrence_${priorReminderClaims + 1}`,
      authorizedRevision: revision
    });
  })();

  // Request B — the identical reminder — runs to completion while A
  // is suspended: it reserves occurrence 1 and the provider accepts
  // it. ACCEPTED with no final resolution recorded is unresolved
  // under §D, so it must suppress any further reminder dispatch.
  const reminderB = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: revision
  });
  if (reminderB.outcome !== "reserved") throw new Error("expected reminder reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: reminderB.claim.claimId,
    generation: reminderB.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: reminderB.claim.claimId,
    generation: reminderB.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reminder_race_b"
  });
  const liveTiming = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(liveTiming[invoiceId]?.hasUnresolvedSend, true);

  releaseBarrier();
  const resumed = await requestA;
  // The mutation revalidated eligibility from its own snapshot: A is
  // blocked on B's unresolved acceptance and mints nothing, so no
  // second dispatch can follow from A's request.
  assert.equal(resumed.outcome, "blocked");
  if (resumed.outcome === "blocked") {
    assert.equal(resumed.reason, "unresolved_send");
    assert.equal(resumed.claim.claimId, reminderB.claim.claimId);
  }
  const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
    claims?: Array<Record<string, unknown>>;
  };
  const reminderClaims = (parsed.claims ?? []).filter(
    (entry) => entry?.invoiceId === invoiceId && entry?.basePurpose === "reminder"
  );
  assert.equal(reminderClaims.length, 1);
  assert.equal(reminderClaims[0]?.purpose, "reminder_occurrence_1");

  // The block is the §D gate, not a wedge: once the owner releases
  // B's claim (the recorded substitute for the missing resolution),
  // the same reservation mints occurrence 2.
  await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: reminderB.claim.claimId,
    actor: ownerId,
    reason: "Provider console confirms the reminder landed; ending the resolution wait."
  });
  const afterRelease = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: "reminder_occurrence_2",
    authorizedRevision: revision
  });
  assert.equal(afterRelease.outcome, "reserved");
});

test("an unresolved ACCEPTED send blocks a reminder reservation at the store seam; DELIVERED restores it", async () => {
  const ownerId = "slice0-q2-reminder-gate";
  const invoice = await createInvoice(ownerId, 340);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const recipientEmail = "reminder-gate@example.com";

  // The initial send is ACCEPTED with no final resolution: the
  // timing projection suppresses reminders, and the reservation
  // mutation must reach the same verdict on its own — a caller whose
  // timing read raced the acceptance cannot mint a reminder claim.
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected initial reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reminder_gate_initial"
  });
  const blocked = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: revision
  });
  assert.equal(blocked.outcome, "blocked");
  if (blocked.outcome === "blocked") {
    assert.equal(blocked.reason, "unresolved_send");
    assert.equal(blocked.claim.claimId, initial.claim.claimId);
  }

  // Resolution restores eligibility: the DELIVERED fold ends the
  // unresolved state and the same reservation now mints.
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initial.claim.claimId,
    generation: initial.claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reminder_gate_initial"
  });
  const allowed = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: revision
  });
  assert.equal(allowed.outcome, "reserved");

  // A resolved reminder never trips the gate either: once that
  // reminder is itself DELIVERED, the next occurrence mints freely.
  if (allowed.outcome !== "reserved") throw new Error("expected reminder reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: allowed.claim.claimId,
    generation: allowed.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: allowed.claim.claimId,
    generation: allowed.claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reminder_gate_reminder"
  });
  const nextOccurrence = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: "reminder_occurrence_2",
    authorizedRevision: revision
  });
  assert.equal(nextOccurrence.outcome, "reserved");
});

// ---------------------------------------------------------------------------
// Audit item 2: delete -> restore must not resurrect a settled balance
// ---------------------------------------------------------------------------

test("delete then restore of a paid invoice returns paid with zero balance", async () => {
  const ownerId = "slice0-delete-restore";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 150);
  await settleInFull(ownerId, invoiceId, linkRecordId, 150);
  const paid = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(paid.status, "paid");
  assert.equal(paid.invoiceData.finishedInvoice.balanceDue, 0);

  await repository.updateSavedInvoiceStatus(invoiceId, "deleted", ownerId);
  const deleted = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(deleted.status, "deleted");
  // The defect: the delete itself rewrote balanceDue back to the total.
  assert.equal(deleted.invoiceData.finishedInvoice.balanceDue, 0);

  const restored = await repository.restoreSavedInvoice(invoiceId, ownerId);
  assert.equal(restored.status, "paid");
  assert.equal(restored.invoiceData.finishedInvoice.balanceDue, 0);
});

test("lifecycle compatibility: manual paid->sent still restores the balance (Slice 2 scope)", async () => {
  const ownerId = "slice0-lifecycle-compat";
  const invoice = await createInvoice(ownerId, 150);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "paid", ownerId);
  const paid = await repository.getSavedInvoiceById(invoice.invoiceId, ownerId);
  assert.equal(paid.invoiceData.finishedInvoice.balanceDue, 0);
  const backToSent = await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  assert.equal(backToSent.status, "sent");
  assert.equal(backToSent.invoiceData.finishedInvoice.balanceDue, 150);
});

// ---------------------------------------------------------------------------
// Delivery events + claims (invariants 7, 8; §C/§D)
// ---------------------------------------------------------------------------

test("record_only_has_no_success_projection", async () => {
  const ownerId = "slice0-record-only";
  const invoiceId = randomUUID();
  const summary = await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId,
    recipientEmail: "client@example.com",
    mode: "record_only",
    provider: "none"
  });
  assert.equal(summary.status, "recorded");
  assert.equal(summary.sendCount, 0);
  assert.equal(summary.sentAt, null);
  assert.equal(summary.recordOnlyCount, 1);
  assert.equal(summary.verified, false);
});

test("replayed_outcome_counts_once; delivered_after_accepted_counts_once", async () => {
  const ownerId = "slice0-claim-replay";
  const invoiceId = randomUUID();
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "Client@Example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0
  });
  assert.equal(reservation.outcome, "reserved");
  if (reservation.outcome !== "reserved" && reservation.outcome !== "reclaimed") {
    throw new Error("expected a reservation");
  }
  const claim = reservation.claim;
  assert.match(claim.providerIdempotencyKey, /^nb-send-[0-9a-f]{32}$/);
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  const first = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_replay_1"
  });
  assert.equal(first.duplicate, false);
  const replay = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_replay_1"
  });
  assert.equal(replay.duplicate, true);
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerEventId: "evt_delivered_1"
  });
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.status, "sent");
  assert.equal(summary?.verified, true);
  assert.ok(summary?.sentAt);
});

test("conflicting_event_key_is_rejected", async () => {
  const ownerId = "slice0-event-conflict";
  const invoiceId = randomUUID();
  await deliveryStore.appendInvoiceDeliveryEvent({
    eventId: "evt-fixed-key",
    ownerId,
    invoiceId,
    attemptId: "attempt-1",
    kind: "send_recorded",
    mode: "provider",
    provider: "resend",
    outcome: "accepted",
    providerMessageId: "email_a"
  });
  await assert.rejects(
    deliveryStore.appendInvoiceDeliveryEvent({
      eventId: "evt-fixed-key",
      ownerId,
      invoiceId,
      attemptId: "attempt-1",
      kind: "send_recorded",
      mode: "provider",
      provider: "resend",
      outcome: "accepted",
      providerMessageId: "email_b"
    }),
    /Conflicting delivery event/
  );
  // Identical replay is a no-op.
  const replay = await deliveryStore.appendInvoiceDeliveryEvent({
    eventId: "evt-fixed-key",
    ownerId,
    invoiceId,
    attemptId: "attempt-1",
    kind: "send_recorded",
    mode: "provider",
    provider: "resend",
    outcome: "accepted",
    providerMessageId: "email_a"
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.summary.sendCount, 1);
});

test("claim exclusion: competing claims blocked; UNKNOWN blocks until owner release", async () => {
  const ownerId = "slice0-claim-exclusion";
  const invoiceId = randomUUID();
  const first = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "one@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0
  });
  assert.equal(first.outcome, "reserved");
  if (first.outcome !== "reserved") throw new Error("expected reservation");

  // v2.2 cross-key exclusion: a different recipient/purpose is blocked
  // while the first claim is active.
  const competing = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "two@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0
  });
  assert.equal(competing.outcome, "blocked");
  if (competing.outcome === "blocked") {
    assert.equal(competing.reason, "send_in_progress");
  }

  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: first.claim.claimId,
    generation: first.claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: first.claim.claimId,
    generation: first.claim.generation,
    outcome: "unknown",
    mode: "provider",
    provider: "none"
  });
  const afterUnknown = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "one@example.com",
    basePurpose: "resend",
    purpose: "resend_1",
    authorizedRevision: 0
  });
  assert.equal(afterUnknown.outcome, "blocked");
  if (afterUnknown.outcome === "blocked") {
    assert.equal(afterUnknown.reason, "unresolved_send");
  }

  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timing[invoiceId]?.hasUnresolvedSend, true);

  const released = await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: first.claim.claimId,
    actor: ownerId,
    reason: "Provider console shows no such email; owner released."
  });
  assert.equal(released.status, "released");
  assert.equal(released.releaseActor, ownerId);

  const afterRelease = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "one@example.com",
    basePurpose: "resend",
    purpose: "resend_1",
    authorizedRevision: 0
  });
  assert.equal(afterRelease.outcome, "reserved");
});

test("a resolved claim never regresses, and a stuck dispatching claim can be owner-released", async () => {
  const ownerId = "slice0-claim-late-outcomes";
  const invoiceId = randomUUID();
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "late@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0,
    leaseMs: 1
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_late_1"
  });
  // A stray late UNKNOWN for the same claim is retained as an event
  // but cannot regress the resolved acceptance or its count.
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "unknown",
    mode: "provider",
    provider: "none",
    providerEventId: "evt_late_unknown"
  });
  const after = await deliveryStore.getInvoiceDeliveryClaimById({ ownerId, claimId: claim.claimId });
  assert.equal(after?.status, "outcome_recorded");
  assert.equal(after?.outcomeKind, "accepted");
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);

  // A claim stuck in dispatching past its lease (worker gone, no
  // outcome ever recorded) is releasable by the owner.
  const invoiceId2 = randomUUID();
  const stuck = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId: invoiceId2,
    recipientEmail: "stuck@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0,
    leaseMs: 1
  });
  if (stuck.outcome !== "reserved") throw new Error("expected reservation");
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: stuck.claim.claimId,
    generation: stuck.claim.generation,
    trackingToken: randomUUID()
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const releasedStuck = await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: stuck.claim.claimId,
    actor: ownerId,
    reason: "Worker died mid-dispatch; provider console confirms no send."
  });
  assert.equal(releasedStuck.status, "released");
});

test("an abandoned reservation blocks competing keys until the owner releases it", async () => {
  const ownerId = "slice0-claim-abandoned-reservation";
  const invoiceId = randomUUID();
  // A worker reserves the initial send and dies before dispatch.
  const abandoned = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "abandoned@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0,
    leaseMs: 1
  });
  if (abandoned.outcome !== "reserved") throw new Error("expected reservation");
  await new Promise((resolve) => setTimeout(resolve, 10));
  // The lease has expired, but the cross-key exclusion has no expiry:
  // a competing claim (the next reminder occurrence — a different key
  // every retry, so same-key reclaim can never recover it) is blocked
  // by the dead reservation.
  const competing = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "abandoned@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0
  });
  assert.equal(competing.outcome, "blocked");
  // §C owner release is the recovery path: a claim still in
  // `reserved` is proven never to have entered dispatch, so releasing
  // it cannot strand or duplicate a provider send.
  const released = await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: abandoned.claim.claimId,
    actor: ownerId,
    reason: "Reservation abandoned before dispatch began; releasing."
  });
  assert.equal(released.status, "released");
  const afterRelease = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "abandoned@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0
  });
  assert.equal(afterRelease.outcome, "reserved");
  // A reservation whose lease is still live is a send in progress,
  // not an abandoned one: it remains unreleasable.
  const liveInvoiceId = randomUUID();
  const live = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId: liveInvoiceId,
    recipientEmail: "live@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0,
    leaseMs: 60_000
  });
  if (live.outcome !== "reserved") throw new Error("expected reservation");
  await assert.rejects(
    () =>
      deliveryStore.releaseInvoiceDeliveryClaim({
        ownerId,
        claimId: live.claim.claimId,
        actor: ownerId,
        reason: "Too soon — this reservation is still owned."
      }),
    /Only an unresolved delivery claim can be released/
  );
});

test("a DELIVERED fold strengthens the claim without moving its acceptance time", async () => {
  const ownerId = "slice0-claim-delivered-fold";
  const invoiceId = randomUUID();
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "fold@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0,
    leaseMs: 60_000
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  const acceptedAt = "2026-10-01T12:00:00.000Z";
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_fold_1",
    occurredAt: acceptedAt
  });
  // Delivery is confirmed two days later. §D: DELIVERED updates the
  // same claim's projection and creates no second count — and it must
  // not move the acceptance time the summary and reminder timing
  // report as the send time.
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_fold_1",
    providerEventId: "evt_fold_delivered",
    occurredAt: "2026-10-03T12:00:00.000Z"
  });
  const after = await deliveryStore.getInvoiceDeliveryClaimById({ ownerId, claimId: claim.claimId });
  assert.equal(after?.outcomeKind, "delivered");
  assert.equal(after?.acceptedAt, acceptedAt);
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.sentAt, acceptedAt);
  const timingById = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timingById[invoiceId]?.providerSendCount, 1);
  assert.equal(timingById[invoiceId]?.lastProviderAcceptedAt, acceptedAt);
});

test("an opened event never changes the reminder recipient", async () => {
  const ownerId = "slice0-open-recipient";
  const invoice = await createInvoice(ownerId, 120);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  const invoiceId = invoice.invoiceId;

  async function acceptedSend(
    recipientEmail: string,
    basePurpose: "initial_send" | "resend",
    purpose: string
  ): Promise<string> {
    const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
      ownerId,
      invoiceId,
      recipientEmail,
      basePurpose,
      purpose,
      authorizedRevision: 0
    });
    if (reservation.outcome !== "reserved" && reservation.outcome !== "reclaimed") {
      throw new Error("expected a reservation");
    }
    const trackingToken = randomUUID();
    await deliveryStore.beginInvoiceDeliveryDispatch({
      ownerId,
      claimId: reservation.claim.claimId,
      generation: reservation.claim.generation,
      trackingToken
    });
    await deliveryStore.recordInvoiceDeliveryClaimOutcome({
      ownerId,
      claimId: reservation.claim.claimId,
      generation: reservation.claim.generation,
      outcome: "accepted",
      mode: "provider",
      provider: "resend",
      providerMessageId: `email_${purpose}`
    });
    // §D (conformance Q2): an ACCEPTED send blocks automatic reminders
    // until its final delivery/failure resolution is recorded. These
    // sends DID reach their recipients (the first is opened below), so
    // record the DELIVERED fold that resolves each claim — without it
    // the reminder at the end of this test is correctly blocked.
    await deliveryStore.recordInvoiceDeliveryClaimOutcome({
      ownerId,
      claimId: reservation.claim.claimId,
      generation: reservation.claim.generation,
      outcome: "delivered",
      mode: "provider",
      provider: "resend",
      providerMessageId: `email_${purpose}`
    });
    return trackingToken;
  }

  const firstToken = await acceptedSend("first@example.com", "initial_send", "initial_send");
  await acceptedSend("second@example.com", "resend", "resend_1");

  const before = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(before[invoiceId]?.recipientEmail, "second@example.com");

  // The FIRST recipient opens their older email. The open is engagement
  // evidence about that attempt — it is not a send operation and must
  // not re-select the reminder recipient back to the old address.
  await deliveryStore.markInvoiceDeliveryOpenedByTrackingToken({ invoiceId, trackingToken: firstToken });

  const after = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(after[invoiceId]?.recipientEmail, "second@example.com");
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.recipientEmail, "second@example.com");
  // The open itself still counts as engagement with the first send.
  assert.equal(summary?.openCount, 1);

  // A reminder dispatched now is addressed to the latest send's
  // recipient (record_only here — no provider configured in this file).
  const reminder = await scheduler.sendInvoiceReminderById({
    ownerId,
    repository,
    baseUrl: BASE_URL,
    invoiceId
  });
  assert.equal(reminder.recipientEmail, "second@example.com");
});

test("a definitive provider rejection records the reminder outcome as failed, not unknown", async () => {
  const ownerId = "slice0-reminder-rejection";
  const invoice = await createInvoice(ownerId, 90);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "rejected@example.com",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_reject_seed"
  });

  process.env.INVOICE_EMAIL_PROVIDER = "resend";
process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
  const nativeFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      // Resend answers and refuses the submission (validation error):
      // a definitive rejection, not an uncertain result (§D).
      return new Response(
        JSON.stringify({ name: "validation_error", message: "Recipient address is invalid." }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ id: "email_reject_retry" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      scheduler.sendInvoiceReminderById({
        ownerId,
        repository,
        baseUrl: BASE_URL,
        invoiceId: invoice.invoiceId
      }),
      /Failed to send email via Resend/
    );
    const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
      claims?: Array<Record<string, unknown>>;
    };
    const reminderClaim = (parsed.claims ?? []).find(
      (claim) => claim?.invoiceId === invoice.invoiceId && claim?.basePurpose === "reminder"
    );
    assert.equal(reminderClaim?.outcomeKind, "failed");
    assert.equal(reminderClaim?.status, "outcome_recorded");
    // §D: FAILED releases the ambiguity block — nothing is unresolved,
    // so an ordinary correction can be retried without owner release.
    const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
      ownerId,
      invoiceIds: [invoice.invoiceId]
    });
    assert.equal(timing[invoice.invoiceId]?.hasUnresolvedSend, false);

    const retry = await scheduler.sendInvoiceReminderById({
      ownerId,
      repository,
      baseUrl: BASE_URL,
      invoiceId: invoice.invoiceId
    });
    assert.equal(retry.mode, "provider");
    assert.equal(retry.recipientEmail, "rejected@example.com");
    assert.equal(fetchCalls, 2);
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = nativeFetch;
    delete process.env.INVOICE_EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_FROM_EMAIL;
  }
});

test("a Resend idempotency conflict (409) records the reminder outcome as unknown, never failed (Q12)", async () => {
  const ownerId = "slice0-reminder-conflict";
  const invoice = await createInvoice(ownerId, 95);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "conflict@example.com",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_conflict_seed"
  });

  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
  const nativeFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalls += 1;
    // Resend's documented conflict: another request with the same
    // idempotency key is still in progress. That is NOT proof the
    // logical send failed — the provider may still accept it — so
    // the outcome must stay UNKNOWN with the §D block retained (Q12).
    return new Response(
      JSON.stringify({
        name: "concurrent_idempotent_requests",
        message: "Another request with the same idempotency key is in progress."
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  try {
    await assert.rejects(
      scheduler.sendInvoiceReminderById({
        ownerId,
        repository,
        baseUrl: BASE_URL,
        invoiceId: invoice.invoiceId
      }),
      /Failed to send email via Resend/
    );
    const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
      claims?: Array<Record<string, unknown>>;
    };
    const reminderClaim = (parsed.claims ?? []).find(
      (claim) => claim?.invoiceId === invoice.invoiceId && claim?.basePurpose === "reminder"
    );
    assert.equal(reminderClaim?.outcomeKind, "unknown");
    assert.equal(reminderClaim?.status, "blocked_unknown");
    // The ambiguity block is retained: a further reminder attempt is
    // refused before dispatch until the claim is reconciled/released.
    const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
      ownerId,
      invoiceIds: [invoice.invoiceId]
    });
    assert.equal(timing[invoice.invoiceId]?.hasUnresolvedSend, true);
    await assert.rejects(
      scheduler.sendInvoiceReminderById({
        ownerId,
        repository,
        baseUrl: BASE_URL,
        invoiceId: invoice.invoiceId
      }),
      /unresolved delivery attempt/
    );
    assert.equal(fetchCalls, 1);
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = nativeFetch;
    delete process.env.INVOICE_EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_FROM_EMAIL;
  }
});

test("Resend 409s named invalid_idempotent_request or anything unrecognized also stay unknown, never failed (Q12)", async () => {
  // Q12 residual: the pre-fix classifier matched only an unnamed 409
  // or "concurrent_idempotent_requests", so Resend's second documented
  // conflict name — "invalid_idempotent_request" (the key was reused
  // with a different payload; the ORIGINAL operation governs) — fell
  // through to a definitive rejection and recorded FAILED, releasing
  // the ambiguity block on a send the provider may have accepted.
  // The same conservative handling covers any unrecognized 409 name:
  // a conflict response is never an auth/validation verdict.
  const cases = [
    { name: "invalid_idempotent_request", ownerId: "slice0-reminder-conflict-invalid" },
    { name: "some_future_conflict_name", ownerId: "slice0-reminder-conflict-unrecognized" }
  ];
  const nativeFetch = globalThis.fetch;
  try {
    for (const testCase of cases) {
      const ownerId = testCase.ownerId;
      const invoice = await createInvoice(ownerId, 95);
      await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
      await deliveryStore.recordInvoiceDeliverySend({
        ownerId,
        invoiceId: invoice.invoiceId,
        recipientEmail: "conflict2@example.com",
        mode: "provider",
        provider: "resend",
        providerMessageId: `email_conflict_seed_${testCase.name}`
      });

      process.env.INVOICE_EMAIL_PROVIDER = "resend";
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
      (globalThis as { fetch: typeof fetch }).fetch = (async () =>
        new Response(
          JSON.stringify({
            name: testCase.name,
            message: "Idempotency conflict."
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )) as typeof fetch;

      await assert.rejects(
        scheduler.sendInvoiceReminderById({
          ownerId,
          repository,
          baseUrl: BASE_URL,
          invoiceId: invoice.invoiceId
        }),
        /Failed to send email via Resend/
      );
      const parsed = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
        claims?: Array<Record<string, unknown>>;
      };
      const reminderClaim = (parsed.claims ?? []).find(
        (claim) => claim?.invoiceId === invoice.invoiceId && claim?.basePurpose === "reminder"
      );
      assert.equal(reminderClaim?.outcomeKind, "unknown", `409 ${testCase.name} must stay unknown`);
      assert.equal(reminderClaim?.status, "blocked_unknown");
      const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
        ownerId,
        invoiceIds: [invoice.invoiceId]
      });
      assert.equal(timing[invoice.invoiceId]?.hasUnresolvedSend, true);
    }
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = nativeFetch;
    delete process.env.INVOICE_EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_FROM_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// Legacy migration honesty (invariant 10)
// ---------------------------------------------------------------------------

async function seedLegacyDeliveryFile(entries: Array<Record<string, unknown>>): Promise<void> {
  await fs.writeFile(deliveryStoreFile, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
}

test("legacy aggregate stays an unverified snapshot; its opens stay unverified", async () => {
  const ownerId = "slice0-legacy";
  const invoiceId = randomUUID();
  await seedLegacyDeliveryFile([
    {
      invoiceId,
      ownerId,
      recipientEmail: "legacy@example.com",
      sentAt: "2026-01-01T00:00:00.000Z",
      openedAt: "2026-01-02T00:00:00.000Z",
      trackingToken: "legacy-token-123",
      mode: "provider",
      provider: "resend",
      providerMessageId: "email_legacy",
      sendCount: 5,
      openCount: 2
    }
  ]);

  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.verified, false);
  assert.equal(summary?.sendCount, 0);
  assert.equal(summary?.sentAt, null);
  assert.equal(summary?.legacy?.sendCount, 5);
  assert.equal(summary?.legacy?.mode, "provider");

  // The cumulative legacy count is never attributed to its latest mode.
  const storeSummary = await deliveryStore.getInvoiceDeliveryStoreSummary();
  assert.equal(storeSummary.providerSendCount, 0);
  assert.equal(storeSummary.legacySendCount, 5);

  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoiceId]
  });
  assert.equal(timing[invoiceId]?.hasVerifiedHistory, false);
  assert.equal(timing[invoiceId]?.providerSendCount, 0);
  assert.equal(timing[invoiceId]?.lastProviderAcceptedAt, null);
  assert.equal(timing[invoiceId]?.recipientEmail, "legacy@example.com");

  const afterOpen = await deliveryStore.markInvoiceDeliveryOpened({ ownerId, invoiceId });
  assert.equal(afterOpen.openCount, 0);
  assert.equal(afterOpen.unverifiedOpenCount, 1);
  assert.equal(afterOpen.status, "recorded");

  // Migration replay: a later write converts the envelope without
  // duplicating the snapshot or inventing events for the legacy send.
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: randomUUID(),
    recipientEmail: "other@example.com",
    mode: "record_only",
    provider: "none"
  });
  const raw = JSON.parse(await fs.readFile(deliveryStoreFile, "utf8")) as {
    version?: number;
    legacyEntries?: Array<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
  };
  assert.equal(raw.version, 2);
  assert.equal(raw.legacyEntries?.length, 1);
  assert.equal(raw.legacyEntries?.[0]?.sendCount, 5);
  const legacyEvents = (raw.events ?? []).filter((event) => event.invoiceId === invoiceId);
  // Only the open recorded above exists; the five legacy "sends" were
  // never expanded into invented events.
  assert.equal(legacyEvents.length, 1);
  assert.equal(legacyEvents[0]?.kind, "opened");
});

// ---------------------------------------------------------------------------
// Reminder gating (invariants 9, 11)
// ---------------------------------------------------------------------------

test("legacy_invoice_reminders_remain_paused until owner confirmation", async () => {
  const ownerId = "slice0-reminder-gate";
  const invoice = await createInvoice(ownerId, 100);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  await seedLegacyDeliveryFile([
    {
      invoiceId: invoice.invoiceId,
      ownerId,
      recipientEmail: "gate@example.com",
      sentAt: "2026-01-01T00:00:00.000Z",
      mode: "provider",
      provider: "resend",
      sendCount: 3,
      openCount: 0
    }
  ]);

  const paused = await scheduler.listDueInvoiceReminderCandidates({
    ownerId,
    repository,
    now: new Date("2026-10-01T00:00:00.000Z")
  });
  assert.equal(paused.due.length, 0);

  // §E owner confirmation restores scheduling eligibility only.
  await deliveryStore.setInvoiceReminderAnchor({
    ownerId,
    invoiceId: invoice.invoiceId,
    activatedAt: "2026-09-01T00:00:00.000Z",
    nextDueAt: "2026-09-15T00:00:00.000Z"
  });
  const confirmed = await scheduler.listDueInvoiceReminderCandidates({
    ownerId,
    repository,
    now: new Date("2026-10-01T00:00:00.000Z")
  });
  assert.equal(confirmed.due.length, 1);
  assert.equal(confirmed.due[0]?.reason, "owner_confirmed");
  assert.equal(confirmed.due[0]?.sendCount, 0);

  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoice.invoiceId]
  });
  assert.equal(timing[invoice.invoiceId]?.hasVerifiedHistory, false);
});

test("mixed_modes_use_only_provider_events_for_timing; record_only never enters the cooldown branch", async () => {
  const ownerId = "slice0-timing-mixed";
  const invoice = await createInvoice(ownerId, 100);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  // One verified provider send, then two record_only records. If the
  // record_only activity counted, sendCount would be 3 and the
  // cooldown branch (7d) would apply instead of dueAfterDays (14d).
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "mixed@example.com",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_mixed_1"
  });
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "mixed@example.com",
    mode: "record_only",
    provider: "none"
  });
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "mixed@example.com",
    mode: "record_only",
    provider: "none"
  });

  const timing = await deliveryStore.getInvoiceReminderTimingByInvoiceIds({
    ownerId,
    invoiceIds: [invoice.invoiceId]
  });
  assert.equal(timing[invoice.invoiceId]?.providerSendCount, 1);
  assert.equal(timing[invoice.invoiceId]?.recordOnlyCount, 2);
  const lastAcceptedMs = Date.parse(timing[invoice.invoiceId]?.lastProviderAcceptedAt ?? "");
  assert.ok(Number.isFinite(lastAcceptedMs));

  const atEightDays = await scheduler.listDueInvoiceReminderCandidates({
    ownerId,
    repository,
    now: new Date(lastAcceptedMs + 8 * 24 * 60 * 60 * 1000)
  });
  assert.equal(atEightDays.due.length, 0);
  const atFifteenDays = await scheduler.listDueInvoiceReminderCandidates({
    ownerId,
    repository,
    now: new Date(lastAcceptedMs + 15 * 24 * 60 * 60 * 1000)
  });
  assert.equal(atFifteenDays.due.length, 1);
  assert.equal(atFifteenDays.due[0]?.sendCount, 1);
});

test("record_only reminder does not increment sent count or touch the invoice", async () => {
  const ownerId = "slice0-reminder-record-only";
  const invoice = await createInvoice(ownerId, 100);
  await repository.updateSavedInvoiceStatus(invoice.invoiceId, "sent", ownerId);
  await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId: invoice.invoiceId,
    recipientEmail: "reminder-ro@example.com",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_ro_1"
  });
  const before = await repository.getSavedInvoiceById(invoice.invoiceId, ownerId);

  const result = await scheduler.sendInvoiceReminderById({
    ownerId,
    repository,
    baseUrl: BASE_URL,
    invoiceId: invoice.invoiceId
  });
  assert.equal(result.mode, "record_only");
  assert.equal(result.delivery.sendCount, 1);
  assert.equal(result.delivery.recordOnlyCount, 1);
  assert.equal(result.invoice.updatedAt, before.updatedAt);
  assert.equal(result.invoice.status, "sent");
});

// ---------------------------------------------------------------------------
// Audit item 5: emails show the real balance due
// ---------------------------------------------------------------------------

test("invoice and reminder emails show balance due after partial payment, not the original total", async () => {
  process.env.INVOICE_EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.INVOICE_FROM_EMAIL = "billing@notebill.app";
  const bodies: Array<Record<string, unknown>> = [];
  const nativeFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_input: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ id: "email_partial" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
  try {
    const data = invoiceData(200, { balanceDue: 75 });
    const result = await sendInvoiceEmail({
      recipientEmail: "partial@example.com",
      invoice: data.finishedInvoice,
      invoiceId: randomUUID(),
      openTrackingPixelUrl: "https://app.notebill.test/pixel",
      messageType: "reminder",
      idempotencyKey: "nb-send-testkey"
    });
    assert.equal(result.mode, "provider");
    assert.equal(bodies.length, 1);
    assert.match(String(bodies[0]?.text ?? ""), /Total due: \$75\.00/);
    assert.doesNotMatch(String(bodies[0]?.text ?? ""), /Total due: \$200\.00/);
    assert.match(String(bodies[0]?.html ?? ""), /Total due: \$75\.00/);
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = nativeFetch;
    delete process.env.INVOICE_EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_FROM_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// Recheck 5: the Q2 conflict block is enforced where dispatch is
// authorized, not only where reservations are created; and the P2
// evidence pair (sentAt, sentToEmail) never inherits a recipient.
// ---------------------------------------------------------------------------

test("a terminal conflict recorded after a reminder reservation blocks that reminder at dispatch authorization (Q2 recheck 5)", async () => {
  const ownerId = "slice0-q2-dispatch-gate";
  const invoice = await createInvoice(ownerId, 210);
  const invoiceId = invoice.invoiceId;
  const revision = invoice.invoiceData.finishedInvoice.monetaryRevision;
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-dispatch@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: revision
  });
  if (initial.outcome !== "reserved") throw new Error("expected reservation");
  const initialClaim = initial.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_dispatch",
    occurredAt: "2026-03-12T12:00:00.000Z"
  });
  await repository.completeInvoiceDelivery({ invoiceId, ownerId, authorizedRevision: revision });
  // The final FAILED resolves the claim: no conflict, no block. This
  // is the clean state in which the reminder below reserves.
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_dispatch",
    providerEventId: "evt_q2_dispatch_bounce",
    occurredAt: "2026-03-14T09:30:00.000Z"
  });
  const cleanSummary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(cleanSummary?.blockingClaim, null);

  // The reminder reserves while no conflict exists.
  const reminder = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-dispatch@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: revision,
    leaseMs: 60_000
  });
  if (reminder.outcome !== "reserved") throw new Error("expected reminder reservation");
  const reminderClaim = reminder.claim;

  // A late DELIVERED for the older claim records the durable
  // terminal conflict — the older claim becomes blocking WHILE the
  // reminder reservation is outstanding.
  const conflicted = await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerEventId: "evt_q2_dispatch_delivered",
    occurredAt: "2026-03-15T10:00:00.000Z"
  });
  assert.equal(conflicted.claim.terminalConflictAt, "2026-03-15T10:00:00.000Z");
  const blockedSummary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.deepEqual(blockedSummary?.blockingClaim, {
    claimId: initialClaim.claimId,
    reason: "awaiting_resolution"
  });

  // Dispatch authorization is serialized inside the store mutation:
  // no provider dispatch may begin for the outstanding reminder
  // while the recorded conflict remains unreleased.
  await assert.rejects(
    deliveryStore.beginInvoiceDeliveryDispatch({
      ownerId,
      claimId: reminderClaim.claimId,
      generation: reminderClaim.generation,
      trackingToken: randomUUID()
    }),
    /terminal conflict/
  );
  const stillReserved = await deliveryStore.getInvoiceDeliveryClaimById({
    ownerId,
    claimId: reminderClaim.claimId
  });
  assert.equal(stillReserved?.status, "reserved");

  // Owner release of the conflicted claim is the resolution action:
  // it clears the dispatch gate as well.
  await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: initialClaim.claimId,
    actor: ownerId,
    reason: "Provider console confirms delivery; the bounce was a stale relay report."
  });
  const dispatched = await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: reminderClaim.claimId,
    generation: reminderClaim.generation,
    trackingToken: randomUUID()
  });
  assert.equal(dispatched.status, "dispatching");
});

test("a terminal conflict recorded while a reminder reservation sits expired blocks the same-key reclaim (Q2 recheck 5)", async () => {
  const ownerId = "slice0-q2-reclaim-gate";
  const invoiceId = randomUUID();
  const initial = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-reclaim@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0
  });
  if (initial.outcome !== "reserved") throw new Error("expected reservation");
  const initialClaim = initial.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_reclaim",
    occurredAt: "2026-03-12T12:00:00.000Z"
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "failed",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_q2_reclaim",
    providerEventId: "evt_q2_reclaim_bounce",
    occurredAt: "2026-03-14T09:30:00.000Z"
  });

  // The reminder reserves while clean, then its lease expires with
  // dispatch never begun — the reservation sits reclaimable.
  const reminder = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-reclaim@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0,
    leaseMs: 1
  });
  if (reminder.outcome !== "reserved") throw new Error("expected reminder reservation");
  await new Promise((resolve) => setTimeout(resolve, 10));

  // The late DELIVERED records the conflict while the reservation
  // sits expired.
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: initialClaim.claimId,
    generation: initialClaim.generation,
    outcome: "delivered",
    mode: "provider",
    provider: "resend",
    providerEventId: "evt_q2_reclaim_delivered",
    occurredAt: "2026-03-15T10:00:00.000Z"
  });

  // The same-key reclaim returns BEFORE the reservation-creation
  // eligibility check in the current code; it must not bypass the
  // conflict block either.
  const reclaim = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-reclaim@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0,
    leaseMs: 60_000
  });
  assert.equal(reclaim.outcome, "blocked");
  if (reclaim.outcome === "blocked") {
    assert.equal(reclaim.reason, "unresolved_send");
    assert.equal(reclaim.claim.claimId, initialClaim.claimId);
  }
  const notReclaimed = await deliveryStore.getInvoiceDeliveryClaimById({
    ownerId,
    claimId: reminder.claim.claimId
  });
  assert.equal(notReclaimed?.status, "reserved");
  assert.equal(notReclaimed?.generation, reminder.claim.generation);

  // After the owner releases the conflicted claim, the same reclaim
  // proceeds with a new fencing generation.
  await deliveryStore.releaseInvoiceDeliveryClaim({
    ownerId,
    claimId: initialClaim.claimId,
    actor: ownerId,
    reason: "Provider console confirms delivery; the bounce was a stale relay report."
  });
  const reclaimed = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "q2-reclaim@example.com",
    basePurpose: "reminder",
    purpose: "reminder_occurrence_1",
    authorizedRevision: 0,
    leaseMs: 60_000
  });
  assert.equal(reclaimed.outcome, "reclaimed");
  if (reclaimed.outcome === "reclaimed") {
    assert.equal(reclaimed.claim.generation, reminder.claim.generation + 1);
  }
});

test("a recipientless acceptance yields an unknown evidence recipient; later recorded activity changes addressing only (P2 recheck 5)", async () => {
  const ownerId = "slice0-p2-recipientless";
  const invoiceId = randomUUID();
  // A provider/accepted send_recorded event may legitimately carry
  // no recipientEmail (appendInvoiceDeliveryEvent permits it, and
  // the conflicting_event_key case above counts this exact shape as
  // a verified send). The acceptance is real evidence — of a send,
  // at a time — but its recipient is UNKNOWN.
  const acceptedAt = "2026-03-12T12:00:00.000Z";
  await deliveryStore.appendInvoiceDeliveryEvent({
    eventId: "evt-p2-recipientless-accepted",
    ownerId,
    invoiceId,
    attemptId: "attempt-p2-recipientless",
    kind: "send_recorded",
    mode: "provider",
    provider: "resend",
    outcome: "accepted",
    providerMessageId: "email_p2_recipientless",
    occurredAt: acceptedAt
  });
  const summary = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(summary?.verified, true);
  assert.equal(summary?.sendCount, 1);
  assert.equal(summary?.sentAt, acceptedAt);
  assert.equal(summary?.sentToEmail, null);

  // Later record_only activity addressed to B: B becomes the current
  // addressing recipient, and nothing else moves. The store already
  // yields sentToEmail null here; the presentation surfaces must not
  // fall back to B either (covered by the UI case).
  const after = await deliveryStore.recordInvoiceDeliverySend({
    ownerId,
    invoiceId,
    recipientEmail: "pair-b@example.com",
    mode: "record_only",
    provider: "none"
  });
  assert.equal(after.recipientEmail, "pair-b@example.com");
  assert.equal(after.recordOnlyCount, 1);
  assert.equal(after.sendCount, 1);
  assert.equal(after.sentAt, acceptedAt);
  assert.equal(after.sentToEmail, null);
});

test("a newer recipientless acceptance never inherits the previous recipient: sentAt and sentToEmail move as one evidence pair (P2 recheck 5)", async () => {
  const ownerId = "slice0-p2-evidence-pair";
  const invoiceId = randomUUID();
  const acceptedAt = "2026-03-12T12:00:00.000Z";
  const reservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId,
    invoiceId,
    recipientEmail: "pair-a@example.com",
    basePurpose: "initial_send",
    purpose: "initial_send",
    authorizedRevision: 0
  });
  if (reservation.outcome !== "reserved") throw new Error("expected reservation");
  const claim = reservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_pair_a",
    occurredAt: acceptedAt
  });
  const control = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(control?.sentAt, acceptedAt);
  assert.equal(control?.sentToEmail, "pair-a@example.com");

  // A newer claim-free acceptance with NO recipient on record. The
  // acceptance time advances; the recipient must become UNKNOWN —
  // pairing the new time with A's address would present A's name as
  // the recipient of an operation that never named her.
  const newerAt = "2026-03-16T09:00:00.000Z";
  await deliveryStore.appendInvoiceDeliveryEvent({
    eventId: "evt-p2-pair-recipientless",
    ownerId,
    invoiceId,
    attemptId: "attempt-p2-pair-recipientless",
    kind: "send_recorded",
    mode: "provider",
    provider: "resend",
    outcome: "accepted",
    providerMessageId: "email_pair_recipientless",
    occurredAt: newerAt
  });
  const paired = await deliveryStore.getInvoiceDeliverySummary({ ownerId, invoiceId });
  assert.equal(paired?.sendCount, 2);
  assert.equal(paired?.sentAt, newerAt);
  assert.equal(paired?.sentToEmail, null);

  // Mirror control: recipientless first, a named acceptance second —
  // the pair lands on the named operation, complete.
  const mirrorOwnerId = "slice0-p2-evidence-pair-mirror";
  const mirrorInvoiceId = randomUUID();
  await deliveryStore.appendInvoiceDeliveryEvent({
    eventId: "evt-p2-mirror-recipientless",
    ownerId: mirrorOwnerId,
    invoiceId: mirrorInvoiceId,
    attemptId: "attempt-p2-mirror-recipientless",
    kind: "send_recorded",
    mode: "provider",
    provider: "resend",
    outcome: "accepted",
    providerMessageId: "email_mirror_recipientless",
    occurredAt: acceptedAt
  });
  const mirrorFirst = await deliveryStore.getInvoiceDeliverySummary({
    ownerId: mirrorOwnerId,
    invoiceId: mirrorInvoiceId
  });
  assert.equal(mirrorFirst?.sentAt, acceptedAt);
  assert.equal(mirrorFirst?.sentToEmail, null);
  const mirrorReservation = await deliveryStore.reserveInvoiceDeliveryClaim({
    ownerId: mirrorOwnerId,
    invoiceId: mirrorInvoiceId,
    recipientEmail: "pair-a@example.com",
    basePurpose: "resend",
    purpose: "resend_1",
    authorizedRevision: 0
  });
  if (mirrorReservation.outcome !== "reserved") throw new Error("expected reservation");
  const mirrorClaim = mirrorReservation.claim;
  await deliveryStore.beginInvoiceDeliveryDispatch({
    ownerId: mirrorOwnerId,
    claimId: mirrorClaim.claimId,
    generation: mirrorClaim.generation,
    trackingToken: randomUUID()
  });
  await deliveryStore.recordInvoiceDeliveryClaimOutcome({
    ownerId: mirrorOwnerId,
    claimId: mirrorClaim.claimId,
    generation: mirrorClaim.generation,
    outcome: "accepted",
    mode: "provider",
    provider: "resend",
    providerMessageId: "email_mirror_a",
    occurredAt: newerAt
  });
  const mirror = await deliveryStore.getInvoiceDeliverySummary({
    ownerId: mirrorOwnerId,
    invoiceId: mirrorInvoiceId
  });
  assert.equal(mirror?.sendCount, 2);
  assert.equal(mirror?.sentAt, newerAt);
  assert.equal(mirror?.sentToEmail, "pair-a@example.com");
});
