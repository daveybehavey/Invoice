import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const BILLING_ENTITLEMENTS_SNAPSHOT_KEY = "billing_entitlements";
const configuredStorePath = process.env.STRIPE_ENTITLEMENTS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/stripe-entitlements.json");
const storeDir = path.dirname(storeFilePath);

// S93-3 item 2: subscription records carry reconciliation metadata.
// A record written before reconciliation existed has generation 0, no
// watermark, and an empty reconciliationState — it is legacy/unverified
// and non-granting until reconciled through the same verified path.
const CancellationTombstoneSchema = z.object({
  eventId: z.string(),
  eventCreated: z.number().int().nonnegative()
});

const SubscriptionRecordSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string().default(""),
  email: z.string().default(""),
  ownerId: z.string().default(""),
  userId: z.string().default(""),
  status: z.string().default(""),
  updatedAt: z.string().default(""),
  reconcileGeneration: z.number().int().nonnegative().default(0),
  lastEventCreated: z.number().int().nonnegative().default(0),
  reconciliationState: z.string().default(""),
  reconciledAt: z.string().default(""),
  cancellationTombstone: CancellationTombstoneSchema.nullable().default(null)
});

// Per-event receipts keyed by VERIFIED Stripe event ID. A receipt is the
// duplicate-delivery authority for subscription/checkout processing only;
// it is a separate namespace from invoice-payment settlement dedup.
const BillingEventReceiptSchema = z.object({
  eventId: z.string(),
  subscriptionId: z.string().default(""),
  eventType: z.string().default(""),
  eventCreated: z.number().int().nonnegative().default(0),
  disposition: z.string(),
  recordedAt: z.string().default("")
});

export type BillingEventReceipt = z.infer<typeof BillingEventReceiptSchema>;
export type SubscriptionReconciliationRecord = z.infer<typeof SubscriptionRecordSchema>;

const CustomerRecordSchema = z.object({
  customerId: z.string(),
  email: z.string().default(""),
  ownerId: z.string().default(""),
  userId: z.string().default(""),
  updatedAt: z.string().default("")
});

const BillingEntitlementsSnapshotSchema = z.object({
  updatedAt: z.string().default(""),
  customers: z.record(z.string(), CustomerRecordSchema).default({}),
  subscriptions: z.record(z.string(), SubscriptionRecordSchema).default({}),
  eventReceipts: z.record(z.string(), BillingEventReceiptSchema).default({})
});

type BillingEntitlementsSnapshot = z.infer<typeof BillingEntitlementsSnapshotSchema>;

export type BillingEntitlementsSummary = {
  updatedAt: string;
  customerCount: number;
  subscriptionCount: number;
  activeSubscriptionCount: number;
  missingIdentityCount: number;
  byStatus: Record<string, number>;
};

let mutationQueue: Promise<void> = Promise.resolve();
const EMPTY_BILLING_ENTITLEMENTS_SNAPSHOT: BillingEntitlementsSnapshot = {
  updatedAt: "",
  customers: {},
  subscriptions: {},
  eventReceipts: {}
};

export async function hasActiveStripeEntitlement(input: {
  ownerId?: string;
  userId?: string;
  email?: string;
}): Promise<boolean> {
  const snapshot = await readSnapshot();
  return hasActiveEntitlementInSnapshot(snapshot, input);
}

/** Resolve Stripe customer id from entitlements by authenticated opaque identity. */
export async function findBillingCustomerIdForOwner(input: {
  userId?: string;
  ownerId?: string;
}): Promise<string | null> {
  const snapshot = await readSnapshot();
  const userId = normalizeValue(input.userId);
  const ownerId = normalizeValue(input.ownerId);
  if (!userId && !ownerId) {
    return null;
  }

  for (const customer of Object.values(snapshot.customers)) {
    if (userId && customer.userId === userId && customer.customerId) {
      return customer.customerId;
    }
    if (ownerId && customer.ownerId === ownerId && customer.customerId) {
      return customer.customerId;
    }
  }

  for (const subscription of Object.values(snapshot.subscriptions)) {
    if (userId && subscription.userId === userId && subscription.customerId) {
      return subscription.customerId;
    }
    if (ownerId && subscription.ownerId === ownerId && subscription.customerId) {
      return subscription.customerId;
    }
  }

  return null;
}

