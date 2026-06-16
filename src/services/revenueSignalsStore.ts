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
  "first_draft_started",
  "invoice_generated",
  "invoice_saved",
  "first_invoice_saved",
  "second_invoice_saved",
  "invoice_sent",
  "first_invoice_sent",
  "reminder_sent",
  "payment_link_created",
  "first_payment_link_added",
  "first_invoice_reopened",
  "invoice_again_started",
  "service_memory_reused",
  "service_memory_saved",
  "client_memory_reused",
  "recurring_schedule_set",
  "checkout_started",
  "billing_plan_viewed",
  "billing_plan_selected",
  "landing_invoice_sample_opened",
  "app_opened",
  "first_app_opened",
  "billing_manage_opened",
  "google_play_verification_failed",
  "pro_unlock_verified",
  "lifetime_unlock_verified",
  "account_signed_in",
  "email_sign_in_requested",
  "email_sign_in_link_sent",
  "email_sign_in_link_previewed",
  "email_sign_in_request_failed",
  "email_sign_in_link_opened",
  "email_sign_in_link_verified",
  "email_sign_in_link_failed",
  "scratchpad_note_saved",
  "scratchpad_voice_note_transcribed",
  "scratchpad_note_used_in_invoice",
  "billie_workspace_instruction_submitted"
]);
const KNOWN_REVENUE_SIGNAL_NAMES = RevenueSignalNameSchema.options;
const KnownRevenueSignalNameSet = new Set<string>(KNOWN_REVENUE_SIGNAL_NAMES);

export const RevenueAttributionSchema = z.object({
  gclid: z.string().trim().max(220).optional(),
  utmSource: z.string().trim().max(160).optional(),
  utmMedium: z.string().trim().max(160).optional(),
  utmCampaign: z.string().trim().max(160).optional(),
  utmTerm: z.string().trim().max(160).optional(),
  utmContent: z.string().trim().max(160).optional(),
  landingPath: z.string().trim().max(220).optional(),
  capturedAt: z.string().trim().max(40).optional()
});

const PersistedRevenueSignalEventSchema = z.object({
  at: z.string(),
  event: z.string().trim().min(1).max(120),
  ownerKey: z.string().min(1),
  source: z.string().default("server"),
  attribution: RevenueAttributionSchema.optional()
});

const OwnerSignalStatsSchema = z.object({
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  firstTouchAttribution: RevenueAttributionSchema.optional(),
  firstDraftStarted: z.number().int().nonnegative().default(0),
  invoiceGenerated: z.number().int().nonnegative().default(0),
  invoiceSaved: z.number().int().nonnegative().default(0),
  firstInvoiceSaved: z.number().int().nonnegative().default(0),
  secondInvoiceSaved: z.boolean().default(false),
  invoiceSent: z.number().int().nonnegative().default(0),
  firstInvoiceSent: z.number().int().nonnegative().default(0),
  reminderSent: z.number().int().nonnegative().default(0),
  paymentLinkCreated: z.number().int().nonnegative().default(0),
  firstPaymentLinkAdded: z.number().int().nonnegative().default(0),
  firstInvoiceReopened: z.number().int().nonnegative().default(0),
  invoiceAgainStarted: z.number().int().nonnegative().default(0),
  serviceMemoryReused: z.number().int().nonnegative().default(0),
  serviceMemorySaved: z.number().int().nonnegative().default(0),
  clientMemoryReused: z.number().int().nonnegative().default(0),
  recurringScheduleSet: z.number().int().nonnegative().default(0),
  checkoutStarted: z.number().int().nonnegative().default(0),
  billingPlanViewed: z.number().int().nonnegative().default(0),
  billingPlanSelected: z.number().int().nonnegative().default(0),
  landingInvoiceSampleOpened: z.number().int().nonnegative().default(0),
  appOpened: z.number().int().nonnegative().default(0),
  firstAppOpened: z.number().int().nonnegative().default(0),
  billingManageOpened: z.number().int().nonnegative().default(0),
  googlePlayVerificationFailed: z.number().int().nonnegative().default(0),
  proUnlockVerified: z.number().int().nonnegative().default(0),
  lifetimeUnlockVerified: z.number().int().nonnegative().default(0),
  accountSignedIn: z.number().int().nonnegative().default(0),
  emailSignInRequested: z.number().int().nonnegative().default(0),
  emailSignInLinkSent: z.number().int().nonnegative().default(0),
  emailSignInLinkPreviewed: z.number().int().nonnegative().default(0),
  emailSignInRequestFailed: z.number().int().nonnegative().default(0),
  emailSignInLinkOpened: z.number().int().nonnegative().default(0),
  emailSignInLinkVerified: z.number().int().nonnegative().default(0),
  emailSignInLinkFailed: z.number().int().nonnegative().default(0),
  scratchpadNoteSaved: z.number().int().nonnegative().default(0),
  scratchpadVoiceNoteTranscribed: z.number().int().nonnegative().default(0),
  scratchpadNoteUsedInInvoice: z.number().int().nonnegative().default(0),
  billieWorkspaceInstructionSubmitted: z.number().int().nonnegative().default(0)
});

