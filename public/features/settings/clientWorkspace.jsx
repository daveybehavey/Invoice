(() => {
  const { useEffect, useMemo, useState } = React;
  const { useNavigate, useSearchParams } = ReactRouterDOM;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const intakeReadinessUtils = window.InvoiceIntakeReadiness;
  if (!intakeReadinessUtils) {
    throw new Error(
      "Missing /features/intake/readiness.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const uiPrimitives = window.InvoiceUIPrimitives;
  if (!uiPrimitives) {
    throw new Error(
      "Missing /ui/primitives.jsx load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const { getClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary } = lineItemLibraryUtils;
  const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;
  const { StatusChip } = uiPrimitives;
  const { formatMoney } = formatUtils;
  const apiFetch = requestIdentity.apiFetch ?? window.fetch.bind(window);
  const draftStorageKey = requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
  const billieWorkspaceStorageKey =
    requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";

  const normalizeName = (value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : "");
  const getInvoiceClientName = (invoice) =>
    String(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "").trim();
  const getInvoiceDocumentType = (invoice) =>
    invoice?.documentType === "estimate" || invoice?.invoiceData?.finishedInvoice?.documentType === "estimate"
      ? "estimate"
      : "invoice";
  const hasPartialPayment = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(total) && Number.isFinite(balance) && balance > 0 && balance < total;
  };
  const getInvoiceOpenBalance = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(balance) ? Math.max(balance, 0) : 0;
  };

  const formatRecurringCadence = (intervalDays) => {
    const days = Number(intervalDays);
    if (!Number.isFinite(days) || days <= 0) {
      return "";
    }
    if (days === 7) {
      return "Weekly";
    }
    if (days === 14) {
      return "Biweekly";
    }
    if (days === 30) {
      return "Monthly";
    }
    if (days === 90) {
      return "Quarterly";
    }
    return `Every ${Math.round(days)} days`;
  };

  const formatUpdatedDate = (value) => {
    const parsed = new Date(value ?? "");
    if (Number.isNaN(parsed.getTime())) {
      return "Updated recently";
    }
    return `Updated ${parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const readRecurringSchedules = (storageKey) => {
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
        result[invoiceId] = {
          intervalDays: Number(entry.intervalDays ?? 30) || 30,
          nextDueAt: typeof entry.nextDueAt === "string" ? entry.nextDueAt : "",
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

  const sumOpenBalance = (invoices) =>
    (Array.isArray(invoices) ? invoices : []).reduce((total, invoice) => {
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);

  function ClientWorkspacePage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [clientMemory, setClientMemory] = useState(() => getClientMemory());
    const [savedInvoices, setSavedInvoices] = useState([]);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let active = true;
      setLoading(true);
      apiFetch("/api/invoices")
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to load client workspace.");
          }
          const payload = await response.json();
          if (!active) {
            return;
          }
          setSavedInvoices(Array.isArray(payload?.invoices) ? payload.invoices : []);
          setClientMemory(getClientMemory());
          setError("");
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setSavedInvoices([]);
          setClientMemory(getClientMemory());
          setError("Client workspace could not load saved invoices right now.");
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }, []);

    const clientOptions = useMemo(() => {
      const remembered = getClientMemory().map((entry) => ({
        name: entry.name,
        lookupKey: normalizeName(entry.name),
        source: "memory"
      }));
      const invoiceClients = savedInvoices
        .map((invoice) => getInvoiceClientName(invoice))
        .filter(Boolean)
        .map((name) => ({
          name,
          lookupKey: normalizeName(name),
          source: "invoice"
        }));
      const merged = new Map();
      [...remembered, ...invoiceClients].forEach((entry) => {
        if (!entry.lookupKey) {
          return;
        }
        if (!merged.has(entry.lookupKey)) {
          merged.set(entry.lookupKey, entry);
        }
      });
      return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
    }, [savedInvoices]);

    const selectedClientName = useMemo(() => {
      const requested = searchParams.get("client")?.trim() ?? "";
      if (requested) {
        return requested;
      }
      return clientOptions[0]?.name ?? "";
    }, [clientOptions, searchParams]);

    useEffect(() => {
      if (!selectedClientName && clientOptions.length === 0) {
        return;
      }
      const current = searchParams.get("client")?.trim() ?? "";
      if (!current && selectedClientName) {
        const next = new URLSearchParams(searchParams);
        next.set("client", selectedClientName);
        setSearchParams(next, { replace: true });
      }
    }, [clientOptions.length, searchParams, selectedClientName, setSearchParams]);

    const selectedLookupKey = normalizeName(selectedClientName);
    const selectedMemoryEntry =
      clientMemory.find((entry) => normalizeName(entry?.name) === selectedLookupKey) ?? null;
    const clientServices = useMemo(
      () =>
        getLineItemLibrary().filter((entry) => normalizeName(entry?.clientName) === selectedLookupKey),
      [selectedLookupKey]
    );
    const clientInvoices = useMemo(
      () =>
        savedInvoices
          .filter((invoice) => normalizeName(getInvoiceClientName(invoice)) === selectedLookupKey)
          .sort((left, right) => String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""))),
      [savedInvoices, selectedLookupKey]
    );
    const latestInvoice = clientInvoices[0] ?? null;
    const recurringSchedules = useMemo(() => readRecurringSchedules(recurringStorageKey), [selectedClientName, latestInvoice, clientInvoices]);
    const recurringInvoice = useMemo(
      () => clientInvoices.find((invoice) => Boolean(recurringSchedules[invoice.invoiceId])) ?? null,
      [clientInvoices, recurringSchedules]
    );
    const recurringEntry = recurringInvoice ? recurringSchedules[recurringInvoice.invoiceId] : null;
    const recurringNextDueLabel = recurringEntry?.nextDueAt
      ? formatUpdatedDate(recurringEntry.nextDueAt)
      : "";
    const paidCount = clientInvoices.filter((invoice) => invoice?.status === "paid").length;
    const sentCount = clientInvoices.filter((invoice) => invoice?.status === "sent").length;
    const draftCount = clientInvoices.filter((invoice) => invoice?.status === "draft").length;
    const estimateCount = clientInvoices.filter((invoice) => getInvoiceDocumentType(invoice) === "estimate").length;
    const partialPaymentCount = clientInvoices.filter((invoice) => hasPartialPayment(invoice)).length;
    const openBalance = sumOpenBalance(clientInvoices.filter((invoice) => invoice?.status === "sent"));
    const leadService = clientServices[0] ?? null;
    const cadenceLabel = formatRecurringCadence(selectedMemoryEntry?.recurringIntervalDays);

    const handleSelectClient = (name) => {
      const next = new URLSearchParams(searchParams);
      next.set("client", name);
      setSearchParams(next);
      setStatus("");
    };

    const handleStartFromMemory = (memoryEntry = selectedMemoryEntry, serviceEntry = leadService) => {
      if (!memoryEntry) {
        navigate("/manual");
        return;
      }
      const draft = {
        billToDetails: memoryEntry.details || memoryEntry.name || "",
        notes: memoryEntry.defaultNotes || "",
        lineItems: serviceEntry
          ? [
              {
                id: `line-${Date.now()}`,
                description: serviceEntry.description || "",
                qty: serviceEntry.qty ?? "",
                rate: serviceEntry.rate ?? ""
              }
            ]
          : [],
        savedInvoiceId: "",
        savedInvoiceStatus: ""
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setStatus(`Started a fresh draft for ${memoryEntry.name}.`);
      navigate("/manual");
    };

    const handleOpenInvoiceWithBillie = (invoice = latestInvoice) => {
      if (!invoice?.invoiceData?.finishedInvoice) {
        return;
      }
      const finishedInvoice = invoice.invoiceData.finishedInvoice;
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: "0",
        savedInvoiceId: invoice.invoiceId ?? "",
        savedInvoiceStatus: invoice.status ?? ""
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      window.localStorage.setItem(
        billieWorkspaceStorageKey,
        "Continue from this client's latest saved invoice. Polish the wording and next steps without changing numbers."
      );
      navigate("/manual?tab=assistant&source=library");
    };

    const handleInvoiceAgain = (invoice = latestInvoice) => {
      if (!invoice?.invoiceData?.finishedInvoice) {
        navigate("/manual");
        return;
      }
      const draft = buildDraftFromFinishedInvoice(invoice.invoiceData.finishedInvoice, {
        freshDraft: true,
        savedInvoiceId: "",
        savedInvoiceStatus: ""
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      navigate("/manual");
    };

    const bestNextMove = useMemo(() => {
      if (!selectedClientName) {
        return null;
      }
      if (latestInvoice && getInvoiceDocumentType(latestInvoice) === "estimate") {
        return {
          eyebrow: "Estimate follow-through",
          title: "Reopen the estimate before turning it into billable work",
          body:
            "Keep the estimate as the planning document until the work is approved. Reopen it with Billie first, then convert it from the library when the money workflow is ready.",
          primaryLabel: "Open latest with Billie",
          onPrimary: () => handleOpenInvoiceWithBillie(latestInvoice),
          secondaryLabel: "Open library",
          onSecondary: () => navigate("/invoices")
        };
      }
      if (latestInvoice && hasPartialPayment(latestInvoice)) {
        return {
          eyebrow: "Balance still open",
          title: `Collect the remaining ${formatMoney(getInvoiceOpenBalance(latestInvoice))}`,
          body:
            "This client has already paid part of the invoice. Reopen it with Billie or jump into the library before the follow-up loses context.",
          primaryLabel: "Open latest with Billie",
          onPrimary: () => handleOpenInvoiceWithBillie(latestInvoice),
          secondaryLabel: "Open library",
          onSecondary: () => navigate("/invoices")
        };
      }
      if (latestInvoice?.status === "sent" && getInvoiceOpenBalance(latestInvoice) > 0) {
        return {
          eyebrow: "Payment follow-through",
          title: `Follow up on ${latestInvoice.invoiceNumber || "the open invoice"}`,
          body:
            "The invoice is still outstanding. Jump back into the saved draft or the library ops flow while the next step is still obvious.",
          primaryLabel: "Open latest with Billie",
          onPrimary: () => handleOpenInvoiceWithBillie(latestInvoice),
          secondaryLabel: "Open library",
          onSecondary: () => navigate("/invoices")
        };
      }
      if (selectedMemoryEntry || leadService) {
        return {
          eyebrow: "Repeat-work momentum",
          title: leadService
            ? `Start from ${leadService.description}`
            : `Start the next invoice for ${selectedClientName}`,
          body:
            "NoteBill already knows enough about this client to skip the blank page. Start from memory first, then only adjust what changed.",
          primaryLabel: selectedMemoryEntry ? "Start from memory" : "Invoice again",
          onPrimary: () =>
            selectedMemoryEntry ? handleStartFromMemory(selectedMemoryEntry, leadService) : handleInvoiceAgain(latestInvoice),
          secondaryLabel: latestInvoice ? "Open latest with Billie" : "Review memory",
          onSecondary: () => (latestInvoice ? handleOpenInvoiceWithBillie(latestInvoice) : navigate("/settings/memory"))
        };
      }
      return {
        eyebrow: "Start clean",
        title: "Use the latest saved job as the baseline",
        body:
          "There is not much remembered setup yet, so the safest next move is to reuse the latest saved work and tune it from there.",
        primaryLabel: latestInvoice ? "Invoice again" : "Start invoice",
        onPrimary: () => (latestInvoice ? handleInvoiceAgain(latestInvoice) : navigate("/manual")),
        secondaryLabel: "Review memory",
        onSecondary: () => navigate("/settings/memory")
      };
    }, [selectedClientName, latestInvoice, selectedMemoryEntry, leadService, navigate]);

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-6xl py-6 md:py-10">
          <button type="button" className="nb-btn-ghost" onClick={() => navigate("/")}>
            Back to launcher
          </button>

          <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
            <aside className="nb-surface nb-surface--muted rounded-[26px] p-4 md:rounded-[30px] md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Client workspace</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Repeat clients, minus the hunting around
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pick a client to review saved details, recent invoices, repeat services, and the fastest next move.
              </p>
              <div className="mt-5 space-y-2">
                {clientOptions.length > 0 ? (
                  clientOptions.map((client) => {
                    const isActive = normalizeName(client.name) === selectedLookupKey;
                    return (
                      <button
                        key={client.lookupKey}
                        type="button"
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isActive
                            ? "border-[#6993d2]/30 bg-[#edf5ff] shadow-[0_16px_34px_rgba(8,47,99,0.08)]"
                            : "border-white/80 bg-white/80 hover:border-[#6993d2]/16 hover:bg-white"
                        }`}
                        onClick={() => handleSelectClient(client.name)}
                      >
                        <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {client.source === "memory" ? "Remembered client" : "Seen in saved invoices"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">No clients yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Save an invoice or reuse client details once, and this workspace will start filling in.
                    </p>
                  </div>
                )}
              </div>
            </aside>

            <section className="space-y-4">
              <section className="nb-surface nb-surface--elevated rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-page">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Client home</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
                      {selectedClientName || "Choose a client"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {selectedClientName
                        ? "This is the fastest place to understand what NoteBill already knows about this client and launch the next invoice with confidence."
                        : "Choose a remembered client or a client from saved invoices to see their workspace."}
                    </p>
                  </div>
                  {selectedClientName ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate(`/settings/memory`)}>
                        Review memory
                      </button>
                      {selectedMemoryEntry ? (
                        <button type="button" className="nb-btn-primary" onClick={handleStartFromMemory}>
                          Start from memory
                        </button>
                      ) : (
                        <button type="button" className="nb-btn-primary" onClick={handleInvoiceAgain}>
                          Invoice again
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                {status ? <p className="mt-4 text-sm font-semibold text-[#093064]">{status}</p> : null}
                {error ? <p className="mt-4 text-sm font-semibold text-rose-600">{error}</p> : null}
                {loading ? <p className="mt-4 text-sm text-slate-500">Loading client context…</p> : null}
              </section>

              {selectedClientName ? (
                <>
                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["Saved invoices", clientInvoices.length],
                      ["Estimates", estimateCount],
                      ["Partial payments", partialPaymentCount],
                      ["Paid", paidCount],
                      ["Sent", sentCount],
                      ["Open balance", openBalance > 0 ? formatMoney(openBalance) : "0"]
                    ].map(([label, value]) => (
                      <div key={label} className="nb-subcard bg-white/90 p-4 text-center">
                        <p className="text-xl font-semibold text-[#093064]">{value}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          {label}
                        </p>
                      </div>
                    ))}
                  </section>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Saved context</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">What NoteBill already knows</h3>
                        </div>
                        {cadenceLabel ? <StatusChip tone="soft">{cadenceLabel}</StatusChip> : null}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Client details</p>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                            {selectedMemoryEntry?.details || selectedClientName}
                          </p>
                          <p className="mt-3 text-xs text-slate-500">
                            {selectedMemoryEntry ? formatUpdatedDate(selectedMemoryEntry.updatedAt) : "Not saved in client memory yet."}
                          </p>
                        </div>
                        <div className="space-y-3">
                          <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Send email</p>
                            <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                              {selectedMemoryEntry?.recipientEmail || "No saved recipient yet"}
                            </p>
                          </div>
                          <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Default notes</p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {selectedMemoryEntry?.defaultNotes || "No saved default notes yet"}
                            </p>
                          </div>
                          <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Recurring activity
                            </p>
                            {recurringEntry ? (
                              <div className="mt-2 space-y-1">
                                <p className="text-sm font-semibold text-slate-700">
                                  {recurringEntry.autoSendEnabled ? "Auto-send armed" : "Recurring schedule ready"}
                                </p>
                                <p className="text-xs leading-5 text-slate-600">
                                  {recurringEntry.intervalDays}-day cadence
                                  {recurringNextDueLabel ? ` · Next due ${recurringNextDueLabel}` : ""}
                                </p>
                                {recurringEntry.lastAutoSendAt ? (
                                  <p className="text-xs leading-5 text-slate-500">
                                    Last run {formatUpdatedDate(recurringEntry.lastAutoSendAt)}
                                    {recurringEntry.lastAutoSendRecipient
                                      ? ` · ${recurringEntry.lastAutoSendRecipient}`
                                      : ""}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                {selectedMemoryEntry?.recurringIntervalDays
                                  ? `${formatRecurringCadence(selectedMemoryEntry.recurringIntervalDays)} cadence is remembered for this client.`
                                  : "No recurring schedule saved yet."}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="nb-surface nb-surface--muted rounded-[26px] p-5 md:rounded-[30px] md:p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                        {bestNextMove?.eyebrow || "Best next move"}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">
                        {bestNextMove?.title || "How we'd start the next job"}
                      </h3>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-[22px] border border-white/80 bg-white/85 p-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {leadService
                              ? `Use ${leadService.description} as the starting point`
                              : "Start with client details first"}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {leadService
                              ? `Saved ${leadService.usageCount || 1} time${leadService.usageCount === 1 ? "" : "s"} for this client.`
                              : "No saved service bundle yet, so the next invoice should start from memory or the latest invoice."}
                          </p>
                        </div>
                        <div className="rounded-[22px] border border-white/80 bg-white/85 p-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {bestNextMove?.title || "Start with the most reusable client context"}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {bestNextMove?.body ||
                              "Use the client's latest saved work, memory, and Billie guidance together instead of starting from scratch."}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="nb-btn-primary w-full justify-center"
                          onClick={bestNextMove?.onPrimary}
                          data-testid="client-workspace-primary-action"
                        >
                          {bestNextMove?.primaryLabel || "Start next step"}
                        </button>
                        {bestNextMove?.secondaryLabel ? (
                          <button
                            type="button"
                            className="nb-btn-secondary w-full justify-center"
                            onClick={bestNextMove.onSecondary}
                          >
                            {bestNextMove.secondaryLabel}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-services">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Saved services</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">Repeat work building blocks</h3>
                        </div>
                        <StatusChip tone="soft">{clientServices.length} saved</StatusChip>
                      </div>
                      <div className="mt-4 space-y-3">
                        {clientServices.length > 0 ? (
                          clientServices.slice(0, 5).map((service) => (
                            <div key={service.lookupKey} className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{service.description}</p>
                                  <p className="mt-1 text-xs text-slate-500">{formatUpdatedDate(service.updatedAt)}</p>
                                </div>
                                <StatusChip tone="soft">
                                  {service.qty && service.rate ? `${service.qty} × ${formatMoney(service.rate)}` : "Saved"}
                                </StatusChip>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                            <p className="text-sm font-semibold text-slate-900">No saved services yet.</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Save or reuse a line item for this client and it will show up here for faster repeats.
                            </p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-history">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Recent invoices</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">Recent work and status</h3>
                        </div>
                        <StatusChip tone="soft">{draftCount} draft{draftCount === 1 ? "" : "s"}</StatusChip>
                      </div>
                      <div className="mt-4 space-y-3">
                        {clientInvoices.length > 0 ? (
                          clientInvoices.slice(0, 5).map((invoice) => (
                            <article key={invoice.invoiceId} className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {invoice.invoiceNumber || "Saved invoice"}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    {invoice.dueDate ? `Due ${invoice.dueDate}` : "No due date yet"} · {formatUpdatedDate(invoice.updatedAt)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {getInvoiceDocumentType(invoice) === "estimate" ? (
                                    <StatusChip tone="soft">estimate</StatusChip>
                                  ) : null}
                                  <StatusChip tone={invoice.status === "paid" ? "success" : invoice.status === "sent" ? "warning" : "soft"}>
                                    {invoice.status || "draft"}
                                  </StatusChip>
                                  <StatusChip tone="soft">
                                    {formatMoney(Number(invoice.total || invoice.invoiceData?.finishedInvoice?.total || 0))}
                                  </StatusChip>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="nb-btn-secondary"
                                  onClick={() => handleOpenInvoiceWithBillie(invoice)}
                                >
                                  Open with Billie
                                </button>
                                {getInvoiceDocumentType(invoice) === "estimate" ? (
                                  <button
                                    type="button"
                                    className="nb-btn-secondary"
                                    onClick={() => navigate("/invoices")}
                                  >
                                    Open library
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="nb-btn-secondary"
                                    onClick={() => handleInvoiceAgain(invoice)}
                                  >
                                    Invoice again
                                  </button>
                                )}
                              </div>
                            </article>
                          ))
                        ) : (
                          <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                            <p className="text-sm font-semibold text-slate-900">No saved invoices for this client yet.</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Once you save or send a job for this client, the history will show up here.
                            </p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    );
  }

  window.InvoiceClientWorkspaceFeature = { ClientWorkspacePage };
})();
