import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

/**
 * Slice 0 (tax lane, design v2 Q6 + v2.1 §§C–E): delivery persistence is
 * now append-only events plus durable send claims.
 *
 * What changed from the pre-Slice-0 store:
 * - The mutable per-invoice aggregate (one entry whose sentAt/sendCount
 *   were overwritten by every send, in either mode) is gone as a write
 *   target. Existing aggregates are preserved verbatim as explicitly
 *   UNVERIFIED legacy snapshots: they are never expanded into invented
 *   events, never used as provider timing evidence, and their cumulative
 *   count is never attributed to their latest mode.
 * - Every send attempt/outcome/open is an immutable, idempotently keyed
 *   event. Replaying an event key appends nothing and counts nothing
 *   twice; reusing a key with conflicting content fails explicitly.
 * - Manual sends and reminders share one durable claim (§C):
 *   claimKey = (invoiceId, normalizedRecipient, purpose,
 *   authorizedMonetaryRevision), reserved before dispatch, with a
 *   deterministic provider idempotency key derived from the key. While
 *   any claim for an invoice is RESERVED or DISPATCHING, every competing
 *   claim for that invoice is rejected (v2.2 cross-key exclusion), and
 *   an UNKNOWN claim blocks new claims until reconciled or released by
 *   the owner.
 * - Outcomes follow the §D taxonomy: ACCEPTED is the only outcome that
 *   establishes a send (count once per claim, guarded status transition,
 *   reminder timing); DELIVERED updates the same claim without a second
 *   count; FAILED establishes nothing; UNKNOWN establishes nothing and
 *   blocks; OPENED is engagement only; record_only results are auditable
 *   events that create no send evidence at all.
 */

const configuredStorePath = process.env.INVOICE_DELIVERY_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/invoice-delivery.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const INVOICE_DELIVERY_SNAPSHOT_KEY = "invoice_delivery";

export const DeliveryModeSchema = z.enum(["record_only", "provider"]);
export const DeliveryProviderSchema = z.enum(["none", "resend", "smtp2go"]);
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;
export type DeliveryProvider = z.infer<typeof DeliveryProviderSchema>;

/** The pre-Slice-0 aggregate, preserved as an unverified snapshot. */
const LegacyDeliveryEntrySchema = z.object({
  invoiceId: z.string().uuid(),
  ownerId: z.string().min(1),
  recipientEmail: z.string().email(),
  sentAt: z.string().datetime(),
  openedAt: z.string().datetime().optional(),
  trackingToken: z.string().min(8).optional(),
  mode: DeliveryModeSchema.default("record_only"),
  provider: DeliveryProviderSchema.default("none"),
  providerMessageId: z.string().min(1).optional(),
  sendCount: z.number().int().nonnegative().default(1),
  openCount: z.number().int().nonnegative().default(0)
});
export type LegacyDeliveryEntry = z.infer<typeof LegacyDeliveryEntrySchema>;

export const DeliveryEventKindSchema = z.enum([
  "attempt_started",
  "outcome",
  "opened",
  "send_recorded",
  "claim_released",
  "claim_cancelled"
]);
export type DeliveryEventKind = z.infer<typeof DeliveryEventKindSchema>;

export const DeliveryOutcomeKindSchema = z.enum([
  "accepted",
  "delivered",
  "failed",
  "unknown",
  "opened",
  "recorded"
]);
export type DeliveryOutcomeKind = z.infer<typeof DeliveryOutcomeKindSchema>;

const DeliveryEventSchema = z.object({
  eventId: z.string().min(1),
  ownerId: z.string().min(1),
  invoiceId: z.string().uuid(),
  claimId: z.string().min(1).optional(),
  attemptId: z.string().min(1),
  kind: DeliveryEventKindSchema,
  mode: DeliveryModeSchema,
  provider: DeliveryProviderSchema,
  outcome: DeliveryOutcomeKindSchema.optional(),
  invoiceRevision: z.number().int().nonnegative().optional(),
  recipientEmail: z.string().email().optional(),
  trackingToken: z.string().min(1).optional(),
  providerMessageId: z.string().min(1).optional(),
  providerEventId: z.string().min(1).optional(),
  occurredAt: z.string().datetime()
});
export type DeliveryEvent = z.infer<typeof DeliveryEventSchema>;

export const DeliveryClaimStatusSchema = z.enum([
  "reserved",
  "dispatching",
  "outcome_recorded",
  "blocked_unknown",
  "cancelled",
  "released"
]);
export type DeliveryClaimStatus = z.infer<typeof DeliveryClaimStatusSchema>;

export const DeliveryClaimBasePurposeSchema = z.enum(["initial_send", "reminder", "resend"]);
export type DeliveryClaimBasePurpose = z.infer<typeof DeliveryClaimBasePurposeSchema>;

const DeliveryClaimSchema = z.object({
  claimId: z.string().min(1),
  ownerId: z.string().min(1),
  invoiceId: z.string().uuid(),
  recipientEmail: z.string().email(),
  /** The full purpose identity inside the claim key, e.g. "initial_send",
   * "reminder_occurrence_2", "resend_1". */
  purpose: z.string().min(1),
  basePurpose: DeliveryClaimBasePurposeSchema,
  authorizedRevision: z.number().int().nonnegative(),
  claimKey: z.string().min(1),
  providerIdempotencyKey: z.string().min(1),
  attemptId: z.string().min(1),
  status: DeliveryClaimStatusSchema,
  outcomeKind: DeliveryOutcomeKindSchema.nullable().default(null),
  mode: DeliveryModeSchema.nullable().default(null),
  provider: DeliveryProviderSchema.nullable().default(null),
  providerMessageId: z.string().min(1).optional(),
  trackingToken: z.string().min(1).optional(),
  generation: z.number().int().positive().default(1),
  leaseOwner: z.string().min(1),
  leaseExpiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** §D: the instant this claim's acceptance was established (the
   * ACCEPTED event, or a DELIVERED that arrived first). Recorded once
   * and never moved by later outcomes — projections read it as the
   * send time, so a later DELIVERED fold cannot drift sentAt or
   * reminder timing the way a mutable updatedAt did. */
  acceptedAt: z.string().datetime().optional(),
  outcomeEventId: z.string().min(1).optional(),
  releaseActor: z.string().min(1).optional(),
  releaseReason: z.string().min(1).optional(),
  releasedAt: z.string().datetime().optional()
});
export type DeliveryClaim = z.infer<typeof DeliveryClaimSchema>;

