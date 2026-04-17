const { BrowserRouter, Routes, Route, useNavigate } = ReactRouterDOM;
const { useEffect, useState } = React;

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
  getPlanUsageModel
} =
  accountPlanUtils;
const billingActions = window.InvoiceBillingActions;
if (!billingActions) {
  throw new Error("Missing /utils/billingActions.js load. Ensure it is loaded before /launcher.jsx.");
}

const { hasStripeCheckout, hasStripePortal, startUpgradeCheckout, openBillingPortal } = billingActions;

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
  const planAtLimit = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
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
  const [showManageOptions, setShowManageOptions] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [draftRecoveryItems, setDraftRecoveryItems] = useState([]);
  const [draftRecoveryLoading, setDraftRecoveryLoading] = useState(false);
  const [resumeDraftBusyId, setResumeDraftBusyId] = useState("");

  const handleUpgradeAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, { successPath: "/?billing=success" });
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
      await openBillingPortal(accountPlan, { returnPath: "/" });
    } catch (error) {
      setBillingError(error?.message || "Unable to open billing.");
    } finally {
      setBillingBusy(false);
    }
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
                authBusy={authBusy}
          planSummary={planSummary}
          planUsage={planUsage}
          planAtLimit={planAtLimit}
                planWarning={planWarning}
                hasPlanActions={hasPlanActions}
                showPlanActions={showPlanActions}
                onTogglePlanActions={() => setShowPlanActions((current) => !current)}
                showUpgradeAction={showUpgradeAction}
                upgradeUrl={upgradeUrl}
                useStripeUpgradeAction={useStripeUpgradeAction}
                showBillingPortalAction={showBillingPortalAction}
                billingPortalUrl={billingPortalUrl}
                useStripePortalAction={useStripePortalAction}
                billingBusy={billingBusy}
                onOpenUpgrade={handleUpgradeAction}
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

const PUBLIC_INFO_LAST_UPDATED = "2026-04-14";
const SUPPORT_EMAIL = "support@notebill.app";
const CONTACT_EMAIL = "contact@notebill.app";
const INFO_EMAIL = "info@notebill.app";
const DIRECT_CONTACT_EMAIL = "david@notebill.app";
const NOTE_BILL_SITE_URL = "https://notebill.app";