const RevenueSignalsSnapshotSchema = z.object({
  totalEvents: z.number().int().nonnegative().default(0),
  byEvent: z.record(z.string().trim().min(1), z.number().int().nonnegative()).default({}),
  owners: z.record(z.string(), OwnerSignalStatsSchema).default({}),
  events: z.array(PersistedRevenueSignalEventSchema).default([]),
  recentEvents: z.array(PersistedRevenueSignalEventSchema).default([]),
  updatedAt: z.string().default("")
});

type RevenueSignalName = z.infer<typeof RevenueSignalNameSchema>;
export type RevenueAttribution = z.infer<typeof RevenueAttributionSchema>;
type RevenueSignalsSnapshot = z.infer<typeof RevenueSignalsSnapshotSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

const EMPTY_REVENUE_SIGNALS_SNAPSHOT: RevenueSignalsSnapshot = {
  totalEvents: 0,
  byEvent: {},
  owners: {},
  events: [],
  recentEvents: [],
  updatedAt: ""
};

export async function trackRevenueSignal(input: {
  event: RevenueSignalName;
  ownerId: string;
  source?: string;
  attribution?: RevenueAttribution;
}): Promise<void> {
  const event = RevenueSignalNameSchema.parse(input.event);
  const ownerKey = hashOwnerId(input.ownerId);
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "server";
  const attribution = input.attribution ? RevenueAttributionSchema.parse(input.attribution) : undefined;
  await mutateSnapshot(async (snapshot) => {
    const now = new Date().toISOString();
    const ownerStats =
      snapshot.owners[ownerKey] ??
      OwnerSignalStatsSchema.parse({
        firstSeenAt: now,
        lastSeenAt: now
      });

    ownerStats.lastSeenAt = now;
    if (attribution && !ownerStats.firstTouchAttribution) {
      ownerStats.firstTouchAttribution = attribution;
    }
    applyOwnerEvent(ownerStats, event);
    snapshot.owners[ownerKey] = ownerStats;
    snapshot.totalEvents += 1;
    snapshot.byEvent[event] = (snapshot.byEvent[event] ?? 0) + 1;
    snapshot.events = [
      ...(Array.isArray(snapshot.events) ? snapshot.events : []),
      {
        at: now,
        event,
        ownerKey,
        source,
        ...(attribution ? { attribution } : {})
      }
    ];
    snapshot.recentEvents = [
      ...snapshot.recentEvents,
      {
        at: now,
        event,
        ownerKey,
        source,
        ...(attribution ? { attribution } : {})
      }
    ].slice(-MAX_RECENT_EVENTS);
    snapshot.updatedAt = now;
  });
}

export async function getRevenueSignalsSnapshot(): Promise<
  RevenueSignalsSnapshot & {
    source: string;
    unknownEvents: {
      names: string[];
      totalEvents: number;
      recentEvents: number;
    };
    summary: {
      ownerCount: number;
      attributedOwners: number;
      draftStartedOwners: number;
      activatedOwners: number;
      firstInvoiceSavedOwners: number;
      secondInvoiceOwners: number;
      sentInvoiceOwners: number;
      firstInvoiceSentOwners: number;
      reminderOwners: number;
      paymentLinkOwners: number;
      firstPaymentLinkOwners: number;
      reopenedInvoiceOwners: number;
      repeatInvoiceOwners: number;
      serviceMemoryOwners: number;
      serviceMemorySavedOwners: number;
      clientMemoryOwners: number;
      recurringScheduleOwners: number;
      checkoutOwners: number;
      billingPlanViewedOwners: number;
      billingPlanSelectedOwners: number;
      landingInvoiceSampleOpenedOwners: number;
      appOpenedOwners: number;
      firstAppOpenedOwners: number;
      billingManageOpenedOwners: number;
      googlePlayVerificationFailedOwners: number;
      proUnlockVerifiedOwners: number;
      lifetimeUnlockVerifiedOwners: number;
      accountSignedInOwners: number;
      emailSignInRequestedOwners: number;
      emailSignInLinkSentOwners: number;
      emailSignInLinkPreviewedOwners: number;
      emailSignInRequestFailedOwners: number;
      emailSignInLinkOpenedOwners: number;
      emailSignInLinkVerifiedOwners: number;
      emailSignInLinkFailedOwners: number;
      scratchpadOwners: number;
      scratchpadVoiceOwners: number;
      scratchpadInvoiceOwners: number;
      billieWorkspaceOwners: number;
    };
  }
