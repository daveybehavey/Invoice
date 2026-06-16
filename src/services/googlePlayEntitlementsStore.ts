import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT_KEY = "google_play_entitlements";
const configuredStorePath = process.env.GOOGLE_PLAY_ENTITLEMENTS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/google-play-entitlements.json");
const storeDir = path.dirname(storeFilePath);

const GooglePlaySubscriptionRecordSchema = z.object({
  purchaseToken: z.string(),
  productId: z.string().default(""),
  packageName: z.string().default(""),
  ownerId: z.string().default(""),
  userId: z.string().default(""),
  email: z.string().default(""),
  subscriptionState: z.string().default(""),
  acknowledgedAt: z.string().default(""),
  expiryAt: z.string().default(""),
  latestOrderId: z.string().default(""),
  updatedAt: z.string().default("")
});

const GooglePlayEntitlementsSnapshotSchema = z.object({
  updatedAt: z.string().default(""),
  subscriptions: z.record(z.string(), GooglePlaySubscriptionRecordSchema).default({})
});

type GooglePlayEntitlementsSnapshot = z.infer<typeof GooglePlayEntitlementsSnapshotSchema>;

export type GooglePlayEntitlementsSummary = {
  updatedAt: string;
  subscriptionCount: number;
  activeSubscriptionCount: number;
  byStatus: Record<string, number>;
  missingIdentityCount: number;
};

const ACTIVE_GOOGLE_PLAY_SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
  "ONE_TIME_PURCHASED"
]);
const LIFETIME_GOOGLE_PLAY_STATES = new Set(["ONE_TIME_PURCHASED"]);

let mutationQueue: Promise<void> = Promise.resolve();
const EMPTY_GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT: GooglePlayEntitlementsSnapshot = {
  updatedAt: "",
  subscriptions: {}
};

export async function hasActiveGooglePlayEntitlement(input: {
  ownerId?: string;
  userId?: string;
  email?: string;
}): Promise<boolean> {
  const snapshot = await readSnapshot();
  return hasActiveEntitlementInSnapshot(snapshot, input);
}

export async function applyGooglePlaySubscriptionEntitlement(input: {
  purchaseToken: string;
  productId?: string;
  packageName?: string;
  ownerId?: string;
  userId?: string;
  email?: string;
  subscriptionState?: string;
  expiryAt?: string | null;
  acknowledgedAt?: string | null;
  latestOrderId?: string;
}): Promise<void> {
  await mutateSnapshot(async (snapshot) => {
    const now = new Date().toISOString();
    const purchaseToken = normalizeValue(input.purchaseToken);
    if (!purchaseToken) {
      return;
    }
    const existing = snapshot.subscriptions[purchaseToken];
    snapshot.subscriptions[purchaseToken] = {
      purchaseToken,
      productId: normalizeValue(input.productId) || existing?.productId || "",
      packageName: normalizeValue(input.packageName) || existing?.packageName || "",
      ownerId: normalizeValue(input.ownerId) || existing?.ownerId || "",
      userId: normalizeValue(input.userId) || existing?.userId || "",
      email: normalizeEmail(input.email) || existing?.email || "",
      subscriptionState: normalizeValue(input.subscriptionState) || existing?.subscriptionState || "",
      acknowledgedAt: normalizeValue(input.acknowledgedAt) || existing?.acknowledgedAt || "",
      expiryAt: normalizeValue(input.expiryAt ?? undefined) || existing?.expiryAt || "",
      latestOrderId: normalizeValue(input.latestOrderId) || existing?.latestOrderId || "",
      updatedAt: now
    };
    snapshot.updatedAt = now;
  });
}

export async function getGooglePlayEntitlementsSnapshot(): Promise<GooglePlayEntitlementsSnapshot> {
  return readSnapshot();
}

export async function getGooglePlayEntitlementsSummary(): Promise<GooglePlayEntitlementsSummary> {
  const snapshot = await readSnapshot();
  return summarizeSnapshot(snapshot);
}

async function readSnapshot(): Promise<GooglePlayEntitlementsSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT_KEY,
      GooglePlayEntitlementsSnapshotSchema,
      EMPTY_GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return GooglePlayEntitlementsSnapshotSchema.parse(parsed);
}

async function writeSnapshot(snapshot: GooglePlayEntitlementsSnapshot): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function mutateSnapshot(
  mutator: (snapshot: GooglePlayEntitlementsSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT_KEY,
      GooglePlayEntitlementsSnapshotSchema,
      EMPTY_GOOGLE_PLAY_ENTITLEMENTS_SNAPSHOT,
      async (current) => {
        const next = GooglePlayEntitlementsSnapshotSchema.parse(structuredClone(current));
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

function hasActiveEntitlementInSnapshot(
  snapshot: GooglePlayEntitlementsSnapshot,
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
  const nowMs = Date.now();
  return Object.values(snapshot.subscriptions).some((record) => {
    if (!isEntitlementRecordActive(record, nowMs)) {
      return false;
    }
    return (
      (ownerId && record.ownerId === ownerId) ||
      (userId && record.userId === userId) ||
      (email && normalizeEmail(record.email) === email)
    );
  });
}

function summarizeSnapshot(snapshot: GooglePlayEntitlementsSnapshot): GooglePlayEntitlementsSummary {
  const subscriptions = Object.values(snapshot.subscriptions);
  const byStatus = subscriptions.reduce<Record<string, number>>((acc, subscription) => {
    const status = subscription.subscriptionState?.trim().toUpperCase() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const activeSubscriptionCount = subscriptions.reduce((count, subscription) => {
    return isEntitlementRecordActive(subscription) ? count + 1 : count;
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
    subscriptionCount: subscriptions.length,
    activeSubscriptionCount,
    byStatus,
    missingIdentityCount
  };
}

function isEntitlementRecordActive(
  record: z.infer<typeof GooglePlaySubscriptionRecordSchema>,
  nowMs: number = Date.now()
): boolean {
  const status = record.subscriptionState?.trim().toUpperCase() || "";
  if (!ACTIVE_GOOGLE_PLAY_SUBSCRIPTION_STATES.has(status)) {
    return false;
  }
  if (LIFETIME_GOOGLE_PLAY_STATES.has(status)) {
    return true;
  }
  const expiryMs = Date.parse(record.expiryAt || "");
  if (!Number.isFinite(expiryMs)) {
    return status === "SUBSCRIPTION_STATE_ACTIVE" || status === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
  }
  return expiryMs > nowMs;
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
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
