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
  const deleteSkipStorageKey = "invoiceDeleteSkipConfirm";

function InvoiceLibrary() {
  const navigate = useNavigate();
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [authPolicyLoaded, setAuthPolicyLoaded] = useState(false);
  const [authRequiredByPolicy, setAuthRequiredByPolicy] = useState(false);
  const [authRequiredError, setAuthRequiredError] = useState(false);
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

  const openSavedInvoice = async (invoiceId, endpoint, method = "GET", draftOptions = {}) => {
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
      navigate("/manual");
    } catch (openError) {
      handleLibraryError(openError, "Failed to open invoice.");
    } finally {
      setActionId("");
    }
  };

  const handleOpen = (invoiceId) => openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`);
  const handleInvoiceAgain = (invoiceId) =>
    openSavedInvoice(invoiceId, `/api/invoices/${invoiceId}`, "GET", {
      freshDraft: true,
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    });

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
              className="text-sm font-semibold text-emerald-700"
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
              <span className={authSession?.email ? "font-semibold text-emerald-700" : "font-semibold text-slate-700"}>
                {authSession?.email ? authSession.email : "Local mode"}
              </span>
              <button
                type="button"
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                onClick={() => navigate("/")}
              >
                Manage
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  showTrash
                    ? "text-slate-500 hover:text-slate-700"
                    : "bg-emerald-600 text-white"
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
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
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

        {requiresSignIn ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Sign in required to use Invoice Library</p>
            <p className="mt-1 text-sm text-amber-800">
              Your server currently requires an authenticated account for saved invoices.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
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
                className="text-xs font-semibold text-emerald-700"
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
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-emerald-300"
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
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm"
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
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                          {invoice.status}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{totalLabel}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {isDeleted || showTrash ? (
                        <>
                          <button
                            type="button"
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
            <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
              <span className="font-semibold">{undoToast.message}</span>
              <button
                type="button"
                className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-400"
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
