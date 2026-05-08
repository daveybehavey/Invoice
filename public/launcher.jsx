const { BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } = ReactRouterDOM;
const { useEffect, useState } = React;

const uiPrimitives = window.InvoiceUIPrimitives;
if (!uiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before /launcher.jsx.");
}

const {
  SparklesIcon,
  PencilIcon,
  UploadIcon,
  ArchiveIcon,
  SwatchIcon,
  FeedbackIcon,
  NotebookIcon
} = uiPrimitives;

const intakeFeatureUtils = window.InvoiceIntakeFeature;
if (!intakeFeatureUtils) {
  throw new Error(
    "Missing /features/intake/aiIntake.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { AIIntake } = intakeFeatureUtils;

const importFeatureUtils = window.InvoiceImportFeature;
if (!importFeatureUtils) {
  throw new Error(
    "Missing /features/import/importInvoice.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ImportInvoice } = importFeatureUtils;

const libraryFeatureUtils = window.InvoiceLibraryFeature;
if (!libraryFeatureUtils) {
  throw new Error(
    "Missing /features/library/invoiceLibrary.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { InvoiceLibrary } = libraryFeatureUtils;

const diagnosticsFeatureUtils = window.InvoiceDiagnosticsFeature;
if (!diagnosticsFeatureUtils) {
  throw new Error(
    "Missing /features/diagnostics/intakeDiagnostics.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { IntakeDiagnostics } = diagnosticsFeatureUtils;

const businessIdentityFeatureUtils = window.InvoiceBusinessIdentityFeature;
if (!businessIdentityFeatureUtils) {
  throw new Error(
    "Missing /features/settings/businessIdentity.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { BusinessIdentitySettings, ClientMemorySettings, ServiceCatalogSettings } = businessIdentityFeatureUtils;

const manualCanvasUtils = window.InvoiceManualCanvas;
if (!manualCanvasUtils) {
  throw new Error(
    "Missing /features/manual/manualInvoiceCanvas.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ManualInvoiceCanvas } = manualCanvasUtils;

const accountPlanUtils = window.InvoiceAccountPlanUtils;
if (!accountPlanUtils) {
  throw new Error("Missing /utils/accountPlan.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  formatPlanSummary,
  getPlanUpgradeUrl,
  getPlanBillingPortalUrl,
  getPlanPrelimitWarning,
  getPlanValuePitch,
  getPlanUsageModel
} =
  accountPlanUtils;
const billingActions = window.InvoiceBillingActions;
if (!billingActions) {
  throw new Error("Missing /utils/billingActions.js load. Ensure it is loaded before /launcher.jsx.");
}

const { hasStripeCheckout, hasStripePortal, startUpgradeCheckout, openBillingPortal } = billingActions;

const requestIdentity = window.InvoiceRequestIdentity;
if (!requestIdentity) {
  throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  apiFetch,
  getAuthSession,
  getGoogleAuthStartUrl,
  refreshSession,
  requestSignInLink,
  loadAuthProviders,
  completeEmailLinkSignIn,
  completeRedirectSignIn,
  signOut
} =
  requestIdentity;
const clientMemoryUtils = window.InvoiceClientMemory;
if (!clientMemoryUtils) {
  throw new Error("Missing /utils/clientMemory.js load. Ensure it is loaded before /launcher.jsx.");
}
const { getClientMemory, getClientRecurringInterval } = clientMemoryUtils;
const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
if (!lineItemLibraryUtils) {
  throw new Error("Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /launcher.jsx.");
}
const { getLineItemLibrary } = lineItemLibraryUtils;
const onboardingUtils = window.InvoiceOnboardingState;
if (!onboardingUtils) {
  throw new Error("Missing /utils/onboardingState.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  buildStatus: buildOnboardingStatus,
  activateWalkthrough: activateOnboardingWalkthrough,
  subscribe: subscribeToOnboardingState,
  acknowledgeCompletion: acknowledgeOnboardingCompletion
} = onboardingUtils;

const launcherSectionUtils = window.InvoiceLauncherSections;
if (!launcherSectionUtils) {
  throw new Error(
    "Missing /features/launcher/launcherSections.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const {
  AccountStrip,
  OperationsQueueSection,
  OnboardingSection,
  DraftRecoverySection,
  StartSection,
  AlternateStartsSection,
  ManageSection,
  AuthModal
} = launcherSectionUtils;
const launcherHelperUtils = window.InvoiceLauncherHelpers;
if (!launcherHelperUtils) {
  throw new Error(
    "Missing /features/launcher/launcherHelpers.js load. Ensure it is loaded before /launcher.jsx."
  );
}

const {
  readBillingNoticeFromUrl,
  isValidEmail,
  isDiagnosticsHost,
  buildLauncherOptions,
  buildPlanActionState,
  hasResumeDraftForKey
} = launcherHelperUtils;
const scratchpadUtils = window.InvoiceScratchpadPage;
if (!scratchpadUtils) {
  throw new Error(
    "Missing /features/scratchpad/dailyScratchpad.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}
const { DailyScratchpadPage } = scratchpadUtils;
const portalFeatureUtils = window.InvoicePortalFeature;
if (!portalFeatureUtils) {
  throw new Error("Missing /features/portal/clientPortal.jsx load. Ensure it is loaded before /launcher.jsx.");
}
const { ClientPortalPage } = portalFeatureUtils;
const intakeReadinessUtils = window.InvoiceIntakeReadiness;
if (!intakeReadinessUtils) {
  throw new Error("Missing /features/intake/readiness.js load. Ensure it is loaded before /launcher.jsx.");
}

const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;

function deriveTaxRate(invoice) {
  if (!invoice) {
    return "0";
  }
  const subtotal = Number(invoice.subtotal);
  const total = Number(invoice.total);
  if (!Number.isFinite(subtotal) || !Number.isFinite(total) || subtotal <= 0) {
    return "0";
  }
  const taxAmount = total - subtotal;
  if (taxAmount <= 0) {
    return "0";
  }
  return ((taxAmount / subtotal) * 100).toFixed(2);
}

function parseDisplayTimestamp(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const AUTH_PENDING_RETURN_PATH_STORAGE_KEY = "invoiceAuthPendingReturnPath";

function sanitizeInternalAppPath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  try {
    const parsed = new URL(raw, "https://notebill.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return "/";
  }
}

function writePendingAuthReturnPath(value) {
  const nextPath = sanitizeInternalAppPath(value);
  try {
    window.sessionStorage.setItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY, nextPath);
  } catch (_error) {
    // Best-effort only.
  }
  return nextPath;
}

function consumePendingAuthReturnPath() {
  try {
    const stored = window.sessionStorage.getItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY);
    return sanitizeInternalAppPath(stored);
  } catch (_error) {
    return "/";
  }
}

function describeAuthReturnPath(value) {
  const path = sanitizeInternalAppPath(value);
  if (path.startsWith("/settings/business")) {
    return "After sign-in, you'll go straight to branding setup.";
  }
  if (path.startsWith("/settings/memory")) {
    return "After sign-in, you'll go straight to client memory review.";
  }
  if (path.startsWith("/settings/services")) {
    return "After sign-in, you'll go straight to the service catalog.";
  }
  if (path.startsWith("/manual")) {
    return "After sign-in, you'll return to the invoice editor.";
  }
  if (path.startsWith("/invoices")) {
    return "After sign-in, you'll return to the invoice library.";
  }
  if (path.startsWith("/ai-intake")) {
    return "After sign-in, you'll return to Billie intake.";
  }
  return "After sign-in, you'll come right back here.";
}

function getInvoiceDueDateValue(invoice) {
  return invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "";
}

function getInvoiceOpenBalance(invoice) {
  const amount = Number(
    invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? invoice?.total
  );
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

function formatUpdatedLabel(value) {
  if (!value) {
    return "";
  }
  const parsed = parseDisplayTimestamp(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const date = new Date(parsed);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }
  const parsed = parseDisplayTimestamp(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyLabel(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}

function parseRecurringTimestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function readRecurringSchedules(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    const entries =
      parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : {};
    return Object.entries(entries).reduce((nextEntries, [invoiceId, entry]) => {
      if (!invoiceId || !entry || typeof entry !== "object") {
        return nextEntries;
      }
      const intervalDays = normalizeRecurringInterval(entry.intervalDays);
      const nextDueAt = new Date(parseRecurringTimestamp(entry.nextDueAt)).toISOString();
      nextEntries[invoiceId] = {
        intervalDays,
        nextDueAt
      };
      return nextEntries;
    }, {});
  } catch (_error) {
    return {};
  }
}

function buildRepeatWorkStarter(clientMemoryEntries, savedLineItems) {
  const memoryEntries = Array.isArray(clientMemoryEntries) ? clientMemoryEntries : [];
  const items = Array.isArray(savedLineItems) ? savedLineItems : [];
  const candidates = memoryEntries
    .map((entry) => {
      const normalizedName = typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : "";
      if (!normalizedName) {
        return null;
      }
      const matchingItems = items
        .filter((item) => typeof item?.clientName === "string" && item.clientName.trim().toLowerCase() === normalizedName)
        .sort((left, right) => {
          const usageDelta = Number(right?.usageCount ?? 0) - Number(left?.usageCount ?? 0);
          if (usageDelta !== 0) {
            return usageDelta;
          }
          return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
        });
      if (!matchingItems.length) {
        return null;
      }
      return {
        entry,
        leadItem: matchingItems[0],
        savedItemCount: matchingItems.length
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(right.entry?.updatedAt ?? "").localeCompare(String(left.entry?.updatedAt ?? "")));
  return candidates[0] ?? null;
}

function buildRepeatWorkStarterForClient(clientName, clientMemoryEntries, savedLineItems) {
  const normalizedTarget = typeof clientName === "string" ? clientName.trim().toLowerCase() : "";
  if (!normalizedTarget) {
    return null;
  }
  return (
    (Array.isArray(clientMemoryEntries) ? clientMemoryEntries : [])
      .map((entry) => {
        const normalizedName = typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : "";
        if (!normalizedName || normalizedName !== normalizedTarget) {
          return null;
        }
        const matchingItems = (Array.isArray(savedLineItems) ? savedLineItems : [])
          .filter((item) => typeof item?.clientName === "string" && item.clientName.trim().toLowerCase() === normalizedTarget)
          .sort((left, right) => {
            const usageDelta = Number(right?.usageCount ?? 0) - Number(left?.usageCount ?? 0);
            if (usageDelta !== 0) {
              return usageDelta;
            }
            return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
          });
        if (!matchingItems.length) {
          return null;
        }
        return {
          entry,
          leadItem: matchingItems[0],
          savedItemCount: matchingItems.length
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(right.entry?.updatedAt ?? "").localeCompare(String(left.entry?.updatedAt ?? "")))[0] ?? null
  );
}

function normalizeRecurringInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1) {
    return 30;
  }
  return Math.min(rounded, 365);
}

function formatRecurringCadence(intervalDays) {
  const normalized = normalizeRecurringInterval(intervalDays);
  if (normalized === 7) {
    return "weekly";
  }
  if (normalized === 14) {
    return "biweekly";
  }
  if (normalized === 30) {
    return "monthly";
  }
  return `${normalized}-day`;
}

function buildBillieWorkspaceStarterInstruction(finishedInvoice, defaultInstruction) {
  const hasLineItems = Array.isArray(finishedInvoice?.lineItems)
    ? finishedInvoice.lineItems.some(
        (lineItem) => typeof lineItem?.description === "string" && lineItem.description.trim()
      )
    : false;
  const hasNotes = typeof finishedInvoice?.notes === "string" && finishedInvoice.notes.trim().length > 0;
  if (hasLineItems && hasNotes) {
    return (
      defaultInstruction ||
      "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
    );
  }
  if (hasLineItems) {
    return "Refine the invoice wording so this saved draft feels polished and client-ready. Keep numbers unchanged.";
  }
  if (hasNotes) {
    return "Refine the notes so this saved draft feels polished and client-ready. Keep numbers unchanged.";
  }
  return "Refine the client-facing wording and presentation while keeping numbers unchanged.";
}

function buildLauncherPostReminderNextStepNotice(invoice) {
  const paymentLinkReady = Boolean(String(invoice?.paymentLinkUrl ?? "").trim());
  const deliveryOpened = Boolean(invoice?.delivery?.openedAt) || invoice?.delivery?.status === "opened";
  const dueDateValue = getInvoiceDueDateValue(invoice);
  const dueDateMs = toTimestamp(dueDateValue);
  const isPastDue =
    invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs > 0 && dueDateMs <= Date.now();

  if (!paymentLinkReady) {
    return "Next: add a hosted payment link so the follow-up points to an easier payment path.";
  }
  if (isPastDue && deliveryOpened) {
    return "Next: watch for payment and mark it paid as soon as the money lands.";
  }
  if (isPastDue && !deliveryOpened) {
    return "Next: if it still stays unopened, re-send it or confirm the best delivery route.";
  }
  return "Next: watch for a reply or payment before nudging again.";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const RECURRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function buildLauncherOperationsSummary(invoices, options = {}, nowMs = Date.now()) {
  const activeInvoices = Array.isArray(invoices)
    ? invoices.filter((invoice) => invoice && invoice.status !== "deleted")
    : [];
  const clientMemoryEntries = Array.isArray(options?.clientMemoryEntries) ? options.clientMemoryEntries : [];
  const savedLineItems = Array.isArray(options?.savedLineItems) ? options.savedLineItems : [];
  const recurringSchedulesByInvoiceId =
    options?.recurringSchedulesByInvoiceId && typeof options.recurringSchedulesByInvoiceId === "object"
      ? options.recurringSchedulesByInvoiceId
      : {};
  const resolveRecurringInterval =
    typeof options?.getRecurringInterval === "function" ? options.getRecurringInterval : () => null;
  const byUpdatedDesc = (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
  const drafts = activeInvoices.filter((invoice) => invoice.status === "draft").sort(byUpdatedDesc);
  const sent = activeInvoices.filter((invoice) => invoice.status === "sent").sort(byUpdatedDesc);
  const unpaidSent = sent.filter((invoice) => getInvoiceOpenBalance(invoice) > 0);
  const paid = activeInvoices.filter((invoice) => invoice.status === "paid").sort(byUpdatedDesc);
  const recurringReminderInvoices = activeInvoices
    .map((invoice) => {
      const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId];
      if (!recurringEntry) {
        return null;
      }
      return {
        ...invoice,
        recurringEntry,
        nextDueMs: parseRecurringTimestamp(recurringEntry.nextDueAt)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.nextDueMs - right.nextDueMs);
  const dueRecurringInvoices = recurringReminderInvoices.filter((invoice) => invoice.nextDueMs <= nowMs);
  const upcomingRecurringInvoices = recurringReminderInvoices.filter(
    (invoice) => invoice.nextDueMs > nowMs && invoice.nextDueMs - nowMs <= RECURRING_SOON_WINDOW_MS
  );
  const nextRecurringCandidate = (dueRecurringInvoices[0] ?? recurringReminderInvoices[0]) || null;
  const staleSent = unpaidSent
    .map((invoice) => {
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = toTimestamp(dueDateValue);
      const daysSinceUpdate = Math.max(0, Math.floor((nowMs - toTimestamp(invoice.updatedAt)) / 86400000));
      const isPastDue = dueDateMs > 0 && dueDateMs <= nowMs;
      return {
        invoice,
        daysSinceUpdate,
        dueDateValue,
        dueDateMs,
        isPastDue
      };
    })
    .filter((entry) => entry.isPastDue || entry.daysSinceUpdate >= 14)
    .sort((a, b) => {
      if (a.isPastDue !== b.isPastDue) {
        return a.isPastDue ? -1 : 1;
      }
      if (a.isPastDue && b.isPastDue) {
        return a.dueDateMs - b.dueDateMs;
      }
      return b.daysSinceUpdate - a.daysSinceUpdate;
    });
  const paymentLinkInvoice = unpaidSent.find((invoice) => invoice.paymentLinkUrl);
  const repeatCandidate = paid[0];
  const openBalance = unpaidSent.reduce((sum, invoice) => sum + getInvoiceOpenBalance(invoice), 0);
  const actions = [];
  const latestDraft = drafts[0];
  if (latestDraft) {
    actions.push({
      id: `resume:${latestDraft.invoiceId}`,
      tone: "draft",
      title: "Resume latest draft",
      detail: `${latestDraft.invoiceNumber || "Draft invoice"} was updated ${
        formatUpdatedLabel(latestDraft.updatedAt) || "recently"
      }.`,
      cta: "Resume draft",
      ariaLabel: `Resume ${latestDraft.invoiceNumber || "draft invoice"}`,
      action: "resume-draft",
      invoiceId: latestDraft.invoiceId,
      secondaryCta: "Open with Billie",
      secondaryAction: "resume-with-billie",
      secondaryAriaLabel: `Open ${latestDraft.invoiceNumber || "draft invoice"} with Billie`,
      secondaryBusyId: `resume-billie:${latestDraft.invoiceId}`
    });
  }
  if (staleSent[0]) {
    const { invoice, daysSinceUpdate, dueDateValue, isPastDue } = staleSent[0];
    const delivery = invoice?.delivery ?? null;
    const reminderRecipient = delivery?.recipientEmail ?? "";
    const hasTrackedDelivery = Boolean(delivery?.recipientEmail) && Boolean(delivery?.sentAt);
    const deliveryOpened = Boolean(delivery?.openedAt) || delivery?.status === "opened";
    const canSendReminder = reminderRecipient.trim().length > 0;
    const dueDateLabel = formatUpdatedLabel(dueDateValue);
    const openBalanceLabel = formatMoneyLabel(getInvoiceOpenBalance(invoice));
    const overdueLabel =
      isPastDue && dueDateLabel
        ? `${invoice.invoiceNumber || "Sent invoice"} was due ${dueDateLabel}.`
        : `${invoice.invoiceNumber || "Sent invoice"} has been open for ${daysSinceUpdate} days.`;
    let followUpTitle = "Follow up on sent invoice";
    let followUpDetail = `${overdueLabel} Open balance: ${openBalanceLabel}.`;
    let followUpCta = canSendReminder ? "Send reminder" : "Review follow-ups";
    let followUpAction = canSendReminder ? "send-reminder" : "open-library";
    let followUpBusyId = canSendReminder ? `reminder:${invoice.invoiceId}` : undefined;
    let followUpAriaLabel = canSendReminder
      ? `Send reminder for ${invoice.invoiceNumber || "sent invoice"}`
      : undefined;
    if (!hasTrackedDelivery) {
      followUpTitle = "Track delivery for sent invoice";
      followUpDetail = `${overdueLabel} Delivery is not being tracked yet, so reminders and payment follow-up still have weaker context.`;
      followUpCta = "Review send flow";
      followUpAction = "open-library";
      followUpBusyId = undefined;
      followUpAriaLabel = undefined;
    } else if (isPastDue && !deliveryOpened) {
      followUpTitle = "Re-send or confirm delivery";
      followUpDetail = `${overdueLabel} The client still has not opened it. Re-send it or confirm delivery before escalating into a payment reminder.`;
      followUpCta = "Review delivery";
      followUpAction = "open-library";
      followUpBusyId = undefined;
      followUpAriaLabel = undefined;
    } else if (isPastDue && deliveryOpened) {
      followUpTitle = "Send focused reminder";
      followUpDetail = `${overdueLabel} The client already opened it, so a focused reminder is the best next step.`;
      followUpCta = canSendReminder ? "Send focused reminder" : "Review follow-ups";
      followUpAction = canSendReminder ? "send-reminder" : "open-library";
      followUpBusyId = canSendReminder ? `reminder:${invoice.invoiceId}` : undefined;
      followUpAriaLabel = canSendReminder
        ? `Send reminder for ${invoice.invoiceNumber || "sent invoice"}`
        : undefined;
    } else if (canSendReminder) {
      followUpDetail = `${overdueLabel} Open balance: ${openBalanceLabel}. Last sent to ${reminderRecipient}.`;
    }
    actions.push({
      id: `follow-up:${invoice.invoiceId}`,
      tone: "follow-up",
      title: followUpTitle,
      detail: followUpDetail,
      cta: followUpCta,
      ariaLabel: followUpAriaLabel,
      action: followUpAction,
      busyId: followUpBusyId,
      secondaryCta: "Mark paid",
      secondaryAction: "mark-paid",
      secondaryAriaLabel: `Mark ${invoice.invoiceNumber || "sent invoice"} paid`,
      secondaryBusyId: `mark-paid:${invoice.invoiceId}`,
      invoiceId: invoice.invoiceId
    });
  } else if (unpaidSent.length > 0) {
    actions.push({
      id: "sent:review",
      tone: "sent",
      title: "Track sent invoices",
      detail: `${pluralize(unpaidSent.length, "sent invoice")} still ${
        unpaidSent.length === 1 ? "needs" : "need"
      } payment tracking. Open balance: ${formatMoneyLabel(openBalance)}.`,
      cta: "Open sent work",
      action: "open-library"
    });
  }
  if (nextRecurringCandidate) {
    const dueLabel = formatUpdatedLabel(nextRecurringCandidate.recurringEntry?.nextDueAt);
    const recurringIsDueNow = nextRecurringCandidate.nextDueMs <= nowMs;
    const recurringIsSoon =
      !recurringIsDueNow && nextRecurringCandidate.nextDueMs - nowMs <= RECURRING_SOON_WINDOW_MS;
    const recurringMemoryStarter = buildRepeatWorkStarterForClient(
      nextRecurringCandidate.customerName ?? "",
      clientMemoryEntries,
      savedLineItems
    );
    const recurringMemoryLabel = recurringMemoryStarter?.leadItem?.description || "";
    actions.push({
      id: `recurring:${nextRecurringCandidate.invoiceId}`,
      tone: recurringIsDueNow ? "repeat-due" : recurringIsSoon ? "repeat-soon" : "repeat",
      title: recurringIsDueNow
        ? "Recurring invoice due now"
        : recurringIsSoon
          ? "Recurring invoice due soon"
          : "Recurring invoice coming up",
      detail: recurringIsDueNow
        ? `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
            nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
          } is due${dueLabel ? ` ${dueLabel}` : " soon"}. Reopen it now so the repeat job keeps moving.`
        : recurringIsSoon
          ? `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
              nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
            } is next due${dueLabel ? ` ${dueLabel}` : " soon"}. Start it early so the repeat job is ready before it lands on you.${
              recurringMemoryLabel ? ` Saved ${recurringMemoryLabel} memory is ready too.` : ""
            }`
          : `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
              nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
            } is next due${dueLabel ? ` ${dueLabel}` : " soon"}. Open it early if you want a head start.${
              recurringMemoryLabel ? ` Saved ${recurringMemoryLabel} memory is ready too.` : ""
            }`,
      cta: recurringIsDueNow ? "Open repeat invoice" : recurringIsSoon ? "Prep repeat invoice" : "Start early",
      ariaLabel: `Open repeat invoice from ${nextRecurringCandidate.invoiceNumber || "saved invoice"}`,
      action: "invoice-again",
      busyId: `invoice-again:${nextRecurringCandidate.invoiceId}`,
      invoiceId: nextRecurringCandidate.invoiceId,
      secondaryCta: recurringMemoryStarter ? "Start from memory" : undefined,
      secondaryAction: recurringMemoryStarter ? "start-from-memory" : undefined,
      secondaryAriaLabel: recurringMemoryStarter
        ? `Start upcoming repeat invoice from saved memory for ${
            nextRecurringCandidate.customerName || "repeat client"
          }`
        : undefined,
      memoryClientName: recurringMemoryStarter?.entry?.name || ""
    });
  }
  if (repeatCandidate) {
    const repeatMemoryStarter = buildRepeatWorkStarterForClient(
      repeatCandidate.customerName ?? "",
      clientMemoryEntries,
      savedLineItems
    );
    const repeatRecurringInterval = resolveRecurringInterval(repeatCandidate.customerName ?? "");
    const repeatRecurringLabel = repeatRecurringInterval ? formatRecurringCadence(repeatRecurringInterval) : "";
    const repeatMemoryLabel = repeatMemoryStarter?.leadItem?.description || "";
    let repeatDetail = `Start a fresh editable draft from ${
      repeatCandidate.invoiceNumber || "a paid invoice"
    }${repeatCandidate.customerName ? ` for ${repeatCandidate.customerName}` : ""}.`;
    if (repeatRecurringLabel && repeatMemoryLabel) {
      repeatDetail += ` Saved ${repeatRecurringLabel} cadence and ${repeatMemoryLabel} memory are ready.`;
    } else if (repeatRecurringLabel) {
      repeatDetail += ` Saved ${repeatRecurringLabel} cadence is ready for the next job.`;
    } else if (repeatMemoryLabel) {
      repeatDetail += ` Saved ${repeatMemoryLabel} memory is ready to prefill the next draft.`;
    }
    actions.push({
      id: `invoice-again:${repeatCandidate.invoiceId}`,
      tone: "repeat",
      title: "Invoice a repeat client",
      detail: repeatDetail,
      cta: "Invoice again",
      ariaLabel: `Invoice again from ${repeatCandidate.invoiceNumber || "paid invoice"}`,
      action: "invoice-again",
      busyId: `invoice-again:${repeatCandidate.invoiceId}`,
      invoiceId: repeatCandidate.invoiceId,
      secondaryCta: repeatMemoryStarter ? "Start from memory" : undefined,
      secondaryAction: repeatMemoryStarter ? "start-from-memory" : undefined,
      secondaryAriaLabel: repeatMemoryStarter
        ? `Start from saved memory for ${repeatCandidate.customerName || "repeat client"}`
        : undefined,
      memoryClientName: repeatMemoryStarter?.entry?.name || ""
    });
  }
  if (paymentLinkInvoice?.paymentLinkUrl) {
    actions.push({
      id: `pay-link:${paymentLinkInvoice.invoiceId}`,
      tone: "payment",
      title: "Hosted payment link ready",
      detail: `${paymentLinkInvoice.invoiceNumber || "Invoice"} has a hosted payment link.`,
      cta: "Open hosted payment link",
      href: paymentLinkInvoice.paymentLinkUrl,
      action: "open-link"
    });
  }
  const actionRank = {
    "follow-up": 0,
    "repeat-due": 1,
    "repeat-soon": 2,
    draft: 3,
    payment: 4,
    repeat: 5,
    sent: 6
  };
  const recurringDueCount = dueRecurringInvoices.length;
  const recurringSoonCount = upcomingRecurringInvoices.length;
  const nextRecurringSoon = upcomingRecurringInvoices[0] ?? null;
  const nextRecurringSoonLabel = formatUpdatedLabel(nextRecurringSoon?.recurringEntry?.nextDueAt);
  return {
    hasInvoices: activeInvoices.length > 0,
    invoiceCount: activeInvoices.length,
    draftCount: drafts.length,
    sentCount: sent.length,
    paidCount: paid.length,
    staleSentCount: staleSent.length,
    recurringDueCount,
    recurringSoonCount,
    openBalance,
    openBalanceLabel: formatMoneyLabel(openBalance),
    headline:
      staleSent.length > 0
        ? `${staleSent.length === 1 ? "1 invoice needs" : `${staleSent.length} invoices need`} follow-up.`
        : recurringDueCount > 0
          ? `${recurringDueCount === 1 ? "1 recurring invoice is due now." : `${recurringDueCount} recurring invoices are due now.`}`
        : recurringSoonCount > 0
          ? `${
              recurringSoonCount === 1
                ? `1 recurring invoice is due soon${nextRecurringSoonLabel ? ` on ${nextRecurringSoonLabel}` : ""}.`
                : `${recurringSoonCount} recurring invoices are due soon.`
            }`
        : unpaidSent.length > 0
          ? `${formatMoneyLabel(openBalance)} open across ${pluralize(unpaidSent.length, "sent invoice")}.`
          : drafts.length > 0
            ? `${pluralize(drafts.length, "draft")} waiting to finish.`
            : "All caught up.",
    actions: actions
      .sort((left, right) => (actionRank[left.tone] ?? 99) - (actionRank[right.tone] ?? 99))
      .slice(0, 3)
  };
}

function Launcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [onboardingStatus, setOnboardingStatus] = useState(() =>
    buildOnboardingStatus({ authSession: getAuthSession?.() ?? null })
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authEmailError, setAuthEmailError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authPreviewUrl, setAuthPreviewUrl] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authFlow, setAuthFlow] = useState("");
  const [authError, setAuthError] = useState("");
  const [authProviders, setAuthProviders] = useState([]);
  const [authProvidersBusy, setAuthProvidersBusy] = useState(false);
  const [authProvidersError, setAuthProvidersError] = useState("");
  const [authSuccessNotice, setAuthSuccessNotice] = useState("");
  const [authReturnPath, setAuthReturnPath] = useState("/");
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingNotice, setBillingNotice] = useState(null);
  const showDiagnosticsLink =
    typeof window !== "undefined" && isDiagnosticsHost(window.location.hostname);

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    if (authSession?.userId) {
      return;
    }
    if (searchParams.get("auth") !== "sign-in") {
      return;
    }
    const requestedReturnPath = sanitizeInternalAppPath(searchParams.get("returnTo"));
    openSignInModal({ returnTo: requestedReturnPath });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("auth");
    nextParams.delete("returnTo");
    setSearchParams(nextParams, { replace: true });
  }, [authSession?.userId, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) {
          return;
        }
        setAuthSession(session);
        try {
          const rawNotice = window.sessionStorage.getItem("invoiceAuthJustSignedIn");
          if (rawNotice) {
            const parsed = JSON.parse(rawNotice);
            const email = typeof parsed?.email === "string" ? parsed.email.trim() : session?.email ?? "";
            const provider = parsed?.provider === "google" ? "Google Sign-In" : "email link";
            setAuthSuccessNotice(
              email
                ? `Signed in as ${email} with ${provider}. Setup progress is now tied to your account.`
                : "Signed in. Setup progress is now tied to your account."
            );
            window.sessionStorage.removeItem("invoiceAuthJustSignedIn");
          }
        } catch (_error) {
          window.sessionStorage.removeItem("invoiceAuthJustSignedIn");
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAuthSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setOnboardingStatus(buildOnboardingStatus({ authSession }));
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    const unsubscribe = subscribeToOnboardingState(() => {
      setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
    });
    const handleFocus = () => {
      setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const response = await apiFetch("/api/account/plan");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setAccountPlan(null);
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      } catch (_error) {
        if (!active) {
          return;
        }
        setAccountPlan(null);
      }
    };
    loadPlan();
    return () => {
      active = false;
    };
  }, [authSession?.userId]);

  useEffect(() => {
    if (!authModalOpen) {
      return undefined;
    }
    const handleKeydown = (event) => {
      if (event.key === "Escape" && !authBusy) {
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [authModalOpen, authBusy]);

  useEffect(() => {
    if (!authModalOpen) {
      return undefined;
    }
    let active = true;
    setAuthProvidersBusy(true);
    setAuthProvidersError("");
    loadAuthProviders()
      .then((providers) => {
        if (!active) {
          return;
        }
        setAuthProviders(Array.isArray(providers) ? providers : []);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAuthProviders([]);
        setAuthProvidersError(error?.message || "Couldn't load sign-in options.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setAuthProvidersBusy(false);
      });
    return () => {
      active = false;
    };
  }, [authModalOpen]);

  const handleSignIn = async () => {
    const emailLinkProvider = Array.isArray(authProviders)
      ? authProviders.find((provider) => provider?.id === "email_link")
      : null;
    if (emailLinkProvider && !emailLinkProvider.available) {
      const message = emailLinkProvider.warning || "Email sign-in isn't available right now.";
      setAuthError(message);
      setAuthEmailError(message);
      return;
    }
    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthEmailError("Enter your email.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setAuthEmailError("Enter a valid email address.");
      return;
    }
    setAuthBusy(true);
    setAuthFlow("email_link");
    setAuthError("");
    setAuthEmailError("");
    setAuthNotice("");
    setAuthPreviewUrl("");
    try {
      writePendingAuthReturnPath(authReturnPath);
      const payload = await requestSignInLink(normalizedEmail);
      const notice = payload?.emailSent
        ? `Check ${normalizedEmail} for your secure sign-in link.`
        : payload?.previewUrl
          ? "Email delivery is not configured here, so a preview sign-in link is available below."
          : "If the address is valid, a sign-in link is on the way.";
      setAuthNotice(notice);
      setAuthPreviewUrl(typeof payload?.previewUrl === "string" ? payload.previewUrl : "");
      setAuthEmail("");
    } catch (error) {
      const message = error?.message || "Sign in failed.";
      setAuthError(message);
      setAuthEmailError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = () => {
    const googleProvider = Array.isArray(authProviders)
      ? authProviders.find((provider) => provider?.id === "google")
      : null;
    if (!googleProvider?.available) {
      const message = googleProvider?.warning || "Google Sign-In isn't available right now.";
      setAuthError(message);
      setAuthNotice("");
      return;
    }
    setAuthBusy(true);
    setAuthFlow("google");
    setAuthError("");
    setAuthNotice("Opening Google Sign-In...");
    setAuthPreviewUrl("");
    try {
      const returnPath = writePendingAuthReturnPath(authReturnPath);
      const startUrl =
        typeof getGoogleAuthStartUrl === "function"
          ? getGoogleAuthStartUrl(returnPath)
          : `/api/auth/google/start?returnTo=${encodeURIComponent(returnPath)}`;
      window.location.assign(String(startUrl));
    } catch (error) {
      setAuthBusy(false);
      setAuthFlow("");
      setAuthNotice("");
      setAuthError(error?.message || "Couldn't start Google Sign-In.");
    }
  };

  const resolveSetupContinuationPath = () => {
    const nextSetupAfterSignIn = Array.isArray(onboardingStatus?.setupSteps)
      ? onboardingStatus.setupSteps.find((step) => !step.complete && step.id !== "sign_in")
      : null;
    if (!nextSetupAfterSignIn?.routeHint) {
      return "/";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/business") {
      return "/settings/business?from=onboarding-complete";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/memory") {
      return "/settings/memory?from=onboarding-complete";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/services") {
      return "/settings/services?from=onboarding-complete";
    }
    return "/";
  };

  const deriveDefaultAuthReturnPath = () => {
    const currentPath = sanitizeInternalAppPath(`${location.pathname}${location.search}${location.hash}`);
    if (currentPath !== "/") {
      return currentPath;
    }
    if (onboardingStatus?.setupNextStep?.id === "sign_in" || onboardingStatus?.setupVisible || onboardingStatus?.completionVisible) {
      return resolveSetupContinuationPath();
    }
    return "/";
  };

  const openSignInModal = (options = {}) => {
    const returnPath = sanitizeInternalAppPath(options?.returnTo || deriveDefaultAuthReturnPath());
    setAuthError("");
    setAuthEmailError("");
    setAuthNotice("");
    setAuthPreviewUrl("");
    setAuthFlow("");
    setAuthProvidersError("");
    setAuthReturnPath(returnPath);
    setAuthEmail(authSession?.email ?? "");
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccessNotice("");
    try {
      await signOut();
      setAuthSession(null);
    } catch (error) {
      setAuthError(error?.message || "Sign out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const options = buildLauncherOptions({
    navigate,
    icons: {
      sparkles: <SparklesIcon />,
      notebook: <NotebookIcon />,
      upload: <UploadIcon />,
      pencil: <PencilIcon />,
      archive: <ArchiveIcon />,
      swatch: <SwatchIcon />,
      feedback: <FeedbackIcon />
    }
  });
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planAtLimit = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const planPitch = getPlanValuePitch(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const billingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const {
    useStripeUpgradeAction,
    useStripePortalAction,
    showUpgradeAction,
    showBillingPortalAction,
    hasPlanActions
  } = buildPlanActionState({
    accountPlan,
    upgradeUrl,
    billingPortalUrl,
    hasStripeCheckout,
    hasStripePortal
  });
  const draftStorageKey = requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
  const billieWorkspaceStorageKey =
    requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";
  const [hasResumeDraft, setHasResumeDraft] = useState(false);
  const [showAlternateStarts, setShowAlternateStarts] = useState(false);
  const [showPlanActions, setShowPlanActions] = useState(false);
  const [showManageOptions, setShowManageOptions] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [draftRecoveryItems, setDraftRecoveryItems] = useState([]);
  const [draftRecoveryLoading, setDraftRecoveryLoading] = useState(false);
  const [operationsSummary, setOperationsSummary] = useState(() =>
    buildLauncherOperationsSummary([])
  );
  const [resumeDraftBusyId, setResumeDraftBusyId] = useState("");
  const [operationsBusyActionId, setOperationsBusyActionId] = useState("");
  const [operationsNotice, setOperationsNotice] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [savedWorkRefreshToken, setSavedWorkRefreshToken] = useState(0);
  const clientMemoryEntries = getClientMemory?.() ?? [];
  const savedLineItems = getLineItemLibrary?.() ?? [];
  const repeatWorkStarter = buildRepeatWorkStarter(clientMemoryEntries, savedLineItems);
  const primaryOption = (() => {
    const primaryAction = Array.isArray(operationsSummary?.actions) ? operationsSummary.actions[0] : null;
    if (primaryAction) {
      if (primaryAction.action === "resume-draft") {
        return {
          key: "resume-draft",
          title: primaryAction.title || "Resume latest draft",
          description: primaryAction.detail || "Pick up where you left off.",
          icon: <NotebookIcon />,
          onClick: () => handleResumeSavedDraft(primaryAction.invoiceId),
          disabled: Boolean(resumeDraftBusyId && resumeDraftBusyId === primaryAction.invoiceId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "send-reminder") {
        return {
          key: "send-reminder",
          title: primaryAction.title || "Follow up on sent invoice",
          description: primaryAction.detail || "Send a reminder for an open invoice.",
          icon: <FeedbackIcon />,
          onClick: () => handleLauncherSendReminder(primaryAction.invoiceId),
          disabled:
            Boolean(operationsBusyActionId) || Boolean(primaryAction.busyId && operationsBusyActionId === primaryAction.busyId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "invoice-again") {
        return {
          key: "invoice-again",
          title: primaryAction.title || "Invoice a repeat client",
          description: primaryAction.detail || "Start a fresh draft from a paid invoice.",
          icon: <SparklesIcon />,
          onClick: () => handleLauncherInvoiceAgain(primaryAction.invoiceId),
          disabled: Boolean(operationsBusyActionId && primaryAction.busyId && operationsBusyActionId === primaryAction.busyId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "open-link" && primaryAction.href) {
        return {
          key: "payment-link",
          title: primaryAction.title || "Hosted payment link ready",
          description: primaryAction.detail || "Open the payment link when you're ready.",
          icon: <UploadIcon />,
          onClick: () => window.open(primaryAction.href, "_blank", "noreferrer"),
          disabled: false,
          badge: "Next up"
        };
      }
      return {
        key: "open-library",
        title: primaryAction.title || "Review sent invoices",
        description: primaryAction.detail || "Open the library for the next step.",
        icon: <ArchiveIcon />,
        onClick: () => navigate("/invoices"),
        disabled: false,
        badge: "Next up"
      };
    }
    return operationsSummary?.hasInvoices
      ? options.find((option) => option.key === "ai") ?? options[0]
      : options.find((option) => option.key === "ai") ??
        options.find((option) => option.key === "scratchpad") ??
        options[0];
  })();
  const handleStartFromMemory = () => {
    if (!repeatWorkStarter?.entry || !repeatWorkStarter?.leadItem) {
      navigate("/manual");
      return;
    }
    const draft = {
      billToDetails: repeatWorkStarter.entry.details || repeatWorkStarter.entry.name || "",
      notes: repeatWorkStarter.entry.defaultNotes || "",
      lineItems: [
        {
          id: `line-${Date.now()}`,
          description: repeatWorkStarter.leadItem.description || "",
          qty: repeatWorkStarter.leadItem.qty ?? "",
          rate: repeatWorkStarter.leadItem.rate ?? ""
        }
      ],
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_memory_reused",
        source: "launcher_repeat_bundle_reuse"
      })
    }).catch(() => {});
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "service_memory_reused",
        source: "launcher_repeat_bundle_reuse"
      })
    }).catch(() => {});
    navigate("/manual");
  };
  const handleStartFromMemoryForClient = (clientName, fallbackInvoiceId = "") => {
    const specificStarter = buildRepeatWorkStarterForClient(clientName, getClientMemory?.() ?? [], getLineItemLibrary?.() ?? []);
    if (!specificStarter?.entry || !specificStarter?.leadItem) {
      if (fallbackInvoiceId) {
        void handleLauncherInvoiceAgain(fallbackInvoiceId);
        return;
      }
      navigate("/manual");
      return;
    }
    const draft = {
      billToDetails: specificStarter.entry.details || specificStarter.entry.name || "",
      notes: specificStarter.entry.defaultNotes || "",
      lineItems: [
        {
          id: `line-${Date.now()}`,
          description: specificStarter.leadItem.description || "",
          qty: specificStarter.leadItem.qty ?? "",
          rate: specificStarter.leadItem.rate ?? ""
        }
      ],
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_memory_reused",
        source: "launcher_command_center_repeat_memory"
      })
    }).catch(() => {});
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "service_memory_reused",
        source: "launcher_command_center_repeat_memory"
      })
    }).catch(() => {});
    navigate("/manual");
  };
  const quickStartOptions = options
    .filter((option) => option.key === "scratchpad" || option.key === "import" || option.key === "manual")
    .concat(
      repeatWorkStarter
        ? [
            {
              key: "repeat-memory",
              title: `Repeat client: ${repeatWorkStarter.entry.name}`,
              description: `Start with ${repeatWorkStarter.leadItem.description}${
                repeatWorkStarter.savedItemCount > 1
                  ? ` and ${repeatWorkStarter.savedItemCount - 1} more saved match${
                      repeatWorkStarter.savedItemCount - 1 > 1 ? "es" : ""
                    }`
                  : ""
              }.`,
              icon: <ArchiveIcon />,
              onClick: handleStartFromMemory,
              disabled: false
            }
          ]
        : []
    );
  const manageOptions = options.filter(
    (option) =>
      option.key === "library" ||
      option.key === "identity" ||
      option.key === "memory" ||
      option.key === "services" ||
      option.key === "feedback" ||
      option.key === "support"
  );

  const handleUpgradeAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, { successPath: "/?billing=success" });
    } catch (error) {
      setBillingError(error?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleBillingAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await openBillingPortal(accountPlan, { returnPath: "/" });
    } catch (error) {
      setBillingError(error?.message || "Unable to open billing.");
    } finally {
      setBillingBusy(false);
    }
  };

  useEffect(() => {
    const checkDraft = () => {
      setHasResumeDraft(hasResumeDraftForKey(draftStorageKey));
    };
    checkDraft();
    window.addEventListener("focus", checkDraft);
    return () => {
      window.removeEventListener("focus", checkDraft);
    };
  }, [draftStorageKey, authSession?.userId]);

  useEffect(() => {
    let active = true;
    const loadDraftRecovery = async () => {
      setDraftRecoveryLoading(true);
      try {
        const response = await apiFetch("/api/invoices");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setDraftRecoveryItems([]);
          setOperationsSummary(
            buildLauncherOperationsSummary([], {
              clientMemoryEntries,
              savedLineItems,
              recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
              getRecurringInterval: getClientRecurringInterval
            })
          );
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
        const drafts = invoices
              .filter((invoice) => invoice?.status === "draft")
              .slice(0, 3)
              .map((invoice) => ({
                invoiceId: invoice.invoiceId,
                invoiceNumber: invoice.invoiceNumber || "Draft invoice",
                updatedLabel: formatUpdatedLabel(invoice.updatedAt)
              }));
        setDraftRecoveryItems(drafts);
        setOperationsSummary(
          buildLauncherOperationsSummary(invoices, {
            clientMemoryEntries,
            savedLineItems,
            recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
            getRecurringInterval: getClientRecurringInterval
          })
        );
      } catch (_error) {
        if (!active) {
          return;
        }
        setDraftRecoveryItems([]);
        setOperationsSummary(
          buildLauncherOperationsSummary([], {
            clientMemoryEntries,
            savedLineItems,
            recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
            getRecurringInterval: getClientRecurringInterval
          })
        );
      } finally {
        if (active) {
          setDraftRecoveryLoading(false);
        }
      }
    };
    void loadDraftRecovery();
    const handleFocus = () => {
      void loadDraftRecovery();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [authSession?.userId, savedWorkRefreshToken]);

  const handleResumeSavedDraft = async (invoiceId, options = {}) => {
    if (!invoiceId || resumeDraftBusyId) {
      return;
    }
    setAuthError("");
    setResumeDraftBusyId(invoiceId);
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to open draft.");
      }
      const savedInvoice = payload?.invoice;
      const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice;
      if (!finishedInvoice) {
        throw new Error("Saved draft is incomplete.");
      }
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: deriveTaxRate(finishedInvoice),
        savedInvoiceId: savedInvoice?.invoiceId ?? "",
        savedInvoiceStatus: savedInvoice?.status ?? "draft"
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      if (options?.openWithBillie) {
        try {
          window.localStorage.setItem(
            billieWorkspaceStorageKey,
            buildBillieWorkspaceStarterInstruction(
              finishedInvoice,
              "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
            )
          );
        } catch (_error) {
          // Best-effort only.
        }
      }
      navigate(options?.openWithBillie ? "/manual?tab=assistant&source=library" : "/manual");
    } catch (error) {
      setAuthError(error?.message || "Failed to open draft.");
    } finally {
      setResumeDraftBusyId("");
    }
  };

  const handleContinueOnboarding = (step) => {
    if (!step?.id) {
      navigate("/ai-intake");
      return;
    }
    if (step.routeHint === "manual") {
      navigate("/manual");
      return;
    }
    if (step.id === "capture_notes") {
      activateOnboardingWalkthrough();
      navigate("/ai-intake?sample=starter");
      return;
    }
    navigate("/ai-intake");
  };

  const handleStartGuidedWalkthrough = () => {
    activateOnboardingWalkthrough();
    navigate("/ai-intake?sample=starter");
  };

  const handleDismissOnboardingCompletion = () => {
    acknowledgeOnboardingCompletion();
    setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
  };

  const handleContinueSetup = (step) => {
    if (!step?.routeHint) {
      return;
    }
    if (step.routeHint === "sign-in") {
      openSignInModal();
      return;
    }
    if (step.routeHint === "settings/business") {
      navigate("/settings/business?from=onboarding-complete");
      return;
    }
    if (step.routeHint === "settings/memory") {
      navigate("/settings/memory?from=onboarding-complete");
      return;
    }
    if (step.routeHint === "settings/services") {
      navigate("/settings/services?from=onboarding-complete");
    }
  };

  const handleContinueAfterSignIn = () => {
    const nextStep = onboardingStatus?.setupNextStep;
    setAuthSuccessNotice("");
    if (nextStep) {
      handleContinueSetup(nextStep);
    }
  };

  const handleLauncherSendReminder = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `reminder:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send reminder.");
      }
      const recipient =
        payload?.reminder?.recipientEmail ?? payload?.delivery?.recipientEmail ?? "the saved recipient";
      const invoice = payload?.invoice ?? null;
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = toTimestamp(dueDateValue);
      const isPastDue =
        invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs > 0 && dueDateMs <= Date.now();
      const deliveryOpened = Boolean(invoice?.delivery?.openedAt) || invoice?.delivery?.status === "opened";
      const isFocusedReminder = isPastDue && deliveryOpened;
      const nextStepNotice = buildLauncherPostReminderNextStepNotice(invoice);
      setOperationsNotice(
        payload?.mode === "provider"
          ? `${
              isFocusedReminder ? "Focused reminder" : "Reminder"
            } sent to ${recipient}. Delivery tracking is now active. ${nextStepNotice}`
          : payload?.warning
            ? `${
                isFocusedReminder ? "Focused reminder" : "Reminder"
              } recorded for ${recipient}. ${payload.warning} ${nextStepNotice}`
            : `${
                isFocusedReminder ? "Focused reminder" : "Reminder"
              } recorded for ${recipient}. Configure an email provider to send automatically. ${nextStepNotice}`
      );
      setSavedWorkRefreshToken((current) => current + 1);
    } catch (error) {
      setOperationsError(error?.message || "Failed to send reminder.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  const handleLauncherMarkPaid = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `mark-paid:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to mark invoice paid.");
      }
      const invoiceNumber =
        payload?.invoice?.invoiceData?.finishedInvoice?.invoiceNumber ||
        payload?.invoice?.invoiceNumber ||
        "Invoice";
      setOperationsNotice(`${invoiceNumber} marked paid.`);
      setSavedWorkRefreshToken((current) => current + 1);
    } catch (error) {
      setOperationsError(error?.message || "Failed to mark invoice paid.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  const handleLauncherInvoiceAgain = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `invoice-again:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start repeat invoice.");
      }
      const savedInvoice = payload?.invoice;
      const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice;
      if (!finishedInvoice) {
        throw new Error("Saved invoice is incomplete.");
      }
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: deriveTaxRate(finishedInvoice),
        freshDraft: true,
        savedInvoiceId: "",
        savedInvoiceStatus: ""
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      await apiFetch("/api/telemetry/revenue-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "invoice_again_started",
          source: "launcher_command_center"
        })
      }).catch(() => {});
      navigate("/manual");
    } catch (error) {
      setOperationsError(error?.message || "Failed to start repeat invoice.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  return (
    <div
      className="nb-page nb-page--launcher min-h-screen overflow-hidden text-slate-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(172,204,240,0.88), rgba(238,244,251,0) 30%), radial-gradient(circle at top right, rgba(105,147,210,0.18), rgba(238,244,251,0) 28%), linear-gradient(180deg, #f8fbff 0%, #eef4fb 48%, #f7fbff 100%)"
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(120deg,rgba(9,48,100,0.04),rgba(9,48,100,0)_36%)]" />
      <div className="pointer-events-none absolute left-[-120px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#acd0f4]/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-80px] top-[80px] h-[220px] w-[220px] rounded-full bg-[#6993d2]/20 blur-3xl" />
      <main className="nb-page-shell nb-page-shell--wide relative max-w-xl md:max-w-6xl md:py-14">
        <section className="nb-surface nb-surface--elevated overflow-hidden rounded-[36px] border-white/70 bg-white/72 p-0">
          <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:gap-8 md:p-8 lg:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-[#6993d2]/25 bg-[#f4f8fd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#093064]">
                  NoteBill
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                  Billie helps, you approve
                </span>
              </div>
              <div className="mt-5 max-w-3xl">
                <h1
                  className="nb-title text-[2rem] leading-[1.02] text-slate-900 md:text-6xl"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Turn rough notes into a client-ready invoice.
                </h1>
                <p className="nb-copy mt-3 max-w-2xl md:mt-4 md:leading-7">
                  Paste what happened. Billie builds a clean draft. You only approve the money decisions.
                </p>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 md:mt-6 md:gap-3">
                {[
                  ["Messy input", "Notes, screenshots, PDFs, photos, or voice notes."],
                  ["Clear review", "Only money-impacting choices require your call."],
                  ["Ready to send", "Save, export, or send without rewrites."]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="nb-subcard rounded-[20px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,248,253,0.94))] px-3 py-3 shadow-[0_10px_30px_rgba(9,48,100,0.05)] md:rounded-[22px] md:px-4 md:py-4"
                  >
                    <p className="text-sm font-semibold text-[#093064]">{title}</p>
                    <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block md:mt-1.5">{copy}</p>
                  </div>
                ))}
              </div>
              <AccountStrip
                authSession={authSession}
                authBusy={authBusy}
                planSummary={planSummary}
                planUsage={planUsage}
                planAtLimit={planAtLimit}
                planWarning={planWarning}
                planPitch={planPitch}
                hasPlanActions={hasPlanActions}
                showPlanActions={showPlanActions}
                onTogglePlanActions={() => setShowPlanActions((current) => !current)}
                showUpgradeAction={showUpgradeAction}
                upgradeUrl={upgradeUrl}
                useStripeUpgradeAction={useStripeUpgradeAction}
                showBillingPortalAction={showBillingPortalAction}
                billingPortalUrl={billingPortalUrl}
                useStripePortalAction={useStripePortalAction}
                billingBusy={billingBusy}
                onOpenUpgrade={handleUpgradeAction}
                onOpenBillingPortal={handleBillingAction}
                onOpenSignIn={openSignInModal}
                onSignOut={handleSignOut}
              />
              {billingNotice ? (
                <p
                  className={`nb-banner mt-3 ${
                    billingNotice.tone === "green"
                      ? "nb-banner--success"
                      : "nb-banner--warning"
                  }`}
                >
                  {billingNotice.message}
                </p>
              ) : null}
              {authError ? <p className="mt-3 text-sm text-rose-600">{authError}</p> : null}
              {authSuccessNotice ? (
                <div className="nb-banner nb-banner--success mt-3 flex flex-col gap-3 rounded-[22px] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-emerald-950">{authSuccessNotice}</p>
                  {onboardingStatus?.setupNextStep ? (
                    <button
                      type="button"
                      className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                      onClick={handleContinueAfterSignIn}
                    >
                      Continue setup
                    </button>
                  ) : null}
                </div>
              ) : null}
              {billingError ? <p className="mt-3 text-sm text-rose-600">{billingError}</p> : null}
              <div className="mt-4 rounded-[24px] border border-[#6993d2]/18 bg-[#093064] px-4 py-4 text-white shadow-[0_14px_40px_rgba(9,48,100,0.18)] md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#acd0f4]">Built for real work</p>
                <p className="mt-2 text-base font-semibold text-white">Billie organizes the draft. You approve the money.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  One clear start. Visible draft changes. No silent total edits.
                </p>
              </div>
            </div>
            <aside className="hidden flex-col justify-between rounded-[30px] border border-[#6993d2]/22 bg-[#093064] p-5 text-white shadow-[0_20px_60px_rgba(9,48,100,0.22)] md:flex md:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#acd0f4]">
                  Built for real work
                </p>
                <h2
                  className="mt-4 text-3xl leading-tight text-white"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Fast enough between jobs. Clean enough to send the same day.
                </h2>
                <div className="mt-6 space-y-3">
                  {[
                    "Billie cleans up structure and wording, but never makes silent money decisions.",
                    "Start from rough notes, a file import, or a blank invoice when you need more control.",
                    "The invoice stays visible while you work, so changes never feel hidden."
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/8 px-3 py-3">
                      <span
                        className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#acd0f4]"
                        aria-hidden="true"
                      >
                        <span className="h-2 w-2 rounded-full bg-[#093064]" />
                      </span>
                      <p className="text-sm leading-6 text-slate-100">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/8 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#acd0f4]">Best first step</p>
                <p className="mt-2 text-lg font-semibold text-white">Paste the rough version first.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Most people only need one path: start with Billie, approve the money details, then send.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="mt-7 space-y-5 md:mt-8">
          <OperationsQueueSection
            summary={operationsSummary}
            loading={draftRecoveryLoading}
            busyInvoiceId={resumeDraftBusyId}
            busyActionId={operationsBusyActionId}
            onResumeDraft={handleResumeSavedDraft}
            onResumeWithBillie={(invoiceId) => handleResumeSavedDraft(invoiceId, { openWithBillie: true })}
            onSendReminder={handleLauncherSendReminder}
            onMarkPaid={handleLauncherMarkPaid}
            onInvoiceAgain={handleLauncherInvoiceAgain}
            onStartFromMemory={handleStartFromMemoryForClient}
            onOpenLibrary={() => navigate("/invoices")}
            onStartInvoice={() => navigate("/ai-intake")}
          />
          {operationsNotice ? <p className="nb-banner nb-banner--success">{operationsNotice}</p> : null}
          {operationsError ? <p className="nb-banner nb-banner--warning">{operationsError}</p> : null}
          <OnboardingSection
            status={onboardingStatus}
            onContinue={handleContinueOnboarding}
            onContinueSetup={handleContinueSetup}
            onOpenSignIn={openSignInModal}
            onStartNextInvoice={() => navigate("/ai-intake")}
            onOpenLibrary={() => navigate("/invoices")}
            onOpenEditor={() => navigate("/manual")}
            onOpenFeedback={() => navigate("/feedback")}
            onDismissCompletion={handleDismissOnboardingCompletion}
          />
          <StartSection
            primaryOption={primaryOption}
            hasSavedHistory={operationsSummary?.hasInvoices}
            hasResumeDraft={hasResumeDraft}
            onResumeDraft={() => navigate("/manual")}
            onTrySampleNotes={handleStartGuidedWalkthrough}
            onOpenScratchpad={() => navigate("/scratchpad")}
            showAlternateStarts={showAlternateStarts}
            onToggleAlternateStarts={() => setShowAlternateStarts((current) => !current)}
          />
          <DraftRecoverySection
            drafts={draftRecoveryItems}
            loading={draftRecoveryLoading}
            busyInvoiceId={resumeDraftBusyId}
            onResumeDraft={handleResumeSavedDraft}
            onResumeWithBillie={(invoiceId) => handleResumeSavedDraft(invoiceId, { openWithBillie: true })}
            onOpenLibrary={() => navigate("/invoices")}
          />

          <AlternateStartsSection
            showAlternateStarts={showAlternateStarts}
            quickStartOptions={quickStartOptions}
          />

          <ManageSection
            showManageOptions={showManageOptions}
            onToggleManageOptions={() => setShowManageOptions((current) => !current)}
            manageOptions={manageOptions}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/feedback")}
          >
            Feedback
          </button>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
          >
            Support
          </a>
          {showDiagnosticsLink ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
              onClick={() => navigate("/diagnostics")}
            >
              Internal diagnostics
            </button>
          ) : null}
        </div>
      </main>
      <AuthModal
        open={authModalOpen}
        authBusy={authBusy}
        authFlow={authFlow}
        authEmail={authEmail}
        authEmailError={authEmailError}
        authNotice={authNotice}
        authPreviewUrl={authPreviewUrl}
        authReturnPathLabel={describeAuthReturnPath(authReturnPath)}
        authProviders={authProviders}
        authProvidersBusy={authProvidersBusy}
        authProvidersError={authProvidersError}
        onChangeEmail={(event) => {
          setAuthEmail(event.target.value);
          setAuthEmailError("");
          setAuthNotice("");
          setAuthPreviewUrl("");
        }}
        onCancel={() => setAuthModalOpen(false)}
        onStartGoogle={handleGoogleSignIn}
        onSubmit={handleSignIn}
      />
    </div>
  );
}

function EmailLinkVerificationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Verifying your sign-in link...");

  useEffect(() => {
    let active = true;
    const linkToken = searchParams.get("token")?.trim();
    if (!linkToken) {
      setStatus("error");
      setMessage("This sign-in link is missing a token.");
      return undefined;
    }

    completeEmailLinkSignIn(linkToken)
      .then((session) => {
        if (!active) {
          return;
        }
        try {
          window.sessionStorage.setItem(
            "invoiceAuthJustSignedIn",
            JSON.stringify({ provider: "email_link", email: session?.email ?? "" })
          );
        } catch (_error) {
          // Best-effort handoff only.
        }
        setStatus("success");
        setMessage("Signed in. Taking you back to NoteBill...");
        const returnPath = consumePendingAuthReturnPath();
        window.setTimeout(() => {
          if (active) {
            navigate(returnPath, { replace: true });
          }
        }, 1200);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setStatus("error");
        setMessage(error?.message || "This sign-in link is invalid or expired.");
      });

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  const toneClass =
    status === "success" ? "text-emerald-700" : status === "error" ? "text-rose-600" : "text-slate-600";

  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <div className="nb-surface nb-surface--elevated">
          <p className="nb-kicker">Account verification</p>
          <h1 className="nb-section-title mt-3">Email sign-in</h1>
          <p className={`mt-3 text-sm leading-7 ${toneClass}`}>{message}</p>
          {status === "error" ? (
            <button type="button" className="nb-btn-primary mt-5" onClick={() => navigate("/", { replace: true })}>
              Return to launcher
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function GoogleSignInCompletionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Finishing Google Sign-In...");

  useEffect(() => {
    let active = true;
    const errorMessage = searchParams.get("error")?.trim();
    const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const nextPath = sanitizeInternalAppPath(
      hashParams.get("next")?.trim() || searchParams.get("next")?.trim() || consumePendingAuthReturnPath()
    );

    if (errorMessage) {
      setStatus("error");
      setMessage(errorMessage);
      return undefined;
    }

    const token = hashParams.get("token")?.trim();
    const userId = hashParams.get("userId")?.trim();
    const email = hashParams.get("email")?.trim();
    const expiresAt = hashParams.get("expiresAt")?.trim();
    if (!token || !userId || !email || !expiresAt) {
      setStatus("error");
      setMessage("Google Sign-In did not return a complete session.");
      return undefined;
    }

    try {
      const session = completeRedirectSignIn(token, { userId, email, expiresAt });
      try {
        window.sessionStorage.setItem(
          "invoiceAuthJustSignedIn",
          JSON.stringify({ provider: "google", email: session?.email ?? email })
        );
      } catch (_error) {
        // Best-effort handoff only.
      }
      window.history.replaceState({}, document.title, "/auth/google");
      setStatus("success");
      setMessage("Signed in with Google. Taking you back to NoteBill...");
      window.setTimeout(() => {
        if (active) {
          navigate(nextPath.startsWith("/") ? nextPath : "/", { replace: true });
        }
      }, 1200);
    } catch (error) {
      if (!active) {
        return undefined;
      }
      setStatus("error");
      setMessage(error?.message || "Google Sign-In failed.");
    }

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  const toneClass =
    status === "success" ? "text-emerald-700" : status === "error" ? "text-rose-600" : "text-slate-600";

  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <div className="nb-surface nb-surface--elevated">
          <p className="nb-kicker">Account verification</p>
          <h1 className="nb-section-title mt-3">Google Sign-In</h1>
          <p className={`mt-3 text-sm leading-7 ${toneClass}`}>{message}</p>
          {status === "error" ? (
            <button type="button" className="nb-btn-primary mt-5" onClick={() => navigate("/", { replace: true })}>
              Return to launcher
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Placeholder({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <button
          type="button"
          className="nb-btn-ghost"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <div className="nb-surface nb-surface--elevated mt-4">
          <h1 className="nb-section-title">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
      </main>
    </div>
  );
}

const PUBLIC_INFO_LAST_UPDATED = "2026-04-21";
const SUPPORT_EMAIL = "support@notebill.app";
const CONTACT_EMAIL = "contact@notebill.app";
const INFO_EMAIL = "info@notebill.app";
const DIRECT_CONTACT_EMAIL = "david@notebill.app";
const NOTE_BILL_SITE_URL = "https://notebill.app";
const FEEDBACK_EMAIL_SUBJECT = "NoteBill tester feedback";
const FEEDBACK_EMAIL_BODY = [
  "What I was trying to do:",
  "",
  "What happened:",
  "",
  "What I expected:",
  "",
  "Device model and Android version:",
  "",
  "Screenshot or invoice ID, if relevant:"
].join("\n");

function buildFeedbackMailto(deviceDetails = "") {
  const details = typeof deviceDetails === "string" && deviceDetails.trim() ? deviceDetails.trim() : "";
  const body = details
    ? `${FEEDBACK_EMAIL_BODY}\n\n---\n${details}`
    : FEEDBACK_EMAIL_BODY;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(FEEDBACK_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

function buildFeedbackDeviceDetails() {
  const userAgent = navigator.userAgent || "Unknown user agent";
  const safePageUrl = `${window.location.origin}${window.location.pathname}`;
  const viewport = `${window.innerWidth}x${window.innerHeight}`;
  const screenSize = window.screen ? `${window.screen.width}x${window.screen.height}` : "Unknown";
  const pixelRatio = window.devicePixelRatio ? String(window.devicePixelRatio) : "Unknown";
  const connection = navigator.connection?.effectiveType
    ? `${navigator.connection.effectiveType} connection`
    : "Connection unknown";

  return [
    "NoteBill feedback details",
    `Generated: ${new Date().toISOString()}`,
    `Page: ${safePageUrl}`,
    `Viewport: ${viewport}`,
    `Screen: ${screenSize}`,
    `Pixel ratio: ${pixelRatio}`,
    `Network: ${connection}`,
    `User agent: ${userAgent}`
  ].join("\n");
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Timed out")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function PublicInfoPage({ kicker, title, intro, sections, footerNote, actions, children }) {
  const pageActions = actions ?? [
    { href: "/", label: "Open NoteBill", tone: "primary" },
    { href: "/support", label: "Support", tone: "ghost" }
  ];
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium py-8 md:py-10">
        <div className="nb-surface nb-surface--elevated">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="nb-kicker">{kicker}</p>
              <h1 className="nb-title mt-3 text-4xl md:text-5xl">{title}</h1>
              <p className="nb-copy mt-4 max-w-3xl">{intro}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {pageActions.map((action) => (
                <a
                  key={`${action.href}:${action.label}`}
                  className={action.tone === "primary" ? "nb-btn-primary" : "nb-btn-ghost"}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </div>

          {children ? <div className="mt-6">{children}</div> : null}

          <div className="mt-6 space-y-4">
            {sections.map((section) => (
              <section key={section.title} className="nb-subcard">
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {paragraph}
                  </p>
                ))}
                {section.items?.length ? (
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#6993d2]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {footerNote ? <p className="mt-6 text-xs leading-6 text-slate-500">{footerNote}</p> : null}
        </div>
      </main>
    </div>
  );
}

function PrivacyPage() {
  return (
    <PublicInfoPage
      kicker="Privacy"
      title="NoteBill Privacy Policy"
      intro="NoteBill helps you turn rough notes, imports, and draft invoice details into professional invoices. This policy explains what information we may collect, how it may be used, and what choices you have when using the product."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. For privacy or deletion requests, email ${SUPPORT_EMAIL} or use the public data deletion page.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Information we may collect",
          items: [
            "Email address and session-related identifiers when you sign in or keep invoices tied to your account.",
            "Content you provide, including notes, invoice details, uploaded invoice files, images, and saved drafts.",
            "Audio notes and transcripts if audio transcription is enabled.",
            "Billing and subscription metadata if paid plans, payment links, or Stripe checkout are enabled.",
            "Limited diagnostic or quality information used to run, secure, and improve the product."
          ],
          paragraphs: []
        },
        {
          title: "How we use information",
          items: [
            "To generate, edit, save, export, send, and reopen invoices.",
            "To authenticate users and scope invoice data to the correct account.",
            "To process imports, transcription, OCR, and invoice-generation workflows.",
            "To support subscription billing, payment-link creation, and invoice email delivery when those features are enabled.",
            "To troubleshoot issues, prevent abuse, and improve reliability."
          ],
          paragraphs: []
        },
        {
          title: "Service providers",
          paragraphs: [
            "Depending on which features are enabled in production, NoteBill may use service providers such as OpenAI for AI-assisted processing, Stripe for billing and payment features, and SMTP2GO, Resend, or another email delivery provider for sending invoices or reminders.",
            "These providers are used to operate the service, not to sell your information."
          ]
        },
        {
          title: "Sharing and disclosure",
          items: [
            "We do not sell your personal information.",
            "We may share information with service providers that help us operate NoteBill.",
            "We may disclose information when required to comply with law, protect the service, investigate abuse, or support a business transfer."
          ],
          paragraphs: []
        },
        {
          title: "Your choices",
          items: [
            "You can delete saved invoices from the app.",
            "You can avoid optional features like uploads, transcription, billing, or email sending if you do not want to use them.",
            "You can request account-related privacy help through the support channel listed on the support page.",
            "You can request account and associated data deletion through the public data deletion page or by emailing support@notebill.app."
          ],
          paragraphs: []
        },
        {
          title: "Security and retention",
          paragraphs: [
            "NoteBill uses reasonable safeguards designed to protect information in transit and at rest, but no system can guarantee absolute security.",
            "Information is kept only as long as needed to provide the service, comply with legal obligations, resolve disputes, and maintain backups or security records where necessary."
          ]
        },
        {
          title: "Children's privacy",
          paragraphs: [
            "NoteBill is not directed to children under 13, and we do not knowingly collect personal information from children under 13."
          ]
        }
      ]}
    />
  );
}

function SupportPage() {
  return (
    <PublicInfoPage
      kicker="Support"
      title="NoteBill Support"
      intro="If you need help with NoteBill, billing, invoice delivery, or account-related questions, use the contact details below. The support inbox is also the public request path for privacy and account deletion issues."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/privacy", label: "Privacy", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Contact",
          items: [
            `Support email: ${SUPPORT_EMAIL}`,
            `Contact email: ${CONTACT_EMAIL}`,
            `Info email: ${INFO_EMAIL}`,
            `Direct contact: ${DIRECT_CONTACT_EMAIL}`,
            `Website: ${NOTE_BILL_SITE_URL}`,
            "Service name: NoteBill"
          ],
          paragraphs: []
        },
        {
          title: "What to include when you contact support",
          items: [
            "The email address used with your NoteBill account, if applicable.",
            "A short description of the problem and what you were trying to do.",
            "The device model and Android version if the issue is mobile-specific.",
            "Screenshots or the invoice ID if the problem relates to a saved draft or send flow."
          ],
          paragraphs: []
        },
        {
          title: "Privacy and account deletion requests",
          paragraphs: [
            "If you want your NoteBill account and associated data deleted, email support@notebill.app or use the public data deletion page.",
            "For account-level deletion requests, include the email address tied to your NoteBill account so we can verify ownership before acting on the request."
          ],
          items: []
        },
        {
          title: "Typical support topics",
          items: [
            "Signing in or session issues",
            "Invoice import, OCR, or transcription questions",
            "Saved drafts, export, and send behavior",
            "Billing, subscription, or payment-link questions",
            "Privacy or data deletion requests"
          ],
          paragraphs: []
        }
      ]}
    />
  );
}

function HelpCenterPage() {
  const commonTasks = [
    {
      title: "Build your first invoice",
      body: "Start with Billie if you have rough notes. Use the manual editor if you want full control from a blank draft.",
      action: { href: "/ai-intake", label: "Start with Billie" }
    },
    {
      title: "Finish and save a draft",
      body: "Open the manual editor, confirm the client, line items, totals, and notes, then save to the library so the invoice is reusable.",
      action: { href: "/manual", label: "Open manual editor" }
    },
    {
      title: "Send and follow up",
      body: "Use the library to send invoices, track delivery, create reminders, and reopen repeat work from one place.",
      action: { href: "/invoices", label: "Open invoice library" }
    },
    {
      title: "Report a bug or confusing step",
      body: "The feedback page is the fastest path for tester reports, screenshots, and device details.",
      action: { href: "/feedback", label: "Open feedback" }
    }
  ];
  const faqItems = [
    {
      question: "Where should I start if I only have messy job notes?",
      answer:
        "Use Billie intake. Paste the notes, review what Billie captured, then open the draft in the manual editor for final approval."
    },
    {
      question: "How do I make repeat invoices faster?",
      answer:
        "Save the draft to the library, save strong services to memory, and reuse repeat-client shortcuts from the launcher, manual editor, or library."
    },
    {
      question: "Why can I not create a payment link or client portal yet?",
      answer:
        "Those flows need a saved invoice first. Save the draft, then create the hosted payment link or client portal from the editor or library."
    },
    {
      question: "What should I send if something breaks?",
      answer:
        "Tell us what you were trying to do, what happened, what you expected, and include a screenshot or invoice number if you have one."
    }
  ];

  return (
    <PublicInfoPage
      kicker="Help center"
      title="NoteBill Help Center"
      intro="Use this page when you want the fastest path to the right screen, the right workflow, or the right support channel. It is designed to keep you moving without digging through long docs."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. Need human help? Email ${SUPPORT_EMAIL}.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/feedback", label: "Feedback", tone: "ghost" },
        { href: "/support", label: "Support", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Best place to go next",
          items: [
            "Use Billie intake when you have rough notes and want NoteBill to prepare the draft.",
            "Use the manual editor when you want full control over client details, line items, notes, payment links, and portal setup.",
            "Use the invoice library when the work is already saved and you want send, payment, follow-up, or repeat-work actions."
          ],
          paragraphs: []
        },
        {
          title: "When to use feedback vs support",
          items: [
            "Use Feedback for bugs, confusing UI, cramped mobile layouts, slow screens, or anything testers notice while using the app.",
            "Use Support for account issues, billing questions, privacy requests, delivery problems, or anything that needs a direct reply."
          ],
          paragraphs: []
        }
      ]}
    >
      <section className="nb-subcard border-[#6993d2]/30 bg-[#f6f9ff]" data-testid="help-center-quick-starts">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Quick starts</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Most common things people need help with</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {commonTasks.map((task) => (
            <div key={task.title} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{task.body}</p>
              <a href={task.action.href} className="mt-3 inline-flex rounded-full border border-[#6993d2]/20 bg-[#f6f9ff] px-3 py-1.5 text-xs font-semibold text-[#285ea8]">
                {task.action.label}
              </a>
            </div>
          ))}
        </div>
      </section>
      <section className="nb-subcard border-emerald-200 bg-emerald-50/70" data-testid="help-center-faq">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Fast answers</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Questions we expect most often</h2>
        </div>
        <div className="mt-4 space-y-3">
          {faqItems.map((item) => (
            <div key={item.question} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{item.question}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicInfoPage>
  );
}

function FeedbackPage() {
  const [deviceDetails] = useState(() => buildFeedbackDeviceDetails());
  const [copyStatus, setCopyStatus] = useState("");
  const v2TesterMissions = [
    {
      label: "Onboarding",
      body: "Start from sample notes and see if the first-invoice guide makes the next step obvious."
    },
    {
      label: "Sign-in",
      body: "Try email-link sign-in, or Google Sign-In if this build has Google enabled."
    },
    {
      label: "Send/payment",
      body: "Save an invoice, open the library, and check whether send, payment, and follow-up status feel clear."
    },
    {
      label: "Portal",
      body: "Create or open a client portal link and confirm the customer-facing invoice feels trustworthy."
    }
  ];

  const handleCopyDeviceDetails = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Copy is unavailable here. Long-press the details below and copy them.");
      return;
    }

    try {
      await withTimeout(navigator.clipboard.writeText(deviceDetails), 1500);
      setCopyStatus("Device details copied.");
    } catch {
      setCopyStatus("Copy failed. Long-press the details below and copy them.");
    }
  };

  return (
    <PublicInfoPage
      kicker="Tester feedback"
      title="NoteBill Feedback"
      intro="If something feels confusing, broken, cramped, slow, or just a little weird on your phone, send it here. Small papercuts count because they are exactly what make an invoice app feel hard or easy."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. Feedback goes to ${SUPPORT_EMAIL}.`}
      actions={[
        { href: buildFeedbackMailto(deviceDetails), label: "Email feedback", tone: "primary" },
        { href: "/", label: "Open NoteBill", tone: "ghost" },
        { href: "/support", label: "Support", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Fastest useful report",
          items: [
            "What you were trying to do.",
            "What happened instead.",
            "What you expected to happen.",
            "Your phone model and Android version, if you know them.",
            "A screenshot, screen recording, or invoice ID if the issue is visual or tied to saved work.",
            `If the email button does not open, send the same details to ${SUPPORT_EMAIL}.`
          ],
          paragraphs: []
        },
        {
          title: "What we especially want to catch",
          items: [
            "Anything that blocks sign-in, invoice generation, saving, exporting, or sending.",
            "Visual bugs like clipped buttons, overlapping text, tiny tap targets, or screens that feel crowded.",
            "Invoice math issues, confusing wording, or anything that makes you hesitate before sending.",
            "Moments where Billie does not understand normal job notes or makes the invoice harder to finish."
          ],
          paragraphs: []
        },
        {
          title: "Two-minute tester script",
          items: [
            "Start from notes or sample notes and build an invoice.",
            "Check the client, line items, total, tax, and due date.",
            "Save the invoice, reopen it from the library, then export the PDF.",
            "If you sign in, confirm the email-link flow feels understandable and not spooky.",
            "Tell us the first place you felt unsure, even if you eventually figured it out."
          ],
          paragraphs: []
        },
        {
          title: "Tiny notes are welcome",
          paragraphs: [
            "You do not need to write a perfect bug report. Even a short note like \"the Generate button was cut off on my Galaxy\" is useful enough to improve the next build."
          ],
          items: []
        }
      ]}
    >
      <section className="nb-subcard border-emerald-200 bg-emerald-50/70" data-testid="feedback-v2-test-plan">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">V2 tester pass</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Best flows to test before public launch</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              If you only have a few minutes, run one of these paths and tell us where you hesitated.
            </p>
          </div>
          <a href={buildFeedbackMailto(deviceDetails)} className="nb-btn-primary shrink-0">
            Email V2 feedback
          </a>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {v2TesterMissions.map((mission) => (
            <div key={mission.label} className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{mission.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{mission.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="nb-subcard border-[#6993d2]/30 bg-[#f6f9ff]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Copy device details</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              If a screen looks cramped or a button is cut off, paste these details into your feedback so we
              can reproduce it faster.
            </p>
          </div>
          <button type="button" className="nb-btn-secondary shrink-0" onClick={handleCopyDeviceDetails}>
            Copy device details
          </button>
        </div>
        {copyStatus ? (
          <p className="mt-3 text-sm font-semibold text-slate-700" role="status">
            {copyStatus}
          </p>
        ) : null}
        <pre className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white/85 p-4 font-mono text-[11px] leading-5 text-slate-600">
          {deviceDetails}
        </pre>
      </section>
    </PublicInfoPage>
  );
}

function DataDeletionPage() {
  return (
    <PublicInfoPage
      kicker="Data deletion"
      title="NoteBill Account and Data Deletion"
      intro="If you want your NoteBill account and associated data deleted, use the request path below. This page is intended to satisfy the public account-deletion URL requirement for app marketplaces and to give users a clear way to start a deletion request outside the app."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/privacy", label: "Privacy", tone: "ghost" }
      ]}
      sections={[
        {
          title: "How to request deletion",
          paragraphs: [
            `Email ${SUPPORT_EMAIL} with a subject such as "NoteBill data deletion request" or "Delete my NoteBill account".`
          ],
          items: [
            "Include the email address associated with your NoteBill account.",
            "If your request relates to billing, include any recent invoice, subscription, or payment details that help us locate the account.",
            "If you no longer have access to the original email address, include enough detail for us to verify ownership before we act on the request."
          ]
        },
        {
          title: "What happens after you contact us",
          items: [
            "We may ask you to verify account ownership before processing the request.",
            "After verification, we will delete or de-identify account-linked data that we are not required to keep.",
            "If your account includes saved invoices, drafts, or imported source material tied to the verified account, those records are included in the account-level deletion workflow."
          ],
          paragraphs: []
        },
        {
          title: "What may be retained",
          items: [
            "Security, fraud-prevention, legal, tax, dispute, and backup records may be retained where required or reasonably necessary.",
            "Payment and subscription records may be retained by us or our billing providers for accounting, compliance, or audit obligations."
          ],
          paragraphs: []
        },
        {
          title: "What you can delete directly in the app",
          items: [
            "Saved invoices can be removed from within NoteBill.",
            "Deleting invoices inside the app is separate from an account-level deletion request."
          ],
          paragraphs: []
        },
        {
          title: "Related pages",
          items: [
            "Privacy policy: /privacy",
            "Support: /support",
            `Website: ${NOTE_BILL_SITE_URL}`
          ],
          paragraphs: []
        }
      ]}
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/scratchpad" element={<DailyScratchpadPage />} />
        <Route path="/portal/:invoiceId/:token" element={<ClientPortalPage />} />
        <Route path="/auth/verify" element={<EmailLinkVerificationPage />} />
        <Route path="/auth/google" element={<GoogleSignInCompletionPage />} />
        <Route path="/ai-intake" element={<AIIntake />} />
        <Route path="/invoices" element={<InvoiceLibrary />} />
        <Route path="/manual" element={<ManualInvoiceCanvas />} />
        <Route path="/import" element={<ImportInvoice />} />
        <Route path="/diagnostics" element={<IntakeDiagnostics />} />
        <Route path="/settings/business" element={<BusinessIdentitySettings />} />
        <Route path="/settings/memory" element={<ClientMemorySettings />} />
        <Route path="/settings/services" element={<ServiceCatalogSettings />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route path="/delete-account" element={<DataDeletionPage />} />
        <Route
          path="*"
          element={<Placeholder title="Page not found" description="Return to the launcher to continue." />}
        />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
