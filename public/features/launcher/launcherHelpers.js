(() => {
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/launcher/launcherHelpers.js."
    );
  }
  const { readBillingNoticeFromUrl } = billingActions;

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isDiagnosticsHost = (hostname) => hostname === "localhost" || hostname === "127.0.0.1";

  const buildLauncherOptions = ({ navigate, icons }) => [
    {
      key: "ai",
      title: "Let Billie Build",
      description: "Paste notes or describe the job for Billie.",
      icon: icons.sparkles,
      onClick: () => navigate("/ai-intake"),
      disabled: false
    },
    {
      key: "import",
      title: "Import Existing Invoice",
      description: "Upload a PDF or text invoice to edit.",
      icon: icons.upload,
      onClick: () => navigate("/import"),
      disabled: false
    },
    {
      key: "manual",
      title: "Build It Yourself",
      description: "Start with a clean, editable invoice.",
      icon: icons.pencil,
      onClick: () => navigate("/manual"),
      disabled: false
    },
    {
      key: "library",
      title: "Invoice Library",
      description: "Reopen saved invoices and drafts.",
      icon: icons.archive,
      onClick: () => navigate("/invoices"),
      disabled: false
    },
    {
      key: "identity",
      title: "Business Identity",
      description: "Set your logo, style, and default From details.",
      icon: icons.swatch,
      onClick: () => navigate("/settings/business"),
      disabled: false
    }
  ];

  const buildPlanActionState = ({
    accountPlan,
    upgradeUrl,
    billingPortalUrl,
    hasStripeCheckout,
    hasStripePortal
  }) => {
    const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
    const useStripePortalAction = accountPlan?.plan === "pro" && hasStripePortal(accountPlan);
    const showUpgradeAction =
      accountPlan?.plan === "free" && (Boolean(upgradeUrl) || useStripeUpgradeAction);
    const showBillingPortalAction =
      accountPlan?.plan === "pro" && (Boolean(billingPortalUrl) || useStripePortalAction);
    return {
      useStripeUpgradeAction,
      useStripePortalAction,
      showUpgradeAction,
      showBillingPortalAction,
      hasPlanActions: showUpgradeAction || showBillingPortalAction
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
