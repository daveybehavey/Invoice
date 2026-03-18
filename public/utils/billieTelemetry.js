(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  const defaultStorageKey = "billieRefineTelemetry";

  const getStorageKey = () => {
    const scoped = requestIdentity?.getScopedStorageKey?.(defaultStorageKey);
    return scoped || defaultStorageKey;
  };

  const readEvents = () => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(getStorageKey());
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.events)) {
        return [];
      }
      return parsed.events
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          source: typeof entry.source === "string" ? entry.source : "unknown",
          outcome: typeof entry.outcome === "string" ? entry.outcome : "unknown",
          durationMs: Number(entry.durationMs),
          at: typeof entry.at === "string" ? entry.at : ""
        }))
        .filter((entry) => Number.isFinite(entry.durationMs) && entry.durationMs >= 0 && entry.at);
    } catch (_error) {
      return [];
    }
  };

  const writeEvents = (events) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(getStorageKey(), JSON.stringify({ events }));
    } catch (_error) {
      // Best effort only.
    }
  };

  const percentile = (values, percentileValue) => {
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentileValue / 100) * sorted.length)));
    return sorted[index];
  };

  const formatDuration = (valueMs) => {
    if (!Number.isFinite(valueMs)) {
      return "";
    }
    const seconds = valueMs / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  };

  const recordRefineEvent = (event) => {
    const durationMs = Number(event?.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return null;
    }
    const nextEvent = {
      source: typeof event?.source === "string" ? event.source : "unknown",
      outcome: typeof event?.outcome === "string" ? event.outcome : "unknown",
      durationMs,
      at: new Date().toISOString()
    };
    const previous = readEvents();
    const nextEvents = [...previous, nextEvent].slice(-80);
    writeEvents(nextEvents);
    return nextEvent;
  };

  const getRefineSummary = (source) => {
    const events = readEvents().filter((event) => {
      if (!source) {
        return true;
      }
      return event.source === source;
    });
    if (events.length === 0) {
      return {
        count: 0,
        p50Ms: null,
        p95Ms: null,
        lastMs: null,
        lastAt: null
      };
    }
    const durations = events.map((event) => event.durationMs);
    const latest = events[events.length - 1];
    return {
      count: events.length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      lastMs: latest.durationMs,
      lastAt: latest.at
    };
  };

  const formatRefineSummaryLabel = (summary) => {
    if (!summary || !Number.isFinite(summary?.lastMs)) {
      return "";
    }
    const last = formatDuration(summary.lastMs);
    const p50 = Number.isFinite(summary.p50Ms) ? formatDuration(summary.p50Ms) : "";
    const p95 = Number.isFinite(summary.p95Ms) ? formatDuration(summary.p95Ms) : "";
    const segments = [`Last ${last}`];
    if (p50) {
      segments.push(`p50 ${p50}`);
    }
    if (p95) {
      segments.push(`p95 ${p95}`);
    }
    return segments.join(" · ");
  };

  window.InvoiceBillieTelemetry = {
    recordRefineEvent,
    getRefineSummary,
    formatRefineSummaryLabel,
    formatDuration
  };
})();