// ---------------------------------------------------------------------
// S93-3 item 2: subscription-event reconciliation.
//
// Checkout completion is an identity/linkage signal and a reconciliation
// trigger, never proof of an active subscription. Both webhook handlers
// run ONE operation shape:
//   1. beginSubscriptionEventProcessing — a single atomic snapshot
//      mutation that dedups by verified event ID, applies the
//      cancellation tombstone and staleness rules, and (when retrieval
//      is needed) reserves a reconcile generation and marks the record
//      pending. No network call happens inside the mutation.
//   2. The caller retrieves the subscription through the configured
//      Stripe client (outside the mutation) and validates it.
//   3. commitSubscriptionReconciliation — a second atomic mutation that
//      writes the retrieved status + a completed event receipt ONLY if
//      the generation is still current and no tombstone exists.
// Retrieval/validation failure goes through failSubscriptionReconciliation:
// non-granting, no receipt, so provider redelivery retries the event.

export type VerifiedBillingEventEnvelope = {
  eventId: string;
  eventCreated: number;
  eventType: string;
};

export type SubscriptionEventLinkage = {
  customerId?: string;
  email?: string;
  ownerId?: string;
  userId?: string;
};

export type BeginSubscriptionEventOutcome =
  | { action: "already_processed"; disposition: string }
  | { action: "ignored"; disposition: string }
  | { action: "applied_deletion"; disposition: string }
  | { action: "conflict"; reason: string }
  | { action: "reserved"; generation: number };

export async function beginSubscriptionEventProcessing(input: {
  event: VerifiedBillingEventEnvelope;
  subscriptionId: string;
  isDeletion: boolean;
  linkage: SubscriptionEventLinkage;
}): Promise<BeginSubscriptionEventOutcome> {
  return mutateSnapshotCapturing((snapshot) => {
    const now = new Date().toISOString();
    const subscriptionId = normalizeValue(input.subscriptionId);
    const existingReceipt = snapshot.eventReceipts[input.event.eventId];
    if (existingReceipt) {
      return { action: "already_processed", disposition: existingReceipt.disposition };
    }

    const record = ensureSubscriptionRecord(snapshot, subscriptionId);

    if (record.cancellationTombstone) {
      // The tombstone is permanent for this subscription ID: no event —
      // any ID, any timestamp, any retrieval result — revives it.
      writeEventReceipt(snapshot, input.event, subscriptionId, "ignored_after_cancellation", now);
      snapshot.updatedAt = now;
      return { action: "ignored", disposition: "ignored_after_cancellation" };
    }

    if (input.isDeletion) {
      applyLinkageFill(record, input.linkage);
      record.cancellationTombstone = {
        eventId: input.event.eventId,
        eventCreated: input.event.eventCreated
      };
      record.status = "canceled";
      record.lastEventCreated = Math.max(record.lastEventCreated, input.event.eventCreated);
      record.reconcileGeneration += 1;
      // A verified deletion event is itself conclusive provider state.
      record.reconciliationState = "verified";
      record.reconciledAt = now;
      record.updatedAt = now;
      writeEventReceipt(snapshot, input.event, subscriptionId, "reconciled", now);
      snapshot.updatedAt = now;
      return { action: "applied_deletion", disposition: "reconciled" };
    }

    if (record.lastEventCreated > 0 && input.event.eventCreated < record.lastEventCreated) {
      writeEventReceipt(snapshot, input.event, subscriptionId, "ignored_stale", now);
      snapshot.updatedAt = now;
      return { action: "ignored", disposition: "ignored_stale" };
    }

    const conflict = findLinkageConflict(record, input.linkage);
    if (conflict) {
      // Fail rather than overwrite an existing binding; no receipt is
      // written, so the failure stays visible and retryable.
      return { action: "conflict", reason: conflict };
    }

    applyLinkageFill(record, input.linkage);
    upsertCustomerLinkage(snapshot, input.linkage, now);
    if (!record.status) {
      // Checkout/subscription linkage alone never grants: the placeholder
      // status is outside the granting allowlist until retrieval commits.
      record.status = "incomplete";
    }
    record.reconcileGeneration += 1;
    record.lastEventCreated = Math.max(record.lastEventCreated, input.event.eventCreated);
    record.reconciliationState = "pending";
    record.updatedAt = now;
    snapshot.updatedAt = now;
    return { action: "reserved", generation: record.reconcileGeneration };
  });
}