const ReminderAnchorSchema = z.object({
  ownerId: z.string().min(1),
  invoiceId: z.string().uuid(),
  activatedAt: z.string().datetime(),
  nextDueAt: z.string().datetime(),
  activatedBy: z.literal("owner_confirmation"),
  sourceAnchorEventId: z.string().min(1).optional()
});
export type InvoiceReminderAnchor = z.infer<typeof ReminderAnchorSchema>;

/**
 * One read schema accepts both the legacy file shape ({ entries }) and
 * the v2 shape; normalization folds `entries` into `legacyEntries` and
 * every write persists the v2 shape.
 */
const DeliveryStoreFileSchema = z.object({
  version: z.number().optional(),
  entries: z.array(LegacyDeliveryEntrySchema).default([]),
  legacyEntries: z.array(LegacyDeliveryEntrySchema).default([]),
  events: z.array(DeliveryEventSchema).default([]),
  claims: z.array(DeliveryClaimSchema).default([]),
  reminderAnchors: z.array(ReminderAnchorSchema).default([])
});

type DeliveryStoreFile = z.infer<typeof DeliveryStoreFileSchema>;

export type DeliveryStore = {
  legacyEntries: LegacyDeliveryEntry[];
  events: DeliveryEvent[];
  claims: DeliveryClaim[];
  reminderAnchors: InvoiceReminderAnchor[];
};

const EMPTY_DELIVERY_STORE: DeliveryStore = {
  legacyEntries: [],
  events: [],
  claims: [],
  reminderAnchors: []
};

export const DeliverySummarySchema = z.object({
  recipientEmail: z.string().email(),
  /** Last VERIFIED provider acceptance time; null when no verified send
   * exists (legacy aggregates report through `legacy` instead). */
  sentAt: z.string().datetime().nullable(),
  /**
   * Latest delivery activity of any kind (verified send, recorded
   * send, claim outcome, or the legacy aggregate's timestamp).
   * Presentation/activity only — it is NOT send evidence and must
   * never drive counts, timing, or status; consumers that need proof
   * of sending use `sentAt`/`sendCount`/`verified`.
   */
  lastActivityAt: z.string().datetime().nullable().default(null),
  openedAt: z.string().datetime().optional(),
  mode: DeliveryModeSchema.default("record_only"),
  provider: DeliveryProviderSchema.default("none"),
  providerMessageId: z.string().min(1).optional(),
  /** Count of distinct verified provider sends (claims with acceptance
   * plus claim-free provider records). record_only never counts. */
  sendCount: z.number().int().nonnegative(),
  /** Opens attributable to a verified send attempt. */
  openCount: z.number().int().nonnegative(),
  recordOnlyCount: z.number().int().nonnegative().default(0),
  unverifiedOpenCount: z.number().int().nonnegative().default(0),
  verified: z.boolean().default(false),
  legacy: z
    .object({
      sentAt: z.string().datetime(),
      openedAt: z.string().datetime().optional(),
      mode: DeliveryModeSchema,
      provider: DeliveryProviderSchema,
      providerMessageId: z.string().min(1).optional(),
      sendCount: z.number().int().nonnegative(),
      openCount: z.number().int().nonnegative()
    })
    .nullable()
    .default(null),
  status: z.enum(["sent", "opened", "recorded"])
});
export type DeliverySummary = z.infer<typeof DeliverySummarySchema>;

let mutationQueue: Promise<void> = Promise.resolve();

function normalizeStoreFile(parsed: DeliveryStoreFile): DeliveryStore {
  return {
    legacyEntries: [...parsed.legacyEntries, ...parsed.entries],
    events: parsed.events,
    claims: parsed.claims,
    reminderAnchors: parsed.reminderAnchors
  };
}

function toStoreFile(store: DeliveryStore): DeliveryStoreFile {
  return {
    version: 2,
    entries: [],
    legacyEntries: store.legacyEntries,
    events: store.events,
    claims: store.claims,
    reminderAnchors: store.reminderAnchors
  };
}

// ---------------------------------------------------------------------------
// Claims (§C)
// ---------------------------------------------------------------------------

export function buildDeliveryClaimKey(input: {
  invoiceId: string;
  recipientEmail: string;
  purpose: string;
  authorizedRevision: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.invoiceId,
        normalizeRecipientEmail(input.recipientEmail),
        input.purpose,
        input.authorizedRevision
      ])
    )
    .digest("hex")
    .slice(0, 32);
}

export type ReserveDeliveryClaimResult =
  | { outcome: "reserved" | "reclaimed"; claim: DeliveryClaim }
  | { outcome: "existing"; claim: DeliveryClaim }
  | { outcome: "blocked"; reason: "send_in_progress" | "unresolved_send"; claim: DeliveryClaim };

const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Reserve the durable claim for one logical send BEFORE provider
 * dispatch. Exactly one concurrent reservation for a claimKey wins.
 * While any claim for the invoice is reserved/dispatching, every other
 * claim for that invoice is blocked (v2.2 cross-key exclusion); a claim
 * whose outcome is UNKNOWN blocks until it is reconciled or released.
 * An expired reservation whose dispatch never began may be reclaimed
 * with a new fencing generation — lease expiry alone never authorizes
 * a resend of a claim that may have dispatched.
 */
