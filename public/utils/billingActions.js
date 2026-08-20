(() => {
  const PENDING_UPGRADE_KEY = "invoicePendingUpgradeCheckout";
  const PENDING_UPGRADE_TTL_MS = 30 * 60 * 1000;

  const getRequestIdentity = () => window.InvoiceRequestIdentity;
  const apiFetch = (input, init) => {
    const requestIdentity = getRequestIdentity();
    if (typeof requestIdentity?.apiFetch === "function") {
      return requestIdentity.apiFetch(input, init);
    }
    return window.fetch(input, init);
  };
  const getAuthSession = () => getRequestIdentity()?.getAuthSession?.() ?? null;
  const getLegalFoundation = () => window.InvoiceLegalFoundation || null;

  const readBillingNoticeFromUrl = () => {
    if (typeof window === "undefined") {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const billingState = params.get("billing");
    if (billingState !== "success" && billingState !== "cancelled") {
      return null;
    }
    const legal = getLegalFoundation();
    const client = legal?.getLegalFoundationClient?.() || {};
    const acceptedRaw =
      typeof params.get("acceptedTermsVersion") === "string"
        ? params.get("acceptedTermsVersion").trim()
        : "";
    const acceptedIsRegistered =
      typeof legal?.isRegisteredTermsVersion === "function"
        ? legal.isRegisteredTermsVersion(acceptedRaw)
        : Array.isArray(legal?.REGISTERED_TERMS_VERSIONS) &&
          legal.REGISTERED_TERMS_VERSIONS.includes(acceptedRaw);

    let notice;
    if (billingState === "success") {
      if (acceptedIsRegistered) {
        const termsVersion = acceptedRaw;
        const termsPath =
          (typeof legal?.buildVersionedTermsPath === "function"
            ? legal.buildVersionedTermsPath(termsVersion)
            : "") ||
          `/terms?version=${encodeURIComponent(termsVersion)}`;
        const downloadPath =
          (typeof legal?.buildTermsDownloadPath === "function"
            ? legal.buildTermsDownloadPath(termsVersion)
            : "") ||
          `/api/legal/documents/terms?version=${encodeURIComponent(termsVersion)}&format=txt`;
        notice = {
          tone: "green",
          message:
            "Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription.",
          termsHref: termsPath,
          termsLabel: "Open your accepted Terms",
          downloadHref: downloadPath,
          downloadLabel: "Download/print Terms",
          contractCopyAvailable: true,
          termsVersion
        };
      } else {
        notice = {
          tone: "green",
          message:
            "Upgrade started. Billie will unlock Pro as soon as Stripe confirms your subscription. The exact Terms version you accepted could not be confirmed from this return URL.",
          termsHref: client.termsUrlPath || "/terms",
          termsLabel: "Open current Terms",
          contractCopyAvailable: false,
          termsVersion: ""
        };
      }
    } else {
      notice = {
        tone: "amber",
        message: "Upgrade cancelled. You can keep using free mode or try again anytime."
      };
    }

    params.delete("billing");
    params.delete("acceptedTermsVersion");
    params.delete("session_id");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
    return notice;
  };

  const hasStripeCheckout = (plan) =>
    plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.checkoutAvailable);

  const hasStripePortal = (plan) =>
    plan?.billing?.provider === "stripe" && Boolean(plan?.billing?.portalAvailable);

  const createIntentId = () => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_error) {
      // Fall through.
    }
    return `intent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const sanitizeAppPath = (value, fallback) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized.startsWith("/") || normalized.startsWith("//")) {
      return fallback;
    }
    return normalized;
  };

  const writePendingUpgradeIntent = (intent) => {
    window.localStorage.setItem(PENDING_UPGRADE_KEY, JSON.stringify(intent));
  };

  const clearPendingUpgradeCheckout = () => {
    try {
      window.localStorage.removeItem(PENDING_UPGRADE_KEY);
    } catch (_error) {
      // Best-effort only.
    }
  };

  const parsePendingUpgradeIntent = (raw) => {
    if (!raw) {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const intentId = typeof parsed.intentId === "string" ? parsed.intentId.trim() : "";
    const createdAt = Number(parsed.createdAt);
    const expiresAt = Number(parsed.expiresAt);
    if (!intentId || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
      return null;
    }
    if (expiresAt <= Date.now()) {
      return null;
    }
    return {
      intentId,
      createdAt,
      expiresAt,
      successPath: sanitizeAppPath(parsed.successPath, "/?billing=success"),
      cancelPath: sanitizeAppPath(parsed.cancelPath, "/?billing=cancelled")
    };
  };

  const peekPendingUpgradeCheckout = () => {
    try {
      return parsePendingUpgradeIntent(window.localStorage.getItem(PENDING_UPGRADE_KEY));
    } catch (_error) {
      return null;
    }
  };

  const takePendingUpgradeCheckout = () => {
    const intent = peekPendingUpgradeCheckout();
    clearPendingUpgradeCheckout();
    return intent;
  };

  const rememberPendingUpgradeCheckout = (options = {}) => {
    const now = Date.now();
    const intent = {
      intentId: typeof options.intentId === "string" && options.intentId.trim() ? options.intentId.trim() : createIntentId(),
      createdAt: now,
      expiresAt: now + PENDING_UPGRADE_TTL_MS,
      successPath: sanitizeAppPath(options.successPath, "/?billing=success"),
      cancelPath: sanitizeAppPath(options.cancelPath, "/?billing=cancelled")
    };
    writePendingUpgradeIntent(intent);
    return intent;
  };

  const restorePendingUpgradeCheckout = (intent) => {
    if (!intent?.intentId) {
      return;
    }
    if (Number(intent.expiresAt) <= Date.now()) {
      return;
    }
    rememberPendingUpgradeCheckout(intent);
  };

  const consumePendingUpgradeCheckout = () => takePendingUpgradeCheckout();

  const removeCheckoutDisclosureModal = () => {
    const existing = document.getElementById("nb-checkout-disclosure-modal");
    if (existing) {
      existing.remove();
    }
  };

  /** Single lifecycle owner — concurrent callers share one in-flight Promise. */
  let activeDisclosureLifecycle = null;

  const getFocusableElements = (root) => {
    if (!root) {
      return [];
    }
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") {
        return false;
      }
      return el.tabIndex >= 0 || el.tagName === "A" || el.tagName === "BUTTON" || el.tagName === "INPUT";
    });
  };

  const confirmCheckoutDisclosure = (options = {}) => {
    if (activeDisclosureLifecycle?.promise) {
      return activeDisclosureLifecycle.promise;
    }

    const legal = getLegalFoundation();
    if (!legal?.buildCheckoutDisclosureCopy || !legal.LEGAL_TERMS_VERSION) {
      return Promise.reject(new Error("Legal disclosures are unavailable. Reload and try again."));
    }
    const copy = legal.buildCheckoutDisclosureCopy();
    const termsVersion = legal.LEGAL_TERMS_VERSION;
    const client = legal.getLegalFoundationClient?.() || {};
    const termsHref =
      (typeof legal.buildVersionedTermsPath === "function"
        ? legal.buildVersionedTermsPath(termsVersion)
        : "") ||
      client.versionedTermsUrlPath ||
      `/terms?version=${encodeURIComponent(termsVersion)}`;
    const privacyHref = client.privacyUrlPath || "/privacy";
    const invoker =
      options.invoker instanceof HTMLElement
        ? options.invoker
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

    let cancelAndCleanup = () => {};

    const promise = new Promise((resolve, reject) => {
      let settled = false;
      const previouslyFocused = invoker;
      const appRoot = document.getElementById("root");
      // Capture prior accessibility state before making the root inert.
      const previousRootInert = appRoot ? appRoot.inert : undefined;
      const previousRootAriaHidden = appRoot ? appRoot.getAttribute("aria-hidden") : null;
      if (appRoot) {
        appRoot.inert = true;
        appRoot.setAttribute("aria-hidden", "true");
      }

      const backdrop = document.createElement("div");
      backdrop.id = "nb-checkout-disclosure-modal";
      backdrop.className =
        "nb-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto p-4 sm:items-center";
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.setAttribute("aria-labelledby", "nb-checkout-disclosure-title");
      backdrop.setAttribute("aria-describedby", "nb-checkout-disclosure-summary");
      backdrop.dataset.testid = "checkout-disclosure-modal";

      const panel = document.createElement("div");
      panel.className =
        "nb-checkout-disclosure max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6";
      panel.tabIndex = -1;

      const title = document.createElement("h2");
      title.id = "nb-checkout-disclosure-title";
      title.className = "text-xl font-semibold text-slate-900";
      title.textContent = copy.title;

      const summary = document.createElement("div");
      summary.id = "nb-checkout-disclosure-summary";
      summary.className = "mt-4";

      const list = document.createElement("ul");
      list.className = "space-y-3 text-sm leading-6 text-slate-700";
      (copy.bullets || []).forEach((bullet) => {
        const item = document.createElement("li");
        item.textContent = bullet;
        list.appendChild(item);
      });
      summary.appendChild(list);

      const links = document.createElement("div");
      links.className = "mt-4 flex flex-wrap gap-3 text-sm font-semibold";
      const termsLink = document.createElement("a");
      termsLink.href = termsHref;
      termsLink.target = "_blank";
      termsLink.rel = "noopener noreferrer";
      termsLink.className = "text-[#14532d] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532d]";
      termsLink.textContent = "Open Terms of Service";
      const privacyLink = document.createElement("a");
      privacyLink.href = privacyHref;
      privacyLink.target = "_blank";
      privacyLink.rel = "noopener noreferrer";
      privacyLink.className = "text-[#14532d] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532d]";
      privacyLink.textContent = "Open Privacy Policy";
      links.appendChild(termsLink);
      links.appendChild(privacyLink);

      const ackLabel = document.createElement("label");
      ackLabel.className =
        "mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800";
      ackLabel.setAttribute("for", "nb-checkout-terms-ack");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "nb-checkout-terms-ack";
      checkbox.className =
        "mt-1 h-4 w-4 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532d]";
      checkbox.checked = false;
      const ackText = document.createElement("span");
      ackText.id = "nb-checkout-terms-ack-label";
      ackText.textContent = copy.acknowledgementLabel;
      checkbox.setAttribute("aria-describedby", "nb-checkout-terms-ack-label");
      ackLabel.appendChild(checkbox);
      ackLabel.appendChild(ackText);

      const errorEl = document.createElement("p");
      errorEl.className = "mt-2 hidden text-sm text-rose-700";
      errorEl.setAttribute("role", "alert");

      const actions = document.createElement("div");
      actions.className = "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className =
        "inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532d]";
      cancelBtn.textContent = "Not now";
      const continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className =
        "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#14532d] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14532d]";
      continueBtn.textContent = "Continue to Checkout";
      continueBtn.disabled = true;

      const restoreBackground = () => {
        if (!appRoot) {
          return;
        }
        if (typeof previousRootInert === "boolean") {
          appRoot.inert = previousRootInert;
        } else {
          appRoot.inert = false;
        }
        if (previousRootAriaHidden == null) {
          appRoot.removeAttribute("aria-hidden");
        } else {
          appRoot.setAttribute("aria-hidden", previousRootAriaHidden);
        }
      };

      const finish = (result, { skipFocusRestore = false } = {}) => {
        if (settled) {
          return;
        }
        settled = true;
        document.removeEventListener("keydown", onKeyDown, true);
        removeCheckoutDisclosureModal();
        // Always restore background accessibility before settle (including skipFocusRestore).
        restoreBackground();
        activeDisclosureLifecycle = null;
        if (!skipFocusRestore && previouslyFocused && typeof previouslyFocused.focus === "function") {
          try {
            previouslyFocused.focus();
          } catch (_error) {
            // Ignore focus restore failures (detached nodes).
          }
        }
        if (result) {
          resolve(result);
        } else {
          const error = new Error("Checkout cancelled before Terms acknowledgement.");
          error.code = "CHECKOUT_DISCLOSURE_CANCELLED";
          reject(error);
        }
      };

      cancelAndCleanup = () => finish(null);

      const onKeyDown = (event) => {
        if (settled) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key !== "Tab") {
          return;
        }
        const focusable = getFocusableElements(panel);
        if (focusable.length === 0) {
          event.preventDefault();
          panel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !panel.contains(active)) {
            event.preventDefault();
            last.focus();
          }
          return;
        }
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      checkbox.addEventListener("change", () => {
        continueBtn.disabled = !checkbox.checked;
        errorEl.classList.add("hidden");
        errorEl.textContent = "";
      });
      cancelBtn.addEventListener("click", () => finish(null));
      continueBtn.addEventListener("click", () => {
        if (!checkbox.checked) {
          errorEl.textContent = "Confirm the acknowledgement before continuing.";
          errorEl.classList.remove("hidden");
          return;
        }
        // Navigation to Stripe begins immediately after resolve; skip restoring invoker focus.
        finish(
          {
            termsVersion,
            termsAccepted: true
          },
          { skipFocusRestore: true }
        );
      });
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
          finish(null);
        }
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(continueBtn);
      panel.appendChild(title);
      panel.appendChild(summary);
      panel.appendChild(links);
      panel.appendChild(ackLabel);
      panel.appendChild(errorEl);
      panel.appendChild(actions);
      backdrop.appendChild(panel);
      document.body.appendChild(backdrop);
      document.addEventListener("keydown", onKeyDown, true);
      checkbox.focus();
    });

    activeDisclosureLifecycle = {
      promise,
      cancelAndCleanup: () => cancelAndCleanup()
    };
    return promise;
  };

  const startUpgradeCheckout = async (plan, options = {}) => {
    if (!hasStripeCheckout(plan)) {
      const fallbackUrl = getPlanUpgradeUrl(plan);
      if (!fallbackUrl) {
        throw new Error("Upgrade is not configured yet.");
      }
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return { started: false, reason: "fallback" };
    }

    const session = options.authSession || getAuthSession();
    if (!session?.userId || !session?.email) {
      if (!options.skipAuthRemember) {
        rememberPendingUpgradeCheckout(options);
      }
      const error = new Error("Sign in to upgrade to Pro.");
      error.code = "AUTH_REQUIRED_FOR_UPGRADE";
      throw error;
    }

    let termsVersion =
      typeof options.termsVersion === "string" && options.termsVersion.trim()
        ? options.termsVersion.trim()
        : "";
    let termsAccepted =
      options.termsAccepted === true ||
      (typeof options.termsAccepted === "string" &&
        options.termsAccepted.trim().toLowerCase() === "true");

    if (!options.skipDisclosure) {
      const ack = await confirmCheckoutDisclosure({
        invoker:
          options.invoker instanceof HTMLElement
            ? options.invoker
            : document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
      });
      termsVersion = ack.termsVersion;
      termsAccepted = ack.termsAccepted === true;
    }

    if (!termsVersion || !termsAccepted) {
      throw new Error("Confirm the current Terms of Service before starting Checkout.");
    }

    const resumeIntentId =
      typeof options.resumeIntentId === "string" && options.resumeIntentId.trim()
        ? options.resumeIntentId.trim()
        : undefined;

    const response = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        successPath: options.successPath,
        cancelPath: options.cancelPath,
        resumeIntentId,
        termsVersion,
        termsAccepted: true
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      if (!options.skipAuthRemember) {
        rememberPendingUpgradeCheckout({
          ...options,
          intentId: resumeIntentId
        });
      }
      const error = new Error(payload?.error || "Sign in to upgrade to Pro.");
      error.code = "AUTH_REQUIRED_FOR_UPGRADE";
      throw error;
    }
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    window.location.href = payload.url;
    return {
      started: true,
      url: payload.url,
      sessionId: payload.sessionId || "",
      resumeIntentId: resumeIntentId || null,
      termsVersion,
      termsAccepted: true
    };
  };

  let resumeInFlightPromise = null;

  const resumePendingUpgradeCheckout = async (options = {}) => {
    if (resumeInFlightPromise) {
      return resumeInFlightPromise;
    }
    resumeInFlightPromise = (async () => {
      const session =
        options.session && typeof options.session === "object" && options.session.userId
          ? options.session
          : getAuthSession();
      if (!session?.userId || !session?.email) {
        return { resumed: false, reason: "unauthenticated" };
      }
      const pending = takePendingUpgradeCheckout();
      if (!pending) {
        return { resumed: false, reason: "none" };
      }

      let plan = options.plan;
      try {
        if (!plan || !hasStripeCheckout(plan)) {
          const planResponse = await apiFetch("/api/account/plan");
          plan = planResponse.ok ? await planResponse.json().catch(() => null) : null;
        }
        if (!hasStripeCheckout(plan)) {
          throw new Error("Upgrade is not configured yet.");
        }
        await startUpgradeCheckout(plan, {
          successPath: pending.successPath,
          cancelPath: pending.cancelPath,
          resumeIntentId: pending.intentId,
          skipAuthRemember: true,
          authSession: session
        });
        return { resumed: true, intentId: pending.intentId };
      } catch (error) {
        restorePendingUpgradeCheckout(pending);
        throw error;
      }
    })().finally(() => {
      resumeInFlightPromise = null;
    });
    return resumeInFlightPromise;
  };

  const requestContractCopy = async (options = {}) => {
    const legal = getLegalFoundation();
    const termsVersion =
      typeof options.termsVersion === "string" && options.termsVersion.trim()
        ? options.termsVersion.trim()
        : legal?.LEGAL_TERMS_VERSION || "";
    const response = await apiFetch("/api/billing/contract-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termsVersion })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to send contract copy.");
    }
    return payload;
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
    confirmCheckoutDisclosure,
    requestContractCopy,
    openBillingPortal,
    rememberPendingUpgradeCheckout,
    consumePendingUpgradeCheckout,
    peekPendingUpgradeCheckout,
    takePendingUpgradeCheckout,
    restorePendingUpgradeCheckout,
    clearPendingUpgradeCheckout,
    resumePendingUpgradeCheckout,
    PENDING_UPGRADE_TTL_MS
  };
})();