function PublicInfoPage({ kicker, title, intro, sections, footerNote, actions }) {
  const pageActions = actions ?? [
    { href: "/", label: "Open NoteBill", tone: "primary" },
    { href: "/support", label: "Support", tone: "ghost" }
  ];
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium py-8 md:py-10">
        <div className="nb-surface nb-surface--elevated">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="nb-kicker">{kicker}</p>
              <h1 className="nb-title mt-3 text-4xl md:text-5xl">{title}</h1>
              <p className="nb-copy mt-4 max-w-3xl">{intro}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {pageActions.map((action) => (
                <a
                  key={`${action.href}:${action.label}`}
                  className={action.tone === "primary" ? "nb-btn-primary" : "nb-btn-ghost"}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {sections.map((section) => (
              <section key={section.title} className="nb-subcard">
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {paragraph}
                  </p>
                ))}
                {section.items?.length ? (
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#6993d2]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {footerNote ? <p className="mt-6 text-xs leading-6 text-slate-500">{footerNote}</p> : null}
        </div>
      </main>
    </div>
  );
}

function PrivacyPage() {
  return (
    <PublicInfoPage
      kicker="Privacy"
      title="NoteBill Privacy Policy"
      intro="NoteBill helps you turn rough notes, imports, and draft invoice details into professional invoices. This policy explains what information we may collect, how it may be used, and what choices you have when using the product."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. For privacy or deletion requests, email ${SUPPORT_EMAIL} or use the public data deletion page.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Information we may collect",
          items: [
            "Email address and session-related identifiers when you sign in or keep invoices tied to your account.",
            "Content you provide, including notes, invoice details, uploaded invoice files, images, and saved drafts.",
            "Audio notes and transcripts if audio transcription is enabled.",
            "Billing and subscription metadata if paid plans, payment links, or Stripe checkout are enabled.",
            "Limited diagnostic or quality information used to run, secure, and improve the product."
          ],
          paragraphs: []
        },
        {
          title: "How we use information",
          items: [
            "To generate, edit, save, export, send, and reopen invoices.",
            "To authenticate users and scope invoice data to the correct account.",
            "To process imports, transcription, OCR, and invoice-generation workflows.",
            "To support subscription billing, payment-link creation, and invoice email delivery when those features are enabled.",
            "To troubleshoot issues, prevent abuse, and improve reliability."
          ],
          paragraphs: []
        },
        {
          title: "Service providers",
          paragraphs: [
            "Depending on which features are enabled in production, NoteBill may use service providers such as OpenAI for AI-assisted processing, Stripe for billing and payment features, and SMTP2GO, Resend, or another email delivery provider for sending invoices or reminders.",
            "These providers are used to operate the service, not to sell your information."
          ]
        },
        {
          title: "Sharing and disclosure",
          items: [
            "We do not sell your personal information.",
            "We may share information with service providers that help us operate NoteBill.",
            "We may disclose information when required to comply with law, protect the service, investigate abuse, or support a business transfer."
          ],
          paragraphs: []
        },
        {
          title: "Your choices",
          items: [
            "You can delete saved invoices from the app.",
            "You can avoid optional features like uploads, transcription, billing, or email sending if you do not want to use them.",
            "You can request account-related privacy help through the support channel listed on the support page.",
            "You can request account and associated data deletion through the public data deletion page or by emailing support@notebill.app."
          ],
          paragraphs: []
        },
        {
          title: "Security and retention",
          paragraphs: [
            "NoteBill uses reasonable safeguards designed to protect information in transit and at rest, but no system can guarantee absolute security.",
            "Information is kept only as long as needed to provide the service, comply with legal obligations, resolve disputes, and maintain backups or security records where necessary."
          ]
        },
        {
          title: "Children's privacy",
          paragraphs: [
            "NoteBill is not directed to children under 13, and we do not knowingly collect personal information from children under 13."
          ]
        }
      ]}
    />
  );
}

function SupportPage() {
  return (
    <PublicInfoPage
      kicker="Support"
      title="NoteBill Support"
      intro="If you need help with NoteBill, billing, invoice delivery, or account-related questions, use the contact details below. The support inbox is also the public request path for privacy and account deletion issues."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/privacy", label: "Privacy", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Contact",
          items: [
            `Support email: ${SUPPORT_EMAIL}`,
            `Contact email: ${CONTACT_EMAIL}`,
            `Info email: ${INFO_EMAIL}`,
            `Direct contact: ${DIRECT_CONTACT_EMAIL}`,
            `Website: ${NOTE_BILL_SITE_URL}`,
            "Service name: NoteBill"
          ],
          paragraphs: []
        },
        {
          title: "What to include when you contact support",
          items: [
            "The email address used with your NoteBill account, if applicable.",
            "A short description of the problem and what you were trying to do.",
            "The device model and Android version if the issue is mobile-specific.",
            "Screenshots or the invoice ID if the problem relates to a saved draft or send flow."
          ],
          paragraphs: []
        },
        {
          title: "Privacy and account deletion requests",
          paragraphs: [
            "If you want your NoteBill account and associated data deleted, email support@notebill.app or use the public data deletion page.",
            "For account-level deletion requests, include the email address tied to your NoteBill account so we can verify ownership before acting on the request."
          ],
          items: []
        },
        {
          title: "Typical support topics",
          items: [
            "Signing in or session issues",
            "Invoice import, OCR, or transcription questions",
            "Saved drafts, export, and send behavior",
            "Billing, subscription, or payment-link questions",
            "Privacy or data deletion requests"
          ],
          paragraphs: []
        }
      ]}
    />
  );
}

function DataDeletionPage() {
  return (
    <PublicInfoPage
      kicker="Data deletion"
      title="NoteBill Account and Data Deletion"
      intro="If you want your NoteBill account and associated data deleted, use the request path below. This page is intended to satisfy the public account-deletion URL requirement for app marketplaces and to give users a clear way to start a deletion request outside the app."
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/privacy", label: "Privacy", tone: "ghost" }
      ]}
      sections={[
        {
          title: "How to request deletion",
          paragraphs: [
            `Email ${SUPPORT_EMAIL} with a subject such as "NoteBill data deletion request" or "Delete my NoteBill account".`
          ],
          items: [
            "Include the email address associated with your NoteBill account.",
            "If your request relates to billing, include any recent invoice, subscription, or payment details that help us locate the account.",
            "If you no longer have access to the original email address, include enough detail for us to verify ownership before we act on the request."
          ]
        },
        {
          title: "What happens after you contact us",
          items: [
            "We may ask you to verify account ownership before processing the request.",
            "After verification, we will delete or de-identify account-linked data that we are not required to keep.",
            "If your account includes saved invoices, drafts, or imported source material tied to the verified account, those records are included in the account-level deletion workflow."
          ],
          paragraphs: []
        },
        {
          title: "What may be retained",
          items: [
            "Security, fraud-prevention, legal, tax, dispute, and backup records may be retained where required or reasonably necessary.",
            "Payment and subscription records may be retained by us or our billing providers for accounting, compliance, or audit obligations."
          ],
          paragraphs: []
        },
        {
          title: "What you can delete directly in the app",
          items: [
            "Saved invoices can be removed from within NoteBill.",
            "Deleting invoices inside the app is separate from an account-level deletion request."
          ],
          paragraphs: []
        },
        {
          title: "Related pages",
          items: [
            "Privacy policy: /privacy",
            "Support: /support",
            `Website: ${NOTE_BILL_SITE_URL}`
          ],
          paragraphs: []
        }
      ]}
    />
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
        <Route path="/diagnostics" element={<IntakeDiagnostics />} />
        <Route path="/settings/business" element={<BusinessIdentitySettings />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route path="/delete-account" element={<DataDeletionPage />} />
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
