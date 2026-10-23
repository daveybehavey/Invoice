import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  decideInvoiceStatusTransition,
  type InvoiceStatusTransitionPurpose
} from "./invoiceDeliveryPolicy.js";
import {
  InvoiceListItem,
  InvoiceListItemSchema,
  RecentClientContextItem,
  RecentClientContextItemSchema,
  SavedInvoice,
  SavedInvoiceSchema,
  SavedInvoiceStatus
} from "../models/invoice.js";
import { invoiceSharePackIsBlocked } from "./invoiceSendGate.js";
import {
  applyMonetaryEditInvalidation,
  computeMonetaryFingerprint,
  reconcilePaidStatusAfterSave,
  prepareCreatedInvoicePaymentState,
  sanitizeDuplicatedInvoicePaymentState,
  settleStripePaymentOnInvoice,
  type StripeSettlementInput,
  type StripeSettlementResult
} from "./invoicePaymentSettlement.js";

/** A transform applied to the freshly stored invoice inside the store's
 * serialization. It must compute the next state from the invoice it is
 * given — never from a snapshot read before the lock. */
export type SavedInvoiceMutation = (invoice: SavedInvoice) => SavedInvoice;

const configuredStorePath = process.env.INVOICE_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/saved-invoices.json");
const storeDir = path.dirname(storeFilePath);

const SavedInvoiceCollectionSchema = z.object({
  invoices: z.array(SavedInvoiceSchema).default([])
});

type SavedInvoiceCollection = z.infer<typeof SavedInvoiceCollectionSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

export function getSavedInvoiceStoreFilePath(): string {
  return storeFilePath;
}

export async function getSavedInvoiceStoreSummary(): Promise<{
  filePath: string;
  invoiceCount: number;
  ownerCount: number;
  deletedCount: number;
}> {
  const collection = await readCollection({ createIfMissing: false });
  const owners = new Set(collection.invoices.map((invoice) => invoice.ownerId));
  const deletedCount = collection.invoices.reduce(
    (count, invoice) => (invoice.status === "deleted" ? count + 1 : count),
    0
  );
  return {
    filePath: storeFilePath,
    invoiceCount: collection.invoices.length,
    ownerCount: owners.size,
    deletedCount
  };
}

export async function saveInvoiceDocument(input: {
  ownerId: string;
  invoiceId?: string;
  sourceType: SavedInvoice["sourceType"];
  invoiceData: SavedInvoice["invoiceData"];
}): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const now = new Date().toISOString();

    if (input.invoiceId) {
      const invoiceIndex = collection.invoices.findIndex(
        (invoice) => invoice.invoiceId === input.invoiceId && invoice.ownerId === input.ownerId
      );
      if (invoiceIndex === -1) {
        throw new Error(`Invoice "${input.invoiceId}" was not found.`);
      }

      const existing = collection.invoices[invoiceIndex];
      // Server-owned payment state (link state, provider payment records,
      // monetary revision) is merged against the freshly stored invoice
      // here, inside the mutation lock — a client save can never overwrite
      // a settlement that landed after the client's snapshot was taken.
      const updatedFinishedInvoice = applyMonetaryEditInvalidation({
        existing: existing.invoiceData.finishedInvoice,
        incoming: input.invoiceData.finishedInvoice,
        nowIso: now,
        existingStatus: existing.status
      });
      const updatedInvoice = SavedInvoiceSchema.parse({
        ...existing,
        sourceType: input.sourceType,
        // The paid status is derived from the merged records here,
        // inside the same serialized mutation: a positive exact balance
        // reopens a paid invoice, and records that exactly cover the
        // total pay a draft/sent one. The fingerprint comparison is the
        // same one that drives link supersession.
        status: reconcilePaidStatusAfterSave(
          existing.status,
          updatedFinishedInvoice,
          computeMonetaryFingerprint(existing.invoiceData.finishedInvoice) !==
            computeMonetaryFingerprint(updatedFinishedInvoice)
        ),
        invoiceData: {
          ...input.invoiceData,
          finishedInvoice: updatedFinishedInvoice
        },
        updatedAt: now
      });

      collection.invoices[invoiceIndex] = updatedInvoice;
      await writeCollection(collection);
      return updatedInvoice;
    }

    const createdFinishedInvoice = prepareCreatedInvoicePaymentState(input.invoiceData.finishedInvoice);
    const newInvoice = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
      // The created status is derived from the prepared payment state,
      // not hardcoded: a create whose records exactly cover a positive
      // total is born paid; anything else starts as a draft. Estimates
      // never derive a payment status (the reconciler excludes them).
      status: reconcilePaidStatusAfterSave("draft", createdFinishedInvoice, false),
      sourceType: input.sourceType,
      invoiceData: {
        ...input.invoiceData,
        // Server-owned payment state is server-owned at creation too:
        // link state, unmatched payments, and the monetary revision start
        // empty/initialized, and payload payment records are manual-only —
        // and validated: at create every payload record is a changed
        // record, so an over-total or fractional-cent record throws here,
        // before the write, and the create persists nothing. The prepared
        // document's balanceDue is the record-derived value, never the
        // payload's.
        finishedInvoice: createdFinishedInvoice
      }
    });

    collection.invoices.push(newInvoice);
    await writeCollection(collection);
    return newInvoice;
  });
}

