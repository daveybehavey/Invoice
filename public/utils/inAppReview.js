(() => {
  const ANDROID_REVIEW_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 120;

  const getRequestIdentity = () => window.InvoiceRequestIdentity || null;
  const getScopedStorageKey = (key) =>
    getRequestIdentity()?.getScopedStorageKey?.(`androidReview:${key}`) ?? `androidReview:${key}`;
  const getInAppReviewPlugin = () => window.Capacitor?.Plugins?.InAppReview ?? null;

  const readStorage = (key) => {
    try {
      return window.localStorage.getItem(getScopedStorageKey(key)) || "";
    } catch (_error) {
      return "";
    }
  };

  const writeStorage = (key, value) => {
    try {
      window.localStorage.setItem(getScopedStorageKey(key), value);
    } catch (_error) {
      // Best effort only.
    }
  };

  const isAndroidCapacitor = () => {
    try {
      return window.Capacitor?.getPlatform?.() === "android";
    } catch (_error) {
      return false;
    }
  };

  const normalizeMilestone = (milestone) => String(milestone || "").trim().toLowerCase();

  const markReviewMilestone = (milestone) => {
    const normalized = normalizeMilestone(milestone);
    if (!normalized) {
      return false;
    }
    const existing = readStorage(`milestone:${normalized}`);
    if (existing) {
      return false;
    }
    writeStorage(`milestone:${normalized}`, new Date().toISOString());
    return true;
  };

  const hasReviewMilestone = (milestone) => Boolean(readStorage(`milestone:${normalizeMilestone(milestone)}`));

  const isCooldownActive = () => {
    const promptedAt = readStorage("lastPromptAt");
    if (!promptedAt) {
      return false;
    }
    const promptedMs = Date.parse(promptedAt);
    if (!Number.isFinite(promptedMs)) {
      return false;
    }
    return Date.now() - promptedMs < ANDROID_REVIEW_COOLDOWN_MS;
  };

  const isEligibleForReview = () =>
    hasReviewMilestone("invoice_sent") ||
    (hasReviewMilestone("invoice_saved") && hasReviewMilestone("payment_link_added")) ||
    (hasReviewMilestone("invoice_saved") && hasReviewMilestone("invoice_reopened"));

  const maybeRequestInAppReview = async (trigger = "unknown") => {
    if (!isAndroidCapacitor()) {
      return { requested: false, reason: "not_android" };
    }
    const plugin = getInAppReviewPlugin();
    if (!plugin?.requestReview) {
      return { requested: false, reason: "plugin_unavailable" };
    }
    if (isCooldownActive()) {
      return { requested: false, reason: "cooldown" };
    }
    if (!isEligibleForReview()) {
      return { requested: false, reason: "not_eligible" };
    }

    try {
      const result = await plugin.requestReview({ trigger });
      const attempted = Boolean(result?.attempted || result?.requested || result?.flowFinished);
      if (attempted) {
        writeStorage("lastPromptAt", new Date().toISOString());
        writeStorage("lastTrigger", String(trigger || "unknown"));
      }
      return {
        requested: attempted,
        reason: attempted ? "attempted" : String(result?.message || "not_available")
      };
    } catch (error) {
      return {
        requested: false,
        reason: String(error?.message || "request_failed")
      };
    }
  };

  window.InvoiceInAppReview = Object.freeze({
    markReviewMilestone,
    maybeRequestInAppReview
  });
})();
