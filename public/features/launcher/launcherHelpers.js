(() => {
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/launcher/launcherHelpers.js."
    );
  }
  const { readBillingNoticeFromUrl, getBillingEnvironment } = billingActions;

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isDiagnosticsHost = (hostname) => hostname === "localhost" || hostname === "127.0.0.1";

  const buildLauncherOptions = ({ navigate, icons }) => [
    {
      key: "ai",
      title: "Quick AI invoice",
      description: "Fastest path. Paste rough job notes and let Billie shape the first draft before you review anything sensitive.",
      icon: icons.sparkles,
      onClick: () => navigate("/ai-intake?mode=quick"),
      disabled: false
    },
    {
      key: "scratchpad",
      title: "Daily scratchpad",
      description: "Capture work as it happens, then turn the day into an invoice when you are ready to clean it up.",
      icon: icons.notebook,
      onClick: () => navigate("/scratchpad"),
      disabled: false
    },
    {
      key: "import",
      title: "Legacy import",
      description: "Bring in PDFs, photos, spreadsheets, or copied text when the job already exists somewhere else.",
      icon: icons.upload,
      onClick: () => navigate("/import"),
      disabled: false
    },
    {
      key: "manual",
      title: "Blank invoice",
      description: "Open a clean canvas when you already know exactly what the invoice should say.",
      icon: icons.pencil,
      onClick: () => navigate("/manual"),
      disabled: false
    },
    {
      key: "library",
      title: "Library",
      description: "Reopen drafts, track delivery, and handle the invoices that still need attention after the first save.",
      icon: icons.archive,
      onClick: () => navigate("/invoices"),
      disabled: false
    },
    {
      key: "identity",
      title: "Branding",
      description: "Set your logo, colors, and business defaults so every invoice starts cleaner.",
      icon: icons.swatch,
      onClick: () => navigate("/settings/business"),
      disabled: false
    },
    {
      key: "memory",
      title: "Memory",
      description: "Review or clear remembered clients, notes, send emails, and repeat cadences.",
      icon: icons.archive,
      onClick: () => navigate("/settings/memory"),
      disabled: false
    },
    {
      key: "services",
      title: "Services",
      description: "Review saved line items and clear stale service memory.",
      icon: icons.archive,
      onClick: () => navigate("/settings/services"),
      disabled: false
    },
    {
      key: "feedback",
      title: "Feedback",
      description: "Send a quick bug report, screenshot note, or tester reaction.",
      icon: icons.feedback,
      onClick: () => navigate("/feedback"),
      disabled: false
    },
    {
      key: "support",
      title: "Help and support",
      description: "Find support contact details, account deletion help, and common support topics.",
      icon: icons.feedback,
      onClick: () => navigate("/support"),
      disabled: false
    }
  ];

  const buildPlanActionState = ({
    accountPlan,
    upgradeUrl,
    billingPortalUrl,
    hasStripeCheckout,
    hasStripePortal,
    hasGooglePlayLifetimePurchase,
    hasGooglePlayRestore
  }) => {
    const googlePlayEntitlements = accountPlan?.billing?.googlePlay?.entitlements ?? {};
    const googlePlayRecoveryState =
      accountPlan?.plan === "free" &&
      Number.isFinite(googlePlayEntitlements?.subscriptionCount) &&
      Number(googlePlayEntitlements.subscriptionCount) > 0 &&
      (!Number.isFinite(googlePlayEntitlements?.activeSubscriptionCount) ||
        Number(googlePlayEntitlements.activeSubscriptionCount) <= 0);
    const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
    const useStripePortalAction =
      (accountPlan?.plan === "pro" || googlePlayRecoveryState) && hasStripePortal(accountPlan);
    const showUpgradeAction =
      accountPlan?.plan === "free" && (Boolean(upgradeUrl) || useStripeUpgradeAction);
    const showLifetimePurchaseAction =
      accountPlan?.plan === "free" && hasGooglePlayLifetimePurchase(accountPlan);
    const showBillingPortalAction =
      (accountPlan?.plan === "pro" || googlePlayRecoveryState) &&
      (Boolean(billingPortalUrl) || useStripePortalAction);
    const showRestorePurchasesAction = hasGooglePlayRestore(accountPlan);
    const billingEnvironment = getBillingEnvironment(accountPlan);
    return {
      useStripeUpgradeAction,
      useStripePortalAction,
      showUpgradeAction,
      showLifetimePurchaseAction,
      showBillingPortalAction,
      showRestorePurchasesAction,
      hasPlanActions:
        showUpgradeAction || showLifetimePurchaseAction || showBillingPortalAction || showRestorePurchasesAction,
      billingEnvironment
    };
  };

  const hasResumeDraftForKey = (draftStorageKey) => {
    try {
      const scopedRaw = window.localStorage.getItem(draftStorageKey);
      const fallbackRaw = window.localStorage.getItem("invoiceDraft");
      return Boolean((scopedRaw && scopedRaw.trim()) || (fallbackRaw && fallbackRaw.trim()));
    } catch (_error) {
      return false;
    }
  };

  window.InvoiceLauncherHelpers = {
    readBillingNoticeFromUrl,
    isValidEmail,
    isDiagnosticsHost,
    buildLauncherOptions,
    buildPlanActionState,
    hasResumeDraftForKey
  };
})();
