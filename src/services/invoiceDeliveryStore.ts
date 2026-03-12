import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const configuredStorePath = process.env.INVOICE_DELIVERY_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/invoice-delivery.json");
const storeDir = path.dirname(storeFilePath);

const DeliveryEntrySchema = z.object({
  invoiceId: z.string().uuid(),
  ownerId: z.string().min(1),
  recipientEmail: z.string().email(),
  sentAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  trackingToken: z.string().min(8).optional(),
  mode: z.enum(["record_only", "provider"]).default("record_only"),
  provider: z.enum(["none", "resend"]).default("none"),
  providerMessageId: z.string().min(1).optional(),
  sendCount: z.number().int().nonnegative().default(1),
  openCount: z.number().int().nonnegative().default(0)
});

const DeliveryStoreSchema = z.object({
  entries: z.array(DeliveryEntrySchema).default([])
});

export const DeliverySummarySchema = z.object({
  recipientEmail: z.string().email(),
  sentAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  mode: z.enum(["record_only", "provider"]).default("record_only"),
  provider: z.enum(["none", "resend"]).default("none"),
  providerMessageId: z.string().min(1).optional(),
  sendCount: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  status: z.enum(["sent", "opened"])
});

type DeliveryStore = z.infer<typeof DeliveryStoreSchema>;
type DeliveryEntry = z.infer<typeof DeliveryEntrySchema>;
export type DeliverySummary = z.infer<typeof DeliverySummarySchema>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function recordInvoiceDeliverySend(input: {
  ownerId: string;
  invoiceId: string;
  recipientEmail: string;
  trackingToken?: string;
  mode?: "record_only" | "provider";
  provider?: "none" | "resend";
  providerMessageId?: string;
}): Promise<DeliverySummary> {
  return withMutationLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const normalizedEmail = input.recipientEmail.trim().toLowerCase();
    const existingIndex = store.entries.findIndex(
      (entry) => entry.ownerId === input.ownerId && entry.invoiceId === input.invoiceId
    );
    if (existingIndex === -1) {
      store.entries.push(
        DeliveryEntrySchema.parse({
          ownerId: input.ownerId,
          invoiceId: input.invoiceId,
          recipientEmail: normalizedEmail,
          sentAt: now,
          trackingToken: input.trackingToken,
          mode: input.mode ?? "record_only",
          provider: input.provider ?? "none",
          providerMessageId: input.providerMessageId,
          sendCount: 1,
          openCount: 0
        })
      );
    } else {
      const existing = store.entries[existingIndex];
      store.entries[existingIndex] = DeliveryEntrySchema.parse({
        ...existing,
        recipientEmail: normalizedEmail,
        sentAt: now,
        trackingToken: input.trackingToken ?? existing.trackingToken,
        mode: input.mode ?? existing.mode ?? "record_only",
        provider: input.provider ?? existing.provider ?? "none",
        providerMessageId: input.providerMessageId ?? existing.providerMessageId,
        sendCount: (existing.sendCount ?? 0) + 1
      });
    }
    await writeStore(store);
    const entry = store.entries.find(
      (candidate) => candidate.ownerId === input.ownerId && candidate.invoiceId === input.invoiceId
    );
    if (!entry) {
      throw new Error("Unable to store invoice delivery state.");
    }
    return toSummary(entry);
  });
}

export async function markInvoiceDeliveryOpened(input: {
  ownerId: string;
  invoiceId: string;
}): Promise<DeliverySummary> {
  return withMutationLock(async () => {
    const store = await readStore();
    const index = store.entries.findIndex(
      (entry) => entry.ownerId === input.ownerId && entry.invoiceId === input.invoiceId
    );
    if (index === -1) {
      throw new Error("No delivery record found for this invoice.");
    }
    const now = new Date().toISOString();
    const existing = store.entries[index];
    store.entries[index] = DeliveryEntrySchema.parse({
      ...existing,
      openedAt: existing.openedAt || now,
      openCount: (existing.openCount ?? 0) + 1
    });
    await writeStore(store);
    return toSummary(store.entries[index]);
  });
}

