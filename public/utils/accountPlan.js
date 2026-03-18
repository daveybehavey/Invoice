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
    if (remaining === null || remaining <= 0) {
      return "";
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
    const nearLimit = remaining !== null && remaining <= 3;
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
      statusTone,
      progressLabel,
      remainingLabel
    };
  };

  window.InvoiceAccountPlanUtils = {
    formatPlanSummary,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getPlanPrelimitWarning,
    getPlanUsageModel
  };
})();
