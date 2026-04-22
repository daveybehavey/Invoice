import { randomUUID } from "node:crypto";
import { SavedInvoice } from "../models/invoice.js";
import { SavedInvoiceRepository } from "./savedInvoiceRepository.js";
import { sendInvoiceEmail } from "./invoiceEmailDelivery.js";
import {
  DeliverySummary,
  getInvoiceDeliverySummariesByInvoiceIds,
  recordInvoiceDeliverySend
} from "./invoiceDeliveryStore.js";

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

export type ReminderCandidateReason = "past_due" | "follow_up_window" | "cooldown";

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
  const deliveryByInvoice = await getInvoiceDeliverySummariesByInvoiceIds({
    ownerId: context.ownerId,
    invoiceIds: sentInvoices.map((invoice) => invoice.invoiceId)
  });
  const due = sentInvoices
    .map((invoice) => {
      if (getInvoiceOpenBalance(invoice) <= 0) {
        return null;
      }
      const delivery = deliveryByInvoice[invoice.invoiceId];
      const recipientEmail = delivery?.recipientEmail;
      const sendCount = delivery?.sendCount ?? 0;
      const lastSentAt = delivery?.sentAt ?? invoice.updatedAt;
      if (!recipientEmail || !lastSentAt) {
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
      const saved = await context.repository.getSavedInvoiceById(candidate.invoiceId, context.ownerId);
      const trackingToken = randomUUID();
      const openTrackingPixelUrl = `${context.baseUrl}/api/invoices/${candidate.invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
      const sendResult = await sendInvoiceEmail({
        recipientEmail: candidate.recipientEmail,
        invoice: saved.invoiceData.finishedInvoice,
        invoiceId: candidate.invoiceId,
        openTrackingPixelUrl,
        messageType: "reminder"
      });
      await recordInvoiceDeliverySend({
        ownerId: context.ownerId,
        invoiceId: candidate.invoiceId,
        recipientEmail: candidate.recipientEmail,
        trackingToken,
        mode: sendResult.mode,
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId
      });
      const refreshedInvoice = await context.repository.updateSavedInvoiceStatus(
        candidate.invoiceId,
        "sent",
        context.ownerId
      );
      const deliverySummary = await getInvoiceDeliverySummaryForInvoice({
        ownerId: context.ownerId,
        invoiceId: candidate.invoiceId
      });
      results.push({
        invoiceId: candidate.invoiceId,
        invoiceNumber: candidate.invoiceNumber,
        recipientEmail: candidate.recipientEmail,
        sent: true,
        invoiceUpdatedAt: refreshedInvoice.updatedAt,
        delivery: deliverySummary,
        mode: sendResult.mode,
        provider: sendResult.provider
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
  const deliveryByInvoice = await getInvoiceDeliverySummariesByInvoiceIds({
    ownerId: context.ownerId,
    invoiceIds: [context.invoiceId]
  });
  const delivery = deliveryByInvoice[context.invoiceId];
  if (!delivery?.recipientEmail) {
    throw new Error("No recipient email found. Send the invoice first.");
  }
  const trackingToken = randomUUID();
  const openTrackingPixelUrl = `${context.baseUrl}/api/invoices/${context.invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
  const sendResult = await sendInvoiceEmail({
    recipientEmail: delivery.recipientEmail,
    invoice: saved.invoiceData.finishedInvoice,
    invoiceId: context.invoiceId,
    openTrackingPixelUrl,
    messageType: "reminder"
  });
  await recordInvoiceDeliverySend({
    ownerId: context.ownerId,
    invoiceId: context.invoiceId,
    recipientEmail: delivery.recipientEmail,
    trackingToken,
    mode: sendResult.mode,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId
  });
  const invoice = await context.repository.updateSavedInvoiceStatus(
    context.invoiceId,
    "sent",
    context.ownerId
  );
  const refreshedDelivery = await getInvoiceDeliverySummaryForInvoice({
    ownerId: context.ownerId,
    invoiceId: context.invoiceId
  });
  return {
    invoiceId: context.invoiceId,
    invoiceNumber: saved.invoiceData.finishedInvoice.invoiceNumber ?? "Draft invoice",
    invoice,
    delivery: refreshedDelivery,
    recipientEmail: delivery.recipientEmail,
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
