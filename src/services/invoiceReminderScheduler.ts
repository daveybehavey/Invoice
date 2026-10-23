import { randomUUID } from "node:crypto";
import { SavedInvoice } from "../models/invoice.js";
import { SavedInvoiceRepository } from "./savedInvoiceRepository.js";
import { isDefinitiveProviderRejection, sendInvoiceEmail } from "./invoiceEmailDelivery.js";
import {
  DeliverySummary,
  beginInvoiceDeliveryDispatch,
  cancelInvoiceDeliveryClaim,
  countInvoiceDeliveryClaims,
  getInvoiceDeliverySummariesByInvoiceIds,
  getInvoiceReminderAnchorsByInvoiceIds,
  getInvoiceReminderTimingByInvoiceIds,
  recordInvoiceDeliveryClaimOutcome,
  reserveInvoiceDeliveryClaim
} from "./invoiceDeliveryStore.js";
import { invoiceSendIsBlocked, SEND_BLOCKED_MESSAGE } from "./invoiceSendGate.js";

export type InvoiceReminderSettings = {
  dueAfterDays: number;
  cooldownDays: number;
  maxPerRun: number;
};

export type ReminderCandidate = {
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  lastSentAt: string;
  sendCount: number;
  dueDate?: string;
  nextReminderAt: string;
  reason: ReminderCandidateReason;
};

export type ReminderRunResult = {
  settings: InvoiceReminderSettings;
  scannedCount: number;
  dueCount: number;
  sentCount: number;
  skippedCount: number;
  results: Array<{
    invoiceId: string;
    invoiceNumber: string;
    recipientEmail: string;
    sent: boolean;
    invoiceUpdatedAt?: string;
    delivery?: DeliverySummary;
    mode?: "provider" | "record_only";
    provider?: "none" | "resend" | "smtp2go";
    error?: string;
  }>;
};

type ReminderContext = {
  ownerId: string;
  repository: SavedInvoiceRepository;
  baseUrl: string;
  settings?: Partial<InvoiceReminderSettings>;
  now?: Date;
};

export type ReminderCandidateReason = "past_due" | "follow_up_window" | "cooldown" | "owner_confirmed";