/**
 * Atomically settle a provider payment against a saved invoice. Runs inside
 * the store's mutation lock, so the dedupe check, binding verification,
 * payment record, balance, link state, and status are committed together —
 * a replayed or racing webhook cannot double-apply.
 */
export async function settleStripeInvoicePayment(
  input: StripeSettlementInput
): Promise<StripeSettlementResult> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (invoice) => invoice.invoiceId === input.invoiceId && invoice.ownerId === input.ownerId
    );
    if (invoiceIndex === -1) {
      return { outcome: "not_found" as const };
    }

    const existing = collection.invoices[invoiceIndex];
    const result = settleStripePaymentOnInvoice({ invoice: existing, settlement: input });
    if (!result.changed) {
      return { outcome: result.outcome, reason: result.reason, invoice: existing };
    }

    const updatedInvoice = SavedInvoiceSchema.parse({
      ...result.invoice,
      updatedAt: new Date().toISOString()
    });
    collection.invoices[invoiceIndex] = updatedInvoice;
    await writeCollection(collection);
    return { outcome: result.outcome, reason: result.reason, invoice: updatedInvoice };
  });
}

/**
 * Apply a transform to a saved invoice inside the store's mutation lock:
 * the transform reads the current stored invoice and its result is written
 * back in the same critical section, so concurrent writers (settlements,
 * saves, manual payments, link creation) serialize instead of overwriting
 * each other with stale snapshots.
 */
export async function mutateSavedInvoice(input: {
  invoiceId: string;
  ownerId: string;
  mutate: SavedInvoiceMutation;
}): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (invoice) => invoice.invoiceId === input.invoiceId && invoice.ownerId === input.ownerId
    );
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${input.invoiceId}" was not found.`);
    }

    const existing = collection.invoices[invoiceIndex];
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...input.mutate(existing),
      updatedAt: new Date().toISOString()
    });
    collection.invoices[invoiceIndex] = updatedInvoice;
    await writeCollection(collection);
    return updatedInvoice;
  });
}

export async function listSavedInvoiceMetadata(
  includeDeleted = false,
  ownerId = "local-default"
): Promise<InvoiceListItem[]> {
  const collection = await readCollection();
  const visibleInvoices = includeDeleted
    ? collection.invoices.filter((invoice) => invoice.ownerId === ownerId)
    : collection.invoices.filter((invoice) => invoice.ownerId === ownerId && invoice.status !== "deleted");
  return visibleInvoices
    .map((invoice) =>
      InvoiceListItemSchema.parse({
        invoiceId: invoice.invoiceId,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        status: invoice.status,
        sourceType: invoice.sourceType,
        documentType: invoice.invoiceData.finishedInvoice.documentType ?? "invoice",
        invoiceNumber:
          invoice.invoiceData.finishedInvoice.invoiceNumber ?? invoice.invoiceData.structuredInvoice.invoiceNumber,
        customerName:
          invoice.invoiceData.finishedInvoice.customerName ?? invoice.invoiceData.structuredInvoice.customerName,
        total: invoice.invoiceData.finishedInvoice.total,
        balanceDue: invoice.invoiceData.finishedInvoice.balanceDue,
        dueDate: invoice.invoiceData.finishedInvoice.dueDate ?? invoice.invoiceData.structuredInvoice.dueDate,
        paymentLinkUrl: invoice.invoiceData.finishedInvoice.paymentLinkUrl,
        paymentRecords: invoice.invoiceData.finishedInvoice.paymentRecords ?? [],
        sendBlocked: invoiceSharePackIsBlocked({
          finishedInvoice: invoice.invoiceData.finishedInvoice,
          sourceNote: invoice.invoiceData.sourceNote
        })
      })
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRecentClientContext(
  clientName: string,
  limit = 2,
  ownerId = "local-default"
): Promise<RecentClientContextItem[]> {
  const normalizedClientName = normalizeClientName(clientName);
  if (!normalizedClientName) {
    return [];
  }
  const collection = await readCollection();
  return collection.invoices
    .filter((invoice) => invoice.ownerId === ownerId && invoice.status !== "deleted")
    .filter(
      (invoice) =>
        normalizeClientName(invoice.invoiceData.finishedInvoice.customerName) === normalizedClientName
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 5)))
    .map((invoice) =>
      RecentClientContextItemSchema.parse({
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceData.finishedInvoice.invoiceNumber,
        updatedAt: invoice.updatedAt,
        servicePeriodStart: invoice.invoiceData.finishedInvoice.servicePeriodStart,
        servicePeriodEnd: invoice.invoiceData.finishedInvoice.servicePeriodEnd,
        total: invoice.invoiceData.finishedInvoice.total,
        notes: invoice.invoiceData.finishedInvoice.notes,
        lineItemDescriptions: (invoice.invoiceData.finishedInvoice.lineItems ?? [])
          .map((lineItem) => lineItem.description?.trim())
          .filter((description): description is string => Boolean(description))
          .slice(0, 4)
      })
    );
}

