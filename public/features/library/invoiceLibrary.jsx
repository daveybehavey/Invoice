(() => {
  const { useNavigate } = ReactRouterDOM;
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
    getClientRecipientEmail,
    rememberClientRecipientEmail,
    getClientRecurringInterval,
    rememberClientRecurringInterval
  } = clientMemoryUtils;
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
          nextDueAt
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
  const undoTimeoutRef = useRef(null);
  const requiresSignIn = (authRequiredByPolicy || authRequiredError) && !authSession?.userId;

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
        nextDueAt
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
        nextDueAt
      }
    });
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
      const draft = buildDraftFromFinishedInvoice(invoiceData.finishedInvoice, {
        taxRate: deriveTaxRate(invoiceData.finishedInvoice),
        savedInvoiceId: savedInvoice?.invoiceId ?? "",
        savedInvoiceStatus: savedInvoice?.status ?? "",
        ...draftOptions
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      if (typeof options?.onLoaded === "function") {
        options.onLoaded(savedInvoice);
      }
      navigate("/manual");
    } catch (openError) {
      handleLibraryError(openError, "Failed to open invoice.");
    } finally {
      setActionId("");
    }
  };

  const handleOpen = (invoiceId) => openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`);
  const handleInvoiceAgain = (invoiceId, options = {}) =>
    openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`, "GET", {
      freshDraft: true,
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    }, options);

  const handleStatusUpdate = async (invoiceId, status) => {
    const statusActionKey = `${invoiceId}:${status}`;
    setStatusActionId(statusActionKey);
    setError("");
    try {
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
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice.invoiceId === updatedInvoice.invoiceId
              ? mergeUpdatedInvoiceMetadata(invoice, updatedInvoice)
              : invoice
          )
        );
      }
    } catch (statusError) {
      handleLibraryError(statusError, "Failed to update invoice status.");
    } finally {
      setStatusActionId("");
    }
  };

  const handleSendInvoice = async (invoice, options = {}) => {
    if (!invoice?.invoiceId) {
      return;
    }
    const recipientEmail = String(options?.recipientEmail ?? "").trim().toLowerCase();
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
        setDeliveryNotice(`Invoice emailed to ${recipientEmail}.`);
      } else {
        setDeliveryNotice(
          payload?.warning || "Delivery was recorded. Configure an email provider to send automatically."
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
      if (payload?.mode === "provider") {
        setDeliveryNotice(`Reminder emailed to ${recipient}.`);
      } else {
        setDeliveryNotice(
          payload?.warning || "Reminder was recorded. Configure an email provider to send automatically."
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
      setDeliveryNotice("Marked as opened.");
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
  const getPaymentStatusView = ({ status, balanceDue, isPastDue }) => {
    const amountLabel = formatMoney(balanceDue);
    if (status === "paid") {
      return {
        label: "Paid in full",
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
        label: `Past due: ${amountLabel}`,
        className: "nb-chip nb-chip--warning normal-case tracking-normal"
      };
    }
    if (status === "sent") {
      return {
        label: `Open balance: ${amountLabel}`,
        className: "nb-chip nb-chip--info normal-case tracking-normal"
      };
    }
    return {
      label: `Draft total: ${amountLabel}`,
      className: "nb-chip nb-chip--soft normal-case tracking-normal"
    };
  };
  const getInvoiceNextActionHint = ({ invoice, hasDelivery, isPastDue }) => {
    if (invoice?.status === "deleted") {
      return "Restore to edit, export, or send again.";
    }
    if (invoice?.status === "paid") {
      return "Paid. Use Invoice again for similar work.";
    }
    if (invoice?.status === "sent" && isPastDue) {
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
  const canQuickSendReminderOldest = Boolean(
    oldestSentReminder?.invoiceId && isValidEmail(oldestSentRecipient)
  );
  const smartFollowUpSuggestion = oldestSentReminder
    ? oldestSentReminder.isPastDue
      ? "Best next step: send a reminder now."
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
      ? "If possible, please take a look and let me know if anything is blocking payment."
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
      ? "If possible, please take a look and let me know if anything is blocking payment."
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              type="button"
              className="nb-btn-ghost"
              onClick={() => navigate("/")}
            >
              Back to launcher
            </button>
            <h1 className="nb-section-title mt-3">Invoice Library</h1>
            <p className="mt-1 text-sm text-slate-600">
              Reopen saved work, follow up, and keep payments moving.
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
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="nb-surface nb-surface--muted mt-6 rounded-[26px] px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reminder notifications
              </p>
              <p className="text-sm text-slate-600">
                {reminderNotificationsSubtitle}
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
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
            <p className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-600">
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
                : nextRecurringCandidate
                  ? `Next recurring invoice is due ${formatDate(nextRecurringCandidate.recurringEntry?.nextDueAt)}.`
                  : "Recurring schedules are active."}
            </p>
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
              {nextRecurringCandidate ? (
                <p className="text-xs text-indigo-800">
                  Next due invoice: {nextRecurringCandidate.invoiceNumber || "Draft invoice"}
                </p>
              ) : null}
            </div>
            </div>
        ) : null}
        {showSentFollowUpReminder ? (
          <div className="nb-banner nb-banner--info mt-6">
            <p className="text-sm font-semibold text-blue-900">Follow-up queue</p>
            <p className="mt-1 text-sm text-blue-900">
              {sentFollowUpInvoices.length === 1
                ? oldestSentReminder?.isPastDue
                  ? "1 sent invoice is past due."
                  : "1 sent invoice is waiting on follow-up."
                : pastDueSentFollowUpCount > 0
                  ? `${sentFollowUpInvoices.length} sent invoices are waiting on follow-up (${pastDueSentFollowUpCount} past due).`
                  : `${sentFollowUpInvoices.length} sent invoices are waiting on follow-up.`}
            </p>
            {smartFollowUpSuggestion ? (
              <p className="mt-2 rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-xs font-medium text-blue-900">
                {smartFollowUpSuggestion}
              </p>
            ) : null}
            {oldestSentReminder ? (
              <p className="mt-2 rounded-xl border border-blue-100 bg-white/70 px-3 py-2 text-xs text-blue-900">
                {buildFollowUpNoteText()}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
              {canQuickSendReminderOldest ? (
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
                  onClick={() => handleSendReminder(oldestSentReminder)}
                  disabled={actionId === oldestSentReminder.invoiceId}
                >
                  {actionId === oldestSentReminder.invoiceId ? "Sending..." : "Send reminder"}
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
            <div className="nb-subcard mt-3 space-y-3">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
                onClick={() => navigate("/")}
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
                  isPastDue
                });
                const lifecycleLabel = getInvoiceLifecycleLabel(invoice);
                const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId] ?? null;
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
                const showSendComposer = sendComposer?.invoiceId === invoice.invoiceId;
                const isDeleted = invoice.status === "deleted";
                const isSelected = selectedIds.includes(invoice.invoiceId);
                const isStatusBusy = statusActionId.startsWith(`${invoice.invoiceId}:`);
                const showMarkSent = invoice.status === "draft" || invoice.status === "paid";
                const showMarkPaid = invoice.status === "sent";
                const showMarkDraft = invoice.status === "sent" || invoice.status === "paid";
                const nextActionHint = getInvoiceNextActionHint({ invoice, hasDelivery, isPastDue });
                return (
                  <div
                    key={invoice.invoiceId}
                    className="nb-surface rounded-[28px] p-5"
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
                            {invoice.invoiceNumber || "Draft invoice"}
                          </p>
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
                            className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleInvoiceAgain(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId || isStatusBusy}
                          >
                            Invoice again
                          </button>
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
                          {recurringEntry ? (
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
                            </>
                          ) : (
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
                          )}
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
                          Recipient email
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
                              {actionId === invoice.invoiceId ? "Sending..." : "Send now"}
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