> {
  const snapshot = await readSnapshot();
  const owners = Object.values(snapshot.owners);
  const byEventEntries = Object.entries(snapshot.byEvent ?? {});
  const unknownByEventEntries = byEventEntries.filter(([eventName]) => !KnownRevenueSignalNameSet.has(eventName));
  const unknownEventNames = unknownByEventEntries.map(([eventName]) => eventName).sort();
  const unknownEventTotal = unknownByEventEntries.reduce((total, [, count]) => total + Number(count || 0), 0);
  const unknownRecentEvents = (Array.isArray(snapshot.recentEvents) ? snapshot.recentEvents : []).filter(
    (event) => !KnownRevenueSignalNameSet.has(event.event)
  ).length;
  return {
    ...snapshot,
    source:
      runtimeStateBackend === "postgres"
        ? `postgres:app_runtime_snapshots/${REVENUE_SIGNALS_SNAPSHOT_KEY}`
        : storeFilePath,
    unknownEvents: {
      names: unknownEventNames,
      totalEvents: unknownEventTotal,
      recentEvents: unknownRecentEvents
    },
    summary: {
      ownerCount: owners.length,
      attributedOwners: owners.filter((owner) => owner.firstTouchAttribution).length,
      draftStartedOwners: owners.filter((owner) => owner.firstDraftStarted > 0).length,
      activatedOwners: owners.filter((owner) => owner.invoiceSaved > 0).length,
      firstInvoiceSavedOwners: owners.filter((owner) => owner.firstInvoiceSaved > 0).length,
      secondInvoiceOwners: owners.filter((owner) => owner.secondInvoiceSaved).length,
      sentInvoiceOwners: owners.filter((owner) => owner.invoiceSent > 0).length,
      firstInvoiceSentOwners: owners.filter((owner) => owner.firstInvoiceSent > 0).length,
      reminderOwners: owners.filter((owner) => owner.reminderSent > 0).length,
      paymentLinkOwners: owners.filter((owner) => owner.paymentLinkCreated > 0).length,
      firstPaymentLinkOwners: owners.filter((owner) => owner.firstPaymentLinkAdded > 0).length,
      reopenedInvoiceOwners: owners.filter((owner) => owner.firstInvoiceReopened > 0).length,
      repeatInvoiceOwners: owners.filter((owner) => owner.invoiceAgainStarted > 0).length,
      serviceMemoryOwners: owners.filter((owner) => owner.serviceMemoryReused > 0).length,
      serviceMemorySavedOwners: owners.filter((owner) => owner.serviceMemorySaved > 0).length,
      clientMemoryOwners: owners.filter((owner) => owner.clientMemoryReused > 0).length,
      recurringScheduleOwners: owners.filter((owner) => owner.recurringScheduleSet > 0).length,
      checkoutOwners: owners.filter((owner) => owner.checkoutStarted > 0).length,
      billingPlanViewedOwners: owners.filter((owner) => owner.billingPlanViewed > 0).length,
      billingPlanSelectedOwners: owners.filter((owner) => owner.billingPlanSelected > 0).length,
      landingInvoiceSampleOpenedOwners: owners.filter((owner) => owner.landingInvoiceSampleOpened > 0).length,
      appOpenedOwners: owners.filter((owner) => owner.appOpened > 0).length,
      firstAppOpenedOwners: owners.filter((owner) => owner.firstAppOpened > 0).length,
      billingManageOpenedOwners: owners.filter((owner) => owner.billingManageOpened > 0).length,
      googlePlayVerificationFailedOwners: owners.filter((owner) => owner.googlePlayVerificationFailed > 0).length,
      proUnlockVerifiedOwners: owners.filter((owner) => owner.proUnlockVerified > 0).length,
      lifetimeUnlockVerifiedOwners: owners.filter((owner) => owner.lifetimeUnlockVerified > 0).length,
      accountSignedInOwners: owners.filter((owner) => owner.accountSignedIn > 0).length,
      emailSignInRequestedOwners: owners.filter((owner) => owner.emailSignInRequested > 0).length,
      emailSignInLinkSentOwners: owners.filter((owner) => owner.emailSignInLinkSent > 0).length,
      emailSignInLinkPreviewedOwners: owners.filter((owner) => owner.emailSignInLinkPreviewed > 0).length,
      emailSignInRequestFailedOwners: owners.filter((owner) => owner.emailSignInRequestFailed > 0).length,
      emailSignInLinkOpenedOwners: owners.filter((owner) => owner.emailSignInLinkOpened > 0).length,
      emailSignInLinkVerifiedOwners: owners.filter((owner) => owner.emailSignInLinkVerified > 0).length,
      emailSignInLinkFailedOwners: owners.filter((owner) => owner.emailSignInLinkFailed > 0).length,
      scratchpadOwners: owners.filter((owner) => owner.scratchpadNoteSaved > 0).length,
      scratchpadVoiceOwners: owners.filter((owner) => owner.scratchpadVoiceNoteTranscribed > 0).length,
      scratchpadInvoiceOwners: owners.filter((owner) => owner.scratchpadNoteUsedInInvoice > 0).length,
      billieWorkspaceOwners: owners.filter((owner) => owner.billieWorkspaceInstructionSubmitted > 0).length
    }
  };
}