export async function commitSubscriptionReconciliation(input: {
  subscriptionId: string;
  generation: number;
  event: VerifiedBillingEventEnvelope | null;
  status: string;
  linkage: SubscriptionEventLinkage;
}): Promise<"committed" | "superseded" | "conflict"> {
  return mutateSnapshotCapturing((snapshot) => {
    const now = new Date().toISOString();
    const subscriptionId = normalizeValue(input.subscriptionId);
    const record = snapshot.subscriptions[subscriptionId];
    if (!record || record.cancellationTombstone) {
      return "superseded";
    }
    if (record.reconcileGeneration !== input.generation) {
      return "superseded";
    }
    if (findLinkageConflict(record, input.linkage)) {
      return "conflict";
    }
    // The commit linkage is built from the verified retrieval, so it is
    // the authority for the email: refresh it (a metadata correction in
    // Stripe must move the granting email, not just fill an empty one).
    applyLinkageFill(record, input.linkage, { refreshEmail: true });
    const linkedCustomer = record.customerId ? snapshot.customers[record.customerId] : undefined;
    if (!record.email && linkedCustomer?.email) {
      record.email = linkedCustomer.email;
    }
    if (!record.ownerId && linkedCustomer?.ownerId) {
      record.ownerId = linkedCustomer.ownerId;
    }
    if (!record.userId && linkedCustomer?.userId) {
      record.userId = linkedCustomer.userId;
    }
    upsertCustomerLinkage(snapshot, input.linkage, now);
    record.status = normalizeValue(input.status)?.toLowerCase() ?? "";
    record.reconciliationState = "verified";
    record.reconciledAt = now;
    record.updatedAt = now;
    if (input.event) {
      writeEventReceipt(snapshot, input.event, subscriptionId, "reconciled", now);
    }
    snapshot.updatedAt = now;
    return "committed";
  });
}

export async function failSubscriptionReconciliation(input: {
  subscriptionId: string;
  generation: number;
}): Promise<void> {
  await mutateSnapshot((snapshot) => {
    const record = snapshot.subscriptions[normalizeValue(input.subscriptionId)];
    if (!record || record.cancellationTombstone) {
      return;
    }
    if (record.reconcileGeneration !== input.generation) {
      return;
    }
    // Non-granting and NOT marked completed: no receipt is written, so a
    // provider redelivery of the same event retries reconciliation.
    record.reconciliationState = "failed";
    record.updatedAt = new Date().toISOString();
    snapshot.updatedAt = record.updatedAt;
  });
}

/** Reserve a generation for an administrative (event-less) reconciliation. */
export async function beginAdminSubscriptionReconciliation(input: {
  subscriptionId: string;
}): Promise<{ action: "reserved"; generation: number } | { action: "tombstoned" } | { action: "missing" }> {
  return mutateSnapshotCapturing((snapshot) => {
    const record = snapshot.subscriptions[normalizeValue(input.subscriptionId)];
    if (!record) {
      return { action: "missing" };
    }
    if (record.cancellationTombstone) {
      return { action: "tombstoned" };
    }
    record.reconcileGeneration += 1;
    record.reconciliationState = "pending";
    record.updatedAt = new Date().toISOString();
    snapshot.updatedAt = record.updatedAt;
    return { action: "reserved", generation: record.reconcileGeneration };
  });
}

