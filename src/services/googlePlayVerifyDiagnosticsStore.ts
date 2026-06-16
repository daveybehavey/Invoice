import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const GOOGLE_PLAY_VERIFY_DIAGNOSTICS_KEY = "google_play_verify_diagnostics";
const configuredStorePath = process.env.GOOGLE_PLAY_VERIFY_DIAGNOSTICS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/google-play-verify-diagnostics.json");
const storeDir = path.dirname(storeFilePath);

const GooglePlayVerifyAttemptSchema = z.object({
  occurredAt: z.string().default(""),
  phase: z.enum(["received", "verified", "failed"]).default("received"),
  productType: z.enum(["subscription", "one_time"]).default("subscription"),
  ownerId: z.string().default(""),
  userId: z.string().default(""),
  email: z.string().default(""),
  productId: z.string().default(""),
  packageName: z.string().default(""),
  basePlanId: z.string().default(""),
  purchaseTokenSuffix: z.string().default(""),
  subscriptionState: z.string().default(""),
  purchaseState: z.string().default(""),
  expiryAt: z.string().default(""),
  acknowledged: z.boolean().default(false),
  message: z.string().default("")
});

const GooglePlayVerifyDiagnosticsSnapshotSchema = z.object({
  updatedAt: z.string().default(""),
  lastAttempt: GooglePlayVerifyAttemptSchema.nullable().default(null)
});

type GooglePlayVerifyAttempt = z.infer<typeof GooglePlayVerifyAttemptSchema>;
type GooglePlayVerifyDiagnosticsSnapshot = z.infer<typeof GooglePlayVerifyDiagnosticsSnapshotSchema>;

const EMPTY_SNAPSHOT: GooglePlayVerifyDiagnosticsSnapshot = {
  updatedAt: "",
  lastAttempt: null
};

export async function recordGooglePlayVerifyAttempt(
  input: Partial<GooglePlayVerifyAttempt> & Pick<GooglePlayVerifyAttempt, "phase" | "productType">
): Promise<void> {
  await mutateSnapshot(async (snapshot) => {
    const occurredAt = normalizeValue(input.occurredAt) || new Date().toISOString();
    snapshot.updatedAt = occurredAt;
    snapshot.lastAttempt = GooglePlayVerifyAttemptSchema.parse({
      occurredAt,
      phase: input.phase,
      productType: input.productType,
      ownerId: normalizeValue(input.ownerId),
      userId: normalizeValue(input.userId),
      email: normalizeEmail(input.email),
      productId: normalizeValue(input.productId),
      packageName: normalizeValue(input.packageName),
      basePlanId: normalizeValue(input.basePlanId),
      purchaseTokenSuffix: normalizeValue(input.purchaseTokenSuffix),
      subscriptionState: normalizeValue(input.subscriptionState),
      purchaseState: normalizeValue(input.purchaseState),
      expiryAt: normalizeValue(input.expiryAt),
      acknowledged: Boolean(input.acknowledged),
      message: normalizeValue(input.message)
    });
  });
}

export async function getGooglePlayVerifyDiagnostics(): Promise<GooglePlayVerifyDiagnosticsSnapshot> {
  return readSnapshot();
}

async function readSnapshot(): Promise<GooglePlayVerifyDiagnosticsSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      GOOGLE_PLAY_VERIFY_DIAGNOSTICS_KEY,
      GooglePlayVerifyDiagnosticsSnapshotSchema,
      EMPTY_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return GooglePlayVerifyDiagnosticsSnapshotSchema.parse(parsed);
}

async function writeSnapshot(snapshot: GooglePlayVerifyDiagnosticsSnapshot): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function mutateSnapshot(
  mutator: (snapshot: GooglePlayVerifyDiagnosticsSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      GOOGLE_PLAY_VERIFY_DIAGNOSTICS_KEY,
      GooglePlayVerifyDiagnosticsSnapshotSchema,
      EMPTY_SNAPSHOT,
      async (current) => {
        const next = GooglePlayVerifyDiagnosticsSnapshotSchema.parse(structuredClone(current));
        await mutator(next);
        return next;
      }
    );
    return;
  }

  const snapshot = await readSnapshot();
  await mutator(snapshot);
  await writeSnapshot(snapshot);
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, `${JSON.stringify(EMPTY_SNAPSHOT, null, 2)}\n`, "utf8");
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
