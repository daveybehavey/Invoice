(() => {
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

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

  const startUpgradeCheckout = async (plan, options = {}) => {
    if (!hasStripeCheckout(plan)) {
      const fallbackUrl = getPlanUpgradeUrl(plan);
      if (!fallbackUrl) {
        throw new Error("Upgrade is not configured yet.");
      }
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const response = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        successPath: options.successPath,
        cancelPath: options.cancelPath
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    window.location.assign(payload.url);
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
    openBillingPortal
  };
})();
