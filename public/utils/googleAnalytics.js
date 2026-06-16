(function setupGoogleAnalytics(windowObject, documentObject) {
  const publicConfig = windowObject.InvoicePublicConfig || {};
  const measurementId =
    typeof publicConfig.googleAnalyticsMeasurementId === "string"
      ? publicConfig.googleAnalyticsMeasurementId.trim()
      : "";

  if (!measurementId || typeof documentObject?.createElement !== "function") {
    return;
  }

  if (windowObject.gtag && windowObject.__invoiceGaMeasurementId === measurementId) {
    return;
  }

  const currentUrl = () => new URL(windowObject.location.href);
  const debugMode =
    currentUrl().searchParams.get("ga_debug") === "1" ||
    windowObject.localStorage?.getItem("invoice_ga_debug") === "1";
  const pageTitle = () => documentObject.title || "NoteBill";
  const normalizeEventName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  const normalizeParamName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  const sanitizeParams = (params) => {
    const next = {};
    for (const [rawKey, rawValue] of Object.entries(params || {})) {
      const key = normalizeParamName(rawKey);
      if (!key) {
        continue;
      }
      if (typeof rawValue === "string") {
        const value = rawValue.trim();
        if (value) {
          next[key] = value.slice(0, 100);
        }
        continue;
      }
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        next[key] = rawValue;
        continue;
      }
      if (typeof rawValue === "boolean") {
        next[key] = rawValue;
      }
    }
    return next;
  };
  const currentPageParams = () => {
    const url = currentUrl();
    return {
      page_title: pageTitle(),
      page_location: url.href,
      page_path: `${url.pathname}${url.search}${url.hash}`
    };
  };

  windowObject.dataLayer = windowObject.dataLayer || [];
  function gtag() {
    windowObject.dataLayer.push(arguments);
  }

  windowObject.gtag = gtag;
  windowObject.__invoiceGaMeasurementId = measurementId;

  const googleTagScript = documentObject.createElement("script");
  googleTagScript.async = true;
  googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  googleTagScript.dataset.invoiceGoogleAnalytics = "true";
  documentObject.head.appendChild(googleTagScript);

  gtag("js", new Date());
  gtag("config", measurementId, {
    send_page_view: true,
    anonymize_ip: true,
    debug_mode: debugMode
  });

  let lastTrackedPath = currentPageParams().page_path;

  function trackVirtualPageView() {
    const params = currentPageParams();
    if (params.page_path === lastTrackedPath) {
      return;
    }
    lastTrackedPath = params.page_path;
    gtag("event", "page_view", params);
  }

  const originalPushState = windowObject.history?.pushState;
  const originalReplaceState = windowObject.history?.replaceState;

  if (typeof originalPushState === "function") {
    windowObject.history.pushState = function patchedPushState() {
      const result = originalPushState.apply(this, arguments);
      windowObject.setTimeout(trackVirtualPageView, 0);
      return result;
    };
  }

  if (typeof originalReplaceState === "function") {
    windowObject.history.replaceState = function patchedReplaceState() {
      const result = originalReplaceState.apply(this, arguments);
      windowObject.setTimeout(trackVirtualPageView, 0);
      return result;
    };
  }

  windowObject.addEventListener("popstate", trackVirtualPageView);

  const trackEvent = (name, params = {}) => {
    const eventName = normalizeEventName(name);
    if (!eventName) {
      return false;
    }
    const nextParams = sanitizeParams(params);
    if (debugMode) {
      nextParams.debug_mode = true;
    }
    gtag("event", eventName, nextParams);
    return true;
  };

  const trackRevenueSignal = (signal, input = {}) => {
    const source =
      typeof input?.source === "string" && input.source.trim() ? input.source.trim().slice(0, 100) : "unknown";
    const platform = windowObject.Capacitor?.isNativePlatform?.() ? "native" : "web";
    trackEvent(signal, {
      signal_source: source,
      app_platform: platform
    });

    if (signal === "billing_plan_viewed") {
      trackEvent("view_item_list", {
        item_list_id: "pricing",
        item_list_name: "pricing",
        signal_source: source
      });
    } else if (signal === "billing_plan_selected") {
      trackEvent("select_item", {
        item_list_id: "pricing",
        item_list_name: "pricing",
        signal_source: source
      });
    } else if (signal === "checkout_started") {
      trackEvent("begin_checkout", {
        signal_source: source
      });
    } else if (signal === "account_signed_in") {
      trackEvent("login", {
        method: source
      });
    }
  };

  const wait = (durationMs) => new Promise((resolve) => windowObject.setTimeout(resolve, durationMs));

  const triggerLaunchDebugBundle = async (source = "debug_bundle") => {
    if (!debugMode) {
      return false;
    }
    const normalizedSource =
      typeof source === "string" && source.trim() ? source.trim().slice(0, 100) : "debug_bundle";
    trackRevenueSignal("billing_plan_viewed", { source: normalizedSource });
    await wait(180);
    trackRevenueSignal("account_signed_in", { source: normalizedSource });
    await wait(120);
    trackRevenueSignal("billing_plan_selected", { source: normalizedSource });
    await wait(120);
    trackRevenueSignal("checkout_started", { source: normalizedSource });
    await wait(120);
    trackRevenueSignal("pro_unlock_verified", { source: normalizedSource });
    await wait(120);
    trackEvent("login", { method: normalizedSource });
    await wait(80);
    trackEvent("begin_checkout", { signal_source: normalizedSource });
    await wait(80);
    trackEvent("select_item", {
      item_list_id: "pricing",
      item_list_name: "pricing",
      signal_source: normalizedSource
    });
    await wait(80);
    trackEvent("view_item_list", {
      item_list_id: "pricing",
      item_list_name: "pricing",
      signal_source: normalizedSource
    });
    return true;
  };

  windowObject.InvoiceAnalytics = Object.freeze({
    measurementId,
    debugMode,
    trackEvent,
    trackRevenueSignal,
    triggerLaunchDebugBundle
  });
})(window, document);
