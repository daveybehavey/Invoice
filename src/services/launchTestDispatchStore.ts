import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

// SEC-05 (Slate 52 S52-5 / Slate 54 S54-4): durable claims for operator
// launch-test email dispatch. One bounded action identity maps to at
// most one dispatch: the claim is reserved atomically before any
// provider call, bound to the operator and the resolved recipient, and
// its recorded outcome is replayed for retries instead of sending again.
// A dispatch whose outcome is uncertain (crash/timeout after dispatch
// began) blocks automatic redispatch — the claim stays "uncertain" for
// an operator to reconcile. Fresh actions are limited per operator and
// application-wide per UTC day.

const configuredStorePath = process.env.INVOICE_LAUNCH_TEST_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/launch-test-dispatch.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const LAUNCH_TEST_DISPATCH_SNAPSHOT_KEY = "launch_test_dispatch";

const DEFAULT_PER_OPERATOR_DAILY_LIMIT = 20;
const DEFAULT_GLOBAL_DAILY_LIMIT = 100;

export const LaunchTestClaimStateSchema = z.enum(["reserved", "settled", "uncertain"]);
export type LaunchTestClaimState = z.infer<typeof LaunchTestClaimStateSchema>;

export const LaunchTestClaimSchema = z.object({
  actionId: z.string().min(1),
  operatorUserId: z.string().min(1),
  recipientEmail: z.string().min(1),
  state: LaunchTestClaimStateSchema,
  outcomeMode: z.enum(["provider", "record_only", "failed"]).nullable().default(null),
  outcomeProvider: z.string().nullable().default(null),
  outcomeProviderMessageId: z.string().nullable().default(null),
  outcomeWarning: z.string().nullable().default(null),
  createdDay: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type LaunchTestClaim = z.infer<typeof LaunchTestClaimSchema>;

const LaunchTestDispatchSnapshotSchema = z.object({
  claims: z.record(z.string(), LaunchTestClaimSchema).default({})
});

type LaunchTestDispatchSnapshot = z.infer<typeof LaunchTestDispatchSnapshotSchema>;

const EMPTY_SNAPSHOT: LaunchTestDispatchSnapshot = {
  claims: {}
};

let mutationQueue: Promise<void> = Promise.resolve();

export type ReserveLaunchTestClaimResult =
  | { outcome: "reserved"; claim: LaunchTestClaim }
  | { outcome: "existing"; claim: LaunchTestClaim }
  | { outcome: "conflict" }
  | { outcome: "limit_reached" };

export function buildLaunchTestIdempotencyKey(actionId: string): string {
  return `launch-test:${actionId}`;
}

export function getLaunchTestDispatchLimits(): { perOperatorDaily: number; globalDaily: number } {
  return {
    perOperatorDaily: parsePositiveInt(
      process.env.INVOICE_LAUNCH_TEST_PER_OPERATOR_DAILY_LIMIT,
      DEFAULT_PER_OPERATOR_DAILY_LIMIT
    ),
    globalDaily: parsePositiveInt(
      process.env.INVOICE_LAUNCH_TEST_GLOBAL_DAILY_LIMIT,
      DEFAULT_GLOBAL_DAILY_LIMIT
    )
  };
}

/**
 * Atomically reserve the dispatch claim for an action identity. Storage
 * failures reject: callers must not dispatch without a durable claim.
 */
export async function reserveLaunchTestClaim(input: {
  actionId: string;
  operatorUserId: string;
  recipientEmail: string;
}): Promise<ReserveLaunchTestClaimResult> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  let result: ReserveLaunchTestClaimResult = { outcome: "limit_reached" };
  await mutateSnapshot((snapshot) => {
    const existing = snapshot.claims[input.actionId];
    if (existing) {
      if (existing.operatorUserId !== input.operatorUserId || existing.recipientEmail !== recipientEmail) {
        result = { outcome: "conflict" };
        return;
      }
      result = { outcome: "existing", claim: existing };
      return;
    }

    const limits = getLaunchTestDispatchLimits();
    const today = new Date().toISOString().slice(0, 10);
    const todaysClaims = Object.values(snapshot.claims).filter((claim) => claim.createdDay === today);
    const operatorCount = todaysClaims.filter((claim) => claim.operatorUserId === input.operatorUserId).length;
    if (operatorCount >= limits.perOperatorDaily || todaysClaims.length >= limits.globalDaily) {
      result = { outcome: "limit_reached" };
      return;
    }

    const now = new Date().toISOString();
    const claim: LaunchTestClaim = {
      actionId: input.actionId,
      operatorUserId: input.operatorUserId,
      recipientEmail,
      state: "reserved",
      outcomeMode: null,
      outcomeProvider: null,
      outcomeProviderMessageId: null,
      outcomeWarning: null,
      createdDay: today,
      createdAt: now,
      updatedAt: now
    };
    snapshot.claims[input.actionId] = claim;
    result = { outcome: "reserved", claim };
  });
  return result;
}

/**
 * Record the outcome of a reserved dispatch. "settled" outcomes replay;
 * "uncertain" outcomes block redispatch. Returns the updated claim, or
 * null when no claim exists for the action identity.
 */
export async function recordLaunchTestClaimOutcome(input: {
  actionId: string;
  state: Exclude<LaunchTestClaimState, "reserved">;
  outcomeMode?: LaunchTestClaim["outcomeMode"];
  outcomeProvider?: string | null;
  outcomeProviderMessageId?: string | null;
  outcomeWarning?: string | null;
}): Promise<LaunchTestClaim | null> {
  let updated: LaunchTestClaim | null = null;
  await mutateSnapshot((snapshot) => {
    const claim = snapshot.claims[input.actionId];
    if (!claim) {
      return;
    }
    claim.state = input.state;
    claim.outcomeMode = input.outcomeMode ?? claim.outcomeMode;
    claim.outcomeProvider = input.outcomeProvider ?? claim.outcomeProvider;
    claim.outcomeProviderMessageId = input.outcomeProviderMessageId ?? claim.outcomeProviderMessageId;
    claim.outcomeWarning = input.outcomeWarning ?? claim.outcomeWarning;
    claim.updatedAt = new Date().toISOString();
    updated = claim;
  });
  return updated;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<LaunchTestDispatchSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      LAUNCH_TEST_DISPATCH_SNAPSHOT_KEY,
      LaunchTestDispatchSnapshotSchema,
      EMPTY_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  return LaunchTestDispatchSnapshotSchema.parse(JSON.parse(raw));
}

async function writeSnapshot(snapshot: LaunchTestDispatchSnapshot): Promise<void> {
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

async function mutateSnapshot(
  mutator: (snapshot: LaunchTestDispatchSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      LAUNCH_TEST_DISPATCH_SNAPSHOT_KEY,
      LaunchTestDispatchSnapshotSchema,
      EMPTY_SNAPSHOT,
      async (current) => {
        const next = LaunchTestDispatchSnapshotSchema.parse(structuredClone(current));
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
    await fs.writeFile(storeFilePath, `${JSON.stringify(EMPTY_SNAPSHOT, null, 2)}\n`, "utf8");
  }
}
