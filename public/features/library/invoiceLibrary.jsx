(() => {
  const { useLocation, useNavigate } = ReactRouterDOM;
  const { useEffect, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
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

  const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;
  const { formatMoney } = formatUtils;
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
    startUpgradeCheckout,
    openBillingPortal,
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
  const recurringIntervalLabels = {
    7: "weekly",
    14: "biweekly",
    30: "monthly"
  };
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

  const normalizeRecurringInterval = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 30;
    }
    const rounded = Math.round(parsed);
    if (rounded < 1) {
      return 30;
    }
    return Math.min(rounded, 365);
  };

  const formatRecurringCadence = (intervalDays) => {
    const normalized = normalizeRecurringInterval(intervalDays);
    if (recurringIntervalLabels[normalized]) {
      return recurringIntervalLabels[normalized];
    }
    return `${normalized}-day`;
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
  const getDocumentType = (invoice) => (invoice?.documentType === "estimate" ? "estimate" : "invoice");

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
      savedItemCount: matchingItems.length,
      hasSavedDetails,
      hasSavedNotes
    };
  };

  const getRecurringAutoSendRecipient = (invoice, clientMemoryEntries = []) => {
    const rememberedRecipient =
      (Array.isArray(clientMemoryEntries) ? clientMemoryEntries : []).find(
        (entry) =>
          normalizeLookupText(entry?.name) ===
          normalizeLookupText(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "")
      )?.recipientEmail ?? "";
    const deliveryRecipient = invoice?.delivery?.recipientEmail ?? "";
    const nextRecipient = String(rememberedRecipient || deliveryRecipient).trim().toLowerCase();
    return isValidEmail(nextRecipient) ? nextRecipient : "";
  };

  const readRecurringSchedules = (storageKey) => {
    if (typeof window === "undefined") {
      return {};
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      const entries = parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {};
      return Object.entries(entries).reduce((result, [invoiceId, entry]) => {
        if (!invoiceId || !entry || typeof entry !== "object") {
          return result;
        }
        const intervalDays = normalizeRecurringInterval(entry.intervalDays);
        const nextDueAt = new Date(parseRecurringTimestamp(entry.nextDueAt)).toISOString();
        result[invoiceId] = {
          intervalDays,
          nextDueAt,
          autoSendEnabled: Boolean(entry.autoSendEnabled),
          lastAutoSendAt:
            typeof entry.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim()
              ? entry.lastAutoSendAt
              : "",
          lastAutoSendRecipient:
            typeof entry.lastAutoSendRecipient === "string" ? entry.lastAutoSendRecipient.trim().toLowerCase() : ""
        };
        return result;
      }, {});
    } catch (_error) {
      return {};
    }
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
  const [reminderAutomationBusy, setReminderAutomationBusy] = useState(false);
  const [reminderAutomationNotice, setReminderAutomationNotice] = useState("");
  const [reminderNotificationBusy, setReminderNotificationBusy] = useState(false);
  const [reminderNotificationNotice, setReminderNotificationNotice] = useState("");
  const [followUpNoteNotice, setFollowUpNoteNotice] = useState("");
  const [handoffNotice, setHandoffNotice] = useState("");
  const undoTimeoutRef = useRef(null);
  const requiresSignIn = (authRequiredByPolicy || authRequiredError) && !authSession?.userId;
  const emailLinkProvider = Array.isArray(authProviders)
    ? authProviders.find((provider) => provider?.id === "email_link")
    : null;
  const requiresSignInHint = emailLinkProvider?.available
    ? "Open launcher sign-in to send yourself an email link, then come right back here."
    : emailLinkProvider?.warning || "Open launcher sign-in to continue.";

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
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source
      })
    }).catch(() => {});
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
    await handleSendInvoice(invoice, { recipientEmail });
    const nextDueAt = new Date(
      Date.now() + normalizeRecurringInterval(recurringEntry.intervalDays) * recurringDayMs
    ).toISOString();
    persistRecurringSchedules({
      ...recurringSchedules,
      [invoice.invoiceId]: {
        ...recurringEntry,
        nextDueAt,
        autoSendEnabled: true,
        lastAutoSendAt: new Date().toISOString(),
        lastAutoSendRecipient: recipientEmail
      }
    });
    setDeliveryNotice(
      `Recurring send run for ${recipientEmail}. Next due ${formatDate(nextDueAt)}. Watch delivery before nudging again.`
    );
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
        lineItems: starter.leadItem
          ? [
              {
                id: `memory-line-${Date.now()}`,
                description: starter.leadItem.description,
                quantity: Number(starter.leadItem.qty),
                unitPrice: Number(starter.leadItem.rate),
                amount: Number(starter.leadItem.qty) * Number(starter.leadItem.rate)
              }
            ]
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
      setSendComposer((current) =>
        current && current.invoiceId === invoice.invoiceId ? null : current
      );
    } catch (sendError) {
      handleLibraryError(sendError, "Failed to send invoice.");
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
      return "Paid and closed. Reuse it for the next similar job or set a cadence.";
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
  const statusFilterOptions = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "paid", label: "Paid" }
  ];
  const emptyLibraryStates = {
    all: {
      title: "No invoices saved yet",
      body: "Start with notes or try the sample job. Saved drafts, sent invoices, and paid work will show up here."
    },
    draft: {
      title: "No draft invoices",
      body: "Drafts appear here after you save from the editor. Start from notes when you are ready to create one."
    },
    sent: {
      title: "No sent invoices",
      body: "Invoices you mark or send as sent will appear here for follow-up and payment tracking."
    },
    paid: {
      title: "No paid invoices",
      body: "Mark a sent invoice paid when payment arrives. Paid work stays available for repeat invoices."
    }
  };
  const statusCounts = invoices.reduce(
    (counts, invoice) => {
      if (invoice?.status === "draft" || invoice?.status === "sent" || invoice?.status === "paid") {
        counts[invoice.status] += 1;
      }
      return counts;
    },
    { draft: 0, sent: 0, paid: 0 }
  );
  const filteredInvoices =
    showTrash || statusFilter === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === statusFilter);
  const emptyLibraryState = emptyLibraryStates[statusFilter] ?? emptyLibraryStates.all;
  const selectedCount = selectedIds.length;
  const visibleIds = filteredInvoices.map((invoice) => invoice.invoiceId);
  const allSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planLimitReached = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const billingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
  const useStripePortalAction = accountPlan?.plan === "pro" && hasStripePortal(accountPlan);
  const showUpgradeAction =
    accountPlan?.plan === "free" && (Boolean(upgradeUrl) || useStripeUpgradeAction);
  const showBillingPortalAction =
    accountPlan?.plan === "pro" && (Boolean(billingPortalUrl) || useStripePortalAction);
  const planUsageToneClass =
    planUsage?.statusTone === "limit"
      ? "nb-usage-meter--limit"
      : planUsage?.statusTone === "warning"
        ? "nb-usage-meter--warning"
        : "";
  const sentReminderThresholdDays = 14;
  const sentReminderThresholdMs = sentReminderThresholdDays * 24 * 60 * 60 * 1000;
  const staleDraftThresholdDays = 7;
  const staleDraftThresholdMs = staleDraftThresholdDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const recurringSchedulesByInvoiceId = recurringSchedules;
  const recurringReminderInvoices = invoices
    .filter((invoice) => invoice?.status !== "deleted")
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
  const recurringMemoryStarter = nextRecurringCandidate
    ? buildClientMemoryStarterForInvoice(
        nextRecurringCandidate,
        getClientMemory(),
        getLineItemLibrary()
      )
    : null;
  const recurringMemoryLabel = recurringMemoryStarter?.leadItem?.description || "";
  const libraryGuide = (() => {
    if (showTrash || requiresSignIn) {
      return null;
    }
    if (sentWithoutTrackedDeliveryInvoice) {
      return {
        toneClass: "border-sky-200 bg-sky-50 text-sky-950",
        eyebrow: "Billie next up",
        title: `Track delivery for ${sentWithoutTrackedDeliveryInvoice.invoiceNumber || "this invoice"}`,
        body: "This invoice is already marked sent, but delivery is not being tracked yet. Run it through the send flow so reminders and payment follow-up have stronger context.",
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
        body: "Delivery is recorded, but the invoice has not been opened yet. Confirm the client saw it before you escalate into a reminder or resend.",
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
            ? "This invoice is overdue, but it still has not been opened. Re-send it or confirm delivery before escalating into a payment reminder."
            : oldestReminderHasTrackedDelivery && oldestReminderOpened
              ? "The invoice has already been opened and payment is still outstanding. Send a focused reminder now, then mark it paid if the money already arrived."
            : "Payment is still open. Send the reminder now, then mark it paid if the money already arrived."
          : oldestReminderHasTrackedDelivery && !oldestReminderOpened
            ? "Delivery is tracked, but the invoice has not been opened yet. Confirm whether the client saw it before escalating into a reminder."
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
          ? "This draft has been sitting for a while. Finishing it now is the fastest way to turn it into a send-ready invoice."
          : "Open the draft and keep moving it toward save, send, or export.",
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
          paidRepeatMemoryStarter?.leadItem?.description
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

  const handleUpgradeAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, {
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
    const followUpNoteText = buildFollowUpNoteText();
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

  const buildLibraryClientPortalUrl = (invoice) => {
    if (!invoice?.invoiceId || !invoice?.portalAccessToken) {
      return "";
    }
    return `${window.location.origin}/portal/${invoice.invoiceId}/${encodeURIComponent(invoice.portalAccessToken)}`;
  };

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
      setHandoffNotice("Share pack copied. Paste it into email or chat.");
    } catch (copyError) {
      setHandoffNotice(copyError?.message || "Could not copy the share pack.");
    }
  };

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
            <div className="mt-4 inline-flex rounded-full border border-[#6993d2]/14 bg-white/82 px-3 py-1 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#5f8fd2]">Operations Hub</p>
            </div>
            <h1 className="nb-hero-title mt-4 text-[2.5rem] md:text-[3.5rem]">Invoice Library</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Reopen saved work, follow up with confidence, and keep repeat jobs and payments moving from one calm place.
            </p>
            <p className="nb-assistant-chip nb-assistant-chip--ready mt-2 inline-flex normal-case tracking-normal text-xs">
              <span className="nb-assistant-chip__dot" aria-hidden="true" />
              Billie is ready to polish any draft when you open it.
            </p>
            <div className="nb-chip mt-2 inline-flex items-center gap-2 px-3 py-1 normal-case tracking-normal text-xs">
              <span className="font-semibold text-slate-500">Account:</span>
              <span className={authSession?.email ? "font-semibold text-blue-800" : "font-semibold text-slate-700"}>
                {authSession?.email ? authSession.email : "Local mode"}
              </span>
              <button
                type="button"
                className="font-semibold text-blue-800 hover:text-blue-900"
                onClick={() => navigate("/")}
              >
                Manage
              </button>
              <button
                type="button"
                className="font-semibold text-blue-800 hover:text-blue-900"
                onClick={() => navigate("/help")}
              >
                Help
              </button>
              {showBillingPortalAction ? (
                useStripePortalAction ? (
                  <button
                    type="button"
                    className="font-semibold text-blue-800 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-blue-400"
                    onClick={handleBillingAction}
                    disabled={billingBusy}
                  >
                    {billingBusy ? "Opening..." : "Billing"}
                  </button>
                ) : (
                  <a
                    href={billingPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-800 hover:text-blue-900"
                  >
                    Billing
                  </a>
                )
              ) : null}
            </div>
            {planSummary ? (
              <p className={`mt-2 text-xs ${planLimitReached ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                {planSummary}
              </p>
            ) : null}
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
          <div className="nb-banner nb-banner--danger mt-3">
            {billingError}
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
                className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleEnableReminderNotifications}
                disabled={reminderNotificationBusy || !canUseBrowserNotifications()}
              >
                {reminderNotificationBusy ? "Enabling..." : "Enable browser reminders"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleTestReminderNotification}
                disabled={reminderNotificationBusy || !canUseBrowserNotifications()}
              >
                {reminderNotificationBusy ? "Testing..." : "Test reminder alert"}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-800">
              {reminderNotificationSettings.enabled ? "Enabled" : "Off"}
            </span>
            {reminderNotificationNotice ? (
              <span className="rounded-full bg-white px-2 py-1 font-semibold text-blue-900">
                {reminderNotificationNotice}
              </span>
            ) : null}
          </div>
          {oldestSentReminder ? (
            <p className="mt-3 rounded-2xl border border-slate-200 bg-white/88 px-3 py-2 text-[11px] leading-5 text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-700">Preview:</span>{" "}
              {reminderNotePreviewText || buildReminderNotificationPreview()}
            </p>
          ) : null}
          {!canUseBrowserNotifications() ? (
            <p className="mt-2 text-[11px] text-slate-500">
              This browser does not support notifications.
            </p>
          ) : null}
        </div>

        {!requiresSignIn && planLimitReached ? (
          <div className="nb-banner nb-banner--warning mt-6">
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
              You can open and export existing invoices. Save more drafts by upgrading your plan.
            </p>
            {showUpgradeAction ? (
              useStripeUpgradeAction ? (
                <button
                  type="button"
                  className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleUpgradeAction}
                  disabled={billingBusy}
                >
                  {billingBusy ? "Opening..." : "Upgrade plan"}
                </button>
              ) : (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-400"
                >
                  Upgrade plan
                </a>
              )
            ) : null}
          </div>
        ) : null}
        {showDraftRecoveryReminder ? (
          <div className="nb-banner nb-banner--success mt-6">
            <p className="text-sm font-semibold text-emerald-900">Draft recovery inbox</p>
            <p className="mt-1 text-sm text-emerald-900">
              {staleDraftInvoices.length === 1
                ? "1 draft has been inactive for over a week."
                : `${staleDraftInvoices.length} drafts have been inactive for over a week.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {oldestStaleDraft ? (
                <button
                  type="button"
                  className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:text-emerald-400"
                  onClick={() => handleOpen(oldestStaleDraft.invoiceId)}
                  disabled={actionId === oldestStaleDraft.invoiceId}
                >
                  {actionId === oldestStaleDraft.invoiceId ? "Opening..." : "Resume oldest draft"}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400"
                onClick={() => {
                  setStatusFilter("draft");
                  setSelectedIds([]);
                }}
              >
                Show draft invoices
              </button>
              {oldestStaleDraft ? (
                <p className="text-xs text-emerald-800">
                  Oldest draft update: {formatDate(oldestStaleDraft.updatedAt)}
                </p>
              ) : null}
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
            {nextRecurringCandidate && recurringMemoryStarter?.leadItem ? (
              <p className="mt-2 text-xs text-indigo-800">
                Saved {recurringMemoryStarter.leadItem.description} memory is ready for{" "}
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
              <p className="mt-3 rounded-2xl border border-blue-200/70 bg-white/88 px-3 py-2 text-xs font-medium text-blue-900 shadow-sm">
                {smartFollowUpSuggestion}
              </p>
            ) : null}
            {oldestSentReminder ? (
              <p className="mt-3 rounded-2xl border border-blue-100/80 bg-white/84 px-3 py-2 text-xs leading-5 text-blue-900 shadow-sm">
                {buildFollowUpNoteText()}
              </p>
            ) : null}
            {followUpPlan ? (
              <div
                className="nb-glass-list mt-4"
                data-testid="library-follow-up-plan"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">
                    Follow-up plan
                  </p>
                  <p className="text-xs text-blue-800">{followUpPlan.summary}</p>
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
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
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
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
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
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
                  onClick={() => startSendComposer(oldestSentReminder)}
                >
                  Open send flow
                </button>
              ) : canQuickSendReminderOldest ? (
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
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
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
                  onClick={() => void handleMarkDeliveryOpened(oldestSentReminder.invoiceId)}
                  disabled={actionId === oldestSentReminder.invoiceId}
                >
                  {actionId === oldestSentReminder.invoiceId ? "Marking..." : "Mark opened"}
                </button>
              ) : null}
              {oldestSentReminder ? (
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
                  onClick={() => handleStatusUpdate(oldestSentReminder.invoiceId, "paid")}
                  disabled={statusActionId === `${oldestSentReminder.invoiceId}:paid`}
                >
                  {statusActionId === `${oldestSentReminder.invoiceId}:paid` ? "Marking..." : "Mark paid"}
                </button>
              ) : null}
              {oldestSentReminder ? (
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
                  onClick={handleCopyFollowUpNote}
                >
                  Copy reminder note
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
                onClick={handleSnoozeFollowUpReminder}
              >
                Snooze for 7 days
              </button>
              <button
                type="button"
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
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
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
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
            <p className="text-sm font-semibold text-amber-900">Sign in required to use Invoice Library</p>
            <p className="mt-1 text-sm text-amber-800">
              Your server currently requires an authenticated account for saved invoices.
            </p>
            <p className="mt-1 text-sm text-amber-800">{requiresSignInHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
                onClick={() =>
                  navigate(`/?auth=sign-in&returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`)
                }
              >
                Go to launcher sign-in
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
                I signed in, retry
              </button>
            </div>
          </div>
        ) : null}
        {libraryGuide ? (
          <section
            className={`mt-6 rounded-[28px] border px-5 py-4 ${libraryGuide.toneClass}`}
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
                    className="rounded-xl bg-blue-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-blue-300"
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
          {loading ? (
            <div className="nb-surface nb-surface--muted rounded-[28px] p-6 text-sm text-slate-500">
              Loading saved invoices...
            </div>
          ) : null}

          {!loading && filteredInvoices.length === 0 ? (
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
                  <p className="text-sm font-semibold text-slate-900">{emptyLibraryState.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{emptyLibraryState.body}</p>
                  {statusFilter === "all" ? (
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
                        onClick={() => setStatusFilter("all")}
                      >
                        Show all invoices
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {!loading && filteredInvoices.length > 0
              ? filteredInvoices.map((invoice) => {
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
                const lifecycleLabel = getInvoiceLifecycleLabel(invoice);
                const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId] ?? null;
                const isEstimateDocument = getDocumentType(invoice) === "estimate";
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
                    ? "This invoice is overdue and still unopened. Re-send it to put the invoice back in front of the client and keep delivery tracking current."
                    : isPastDue && deliveryOpened
                      ? "This invoice is overdue and already opened. Re-send only if the client needs another copy; otherwise move into a focused reminder."
                      : "Re-sending keeps delivery tracking current and lets you confirm the best recipient before the next follow-up."
                  : "Sending records this invoice as sent, updates delivery tracking, and remembers the recipient for this client.";
                const sendComposerButtonLabel = sendComposerIsResend ? "Re-send now" : "Send now";
                const sendComposerNextStep = !paymentLinkReady
                  ? sendComposerIsResend
                    ? "After the re-send, add a hosted payment link so the client has a clearer way to pay."
                    : "After tracking the send, add a hosted payment link so the invoice is easier to pay."
                  : !clientPortalReady
                    ? sendComposerIsResend
                      ? "After the re-send, create the client portal so the customer gets the full review-and-pay handoff."
                      : "After tracking the send, create the client portal so the customer gets the full review-and-pay handoff."
                    : sendComposerIsResend
                      ? isPastDue && deliveryOpened
                        ? "After the re-send, watch for payment and move into a focused reminder only if the balance still does not move."
                        : "After the re-send, watch for an open before escalating into another reminder."
                      : "After tracking the send, watch for opens and follow up only if the client needs another copy.";
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
                    ? repeatMemoryStarter.leadItem
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
                        ? "Start from memory"
                        : invoice.status === "paid"
                          ? "Invoice again"
                          : "Set cadence later";
                  const actions = [];
                  if (repeatMemoryStarter) {
                    actions.push({
                      id: "memory",
                      label: "Start from saved memory",
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
                          ? "This invoice is overdue, but it still has not been opened. Re-send it or confirm delivery before escalating into a payment reminder."
                          : "This invoice is overdue and still unopened. Re-send it, confirm delivery, and tighten the payment handoff next."
                      };
                    }
                    if (hasDelivery && deliveryOpened) {
                      return {
                        label: "Send focused reminder",
                        detail: paymentLinkReady
                          ? "The client already opened this overdue invoice. Send a direct reminder and keep the hosted payment path handy."
                          : "The client already opened this overdue invoice. Send a direct reminder, then tighten the payment handoff."
                      };
                    }
                    return {
                      label: canQuickSendReminderOldest && oldestSentReminder?.invoiceId === invoice.invoiceId
                        ? "Send reminder now"
                        : "Follow up now",
                      detail: paymentLinkReady
                        ? "The invoice is overdue. Nudge the client and keep the hosted payment path handy."
                        : "The invoice is overdue. Follow up first, then consider adding a hosted payment link."
                    };
                  }
                  if (invoice.status === "sent" && hasDelivery && !deliveryOpened) {
                    return {
                      label: "Check delivery first",
                      detail: "This invoice is tracked but still unopened. Confirm the client saw it before you escalate into a reminder."
                    };
                  }
                  if (invoice.status === "sent" && !paymentLinkReady) {
                    return {
                      label: "Open and add payment link",
                      detail: "This invoice is already out. Add a hosted payment link so the customer has a clearer, safer way to pay."
                    };
                  }
                  if (invoice.status === "sent" && !clientPortalReady) {
                    return {
                      label: "Create client portal",
                      detail: paymentLinkReady
                        ? "The payment link is ready. Add the portal so the customer also gets a clear review surface before paying."
                        : "Once the draft is sent, add a client portal so the customer can review details in one place."
                    };
                  }
                  if (invoice.status === "sent") {
                    return {
                      label: hasDelivery ? "Track payment" : "Track the send first",
                      detail: hasDelivery
                        ? "Delivery is recorded. Next step is watching for payment or sending a reminder later."
                        : "Add a tracked send so reminders and payment follow-up have better context."
                    };
                  }
                  if (repeatMemoryStarter) {
                    return {
                      label: "Start from saved memory",
                      detail: "Use the remembered client setup and strongest saved service instead of reopening from scratch."
                    };
                  }
                  return {
                    label: "Open draft and finish",
                    detail: "Confirm the details, then move into save, send, payment link, or export."
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
                            {invoice.invoiceNumber || (getDocumentType(invoice) === "estimate" ? "Draft estimate" : "Draft invoice")}
                          </p>
                          {getDocumentType(invoice) === "estimate" ? (
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6993d2]">
                              Estimate
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            Updated {formatDate(invoice.updatedAt)}
                          </p>
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
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            <span className="font-semibold text-slate-600">Next:</span> {nextActionHint}
                          </p>
                          <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 shadow-sm">
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
                    {recurringEntry && recurringAutoSendEnabled ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        Auto-send armed{recurringAutoSendRecipient ? ` for ${recurringAutoSendRecipient}` : ""}.
                      </p>
                    ) : null}
                    {recurringEntry?.lastAutoSendAt ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Last recurring send {formatUpdatedLabel(recurringEntry.lastAutoSendAt)}
                        {recurringEntry.lastAutoSendRecipient
                          ? ` to ${recurringEntry.lastAutoSendRecipient}`
                          : ""}.
                      </p>
                    ) : null}
                    {!isDeleted && !showTrash ? (
                      <div className="mt-4 rounded-[24px] border border-[#6993d2]/18 bg-[#f7faff] px-4 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                            Send/payment workflow
                          </p>
                          <p className="text-xs text-slate-500">
                            Send, payment, and follow-up in one card.
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          {workflowStages.map((stage) => (
                            <div key={stage.label} className="rounded-2xl border border-white/80 bg-white px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {stage.label}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-800">{stage.value}</p>
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
                        className="mt-4 rounded-[24px] border border-indigo-200/60 bg-indigo-50/60 px-4 py-3"
                        data-testid={`library-repeat-workflow-${invoice.invoiceId}`}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                            Repeat workflow
                          </p>
                          <p className="text-xs text-slate-500">
                            Keep repeat jobs deliberate and fast.
                          </p>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-2xl border border-white/80 bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Cadence
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-800">{repeatWorkflow.cadenceValue}</p>
                          </div>
                          <div className="rounded-2xl border border-white/80 bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Saved memory
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-800">{repeatWorkflow.memoryValue}</p>
                          </div>
                          <div className="rounded-2xl border border-white/80 bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Next repeat step
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-800">{repeatWorkflow.nextStepValue}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isDeleted || showTrash ? (
                        <>
                          <button
                            type="button"
                            className="nb-btn-primary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:bg-blue-300"
                            onClick={() => handleRestore([invoice.invoiceId])}
                            disabled={actionId === invoice.invoiceId || isDeleting}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl border-rose-200 bg-rose-50 px-4 py-2 text-rose-600 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-rose-300"
                            onClick={() =>
                              requestDelete({
                                ids: [invoice.invoiceId],
                                label: invoice.invoiceNumber || "Draft invoice",
                                mode: "permanent"
                              })
                            }
                            disabled={actionId === invoice.invoiceId || isDeleting}
                          >
                            Delete permanently
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="nb-btn-primary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:bg-blue-300"
                            onClick={() => handleOpen(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId}
                          >
                            {actionId === invoice.invoiceId ? "Opening..." : "Open"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl border-[#6993d2]/30 bg-[#f5f9ff] px-4 py-2 text-[#1d4f91] hover:border-[#6993d2]/45 hover:text-[#093064] disabled:cursor-not-allowed disabled:text-slate-300"
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
                        </>
                      )}
                    </div>
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
                              className="nb-btn-primary rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-blue-300"
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
            <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-blue-300 bg-blue-100 px-4 py-3 text-sm text-blue-900 shadow-lg">
              <span className="font-semibold">{undoToast.message}</span>
              <button
                type="button"
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
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
