import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

// SEC-03 (Slate 52 S52-5 / Slate 54 S54-4): durable consumed-nonce set for
// email sign-in links. A nonce is consumed atomically (insert-if-absent)
// inside the store mutation, so two simultaneous redemptions of the same
// link — including across processes on the Postgres runtime backend —
// yield exactly one consumption. Only a domain-separated digest of the
// nonce is persisted, never the nonce itself. Records keep the signed
// token expiry so spent entries can be pruned once the token could no
// longer be redeemed anyway.

const configuredStorePath = process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/email-signin-redemptions.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const EMAIL_SIGNIN_REDEMPTION_SNAPSHOT_KEY = "email_signin_redemptions";
const NONCE_DIGEST_DOMAIN = "notebill:email-signin-nonce:v1";

const EmailSignInRedemptionSnapshotSchema = z.object({
  consumedNonces: z.record(z.string(), z.number().int().positive()).default({})
});

type EmailSignInRedemptionSnapshot = z.infer<typeof EmailSignInRedemptionSnapshotSchema>;

const EMPTY_SNAPSHOT: EmailSignInRedemptionSnapshot = {
  consumedNonces: {}
};

let mutationQueue: Promise<void> = Promise.resolve();

export type EmailSignInNonceConsumption = "consumed" | "already_consumed";

export function digestEmailSignInNonce(nonce: string): string {
  return createHash("sha256").update(`${NONCE_DIGEST_DOMAIN}:${nonce}`).digest("hex");
}

/**
 * Atomically consume an email sign-in nonce. Resolves "consumed" for the
 * first redemption and "already_consumed" for every later one. Storage
 * failures reject: callers must fail closed (no session) rather than fall
 * back to stateless verification.
 */
export async function consumeEmailSignInNonce(input: {
  nonce: string;
  expiresAtEpochSeconds: number;
}): Promise<EmailSignInNonceConsumption> {
  const nonceDigest = digestEmailSignInNonce(input.nonce);
  let outcome: EmailSignInNonceConsumption = "already_consumed";
  await mutateSnapshot((snapshot) => {
    pruneExpiredNonces(snapshot);
    if (snapshot.consumedNonces[nonceDigest] !== undefined) {
      outcome = "already_consumed";
      return;
    }
    snapshot.consumedNonces[nonceDigest] = input.expiresAtEpochSeconds;
    outcome = "consumed";
  });
  return outcome;
}

function pruneExpiredNonces(snapshot: EmailSignInRedemptionSnapshot): void {
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  for (const [digest, expiresAtEpochSeconds] of Object.entries(snapshot.consumedNonces)) {
    if (expiresAtEpochSeconds <= nowEpochSeconds) {
      delete snapshot.consumedNonces[digest];
    }
  }
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<EmailSignInRedemptionSnapshot> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(
      EMAIL_SIGNIN_REDEMPTION_SNAPSHOT_KEY,
      EmailSignInRedemptionSnapshotSchema,
      EMPTY_SNAPSHOT
    );
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  return EmailSignInRedemptionSnapshotSchema.parse(JSON.parse(raw));
}

async function writeSnapshot(snapshot: EmailSignInRedemptionSnapshot): Promise<void> {
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
  mutator: (snapshot: EmailSignInRedemptionSnapshot) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      EMAIL_SIGNIN_REDEMPTION_SNAPSHOT_KEY,
      EmailSignInRedemptionSnapshotSchema,
      EMPTY_SNAPSHOT,
      async (current) => {
        const next = EmailSignInRedemptionSnapshotSchema.parse(structuredClone(current));
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