export async function getSavedInvoiceById(
  invoiceId: string,
  ownerId = "local-default"
): Promise<SavedInvoice> {
  const collection = await readCollection();
  const invoice = collection.invoices.find((item) => item.invoiceId === invoiceId && item.ownerId === ownerId);
  if (!invoice) {
    throw new Error(`Invoice "${invoiceId}" was not found.`);
  }

  return invoice;
}

export async function getSavedInvoiceByPortalToken(
  invoiceId: string,
  portalAccessToken: string
): Promise<SavedInvoice | null> {
  const normalizedToken = portalAccessToken.trim();
  if (!normalizedToken) {
    return null;
  }
  const collection = await readCollection();
  const invoice = collection.invoices.find(
    (item) =>
      item.invoiceId === invoiceId &&
      item.status !== "deleted" &&
      item.invoiceData.finishedInvoice.portalAccessToken === normalizedToken
  );
  return invoice ?? null;
}

export async function duplicateSavedInvoice(
  invoiceId: string,
  ownerId = "local-default"
): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoice = collection.invoices.find((item) => item.invoiceId === invoiceId && item.ownerId === ownerId);
    if (!invoice) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }

    const now = new Date().toISOString();
    const duplicatedInvoice = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
      ownerId,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      sourceType: invoice.sourceType,
      invoiceData: {
        ...invoice.invoiceData,
        // A duplicate has earned no payments and minted no links: its
        // payment state starts sanitized, exactly as at creation, with
        // the full total as its balance. Copying the source's payment
        // state verbatim would also copy an active link whose Stripe
        // metadata names the ORIGINAL invoice.
        finishedInvoice: sanitizeDuplicatedInvoicePaymentState(invoice.invoiceData.finishedInvoice)
      }
    });

    collection.invoices.push(duplicatedInvoice);
    await writeCollection(collection);
    return duplicatedInvoice;
  });
}

export async function updateSavedInvoiceStatus(
  invoiceId: string,
  status: SavedInvoiceStatus,
  ownerId = "local-default",
  purpose: InvoiceStatusTransitionPurpose = "lifecycle"
): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (item) => item.invoiceId === invoiceId && item.ownerId === ownerId
    );
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }

    const existing = collection.invoices[invoiceIndex];
    const now = new Date().toISOString();
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...existing,
      invoiceData: applyStatusToInvoiceData(existing, status, purpose),
      status,
      updatedAt: now,
      previousStatus:
        status === "deleted"
          ? existing.status === "deleted"
            ? existing.previousStatus
            : existing.status
          : undefined,
      deletedAt: status === "deleted" ? now : undefined
    });

    collection.invoices[invoiceIndex] = updatedInvoice;
    await writeCollection(collection);
    return updatedInvoice;
  });
}

/**
 * Slice 0 delivery completion (design invariants 1, 3, 4, 6): apply the
 * guarded delivery transition to the FRESH record reread under the
 * mutation lock — never to a caller-held snapshot. `draft → sent`
 * only while the monetary revision still matches the revision the send
 * claim authorized; `sent` is a no-op; `paid`/`deleted` return
 * unchanged with money, payment records, links, and revision intact.
 * `transitioned` reports whether this call performed the status write.
 */