export type ReminderTiming = {
  dueDate?: string;
  nextReminderAt: string;
  nextReminderAtMs: number;
  reason: ReminderCandidateReason;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveInvoiceReminderSettings(
  overrides?: Partial<InvoiceReminderSettings>
): InvoiceReminderSettings {
  const dueAfterDays = normalizePositiveInteger(
    overrides?.dueAfterDays,
    process.env.INVOICE_REMINDER_DUE_DAYS,
    14,
    1,
    120
  );
  const cooldownDays = normalizePositiveInteger(
    overrides?.cooldownDays,
    process.env.INVOICE_REMINDER_COOLDOWN_DAYS,
    7,
    1,
    60
  );
  const maxPerRun = normalizePositiveInteger(
    overrides?.maxPerRun,
    process.env.INVOICE_REMINDER_MAX_PER_RUN,
    25,
    1,
    100
  );
  return {
    dueAfterDays,
    cooldownDays,
    maxPerRun
  };
}

export async function listDueInvoiceReminderCandidates(
  context: Omit<ReminderContext, "baseUrl">
): Promise<{ settings: InvoiceReminderSettings; scannedCount: number; due: ReminderCandidate[] }> {
  const settings = resolveInvoiceReminderSettings(context.settings);
  const nowMs = (context.now ?? new Date()).getTime();
  const invoices = await context.repository.listSavedInvoiceMetadata(false, context.ownerId);
  const sentInvoices = invoices.filter((invoice) => invoice.status === "sent");
  const invoiceIds = sentInvoices.map((invoice) => invoice.invoiceId);
  // Slice 0 (invariants 9 + 11): timing derives exclusively from
  // verified provider events. Legacy aggregates and record_only
  // activity are not timing evidence; an invoice whose history is
  // only legacy/record_only becomes eligible solely through the §E
  // owner-confirmation anchor. An unresolved (in-flight or UNKNOWN)
  // send suppresses automatic reminders entirely.
  const [timingByInvoice, anchorsByInvoice] = await Promise.all([
    getInvoiceReminderTimingByInvoiceIds({ ownerId: context.ownerId, invoiceIds }),
    getInvoiceReminderAnchorsByInvoiceIds({ ownerId: context.ownerId, invoiceIds })
  ]);
  const due = sentInvoices
    .map((invoice) => {
      if (getInvoiceOpenBalance(invoice) <= 0) {
        return null;
      }
      const timingProjection = timingByInvoice[invoice.invoiceId];
      if (!timingProjection || timingProjection.hasUnresolvedSend) {
        return null;
      }
      const recipientEmail = timingProjection.recipientEmail;
      if (!recipientEmail) {
        return null;
      }
      if (!timingProjection.hasVerifiedHistory) {
        const anchor = anchorsByInvoice[invoice.invoiceId];
        if (!anchor) {
          return null;
        }
        const nextReminderAtMs = Date.parse(anchor.nextDueAt);
        if (!Number.isFinite(nextReminderAtMs) || nowMs < nextReminderAtMs) {
          return null;
        }
        const candidate: ReminderCandidate = {
          invoiceId: invoice.invoiceId,
          invoiceNumber: invoice.invoiceNumber ?? "Draft invoice",
          recipientEmail,
          lastSentAt: anchor.activatedAt,
          sendCount: timingProjection.providerSendCount,
          nextReminderAt: anchor.nextDueAt,
          reason: "owner_confirmed"
        };
        const dueDate = normalizeInvoiceDueDate(invoice.dueDate);
        if (dueDate) {
          candidate.dueDate = dueDate;
        }
        return candidate;
      }
      const sendCount = timingProjection.providerSendCount;
      const lastSentAt = timingProjection.lastProviderAcceptedAt;
      if (!lastSentAt) {
        return null;
      }
      const timing = resolveInvoiceReminderTiming({
        dueDate: invoice.dueDate,
        lastSentAt,
        sendCount,
        settings
      });
      if (!timing) {
        return null;
      }
      if (nowMs < timing.nextReminderAtMs) {
        return null;
      }
      const candidate: ReminderCandidate = {
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber ?? "Draft invoice",
        recipientEmail,
        lastSentAt,
        sendCount,
        nextReminderAt: timing.nextReminderAt,
        reason: timing.reason
      };
      if (timing.dueDate) {
        candidate.dueDate = timing.dueDate;
      }
      return candidate;
    })
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate))
    .sort((left, right) => {
      const nextReminderDelta = Date.parse(left.nextReminderAt) - Date.parse(right.nextReminderAt);
      if (nextReminderDelta !== 0) {
        return nextReminderDelta;
      }
      return Date.parse(left.lastSentAt) - Date.parse(right.lastSentAt);
    })
    .slice(0, settings.maxPerRun);
  return {
    settings,
    scannedCount: sentInvoices.length,
    due
  };
}

function getInvoiceOpenBalance(invoice: { balanceDue?: number | null; total?: number | null }): number {
  const amount = Number(invoice.balanceDue ?? invoice.total);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(amount, 0);
}

export function resolveInvoiceReminderTiming(input: {
  dueDate?: string | null;
  lastSentAt: string;
  sendCount: number;
  settings: InvoiceReminderSettings;
}): ReminderTiming | null {
  const lastSentMs = Date.parse(input.lastSentAt);
  if (!Number.isFinite(lastSentMs)) {
    return null;
  }
  const normalizedDueDate = normalizeInvoiceDueDate(input.dueDate);
  const normalizedSendCount = Number.isFinite(input.sendCount)
    ? Math.max(0, Math.round(input.sendCount))
    : 0;
  if (normalizedSendCount <= 1) {
    const dueDateMs = normalizedDueDate ? Date.parse(`${normalizedDueDate}T00:00:00.000Z`) : NaN;
    if (Number.isFinite(dueDateMs) && dueDateMs > lastSentMs) {
      return {
        dueDate: normalizedDueDate,
        nextReminderAt: new Date(dueDateMs).toISOString(),
        nextReminderAtMs: dueDateMs,
        reason: "past_due"
      };
    }
    const nextReminderAtMs = lastSentMs + input.settings.dueAfterDays * DAY_MS;
    return {
      dueDate: normalizedDueDate,
      nextReminderAt: new Date(nextReminderAtMs).toISOString(),
      nextReminderAtMs,
      reason: "follow_up_window"
    };
  }

  const nextReminderAtMs = lastSentMs + input.settings.cooldownDays * DAY_MS;
  return {
    dueDate: normalizedDueDate,
    nextReminderAt: new Date(nextReminderAtMs).toISOString(),
    nextReminderAtMs,
    reason: "cooldown"
  };
}