export async function reserveInvoiceDeliveryClaim(input: {
  ownerId: string;
  invoiceId: string;
  recipientEmail: string;
  basePurpose: DeliveryClaimBasePurpose;
  purpose: string;
  authorizedRevision: number;
  leaseMs?: number;
}): Promise<ReserveDeliveryClaimResult> {
  const recipientEmail = normalizeRecipientEmail(input.recipientEmail);
  const claimKey = buildDeliveryClaimKey({
    invoiceId: input.invoiceId,
    recipientEmail,
    purpose: input.purpose,
    authorizedRevision: input.authorizedRevision
  });
  let result: ReserveDeliveryClaimResult | null = null;
  await mutateStore((store) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const sameKey = store.claims.find(
      (claim) =>
        claim.ownerId === input.ownerId && claim.invoiceId === input.invoiceId && claim.claimKey === claimKey
    );
    if (sameKey) {
      if (sameKey.status === "reserved" && Date.parse(sameKey.leaseExpiresAt) <= now.getTime()) {
        // The reservation expired before dispatch began (beginDispatch
        // is what moves a claim to "dispatching", and its outcome —
        // recorded or unknown — is what proves dispatch happened).
        // Reclaim with a new fencing generation.
        sameKey.generation += 1;
        sameKey.leaseOwner = randomUUID();
        sameKey.leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_CLAIM_LEASE_MS)).toISOString();
        sameKey.updatedAt = nowIso;
        result = { outcome: "reclaimed", claim: { ...sameKey } };
        return;
      }
      if (sameKey.status === "reserved" || sameKey.status === "dispatching") {
        result = { outcome: "blocked", reason: "send_in_progress", claim: { ...sameKey } };
        return;
      }
      if (sameKey.status === "blocked_unknown") {
        result = { outcome: "blocked", reason: "unresolved_send", claim: { ...sameKey } };
        return;
      }
      result = { outcome: "existing", claim: { ...sameKey } };
      return;
    }
    const active = store.claims.find(
      (claim) =>
        claim.ownerId === input.ownerId &&
        claim.invoiceId === input.invoiceId &&
        (claim.status === "reserved" || claim.status === "dispatching")
    );
    if (active) {
      result = { outcome: "blocked", reason: "send_in_progress", claim: active };
      return;
    }
    const unresolved = store.claims.find(
      (claim) =>
        claim.ownerId === input.ownerId && claim.invoiceId === input.invoiceId && claim.status === "blocked_unknown"
    );
    if (unresolved) {
      result = { outcome: "blocked", reason: "unresolved_send", claim: unresolved };
      return;
    }
    const claim = DeliveryClaimSchema.parse({
      claimId: randomUUID(),
      ownerId: input.ownerId,
      invoiceId: input.invoiceId,
      recipientEmail,
      purpose: input.purpose,
      basePurpose: input.basePurpose,
      authorizedRevision: input.authorizedRevision,
      claimKey,
      providerIdempotencyKey: `nb-send-${claimKey}`,
      attemptId: randomUUID(),
      status: "reserved",
      outcomeKind: null,
      mode: null,
      provider: null,
      generation: 1,
      leaseOwner: randomUUID(),
      leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? DEFAULT_CLAIM_LEASE_MS)).toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso
    });
    store.claims.push(claim);
    result = { outcome: "reserved", claim };
  });
  if (!result) {
    throw new Error("Unable to reserve invoice delivery claim.");
  }
  return result;
}

/**
 * Move a reserved claim into dispatching and append the attempt event.
 * The generation fences reclaimed workers: a stale generation can no
 * longer begin (or, later, its late outcome cannot overwrite state).
 */
export async function beginInvoiceDeliveryDispatch(input: {
  ownerId: string;
  claimId: string;
  generation: number;
  trackingToken: string;
}): Promise<DeliveryClaim> {
  let claim: DeliveryClaim | null = null;
  await mutateStore((store) => {
    const existing = findClaim(store, input.ownerId, input.claimId);
    if (existing.status !== "reserved" || existing.generation !== input.generation) {
      throw new Error("Delivery claim is no longer dispatchable (it was reclaimed or already resolved).");
    }
    existing.status = "dispatching";
    existing.trackingToken = input.trackingToken;
    existing.updatedAt = new Date().toISOString();
    appendEvent(store, {
      eventId: `${existing.claimId}:attempt:${existing.generation}`,
      ownerId: existing.ownerId,
      invoiceId: existing.invoiceId,
      claimId: existing.claimId,
      attemptId: existing.attemptId,
      kind: "attempt_started",
      mode: "record_only",
      provider: "none",
      invoiceRevision: existing.authorizedRevision,
      recipientEmail: existing.recipientEmail,
      trackingToken: input.trackingToken,
      occurredAt: existing.updatedAt
    });
    claim = { ...existing };
  });
  if (!claim) {
    throw new Error("Unable to begin invoice delivery dispatch.");
  }
  return claim;
}

/**
 * Record the outcome of a dispatched claim: appends the outcome event
 * (idempotent — a replay appends nothing and counts nothing twice) and
 * folds it into the claim. A late outcome from a fenced generation is
 * retained as evidence on the original claim but cannot overwrite the
 * claim's resolved state or create another count.
 */
export async function recordInvoiceDeliveryClaimOutcome(input: {
  ownerId: string;
  claimId: string;
  generation: number;
  outcome: Exclude<DeliveryOutcomeKind, "opened">;
  mode: DeliveryMode;
  provider: DeliveryProvider;
  providerMessageId?: string;
  providerEventId?: string;
  occurredAt?: string;
}): Promise<{ claim: DeliveryClaim; duplicate: boolean }> {
  let claim: DeliveryClaim | null = null;
  let duplicate = false;
  await mutateStore((store) => {
    const existing = findClaim(store, input.ownerId, input.claimId);
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const eventId = [
      existing.claimId,
      "outcome",
      input.outcome,
      input.providerEventId ?? input.providerMessageId ?? `g${input.generation}`
    ].join(":");
    const appended = appendEvent(store, {
      eventId,
      ownerId: existing.ownerId,
      invoiceId: existing.invoiceId,
      claimId: existing.claimId,
      attemptId: existing.attemptId,
      kind: "outcome",
      mode: input.mode,
      provider: input.provider,
      outcome: input.outcome,
      invoiceRevision: existing.authorizedRevision,
      recipientEmail: existing.recipientEmail,
      trackingToken: existing.trackingToken,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      occurredAt
    });
    duplicate = !appended;
    const alreadyResolved = existing.status === "outcome_recorded";
    if (alreadyResolved) {
      // A resolved claim never regresses: the only late fold allowed is
      // DELIVERED strengthening the same logical send's ACCEPTED.
      // updatedAt tracks latest activity only — acceptedAt, the send
      // time the projections read, was fixed at ACCEPTED and does not
      // move with this fold (§D).
      if (existing.outcomeKind === "accepted" && input.outcome === "delivered") {
        existing.outcomeKind = "delivered";
        existing.updatedAt = occurredAt;
      }
    } else if (existing.generation === input.generation && existing.status !== "released") {
      if (input.outcome === "unknown") {
        existing.status = "blocked_unknown";
        existing.outcomeKind = "unknown";
      } else {
        existing.status = "outcome_recorded";
        // DELIVERED after ACCEPTED strengthens the same logical send;
        // it never creates a second count and never regresses it.
        if (existing.outcomeKind !== "delivered" || input.outcome === "delivered") {
          existing.outcomeKind = input.outcome;
        }
        if (input.outcome === "accepted" && existing.outcomeKind === "recorded") {
          existing.outcomeKind = "accepted";
        }
        // §D: acceptance time is a fact of the event that establishes
        // it — the ACCEPTED outcome, or a DELIVERED that arrives first
        // and establishes acceptance for the same claim. Record it
        // once; later outcomes never move it.
        if (
          (input.outcome === "accepted" || input.outcome === "delivered") &&
          (existing.outcomeKind === "accepted" || existing.outcomeKind === "delivered") &&
          !existing.acceptedAt
        ) {
          existing.acceptedAt = occurredAt;
        }
      }
      existing.mode = input.mode;
      existing.provider = input.provider;
      if (input.providerMessageId) {
        existing.providerMessageId = input.providerMessageId;
      }
      existing.outcomeEventId = eventId;
      existing.updatedAt = occurredAt;
    }
    claim = { ...existing };
  });
  if (!claim) {
    throw new Error("Unable to record invoice delivery outcome.");
  }
  return { claim, duplicate };
}

