(() => {
  const PENDING_UPGRADE_KEY = "invoicePendingUpgradeCheckout";
  const PENDING_UPGRADE_TTL_MS = 30 * 60 * 1000;

  const getRequestIdentity = () => window.InvoiceRequestIdentity;
  const apiFetch = (input, init) => {
    const requestIdentity = getRequestIdentity();
    if (typeof requestIdentity?.apiFetch === "function") {
      return requestIdentity.apiFetch(input, init);
    }
    return window.fetch(input, init);
  };
  const getAuthSession = () => getRequestIdentity()?.getAuthSession?.() ?? null;

  const readBillingNoticeFromUrl = () => {
    if (typeof window === "undefined") {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const billingState = params.get("billing");
    if (billingState !== "success" && billingState !== "cancelled") {
      return null;
    }
    const notice =
      billingState === "success"
        ? {
            tone: "green",
            message: "Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription."
          }
        : {
            tone: "amber",
            message: "Upgrade cancelled. You can keep using free mode or try again anytime."
          };

    params.delete("billing");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
    return notice;
  };

  const hasStripeCheckout = (plan) =>
    plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.checkoutAvailable);

  const hasStripePortal = (plan) =>
    plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.portalAvailable);

  const createIntentId = () => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_error) {
      // Fall through.
    }
    return `intent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const sanitizeAppPath = (value, fallback) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized.startsWith("/") || normalized.startsWith("//")) {
      return fallback;
    }
    return normalized;
  };

  const writePendingUpgradeIntent = (intent) => {
    window.localStorage.setItem(PENDING_UPGRADE_KEY, JSON.stringify(intent));
  };

  const clearPendingUpgradeCheckout = () => {
    try {
      window.localStorage.removeItem(PENDING_UPGRADE_KEY);
    } catch (_error) {
      // Best-effort only.
    }
  };

  const parsePendingUpgradeIntent = (raw) => {
    if (!raw) {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const intentId = typeof parsed.intentId === "string" ? parsed.intentId.trim() : "";
    const createdAt = Number(parsed.createdAt);
    const expiresAt = Number(parsed.expiresAt);
    if (!intentId || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
      return null;
    }
    if (expiresAt <= Date.now()) {
      return null;
    }
    return {
      intentId,
      successPath: sanitizeAppPath(parsed.successPath, "/?billing=success"),
      cancelPath: sanitizeAppPath(parsed.cancelPath, "/?billing=cancelled"),
      createdAt,
      expiresAt
    };
  };

  const rememberPendingUpgradeCheckout = (options = {}) => {
    const now = Date.now();
    const intent = {
      intentId: typeof options.intentId === "string" && options.intentId.trim() ? options.intentId.trim() : createIntentId(),
      successPath: sanitizeAppPath(options.successPath, "/?billing=success"),
      cancelPath: sanitizeAppPath(options.cancelPath, "/?billing=cancelled"),
      createdAt: Number.isFinite(Number(options.createdAt)) ? Number(options.createdAt) : now,
      expiresAt: Number.isFinite(Number(options.expiresAt))
        ? Number(options.expiresAt)
        : now + PENDING_UPGRADE_TTL_MS
    };
    try {
      writePendingUpgradeIntent(intent);
    } catch (_error) {
      // Best-effort only.
    }
    return intent;
  };

  const peekPendingUpgradeCheckout = () => {
    try {
      const intent = parsePendingUpgradeIntent(window.localStorage.getItem(PENDING_UPGRADE_KEY));
      if (!intent) {
        clearPendingUpgradeCheckout();
        return null;
      }
      return intent;
    } catch (_error) {
      clearPendingUpgradeCheckout();
      return null;
    }
  };

  const takePendingUpgradeCheckout = () => {
    const intent = peekPendingUpgradeCheckout();
    if (!intent) {
      return null;
    }
    clearPendingUpgradeCheckout();
    return intent;
  };

  const restorePendingUpgradeCheckout = (intent) => {
    if (!intent?.intentId) {
      return;
    }
    if (Number(intent.expiresAt) <= Date.now()) {
      return;
    }
    rememberPendingUpgradeCheckout(intent);
  };

  const consumePendingUpgradeCheckout = () => takePendingUpgradeCheckout();

  const startUpgradeCheckout = async (plan, options = {}) => {
    if (!hasStripeCheckout(plan)) {
      const fallbackUrl = getPlanUpgradeUrl(plan);
      if (!fallbackUrl) {
        throw new Error("Upgrade is not configured yet.");
      }
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return { started: false, reason: "fallback" };
    }

    const session = options.authSession || getAuthSession();
    if (!session?.userId || !session?.email) {
      if (!options.skipAuthRemember) {
        rememberPendingUpgradeCheckout(options);
      }
      const error = new Error("Sign in to upgrade to Pro.");
      error.code = "AUTH_REQUIRED_FOR_UPGRADE";
      throw error;
    }

    const resumeIntentId =
      typeof options.resumeIntentId === "string" && options.resumeIntentId.trim()
        ? options.resumeIntentId.trim()
        : undefined;

    const response = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        successPath: options.successPath,
        cancelPath: options.cancelPath,
        resumeIntentId
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      if (!options.skipAuthRemember) {
        rememberPendingUpgradeCheckout({
          ...options,
          intentId: resumeIntentId
        });
      }
      const error = new Error(payload?.error || "Sign in to upgrade to Pro.");
      error.code = "AUTH_REQUIRED_FOR_UPGRADE";
      throw error;
    }
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    window.location.href = payload.url;
    return {
      started: true,
      url: payload.url,
      sessionId: payload.sessionId || "",
      resumeIntentId: resumeIntentId || null
    };
  };

  let resumeInFlightPromise = null;

  const resumePendingUpgradeCheckout = async (options = {}) => {
    if (resumeInFlightPromise) {
      return resumeInFlightPromise;
    }
    resumeInFlightPromise = (async () => {
      const session =
        options.session && typeof options.session === "object" && options.session.userId
          ? options.session
          : getAuthSession();
      if (!session?.userId || !session?.email) {
        return { resumed: false, reason: "unauthenticated" };
      }
      const pending = takePendingUpgradeCheckout();
      if (!pending) {
        return { resumed: false, reason: "none" };
      }

      let plan = options.plan;
      try {
        if (!plan || !hasStripeCheckout(plan)) {
          const planResponse = await apiFetch("/api/account/plan");
          plan = planResponse.ok ? await planResponse.json().catch(() => null) : null;
        }
        if (!hasStripeCheckout(plan)) {
          throw new Error("Upgrade is not configured yet.");
        }
        await startUpgradeCheckout(plan, {
          successPath: pending.successPath,
          cancelPath: pending.cancelPath,
          resumeIntentId: pending.intentId,
          skipAuthRemember: true,
          authSession: session
        });
        return { resumed: true, intentId: pending.intentId };
      } catch (error) {
        restorePendingUpgradeCheckout(pending);
        throw error;
      }
    })().finally(() => {
      resumeInFlightPromise = null;
    });
    return resumeInFlightPromise;
  };

  const openBillingPortal = async (plan, options = {}) => {
    if (!hasStripePortal(plan)) {
      const fallbackUrl = getPlanBillingPortalUrl(plan);
      if (!fallbackUrl) {
        throw new Error("Billing portal is not configured yet.");
      }
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const response = await apiFetch("/api/billing/portal-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnPath: options.returnPath
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Unable to open billing settings.");
    }
    window.location.assign(payload.url);
  };

  const getPlanUpgradeUrl = (plan) => {
    const value = plan?.links?.upgradeUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const getPlanBillingPortalUrl = (plan) => {
    const value = plan?.links?.billingPortalUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  window.InvoiceBillingActions = {
    readBillingNoticeFromUrl,
    hasStripeCheckout,
    hasStripePortal,
    startUpgradeCheckout,
    openBillingPortal,
    rememberPendingUpgradeCheckout,
    consumePendingUpgradeCheckout,
    peekPendingUpgradeCheckout,
    takePendingUpgradeCheckout,
    restorePendingUpgradeCheckout,
    clearPendingUpgradeCheckout,
    resumePendingUpgradeCheckout,
    PENDING_UPGRADE_TTL_MS
  };
})();