export async function runDueInvoiceReminders(context: ReminderContext): Promise<ReminderRunResult> {
  const { settings, scannedCount, due } = await listDueInvoiceReminderCandidates(context);
  const results: ReminderRunResult["results"] = [];
  for (const candidate of due) {
    try {
      const reminder = await sendInvoiceReminderById({
        ...context,
        invoiceId: candidate.invoiceId
      });
      // Slice 0 (invariant 8): only a verified provider outcome counts
      // as a sent reminder. record_only attempts are reported with
      // their real mode and never inflate sentCount.
      results.push({
        invoiceId: reminder.invoiceId,
        invoiceNumber: reminder.invoiceNumber,
        recipientEmail: reminder.recipientEmail,
        sent: reminder.mode === "provider",
        invoiceUpdatedAt: reminder.invoice.updatedAt,
        delivery: reminder.delivery,
        mode: reminder.mode,
        provider: reminder.provider
      });
    } catch (error) {
      results.push({
        invoiceId: candidate.invoiceId,
        invoiceNumber: candidate.invoiceNumber,
        recipientEmail: candidate.recipientEmail,
        sent: false,
        error: error instanceof Error ? error.message : "Unknown reminder send error."
      });
    }
  }
  return {
    settings,
    scannedCount,
    dueCount: due.length,
    sentCount: results.filter((result) => result.sent).length,
    skippedCount: results.filter((result) => !result.sent).length,
    results
  };
}

