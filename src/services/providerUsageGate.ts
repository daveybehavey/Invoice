import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

// SEC-04 (Slate 52 S52-5 / Slate 54 S54-4): shared usage admission for
// paid provider dispatch (OCR / transcription). A dispatch is admitted
// only when both the per-principal and the application-wide counters for
// the current fixed window are below their limits; the check and the
// increment happen inside one serialized store mutation, so concurrent
// requests cannot jointly overshoot a limit. Admitted attempts are
// counted conservatively: a reservation is never released, even when the
// provider call later fails or times out, because the work may still
// have been billable. These are dispatch limits, not a monetary cap.

const configuredStorePath = process.env.INVOICE_PROVIDER_USAGE_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/provider-usage.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const PROVIDER_USAGE_SNAPSHOT_KEY = "provider_usage";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_PER_PRINCIPAL_LIMIT = 60;
const DEFAULT_APPLICATION_LIMIT = 600;

const ProviderUsageSnapshotSchema = z.object({
  windows: z.record(z.string(), z.number().int().nonnegative()).default({})
});

type ProviderUsageSnapshot = z.infer<typeof ProviderUsageSnapshotSchema>;

const EMPTY_SNAPSHOT: ProviderUsageSnapshot = {
  windows: {}
};

let mutationQueue: Promise<void> = Promise.resolve();

export type ProviderUsageOperationClass = "ocr" | "transcription";

export type ProviderUsageReservation = { admitted: true } | { admitted: false; reason: "limit_reached" };

export function getProviderUsageGateConfig(): {
  windowMs: number;
  perPrincipalLimit: number;
  applicationLimit: number;
} {
  return {
    windowMs: parsePositiveInt(process.env.INVOICE_PROVIDER_USAGE_WINDOW_MS, DEFAULT_WINDOW_MS),
    perPrincipalLimit: parsePositiveInt(
      process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT,
      DEFAULT_PER_PRINCIPAL_LIMIT
    ),
    applicationLimit: parsePositiveInt(
      process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT,
      DEFAULT_APPLICATION_LIMIT
    )
  };
}

/**
 * Atomically reserve one provider dispatch for a principal. Storage
 * failures reject: callers must fail closed (503, no provider call)
 * rather than dispatch without enforcement.
 */
export async function reserveProviderUsage(input: {
  operationClass: ProviderUsageOperationClass;
  principalId: string;
}): Promise<ProviderUsageReservation> {
  const config = getProviderUsageGateConfig();
  const windowStart = Math.floor(Date.now() / config.windowMs) * config.windowMs;
  const principalKey = `${windowStart}:${input.operationClass}:principal:${hashPrincipalId(input.principalId)}`;
  const applicationKey = `${windowStart}:${input.operationClass}:application`;
  let reservation: ProviderUsageReservation = { admitted: false, reason: "limit_reached" };
  await mutateSnapshot((snapshot) => {
    pruneStaleWindows(snapshot, windowStart);
    const principalCount = snapshot.windows[principalKey] ?? 0;
    const applicationCount = snapshot.windows[applicationKey] ?? 0;
    if (principalCount >= config.perPrincipalLimit || applicationCount >= config.applicationLimit) {
      reservation = { admitted: false, reason: "limit_reached" };
      return;
    }
    snapshot.windows[principalKey] = principalCount + 1;
    snapshot.windows[applicationKey] = applicationCount + 1;
    reservation = { admitted: true };
  });
  return reservation;
}

function pruneStaleWindows(snapshot: ProviderUsageSnapshot, currentWindowStart: number): void {
  for (const key of Object.keys(snapshot.windows)) {
    const windowStart = Number.parseInt(key.split(":")[0] ?? "", 10);
    if (!Number.isFinite(windowStart) || windowStart < currentWindowStart) {
      delete snapshot.windows[key];
    }
  }
}

function hashPrincipalId(principalId: string): string {
  const normalized = typeof principalId === "string" && principalId.trim() ? principalId.trim() : "anonymous";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
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

async function readSnapshot(): Promise<ProviderUsageSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(PROVIDER_USAGE_SNAPSHOT_KEY, ProviderUsageSnapshotSchema, EMPTY_SNAPSHOT);
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  return ProviderUsageSnapshotSchema.parse(JSON.parse(raw));
}

async function writeSnapshot(snapshot: ProviderUsageSnapshot): Promise<void> {
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
  mutator: (snapshot: ProviderUsageSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      PROVIDER_USAGE_SNAPSHOT_KEY,
      ProviderUsageSnapshotSchema,
      EMPTY_SNAPSHOT,
      async (current) => {
        const next = ProviderUsageSnapshotSchema.parse(structuredClone(current));
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
