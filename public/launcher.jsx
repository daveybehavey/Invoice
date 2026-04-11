const { BrowserRouter, Routes, Route, useLocation, useNavigate, useParams } = ReactRouterDOM;
const { useEffect, useMemo, useState } = React;

const uiPrimitives = window.InvoiceUIPrimitives;
if (!uiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before /launcher.jsx.");
}

const { SparklesIcon, PencilIcon, UploadIcon, ArchiveIcon, SwatchIcon } = uiPrimitives;

const intakeFeatureUtils = window.InvoiceIntakeFeature;
if (!intakeFeatureUtils) {
  throw new Error(
    "Missing /features/intake/aiIntake.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { AIIntake } = intakeFeatureUtils;

const importFeatureUtils = window.InvoiceImportFeature;
if (!importFeatureUtils) {
  throw new Error(
    "Missing /features/import/importInvoice.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ImportInvoice } = importFeatureUtils;

const libraryFeatureUtils = window.InvoiceLibraryFeature;
if (!libraryFeatureUtils) {
  throw new Error(
    "Missing /features/library/invoiceLibrary.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { InvoiceLibrary } = libraryFeatureUtils;

const diagnosticsFeatureUtils = window.InvoiceDiagnosticsFeature;
if (!diagnosticsFeatureUtils) {
  throw new Error(
    "Missing /features/diagnostics/intakeDiagnostics.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { IntakeDiagnostics } = diagnosticsFeatureUtils;

const businessIdentityFeatureUtils = window.InvoiceBusinessIdentityFeature;
if (!businessIdentityFeatureUtils) {
  throw new Error(
    "Missing /features/settings/businessIdentity.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { BusinessIdentitySettings } = businessIdentityFeatureUtils;

const manualCanvasUtils = window.InvoiceManualCanvas;
if (!manualCanvasUtils) {
  throw new Error(
    "Missing /features/manual/manualInvoiceCanvas.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { ManualInvoiceCanvas } = manualCanvasUtils;

const accountPlanUtils = window.InvoiceAccountPlanUtils;
if (!accountPlanUtils) {
  throw new Error("Missing /utils/accountPlan.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  formatPlanSummary,
  getPlanUpgradeUrl,
  getPlanBillingPortalUrl,
  getPlanPrelimitWarning,
  getPlanUsageModel,
  getPlanUpgradeCtaLabel
} =
  accountPlanUtils;
const billingActions = window.InvoiceBillingActions;
if (!billingActions) {
  throw new Error("Missing /utils/billingActions.js load. Ensure it is loaded before /launcher.jsx.");
}

const { hasStripeCheckout, hasStripePortal, startUpgradeCheckout, openBillingPortal } = billingActions;
const upgradeTelemetry = window.InvoiceUpgradeTelemetry;

const requestIdentity = window.InvoiceRequestIdentity;
if (!requestIdentity) {
  throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
}

const { apiFetch, getAuthSession, refreshSession, signInWithEmail, signOut } = requestIdentity;

const launcherSectionUtils = window.InvoiceLauncherSections;
if (!launcherSectionUtils) {
  throw new Error(
    "Missing /features/launcher/launcherSections.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const { AccountStrip, DraftRecoverySection, StartSection, AlternateStartsSection, ManageSection, AuthModal } =
  launcherSectionUtils;
const launcherHelperUtils = window.InvoiceLauncherHelpers;
if (!launcherHelperUtils) {
  throw new Error(
    "Missing /features/launcher/launcherHelpers.js load. Ensure it is loaded before /launcher.jsx."
  );
}

const {
  readBillingNoticeFromUrl,
  isValidEmail,
  isDiagnosticsHost,
  buildLauncherOptions,
  buildPlanActionState,
  hasResumeDraftForKey
} = launcherHelperUtils;
const intakeReadinessUtils = window.InvoiceIntakeReadiness;
if (!intakeReadinessUtils) {
  throw new Error("Missing /features/intake/readiness.js load. Ensure it is loaded before /launcher.jsx.");
}

const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;

function deriveTaxRate(invoice) {
  if (!invoice) {
    return "0";
  }
  const subtotal = Number(invoice.subtotal);
  const total = Number(invoice.total);
  if (!Number.isFinite(subtotal) || !Number.isFinite(total) || subtotal <= 0) {
    return "0";
  }
  const taxAmount = total - subtotal;
  if (taxAmount <= 0) {
    return "0";
  }
  return ((taxAmount / subtotal) * 100).toFixed(2);
}

function formatUpdatedLabel(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function resolveBillieLauncherFallbackReply(message) {
  const normalized = typeof message === "string" ? message.trim().toLowerCase() : "";
  if (!normalized) {
    return {
      message:
        "Tell me what you want to do. I can route you to intake, import, manual editing, or library.",
      action: null
    };
  }
  if (/(start|intake|notes|draft|new invoice|first invoice)/.test(normalized)) {
    return {
      message:
        "Start with intake. Paste rough notes and I will help you turn them into a draft with explicit money decisions.",
      action: { label: "Open intake", route: "/ai-intake" }
    };
  }
  if (/(import|photo|image|pdf|file|upload|scan)/.test(normalized)) {
    return {
      message:
        "Use import when you already have a file or photo note. You can review extracted text before building the draft.",
      action: { label: "Open import", route: "/import" }
    };
  }
  if (/(manual|blank|custom|from scratch|edit layout)/.test(normalized)) {
    return {
      message:
        "Manual mode is best when you want full control. Billie is still available there for safe wording and style updates.",
      action: { label: "Open manual editor", route: "/manual" }
    };
  }
  if (/(library|history|past invoice|sent|paid|reminder|follow up)/.test(normalized)) {
    return {
      message: "Library is where you manage sent, paid, reminders, and estimate conversion.",
      action: { label: "Open library", route: "/invoices" }
    };
  }
  if (/(decision|skip|add|money|total|safe|guardrail|numbers)/.test(normalized)) {
    return {
      message:
        "Billie can refine wording and structure, but money-impacting changes stay explicit with Add/Skip or structured actions.",
      action: { label: "Start with intake", route: "/ai-intake" }
    };
  }
  if (/(price|pricing|plan|upgrade|billing|pro)/.test(normalized)) {
    return {
      message:
        "Free works for getting started. Pro unlocks higher limits and smoother send/payment workflows when usage grows.",
      action: null
    };
  }
  return {
    message:
      "I can help you start quickly. Try: \"start from notes\", \"import a PDF\", \"open library\", or \"manual invoice\".",
    action: { label: "Open intake", route: "/ai-intake" }
  };
}

function Launcher() {
  const navigate = useNavigate();
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authEmailError, setAuthEmailError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingNotice, setBillingNotice] = useState(null);
  const showDiagnosticsLink =
    typeof window !== "undefined" && isDiagnosticsHost(window.location.hostname);

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) {
          return;
        }
        setAuthSession(session);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAuthSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const response = await apiFetch("/api/account/plan");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setAccountPlan(null);
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      } catch (_error) {
        if (!active) {
          return;
        }
        setAccountPlan(null);
      }
    };
    loadPlan();
    return () => {
      active = false;
    };
  }, [authSession?.userId]);

  useEffect(() => {
    if (!authModalOpen) {
      return undefined;
    }
    const handleKeydown = (event) => {
      if (event.key === "Escape" && !authBusy) {
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [authModalOpen, authBusy]);

  const handleSignIn = async () => {
    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthEmailError("Enter your email.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setAuthEmailError("Enter a valid email address.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthEmailError("");
    try {
      const session = await signInWithEmail(normalizedEmail);
      setAuthSession(session);
      setAuthModalOpen(false);
      setAuthEmail("");
    } catch (error) {
      const message = error?.message || "Sign in failed.";
      setAuthError(message);
      setAuthEmailError(message);
    } finally {
      setAuthBusy(false);
    }
  };

  const openSignInModal = () => {
    setAuthError("");
    setAuthEmailError("");
    setAuthEmail(authSession?.email ?? "");
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signOut();
      setAuthSession(null);
    } catch (error) {
      setAuthError(error?.message || "Sign out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const options = buildLauncherOptions({
    navigate,
    icons: {
      sparkles: <SparklesIcon />,
      upload: <UploadIcon />,
      pencil: <PencilIcon />,
      archive: <ArchiveIcon />,
      swatch: <SwatchIcon />
    }
  });
  const primaryOption = options.find((option) => option.key === "ai") ?? options[0];
  const quickStartOptions = options.filter(
    (option) => option.key === "import" || option.key === "manual"
  );
  const manageOptions = options.filter(
    (option) => option.key === "library" || option.key === "identity"
  );
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const teamRole =
    accountPlan?.team?.role === "helper"
      ? "helper"
      : accountPlan?.team?.role === "owner"
        ? "owner"
        : null;
  const planAtLimit = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const warningUpgradeLabel = getPlanUpgradeCtaLabel(accountPlan, {
    source: "launcher",
    phase: "warning"
  });
  const primaryUpgradeLabel = getPlanUpgradeCtaLabel(accountPlan, {
    source: "launcher",
    phase: "primary"
  });
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const billingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const {
    useStripeUpgradeAction,
    useStripePortalAction,
    showUpgradeAction,
    showBillingPortalAction,
    hasPlanActions
  } = buildPlanActionState({
    accountPlan,
    upgradeUrl,
    billingPortalUrl,
    hasStripeCheckout,
    hasStripePortal
  });
  const draftStorageKey = requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
  const [hasResumeDraft, setHasResumeDraft] = useState(false);
  const [showAlternateStarts, setShowAlternateStarts] = useState(false);
  const [showPlanActions, setShowPlanActions] = useState(false);
  const [planActionsAutoOpened, setPlanActionsAutoOpened] = useState(false);
  const [showManageOptions, setShowManageOptions] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [draftRecoveryItems, setDraftRecoveryItems] = useState([]);
  const [draftRecoveryLoading, setDraftRecoveryLoading] = useState(false);
  const [resumeDraftBusyId, setResumeDraftBusyId] = useState("");
  const billieBubbleDismissedStorageKey =
    requestIdentity.getScopedStorageKey?.("billieLauncherBubbleDismissed") ??
    "billieLauncherBubbleDismissed";
  const [billieBubbleDismissed, setBillieBubbleDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(billieBubbleDismissedStorageKey) === "1";
    } catch (_error) {
      return false;
    }
  });
  const billieMoods = ["(•‿•)", "(•ᴗ•)", "(•‿◕)"];
  const [billieMoodIndex, setBillieMoodIndex] = useState(0);
  const [billieChatOpen, setBillieChatOpen] = useState(false);
  const [billieChatInput, setBillieChatInput] = useState("");
  const [billieChatBusy, setBillieChatBusy] = useState(false);
  const [billieChatMessages, setBillieChatMessages] = useState(() => [
    {
      id: "billie-welcome",
      role: "ai",
      text: "Hi - I'm Billie. Tell me what you need and I'll route you to the right flow.",
      action: null
    }
  ]);

  useEffect(() => {
    const shouldAutoOpenPlanActions = hasPlanActions && (planAtLimit || Boolean(planWarning));
    if (shouldAutoOpenPlanActions && !planActionsAutoOpened) {
      setShowPlanActions(true);
      setPlanActionsAutoOpened(true);
      return;
    }
    if (!shouldAutoOpenPlanActions && planActionsAutoOpened) {
      setPlanActionsAutoOpened(false);
    }
  }, [hasPlanActions, planAtLimit, planWarning, planActionsAutoOpened]);

  useEffect(() => {
    if (!upgradeTelemetry || accountPlan?.plan !== "free") {
      return;
    }
    const remainingSaves = Number.isFinite(accountPlan?.usage?.invoicesRemaining)
      ? Number(accountPlan.usage.invoicesRemaining)
      : null;
    if (planAtLimit) {
      upgradeTelemetry.trackLimitExposure({
        source: "launcher",
        planTier: "free",
        remainingSaves
      });
      return;
    }
    if (planWarning) {
      upgradeTelemetry.trackWarningExposure({
        source: "launcher",
        planTier: "free",
        remainingSaves
      });
    }
  }, [accountPlan?.plan, accountPlan?.usage?.invoicesRemaining, planAtLimit, planWarning]);

  const handleUpgradeAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, {
        source: "launcher",
        successPath: "/?billing=success",
        cancelPath: "/?billing=cancelled"
      });
    } catch (error) {
      setBillingError(error?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleBillingAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await openBillingPortal(accountPlan, { source: "launcher", returnPath: "/" });
    } catch (error) {
      setBillingError(error?.message || "Unable to open billing.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleUpgradeLinkClick = () => {
    if (!upgradeTelemetry || accountPlan?.plan !== "free") {
      return;
    }
    const remainingSaves = Number.isFinite(accountPlan?.usage?.invoicesRemaining)
      ? Number(accountPlan.usage.invoicesRemaining)
      : null;
    upgradeTelemetry.trackUpgradeClick({
      source: "launcher",
      planTier: "free",
      remainingSaves
    });
  };

  useEffect(() => {
    const checkDraft = () => {
      setHasResumeDraft(hasResumeDraftForKey(draftStorageKey));
    };
    checkDraft();
    window.addEventListener("focus", checkDraft);
    return () => {
      window.removeEventListener("focus", checkDraft);
    };
  }, [draftStorageKey, authSession?.userId]);

  useEffect(() => {
    let active = true;
    const loadDraftRecovery = async () => {
      setDraftRecoveryLoading(true);
      try {
        const response = await apiFetch("/api/invoices");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setDraftRecoveryItems([]);
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        const drafts = Array.isArray(payload?.invoices)
          ? payload.invoices
              .filter((invoice) => invoice?.status === "draft")
              .slice(0, 3)
              .map((invoice) => ({
                invoiceId: invoice.invoiceId,
                invoiceNumber: invoice.invoiceNumber || "Draft invoice",
                updatedLabel: formatUpdatedLabel(invoice.updatedAt)
              }))
          : [];
        setDraftRecoveryItems(drafts);
      } catch (_error) {
        if (!active) {
          return;
        }
        setDraftRecoveryItems([]);
      } finally {
        if (active) {
          setDraftRecoveryLoading(false);
        }
      }
    };
    void loadDraftRecovery();
    const handleFocus = () => {
      void loadDraftRecovery();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [authSession?.userId]);

  const handleResumeSavedDraft = async (invoiceId) => {
    if (!invoiceId || resumeDraftBusyId) {
      return;
    }
    setAuthError("");
    setResumeDraftBusyId(invoiceId);
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to open draft.");
      }
      const savedInvoice = payload?.invoice;
      const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice;
      if (!finishedInvoice) {
        throw new Error("Saved draft is incomplete.");
      }
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: deriveTaxRate(finishedInvoice),
        savedInvoiceId: savedInvoice?.invoiceId ?? "",
        savedInvoiceStatus: savedInvoice?.status ?? "draft"
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      navigate("/manual");
    } catch (error) {
      setAuthError(error?.message || "Failed to open draft.");
    } finally {
      setResumeDraftBusyId("");
    }
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setBillieMoodIndex((value) => (value + 1) % billieMoods.length);
    }, 3800);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [billieMoods.length]);

  const dismissBillieBubble = () => {
    setBillieBubbleDismissed(true);
    try {
      window.localStorage.setItem(billieBubbleDismissedStorageKey, "1");
    } catch (_error) {
      // Best effort only.
    }
  };

  const handleBillieChatSubmit = async (event) => {
    event?.preventDefault?.();
    const message = billieChatInput.trim();
    if (!message || billieChatBusy) {
      return;
    }
    const messageId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setBillieChatMessages((current) => [
      ...current,
      {
        id: `user-${messageId}`,
        role: "user",
        text: message,
        action: null
      }
    ]);
    setBillieChatInput("");
    setBillieChatBusy(true);
    try {
      const response = await apiFetch("/api/assistant/launcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const payload = await response.json().catch(() => ({}));
      const reply =
        response.ok && payload?.reply && typeof payload.reply.message === "string"
          ? payload.reply
          : resolveBillieLauncherFallbackReply(message);
      setBillieChatMessages((current) => [
        ...current,
        {
          id: `ai-${messageId}`,
          role: "ai",
          text: reply.message ?? reply.text ?? "I can help route you to the right flow.",
          action:
            reply?.action &&
            typeof reply.action.route === "string" &&
            typeof reply.action.label === "string"
              ? {
                  route: reply.action.route,
                  label: reply.action.label
                }
              : null
        }
      ]);
    } catch (_error) {
      const fallback = resolveBillieLauncherFallbackReply(message);
      setBillieChatMessages((current) => [
        ...current,
        {
          id: `ai-${messageId}`,
          role: "ai",
          text: fallback.message ?? fallback.text,
          action: fallback.action
        }
      ]);
    } finally {
      setBillieChatBusy(false);
    }
  };

  const billieQuickPrompts = [
    { label: "Start from notes", value: "start from notes" },
    { label: "Import a PDF", value: "import a PDF invoice" },
    { label: "Open library", value: "open library" },
    { label: "Manual invoice", value: "manual invoice" }
  ];

  return (
    <div
      className="nb-page nb-page--launcher min-h-screen overflow-hidden text-slate-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(172,204,240,0.88), rgba(238,244,251,0) 30%), radial-gradient(circle at top right, rgba(105,147,210,0.18), rgba(238,244,251,0) 28%), linear-gradient(180deg, #f8fbff 0%, #eef4fb 48%, #f7fbff 100%)"
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(120deg,rgba(9,48,100,0.04),rgba(9,48,100,0)_36%)]" />
      <div className="pointer-events-none absolute left-[-120px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#acd0f4]/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-80px] top-[80px] h-[220px] w-[220px] rounded-full bg-[#6993d2]/20 blur-3xl" />
      <main className="nb-page-shell nb-page-shell--wide relative max-w-xl md:max-w-6xl md:py-14">
        <section className="nb-surface nb-surface--elevated overflow-hidden rounded-[36px] border-white/70 bg-white/72 p-0">
          <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:gap-8 md:p-8 lg:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-[#6993d2]/25 bg-[#f4f8fd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#093064]">
                  NoteBill
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                  Billie helps, you approve
                </span>
              </div>
              <div className="mt-5 max-w-3xl">
                <h1
                  className="nb-title text-[2rem] leading-[1.02] text-slate-900 md:text-6xl"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Turn rough notes into a client-ready invoice.
                </h1>
                <p className="nb-copy mt-3 max-w-2xl md:mt-4 md:leading-7">
                  Paste what happened. Billie builds a clean draft. You only approve the money decisions.
                </p>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 md:mt-6 md:gap-3">
                {[
                  ["Messy input", "Notes, screenshots, PDFs, photos, or voice notes."],
                  ["Clear review", "Only money-impacting choices require your call."],
                  ["Ready to send", "Save, export, or send without rewrites."]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="nb-subcard rounded-[20px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,248,253,0.94))] px-3 py-3 shadow-[0_10px_30px_rgba(9,48,100,0.05)] md:rounded-[22px] md:px-4 md:py-4"
                  >
                    <p className="text-sm font-semibold text-[#093064]">{title}</p>
                    <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block md:mt-1.5">{copy}</p>
                  </div>
                ))}
              </div>
              <AccountStrip
                authSession={authSession}
                teamRole={teamRole}
                authBusy={authBusy}
                planSummary={planSummary}
                planUsage={planUsage}
                planAtLimit={planAtLimit}
                planWarning={planWarning}
                hasPlanActions={hasPlanActions}
                showPlanActions={showPlanActions}
                onTogglePlanActions={() => setShowPlanActions((current) => !current)}
                showUpgradeAction={showUpgradeAction}
                warningUpgradeLabel={warningUpgradeLabel}
                primaryUpgradeLabel={primaryUpgradeLabel}
                upgradeUrl={upgradeUrl}
                useStripeUpgradeAction={useStripeUpgradeAction}
                showBillingPortalAction={showBillingPortalAction}
                billingPortalUrl={billingPortalUrl}
                useStripePortalAction={useStripePortalAction}
                billingBusy={billingBusy}
                onOpenUpgrade={handleUpgradeAction}
                onUpgradeLinkClick={handleUpgradeLinkClick}
                onOpenBillingPortal={handleBillingAction}
                onOpenSignIn={openSignInModal}
                onSignOut={handleSignOut}
              />
              {billingNotice ? (
                <p
                  className={`nb-banner mt-3 ${
                    billingNotice.tone === "green"
                      ? "nb-banner--success"
                      : "nb-banner--warning"
                  }`}
                >
                  {billingNotice.message}
                </p>
              ) : null}
              {authError ? <p className="mt-3 text-sm text-rose-600">{authError}</p> : null}
              {billingError ? <p className="mt-3 text-sm text-rose-600">{billingError}</p> : null}
              <div className="mt-4 rounded-[24px] border border-[#6993d2]/18 bg-[#093064] px-4 py-4 text-white shadow-[0_14px_40px_rgba(9,48,100,0.18)] md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#acd0f4]">Built for real work</p>
                <p className="mt-2 text-base font-semibold text-white">Billie organizes the draft. You approve the money.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  One clear start. Visible draft changes. No silent total edits.
                </p>
              </div>
            </div>
            <aside className="hidden flex-col justify-between rounded-[30px] border border-[#6993d2]/22 bg-[#093064] p-5 text-white shadow-[0_20px_60px_rgba(9,48,100,0.22)] md:flex md:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#acd0f4]">
                  Built for real work
                </p>
                <h2
                  className="mt-4 text-3xl leading-tight text-white"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Fast enough between jobs. Clean enough to send the same day.
                </h2>
                <div className="mt-6 space-y-3">
                  {[
                    "Billie cleans up structure and wording, but never makes silent money decisions.",
                    "Start from rough notes, a file import, or a blank invoice when you need more control.",
                    "The invoice stays visible while you work, so changes never feel hidden."
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/8 px-3 py-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#acd0f4] text-xs font-bold text-[#093064]">
                        ✓
                      </span>
                      <p className="text-sm leading-6 text-slate-100">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/8 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#acd0f4]">Best first step</p>
                <p className="mt-2 text-lg font-semibold text-white">Paste the rough version first.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Most people only need one path: start with Billie, approve the money details, then send.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="mt-7 space-y-5 md:mt-8">
          <StartSection
          primaryOption={primaryOption}
          hasResumeDraft={hasResumeDraft}
          onResumeDraft={() => navigate("/manual")}
          showAlternateStarts={showAlternateStarts}
          onToggleAlternateStarts={() => setShowAlternateStarts((current) => !current)}
          />
          <DraftRecoverySection
            drafts={draftRecoveryItems}
            loading={draftRecoveryLoading}
            busyInvoiceId={resumeDraftBusyId}
            onResumeDraft={handleResumeSavedDraft}
            onOpenLibrary={() => navigate("/invoices")}
          />

          <AlternateStartsSection
            showAlternateStarts={showAlternateStarts}
            quickStartOptions={quickStartOptions}
          />

          <ManageSection
            showManageOptions={showManageOptions}
            onToggleManageOptions={() => setShowManageOptions((current) => !current)}
            manageOptions={manageOptions}
          />
        </div>
        {showDiagnosticsLink ? (
          <button
            type="button"
            className="mt-6 text-sm font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/diagnostics")}
          >
            Internal diagnostics
          </button>
        ) : null}
      </main>
      <div className="nb-billie-floating">
        {billieChatOpen ? (
          <div className="nb-billie-floating__popover">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6993d2]">Billie assistant</p>
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                onClick={() => setBillieChatOpen(false)}
                aria-label="Close Billie chat"
              >
                Close
              </button>
            </div>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {billieChatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-2.5 py-2 text-xs ${
                    message.role === "user" ? "bg-[#e9f2fd] text-[#093064]" : "bg-white text-slate-700"
                  }`}
                >
                  <p className="font-semibold uppercase tracking-wide text-[10px]">
                    {message.role === "user" ? "You" : "Billie"}
                  </p>
                  <p className="mt-1 leading-5">{message.text}</p>
                  {message.action ? (
                    <button
                      type="button"
                      className="mt-2 rounded-full border border-[#6993d2]/35 bg-[#f4f8fd] px-2.5 py-1 text-[11px] font-semibold text-[#093064]"
                      onClick={() => navigate(message.action.route)}
                    >
                      {message.action.label}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {billieQuickPrompts.map((prompt) => (
                <button
                  key={prompt.value}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800"
                  onClick={() => setBillieChatInput(prompt.value)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
            <form className="mt-2 flex items-center gap-2" onSubmit={handleBillieChatSubmit}>
              <input
                type="text"
                className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#6993d2] focus:outline-none focus:ring-2 focus:ring-[#acd0f4]"
                placeholder="Ask Billie…"
                value={billieChatInput}
                onChange={(event) => setBillieChatInput(event.target.value)}
                disabled={billieChatBusy}
              />
              <button
                type="submit"
                className="rounded-full border border-[#6993d2]/35 bg-[#f4f8fd] px-2.5 py-1.5 text-[11px] font-semibold text-[#093064] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={billieChatBusy || !billieChatInput.trim()}
              >
                {billieChatBusy ? "..." : "Send"}
              </button>
            </form>
          </div>
        ) : null}
        {!billieBubbleDismissed && !billieChatOpen ? (
          <div className="nb-billie-floating__popover">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6993d2]">Billie</p>
            <p className="mt-1 text-sm text-slate-700">
              Want help getting started? I can build your first draft from rough notes.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="nb-btn-ghost px-2.5 py-1 text-[11px]"
                onClick={() => navigate("/ai-intake")}
              >
                Start with Billie
              </button>
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                onClick={dismissBillieBubble}
                aria-label="Hide Billie helper"
              >
                Hide
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="nb-billie-floating__button"
          onClick={() => setBillieChatOpen((open) => !open)}
          aria-label="Open Billie assistant"
        >
          <span className="nb-billie-floating__face" aria-hidden="true">{billieMoods[billieMoodIndex]}</span>
          <span className="nb-billie-floating__label">Billie</span>
        </button>
      </div>
      <AuthModal
        open={authModalOpen}
        authBusy={authBusy}
        authEmail={authEmail}
        authEmailError={authEmailError}
        onChangeEmail={(event) => {
          setAuthEmail(event.target.value);
          setAuthEmailError("");
        }}
        onCancel={() => setAuthModalOpen(false)}
        onSubmit={handleSignIn}
      />
    </div>
  );
}

function Placeholder({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <button
          type="button"
          className="nb-btn-ghost"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <div className="nb-surface nb-surface--elevated mt-4">
          <h1 className="nb-section-title">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
      </main>
    </div>
  );
}

function CustomerPaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoiceId = "" } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState("");
  const [approvalError, setApprovalError] = useState("");

  const trackingToken = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return (params.get("token") || "").trim();
  }, [location.search]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!invoiceId || !trackingToken) {
        setError("This payment link is missing a valid token.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch(
          `/api/public/invoices/${encodeURIComponent(invoiceId)}/payment?token=${encodeURIComponent(trackingToken)}`
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load invoice payment details.");
        }
        if (!active) {
          return;
        }
        setInvoice(payload?.invoice ?? null);
        setLoading(false);
      } catch (requestError) {
        if (!active) {
          return;
        }
        setError(requestError?.message || "Unable to load invoice payment details.");
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [invoiceId, trackingToken]);

  const formatMoney = (value, currency = "USD") => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return "—";
    }
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
    } catch (_error) {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const isPaid = invoice?.status === "paid" || Number(invoice?.balanceDue ?? 0) <= 0;
  const documentType = invoice?.documentType === "estimate" ? "estimate" : "invoice";
  const isEstimate = documentType === "estimate";
  const estimateApprovalStatus =
    invoice?.estimateApprovalStatus === "approved" || invoice?.estimateApprovalStatus === "rejected"
      ? invoice.estimateApprovalStatus
      : "pending";
  const isEstimateApproved = estimateApprovalStatus === "approved";
  const paymentLinkUrl =
    typeof invoice?.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim()
      ? invoice.paymentLinkUrl.trim()
      : "";
  const billingStage =
    invoice?.billingStage === "deposit" ||
    invoice?.billingStage === "progress" ||
    invoice?.billingStage === "final"
      ? invoice.billingStage
      : "standard";
  const billingStageLabel =
    billingStage === "deposit"
      ? "Deposit"
      : billingStage === "progress"
        ? "Progress"
        : billingStage === "final"
          ? "Final"
          : "Standard";
  const projectTotal =
    Number.isFinite(invoice?.projectTotal) && invoice.projectTotal > 0 ? Number(invoice.projectTotal) : null;
  const projectPaidToDate =
    Number.isFinite(invoice?.projectPaidToDate) && invoice.projectPaidToDate >= 0
      ? Number(invoice.projectPaidToDate)
      : null;
  const projectBalanceAfterInvoice =
    Number.isFinite(invoice?.projectBalanceAfterInvoice) && invoice.projectBalanceAfterInvoice >= 0
      ? Number(invoice.projectBalanceAfterInvoice)
      : null;
  const attachmentList = Array.isArray(invoice?.attachments)
    ? invoice.attachments
        .map((attachment) => ({
          label: typeof attachment?.label === "string" ? attachment.label.trim() : "",
          url: typeof attachment?.url === "string" ? attachment.url.trim() : "",
          type:
            attachment?.type === "photo" ||
            attachment?.type === "document" ||
            attachment?.type === "other"
              ? attachment.type
              : "link"
        }))
        .filter((attachment) => attachment.label.length > 0 && attachment.url.length > 0)
    : [];

  const handleEstimateApproval = async (status) => {
    if (!invoiceId || !trackingToken) {
      setApprovalError("This estimate link is missing a valid token.");
      return;
    }
    if (!isEstimate) {
      return;
    }
    setApprovalBusy(true);
    setApprovalError("");
    setApprovalNotice("");
    try {
      const response = await apiFetch(
        `/api/public/invoices/${encodeURIComponent(invoiceId)}/estimate-approval?token=${encodeURIComponent(trackingToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to update estimate approval.");
      }
      setInvoice(payload?.invoice ?? null);
      setApprovalNotice(status === "approved" ? "Estimate approved." : "Estimate declined.");
    } catch (requestError) {
      setApprovalError(requestError?.message || "Unable to update estimate approval.");
    } finally {
      setApprovalBusy(false);
    }
  };

  const estimateApprovalChipClass =
    estimateApprovalStatus === "approved"
      ? "nb-chip nb-chip--success normal-case tracking-normal"
      : estimateApprovalStatus === "rejected"
        ? "nb-chip nb-chip--danger normal-case tracking-normal"
        : "nb-chip nb-chip--warning normal-case tracking-normal";
  const estimateApprovalLabel =
    estimateApprovalStatus === "approved"
      ? "Approved"
      : estimateApprovalStatus === "rejected"
        ? "Rejected"
        : "Pending approval";
  const estimateApprovedBy =
    typeof invoice?.estimateApprovedBy === "string" && invoice.estimateApprovedBy.trim()
      ? invoice.estimateApprovedBy.trim()
      : "";

  return (
    <div className="nb-page">
      <main className="nb-page-shell nb-page-shell--medium py-10">
        <div className="nb-surface nb-surface--elevated p-6 sm:p-8">
          <p className="nb-kicker">NoteBill {isEstimate ? "Estimate" : "Payment"}</p>
          <h1 className="nb-section-title mt-2">{isEstimate ? "Estimate review" : "Invoice payment"}</h1>
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading payment details…</p>
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-600">{isEstimate ? "Estimate" : "Invoice"}</div>
                <div className="text-lg font-semibold text-slate-900">
                  {invoice?.invoiceNumber || "Draft"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {invoice?.issueDate || "Issue date not set"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">{isEstimate ? "Estimated total" : "Amount"}</div>
                <div className="text-2xl font-semibold text-slate-900">
                  {formatMoney(invoice?.balanceDue ?? invoice?.total ?? 0, invoice?.currency)}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {isEstimate ? "Estimate amount" : isPaid ? "Paid in full" : "Balance due"}
                </div>
              </div>
              {billingStage !== "standard" || projectTotal !== null ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm text-slate-600">Progress billing</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">{billingStageLabel} stage</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {projectTotal !== null ? (
                      <div>Project total: {formatMoney(projectTotal, invoice?.currency)}</div>
                    ) : null}
                    {projectPaidToDate !== null ? (
                      <div>Paid to date: {formatMoney(projectPaidToDate, invoice?.currency)}</div>
                    ) : null}
                    {projectBalanceAfterInvoice !== null ? (
                      <div>
                        Remaining after this invoice: {formatMoney(projectBalanceAfterInvoice, invoice?.currency)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {attachmentList.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">Attachments</div>
                  <div className="mt-2 space-y-2">
                    {attachmentList.map((attachment, index) => (
                      <a
                        key={`${attachment.url}-${index}`}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                      >
                        <span className="truncate">{attachment.label}</span>
                        <span className="text-xs font-semibold text-slate-500 uppercase">
                          {attachment.type}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {isEstimate ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-600">Approval status</span>
                    <span className={estimateApprovalChipClass}>{estimateApprovalLabel}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {isEstimateApproved
                      ? "This estimate has already been approved."
                      : "Review the estimate details and choose Approve or Decline."}
                  </p>
                  {isEstimateApproved && estimateApprovedBy ? (
                    <p className="mt-2 text-xs text-slate-500">Approved by {estimateApprovedBy}</p>
                  ) : null}
                  {!isEstimateApproved ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nb-btn-primary"
                        onClick={() => handleEstimateApproval("approved")}
                        disabled={approvalBusy}
                      >
                        {approvalBusy ? "Applying…" : "Approve estimate"}
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={() => handleEstimateApproval("rejected")}
                        disabled={approvalBusy}
                      >
                        Decline estimate
                      </button>
                    </div>
                  ) : null}
                  {approvalNotice ? (
                    <p className="mt-3 text-sm text-emerald-700">{approvalNotice}</p>
                  ) : null}
                  {approvalError ? (
                    <p className="mt-3 text-sm text-rose-700">{approvalError}</p>
                  ) : null}
                </div>
              ) : isPaid ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  This invoice is already paid.
                </div>
              ) : paymentLinkUrl ? (
                <a className="nb-btn-primary w-full justify-center" href={paymentLinkUrl} target="_blank" rel="noreferrer">
                  Pay securely
                </a>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Payment link is not available yet. Please contact the sender.
                </div>
              )}
            </div>
          )}
        </div>
        <button type="button" className="nb-btn-ghost mt-4" onClick={() => navigate("/")}>
          Back to NoteBill
        </button>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/ai-intake" element={<AIIntake />} />
        <Route path="/invoices" element={<InvoiceLibrary />} />
        <Route path="/manual" element={<ManualInvoiceCanvas />} />
        <Route path="/import" element={<ImportInvoice />} />
        <Route path="/pay/:invoiceId" element={<CustomerPaymentPage />} />
        <Route path="/diagnostics" element={<IntakeDiagnostics />} />
        <Route path="/settings/business" element={<BusinessIdentitySettings />} />
        <Route
          path="*"
          element={<Placeholder title="Page not found" description="Return to the launcher to continue." />}
        />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
