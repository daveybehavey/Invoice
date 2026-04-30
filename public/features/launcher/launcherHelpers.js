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
      description: "Paste rough job notes. Billie builds a draft you review before anything changes.",
      icon: icons.sparkles,
      onClick: () => navigate("/ai-intake"),
      disabled: false
    },
    {
      key: "scratchpad",
      title: "Daily scratchpad",
      description: "Capture work during the day, then turn those notes into an invoice.",
      icon: icons.notebook,
      onClick: () => navigate("/scratchpad"),
      disabled: false
    },
    {
      key: "import",
      title: "Legacy import",
      description: "Bring in old PDFs, images, text files, or spreadsheets and keep editing.",
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
      description: "Reopen drafts, track sent invoices, and handle follow-up work.",
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
