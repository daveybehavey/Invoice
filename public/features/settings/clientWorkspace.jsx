(() => {
  const { useEffect, useMemo, useRef, useState } = React;
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

  const recurringUtils = window.InvoiceRecurringUtils;
  if (!recurringUtils) {
    throw new Error(
      "Missing /utils/recurring.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const paymentProgressUtils = window.InvoicePaymentProgressUtils;
  if (!paymentProgressUtils) {
    throw new Error(
      "Missing /utils/paymentProgress.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }
  const estimateWorkflowUtils = window.InvoiceEstimateWorkflowUtils;
  if (!estimateWorkflowUtils) {
    throw new Error(
      "Missing /utils/estimateWorkflow.js load. Ensure it is loaded before /features/settings/clientWorkspace.jsx."
    );
  }

  const { getClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary } = lineItemLibraryUtils;
  const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;
  const { StatusChip } = uiPrimitives;
  const { formatMoney } = formatUtils;
  const {
    formatRecurringCadence: formatRecurringCadenceShared,
    readRecurringSchedules: readRecurringSchedulesShared,
    getRecurringAutoSendRecipient: getRecurringAutoSendRecipientShared,
    buildRecurringScheduleSummary,
    buildRecurringNextStepLabel
  } = recurringUtils;
  const { buildPaymentProgressSummary, getInvoicePaymentRecords, getInvoiceLatestPayment, getInvoiceOpenBalance, hasPartialPayment } =
    paymentProgressUtils;
  const { buildEstimateWorkflowSummary, getInvoiceDocumentType, getEstimateReviewState } = estimateWorkflowUtils;
  const apiFetch = requestIdentity.apiFetch ?? window.fetch.bind(window);
  const draftStorageKey = requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
  const billieWorkspaceStorageKey =
    requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";
  const statementActivityStorageKey =
    requestIdentity.getScopedStorageKey?.("clientStatementActivity") ?? "clientStatementActivity";

  const normalizeName = (value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : "");
  const getInvoiceClientName = (invoice) =>
    String(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "").trim();
  const getInvoiceAmountPaid = (invoice) => {
    const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
    const balance = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? total);
    return Number.isFinite(total) && Number.isFinite(balance) ? Math.max(total - balance, 0) : 0;
  };
  const formatRecurringCadence = (intervalDays) => {
    return formatRecurringCadenceShared(intervalDays, { titleCase: true });
  };

  const formatUpdatedDate = (value) => {
    const parsed = new Date(value ?? "");
    if (Number.isNaN(parsed.getTime())) {
      return "Updated recently";
    }
    return `Updated ${parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  };
  const formatCalendarDate = (value) => {
    const parsed = new Date(value ?? "");
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const readRecurringSchedules = (storageKey) => {
    return readRecurringSchedulesShared(storageKey);
  };

  const sumOpenBalance = (invoices) =>
    (Array.isArray(invoices) ? invoices : []).reduce((total, invoice) => {
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
  const getRecurringAutoSendRecipient = (invoice, clientMemoryEntries = []) => {
    return getRecurringAutoSendRecipientShared(invoice, clientMemoryEntries);
  };
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const nowIso = () => new Date().toISOString();
  const readStatementActivityMap = (storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  };
  const writeStatementActivityMap = (storageKey, value) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (_error) {
      // Ignore storage failures so the client workspace stays usable.
    }
  };
  const buildStatementActivityClientKey = (clientName) => normalizeName(clientName);
  const buildStatementActivityEntry = (type, detail = "") => ({
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    detail,
    recordedAt: nowIso()
  });
  const mergeStatementActivities = (remoteEntries = [], localEntries = []) => {
    const merged = new Map();
    [...(Array.isArray(remoteEntries) ? remoteEntries : []), ...(Array.isArray(localEntries) ? localEntries : [])].forEach(
      (entry) => {
        if (!entry?.id) {
          return;
        }
        merged.set(entry.id, entry);
      }
    );
    return Array.from(merged.values()).sort((left, right) => String(right.recordedAt ?? "").localeCompare(String(left.recordedAt ?? "")));
  };
  const formatRelativeActivityTime = (value) => {
    const parsed = Date.parse(value ?? "");
    if (!Number.isFinite(parsed)) {
      return "just now";
    }
    const elapsedMs = Math.max(Date.now() - parsed, 0);
    const elapsedMinutes = Math.round(elapsedMs / 60000);
    if (elapsedMinutes < 1) {
      return "just now";
    }
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
    }
    const elapsedHours = Math.round(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
    }
    const elapsedDays = Math.round(elapsedHours / 24);
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  };

  function ClientWorkspacePage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [clientMemory, setClientMemory] = useState(() => getClientMemory());
    const [savedInvoices, setSavedInvoices] = useState([]);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [estimateActionId, setEstimateActionId] = useState("");
    const [recurringNotice, setRecurringNotice] = useState("");
    const [recurringSchedules, setRecurringSchedules] = useState(() => readRecurringSchedules(recurringStorageKey));
    const [statementSendBusy, setStatementSendBusy] = useState(false);
    const [statementPdfBusy, setStatementPdfBusy] = useState(false);
    const [statementActivityMap, setStatementActivityMap] = useState({});
    const [statementFollowUpPreset, setStatementFollowUpPreset] = useState("gentle");
    const statementSectionRef = useRef(null);

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

    useEffect(() => {
      setRecurringSchedules(readRecurringSchedules(recurringStorageKey));
      setRecurringNotice("");
    }, [recurringStorageKey]);

    const pushStatementActivity = async (clientName, action, detail = "", recipientEmail = "") => {
      const clientKey = buildStatementActivityClientKey(clientName);
      if (!clientKey) {
        return null;
      }
      try {
        const payload = await requestJson(
          "/api/clients/statement/activity",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientName,
              action,
              detail,
              recipientEmail: recipientEmail || undefined
            })
          },
          "Could not save statement activity."
        );
        const activity = payload?.activity ?? null;
        if (activity) {
          setStatementActivityMap((current) => {
            const currentClientEntries = Array.isArray(current?.[clientKey]) ? current[clientKey] : [];
            const next = {
              ...current,
              [clientKey]: mergeStatementActivities([activity], currentClientEntries)
            };
            writeStatementActivityMap(statementActivityStorageKey, next);
            return next;
          });
        }
        return activity;
      } catch (_error) {
        return null;
      }
    };

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

    const clientOptions = useMemo(() => {
      const remembered = clientMemory.map((entry) => ({
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
    }, [clientMemory, savedInvoices]);

    const selectedClientName = useMemo(() => {
      const requested = searchParams.get("client")?.trim() ?? "";
      if (requested) {
        return requested;
      }
      return clientOptions[0]?.name ?? "";
    }, [clientOptions, searchParams]);

    useEffect(() => {
      const focus = searchParams.get("focus")?.trim().toLowerCase() ?? "";
      if (focus !== "statement") {
        return;
      }
      const target = statementSectionRef.current;
      if (!target || typeof target.scrollIntoView !== "function") {
        return;
      }
      const rafId = window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return () => window.cancelAnimationFrame(rafId);
    }, [searchParams, selectedClientName]);

    useEffect(() => {
      let active = true;
      if (!selectedClientName) {
        return undefined;
      }
      const clientKey = buildStatementActivityClientKey(selectedClientName);
      const localActivities = Array.isArray(readStatementActivityMap(statementActivityStorageKey)?.[clientKey])
        ? readStatementActivityMap(statementActivityStorageKey)[clientKey]
        : [];
      setStatementActivityMap((current) => ({
        ...current,
        [clientKey]: localActivities
      }));
      apiFetch(`/api/clients/statement/activity?clientName=${encodeURIComponent(selectedClientName)}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Failed to load statement activity.");
          }
          const payload = await response.json();
          if (!active) {
            return;
          }
          const remoteActivities = Array.isArray(payload?.activities) ? payload.activities : [];
          setStatementActivityMap((current) => {
            const currentClientEntries = Array.isArray(current?.[clientKey]) ? current[clientKey] : [];
            const nextEntries = mergeStatementActivities(remoteActivities, currentClientEntries);
            const next = { ...current, [clientKey]: nextEntries };
            writeStatementActivityMap(statementActivityStorageKey, next);
            return next;
          });
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setStatementActivityMap((current) => {
            const next = {
              ...current,
              [clientKey]: localActivities
            };
            writeStatementActivityMap(statementActivityStorageKey, next);
            return next;
          });
        });
      return () => {
        active = false;
      };
    }, [apiFetch, selectedClientName]);

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
    const recurringInvoice = useMemo(
      () => clientInvoices.find((invoice) => Boolean(recurringSchedules[invoice.invoiceId])) ?? null,
      [clientInvoices, recurringSchedules]
    );
    const recurringEntry = recurringInvoice ? recurringSchedules[recurringInvoice.invoiceId] : null;
    const recurringSummary = recurringEntry
      ? buildRecurringScheduleSummary(recurringEntry, { nowMs: Date.now(), runHistoryLimit: 2 })
      : null;
    const recurringNextDueLabel = recurringEntry?.nextDueAt
      ? formatUpdatedDate(recurringEntry.nextDueAt)
      : "";
    const paidCount = clientInvoices.filter((invoice) => invoice?.status === "paid").length;
    const sentCount = clientInvoices.filter((invoice) => invoice?.status === "sent").length;
    const draftCount = clientInvoices.filter((invoice) => invoice?.status === "draft").length;
    const estimateCount = clientInvoices.filter((invoice) => getInvoiceDocumentType(invoice) === "estimate").length;
    const partialPaymentCount = clientInvoices.filter((invoice) => hasPartialPayment(invoice)).length;
    const openBalance = sumOpenBalance(clientInvoices.filter((invoice) => invoice?.status === "sent"));
    const clientStatementInvoices = useMemo(
      () =>
        clientInvoices
          .filter((invoice) => invoice?.status === "sent" && getInvoiceOpenBalance(invoice) > 0)
          .sort((left, right) => {
            const leftDue = parseTimestamp(left?.invoiceData?.finishedInvoice?.dueDate ?? left?.dueDate ?? "");
            const rightDue = parseTimestamp(right?.invoiceData?.finishedInvoice?.dueDate ?? right?.dueDate ?? "");
            if (Number.isFinite(leftDue) && Number.isFinite(rightDue) && leftDue !== rightDue) {
              return leftDue - rightDue;
            }
            return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
          }),
      [clientInvoices]
    );
    const leadService = clientServices[0] ?? null;
    const cadenceLabel = formatRecurringCadence(selectedMemoryEntry?.recurringIntervalDays);
    const latestPartialInvoice = clientInvoices.find((invoice) => hasPartialPayment(invoice)) ?? null;
    const latestPartialPaymentAmount = latestPartialInvoice ? getInvoiceAmountPaid(latestPartialInvoice) : 0;
    const latestPartialPaymentBalance = latestPartialInvoice ? getInvoiceOpenBalance(latestPartialInvoice) : 0;
    const latestPartialPaymentTotal = Number(
      latestPartialInvoice?.total ?? latestPartialInvoice?.invoiceData?.finishedInvoice?.total ?? 0
    );
    const latestPartialPaymentLatestRecord = latestPartialInvoice
      ? getInvoiceLatestPayment(latestPartialInvoice)
      : null;
    const latestPartialPaymentRecords = latestPartialInvoice
      ? getInvoicePaymentRecords(latestPartialInvoice)
          .slice()
          .sort((left, right) => parseTimestamp(right.paidAt ?? right.recordedAt ?? "") - parseTimestamp(left.paidAt ?? left.recordedAt ?? ""))
      : [];
    const latestPartialPaymentProgress =
      latestPartialPaymentTotal > 0
        ? Math.max(0, Math.min(100, Math.round((latestPartialPaymentAmount / latestPartialPaymentTotal) * 100)))
        : 0;
    const latestPartialPaymentSummary = latestPartialInvoice
      ? buildPaymentProgressSummary(
          latestPartialPaymentTotal,
          latestPartialPaymentBalance,
          latestPartialPaymentRecords,
          { timelineLimit: 3 }
        )
      : null;
    const latestPartialPaymentButtons = latestPartialInvoice
      ? [
          {
            label: "Open latest with Billie",
            onClick: () => handleOpenInvoiceWithBillie(latestPartialInvoice)
          },
          {
            label: "Open library",
            onClick: () => navigate("/invoices?focus=partial_payments")
          }
        ]
      : [];
    const latestSentOpenInvoice = clientInvoices.find(
      (invoice) => invoice?.status === "sent" && getInvoiceOpenBalance(invoice) > 0
    ) ?? null;
    const latestOpenedUnpaidInvoice = clientInvoices.find(
      (invoice) =>
        invoice?.status === "sent" &&
        getInvoiceOpenBalance(invoice) > 0 &&
        invoice?.delivery?.status === "opened"
    ) ?? null;
    const collectionsCards = [
      {
        label: "Open balance",
        value: openBalance > 0 ? formatMoney(openBalance) : "0",
        detail:
          sentCount > 0
            ? `${sentCount} sent invoice${sentCount === 1 ? "" : "s"} still need payment follow-through.`
            : "No sent invoices are waiting on payment right now.",
        primaryLabel: latestSentOpenInvoice ? "Open open-balance queue" : "",
        onPrimary: latestSentOpenInvoice ? () => navigate("/invoices?focus=opened_unpaid") : null,
        cardClass: openBalance > 0 ? "nb-stage-card--warning" : "nb-stage-card--success"
      },
      {
        label: "Opened unpaid",
        value: latestOpenedUnpaidInvoice ? "Client saw it" : "Quiet",
        detail: latestOpenedUnpaidInvoice
          ? `${latestOpenedUnpaidInvoice.invoiceNumber || "Latest invoice"} was already opened, so a focused reminder is usually the next move.`
          : "No opened-but-unpaid invoice is leading this client right now.",
        primaryLabel: latestOpenedUnpaidInvoice ? "Open opened-unpaid queue" : "",
        onPrimary: latestOpenedUnpaidInvoice ? () => navigate("/invoices?focus=opened_unpaid") : null,
        cardClass: latestOpenedUnpaidInvoice ? "nb-stage-card--warning" : ""
      },
      {
        label: "Partial payments",
        value: partialPaymentCount > 0 ? `${partialPaymentCount}` : "0",
        detail: latestPartialInvoice
          ? `${formatMoney(latestPartialPaymentBalance)} still remains on ${latestPartialInvoice.invoiceNumber || "the partial invoice"}.`
          : "No partial-payment recovery is open for this client right now.",
        primaryLabel: latestPartialInvoice ? "Open partial-payment queue" : "",
        onPrimary: latestPartialInvoice ? () => navigate("/invoices?focus=partial_payments") : null,
        cardClass: latestPartialInvoice ? "nb-stage-card--warning" : ""
      }
    ];
    const collectionsLibraryAction = latestPartialInvoice
      ? {
          label: "Open partial-payment queue",
          onClick: () => navigate("/invoices?focus=partial_payments")
        }
      : latestOpenedUnpaidInvoice
        ? {
            label: "Open opened-unpaid queue",
            onClick: () => navigate("/invoices?focus=opened_unpaid")
          }
        : latestSentOpenInvoice
          ? {
              label: "Open payment follow-through",
              onClick: () => navigate("/invoices")
            }
          : {
          label: "Open library",
          onClick: () => navigate("/invoices")
        };
    const collectionsNextStep = latestPartialInvoice
      ? {
          eyebrow: "Collections next step",
          title: `Collect the remaining ${formatMoney(latestPartialPaymentBalance)}`,
          body: `${latestPartialInvoice.invoiceNumber || "The latest partial invoice"} already has money recorded. Reopen it with Billie or jump into the partial-payment queue before the remaining balance gets colder.`,
          primaryLabel: "Open latest with Billie",
          onPrimary: () => handleOpenInvoiceWithBillie(latestPartialInvoice),
          secondaryLabel: "Open partial-payment queue",
          onSecondary: () => navigate("/invoices?focus=partial_payments")
        }
      : latestOpenedUnpaidInvoice
        ? {
            eyebrow: "Collections next step",
            title: `Follow up on ${latestOpenedUnpaidInvoice.invoiceNumber || "the opened invoice"}`,
            body: "The client already opened this invoice, so a focused follow-up is usually the cleanest move now.",
            primaryLabel: "Open opened-unpaid queue",
            onPrimary: () => navigate("/invoices?focus=opened_unpaid"),
            secondaryLabel: "Open latest with Billie",
            onSecondary: () => handleOpenInvoiceWithBillie(latestOpenedUnpaidInvoice)
          }
        : latestSentOpenInvoice
          ? {
              eyebrow: "Collections next step",
              title: `Keep ${latestSentOpenInvoice.invoiceNumber || "the open invoice"} moving`,
              body: "There is still open sent balance for this client. Stay inside the payment follow-through flow while the context is fresh.",
              primaryLabel: "Open payment follow-through",
              onPrimary: collectionsLibraryAction.onClick,
              secondaryLabel: "Open latest with Billie",
              onSecondary: () => handleOpenInvoiceWithBillie(latestSentOpenInvoice)
            }
          : null;
    const clientStatementSummary = useMemo(() => {
      if (!selectedClientName) {
        return "";
      }
      const header = [
        `${selectedClientName} statement`,
        `Prepared ${formatCalendarDate(new Date().toISOString())}`
      ];
      const invoiceLines = clientStatementInvoices.slice(0, 4).map((invoice) => {
        const invoiceNumber = invoice?.invoiceNumber || "Draft";
        const balance = formatMoney(getInvoiceOpenBalance(invoice));
        const dueDate = formatCalendarDate(invoice?.invoiceData?.finishedInvoice?.dueDate ?? invoice?.dueDate ?? "");
        const deliveryOpened = invoice?.delivery?.status === "opened";
        const fragments = [
          `${invoiceNumber}: ${balance} open`,
          dueDate ? `due ${dueDate}` : "",
          deliveryOpened ? "already opened" : ""
        ].filter(Boolean);
        return `- ${fragments.join(" · ")}`;
      });
      if (clientStatementInvoices.length > 4) {
        invoiceLines.push(`- ${clientStatementInvoices.length - 4} more open invoice${clientStatementInvoices.length - 4 === 1 ? "" : "s"} not shown`);
      }
      const footer = openBalance > 0 ? [`Total open balance: ${formatMoney(openBalance)}`] : ["No open balance right now."];
      return [...header, "", ...invoiceLines, "", ...footer].join("\n").trim();
    }, [clientStatementInvoices, openBalance, selectedClientName]);
    const statementOverdueInvoices = useMemo(() => {
      const today = Date.now();
      return clientStatementInvoices.filter((invoice) => {
        const dueValue = invoice?.invoiceData?.finishedInvoice?.dueDate ?? invoice?.dueDate ?? "";
        const dueTimestamp = Date.parse(dueValue);
        return Number.isFinite(dueTimestamp) && dueTimestamp < today;
      });
    }, [clientStatementInvoices]);
    const recommendedStatementPreset = latestPartialInvoice
      ? "partial"
      : statementOverdueInvoices.length > 0
        ? "overdue"
        : "gentle";
    useEffect(() => {
      setStatementFollowUpPreset(recommendedStatementPreset);
    }, [recommendedStatementPreset, selectedClientName]);
    const clientStatementFollowUpPresets = useMemo(() => {
      if (!selectedClientName) {
        return [];
      }
      const recipientLabel = selectedMemoryEntry?.recipientEmail || selectedClientName;
      const firstOpenInvoice = clientStatementInvoices[0] ?? null;
      const firstInvoiceLabel = firstOpenInvoice?.invoiceNumber || "your open invoice";
      const firstDueDate = formatCalendarDate(
        firstOpenInvoice?.invoiceData?.finishedInvoice?.dueDate ?? firstOpenInvoice?.dueDate ?? ""
      );
      const overdueLead = statementOverdueInvoices[0] ?? firstOpenInvoice;
      const overdueDueDate = formatCalendarDate(
        overdueLead?.invoiceData?.finishedInvoice?.dueDate ?? overdueLead?.dueDate ?? ""
      );
      const partialInvoiceLabel = latestPartialInvoice?.invoiceNumber || firstInvoiceLabel;
      const partialRemaining = latestPartialPaymentBalance > 0 ? formatMoney(latestPartialPaymentBalance) : formatMoney(openBalance);
      return [
        {
          id: "gentle",
          label: "Gentle reminder",
          description: "Soft nudge with the current balance summary.",
          body: [
            `Hi ${recipientLabel},`,
            "",
            openBalance > 0
              ? `A quick follow-up on the current NoteBill balance for ${selectedClientName}. We still show ${formatMoney(openBalance)} open${firstDueDate ? `, with ${firstInvoiceLabel} due ${firstDueDate}` : ""}.`
              : `A quick follow-up on the current NoteBill balance for ${selectedClientName}.`,
            "",
            "Sharing the statement summary below in case it helps:",
            "",
            clientStatementSummary,
            "",
            "If anything looks off, reply and I can adjust it right away.",
            "",
            "Thank you"
          ].join("\n")
        },
        {
          id: "overdue",
          label: "Overdue follow-up",
          description: "Clearer urgency when past-due invoices are piling up.",
          body: [
            `Hi ${recipientLabel},`,
            "",
            statementOverdueInvoices.length > 0
              ? `I’m following up because ${selectedClientName} still has ${formatMoney(openBalance)} open in NoteBill, including ${overdueLead?.invoiceNumber || "an invoice"}${overdueDueDate ? ` that was due ${overdueDueDate}` : ""}.`
              : `I’m following up because ${selectedClientName} still has ${formatMoney(openBalance)} open in NoteBill.`,
            "",
            "Here is the current statement summary:",
            "",
            clientStatementSummary,
            "",
            "If payment is already in motion, just let me know so I can update the record.",
            "",
            "Thank you"
          ].join("\n")
        },
        {
          id: "partial",
          label: "Partial payment follow-up",
          description: "Recover the remaining balance after a partial payment.",
          body: [
            `Hi ${recipientLabel},`,
            "",
            latestPartialInvoice
              ? `Thank you for the payment already recorded on ${partialInvoiceLabel}. NoteBill still shows ${partialRemaining} open for ${selectedClientName}, so I’m sharing the updated statement below.`
              : `I’m sending the updated statement for ${selectedClientName}. NoteBill still shows ${formatMoney(openBalance)} open after the latest payment activity.`,
            "",
            clientStatementSummary,
            "",
            "If you need anything revised before the remaining balance is paid, reply and I’ll take care of it.",
            "",
            "Thank you"
          ].join("\n")
        }
      ];
    }, [
      clientStatementInvoices,
      clientStatementSummary,
      latestPartialInvoice,
      latestPartialPaymentBalance,
      openBalance,
      selectedClientName,
      selectedMemoryEntry,
      statementOverdueInvoices
    ]);
    const selectedStatementFollowUpPreset =
      clientStatementFollowUpPresets.find((preset) => preset.id === statementFollowUpPreset) ??
      clientStatementFollowUpPresets[0] ??
      null;
    const clientStatementFollowUp = selectedStatementFollowUpPreset?.body || "";
    const clientStatementPreview = clientStatementInvoices.slice(0, 3);
    const clientStatementEmailReady = isValidEmail(selectedMemoryEntry?.recipientEmail);
    const statementActivityHistory = useMemo(() => {
      const clientKey = buildStatementActivityClientKey(selectedClientName);
      const entries = Array.isArray(statementActivityMap?.[clientKey]) ? statementActivityMap[clientKey] : [];
      return entries;
    }, [selectedClientName, statementActivityMap]);
    const latestStatementActivity = statementActivityHistory[0] ?? null;
    const clientStatementStatusChip = useMemo(() => {
      if (!selectedClientName) {
        return null;
      }
      if (latestStatementActivity) {
        const actionLabel =
          latestStatementActivity.action === "emailed_statement"
            ? "Statement emailed"
            : latestStatementActivity.action === "downloaded_pdf"
              ? "PDF downloaded"
              : latestStatementActivity.action === "printed_statement"
                ? "Statement printed"
                : latestStatementActivity.action === "copied_follow_up"
                  ? "Follow-up copied"
                  : latestStatementActivity.action === "copied_statement"
                    ? "Statement copied"
                    : "Statement viewed";
        const tone =
          latestStatementActivity.action === "emailed_statement" || latestStatementActivity.action === "downloaded_pdf"
            ? "success"
            : latestStatementActivity.action === "printed_statement" ||
                latestStatementActivity.action === "viewed_statement"
              ? "info"
              : "soft";
        return {
          tone,
          label: `${actionLabel} · ${formatRelativeActivityTime(latestStatementActivity.recordedAt)}`
        };
      }
      if (openBalance > 0) {
        return {
          tone: "warning",
          label: `${formatMoney(openBalance)} open · statement ready`
        };
      }
      return {
        tone: "soft",
        label: "Statement ready"
      };
    }, [latestStatementActivity, openBalance, selectedClientName]);
    const clientStatementRows = clientStatementInvoices.map((invoice) => {
      const invoiceNumber = invoice?.invoiceNumber || "Draft";
      const dueDate = formatCalendarDate(invoice?.invoiceData?.finishedInvoice?.dueDate ?? invoice?.dueDate ?? "");
      const openAmount = formatMoney(getInvoiceOpenBalance(invoice));
      const totalAmount = formatMoney(
        Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? getInvoiceOpenBalance(invoice) ?? 0)
      );
      const statusParts = [];
      if (invoice?.delivery?.status === "opened") {
        statusParts.push("Opened");
      } else if (invoice?.status === "sent") {
        statusParts.push("Sent");
      }
      if (hasPartialPayment(invoice)) {
        statusParts.push("Partial payment");
      }
      return {
        invoiceNumber,
        dueDate: dueDate || "Not set",
        totalAmount,
        openAmount,
        statusLabel: statusParts.join(" · ") || "Open"
      };
    });
    const clientTimeline = useMemo(() => {
      const entries = [];
      if (latestInvoice) {
        const documentType = getInvoiceDocumentType(latestInvoice);
        const estimateSummary = buildEstimateWorkflowSummary(latestInvoice);
        entries.push({
          id: `timeline-${latestInvoice.invoiceId}`,
          label:
            documentType === "estimate"
              ? estimateSummary.statusLabel
              : latestInvoice.status === "paid"
                ? "Invoice paid"
                : latestInvoice.status === "sent"
                  ? "Invoice sent"
                  : "Draft saved",
          detail:
            documentType === "estimate"
              ? `${latestInvoice.invoiceNumber || "Latest work"} · ${formatUpdatedDate(latestInvoice.updatedAt)} · ${estimateSummary.nextStepLabel.replace(/^Next step:\s*/i, "")}`
              : `${latestInvoice.invoiceNumber || "Latest work"} · ${formatUpdatedDate(latestInvoice.updatedAt)}`,
          tone:
            documentType === "estimate"
              ? estimateSummary.statusTone
              : latestInvoice.status === "paid"
                ? "success"
                : latestInvoice.status === "sent"
                  ? "warning"
                  : "soft",
          actionLabel:
            documentType === "estimate" && estimateSummary.isApproved ? "Convert to invoice" : "Open latest with Billie",
          onAction:
            documentType === "estimate" && estimateSummary.isApproved
              ? () => void handleConvertEstimateToInvoice(latestInvoice)
              : () => handleOpenInvoiceWithBillie(latestInvoice),
          secondaryLabel:
            documentType === "estimate" && !estimateSummary.isApproved
              ? "Mark approved"
              : latestInvoice.status === "paid"
                ? "Invoice again"
                : latestInvoice.status === "sent"
                  ? "Open follow-through"
                  : "Open draft",
          onSecondary:
            documentType === "estimate" && !estimateSummary.isApproved
              ? () => void handleSetEstimateReviewState(latestInvoice, "approved")
              : latestInvoice.status === "paid"
                ? () => handleInvoiceAgain(latestInvoice)
                : latestInvoice.status === "sent"
                  ? () =>
                      navigate(
                        latestInvoice?.delivery?.status === "opened"
                          ? "/invoices?focus=opened_unpaid"
                          : "/invoices?focus=overdue_unopened"
                      )
                  : () => handleOpenInvoiceWithBillie(latestInvoice)
        });
      }
      if (latestPartialInvoice) {
        entries.push({
          id: `timeline-partial-${latestPartialInvoice.invoiceId}`,
          label: "Payment recorded",
          detail: `${formatMoney(latestPartialPaymentAmount)} paid · ${formatMoney(latestPartialPaymentBalance)} remaining`,
          tone: "warning",
          actionLabel: "Open latest with Billie",
          onAction: () => handleOpenInvoiceWithBillie(latestPartialInvoice),
          secondaryLabel: "Open partial-payment queue",
          onSecondary: () => navigate("/invoices?focus=partial_payments")
        });
      }
      if (recurringEntry) {
        entries.push({
          id: `timeline-recurring-${recurringInvoice.invoiceId}`,
          label: recurringSummary?.statusLabel || (recurringEntry.autoSendEnabled ? "Recurring armed" : "Recurring ready"),
          detail:
            `${recurringEntry.intervalDays}-day cadence` +
            (recurringSummary?.lastAutoSendAt ? ` · Last run ${formatUpdatedDate(recurringSummary.lastAutoSendAt)}` : "") +
            (recurringSummary?.autoSendRunCount
              ? ` · ${recurringSummary.autoSendRunCount} run${recurringSummary.autoSendRunCount === 1 ? "" : "s"}`
              : ""),
          tone: recurringSummary?.statusTone || (recurringEntry.autoSendEnabled ? "success" : "soft"),
          actionLabel: "Open recurring invoice",
          onAction: () => navigate(`/invoices?open=${encodeURIComponent(recurringInvoice.invoiceId)}`),
          secondaryLabel: selectedMemoryEntry ? "Start with saved details" : "",
          onSecondary: selectedMemoryEntry ? () => handleStartFromMemory(selectedMemoryEntry, leadService) : null
        });
      }
      if (selectedMemoryEntry) {
        entries.push({
          id: `timeline-memory-${selectedMemoryEntry.name}`,
          label: "Saved client details ready",
          detail: selectedMemoryEntry.defaultNotes || selectedMemoryEntry.details || selectedMemoryEntry.name,
          tone: "soft",
          actionLabel: "Start with saved details",
          onAction: () => handleStartFromMemory(selectedMemoryEntry, leadService),
          secondaryLabel: clientServices.length > 0 ? "Review saved services" : "Open blank invoice",
          onSecondary:
            clientServices.length > 0 ? () => navigate("/settings/services") : () => navigate("/manual")
        });
      }
      return entries.slice(0, 4);
    }, [
      clientServices.length,
      leadService,
      latestInvoice,
      latestPartialInvoice,
      latestPartialPaymentAmount,
      latestPartialPaymentBalance,
      navigate,
      recurringEntry,
      recurringInvoice,
      selectedMemoryEntry
    ]);
    const timelineNextStep = clientTimeline[0] ?? null;

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
      setStatus(`Draft started for ${memoryEntry.name}.`);
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
    const handleCopyToClipboard = async (text, successMessage) => {
      if (!text) {
        setError("There was nothing ready to copy yet.");
        return false;
      }
      try {
        await navigator.clipboard.writeText(text);
        setError("");
        setStatus(successMessage);
        return true;
      } catch (_copyError) {
        setError("Copy failed. Try again from a browser tab with clipboard access.");
        return false;
      }
    };
    const handleCopyClientStatement = async () => {
      const copied = await handleCopyToClipboard(
        clientStatementSummary,
        `Statement summary copied for ${selectedClientName}.`
      );
      if (copied) {
        void pushStatementActivity(selectedClientName, "copied_statement", "Statement summary copied");
      }
    };
    const handleCopyClientFollowUp = async () => {
      const copied = await handleCopyToClipboard(
        clientStatementFollowUp,
        `${selectedStatementFollowUpPreset?.label || "Follow-up note"} copied for ${selectedClientName}.`
      );
      if (copied) {
        void pushStatementActivity(
          selectedClientName,
          "copied_follow_up",
          `${selectedStatementFollowUpPreset?.label || "Follow-up"} copied`
        );
      }
    };
    const handleEmailClientStatement = async () => {
      if (!clientStatementEmailReady) {
        setError("Save a client recipient email first so NoteBill can open a ready-to-send statement email.");
        return;
      }
      const recipientEmail = selectedMemoryEntry?.recipientEmail?.trim() ?? "";
      setStatementSendBusy(true);
      try {
        const payload = await requestJson(
          "/api/clients/statement/send",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientName: selectedClientName,
              recipientEmail
            })
          },
          "Could not send the client statement."
        );
        setError("");
        setStatus(
          payload?.mode === "provider"
            ? `Statement sent to ${recipientEmail}.`
            : payload?.warning
              ? `Statement prepared for ${recipientEmail}. ${payload.warning}`
              : `Statement prepared for ${recipientEmail}.`
        );
        void pushStatementActivity(
          selectedClientName,
          "emailed_statement",
          payload?.mode === "provider"
            ? `Statement emailed to ${recipientEmail}`
            : `Statement prepared for ${recipientEmail}`,
          recipientEmail
        );
      } catch (statementError) {
        setError(statementError?.message || "Could not send the client statement.");
      } finally {
        setStatementSendBusy(false);
      }
    };
    const handlePrintClientStatement = () => {
      if (!selectedClientName) {
        setError("Choose a client first.");
        return;
      }
      const statementWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");
      if (!statementWindow) {
        setError("The statement preview was blocked. Allow pop-ups for NoteBill and try again.");
        return;
      }
      const recipientLine = selectedMemoryEntry?.recipientEmail
        ? `<p><strong>Recipient:</strong> ${escapeHtml(selectedMemoryEntry.recipientEmail)}</p>`
        : "";
      const rowsMarkup =
        clientStatementRows.length > 0
          ? clientStatementRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.invoiceNumber)}</td>
                    <td>${escapeHtml(row.dueDate)}</td>
                    <td>${escapeHtml(row.statusLabel)}</td>
                    <td class="money">${escapeHtml(row.totalAmount)}</td>
                    <td class="money">${escapeHtml(row.openAmount)}</td>
                  </tr>
                `
              )
              .join("")
          : `
            <tr>
              <td colspan="5" class="empty">No open invoices for this client right now.</td>
            </tr>
          `;
      statementWindow.document.open();
      statementWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(selectedClientName)} statement</title>
            <style>
              :root {
                color-scheme: light;
                --ink: #16241f;
                --muted: #5f6f69;
                --line: #d9e6df;
                --panel: #f7faf7;
                --accent: #17493c;
              }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                background: #eef4f0;
                color: var(--ink);
                font-family: Georgia, "Times New Roman", serif;
              }
              .sheet {
                max-width: 920px;
                margin: 0 auto;
                padding: 40px 28px 56px;
                background: white;
                min-height: 100vh;
              }
              .eyebrow {
                margin: 0;
                color: var(--accent);
                font: 700 11px/1.4 system-ui, sans-serif;
                letter-spacing: 0.16em;
                text-transform: uppercase;
              }
              h1 {
                margin: 12px 0 10px;
                font-size: 34px;
                line-height: 1.1;
              }
              .lede, .meta p, .summary, td, th {
                font-family: system-ui, sans-serif;
              }
              .lede, .summary {
                color: var(--muted);
                line-height: 1.6;
              }
              .meta {
                display: grid;
                gap: 4px;
                margin: 28px 0 20px;
                padding: 18px 20px;
                border: 1px solid var(--line);
                border-radius: 20px;
                background: var(--panel);
              }
              .meta p {
                margin: 0;
                font-size: 14px;
              }
              .summary {
                margin: 0 0 18px;
                font-size: 14px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 18px;
              }
              th, td {
                padding: 14px 12px;
                border-bottom: 1px solid var(--line);
                text-align: left;
                font-size: 14px;
                vertical-align: top;
              }
              th {
                color: var(--muted);
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .money {
                text-align: right;
                white-space: nowrap;
                font-weight: 600;
              }
              .totals {
                margin-top: 24px;
                padding: 18px 20px;
                border: 1px solid var(--line);
                border-radius: 20px;
                background: #fcfdfc;
              }
              .totals p {
                margin: 0;
                display: flex;
                justify-content: space-between;
                gap: 16px;
                font: 600 16px/1.5 system-ui, sans-serif;
              }
              .footnote {
                margin-top: 20px;
                color: var(--muted);
                font: 13px/1.6 system-ui, sans-serif;
              }
              .empty {
                color: var(--muted);
                text-align: center;
              }
              @media print {
                body { background: white; }
                .sheet { padding: 0; max-width: none; }
              }
            </style>
          </head>
          <body>
            <main class="sheet">
              <p class="eyebrow">Client statement</p>
              <h1>${escapeHtml(selectedClientName)}</h1>
              <p class="lede">A clean summary of the current NoteBill balance so follow-up can happen without digging through separate invoices.</p>
              <section class="meta">
                <p><strong>Prepared:</strong> ${escapeHtml(formatCalendarDate(new Date().toISOString()) || "")}</p>
                ${recipientLine}
                <p><strong>Open invoices:</strong> ${escapeHtml(String(clientStatementInvoices.length))}</p>
              </section>
              <p class="summary">${escapeHtml(
                openBalance > 0
                  ? `${selectedClientName} currently has ${formatMoney(openBalance)} outstanding across ${clientStatementInvoices.length} open invoice${clientStatementInvoices.length === 1 ? "" : "s"}.`
                  : `${selectedClientName} does not have an open sent balance right now.`
              )}</p>
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th class="money">Total</th>
                    <th class="money">Open</th>
                  </tr>
                </thead>
                <tbody>${rowsMarkup}</tbody>
              </table>
              <section class="totals">
                <p><span>Total open balance</span><span>${escapeHtml(formatMoney(openBalance))}</span></p>
              </section>
              <p class="footnote">Generated from NoteBill client workspace.</p>
            </main>
            <script>
              window.addEventListener("load", () => {
                window.print();
              });
            </script>
          </body>
        </html>
      `);
      statementWindow.document.close();
      setError("");
      setStatus(`Printable statement ready for ${selectedClientName}.`);
      void pushStatementActivity(selectedClientName, "printed_statement", "Printable statement opened");
    };
    const handleDownloadClientStatementPdf = async () => {
      if (!selectedClientName) {
        setError("Choose a client first.");
        return;
      }
      setStatementPdfBusy(true);
      try {
        setError("");
        const response = await apiFetch("/api/clients/statement/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: selectedClientName,
            recipientEmail: selectedMemoryEntry?.recipientEmail || undefined
          })
        });
        const errorPayload = await response.clone().json().catch(() => null);
        if (!response.ok) {
          throw new Error(errorPayload?.error || "Could not export the client statement PDF.");
        }
        const pdfBlob = await response.blob();
        const objectUrl = window.URL.createObjectURL(pdfBlob);
        const safeName =
          selectedClientName
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "Client";
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `Client-Statement-${safeName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
        setStatus(`Statement PDF is downloading for ${selectedClientName}.`);
        void pushStatementActivity(selectedClientName, "downloaded_pdf", "Statement PDF downloaded");
      } catch (pdfError) {
        setError(pdfError?.message || "Could not export the client statement PDF.");
      } finally {
        setStatementPdfBusy(false);
      }
    };

    const handleConvertEstimateToInvoice = async (invoice = latestInvoice) => {
      if (!invoice?.invoiceId) {
        return;
      }
      setEstimateActionId(invoice.invoiceId);
      setStatus("");
      setError("");
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
          setStatus(
            `Converted ${updatedInvoice.invoiceNumber || "the estimate"} into a draft invoice. Next: open it, confirm payment terms, and send when ready.`
          );
        }
      } catch (convertError) {
        setError(convertError?.message || "Failed to convert estimate.");
      } finally {
        setEstimateActionId("");
      }
    };

    const handleSetEstimateReviewState = async (invoice = latestInvoice, reviewState = "approved") => {
      if (!invoice?.invoiceId) {
        return;
      }
      setEstimateActionId(invoice.invoiceId);
      setStatus("");
      setError("");
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
        const nextReviewState = reviewState === "approved" ? "approved" : "needs_review";
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
                  estimateReviewState: nextReviewState,
                  estimateReviewUpdatedAt: new Date().toISOString()
                }
              }
            })
          },
          "Failed to update estimate review state."
        );
        const updatedInvoice = savePayload?.invoice;
        if (updatedInvoice?.invoiceId) {
          setSavedInvoices((prev) =>
            prev.map((existing) =>
              existing.invoiceId === updatedInvoice.invoiceId ? { ...existing, ...updatedInvoice } : existing
            )
          );
          setStatus(
            nextReviewState === "approved"
              ? `Marked ${updatedInvoice.invoiceNumber || "the estimate"} as approved. Next: convert it when the work is ready to bill.`
              : `Marked ${updatedInvoice.invoiceNumber || "the estimate"} as needing review. Next: reopen it with Billie and tidy the missing pieces.`
          );
        }
      } catch (reviewError) {
        setError(reviewError?.message || "Failed to update estimate review state.");
      } finally {
        setEstimateActionId("");
      }
    };

    const persistRecurringSchedules = (nextSchedules) => {
      setRecurringSchedules(nextSchedules);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(recurringStorageKey, JSON.stringify({ entries: nextSchedules }));
      }
    };

    const toggleRecurringAutoSend = (invoiceId, enabled) => {
      const existing = recurringSchedules[invoiceId];
      if (!existing) {
        setError("Recurring schedule not found.");
        return;
      }
      const recurringInvoiceCandidate = clientInvoices.find((invoice) => invoice.invoiceId === invoiceId);
      const recipientEmail = getRecurringAutoSendRecipient(recurringInvoiceCandidate, clientMemory);
      if (enabled && !recipientEmail) {
        setError("Recurring auto-send needs a remembered recipient email.");
        return;
      }
      persistRecurringSchedules({
        ...recurringSchedules,
        [invoiceId]: {
          ...existing,
          autoSendEnabled: Boolean(enabled)
        }
      });
      setError("");
      setRecurringNotice(
        enabled
          ? `Recurring auto-send armed for ${recipientEmail || "the remembered recipient"}.`
          : "Recurring auto-send paused for now."
      );
    };

    const runRecurringAutoSend = async (invoice = recurringInvoice) => {
      if (!invoice?.invoiceId) {
        return;
      }
      const recurringEntry = recurringSchedules[invoice.invoiceId];
      if (!recurringEntry?.autoSendEnabled) {
        setError("Arm recurring auto-send before running it.");
        return;
      }
      const recipientEmail = getRecurringAutoSendRecipient(invoice, clientMemory);
      if (!recipientEmail) {
        setError("Recurring auto-send needs a remembered recipient email.");
        return;
      }
      setError("");
      setRecurringNotice(`Running recurring send for ${recipientEmail}...`);
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
        setRecurringNotice(
          `Recurring send run for ${recipientEmail}. Next due ${formatUpdatedDate(nextDueAt)}. Watch delivery before nudging again.`
        );
        setSavedInvoices((prev) =>
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
      } catch (sendError) {
        setError(sendError?.message || "Failed to send recurring invoice.");
      }
    };

    const bestNextMove = useMemo(() => {
      if (!selectedClientName) {
        return null;
      }
      if (latestInvoice && getInvoiceDocumentType(latestInvoice) === "estimate") {
        const latestEstimateSummary = buildEstimateWorkflowSummary(latestInvoice);
        return {
          eyebrow: "Estimate follow-through",
          title: latestEstimateSummary.statusLabel,
          body: latestEstimateSummary.actionHint,
          primaryLabel:
            latestEstimateSummary.isApproved
              ? estimateActionId === latestInvoice.invoiceId
                ? "Converting..."
                : "Convert approved estimate"
              : latestEstimateSummary.primaryActionLabel,
          onPrimary:
            latestEstimateSummary.isApproved
              ? () => void handleConvertEstimateToInvoice(latestInvoice)
              : () => handleOpenInvoiceWithBillie(latestInvoice),
          secondaryLabel: latestEstimateSummary.isApproved ? "Open latest with Billie" : "Mark approved",
          onSecondary:
            latestEstimateSummary.isApproved
              ? () => handleOpenInvoiceWithBillie(latestInvoice)
              : () => void handleSetEstimateReviewState(latestInvoice, "approved")
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
          onSecondary: () => navigate("/invoices?focus=partial_payments")
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
          onSecondary: () =>
            navigate(
              latestInvoice?.delivery?.status === "opened"
                ? "/invoices?focus=opened_unpaid"
                : "/invoices?focus=overdue_unopened"
            )
        };
      }
      if (selectedMemoryEntry || leadService) {
        return {
          eyebrow: "Repeat-work momentum",
          title: leadService
            ? `Start from ${leadService.description}`
            : `Start the next invoice for ${selectedClientName}`,
          body:
            "NoteBill already knows enough about this client to skip the blank page. Start with the saved client details first, then only adjust what changed.",
          primaryLabel: selectedMemoryEntry ? "Start with saved details" : "Invoice again",
          onPrimary: () =>
            selectedMemoryEntry ? handleStartFromMemory(selectedMemoryEntry, leadService) : handleInvoiceAgain(latestInvoice),
          secondaryLabel: latestInvoice ? "Open latest with Billie" : "Review saved details",
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
        secondaryLabel: "Review saved details",
        onSecondary: () => navigate("/settings/memory")
      };
    }, [estimateActionId, latestInvoice, leadService, navigate, selectedClientName, selectedMemoryEntry]);
    const clientSnapshotItems = [
      {
        label: "Latest work",
        value: latestInvoice?.invoiceNumber || "No saved invoice yet",
        detail: latestInvoice
          ? `${latestInvoice.status === "paid" ? "Paid" : latestInvoice.status === "sent" ? "Sent" : "Draft"} · ${formatUpdatedDate(latestInvoice.updatedAt)}`
          : "Create the first invoice to start client history.",
        toneClass:
          latestInvoice?.status === "paid"
            ? "text-emerald-700"
            : latestInvoice?.status === "sent"
              ? "text-sky-700"
              : "text-slate-900",
        cardClass:
          latestInvoice?.status === "paid"
            ? "nb-stage-card--success"
            : latestInvoice?.status === "sent"
              ? "nb-stage-card--info"
              : ""
      },
      {
        label: "Open balance",
        value: openBalance > 0 ? formatMoney(openBalance) : "0",
        detail:
          openBalance > 0
            ? `${sentCount} sent invoice${sentCount === 1 ? "" : "s"} still need payment follow-through.`
            : "No open balance is waiting right now.",
        toneClass: openBalance > 0 ? "text-amber-700" : "text-emerald-700",
        cardClass: openBalance > 0 ? "nb-stage-card--warning" : "nb-stage-card--success"
      },
      {
        label: "Client activity",
        value: latestOpenedUnpaidInvoice
          ? "Opened unpaid"
          : latestPartialInvoice
            ? "Partial payment"
            : latestInvoice?.status === "paid"
              ? "Fully paid"
              : latestInvoice?.status === "sent"
                ? "Waiting on payment"
                : "Still drafting",
        detail: latestOpenedUnpaidInvoice
          ? `${latestOpenedUnpaidInvoice.invoiceNumber || "Latest invoice"} was already opened by the client.`
          : latestPartialInvoice
            ? `${formatMoney(latestPartialPaymentBalance)} still remains on ${latestPartialInvoice.invoiceNumber || "the latest partial invoice"}.`
            : latestInvoice?.status === "paid"
              ? "This client is clear and ready for repeat work."
              : latestInvoice?.status === "sent"
                ? "The next likely move is payment follow-through."
                : "No sent invoice is waiting on payment yet.",
        toneClass:
          latestOpenedUnpaidInvoice || latestPartialInvoice
            ? "text-amber-700"
            : latestInvoice?.status === "paid"
              ? "text-emerald-700"
              : "text-slate-900",
        cardClass:
          latestOpenedUnpaidInvoice || latestPartialInvoice
            ? "nb-stage-card--warning"
            : latestInvoice?.status === "paid"
              ? "nb-stage-card--success"
              : latestInvoice?.status === "sent"
                ? "nb-stage-card--info"
                : ""
      },
      {
        label: "Best next move",
        value: bestNextMove?.primaryLabel || "Start next action",
        detail:
          bestNextMove?.title ||
          "Use the strongest client context first so the next invoice starts faster.",
        toneClass: "text-slate-900",
        cardClass: ""
      }
    ];
    const paymentProgressNextStep = latestPartialInvoice
      ? {
          eyebrow: "Recovery next step",
          title: latestPartialPaymentSummary?.nextStepLabel || "Collect the remaining balance",
          body: `${formatMoney(latestPartialPaymentSummary?.balanceDue ?? latestPartialPaymentBalance)} is still open on ${latestPartialInvoice.invoiceNumber || "this invoice"}.`,
          primaryLabel: "Open latest with Billie",
          onPrimary: () => handleOpenInvoiceWithBillie(latestPartialInvoice),
          secondaryLabel: "Open partial-payment queue",
          onSecondary: () => navigate("/invoices?focus=partial_payments")
        }
      : null;
    const savedContextEssentials = [
      {
        label: "Send email",
        value: selectedMemoryEntry?.recipientEmail || "Recipient not saved yet",
        detail: selectedMemoryEntry?.recipientEmail
          ? "Ready to reuse when you send."
          : "Save a recipient once and future sends get easier.",
        toneClass: selectedMemoryEntry?.recipientEmail ? "text-slate-900" : "text-slate-500"
      },
      {
        label: "Default notes",
        value: selectedMemoryEntry?.defaultNotes || "Default notes not saved yet",
        detail: selectedMemoryEntry?.defaultNotes
          ? "These notes can prefill the next similar invoice."
          : "Helpful for repeat jobs that need the same explanation.",
        toneClass: selectedMemoryEntry?.defaultNotes ? "text-slate-900" : "text-slate-500"
      },
      {
        label: "Recurring memory",
        value: recurringEntry
          ? recurringSummary?.statusLabel || "Recurring schedule ready"
          : selectedMemoryEntry?.recurringIntervalDays
            ? `${formatRecurringCadence(selectedMemoryEntry.recurringIntervalDays)} cadence remembered`
            : "Recurring cadence not saved yet",
        detail: recurringEntry
          ? recurringNextDueLabel
            ? `Next due ${recurringNextDueLabel}`
            : "Schedule is active."
          : selectedMemoryEntry?.recurringIntervalDays
            ? "You can reuse this cadence on the next invoice."
            : "Set cadence once the repeat work is predictable.",
        toneClass:
          recurringEntry || selectedMemoryEntry?.recurringIntervalDays
            ? "text-emerald-700"
            : "text-slate-500"
      }
    ];
    const repeatWorkSystemSummary = {
      title: selectedClientName
        ? `${selectedClientName} is building a reusable invoicing system`
        : "Repeat-work system",
      detail:
        selectedMemoryEntry || clientServices.length > 0 || recurringEntry
          ? "Client details, saved services, billing memory, and recurring cues are already stacking together so the next invoice should start faster."
          : "Once you reuse work here, NoteBill will keep turning that activity into a faster repeat-work system.",
      chips: [
        selectedMemoryEntry?.recipientEmail ? "Saved recipient ready" : "",
        clientServices.length > 0
          ? `${clientServices.length} saved service${clientServices.length === 1 ? "" : "s"}`
          : "",
        recurringEntry
          ? recurringSummary?.statusLabel || "Recurring schedule ready"
          : selectedMemoryEntry?.recurringIntervalDays
            ? `${formatRecurringCadence(selectedMemoryEntry.recurringIntervalDays)} cadence remembered`
            : "",
        latestInvoice?.status === "paid"
          ? "Paid history ready"
          : latestInvoice?.status === "sent"
            ? "Sent history ready"
            : latestInvoice
              ? "Draft history ready"
              : ""
      ].filter(Boolean)
    };
    const recurringClientButtons = recurringInvoice
      ? [
          {
            label: "Open recurring invoice",
            onClick: () => navigate(`/invoices?open=${encodeURIComponent(recurringInvoice.invoiceId)}`)
          },
          {
            label: "Open library",
            onClick: () => navigate("/invoices")
          },
          ...(recurringAutoSendRecipient
            ? [
                {
                  label: recurringEntry?.autoSendEnabled ? "Pause auto-send" : "Arm auto-send",
                  onClick: () => toggleRecurringAutoSend(recurringInvoice.invoiceId, !recurringEntry?.autoSendEnabled)
                }
              ]
            : []),
          ...(recurringEntry?.autoSendEnabled && recurringAutoSendRecipient
            ? [
                {
                  label: "Run auto-send now",
                  onClick: () => void runRecurringAutoSend(recurringInvoice)
                }
              ]
            : [])
        ]
      : selectedMemoryEntry
        ? [
            {
              label: "Start with saved details",
              onClick: () => handleStartFromMemory(selectedMemoryEntry, leadService)
            },
            {
              label: "Review saved details",
              onClick: () => navigate("/settings/memory")
            }
          ]
        : [];
    const recurringClientButtonClass = (label) =>
      label === "Open recurring invoice"
        ? "nb-btn-primary"
        : label === "Arm auto-send"
          ? "nb-btn-secondary border-[#d5e5de] bg-[#f7faf7] text-[#17493c]"
          : "nb-btn-secondary";

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-6xl py-6 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="nb-kicker">Client workspace</p>
              <h1 className="nb-title max-w-3xl text-[2rem] md:text-5xl">
                Repeat clients, minus the hunting around.
              </h1>
              <p className="nb-copy max-w-2xl">
                Review what NoteBill already knows, spot the best next move, and start the next invoice with less friction and more confidence.
              </p>
            </div>
            <button type="button" className="nb-btn-secondary rounded-full px-4 py-2" onClick={() => navigate("/")}>
              Back to launcher
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="nb-surface nb-surface--muted self-start rounded-[26px] p-4 md:rounded-[30px] md:p-5 lg:sticky lg:top-24">
              <p className="nb-kicker">Client list</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Repeat clients, minus the hunting around
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pick a client to review saved details, recent invoices, repeat services, and the clearest next action.
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
                            ? "border-[#d5e5de] bg-[#f7faf7] shadow-[0_16px_34px_rgba(25,35,31,0.08)]"
                            : "border-white/80 bg-white/80 hover:border-[#d5e5de] hover:bg-white"
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
                    <p className="text-sm font-semibold text-slate-900">No saved client workspace yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Save the first invoice or reuse one client once, and NoteBill will start turning that work into a reusable client home here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-primary" onClick={() => navigate("/ai-intake")}>
                        Create first invoice
                      </button>
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate("/settings/memory")}>
                        Open saved details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            <section className="space-y-4">
              <section className="nb-surface nb-surface--elevated rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-page">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="nb-kicker">Client home</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">
                      {selectedClientName || "Choose a client"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {selectedClientName
                        ? "This is the fastest place to understand what NoteBill already knows about this client and launch the next invoice with confidence."
                        : "Choose a remembered client or a client from saved invoices to open their full workspace."}
                    </p>
                    {clientStatementStatusChip ? (
                      <div className="mt-3">
                        <StatusChip tone={clientStatementStatusChip.tone}>{clientStatementStatusChip.label}</StatusChip>
                      </div>
                    ) : null}
                  </div>
                  {selectedClientName ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate(`/settings/memory`)}>
                        Review saved details
                      </button>
                      {selectedMemoryEntry ? (
                        <button type="button" className="nb-btn-primary" onClick={handleStartFromMemory}>
                          Start with saved details
                        </button>
                      ) : (
                        <button type="button" className="nb-btn-primary" onClick={handleInvoiceAgain}>
                          Invoice again
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                {status ? (
                  <p className="mt-4 text-sm font-semibold text-[#17493c]" role="status" aria-live="polite">
                    {status}
                  </p>
                ) : null}
                {recurringNotice ? (
                  <p className="mt-2 text-sm font-semibold text-emerald-700" role="status" aria-live="polite">
                    {recurringNotice}
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-4 text-sm font-semibold text-rose-600" role="alert">
                    {error}
                  </p>
                ) : null}
                {loading ? (
                  <p className="mt-4 text-sm text-slate-500" role="status" aria-live="polite">
                    Loading client context…
                  </p>
                ) : null}
                {selectedClientName && bestNextMove ? (
                  <div
                    className="mt-5 rounded-[24px] border border-[#dbe9e2] bg-[linear-gradient(145deg,_#f7fbf8_0%,_#ffffff_55%,_#eef4f0_100%)] p-4 shadow-sm md:p-5"
                    data-testid="client-workspace-quickstart"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                          {bestNextMove.eyebrow || "Best next move"}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          {bestNextMove.title || "Start with the strongest saved context"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {bestNextMove.body ||
                            "Use the client context that is already saved so the next invoice starts with less typing and less guesswork."}
                        </p>
                        {repeatWorkSystemSummary.chips.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {repeatWorkSystemSummary.chips.map((chip) => (
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
                      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[230px]">
                        <button type="button" className="nb-btn-primary w-full justify-center" onClick={bestNextMove.onPrimary}>
                          {bestNextMove.primaryLabel || "Start next action"}
                        </button>
                        {bestNextMove.secondaryLabel ? (
                          <button
                            type="button"
                            className="nb-btn-secondary w-full justify-center"
                            onClick={bestNextMove.onSecondary}
                          >
                            {bestNextMove.secondaryLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {selectedClientName ? (
                <>
                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
                    {clientSnapshotItems.map((item) => (
                      <div
                        key={item.label}
                        className={`nb-stage-card rounded-[24px] p-4 md:p-5 ${item.cardClass || ""}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {item.label}
                        </p>
                        <p className={`mt-2 text-base font-semibold leading-6 ${item.toneClass}`}>
                          {item.value}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
                      </div>
                    ))}
                  </section>

                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["Saved invoices", clientInvoices.length],
                      ["Estimates", estimateCount],
                      ["Partial payments", partialPaymentCount],
                      ["Paid", paidCount],
                      ["Sent", sentCount],
                      ["Open balance", openBalance > 0 ? formatMoney(openBalance) : "0"]
                    ].map(([label, value]) => (
                      <div key={label} className="nb-stage-card">
                        <p className="nb-stage-card__value text-2xl">{value}</p>
                        <p className="nb-stage-card__label mt-2">
                          {label}
                        </p>
                      </div>
                    ))}
                  </section>

                  <section
                    ref={statementSectionRef}
                    className="nb-surface nb-surface--muted rounded-[26px] p-5 md:rounded-[30px] md:p-6"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="nb-kicker">Collections lane</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">What still needs payment follow-through</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Keep the outstanding balance, opened invoices, and partial-payment recovery visible before the client context gets cold.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={collectionsLibraryAction.onClick}
                      >
                        {collectionsLibraryAction.label}
                      </button>
                    </div>
                    {collectionsNextStep ? (
                      <div className="nb-highlight-panel mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                          {collectionsNextStep.eyebrow}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {collectionsNextStep.title}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          {collectionsNextStep.body}
                        </p>
                        <div className="nb-mobile-actions mt-3">
                          <button
                            type="button"
                            className="nb-btn-primary"
                            onClick={collectionsNextStep.onPrimary}
                          >
                            {collectionsNextStep.primaryLabel}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={collectionsNextStep.onSecondary}
                          >
                            {collectionsNextStep.secondaryLabel}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {collectionsCards.map((card) => (
                        <div key={card.label} className={`nb-stage-card rounded-[24px] p-4 md:p-5 ${card.cardClass || ""}`}>
                          <p className="nb-stage-card__label">{card.label}</p>
                          <p className="nb-stage-card__value mt-2 text-xl">{card.value}</p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">{card.detail}</p>
                          {card.primaryLabel && typeof card.onPrimary === "function" ? (
                            <button type="button" className="nb-btn-secondary mt-3 w-full justify-center" onClick={card.onPrimary}>
                              {card.primaryLabel}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="nb-highlight-panel mt-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                            Client statement
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            Share one clean balance summary instead of stitching invoices together by hand.
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {openBalance > 0
                              ? `${clientStatementInvoices.length} open invoice${clientStatementInvoices.length === 1 ? "" : "s"} are included. This is the fastest way to send a single account summary while the payment context is still fresh.`
                              : "No open sent balance is live for this client right now, but the statement tools are ready for the next follow-up cycle."}
                          </p>
                        </div>
                        <div className="nb-mobile-actions sm:mt-0">
                          <button
                            type="button"
                            className="nb-btn-primary"
                            onClick={() => void handleCopyClientStatement()}
                          >
                            Copy statement
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={() => void handleCopyClientFollowUp()}
                          >
                            Copy follow-up
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={handleEmailClientStatement}
                            disabled={!clientStatementEmailReady || statementSendBusy}
                          >
                            {statementSendBusy ? "Sending statement..." : "Email statement"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={() => void handleDownloadClientStatementPdf()}
                            disabled={statementPdfBusy}
                          >
                            {statementPdfBusy ? "Preparing PDF..." : "Download PDF"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={handlePrintClientStatement}
                          >
                            Print statement
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
                        <div className="nb-stage-card rounded-[24px] p-4 md:p-5">
                          <p className="nb-stage-card__label">Statement at a glance</p>
                          <p className="nb-stage-card__value mt-2 text-xl">
                            {openBalance > 0 ? formatMoney(openBalance) : "0"}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {clientStatementEmailReady
                              ? `Ready to send to ${selectedMemoryEntry.recipientEmail}.`
                              : "Save a recipient email in client memory to open a ready-to-send statement email."}
                          </p>
                          <div className="mt-3 space-y-2">
                            {clientStatementPreview.length > 0 ? (
                              clientStatementPreview.map((invoice) => {
                                const dueLabel = formatCalendarDate(
                                  invoice?.invoiceData?.finishedInvoice?.dueDate ?? invoice?.dueDate ?? ""
                                );
                                return (
                                  <div key={invoice.invoiceId} className="rounded-[18px] border border-slate-100 bg-white/90 p-3">
                                    <p className="text-xs font-semibold text-slate-900">
                                      {invoice.invoiceNumber || "Draft"} · {formatMoney(getInvoiceOpenBalance(invoice))}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">
                                      {dueLabel ? `Due ${dueLabel}` : "Due date not saved"}
                                      {invoice?.delivery?.status === "opened" ? " · Client already opened it" : ""}
                                    </p>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-xs leading-5 text-slate-600">
                                No open sent invoices are waiting on this client right now.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-[22px] border border-slate-100 bg-white/88 p-4">
                          <div className="flex flex-wrap gap-2">
                            {clientStatementFollowUpPresets.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className={
                                  preset.id === statementFollowUpPreset
                                    ? "nb-btn-secondary !border-[#3d6f61] !bg-[#eef7f3] !text-[#17493c]"
                                    : "nb-btn-secondary"
                                }
                                onClick={() => setStatementFollowUpPreset(preset.id)}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          {selectedStatementFollowUpPreset ? (
                            <div className="mt-3 rounded-[18px] border border-[#dbe9e2] bg-[#f7fbf8] p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d6f61]">
                                Follow-up preset
                              </p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {selectedStatementFollowUpPreset.label}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-600">
                                {selectedStatementFollowUpPreset.description}
                              </p>
                            </div>
                          ) : null}
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Copy preview
                          </p>
                          <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-700">
                            {clientStatementFollowUp || clientStatementSummary || "Choose a client to build a statement summary."}
                          </pre>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.88fr)_minmax(320px,1.12fr)]">
                        <div className="nb-stage-card rounded-[24px] p-4 md:p-5">
                          <p className="nb-stage-card__label">Statement activity</p>
                          <p className="nb-stage-card__value mt-2 text-xl">
                            {latestStatementActivity ? formatRelativeActivityTime(latestStatementActivity.recordedAt) : "No activity yet"}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {latestStatementActivity
                              ? latestStatementActivity.detail
                              : "NoteBill will remember statement copies, sends, PDF downloads, and print actions for this client here."}
                          </p>
                        </div>
                        <div className="rounded-[22px] border border-slate-100 bg-white/88 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Recent statement history
                          </p>
                          <div className="mt-3 space-y-2">
                            {statementActivityHistory.length > 0 ? (
                              statementActivityHistory.map((entry) => (
                                <div key={entry.id} className="rounded-[18px] border border-slate-100 bg-white/90 p-3">
                                  <p className="text-sm font-semibold text-slate-900">{entry.detail}</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">
                                    {formatCalendarDate(entry.recordedAt)} · {formatRelativeActivityTime(entry.recordedAt)}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs leading-5 text-slate-600">
                                Statement actions will start showing up here after the first copy, email, print, or PDF download.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <section className="order-2 nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 xl:order-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="nb-kicker">Saved context</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">What NoteBill already knows</h3>
                        </div>
                        {cadenceLabel ? <StatusChip tone="soft">{cadenceLabel}</StatusChip> : null}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Client details</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                              {selectedMemoryEntry?.details || selectedClientName}
                            </p>
                            <p className="mt-3 text-xs text-slate-500">
                              {selectedMemoryEntry ? formatUpdatedDate(selectedMemoryEntry.updatedAt) : "Not saved in client memory yet."}
                            </p>
                          </div>
                          <div className="grid gap-3">
                            {savedContextEssentials.map((item) => (
                              <div key={item.label} className="nb-stage-card rounded-[24px] p-4 md:p-5">
                                <p className="nb-stage-card__label">{item.label}</p>
                                <p className={`mt-2 text-sm font-semibold leading-6 ${item.toneClass}`}>
                                  {item.value}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <details className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                              <span>More saved context</span>
                              <span className="text-xs font-medium text-slate-500">
                                Recurring history and deeper client memory
                              </span>
                            </summary>
                            <div className="mt-4 space-y-3">
                              <div className="rounded-[18px] border border-slate-100 bg-white/90 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Recurring activity
                                </p>
                                {recurringEntry ? (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm font-semibold text-slate-700">
                                      {recurringSummary?.statusLabel || "Recurring schedule ready"}
                                    </p>
                                    <p className="text-xs leading-5 text-slate-600">
                                      {recurringEntry.intervalDays}-day cadence
                                      {recurringNextDueLabel ? ` · Next due ${recurringNextDueLabel}` : ""}
                                    </p>
                                    {recurringSummary?.lastAutoSendAt ? (
                                      <p className="text-xs leading-5 text-slate-500">
                                        Last run {formatUpdatedDate(recurringSummary.lastAutoSendAt)}
                                        {recurringSummary.lastAutoSendRecipient
                                          ? ` · ${recurringSummary.lastAutoSendRecipient}`
                                          : ""}
                                      </p>
                                    ) : null}
                                    {recurringSummary?.autoSendRunCount ? (
                                      <p className="text-xs leading-5 text-slate-500">
                                        {recurringSummary.autoSendRunCount} recurring run
                                        {recurringSummary.autoSendRunCount === 1 ? "" : "s"} recorded
                                        {recurringSummary.lastAutoSendMode ? ` · ${recurringSummary.lastAutoSendMode}` : ""}
                                      </p>
                                    ) : null}
                                    <p className="text-[11px] font-medium text-slate-500">
                                      {buildRecurringNextStepLabel(recurringEntry, {
                                        formatDueDate: formatUpdatedDate,
                                        hasInvoice: Boolean(recurringInvoice),
                                        memoryIntervalDays: selectedMemoryEntry?.recurringIntervalDays
                                      })}
                                    </p>
                                    {Array.isArray(recurringSummary?.runHistoryPreview) &&
                                    recurringSummary.runHistoryPreview.length > 0 ? (
                                      <div className="mt-2 space-y-1">
                                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                          Recent runs
                                        </p>
                                        {recurringSummary.runHistoryPreview.map((run, index) => (
                                          <p key={`${recurringInvoice.invoiceId}-run-${index}`} className="text-[11px] text-slate-400">
                                            {formatUpdatedDate(run.runAt)}
                                            {run.recipient ? ` · ${run.recipient}` : ""}
                                            {run.mode ? ` · ${run.mode}` : ""}
                                          </p>
                                        ))}
                                        {recurringSummary.runHistoryOverflowCount > 0 ? (
                                          <p className="text-[11px] text-slate-400">
                                            {recurringSummary.runHistoryOverflowCount} more run
                                            {recurringSummary.runHistoryOverflowCount === 1 ? "" : "s"} recorded
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-sm leading-6 text-slate-700">
                                    {selectedMemoryEntry?.recurringIntervalDays
                                      ? `${formatRecurringCadence(selectedMemoryEntry.recurringIntervalDays)} cadence is remembered for this client.`
                                      : "No recurring schedule saved yet."}
                                  </p>
                                )}
                                {recurringClientButtons.length > 0 ? (
                                  <div className="nb-mobile-actions mt-3">
                                    {recurringClientButtons.map((button) => (
                                      <button
                                        key={button.label}
                                        type="button"
                                        className={recurringClientButtonClass(button.label)}
                                        onClick={button.onClick}
                                      >
                                        {button.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </details>
                          <div className="rounded-[22px] border border-slate-100 bg-white/85 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Payment progress
                            </p>
                            {latestPartialInvoice ? (
                              <div className="mt-2 space-y-2">
                                {paymentProgressNextStep ? (
                                  <div className="nb-highlight-panel">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                                      {paymentProgressNextStep.eyebrow}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                      {paymentProgressNextStep.title}
                                    </p>
                                    <p className="mt-2 text-xs leading-5 text-slate-600">
                                      {paymentProgressNextStep.body}
                                    </p>
                                    <div className="nb-mobile-actions mt-3">
                                      <button
                                        type="button"
                                        className="nb-btn-primary"
                                        onClick={paymentProgressNextStep.onPrimary}
                                      >
                                        {paymentProgressNextStep.primaryLabel}
                                      </button>
                                      <button
                                        type="button"
                                        className="nb-btn-secondary"
                                        onClick={paymentProgressNextStep.onSecondary}
                                      >
                                        {paymentProgressNextStep.secondaryLabel}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-slate-700">
                                    {latestPartialInvoice.invoiceNumber || "Partial invoice"}
                                  </p>
                                  <StatusChip tone="soft">{latestPartialPaymentProgress}% complete</StatusChip>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusChip tone={latestPartialPaymentSummary?.statusTone || "info"}>
                                    {latestPartialPaymentSummary?.milestoneLabel || "Awaiting deposit"}
                                  </StatusChip>
                                  <p className="text-[11px] text-slate-500">
                                    Track deposits and milestone payments as the job moves forward.
                                  </p>
                                </div>
                                <p className="text-[11px] font-medium text-slate-500">
                                  {latestPartialPaymentSummary?.nextStepLabel || "Next step: record the first deposit."}
                                </p>
                                <div className="h-2 rounded-full bg-slate-100">
                                  <div
                                    className="h-2 rounded-full bg-[#17493c]"
                                    style={{ width: `${latestPartialPaymentProgress}%` }}
                                  />
                                </div>
                                <p className="text-xs leading-5 text-slate-600">
                                  {formatMoney(latestPartialPaymentSummary?.amountPaid ?? latestPartialPaymentAmount)} recorded ·{" "}
                                  {formatMoney(latestPartialPaymentSummary?.balanceDue ?? latestPartialPaymentBalance)} remaining
                                </p>
                                {latestPartialPaymentLatestRecord ? (
                                  <p className="text-xs leading-5 text-slate-500">
                                    Latest payment {formatMoney(Number(latestPartialPaymentLatestRecord.amount || 0))}
                                    {latestPartialPaymentLatestRecord.paidAt
                                      ? ` · ${formatUpdatedDate(latestPartialPaymentLatestRecord.paidAt)}`
                                      : ""}
                                    {latestPartialPaymentLatestRecord.note
                                      ? ` · ${latestPartialPaymentLatestRecord.note}`
                                      : ""}
                                  </p>
                                ) : null}
                                <div className="rounded-[18px] border border-slate-100 bg-white/90 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Payment timeline
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {latestPartialPaymentSummary?.timelinePreview.length > 0 ? (
                                      latestPartialPaymentSummary.timelinePreview.map((record, index) => (
                                        <div key={`${record.id ?? index}`} className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700">
                                              {record.note?.trim() || `Payment ${index + 1}`}
                                            </p>
                                            <p className="text-xs leading-5 text-slate-500">
                                              {formatMoney(Number(record.amount || 0))}
                                              {record.paidAt || record.recordedAt
                                                ? ` · ${formatUpdatedDate(record.paidAt ?? record.recordedAt)}`
                                                : ""}
                                            </p>
                                          </div>
                                          <StatusChip tone={index === 0 ? "soft" : "neutral"}>
                                            Step {index + 1}
                                          </StatusChip>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs leading-5 text-slate-500">No payment steps recorded yet.</p>
                                    )}
                                    {latestPartialPaymentSummary?.timelineOverflowCount > 0 ? (
                                      <p className="text-xs leading-5 text-slate-500">
                                        {latestPartialPaymentSummary.timelineOverflowCount} more payment step
                                        {latestPartialPaymentSummary.timelineOverflowCount === 1 ? "" : "s"} recorded.
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {latestPartialPaymentButtons.map((button, index) => (
                                    <button
                                      key={button.label}
                                      type="button"
                                      className={index === 0 ? "nb-btn-primary" : "nb-btn-secondary"}
                                      onClick={button.onClick}
                                    >
                                      {button.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                No partial payments are open for this client right now.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="order-1 nb-surface nb-surface--muted rounded-[26px] p-5 md:rounded-[30px] md:p-6 xl:order-2">
                      <p className="nb-kicker">
                        Repeat-work system
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">
                        Why this client should get faster next time
                      </h3>
                      <div className="mt-4 space-y-3">
                        <div
                          className="rounded-[22px] border border-white/80 bg-white/85 p-4"
                          data-testid="client-workspace-repeat-system"
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {repeatWorkSystemSummary.title}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {repeatWorkSystemSummary.detail}
                          </p>
                          {repeatWorkSystemSummary.chips.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {repeatWorkSystemSummary.chips.map((chip) => (
                                <span
                                  key={chip}
                                  className="rounded-full border border-[#d5e5de] bg-[#f7faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3d6f61]"
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
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
                          {bestNextMove?.primaryLabel || "Start next action"}
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

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-services">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="nb-kicker">Saved services</p>
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
                            <p className="text-sm font-semibold text-slate-900">No saved services for this client yet.</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Save or reuse one line item for this client and it will show up here for faster repeat invoices.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="nb-btn-primary"
                                onClick={() =>
                                  selectedMemoryEntry ? handleStartFromMemory(selectedMemoryEntry, leadService) : navigate("/manual")
                                }
                              >
                                Start next invoice
                              </button>
                              <button type="button" className="nb-btn-secondary" onClick={() => navigate("/settings/services")}>
                                Review service catalog
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-history">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="nb-kicker">Recent invoices</p>
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
                        {getInvoiceDocumentType(invoice) === "estimate" ? (() => {
                          const estimateSummary = buildEstimateWorkflowSummary(invoice);
                          return (
                            <StatusChip tone={estimateSummary.statusTone}>
                              {estimateSummary.statusLabel.toLowerCase()}
                            </StatusChip>
                          );
                        })() : null}
                                  <StatusChip tone={invoice.status === "paid" ? "success" : invoice.status === "sent" ? "warning" : "soft"}>
                                    {invoice.status || "draft"}
                                  </StatusChip>
                                  <StatusChip tone="soft">
                                    {formatMoney(Number(invoice.total || invoice.invoiceData?.finishedInvoice?.total || 0))}
                                  </StatusChip>
                                </div>
                              </div>
                      <div className="nb-mobile-actions mt-3">
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() => handleOpenInvoiceWithBillie(invoice)}
                                >
                                  Open with Billie
                                </button>
                        {getInvoiceDocumentType(invoice) === "estimate" ? (
                          <>
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
                                void handleSetEstimateReviewState(
                                  invoice,
                                  getEstimateReviewState(invoice) === "approved" ? "needs_review" : "approved"
                                )
                              }
                              disabled={estimateActionId === invoice.invoiceId}
                            >
                              {getEstimateReviewState(invoice) === "approved" ? "Mark needs review" : "Mark approved"}
                            </button>
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {buildEstimateWorkflowSummary(invoice).nextStepLabel}
                            </p>
                          </>
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
                            <p className="text-sm font-semibold text-slate-900">This client does not have invoice history yet.</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Once you save or send work for this client, their invoice history and next-step context will show up here automatically.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="nb-btn-primary"
                                onClick={() =>
                                  selectedMemoryEntry ? handleStartFromMemory(selectedMemoryEntry, leadService) : navigate("/ai-intake")
                                }
                              >
                                Start client invoice
                              </button>
                              <button type="button" className="nb-btn-secondary" onClick={() => navigate("/manual")}>
                                Open blank invoice
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6" data-testid="client-workspace-timeline">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="nb-kicker">Client timeline</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">A quick history of this client&apos;s work</h3>
                      </div>
                      <StatusChip tone="soft">{clientTimeline.length} items</StatusChip>
                    </div>
                    {timelineNextStep ? (
                      <div className="nb-highlight-panel mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                          Timeline next step
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {timelineNextStep.label}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          {timelineNextStep.detail}
                        </p>
                        <div className="nb-mobile-actions mt-3">
                          {timelineNextStep.actionLabel ? (
                            <button
                              type="button"
                              className="nb-btn-primary"
                              onClick={timelineNextStep.onAction}
                            >
                              {timelineNextStep.actionLabel}
                            </button>
                          ) : null}
                          {timelineNextStep.secondaryLabel && typeof timelineNextStep.onSecondary === "function" ? (
                            <button
                              type="button"
                              className="nb-btn-secondary"
                              onClick={timelineNextStep.onSecondary}
                            >
                              {timelineNextStep.secondaryLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                      {clientTimeline.length > 0 ? (
                        clientTimeline.map((entry) => (
                          <div
                            key={entry.id}
                            className={`nb-stage-card rounded-[24px] p-4 md:p-5 ${
                              entry.tone === "warning"
                                ? "nb-stage-card--warning"
                                : entry.tone === "success"
                                  ? "nb-stage-card--success"
                                  : entry.tone === "info"
                                    ? "nb-stage-card--info"
                                    : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{entry.detail}</p>
                              </div>
                              <StatusChip tone={entry.tone === "warning" ? "warning" : entry.tone === "success" ? "success" : "soft"}>
                                {entry.tone === "warning" ? "Watch" : entry.tone === "success" ? "Ready" : "Info"}
                              </StatusChip>
                            </div>
                            {entry.actionLabel ? (
                              <button
                                type="button"
                                className="mt-3 nb-btn-secondary w-full justify-center"
                                onClick={entry.onAction}
                              >
                                {entry.actionLabel}
                              </button>
                            ) : null}
                            {entry.secondaryLabel && typeof entry.onSecondary === "function" ? (
                              <button
                                type="button"
                                className="mt-2 nb-btn-secondary w-full justify-center"
                                onClick={entry.onSecondary}
                              >
                                {entry.secondaryLabel}
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4 md:col-span-2 xl:col-span-4">
                          <p className="text-sm font-semibold text-slate-900">This timeline will fill in as work happens.</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            As this client gets estimates, payments, recurring sends, and saved memory, NoteBill will turn them into a quick history here.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="nb-btn-primary"
                              onClick={() =>
                                selectedMemoryEntry ? handleStartFromMemory(selectedMemoryEntry, leadService) : navigate("/ai-intake")
                              }
                            >
                              Start next action
                            </button>
                            <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices")}>
                              Open library
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
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