export async function markInvoiceDeliveryOpenedByTrackingToken(input: {
  invoiceId: string;
  trackingToken: string;
}): Promise<DeliverySummary | null> {
  return withMutationLock(async () => {
    const store = await readStore();
    const index = store.entries.findIndex(
      (entry) => entry.invoiceId === input.invoiceId && entry.trackingToken === input.trackingToken
    );
    if (index === -1) {
      return null;
    }
    const now = new Date().toISOString();
    const existing = store.entries[index];
    store.entries[index] = DeliveryEntrySchema.parse({
      ...existing,
      openedAt: existing.openedAt || now,
      openCount: (existing.openCount ?? 0) + 1
    });
    await writeStore(store);
    return toSummary(store.entries[index]);
  });
}

export async function getInvoiceDeliverySummary(input: {
  ownerId: string;
  invoiceId: string;
}): Promise<DeliverySummary | null> {
  const store = await readStore();
  const entry = store.entries.find(
    (candidate) => candidate.ownerId === input.ownerId && candidate.invoiceId === input.invoiceId
  );
  return entry ? toSummary(entry) : null;
}

export async function getInvoiceDeliverySummariesByInvoiceIds(input: {
  ownerId: string;
  invoiceIds: string[];
}): Promise<Record<string, DeliverySummary>> {
  const invoiceIdSet = new Set(input.invoiceIds);
  if (invoiceIdSet.size === 0) {
    return {};
  }
  const store = await readStore();
  return store.entries.reduce<Record<string, DeliverySummary>>((result, entry) => {
    if (entry.ownerId !== input.ownerId || !invoiceIdSet.has(entry.invoiceId)) {
      return result;
    }
    result[entry.invoiceId] = toSummary(entry);
    return result;
  }, {});
}

export async function getInvoiceDeliveryStoreSummary(): Promise<{
  entryCount: number;
  sentCount: number;
  openedCount: number;
  providerSendCount: number;
  recordOnlyCount: number;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
}> {
  const store = await readStore();
  let lastSentAt: string | null = null;
  let lastOpenedAt: string | null = null;
  return store.entries.reduce(
    (summary, entry) => {
      summary.entryCount += 1;
      summary.sentCount += entry.sendCount ?? 0;
      summary.openedCount += entry.openCount ?? 0;
      if ((entry.mode ?? "record_only") === "provider") {
        summary.providerSendCount += entry.sendCount ?? 0;
      } else {
        summary.recordOnlyCount += entry.sendCount ?? 0;
      }
      if (!lastSentAt || Date.parse(entry.sentAt) > Date.parse(lastSentAt)) {
        lastSentAt = entry.sentAt;
      }
      if (entry.openedAt && (!lastOpenedAt || Date.parse(entry.openedAt) > Date.parse(lastOpenedAt))) {
        lastOpenedAt = entry.openedAt;
      }
      summary.lastSentAt = lastSentAt;
      summary.lastOpenedAt = lastOpenedAt;
      return summary;
    },
    {
      entryCount: 0,
      sentCount: 0,
      openedCount: 0,
      providerSendCount: 0,
      recordOnlyCount: 0,
      lastSentAt: null as string | null,
      lastOpenedAt: null as string | null
    }
  );
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

function toSummary(entry: DeliveryEntry): DeliverySummary {
  return DeliverySummarySchema.parse({
    recipientEmail: entry.recipientEmail,
    sentAt: entry.sentAt,
    openedAt: entry.openedAt,
    mode: entry.mode ?? "record_only",
    provider: entry.provider ?? "none",
    providerMessageId: entry.providerMessageId,
    sendCount: entry.sendCount ?? 0,
    openCount: entry.openCount ?? 0,
    status: entry.openedAt ? "opened" : "sent"
  });
}

async function readStore(): Promise<DeliveryStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return DeliveryStoreSchema.parse(parsed);
}

async function writeStore(store: DeliveryStore): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(store, null, 2);
  await fs.writeFile(tempPath, `${content}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(
      storeFilePath,
      JSON.stringify(
        {
          entries: []
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }
}