export async function completeSavedInvoiceDelivery(input: {
  invoiceId: string;
  ownerId?: string;
  authorizedRevision: number;
}): Promise<{ invoice: SavedInvoice; transitioned: boolean }> {
  const ownerId = input.ownerId ?? "local-default";
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (item) => item.invoiceId === input.invoiceId && item.ownerId === ownerId
    );
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${input.invoiceId}" was not found.`);
    }

    const existing = collection.invoices[invoiceIndex]!;
    const decision = decideInvoiceStatusTransition({
      currentStatus: existing.status,
      requestedStatus: "sent",
      purpose: "delivery"
    });
    if (
      !decision.transition ||
      existing.invoiceData.finishedInvoice.monetaryRevision !== input.authorizedRevision
    ) {
      return { invoice: existing, transitioned: false };
    }

    const now = new Date().toISOString();
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...existing,
      invoiceData: applyStatusToInvoiceData(existing, "sent", "delivery"),
      status: "sent",
      updatedAt: now
    });
    collection.invoices[invoiceIndex] = updatedInvoice;
    await writeCollection(collection);
    return { invoice: updatedInvoice, transitioned: true };
  });
}

function applyStatusToInvoiceData(
  existing: SavedInvoice,
  status: SavedInvoiceStatus,
  purpose: InvoiceStatusTransitionPurpose = "lifecycle"
): SavedInvoice["invoiceData"] {
  // Slice 0: money effects are decided by the shared transition policy
  // (invoiceDeliveryPolicy.ts) so both stores behave identically.
  // Delivery transitions never touch money; entering `deleted` never
  // touches money (audit item 2: delete → restore can no longer
  // resurrect a settled balance); the lifecycle mark-paid zeroing and
  // the manual leaving-paid restore are otherwise preserved.
  const decision = decideInvoiceStatusTransition({
    currentStatus: existing.status,
    requestedStatus: status,
    purpose
  });
  const finishedInvoice = { ...existing.invoiceData.finishedInvoice };
  if (decision.zeroBalanceDue) {
    finishedInvoice.balanceDue = 0;
  } else if (decision.restoreTotalOnLeavePaid) {
    const balanceDue = Number(finishedInvoice.balanceDue);
    const total = Number(finishedInvoice.total);
    if (Number.isFinite(total) && (!Number.isFinite(balanceDue) || balanceDue <= 0)) {
      finishedInvoice.balanceDue = total;
    }
  }
  return {
    ...existing.invoiceData,
    finishedInvoice
  };
}

export async function restoreSavedInvoice(
  invoiceId: string,
  ownerId = "local-default"
): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (item) => item.invoiceId === invoiceId && item.ownerId === ownerId
    );
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }
    const existing = collection.invoices[invoiceIndex];
    if (existing.status !== "deleted") {
      return existing;
    }
    const now = new Date().toISOString();
    const restoredStatus = existing.previousStatus ?? "draft";
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...existing,
      status: restoredStatus,
      updatedAt: now,
      previousStatus: undefined,
      deletedAt: undefined
    });
    collection.invoices[invoiceIndex] = updatedInvoice;
    await writeCollection(collection);
    return updatedInvoice;
  });
}

export async function deleteSavedInvoice(invoiceId: string, ownerId = "local-default"): Promise<void> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex(
      (item) => item.invoiceId === invoiceId && item.ownerId === ownerId
    );
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }
    collection.invoices.splice(invoiceIndex, 1);
    await writeCollection(collection);
  });
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );

  return runMutation;
}

async function readCollection(options: { createIfMissing?: boolean } = {}): Promise<SavedInvoiceCollection> {
  const shouldCreateIfMissing = options.createIfMissing !== false;
  if (shouldCreateIfMissing) {
    await ensureStoreExists();
  }
  try {
    const raw = await fs.readFile(storeFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return SavedInvoiceCollectionSchema.parse(parsed);
  } catch (error) {
    if (!shouldCreateIfMissing && isFileMissingError(error)) {
      return SavedInvoiceCollectionSchema.parse({ invoices: [] });
    }
    throw error;
  }
}

async function writeCollection(collection: SavedInvoiceCollection): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(collection, null, 2);
  await fs.writeFile(tempPath, `${content}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

function normalizeClientName(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });

  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  }
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
