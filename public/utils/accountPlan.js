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

  const getPlanValuePitch = (plan) => {
    if (!plan || typeof plan !== "object") {
      return "";
    }
    if (plan.plan === "pro") {
      return "";
    }
    const remaining = Number.isFinite(plan?.usage?.invoicesRemaining)
      ? Number(plan.usage.invoicesRemaining)
      : null;
    if (remaining === null || remaining > 1) {
      return "";
    }
    return "Pro keeps sends, reminders, hosted payment links, saved client memory, and follow-up in one place.";
  };

  const getPlanFeatureHighlights = (plan) => {
    if (!plan || typeof plan !== "object") {
      return [];
    }
    if (plan.plan === "pro") {
      return ["Unlimited saves", "Send + reminders", "Payment links", "Client memory"];
    }
    return ["Draft + export", "Limited monthly saves", "Guest mode available"];
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

  const getBillingStatusModel = (plan) => {
    if (!plan || typeof plan !== "object") {
      return {
        tierLabel: "Checking",
        sourceLabel: "Loading billing status",
        headline: "Checking your billing status...",
        detail: "NoteBill is confirming the current plan and available billing controls.",
        tone: "neutral"
      };
    }
    const isPro = plan.plan === "pro";
    const googlePlay = plan?.billing?.googlePlay ?? {};
    const hasGooglePlay = Boolean(googlePlay?.verificationAvailable);
    const googlePlayEntitlements = googlePlay?.entitlements ?? {};
    const hasGooglePlayHistory =
      Number.isFinite(googlePlayEntitlements?.subscriptionCount) &&
      Number(googlePlayEntitlements.subscriptionCount) > 0;
    const hasActiveGooglePlayEntitlement =
      Number.isFinite(googlePlayEntitlements?.activeSubscriptionCount) &&
      Number(googlePlayEntitlements.activeSubscriptionCount) > 0;
    const googlePlayNeedsRestore =
      !isPro &&
      hasGooglePlay &&
      hasGooglePlayHistory &&
      !hasActiveGooglePlayEntitlement;
    const hasStripe =
      plan?.billing?.provider === "stripe" &&
      Boolean(plan?.billing?.checkoutAvailable || plan?.billing?.portalAvailable);
    const sourceLabel = hasGooglePlay
      ? "Google Play ready"
      : hasStripe
        ? "Stripe ready"
        : "Billing setup pending";
    if (isPro) {
      return {
        tierLabel: "Pro active",
        sourceLabel,
        headline: "Pro is active on this account.",
        detail:
          "Sends, reminders, hosted payment links, client portals, duplicate invoices, and unlimited saves are unlocked.",
        tone: "success"
      };
    }
    if (googlePlayNeedsRestore) {
      return {
        tierLabel: "Restore recommended",
        sourceLabel: "Google Play history found",
        headline: "Google Play purchase history exists, but Pro is not active yet.",
        detail:
          "Open the installed NoteBill app and tap Restore purchases. If Google Play still says you already have this plan, that Play account is probably stuck on an older test/extension state.",
        tone: "warning"
      };
    }
    return {
      tierLabel: "Free plan",
      sourceLabel,
      headline: "Free mode is safe for drafting and exporting.",
      detail:
        "Upgrade when you need send workflow, reminders, hosted payment links, client portals, repeat-work shortcuts, or more saved invoices. Monthly is the simple ongoing option. Lifetime is the one-and-done option for people who know they will keep using it.",
      tone: plan.upgradeRequired ? "warning" : "neutral"
    };
  };

  window.InvoiceAccountPlanUtils = {
    formatPlanSummary,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getPlanPrelimitWarning,
    getPlanValuePitch,
    getPlanFeatureHighlights,
    getPlanUsageModel,
    getBillingStatusModel
  };
})();