/** Customer linkage without any subscription entitlement surface (checkout completion with no subscription). */
export async function applyBillingCustomerLinkage(linkage: SubscriptionEventLinkage): Promise<void> {
  await mutateSnapshot((snapshot) => {
    upsertCustomerLinkage(snapshot, linkage, new Date().toISOString());
    snapshot.updatedAt = new Date().toISOString();
  });
}

export async function getSubscriptionReconciliationRecord(
  subscriptionId: string
): Promise<SubscriptionReconciliationRecord | null> {
  const snapshot = await readSnapshot();
  return snapshot.subscriptions[normalizeValue(subscriptionId)] ?? null;
}

export async function getBillingEventReceipt(eventId: string): Promise<BillingEventReceipt | null> {
  const snapshot = await readSnapshot();
  return snapshot.eventReceipts[eventId] ?? null;
}

function ensureSubscriptionRecord(
  snapshot: BillingEntitlementsSnapshot,
  subscriptionId: string
): SubscriptionReconciliationRecord {
  let record = snapshot.subscriptions[subscriptionId];
  if (!record) {
    record = {
      subscriptionId,
      customerId: "",
      email: "",
      ownerId: "",
      userId: "",
      status: "",
      updatedAt: "",
      reconcileGeneration: 0,
      lastEventCreated: 0,
      reconciliationState: "",
      reconciledAt: "",
      cancellationTombstone: null
    };
    snapshot.subscriptions[subscriptionId] = record;
  }
  return record;
}

function findLinkageConflict(
  record: SubscriptionReconciliationRecord,
  linkage: SubscriptionEventLinkage
): string | null {
  const customerId = normalizeValue(linkage.customerId);
  if (customerId && record.customerId && customerId !== record.customerId) {
    return "customer_binding_conflict";
  }
  const ownerId = normalizeValue(linkage.ownerId);
  if (ownerId && record.ownerId && ownerId !== record.ownerId) {
    return "owner_binding_conflict";
  }
  const userId = normalizeValue(linkage.userId);
  if (userId && record.userId && userId !== record.userId) {
    return "user_binding_conflict";
  }
  return null;
}

function applyLinkageFill(
  record: SubscriptionReconciliationRecord,
  linkage: SubscriptionEventLinkage,
  options: { refreshEmail?: boolean } = {}
): void {
  const customerId = normalizeValue(linkage.customerId);
  if (customerId && !record.customerId) {
    record.customerId = customerId;
  }
  // Email is not a binding: Stripe metadata can correct it, and the
  // entitlement check grants by email independently of owner/user ID.
  // Only a caller whose linkage is VERIFIED (a successful reconciliation
  // commit) may refresh it; unverified linkage — event reservation,
  // deletion — fills an empty field only, so an unverified or failed
  // reconciliation can never move an email.
  const email = normalizeEmail(linkage.email);
  if (email && (options.refreshEmail || !record.email)) {
    record.email = email;
  }
  const ownerId = normalizeValue(linkage.ownerId);
  if (ownerId && !record.ownerId) {
    record.ownerId = ownerId;
  }
  const userId = normalizeValue(linkage.userId);
  if (userId && !record.userId) {
    record.userId = userId;
  }
}

function upsertCustomerLinkage(
  snapshot: BillingEntitlementsSnapshot,
  linkage: SubscriptionEventLinkage,
  now: string
): void {
  const customerId = normalizeValue(linkage.customerId);
  if (!customerId) {
    return;
  }
  const existingCustomer = snapshot.customers[customerId];
  snapshot.customers[customerId] = {
    customerId,
    email: normalizeEmail(linkage.email) || existingCustomer?.email || "",
    ownerId: normalizeValue(linkage.ownerId) || existingCustomer?.ownerId || "",
    userId: normalizeValue(linkage.userId) || existingCustomer?.userId || "",
    updatedAt: now
  };
}

