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

const { formatPlanSummary, getPlanUpgradeUrl, getPlanBillingPortalUrl, getPlanPrelimitWarning } =
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
      className="min-h-screen overflow-hidden bg-[#eef4fb] text-slate-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(172,204,240,0.88), rgba(238,244,251,0) 30%), radial-gradient(circle at top right, rgba(105,147,210,0.18), rgba(238,244,251,0) 28%), linear-gradient(180deg, #f8fbff 0%, #eef4fb 48%, #f7fbff 100%)"
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(120deg,rgba(9,48,100,0.04),rgba(9,48,100,0)_36%)]" />
      <div className="pointer-events-none absolute left-[-120px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#acd0f4]/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-80px] top-[80px] h-[220px] w-[220px] rounded-full bg-[#6993d2]/20 blur-3xl" />
      <main className="relative mx-auto max-w-xl px-4 py-6 md:max-w-6xl md:px-6 md:py-14">
        <section className="overflow-hidden rounded-[36px] border border-white/70 bg-white/72 shadow-[0_28px_90px_rgba(9,48,100,0.12)] backdrop-blur">
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
                  className="text-[2rem] leading-[1.02] text-slate-900 md:text-6xl"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Turn rough job notes into a polished invoice without thinking like an accountant.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:mt-4 md:text-base md:leading-7">
                  Paste what happened, let Billie organize it, then make the money decisions that matter.
                  The draft stays visible the whole time so nothing feels hidden.
                </p>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 md:mt-6 md:gap-3">
                {[
                  ["Messy In", "Notes, screenshots, PDFs, photos, or half-finished thoughts."],
                  ["Clear Review", "Open decisions are obvious. Totals stay deterministic."],
                  ["Send-Ready", "Export a client-facing invoice that already reads cleanly."]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-[20px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,248,253,0.94))] px-3 py-3 shadow-[0_10px_30px_rgba(9,48,100,0.05)] md:rounded-[22px] md:px-4 md:py-4"
                  >
                    <p className="text-sm font-semibold text-[#093064]">{title}</p>
                    <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block md:mt-2">{copy}</p>
                  </div>
                ))}
              </div>
              <AccountStrip
                authSession={authSession}
                authBusy={authBusy}
                planSummary={planSummary}
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
                  className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                    billingNotice.tone === "green"
                      ? "border-emerald-200 bg-emerald-50/90 text-emerald-800"
                      : "border-amber-200 bg-amber-50/90 text-amber-800"
                  }`}
                >
                  {billingNotice.message}
                </p>
              ) : null}
              {authError ? <p className="mt-3 text-sm text-rose-600">{authError}</p> : null}
              {billingError ? <p className="mt-3 text-sm text-rose-600">{billingError}</p> : null}
              <div className="mt-4 rounded-[24px] border border-[#6993d2]/18 bg-[#093064] px-4 py-4 text-white shadow-[0_14px_40px_rgba(9,48,100,0.18)] md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#acd0f4]">Built for real work</p>
                <p className="mt-2 text-base font-semibold text-white">Billie organizes the draft. You approve money.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  One clear start, visible draft changes, no silent total edits.
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
                  Simple enough to use from the truck, clean enough to send to a client.
                </h2>
                <div className="mt-6 space-y-3">
                  {[
                    "Billie helps with structure and wording, but never makes silent money decisions.",
                    "You can start from messy notes or import an existing invoice when needed.",
                    "The invoice stays visible, so you always know what changed."
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
                <p className="mt-2 text-lg font-semibold text-white">Start with Billie.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Most people only need one path: paste the messy version and let the draft take shape in front of them.
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
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-10">
        <button
          type="button"
          className="text-sm font-semibold text-blue-800"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
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
