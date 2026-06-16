(() => {
  const revenueAnalytics = window.InvoiceRevenueAnalytics;
  const publicConfig = window.InvoicePublicConfig && typeof window.InvoicePublicConfig === "object" ? window.InvoicePublicConfig : {};
  const internalBillingDebugEnabled = Boolean(publicConfig.internalBillingDebug);
  const billingDebugStorageKey = "invoiceBillingDebugState";
  const getRequestIdentity = () =>
    window.InvoiceRequestIdentity && typeof window.InvoiceRequestIdentity === "object"
      ? window.InvoiceRequestIdentity
      : null;
  const apiFetch = (...args) => {
    const requestIdentity = getRequestIdentity();
    const activeFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
    return activeFetch(...args);
  };
  const getAuthSession = () => getRequestIdentity()?.getAuthSession?.() ?? null;
  const getInvoiceOwnerId = () => getRequestIdentity()?.getInvoiceOwnerId?.() ?? "";
  const readBillingDebugSnapshot = () => {
    if (!internalBillingDebugEnabled || typeof window.sessionStorage === "undefined") {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(billingDebugStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_error) {
      return null;
    }
  };
  const billingDebugState = {
    enabled: internalBillingDebugEnabled,
    lastAction: "",
    lastStatus: "",
    lastProductId: "",
    lastProductType: "",
    lastBasePlanId: "",
    lastPurchaseToken: "",
    lastVerificationMessage: "",
    lastError: "",
    lastUpdatedAt: ""
  };
  if (internalBillingDebugEnabled) {
    const persistedDebugState = readBillingDebugSnapshot();
    if (persistedDebugState) {
      Object.assign(billingDebugState, persistedDebugState, { enabled: true });
    }
  }

  const sanitizeErrorText = (value) => {
    const normalized =
      value && typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, 220)
        : "";
    if (!normalized) {
      return "";
    }
    if (/<!doctype|<html|<head|<meta|<body/i.test(normalized)) {
      return "The app received an unexpected page response instead of a billing result. Please try again.";
    }
    return normalized;
  };

  const readJsonOrErrorText = async (response) => {
    const rawText = await response.text().catch(() => "");
    let payload = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch (_error) {
        payload = {};
      }
    }
    const fallbackText = sanitizeErrorText(rawText);
    return { payload, fallbackText };
  };

  const wait = (ms) =>
    new Promise((resolve) => {
      const timeoutFn =
        typeof window.setTimeout === "function"
          ? window.setTimeout.bind(window)
          : typeof setTimeout === "function"
            ? setTimeout
            : null;
      if (!timeoutFn) {
        resolve();
        return;
      }
      timeoutFn(resolve, ms);
    });

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
            message: "Upgrade started. Billie will unlock Pro as soon as billing confirms your subscription."
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

  const isAndroidNativePlatform = () => {
    const capacitor = window.Capacitor;
    if (!capacitor) {
      return false;
    }
    if (typeof capacitor.getPlatform === "function" && capacitor.getPlatform() === "android") {
      return true;
    }
    if (typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()) {
      return /android/i.test(String(navigator.userAgent ?? ""));
    }
    return false;
  };

  const isAndroidBrowser = () => /android/i.test(String(navigator.userAgent ?? ""));

  const getPlayBillingPlugin = () => window.Capacitor?.Plugins?.PlayBilling ?? null;

  const trackBillingSignal = (event, source) => {
    if (!event) {
      return;
    }
    revenueAnalytics?.trackRevenueSignal?.(event, source || "billing");
  };

  const isGooglePlayAlreadyOwnedError = (error) => {
    const message = String(error?.message || error || "").toUpperCase();
    return message.includes("ITEM_ALREADY_OWNED") || message.includes("YOU ALREADY OWN THIS ITEM");
  };

  const updateBillingDebugState = (patch = {}) => {
    if (!internalBillingDebugEnabled) {
      return;
    }
    Object.assign(billingDebugState, patch, {
      enabled: true,
      lastUpdatedAt: new Date().toISOString()
    });
    try {
      if (typeof window.sessionStorage !== "undefined") {
        window.sessionStorage.setItem(billingDebugStorageKey, JSON.stringify(billingDebugState));
      }
    } catch (_error) {
      // Best-effort only.
    }
  };

  const readAccountPlanSnapshot = async () => {
    try {
      const response = await apiFetch("/api/account/plan");
      if (!response.ok) {
        return null;
      }
      const payload = await response.json().catch(() => null);
      return payload && typeof payload === "object" ? payload : null;
    } catch (_error) {
      return null;
    }
  };

  const confirmGooglePlayUnlock = async () => {
    let latestPlan = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      latestPlan = await readAccountPlanSnapshot();
      if (latestPlan?.plan === "pro") {
        return latestPlan;
      }
      if (attempt < 4) {
        await wait(900);
      }
    }
    return latestPlan;
  };

  const getAndroidGooglePlayBilling = (plan) => plan?.billing?.googlePlay ?? null;

  const hasGooglePlayCheckout = (plan) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    return (
      isAndroidNativePlatform() &&
      Boolean(
        googlePlayBilling?.available &&
          googlePlayBilling?.verificationAvailable &&
          googlePlayBilling?.packageName &&
          googlePlayBilling?.subscriptionProductId
      )
    );
  };

  const getGooglePlaySubscriptionPlans = (plan) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    const plans = Array.isArray(googlePlayBilling?.subscriptionPlans) ? googlePlayBilling.subscriptionPlans : [];
    return plans
      .map((item) => ({
        basePlanId: typeof item?.basePlanId === "string" ? item.basePlanId.trim() : "",
        label: typeof item?.label === "string" && item.label.trim() ? item.label.trim() : "Plan",
        cadenceLabel:
          typeof item?.cadenceLabel === "string" && item.cadenceLabel.trim() ? item.cadenceLabel.trim() : "",
        description:
          typeof item?.description === "string" && item.description.trim()
            ? item.description.trim()
            : "Choose this billing cadence in Google Play.",
        badge: typeof item?.badge === "string" && item.badge.trim() ? item.badge.trim() : "",
        offerId: typeof item?.offerId === "string" && item.offerId.trim() ? item.offerId.trim() : "",
        isDefault: Boolean(item?.isDefault)
      }))
      .filter((item) => item.basePlanId);
  };

  const hasGooglePlayLifetimePurchase = (plan) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    return (
      isAndroidNativePlatform() &&
      Boolean(
        googlePlayBilling?.available &&
          googlePlayBilling?.verificationAvailable &&
          googlePlayBilling?.packageName &&
          googlePlayBilling?.lifetimeProductId
      )
    );
  };

  const hasGooglePlayRestore = (plan) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    return (
      isAndroidNativePlatform() &&
      Boolean(
        googlePlayBilling?.available &&
          googlePlayBilling?.verificationAvailable &&
          googlePlayBilling?.packageName &&
          (googlePlayBilling?.subscriptionProductId || googlePlayBilling?.lifetimeProductId)
      )
    );
  };

  const hasGooglePlayPortal = (plan) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    return isAndroidNativePlatform() && Boolean(googlePlayBilling?.manageSubscriptionsUrl);
  };

  const hasStripeCheckout = (plan) => {
    if (isAndroidNativePlatform()) {
      return hasGooglePlayCheckout(plan);
    }
    if (isAndroidBrowser()) {
      return false;
    }
    return plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.checkoutAvailable);
  };

  const hasStripePortal = (plan) => {
    if (isAndroidNativePlatform()) {
      return hasGooglePlayPortal(plan);
    }
    return plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.portalAvailable);
  };

  const getBillingEnvironment = (plan) => {
    if (isAndroidNativePlatform()) {
      return {
        mode: "google-play",
        label: "Google Play",
        hint: "This installed Android app uses Google Play for upgrades and billing."
      };
    }
    if (isAndroidBrowser()) {
      return {
        mode: "android-browser",
        label: "Open the app",
        hint: "You are in Android web mode. Open the installed NoteBill app for Google Play upgrades."
      };
    }
    if (plan?.billing?.provider === "stripe" && (plan?.billing?.checkoutAvailable || plan?.billing?.portalAvailable)) {
      return {
        mode: "stripe-web",
        label: "Secure web checkout",
        hint: "Web upgrades and billing settings open in secure checkout pages."
      };
    }
    return {
      mode: "unknown",
      label: "Plan controls",
      hint: "Billing options will appear here when they are available for this device."
    };
  };

  const startUpgradeCheckout = async (plan, options = {}) => {
    trackBillingSignal(
      "billing_plan_selected",
      options.basePlanId ? `upgrade:${options.basePlanId}` : "upgrade:default"
    );
    if (isAndroidNativePlatform()) {
      const plugin = getPlayBillingPlugin();
      const googlePlayBilling = getAndroidGooglePlayBilling(plan);
      if (!plugin?.purchaseSubscription) {
        throw new Error("Google Play billing is not available on this build.");
      }
      if (!googlePlayBilling?.subscriptionProductId || !googlePlayBilling?.packageName) {
        throw new Error("Google Play billing is not configured for this app.");
      }
      updateBillingDebugState({
        lastAction: "start_upgrade_checkout",
        lastStatus: "starting",
        lastProductId: googlePlayBilling.subscriptionProductId,
        lastProductType: "subscription",
        lastBasePlanId: "",
        lastPurchaseToken: "",
        lastVerificationMessage: "",
        lastError: ""
      });
      const requestedBasePlanId =
        typeof options.basePlanId === "string" && options.basePlanId.trim() ? options.basePlanId.trim() : "";
      const planChoices = getGooglePlaySubscriptionPlans(plan);
      const selectedPlan =
        planChoices.find((item) => item.basePlanId === requestedBasePlanId) ||
        planChoices.find((item) => item.isDefault) ||
        planChoices[0] ||
        null;
      const obfuscatedIds = await buildGooglePlayObfuscatedIds();
      let purchase;
      try {
        purchase = await plugin.purchaseSubscription({
          productId: googlePlayBilling.subscriptionProductId,
          packageName: googlePlayBilling.packageName,
          basePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || undefined,
          offerId: selectedPlan?.offerId || googlePlayBilling.subscriptionOfferId || undefined,
          obfuscatedAccountId: obfuscatedIds.obfuscatedAccountId || undefined,
          obfuscatedProfileId: obfuscatedIds.obfuscatedProfileId || undefined
        });
      } catch (error) {
        if (isGooglePlayAlreadyOwnedError(error)) {
          updateBillingDebugState({
            lastAction: "purchase_subscription",
            lastStatus: "already-owned",
            lastProductId: googlePlayBilling.subscriptionProductId,
            lastProductType: "subscription",
            lastBasePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
            lastPurchaseToken: "",
            lastVerificationMessage: "Google Play says this item is already owned. Restoring purchases now.",
            lastError: ""
          });
          await wait(1200);
          return await restoreGooglePlayPurchases(plan, options);
        }
        throw error;
      }
      if (!purchase?.purchaseToken) {
        updateBillingDebugState({
          lastAction: "purchase_subscription",
          lastStatus: "missing-token",
          lastProductId: googlePlayBilling.subscriptionProductId,
          lastProductType: "subscription",
          lastBasePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
          lastPurchaseToken: "",
          lastVerificationMessage: "",
          lastError: "Google Play did not return a subscription token."
        });
        throw new Error("Google Play did not return a subscription token.");
      }
      updateBillingDebugState({
        lastAction: "purchase_subscription",
        lastStatus: "token-received",
        lastProductId: purchase?.productId || googlePlayBilling.subscriptionProductId,
        lastProductType: "subscription",
        lastBasePlanId: purchase?.basePlanId || selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
        lastPurchaseToken: purchase.purchaseToken,
        lastVerificationMessage: "",
        lastError: ""
      });
      try {
        const verification = await verifyGooglePlayPurchase(plan, {
          ...purchase,
          productType: "subscription",
          basePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || undefined
        });
        const refreshedPlan = await confirmGooglePlayUnlock();
        updateBillingDebugState({
          lastAction: "verify_subscription",
          lastStatus: refreshedPlan?.plan === "pro" ? "verified" : "verified-not-unlocked",
          lastProductId: verification?.productId || purchase?.productId || googlePlayBilling.subscriptionProductId,
          lastProductType: "subscription",
          lastBasePlanId: verification?.basePlanId || selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
          lastPurchaseToken: purchase.purchaseToken,
          lastVerificationMessage:
            refreshedPlan?.plan === "pro"
              ? `Verified ${verification?.subscriptionState || "subscription"}${verification?.expiryAt ? ` until ${verification.expiryAt}` : ""}. Pro is active now.`
              : `Verified ${verification?.subscriptionState || "subscription"}${verification?.expiryAt ? ` until ${verification.expiryAt}` : ""}, but Pro did not unlock yet.`,
          lastError: ""
        });
        if (refreshedPlan?.plan !== "pro") {
          throw new Error("Google Play purchase verified, but Pro did not unlock yet. Tap Restore purchases.");
        }
      } catch (error) {
        if (isGooglePlayAlreadyOwnedError(error)) {
          updateBillingDebugState({
            lastAction: "purchase_subscription",
            lastStatus: "already-owned",
            lastProductId: purchase?.productId || googlePlayBilling.subscriptionProductId,
            lastProductType: "subscription",
            lastBasePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
            lastPurchaseToken: purchase.purchaseToken,
            lastVerificationMessage: "Google Play says this item is already owned. Restoring purchases now.",
            lastError: ""
          });
          await wait(1200);
          return await restoreGooglePlayPurchases(plan, options);
        }
        trackBillingSignal(
          "google_play_verification_failed",
          selectedPlan?.basePlanId ? `subscription:${selectedPlan.basePlanId}` : "subscription:unknown"
        );
        updateBillingDebugState({
          lastAction: "verify_subscription",
          lastStatus: "failed",
          lastProductId: purchase?.productId || googlePlayBilling.subscriptionProductId,
          lastProductType: "subscription",
          lastBasePlanId: selectedPlan?.basePlanId || googlePlayBilling.subscriptionBasePlanId || "",
          lastPurchaseToken: purchase.purchaseToken,
          lastVerificationMessage: "",
          lastError: error?.message || "Unable to verify subscription purchase."
        });
        throw error;
      }
      window.location.assign(buildBillingStatePath(options.successPath, "success"));
      return;
    }

    if (isAndroidBrowser()) {
      throw new Error(
        "Android upgrades must be opened from the installed NoteBill app. This browser view cannot use Google Play billing."
      );
    }

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

  const startLifetimePurchase = async (plan, options = {}) => {
    trackBillingSignal("billing_plan_selected", "lifetime");
    if (isAndroidNativePlatform()) {
      const plugin = getPlayBillingPlugin();
      const googlePlayBilling = getAndroidGooglePlayBilling(plan);
      if (!plugin?.purchaseOneTimeProduct) {
        throw new Error("Google Play billing is not available on this build.");
      }
      if (!googlePlayBilling?.lifetimeProductId || !googlePlayBilling?.packageName) {
        throw new Error("Google Play lifetime billing is not configured for this app.");
      }
      updateBillingDebugState({
        lastAction: "start_lifetime_purchase",
        lastStatus: "starting",
        lastProductId: googlePlayBilling.lifetimeProductId,
        lastProductType: "one_time",
        lastBasePlanId: "",
        lastPurchaseToken: "",
        lastVerificationMessage: "",
        lastError: ""
      });
      const obfuscatedIds = await buildGooglePlayObfuscatedIds();
      let purchase;
      try {
        purchase = await plugin.purchaseOneTimeProduct({
          productId: googlePlayBilling.lifetimeProductId,
          packageName: googlePlayBilling.packageName,
          obfuscatedAccountId: obfuscatedIds.obfuscatedAccountId || undefined,
          obfuscatedProfileId: obfuscatedIds.obfuscatedProfileId || undefined
        });
      } catch (error) {
        if (isGooglePlayAlreadyOwnedError(error)) {
          updateBillingDebugState({
            lastAction: "purchase_lifetime",
            lastStatus: "already-owned",
            lastProductId: googlePlayBilling.lifetimeProductId,
            lastProductType: "one_time",
            lastBasePlanId: "",
            lastPurchaseToken: "",
            lastVerificationMessage: "Google Play says this item is already owned. Restoring purchases now.",
            lastError: ""
          });
          await wait(1200);
          return await restoreGooglePlayPurchases(plan, options);
        }
        throw error;
      }
      if (!purchase?.purchaseToken) {
        updateBillingDebugState({
          lastAction: "purchase_lifetime",
          lastStatus: "missing-token",
          lastProductId: googlePlayBilling.lifetimeProductId,
          lastProductType: "one_time",
          lastBasePlanId: "",
          lastPurchaseToken: "",
          lastVerificationMessage: "",
          lastError: "Google Play did not return a lifetime purchase token."
        });
        throw new Error("Google Play did not return a lifetime purchase token.");
      }
      updateBillingDebugState({
        lastAction: "purchase_lifetime",
        lastStatus: "token-received",
        lastProductId: purchase?.productId || googlePlayBilling.lifetimeProductId,
        lastProductType: "one_time",
        lastBasePlanId: "",
        lastPurchaseToken: purchase.purchaseToken,
        lastVerificationMessage: "",
        lastError: ""
      });
      try {
        const verification = await verifyGooglePlayPurchase(plan, {
          ...purchase,
          productType: "one_time"
        });
        const refreshedPlan = await confirmGooglePlayUnlock();
        updateBillingDebugState({
          lastAction: "verify_lifetime",
          lastStatus: refreshedPlan?.plan === "pro" ? "verified" : "verified-not-unlocked",
          lastProductId: verification?.productId || purchase?.productId || googlePlayBilling.lifetimeProductId,
          lastProductType: "one_time",
          lastBasePlanId: "",
          lastPurchaseToken: purchase.purchaseToken,
          lastVerificationMessage:
            refreshedPlan?.plan === "pro"
              ? "Verified lifetime entitlement. Pro is active now."
              : "Verified lifetime entitlement, but Pro did not unlock yet.",
          lastError: ""
        });
        if (refreshedPlan?.plan !== "pro") {
          throw new Error("Google Play lifetime purchase verified, but Pro did not unlock yet. Tap Restore purchases.");
        }
      } catch (error) {
        if (isGooglePlayAlreadyOwnedError(error)) {
          updateBillingDebugState({
            lastAction: "purchase_lifetime",
            lastStatus: "already-owned",
            lastProductId: purchase?.productId || googlePlayBilling.lifetimeProductId,
            lastProductType: "one_time",
            lastBasePlanId: "",
            lastPurchaseToken: purchase.purchaseToken,
            lastVerificationMessage: "Google Play says this item is already owned. Restoring purchases now.",
            lastError: ""
          });
          await wait(1200);
          return await restoreGooglePlayPurchases(plan, options);
        }
        trackBillingSignal("google_play_verification_failed", "lifetime");
        updateBillingDebugState({
          lastAction: "verify_lifetime",
          lastStatus: "failed",
          lastProductId: purchase?.productId || googlePlayBilling.lifetimeProductId,
          lastProductType: "one_time",
          lastBasePlanId: "",
          lastPurchaseToken: purchase.purchaseToken,
          lastVerificationMessage: "",
          lastError: error?.message || "Unable to verify lifetime purchase."
        });
        throw error;
      }
      window.location.assign(buildBillingStatePath(options.successPath, "success"));
      return;
    }

    const fallbackUrl = getPlanUpgradeUrl(plan);
    if (!fallbackUrl) {
      throw new Error("Lifetime purchase is not configured yet.");
    }
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  };

  const openBillingPortal = async (plan, options = {}) => {
    trackBillingSignal("billing_manage_opened", isAndroidNativePlatform() ? "google_play" : "web");
    if (isAndroidNativePlatform()) {
      const googlePlayBilling = getAndroidGooglePlayBilling(plan);
      const manageUrl = getGooglePlayManageSubscriptionsUrl(plan);
      if (manageUrl) {
        window.location.assign(manageUrl);
        return;
      }
      if (!googlePlayBilling?.manageSubscriptionsUrl) {
        throw new Error("Google Play billing settings are not available yet.");
      }
      window.location.assign(googlePlayBilling.manageSubscriptionsUrl);
      return;
    }
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

  const restoreGooglePlayPurchases = async (plan, options = {}) => {
    trackBillingSignal("billing_manage_opened", "google_play_restore");
    if (!isAndroidNativePlatform()) {
      throw new Error("Restore purchases is only available in the installed Android app.");
    }
    const plugin = getPlayBillingPlugin();
    if (!plugin?.restorePurchases) {
      throw new Error("Restore purchases is not available on this build.");
    }
    if (!hasGooglePlayRestore(plan)) {
      throw new Error("Google Play restore is not configured for this app.");
    }
    updateBillingDebugState({
      lastAction: "restore_purchases",
      lastStatus: "starting",
      lastVerificationMessage: "",
      lastError: ""
    });
    let result = null;
    let purchases = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await plugin.restorePurchases({});
      purchases = Array.isArray(result?.purchases) ? result.purchases : [];
      if (purchases.length > 0 || attempt === 2) {
        break;
      }
      await wait(1200);
    }
    if (purchases.length === 0) {
      updateBillingDebugState({
        lastAction: "restore_purchases",
        lastStatus: "no-purchases",
        lastVerificationMessage: "No active Google Play purchases were found for this Play account.",
        lastError: ""
      });
      return {
        restoredCount: 0,
        message: "No active Google Play purchases were found for this Play account."
      };
    }
    const firstPurchase = purchases[0] ?? null;
    updateBillingDebugState({
      lastAction: "restore_purchases",
      lastStatus: "native-purchases-found",
      lastProductId: firstPurchase?.productId || "",
      lastProductType: firstPurchase?.productType || "",
      lastBasePlanId: firstPurchase?.basePlanId || "",
      lastPurchaseToken: firstPurchase?.purchaseToken || "",
      lastVerificationMessage: `Google Play returned ${purchases.length} purchase${purchases.length === 1 ? "" : "s"} to restore. Starting verification now.`,
      lastError: ""
    });
    let restoredCount = 0;
    const failures = [];
    let unlockConfirmed = false;
    for (const purchase of purchases) {
      try {
        const verification = await verifyGooglePlayPurchase(plan, {
          ...purchase,
          packageName: purchase?.packageName || result?.packageName || undefined
        });
        restoredCount += 1;
        const refreshedPlan = await confirmGooglePlayUnlock();
        unlockConfirmed = unlockConfirmed || refreshedPlan?.plan === "pro";
        updateBillingDebugState({
          lastAction: "restore_purchases",
          lastStatus: refreshedPlan?.plan === "pro" ? "partial-verified" : "verified-not-unlocked",
          lastProductId: verification?.productId || purchase?.productId || "",
          lastProductType: verification?.productType || "",
          lastBasePlanId: verification?.basePlanId || "",
          lastPurchaseToken: purchase?.purchaseToken || "",
          lastVerificationMessage:
            refreshedPlan?.plan === "pro"
              ? `Restored ${restoredCount} purchase${restoredCount === 1 ? "" : "s"} so far. Pro is active now.`
              : `Restored ${restoredCount} purchase${restoredCount === 1 ? "" : "s"} so far, but Pro still looks locked.`,
          lastError: ""
        });
      } catch (error) {
        failures.push(error?.message || "Unable to verify a restored purchase.");
        updateBillingDebugState({
          lastAction: "restore_purchases",
          lastStatus: "restore-failed",
          lastProductId: purchase?.productId || "",
          lastProductType: purchase?.productType || "",
          lastBasePlanId: purchase?.basePlanId || "",
          lastPurchaseToken: purchase?.purchaseToken || "",
          lastVerificationMessage: "",
          lastError: error?.message || "Unable to verify a restored purchase."
        });
      }
    }
    if (restoredCount <= 0) {
      trackBillingSignal("google_play_verification_failed", "restore");
      updateBillingDebugState({
        lastAction: "restore_purchases",
        lastStatus: "failed",
        lastVerificationMessage: "",
        lastError: failures[0] || "Unable to restore Google Play purchases."
      });
      throw new Error(failures[0] || "Unable to restore Google Play purchases.");
    }
    updateBillingDebugState({
      lastAction: "restore_purchases",
      lastStatus: unlockConfirmed ? "verified" : "verified-not-unlocked",
      lastVerificationMessage:
        unlockConfirmed
          ? restoredCount === 1
            ? "Restored 1 Google Play purchase. Pro is active now."
            : `Restored ${restoredCount} Google Play purchases. Pro is active now.`
          : restoredCount === 1
            ? "Restored 1 Google Play purchase, but Pro still looks locked."
            : `Restored ${restoredCount} Google Play purchases, but Pro still looks locked.`,
      lastError: ""
    });
    if (!unlockConfirmed) {
      throw new Error("Google Play purchase verification finished, but Pro still did not unlock.");
    }
    if (typeof options.successPath === "string" && options.successPath) {
      window.location.assign(buildBillingStatePath(options.successPath, "success"));
    }
    return {
      restoredCount,
      message:
        restoredCount === 1
          ? "Restored 1 Google Play purchase. Pro should unlock now."
          : `Restored ${restoredCount} Google Play purchases. Pro should unlock now.`
    };
  };

  const verifyGooglePlayPurchase = async (plan, purchase) => {
    const googlePlayBilling = getAndroidGooglePlayBilling(plan);
    const productId = typeof purchase?.productId === "string" ? purchase.productId.trim() : "";
    const productType = typeof purchase?.productType === "string" ? purchase.productType.trim() : "";
    const isLifetime =
      productType === "one_time" ||
      (googlePlayBilling?.lifetimeProductId && productId === googlePlayBilling.lifetimeProductId);
    const endpoint = isLifetime
      ? "/api/billing/google-play/lifetime/verify"
      : "/api/billing/google-play/verify";
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchaseToken: purchase?.purchaseToken,
        productId: productId || (isLifetime ? googlePlayBilling?.lifetimeProductId : googlePlayBilling?.subscriptionProductId),
        packageName: purchase?.packageName || googlePlayBilling?.packageName,
        basePlanId: isLifetime ? undefined : purchase?.basePlanId || googlePlayBilling?.subscriptionBasePlanId || undefined
      })
    });
    const { payload, fallbackText } = await readJsonOrErrorText(response);
    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.error ||
          fallbackText ||
          `Unable to verify Google Play purchase${response.status ? ` (${response.status})` : ""}.`
      );
    }
    return payload?.result && typeof payload.result === "object" ? payload.result : payload;
  };

  const getPlanUpgradeUrl = (plan) => {
    const androidManageUrl = getGooglePlayManageSubscriptionsUrl(plan);
    if (isAndroidNativePlatform() && androidManageUrl) {
      return androidManageUrl;
    }
    const value = plan?.links?.upgradeUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const getPlanBillingPortalUrl = (plan) => {
    const androidManageUrl = getGooglePlayManageSubscriptionsUrl(plan);
    if (isAndroidNativePlatform() && androidManageUrl) {
      return androidManageUrl;
    }
    const value = plan?.links?.billingPortalUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const getGooglePlayManageSubscriptionsUrl = (plan) => {
    const value = plan?.billing?.googlePlay?.manageSubscriptionsUrl;
    return typeof value === "string" && value.trim() ? value : "";
  };

  const encodeUtf8 = (value) => {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value);
    }
    return Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0)));
  };

  const toHex = (bytes) =>
    Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

  const hashIdentifier = async (value) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      return "";
    }
    try {
      if (window.crypto?.subtle?.digest) {
        const digest = await window.crypto.subtle.digest("SHA-256", encodeUtf8(normalized));
        return toHex(new Uint8Array(digest));
      }
    } catch (_error) {
      // Fall back to a deterministic non-cryptographic token below.
    }
    return normalized.slice(0, 64);
  };

  const buildGooglePlayObfuscatedIds = async () => {
    const session = getAuthSession?.() ?? null;
    const ownerId = typeof getInvoiceOwnerId === "function" ? getInvoiceOwnerId() : "";
    const primaryIdentity =
      typeof session?.userId === "string" && session.userId.trim()
        ? `user:${session.userId.trim()}`
        : ownerId
          ? `owner:${ownerId}`
          : "";
    const profileIdentity =
      typeof session?.email === "string" && session.email.trim()
        ? `email:${session.email.trim().toLowerCase()}`
        : primaryIdentity;

    return {
      obfuscatedAccountId: await hashIdentifier(primaryIdentity),
      obfuscatedProfileId: await hashIdentifier(profileIdentity)
    };
  };

  const buildBillingStatePath = (path, state) => {
    const fallback = typeof path === "string" && path.trim() ? path.trim() : "/";
    try {
      const url = new URL(fallback, window.location.origin);
      url.searchParams.set("billing", state);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (_error) {
      const separator = fallback.includes("?") ? "&" : "?";
      return `${fallback}${separator}billing=${encodeURIComponent(state)}`;
    }
  };

  window.InvoiceBillingActions = {
    readBillingNoticeFromUrl,
    isAndroidNativePlatform,
    isAndroidBrowser,
    hasStripeCheckout,
    hasStripePortal,
    getGooglePlaySubscriptionPlans,
    hasGooglePlayLifetimePurchase,
    hasGooglePlayRestore,
    startUpgradeCheckout,
    startLifetimePurchase,
    restoreGooglePlayPurchases,
    openBillingPortal,
    trackBillingPlanViewed: (source) => trackBillingSignal("billing_plan_viewed", source || "billing_view"),
    getBillingEnvironment,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getGooglePlayManageSubscriptionsUrl,
    getBillingDebugState: () => (internalBillingDebugEnabled ? { ...billingDebugState } : null),
    isInternalBillingDebugEnabled: () => internalBillingDebugEnabled
  };
})();
