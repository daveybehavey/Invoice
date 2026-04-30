import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const configuredStorePath = process.env.REVENUE_SIGNALS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/revenue-signals.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const REVENUE_SIGNALS_SNAPSHOT_KEY = "revenue_signals";
const MAX_RECENT_EVENTS = 100;

export const RevenueSignalNameSchema = z.enum([
  "invoice_generated",
  "invoice_saved",
  "second_invoice_saved",
  "invoice_sent",
  "reminder_sent",
  "payment_link_created",
  "invoice_again_started",
  "service_memory_reused",
  "service_memory_saved",
  "client_memory_reused",
  "recurring_schedule_set",
  "checkout_started",
  "account_signed_in",
  "scratchpad_note_saved",
  "scratchpad_voice_note_transcribed",
  "scratchpad_note_used_in_invoice",
  "billie_workspace_instruction_submitted"
]);

const RevenueSignalEventSchema = z.object({
  at: z.string(),
  event: RevenueSignalNameSchema,
  ownerKey: z.string().min(1),
  source: z.string().default("server")
});

const OwnerSignalStatsSchema = z.object({
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  invoiceGenerated: z.number().int().nonnegative().default(0),
  invoiceSaved: z.number().int().nonnegative().default(0),
  secondInvoiceSaved: z.boolean().default(false),
  invoiceSent: z.number().int().nonnegative().default(0),
  reminderSent: z.number().int().nonnegative().default(0),
  paymentLinkCreated: z.number().int().nonnegative().default(0),
  invoiceAgainStarted: z.number().int().nonnegative().default(0),
  serviceMemoryReused: z.number().int().nonnegative().default(0),
  serviceMemorySaved: z.number().int().nonnegative().default(0),
  clientMemoryReused: z.number().int().nonnegative().default(0),
  recurringScheduleSet: z.number().int().nonnegative().default(0),
  checkoutStarted: z.number().int().nonnegative().default(0),
  accountSignedIn: z.number().int().nonnegative().default(0),
  scratchpadNoteSaved: z.number().int().nonnegative().default(0),
  scratchpadVoiceNoteTranscribed: z.number().int().nonnegative().default(0),
  scratchpadNoteUsedInInvoice: z.number().int().nonnegative().default(0),
  billieWorkspaceInstructionSubmitted: z.number().int().nonnegative().default(0)
});

const RevenueSignalsSnapshotSchema = z.object({
  totalEvents: z.number().int().nonnegative().default(0),
  byEvent: z.record(RevenueSignalNameSchema, z.number().int().nonnegative()).default({}),
  owners: z.record(z.string(), OwnerSignalStatsSchema).default({}),
  recentEvents: z.array(RevenueSignalEventSchema).default([]),
  updatedAt: z.string().default("")
});

type RevenueSignalName = z.infer<typeof RevenueSignalNameSchema>;
type RevenueSignalsSnapshot = z.infer<typeof RevenueSignalsSnapshotSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

const EMPTY_REVENUE_SIGNALS_SNAPSHOT: RevenueSignalsSnapshot = {
  totalEvents: 0,
  byEvent: {},
  owners: {},
  recentEvents: [],
  updatedAt: ""
};

export async function trackRevenueSignal(input: {
  event: RevenueSignalName;
  ownerId: string;
  source?: string;
}): Promise<void> {
  const event = RevenueSignalNameSchema.parse(input.event);
  const ownerKey = hashOwnerId(input.ownerId);
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "server";
  await mutateSnapshot(async (snapshot) => {
    const now = new Date().toISOString();
    const ownerStats =
      snapshot.owners[ownerKey] ??
      OwnerSignalStatsSchema.parse({
        firstSeenAt: now,
        lastSeenAt: now
      });

    ownerStats.lastSeenAt = now;
    applyOwnerEvent(ownerStats, event);
    snapshot.owners[ownerKey] = ownerStats;
    snapshot.totalEvents += 1;
    snapshot.byEvent[event] = (snapshot.byEvent[event] ?? 0) + 1;
    snapshot.recentEvents = [
      ...snapshot.recentEvents,
      {
        at: now,
        event,
        ownerKey,
        source
      }
    ].slice(-MAX_RECENT_EVENTS);
    snapshot.updatedAt = now;
  });
}

export async function getRevenueSignalsSnapshot(): Promise<
  RevenueSignalsSnapshot & {
    source: string;
    summary: {
      ownerCount: number;
      activatedOwners: number;
      secondInvoiceOwners: number;
      sentInvoiceOwners: number;
      reminderOwners: number;
      paymentLinkOwners: number;
      repeatInvoiceOwners: number;
      serviceMemoryOwners: number;
      serviceMemorySavedOwners: number;
      clientMemoryOwners: number;
      recurringScheduleOwners: number;
      checkoutOwners: number;
      scratchpadOwners: number;
      scratchpadVoiceOwners: number;
      scratchpadInvoiceOwners: number;
      billieWorkspaceOwners: number;
    };
  }
