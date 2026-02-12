import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  InvoiceListItem,
  InvoiceListItemSchema,
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

export async function saveInvoiceDocument(input: {
  invoiceId?: string;
  sourceType: SavedInvoice["sourceType"];
  invoiceData: SavedInvoice["invoiceData"];
}): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const now = new Date().toISOString();

    if (input.invoiceId) {
      const invoiceIndex = collection.invoices.findIndex((invoice) => invoice.invoiceId === input.invoiceId);
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

export async function listSavedInvoiceMetadata(includeDeleted = false): Promise<InvoiceListItem[]> {
  const collection = await readCollection();
  const visibleInvoices = includeDeleted
    ? collection.invoices
    : collection.invoices.filter((invoice) => invoice.status !== "deleted");
  return visibleInvoices
    .map((invoice) =>
      InvoiceListItemSchema.parse({
        invoiceId: invoice.invoiceId,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        status: invoice.status,
        sourceType: invoice.sourceType,
        invoiceNumber:
          invoice.invoiceData.finishedInvoice.invoiceNumber ?? invoice.invoiceData.structuredInvoice.invoiceNumber,
        total: invoice.invoiceData.finishedInvoice.total
      })
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSavedInvoiceById(invoiceId: string): Promise<SavedInvoice> {
  const collection = await readCollection();
  const invoice = collection.invoices.find((item) => item.invoiceId === invoiceId);
  if (!invoice) {
    throw new Error(`Invoice "${invoiceId}" was not found.`);
  }

  return invoice;
}

export async function duplicateSavedInvoice(invoiceId: string): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoice = collection.invoices.find((item) => item.invoiceId === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }

    const now = new Date().toISOString();
    const duplicatedInvoice = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
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

export async function updateSavedInvoiceStatus(invoiceId: string, status: SavedInvoiceStatus): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex((item) => item.invoiceId === invoiceId);
    if (invoiceIndex === -1) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }

    const existing = collection.invoices[invoiceIndex];
    const now = new Date().toISOString();
    const updatedInvoice = SavedInvoiceSchema.parse({
      ...existing,
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

export async function restoreSavedInvoice(invoiceId: string): Promise<SavedInvoice> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex((item) => item.invoiceId === invoiceId);
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

export async function deleteSavedInvoice(invoiceId: string): Promise<void> {
  return withMutationLock(async () => {
    const collection = await readCollection();
    const invoiceIndex = collection.invoices.findIndex((item) => item.invoiceId === invoiceId);
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

async function readCollection(): Promise<SavedInvoiceCollection> {
  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return SavedInvoiceCollectionSchema.parse(parsed);
}

async function writeCollection(collection: SavedInvoiceCollection): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(collection, null, 2);
  await fs.writeFile(tempPath, `${content}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });

  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  }
}
