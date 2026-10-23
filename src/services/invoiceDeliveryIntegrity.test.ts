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
