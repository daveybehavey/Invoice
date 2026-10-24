import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import { Client } from "pg";
import {
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";
import { PostgresSavedInvoiceRepository } from "./savedInvoicePostgresStore.js";
import { settleStripePaymentOnInvoice } from "./invoicePaymentSettlement.js";
import { SavedInvoiceDataSchema, type SavedInvoice } from "../models/invoice.js";

/**
 * Slice 0 conformance round (Q3 + F2): REAL Postgres interleavings on
 * SEPARATE connections, replacing the rejected Q3-A paper amendment.
 *
 * This file is inert unless INVOICE_TEST_POSTGRES_URL points at a
 * live Postgres (the round ran it against a real PostgreSQL 18.4
 * server with a throwaway database). Every test below drives the
 * production repository/runtime-state code on its own pooled
 * connections while a barrier transaction on an independent raw
 * connection holds the row lock, so the interleavings are executed,
 * not narrated: the operation under test must visibly WAIT on the
 * lock and then read the barrier's committed state.
 */

const pgUrl = process.env.INVOICE_TEST_POSTGRES_URL ?? "";

function pgTest(name: string, fn: () => Promise<void>): void {
  test(
    name,
    { skip: pgUrl ? false : "INVOICE_TEST_POSTGRES_URL is not set" },
    fn
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function outcomeWithin<T>(
  promise: Promise<T>,
  ms: number
): Promise<"pending" | "settled"> {
  return Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const
    ),
    delay(ms).then(() => "pending" as const)
  ]);
}

async function connectRaw(): Promise<Client> {
  const client = new Client({ connectionString: pgUrl });
  await client.connect();
  return client;
}

// ---------------------------------------------------------------------
// F2: serialization exists BEFORE the absent snapshot row does
// ---------------------------------------------------------------------

const itemsSchema = z.object({
  items: z.array(z.string()).default([])
});

pgTest(
  "F2: first-use contention on an absent snapshot row serializes; a dispatched claim is preserved",
  async () => {
    const storeKey = `f2-first-use-${randomUUID()}`;
    process.env.INVOICE_STORE_POSTGRES_URL = pgUrl;

    let markAInside: () => void = () => {};
    const aInside = new Promise<void>((resolve) => {
      markAInside = resolve;
    });
    let releaseA: () => void = () => {};
    const aMayFinish = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    // Writer A appends a claim that has already dispatched (the
    // state whose loss F2 is about) but is held open mid-transaction.
    const aPromise = mutateRuntimeSnapshot(storeKey, itemsSchema, { items: [] }, async (current) => {
      markAInside();
      await aMayFinish;
      return { items: [...current.items, "claim-dispatched"] };
    });
    await aInside;

    // Writer B starts while A is in flight. Before the F2 fix, B's
    // transaction locked nothing (the row was absent), computed from
    // the empty fallback, and upserted after A committed — erasing
    // A's claim. With serialization established before the read, B
    // waits for A and then appends to A's committed snapshot.
    const bPromise = mutateRuntimeSnapshot(storeKey, itemsSchema, { items: [] }, async (current) => ({
      items: [...current.items, "claim-b"]
    }));
    assert.equal(
      await outcomeWithin(bPromise, 300),
      "pending",
      "second first-writer must wait for the first writer's transaction"
    );

    releaseA();
    await Promise.all([aPromise, bPromise]);

    const final = await readRuntimeSnapshot(storeKey, itemsSchema, { items: [] });
    assert.deepEqual([...final.items].sort(), ["claim-b", "claim-dispatched"]);
  }
);

pgTest("F2: sequential snapshot mutations accumulate under the lock", async () => {
  const storeKey = `f2-sequential-${randomUUID()}`;
  process.env.INVOICE_STORE_POSTGRES_URL = pgUrl;
  await mutateRuntimeSnapshot(storeKey, itemsSchema, { items: [] }, async (current) => ({
    items: [...current.items, "one"]
  }));
  await mutateRuntimeSnapshot(storeKey, itemsSchema, { items: [] }, async (current) => ({
    items: [...current.items, "two"]
  }));
  const final = await readRuntimeSnapshot(storeKey, itemsSchema, { items: [] });
  assert.deepEqual(final.items, ["one", "two"]);
});

// ---------------------------------------------------------------------
// Q3: settlement <-> completion interleavings on saved_invoices
// ---------------------------------------------------------------------

