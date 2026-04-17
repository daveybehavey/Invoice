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

const SubscriptionRecordSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string().default(""),
  email: z.string().default(""),
  ownerId: z.string().default(""),
  userId: z.string().default(""),
  status: z.string().default(""),
  updatedAt: z.string().default("")
});

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
  subscriptions: z.record(z.string(), SubscriptionRecordSchema).default({})
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
  subscriptions: {}
};

export async function hasActiveStripeEntitlement(input: {
  ownerId?: string;
  userId?: string;
  email?: string;
}): Promise<boolean> {
  const snapshot = await readSnapshot();
  return hasActiveEntitlementInSnapshot(snapshot, input);
}

export async function applyCheckoutSessionEntitlement(input: {
  customerId?: string;
  subscriptionId?: string;
  email?: string;
  ownerId?: string;
  userId?: string;
}): Promise<void> {
  await mutateSnapshot(async (snapshot) => {
    const now = new Date().toISOString();
    const customerId = normalizeValue(input.customerId);
    const subscriptionId = normalizeValue(input.subscriptionId);
    const email = normalizeEmail(input.email);
    const ownerId = normalizeValue(input.ownerId);
    const userId = normalizeValue(input.userId);

    if (customerId) {
      const existingCustomer = snapshot.customers[customerId];
      snapshot.customers[customerId] = {
        customerId,
        email: email || existingCustomer?.email || "",
        ownerId: ownerId || existingCustomer?.ownerId || "",
        userId: userId || existingCustomer?.userId || "",
        updatedAt: now
      };
    }

    if (subscriptionId) {
      const existingSubscription = snapshot.subscriptions[subscriptionId];
      const linkedCustomer = customerId ? snapshot.customers[customerId] : undefined;
      snapshot.subscriptions[subscriptionId] = {
        subscriptionId,
        customerId: customerId || existingSubscription?.customerId || "",
        email: email || existingSubscription?.email || linkedCustomer?.email || "",
        ownerId: ownerId || existingSubscription?.ownerId || linkedCustomer?.ownerId || "",
        userId: userId || existingSubscription?.userId || linkedCustomer?.userId || "",
        status: "active",
        updatedAt: now
      };
    }

    snapshot.updatedAt = now;
  });
}

export async function applySubscriptionEntitlement(input: {
  subscriptionId: string;
  customerId?: string;
  email?: string;
  ownerId?: string;
  userId?: string;
  status?: string;
}): Promise<void> {
  await mutateSnapshot(async (snapshot) => {
    const now = new Date().toISOString();
    const subscriptionId = normalizeValue(input.subscriptionId);
    if (!subscriptionId) {
      return;
    }

    const customerId = normalizeValue(input.customerId);
    const email = normalizeEmail(input.email);
    const ownerId = normalizeValue(input.ownerId);
    const userId = normalizeValue(input.userId);
    const status = normalizeValue(input.status)?.toLowerCase() ?? "";

    const linkedCustomer =
      customerId && snapshot.customers[customerId] ? snapshot.customers[customerId] : undefined;

    const existingSubscription = snapshot.subscriptions[subscriptionId];
    snapshot.subscriptions[subscriptionId] = {
      subscriptionId,
      customerId: customerId || existingSubscription?.customerId || "",
      email: email || existingSubscription?.email || linkedCustomer?.email || "",
      ownerId: ownerId || existingSubscription?.ownerId || linkedCustomer?.ownerId || "",
      userId: userId || existingSubscription?.userId || linkedCustomer?.userId || "",
      status,
      updatedAt: now
    };

    if (customerId) {
      const existingCustomer = snapshot.customers[customerId];
      snapshot.customers[customerId] = {
        customerId,
        email: email || existingCustomer?.email || "",
        ownerId: ownerId || existingCustomer?.ownerId || "",
        userId: userId || existingCustomer?.userId || "",
        updatedAt: now
      };
    }

    snapshot.updatedAt = now;
  });
}

export async function getBillingEntitlementsSnapshot(): Promise<BillingEntitlementsSnapshot> {
  return readSnapshot();
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