function writeEventReceipt(
  snapshot: BillingEntitlementsSnapshot,
  event: VerifiedBillingEventEnvelope,
  subscriptionId: string,
  disposition: string,
  now: string
): void {
  snapshot.eventReceipts[event.eventId] = {
    eventId: event.eventId,
    subscriptionId,
    eventType: event.eventType,
    eventCreated: event.eventCreated,
    disposition,
    recordedAt: now
  };
}

export async function getBillingEntitlementsSummary(): Promise<BillingEntitlementsSummary> {
  const snapshot = await readSnapshot();
  return summarizeSnapshot(snapshot);
}

function hasActiveEntitlementInSnapshot(
  snapshot: BillingEntitlementsSnapshot,
  input: {
    ownerId?: string;
    userId?: string;
    email?: string;
  }
): boolean {
  const ownerId = normalizeValue(input.ownerId);
  const userId = normalizeValue(input.userId);
  const email = normalizeEmail(input.email);
  if (!ownerId && !userId && !email) {
    return false;
  }
  return Object.values(snapshot.subscriptions).some((subscription) => {
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status.toLowerCase())) {
      return false;
    }
    // S93-3 item 2: a granting status alone is never sufficient. The
    // record must carry a verified reconciliation (legacy records with
    // no watermark are unverified and non-granting until reconciled),
    // and a cancellation tombstone is an absolute bar for that
    // subscription ID regardless of status fields.
    if (subscription.cancellationTombstone) {
      return false;
    }
    if (subscription.reconciliationState !== "verified") {
      return false;
    }
    return (
      (ownerId && subscription.ownerId === ownerId) ||
      (userId && subscription.userId === userId) ||
      (email && normalizeEmail(subscription.email) === email)
    );
  });
}

function summarizeSnapshot(snapshot: BillingEntitlementsSnapshot): BillingEntitlementsSummary {
  const subscriptions = Object.values(snapshot.subscriptions);
  const byStatus = subscriptions.reduce<Record<string, number>>((acc, subscription) => {
    const status = subscription.status?.trim().toLowerCase() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const activeSubscriptionCount = subscriptions.reduce((count, subscription) => {
    const status = subscription.status?.trim().toLowerCase() || "";
    return ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? count + 1 : count;
  }, 0);
  const missingIdentityCount = subscriptions.reduce((count, subscription) => {
    const hasIdentity = Boolean(
      normalizeValue(subscription.ownerId) ||
        normalizeValue(subscription.userId) ||
        normalizeEmail(subscription.email)
    );
    return hasIdentity ? count : count + 1;
  }, 0);
  return {
    updatedAt: snapshot.updatedAt,
    customerCount: Object.keys(snapshot.customers).length,
    subscriptionCount: subscriptions.length,
    activeSubscriptionCount,
    missingIdentityCount,
    byStatus
  };
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<BillingEntitlementsSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      BILLING_ENTITLEMENTS_SNAPSHOT_KEY,
      BillingEntitlementsSnapshotSchema,
      EMPTY_BILLING_ENTITLEMENTS_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return BillingEntitlementsSnapshotSchema.parse(parsed);
}

async function writeSnapshot(snapshot: BillingEntitlementsSnapshot): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function mutateSnapshotCapturing<T>(
  mutator: (snapshot: BillingEntitlementsSnapshot) => T | Promise<T>
): Promise<T> {
  let captured: T | undefined;
  await mutateSnapshot(async (snapshot) => {
    captured = await mutator(snapshot);
  });
  return captured as T;
}

async function mutateSnapshot(
  mutator: (snapshot: BillingEntitlementsSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      BILLING_ENTITLEMENTS_SNAPSHOT_KEY,
      BillingEntitlementsSnapshotSchema,
      EMPTY_BILLING_ENTITLEMENTS_SNAPSHOT,
      async (current) => {
        const next = BillingEntitlementsSnapshotSchema.parse(structuredClone(current));
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
    await fs.writeFile(
      storeFilePath,
      JSON.stringify(
        {
          updatedAt: "",
          customers: {},
          subscriptions: {}
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }
}

function normalizeValue(value: string | undefined | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeEmail(value: string | undefined | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}
