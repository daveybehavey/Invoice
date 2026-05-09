(() => {
  const { useEffect, useMemo, useState } = React;
  const { useNavigate } = ReactRouterDOM;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const uiPrimitives = window.InvoiceUIPrimitives;
  if (!uiPrimitives) {
    throw new Error(
      "Missing /ui/primitives.jsx load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const { getClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary } = lineItemLibraryUtils;
  const { formatMoney } = formatUtils;
  const { StatusChip } = uiPrimitives;
  const apiFetch = requestIdentity.apiFetch ?? window.fetch.bind(window);
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";

  const normalizeName = (value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : "");
  const recurringDayMs = 24 * 60 * 60 * 1000;
  const recurringSoonWindowMs = 7 * recurringDayMs;

  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const parseDueDate = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-").map(Number);
      return new Date(year, month - 1, day).getTime();
    }
    return parseTimestamp(text);
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
  const getInvoiceBalance = (invoice) => {
    const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
    return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  };

  function OperatorDashboardPage() {
    const navigate = useNavigate();
    const [savedInvoices, setSavedInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
      let active = true;
      setLoading(true);
      apiFetch("/api/invoices")
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to load dashboard.");
          }
          const payload = await response.json();
          if (!active) {
            return;
          }
          setSavedInvoices(Array.isArray(payload?.invoices) ? payload.invoices : []);
          setError("");
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setSavedInvoices([]);
          setError("Dashboard metrics are unavailable right now.");
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

    const clientMemory = getClientMemory();
    const savedServices = getLineItemLibrary();
    const recurringEntries = readRecurringSchedules(recurringStorageKey);
    const activeInvoices = savedInvoices.filter((invoice) => invoice && invoice.status !== "deleted");
    const estimateInvoices = activeInvoices.filter((invoice) => getInvoiceDocumentType(invoice) === "estimate");
    const sentInvoices = activeInvoices.filter((invoice) => invoice.status === "sent");
    const paidInvoices = activeInvoices.filter((invoice) => invoice.status === "paid");
    const partiallyPaidInvoices = activeInvoices.filter((invoice) => hasPartialPayment(invoice));
    const totalOpenBalance = sentInvoices.reduce((total, invoice) => {
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);
    const overdueOpenBalance = sentInvoices.reduce((total, invoice) => {
      const dueMs = parseDueDate(invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "");
      if (!Number.isFinite(dueMs) || dueMs > Date.now()) {
        return total;
      }
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);

    const urgentFollowUps = useMemo(() => {
      const nowMs = Date.now();
      return sentInvoices
        .map((invoice) => {
          const dueDate = invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "";
          const dueMs = parseDueDate(dueDate);
          return {
            invoice,
            dueDate,
            dueMs,
            isOverdue: Number.isFinite(dueMs) && dueMs <= nowMs
          };
        })
        .sort((left, right) => {
          if (left.isOverdue !== right.isOverdue) {
            return left.isOverdue ? -1 : 1;
          }
          return (left.dueMs || Number.MAX_SAFE_INTEGER) - (right.dueMs || Number.MAX_SAFE_INTEGER);
        })
        .slice(0, 4);
    }, [sentInvoices]);

    const recurringWork = useMemo(() => {
      const nowMs = Date.now();
      return activeInvoices
        .map((invoice) => {
          const entry = recurringEntries[invoice.invoiceId];
          if (!entry) {
            return null;
          }
          const nextDueMs = parseTimestamp(entry.nextDueAt);
          return {
            invoice,
            intervalDays: Number(entry.intervalDays ?? 30) || 30,
            nextDueMs,
            dueNow: Number.isFinite(nextDueMs) && nextDueMs <= nowMs,
            dueSoon:
              Number.isFinite(nextDueMs) &&
              nextDueMs > nowMs &&
              nextDueMs - nowMs <= recurringSoonWindowMs
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.nextDueMs - right.nextDueMs);
    }, [activeInvoices, recurringEntries]);

    const dueNowCount = recurringWork.filter((entry) => entry.dueNow).length;
    const dueSoonCount = recurringWork.filter((entry) => entry.dueSoon).length;
    const topEstimate = estimateInvoices[0] ?? null;
    const topPartialPayment = partiallyPaidInvoices[0] ?? null;
    const topRecurring = recurringWork[0] ?? null;

    const repeatReadyClients = useMemo(() => {
      return clientMemory
        .map((entry) => {
          const lookupKey = normalizeName(entry.name);
          const matchingServices = savedServices.filter(
            (service) => normalizeName(service?.clientName) === lookupKey
          );
          const matchingInvoices = activeInvoices.filter(
            (invoice) => normalizeName(getInvoiceClientName(invoice)) === lookupKey
          );
          return {
            entry,
            matchingServices,
            matchingInvoices,
            readinessScore:
              (entry.recipientEmail ? 1 : 0) +
              (entry.defaultNotes ? 1 : 0) +
              (entry.recurringIntervalDays ? 1 : 0) +
              (matchingServices.length > 0 ? 1 : 0)
          };
        })
        .sort((left, right) => right.readinessScore - left.readinessScore || right.matchingInvoices.length - left.matchingInvoices.length)
        .slice(0, 4);
    }, [activeInvoices, clientMemory, savedServices]);

    const bestLane = useMemo(() => {
      const topFollowUp = urgentFollowUps[0]?.invoice ?? null;
      if (topFollowUp) {
        return {
          eyebrow: "Collections lane",
          title: `Follow up on ${topFollowUp.invoiceNumber || "the oldest open invoice"}`,
          body:
            "Open balances are still the most important thing on the board. Jump into the library ops flow before this invoice gets any staler.",
          primaryLabel: "Open library",
          onPrimary: () => navigate("/invoices"),
          secondaryLabel: getInvoiceClientName(topFollowUp) ? "Open client workspace" : "",
          onSecondary: () =>
            getInvoiceClientName(topFollowUp)
              ? navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(topFollowUp))}`)
              : undefined
        };
      }
      if (topPartialPayment) {
        return {
          eyebrow: "Partial payment lane",
          title: `Close out ${topPartialPayment.invoiceNumber || "the partial invoice"}`,
          body:
            "A client has already paid part of the balance. Reopen that client workflow now so the remaining collection stays clear and low-friction.",
          primaryLabel: "Open client workspace",
          onPrimary: () =>
            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(topPartialPayment) || "")}`),
          secondaryLabel: "Open library",
          onSecondary: () => navigate("/invoices")
        };
      }
      if (topEstimate) {
        return {
          eyebrow: "Estimate lane",
          title: `Keep ${topEstimate.invoiceNumber || "the estimate"} moving`,
          body:
            "Estimates should stay visible until they either turn into work or get replaced. Reopen the client context before that planning work goes cold.",
          primaryLabel: "Open client workspace",
          onPrimary: () => navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(topEstimate) || "")}`),
          secondaryLabel: "Open library",
          onSecondary: () => navigate("/invoices")
        };
      }
      if (topRecurring) {
        return {
          eyebrow: "Recurring lane",
          title: topRecurring.dueNow ? "Recurring work is due now" : "Recurring work is coming up soon",
          body:
            "Recurring jobs are the easiest place to create operator momentum. Open the library while the cadence and saved memory are already lined up.",
          primaryLabel: "Open library",
          onPrimary: () => navigate("/invoices"),
          secondaryLabel: topRecurring.invoice ? "Open client workspace" : "",
          onSecondary: () =>
            topRecurring.invoice
              ? navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(topRecurring.invoice) || "")}`)
              : undefined
        };
      }
      const repeatReady = repeatReadyClients[0]?.entry ?? null;
      return {
        eyebrow: "Momentum lane",
        title: repeatReady ? `Start the next job for ${repeatReady.name}` : "Keep building repeat-ready clients",
        body: repeatReady
          ? "Client memory and saved services are ready. Use that leverage while it stays easy."
          : "As invoices, services, and memory fill in, this dashboard will start surfacing faster next moves here.",
        primaryLabel: repeatReady ? "Open client workspace" : "Open clients",
        onPrimary: () =>
          repeatReady
            ? navigate(`/clients?client=${encodeURIComponent(repeatReady.name)}`)
            : navigate("/clients"),
        secondaryLabel: "Open library",
        onSecondary: () => navigate("/invoices")
      };
    }, [estimateInvoices, navigate, partiallyPaidInvoices, recurringWork, repeatReadyClients, urgentFollowUps]);

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-6xl py-6 md:py-10">
          <button type="button" className="nb-btn-ghost" onClick={() => navigate("/")}>
            Back to launcher
          </button>

          <section className="nb-surface nb-surface--elevated mt-4 rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-page">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Operator dashboard</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
                  What needs attention next
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  A simple control view for open balances, repeat-work readiness, and recurring jobs that are getting close.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices")}>
                  Open library
                </button>
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/clients")}>
                  Open client workspace
                </button>
              </div>
            </div>
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading dashboard metrics…</p> : null}
            {error ? <p className="mt-4 text-sm font-semibold text-rose-600">{error}</p> : null}
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Open balance", totalOpenBalance > 0 ? formatMoney(totalOpenBalance) : "0"],
              ["Overdue balance", overdueOpenBalance > 0 ? formatMoney(overdueOpenBalance) : "0"],
              ["Partial payments", partiallyPaidInvoices.length],
              ["Recurring due now", dueNowCount],
              ["Recurring due soon", dueSoonCount],
              ["Paid invoices", paidInvoices.length],
              ["Saved estimates", estimateInvoices.length]
            ].map(([label, value]) => (
              <div key={label} className="nb-subcard bg-white/90 p-4 text-center">
                <p className="text-xl font-semibold text-[#093064]">{value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </p>
              </div>
            ))}
          </section>

          <section className="nb-surface nb-surface--muted mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-best-lane">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                  {bestLane.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  {bestLane.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{bestLane.body}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="nb-btn-primary" onClick={bestLane.onPrimary}>
                  {bestLane.primaryLabel}
                </button>
                {bestLane.secondaryLabel ? (
                  <button type="button" className="nb-btn-secondary" onClick={bestLane.onSecondary}>
                    {bestLane.secondaryLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-followups">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Urgent follow-up</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Open invoices to watch first</h2>
                </div>
                <StatusChip tone="soft">{urgentFollowUps.length} queued</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {urgentFollowUps.length > 0 ? (
                  urgentFollowUps.map(({ invoice, dueDate, isOverdue }) => (
                    <button
                      key={invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
                      onClick={() => navigate("/invoices")}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Saved invoice"} · {getInvoiceClientName(invoice) || "Client"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {dueDate ? `Due ${dueDate}` : "No due date yet"} · Balance{" "}
                            {formatMoney(Number(invoice.balanceDue || invoice.invoiceData?.finishedInvoice?.balanceDue || 0))}
                          </p>
                        </div>
                        <StatusChip tone={isOverdue ? "warning" : "soft"}>
                          {isOverdue ? "Overdue" : "Watch next"}
                        </StatusChip>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">Nothing urgent right now.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once sent invoices start stacking up, this queue will keep the most important ones near the top.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-recurring">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Recurring work</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Due now and due soon</h2>
                </div>
                <StatusChip tone="soft">{recurringWork.length} tracked</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {recurringWork.length > 0 ? (
                  recurringWork.slice(0, 4).map((entry) => (
                    <button
                      key={entry.invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
                      onClick={() => navigate("/invoices")}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {getInvoiceClientName(entry.invoice) || entry.invoice.invoiceNumber || "Recurring invoice"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {entry.intervalDays}-day cadence · Next due{" "}
                            {Number.isFinite(entry.nextDueMs)
                              ? new Date(entry.nextDueMs).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })
                              : "soon"}
                          </p>
                        </div>
                        <StatusChip tone={entry.dueNow ? "warning" : entry.dueSoon ? "soft" : "success"}>
                          {entry.dueNow ? "Due now" : entry.dueSoon ? "Due soon" : "Scheduled"}
                        </StatusChip>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No recurring schedules yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Set recurring cadence on repeat work and the dashboard will surface upcoming jobs here.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-repeat-ready">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Repeat-ready clients</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Clients closest to one-tap reuse</h2>
              </div>
              <StatusChip tone="soft">{repeatReadyClients.length} surfaced</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {repeatReadyClients.length > 0 ? (
                repeatReadyClients.map(({ entry, matchingServices, matchingInvoices, readinessScore }) => (
                  <button
                    key={entry.lookupKey}
                    type="button"
                    className="rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
                    onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.name)}`)}
                  >
                    <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.recipientEmail ? <StatusChip tone="soft">email</StatusChip> : null}
                      {entry.defaultNotes ? <StatusChip tone="soft">notes</StatusChip> : null}
                      {entry.recurringIntervalDays ? <StatusChip tone="soft">cadence</StatusChip> : null}
                      {matchingServices.length > 0 ? <StatusChip tone="success">services</StatusChip> : null}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {matchingInvoices.length} saved invoice{matchingInvoices.length === 1 ? "" : "s"} · readiness {readinessScore}/4
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No repeat-ready clients yet.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    As client memory and saved services fill in, this will point out who is easiest to invoice again.
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-estimates">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Estimate watch</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Planning work that still needs a decision</h2>
                </div>
                <StatusChip tone="soft">{estimateInvoices.length} saved</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {estimateInvoices.length > 0 ? (
                  estimateInvoices.slice(0, 3).map((invoice) => (
                    <button
                      key={invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
                      onClick={() =>
                        navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(invoice) || "")}`)
                      }
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Saved estimate"} · {getInvoiceClientName(invoice) || "Client"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {invoice.dueDate ? `Target ${invoice.dueDate}` : "No target date yet"} · {formatMoney(Number(invoice.total || invoice.invoiceData?.finishedInvoice?.total || 0))}
                          </p>
                        </div>
                        <StatusChip tone="soft">estimate</StatusChip>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No saved estimates yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once quotes start landing, this lane will keep them from going stale.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-partials">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Partial payments</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Balances that are close to closing</h2>
                </div>
                <StatusChip tone="soft">{partiallyPaidInvoices.length} open</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {partiallyPaidInvoices.length > 0 ? (
                  partiallyPaidInvoices.slice(0, 3).map((invoice) => (
                    <button
                      key={invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
                      onClick={() =>
                        navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(invoice) || "")}`)
                      }
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Saved invoice"} · {getInvoiceClientName(invoice) || "Client"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Remaining balance {formatMoney(getInvoiceBalance(invoice))}
                          </p>
                        </div>
                        <StatusChip tone="warning">partial</StatusChip>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No partial balances right now.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      When a client pays part of an invoice, this lane will keep the remaining balance visible.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  window.InvoiceOperatorDashboardFeature = { OperatorDashboardPage };
})();