> {
  const snapshot = await readSnapshot();
  const owners = Object.values(snapshot.owners);
  return {
    ...snapshot,
    source:
      runtimeStateBackend === "postgres"
        ? `postgres:app_runtime_snapshots/${REVENUE_SIGNALS_SNAPSHOT_KEY}`
        : storeFilePath,
    summary: {
      ownerCount: owners.length,
      activatedOwners: owners.filter((owner) => owner.invoiceSaved > 0).length,
      secondInvoiceOwners: owners.filter((owner) => owner.secondInvoiceSaved).length,
      sentInvoiceOwners: owners.filter((owner) => owner.invoiceSent > 0).length,
      reminderOwners: owners.filter((owner) => owner.reminderSent > 0).length,
      paymentLinkOwners: owners.filter((owner) => owner.paymentLinkCreated > 0).length,
      repeatInvoiceOwners: owners.filter((owner) => owner.invoiceAgainStarted > 0).length,
      serviceMemoryOwners: owners.filter((owner) => owner.serviceMemoryReused > 0).length,
      serviceMemorySavedOwners: owners.filter((owner) => owner.serviceMemorySaved > 0).length,
      clientMemoryOwners: owners.filter((owner) => owner.clientMemoryReused > 0).length,
      recurringScheduleOwners: owners.filter((owner) => owner.recurringScheduleSet > 0).length,
      checkoutOwners: owners.filter((owner) => owner.checkoutStarted > 0).length,
      scratchpadOwners: owners.filter((owner) => owner.scratchpadNoteSaved > 0).length,
      scratchpadVoiceOwners: owners.filter((owner) => owner.scratchpadVoiceNoteTranscribed > 0).length,
      scratchpadInvoiceOwners: owners.filter((owner) => owner.scratchpadNoteUsedInInvoice > 0).length,
      billieWorkspaceOwners: owners.filter((owner) => owner.billieWorkspaceInstructionSubmitted > 0).length
    }
  };
}

function applyOwnerEvent(ownerStats: z.infer<typeof OwnerSignalStatsSchema>, event: RevenueSignalName) {
  if (event === "invoice_generated") {
    ownerStats.invoiceGenerated += 1;
  } else if (event === "invoice_saved") {
    ownerStats.invoiceSaved += 1;
  } else if (event === "second_invoice_saved") {
    ownerStats.secondInvoiceSaved = true;
  } else if (event === "invoice_sent") {
    ownerStats.invoiceSent += 1;
  } else if (event === "reminder_sent") {
    ownerStats.reminderSent += 1;
  } else if (event === "payment_link_created") {
    ownerStats.paymentLinkCreated += 1;
  } else if (event === "invoice_again_started") {
    ownerStats.invoiceAgainStarted += 1;
  } else if (event === "service_memory_reused") {
    ownerStats.serviceMemoryReused += 1;
  } else if (event === "service_memory_saved") {
    ownerStats.serviceMemorySaved += 1;
  } else if (event === "client_memory_reused") {
    ownerStats.clientMemoryReused += 1;
  } else if (event === "recurring_schedule_set") {
    ownerStats.recurringScheduleSet += 1;
  } else if (event === "checkout_started") {
    ownerStats.checkoutStarted += 1;
  } else if (event === "account_signed_in") {
    ownerStats.accountSignedIn += 1;
  } else if (event === "scratchpad_note_saved") {
    ownerStats.scratchpadNoteSaved += 1;
  } else if (event === "scratchpad_voice_note_transcribed") {
    ownerStats.scratchpadVoiceNoteTranscribed += 1;
  } else if (event === "scratchpad_note_used_in_invoice") {
    ownerStats.scratchpadNoteUsedInInvoice += 1;
  } else if (event === "billie_workspace_instruction_submitted") {
    ownerStats.billieWorkspaceInstructionSubmitted += 1;
  }
}

function hashOwnerId(ownerId: string): string {
  const normalized = typeof ownerId === "string" && ownerId.trim() ? ownerId.trim() : "anonymous";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<RevenueSignalsSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      REVENUE_SIGNALS_SNAPSHOT_KEY,
      RevenueSignalsSnapshotSchema,
      EMPTY_REVENUE_SIGNALS_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  return RevenueSignalsSnapshotSchema.parse(JSON.parse(raw));
}

async function writeSnapshot(snapshot: RevenueSignalsSnapshot): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, storeFilePath);
  } catch (error) {
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (errorCode === "EPERM" || errorCode === "EACCES" || errorCode === "EBUSY") {
      await fs.writeFile(storeFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      try {
        await fs.unlink(tempPath);
      } catch {
        // Best-effort cleanup only.
      }
      return;
    }
    throw error;
  }
}

async function mutateSnapshot(mutator: (snapshot: RevenueSignalsSnapshot) => void | Promise<void>): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      REVENUE_SIGNALS_SNAPSHOT_KEY,
      RevenueSignalsSnapshotSchema,
      EMPTY_REVENUE_SIGNALS_SNAPSHOT,
      async (current) => {
        const next = RevenueSignalsSnapshotSchema.parse(structuredClone(current));
        await mutator(next);
        return next;
      }
    );
    return;
  }

  await withMutationLock(async () => {
    const snapshot = await readSnapshot();
    await mutator(snapshot);
    await writeSnapshot(snapshot);
  });
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(`${storeFilePath}`, `${JSON.stringify(EMPTY_REVENUE_SIGNALS_SNAPSHOT, null, 2)}\n`, "utf8");
  }
}