function invoiceData(total: number) {
  return SavedInvoiceDataSchema.parse({
    structuredInvoice: {
      customerName: "PG Interleave Client",
      workSessions: [],
      materials: []
    },
    finishedInvoice: {
      invoiceNumber: `PG-${randomUUID().slice(0, 8)}`,
      issueDate: "2026-03-12",
      customerName: "PG Interleave Client",
      currency: "USD",
      lineItems: [
        {
          id: "line-1",
          type: "labor",
          description: "PG interleave work",
          quantity: 1,
          unitPrice: total,
          amount: total
        }
      ],
      subtotal: total,
      total,
      balanceDue: total
    }
  });
}

async function createInvoiceWithActiveLink(
  repo: PostgresSavedInvoiceRepository,
  ownerId: string,
  total: number
): Promise<{ invoiceId: string; linkRecordId: string }> {
  const linkRecordId = randomUUID();
  const invoice = await repo.saveInvoiceDocument({
    ownerId,
    sourceType: "text_input",
    invoiceData: invoiceData(total)
  });
  await repo.mutateSavedInvoice({
    invoiceId: invoice.invoiceId,
    ownerId,
    mutate: (current) => ({
      ...current,
      invoiceData: {
        ...current.invoiceData,
        finishedInvoice: {
          ...current.invoiceData.finishedInvoice,
          paymentLinkUrl: "https://pay.stripe.test/plink_pg",
          paymentLinks: [
            {
              id: linkRecordId,
              provider: "stripe" as const,
              providerPaymentLinkId: "plink_pg",
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

async function lockInvoiceRow(client: Client, invoiceId: string): Promise<SavedInvoice> {
  await client.query("begin");
  const result = await client.query(
    "select invoice_id, owner_id, status, source_type, invoice_data, created_at, updated_at from saved_invoices where invoice_id = $1 for update",
    [invoiceId]
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0] as Record<string, unknown>;
  return {
    invoiceId: String(row.invoice_id),
    ownerId: String(row.owner_id),
    status: String(row.status) as SavedInvoice["status"],
    sourceType: String(row.source_type) as SavedInvoice["sourceType"],
    invoiceData: row.invoice_data as SavedInvoice["invoiceData"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

pgTest(
  "Q3: settlement waits while completion's transaction holds the row lock, then reads completion's committed state",
  async () => {
    const repo = new PostgresSavedInvoiceRepository(pgUrl);
    const ownerId = `pg-q3-settle-waits-${randomUUID()}`;
    const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(repo, ownerId, 240);

    // Barrier connection: performs completion's committed effect
    // (draft -> sent) inside its own still-open transaction.
    const barrier = await connectRaw();
    try {
      await lockInvoiceRow(barrier, invoiceId);
      await barrier.query("update saved_invoices set status = 'sent' where invoice_id = $1", [
        invoiceId
      ]);

      const settlePromise = repo.settleStripeInvoicePayment({
        invoiceId,
        ownerId,
        eventId: `evt_pg_${randomUUID()}`,
        paymentIntentId: `pi_pg_${randomUUID()}`,
        paymentLinkRecordId: linkRecordId,
        amountReceivedMinor: 24000,
        currency: "usd",
        receivedAt: "2026-03-12T12:00:00.000Z"
      });
      assert.equal(
        await outcomeWithin(settlePromise, 300),
        "pending",
        "settlement must wait on the row lock held by the other connection"
      );

      await barrier.query("commit");
      const settled = await settlePromise;
      assert.equal(settled.outcome, "settled");
      const final = await repo.getSavedInvoiceById(invoiceId, ownerId);
      assert.equal(final.status, "paid");
      assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
      assert.equal(final.invoiceData.finishedInvoice.paymentRecords?.length, 1);
    } finally {
      await barrier.end().catch(() => {});
    }
  }
);

pgTest(
  "Q3: completion waits while settlement's transaction holds the row lock, then reads settlement's committed state",
  async () => {
    const repo = new PostgresSavedInvoiceRepository(pgUrl);
    const ownerId = `pg-q3-complete-waits-${randomUUID()}`;
    const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(repo, ownerId, 240);
    const draft = await repo.getSavedInvoiceById(invoiceId, ownerId);
    const authorizedRevision = draft.invoiceData.finishedInvoice.monetaryRevision;

    // Barrier connection: computes settlement with the production
    // settlement function and holds its committed shape uncommitted.
    const barrier = await connectRaw();
    try {
      const locked = await lockInvoiceRow(barrier, invoiceId);
      const settledInvoice = settleStripePaymentOnInvoice({
        invoice: locked,
        settlement: {
          invoiceId,
          ownerId,
          eventId: `evt_pg_${randomUUID()}`,
          paymentIntentId: `pi_pg_${randomUUID()}`,
          paymentLinkRecordId: linkRecordId,
          amountReceivedMinor: 24000,
          currency: "usd",
          receivedAt: "2026-03-12T12:00:00.000Z"
        }
      }).invoice;
      await barrier.query(
        "update saved_invoices set status = $2, invoice_data = $3::jsonb where invoice_id = $1",
        [invoiceId, settledInvoice.status, JSON.stringify(settledInvoice.invoiceData)]
      );

      const completionPromise = repo.completeInvoiceDelivery({
        invoiceId,
        ownerId,
        authorizedRevision
      });
      assert.equal(
        await outcomeWithin(completionPromise, 300),
        "pending",
        "delivery completion must wait on the row lock held by the other connection"
      );

      await barrier.query("commit");
      const completion = await completionPromise;
      // Completion read settlement's committed state: paid is
      // preserved and never regressed to sent (invariant 5/4).
      assert.equal(completion.transitioned, false);
      assert.equal(completion.invoice.status, "paid");
      assert.equal(completion.invoice.invoiceData.finishedInvoice.balanceDue, 0);
      assert.equal(completion.invoice.invoiceData.finishedInvoice.paymentRecords?.length, 1);
    } finally {
      await barrier.end().catch(() => {});
    }
  }
);

pgTest(
  "Q3: a competing save built from a stale snapshot, overlapped with settlement, waits and cannot resurrect pre-settlement state",
  async () => {
    const repo = new PostgresSavedInvoiceRepository(pgUrl);
    const ownerId = `pg-q3-stale-save-${randomUUID()}`;
    const { invoiceId, linkRecordId } = await createInvoiceWithActiveLink(repo, ownerId, 180);

    // The competing writer's payload: a whole-record save built from
    // the pre-settlement snapshot (no payment record, full balance).
    const stale = await repo.getSavedInvoiceById(invoiceId, ownerId);

    // Recheck 4 (Q3, narrowed): the overlap is controlled, not
    // sequential. A barrier connection computes settlement with the
    // production settlement function and holds its committed shape
    // UNCOMMITTED under the row lock; the production save is then
    // started against that in-flight settlement. The save must WAIT
    // on the lock (its update path opens with SELECT … FOR UPDATE),
    // and once the barrier commits, the save's merge runs against
    // settlement's committed state — so the stale payload cannot
    // resurrect the pre-settlement money state it was built from.
    const barrier = await connectRaw();
    try {
      const locked = await lockInvoiceRow(barrier, invoiceId);
      const settledInvoice = settleStripePaymentOnInvoice({
        invoice: locked,
        settlement: {
          invoiceId,
          ownerId,
          eventId: `evt_pg_${randomUUID()}`,
          paymentIntentId: `pi_pg_${randomUUID()}`,
          paymentLinkRecordId: linkRecordId,
          amountReceivedMinor: 18000,
          currency: "usd",
          receivedAt: "2026-03-12T12:00:00.000Z"
        }
      }).invoice;
      await barrier.query(
        "update saved_invoices set status = $2, invoice_data = $3::jsonb where invoice_id = $1",
        [invoiceId, settledInvoice.status, JSON.stringify(settledInvoice.invoiceData)]
      );

      const savePromise = repo.saveInvoiceDocument({
        ownerId,
        invoiceId,
        sourceType: "text_input",
        invoiceData: stale.invoiceData
      });
      assert.equal(
        await outcomeWithin(savePromise, 300),
        "pending",
        "the production save must wait on the row lock held by the in-flight settlement"
      );

      await barrier.query("commit");
      const saved = await savePromise;
      // The save landed (it is the returned, merged document) AND
      // settlement's committed evidence survived it: paid status,
      // zero balance, the payment record intact.
      assert.equal(saved.status, "paid");
      assert.equal(saved.invoiceData.finishedInvoice.balanceDue, 0);
      assert.equal(saved.invoiceData.finishedInvoice.paymentRecords?.length, 1);

      const final = await repo.getSavedInvoiceById(invoiceId, ownerId);
      assert.equal(final.status, "paid");
      assert.equal(final.invoiceData.finishedInvoice.balanceDue, 0);
      assert.equal(final.invoiceData.finishedInvoice.paymentRecords?.length, 1);
    } finally {
      await barrier.end().catch(() => {});
    }
  }
);
