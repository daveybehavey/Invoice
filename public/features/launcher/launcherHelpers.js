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
      title: "Start with Billie",
      description: "Paste the rough job notes and let Billie build the first draft.",
      icon: icons.sparkles,
      onClick: () => navigate("/ai-intake"),
      disabled: false
    },
    {
      key: "import",
      title: "Import a Draft",
      description: "Bring in a PDF, image, or text invoice and keep editing.",
      icon: icons.upload,
      onClick: () => navigate("/import"),
      disabled: false
    },
    {
      key: "manual",
      title: "Blank Invoice",
      description: "Start from scratch with a clean invoice canvas.",
      icon: icons.pencil,
      onClick: () => navigate("/manual"),
      disabled: false
    },
    {
      key: "library",
      title: "Library",
      description: "Reopen saved invoices, drafts, and follow-up work.",
      icon: icons.archive,
      onClick: () => navigate("/invoices"),
      disabled: false
    },
    {
      key: "identity",
      title: "Branding",
      description: "Set your logo, colors, and business defaults once.",
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
