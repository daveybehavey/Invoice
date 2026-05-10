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

  const formatDateTime = (value) => {
    const parsed = parseTimestamp(value);
    if (!Number.isFinite(parsed)) {
      return "recently";
    }
    return new Date(parsed).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
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
          autoSendRunCount: Math.max(0, Number(entry.autoSendRunCount ?? 0) || 0),
          lastAutoSendAt:
            typeof entry.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim()
              ? entry.lastAutoSendAt
              : "",
          lastAutoSendRecipient:
            typeof entry.lastAutoSendRecipient === "string" ? entry.lastAutoSendRecipient.trim().toLowerCase() : "",
          lastAutoSendMode: typeof entry.lastAutoSendMode === "string" ? entry.lastAutoSendMode.trim() : ""
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
  const getEstimateReviewState = (invoice) =>
    typeof invoice?.invoiceData?.finishedInvoice?.estimateReviewState === "string"
      ? invoice.invoiceData.finishedInvoice.estimateReviewState.trim().toLowerCase()
      : typeof invoice?.estimateReviewState === "string"
        ? invoice.estimateReviewState.trim().toLowerCase()
        : "";
  const hasPartialPayment = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(total) && Number.isFinite(balance) && balance > 0 && balance < total;
  };
  const getInvoiceBalance = (invoice) => {
    const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
    return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  };
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
  const getRecurringAutoSendRecipient = (invoice, clientMemoryEntries = []) => {
    const rememberedRecipient =
      (Array.isArray(clientMemoryEntries) ? clientMemoryEntries : []).find(
        (entry) =>
          normalizeName(entry?.name) ===
          normalizeName(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "")
      )?.recipientEmail ?? "";
    const deliveryRecipient = invoice?.delivery?.recipientEmail ?? "";
    const nextRecipient = String(rememberedRecipient || deliveryRecipient).trim().toLowerCase();
    return isValidEmail(nextRecipient) ? nextRecipient : "";
  };

  function OperatorDashboardPage() {
    const navigate = useNavigate();
    const [savedInvoices, setSavedInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [estimateActionId, setEstimateActionId] = useState("");
    const [estimateNotice, setEstimateNotice] = useState("");
    const [recurringNotice, setRecurringNotice] = useState("");
    const [recurringSchedules, setRecurringSchedules] = useState(() => readRecurringSchedules(recurringStorageKey));

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

    useEffect(() => {
      setRecurringSchedules(readRecurringSchedules(recurringStorageKey));
      setRecurringNotice("");
    }, [recurringStorageKey]);

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

    const clientMemory = getClientMemory();
    const savedServices = getLineItemLibrary();
    const recurringEntries = recurringSchedules;
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
            autoSendEnabled: Boolean(entry.autoSendEnabled),
            lastAutoSendAt:
              typeof entry.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim()
                ? entry.lastAutoSendAt
                : "",
            lastAutoSendRecipient:
              typeof entry.lastAutoSendRecipient === "string"
                ? entry.lastAutoSendRecipient.trim().toLowerCase()
                : "",
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

    const recurringSendHistory = useMemo(() => {
      return recurringWork
        .filter((entry) => Boolean(entry.lastAutoSendAt))
        .sort((left, right) => parseTimestamp(right.lastAutoSendAt) - parseTimestamp(left.lastAutoSendAt))
        .slice(0, 4);
    }, [recurringWork]);

    const recentActivity = useMemo(() => {
      return activeInvoices
        .slice()
        .sort(
          (left, right) =>
            parseTimestamp(right.updatedAt ?? right.invoiceData?.finishedInvoice?.updatedAt ?? "") -
            parseTimestamp(left.updatedAt ?? left.invoiceData?.finishedInvoice?.updatedAt ?? "")
        )
        .slice(0, 4)
        .map((invoice) => {
          const documentType = getInvoiceDocumentType(invoice);
          const status = invoice?.status || "draft";
          const convertedFromEstimateAt = invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt ?? "";
          const activityLabel =
            convertedFromEstimateAt
              ? "Converted"
              : documentType === "estimate"
              ? "Estimate"
              : status === "paid"
                ? "Paid"
                : status === "sent"
                  ? "Sent"
                  : "Draft";
          return {
            invoice,
            activityLabel,
            updatedLabel: formatDateTime(invoice.updatedAt ?? invoice.invoiceData?.finishedInvoice?.updatedAt ?? ""),
            clientName: getInvoiceClientName(invoice) || "Client",
            amountLabel: formatMoney(Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0))
          };
        });
    }, [activeInvoices]);

    const dashboardMomentum = useMemo(() => {
      const nowMs = Date.now();
      const weekStartMs = nowMs - 7 * recurringDayMs;
      const priorWeekStartMs = weekStartMs - 7 * recurringDayMs;
      const recentPayments = activeInvoices.reduce(
        (result, invoice) => {
          const paymentRecords = Array.isArray(invoice?.paymentRecords)
            ? invoice.paymentRecords
            : Array.isArray(invoice?.invoiceData?.finishedInvoice?.paymentRecords)
              ? invoice.invoiceData.finishedInvoice.paymentRecords
              : [];
          paymentRecords.forEach((record) => {
            const recordedAt = parseTimestamp(record?.recordedAt);
            if (!Number.isFinite(recordedAt) || recordedAt < weekStartMs) {
              return;
            }
            result.count += 1;
            result.amount += Number(record?.amount ?? 0) || 0;
          });
          return result;
        },
        { count: 0, amount: 0 }
      );
      const estimateConversions = activeInvoices.filter(
        (invoice) => parseTimestamp(invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt) >= weekStartMs
      ).length;
      const estimateConversionsPrior = activeInvoices.filter((invoice) => {
        const convertedAt = parseTimestamp(invoice?.invoiceData?.finishedInvoice?.convertedFromEstimateAt);
        return convertedAt >= priorWeekStartMs && convertedAt < weekStartMs;
      }).length;
      const recurringRunsPrior = recurringSendHistory.filter((entry) => {
        const runAt = parseTimestamp(entry.lastAutoSendAt);
        return runAt >= priorWeekStartMs && runAt < weekStartMs;
      }).length;
      const paymentsPrior = activeInvoices.reduce(
        (result, invoice) => {
          const paymentRecords = Array.isArray(invoice?.paymentRecords)
            ? invoice.paymentRecords
            : Array.isArray(invoice?.invoiceData?.finishedInvoice?.paymentRecords)
              ? invoice.invoiceData.finishedInvoice.paymentRecords
              : [];
          paymentRecords.forEach((record) => {
            const recordedAt = parseTimestamp(record?.recordedAt);
            if (!Number.isFinite(recordedAt) || recordedAt < priorWeekStartMs || recordedAt >= weekStartMs) {
              return;
            }
            result.count += 1;
            result.amount += Number(record?.amount ?? 0) || 0;
          });
          return result;
        },
        { count: 0, amount: 0 }
      );
      const buildTrend = (current, previous) => {
        const currentValue = Number(current ?? 0);
        const previousValue = Number(previous ?? 0);
        const delta = currentValue - previousValue;
        const sign = delta > 0 ? "+" : "";
        if (delta === 0) {
          return "Flat vs last week";
        }
        return `${sign}${delta} vs last week`;
      };
      return [
        {
          label: "Invoices touched",
          value: activeInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
          detail: buildTrend(
            activeInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
            activeInvoices.filter(
              (invoice) => {
                const updatedAt = parseTimestamp(invoice?.updatedAt);
                return updatedAt >= priorWeekStartMs && updatedAt < weekStartMs;
              }
            ).length
          )
        },
        {
          label: "Sent this week",
          value: activeInvoices.filter(
            (invoice) => invoice.status === "sent" && parseTimestamp(invoice?.updatedAt) >= weekStartMs
          ).length,
          detail: buildTrend(
            activeInvoices.filter(
              (invoice) => invoice.status === "sent" && parseTimestamp(invoice?.updatedAt) >= weekStartMs
            ).length,
            activeInvoices.filter((invoice) => {
              const updatedAt = parseTimestamp(invoice?.updatedAt);
              return invoice.status === "sent" && updatedAt >= priorWeekStartMs && updatedAt < weekStartMs;
            }).length
          )
        },
        {
          label: "Paid this week",
          value: paidInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
          detail: buildTrend(
            paidInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
            paidInvoices.filter((invoice) => {
              const updatedAt = parseTimestamp(invoice?.updatedAt);
              return updatedAt >= priorWeekStartMs && updatedAt < weekStartMs;
            }).length
          )
        },
        {
          label: "Estimates active",
          value: estimateInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
          detail: buildTrend(
            estimateInvoices.filter((invoice) => parseTimestamp(invoice?.updatedAt) >= weekStartMs).length,
            estimateInvoices.filter((invoice) => {
              const updatedAt = parseTimestamp(invoice?.updatedAt);
              return updatedAt >= priorWeekStartMs && updatedAt < weekStartMs;
            }).length
          )
        },
        {
          label: "Estimate conversions",
          value: estimateConversions,
          detail: buildTrend(estimateConversions, estimateConversionsPrior)
        },
        {
          label: "Recurring sends",
          value: recurringSendHistory.filter((entry) => parseTimestamp(entry.lastAutoSendAt) >= weekStartMs).length,
          detail: buildTrend(
            recurringSendHistory.filter((entry) => parseTimestamp(entry.lastAutoSendAt) >= weekStartMs).length,
            recurringRunsPrior
          )
        },
        {
          label: "Payments recorded",
          value: recentPayments.count > 0 ? `${recentPayments.count} / ${formatMoney(recentPayments.amount)}` : "0",
          detail:
            recentPayments.count > 0
              ? buildTrend(
                  recentPayments.count,
                  paymentsPrior.count
                )
              : "No recorded payments this week"
        }
      ];
    }, [activeInvoices, estimateInvoices, paidInvoices, recurringSendHistory]);

    const toggleRecurringAutoSend = (invoiceId, enabled) => {
      const existing = recurringSchedules[invoiceId];
      if (!existing) {
        setError("Recurring schedule not found.");
        return;
      }
      const invoice = activeInvoices.find((candidate) => candidate.invoiceId === invoiceId);
      const recipientEmail = getRecurringAutoSendRecipient(invoice, clientMemory);
      if (enabled && !recipientEmail) {
        setError("Recurring auto-send needs a remembered recipient email.");
        return;
      }
      const nextSchedules = {
        ...recurringSchedules,
      [invoiceId]: {
        ...existing,
        autoSendEnabled: Boolean(enabled)
      }
    };
      setRecurringSchedules(nextSchedules);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(recurringStorageKey, JSON.stringify({ entries: nextSchedules }));
      }
      setError("");
      setRecurringNotice(
        enabled
          ? `Recurring auto-send armed for ${recipientEmail || "the remembered recipient"}.`
          : "Recurring auto-send paused for now."
      );
    };

    const handleConvertEstimateToInvoice = async (invoice) => {
      if (!invoice?.invoiceId) {
        return;
      }
      setEstimateActionId(invoice.invoiceId);
      setError("");
      setEstimateNotice("");
      try {
        const payload = await requestJson(`/api/invoices/${invoice.invoiceId}`, undefined, "Failed to load estimate.");
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
                  documentType: "invoice",
                  convertedFromEstimateAt: new Date().toISOString(),
                  sourceEstimateNumber: finishedInvoice.invoiceNumber || ""
                }
              }
            })
          },
          "Failed to convert estimate."
        );
        const updatedInvoice = savePayload?.invoice;
        if (updatedInvoice?.invoiceId) {
          setSavedInvoices((prev) =>
            prev.map((existing) =>
              existing.invoiceId === updatedInvoice.invoiceId ? { ...existing, ...updatedInvoice } : existing
            )
          );
          setEstimateNotice(
            `Converted ${updatedInvoice.invoiceNumber || "the estimate"} into a draft invoice. Next: open it, confirm payment terms, and send when ready.`
          );
        }
      } catch (convertError) {
        setError(convertError?.message || "Failed to convert estimate.");
      } finally {
        setEstimateActionId("");
      }
    };

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
          primaryLabel: estimateActionId === topEstimate.invoiceId ? "Converting..." : "Convert to invoice",
          onPrimary: () => void handleConvertEstimateToInvoice(topEstimate),
          secondaryLabel: "Open client workspace",
          onSecondary: () => navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(topEstimate) || "")}`)
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
    }, [estimateActionId, estimateInvoices, navigate, partiallyPaidInvoices, recurringWork, repeatReadyClients, urgentFollowUps]);

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
            {estimateNotice ? <p className="mt-4 text-sm font-semibold text-emerald-700">{estimateNotice}</p> : null}
            {recurringNotice ? <p className="mt-2 text-sm font-semibold text-emerald-700">{recurringNotice}</p> : null}
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

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-momentum">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Momentum snapshot</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">What moved this week</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  A quick read on the latest activity so the dashboard stays focused on momentum, not just totals.
                </p>
              </div>
              <StatusChip tone="soft">7-day window</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dashboardMomentum.map((item) => (
                <div key={item.label} className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                  <p className="text-xl font-semibold text-[#093064]">{item.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-recent-activity">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Recent activity</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">What changed lately</h2>
              </div>
              <StatusChip tone="soft">{recentActivity.length} recent</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((entry) => (
                  <div
                    key={entry.invoice.invoiceId}
                    className="rounded-[22px] border border-slate-100 bg-white/85 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.clientName}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {entry.invoice.invoiceNumber || "Saved invoice"}
                        </p>
                      </div>
                      <StatusChip tone="soft">{entry.activityLabel}</StatusChip>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {entry.updatedLabel || "Updated recently"} · {entry.amountLabel}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nb-btn-primary"
                        onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`)}
                      >
                        Open invoice
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.clientName)}`)}
                      >
                        Open client
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No recent activity yet.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    As invoices are saved, sent, paid, or converted, they will surface here.
                  </p>
                </div>
              )}
            </div>
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
                      onClick={() => navigate(`/invoices?open=${encodeURIComponent(invoice.invoiceId)}`)}
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
                    <div
                      key={entry.invoice.invoiceId}
                      className="rounded-[22px] border border-slate-100 bg-white/85 p-4"
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
                          {entry.lastAutoSendAt ? (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Last run {formatDateTime(entry.lastAutoSendAt)}
                              {entry.lastAutoSendRecipient ? ` · ${entry.lastAutoSendRecipient}` : ""}
                            </p>
                          ) : null}
                          {entry.autoSendRunCount ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {entry.autoSendRunCount} recurring run{entry.autoSendRunCount === 1 ? "" : "s"} recorded
                              {entry.lastAutoSendMode ? ` · ${entry.lastAutoSendMode}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <StatusChip tone={entry.dueNow ? "warning" : entry.dueSoon ? "soft" : "success"}>
                          {entry.autoSendEnabled ? "Auto-send armed" : entry.dueNow ? "Due now" : entry.dueSoon ? "Due soon" : "Scheduled"}
                        </StatusChip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="nb-btn-primary"
                          onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`)}
                        >
                          Open recurring invoice
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() =>
                            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(entry.invoice) || "")}`)
                          }
                        >
                          Open client workspace
                        </button>
                        {getRecurringAutoSendRecipient(entry.invoice, clientMemory) ? (
                          <button
                            type="button"
                            className="nb-btn-secondary border-emerald-200 bg-emerald-50 text-emerald-900"
                            onClick={() => toggleRecurringAutoSend(entry.invoice.invoiceId, !entry.autoSendEnabled)}
                          >
                            {entry.autoSendEnabled ? "Pause auto-send" : "Arm auto-send"}
                          </button>
                        ) : null}
                      </div>
                    </div>
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

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="operator-dashboard-recurring-history">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                    Recurring send history
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Recent recurring sends</h2>
                </div>
                <StatusChip tone="soft">{recurringSendHistory.length} recent</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {recurringSendHistory.length > 0 ? (
                  recurringSendHistory.map((entry) => (
                    <div key={entry.invoice.invoiceId} className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {getInvoiceClientName(entry.invoice) || entry.invoice.invoiceNumber || "Recurring invoice"}
                          </p>
                          {entry.autoSendRunCount ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {entry.autoSendRunCount} recurring run{entry.autoSendRunCount === 1 ? "" : "s"} recorded
                              {entry.lastAutoSendMode ? ` · ${entry.lastAutoSendMode}` : ""}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Last run {formatDateTime(entry.lastAutoSendAt)}
                            {entry.lastAutoSendRecipient ? ` · ${entry.lastAutoSendRecipient}` : ""}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Next due{" "}
                            {Number.isFinite(entry.nextDueMs)
                              ? new Date(entry.nextDueMs).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })
                              : "soon"}
                          </p>
                        </div>
                        <StatusChip tone={entry.autoSendEnabled ? "success" : "soft"}>
                          {entry.autoSendEnabled ? "Auto-send armed" : "Recurring"}
                        </StatusChip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="nb-btn-primary"
                          onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`)}
                        >
                          Open recurring invoice
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() =>
                            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(entry.invoice) || "")}`)
                          }
                        >
                          Open client workspace
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No recurring sends yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once a recurring invoice runs, the latest activity will show up here.
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
                    <div
                      key={invoice.invoiceId}
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#6993d2]/18"
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
                        <StatusChip
                          tone={
                            getEstimateReviewState(invoice) === "approved"
                              ? "success"
                              : getEstimateReviewState(invoice) === "needs_review"
                                ? "warning"
                                : "soft"
                          }
                        >
                          {getEstimateReviewState(invoice) === "approved"
                            ? "approved estimate"
                            : getEstimateReviewState(invoice) === "needs_review"
                              ? "needs review"
                              : "estimate"}
                        </StatusChip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="nb-btn-primary"
                          onClick={() => void handleConvertEstimateToInvoice(invoice)}
                          disabled={estimateActionId === invoice.invoiceId}
                        >
                          {estimateActionId === invoice.invoiceId ? "Converting..." : "Convert to invoice"}
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() =>
                            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(invoice) || "")}`)
                          }
                        >
                          Open client workspace
                        </button>
                      </div>
                    </div>
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
