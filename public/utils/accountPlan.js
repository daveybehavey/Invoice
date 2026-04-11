(() => {
  const formatPlanSummary = (plan) => {
    if (!plan || typeof plan !== "object") {
      return "";
    }
    const tier = plan.plan === "pro" ? "Pro" : "Free";
    const limit = Number.isFinite(plan?.limits?.invoicesPerMonth) ? plan.limits.invoicesPerMonth : null;
    const used = Number.isFinite(plan?.usage?.invoicesCreated) ? plan.usage.invoicesCreated : 0;
    const remaining = Number.isFinite(plan?.usage?.invoicesRemaining) ? plan.usage.invoicesRemaining : null;
    if (tier === "Pro") {
      return "Pro plan · Unlimited saved invoices";
    }
    if (limit === null) {
      return "Free plan · Unlimited saved invoices";
    }
    if (remaining !== null && remaining <= 0) {
      return `Free plan · ${used}/${limit} saved this month (limit reached)`;
    }
    return `Free plan · ${used}/${limit} saved this month`;
  };

  const getPlanUpgradeUrl = (plan) => {
    const value = plan?.links?.upgradeUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const getPlanBillingPortalUrl = (plan) => {
    const value = plan?.links?.billingPortalUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const getPlanPrelimitWarning = (plan) => {
    if (!plan || typeof plan !== "object") {
      return "";
    }
    if (plan.plan === "pro") {
      return "";
    }
    const remaining = Number.isFinite(plan?.usage?.invoicesRemaining)
      ? Number(plan.usage.invoicesRemaining)
      : null;
    const guidanceThresholdRaw = Number(plan?.upgradeGuidance?.prelimitStartRemaining);
    const prelimitStartRemaining = Number.isFinite(guidanceThresholdRaw)
      ? Math.min(10, Math.max(1, Math.round(guidanceThresholdRaw)))
      : 3;
    const warningVariant = plan?.upgradeGuidance?.warningVariant === "early" ? "early" : "default";
    if (remaining === null || remaining <= 0) {
      return "";
    }
    if (remaining <= prelimitStartRemaining && remaining > 1) {
      if (warningVariant === "early") {
        return `${remaining} saves left this month. Upgrade early before save lock.`;
      }
      return `${remaining} saves left this month. Upgrade now to avoid a save lock.`;
    }
    if (remaining === 1) {
      return "1 save left this month before upgrade is required.";
    }
    return "";
  };

  const getPlanUsageModel = (plan) => {
    if (!plan || typeof plan !== "object") {
      return null;
    }
    const tier = plan.plan === "pro" ? "pro" : "free";
    const limit = Number.isFinite(plan?.limits?.invoicesPerMonth) ? Number(plan.limits.invoicesPerMonth) : null;
    const used = Number.isFinite(plan?.usage?.invoicesCreated) ? Math.max(0, Number(plan.usage.invoicesCreated)) : 0;
    const remaining = Number.isFinite(plan?.usage?.invoicesRemaining)
      ? Math.max(0, Number(plan.usage.invoicesRemaining))
      : null;

    if (tier === "pro" || limit === null || limit <= 0) {
      return {
        tier,
        finite: false,
        used,
        limit,
        remaining,
        progressPercent: 0,
        statusTone: "pro",
        progressLabel: tier === "pro" ? "Unlimited saved invoices on Pro." : "Unlimited saved invoices."
      };
    }

    const progressPercent = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
    const guidanceThresholdRaw = Number(plan?.upgradeGuidance?.prelimitStartRemaining);
    const prelimitStartRemaining = Number.isFinite(guidanceThresholdRaw)
      ? Math.min(10, Math.max(1, Math.round(guidanceThresholdRaw)))
      : 3;
    const nearLimit = remaining !== null && remaining <= prelimitStartRemaining;
    const atLimit = remaining !== null && remaining <= 0;
    const statusTone = atLimit ? "limit" : nearLimit ? "warning" : "normal";
    const progressLabel = `${used}/${limit} saves used this month`;
    const remainingLabel =
      remaining === null
        ? ""
        : remaining === 1
          ? "1 save remaining"
          : `${remaining} saves remaining`;

    return {
      tier,
      finite: true,
      used,
      limit,
      remaining,
      progressPercent,
      prelimitStartRemaining,
      statusTone,
      progressLabel,
      remainingLabel
    };
  };

  const normalizeUpgradeSource = (value) => {
    if (value === "launcher" || value === "intake" || value === "manual" || value === "library" || value === "import") {
      return value;
    }
    return "unknown";
  };

  const normalizeUpgradePhase = (value) => {
    if (value === "warning" || value === "limit" || value === "primary") {
      return value;
    }
    return "warning";
  };

  const getPlanUpgradeCtaLabel = (plan, options = {}) => {
    const phase = normalizeUpgradePhase(options?.phase);
    const source = normalizeUpgradeSource(options?.source);
    const reason =
      plan?.upgradeGuidance?.reason === "low_click_rate" || plan?.upgradeGuidance?.reason === "low_checkout_start_rate"
        ? plan.upgradeGuidance.reason
        : "default";

    if (phase === "limit") {
      if (reason === "low_checkout_start_rate") {
        return "Open upgrade";
      }
      return "Upgrade plan";
    }

    if (phase === "primary") {
      if (reason === "low_click_rate") {
        return "See Pro";
      }
      if (reason === "low_checkout_start_rate") {
        return "View plans";
      }
      return "Upgrade";
    }

    if (reason === "low_checkout_start_rate") {
      return "See Pro options";
    }
    if (reason === "low_click_rate") {
      if (source === "intake") {
        return "Keep drafting";
      }
      if (source === "import") {
        return "Import without limits";
      }
      if (source === "manual") {
        return "Keep editing";
      }
      if (source === "library") {
        return "Save more invoices";
      }
      return "Unlock Pro";
    }
    return "Upgrade early";
  };

  window.InvoiceAccountPlanUtils = {
    formatPlanSummary,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getPlanPrelimitWarning,
    getPlanUsageModel,
    getPlanUpgradeCtaLabel
  };
})();
