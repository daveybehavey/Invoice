(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
  const exposureSessionKey = "invoiceUpgradeExposureEvents";
  const allowedSources = new Set(["launcher", "intake", "manual", "library", "import", "unknown"]);
  const allowedTypes = new Set([
    "warning_view",
    "limit_view",
    "upgrade_click",
    "checkout_started",
    "checkout_success",
    "checkout_cancelled",
    "billing_portal_opened"
  ]);

  const normalizeSource = (value) => {
    if (typeof value !== "string") {
      return "unknown";
    }
    const normalized = value.trim().toLowerCase();
    if (allowedSources.has(normalized)) {
      return normalized;
    }
    return "unknown";
  };

  const normalizePlanTier = (value) => {
    if (value === "free" || value === "pro") {
      return value;
    }
    return undefined;
  };

  const normalizeRemainingSaves = (value) => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return Math.max(0, Math.round(Number(value)));
  };

  const inferSourceFromPathname = (pathname) => {
    const value = typeof pathname === "string" ? pathname.toLowerCase() : "";
    if (value === "/ai-intake") {
      return "intake";
    }
    if (value === "/manual") {
      return "manual";
    }
    if (value === "/invoices") {
      return "library";
    }
    if (value === "/import") {
      return "import";
    }
    if (value === "/" || value === "") {
      return "launcher";
    }
    return "unknown";
  };

  const postEvent = (event) => {
    if (!allowedTypes.has(event.eventType)) {
      return;
    }
    const payload = {
      eventType: event.eventType,
      source: normalizeSource(event.source),
      planTier: normalizePlanTier(event.planTier),
      remainingSaves: normalizeRemainingSaves(event.remainingSaves)
    };
    const body = JSON.stringify(payload);
    void apiFetch("/api/telemetry/upgrade-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }).catch(() => {
      // Best-effort telemetry only.
    });
  };

  const readExposureMap = () => {
    try {
      const raw = window.sessionStorage.getItem(exposureSessionKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  };

  const writeExposureMap = (value) => {
    try {
      window.sessionStorage.setItem(exposureSessionKey, JSON.stringify(value));
    } catch (_error) {
      // Best-effort telemetry only.
    }
  };

  const trackExposure = ({ source, eventType, planTier, remainingSaves }) => {
    const dayKey = new Date().toISOString().slice(0, 10);
    const eventKey = `${dayKey}:${normalizeSource(source)}:${eventType}:${normalizeRemainingSaves(remainingSaves) ?? "na"}`;
    const exposureMap = readExposureMap();
    if (exposureMap[eventKey]) {
      return;
    }
    exposureMap[eventKey] = true;
    writeExposureMap(exposureMap);
    postEvent({ source, eventType, planTier, remainingSaves });
  };

  const trackWarningExposure = (input) =>
    trackExposure({
      source: input?.source,
      eventType: "warning_view",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  const trackLimitExposure = (input) =>
    trackExposure({
      source: input?.source,
      eventType: "limit_view",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  const trackUpgradeClick = (input) =>
    postEvent({
      source: input?.source,
      eventType: "upgrade_click",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  const trackCheckoutStarted = (input) =>
    postEvent({
      source: input?.source,
      eventType: "checkout_started",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  const trackCheckoutReturn = (input) =>
    postEvent({
      source: input?.source,
      eventType: input?.status === "success" ? "checkout_success" : "checkout_cancelled",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  const trackBillingPortalOpened = (input) =>
    postEvent({
      source: input?.source,
      eventType: "billing_portal_opened",
      planTier: input?.planTier,
      remainingSaves: input?.remainingSaves
    });

  window.InvoiceUpgradeTelemetry = {
    inferSourceFromPathname,
    trackWarningExposure,
    trackLimitExposure,
    trackUpgradeClick,
    trackCheckoutStarted,
    trackCheckoutReturn,
    trackBillingPortalOpened
  };
})();
