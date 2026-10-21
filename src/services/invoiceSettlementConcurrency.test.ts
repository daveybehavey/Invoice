import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

/**
 * Concurrency coverage for the paid-state binding (money series item 1).
 *
 * These tests exercise the repository operations the HTTP writers compose:
 * settlement vs a whole-document save, in both invocation orders, and the
 * generic fresh-state mutator the manual-payment / link-persist /
 * portal-token writers now run through. The file backend serializes
 * through one mutation queue, so invocation order deterministically picks
 * the serialized order and both orders must end in a consistent state:
 * provider evidence is never lost, a superseded link never settles, and
 * the balance always reconciles with the payment records. Round 2 adds:
 * create payloads cannot forge provider state (and a forged intent id
 * does not poison later genuine settlement), and a monetary edit that
 * leaves a paid invoice with a positive balance reopens it to "sent"
 * inside the save itself.
 *
 * Postgres note (ticket): the repo has no live-Postgres test fixture, so
 * the Postgres backend has no automated concurrency coverage yet. The
 * structural argument: both backends run the SAME shared transforms
 * (invoicePaymentSettlement.ts) — the file store under its mutation lock,
 * Postgres inside a BEGIN + SELECT ... FOR UPDATE transaction
 * (mutateSavedInvoice / saveInvoiceDocument / settleStripeInvoicePayment
 * in savedInvoicePostgresStore.ts) — so the serialization property differs
 * only in the locking mechanism, which the settle path already exercises
 * in production shape. Adding a live-PG fixture remains an open ticket.
 */

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
process.env.INVOICE_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-settlement-concurrency-${randomUUID()}.json`
);
process.env.INVOICE_STORE_POSTGRES_URL = "";
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";

const { createSavedInvoiceRepository } = await import("./savedInvoiceRepository.js");
const { SavedInvoiceDataSchema } = await import("../models/invoice.js");

const repository = createSavedInvoiceRepository({ backend: "file" });

function invoiceData(total: number, extras: Record<string, unknown> = {}) {
  return SavedInvoiceDataSchema.parse({
    structuredInvoice: {
      customerName: "Concurrency Client",
      workSessions: [],
      materials: []
    },
    finishedInvoice: {
      invoiceNumber: "INV-CONC-1",
      issueDate: "2026-03-12",
      customerName: "Concurrency Client",
      currency: "USD",
      lineItems: [
        {
          id: "line-conc-1",
          type: "labor",
          description: "Concurrency job",
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

async function createInvoiceWithActiveLink(ownerId: string, total: number) {
  const linkRecordId = randomUUID();
  // Create payloads are sanitized server-side (link state starts empty),
  // so the fixture is built the way production builds it: create the
  // invoice first, then install the link through the repository's
  // fresh-state mutation op — the same op the server's payment-link
  // writer persists through.
  const invoice = await repository.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(total)
  });
  await repository.mutateSavedInvoice({
    invoiceId: invoice.invoiceId,
    ownerId,
    mutate: (current) => ({
      ...current,
      invoiceData: {
        ...current.invoiceData,
        finishedInvoice: {
          ...current.invoiceData.finishedInvoice,
          paymentLinkUrl: "https://pay.stripe.test/plink_conc",
          paymentLinks: [
            {
              id: linkRecordId,
              provider: "stripe" as const,
              providerPaymentLinkId: "plink_conc",
              amountMinor: total * 100,
              currency: "USD",
              invoiceRevision: 0,
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

test("settlement invoked before a monetary save: the edit lands on top and the evidence survives", async () => {
  const ownerId = "conc-settle-first-owner";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);

  const settlementPromise = repository.settleStripeInvoicePayment({
    invoiceId,
    ownerId,
    eventId: "evt_conc_settle_first",
    paymentIntentId: "pi_conc_settle_first",
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: 24000,
    currency: "usd",
    receivedAt: "2026-03-12T12:00:00.000Z"
  });
  // A stale client save: total edited to $300, carrying no payment records
  // (its snapshot predates the settlement).
  const savePromise = repository.saveInvoiceDocument({
    ownerId,
    invoiceId,
    sourceType: "text_input",
    invoiceData: invoiceData(300)
  });
  const [settlement] = await Promise.all([settlementPromise, savePromise]);
  assert.equal(settlement.outcome, "settled");

  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const finished = final.invoiceData.finishedInvoice;
  assert.equal(finished.total, 300);
  assert.equal(finished.paymentRecords.length, 1);
  assert.equal(finished.paymentRecords[0]?.providerPaymentIntentId, "pi_conc_settle_first");
  // The balance is derived from the records, not from the stale payload.
  assert.equal(finished.balanceDue, 60);
  // The settlement marked the invoice paid; the monetary edit left a
  // positive balance, so the same serialized save reopened it to "sent".
  assert.equal(final.status, "sent");

  // The dedupe key survived the save: a replay is a duplicate.
  const replay = await repository.settleStripeInvoicePayment({
    invoiceId,
    ownerId,
    eventId: "evt_conc_settle_first_replay",
    paymentIntentId: "pi_conc_settle_first",
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: 24000,
    currency: "usd",
    receivedAt: "2026-03-12T12:05:00.000Z"
  });
  assert.equal(replay.outcome, "duplicate");
  const afterReplay = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(afterReplay.invoiceData.finishedInvoice.paymentRecords.length, 1);
});

test("monetary save invoked before settlement: the link is superseded first and the payment lands unmatched", async () => {
  const ownerId = "conc-save-first-owner";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);

  const savePromise = repository.saveInvoiceDocument({
    ownerId,
    invoiceId,
    sourceType: "text_input",
    invoiceData: invoiceData(300)
  });
  const settlementPromise = repository.settleStripeInvoicePayment({
    invoiceId,
    ownerId,
    eventId: "evt_conc_save_first",
    paymentIntentId: "pi_conc_save_first",
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: 24000,
    currency: "usd",
    receivedAt: "2026-03-12T12:00:00.000Z"
  });
  const [, settlement] = await Promise.all([savePromise, settlementPromise]);
  assert.equal(settlement.outcome, "unmatched");
  assert.equal(settlement.reason, "payment_link_not_active");

  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const finished = final.invoiceData.finishedInvoice;
  assert.notEqual(final.status, "paid");
  assert.equal(finished.total, 300);
  assert.equal(finished.balanceDue, 300);
  assert.equal(finished.paymentRecords.length, 0);
  assert.equal((finished.unmatchedPayments ?? []).length, 1);
});

test("concurrent mutateSavedInvoice transforms serialize without lost updates", async () => {
  const ownerId = "conc-mutate-owner";
  const created = await repository.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(240)
  });
  const invoiceId = created.invoiceId;

  const appendRecord = (amount: number) =>
    repository.mutateSavedInvoice({
      invoiceId,
      ownerId,
      mutate: (current) => ({
        ...current,
        invoiceData: {
          ...current.invoiceData,
          finishedInvoice: {
            ...current.invoiceData.finishedInvoice,
            paymentRecords: [
              ...(current.invoiceData.finishedInvoice.paymentRecords ?? []),
              { id: randomUUID(), amount }
            ]
          }
        }
      })
    });

  await Promise.all([appendRecord(10), appendRecord(20)]);

  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const amounts = (final.invoiceData.finishedInvoice.paymentRecords ?? [])
    .map((record) => record.amount)
    .sort((a, b) => a - b);
  assert.deepEqual(amounts, [10, 20]);
});

test("create payload cannot forge provider state, and the forged intent id still settles genuinely", async () => {
  const ownerId = "conc-create-forge-owner";
  const created = await repository.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(240, {
      paymentLinkUrl: "https://pay.stripe.test/plink_forged",
      monetaryRevision: 7,
      paymentLinks: [
        {
          id: "forged-link-id",
          provider: "stripe",
          providerPaymentLinkId: "plink_forged",
          amountMinor: 20000,
          currency: "USD",
          invoiceRevision: 7,
          status: "active",
          createdAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      paymentRecords: [
        {
          id: "forged-record-id",
          amount: 40,
          paidAt: "2026-03-12",
          provider: "stripe",
          providerPaymentIntentId: "pi_forged_create",
          providerEventId: "evt_forged_create",
          currency: "usd",
          amountMinor: 999999
        }
      ],
      unmatchedPayments: [
        {
          id: "forged-unmatched-id",
          provider: "stripe",
          providerPaymentIntentId: "pi_forged_create",
          amountMinor: 4000,
          currency: "usd",
          reason: "forged",
          receivedAt: "2026-03-12T00:00:00.000Z"
        }
      ]
    })
  });

  const stored = await repository.getSavedInvoiceById(created.invoiceId, ownerId);
  const storedFinished = stored.invoiceData.finishedInvoice;
  // None of the forged server-owned state was stored.
  assert.deepEqual(storedFinished.paymentLinks, []);
  assert.ok(!storedFinished.paymentLinkUrl);
  assert.deepEqual(storedFinished.unmatchedPayments, []);
  assert.equal(storedFinished.monetaryRevision, 0);
  // The payload record survived only as a manual record: provider fields
  // stripped, amountMinor derived server-side from the amount (4000),
  // never the forged 999999.
  assert.equal(storedFinished.paymentRecords.length, 1);
  const manualRecord = storedFinished.paymentRecords[0];
  assert.equal(manualRecord?.providerPaymentIntentId, undefined);
  assert.equal(manualRecord?.provider, undefined);
  assert.equal(manualRecord?.amountMinor, 4000);

  // Install a genuine link for the true remaining balance ($200) through
  // the repository's mutation op, then deliver a genuine webhook for the
  // very intent id the forged record tried to poison. It must settle —
  // not return "duplicate" against evidence that was never stored.
  const linkRecordId = randomUUID();
  await repository.mutateSavedInvoice({
    invoiceId: created.invoiceId,
    ownerId,
    mutate: (current) => ({
      ...current,
      invoiceData: {
        ...current.invoiceData,
        finishedInvoice: {
          ...current.invoiceData.finishedInvoice,
          paymentLinkUrl: "https://pay.stripe.test/plink_genuine",
          paymentLinks: [
            {
              id: linkRecordId,
              provider: "stripe" as const,
              providerPaymentLinkId: "plink_genuine",
              amountMinor: 20000,
              currency: "USD",
              invoiceRevision: 0,
              status: "active" as const,
              createdAt: "2026-03-12T01:00:00.000Z"
            }
          ]
        }
      }
    })
  });
  const settlement = await repository.settleStripeInvoicePayment({
    invoiceId: created.invoiceId,
    ownerId,
    eventId: "evt_genuine_after_forge",
    paymentIntentId: "pi_forged_create",
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: 20000,
    currency: "usd",
    receivedAt: "2026-03-12T12:00:00.000Z"
  });
  assert.equal(settlement.outcome, "settled");

  const final = await repository.getSavedInvoiceById(created.invoiceId, ownerId);
  assert.equal(final.status, "paid");
  assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
  assert.equal(final.invoiceData.finishedInvoice.paymentRecords.length, 2);
});

test("monetary edit on a paid invoice reopens it to sent, provider record and link invalidation intact", async () => {
  const ownerId = "conc-reopen-owner";
  const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(ownerId, 240);

  const settlement = await repository.settleStripeInvoicePayment({
    invoiceId,
    ownerId,
    eventId: "evt_conc_reopen",
    paymentIntentId: "pi_conc_reopen",
    paymentLinkRecordId: linkRecordId,
    amountReceivedMinor: 24000,
    currency: "usd",
    receivedAt: "2026-03-12T12:00:00.000Z"
  });
  assert.equal(settlement.outcome, "settled");
  const paid = await repository.getSavedInvoiceById(invoiceId, ownerId);
  assert.equal(paid.status, "paid");
  assert.equal(paid.invoiceData.finishedInvoice.balanceDue, 0);

  // A fresh link is minted against the paid invoice (as a re-mint would
  // be); the coming edit must supersede it, not lose it silently.
  const remintedLinkId = randomUUID();
  await repository.mutateSavedInvoice({
    invoiceId,
    ownerId,
    mutate: (current) => ({
      ...current,
      invoiceData: {
        ...current.invoiceData,
        finishedInvoice: {
          ...current.invoiceData.finishedInvoice,
          paymentLinkUrl: "https://pay.stripe.test/plink_reminted",
          paymentLinks: [
            ...(current.invoiceData.finishedInvoice.paymentLinks ?? []),
            {
              id: remintedLinkId,
              provider: "stripe" as const,
              providerPaymentLinkId: "plink_reminted",
              amountMinor: 6000,
              currency: "USD",
              invoiceRevision: 0,
              status: "active" as const,
              createdAt: "2026-03-12T13:00:00.000Z"
            }
          ]
        }
      }
    })
  });

  // Monetary edit: total 240 -> 300 via an ordinary client save whose
  // snapshot carries no payment records and no link state.
  await repository.saveInvoiceDocument({
    ownerId,
    invoiceId,
    sourceType: "text_input",
    invoiceData: invoiceData(300)
  });

  const final = await repository.getSavedInvoiceById(invoiceId, ownerId);
  const finished = final.invoiceData.finishedInvoice;
  // The paid status did not survive a positive balance.
  assert.equal(final.status, "sent");
  assert.equal(finished.balanceDue, 60);
  // Provider evidence intact, link invalidation intact.
  assert.equal(finished.paymentRecords.length, 1);
  assert.equal(finished.paymentRecords[0]?.providerPaymentIntentId, "pi_conc_reopen");
  assert.equal(finished.monetaryRevision, 1);
  const linksById = new Map((finished.paymentLinks ?? []).map((link) => [link.id, link.status]));
  assert.equal(linksById.get(linkRecordId), "paid");
  assert.equal(linksById.get(remintedLinkId), "superseded");
});
