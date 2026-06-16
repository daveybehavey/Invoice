(() => {
  const getRequestIdentity = () => window.InvoiceRequestIdentity || null;
  const getApiFetch = () => getRequestIdentity()?.apiFetch ?? window.fetch.bind(window);
  const analytics = window.InvoiceAnalytics || null;
  const getMilestoneStorageKey = (event) =>
    getRequestIdentity()?.getScopedStorageKey?.(`revenueMilestone:${event}`) ?? `revenueMilestone:${event}`;

  const trackRevenueSignal = (event, source) => {
    if (!event) {
      return;
    }
    analytics?.trackRevenueSignal?.(event, { source: source || "unknown" });
    try {
      const payload = JSON.stringify({ event, source });
      const endpoint = "/api/telemetry/revenue-signals";
      void getApiFetch()(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true
      });
    } catch (_error) {
      // Best effort only.
    }
  };

  const trackRevenueSignalWithCooldown = (event, source, cooldownMs = 30_000) => {
    if (!event) {
      return false;
    }
    const storageKey = getMilestoneStorageKey(`cooldown:${event}`);
    const now = Date.now();
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      const previousAt = rawValue ? Number(rawValue) : 0;
      if (Number.isFinite(previousAt) && previousAt > 0 && now - previousAt < cooldownMs) {
        return false;
      }
      window.localStorage.setItem(storageKey, String(now));
    } catch (_error) {
      // Best effort only. If storage is unavailable, still emit the signal.
    }
    trackRevenueSignal(event, source);
    return true;
  };

  const trackRevenueSignalOnce = (event, source) => {
    if (!event) {
      return false;
    }
    const storageKey = getMilestoneStorageKey(event);
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing && existing.trim()) {
        return false;
      }
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch (_error) {
      // Best effort only. If storage is unavailable, still emit this call.
    }
    trackRevenueSignal(event, source);
    return true;
  };

  const trackAuthSignal = (event, source) => {
    trackRevenueSignal(event, source || "auth");
  };

  window.InvoiceRevenueAnalytics = Object.freeze({
    trackRevenueSignal,
    trackRevenueSignalWithCooldown,
    trackRevenueSignalOnce,
    trackAuthSignal
  });
})();