/** Cancel a claim that was reserved but will not dispatch (stale
 * authorization). Only a still-reserved claim can be cancelled. */
export async function cancelInvoiceDeliveryClaim(input: {
  ownerId: string;
  claimId: string;
  generation: number;
  reason: string;
}): Promise<DeliveryClaim> {
  let claim: DeliveryClaim | null = null;
  await mutateStore((store) => {
    const existing = findClaim(store, input.ownerId, input.claimId);
    if (existing.status !== "reserved" || existing.generation !== input.generation) {
      throw new Error("Only a still-reserved delivery claim can be cancelled.");
    }
    const nowIso = new Date().toISOString();
    existing.status = "cancelled";
    existing.updatedAt = nowIso;
    appendEvent(store, {
      eventId: `${existing.claimId}:cancelled:${existing.generation}`,
      ownerId: existing.ownerId,
      invoiceId: existing.invoiceId,
      claimId: existing.claimId,
      attemptId: existing.attemptId,
      kind: "claim_cancelled",
      mode: "record_only",
      provider: "none",
      invoiceRevision: existing.authorizedRevision,
      recipientEmail: existing.recipientEmail,
      occurredAt: nowIso
    });
    claim = { ...existing };
  });
  if (!claim) {
    throw new Error("Unable to cancel invoice delivery claim.");
  }
  return claim;
}

/**
 * Owner release of an unresolved claim (§C): recorded durably with
 * actor, time, and reason. Covers claims whose recorded outcome
 * is UNKNOWN, claims stuck in DISPATCHING past their lease (the
 * dispatch worker is gone and no outcome will ever arrive — the same
 * unprovable-acceptance ambiguity, resolved by the owner's explicit
 * assertion), and RESERVED claims whose lease expired without
 * dispatch ever beginning. That last case is proven, not ambiguous:
 * beginDispatch is the only exit from `reserved`, under the same
 * serialization, so an expired reservation's worker is gone and no
 * provider send can exist — yet the reservation would otherwise
 * block every competing claim key (the next reminder occurrence, a
 * send at a changed revision) forever, since same-key reclaim only
 * helps a retry of the identical key. A release never fabricates
 * acceptance or a timing anchor — it only unblocks future logical
 * sends, which still need their own new claim identity.
 */
export async function releaseInvoiceDeliveryClaim(input: {
  ownerId: string;
  claimId: string;
  actor: string;
  reason: string;
}): Promise<DeliveryClaim> {
  let claim: DeliveryClaim | null = null;
  await mutateStore((store) => {
    const existing = findClaim(store, input.ownerId, input.claimId);
    const stuckDispatching =
      existing.status === "dispatching" && Date.parse(existing.leaseExpiresAt) <= Date.now();
    const abandonedReservation =
      existing.status === "reserved" && Date.parse(existing.leaseExpiresAt) <= Date.now();
    if (existing.status !== "blocked_unknown" && !stuckDispatching && !abandonedReservation) {
      throw new Error("Only an unresolved delivery claim can be released.");
    }
    const nowIso = new Date().toISOString();
    existing.status = "released";
    existing.releaseActor = input.actor;
    existing.releaseReason = input.reason;
    existing.releasedAt = nowIso;
    existing.updatedAt = nowIso;
    appendEvent(store, {
      eventId: `${existing.claimId}:released`,
      ownerId: existing.ownerId,
      invoiceId: existing.invoiceId,
      claimId: existing.claimId,
      attemptId: existing.attemptId,
      kind: "claim_released",
      mode: "record_only",
      provider: "none",
      invoiceRevision: existing.authorizedRevision,
      recipientEmail: existing.recipientEmail,
      occurredAt: nowIso
    });
    claim = { ...existing };
  });
  if (!claim) {
    throw new Error("Unable to release invoice delivery claim.");
  }
  return claim;
}

export async function countInvoiceDeliveryClaims(input: {
  ownerId: string;
  invoiceId: string;
  basePurpose: DeliveryClaimBasePurpose;
}): Promise<number> {
  const store = await readStore();
  return store.claims.filter(
    (claim) =>
      claim.ownerId === input.ownerId && claim.invoiceId === input.invoiceId && claim.basePurpose === input.basePurpose
  ).length;
}

export async function getInvoiceDeliveryClaimById(input: {
  ownerId: string;
  claimId: string;
}): Promise<DeliveryClaim | null> {
  const store = await readStore();
  const claim = store.claims.find(
    (candidate) => candidate.ownerId === input.ownerId && candidate.claimId === input.claimId
  );
  return claim ? { ...claim } : null;
}

