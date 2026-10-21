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
 * the balance always reconciles with the payment records.
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
  const invoice = await repository.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(total, {
      paymentLinkUrl: "https://pay.stripe.test/plink_conc",
      monetaryRevision: 0,
      paymentLinks: [
        {
          id: linkRecordId,
          provider: "stripe",
          providerPaymentLinkId: "plink_conc",
          amountMinor: total * 100,
          currency: "USD",
          invoiceRevision: 0,
          status: "active",
          createdAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      paymentRecords: [],
      unmatchedPayments: []
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