export async function sendInvoiceReminderById(
  context: ReminderContext & { invoiceId: string }
): Promise<{
  invoiceId: string;
  invoiceNumber: string;
  invoice: SavedInvoice;
  delivery: DeliverySummary;
  recipientEmail: string;
  mode: "provider" | "record_only";
  provider: "none" | "resend" | "smtp2go";
  warning?: string;
}> {
  const saved = await context.repository.getSavedInvoiceById(context.invoiceId, context.ownerId);
  if (saved.status !== "sent") {
    throw new Error("Only sent invoices can receive reminders.");
  }
  if (
    invoiceSendIsBlocked({
      finishedInvoice: saved.invoiceData.finishedInvoice,
      sourceNote: saved.invoiceData.sourceNote
    })
  ) {
    throw new Error(SEND_BLOCKED_MESSAGE);
  }
  const timingByInvoice = await getInvoiceReminderTimingByInvoiceIds({
    ownerId: context.ownerId,
    invoiceIds: [context.invoiceId]
  });
  const timing = timingByInvoice[context.invoiceId];
  const recipientEmail = timing?.recipientEmail;
  if (!recipientEmail) {
    throw new Error("No recipient email found. Send the invoice first.");
  }
  if (timing.hasUnresolvedSend) {
    throw new Error(
      "This invoice has an unresolved delivery attempt. Reconcile or release it before sending reminders."
    );
  }

  // Slice 0 (§C): the reminder is a durable claim reserved BEFORE
  // dispatch, keyed by (invoice, recipient, reminder occurrence,
  // authorized revision). Candidate-list eligibility is not dispatch
  // authorization — fresh state is rechecked below.
  const authorizedRevision = saved.invoiceData.finishedInvoice.monetaryRevision;
  const priorReminderClaims = await countInvoiceDeliveryClaims({
    ownerId: context.ownerId,
    invoiceId: context.invoiceId,
    basePurpose: "reminder"
  });
  const reservation = await reserveInvoiceDeliveryClaim({
    ownerId: context.ownerId,
    invoiceId: context.invoiceId,
    recipientEmail,
    basePurpose: "reminder",
    purpose: `reminder_occurrence_${priorReminderClaims + 1}`,
    authorizedRevision
  });
  if (reservation.outcome === "blocked") {
    throw new Error(
      reservation.reason === "unresolved_send"
        ? "This invoice has an unresolved delivery attempt. Reconcile or release it before sending reminders."
        : "A delivery for this invoice is already in progress."
    );
  }
  const claim = reservation.claim;
  if (reservation.outcome === "existing") {
    // Idempotent replay of a reminder that already resolved: return its
    // recorded outcome and fresh state instead of sending again.
    if (claim.outcomeKind === "failed") {
      throw new Error("The previous reminder attempt failed. Retry the reminder run.");
    }
    const invoice = await context.repository.getSavedInvoiceById(context.invoiceId, context.ownerId);
    const delivery = await getInvoiceDeliverySummaryForInvoice({
      ownerId: context.ownerId,
      invoiceId: context.invoiceId
    });
    return {
      invoiceId: context.invoiceId,
      invoiceNumber: invoice.invoiceData.finishedInvoice.invoiceNumber ?? "Draft invoice",
      invoice,
      delivery,
      recipientEmail,
      mode: claim.mode ?? "record_only",
      provider: claim.provider ?? "none",
      warning: claim.outcomeKind === "recorded" ? "Email provider is not configured; delivery is tracked without sending." : undefined
    };
  }

  // Fresh authorization immediately before dispatch (invariant 1): the
  // invoice must still be sent, still addressed to the claimed
  // recipient's content, and still at the authorized revision.
  const fresh = await context.repository.getSavedInvoiceById(context.invoiceId, context.ownerId);
  if (fresh.status !== "sent" || fresh.invoiceData.finishedInvoice.monetaryRevision !== authorizedRevision) {
    await cancelInvoiceDeliveryClaim({
      ownerId: context.ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      reason: "stale_authorization"
    }).catch(() => undefined);
    throw new Error("Invoice changed before the reminder could be sent. Retry the reminder run.");
  }

  const trackingToken = randomUUID();
  await beginInvoiceDeliveryDispatch({
    ownerId: context.ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    trackingToken
  });
  const openTrackingPixelUrl = `${context.baseUrl}/api/invoices/${context.invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
  let sendResult;
  try {
    sendResult = await sendInvoiceEmail({
      recipientEmail,
      invoice: fresh.invoiceData.finishedInvoice,
      invoiceId: context.invoiceId,
      openTrackingPixelUrl,
      messageType: "reminder",
      idempotencyKey: claim.providerIdempotencyKey
    });
  } catch (error) {
    // §D outcome taxonomy: a definitive provider rejection (the
    // provider answered and refused the submission) is FAILED and
    // releases the ambiguity block; any other throw leaves acceptance
    // unprovable — UNKNOWN, blocking further sends until reconciled
    // or released, never a blind retry.
    const rejection = isDefinitiveProviderRejection(error) ? error : null;
    await recordInvoiceDeliveryClaimOutcome({
      ownerId: context.ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      outcome: rejection ? "failed" : "unknown",
      mode: "provider",
      provider: rejection ? rejection.provider : "none"
    }).catch(() => undefined);
    throw error;
  }
  const outcome = sendResult.mode === "provider" ? "accepted" : "recorded";
  await recordInvoiceDeliveryClaimOutcome({
    ownerId: context.ownerId,
    claimId: claim.claimId,
    generation: claim.generation,
    outcome,
    mode: sendResult.mode,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId
  });
  // Guarded completion only (no unconditional status write): an
  // already-sent invoice is a policy no-op, and a payment that landed
  // mid-flight is preserved exactly.
  const { invoice } =
    sendResult.mode === "provider"
      ? await context.repository.completeInvoiceDelivery({
          invoiceId: context.invoiceId,
          ownerId: context.ownerId,
          authorizedRevision
        })
      : { invoice: await context.repository.getSavedInvoiceById(context.invoiceId, context.ownerId) };
  const refreshedDelivery = await getInvoiceDeliverySummaryForInvoice({
    ownerId: context.ownerId,
    invoiceId: context.invoiceId
  });
  return {
    invoiceId: context.invoiceId,
    invoiceNumber: invoice.invoiceData.finishedInvoice.invoiceNumber ?? "Draft invoice",
    invoice,
    delivery: refreshedDelivery,
    recipientEmail,
    mode: sendResult.mode,
    provider: sendResult.provider,
    warning: sendResult.warning
  };
}

async function getInvoiceDeliverySummaryForInvoice(input: {
  ownerId: string;
  invoiceId: string;
}): Promise<DeliverySummary> {
  const summaries = await getInvoiceDeliverySummariesByInvoiceIds({
    ownerId: input.ownerId,
    invoiceIds: [input.invoiceId]
  });
  const summary = summaries[input.invoiceId];
  if (!summary) {
    throw new Error("Delivery summary missing after reminder send.");
  }
  return summary;
}

function normalizeInvoiceDueDate(value?: string | null): string | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) {
    return undefined;
  }
  const dateOnly = candidate.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1];
  if (!dateOnly || !DATE_ONLY_PATTERN.test(dateOnly)) {
    return undefined;
  }
  const parsed = Date.parse(`${dateOnly}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? dateOnly : undefined;
}

function normalizePositiveInteger(
  overrideValue: number | undefined,
  envValue: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const input = typeof overrideValue === "number" ? overrideValue : Number(envValue);
  if (!Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(input)));
}