// ---------------------------------------------------------------------------
// Events (append-only)
// ---------------------------------------------------------------------------

/**
 * Append one immutable delivery event. Replaying the same eventId with
 * the same content is a no-op; reusing the id with conflicting content
 * throws. Returns the post-append summary for the invoice.
 */
export async function appendInvoiceDeliveryEvent(input: {
  eventId: string;
  ownerId: string;
  invoiceId: string;
  claimId?: string;
  attemptId: string;
  kind: DeliveryEventKind;
  mode: DeliveryMode;
  provider: DeliveryProvider;
  outcome?: DeliveryOutcomeKind;
  invoiceRevision?: number;
  recipientEmail?: string;
  trackingToken?: string;
  providerMessageId?: string;
  providerEventId?: string;
  occurredAt?: string;
}): Promise<{ summary: DeliverySummary; duplicate: boolean }> {
  let summary: DeliverySummary | null = null;
  let duplicate = false;
  await mutateStore((store) => {
    duplicate = !appendEvent(store, {
      eventId: input.eventId,
      ownerId: input.ownerId,
      invoiceId: input.invoiceId,
      claimId: input.claimId,
      attemptId: input.attemptId,
      kind: input.kind,
      mode: input.mode,
      provider: input.provider,
      outcome: input.outcome,
      invoiceRevision: input.invoiceRevision,
      recipientEmail: input.recipientEmail ? normalizeRecipientEmail(input.recipientEmail) : undefined,
      trackingToken: input.trackingToken,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      occurredAt: input.occurredAt ?? new Date().toISOString()
    });
    summary = projectSummary(store, input.ownerId, input.invoiceId);
  });
  if (!summary) {
    throw new Error("Unable to store invoice delivery event.");
  }
  return { summary, duplicate };
}

/**
 * Compatibility recorder for claim-free callers: appends an auditable
 * send_recorded event. A provider-mode record asserts the caller already
 * holds a synchronous provider result; a record_only record creates no
 * send evidence (no count, no timestamp, no status implication).
 */
export async function recordInvoiceDeliverySend(input: {
  ownerId: string;
  invoiceId: string;
  recipientEmail: string;
  trackingToken?: string;
  mode?: DeliveryMode;
  provider?: DeliveryProvider;
  providerMessageId?: string;
  eventId?: string;
  attemptId?: string;
  invoiceRevision?: number;
}): Promise<DeliverySummary> {
  const eventId = input.eventId ?? randomUUID();
  const { summary } = await appendInvoiceDeliveryEvent({
    eventId,
    ownerId: input.ownerId,
    invoiceId: input.invoiceId,
    attemptId: input.attemptId ?? eventId,
    kind: "send_recorded",
    mode: input.mode ?? "record_only",
    provider: input.provider ?? "none",
    outcome: (input.mode ?? "record_only") === "provider" ? "accepted" : "recorded",
    invoiceRevision: input.invoiceRevision,
    recipientEmail: input.recipientEmail,
    trackingToken: input.trackingToken,
    providerMessageId: input.providerMessageId
  });
  return summary;
}

export async function markInvoiceDeliveryOpened(input: {
  ownerId: string;
  invoiceId: string;
}): Promise<DeliverySummary> {
  let summary: DeliverySummary | null = null;
  await mutateStore((store) => {
    const attempt = resolveOpenAttempt(store, input.ownerId, input.invoiceId, undefined);
    if (!attempt) {
      throw new Error("No delivery record found for this invoice.");
    }
    appendEvent(store, {
      eventId: `open:${input.invoiceId}:${randomUUID()}`,
      ownerId: input.ownerId,
      invoiceId: input.invoiceId,
      claimId: attempt.claimId,
      attemptId: attempt.attemptId,
      kind: "opened",
      mode: "record_only",
      provider: "none",
      outcome: "opened",
      recipientEmail: attempt.recipientEmail,
      trackingToken: attempt.trackingToken,
      occurredAt: new Date().toISOString()
    });
    summary = projectSummary(store, input.ownerId, input.invoiceId);
  });
  if (!summary) {
    throw new Error("Unable to store invoice delivery open.");
  }
  return summary;
}

export async function markInvoiceDeliveryOpenedByTrackingToken(input: {
  invoiceId: string;
  trackingToken: string;
}): Promise<DeliverySummary | null> {
  let summary: DeliverySummary | null = null;
  await mutateStore((store) => {
    const claim = store.claims.find(
      (candidate) => candidate.invoiceId === input.invoiceId && candidate.trackingToken === input.trackingToken
    );
    const eventWithToken = store.events.find(
      (candidate) => candidate.invoiceId === input.invoiceId && candidate.trackingToken === input.trackingToken
    );
    const legacy = store.legacyEntries.find(
      (candidate) => candidate.invoiceId === input.invoiceId && candidate.trackingToken === input.trackingToken
    );
    if (!claim && !eventWithToken && !legacy) {
      summary = null;
      return;
    }
    const ownerId = claim?.ownerId ?? eventWithToken?.ownerId ?? legacy!.ownerId;
    const attemptId = claim?.attemptId ?? eventWithToken?.attemptId ?? `legacy:${input.invoiceId}`;
    appendEvent(store, {
      eventId: `open:${input.invoiceId}:${randomUUID()}`,
      ownerId,
      invoiceId: input.invoiceId,
      claimId: claim?.claimId,
      attemptId,
      kind: "opened",
      mode: "record_only",
      provider: "none",
      outcome: "opened",
      recipientEmail: claim?.recipientEmail ?? eventWithToken?.recipientEmail ?? legacy?.recipientEmail,
      trackingToken: input.trackingToken,
      occurredAt: new Date().toISOString()
    });
    summary = projectSummary(store, ownerId, input.invoiceId);
  });
  return summary;
}

// ---------------------------------------------------------------------------
// Reminder anchors (§E) and timing projections
// ---------------------------------------------------------------------------

/**
 * Persist the per-invoice owner-confirmation scheduling anchor. The
 * anchor supplies scheduling eligibility only — never delivery
 * evidence. A repeated confirmation keeps the original schedule (it
 * must not move an existing anchor forward to force an immediate send).
 */