function applyOwnerEvent(ownerStats: z.infer<typeof OwnerSignalStatsSchema>, event: RevenueSignalName) {
  if (event === "first_draft_started") {
    ownerStats.firstDraftStarted += 1;
  } else if (event === "invoice_generated") {
    ownerStats.invoiceGenerated += 1;
  } else if (event === "invoice_saved") {
    ownerStats.invoiceSaved += 1;
  } else if (event === "first_invoice_saved") {
    ownerStats.firstInvoiceSaved += 1;
  } else if (event === "second_invoice_saved") {
    ownerStats.secondInvoiceSaved = true;
  } else if (event === "invoice_sent") {
    ownerStats.invoiceSent += 1;
  } else if (event === "first_invoice_sent") {
    ownerStats.firstInvoiceSent += 1;
  } else if (event === "reminder_sent") {
    ownerStats.reminderSent += 1;
  } else if (event === "payment_link_created") {
    ownerStats.paymentLinkCreated += 1;
  } else if (event === "first_payment_link_added") {
    ownerStats.firstPaymentLinkAdded += 1;
  } else if (event === "first_invoice_reopened") {
    ownerStats.firstInvoiceReopened += 1;
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
  } else if (event === "billing_plan_viewed") {
    ownerStats.billingPlanViewed += 1;
  } else if (event === "billing_plan_selected") {
    ownerStats.billingPlanSelected += 1;
  } else if (event === "landing_invoice_sample_opened") {
    ownerStats.landingInvoiceSampleOpened += 1;
  } else if (event === "app_opened") {
    ownerStats.appOpened += 1;
  } else if (event === "first_app_opened") {
    ownerStats.firstAppOpened += 1;
  } else if (event === "billing_manage_opened") {
    ownerStats.billingManageOpened += 1;
  } else if (event === "google_play_verification_failed") {
    ownerStats.googlePlayVerificationFailed += 1;
  } else if (event === "pro_unlock_verified") {
    ownerStats.proUnlockVerified += 1;
  } else if (event === "lifetime_unlock_verified") {
    ownerStats.lifetimeUnlockVerified += 1;
  } else if (event === "account_signed_in") {
    ownerStats.accountSignedIn += 1;
  } else if (event === "email_sign_in_requested") {
    ownerStats.emailSignInRequested += 1;
  } else if (event === "email_sign_in_link_sent") {
    ownerStats.emailSignInLinkSent += 1;
  } else if (event === "email_sign_in_link_previewed") {
    ownerStats.emailSignInLinkPreviewed += 1;
  } else if (event === "email_sign_in_request_failed") {
    ownerStats.emailSignInRequestFailed += 1;
  } else if (event === "email_sign_in_link_opened") {
    ownerStats.emailSignInLinkOpened += 1;
  } else if (event === "email_sign_in_link_verified") {
    ownerStats.emailSignInLinkVerified += 1;
  } else if (event === "email_sign_in_link_failed") {
    ownerStats.emailSignInLinkFailed += 1;
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
    if (errorCode === "EPERM" || errorCode === "EACCES" || errorCode === "EBUSY" || errorCode === "ENOENT") {
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
