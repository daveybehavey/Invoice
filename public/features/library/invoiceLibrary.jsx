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
  const { formatPlanSummary, getPlanUpgradeUrl, getPlanBillingPortalUrl, getPlanPrelimitWarning } =
    accountPlanUtils;
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/library/invoiceLibrary.jsx."
    );
  }
  const { hasStripeCheckout, hasStripePortal, startUpgradeCheckout, openBillingPortal } = billingActions;
  const deleteSkipStorageKey = "invoiceDeleteSkipConfirm";
  const followUpReminderStorageKey = "invoiceFollowUpReminder";
  const recurringScheduleStorageKey = "invoiceRecurringSchedules";
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

function InvoiceLibrary() {
  const navigate = useNavigate();
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const reminderStorageKey =
    requestIdentity.getScopedStorageKey?.(followUpReminderStorageKey) ?? followUpReminderStorageKey;
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.(recurringScheduleStorageKey) ?? recurringScheduleStorageKey;
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [authPolicyLoaded, setAuthPolicyLoaded] = useState(false);
  const [authRequiredByPolicy, setAuthRequiredByPolicy] = useState(false);
  const [authRequiredError, setAuthRequiredError] = useState(false);
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
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

  const handleSendInvoice = async (invoice) => {
    if (!invoice?.invoiceId) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const suggestedEmail = invoice?.delivery?.recipientEmail ?? "";
    const recipientInput = window.prompt(
      "Send invoice to which email?",
      typeof suggestedEmail === "string" ? suggestedEmail : ""
    );
    if (recipientInput === null) {
      return;
    }
    const recipientEmail = recipientInput.trim().toLowerCase();
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      setError("Enter a valid recipient email.");
      return;
    }
    setActionId(invoice.invoiceId);
    setError("");
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
    } catch (sendError) {
      handleLibraryError(sendError, "Failed to send invoice.");
    } finally {
      setActionId("");
    }
  };

  const handleMarkDeliveryOpened = async (invoiceId) => {
    if (!invoiceId) {
      return;
    }
    setActionId(invoiceId);
    setError("");
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
    draft: "bg-slate-100 text-slate-700",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    deleted: "bg-rose-100 text-rose-700"
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
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              type="button"
              className="text-sm font-semibold text-blue-800"
              onClick={() => navigate("/")}
            >
              Back to launcher
            </button>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">Invoice Library</h1>
            <p className="mt-1 text-sm text-slate-600">
              Reopen saved drafts, invoice again, and export.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">
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
            {planWarning && !planLimitReached ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  showTrash
                    ? "text-slate-500 hover:text-slate-700"
                    : "bg-blue-800 text-white"
                }`}
                onClick={() => setShowTrash(false)}
              >
                All
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  showTrash
                    ? "bg-rose-600 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setShowTrash(true)}
              >
                Trash
              </button>
            </div>
            {!showTrash ? (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
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
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
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
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
              onClick={() => navigate("/ai-intake")}
            >
              New intake
            </button>
            <button
              type="button"
              className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
              onClick={() => navigate("/manual")}
            >
              Blank invoice
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {billingError ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {billingError}
          </div>
        ) : null}

        {!requiresSignIn && planLimitReached ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Free plan limit reached</p>
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
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-100 px-4 py-3">
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
          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-100 px-4 py-3">
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
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-100 px-4 py-3">
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
          </div>
        ) : null}

        {requiresSignIn ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
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
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Loading saved invoices…
            </div>
          ) : null}

          {!loading && filteredInvoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
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
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-blue-800 px-4 text-sm font-semibold text-white shadow-sm"
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
                const statusClass = statusStyles[invoice.status] ?? statusStyles.draft;
                const totalLabel = Number.isFinite(invoice.total)
                  ? formatMoney(invoice.total)
                  : "—";
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
                const isDeleted = invoice.status === "deleted";
                const isSelected = selectedIds.includes(invoice.invoiceId);
                const isStatusBusy = statusActionId.startsWith(`${invoice.invoiceId}:`);
                const showMarkSent = invoice.status === "draft" || invoice.status === "paid";
                const showMarkPaid = invoice.status === "sent";
                const showMarkDraft = invoice.status === "sent" || invoice.status === "paid";
                return (
                  <div
                    key={invoice.invoiceId}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
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
                            {invoice.sourceType === "upload" ? "Imported invoice" : "Invoice draft"}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Draft invoice"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Updated {formatDate(invoice.updatedAt)}
                          </p>
                          {hasDelivery ? (
                            <p className="mt-1 text-xs text-blue-800">
                              Sent to {delivery.recipientEmail}
                              {deliveryOpened
                                ? ` · Opened ${deliveryOpenedAt || "recently"}`
                                : ` · Sent ${deliverySentAt || "recently"}`}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                          {invoice.status}
                        </span>
                        {recurringEntry ? (
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-900">
                            Recurring {recurringIntervalLabel}
                          </span>
                        ) : null}
                        <span className="text-sm font-semibold text-slate-900">{totalLabel}</span>
                      </div>
                    </div>
                    {recurringEntry ? (
                      <p className="mt-3 text-xs text-indigo-900">Next due {recurringNextDue || "soon"}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isDeleted || showTrash ? (
                        <>
                          <button
                            type="button"
                            className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-blue-300"
                            onClick={() => handleRestore([invoice.invoiceId])}
                            disabled={actionId === invoice.invoiceId || isDeleting}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-rose-300"
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
                            className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-blue-300"
                            onClick={() => handleOpen(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId}
                          >
                            {actionId === invoice.invoiceId ? "Opening…" : "Open"}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300"
                            onClick={() => handleInvoiceAgain(invoice.invoiceId)}
                            disabled={actionId === invoice.invoiceId || isStatusBusy}
                          >
                            Invoice again
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-blue-300"
                            onClick={() => handleSendInvoice(invoice)}
                            disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            aria-label={`${hasDelivery ? "Resend invoice" : "Send invoice"} ${invoice.invoiceNumber || "Draft invoice"}`}
                          >
                            {actionId === invoice.invoiceId
                              ? "Sending…"
                              : hasDelivery
                                ? "Resend invoice"
                                : "Send invoice"}
                          </button>
                          {hasDelivery && !deliveryOpened ? (
                            <button
                              type="button"
                              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-blue-300"
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
                              className="inline-flex items-center justify-center rounded-xl border border-blue-300 bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 hover:text-blue-950"
                            >
                              Open pay link
                            </a>
                          ) : null}
                          {recurringEntry ? (
                            <>
                              <label className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                                Cadence
                                <select
                                  className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-900"
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
                                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-indigo-300"
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
                                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-indigo-300"
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
                              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-indigo-300"
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
                              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-blue-300"
                              onClick={() => handleStatusUpdate(invoice.invoiceId, "sent")}
                              disabled={actionId === invoice.invoiceId || isDeleting || isStatusBusy}
                            >
                              {invoice.status === "paid" ? "Mark sent again" : "Mark sent"}
                            </button>
                          ) : null}
                          {showMarkPaid ? (
                            <button
                              type="button"
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-emerald-300"
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
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-rose-300"
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