export async function setInvoiceReminderAnchor(input: {
  ownerId: string;
  invoiceId: string;
  activatedAt: string;
  nextDueAt: string;
  sourceAnchorEventId?: string;
}): Promise<InvoiceReminderAnchor> {
  let anchor: InvoiceReminderAnchor | null = null;
  await mutateStore((store) => {
    const existing = store.reminderAnchors.find(
      (candidate) => candidate.ownerId === input.ownerId && candidate.invoiceId === input.invoiceId
    );
    if (existing) {
      anchor = existing;
      return;
    }
    const created = ReminderAnchorSchema.parse({
      ownerId: input.ownerId,
      invoiceId: input.invoiceId,
      activatedAt: input.activatedAt,
      nextDueAt: input.nextDueAt,
      activatedBy: "owner_confirmation",
      sourceAnchorEventId: input.sourceAnchorEventId
    });
    store.reminderAnchors.push(created);
    anchor = created;
  });
  if (!anchor) {
    throw new Error("Unable to store invoice reminder anchor.");
  }
  return anchor;
}

export async function getInvoiceReminderAnchorsByInvoiceIds(input: {
  ownerId: string;
  invoiceIds: string[];
}): Promise<Record<string, InvoiceReminderAnchor>> {
  const store = await readStore();
  const wanted = new Set(input.invoiceIds);
  return store.reminderAnchors.reduce<Record<string, InvoiceReminderAnchor>>((result, anchor) => {
    if (anchor.ownerId === input.ownerId && wanted.has(anchor.invoiceId)) {
      result[anchor.invoiceId] = anchor;
    }
    return result;
  }, {});
}

export type InvoiceReminderTimingProjection = {
  recipientEmail: string | null;
  /** Verified successful provider sends only (§D count-once). */
  providerSendCount: number;
  lastProviderAcceptedAt: string | null;
  recordOnlyCount: number;
  /** True when at least one verified provider event exists. Legacy
   * aggregates never make this true (invariant: honest migration). */
  hasVerifiedHistory: boolean;
  /** A claim is reserved/dispatching, or an UNKNOWN outcome is
   * unresolved: automatic reminders must not fire. */
  hasUnresolvedSend: boolean;
};

/** Timing inputs for the reminder scheduler, derived exclusively from
 * verified provider events — never from legacy aggregates, record_only
 * activity, failed attempts, or opens. */
