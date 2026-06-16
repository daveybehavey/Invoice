(() => {
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

  const formatRecurringCadence = (intervalDays, options = {}) => {
    const normalized = normalizeRecurringInterval(intervalDays);
    const titleCase = Boolean(options?.titleCase);
    const labelMap = {
      7: titleCase ? "Weekly" : "weekly",
      14: titleCase ? "Biweekly" : "biweekly",
      30: titleCase ? "Monthly" : "monthly",
      90: titleCase ? "Quarterly" : "quarterly"
    };
    if (labelMap[normalized]) {
      return labelMap[normalized];
    }
    return titleCase ? `Every ${normalized} days` : `${normalized}-day`;
  };

  const parseRecurringTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const buildRecurringScheduleSummary = (entry, options = {}) => {
    const nowMs = Number.isFinite(Number(options?.nowMs)) ? Number(options.nowMs) : Date.now();
    const dueSoonWindowMs = Number.isFinite(Number(options?.dueSoonWindowMs))
      ? Number(options.dueSoonWindowMs)
      : 7 * 24 * 60 * 60 * 1000;
    const runHistoryLimit = Math.max(0, Number(options?.runHistoryLimit ?? 2) || 0);
    const nextDueMs = parseRecurringTimestamp(entry?.nextDueAt);
    const autoSendEnabled = Boolean(entry?.autoSendEnabled);
    const lastAutoSendAt =
      typeof entry?.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim() ? entry.lastAutoSendAt.trim() : "";
    const lastAutoSendRecipient =
      typeof entry?.lastAutoSendRecipient === "string" ? entry.lastAutoSendRecipient.trim().toLowerCase() : "";
    const lastAutoSendMode =
      typeof entry?.lastAutoSendMode === "string" ? entry.lastAutoSendMode.trim() : "";
    const autoSendRunCount = Math.max(0, Number(entry?.autoSendRunCount ?? 0) || 0);
    const normalizedRunHistory = Array.isArray(entry?.runHistory)
      ? entry.runHistory
          .map((run) => ({
            runAt: typeof run?.runAt === "string" && run.runAt.trim() ? run.runAt.trim() : "",
            recipient: typeof run?.recipient === "string" ? run.recipient.trim().toLowerCase() : "",
            mode: typeof run?.mode === "string" ? run.mode.trim() : ""
          }))
          .filter((run) => Boolean(run.runAt))
          .slice(0, 5)
      : [];
    const dueNow = Number.isFinite(nextDueMs) && nextDueMs <= nowMs;
    const dueSoon =
      Number.isFinite(nextDueMs) && nextDueMs > nowMs && nextDueMs - nowMs <= dueSoonWindowMs;
    const statusLabel = autoSendEnabled
      ? "Auto-send armed"
      : dueNow
        ? "Due now"
        : dueSoon
          ? "Due soon"
          : normalizedRunHistory.length > 0
            ? "Scheduled"
            : "Recurring";
    const statusTone = autoSendEnabled ? "success" : dueNow ? "warning" : "soft";
    return {
      nextDueMs,
      autoSendEnabled,
      autoSendRunCount,
      lastAutoSendAt,
      lastAutoSendRecipient,
      lastAutoSendMode,
      dueNow,
      dueSoon,
      statusLabel,
      statusTone,
      runHistoryPreview: normalizedRunHistory.slice(0, runHistoryLimit),
      runHistoryOverflowCount: Math.max(0, normalizedRunHistory.length - runHistoryLimit)
    };
  };

  const buildRecurringNextStepLabel = (entry, options = {}) => {
    const formatDueDate = typeof options?.formatDueDate === "function" ? options.formatDueDate : (value) => String(value ?? "");
    const hasInvoice = Boolean(options?.hasInvoice);
    const memoryIntervalDays = Number(options?.memoryIntervalDays ?? NaN);
    if (entry?.autoSendEnabled) {
      return entry.nextDueAt
        ? `Next step: review the recurring send before ${formatDueDate(entry.nextDueAt)}.`
        : "Next step: review the recurring send before it fires.";
    }
    if (entry?.lastAutoSendAt) {
      return entry.nextDueAt
        ? `Next step: prep the next run for ${formatDueDate(entry.nextDueAt)}.`
        : "Next step: prep the next recurring run.";
    }
    if (Number.isFinite(memoryIntervalDays) && memoryIntervalDays > 0) {
      return `Next step: set up the saved ${formatRecurringCadence(memoryIntervalDays, { titleCase: true })} cadence.`;
    }
    if (hasInvoice) {
      return "Next step: save a recurring cadence for this client.";
    }
    return "Next step: build repeat memory for this client.";
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
          intervalDays: normalizeRecurringInterval(entry.intervalDays ?? 30),
          nextDueAt: typeof entry.nextDueAt === "string" ? entry.nextDueAt : "",
          autoSendEnabled: Boolean(entry.autoSendEnabled),
          autoSendRunCount: Math.max(0, Number(entry.autoSendRunCount ?? 0) || 0),
          lastAutoSendAt:
            typeof entry.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim()
              ? entry.lastAutoSendAt
              : "",
          lastAutoSendRecipient:
            typeof entry.lastAutoSendRecipient === "string" ? entry.lastAutoSendRecipient.trim().toLowerCase() : "",
          lastAutoSendMode: typeof entry.lastAutoSendMode === "string" ? entry.lastAutoSendMode.trim() : "",
          runHistory: Array.isArray(entry.runHistory)
            ? entry.runHistory
                .map((run) => ({
                  runAt: typeof run?.runAt === "string" && run.runAt.trim() ? run.runAt.trim() : "",
                  recipient: typeof run?.recipient === "string" ? run.recipient.trim().toLowerCase() : "",
                  mode: typeof run?.mode === "string" ? run.mode.trim() : ""
                }))
                .filter((run) => Boolean(run.runAt))
                .slice(0, 5)
            : []
        };
        return result;
      }, {});
    } catch (_error) {
      return {};
    }
  };

  const getRecurringAutoSendRecipient = (invoice, clientMemoryEntries = []) => {
    const normalizeName = (value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : "");
    const rememberedRecipient =
      (Array.isArray(clientMemoryEntries) ? clientMemoryEntries : []).find(
        (entry) =>
          normalizeName(entry?.name) ===
          normalizeName(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "")
      )?.recipientEmail ?? "";
    const deliveryRecipient = invoice?.delivery?.recipientEmail ?? "";
    const nextRecipient = String(rememberedRecipient || deliveryRecipient).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextRecipient) ? nextRecipient : "";
  };

  window.InvoiceRecurringUtils = {
    normalizeRecurringInterval,
    formatRecurringCadence,
    parseRecurringTimestamp,
    buildRecurringScheduleSummary,
    buildRecurringNextStepLabel,
    readRecurringSchedules,
    getRecurringAutoSendRecipient
  };
})();
