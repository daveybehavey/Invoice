(() => {
  const { useLocation, useNavigate } = ReactRouterDOM;
  const { useEffect, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
  const revenueAnalytics = window.InvoiceRevenueAnalytics;
  const inAppReview = window.InvoiceInAppReview;
  const getAuthSession = requestIdentity?.getAuthSession;
  const refreshSession = requestIdentity?.refreshSession;

  const intakeReadinessUtils = window.InvoiceIntakeReadiness;
  if (!intakeReadinessUtils) {
    throw new Error(
      "Missing /features/intake/readiness.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }

  const estimateWorkflowUtils = window.InvoiceEstimateWorkflowUtils;
  if (!estimateWorkflowUtils) {
    throw new Error(
      "Missing /utils/estimateWorkflow.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }

  const recurringUtils = window.InvoiceRecurringUtils;
  if (!recurringUtils) {
    throw new Error(
      "Missing /utils/recurring.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const paymentProgressUtils = window.InvoicePaymentProgressUtils;
  if (!paymentProgressUtils) {
    throw new Error(
      "Missing /utils/paymentProgress.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }

  const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;
  const { formatMoney } = formatUtils;
  const { buildEstimateWorkflowSummary, getInvoiceDocumentType, getEstimateReviewState } = estimateWorkflowUtils;
  const {
    normalizeRecurringInterval: normalizeRecurringIntervalShared,
    formatRecurringCadence: formatRecurringCadenceShared,
    readRecurringSchedules: readRecurringSchedulesShared,
    getRecurringAutoSendRecipient: getRecurringAutoSendRecipientShared,
    buildRecurringScheduleSummary
  } = recurringUtils;
  const {
    hasPartialPayment: hasPartialPaymentShared,
    getInvoiceLatestPayment: getInvoiceLatestPaymentShared
  } = paymentProgressUtils;
  const accountPlanUtils = window.InvoiceAccountPlanUtils;
  if (!accountPlanUtils) {
    throw new Error(
      "Missing /utils/accountPlan.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const {
    formatPlanSummary,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getPlanPrelimitWarning,
    getPlanUsageModel
  } = accountPlanUtils;
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const {
    hasStripeCheckout,
    hasStripePortal,
    getGooglePlaySubscriptionPlans,
    startUpgradeCheckout,
    openBillingPortal,
    getBillingEnvironment,
    readBillingNoticeFromUrl
  } = billingActions;
  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const {
    getClientMemory,
    getClientRecipientEmail,
    getClientDefaultNotes,
    rememberClientRecipientEmail,
    getClientRecurringInterval,
    rememberClientRecurringInterval
  } = clientMemoryUtils;
  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const { getLineItemLibrary } = lineItemLibraryUtils;
  const deleteSkipStorageKey = "invoiceDeleteSkipConfirm";
  const followUpReminderStorageKey = "invoiceFollowUpReminder";
  const recurringScheduleStorageKey = "invoiceRecurringSchedules";
  const reminderAutomationSettingsStorageKey = "invoiceReminderAutomationSettings";
  const reminderNotificationSettingsStorageKey = "invoiceReminderNotificationSettings";
  const recurringIntervalOptions = [7, 14, 30];
  const reminderAutomationPresets = [
    {
      id: "gentle",
      label: "Gentle",
      description: "Wait longer, fewer pings.",
      dueAfterDays: 21,
      cooldownDays: 10,
      maxPerRun: 5
    },
    {
      id: "standard",
      label: "Standard",
      description: "Balanced follow-up timing.",
      dueAfterDays: 14,
      cooldownDays: 7,
      maxPerRun: 10
    },
    {
      id: "firm",
      label: "Firm",
      description: "Follow sooner with more volume.",
      dueAfterDays: 7,
      cooldownDays: 3,
      maxPerRun: 20
    }
  ];
  const recurringDayMs = 24 * 60 * 60 * 1000;
  const recurringSoonWindowMs = 7 * recurringDayMs;
  const markReviewMilestone = (milestone) => {
    inAppReview?.markReviewMilestone?.(milestone);
  };
  const maybeRequestInAppReview = (trigger) => {
    void inAppReview?.maybeRequestInAppReview?.(trigger);
  };

  const normalizeRecurringInterval = (value) => {
    return normalizeRecurringIntervalShared(value);
  };

  const formatRecurringCadence = (intervalDays) => {
    return formatRecurringCadenceShared(intervalDays);
  };

  const parseRecurringTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : Date.now();
  };

  const parseDisplayTimestamp = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-").map(Number);
      return new Date(year, month - 1, day).getTime();
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const getInvoiceDueDateValue = (invoice) =>
    invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "";

  const getInvoiceOpenBalance = (invoice) => {
    const amount = Number(
      invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? invoice?.total
    );
    return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  };

  const mergeUpdatedInvoiceMetadata = (currentInvoice, updatedInvoice) => {
    const finishedInvoice = updatedInvoice?.invoiceData?.finishedInvoice ?? {};
    const structuredInvoice = updatedInvoice?.invoiceData?.structuredInvoice ?? {};
    return {
      ...currentInvoice,
      ...updatedInvoice,
      documentType: finishedInvoice.documentType ?? updatedInvoice?.documentType ?? currentInvoice.documentType,
      invoiceNumber:
        finishedInvoice.invoiceNumber ??
        structuredInvoice.invoiceNumber ??
        updatedInvoice?.invoiceNumber ??
        currentInvoice.invoiceNumber,
      customerName:
        finishedInvoice.customerName ??
        structuredInvoice.customerName ??
        updatedInvoice?.customerName ??
        currentInvoice.customerName,
      total: finishedInvoice.total ?? updatedInvoice?.total ?? currentInvoice.total,
      balanceDue:
        finishedInvoice.balanceDue ?? updatedInvoice?.balanceDue ?? currentInvoice.balanceDue,
      dueDate:
        finishedInvoice.dueDate ??
        structuredInvoice.dueDate ??
        updatedInvoice?.dueDate ??
        currentInvoice.dueDate,
      paymentLinkUrl:
        finishedInvoice.paymentLinkUrl ?? updatedInvoice?.paymentLinkUrl ?? currentInvoice.paymentLinkUrl
    };
  };

  const parseInvoiceDueTimestamp = (value) => {
    const parsed = parseDisplayTimestamp(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeLookupText = (value) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

  const buildClientMemoryStarterForInvoice = (invoice, clientMemoryEntries, savedLineItems) => {
    const customerName = normalizeLookupText(
      invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? ""
    );
    if (!customerName) {
      return null;
    }
    const memoryEntries = Array.isArray(clientMemoryEntries) ? clientMemoryEntries : [];
    const savedItems = Array.isArray(savedLineItems) ? savedLineItems : [];
    const entry = memoryEntries.find((candidate) => normalizeLookupText(candidate?.name) === customerName);
    const matchingItems = savedItems
      .filter((candidate) => normalizeLookupText(candidate?.clientName) === customerName)
      .sort((left, right) => {
        const usageDelta = Number(right?.usageCount ?? 0) - Number(left?.usageCount ?? 0);
        if (usageDelta !== 0) {
          return usageDelta;
        }
        return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
      });
    const leadItem = matchingItems[0] ?? null;
    const hasSavedDetails = Boolean(String(entry?.details ?? "").trim());
    const hasSavedNotes = Boolean(String(entry?.defaultNotes ?? "").trim());
    if (!entry && !leadItem) {
      return null;
    }
    return {
      customerName:
        String(entry?.details ?? "").trim() ||
        String(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "").trim(),
      defaultNotes: hasSavedNotes ? String(entry.defaultNotes).trim() : "",
      leadItem,
      topItems: matchingItems.slice(0, 3),
      savedItemCount: matchingItems.length,
      hasSavedDetails,
      hasSavedNotes,
      recipientEmail: String(entry?.recipientEmail ?? "").trim().toLowerCase()
    };
  };

  const getRecurringAutoSendRecipient = (invoice, clientMemoryEntries = []) => {
    return getRecurringAutoSendRecipientShared(invoice, clientMemoryEntries);
  };

  const readRecurringSchedules = (storageKey) => {
    return readRecurringSchedulesShared(storageKey);
  };

  const readFollowUpReminderState = (storageKey) => {
    if (typeof window === "undefined") {
      return { dismissed: false, hiddenUntil: "" };
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return { dismissed: false, hiddenUntil: "" };
      }
      const parsed = JSON.parse(raw);
      return {
        dismissed: Boolean(parsed?.dismissed),
        hiddenUntil:
          typeof parsed?.hiddenUntil === "string" && parsed.hiddenUntil.trim()
            ? parsed.hiddenUntil
            : ""
      };
    } catch (_error) {
      return { dismissed: false, hiddenUntil: "" };
    }
  };

  const readReminderAutomationSettings = (storageKey) => {
    if (typeof window === "undefined") {
      return {
        dueAfterDays: 14,
        cooldownDays: 7,
        maxPerRun: 10
      };
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return {
          dueAfterDays: 14,
          cooldownDays: 7,
          maxPerRun: 10
        };
      }
      const parsed = JSON.parse(raw);
      return {
        dueAfterDays: normalizeReminderSetting(parsed?.dueAfterDays, 14, 1, 120),
        cooldownDays: normalizeReminderSetting(parsed?.cooldownDays, 7, 1, 60),
        maxPerRun: normalizeReminderSetting(parsed?.maxPerRun, 10, 1, 100)
      };
    } catch (_error) {
      return {
        dueAfterDays: 14,
        cooldownDays: 7,
        maxPerRun: 10
      };
    }
  };

  const readReminderNotificationSettings = (storageKey) => {
    if (typeof window === "undefined") {
      return { enabled: false };
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return { enabled: false };
      }
      const parsed = JSON.parse(raw);
      return { enabled: Boolean(parsed?.enabled) };
    } catch (_error) {
      return { enabled: false };
    }
  };

  const canUseBrowserNotifications = () =>
    typeof window !== "undefined" && "Notification" in window && typeof window.Notification === "function";

  const normalizeReminderSetting = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  function InvoiceLibrary() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const viewFocus = searchParams.get("focus")?.trim() ?? "";
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const reminderStorageKey =
    requestIdentity.getScopedStorageKey?.(followUpReminderStorageKey) ?? followUpReminderStorageKey;
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.(recurringScheduleStorageKey) ?? recurringScheduleStorageKey;
  const reminderAutomationStorageKey =
    requestIdentity.getScopedStorageKey?.(reminderAutomationSettingsStorageKey) ??
    reminderAutomationSettingsStorageKey;
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [authPolicyLoaded, setAuthPolicyLoaded] = useState(false);
  const [authRequiredByPolicy, setAuthRequiredByPolicy] = useState(false);
  const [authProviders, setAuthProviders] = useState([]);
  const [authRequiredError, setAuthRequiredError] = useState(false);
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingNotice, setBillingNotice] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [sendComposer, setSendComposer] = useState(null);
  const [actionId, setActionId] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmSkipChecked, setConfirmSkipChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusActionId, setStatusActionId] = useState("");
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(deleteSkipStorageKey) === "true";
  });
  const [undoToast, setUndoToast] = useState(null);
  const [followUpReminderState, setFollowUpReminderState] = useState(() =>
    readFollowUpReminderState(reminderStorageKey)
  );
  const [recurringSchedules, setRecurringSchedules] = useState(() =>
    readRecurringSchedules(recurringStorageKey)
  );
  const [reminderAutomationSettings, setReminderAutomationSettings] = useState(() =>
    readReminderAutomationSettings(reminderAutomationStorageKey)
  );
  const [reminderNotificationSettings, setReminderNotificationSettings] = useState(() =>
    readReminderNotificationSettings(reminderNotificationSettingsStorageKey)
  );
  const [estimateReviewActionId, setEstimateReviewActionId] = useState("");
  const [reminderAutomationBusy, setReminderAutomationBusy] = useState(false);
  const [reminderAutomationNotice, setReminderAutomationNotice] = useState("");
  const [reminderNotificationBusy, setReminderNotificationBusy] = useState(false);
  const [reminderNotificationNotice, setReminderNotificationNotice] = useState("");
  const [followUpNoteNotice, setFollowUpNoteNotice] = useState("");
  const [followUpNoteDraft, setFollowUpNoteDraft] = useState("");
  const [followUpAiPanelOpen, setFollowUpAiPanelOpen] = useState(false);
  const [followUpAiBusy, setFollowUpAiBusy] = useState("");
  const [followUpAiError, setFollowUpAiError] = useState("");
  const [handoffNotice, setHandoffNotice] = useState("");
  const openInvoiceTargetRef = useRef("");
  const undoTimeoutRef = useRef(null);
  const requiresSignIn = (authRequiredByPolicy || authRequiredError) && !authSession?.userId;
  const emailLinkProvider = Array.isArray(authProviders)
    ? authProviders.find((provider) => provider?.id === "email_link")
    : null;
  const requiresSignInHint = emailLinkProvider?.available
    ? "Open sign-in, send yourself a secure link, then come right back to your invoice library."
    : emailLinkProvider?.warning || "Open sign-in to continue.";

  const requestJson = async (input, init, fallbackMessage) => {
    const response = await apiFetch(input, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload?.error || fallbackMessage);
      requestError.status = response.status;
      throw requestError;
    }
    return payload;
  };

  const handleLibraryError = (requestError, fallbackMessage) => {
    console.error(fallbackMessage, requestError);
    if (requestError?.status === 401) {
      setAuthRequiredError(true);
      setError("");
      setLoading(false);
      setAuthSession(getAuthSession?.() ?? null);
      return;
    }
    if (requestError?.status === 402) {
      setError("");
      setBillingError(
        requestError?.message ||
          "This is a Pro workflow. Upgrade to unlock sends, reminders, payment links, client portals, and repeat-work shortcuts."
      );
      return;
    }
    setError(requestError?.message || fallbackMessage);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) {
      return "";
    }
    const parsed = parseDisplayTimestamp(timestamp);
    if (!Number.isFinite(parsed)) {
      return "";
    }
    const date = new Date(parsed);
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) {
      return "";
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const formatStatusLabel = (status) => {
    if (status === "paid") {
      return "Paid";
    }
    if (status === "sent") {
      return "Sent";
    }
    if (status === "deleted") {
      return "Deleted";
    }
    return "Draft";
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const trackRevenueSignal = (event, source) => {
    revenueAnalytics?.trackRevenueSignal?.(event, source);
  };

  const deriveTaxRate = (invoice) => {
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
  };

  const persistSkipConfirm = (value) => {
    setSkipDeleteConfirm(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(deleteSkipStorageKey, value ? "true" : "false");
    }
  };

  const persistFollowUpReminderState = (nextState) => {
    setFollowUpReminderState(nextState);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(reminderStorageKey, JSON.stringify(nextState));
    }
  };

  const persistRecurringSchedules = (nextEntries) => {
    setRecurringSchedules(nextEntries);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(recurringStorageKey, JSON.stringify({ entries: nextEntries }));
    }
  };

  const persistReminderAutomationSettings = (nextSettings) => {
    const normalized = {
      dueAfterDays: normalizeReminderSetting(nextSettings?.dueAfterDays, 14, 1, 120),
      cooldownDays: normalizeReminderSetting(nextSettings?.cooldownDays, 7, 1, 60),
      maxPerRun: normalizeReminderSetting(nextSettings?.maxPerRun, 10, 1, 100)
    };
    setReminderAutomationSettings(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(reminderAutomationStorageKey, JSON.stringify(normalized));
    }
  };

  const persistReminderNotificationSettings = (nextSettings) => {
    const normalized = { enabled: Boolean(nextSettings?.enabled) };
    setReminderNotificationSettings(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(reminderNotificationSettingsStorageKey, JSON.stringify(normalized));
    }
  };

  const requestReminderNotificationPermission = async () => {
    if (!canUseBrowserNotifications()) {
      throw new Error("Browser notifications are not available in this browser.");
    }
    const permission = window.Notification.permission;
    if (permission === "granted") {
      return "granted";
    }
    if (permission === "denied") {
      throw new Error("Browser notifications are blocked in this browser.");
    }
    const nextPermission = await window.Notification.requestPermission();
    if (nextPermission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }
    return nextPermission;
  };

  const showReminderNotification = async (title, body) => {
    if (!reminderNotificationSettings.enabled || !canUseBrowserNotifications()) {
      return false;
    }
    if (window.Notification.permission !== "granted") {
      return false;
    }
    new window.Notification(title, {
      body,
      tag: "notebill-reminder"
    });
    return true;
  };

  const setRecurringSchedule = (invoiceId, intervalDays = 30, options = {}) => {
    const normalizedInterval = normalizeRecurringInterval(intervalDays);
    const nextDueAt = new Date(Date.now() + normalizedInterval * recurringDayMs).toISOString();
    const invoice = invoices.find((candidate) => candidate.invoiceId === invoiceId);
    if (invoice?.customerName) {
      rememberClientRecurringInterval(invoice.customerName, normalizedInterval);
    }
    persistRecurringSchedules({
      ...recurringSchedules,
      [invoiceId]: {
        ...recurringSchedules[invoiceId],
        intervalDays: normalizedInterval,
        nextDueAt,
        autoSendEnabled:
          typeof options?.autoSendEnabled === "boolean"
            ? options.autoSendEnabled
            : Boolean(recurringSchedules[invoiceId]?.autoSendEnabled)
      }
    });
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "recurring_schedule_set",
        source: options?.source ?? "library_recurring_schedule"
      })
    }).catch(() => {});
  };

  const setCustomRecurringSchedule = (invoiceId, currentIntervalDays = 30) => {
    if (typeof window === "undefined") {
      return;
    }
    const input = window.prompt(
      "Set recurring interval in days (1-365).",
      String(normalizeRecurringInterval(currentIntervalDays))
    );
    if (input === null) {
      return;
    }
    const parsed = Number.parseInt(input.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
      setError("Recurring interval must be between 1 and 365 days.");
      return;
    }
    setError("");
    setRecurringSchedule(invoiceId, parsed);
  };

  const removeRecurringSchedule = (invoiceId) => {
    if (!invoiceId || !recurringSchedules[invoiceId]) {
      return;
    }
    const nextEntries = { ...recurringSchedules };
    delete nextEntries[invoiceId];
    persistRecurringSchedules(nextEntries);
  };

  const advanceRecurringSchedule = (invoiceId) => {
    const existing = recurringSchedules[invoiceId];
    if (!existing) {
      return;
    }
    const intervalDays = normalizeRecurringInterval(existing.intervalDays);
    const existingDueMs = parseRecurringTimestamp(existing.nextDueAt);
    const baseMs = Math.max(Date.now(), existingDueMs);
    const nextDueAt = new Date(baseMs + intervalDays * recurringDayMs).toISOString();
    persistRecurringSchedules({
      ...recurringSchedules,
      [invoiceId]: {
        ...existing,
        intervalDays,
        nextDueAt,
        autoSendEnabled: Boolean(existing.autoSendEnabled)
      }
    });
  };

  const toggleRecurringAutoSend = (invoiceId, enabled) => {
    const existing = recurringSchedules[invoiceId];
    if (!existing) {
      return;
    }
    persistRecurringSchedules({
      ...recurringSchedules,
      [invoiceId]: {
        ...existing,
        autoSendEnabled: Boolean(enabled)
      }
    });
    setDeliveryNotice(
      enabled
        ? "Recurring auto-send is armed. NoteBill will keep the cadence and recipient visible so you can trust the next step."
        : "Recurring auto-send is paused for now."
    );
  };

  const runRecurringAutoSend = async (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    const recurringEntry = recurringSchedules[invoice.invoiceId];
    if (!recurringEntry?.autoSendEnabled) {
      setError("Arm recurring auto-send before running it.");
      return;
    }
    const recipientEmail = getRecurringAutoSendRecipient(invoice, clientMemoryEntries);
    if (!recipientEmail) {
      setError("Recurring auto-send needs a remembered recipient email.");
      return;
    }
    setError("");
    setDeliveryNotice(`Running recurring send for ${recipientEmail}...`);
    const nextDueAt = new Date(
      Date.now() + normalizeRecurringInterval(recurringEntry.intervalDays) * recurringDayMs
    ).toISOString();
    const nextSchedules = {
      ...recurringSchedules,
      [invoice.invoiceId]: {
        ...recurringEntry,
        nextDueAt,
        autoSendEnabled: true,
        lastAutoSendAt: new Date().toISOString(),
        lastAutoSendRecipient: recipientEmail,
        autoSendRunCount: Math.max(0, Number(recurringEntry.autoSendRunCount ?? 0) || 0) + 1,
        lastAutoSendMode: "running",
        runHistory: [
          {
            runAt: new Date().toISOString(),
            recipient: recipientEmail,
            mode: "running"
          },
          ...(Array.isArray(recurringEntry.runHistory) ? recurringEntry.runHistory : [])
        ].slice(0, 5)
      }
    };
    persistRecurringSchedules(nextSchedules);
    try {
      const payload = await requestJson(
        `/api/invoices/${invoice.invoiceId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientEmail })
        },
        "Failed to send recurring invoice."
      );
      persistRecurringSchedules({
        ...nextSchedules,
        [invoice.invoiceId]: {
          ...nextSchedules[invoice.invoiceId],
          lastAutoSendMode: String(payload?.mode ?? "recorded"),
          runHistory: [
            {
              runAt: new Date().toISOString(),
              recipient: recipientEmail,
              mode: String(payload?.mode ?? "recorded")
            },
            ...(Array.isArray(nextSchedules[invoice.invoiceId].runHistory)
              ? nextSchedules[invoice.invoiceId].runHistory.slice(1)
              : [])
          ].slice(0, 5)
        }
      });
      setInvoices((prev) =>
        prev.map((candidate) =>
          candidate.invoiceId === invoice.invoiceId
            ? {
                ...candidate,
                status: payload?.invoice?.status ?? candidate.status,
                updatedAt: payload?.invoice?.updatedAt ?? candidate.updatedAt,
                delivery: payload?.delivery ?? candidate.delivery ?? null
              }
            : candidate
        )
      );
      setDeliveryNotice(
        `Recurring send run for ${recipientEmail}. Next due ${formatDate(nextDueAt)}. Watch delivery before nudging again.`
      );
    } catch (sendError) {
      setError(sendError?.message || "Failed to send recurring invoice.");
    }
  };

  const clearUndoToast = () => {
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoToast(null);
  };

  const showUndoToast = (ids) => {
    if (!ids.length) {
      return;
    }
    const message =
      ids.length === 1
        ? "Invoice moved to Trash."
        : `${ids.length} invoices moved to Trash.`;
    setUndoToast({ ids, message });
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
    }
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoToast(null);
      undoTimeoutRef.current = null;
    }, 6500);
  };

  const loadInvoices = async (includeDeleted = showTrash) => {
    if (!authPolicyLoaded) {
      return;
    }
    if (requiresSignIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await requestJson(
        includeDeleted ? "/api/invoices?includeDeleted=true" : "/api/invoices",
        undefined,
        "Failed to load invoices."
      );
      setAuthRequiredError(false);
      const list = Array.isArray(payload?.invoices) ? payload.invoices : [];
      const filtered = includeDeleted
        ? list.filter((invoice) => invoice.status === "deleted")
        : list;
      setInvoices(filtered);
      setSelectedIds((prev) =>
        prev.filter((id) => filtered.some((invoice) => invoice.invoiceId === id))
      );
    } catch (loadError) {
      handleLibraryError(loadError, "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  const loadAccountPlan = async (shouldApply = () => true) => {
    try {
      const payload = await requestJson("/api/account/plan", undefined, "Failed to load account plan.");
      if (shouldApply()) {
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      }
    } catch (planError) {
      if (planError?.status === 401) {
        if (shouldApply()) {
          setAccountPlan(null);
        }
        return;
      }
      if (shouldApply()) {
        setAccountPlan(null);
      }
    }
  };

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAuthPolicy = async () => {
      try {
        const payload = await requestJson("/api/system/persistence", undefined, "Failed to load auth policy.");
        if (cancelled) {
          return;
        }
        setAuthRequiredByPolicy(Boolean(payload?.authRequired));
        setAuthProviders(Array.isArray(payload?.authProviders) ? payload.authProviders : []);
      } catch (policyError) {
        if (!cancelled) {
          handleLibraryError(policyError, "Failed to load auth policy.");
        }
      } finally {
        if (!cancelled) {
          setAuthPolicyLoaded(true);
        }
      }
    };

    const syncSession = async () => {
      if (typeof refreshSession === "function") {
        const nextSession = await refreshSession();
        if (!cancelled) {
          setAuthSession(nextSession);
        }
      } else if (!cancelled) {
        setAuthSession(getAuthSession?.() ?? null);
      }
    };

    void syncSession();
    void loadAuthPolicy();
    void loadAccountPlan(() => !cancelled);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setAuthSession(getAuthSession?.() ?? null);
      }
    };
    const handleFocus = () => {
      setAuthSession(getAuthSession?.() ?? null);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    loadInvoices(showTrash);
    setSelectionMode(false);
    setSelectedIds([]);
  }, [showTrash, authPolicyLoaded, authRequiredByPolicy, authSession?.userId, authRequiredError]);

  useEffect(() => {
    let active = true;
    void loadAccountPlan(() => active);
    return () => {
      active = false;
    };
  }, [authSession?.userId, authPolicyLoaded]);

  useEffect(() => {
    setFollowUpReminderState(readFollowUpReminderState(reminderStorageKey));
  }, [reminderStorageKey]);

  useEffect(() => {
    setRecurringSchedules(readRecurringSchedules(recurringStorageKey));
  }, [recurringStorageKey]);

  useEffect(() => {
    setReminderAutomationSettings(readReminderAutomationSettings(reminderAutomationStorageKey));
    setReminderAutomationNotice("");
  }, [reminderAutomationStorageKey]);

  useEffect(() => {
    if (showTrash || invoices.length === 0) {
      return;
    }
    const visibleIds = new Set(invoices.map((invoice) => invoice.invoiceId));
    const staleIds = Object.keys(recurringSchedules).filter((invoiceId) => !visibleIds.has(invoiceId));
    if (staleIds.length === 0) {
      return;
    }
    const nextEntries = { ...recurringSchedules };
    staleIds.forEach((invoiceId) => {
      delete nextEntries[invoiceId];
    });
    persistRecurringSchedules(nextEntries);
  }, [invoices, showTrash, recurringSchedules]);

  useEffect(() => {
    if (!sendComposer) {
      return;
    }
    const exists = invoices.some((invoice) => invoice.invoiceId === sendComposer.invoiceId);
    if (!exists) {
      setSendComposer(null);
    }
  }, [invoices, sendComposer]);

  useEffect(() => {
    if (showTrash && statusFilter !== "all") {
      setStatusFilter("all");
    }
  }, [showTrash, statusFilter]);

  useEffect(() => {
    const openInvoiceId = new URLSearchParams(location.search).get("open")?.trim() ?? "";
    if (!openInvoiceId || loading || invoices.length === 0) {
      return;
    }
    if (openInvoiceTargetRef.current === openInvoiceId) {
      return;
    }
    const targetInvoice = invoices.find((invoice) => invoice.invoiceId === openInvoiceId);
    if (!targetInvoice) {
      return;
    }
    openInvoiceTargetRef.current = openInvoiceId;
    void handleOpen(openInvoiceId);
  }, [invoices, loading, location.search]);

  useEffect(() => {
    if (!requiresSignIn) {
      return;
    }
    setSelectionMode(false);
    setSelectedIds([]);
    setDeleteTarget(null);
    setSendComposer(null);
    clearUndoToast();
  }, [requiresSignIn]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    };
  }, []);

  const openSavedInvoice = async (
    invoiceId,
    endpoint,
    method = "GET",
    draftOptions = {},
    options = {}
  ) => {
    setActionId(invoiceId);
    try {
      const payload = await requestJson(
        endpoint,
        method === "GET" ? undefined : { method },
        "Failed to open invoice."
      );
      setAuthRequiredError(false);
      const savedInvoice = payload?.invoice;
      const invoiceData = savedInvoice?.invoiceData;
      if (!invoiceData?.finishedInvoice) {
        throw new Error("Saved invoice data is incomplete.");
      }
      const baseDraft = buildDraftFromFinishedInvoice(invoiceData.finishedInvoice, {
        taxRate: deriveTaxRate(invoiceData.finishedInvoice),
        savedInvoiceId: savedInvoice?.invoiceId ?? "",
        savedInvoiceStatus: savedInvoice?.status ?? "",
        ...draftOptions
      });
      const draft =
        typeof options?.transformDraft === "function"
          ? options.transformDraft(baseDraft, savedInvoice) ?? baseDraft
          : baseDraft;
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      if (typeof options?.onLoaded === "function") {
        options.onLoaded(savedInvoice, draft);
      }
      revenueAnalytics?.trackRevenueSignalOnce?.("first_invoice_reopened", "library_reopen");
      markReviewMilestone("invoice_reopened");
      maybeRequestInAppReview("invoice_reopened");
      navigate(options?.navigateTo || "/manual");
    } catch (openError) {
      handleLibraryError(openError, "Failed to open invoice.");
    } finally {
      setActionId("");
    }
  };

  const handleOpen = (invoiceId) => openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`);
  const handleOpenWithBillie = (invoiceId) =>
    openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`, "GET", {}, {
      onLoaded: (savedInvoice) => {
        const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice ?? {};
        const hasLineItems = Array.isArray(finishedInvoice?.lineItems)
          ? finishedInvoice.lineItems.some(
              (lineItem) => typeof lineItem?.description === "string" && lineItem.description.trim()
            )
          : false;
        const hasNotes = typeof finishedInvoice?.notes === "string" && finishedInvoice.notes.trim().length > 0;
        const starterInstruction =
          hasLineItems && hasNotes
            ? "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
            : hasLineItems
              ? "Refine the invoice wording so this saved draft feels polished and client-ready. Keep numbers unchanged."
              : hasNotes
                ? "Refine the notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
                : "Refine the client-facing wording and presentation while keeping numbers unchanged.";
        try {
          const billieWorkspaceStorageKey =
            requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
          window.localStorage.setItem(billieWorkspaceStorageKey, starterInstruction);
        } catch (_error) {
          // Best-effort only.
        }
      },
      navigateTo: "/manual?tab=assistant&source=library"
    });
  const handleInvoiceAgain = (invoiceId, options = {}) =>
    openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`, "GET", {
      freshDraft: true,
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    }, options);

  const handleStartFromClientMemory = (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    const starter = buildClientMemoryStarterForInvoice(
      invoice,
      getClientMemory(),
      getLineItemLibrary()
    );
    if (!starter) {
      void handleInvoiceAgain(invoice.invoiceId);
      return;
    }
    const draft = buildDraftFromFinishedInvoice(
      {
        customerName: starter.customerName,
        notes: starter.defaultNotes || getClientDefaultNotes(invoice?.customerName ?? ""),
        lineItems: Array.isArray(starter.topItems) && starter.topItems.length > 0
          ? starter.topItems.map((item, index) => {
              const quantity = Number(item?.qty);
              const unitPrice = Number(item?.rate);
              return {
                id: `memory-line-${Date.now()}-${index}`,
                description: item?.description ?? "",
                quantity: Number.isFinite(quantity) ? quantity : 1,
                unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
                amount:
                  (Number.isFinite(quantity) ? quantity : 1) *
                  (Number.isFinite(unitPrice) ? unitPrice : 0)
              };
            })
          : []
      },
      {
        freshDraft: true,
        taxRate: "0",
        savedInvoiceId: "",
        savedInvoiceStatus: ""
      }
    );
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    trackRevenueSignal("client_memory_reused", "library_client_memory_start");
    if (starter.leadItem) {
      trackRevenueSignal("service_memory_reused", "library_client_memory_start");
    }
    if (starter.recipientEmail) {
      setDeliveryNotice(
        Array.isArray(starter.topItems) && starter.topItems.length > 1
          ? `Started a repeat-ready draft with ${starter.topItems.length} saved services. Saved recipient ${starter.recipientEmail} will stay easy to reuse when you send.`
          : `Started a repeat-ready draft from saved client memory. Saved recipient ${starter.recipientEmail} will stay easy to reuse when you send.`
      );
    } else {
      setDeliveryNotice(
        Array.isArray(starter.topItems) && starter.topItems.length > 1
          ? `Started a repeat-ready draft with ${starter.topItems.length} saved services.`
          : "Started a repeat-ready draft from saved client memory."
      );
    }
    navigate("/manual");
  };

  const handleStatusUpdate = async (invoiceId, status) => {
    const statusActionKey = `${invoiceId}:${status}`;
    setStatusActionId(statusActionKey);
    setError("");
    setDeliveryNotice("");
    try {
      const currentInvoice = invoices.find((invoice) => invoice.invoiceId === invoiceId) ?? null;
      const payload = await requestJson(
        `/api/invoices/${invoiceId}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        },
        "Failed to update invoice status."
      );
      setAuthRequiredError(false);
      const updatedInvoice = payload?.invoice;
      if (updatedInvoice?.invoiceId) {
        const mergedInvoice = currentInvoice
          ? mergeUpdatedInvoiceMetadata(currentInvoice, updatedInvoice)
          : updatedInvoice;
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice.invoiceId === updatedInvoice.invoiceId
              ? mergeUpdatedInvoiceMetadata(invoice, updatedInvoice)
              : invoice
          )
        );
        if (status === "paid") {
          setDeliveryNotice(
            `Marked ${updatedInvoice.invoiceNumber || "the invoice"} as paid. Next: use Invoice again when similar work comes back.`
          );
        } else if (status === "sent") {
          setDeliveryNotice(
            Boolean(mergedInvoice?.delivery?.recipientEmail && mergedInvoice?.delivery?.sentAt)
              ? `Marked ${updatedInvoice.invoiceNumber || "the invoice"} as sent. Next: watch delivery before following up.`
              : `Marked ${updatedInvoice.invoiceNumber || "the invoice"} as sent. Next: add a tracked recipient so delivery and reminders stay clearer.`
          );
        } else if (status === "draft") {
          setDeliveryNotice(
            `Moved ${updatedInvoice.invoiceNumber || "the invoice"} back to draft. Next: finish the edits before sending it again.`
          );
        }
      }
    } catch (statusError) {
      handleLibraryError(statusError, "Failed to update invoice status.");
    } finally {
      setStatusActionId("");
    }
  };

  const handleConvertEstimateToInvoice = async (invoiceId) => {
    setActionId(invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const currentInvoice = invoices.find((invoice) => invoice.invoiceId === invoiceId) ?? null;
      const payload = await requestJson(`/api/invoices/${invoiceId}`, undefined, "Failed to load estimate.");
      const savedInvoice = payload?.invoice;
      const invoiceData = savedInvoice?.invoiceData;
      const finishedInvoice = invoiceData?.finishedInvoice;
      if (!savedInvoice?.invoiceId || !invoiceData || !finishedInvoice) {
        throw new Error("Saved estimate data is incomplete.");
      }
      if (finishedInvoice.documentType !== "estimate") {
        throw new Error("This saved document is already an invoice.");
      }
      const savePayload = await requestJson(
        "/api/invoices/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmSave: true,
            invoiceId: savedInvoice.invoiceId,
            sourceType: savedInvoice.sourceType,
            invoiceData: {
              ...invoiceData,
              finishedInvoice: {
                ...finishedInvoice,
                documentType: "invoice"
              }
            }
          })
        },
        "Failed to convert estimate."
      );
      const updatedInvoice = savePayload?.invoice;
      if (updatedInvoice?.invoiceId) {
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice.invoiceId === updatedInvoice.invoiceId
              ? mergeUpdatedInvoiceMetadata(invoice, updatedInvoice)
              : invoice
          )
        );
        setDeliveryNotice(
          `Converted ${updatedInvoice.invoiceNumber || "the estimate"} into a draft invoice. Next: open it, confirm payment terms, and send when ready.`
        );
      }
    } catch (convertError) {
      handleLibraryError(convertError, "Failed to convert estimate.");
    } finally {
      setActionId("");
    }
  };

  const handleSetEstimateReviewState = async (invoiceId, reviewState) => {
    if (!invoiceId || !reviewState) {
      return;
    }
    setEstimateReviewActionId(invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(`/api/invoices/${invoiceId}`, undefined, "Failed to load estimate.");
      const savedInvoice = payload?.invoice;
      const invoiceData = savedInvoice?.invoiceData;
      const finishedInvoice = invoiceData?.finishedInvoice;
      if (!savedInvoice?.invoiceId || !invoiceData || !finishedInvoice) {
        throw new Error("Saved estimate data is incomplete.");
      }
      if (finishedInvoice.documentType !== "estimate") {
        throw new Error("This saved document is already an invoice.");
      }
      const savePayload = await requestJson(
        "/api/invoices/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmSave: true,
            invoiceId: savedInvoice.invoiceId,
            sourceType: savedInvoice.sourceType,
            invoiceData: {
              ...invoiceData,
              finishedInvoice: {
                ...finishedInvoice,
                estimateReviewState: reviewState,
                estimateReviewUpdatedAt: new Date().toISOString()
              }
            }
          })
        },
        "Failed to update estimate review state."
      );
      const updatedInvoice = savePayload?.invoice;
      if (updatedInvoice?.invoiceId) {
        const estimateLabel =
          updatedInvoice.invoiceNumber ||
          savedInvoice.invoiceNumber ||
          savedInvoice.invoiceData?.finishedInvoice?.invoiceNumber ||
          "the estimate";
        setInvoices((prev) =>
          prev.map((invoice) => {
            if (invoice.invoiceId !== updatedInvoice.invoiceId) {
              return invoice;
            }
            const mergedInvoice = mergeUpdatedInvoiceMetadata(invoice, updatedInvoice);
            return {
              ...mergedInvoice,
              estimateReviewState: reviewState,
              invoiceData: {
                ...(mergedInvoice.invoiceData || {}),
                finishedInvoice: {
                  ...(mergedInvoice.invoiceData?.finishedInvoice || {}),
                  estimateReviewState: reviewState,
                  estimateReviewUpdatedAt: new Date().toISOString()
                }
              }
            };
          })
        );
        setDeliveryNotice(
          reviewState === "approved"
            ? `Marked ${estimateLabel} as approved. Next: convert it when the work is ready to bill.`
            : `Marked ${estimateLabel} as needing review. Next: reopen it with Billie and tidy the missing pieces.`
        );
      }
    } catch (reviewError) {
      handleLibraryError(reviewError, "Failed to update estimate review state.");
    } finally {
      setEstimateReviewActionId("");
    }
  };

  const buildPostSendNextStepNotice = (invoice, { isResend = false } = {}) => {
    const paymentLinkReady = Boolean(String(invoice?.paymentLinkUrl ?? "").trim());
    const clientPortalReady = Boolean(buildLibraryClientPortalUrl(invoice));
    const deliveryOpened = invoice?.delivery?.status === "opened";
    const dueDateValue = getInvoiceDueDateValue(invoice);
    const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
    const isPastDue =
      invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= Date.now();

    if (!paymentLinkReady) {
      return isResend
        ? "Next: add the hosted payment link so the resent invoice is easier to pay."
        : "Next: add the hosted payment link so paying feels easier on first delivery.";
    }
    if (!clientPortalReady) {
      return isResend
        ? "Next: create the client portal so the resend includes the full review-and-pay handoff."
        : "Next: create the client portal so the customer can review everything in one place.";
    }
    if (isResend) {
      return isPastDue && !deliveryOpened
        ? "Next: watch for an open before escalating into another payment reminder."
        : "Next: watch for payment and only send a focused reminder if the balance stays stuck.";
    }
    return "Next: watch for opens and payment before nudging again.";
  };

  const buildPostReminderNextStepNotice = (invoice) => {
    const paymentLinkReady = Boolean(String(invoice?.paymentLinkUrl ?? "").trim());
    const clientPortalReady = Boolean(buildLibraryClientPortalUrl(invoice));
    const deliveryOpened = invoice?.delivery?.status === "opened";
    const dueDateValue = getInvoiceDueDateValue(invoice);
    const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
    const isPastDue =
      invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= Date.now();

    if (!paymentLinkReady) {
      return "Next: add a hosted payment link so the follow-up points to an easier payment path.";
    }
    if (!clientPortalReady) {
      return "Next: add the client portal so the customer has a cleaner review surface with the reminder.";
    }
    if (isPastDue && deliveryOpened) {
      return "Next: watch for payment and mark it paid as soon as the money lands.";
    }
    if (isPastDue && !deliveryOpened) {
      return "Next: if it still stays unopened, re-send it or confirm the best delivery route.";
    }
    return "Next: watch for a reply or payment before nudging again.";
  };

  const handleSendInvoice = async (invoice, options = {}) => {
    if (!invoice?.invoiceId) {
      return;
    }
    const recipientEmail = String(options?.recipientEmail ?? "").trim().toLowerCase();
    const isResend =
      Boolean(options?.intent === "resend") ||
      Boolean(invoice?.delivery?.recipientEmail && invoice?.delivery?.sentAt);
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      setError("Enter a valid recipient email.");
      return;
    }
    setActionId(invoice.invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoice.invoiceId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientEmail })
        },
        "Failed to send invoice."
      );
      setAuthRequiredError(false);
      setInvoices((prev) =>
        prev.map((candidate) =>
          candidate.invoiceId === invoice.invoiceId
            ? {
                ...candidate,
                status: payload?.invoice?.status ?? "sent",
                updatedAt: payload?.invoice?.updatedAt ?? candidate.updatedAt,
                delivery: payload?.delivery ?? candidate.delivery ?? null
              }
            : candidate
        )
      );
      if (payload?.mode === "provider") {
        setDeliveryNotice(
          isResend
            ? `Invoice re-sent to ${recipientEmail}. Delivery tracking is now active. ${buildPostSendNextStepNotice(invoice, { isResend })}`
            : `Invoice sent to ${recipientEmail}. Delivery tracking is now active. ${buildPostSendNextStepNotice(invoice, { isResend })}`
        );
      } else {
        const fallbackNotice = isResend
          ? `Re-send recorded for ${recipientEmail}.`
          : `Send recorded for ${recipientEmail}.`;
        setDeliveryNotice(
          payload?.warning
            ? `${fallbackNotice} ${payload.warning} ${buildPostSendNextStepNotice(invoice, { isResend })}`
            : `${fallbackNotice} Configure an email provider to send automatically. ${buildPostSendNextStepNotice(invoice, { isResend })}`
        );
      }
      if (invoice.customerName) {
        rememberClientRecipientEmail(invoice.customerName, recipientEmail);
      }
      markReviewMilestone("invoice_sent");
      maybeRequestInAppReview(isResend ? "invoice_resent" : "invoice_sent");
      setSendComposer((current) =>
        current && current.invoiceId === invoice.invoiceId ? null : current
      );
      return payload;
    } catch (sendError) {
      handleLibraryError(sendError, "Failed to send invoice.");
      return null;
    } finally {
      setActionId("");
    }
  };

  const handleSendReminder = async (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    setActionId(invoice.invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoice.invoiceId}/send-reminder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        },
        "Failed to send reminder."
      );
      setAuthRequiredError(false);
      setInvoices((prev) =>
        prev.map((candidate) =>
          candidate.invoiceId === invoice.invoiceId
            ? {
                ...candidate,
                status: payload?.invoice?.status ?? candidate.status,
                updatedAt: payload?.invoice?.updatedAt ?? candidate.updatedAt,
                delivery: payload?.delivery ?? candidate.delivery ?? null
              }
            : candidate
        )
      );
      const recipient = payload?.delivery?.recipientEmail ?? invoice?.delivery?.recipientEmail ?? "";
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
      const isPastDue =
        invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= Date.now();
      const isFocusedReminder = isPastDue && invoice?.delivery?.status === "opened";
      if (payload?.mode === "provider") {
        setDeliveryNotice(
          isFocusedReminder
            ? `Focused reminder sent to ${recipient}. Delivery tracking is now active. ${buildPostReminderNextStepNotice(invoice)}`
            : `Reminder sent to ${recipient}. Delivery tracking is now active. ${buildPostReminderNextStepNotice(invoice)}`
        );
      } else {
        const fallbackNotice = isFocusedReminder
          ? `Focused reminder recorded for ${recipient || "the saved recipient"}.`
          : `Reminder recorded for ${recipient || "the saved recipient"}.`;
        setDeliveryNotice(
          payload?.warning
            ? `${fallbackNotice} ${payload.warning} ${buildPostReminderNextStepNotice(invoice)}`
            : `${fallbackNotice} Configure an email provider to send automatically. ${buildPostReminderNextStepNotice(invoice)}`
        );
      }
    } catch (reminderError) {
      handleLibraryError(reminderError, "Failed to send reminder.");
    } finally {
      setActionId("");
    }
  };

  const runReminderAutomation = async ({ dryRun }) => {
    setReminderAutomationBusy(true);
    setError("");
    setDeliveryNotice("");
    setReminderAutomationNotice("");
    try {
      const payload = await requestJson(
        "/api/invoices/reminders/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun,
            dueAfterDays: reminderAutomationSettings.dueAfterDays,
            cooldownDays: reminderAutomationSettings.cooldownDays,
            maxPerRun: reminderAutomationSettings.maxPerRun
          })
        },
        dryRun ? "Failed to preview due reminders." : "Failed to run reminders."
      );
      setAuthRequiredError(false);
      const dueCount = Number(payload?.dueCount ?? 0);
      const scannedCount = Number(payload?.scannedCount ?? 0);
      if (dryRun) {
        setReminderAutomationNotice(
          dueCount > 0
            ? `${dueCount} reminder${dueCount === 1 ? "" : "s"} due now (from ${scannedCount} sent invoices).`
            : `No reminders due right now (scanned ${scannedCount} sent invoices).`
        );
        if (dueCount > 0) {
          void showReminderNotification(
            "NoteBill reminders are due",
            `${dueCount} reminder${dueCount === 1 ? "" : "s"} are due now. Open NoteBill to send them.`
          ).catch(() => {});
        }
        return;
      }
      const sentCount = Number(payload?.sentCount ?? 0);
      if (sentCount > 0) {
        setReminderAutomationNotice(
          `Sent ${sentCount} reminder${sentCount === 1 ? "" : "s"} (from ${dueCount} due).`
        );
        void showReminderNotification(
          "NoteBill reminders sent",
          `Sent ${sentCount} reminder${sentCount === 1 ? "" : "s"} from the library.`
        ).catch(() => {});
      } else {
        setReminderAutomationNotice(
          dueCount > 0
            ? "No reminders were sent. Check delivery configuration."
            : "No reminders were due right now."
        );
      }
      await loadInvoices(showTrash);
    } catch (reminderRunError) {
      handleLibraryError(reminderRunError, dryRun ? "Failed to preview due reminders." : "Failed to run reminders.");
    } finally {
      setReminderAutomationBusy(false);
    }
  };

  const handleEnableReminderNotifications = async () => {
    setReminderNotificationBusy(true);
    setError("");
    setReminderNotificationNotice("");
    try {
      persistReminderNotificationSettings({ enabled: true });
      setReminderNotificationNotice("Reminder alerts enabled.");
    } catch (notificationError) {
      handleLibraryError(notificationError, "Failed to enable browser reminders.");
    } finally {
      setReminderNotificationBusy(false);
    }
  };

  const handleTestReminderNotification = async () => {
    setReminderNotificationBusy(true);
    setError("");
    setReminderNotificationNotice("");
    try {
      setReminderNotificationNotice("Sending reminder test...");
      await requestReminderNotificationPermission();
      persistReminderNotificationSettings({ enabled: true });
      const delivered = await showReminderNotification(
        "NoteBill reminder test",
        buildReminderNotificationPreview()
      );
      setReminderNotificationNotice(delivered ? "Test reminder sent." : "Notification permission granted.");
    } catch (notificationError) {
      handleLibraryError(notificationError, "Failed to send a test reminder notification.");
    } finally {
      setReminderNotificationBusy(false);
    }
  };

  const startSendComposer = (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    const trackedRecipient = (invoice?.delivery?.recipientEmail ?? "").trim().toLowerCase();
    const rememberedRecipient = getClientRecipientEmail(invoice?.customerName ?? "").trim().toLowerCase();
    setSendComposer({
      invoiceId: invoice.invoiceId,
      recipientEmail: trackedRecipient || rememberedRecipient,
      prefilledFrom: trackedRecipient ? "delivery" : rememberedRecipient ? "client_memory" : ""
    });
    setError("");
    setDeliveryNotice("");
  };

  const cancelSendComposer = () => {
    setSendComposer(null);
  };

  const submitSendComposer = async (invoiceId) => {
    const targetInvoice = invoices.find((invoice) => invoice.invoiceId === invoiceId);
    if (!targetInvoice || !sendComposer || sendComposer.invoiceId !== invoiceId) {
      return;
    }
    const recipientEmail = String(sendComposer.recipientEmail ?? "").trim().toLowerCase();
    await handleSendInvoice(targetInvoice, { recipientEmail });
    setSendComposer(null);
  };

  const handleMarkDeliveryOpened = async (invoiceId) => {
    if (!invoiceId) {
      return;
    }
    setActionId(invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoiceId}/delivery/opened`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        },
        "Failed to update delivery status."
      );
      setAuthRequiredError(false);
      setInvoices((prev) =>
        prev.map((candidate) =>
          candidate.invoiceId === invoiceId
            ? {
                ...candidate,
                delivery: payload?.delivery ?? candidate.delivery ?? null
              }
            : candidate
        )
      );
      const openedInvoice = invoices.find((invoice) => invoice.invoiceId === invoiceId) ?? null;
      const dueDateValue = getInvoiceDueDateValue(openedInvoice);
      const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
      const isPastDue =
        openedInvoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= Date.now();
      setDeliveryNotice(
        isPastDue
          ? "Marked as opened. Next: send a focused reminder or mark it paid if the money already arrived."
          : "Marked as opened. Next: watch for payment before following up again."
      );
    } catch (deliveryError) {
      handleLibraryError(deliveryError, "Failed to update delivery status.");
    } finally {
      setActionId("");
    }
  };

  const handleRestore = async (ids) => {
    if (!ids.length) {
      return;
    }
    setIsDeleting(true);
    setError("");
    try {
      await Promise.all(
        ids.map((id) =>
          requestJson(
            `/api/invoices/${id}/restore`,
            {
              method: "POST"
            },
            "Failed to restore invoices."
          )
        )
      );
      setAuthRequiredError(false);
      await loadInvoices(showTrash);
      setSelectedIds([]);
      clearUndoToast();
    } catch (restoreError) {
      handleLibraryError(restoreError, "Failed to restore invoices.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSoftDelete = async (ids) => {
    if (!ids.length) {
      return;
    }
    setIsDeleting(true);
    setError("");
    try {
      await Promise.all(
        ids.map((id) =>
          requestJson(
            `/api/invoices/${id}/status`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "deleted" })
            },
            "Failed to delete invoices."
          )
        )
      );
      setAuthRequiredError(false);
      await loadInvoices(showTrash);
      setSelectedIds([]);
      showUndoToast(ids);
    } catch (deleteError) {
      handleLibraryError(deleteError, "Failed to delete invoices.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePermanentDelete = async (ids) => {
    if (!ids.length) {
      return;
    }
    setIsDeleting(true);
    setError("");
    try {
      await Promise.all(
        ids.map((id) =>
          requestJson(
            `/api/invoices/${id}`,
            {
              method: "DELETE"
            },
            "Failed to delete invoices."
          )
        )
      );
      setAuthRequiredError(false);
      await loadInvoices(showTrash);
      setSelectedIds([]);
    } catch (deleteError) {
      handleLibraryError(deleteError, "Failed to delete invoices.");
    } finally {
      setIsDeleting(false);
    }
  };

  const requestDelete = ({ ids, label, mode }) => {
    if (!ids.length) {
      return;
    }
    if (mode === "soft" && skipDeleteConfirm) {
      handleSoftDelete(ids);
      return;
    }
    setConfirmSkipChecked(skipDeleteConfirm);
    setDeleteTarget({ ids, label, mode });
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.ids?.length) {
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.mode === "soft") {
      if (confirmSkipChecked && !skipDeleteConfirm) {
        persistSkipConfirm(true);
      }
      await handleSoftDelete(deleteTarget.ids);
    }
    if (deleteTarget.mode === "permanent") {
      await handlePermanentDelete(deleteTarget.ids);
    }
    setDeleteTarget(null);
  };

  const handleUndo = async () => {
    if (!undoToast?.ids?.length) {
      return;
    }
    await handleRestore(undoToast.ids);
    clearUndoToast();
  };

  const statusStyles = {
    draft: "nb-chip nb-chip--soft normal-case tracking-normal rounded-full",
    sent: "nb-chip nb-chip--info normal-case tracking-normal rounded-full",
    paid: "nb-chip nb-chip--success normal-case tracking-normal rounded-full",
    deleted: "nb-chip nb-chip--danger normal-case tracking-normal rounded-full"
  };
  const sentReminderThresholdDays = 14;
  const sentReminderThresholdMs = sentReminderThresholdDays * 24 * 60 * 60 * 1000;
  const staleDraftThresholdDays = 7;
  const staleDraftThresholdMs = staleDraftThresholdDays * 24 * 60 * 60 * 1000;
  const getInvoiceLifecycleLabel = (invoice) => {
    if (invoice?.status === "deleted") {
      return "Deleted invoice";
    }
    if (invoice?.status === "paid") {
      return "Paid invoice";
    }
    if (invoice?.status === "sent") {
      return "Sent invoice";
    }
    if (invoice?.sourceType === "upload") {
      return "Imported draft";
    }
    return "Draft invoice";
  };
  const getPaymentStatusView = ({ status, balanceDue, total, isPastDue }) => {
    const amountLabel = formatMoney(balanceDue);
    const hasPartialPayment =
      Number.isFinite(total) && Number.isFinite(balanceDue) && balanceDue > 0 && balanceDue < total;
    if (status === "paid") {
      return {
        label: "Paid and closed",
        className: "nb-chip nb-chip--success normal-case tracking-normal"
      };
    }
    if (status === "deleted") {
      return {
        label: "In trash",
        className: "nb-chip nb-chip--danger normal-case tracking-normal"
      };
    }
    if (status === "sent" && isPastDue) {
      return {
        label: hasPartialPayment ? `Past due: ${amountLabel} remaining` : `Past due: ${amountLabel}`,
        className: "nb-chip nb-chip--warning normal-case tracking-normal"
      };
    }
    if (status === "sent") {
      return {
        label: hasPartialPayment ? `Partially paid: ${amountLabel} left` : `Open balance: ${amountLabel}`,
        className: "nb-chip nb-chip--info normal-case tracking-normal"
      };
    }
    return {
      label: `Draft total: ${amountLabel}`,
      className: "nb-chip nb-chip--soft normal-case tracking-normal"
    };
  };
  const getInvoiceNextActionHint = ({ invoice, hasDelivery, isPastDue, deliveryOpened }) => {
    if (invoice?.status === "deleted") {
      return "Restore to edit, export, or send again.";
    }
    if (invoice?.status === "paid") {
      return "Paid and closed. Reuse it for the next similar job, set a cadence, or let it anchor the next repeat invoice.";
    }
    if (invoice?.status === "sent" && isPastDue) {
      if (hasDelivery && !deliveryOpened) {
        return "Past due and still unopened. Re-send it or confirm delivery before sending a payment reminder.";
      }
      if (hasDelivery && deliveryOpened) {
        return "Past due and already opened. Send a focused reminder, or mark paid if the payment already arrived.";
      }
      return "Past due. Follow up, or mark paid if the payment already arrived.";
    }
    if (invoice?.status === "sent" && hasDelivery) {
      return "Waiting on payment. Resend only if the client needs another copy.";
    }
    if (invoice?.status === "sent") {
      return "Sent. Add a recipient to track delivery or reminders.";
    }
    return "Open the draft, finish the details, then send or export.";
  };
  const getNeedsAttentionSignals = (invoice, now = Date.now()) => {
    if (!invoice || invoice?.status === "deleted") {
      return {
        matches: false,
        priority: Number.POSITIVE_INFINITY,
        label: "",
        reason: ""
      };
    }
    const dueDateValue = getInvoiceDueDateValue(invoice);
    const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
    const isPastDue = invoice.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= now;
    const delivery = invoice?.delivery ?? null;
    const hasTrackedDelivery = Boolean(delivery?.recipientEmail) && Boolean(delivery?.sentAt);
    const deliveryOpened = delivery?.status === "opened";
    const paymentLinkReady =
      typeof invoice?.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0;
    const clientPortalReady = buildLibraryClientPortalUrl(invoice).length > 0;
    const updatedAtMs = Date.parse(invoice?.updatedAt ?? "");
    const isStaleDraft =
      invoice.status === "draft" &&
      Number.isFinite(updatedAtMs) &&
      now - updatedAtMs >= staleDraftThresholdMs;

    if (invoice.status === "sent" && isPastDue && hasTrackedDelivery && deliveryOpened) {
      return {
        matches: true,
        priority: 0,
        label: "Opened overdue",
        reason: "Opened and overdue with money still outstanding."
      };
    }
    if (invoice.status === "sent" && isPastDue && hasTrackedDelivery && !deliveryOpened) {
      return {
        matches: true,
        priority: 1,
        label: "Overdue unopened",
        reason: "Past due, but the client still has not opened it."
      };
    }
    if (invoice.status === "sent" && isPastDue) {
      return {
        matches: true,
        priority: 2,
        label: "Past due",
        reason: "Past due and still needs a payment follow-up."
      };
    }
    if (invoice.status === "sent" && !hasTrackedDelivery) {
      return {
        matches: true,
        priority: 3,
        label: "Track delivery",
        reason: "Marked sent, but delivery tracking is missing."
      };
    }
    if (invoice.status === "sent" && hasTrackedDelivery && !deliveryOpened) {
      return {
        matches: true,
        priority: 4,
        label: "Waiting for open",
        reason: "Delivery is tracked, but the client has not opened it yet."
      };
    }
    if (invoice.status === "sent" && !paymentLinkReady) {
      return {
        matches: true,
        priority: 5,
        label: "Add payment link",
        reason: "Sending was handled, but the payment handoff can still feel easier and more trustworthy."
      };
    }
    if (invoice.status === "sent" && !clientPortalReady) {
      return {
        matches: true,
        priority: 6,
        label: "Add portal",
        reason: "The invoice is out, but the client still lacks the cleaner portal handoff."
      };
    }
    if (isStaleDraft) {
      return {
        matches: true,
        priority: 7,
        label: "Stale draft",
        reason: "Saved draft has been sitting for a while and likely needs a final push."
      };
    }
    return {
      matches: false,
      priority: Number.POSITIVE_INFINITY,
      label: "",
      reason: ""
    };
  };
  const normalizeLibraryFocus = (value) => {
    if (value === "opened_unpaid") {
      return "opened_unpaid";
    }
    if (value === "partial_payments") {
      return "partial_payments";
    }
    if (value === "overdue_unopened") {
      return "overdue_unopened";
    }
    if (value === "overdue_opened") {
      return "overdue_opened";
    }
    return "";
  };
  const statusFilterOptions = [
    { id: "all", label: "All" },
    { id: "needs_attention", label: "Needs attention" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "paid", label: "Paid" }
  ];
  const emptyLibraryStates = {
    all: {
      title: "Your invoice library is ready for the first saved draft",
      body: "Start from notes, the sample job, or a blank invoice. Saved drafts, sent invoices, and paid work will stack up here in one reusable workspace."
    },
    needs_attention: {
      title: "Nothing needs attention right now",
      body: "When an invoice needs follow-up, delivery checking, or a payment handoff, this queue will surface it first."
    },
    draft: {
      title: "No saved drafts yet",
      body: "Save a draft from the editor and it will show up here ready for review, reuse, or sending."
    },
    sent: {
      title: "No sent invoices",
      body: "Invoices you mark or send as sent appear here so follow-up, payment progress, and reminders stay in one place."
    },
    paid: {
      title: "No paid invoices",
      body: "Mark an invoice paid when the money lands. Paid work stays here as proof of completed jobs and repeat-work history."
    }
  };
  const nowMs = Date.now();
  const needsAttentionEntries = invoices
    .map((invoice) => ({
      invoice,
      signal: getNeedsAttentionSignals(invoice, nowMs)
    }))
    .filter((entry) => entry.signal.matches)
    .sort((left, right) => {
      if (left.signal.priority !== right.signal.priority) {
        return left.signal.priority - right.signal.priority;
      }
      return String(right.invoice?.updatedAt ?? "").localeCompare(String(left.invoice?.updatedAt ?? ""));
    });
  const needsAttentionById = new Map(
    needsAttentionEntries.map((entry) => [entry.invoice?.invoiceId, entry.signal])
  );
  const normalizedViewFocus = normalizeLibraryFocus(viewFocus);
  const sentOpenInvoices = invoices.filter(
    (invoice) => invoice?.status === "sent" && getInvoiceOpenBalance(invoice) > 0
  );
  const openedUnpaidInvoices = sentOpenInvoices.filter(
    (invoice) => invoice?.delivery?.status === "opened"
  );
  const focusedInvoiceIds = (() => {
    if (normalizedViewFocus === "opened_unpaid") {
      return new Set(openedUnpaidInvoices.map((invoice) => invoice.invoiceId));
    }
    if (normalizedViewFocus === "partial_payments") {
      return new Set(partialPaymentInvoices.map((invoice) => invoice.invoiceId));
    }
    if (normalizedViewFocus === "overdue_unopened") {
      return new Set(overdueUnopenedInvoices.map((invoice) => invoice.invoiceId));
    }
    if (normalizedViewFocus === "overdue_opened") {
      return new Set(overdueOpenedInvoices.map((invoice) => invoice.invoiceId));
    }
    return null;
  })();
  const statusCounts = invoices.reduce(
    (counts, invoice) => {
      if (invoice?.status === "draft" || invoice?.status === "sent" || invoice?.status === "paid") {
        counts[invoice.status] += 1;
      }
      return counts;
    },
    { draft: 0, sent: 0, paid: 0 }
  );
  statusCounts.needs_attention = needsAttentionEntries.length;
  const filteredInvoices =
    showTrash || statusFilter === "all"
      ? invoices
      : statusFilter === "needs_attention"
        ? needsAttentionEntries.map((entry) => entry.invoice)
      : invoices.filter((invoice) => invoice.status === statusFilter);
  const visibleInvoices =
    focusedInvoiceIds instanceof Set
      ? filteredInvoices.filter((invoice) => focusedInvoiceIds.has(invoice.invoiceId))
      : filteredInvoices;
  const emptyLibraryState = emptyLibraryStates[statusFilter] ?? emptyLibraryStates.all;
  const needsAttentionSummary = (() => {
    if (showTrash || statusFilter !== "needs_attention" || needsAttentionEntries.length === 0) {
      return null;
    }
    const topSignal = needsAttentionEntries[0]?.signal ?? null;
    const overdueCount = needsAttentionEntries.filter((entry) => entry.signal.priority <= 2).length;
    const deliveryCount = needsAttentionEntries.filter((entry) => entry.signal.priority === 3 || entry.signal.priority === 4).length;
    const handoffCount = needsAttentionEntries.filter((entry) => entry.signal.priority === 5 || entry.signal.priority === 6).length;
    const staleDraftCount = needsAttentionEntries.filter((entry) => entry.signal.priority === 7).length;
    return {
      title:
        overdueCount > 0
          ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} need payment follow-up first`
          : `${needsAttentionEntries.length} invoice${needsAttentionEntries.length === 1 ? "" : "s"} need attention`,
      body:
        topSignal?.reason ||
        "This view brings overdue work, weak delivery signals, and unfinished handoffs into one calmer queue.",
      chips: [
        overdueCount > 0 ? `${overdueCount} overdue` : "",
        deliveryCount > 0 ? `${deliveryCount} delivery checks` : "",
        handoffCount > 0 ? `${handoffCount} payment handoffs` : "",
        staleDraftCount > 0 ? `${staleDraftCount} stale drafts` : ""
      ].filter(Boolean)
    };
  })();
  const selectedCount = selectedIds.length;
  const visibleIds = visibleInvoices.map((invoice) => invoice.invoiceId);
  const allSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;
  const applyLibraryView = ({ nextStatusFilter = "all", nextShowTrash = false, nextFocus = "" }) => {
    const normalizedFocus = normalizeLibraryFocus(nextFocus);
    setShowTrash(Boolean(nextShowTrash));
    setStatusFilter(nextStatusFilter);
    setSelectedIds([]);
    const nextParams = new URLSearchParams(location.search);
    if (normalizedFocus) {
      nextParams.set("focus", normalizedFocus);
    } else {
      nextParams.delete("focus");
    }
    const nextQuery = nextParams.toString();
    navigate(`${location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  };
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planLimitReached = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const billingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const googlePlayEntitlements = accountPlan?.billing?.googlePlay?.entitlements ?? {};
  const googlePlayRecoveryState =
    accountPlan?.plan === "free" &&
    Number.isFinite(googlePlayEntitlements?.subscriptionCount) &&
    Number(googlePlayEntitlements.subscriptionCount) > 0 &&
    (!Number.isFinite(googlePlayEntitlements?.activeSubscriptionCount) ||
      Number(googlePlayEntitlements.activeSubscriptionCount) <= 0);
  const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
  const useStripePortalAction =
    (accountPlan?.plan === "pro" || googlePlayRecoveryState) && hasStripePortal(accountPlan);
  const showUpgradeAction =
    accountPlan?.plan === "free" && (Boolean(upgradeUrl) || useStripeUpgradeAction);
  const showBillingPortalAction =
    (accountPlan?.plan === "pro" || googlePlayRecoveryState) &&
    (Boolean(billingPortalUrl) || useStripePortalAction);
  const billingEnvironment = getBillingEnvironment(accountPlan);
  const googlePlaySubscriptionPlans = getGooglePlaySubscriptionPlans(accountPlan);
  const hasGooglePlayPlanChoices =
    billingEnvironment?.mode === "google-play" && googlePlaySubscriptionPlans.length > 1;
  const upgradeActionLabel =
    billingEnvironment?.mode === "google-play" ? "Upgrade in Google Play" : "Upgrade to Pro";
  const manageBillingLabel =
    billingEnvironment?.mode === "google-play" ? "Manage in Google Play" : "Manage billing";
  const billingEnvironmentHint =
    billingEnvironment?.hint ||
    "Use the billing controls that match this device and keep upgrades tied to the same account.";
  const recoveryEnvironmentHint = googlePlayRecoveryState
    ? "Google Play remembers a purchase history for this account. Try Restore purchases from the launcher first, or open Google Play management to review the subscription state."
    : "";
  const showInstalledAppGuard = billingEnvironment?.mode === "android-browser";
  const planUsageToneClass =
    planUsage?.statusTone === "limit"
      ? "nb-usage-meter--limit"
      : planUsage?.statusTone === "warning"
        ? "nb-usage-meter--warning"
        : "";
  const recurringSchedulesByInvoiceId = recurringSchedules;
  const recurringReminderInvoices = invoices
    .filter((invoice) => invoice?.status !== "deleted")
    .map((invoice) => {
      const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId];
      if (!recurringEntry) {
        return null;
      }
      const recurringSummary = buildRecurringScheduleSummary(recurringEntry, {
        nowMs,
        dueSoonWindowMs: recurringSoonWindowMs,
        runHistoryLimit: 2
      });
      return {
        ...invoice,
        recurringEntry,
        recurringSummary,
        nextDueMs: recurringSummary.nextDueMs
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.nextDueMs - right.nextDueMs);
  const dueRecurringInvoices = recurringReminderInvoices.filter(
    (invoice) => invoice.nextDueMs <= nowMs
  );
  const recurringDueCount = dueRecurringInvoices.length;
  const upcomingRecurringInvoices = recurringReminderInvoices.filter(
    (invoice) => invoice.nextDueMs > nowMs && invoice.nextDueMs - nowMs <= recurringSoonWindowMs
  );
  const recurringSoonCount = upcomingRecurringInvoices.length;
  const nextRecurringCandidate = (dueRecurringInvoices[0] ?? recurringReminderInvoices[0]) || null;
  const showRecurringReminder =
    !requiresSignIn &&
    !showTrash &&
    recurringReminderInvoices.length > 0;
  const staleDraftInvoices = invoices
    .filter((invoice) => invoice?.status === "draft")
    .filter((invoice) => {
      const updatedAtMs = Date.parse(invoice?.updatedAt ?? "");
      if (!Number.isFinite(updatedAtMs)) {
        return false;
      }
      return nowMs - updatedAtMs >= staleDraftThresholdMs;
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const oldestStaleDraft = staleDraftInvoices[0] ?? null;
  const staleDraftPreview = staleDraftInvoices.slice(0, 3);
  const showDraftRecoveryReminder =
    !requiresSignIn &&
    !showTrash &&
    staleDraftInvoices.length > 0;
  const sentFollowUpInvoices = invoices
    .filter((invoice) => invoice?.status === "sent")
    .map((invoice) => {
      const openBalance = getInvoiceOpenBalance(invoice);
      const updatedAtMs = Date.parse(invoice?.updatedAt ?? "");
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
      const daysSinceUpdate = Number.isFinite(updatedAtMs)
        ? Math.max(0, Math.floor((nowMs - updatedAtMs) / recurringDayMs))
        : 0;
      const isPastDue = Number.isFinite(dueDateMs) && dueDateMs <= nowMs;
      return {
        ...invoice,
        dueDateValue,
        dueDateMs,
        daysSinceUpdate,
        openBalance,
        isPastDue,
        followUpReason:
          isPastDue || daysSinceUpdate >= sentReminderThresholdDays ? "follow_up" : ""
      };
    })
    .filter(
      (invoice) =>
        invoice.openBalance > 0 &&
        (invoice.isPastDue || invoice.daysSinceUpdate >= sentReminderThresholdDays)
    )
    .sort((left, right) => {
      if (left.isPastDue !== right.isPastDue) {
        return left.isPastDue ? -1 : 1;
      }
      if (left.isPastDue && right.isPastDue) {
        return (left.dueDateMs ?? Number.MAX_SAFE_INTEGER) - (right.dueDateMs ?? Number.MAX_SAFE_INTEGER);
      }
      return Date.parse(left.updatedAt ?? "") - Date.parse(right.updatedAt ?? "");
    });
  const oldestSentReminder = sentFollowUpInvoices[0] ?? null;
  const pastDueSentFollowUpCount = sentFollowUpInvoices.filter((invoice) => invoice.isPastDue).length;
  const oldestSentReminderDueLabel = oldestSentReminder?.dueDateValue
    ? formatDate(oldestSentReminder.dueDateValue)
    : "";
  const recurringCandidateInvoice = oldestSentReminder;
  const oldestSentRecipient = oldestSentReminder?.delivery?.recipientEmail ?? "";
  const oldestSentReminderOpened = oldestSentReminder?.delivery?.status === "opened";
  const oldestSentReminderHasTrackedDelivery = Boolean(
    oldestSentReminder?.delivery?.recipientEmail && oldestSentReminder?.delivery?.sentAt
  );
  const overdueOpenedInvoices = sentFollowUpInvoices.filter(
    (invoice) => invoice.isPastDue && invoice?.delivery?.status === "opened"
  );
  const overdueUnopenedInvoices = sentFollowUpInvoices.filter(
    (invoice) =>
      invoice.isPastDue &&
      Boolean(invoice?.delivery?.recipientEmail && invoice?.delivery?.sentAt) &&
      invoice?.delivery?.status !== "opened"
  );
  const partialPaymentInvoices = invoices
    .filter((invoice) => invoice?.status !== "deleted" && hasPartialPaymentShared(invoice))
    .sort((left, right) => {
      const latestLeft = getInvoiceLatestPaymentShared(left);
      const latestRight = getInvoiceLatestPaymentShared(right);
      const leftMs = Date.parse(latestLeft?.paidAt ?? latestLeft?.recordedAt ?? left?.updatedAt ?? "");
      const rightMs = Date.parse(latestRight?.paidAt ?? latestRight?.recordedAt ?? right?.updatedAt ?? "");
      return rightMs - leftMs;
    });
  const latestPartialPaymentInvoice = partialPaymentInvoices[0] ?? null;
  const sentOpenBalanceTotal = sentOpenInvoices.reduce(
    (sum, invoice) => sum + getInvoiceOpenBalance(invoice),
    0
  );
  const partialOpenBalanceTotal = partialPaymentInvoices.reduce(
    (sum, invoice) => sum + getInvoiceOpenBalance(invoice),
    0
  );
  const focusQueueOptions = [
    {
      id: "overdue_opened",
      title: "Overdue and already opened",
      shortLabel: "Opened overdue",
      count: overdueOpenedInvoices.length,
      summary:
        overdueOpenedInvoices.length > 0
          ? `${overdueOpenedInvoices.length} invoice${overdueOpenedInvoices.length === 1 ? "" : "s"} were already opened, so a focused reminder is usually the cleanest next move.`
          : "Nothing is overdue and already opened right now.",
      emptyTitle: "No overdue opened invoices in this queue",
      emptyBody:
        "When an overdue invoice has already been opened, it will land here so you can follow up without re-scanning the whole library.",
      statusFilter: "needs_attention"
    },
    {
      id: "overdue_unopened",
      title: "Overdue and still unopened",
      shortLabel: "Overdue unopened",
      count: overdueUnopenedInvoices.length,
      summary:
        overdueUnopenedInvoices.length > 0
          ? `${overdueUnopenedInvoices.length} overdue invoice${overdueUnopenedInvoices.length === 1 ? "" : "s"} still need a delivery-first check before you escalate.`
          : "Nothing overdue is still unopened right now.",
      emptyTitle: "No overdue unopened invoices in this queue",
      emptyBody:
        "If an overdue invoice still has not been opened, it will appear here so you can confirm delivery before sending a reminder.",
      statusFilter: "needs_attention"
    },
    {
      id: "partial_payments",
      title: "Partial-payment recovery",
      shortLabel: "Partial payments",
      count: partialPaymentInvoices.length,
      summary:
        partialPaymentInvoices.length > 0
          ? `${partialPaymentInvoices.length} invoice${partialPaymentInvoices.length === 1 ? "" : "s"} already have money recorded but still need the remaining balance collected.`
          : "No partial-payment recovery work is waiting right now.",
      emptyTitle: "No partial-payment invoices in this queue",
      emptyBody:
        "When an invoice has money recorded but still has balance left, it will show up here so the remaining payment does not get lost.",
      statusFilter: "needs_attention"
    },
    {
      id: "opened_unpaid",
      title: "Opened and still unpaid",
      shortLabel: "Opened unpaid",
      count: openedUnpaidInvoices.length,
      summary:
        openedUnpaidInvoices.length > 0
          ? `${openedUnpaidInvoices.length} invoice${openedUnpaidInvoices.length === 1 ? "" : "s"} were opened by the client and still have an outstanding balance.`
          : "No opened-but-unpaid invoices are waiting right now.",
      emptyTitle: "No opened-unpaid invoices in this queue",
      emptyBody:
        "If a client opens an invoice but still does not pay, it will show up here so your next reminder can stay focused.",
      statusFilter: "needs_attention"
    }
  ];
  const focusQueueMap = new Map(focusQueueOptions.map((queue) => [queue.id, queue]));
  const focusedQueueMeta = normalizedViewFocus ? focusQueueMap.get(normalizedViewFocus) ?? null : null;
  const alternateFocusQueues = focusQueueOptions
    .filter((queue) => queue.id !== normalizedViewFocus && queue.count > 0)
    .slice(0, 2);
  const strongestAlternateQueue =
    focusQueueOptions.find((queue) => queue.id !== normalizedViewFocus && queue.count > 0) ?? null;
  const canQuickSendReminderOldest = Boolean(
    oldestSentReminder?.invoiceId && isValidEmail(oldestSentRecipient)
  );
  const smartFollowUpSuggestion = oldestSentReminder
    ? oldestSentReminder.isPastDue
      ? oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened
        ? "Best next step: re-send it or confirm delivery before sending a payment reminder."
        : oldestSentReminderHasTrackedDelivery && oldestSentReminderOpened
          ? "Best next step: send a focused reminder now."
        : "Best next step: send a reminder now."
      : oldestSentReminder.daysSinceUpdate >= 21
        ? "Best next step: send a short check-in, then open the repeat invoice if this becomes routine."
        : "Best next step: review the latest reminder timing before sending again."
    : recurringCandidateInvoice
      ? "Best next step: open the repeat invoice for the next scheduled job."
      : "";
  const buildFollowUpNoteText = () => {
    if (!oldestSentReminder) {
      return "";
    }
    const greetingName = oldestSentRecipient ? oldestSentRecipient.split("@")[0] : "there";
    const invoiceLabel = oldestSentReminder.invoiceNumber || "your invoice";
    const dueContext =
      oldestSentReminder.isPastDue && oldestSentReminderDueLabel
        ? `It was due ${oldestSentReminderDueLabel}.`
        : oldestSentReminderDueLabel
          ? `It is due ${oldestSentReminderDueLabel}.`
          : "I'm checking in on the latest invoice.";
    const nextStep = oldestSentReminder.isPastDue
      ? oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened
        ? "I wanted to make sure you saw it. If it helps, I can resend the invoice or send it another way."
        : oldestSentReminderHasTrackedDelivery && oldestSentReminderOpened
          ? "I saw the invoice was opened, so I wanted to check whether anything is blocking payment."
          : "If possible, please take a look and let me know if anything is blocking payment."
      : "If you need anything from me, please let me know.";
    return [
      `Hi ${greetingName},`,
      "",
      `A quick follow-up on ${invoiceLabel}.`,
      dueContext,
      nextStep,
      "",
      "Billie from NoteBill"
    ].join("\n");
  };
  const buildReminderNotificationPreview = () => {
    if (!oldestSentReminder) {
      return "This is a test reminder from NoteBill.";
    }
    const invoiceLabel = oldestSentReminder.invoiceNumber || "your invoice";
    const dueContext =
      oldestSentReminder.isPastDue && oldestSentReminderDueLabel
        ? `It was due ${oldestSentReminderDueLabel}.`
        : oldestSentReminderDueLabel
          ? `It is due ${oldestSentReminderDueLabel}.`
          : "It is waiting on a follow-up.";
    return [
      `Follow-up reminder for ${invoiceLabel}.`,
      dueContext,
      "Open NoteBill to review the invoice or send the reminder."
    ].join(" ");
  };
  const reminderNotificationsSubtitle =
    "Enable browser alerts to preview reminder timing and send a test reminder.";
  const reminderNotePreviewText = (() => {
    if (!oldestSentReminder) {
      return "";
    }
    const recipientLabel = oldestSentRecipient ? oldestSentRecipient.split("@")[0] : "there";
    const invoiceLabel = oldestSentReminder.invoiceNumber || "your invoice";
    const dueContext =
      oldestSentReminder.isPastDue && oldestSentReminderDueLabel
        ? `It was due ${oldestSentReminderDueLabel}.`
        : oldestSentReminderDueLabel
          ? `It is due ${oldestSentReminderDueLabel}.`
          : "I'm checking in on the latest invoice.";
    const nextStep = oldestSentReminder.isPastDue
      ? oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened
        ? "I wanted to make sure you saw it. If it helps, I can resend the invoice or send it another way."
        : "If possible, please take a look and let me know if anything is blocking payment."
      : "If you need anything from me, please let me know.";
    return [
      `Hi ${recipientLabel},`,
      "",
      `A quick follow-up on ${invoiceLabel}.`,
      dueContext,
      nextStep,
      "",
      "Billie from NoteBill"
    ].join("\n");
  })();
  const activeFollowUpNoteText = followUpNoteDraft || buildFollowUpNoteText();
  const followUpAiToneOptions = ["Friendlier", "Firmer", "Shorter", "More professional"];
  const followUpPlan = oldestSentReminder
    ? {
        urgencyValue: oldestSentReminder.isPastDue
          ? oldestSentReminderDueLabel
            ? `Past due since ${oldestSentReminderDueLabel}`
            : "Past due"
          : `${Math.max(0, oldestSentReminder.daysSinceUpdate)} day${
              oldestSentReminder.daysSinceUpdate === 1 ? "" : "s"
            } since last update`,
        deliveryValue: oldestSentRecipient
          ? oldestSentReminder?.delivery?.openedAt
            ? `Opened by ${oldestSentRecipient}`
            : `Sent to ${oldestSentRecipient}`
          : "No tracked recipient yet",
        nextStepValue: canQuickSendReminderOldest
          ? oldestSentReminder.isPastDue
            ? oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened
              ? "Re-send or confirm delivery"
              : oldestSentReminderHasTrackedDelivery && oldestSentReminderOpened
                ? "Send focused reminder"
              : "Send reminder now"
            : "Review timing, then remind"
          : oldestSentReminder.customerName
            ? "Open sent invoices and add a recipient"
            : "Review this invoice",
        automationValue: `${reminderAutomationSettings.dueAfterDays}d first follow-up · ${reminderAutomationSettings.cooldownDays}d cooldown`,
        summary: oldestSentReminder.isPastDue
          ? oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened
            ? "This invoice is overdue, but it still has not been opened by the client."
            : oldestSentReminderHasTrackedDelivery && oldestSentReminderOpened
              ? "This invoice is overdue and has already been opened by the client."
            : "This invoice is overdue and still has an open balance."
          : "This invoice is in the follow-up window and still has an open balance."
      }
    : null;
  const reminderHiddenUntilMs = Date.parse(followUpReminderState?.hiddenUntil ?? "");
  const reminderIsSnoozed =
    Number.isFinite(reminderHiddenUntilMs) && reminderHiddenUntilMs > Date.now();
  const reminderIsDismissed = Boolean(followUpReminderState?.dismissed);
  const showSentFollowUpReminder =
    !requiresSignIn &&
    !showTrash &&
    sentFollowUpInvoices.length > 0 &&
    !reminderIsSnoozed &&
    !reminderIsDismissed;
  const showCollectionsCommandCenter =
    !requiresSignIn &&
    !showTrash &&
    (sentOpenInvoices.length > 0 || partialPaymentInvoices.length > 0);
  const latestDraftInvoice =
    invoices
      .filter((invoice) => invoice?.status === "draft")
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const sentWithoutPaymentLinkInvoice =
    invoices
      .filter((invoice) => invoice?.status === "sent" && !String(invoice?.paymentLinkUrl ?? "").trim())
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const sentWithoutPortalInvoice =
    invoices
      .filter(
        (invoice) =>
          invoice?.status === "sent" &&
          String(invoice?.paymentLinkUrl ?? "").trim() &&
          !String(invoice?.portalAccessToken ?? "").trim()
      )
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const sentWithoutTrackedDeliveryInvoice =
    invoices
      .filter((invoice) => {
        if (invoice?.status !== "sent") {
          return false;
        }
        const delivery = invoice?.delivery ?? null;
        return !(delivery?.recipientEmail && delivery?.sentAt);
      })
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const sentTrackedUnopenedInvoice =
    invoices
      .filter((invoice) => {
        if (invoice?.status !== "sent") {
          return false;
        }
        const delivery = invoice?.delivery ?? null;
        return Boolean(delivery?.recipientEmail && delivery?.sentAt && delivery?.status !== "opened");
      })
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const paidRepeatCandidate =
    invoices
      .filter((invoice) => invoice?.status === "paid")
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const paidRepeatMemoryStarter = paidRepeatCandidate
    ? buildClientMemoryStarterForInvoice(
        paidRepeatCandidate,
        getClientMemory(),
        getLineItemLibrary()
      )
    : null;
  const paidRepeatRecurringInterval = paidRepeatCandidate
    ? getClientRecurringInterval(paidRepeatCandidate.customerName ?? "")
    : null;
  const paidRepeatRecurringLabel = paidRepeatRecurringInterval
    ? formatRecurringCadence(paidRepeatRecurringInterval)
    : "";
  const repeatReadyClients = (() => {
    const clientMemoryEntries = getClientMemory();
    const savedLineItems = getLineItemLibrary();
    const byClient = new Map();
    invoices
      .filter((invoice) => invoice?.status === "paid")
      .forEach((invoice) => {
        const clientName = String(
          invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? ""
        ).trim();
        const lookupKey = normalizeLookupText(clientName);
        if (!lookupKey) {
          return;
        }
        const existing = byClient.get(lookupKey);
        if (!existing || String(existing.updatedAt ?? "").localeCompare(String(invoice.updatedAt ?? "")) < 0) {
          const memoryStarter = buildClientMemoryStarterForInvoice(invoice, clientMemoryEntries, savedLineItems);
          const savedCadence = getClientRecurringInterval(clientName);
          const latestInvoiceNumber = String(invoice?.invoiceNumber ?? "").trim();
          byClient.set(lookupKey, {
            lookupKey,
            clientName,
            invoice,
            updatedAt: String(invoice?.updatedAt ?? ""),
            invoiceNumber: latestInvoiceNumber,
            total: Number(invoice?.total ?? 0),
            memoryStarter,
            savedCadence,
            savedRecipient: String(memoryStarter?.recipientEmail ?? "").trim()
          });
        }
      });
    return Array.from(byClient.values())
      .sort((left, right) => {
        const leftScore =
          (left.memoryStarter?.savedItemCount ?? 0) * 100 +
          (left.savedCadence ? 20 : 0) +
          (left.savedRecipient ? 10 : 0);
        const rightScore =
          (right.memoryStarter?.savedItemCount ?? 0) * 100 +
          (right.savedCadence ? 20 : 0) +
          (right.savedRecipient ? 10 : 0);
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 3);
  })();
  const showRepeatReadyLane = !showTrash && !requiresSignIn && repeatReadyClients.length > 0;
  const latestEstimateInvoice =
    invoices
      .filter((invoice) => invoice?.status !== "deleted" && getInvoiceDocumentType(invoice) === "estimate")
      .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0] ?? null;
  const recurringMemoryStarter = nextRecurringCandidate
    ? buildClientMemoryStarterForInvoice(
        nextRecurringCandidate,
        getClientMemory(),
        getLineItemLibrary()
      )
    : null;
  const recurringMemoryLabel = recurringMemoryStarter?.leadItem?.description || "";
  const recurringMemorySummary = recurringMemoryStarter
    ? recurringMemoryStarter.savedItemCount > 1
      ? `${recurringMemoryStarter.savedItemCount} saved services ready`
      : recurringMemoryStarter.leadItem?.description
        ? `Saved ${recurringMemoryStarter.leadItem.description}`
        : "Saved client memory ready"
    : "";
  const libraryGuide = (() => {
    if (showTrash || requiresSignIn) {
      return null;
    }
    if (sentWithoutTrackedDeliveryInvoice) {
      return {
        toneClass: "border-sky-200 bg-sky-50 text-sky-950",
        eyebrow: "Billie next up",
        title: `Track delivery for ${sentWithoutTrackedDeliveryInvoice.invoiceNumber || "this invoice"}`,
        body: "This invoice is marked sent, but delivery is not tracked yet. Send it again so reminders have context.",
        meta: [
          sentWithoutTrackedDeliveryInvoice.customerName || "",
          Number.isFinite(sentWithoutTrackedDeliveryInvoice.total)
            ? `Total ${formatMoney(sentWithoutTrackedDeliveryInvoice.total)}`
            : ""
        ].filter(Boolean),
        primaryLabel: "Open send flow",
        primaryDisabled: actionId === sentWithoutTrackedDeliveryInvoice.invoiceId,
        onPrimary: () => startSendComposer(sentWithoutTrackedDeliveryInvoice),
        secondaryLabel: "Show sent invoices",
        secondaryDisabled: false,
        onSecondary: () => {
          setStatusFilter("sent");
          setSelectedIds([]);
        }
      };
    }
    if (sentTrackedUnopenedInvoice) {
      return {
        toneClass: "border-sky-200 bg-sky-50 text-sky-950",
        eyebrow: "Billie next up",
        title: `Check delivery for ${sentTrackedUnopenedInvoice.invoiceNumber || "this invoice"}`,
        body: "Delivery is recorded, but the invoice has not been opened yet. Confirm delivery before you resend or remind.",
        meta: [
          sentTrackedUnopenedInvoice.customerName || "",
          Number.isFinite(sentTrackedUnopenedInvoice.total)
            ? `Total ${formatMoney(sentTrackedUnopenedInvoice.total)}`
            : ""
        ].filter(Boolean),
        primaryLabel: actionId === sentTrackedUnopenedInvoice.invoiceId ? "Marking..." : "Mark opened",
        primaryDisabled: actionId === sentTrackedUnopenedInvoice.invoiceId,
        onPrimary: () => void handleMarkDeliveryOpened(sentTrackedUnopenedInvoice.invoiceId),
        secondaryLabel: "Show sent invoices",
        secondaryDisabled: false,
        onSecondary: () => {
          setStatusFilter("sent");
          setSelectedIds([]);
        }
      };
    }
    if (oldestSentReminder) {
      const oldestReminderOpened = oldestSentReminder?.delivery?.status === "opened";
      const oldestReminderHasTrackedDelivery = Boolean(
        oldestSentReminder?.delivery?.recipientEmail && oldestSentReminder?.delivery?.sentAt
      );
      return {
        toneClass: "border-blue-200 bg-blue-50 text-blue-950",
        eyebrow: "Billie next up",
        title: oldestSentReminder.isPastDue
          ? oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? `Re-send ${oldestSentReminder.invoiceNumber || "this sent invoice"}`
            : oldestReminderHasTrackedDelivery && oldestReminderOpened
              ? `Nudge ${oldestSentReminder.invoiceNumber || "this sent invoice"}`
            : `Follow up on ${oldestSentReminder.invoiceNumber || "this sent invoice"}`
          : oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? `Check delivery for ${oldestSentReminder.invoiceNumber || "this sent invoice"}`
          : `Check ${oldestSentReminder.invoiceNumber || "this sent invoice"}`,
        body: oldestSentReminder.isPastDue
          ? oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? "This invoice is overdue, but it still has not been opened. Re-send it or confirm delivery before escalating."
            : oldestReminderHasTrackedDelivery && oldestReminderOpened
              ? "The invoice has already been opened and payment is still outstanding. Send a focused reminder, then mark it paid if the money already arrived."
            : "Payment is still open. Send the reminder, then mark it paid if the money already arrived."
          : oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? "Delivery is tracked, but the invoice has not been opened yet. Confirm delivery before escalating."
          : "Keep the send workflow moving before this invoice goes cold.",
        meta: [
          oldestSentReminderDueLabel
            ? oldestSentReminder.isPastDue
              ? `Due ${oldestSentReminderDueLabel}`
              : `Due soon: ${oldestSentReminderDueLabel}`
            : "",
          Number.isFinite(oldestSentReminder.openBalance)
            ? `Open balance ${formatMoney(oldestSentReminder.openBalance)}`
            : "",
          oldestSentRecipient ? `Recipient ${oldestSentRecipient}` : ""
        ].filter(Boolean),
        primaryLabel:
          oldestSentReminder.isPastDue && oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? actionId === oldestSentReminder.invoiceId
              ? "Opening..."
              : "Re-send invoice"
            : oldestSentReminder.isPastDue && oldestSentReminderHasTrackedDelivery && oldestReminderOpened
            ? actionId === oldestSentReminder.invoiceId
              ? "Sending..."
              : "Send focused reminder"
            : oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? actionId === oldestSentReminder.invoiceId
              ? "Marking..."
              : "Mark opened"
            : canQuickSendReminderOldest && actionId === oldestSentReminder.invoiceId
            ? "Sending..."
            : canQuickSendReminderOldest
              ? "Send reminder"
              : "Show sent invoices",
        primaryDisabled: actionId === oldestSentReminder.invoiceId,
        onPrimary: () => {
          if (oldestSentReminder.isPastDue && oldestReminderHasTrackedDelivery && !oldestReminderOpened) {
            startSendComposer(oldestSentReminder);
            return;
          }
          if (oldestReminderHasTrackedDelivery && !oldestReminderOpened) {
            void handleMarkDeliveryOpened(oldestSentReminder.invoiceId);
            return;
          }
          if (canQuickSendReminderOldest) {
            void handleSendReminder(oldestSentReminder);
            return;
          }
          setStatusFilter("sent");
          setSelectedIds([]);
        },
        secondaryLabel: "Open repeat invoice",
        secondaryDisabled: actionId === oldestSentReminder.invoiceId,
        onSecondary: () => handleInvoiceAgain(oldestSentReminder.invoiceId)
      };
    }
    if (sentWithoutPaymentLinkInvoice) {
      return {
        toneClass: "border-amber-200 bg-amber-50 text-amber-950",
        eyebrow: "Billie next up",
        title: `Add a payment link for ${sentWithoutPaymentLinkInvoice.invoiceNumber || "this invoice"}`,
        body: "The invoice has already gone out. Opening it now to add a hosted payment link gives the customer a clearer, safer way to pay.",
        meta: [
          sentWithoutPaymentLinkInvoice.customerName || "",
          Number.isFinite(sentWithoutPaymentLinkInvoice.total)
            ? `Total ${formatMoney(sentWithoutPaymentLinkInvoice.total)}`
            : ""
        ].filter(Boolean),
        primaryLabel:
          actionId === sentWithoutPaymentLinkInvoice.invoiceId ? "Opening..." : "Open invoice",
        primaryDisabled: actionId === sentWithoutPaymentLinkInvoice.invoiceId,
        onPrimary: () => handleOpen(sentWithoutPaymentLinkInvoice.invoiceId),
        secondaryLabel: "Show sent invoices",
        secondaryDisabled: false,
        onSecondary: () => {
          setStatusFilter("sent");
          setSelectedIds([]);
        }
      };
    }
    if (sentWithoutPortalInvoice) {
      return {
        toneClass: "border-cyan-200 bg-cyan-50 text-cyan-950",
        eyebrow: "Billie next up",
        title: `Create the portal for ${sentWithoutPortalInvoice.invoiceNumber || "this invoice"}`,
        body: "The hosted payment link is already in place. Finish the handoff with a client portal so the customer can review details clearly before paying.",
        meta: [
          sentWithoutPortalInvoice.customerName || "",
          Number.isFinite(sentWithoutPortalInvoice.total)
            ? `Total ${formatMoney(sentWithoutPortalInvoice.total)}`
            : ""
        ].filter(Boolean),
        primaryLabel:
          actionId === sentWithoutPortalInvoice.invoiceId ? "Creating portal..." : "Create client portal",
        primaryDisabled: actionId === sentWithoutPortalInvoice.invoiceId,
        onPrimary: () => void handleCreateClientPortal(sentWithoutPortalInvoice),
        secondaryLabel: "Show sent invoices",
        secondaryDisabled: false,
        onSecondary: () => {
          setStatusFilter("sent");
          setSelectedIds([]);
        }
      };
    }
    if (latestEstimateInvoice) {
      const estimateSummary = buildEstimateWorkflowSummary(latestEstimateInvoice);
      return {
        toneClass:
          estimateSummary.statusTone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : estimateSummary.statusTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-slate-200 bg-slate-50 text-slate-900",
        eyebrow: "Billie next up",
        title: estimateSummary.statusLabel,
        body: estimateSummary.actionHint,
        meta: [
          latestEstimateInvoice.customerName || "",
          Number.isFinite(latestEstimateInvoice.total)
            ? `Total ${formatMoney(latestEstimateInvoice.total)}`
            : ""
        ].filter(Boolean),
        primaryLabel:
          actionId === latestEstimateInvoice.invoiceId ? "Converting..." : "Convert to invoice",
        primaryDisabled: actionId === latestEstimateInvoice.invoiceId,
        onPrimary: () => void handleConvertEstimateToInvoice(latestEstimateInvoice.invoiceId),
        secondaryLabel:
          actionId === latestEstimateInvoice.invoiceId
            ? "Opening..."
            : estimateSummary.isApproved
              ? "Mark needs review"
              : "Mark approved",
        secondaryDisabled: actionId === latestEstimateInvoice.invoiceId,
        onSecondary: () =>
          estimateSummary.isApproved
            ? void handleSetEstimateReviewState(latestEstimateInvoice.invoiceId, "needs_review")
            : void handleSetEstimateReviewState(latestEstimateInvoice.invoiceId, "approved")
      };
    }
    if (nextRecurringCandidate) {
      const recurringIsDueNow = nextRecurringCandidate.nextDueMs <= nowMs;
      const recurringIsDueSoon =
        !recurringIsDueNow && nextRecurringCandidate.nextDueMs - nowMs <= recurringSoonWindowMs;
      return {
        toneClass: recurringIsDueSoon
          ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"
          : "border-indigo-200 bg-indigo-50 text-indigo-950",
        eyebrow: "Billie next up",
        title: recurringIsDueNow ? "Start the next repeat invoice" : "Prep the next repeat invoice",
        body: recurringIsDueNow
          ? `Recurring work is ready now. Open the next invoice and keep the repeat job moving${
              recurringMemoryLabel ? `, or start fresh from saved memory with ${recurringMemoryLabel}` : ""
            }.`
          : recurringIsDueSoon
            ? `A repeat job is due soon. Open it early so the next visit is already lined up${
                recurringMemoryLabel ? `, or start fresh from saved memory with ${recurringMemoryLabel}` : ""
              }.`
            : "A repeat job is coming up soon. Open it now if you want a head start.",
        meta: [
          nextRecurringCandidate.invoiceNumber || "Draft invoice",
          nextRecurringCandidate.customerName || "",
          nextRecurringCandidate.recurringEntry?.nextDueAt
            ? `Next due ${formatDate(nextRecurringCandidate.recurringEntry.nextDueAt)}`
            : ""
        ].filter(Boolean),
        primaryLabel:
          actionId === nextRecurringCandidate.invoiceId ? "Opening..." : "Open repeat invoice",
        primaryDisabled: actionId === nextRecurringCandidate.invoiceId,
        onPrimary: () =>
          handleInvoiceAgain(nextRecurringCandidate.invoiceId, {
            onLoaded: () => advanceRecurringSchedule(nextRecurringCandidate.invoiceId)
          }),
        secondaryLabel: recurringMemoryStarter ? "Start from saved memory" : "Show draft invoices",
        secondaryDisabled: recurringMemoryStarter ? actionId === nextRecurringCandidate.invoiceId : false,
        onSecondary: recurringMemoryStarter
          ? () => handleStartFromClientMemory(nextRecurringCandidate)
          : () => {
              setStatusFilter("draft");
              setSelectedIds([]);
            }
      };
    }
    if (oldestStaleDraft || latestDraftInvoice) {
      const targetDraft = oldestStaleDraft ?? latestDraftInvoice;
      return {
        toneClass: "border-emerald-200 bg-emerald-50 text-emerald-950",
        eyebrow: "Billie next up",
        title: `Resume ${targetDraft?.invoiceNumber || "your latest draft"}`,
        body: oldestStaleDraft
          ? "This draft has been sitting for a while. Reopening it now is the fastest way to finish the invoice and get the payment handoff back on track."
          : "Open the draft and keep moving it toward save, payment setup, send, or export.",
        meta: [
          targetDraft?.customerName || "",
          targetDraft?.updatedAt ? `Updated ${formatDate(targetDraft.updatedAt)}` : ""
        ].filter(Boolean),
        primaryLabel: actionId === targetDraft?.invoiceId ? "Opening..." : "Open draft",
        primaryDisabled: actionId === targetDraft?.invoiceId,
        onPrimary: () => handleOpen(targetDraft.invoiceId),
        secondaryLabel: "Show draft invoices",
        secondaryDisabled: false,
        onSecondary: () => {
          setStatusFilter("draft");
          setSelectedIds([]);
        }
      };
    }
    if (paidRepeatCandidate) {
      return {
        toneClass: "border-slate-200 bg-slate-50 text-slate-950",
        eyebrow: "Billie next up",
        title: `Start another invoice for ${paidRepeatCandidate.customerName || "a repeat client"}`,
        body: paidRepeatRecurringLabel
          ? `Paid work is one of the strongest repeat signals. Reuse what already worked and lock in the saved ${paidRepeatRecurringLabel} cadence for the next job.`
          : paidRepeatMemoryStarter
            ? "Paid work is one of the strongest repeat signals. Start from saved memory so the next draft keeps the best client and service details."
            : "Paid work is one of the strongest repeat signals. Open a fresh draft, reuse what already worked, and keep the next job moving faster.",
        meta: [
          paidRepeatCandidate.invoiceNumber || "",
          Number.isFinite(paidRepeatCandidate.total)
            ? `Last total ${formatMoney(paidRepeatCandidate.total)}`
            : "",
          paidRepeatRecurringLabel ? `Saved cadence ${paidRepeatRecurringLabel}` : "",
          paidRepeatMemoryStarter?.savedItemCount > 1
            ? `${paidRepeatMemoryStarter.savedItemCount} saved services`
            : paidRepeatMemoryStarter?.leadItem?.description
            ? `Saved service ${paidRepeatMemoryStarter.leadItem.description}`
            : ""
        ].filter(Boolean),
        primaryLabel:
          actionId === paidRepeatCandidate.invoiceId ? "Opening..." : "Invoice again",
        primaryDisabled: actionId === paidRepeatCandidate.invoiceId,
        onPrimary: () => handleInvoiceAgain(paidRepeatCandidate.invoiceId),
        secondaryLabel: paidRepeatRecurringLabel
          ? `Use ${paidRepeatRecurringLabel} cadence`
          : paidRepeatMemoryStarter
            ? "Start from saved memory"
            : "Show paid invoices",
        secondaryDisabled: actionId === paidRepeatCandidate.invoiceId || isDeleting,
        onSecondary: () => {
          if (paidRepeatRecurringInterval) {
            setRecurringSchedule(paidRepeatCandidate.invoiceId, paidRepeatRecurringInterval, {
              source: "library_paid_repeat_guide"
            });
            return;
          }
          if (paidRepeatMemoryStarter) {
            handleStartFromClientMemory(paidRepeatCandidate);
            return;
          }
          setStatusFilter("paid");
          setSelectedIds([]);
        }
      };
    }
    return null;
  })();

  const handleUpgradeAction = async (basePlanId = "") => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, {
        basePlanId,
        successPath: "/invoices?billing=success",
        cancelPath: "/invoices?billing=cancelled"
      });
    } catch (billingActionError) {
      setBillingError(billingActionError?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleBillingAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await openBillingPortal(accountPlan, { returnPath: "/invoices" });
    } catch (billingActionError) {
      setBillingError(billingActionError?.message || "Unable to open billing settings.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleSnoozeFollowUpReminder = () => {
    const hiddenUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    persistFollowUpReminderState({ dismissed: false, hiddenUntil });
  };

  const handleDismissFollowUpReminder = () => {
    persistFollowUpReminderState({ dismissed: true, hiddenUntil: "" });
  };

  const handleCopyFollowUpNote = async () => {
    const followUpNoteText = activeFollowUpNoteText;
    if (!followUpNoteText) {
      setFollowUpNoteNotice("No follow-up note is available yet.");
      return;
    }
    setFollowUpNoteNotice("");
    try {
      await navigator.clipboard?.writeText?.(followUpNoteText);
      setFollowUpNoteNotice("Reminder note copied. Paste it into email or a message.");
    } catch (copyError) {
      setFollowUpNoteNotice(copyError?.message || "Could not copy the reminder note.");
    }
  };

  const handleRewriteFollowUpNote = async (tone) => {
    const baselineMessage = followUpNoteDraft || buildFollowUpNoteText();
    if (!baselineMessage) {
      setFollowUpAiError("No follow-up note is available yet.");
      return;
    }
    setFollowUpAiBusy(tone);
    setFollowUpAiError("");
    setFollowUpNoteNotice("");
    try {
      const payload = await requestJson(
        "/api/invoices/rewrite-follow-up-message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: baselineMessage,
            tone
          })
        },
        "Failed to rewrite the follow-up note."
      );
      const rewritten = String(payload?.message ?? "").trim();
      if (!rewritten) {
        throw new Error("Billie did not return a rewritten follow-up note.");
      }
      setFollowUpNoteDraft(rewritten);
      setFollowUpAiPanelOpen(true);
      setFollowUpNoteNotice(`Billie rewrote the reminder in a ${tone.toLowerCase()} tone.`);
    } catch (rewriteError) {
      setFollowUpAiError(rewriteError?.message || "Failed to rewrite the follow-up note.");
    } finally {
      setFollowUpAiBusy("");
    }
  };

  function buildLibraryClientPortalUrl(invoice) {
    if (!invoice?.invoiceId || !invoice?.portalAccessToken) {
      return "";
    }
    return `${window.location.origin}/portal/${invoice.invoiceId}/${encodeURIComponent(invoice.portalAccessToken)}`;
  }

  const buildLibrarySharePackText = (invoice) => {
    if (!invoice?.invoiceId) {
      return "";
    }
    const shareLines = [
      `Invoice ${invoice.invoiceNumber || "Draft"}`,
      invoice.customerName ? `Client: ${invoice.customerName}` : "",
      Number.isFinite(invoice.total) ? `Total: ${formatMoney(invoice.total)}` : "",
      getInvoiceDueDateValue(invoice) ? `Due date: ${getInvoiceDueDateValue(invoice)}` : "",
      invoice.paymentLinkUrl ? `Payment link: ${invoice.paymentLinkUrl}` : "",
      buildLibraryClientPortalUrl(invoice) ? `Client portal: ${buildLibraryClientPortalUrl(invoice)}` : "",
      invoice.notes ? `Notes: ${invoice.notes}` : ""
    ].filter(Boolean);
    return shareLines.join("\n");
  };

  const handleCopyInvoiceSharePack = async (invoice) => {
    const sharePackText = buildLibrarySharePackText(invoice);
    if (!sharePackText) {
      setHandoffNotice("No share pack is available for this invoice yet.");
      return;
    }
    setHandoffNotice("");
    try {
      await navigator.clipboard?.writeText?.(sharePackText);
      setHandoffNotice("Share pack copied. Next: paste it into email, text, or chat.");
    } catch (copyError) {
      setHandoffNotice(copyError?.message || "Could not copy the share pack.");
    }
  };

  useEffect(() => {
    setFollowUpNoteDraft("");
    setFollowUpAiPanelOpen(false);
    setFollowUpAiBusy("");
    setFollowUpAiError("");
  }, [oldestSentReminder?.invoiceId]);

  const handleCreateClientPortal = async (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    setActionId(invoice.invoiceId);
    setError("");
    setHandoffNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoice.invoiceId}/client-portal-link`,
        {
          method: "POST"
        },
        "Failed to create the client portal."
      );
      const nextPortalToken =
        payload?.invoice?.invoiceData?.finishedInvoice?.portalAccessToken ??
        payload?.invoice?.portalAccessToken ??
        "";
      if (nextPortalToken) {
        setInvoices((current) =>
          current.map((entry) =>
            entry.invoiceId === invoice.invoiceId
              ? {
                  ...entry,
                  portalAccessToken: nextPortalToken
                }
              : entry
          )
        );
      }
      setHandoffNotice(
        payload?.clientPortalUrl
          ? "Client portal is ready. Open it or include it in the share pack."
          : "Client portal created."
      );
      maybeRequestInAppReview("client_portal_created");
    } catch (portalError) {
      handleLibraryError(portalError, "Failed to create the client portal.");
    } finally {
      setActionId("");
    }
  };

  const toggleSelection = (invoiceId) => {
    setSelectedIds((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === visibleIds.length ? [] : [...visibleIds]));
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectionMode(false);
  };

  return (
    <div className="nb-page nb-page--quiet min-h-screen">
      <main className="nb-page-shell nb-page-shell--medium max-w-5xl py-10">
        <div className="nb-surface nb-surface--elevated nb-hero-glow nb-reveal-up rounded-[34px] p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <button
              type="button"
              className="nb-btn-ghost"
              onClick={() => navigate("/")}
            >
              Back to launcher
            </button>
            <div className="mt-4 inline-flex rounded-full border border-[#3d6f61]/14 bg-white/82 px-3 py-1 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3d6f61]">Operations hub</p>
            </div>
            <h1 className="nb-hero-title mt-4 text-[2.5rem] md:text-[3.5rem]">Invoice Library</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Reopen saved work and keep follow-up moving from one calm place.
            </p>
            <p className="nb-assistant-chip nb-assistant-chip--ready mt-2 inline-flex normal-case tracking-normal text-xs">
              <span className="nb-assistant-chip__dot" aria-hidden="true" />
              Billie can polish drafts as you open them.
            </p>
            <div className="mt-3 flex max-w-full flex-wrap items-center gap-2 text-sm normal-case tracking-normal text-slate-600">
              <span className="font-semibold text-slate-500">Account:</span>
              <span
                className={`min-w-0 break-all ${
                  authSession?.email ? "font-semibold text-[#17493c]" : "font-semibold text-slate-700"
                }`}
              >
                {authSession?.email ? authSession.email : "Guest mode"}
              </span>
              <button
                type="button"
                className="rounded-full border border-[#d5e5de] bg-white px-3 py-1 text-xs font-semibold text-[#17493c] transition hover:border-[#c2d8cf] hover:bg-[#f7fbf9]"
                onClick={() => navigate("/")}
              >
                Manage
              </button>
              <button
                type="button"
                className="rounded-full border border-[#d5e5de] bg-white px-3 py-1 text-xs font-semibold text-[#17493c] transition hover:border-[#c2d8cf] hover:bg-[#f7fbf9]"
                onClick={() => navigate("/help")}
              >
                Help
              </button>
              {showBillingPortalAction ? (
                useStripePortalAction ? (
                  <button
                    type="button"
                    className="rounded-full border border-[#d5e5de] bg-white px-3 py-1 text-xs font-semibold text-[#17493c] transition hover:border-[#c2d8cf] hover:bg-[#f7fbf9] disabled:cursor-not-allowed disabled:text-slate-400"
                    onClick={handleBillingAction}
                    disabled={billingBusy}
                  >
                    {billingBusy ? "Opening..." : manageBillingLabel}
                  </button>
                ) : (
                  <a
                    href={billingPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#d5e5de] bg-white px-3 py-1 text-xs font-semibold text-[#17493c] transition hover:border-[#c2d8cf] hover:bg-[#f7fbf9]"
                  >
                    {manageBillingLabel}
                  </a>
                )
              ) : null}
            </div>
            {recoveryEnvironmentHint ? <p className="mt-1 text-xs leading-5 text-amber-700">{recoveryEnvironmentHint}</p> : null}
            {planSummary ? (
              <p className={`mt-2 text-xs ${planLimitReached ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                {planSummary}
              </p>
            ) : null}
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {authSession?.email
                ? "This account keeps invoices, upgrades, and billing together."
                : "Sign in to keep invoices, upgrades, and billing tied to your email."}
            </p>
            {showInstalledAppGuard ? (
              <div
                className="mt-2 rounded-[18px] border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-950"
                role="status"
                aria-live="polite"
              >
                <p className="font-semibold uppercase tracking-[0.16em] text-blue-700">Open the app</p>
                <p className="mt-1">
                  Google Play upgrades need the installed NoteBill app. Browser review and export still work.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs leading-5 text-slate-500">{recoveryEnvironmentHint || billingEnvironmentHint}</p>
            )}
            {planUsage?.finite ? (
              <div className={`nb-usage-meter mt-2 max-w-sm ${planUsageToneClass}`}>
                <div className="nb-usage-meter__row">
                  <span className="nb-usage-meter__label">{planUsage.progressLabel}</span>
                  <span className="nb-usage-meter__remaining">{planUsage.remainingLabel}</span>
                </div>
                <div className="nb-usage-meter__track">
                  <div
                    className="nb-usage-meter__fill"
                    style={{ width: `${planUsage.progressPercent}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ) : null}
            {planWarning && !planLimitReached ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:max-w-[320px] md:justify-end">
              <div className="nb-toolbar">
                <button
                  type="button"
                  className={`${showTrash ? "is-idle" : "is-active"} ${
                    showTrash
                      ? ""
                      : ""
                  }`}
                  onClick={() => setShowTrash(false)}
                >
                All
              </button>
                <button
                  type="button"
                  className={`${showTrash ? "is-active" : "is-idle"} ${
                    showTrash
                      ? ""
                      : ""
                  }`}
                  onClick={() => setShowTrash(true)}
                >
                Trash
              </button>
            </div>
            {!showTrash ? (
              <div className="nb-toolbar">
                {statusFilterOptions.map((option) => {
                  const isActive = statusFilter === option.id;
                  const countLabel =
                    option.id === "all"
                      ? invoices.length
                      : statusCounts[option.id] ?? 0;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={isActive ? "is-active" : "is-idle"}
                      onClick={() => {
                        setStatusFilter(option.id);
                        setSelectedIds([]);
                      }}
                    >
                      {option.label} ({countLabel})
                    </button>
                  );
                })}
              </div>
            ) : null}
            {filteredInvoices.length > 0 ? (
              <button
                type="button"
                className="nb-btn-secondary rounded-xl px-3 py-2 text-xs"
                onClick={() => {
                  if (selectionMode) {
                    clearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
              >
                {selectionMode ? "Cancel selection" : "Select"}
              </button>
            ) : null}
            <button
              type="button"
              className="nb-btn-secondary rounded-xl px-4 py-2"
              onClick={() => navigate("/ai-intake")}
            >
              New intake
            </button>
            <button
              type="button"
              className="nb-btn-primary rounded-xl px-4 py-2"
              onClick={() => navigate("/manual")}
            >
              Blank invoice
            </button>
          </div>
        </div>
        </div>

        {error ? (
          <div className="nb-banner nb-banner--danger mt-6">
            {error}
          </div>
        ) : null}
        {billingError ? (
          <div className="nb-banner nb-banner--warning mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Pro workflow locked</p>
              <p className="mt-1 text-sm">{billingError}</p>
              {recoveryEnvironmentHint ? (
                <p className="mt-2 text-xs leading-5 text-amber-800">{recoveryEnvironmentHint}</p>
              ) : null}
            </div>
            {showUpgradeAction ? (
              <button
                type="button"
                className="nb-btn-primary rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
                onClick={() => handleUpgradeAction()}
                disabled={billingBusy}
              >
                {billingBusy ? "Opening..." : upgradeActionLabel}
              </button>
            ) : (
              <a href="/support" className="font-semibold underline underline-offset-2">
                Get support
              </a>
            )}
          </div>
        ) : null}
        {billingNotice ? (
          <div
            className={`nb-banner mt-3 font-medium ${
              billingNotice.tone === "green"
                ? "nb-banner--success"
                : "nb-banner--warning"
            }`}
          >
            {billingNotice.message}
          </div>
        ) : null}
        {deliveryNotice ? (
          <div className="nb-banner nb-banner--info mt-3">
            {deliveryNotice}
          </div>
        ) : null}
        {handoffNotice ? (
          <div className="nb-banner nb-banner--info mt-3">
            {handoffNotice}
          </div>
        ) : null}
        <div className="nb-accent-panel nb-reveal-up mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="nb-section-chip">Reminder notifications</div>
              <p className="mt-3 text-lg text-slate-600" style={{ fontFamily: "'Fraunces', serif" }}>
                {reminderNotificationsSubtitle}
              </p>
              <p className="text-xs leading-5 text-slate-500">
                Keep browser nudges available when you want a light reminder layer outside the library.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleEnableReminderNotifications}
                disabled={reminderNotificationBusy || !canUseBrowserNotifications()}
              >
                {reminderNotificationBusy ? "Enabling..." : "Enable browser reminders"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleTestReminderNotification}
                disabled={reminderNotificationBusy || !canUseBrowserNotifications()}
              >
                {reminderNotificationBusy ? "Testing..." : "Test reminder alert"}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-[#f7faf7] px-2 py-1 font-semibold text-[#17493c]">
              {reminderNotificationSettings.enabled ? "Enabled" : "Off"}
            </span>
            {reminderNotificationNotice ? (
              <span className="rounded-full bg-white px-2 py-1 font-semibold text-[#17493c]">
                {reminderNotificationNotice}
              </span>
            ) : null}
          </div>
          {oldestSentReminder ? (
            <p className="mt-3 rounded-2xl border border-slate-200 bg-white/88 px-3 py-2 text-[11px] leading-5 text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-700">Preview:</span>{" "}
              {activeFollowUpNoteText || reminderNotePreviewText || buildReminderNotificationPreview()}
            </p>
          ) : null}
          {!canUseBrowserNotifications() ? (
            <p className="mt-2 text-[11px] text-slate-500">
              This browser does not support notifications.
            </p>
          ) : null}
        </div>

        {!requiresSignIn && planLimitReached ? (
          <div className="nb-banner nb-banner--warning mt-6" role="status" aria-live="polite">
            <p className="text-sm font-semibold text-amber-900">Free plan limit reached</p>
            {planUsage?.finite ? (
              <div className={`nb-usage-meter mt-2 ${planUsageToneClass}`}>
                <div className="nb-usage-meter__row">
                  <span className="nb-usage-meter__label">{planUsage.progressLabel}</span>
                  <span className="nb-usage-meter__remaining">{planUsage.remainingLabel}</span>
                </div>
                <div className="nb-usage-meter__track">
                  <div
                    className="nb-usage-meter__fill"
                    style={{ width: `${planUsage.progressPercent}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ) : null}
            <p className="mt-1 text-sm text-amber-800">
              You can still open and export existing invoices. Upgrade to keep saving new work and unlock payment links, portal access, and follow-up tools.
            </p>
            {showInstalledAppGuard ? (
              <div
                className="mt-3 rounded-[18px] border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-950"
                role="status"
                aria-live="polite"
              >
                <p className="font-semibold uppercase tracking-[0.16em] text-blue-700">Open the app</p>
                <p className="mt-1">
                  Google Play upgrades work best from the installed NoteBill app. This browser is still fine for reviewing and exporting.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs leading-5 text-amber-800">{billingEnvironmentHint}</p>
            )}
            {showUpgradeAction ? (
              hasGooglePlayPlanChoices ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {googlePlaySubscriptionPlans.map((option) => (
                    <button
                      key={option.basePlanId}
                      type="button"
                      className={`rounded-[18px] border px-3 py-3 text-left transition ${
                        option.isDefault
                          ? "border-amber-300 bg-white shadow-[0_14px_30px_rgba(217,119,6,0.12)]"
                          : "border-amber-200 bg-white/90 hover:border-amber-300 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      onClick={() => handleUpgradeAction(option.basePlanId)}
                      disabled={billingBusy}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-amber-950">{option.label}</span>
                        {option.badge || option.isDefault ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900">
                            {option.badge || "Default"}
                          </span>
                        ) : null}
                      </div>
                      {option.cadenceLabel ? (
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                          {option.cadenceLabel}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs leading-5 text-amber-900/80">{option.description}</p>
                    </button>
                  ))}
                </div>
              ) : useStripeUpgradeAction ? (
                <button
                  type="button"
                  className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleUpgradeAction}
                  disabled={billingBusy}
                >
                  {billingBusy ? "Opening..." : upgradeActionLabel}
                </button>
              ) : (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-400"
                >
                  {upgradeActionLabel}
                </a>
              )
            ) : null}
            <p className="mt-2 text-xs text-amber-900">
              Need a hand?{" "}
              <a href="/support" className="font-semibold underline underline-offset-2">
                Get support
              </a>
            </p>
          </div>
        ) : null}
        {showDraftRecoveryReminder ? (
          <div className="nb-accent-panel nb-reveal-up mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="nb-section-chip">Draft recovery inbox</div>
                <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                  Reopen unfinished work before it slips out of context.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {staleDraftInvoices.length === 1
                    ? "1 draft has been inactive for over a week. Reopening it now is usually the fastest way to recover momentum."
                    : `${staleDraftInvoices.length} drafts have been inactive for over a week. Reopening them now is usually the fastest way to recover momentum.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {oldestStaleDraft ? (
                  <button
                    type="button"
                    className="nb-btn-primary rounded-xl px-3 py-2 text-xs disabled:cursor-not-allowed"
                    onClick={() => handleOpen(oldestStaleDraft.invoiceId)}
                    disabled={actionId === oldestStaleDraft.invoiceId}
                  >
                    {actionId === oldestStaleDraft.invoiceId ? "Opening..." : "Resume oldest draft"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="nb-btn-secondary rounded-xl px-3 py-2 text-xs"
                  onClick={() => {
                    setStatusFilter("draft");
                    setSelectedIds([]);
                  }}
                >
                  Show all drafts
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {staleDraftPreview.map((invoice) => {
                const customerLabel = String(invoice?.customerName ?? "").trim() || "No client saved";
                const updatedLabel = invoice?.updatedAt ? formatDate(invoice.updatedAt) : "recently";
                const openLabel = actionId === invoice.invoiceId ? "Opening..." : "Resume draft";
                return (
                  <article key={invoice.invoiceId} className="nb-stage-card">
                    <p className="nb-stage-card__label">{invoice.invoiceNumber || "Draft invoice"}</p>
                    <p className="nb-stage-card__value text-[1rem] leading-6">{customerLabel}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Updated {updatedLabel}. Reopen it to finish the save, payment, or send path without rebuilding the context.
                    </p>
                    <div className="nb-mobile-actions mt-3">
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-xl px-3 py-2 text-xs disabled:cursor-not-allowed"
                        onClick={() => handleOpen(invoice.invoiceId)}
                        disabled={actionId === invoice.invoiceId}
                      >
                        {openLabel}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {staleDraftInvoices.length > staleDraftPreview.length ? (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {staleDraftInvoices.length - staleDraftPreview.length} more stale draft
                {staleDraftInvoices.length - staleDraftPreview.length === 1 ? "" : "s"} are waiting in the draft list.
              </p>
            ) : null}
          </div>
        ) : null}
        {showCollectionsCommandCenter ? (
          <div className="nb-accent-panel nb-reveal-up mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="nb-section-chip">Collections command center</div>
                <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                  See who still owes you money and what the cleanest next move is.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Open balances, overdue opens, and partial payments are grouped here so the payment path stays obvious.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={() => applyLibraryView({ nextStatusFilter: "needs_attention" })}
              >
                Open needs attention
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="nb-stage-card">
                <p className="nb-stage-card__label">Open sent balance</p>
                <p className="nb-stage-card__value">
                  {sentOpenInvoices.length > 0 ? formatMoney(sentOpenBalanceTotal) : "0"}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {sentOpenInvoices.length === 1
                    ? "1 sent invoice is still waiting on payment."
                    : `${sentOpenInvoices.length} sent invoices are still waiting on payment.`}
                </p>
                <div className="nb-mobile-actions mt-3">
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-xl px-3 py-2 text-xs"
                    onClick={() => applyLibraryView({ nextStatusFilter: "sent" })}
                  >
                    Show sent invoices
                  </button>
                </div>
              </article>
              <article className="nb-stage-card">
                <p className="nb-stage-card__label">Opened and unpaid</p>
                <p className="nb-stage-card__value">{openedUnpaidInvoices.length}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {overdueOpenedInvoices.length > 0
                    ? `${overdueOpenedInvoices.length} overdue invoice${overdueOpenedInvoices.length === 1 ? "" : "s"} were already opened.`
                    : openedUnpaidInvoices.length > 0
                      ? "The client has already seen these invoices, so a focused reminder is usually next."
                      : "No opened-but-unpaid invoices right now."}
                </p>
                {overdueOpenedInvoices.length > 0 || openedUnpaidInvoices.length > 0 ? (
                  <div className="nb-mobile-actions mt-3">
                    <button
                      type="button"
                      className="nb-btn-primary rounded-xl px-3 py-2 text-xs"
                      onClick={() =>
                        applyLibraryView({
                          nextStatusFilter: "needs_attention",
                          nextFocus: overdueOpenedInvoices.length > 0 ? "overdue_opened" : "opened_unpaid"
                        })
                      }
                    >
                      {overdueOpenedInvoices.length > 0 ? "Review opened overdue" : "Review opened unpaid"}
                    </button>
                  </div>
                ) : null}
              </article>
              <article className="nb-stage-card">
                <p className="nb-stage-card__label">Partial payments</p>
                <p className="nb-stage-card__value">
                  {partialPaymentInvoices.length > 0 ? formatMoney(partialOpenBalanceTotal) : "0"}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {partialPaymentInvoices.length === 0
                    ? "No partial-payment balances need attention right now."
                    : partialPaymentInvoices.length === 1
                      ? "1 invoice has money recorded but still needs the remaining balance collected."
                      : `${partialPaymentInvoices.length} invoices have money recorded but still need the remaining balance collected.`}
                </p>
                {latestPartialPaymentInvoice?.invoiceId ? (
                  <div className="nb-mobile-actions mt-3">
                    <button
                      type="button"
                      className="nb-btn-primary rounded-xl px-3 py-2 text-xs"
                      onClick={() =>
                        applyLibraryView({
                          nextStatusFilter: "needs_attention",
                          nextFocus: "partial_payments"
                        })
                      }
                    >
                      Review partial payments
                    </button>
                    {latestPartialPaymentInvoice.customerName ? (
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-xl px-3 py-2 text-xs"
                        onClick={() =>
                          navigate(`/clients?client=${encodeURIComponent(latestPartialPaymentInvoice.customerName)}`)
                        }
                      >
                        Open client workspace
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </div>
            {(overdueUnopenedInvoices.length > 0 || oldestSentReminder) ? (
              <p className="mt-4 rounded-2xl border border-[#d5e5de] bg-white/88 px-3 py-2 text-xs leading-5 text-[#17493c] shadow-sm">
                {overdueUnopenedInvoices.length > 0
                  ? `Delivery first: ${overdueUnopenedInvoices.length} overdue invoice${overdueUnopenedInvoices.length === 1 ? "" : "s"} still unopened. Re-send or confirm delivery before a reminder.`
                  : oldestSentReminderOpened
                    ? "Fastest move: the client already opened it, so send a focused reminder."
                    : "Fastest move: keep delivery and payment handoff tight."}
              </p>
            ) : null}
          </div>
        ) : null}
        {showRepeatReadyLane ? (
          <div className="nb-accent-panel nb-reveal-up mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="nb-section-chip">Repeat-ready clients</div>
                <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                  Start the next job from clients with the strongest memory.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Paid history, saved services, recipient memory, and cadence are already lined up.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={() => navigate("/clients")}
              >
                Open client workspace
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {repeatReadyClients.map((entry) => {
                const serviceCount = entry.memoryStarter?.savedItemCount ?? 0;
                const serviceSummary =
                  serviceCount > 1
                    ? `${serviceCount} saved services`
                    : entry.memoryStarter?.leadItem?.description
                      ? entry.memoryStarter.leadItem.description
                      : "No saved bundle yet";
                const cadenceSummary = entry.savedCadence ? formatRecurringCadence(entry.savedCadence) : "";
                const invoiceId = entry.invoice?.invoiceId ?? "";
                const primaryUsesBundle = Boolean(entry.memoryStarter);
                return (
                  <article
                    key={entry.lookupKey}
                    className="rounded-[24px] border border-[#d5e5de] bg-white/88 px-4 py-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.clientName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.invoiceNumber || "Latest paid invoice"}
                          {Number.isFinite(entry.total) && entry.total > 0 ? ` · Last total ${formatMoney(entry.total)}` : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-[#d5e5de] bg-[#f7faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]">
                            {serviceSummary}
                          </span>
                          {cadenceSummary ? (
                            <span className="rounded-full border border-[#d5e5de] bg-[#f7faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]">
                              {cadenceSummary} cadence
                            </span>
                          ) : null}
                          {entry.savedRecipient ? (
                            <span className="rounded-full border border-[#d5e5de] bg-[#f7faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]">
                              Saved recipient
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="nb-mobile-actions md:max-w-[320px]">
                        <button
                          type="button"
                          className="nb-btn-primary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:bg-[#86ab9d]"
                          onClick={() =>
                            primaryUsesBundle
                              ? handleStartFromClientMemory(entry.invoice)
                              : handleInvoiceAgain(invoiceId)
                          }
                          disabled={actionId === invoiceId}
                        >
                          {actionId === invoiceId
                            ? "Opening..."
                            : primaryUsesBundle
                              ? serviceCount > 1
                                ? "Use saved bundle"
                                : "Start from saved memory"
                              : "Invoice again"}
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary rounded-xl px-4 py-2"
                          onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.clientName)}`)}
                        >
                          Open client workspace
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        {showRecurringReminder ? (
        <div className="nb-banner mt-6 border-indigo-200 bg-indigo-50 text-indigo-900">
            <p className="text-sm font-semibold text-indigo-900">Repeat work</p>
            <p className="mt-1 text-sm text-indigo-900">
              {recurringDueCount > 0
                ? recurringDueCount === 1
                  ? "1 recurring invoice is ready."
                  : `${recurringDueCount} recurring invoices are due.`
                : recurringSoonCount > 0
                  ? recurringSoonCount === 1
                    ? `1 recurring invoice is due soon on ${formatDate(nextRecurringCandidate.recurringEntry?.nextDueAt)}.`
                    : `${recurringSoonCount} recurring invoices are due soon.`
                : nextRecurringCandidate
                  ? `Next recurring invoice is due ${formatDate(nextRecurringCandidate.recurringEntry?.nextDueAt)}.`
                  : "Recurring schedules are active."}
            </p>
            {nextRecurringCandidate && recurringMemoryStarter ? (
              <p className="mt-2 text-xs text-indigo-800">
                {recurringMemorySummary} is ready for{" "}
                {nextRecurringCandidate.customerName || "this repeat client"}.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {nextRecurringCandidate ? (
                <button
                  type="button"
                  className="rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:text-indigo-400"
                  onClick={() =>
                    handleInvoiceAgain(nextRecurringCandidate.invoiceId, {
                      onLoaded: () => advanceRecurringSchedule(nextRecurringCandidate.invoiceId)
                    })
                  }
                  disabled={actionId === nextRecurringCandidate.invoiceId}
                >
                  {actionId === nextRecurringCandidate.invoiceId
                    ? "Opening..."
                    : "Open repeat invoice"}
                </button>
              ) : null}
              {nextRecurringCandidate && recurringMemoryStarter ? (
                <button
                  type="button"
                  className="rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:text-indigo-400"
                  onClick={() => handleStartFromClientMemory(nextRecurringCandidate)}
                  disabled={actionId === nextRecurringCandidate.invoiceId}
                  aria-label={`Start recurring invoice from saved memory for ${
                    nextRecurringCandidate.customerName || "repeat client"
                  }`}
                >
                  {actionId === nextRecurringCandidate.invoiceId ? "Opening..." : "Start from saved memory"}
                </button>
              ) : null}
              {nextRecurringCandidate ? (
                <p className="text-xs text-indigo-800">
                  Next due invoice: {nextRecurringCandidate.invoiceNumber || "Draft invoice"}
                </p>
              ) : null}
            </div>
            </div>
        ) : null}
        {showSentFollowUpReminder ? (
          <div className="nb-accent-panel nb-reveal-up mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="nb-section-chip">Follow-up queue</div>
                <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                  Keep outstanding invoices moving without second-guessing the next nudge.
                </p>
              </div>
              {followUpPlan ? (
                <div className="nb-metric-card min-w-[180px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Plan summary</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{followUpPlan.summary}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {sentFollowUpInvoices.length === 1
                ? oldestSentReminder?.isPastDue
                  ? "1 sent invoice is past due."
                  : "1 sent invoice is waiting on follow-up."
                : pastDueSentFollowUpCount > 0
                  ? `${sentFollowUpInvoices.length} sent invoices are waiting on follow-up (${pastDueSentFollowUpCount} past due).`
                  : `${sentFollowUpInvoices.length} sent invoices are waiting on follow-up.`}
            </p>
            {smartFollowUpSuggestion ? (
              <p className="mt-3 rounded-2xl border border-[#d5e5de] bg-white/88 px-3 py-2 text-xs font-medium text-[#17493c] shadow-sm">
                {smartFollowUpSuggestion}
              </p>
            ) : null}
            {oldestSentReminder ? (
              <div className="mt-3 space-y-3 rounded-2xl border border-[#e4efe9] bg-white/84 px-3 py-3 text-xs leading-5 text-[#17493c] shadow-sm">
                <p>{activeFollowUpNoteText}</p>
                {followUpAiPanelOpen ? (
                  <div className="space-y-3 rounded-2xl border border-[#dbe9e2] bg-[#f7faf7] px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d6f61]">
                      Billie polish
                    </p>
                    <p className="text-xs text-[#3d6f61]">
                      Rewrite wording only. Invoice details, due timing, and payment context stay the same.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {followUpAiToneOptions.map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          className="rounded-full border border-[#c9ddd3] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#17493c] shadow-sm transition hover:border-[#b7d0c3] disabled:cursor-not-allowed disabled:text-[#7da393]"
                          onClick={() => void handleRewriteFollowUpNote(tone)}
                          disabled={Boolean(followUpAiBusy)}
                        >
                          {followUpAiBusy === tone ? "Rewriting..." : tone}
                        </button>
                      ))}
                      {followUpNoteDraft ? (
                        <button
                          type="button"
                          className="rounded-full border border-transparent px-3 py-1.5 text-[11px] font-semibold text-[#3d6f61] transition hover:text-[#17493c]"
                          onClick={() => {
                            setFollowUpNoteDraft("");
                            setFollowUpAiError("");
                            setFollowUpNoteNotice("Returned to the original reminder note.");
                          }}
                          disabled={Boolean(followUpAiBusy)}
                        >
                          Reset to original
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {followUpPlan ? (
              <div
                className="nb-glass-list mt-4"
                data-testid="library-follow-up-plan"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                    Follow-up plan
                  </p>
                  <p className="text-xs text-[#3d6f61]">{followUpPlan.summary}</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <div className="nb-metric-card">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Urgency
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{followUpPlan.urgencyValue}</p>
                  </div>
                  <div className="nb-metric-card">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Delivery
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{followUpPlan.deliveryValue}</p>
                  </div>
                  <div className="nb-metric-card">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Next step
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{followUpPlan.nextStepValue}</p>
                  </div>
                  <div className="nb-metric-card">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Automation
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-800">{followUpPlan.automationValue}</p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={() => {
                  setStatusFilter("sent");
                  setSelectedIds([]);
                }}
              >
                Show sent invoices
              </button>
              {recurringCandidateInvoice ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:text-[#7da393]"
                  onClick={() => handleInvoiceAgain(recurringCandidateInvoice.invoiceId)}
                  disabled={actionId === recurringCandidateInvoice.invoiceId}
                >
                  {actionId === recurringCandidateInvoice.invoiceId
                    ? "Opening..."
                    : "Open repeat invoice"}
                </button>
              ) : null}
              {oldestSentReminder.isPastDue && oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                  onClick={() => startSendComposer(oldestSentReminder)}
                >
                  Open send flow
                </button>
              ) : canQuickSendReminderOldest ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:text-[#7da393]"
                  onClick={() => handleSendReminder(oldestSentReminder)}
                  disabled={actionId === oldestSentReminder.invoiceId}
                >
                  {actionId === oldestSentReminder.invoiceId
                    ? "Sending..."
                    : oldestSentReminder.isPastDue &&
                        oldestSentReminderHasTrackedDelivery &&
                        oldestSentReminderOpened
                      ? "Send focused reminder"
                      : "Send reminder"}
                </button>
              ) : null}
              {oldestSentReminderHasTrackedDelivery && !oldestSentReminderOpened ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:text-[#7da393]"
                  onClick={() => void handleMarkDeliveryOpened(oldestSentReminder.invoiceId)}
                  disabled={actionId === oldestSentReminder.invoiceId}
                >
                  {actionId === oldestSentReminder.invoiceId ? "Marking..." : "Mark opened"}
                </button>
              ) : null}
              {oldestSentReminder ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:text-[#7da393]"
                  onClick={() => handleStatusUpdate(oldestSentReminder.invoiceId, "paid")}
                  disabled={statusActionId === `${oldestSentReminder.invoiceId}:paid`}
                >
                  {statusActionId === `${oldestSentReminder.invoiceId}:paid` ? "Marking..." : "Mark paid"}
                </button>
              ) : null}
              {oldestSentReminder ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                  onClick={handleCopyFollowUpNote}
                >
                  Copy reminder note
                </button>
              ) : null}
              {oldestSentReminder ? (
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                  onClick={() => {
                    setFollowUpAiPanelOpen((current) => !current);
                    setFollowUpAiError("");
                  }}
                >
                  {followUpAiPanelOpen ? "Hide Billie helper" : "Billie polish note"}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={handleSnoozeFollowUpReminder}
              >
                Snooze for 7 days
              </button>
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={handleDismissFollowUpReminder}
              >
                Dismiss
              </button>
              {oldestSentReminder ? (
                <p className="text-xs text-blue-800">
                  {oldestSentReminder.isPastDue && oldestSentReminderDueLabel
                    ? `${oldestSentReminder.invoiceNumber || "Sent invoice"} was due ${oldestSentReminderDueLabel}.`
                    : `Last update: ${formatDate(oldestSentReminder.updatedAt)}`}
                </p>
              ) : null}
              {followUpNoteNotice ? <p className="text-xs font-medium text-blue-900">{followUpNoteNotice}</p> : null}
              {followUpAiError ? <p className="text-xs font-medium text-rose-700">{followUpAiError}</p> : null}
            </div>
            <div className="nb-glass-list mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reminder automation
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Tune follow-up timing, then preview or run reminders without leaving the library.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reminderAutomationPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-[#bcd2c8] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() =>
                      persistReminderAutomationSettings({
                        dueAfterDays: preset.dueAfterDays,
                        cooldownDays: preset.cooldownDays,
                        maxPerRun: preset.maxPerRun
                      })
                    }
                    disabled={reminderAutomationBusy}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-slate-600">
                  First follow-up (days)
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    className="nb-input mt-1 rounded-lg px-2 py-1.5 text-xs"
                    value={String(reminderAutomationSettings.dueAfterDays)}
                    onChange={(event) =>
                      persistReminderAutomationSettings({
                        ...reminderAutomationSettings,
                        dueAfterDays: event.target.value
                      })
                    }
                    disabled={reminderAutomationBusy}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Repeat cooldown (days)
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    className="nb-input mt-1 rounded-lg px-2 py-1.5 text-xs"
                    value={String(reminderAutomationSettings.cooldownDays)}
                    onChange={(event) =>
                      persistReminderAutomationSettings({
                        ...reminderAutomationSettings,
                        cooldownDays: event.target.value
                      })
                    }
                    disabled={reminderAutomationBusy}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Max per run
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    className="nb-input mt-1 rounded-lg px-2 py-1.5 text-xs"
                    value={String(reminderAutomationSettings.maxPerRun)}
                    onChange={(event) =>
                      persistReminderAutomationSettings({
                        ...reminderAutomationSettings,
                        maxPerRun: event.target.value
                      })
                    }
                    disabled={reminderAutomationBusy}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="nb-btn-secondary rounded-xl px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => runReminderAutomation({ dryRun: true })}
                  disabled={reminderAutomationBusy}
                >
                  {reminderAutomationBusy ? "Working..." : "Preview due reminders"}
                </button>
                <button
                  type="button"
                  className="nb-btn-secondary rounded-xl px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => runReminderAutomation({ dryRun: false })}
                  disabled={reminderAutomationBusy}
                >
                  {reminderAutomationBusy ? "Working..." : "Run reminders now"}
                </button>
                {reminderAutomationNotice ? (
                  <p className="text-xs font-medium text-blue-900">{reminderAutomationNotice}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {requiresSignIn ? (
          <div className="nb-banner nb-banner--warning mt-6 p-4">
            <p className="text-sm font-semibold text-amber-900">Sign in required to open your invoice library</p>
            <p className="mt-1 text-sm text-amber-800">
              Saved invoices on this server are tied to an account so your library stays private and reusable.
            </p>
            <p className="mt-1 text-sm text-amber-800">{requiresSignInHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-[#17493c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#12372d]"
                onClick={() =>
                  navigate(`/?auth=sign-in&returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`)
                }
              >
                Open sign-in
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-400"
                onClick={async () => {
                  if (typeof refreshSession === "function") {
                    const nextSession = await refreshSession();
                    setAuthSession(nextSession);
                  } else {
                    setAuthSession(getAuthSession?.() ?? null);
                  }
                  setAuthRequiredError(false);
                }}
              >
                I signed in
              </button>
            </div>
          </div>
        ) : null}
        {libraryGuide ? (
          <section
            className={`nb-highlight-panel mt-6 ${libraryGuide.toneClass}`}
            data-testid="library-billie-next-up"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                  {libraryGuide.eyebrow}
                </p>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{libraryGuide.title}</h2>
                  <p className="text-sm opacity-90">{libraryGuide.body}</p>
                </div>
                {libraryGuide.meta?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {libraryGuide.meta.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={libraryGuide.onPrimary}
                  disabled={libraryGuide.primaryDisabled}
                >
                  {libraryGuide.primaryLabel}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/60 bg-transparent px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={libraryGuide.onSecondary}
                  disabled={libraryGuide.secondaryDisabled}
                >
                  {libraryGuide.secondaryLabel}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!requiresSignIn && selectionMode && filteredInvoices.length > 0 ? (
          <div className="nb-surface nb-surface--muted mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[26px] px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-900">
                {selectedCount > 0 ? `${selectedCount} selected` : "Select invoices"}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-blue-800"
                onClick={toggleSelectAll}
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {showTrash ? (
                <>
                  <button
                    type="button"
                    className="rounded-xl bg-[#17493c] px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-[#86ab9d]"
                    onClick={() => handleRestore(selectedIds)}
                    disabled={selectedCount === 0 || isDeleting}
                  >
                    Restore selected
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm transition disabled:cursor-not-allowed disabled:text-rose-300"
                    onClick={() =>
                      requestDelete({
                        ids: selectedIds,
                        label: `${selectedCount} invoices`,
                        mode: "permanent"
                      })
                    }
                    disabled={selectedCount === 0 || isDeleting}
                  >
                    Delete permanently
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm transition disabled:cursor-not-allowed disabled:text-rose-300"
                  onClick={() =>
                    requestDelete({
                      ids: selectedIds,
                      label: `${selectedCount} invoices`,
                      mode: "soft"
                    })
                  }
                  disabled={selectedCount === 0 || isDeleting}
                >
                  Delete selected
                </button>
              )}
            </div>
          </div>
        ) : null}

        {!requiresSignIn ? (
          <div className="mt-6 space-y-4">
          {needsAttentionSummary ? (
            <div className="nb-accent-panel nb-reveal-up">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="nb-section-chip">Needs attention</div>
                  <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                    {needsAttentionSummary.title}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{needsAttentionSummary.body}</p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                  onClick={() => applyLibraryView({ nextStatusFilter: "all" })}
                >
                  Show all invoices
                </button>
              </div>
              {needsAttentionSummary.chips.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {needsAttentionSummary.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[#d5e5de] bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {normalizedViewFocus ? (
            <div className="nb-glass-list">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                    Focused queue
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {focusedQueueMeta?.title || "Focused billing lane"}
                  </p>
                  {focusedQueueMeta ? (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {focusedQueueMeta.summary}
                    </p>
                  ) : null}
                  {focusedQueueMeta ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#d5e5de] bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]">
                        {focusedQueueMeta.count} in queue
                      </span>
                      {alternateFocusQueues.map((queue) => (
                        <button
                          key={queue.id}
                          type="button"
                          className="rounded-full border border-[#d5e5de] bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61] transition hover:border-[#bcd2c8]"
                          onClick={() =>
                            applyLibraryView({
                              nextStatusFilter: queue.statusFilter,
                              nextFocus: queue.id
                            })
                          }
                        >
                          {queue.shortLabel} ({queue.count})
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="nb-btn-secondary rounded-xl px-3 py-2 text-xs"
                  onClick={() => applyLibraryView({ nextStatusFilter: statusFilter })}
                >
                  Clear focus
                </button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="nb-surface nb-surface--muted rounded-[28px] p-6 text-sm text-slate-500">
              Loading saved invoices...
            </div>
          ) : null}

          {!loading && visibleInvoices.length === 0 ? (
            <div className="nb-empty">
              {showTrash ? (
                <>
                  <p className="text-sm font-semibold text-slate-900">Trash is empty</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Deleted invoices will appear here until you restore or remove them.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">
                    {focusedQueueMeta?.emptyTitle || emptyLibraryState.title}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {focusedQueueMeta?.emptyBody || emptyLibraryState.body}
                  </p>
                  {normalizedViewFocus ? (
                    <div className="mt-4 space-y-3">
                      {strongestAlternateQueue ? (
                        <div className="rounded-[22px] border border-[#d5e5de] bg-white/90 px-4 py-3 text-left shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d6f61]">
                            Best fallback queue
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {strongestAlternateQueue.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {strongestAlternateQueue.summary}
                          </p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap justify-center gap-2">
                        {strongestAlternateQueue ? (
                          <button
                            type="button"
                            className="nb-btn-primary inline-flex h-10 px-4"
                            onClick={() =>
                              applyLibraryView({
                                nextStatusFilter: strongestAlternateQueue.statusFilter,
                                nextFocus: strongestAlternateQueue.id
                              })
                            }
                          >
                            Open {strongestAlternateQueue.shortLabel}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="nb-btn-secondary inline-flex h-10 rounded-full px-4"
                          onClick={() => applyLibraryView({ nextStatusFilter: statusFilter })}
                        >
                          Clear focus
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary inline-flex h-10 rounded-full px-4"
                          onClick={() => applyLibraryView({ nextStatusFilter: "needs_attention" })}
                        >
                          Open needs attention
                        </button>
                      </div>
                    </div>
                  ) : statusFilter === "all" ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        className="nb-btn-primary inline-flex h-10 px-4"
                        onClick={() => navigate("/ai-intake")}
                      >
                        Start with notes
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary inline-flex h-10 rounded-full px-4"
                        onClick={() => navigate("/ai-intake?sample=starter")}
                      >
                        Try sample job
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        className="nb-btn-secondary inline-flex h-10 rounded-full px-4"
                        onClick={() => applyLibraryView({ nextStatusFilter: "all" })}
                      >
                        Show all invoices
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {!loading && visibleInvoices.length > 0
              ? visibleInvoices.map((invoice) => {
                const statusClass = statusStyles[invoice.status] ?? statusStyles.draft;
                const totalLabel = Number.isFinite(invoice.total)
                  ? formatMoney(invoice.total)
                  : "-";
                const balanceDue = getInvoiceOpenBalance(invoice);
                const dueDateValue = getInvoiceDueDateValue(invoice);
                const dueDateLabel = formatDate(dueDateValue);
                const dueDateMs = parseInvoiceDueTimestamp(dueDateValue);
                const isPastDue = invoice.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs <= Date.now();
                const paymentStatusView = getPaymentStatusView({
                  status: invoice.status,
                  balanceDue,
                  total: Number(invoice?.total ?? 0),
                  isPastDue
                });
                const attentionSignal = needsAttentionById.get(invoice.invoiceId) ?? null;
                const lifecycleLabel = getInvoiceLifecycleLabel(invoice);
                const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId] ?? null;
                const recurringSummary = recurringEntry
                  ? buildRecurringScheduleSummary(recurringEntry, { runHistoryLimit: 2 })
                  : null;
                const isEstimateDocument = getInvoiceDocumentType(invoice) === "estimate";
                const estimateReviewState = isEstimateDocument ? getEstimateReviewState(invoice) : "";
                const recurringAutoSendRecipient = recurringEntry
                  ? getRecurringAutoSendRecipient(invoice, getClientMemory())
                  : "";
                const recurringAutoSendEnabled = Boolean(recurringEntry?.autoSendEnabled);
                const recurringIntervalLabel = recurringEntry
                  ? formatRecurringCadence(recurringEntry.intervalDays)
                  : "";
                const recurringNextDue = recurringEntry ? formatDate(recurringEntry.nextDueAt) : "";
                const rememberedRecurringInterval = !recurringEntry
                  ? getClientRecurringInterval(invoice.customerName ?? "")
                  : null;
                const rememberedRecurringLabel = rememberedRecurringInterval
                  ? formatRecurringCadence(rememberedRecurringInterval)
                  : "";
                const delivery = invoice?.delivery ?? null;
                const hasDelivery = Boolean(delivery?.recipientEmail) && Boolean(delivery?.sentAt);
                const deliverySentAt = hasDelivery ? formatDateTime(delivery.sentAt) : "";
                const deliveryOpenedAt = delivery?.openedAt ? formatDateTime(delivery.openedAt) : "";
                const deliveryOpened = delivery?.status === "opened";
                const providerDelivery = delivery?.mode === "provider";
                const deliveryRecipient = typeof delivery?.recipientEmail === "string" ? delivery.recipientEmail : "";
                const canInstantResend = Boolean(hasDelivery && isValidEmail(deliveryRecipient));
                const paymentLinkReady =
                  typeof invoice?.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0;
                const clientPortalUrl = buildLibraryClientPortalUrl(invoice);
                const clientPortalReady = clientPortalUrl.length > 0;
                const showSendComposer = sendComposer?.invoiceId === invoice.invoiceId;
                const sendComposerIsResend = hasDelivery;
                const sendComposerIntro = sendComposerIsResend
                  ? isPastDue && !deliveryOpened
                    ? "This invoice is overdue and still unopened. Re-send it to put it back in front of the client and keep delivery tracking clear."
                    : isPastDue && deliveryOpened
                      ? "This invoice is overdue and already opened. Re-send only if the client needs another copy; otherwise move into a short focused reminder."
                      : "Re-sending keeps delivery tracking current and lets you confirm the best recipient before the next follow-up."
                  : "Sending records this invoice as sent, starts delivery tracking, and remembers the recipient for this client.";
                const sendComposerButtonLabel = sendComposerIsResend ? "Re-send invoice" : "Send invoice";
                const sendComposerNextStep = !paymentLinkReady
                  ? sendComposerIsResend
                    ? "After the re-send, add a hosted payment link so the client has a clearer way to pay if you need to follow up again."
                    : "After the send records cleanly, add a hosted payment link so the invoice is easier to pay."
                  : !clientPortalReady
                    ? sendComposerIsResend
                      ? "After the re-send, create the client portal so the customer also gets the full review-and-pay handoff."
                      : "After the send records cleanly, create the client portal so the customer gets the full review-and-pay handoff."
                    : sendComposerIsResend
                      ? isPastDue && deliveryOpened
                        ? "After the re-send, watch for payment and move into a focused reminder only if the balance still does not move."
                        : "After the re-send, watch for an open before you escalate into another reminder."
                      : "After the send records cleanly, watch for opens and follow up only if the client needs another copy.";
                const isDeleted = invoice.status === "deleted";
                const isSelected = selectedIds.includes(invoice.invoiceId);
                const isStatusBusy = statusActionId.startsWith(`${invoice.invoiceId}:`);
                const repeatMemoryStarter = buildClientMemoryStarterForInvoice(
                  invoice,
                  getClientMemory(),
                  getLineItemLibrary()
                );
                const showMarkSent = invoice.status === "draft" || invoice.status === "paid";
                const showMarkPaid = invoice.status === "sent";
                const showMarkDraft = invoice.status === "sent" || invoice.status === "paid";
                const nextActionHint = getInvoiceNextActionHint({
                  invoice,
                  hasDelivery,
                  isPastDue,
                  deliveryOpened
                });
                const clientNameLabel = String(invoice.customerName ?? "").trim() || "No client saved";
                const balanceSummaryLabel =
                  invoice.status === "paid"
                    ? "Paid in full"
                    : invoice.status === "deleted"
                      ? "Restore first"
                      : balanceDue > 0
                        ? formatMoney(balanceDue)
                        : "No balance";
                const dueSummaryLabel =
                  dueDateLabel
                    ? `${isPastDue ? "Past due" : "Due"} ${dueDateLabel}`
                    : invoice.status === "paid"
                      ? "Closed out"
                      : invoice.status === "draft"
                        ? "Add a due date"
                        : "No due date";
                const clientStateLabel =
                  invoice.status === "deleted"
                    ? "In trash"
                    : invoice.status === "paid"
                      ? "Work completed"
                      : hasDelivery
                        ? deliveryOpened
                          ? `Opened${deliveryOpenedAt ? ` ${deliveryOpenedAt}` : ""}`
                          : `Sent${deliverySentAt ? ` ${deliverySentAt}` : ""}`
                        : invoice.status === "draft"
                          ? "Still drafting"
                          : "Ready to send";
                const topSummaryItems = [
                  {
                    label: "Client",
                    value: clientNameLabel,
                    toneClass: "text-slate-900",
                    cardClass: ""
                  },
                  {
                    label: invoice.status === "paid" ? "Total" : "Open balance",
                    value: balanceSummaryLabel,
                    toneClass:
                      invoice.status === "paid"
                        ? "text-emerald-700"
                        : isPastDue
                          ? "text-amber-700"
                          : "text-slate-900"
                    ,
                    cardClass:
                      invoice.status === "paid"
                        ? "nb-stage-card--success"
                        : isPastDue || (invoice.status === "sent" && balanceDue > 0)
                          ? "nb-stage-card--warning"
                          : ""
                  },
                  {
                    label: "Due",
                    value: dueSummaryLabel,
                    toneClass: isPastDue ? "text-amber-700" : "text-slate-900",
                    cardClass: isPastDue ? "nb-stage-card--warning" : ""
                  },
                  {
                    label: hasDelivery ? "Client activity" : "State",
                    value: clientStateLabel,
                    toneClass:
                      hasDelivery && deliveryOpened
                        ? "text-emerald-700"
                        : hasDelivery
                          ? "text-sky-700"
                          : "text-slate-900"
                    ,
                    cardClass:
                      hasDelivery && deliveryOpened
                        ? "nb-stage-card--success"
                        : hasDelivery
                          ? "nb-stage-card--info"
                          : ""
                  }
                ];
                const repeatWorkflow = (() => {
                  if (isDeleted || showTrash) {
                    return null;
                  }
                  const cadenceValue = recurringEntry
                    ? recurringNextDue
                      ? `Due ${recurringNextDue}`
                      : "Running"
                    : rememberedRecurringLabel
                      ? `Saved ${rememberedRecurringLabel}`
                      : invoice.status === "paid"
                        ? "Ready to define"
                        : "Optional";
                  const memoryValue = repeatMemoryStarter
                    ? repeatMemoryStarter.savedItemCount > 1
                      ? `${repeatMemoryStarter.savedItemCount} saved services`
                      : repeatMemoryStarter.leadItem
                        ? repeatMemoryStarter.leadItem.description
                      : "Client setup ready"
                    : invoice.customerName
                      ? "No saved bundle yet"
                      : "Needs client";
                  const nextStepValue = recurringEntry
                    ? recurringDueCount > 0 && nextRecurringCandidate?.invoiceId === invoice.invoiceId
                      ? repeatMemoryStarter
                        ? "Open repeat invoice or start from memory"
                        : "Open repeat invoice"
                      : repeatMemoryStarter
                        ? "Keep schedule active + memory ready"
                        : "Keep schedule active"
                    : rememberedRecurringLabel
                      ? "Reuse saved cadence"
                    : repeatMemoryStarter
                        ? repeatMemoryStarter.savedItemCount > 1
                          ? "Start from saved bundle"
                          : "Start from memory"
                        : invoice.status === "paid"
                          ? "Invoice again"
                          : "Set cadence later";
                  const actions = [];
                  if (repeatMemoryStarter) {
                    actions.push({
                      id: "memory",
                      label:
                        repeatMemoryStarter.savedItemCount > 1
                          ? "Use saved bundle"
                          : "Start from saved memory",
                      className:
                        "rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:text-indigo-300",
                      onClick: () => handleStartFromClientMemory(invoice)
                    });
                  }
                  if (recurringEntry) {
                    actions.push({
                      id: "repeat-open",
                      label: actionId === invoice.invoiceId ? "Opening..." : "Open repeat invoice",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:text-indigo-300",
                      onClick: () =>
                        handleInvoiceAgain(invoice.invoiceId, {
                          onLoaded: () => advanceRecurringSchedule(invoice.invoiceId)
                        })
                    });
                  } else if (rememberedRecurringInterval) {
                    actions.push({
                      id: "cadence-memory",
                      label: `Use ${rememberedRecurringLabel} cadence`,
                      disabled: actionId === invoice.invoiceId || isDeleting || isStatusBusy,
                      className:
                        "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:text-emerald-300",
                      onClick: () =>
                        setRecurringSchedule(invoice.invoiceId, rememberedRecurringInterval, {
                          source: "library_client_cadence_reuse"
                        })
                    });
                  } else if (invoice.status === "paid") {
                    actions.push({
                      id: "cadence-monthly",
                      label: "Set monthly recurring",
                      disabled: actionId === invoice.invoiceId || isDeleting || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => setRecurringSchedule(invoice.invoiceId, 30)
                    });
                  }
                  if (!recurringEntry && invoice.status === "paid") {
                    actions.push({
                      id: "invoice-again",
                      label: actionId === invoice.invoiceId ? "Opening..." : "Invoice again",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => handleInvoiceAgain(invoice.invoiceId)
                    });
                  }
                  if (actions.length === 0) {
                    return null;
                  }
                  return {
                    cadenceValue,
                    memoryValue,
                    nextStepValue,
                    actions: actions.slice(0, 3)
                  };
                })();
                const quickNextActions = (() => {
                  if (isDeleted || showTrash) {
                    return [
                      {
                        id: "restore",
                        label: "Restore invoice",
                        tone: "primary",
                        onClick: () => handleRestore([invoice.invoiceId]),
                        disabled: actionId === invoice.invoiceId || isDeleting
                      },
                      {
                        id: "delete-permanent",
                        label: "Delete permanently",
                        tone: "danger",
                        onClick: () =>
                          requestDelete({
                            ids: [invoice.invoiceId],
                            label: invoice.invoiceNumber || "Draft invoice",
                            mode: "permanent"
                          }),
                        disabled: actionId === invoice.invoiceId || isDeleting
                      }
                    ];
                  }
                  if (isEstimateDocument) {
                    return [
                      {
                        id: "estimate-open",
                        label: "Open with Billie",
                        tone: "primary",
                        onClick: () => handleOpenWithBillie(invoice.invoiceId),
                        disabled: actionId === invoice.invoiceId || isStatusBusy
                      },
                      {
                        id: "estimate-convert",
                        label: estimateReviewState === "approved" ? "Convert to invoice" : "Mark approved",
                        tone: "secondary",
                        onClick: () =>
                          estimateReviewState === "approved"
                            ? void handleConvertEstimateToInvoice(invoice.invoiceId)
                            : void handleSetEstimateReviewState(invoice.invoiceId, "approved"),
                        disabled:
                          actionId === invoice.invoiceId ||
                          isDeleting ||
                          isStatusBusy ||
                          estimateReviewActionId === invoice.invoiceId
                      },
                      {
                        id: "estimate-open-editor",
                        label: "Open",
                        tone: "secondary",
                        onClick: () => handleOpen(invoice.invoiceId),
                        disabled: actionId === invoice.invoiceId
                      }
                    ];
                  }
                  if (invoice.status === "paid") {
                    return [
                      repeatMemoryStarter
                        ? {
                            id: "paid-memory",
                            label:
                              repeatMemoryStarter.savedItemCount > 1
                                ? "Use saved bundle"
                                : "Start from saved memory",
                            tone: "primary",
                            onClick: () => handleStartFromClientMemory(invoice),
                            disabled: actionId === invoice.invoiceId || isStatusBusy
                          }
                        : {
                            id: "paid-again",
                            label: "Invoice again",
                            tone: "primary",
                            onClick: () => handleInvoiceAgain(invoice.invoiceId),
                            disabled: actionId === invoice.invoiceId || isStatusBusy
                          },
                      {
                        id: "paid-client",
                        label: "Open client workspace",
                        tone: "secondary",
                        onClick: () =>
                          invoice.customerName
                            ? navigate(`/clients?client=${encodeURIComponent(invoice.customerName)}`)
                            : handleOpen(invoice.invoiceId),
                        disabled: actionId === invoice.invoiceId
                      },
                      {
                        id: "paid-recurring",
                        label: rememberedRecurringLabel ? `Use ${rememberedRecurringLabel} cadence` : "Set monthly recurring",
                        tone: "secondary",
                        onClick: () =>
                          rememberedRecurringInterval
                            ? setRecurringSchedule(invoice.invoiceId, rememberedRecurringInterval, {
                                source: "library_client_cadence_reuse"
                              })
                            : setRecurringSchedule(invoice.invoiceId, 30),
                        disabled: actionId === invoice.invoiceId || isDeleting || isStatusBusy
                      }
                    ];
                  }
                  if (invoice.status === "sent" && hasPartialPaymentShared(invoice)) {
                    return [
                      {
                        id: "partial-open",
                        label: "Open with Billie",
                        tone: "primary",
                        onClick: () => handleOpenWithBillie(invoice.invoiceId),
                        disabled: actionId === invoice.invoiceId || isStatusBusy
                      },
                      {
                        id: "partial-mark-paid",
                        label: "Mark paid",
                        tone: "secondary",
                        onClick: () => handleStatusUpdate(invoice.invoiceId, "paid"),
                        disabled: actionId === invoice.invoiceId || isDeleting || isStatusBusy
                      },
                      clientPortalReady
                        ? {
                            id: "partial-portal",
                            label: "Open client portal",
                            tone: "secondary",
                            onClick: () => window.open(clientPortalUrl, "_blank", "noopener,noreferrer"),
                            disabled: false
                          }
                        : {
                            id: "partial-export",
                            label: "Export PDF",
                            tone: "secondary",
                            onClick: () => handleExport(invoice.invoiceId),
                            disabled: actionId === invoice.invoiceId || isStatusBusy
                          }
                    ].filter(Boolean);
                  }
                  const actions = [];
                  if (invoice.status === "sent" && !paymentLinkReady) {
                    actions.push({
                      id: "payment-link",
                      label: "Add payment link",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => handleCreatePaymentLink(invoice.invoiceId)
                    });
                  }
                  if (invoice.status === "sent" && !clientPortalReady) {
                    actions.push({
                      id: "client-portal",
                      label: "Create client portal",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => handleCreateClientPortal(invoice.invoiceId)
                    });
                  }
                  if (invoice.status === "sent" && hasDelivery && !deliveryOpened) {
                    actions.push({
                      id: canQuickSendReminderOldest && oldestSentReminder?.invoiceId === invoice.invoiceId ? "send-reminder" : "follow-up",
                      label:
                        canQuickSendReminderOldest && oldestSentReminder?.invoiceId === invoice.invoiceId
                          ? "Send reminder now"
                          : "Follow up",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () =>
                        canQuickSendReminderOldest && oldestSentReminder?.invoiceId === invoice.invoiceId
                          ? sendReminder(invoice.invoiceId)
                          : handleOpen(invoice.invoiceId)
                    });
                  }
                  if (invoice.status === "sent" && hasDelivery && deliveryOpened) {
                    actions.push({
                      id: "payment-link-sent",
                      label: "Payment link ready",
                      disabled: true,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => {}
                    });
                  }
                  if (invoice.status === "sent" && !hasDelivery && paymentLinkReady) {
                    actions.push({
                      id: "track-send",
                      label: "Track the send",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => handleOpen(invoice.invoiceId)
                    });
                  }
                  if (invoice.status === "draft") {
                    actions.push({
                      id: "open-draft",
                      label: "Open draft",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () => handleOpen(invoice.invoiceId)
                    });
                  }
                  if (invoice.status === "paid" && !recurringEntry) {
                    actions.push({
                      id: "paid-recurring",
                      label: rememberedRecurringLabel ? `Use ${rememberedRecurringLabel} cadence` : "Set monthly recurring",
                      disabled: actionId === invoice.invoiceId || isStatusBusy,
                      className:
                        "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                      onClick: () =>
                        rememberedRecurringInterval
                          ? setRecurringSchedule(invoice.invoiceId, rememberedRecurringInterval, {
                              source: "library_client_cadence_reuse"
                            })
                          : setRecurringSchedule(invoice.invoiceId, 30)
                    });
                    if (!recurringEntry && invoice.status === "paid") {
                      actions.push({
                        id: "invoice-again",
                        label: actionId === invoice.invoiceId ? "Opening..." : "Invoice again",
                        disabled: actionId === invoice.invoiceId || isStatusBusy,
                        className:
                          "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300",
                        onClick: () => handleInvoiceAgain(invoice.invoiceId)
                      });
                    }
                  }
                  if (actions.length === 0) {
                    return null;
                  }
                  return {
                    cadenceValue: repeatWorkflow?.cadenceValue,
                    memoryValue: repeatWorkflow?.memoryValue,
                    nextStepValue: repeatWorkflow?.nextStepValue,
                    actions: actions.slice(0, 3)
                  };
                })();
                const visibleQuickNextActions = quickNextActions.actions.slice(0, 2);
                const cardNextAction = (() => {
                  if (invoice.status === "deleted") {
                    return {
                      label: "Restore invoice",
                      detail: "Bring this invoice back before editing, exporting, or sending it again."
                    };
                  }
                  if (invoice.status === "paid") {
                    return {
                      label: "Invoice this client again",
                      detail: rememberedRecurringLabel
                        ? `This invoice is fully cleared. Reuse it as the baseline for the next similar job or apply the saved ${rememberedRecurringLabel} cadence.`
                        : repeatMemoryStarter?.leadItem?.description
                          ? `This invoice is fully cleared. Reuse it as the baseline for the next similar job or start from saved memory with ${repeatMemoryStarter.leadItem.description}.`
                          : "This invoice is fully cleared. Reuse it as the baseline for the next similar job or set recurring cadence."
                    };
                  }
                  if (invoice.status === "sent" && isPastDue) {
                    if (hasDelivery && !deliveryOpened) {
                      return {
                        label: "Re-send or confirm delivery",
                        detail: paymentLinkReady
                          ? "This invoice is overdue, but it still has not been opened. Put it back in front of the client or confirm delivery before you escalate."
                          : "This invoice is overdue and still unopened. Re-send it, confirm delivery, and tighten the payment path next."
                      };
                    }
                    if (hasDelivery && deliveryOpened) {
                      return {
                        label: "Send focused reminder",
                        detail: paymentLinkReady
                          ? "The client already opened this overdue invoice. Send a short direct reminder and keep the hosted payment path handy."
                          : "The client already opened this overdue invoice. Send a short direct reminder, then tighten the payment handoff."
                      };
                    }
                    return {
                      label: canQuickSendReminderOldest && oldestSentReminder?.invoiceId === invoice.invoiceId
                        ? "Send reminder now"
                        : "Follow up now",
                      detail: paymentLinkReady
                        ? "The invoice is overdue. Nudge the client and keep the hosted payment path ready if they reply."
                        : "The invoice is overdue. Follow up first, then add a hosted payment link so paying is easier when the client is ready."
                    };
                  }
                  if (invoice.status === "sent" && hasDelivery && !deliveryOpened) {
                    return {
                      label: "Check delivery first",
                      detail: "This invoice is tracked but still unopened. Confirm the client saw it before you escalate into reminders."
                    };
                  }
                  if (invoice.status === "sent" && !paymentLinkReady) {
                    return {
                      label: "Open and add payment link",
                        detail: "This invoice is already out. Add a hosted payment link now so the next resend or reminder points to a clearer, safer payment path."
                    };
                  }
                  if (invoice.status === "sent" && !clientPortalReady) {
                    return {
                      label: "Create client portal",
                        detail: paymentLinkReady
                          ? "The payment link is ready. Add the portal next so the customer also gets a clear review surface before paying."
                          : "Once the draft is sent, add a client portal next so the customer can review details in one place."
                    };
                  }
                  if (invoice.status === "sent") {
                      return {
                        label: hasDelivery ? "Track payment" : "Track the send first",
                        detail: hasDelivery
                        ? "Delivery is recorded. Next step is watching for payment and only nudging later if the balance still sits."
                        : "Add a tracked send so reminders and payment follow-up have better context."
                      };
                  }
                  if (repeatMemoryStarter) {
                    return {
                      label:
                        repeatMemoryStarter.savedItemCount > 1
                          ? "Start from saved client bundle"
                          : "Start from saved memory",
                      detail:
                        repeatMemoryStarter.savedItemCount > 1
                          ? `Use the remembered client setup and ${repeatMemoryStarter.savedItemCount} saved services instead of reopening from scratch.`
                          : "Use the remembered client setup and strongest saved service instead of reopening from scratch."
                    };
                  }
                  return {
                    label: "Open draft and finish",
                    detail: "Confirm the details, save it, then add the payment link or portal before the first send so reopening later still feels organized and complete."
                  };
                })();
                const workflowStages = [
                  {
                    label: "Send",
                    value:
                      invoice.status === "deleted"
                        ? "Restore first"
                        : hasDelivery
                          ? providerDelivery
                            ? "Tracking active"
                            : "Tracking recorded"
                          : invoice.status === "draft"
                            ? "Ready after review"
                            : "Add recipient"
                  },
                  {
                    label: "Payment",
                    value:
                      invoice.status === "paid"
                        ? "Payment complete"
                        : paymentLinkReady
                          ? "Hosted link ready"
                          : invoice.status === "sent"
                            ? "Manual payment only"
                            : "Add link before send"
                  },
                  {
                    label: "Follow-up",
                    value:
                      invoice.status === "paid"
                        ? "Closed out"
                        : isPastDue
                        ? hasDelivery && !deliveryOpened
                          ? "Overdue unopened"
                          : hasDelivery && deliveryOpened
                            ? "Opened overdue"
                            : "Past due follow-up"
                          : hasDelivery
                            ? deliveryOpened
                              ? "Opened by client"
                              : "Awaiting open"
                            : "Track a send first"
                  },
                  {
                    label: "Portal",
                    value:
                      invoice.status === "deleted"
                        ? "Restore first"
                        : invoice.status === "paid"
                          ? clientPortalReady
                            ? "Share-ready record"
                            : "Optional after payment"
                        : clientPortalReady
                          ? "Review portal ready"
                          : invoice.status === "draft"
                            ? "Create after save"
                            : "Review portal missing"
                  }
                ];
                return (
                  <div
                    key={invoice.invoiceId}
                    className="nb-surface nb-surface--elevated nb-reveal-up rounded-[28px] p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        {selectionMode ? (
                          <label className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-700"
                              checked={isSelected}
                              onChange={() => toggleSelection(invoice.invoiceId)}
                            />
                            Select
                          </label>
                        ) : null}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {lifecycleLabel}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {invoice.invoiceNumber || (getInvoiceDocumentType(invoice) === "estimate" ? "Draft estimate" : "Draft invoice")}
                          </p>
                          {getInvoiceDocumentType(invoice) === "estimate" ? (
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d6f61]">
                              {estimateReviewState === "approved"
                                ? "Estimate approved"
                                : estimateReviewState === "needs_review"
                                  ? "Estimate needs review"
                                  : "Estimate"}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            Updated {formatDate(invoice.updatedAt)}
                          </p>
                          {attentionSignal ? (
                            <p className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                              {attentionSignal.label}
                            </p>
                          ) : null}
                          {dueDateLabel ? (
                            <p
                              className={`mt-1 text-xs font-semibold ${
                                isPastDue ? "text-amber-700" : "text-slate-600"
                              }`}
                            >
                              {isPastDue ? "Past due" : "Due"} {dueDateLabel}
                            </p>
                          ) : null}
                          {hasDelivery ? (
                          <p className="mt-1 text-xs text-slate-600">
                              {providerDelivery
                                ? `Sent to ${delivery.recipientEmail}`
                                : `Prepared for ${delivery.recipientEmail} (tracking only)`}
                              {deliveryOpened
                                ? ` - Opened ${deliveryOpenedAt || "recently"}`
                                : ` - Sent ${deliverySentAt || "recently"}`}
                            </p>
                          ) : null}
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {topSummaryItems.map((item) => (
                              <div
                                key={item.label}
                                className={`nb-stage-card rounded-[22px] px-3 py-3 md:px-4 md:py-4 ${item.cardClass || ""}`}
                              >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  {item.label}
                                </p>
                                <p className={`mt-2 text-sm font-semibold leading-5 ${item.toneClass}`}>
                                  {item.value}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            <span className="font-semibold text-slate-600">Next:</span> {nextActionHint}
                          </p>
                          <div className="nb-focus-panel mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Best next action
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{cardNextAction.label}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{cardNextAction.detail}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={statusClass}>
                          {formatStatusLabel(invoice.status)}
                        </span>
                        {recurringEntry ? (
                          <span className="nb-chip nb-chip--soft normal-case tracking-normal">
                            Recurring {recurringIntervalLabel}
                          </span>
                        ) : null}
                        <span className={paymentStatusView.className}>
                          {paymentStatusView.label}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{totalLabel}</span>
                      </div>
                    </div>
                    {recurringEntry ? (
                      <p className="mt-3 text-xs text-slate-600">Next due {recurringNextDue || "soon"}</p>
                    ) : null}
                    {recurringEntry && recurringSummary?.statusLabel === "Auto-send armed" ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Auto-send armed{recurringAutoSendRecipient ? ` for ${recurringAutoSendRecipient}` : ""}.
                      </p>
                    ) : null}
                    {recurringSummary?.lastAutoSendAt ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Last recurring send {formatUpdatedLabel(recurringSummary.lastAutoSendAt)}
                        {recurringSummary.lastAutoSendRecipient
                          ? ` to ${recurringSummary.lastAutoSendRecipient}`
                          : ""}.
                      </p>
                    ) : null}
                    {recurringSummary?.autoSendRunCount ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {recurringSummary.autoSendRunCount} recurring run
                        {recurringSummary.autoSendRunCount === 1 ? "" : "s"} recorded
                        {recurringSummary.lastAutoSendMode ? ` · ${recurringSummary.lastAutoSendMode}` : ""}.
                      </p>
                    ) : null}
                    {Array.isArray(recurringSummary?.runHistoryPreview) && recurringSummary.runHistoryPreview.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Recent runs</p>
                        {recurringSummary.runHistoryPreview.map((run, index) => (
                          <p key={`${invoice.invoiceId}-run-${index}`} className="text-[11px] text-slate-500">
                            {formatUpdatedLabel(run.runAt)}
                            {run.recipient ? ` · ${run.recipient}` : ""}
                            {run.mode ? ` · ${run.mode}` : ""}
                          </p>
                        ))}
                        {recurringSummary.runHistoryOverflowCount > 0 ? (
                          <p className="text-[11px] text-slate-500">
                            {recurringSummary.runHistoryOverflowCount} more run
                            {recurringSummary.runHistoryOverflowCount === 1 ? "" : "s"} recorded.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {!isDeleted && !showTrash ? (
                      <div className="nb-highlight-panel mt-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                            Send/payment workflow
                          </p>
                          <p className="text-xs text-slate-500">
                            Send, payment, and follow-up in one card.
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          {workflowStages.map((stage) => (
                            <div key={stage.label} className="nb-stage-card">
                              <p className="nb-stage-card__label">{stage.label}</p>
                              <p className="nb-stage-card__value">{stage.value}</p>
                            </div>
                          ))}
                        </div>
                        {repeatMemoryStarter ? (
                          <p className="mt-3 text-xs text-slate-600">
                            Saved memory is ready for {invoice.customerName || "this client"}.
                            {repeatMemoryStarter.leadItem
                              ? ` Start a fresh draft with ${repeatMemoryStarter.leadItem.description}.`
                              : " Start a fresh draft with the remembered client setup."}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {repeatWorkflow ? (
                      <div
                        className="nb-highlight-panel mt-4"
                        data-testid={`library-repeat-workflow-${invoice.invoiceId}`}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                            Repeat workflow
                          </p>
                          <p className="text-xs text-slate-500">
                            Keep repeat jobs deliberate and fast.
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="nb-stage-card">
                            <p className="nb-stage-card__label">Cadence</p>
                            <p className="nb-stage-card__value">{repeatWorkflow.cadenceValue}</p>
                          </div>
                          <div className="nb-stage-card">
                            <p className="nb-stage-card__label">Saved memory</p>
                            <p className="nb-stage-card__value">{repeatWorkflow.memoryValue}</p>
                          </div>
                          <div className="nb-stage-card">
                            <p className="nb-stage-card__label">Next repeat step</p>
                            <p className="nb-stage-card__value">{repeatWorkflow.nextStepValue}</p>
                          </div>
                        </div>
                        <div className="nb-mobile-actions mt-3">
                          {repeatWorkflow.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              className={action.className}
                              onClick={action.onClick}
                              disabled={action.disabled}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {visibleQuickNextActions.length > 0 ? (
                      <div className="nb-highlight-panel mt-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                            Quick next move
                          </p>
                          <p className="text-xs text-slate-500">
                            Best actions for this invoice right now.
                          </p>
                        </div>
                        <div className="nb-mobile-actions mt-3">
                          {visibleQuickNextActions.map((action) => {
                            const className =
                              action.tone === "primary"
                                ? "nb-btn-primary rounded-xl px-4 py-2"
                                : action.tone === "danger"
                                  ? "nb-btn-secondary rounded-xl border-rose-200 bg-rose-50 px-4 py-2 text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:text-rose-300"
                                  : "nb-btn-secondary rounded-xl px-4 py-2";
                            return (
                              <button
                                key={action.id}
                                type="button"
                                className={className}
                                onClick={action.onClick}
                                disabled={action.disabled}
                              >
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {!isDeleted && !showTrash ? (
                      <details
                        className="mt-4 rounded-[24px] border border-[#d5e5de] bg-white/88 px-4 py-3 shadow-sm"
                        open={showSendComposer}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                          <span>More actions</span>
                          <span className="text-xs font-medium text-slate-500">
                            Edit, send, share, recurring, and status tools
                          </span>
                        </summary>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="nb-btn-primary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:bg-[#86ab9d]"
                            onClick={() => handleOpen(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId}
                          >
                            {actionId === invoice.invoiceId ? "Opening..." : "Open"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl border-[#d5e5de] bg-[#f7faf7] px-4 py-2 text-[#17493c] hover:border-[#bcd2c8] hover:text-[#17493c] disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleOpenWithBillie(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId || isStatusBusy}
                          >
                            {actionId === invoice.invoiceId ? "Opening..." : "Open with Billie"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleInvoiceAgain(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId || isStatusBusy}
                          >
                            Invoice again
                          </button>
                          {isEstimateDocument ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-900 hover:border-emerald-300 disabled:cursor-not-allowed disabled:text-emerald-300"
                              onClick={() => void handleConvertEstimateToInvoice(invoice.invoiceId)}
                              disabled={actionId === invoice.invoiceId || isStatusBusy || isDeleting}
                            >
                              {actionId === invoice.invoiceId ? "Converting..." : "Convert to invoice"}
                            </button>
                          ) : null}
                          {isEstimateDocument ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() =>
                                void handleSetEstimateReviewState(
                                  invoice.invoiceId,
                                  estimateReviewState === "approved" ? "needs_review" : "approved"
                                )
                              }
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy || estimateReviewActionId === invoice.invoiceId}
                            >
                              {estimateReviewActionId === invoice.invoiceId
                                ? "Saving..."
                                : estimateReviewState === "approved"
                                  ? "Mark needs review"
                                  : "Mark approved"}
                            </button>
                          ) : null}
                          {repeatMemoryStarter ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl border-indigo-200 bg-indigo-50 px-4 py-2 text-indigo-900 hover:border-indigo-300 disabled:cursor-not-allowed disabled:text-indigo-300"
                              onClick={() => handleStartFromClientMemory(invoice)}
                              disabled={actionId === invoice.invoiceId || isStatusBusy}
                              aria-label={`Start from saved memory for ${invoice.invoiceNumber || "Draft invoice"}`}
                            >
                              Start from saved memory
                            </button>
                          ) : null}
                          {!isEstimateDocument ? (
                            <>
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => {
                              if (canInstantResend) {
                                void handleSendInvoice(invoice, { recipientEmail: deliveryRecipient });
                                return;
                              }
                              startSendComposer(invoice);
                            }}
                            disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            aria-label={`${hasDelivery ? "Resend invoice" : "Send invoice"} ${invoice.invoiceNumber || "Draft invoice"}`}
                          >
                            {actionId === invoice.invoiceId
                              ? "Sending..."
                              : hasDelivery
                                ? "Resend invoice"
                                : "Send invoice"}
                          </button>
                          {hasDelivery && !deliveryOpened ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleMarkDeliveryOpened(invoice.invoiceId)}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                              aria-label={`Mark opened ${invoice.invoiceNumber || "Draft invoice"}`}
                            >
                              Mark opened
                            </button>
                          ) : null}
                          {invoice.paymentLinkUrl ? (
                            <a
                              href={invoice.paymentLinkUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="nb-btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm"
                            >
                              Open hosted payment link
                            </a>
                          ) : null}
                          {clientPortalReady ? (
                            <a
                              href={clientPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="nb-btn-secondary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm"
                            >
                              Open client portal
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => void handleCreateClientPortal(invoice)}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            >
                              {actionId === invoice.invoiceId ? "Creating portal..." : "Create client portal"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => void handleCopyInvoiceSharePack(invoice)}
                            disabled={isDeleting}
                          >
                              Copy share pack
                            </button>
                            </>
                          ) : null}
                          {!isEstimateDocument && recurringEntry ? (
                            <>
                              <label className="nb-subcard inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700">
                                Cadence
                                <select
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                  value={String(normalizeRecurringInterval(recurringEntry.intervalDays))}
                                  onChange={(event) =>
                                    setRecurringSchedule(invoice.invoiceId, Number(event.target.value))
                                  }
                                  disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                                  aria-label={`Recurring cadence for ${invoice.invoiceNumber || "Draft invoice"}`}
                                >
                                  {recurringIntervalOptions.map((intervalDays) => (
                                    <option key={intervalDays} value={intervalDays}>
                                      {intervalDays === 7
                                        ? "Weekly"
                                        : intervalDays === 14
                                          ? "Biweekly"
                                          : "Monthly"}
                                    </option>
                                  ))}
                                  {!recurringIntervalOptions.includes(
                                    normalizeRecurringInterval(recurringEntry.intervalDays)
                                  ) ? (
                                    <option value={normalizeRecurringInterval(recurringEntry.intervalDays)}>
                                      {normalizeRecurringInterval(recurringEntry.intervalDays)} days
                                    </option>
                                  ) : null}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() =>
                                  setCustomRecurringSchedule(
                                    invoice.invoiceId,
                                    recurringEntry.intervalDays
                                  )
                                }
                                disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                                aria-label={`Set custom recurring cadence for ${invoice.invoiceNumber || "Draft invoice"}`}
                              >
                                Custom days
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => removeRecurringSchedule(invoice.invoiceId)}
                                disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                                aria-label={`Pause recurring for ${invoice.invoiceNumber || "Draft invoice"}`}
                              >
                                Pause recurring
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 disabled:cursor-not-allowed disabled:text-emerald-300"
                                onClick={() => toggleRecurringAutoSend(invoice.invoiceId, !recurringAutoSendEnabled)}
                                disabled={
                                  actionId === invoice.invoiceId ||
                                  isDeleting ||
                                  isStatusBusy ||
                                  !recurringAutoSendRecipient
                                }
                                aria-label={`${
                                  recurringAutoSendEnabled ? "Pause auto-send" : "Arm auto-send"
                                } for ${invoice.invoiceNumber || "Draft invoice"}`}
                              >
                                {recurringAutoSendEnabled ? "Pause auto-send" : "Arm auto-send"}
                              </button>
                              {recurringAutoSendEnabled ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                                  onClick={() => void runRecurringAutoSend(invoice)}
                                  disabled={
                                    actionId === invoice.invoiceId ||
                                    isDeleting ||
                                    isStatusBusy ||
                                    !recurringAutoSendRecipient
                                  }
                                  aria-label={`Run recurring auto-send for ${invoice.invoiceNumber || "Draft invoice"}`}
                                >
                                  Run auto-send now
                                </button>
                              ) : null}
                              {!recurringAutoSendRecipient ? (
                                <p className="text-xs text-slate-500">
                                  Auto-send needs a remembered recipient email for this client.
                                </p>
                              ) : null}
                            </>
                          ) : !isEstimateDocument ? (
                            <>
                              {rememberedRecurringInterval ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:text-emerald-300"
                                  onClick={() =>
                                    setRecurringSchedule(invoice.invoiceId, rememberedRecurringInterval, {
                                      source: "library_client_cadence_reuse"
                                    })
                                  }
                                  disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                                  aria-label={`Use ${rememberedRecurringLabel} cadence for ${invoice.invoiceNumber || "Draft invoice"}`}
                                >
                                  Use {rememberedRecurringLabel} cadence
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => setRecurringSchedule(invoice.invoiceId, 30)}
                                disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                                aria-label={`Set monthly recurring for ${invoice.invoiceNumber || "Draft invoice"}`}
                              >
                                Set monthly recurring
                              </button>
                            </>
                          ) : null}
                          {showMarkSent ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleStatusUpdate(invoice.invoiceId, "sent")}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            >
                              {invoice.status === "paid" ? "Mark sent again" : "Mark sent"}
                            </button>
                          ) : null}
                          {showMarkPaid ? (
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleStatusUpdate(invoice.invoiceId, "paid")}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            >
                              Mark paid
                            </button>
                          ) : null}
                          {showMarkDraft ? (
                            <button
                              type="button"
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => handleStatusUpdate(invoice.invoiceId, "draft")}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            >
                              Mark draft
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:text-rose-300"
                            onClick={() =>
                              requestDelete({
                                ids: [invoice.invoiceId],
                                label: invoice.invoiceNumber || "Draft invoice",
                                mode: "soft"
                              })
                            }
                            disabled={actionId === invoice.invoiceId || isDeleting}
                          >
                            Delete
                          </button>
                        </div>
                      </details>
                    ) : null}
                    {showSendComposer ? (
                      <div className="nb-surface nb-surface--muted mt-3 rounded-xl p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {sendComposerIsResend ? "Re-send recipient" : "Recipient email"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {sendComposerIntro}
                        </p>
                        <p className="mt-2 rounded-2xl border border-blue-100/80 bg-white/90 px-3 py-2 text-xs leading-5 text-blue-900 shadow-sm">
                          {sendComposerNextStep}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Use the address you want this invoice, reminder trail, and future resend history tied to.
                        </p>
                        {sendComposer?.prefilledFrom === "client_memory" ? (
                          <p className="mt-1 text-xs text-emerald-700">
                            Filled from client memory. Change it if this invoice should go somewhere else.
                          </p>
                        ) : sendComposer?.prefilledFrom === "delivery" ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Reusing the last tracked recipient for this invoice.
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="email"
                            value={sendComposer?.recipientEmail ?? ""}
                            onChange={(event) =>
                              setSendComposer((current) =>
                                current && current.invoiceId === invoice.invoiceId
                                  ? { ...current, recipientEmail: event.target.value }
                                  : current
                              )
                            }
                            className="nb-input w-full rounded-lg px-3 py-2 text-sm"
                            placeholder="client@example.com"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="nb-btn-primary rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#86ab9d]"
                              onClick={() => void submitSendComposer(invoice.invoiceId)}
                              disabled={actionId === invoice.invoiceId}
                            >
                              {actionId === invoice.invoiceId ? "Sending..." : sendComposerButtonLabel}
                            </button>
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-lg px-3 py-2 text-sm"
                              onClick={cancelSendComposer}
                              disabled={actionId === invoice.invoiceId}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            : null}
          </div>
        ) : null}
        {deleteTarget ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <p className="text-sm font-semibold text-slate-900">
                {deleteTarget.mode === "permanent" ? "Delete permanently?" : "Move to Trash?"}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {deleteTarget.mode === "permanent" ? (
                  <>
                    This will permanently remove{" "}
                    <span className="font-semibold text-slate-800">
                      {deleteTarget.label || "the selected invoices"}
                    </span>
                    . This can't be undone.
                  </>
                ) : (
                  <>
                    This will move{" "}
                    <span className="font-semibold text-slate-800">
                      {deleteTarget.label || "the selected invoices"}
                    </span>{" "}
                    to Trash. You can restore it later.
                  </>
                )}
              </p>
              {deleteTarget.mode === "soft" ? (
                <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-700"
                    checked={confirmSkipChecked}
                    onChange={(event) => setConfirmSkipChecked(event.target.checked)}
                  />
                  Don't ask me again
                </label>
              ) : null}
              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? "Deleting..."
                    : deleteTarget.mode === "permanent"
                      ? "Delete permanently"
                      : "Move to Trash"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {undoToast ? (
          <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4">
            <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-[#d5e5de] bg-[#eff7f2] px-4 py-3 text-sm text-[#17493c] shadow-lg">
              <span className="font-semibold">{undoToast.message}</span>
              <button
                type="button"
                className="rounded-xl border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c] shadow-sm transition hover:border-[#bcd2c8]"
                onClick={handleUndo}
                disabled={isDeleting}
              >
                Undo
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

  window.InvoiceLibraryFeature = {
    InvoiceLibrary
  };
})();
