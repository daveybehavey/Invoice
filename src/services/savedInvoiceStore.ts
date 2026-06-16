import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  InvoiceListItem,
  InvoiceListItemSchema,
  RecentClientContextItem,
  RecentClientContextItemSchema,
  SavedInvoice,
  SavedInvoiceSchema,
  SavedInvoiceStatus
} from "../models/invoice.js";

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
      const updatedInvoice = SavedInvoiceSchema.parse({
        ...existing,
        sourceType: input.sourceType,
        invoiceData: input.invoiceData,
        updatedAt: now
      });

      collection.invoices[invoiceIndex] = updatedInvoice;
      await writeCollection(collection);
      return updatedInvoice;
    }

    const newInvoice = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      sourceType: input.sourceType,
      invoiceData: input.invoiceData
    });

    collection.invoices.push(newInvoice);
    await writeCollection(collection);
    return newInvoice;
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
        paymentLinkUrl: invoice.invoiceData.finishedInvoice.paymentLinkUrl
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
      invoiceData: invoice.invoiceData
    });

    collection.invoices.push(duplicatedInvoice);
    await writeCollection(collection);
    return duplicatedInvoice;
  });
}

export async function updateSavedInvoiceStatus(
  invoiceId: string,
  status: SavedInvoiceStatus,
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
    const now = new Date().toISOString();
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...existing,
      invoiceData: applyStatusToInvoiceData(existing, status),
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

function applyStatusToInvoiceData(
  existing: SavedInvoice,
  status: SavedInvoiceStatus
): SavedInvoice["invoiceData"] {
  const finishedInvoice = { ...existing.invoiceData.finishedInvoice };
  if (status === "paid") {
    finishedInvoice.balanceDue = 0;
  } else if (existing.status === "paid") {
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
