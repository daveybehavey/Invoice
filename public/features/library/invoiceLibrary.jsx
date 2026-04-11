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
    getPlanUsageModel,
    getPlanUpgradeCtaLabel
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
  const upgradeTelemetry = window.InvoiceUpgradeTelemetry;
  const deleteSkipStorageKey = "invoiceDeleteSkipConfirm";
  const followUpReminderStorageKey = "invoiceFollowUpReminder";
  const recurringScheduleStorageKey = "invoiceRecurringSchedules";
  const reminderAutomationSettingsStorageKey = "invoiceReminderAutomationSettings";
  const recurringIntervalOptions = [7, 14, 30];
  const recurringIntervalLabels = {
    7: "weekly",
    14: "biweekly",
    30: "monthly"
  };
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

  const normalizeReminderSetting = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  const toReminderToneLabel = (tone) => (tone === "firm" ? "Final reminder" : "Reminder");
  const formatBillingStageLabel = (stage) => {
    if (stage === "deposit") {
      return "Deposit";
    }
    if (stage === "progress") {
      return "Progress";
    }
    if (stage === "final") {
      return "Final";
    }
    return "Standard";
  };
  const formatLateFeeLabel = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return "";
    }
    const normalized = Math.round(parsed * 100) / 100;
    const percentLabel = Number.isInteger(normalized)
      ? String(normalized)
      : normalized.toFixed(2).replace(/\.?0+$/, "");
    return ` (${percentLabel}% late fee notice included)`;
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
  const [csvExportBusy, setCsvExportBusy] = useState(false);
  const [reminderAutomationBusy, setReminderAutomationBusy] = useState(false);
  const [reminderAutomationNotice, setReminderAutomationNotice] = useState("");
  const [reminderAutomationNoticeTone, setReminderAutomationNoticeTone] = useState("info");
  const [reminderSettingsSource, setReminderSettingsSource] = useState("local");
  const [reminderSettingsUpdatedAt, setReminderSettingsUpdatedAt] = useState("");
  const undoTimeoutRef = useRef(null);
  const reminderAutomationNoticeTimeoutRef = useRef(null);
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
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
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

  const formatRelativeTimestamp = (timestamp) => {
    if (!timestamp) {
      return "";
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const elapsedMs = Date.now() - date.getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return "";
    }
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    if (elapsedMinutes < 1) {
      return "just now";
    }
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m ago`;
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours}h ago`;
    }
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) {
      return `${elapsedDays}d ago`;
    }
    return formatDate(timestamp);
  };

  const clearReminderAutomationNoticeTimeout = () => {
    if (typeof window === "undefined") {
      return;
    }
    if (reminderAutomationNoticeTimeoutRef.current) {
      window.clearTimeout(reminderAutomationNoticeTimeoutRef.current);
      reminderAutomationNoticeTimeoutRef.current = null;
    }
  };

  const setReminderAutomationNoticeMessage = (message, tone = "info", options = {}) => {
    clearReminderAutomationNoticeTimeout();
    setReminderAutomationNotice(message);
    setReminderAutomationNoticeTone(tone);
    const autoClearMs = Number(options.autoClearMs);
    if (typeof window !== "undefined" && Number.isFinite(autoClearMs) && autoClearMs > 0) {
      reminderAutomationNoticeTimeoutRef.current = window.setTimeout(() => {
        setReminderAutomationNotice("");
        setReminderAutomationNoticeTone("info");
        reminderAutomationNoticeTimeoutRef.current = null;
      }, autoClearMs);
    }
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
  const formatDocumentTypeLabel = (value) => (value === "estimate" ? "Estimate" : "Invoice");
  const normalizeEstimateApprovalStatus = (value) =>
    value === "approved" || value === "rejected" ? value : "pending";
  const formatEstimateApprovalLabel = (value) => {
    const normalized = normalizeEstimateApprovalStatus(value);
    if (normalized === "approved") {
      return "Approved";
    }
    if (normalized === "rejected") {
      return "Rejected";
    }
    return "Pending approval";
  };
  const resolveEstimateApprovalClassName = (value) => {
    const normalized = normalizeEstimateApprovalStatus(value);
    if (normalized === "approved") {
      return "nb-chip nb-chip--success normal-case tracking-normal";
    }
    if (normalized === "rejected") {
      return "nb-chip nb-chip--danger normal-case tracking-normal";
    }
    return "nb-chip nb-chip--warning normal-case tracking-normal";
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
    clearReminderAutomationNoticeTimeout();
    setReminderAutomationNotice("");
    setReminderAutomationNoticeTone("info");
    void requestJson(
      "/api/invoices/reminders/settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized)
      },
      "Failed to save reminder automation settings."
    )
      .then((payload) => {
        setReminderSettingsSource(payload?.source === "stored" ? "stored" : "local");
        setReminderSettingsUpdatedAt(
          typeof payload?.updatedAt === "string" && payload.updatedAt.trim() ? payload.updatedAt : ""
        );
        setReminderAutomationNoticeMessage("Saved to account.", "success", { autoClearMs: 3200 });
      })
      .catch((saveError) => {
        if (saveError?.status === 403) {
          setReminderAutomationNoticeMessage(
            "Owner permission is required to save automation settings.",
            "warning"
          );
          return;
        }
        setReminderAutomationNoticeMessage("Could not save reminder settings. Using local values for now.", "warning");
      });
  };

  const setRecurringSchedule = (invoiceId, intervalDays = 30) => {
    const normalizedInterval = normalizeRecurringInterval(intervalDays);
    const nextDueAt = new Date(Date.now() + normalizedInterval * recurringDayMs).toISOString();
    persistRecurringSchedules({
      ...recurringSchedules,
      [invoiceId]: {
        intervalDays: normalizedInterval,
        nextDueAt
      }
    });
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

  const loadReminderAutomationSettings = async (shouldApply = () => true) => {
    try {
      const payload = await requestJson(
        "/api/invoices/reminders/settings",
        undefined,
        "Failed to load reminder automation settings."
      );
      if (!shouldApply()) {
        return;
      }
      const nextSettings = {
        dueAfterDays: normalizeReminderSetting(payload?.settings?.dueAfterDays, 14, 1, 120),
        cooldownDays: normalizeReminderSetting(payload?.settings?.cooldownDays, 7, 1, 60),
        maxPerRun: normalizeReminderSetting(payload?.settings?.maxPerRun, 10, 1, 100)
      };
      setReminderAutomationSettings(nextSettings);
      setReminderSettingsSource(
        payload?.source === "stored" || payload?.source === "default" ? payload.source : "local"
      );
      setReminderSettingsUpdatedAt(
        typeof payload?.updatedAt === "string" && payload.updatedAt.trim() ? payload.updatedAt : ""
      );
      if (typeof window !== "undefined") {
        window.localStorage.setItem(reminderAutomationStorageKey, JSON.stringify(nextSettings));
      }
    } catch (_error) {
      if (!shouldApply()) {
        return;
      }
      setReminderAutomationSettings(readReminderAutomationSettings(reminderAutomationStorageKey));
      setReminderSettingsSource("local");
      setReminderSettingsUpdatedAt("");
    }
  };

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReminderAutomationNoticeTimeout();
    };
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
    void loadReminderAutomationSettings(() => !cancelled);

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
    setReminderSettingsSource("local");
    setReminderSettingsUpdatedAt("");
    setReminderAutomationNotice("");
    setReminderAutomationNoticeTone("info");
    clearReminderAutomationNoticeTimeout();
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
  const handleConvertToInvoice = async (invoiceId) => {
    if (!invoiceId) {
      return;
    }
    setActionId(invoiceId);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoiceId}/convert-to-invoice`,
        {
          method: "POST"
        },
        "Failed to convert estimate."
      );
      const updatedInvoice = payload?.invoice;
      if (updatedInvoice?.invoiceId) {
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice.invoiceId === updatedInvoice.invoiceId
              ? {
                  ...invoice,
                  documentType: updatedInvoice?.invoiceData?.finishedInvoice?.documentType ?? "invoice",
                  estimateApprovalStatus:
                    updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovalStatus,
                  estimateApprovedAt: updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovedAt,
                  estimateApprovedBy: updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovedBy,
                  invoiceNumber:
                    updatedInvoice?.invoiceData?.finishedInvoice?.invoiceNumber ??
                    invoice.invoiceNumber,
                  updatedAt: updatedInvoice.updatedAt ?? invoice.updatedAt
                }
              : invoice
          )
        );
        setDeliveryNotice("Estimate converted to invoice.");
      }
      setAuthRequiredError(false);
    } catch (convertError) {
      handleLibraryError(convertError, "Failed to convert estimate.");
    } finally {
      setActionId("");
    }
  };

  const handleEstimateApprovalUpdate = async (invoiceId, status) => {
    if (!invoiceId) {
      return;
    }
    const statusActionKey = `${invoiceId}:estimate-approval:${status}`;
    setStatusActionId(statusActionKey);
    setError("");
    setDeliveryNotice("");
    try {
      const payload = await requestJson(
        `/api/invoices/${invoiceId}/estimate-approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        },
        "Failed to update estimate approval."
      );
      const updatedInvoice = payload?.invoice;
      if (updatedInvoice?.invoiceId) {
        const nextApprovalStatus =
          updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovalStatus ?? "pending";
        setInvoices((prev) =>
          prev.map((invoice) =>
            invoice.invoiceId === updatedInvoice.invoiceId
              ? {
                ...invoice,
                documentType: updatedInvoice?.invoiceData?.finishedInvoice?.documentType ?? "estimate",
                estimateApprovalStatus: nextApprovalStatus,
                estimateApprovedAt: updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovedAt,
                estimateApprovedBy: updatedInvoice?.invoiceData?.finishedInvoice?.estimateApprovedBy,
                updatedAt: updatedInvoice.updatedAt ?? invoice.updatedAt
              }
            : invoice
          )
        );
        setDeliveryNotice(`Estimate ${formatEstimateApprovalLabel(nextApprovalStatus).toLowerCase()}.`);
      }
      setAuthRequiredError(false);
    } catch (approvalError) {
      handleLibraryError(approvalError, "Failed to update estimate approval.");
    } finally {
      setStatusActionId("");
    }
  };

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
              ? {
                  ...invoice,
                  status: updatedInvoice.status ?? invoice.status,
                  updatedAt: updatedInvoice.updatedAt ?? invoice.updatedAt
                }
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
    const documentType = invoice?.documentType === "estimate" ? "estimate" : "invoice";
    const documentLabel = documentType === "estimate" ? "Estimate" : "Invoice";
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
        `Failed to send ${documentType}.`
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
        setDeliveryNotice(`${documentLabel} emailed to ${recipientEmail} (PDF attached).`);
      } else {
        setDeliveryNotice(
          payload?.warning || "Delivery was recorded. Configure an email provider to send automatically."
        );
      }
      setSendComposer((current) =>
        current && current.invoiceId === invoice.invoiceId ? null : current
      );
    } catch (sendError) {
      handleLibraryError(sendError, `Failed to send ${documentType}.`);
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
      const reminderToneLabel = toReminderToneLabel(payload?.reminder?.reminderTone);
      const lateFeeSuffix = formatLateFeeLabel(payload?.reminder?.lateFeePercentApplied);
      if (payload?.mode === "provider") {
        setDeliveryNotice(`${reminderToneLabel} emailed to ${recipient}.${lateFeeSuffix}`);
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
        return;
      }
      const sentCount = Number(payload?.sentCount ?? 0);
      const firmCount = Array.isArray(payload?.results)
        ? payload.results.filter((result) => result?.sent && result?.reminderTone === "firm").length
        : 0;
      const lateFeeCount = Array.isArray(payload?.results)
        ? payload.results.filter((result) => result?.sent && Number(result?.lateFeePercentApplied) > 0).length
        : 0;
      if (sentCount > 0) {
        setReminderAutomationNotice(
          `Sent ${sentCount} reminder${sentCount === 1 ? "" : "s"} (from ${dueCount} due)${
            firmCount > 0 ? `, including ${firmCount} final reminder${firmCount === 1 ? "" : "s"}` : ""
          }${lateFeeCount > 0 ? `, ${lateFeeCount} with late-fee notice` : ""}.`
        );
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

  const startSendComposer = (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    setSendComposer({
      invoiceId: invoice.invoiceId,
      recipientEmail: (invoice?.delivery?.recipientEmail ?? "").trim().toLowerCase()
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
  const statusFilterOptions = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "paid", label: "Paid" }
  ];
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
  const selectedCount = selectedIds.length;
  const visibleIds = filteredInvoices.map((invoice) => invoice.invoiceId);
  const allSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const teamRole =
    accountPlan?.team?.role === "helper"
      ? "helper"
      : accountPlan?.team?.role === "owner"
        ? "owner"
        : null;
  const canCreatePaymentLinksByRole = accountPlan?.team?.capabilities?.canCreatePaymentLinks !== false;
  const canMarkPaidByRole = accountPlan?.team?.capabilities?.canMarkInvoicesPaid !== false;
  const canApproveEstimatesByRole = accountPlan?.team?.capabilities?.canApproveEstimates !== false;
  const canConvertEstimatesByRole = accountPlan?.team?.capabilities?.canConvertEstimates !== false;
  const canRunReminderAutomationByRole =
    accountPlan?.team?.capabilities?.canRunReminderAutomation !== false;
  const planLimitReached = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const warningUpgradeLabel = getPlanUpgradeCtaLabel(accountPlan, {
    source: "library",
    phase: "warning"
  });
  const limitUpgradeLabel = getPlanUpgradeCtaLabel(accountPlan, {
    source: "library",
    phase: "limit"
  });
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
  const reminderAutomationNoticeClassName =
    reminderAutomationNoticeTone === "success"
      ? "text-xs font-semibold text-emerald-700"
      : reminderAutomationNoticeTone === "warning"
        ? "text-xs font-semibold text-amber-700"
        : "text-xs font-medium text-blue-900";
  const reminderSettingsMetaLabel =
    reminderSettingsSource === "stored"
      ? `Saved to account${reminderSettingsUpdatedAt ? ` · Updated ${formatDateTime(reminderSettingsUpdatedAt)} (${formatRelativeTimestamp(reminderSettingsUpdatedAt)})` : ""}`
      : reminderSettingsSource === "default"
        ? "Using account default settings."
        : "Using local fallback until account settings are saved.";
  const sentReminderThresholdDays = 14;
  const sentReminderThresholdMs = sentReminderThresholdDays * 24 * 60 * 60 * 1000;
  const staleDraftThresholdDays = 7;
  const staleDraftThresholdMs = staleDraftThresholdDays * 24 * 60 * 60 * 1000;
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
    (invoice) => invoice.nextDueMs <= Date.now()
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
      return Date.now() - updatedAtMs >= staleDraftThresholdMs;
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const oldestStaleDraft = staleDraftInvoices[0] ?? null;
  const showDraftRecoveryReminder =
    !requiresSignIn &&
    !showTrash &&
    staleDraftInvoices.length > 0;
  const sentFollowUpInvoices = invoices
    .filter((invoice) => invoice?.status === "sent")
    .filter((invoice) => {
      const updatedAtMs = Date.parse(invoice?.updatedAt ?? "");
      if (!Number.isFinite(updatedAtMs)) {
        return false;
      }
      return Date.now() - updatedAtMs >= sentReminderThresholdMs;
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const oldestSentReminder = sentFollowUpInvoices[0] ?? null;
  const recurringCandidateInvoice = oldestSentReminder;
  const oldestSentRecipient = oldestSentReminder?.delivery?.recipientEmail ?? "";
  const canQuickSendReminderOldest = Boolean(
    oldestSentReminder?.invoiceId && isValidEmail(oldestSentRecipient)
  );
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

  useEffect(() => {
    if (!upgradeTelemetry || accountPlan?.plan !== "free") {
      return;
    }
    const remainingSaves = Number.isFinite(accountPlan?.usage?.invoicesRemaining)
      ? Number(accountPlan.usage.invoicesRemaining)
      : null;
    if (planLimitReached) {
      upgradeTelemetry.trackLimitExposure({
        source: "library",
        planTier: "free",
        remainingSaves
      });
      return;
    }
    if (planWarning) {
      upgradeTelemetry.trackWarningExposure({
        source: "library",
        planTier: "free",
        remainingSaves
      });
    }
  }, [accountPlan?.plan, accountPlan?.usage?.invoicesRemaining, planLimitReached, planWarning]);

  const handleUpgradeAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, {
        source: "library",
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
      await openBillingPortal(accountPlan, { source: "library", returnPath: "/invoices" });
    } catch (billingActionError) {
      setBillingError(billingActionError?.message || "Unable to open billing settings.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleUpgradeLinkClick = () => {
    if (accountPlan?.plan !== "free") {
      return;
    }
    upgradeTelemetry?.trackUpgradeClick?.({
      source: "library",
      planTier: "free",
      remainingSaves: Number.isFinite(accountPlan?.usage?.invoicesRemaining)
        ? Number(accountPlan.usage.invoicesRemaining)
        : null
    });
  };

  const handleAccountingCsvExport = async () => {
    setCsvExportBusy(true);
    setError("");
    setDeliveryNotice("");
    try {
      const response = await apiFetch("/api/invoices/export-accounting.csv");
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const requestError = new Error(payload?.error || "Failed to download accounting CSV.");
        requestError.status = response.status;
        throw requestError;
      }
      const fileBlob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = (match?.[1] || `notebill-accounting-export-${new Date().toISOString().slice(0, 10)}.csv`).trim();
      const blobUrl = window.URL.createObjectURL(fileBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(blobUrl);
      setDeliveryNotice("Accounting CSV downloaded.");
    } catch (csvExportError) {
      handleLibraryError(csvExportError, "Failed to download accounting CSV.");
    } finally {
      setCsvExportBusy(false);
    }
  };

  const handleSnoozeFollowUpReminder = () => {
    const hiddenUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    persistFollowUpReminderState({ dismissed: false, hiddenUntil });
  };

  const handleDismissFollowUpReminder = () => {
    persistFollowUpReminderState({ dismissed: true, hiddenUntil: "" });
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
              {teamRole ? (
                <span className="font-semibold text-slate-500">
                  · {teamRole === "helper" ? "Helper" : "Owner"}
                </span>
              ) : null}
              <button
                type="button"
                className="font-semibold text-blue-800 hover:text-blue-900"
                onClick={() => navigate("/")}
              >
                Manage
              </button>
              <button
                type="button"
                className="font-semibold text-blue-800 hover:text-blue-900 disabled:cursor-not-allowed disabled:text-blue-400"
                onClick={handleAccountingCsvExport}
                disabled={csvExportBusy}
              >
                {csvExportBusy ? "Downloading..." : "Accounting CSV"}
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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-amber-700">{planWarning}</p>
                {showUpgradeAction ? (
                  useStripeUpgradeAction ? (
                    <button
                      type="button"
                      className="nb-btn-secondary rounded-full px-2 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleUpgradeAction}
                      disabled={billingBusy}
                    >
                      {billingBusy ? "Opening..." : warningUpgradeLabel}
                    </button>
                  ) : (
                    <a
                      href={upgradeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="nb-btn-secondary inline-flex rounded-full px-2 py-0.5 text-[11px]"
                      onClick={handleUpgradeLinkClick}
                    >
                      {warningUpgradeLabel}
                    </a>
                  )
                ) : null}
              </div>
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
                  {billingBusy ? "Opening..." : limitUpgradeLabel}
                </button>
              ) : (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-400"
                  onClick={handleUpgradeLinkClick}
                >
                  {limitUpgradeLabel}
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
                  {actionId === oldestStaleDraft.invoiceId ? "Opening…" : "Resume oldest draft"}
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
            <p className="text-sm font-semibold text-indigo-900">Recurring reminders</p>
            <p className="mt-1 text-sm text-indigo-900">
              {recurringDueCount > 0
                ? recurringDueCount === 1
                  ? "1 recurring invoice is due."
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
                    ? "Opening…"
                    : "Invoice again next due"}
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
            <p className="text-sm font-semibold text-blue-900">Follow-up reminders</p>
            <p className="mt-1 text-sm text-blue-900">
              {sentFollowUpInvoices.length === 1
                ? "1 sent invoice may need follow-up."
                : `${sentFollowUpInvoices.length} sent invoices may need follow-up.`}
            </p>
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
                    ? "Opening…"
                    : "Invoice again oldest"}
                </button>
              ) : null}
              {canQuickSendReminderOldest ? (
                <button
                  type="button"
                  className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 disabled:cursor-not-allowed disabled:text-blue-400"
                  onClick={() => handleSendReminder(oldestSentReminder)}
                  disabled={actionId === oldestSentReminder.invoiceId}
                >
                  {actionId === oldestSentReminder.invoiceId ? "Sending…" : "Send reminder"}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm transition hover:border-blue-400"
                onClick={handleSnoozeFollowUpReminder}
              >
                Snooze 7 days
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
                  Oldest sent update: {formatDate(oldestSentReminder.updatedAt)}
                </p>
              ) : null}
            </div>
            <div className="nb-subcard mt-3 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reminder automation
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Tune follow-up timing, then preview or run reminders without leaving the library.
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {reminderSettingsMetaLabel}
                </p>
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
                  disabled={reminderAutomationBusy || !canRunReminderAutomationByRole}
                >
                  {reminderAutomationBusy ? "Working..." : "Preview due now"}
                </button>
                <button
                  type="button"
                  className="nb-btn-secondary rounded-xl px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => runReminderAutomation({ dryRun: false })}
                  disabled={reminderAutomationBusy || !canRunReminderAutomationByRole}
                >
                  {reminderAutomationBusy ? "Working..." : "Run due reminders"}
                </button>
                {!canRunReminderAutomationByRole ? (
                  <p className="text-xs font-semibold text-amber-700">Owner permission is required to run automation.</p>
                ) : null}
                {reminderAutomationNotice ? (
                  <p className={reminderAutomationNoticeClassName}>{reminderAutomationNotice}</p>
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
              Loading saved invoices…
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
                  <p className="text-sm font-semibold text-slate-900">
                    {statusFilter === "all" ? "No saved invoices yet" : `No ${statusFilter} invoices`}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {statusFilter === "all"
                      ? "Save a draft from the editor and it will show up here."
                      : `Try another status filter or update an invoice to ${statusFilter}.`}
                  </p>
                  {statusFilter === "all" ? (
                    <button
                      type="button"
                      className="nb-btn-primary mt-4 inline-flex h-10 px-4"
                      onClick={() => navigate("/ai-intake")}
                    >
                      Create your first draft
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {!loading && filteredInvoices.length > 0
              ? filteredInvoices.map((invoice) => {
                const documentType = invoice.documentType === "estimate" ? "estimate" : "invoice";
                const documentLabel = formatDocumentTypeLabel(documentType);
                const isEstimate = documentType === "estimate";
                const billingStage =
                  invoice.billingStage === "deposit" ||
                  invoice.billingStage === "progress" ||
                  invoice.billingStage === "final"
                    ? invoice.billingStage
                    : "standard";
                const billingStageLabel = formatBillingStageLabel(billingStage);
                const projectTotal = Number(invoice.projectTotal);
                const projectPaidToDate = Number(invoice.projectPaidToDate);
                const projectBalanceAfterInvoice = Number(invoice.projectBalanceAfterInvoice);
                const attachmentCount = Number(
                  invoice.attachmentCount ??
                    invoice?.invoiceData?.finishedInvoice?.attachments?.length ??
                    0
                );
                const estimateApprovalStatus = normalizeEstimateApprovalStatus(
                  invoice.estimateApprovalStatus
                );
                const isEstimateApproved = estimateApprovalStatus === "approved";
                const estimateApprovedBy =
                  typeof invoice.estimateApprovedBy === "string" && invoice.estimateApprovedBy.trim()
                    ? invoice.estimateApprovedBy.trim()
                    : "";
                const estimateApprovedAt = formatDateTime(invoice.estimateApprovedAt);
                const estimateApprovalChipClass = resolveEstimateApprovalClassName(
                  estimateApprovalStatus
                );
                const statusClass = statusStyles[invoice.status] ?? statusStyles.draft;
                const totalLabel = Number.isFinite(invoice.total)
                  ? formatMoney(invoice.total)
                  : "—";
                const balanceDueRaw = Number(
                  invoice.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue
                );
                const balanceDue = Number.isFinite(balanceDueRaw)
                  ? Math.max(balanceDueRaw, 0)
                  : Number.isFinite(invoice.total)
                    ? Math.max(Number(invoice.total), 0)
                    : 0;
                const paymentLabel = isEstimate
                  ? `Estimated ${formatMoney(balanceDue)}`
                  : invoice.status === "paid"
                    ? "Paid in full"
                    : `${formatMoney(balanceDue)} due`;
                const paymentLabelClass =
                  isEstimate
                    ? "nb-chip nb-chip--soft normal-case tracking-normal"
                    : invoice.status === "paid"
                    ? "nb-chip nb-chip--success normal-case tracking-normal"
                    : "nb-chip nb-chip--warning normal-case tracking-normal";
                const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId] ?? null;
                const recurringIntervalLabel = recurringEntry
                  ? formatRecurringCadence(recurringEntry.intervalDays)
                  : "";
                const recurringNextDue = recurringEntry ? formatDate(recurringEntry.nextDueAt) : "";
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
                const showMarkPaid = !isEstimate && invoice.status === "sent" && canMarkPaidByRole;
                const showMarkDraft = invoice.status === "sent" || invoice.status === "paid";
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
                            {invoice.sourceType === "upload"
                              ? `Imported ${documentType}`
                              : `${documentLabel} draft`}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Draft invoice"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Updated {formatDate(invoice.updatedAt)}
                          </p>
                          {isEstimate && isEstimateApproved ? (
                            <p className="mt-1 text-xs text-slate-600">
                              Approved{estimateApprovedBy ? ` by ${estimateApprovedBy}` : ""}
                              {estimateApprovedAt ? ` · ${estimateApprovedAt}` : ""}
                            </p>
                          ) : null}
                          {billingStage !== "standard" ? (
                            <p className="mt-1 text-xs text-slate-600">
                              {billingStageLabel} billing stage
                              {Number.isFinite(projectBalanceAfterInvoice)
                                ? ` · Remaining ${formatMoney(Math.max(projectBalanceAfterInvoice, 0))}`
                                : ""}
                            </p>
                          ) : null}
                          {hasDelivery ? (
                          <p className="mt-1 text-xs text-slate-600">
                              {providerDelivery
                                ? `Sent to ${delivery.recipientEmail}`
                                : `Prepared for ${delivery.recipientEmail} (tracking only)`}
                              {deliveryOpened
                                ? ` · Opened ${deliveryOpenedAt || "recently"}`
                                : ` · Sent ${deliverySentAt || "recently"}`}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={statusClass}>
                          {formatStatusLabel(invoice.status)}
                        </span>
                        {isEstimate ? (
                          <span className={estimateApprovalChipClass}>
                            {formatEstimateApprovalLabel(estimateApprovalStatus)}
                          </span>
                        ) : null}
                        {recurringEntry ? (
                          <span className="nb-chip nb-chip--soft normal-case tracking-normal">
                            Recurring {recurringIntervalLabel}
                          </span>
                        ) : null}
                        {billingStage !== "standard" ? (
                          <span className="nb-chip nb-chip--soft normal-case tracking-normal">
                            {billingStageLabel}
                          </span>
                        ) : null}
                        {attachmentCount > 0 ? (
                          <span className="nb-chip nb-chip--soft normal-case tracking-normal">
                            {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        <span className={paymentLabelClass}>
                          {paymentLabel}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{totalLabel}</span>
                      </div>
                    </div>
                    {billingStage !== "standard" &&
                    (Number.isFinite(projectTotal) || Number.isFinite(projectPaidToDate)) ? (
                      <p className="mt-2 text-xs text-slate-600">
                        {Number.isFinite(projectTotal)
                          ? `Project ${formatMoney(projectTotal)}`
                          : "Project total not set"}
                        {Number.isFinite(projectPaidToDate)
                          ? ` · Paid to date ${formatMoney(Math.max(projectPaidToDate, 0))}`
                          : ""}
                      </p>
                    ) : null}
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
                            {actionId === invoice.invoiceId ? "Opening…" : "Open"}
                          </button>
                          {isEstimate ? (
                            <>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => handleEstimateApprovalUpdate(invoice.invoiceId, "approved")}
                                disabled={
                                  actionId === invoice.invoiceId ||
                                  isStatusBusy ||
                                  estimateApprovalStatus === "approved" ||
                                  !canApproveEstimatesByRole
                                }
                                aria-label={`Approve estimate ${invoice.invoiceNumber || "Draft estimate"}`}
                              >
                                Approve estimate
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => handleEstimateApprovalUpdate(invoice.invoiceId, "rejected")}
                                disabled={
                                  actionId === invoice.invoiceId ||
                                  isStatusBusy ||
                                  estimateApprovalStatus === "rejected" ||
                                  !canApproveEstimatesByRole
                                }
                                aria-label={`Reject estimate ${invoice.invoiceNumber || "Draft estimate"}`}
                              >
                                Reject estimate
                              </button>
                              <button
                                type="button"
                                className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => handleConvertToInvoice(invoice.invoiceId)}
                                disabled={
                                  actionId === invoice.invoiceId ||
                                  isStatusBusy ||
                                  !isEstimateApproved ||
                                  !canConvertEstimatesByRole
                                }
                                title={
                                  !canConvertEstimatesByRole
                                    ? "Owner permission is required."
                                    : isEstimateApproved
                                      ? undefined
                                      : "Approve estimate before converting."
                                }
                                aria-label={`Convert estimate ${invoice.invoiceNumber || "Draft estimate"} to invoice`}
                              >
                                Convert to invoice
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="nb-btn-secondary rounded-xl px-4 py-2 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleInvoiceAgain(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId || isStatusBusy}
                          >
                            {isEstimate ? "Estimate again" : "Invoice again"}
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
                            aria-label={`${hasDelivery ? `Resend ${documentType}` : `Send ${documentType}`} ${invoice.invoiceNumber || `Draft ${documentType}`}`}
                          >
                            {actionId === invoice.invoiceId
                              ? "Sending…"
                              : hasDelivery
                                ? `Resend ${documentType}`
                                : `Send ${documentType}`}
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
                          {!isEstimate && invoice.paymentLinkUrl ? (
                            <a
                              href={invoice.paymentLinkUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="nb-btn-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm"
                            >
                              Open pay link
                            </a>
                          ) : null}
                          {!isEstimate && !canCreatePaymentLinksByRole ? (
                            <span className="nb-chip nb-chip--warning normal-case tracking-normal text-xs">
                              Owner handles payment links
                            </span>
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
                            <button
                              type="button"
                              className="nb-btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => setRecurringSchedule(invoice.invoiceId, 30)}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                              aria-label={`Set monthly recurring for ${invoice.invoiceNumber || "Draft invoice"}`}
                            >
                              Set monthly recurring
                            </button>
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
                          {!showMarkPaid && !isEstimate && invoice.status === "sent" && !canMarkPaidByRole ? (
                            <span className="nb-chip nb-chip--warning normal-case tracking-normal text-xs">
                              Owner marks paid
                            </span>
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
                        <p className="mt-1 text-xs text-slate-500">
                          A PDF of this {documentType} will be attached automatically.
                        </p>
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
                              {actionId === invoice.invoiceId ? "Sending…" : "Send now"}
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
                    . This can’t be undone.
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
                  Don’t ask me again
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
                    ? "Deleting…"
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