export async function getInvoiceReminderTimingByInvoiceIds(input: {
  ownerId: string;
  invoiceIds: string[];
}): Promise<Record<string, InvoiceReminderTimingProjection>> {
  const store = await readStore();
  const result: Record<string, InvoiceReminderTimingProjection> = {};
  for (const invoiceId of input.invoiceIds) {
    result[invoiceId] = projectReminderTiming(store, input.ownerId, invoiceId);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export async function getInvoiceDeliverySummary(input: {
  ownerId: string;
  invoiceId: string;
}): Promise<DeliverySummary | null> {
  const store = await readStore();
  return projectSummary(store, input.ownerId, input.invoiceId);
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
  const result: Record<string, DeliverySummary> = {};
  for (const invoiceId of invoiceIdSet) {
    const summary = projectSummary(store, input.ownerId, invoiceId);
    if (summary) {
      result[invoiceId] = summary;
    }
  }
  return result;
}

export async function getInvoiceDeliveryStoreSummary(): Promise<{
  entryCount: number;
  sentCount: number;
  openedCount: number;
  providerSendCount: number;
  recordOnlyCount: number;
  legacySendCount: number;
  unverifiedOpenCount: number;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
}> {
  const store = await readStore();
  const invoiceKeys = new Map<string, { ownerId: string; invoiceId: string }>();
  const addKey = (ownerId: string, invoiceId: string) => {
    invoiceKeys.set(JSON.stringify([ownerId, invoiceId]), { ownerId, invoiceId });
  };
  for (const entry of store.legacyEntries) {
    addKey(entry.ownerId, entry.invoiceId);
  }
  for (const event of store.events) {
    addKey(event.ownerId, event.invoiceId);
  }
  for (const claim of store.claims) {
    addKey(claim.ownerId, claim.invoiceId);
  }
  let sentCount = 0;
  let openedCount = 0;
  let recordOnlyCount = 0;
  let unverifiedOpenCount = 0;
  let lastSentAt: string | null = null;
  let lastOpenedAt: string | null = null;
  for (const { ownerId, invoiceId } of invoiceKeys.values()) {
    const summary = projectSummary(store, ownerId, invoiceId);
    if (!summary) {
      continue;
    }
    sentCount += summary.sendCount;
    openedCount += summary.openCount;
    recordOnlyCount += summary.recordOnlyCount;
    unverifiedOpenCount += summary.unverifiedOpenCount;
    if (summary.sentAt && (!lastSentAt || Date.parse(summary.sentAt) > Date.parse(lastSentAt))) {
      lastSentAt = summary.sentAt;
    }
    if (summary.openedAt && (!lastOpenedAt || Date.parse(summary.openedAt) > Date.parse(lastOpenedAt))) {
      lastOpenedAt = summary.openedAt;
    }
  }
  return {
    entryCount: invoiceKeys.size,
    sentCount,
    openedCount,
    providerSendCount: sentCount,
    recordOnlyCount,
    legacySendCount: store.legacyEntries.reduce((total, entry) => total + (entry.sendCount ?? 0), 0),
    unverifiedOpenCount,
    lastSentAt,
    lastOpenedAt
  };
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/**
 * The instant a claim's acceptance was established (§D): the stored
 * acceptedAt when present; for claims written before that field
 * existed, the earliest acceptance-establishing outcome event
 * (ACCEPTED, or a DELIVERED that arrived first); finally the claim's
 * updatedAt as the last-resort legacy value. Never the time of a
 * later DELIVERED fold — acceptance does not move when delivery is
 * confirmed afterwards.
 */
function claimAcceptanceAt(claim: DeliveryClaim, events: DeliveryEvent[]): string {
  if (claim.acceptedAt) {
    return claim.acceptedAt;
  }
  let earliest: string | null = null;
  for (const event of events) {
    if (
      event.claimId === claim.claimId &&
      event.kind === "outcome" &&
      (event.outcome === "accepted" || event.outcome === "delivered")
    ) {
      if (!earliest || Date.parse(event.occurredAt) < Date.parse(earliest)) {
        earliest = event.occurredAt;
      }
    }
  }
  return earliest ?? claim.updatedAt;
}

function projectSummary(store: DeliveryStore, ownerId: string, invoiceId: string): DeliverySummary | null {
  const legacy = store.legacyEntries.find(
    (entry) => entry.ownerId === ownerId && entry.invoiceId === invoiceId
  );
  const claims = store.claims.filter((claim) => claim.ownerId === ownerId && claim.invoiceId === invoiceId);
  const events = store.events.filter((event) => event.ownerId === ownerId && event.invoiceId === invoiceId);
  if (!legacy && claims.length === 0 && events.length === 0) {
    return null;
  }

  const acceptedClaims = claims.filter(
    (claim) => claim.outcomeKind === "accepted" || claim.outcomeKind === "delivered"
  );
  const acceptedClaimIds = new Set(acceptedClaims.map((claim) => claim.claimId));
  const verifiedAttemptIds = new Set<string>(acceptedClaims.map((claim) => claim.attemptId));
  let lastProviderAcceptedAt: string | null = null;
  for (const claim of acceptedClaims) {
    const acceptedAt = claimAcceptanceAt(claim, events);
    if (!lastProviderAcceptedAt || Date.parse(acceptedAt) > Date.parse(lastProviderAcceptedAt)) {
      lastProviderAcceptedAt = acceptedAt;
    }
  }
  let providerRecordedCount = 0;
  let recordOnlyCount = 0;
  for (const event of events) {
    if (event.kind === "send_recorded" && event.mode === "provider" && event.outcome === "accepted") {
      providerRecordedCount += 1;
      verifiedAttemptIds.add(event.attemptId);
      if (!lastProviderAcceptedAt || Date.parse(event.occurredAt) > Date.parse(lastProviderAcceptedAt)) {
        lastProviderAcceptedAt = event.occurredAt;
      }
    }
    if (event.kind === "send_recorded" && event.mode === "record_only") {
      recordOnlyCount += 1;
    }
    if (event.kind === "outcome" && event.outcome === "recorded") {
      recordOnlyCount += 1;
    }
  }

  const openEvents = events.filter((event) => event.kind === "opened");
  const verifiedOpens = openEvents.filter(
    (event) =>
      verifiedAttemptIds.has(event.attemptId) || (event.claimId ? acceptedClaimIds.has(event.claimId) : false)
  );
  const unverifiedOpenCount = openEvents.length - verifiedOpens.length;
  const lastVerifiedOpenAt = verifiedOpens.reduce<string | null>(
    (latest, event) => (!latest || Date.parse(event.occurredAt) > Date.parse(latest) ? event.occurredAt : latest),
    null
  );

  const sendCount = acceptedClaims.length + providerRecordedCount;
  // Latest send activity decides the presented mode/provider: prefer the
  // newest accepted claim, then the newest send_recorded event, then the
  // legacy snapshot.
  let mode: DeliveryMode = legacy?.mode ?? "record_only";
  let provider: DeliveryProvider = legacy?.provider ?? "none";
  let providerMessageId: string | undefined = legacy?.providerMessageId;
  let latestActivityAt = legacy ? Date.parse(legacy.sentAt) : -1;
  for (const claim of acceptedClaims) {
    if (Date.parse(claim.updatedAt) >= latestActivityAt) {
      latestActivityAt = Date.parse(claim.updatedAt);
      mode = claim.mode ?? mode;
      provider = claim.provider ?? provider;
      providerMessageId = claim.providerMessageId ?? providerMessageId;
    }
  }
  for (const event of events) {
    if (event.kind === "send_recorded" && Date.parse(event.occurredAt) >= latestActivityAt) {
      latestActivityAt = Date.parse(event.occurredAt);
      mode = event.mode;
      provider = event.provider;
      providerMessageId = event.providerMessageId ?? providerMessageId;
    }
  }

  const recipientEmail =
    latestRecipient(store, ownerId, invoiceId) ?? legacy?.recipientEmail ?? "unknown@example.com";

  let lastActivityAt: string | null = legacy?.sentAt ?? null;
  const considerActivity = (iso: string) => {
    if (!lastActivityAt || Date.parse(iso) > Date.parse(lastActivityAt)) {
      lastActivityAt = iso;
    }
  };
  for (const claim of claims) {
    considerActivity(claim.updatedAt);
  }
  for (const event of events) {
    if (event.kind === "send_recorded" || event.kind === "outcome" || event.kind === "attempt_started") {
      considerActivity(event.occurredAt);
    }
  }

  return DeliverySummarySchema.parse({
    recipientEmail,
    sentAt: lastProviderAcceptedAt,
    lastActivityAt,
    openedAt: lastVerifiedOpenAt ?? undefined,
    mode,
    provider,
    providerMessageId,
    sendCount,
    openCount: verifiedOpens.length,
    recordOnlyCount,
    unverifiedOpenCount,
    verified: sendCount > 0,
    legacy: legacy
      ? {
          sentAt: legacy.sentAt,
          openedAt: legacy.openedAt,
          mode: legacy.mode ?? "record_only",
          provider: legacy.provider ?? "none",
          providerMessageId: legacy.providerMessageId,
          sendCount: legacy.sendCount ?? 0,
          openCount: legacy.openCount ?? 0
        }
      : null,
    status: verifiedOpens.length > 0 ? "opened" : sendCount > 0 ? "sent" : "recorded"
  });
}

function projectReminderTiming(
  store: DeliveryStore,
  ownerId: string,
  invoiceId: string
): InvoiceReminderTimingProjection {
  const claims = store.claims.filter((claim) => claim.ownerId === ownerId && claim.invoiceId === invoiceId);
  const events = store.events.filter((event) => event.ownerId === ownerId && event.invoiceId === invoiceId);
  const acceptedClaims = claims.filter(
    (claim) => claim.outcomeKind === "accepted" || claim.outcomeKind === "delivered"
  );
  let providerSendCount = acceptedClaims.length;
  let lastProviderAcceptedAt: string | null = acceptedClaims.reduce<string | null>(
    (latest, claim) => {
      const acceptedAt = claimAcceptanceAt(claim, events);
      return !latest || Date.parse(acceptedAt) > Date.parse(latest) ? acceptedAt : latest;
    },
    null
  );
  let recordOnlyCount = 0;
  for (const event of events) {
    if (event.kind === "send_recorded" && event.mode === "provider" && event.outcome === "accepted") {
      providerSendCount += 1;
      if (!lastProviderAcceptedAt || Date.parse(event.occurredAt) > Date.parse(lastProviderAcceptedAt)) {
        lastProviderAcceptedAt = event.occurredAt;
      }
    }
    if (
      (event.kind === "send_recorded" && event.mode === "record_only") ||
      (event.kind === "outcome" && event.outcome === "recorded")
    ) {
      recordOnlyCount += 1;
    }
  }
  const hasUnresolvedSend = claims.some(
    (claim) => claim.status === "reserved" || claim.status === "dispatching" || claim.status === "blocked_unknown"
  );
  return {
    recipientEmail: latestRecipient(store, ownerId, invoiceId),
    providerSendCount,
    lastProviderAcceptedAt,
    recordOnlyCount,
    hasVerifiedHistory: providerSendCount > 0,
    hasUnresolvedSend
  };
}

function latestRecipient(store: DeliveryStore, ownerId: string, invoiceId: string): string | null {
  let recipient: string | null = null;
  let latestAt = -1;
  for (const claim of store.claims) {
    if (claim.ownerId === ownerId && claim.invoiceId === invoiceId && Date.parse(claim.updatedAt) >= latestAt) {
      latestAt = Date.parse(claim.updatedAt);
      recipient = claim.recipientEmail;
    }
  }
  for (const event of store.events) {
    if (
      event.ownerId === ownerId &&
      event.invoiceId === invoiceId &&
      event.recipientEmail &&
      Date.parse(event.occurredAt) >= latestAt
    ) {
      latestAt = Date.parse(event.occurredAt);
      recipient = event.recipientEmail;
    }
  }
  const legacy = store.legacyEntries.find((entry) => entry.ownerId === ownerId && entry.invoiceId === invoiceId);
  if (legacy && Date.parse(legacy.sentAt) >= latestAt) {
    recipient = legacy.recipientEmail;
  }
  return recipient;
}

function resolveOpenAttempt(
  store: DeliveryStore,
  ownerId: string,
  invoiceId: string,
  trackingToken: string | undefined
): { attemptId: string; claimId?: string; recipientEmail?: string; trackingToken?: string } | null {
  const claims = store.claims
    .filter((claim) => claim.ownerId === ownerId && claim.invoiceId === invoiceId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const claim = trackingToken ? claims.find((candidate) => candidate.trackingToken === trackingToken) : claims[0];
  if (claim) {
    return {
      attemptId: claim.attemptId,
      claimId: claim.claimId,
      recipientEmail: claim.recipientEmail,
      trackingToken: claim.trackingToken
    };
  }
  const sendEvents = store.events
    .filter((event) => event.ownerId === ownerId && event.invoiceId === invoiceId && event.kind === "send_recorded")
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  if (sendEvents[0]) {
    return {
      attemptId: sendEvents[0].attemptId,
      recipientEmail: sendEvents[0].recipientEmail,
      trackingToken: sendEvents[0].trackingToken
    };
  }
  const legacy = store.legacyEntries.find((entry) => entry.ownerId === ownerId && entry.invoiceId === invoiceId);
  if (legacy) {
    return { attemptId: `legacy:${invoiceId}`, recipientEmail: legacy.recipientEmail, trackingToken: legacy.trackingToken };
  }
  return null;
}

function findClaim(store: DeliveryStore, ownerId: string, claimId: string): DeliveryClaim {
  const claim = store.claims.find((candidate) => candidate.ownerId === ownerId && candidate.claimId === claimId);
  if (!claim) {
    throw new Error("Delivery claim was not found.");
  }
  return claim;
}

/** Append if the eventId is new; verify content identity on replay. */
function appendEvent(store: DeliveryStore, event: DeliveryEvent): boolean {
  const existing = store.events.find((candidate) => candidate.eventId === event.eventId);
  if (existing) {
    const identity = (candidate: DeliveryEvent) =>
      JSON.stringify([
        candidate.ownerId,
        candidate.invoiceId,
        candidate.claimId ?? null,
        candidate.attemptId,
        candidate.kind,
        candidate.mode,
        candidate.provider,
        candidate.outcome ?? null,
        candidate.providerMessageId ?? null,
        candidate.providerEventId ?? null
      ]);
    if (identity(existing) !== identity(event)) {
      throw new Error(`Conflicting delivery event for idempotency key "${event.eventId}".`);
    }
    return false;
  }
  store.events.push(DeliveryEventSchema.parse(event));
  return true;
}

function normalizeRecipientEmail(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readStore(): Promise<DeliveryStore> {
  if (runtimeStateBackend === "postgres") {
    const parsed = await readRuntimeSnapshot(
      INVOICE_DELIVERY_SNAPSHOT_KEY,
      DeliveryStoreFileSchema,
      DeliveryStoreFileSchema.parse({})
    );
    return normalizeStoreFile(parsed);
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = DeliveryStoreFileSchema.parse(JSON.parse(raw));
  return normalizeStoreFile(parsed);
}

async function writeStore(store: DeliveryStore): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(toStoreFile(store), null, 2);
  await fs.writeFile(tempPath, `${content}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function mutateStore(mutator: (store: DeliveryStore) => void | Promise<void>): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      INVOICE_DELIVERY_SNAPSHOT_KEY,
      DeliveryStoreFileSchema,
      DeliveryStoreFileSchema.parse({}),
      async (current) => {
        const next = normalizeStoreFile(DeliveryStoreFileSchema.parse(structuredClone(current)));
        await mutator(next);
        return DeliveryStoreFileSchema.parse(toStoreFile(next));
      }
    );
    return;
  }

  await withMutationLock(async () => {
    const store = await readStore();
    await mutator(store);
    await writeStore(store);
  });
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, `${JSON.stringify(toStoreFile(EMPTY_DELIVERY_STORE), null, 2)}\n`, "utf8");
  }
}
