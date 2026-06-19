const launcherSectionUiPrimitives = window.InvoiceUIPrimitives;
if (!launcherSectionUiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before launcher sections.");
}

const { LauncherCard } = launcherSectionUiPrimitives;

function LauncherAccountStrip({
  authSession,
  authBusy,
  planSummary,
  planUsage,
  planAtLimit,
  planWarning,
  planPitch,
  planFeatureHighlights,
  billingStatus,
  hasPlanActions,
  showPlanActions,
  onTogglePlanActions,
  showUpgradeAction,
  upgradeUrl,
  useStripeUpgradeAction,
  googlePlaySubscriptionPlans,
  showLifetimePurchaseAction,
  onOpenLifetimePurchase,
  showBillingPortalAction,
  showRestorePurchasesAction,
  onRestorePurchases,
  billingPortalUrl,
  useStripePortalAction,
  billingBusy,
  billingEnvironment,
  billingDebugState,
  onOpenUpgrade,
  onOpenBillingPortal,
  onOpenSignIn,
  onSignOut,
  hideSignInButton = false
}) {
  const billingActions = window.InvoiceBillingActions;
  const trackedPlanViewRef = React.useRef("");
  const planActionsPanelRef = React.useRef(null);
  const planActionsControlsRef = React.useRef(null);
  const wasPlanActionsOpenRef = React.useRef(Boolean(showPlanActions));
  const usageToneClass =
    planUsage?.statusTone === "limit"
      ? "nb-usage-meter--limit"
      : planUsage?.statusTone === "warning"
        ? "nb-usage-meter--warning"
        : "";
  const signedIn = Boolean(authSession?.email);
  const accountModeLabel = signedIn ? "Signed in" : "Guest mode";
  const accountModeClass = signedIn
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-amber-200 bg-amber-50 text-amber-950";
  const planStateLabel = planAtLimit ? "Upgrade needed" : signedIn ? "Account ready" : "Save later";
  const planStateClass = planAtLimit
    ? "border-amber-200 bg-amber-50 text-amber-950"
    : signedIn
      ? "border-slate-200 bg-white text-slate-700"
      : "border-slate-200 bg-[#f8f5ef] text-slate-700";
  const planToggleLabel = showPlanActions ? "Hide plan & billing" : "View plan & billing";
  const planHelper = signedIn
    ? "Saved drafts, billing, and repeat-client setup now stay tied to this account."
    : "Guest mode is fine for trying the workflow. Sign in when you want saved work and billing to stay with you.";
  const planActionHint = showBillingPortalAction
    ? "Open billing to manage or cancel your current plan."
    : showUpgradeAction || showLifetimePurchaseAction
      ? "Choose monthly for the simplest ongoing plan, or lifetime for one-payment access."
      : "Your current plan is ready.";
  const planActionModeLabel = billingEnvironment?.label || "Plan controls";
  const planActionModeHint = billingEnvironment?.hint || planActionHint;
  const upgradeLabel = billingEnvironment?.mode === "google-play" ? "Get monthly in Google Play" : "Get monthly Pro";
  const lifetimeLabel = billingEnvironment?.mode === "google-play" ? "Buy lifetime in Google Play" : "Buy lifetime Pro";
  const manageBillingLabel = billingEnvironment?.mode === "google-play" ? "Manage in Google Play" : "Manage billing";
  const showInstalledAppGuard = billingEnvironment?.mode === "android-browser";
  const billingStatusToneClass =
    billingStatus?.tone === "success"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
      : billingStatus?.tone === "warning"
        ? "border-amber-200 bg-amber-50/90 text-amber-950"
        : "border-[#d7e2db] bg-white/86 text-slate-800";
  const restoreRecommended = billingStatus?.tierLabel === "Restore recommended";
  const manageBillingHint = restoreRecommended
    ? "Open Google Play to review the subscription state on this account."
    : "";
  const proActive = /pro/i.test(`${billingStatus?.tierLabel || ""}`) && billingStatus?.tone === "success";
  const paidNextMoveHint = proActive
    ? "You are ready to save new work, send cleaner handoffs, add payment links, and keep repeat jobs moving from one place."
    : null;
  const billingDebugEnabled = Boolean(billingDebugState?.enabled);
  const hasGooglePlayPlanChoices =
    billingEnvironment?.mode === "google-play" &&
    Array.isArray(googlePlaySubscriptionPlans) &&
    googlePlaySubscriptionPlans.length > 1;
  React.useEffect(() => {
    if (
      !showPlanActions ||
      (!showUpgradeAction && !showLifetimePurchaseAction && !showBillingPortalAction && !showRestorePurchasesAction)
    ) {
      return;
    }
    const viewKey = `${billingEnvironment?.mode || "unknown"}:${googlePlaySubscriptionPlans?.length || 0}:${showUpgradeAction ? "u" : ""}${showLifetimePurchaseAction ? "l" : ""}${showBillingPortalAction ? "m" : ""}${showRestorePurchasesAction ? "r" : ""}`;
    if (trackedPlanViewRef.current === viewKey) {
      return;
    }
    trackedPlanViewRef.current = viewKey;
    billingActions?.trackBillingPlanViewed?.(`launcher:${billingEnvironment?.mode || "unknown"}`);
  }, [
    billingEnvironment?.mode,
    billingActions,
    googlePlaySubscriptionPlans?.length,
    showBillingPortalAction,
    showLifetimePurchaseAction,
    showPlanActions,
    showRestorePurchasesAction,
    showUpgradeAction
  ]);
  React.useEffect(() => {
    const justOpened = !wasPlanActionsOpenRef.current && showPlanActions;
    wasPlanActionsOpenRef.current = showPlanActions;
    if (!justOpened) {
      return;
    }
    const panel = planActionsPanelRef.current;
    const controls = planActionsControlsRef.current;
    if (!panel || !controls) {
      return;
    }
    window.requestAnimationFrame(() => {
      controls.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [showPlanActions]);
  return (
    <div className="nb-accent-panel nb-reveal-up mt-5 flex flex-col gap-4 rounded-[30px] border border-[#cfe0d8] bg-[linear-gradient(180deg,rgba(248,252,249,0.98),rgba(242,247,244,0.98))] p-4 shadow-[0_18px_42px_rgba(20,83,45,0.06)] sm:flex-row sm:flex-wrap sm:items-start sm:justify-between md:p-5">
      <div className="min-w-0 flex-1">
        <div className="nb-section-chip">Account & billing</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
          <span className={`rounded-full border px-2.5 py-1 ${accountModeClass}`}>{accountModeLabel}</span>
          <span className={`rounded-full border px-2.5 py-1 ${planStateClass}`}>{planStateLabel}</span>
          <span className="rounded-full border border-[#d7e2db] bg-white/80 px-2.5 py-1 text-slate-600">
            {planActionModeLabel}
          </span>
        </div>
        <p className="mt-3 text-base font-semibold text-slate-800">
          {authSession?.email ? `Signed in as ${authSession.email}` : "Guest mode is active on this device"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {authSession?.email
            ? "This is the account NoteBill will use for saved invoices, upgrades, and repeat-work history."
            : "Your draft can keep moving here. Sign in later when you want saved invoices, upgrades, and repeat work tied to an account."}
        </p>
        {planSummary ? (
          <p className={`mt-1 text-xs ${planAtLimit ? "text-amber-700" : "text-slate-500"}`}>{planSummary}</p>
        ) : null}
        {planWarning && !planAtLimit ? (
          <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
        ) : null}
        {planPitch ? <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{planPitch}</p> : null}
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{planHelper}</p>
        {paidNextMoveHint ? (
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[#17493c]">{paidNextMoveHint}</p>
        ) : null}
        {Array.isArray(planFeatureHighlights) && planFeatureHighlights.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {planFeatureHighlights.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[#d5e5de] bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-[#17493c]"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
        {billingDebugEnabled ? (
          <div className="mt-3 max-w-2xl rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-950">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Internal billing debug</p>
            <p className="mt-1">
              <span className="font-semibold">Status:</span> {billingDebugState?.lastStatus || "none"}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Verification:</span> {billingDebugState?.lastVerificationMessage || "No verification yet."}
            </p>
            {billingDebugState?.lastError ? (
              <p className="mt-1">
                <span className="font-semibold">Error:</span> {billingDebugState.lastError}
              </p>
            ) : null}
          </div>
        ) : null}
        {showInstalledAppGuard ? (
          <div className="nb-platform-guard max-w-2xl" role="status" aria-live="polite">
            <p className="nb-platform-guard__eyebrow">Installed app required</p>
            <p className="nb-platform-guard__title">Google Play upgrades only work inside the installed NoteBill app.</p>
            <p className="nb-platform-guard__copy">
              This browser view is fine for reviewing invoices, but billing belongs in the real Android app so Google Play can verify the purchase cleanly.
            </p>
          </div>
        ) : null}
        {planUsage?.finite ? (
          <div className={`nb-usage-meter mt-3 max-w-xl ${usageToneClass}`}>
            <div className="nb-usage-meter__row">
              <span className="nb-usage-meter__label">{planUsage.progressLabel}</span>
              <span className="nb-usage-meter__remaining">{planUsage.remainingLabel}</span>
            </div>
            <div className="nb-usage-meter__track">
              <div
                className="nb-usage-meter__fill"
                style={{ width: `${planUsage.progressPercent}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        ) : null}
        {billingStatus ? (
          <div
            className={`mt-4 max-w-2xl rounded-[26px] border px-4 py-3.5 shadow-[0_14px_34px_rgba(20,83,45,0.06)] ${billingStatusToneClass}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {billingStatus.tierLabel}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {billingStatus.sourceLabel}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold">{billingStatus.headline}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{billingStatus.detail}</p>
            {restoreRecommended ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                Try restore purchases before attempting another Google Play upgrade.
              </p>
            ) : null}
            {manageBillingHint ? (
              <p className="mt-1 text-xs leading-5 opacity-80">{manageBillingHint}</p>
            ) : null}
          </div>
        ) : null}
        {billingDebugEnabled ? (
          <details className="mt-4 max-w-2xl rounded-[26px] border border-dashed border-amber-300 bg-amber-50/70 px-4 py-3 text-amber-950">
            <summary className="cursor-pointer text-sm font-semibold">
              Internal billing debug
            </summary>
            <p className="mt-2 text-xs leading-5 text-amber-900/80">
              This panel is only shown in the internal billing debug build. It helps confirm whether Google Play returned a purchase token and whether backend verification accepted it.
            </p>
            <div className="mt-3 grid gap-2 text-xs leading-5 text-amber-950/90 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Last action</p>
                <p className="mt-1 font-mono text-[11px] break-all">{billingDebugState?.lastAction || "none"}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Last status</p>
                <p className="mt-1 font-mono text-[11px] break-all">{billingDebugState?.lastStatus || "none"}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Product</p>
                <p className="mt-1 font-mono text-[11px] break-all">
                  {billingDebugState?.lastProductId || "none"}
                  {billingDebugState?.lastProductType ? ` · ${billingDebugState.lastProductType}` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Base plan</p>
                <p className="mt-1 font-mono text-[11px] break-all">{billingDebugState?.lastBasePlanId || "none"}</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Purchase token</p>
              <p className="mt-1 font-mono text-[11px] break-all">{billingDebugState?.lastPurchaseToken || "none"}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Verification</p>
                <p className="mt-1 text-[11px] leading-5">{billingDebugState?.lastVerificationMessage || "No verification yet."}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Error</p>
                <p className="mt-1 text-[11px] leading-5">{billingDebugState?.lastError || "No error recorded."}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-amber-700">
              Updated {billingDebugState?.lastUpdatedAt || "never"}
            </p>
          </details>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {hasPlanActions ? (
          <button
            type="button"
            className="nb-btn-ghost w-full rounded-full border border-[#d7e2db] bg-white/78 px-4 text-sm shadow-sm transition hover:border-[#9ecab8] hover:bg-white disabled:opacity-60 sm:w-auto"
            onClick={onTogglePlanActions}
            aria-expanded={showPlanActions}
            aria-controls="launcher-plan-actions"
          >
            {planToggleLabel}
          </button>
        ) : null}
        {authSession?.email ? (
          <button
            type="button"
            className="nb-btn-secondary rounded-full px-3 py-2 disabled:opacity-60 sm:py-1.5"
            onClick={onSignOut}
            disabled={authBusy}
          >
            {authBusy ? "Signing out..." : "Sign out"}
          </button>
        ) : hideSignInButton ? null : (
          <button
            type="button"
            className="nb-btn-ghost rounded-full bg-[#d7f1dd] px-3 py-2 text-sm disabled:opacity-60 sm:py-1.5"
            onClick={onOpenSignIn}
            disabled={authBusy}
          >
            Save & sync with email
          </button>
        )}
      </div>
      {showPlanActions ? (
        <div
          id="launcher-plan-actions"
          ref={planActionsPanelRef}
          className="nb-glass-list mt-1 flex w-full flex-col gap-3 rounded-[26px] border border-[#d7e2db] bg-white/85 p-4 shadow-[0_14px_30px_rgba(20,83,45,0.05)] scroll-mt-6 sm:items-end"
          aria-live="polite"
        >
          <div className="flex flex-col gap-1 sm:items-end">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
              {planActionModeLabel}
            </p>
            <p className="text-xs leading-5 text-slate-500 sm:max-w-xl sm:text-right">{planActionModeHint}</p>
          </div>
          {hasGooglePlayPlanChoices ? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">Choose your plan</p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Prices appear in Google Play</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {googlePlaySubscriptionPlans.map((option) => (
                  <button
                    key={option.basePlanId}
                    type="button"
                    className={`rounded-[20px] border px-3 py-3 text-left transition ${
                      option.isDefault
                        ? "border-[#236a58] bg-[#eef8f3] shadow-[0_16px_30px_rgba(35,106,88,0.14)]"
                        : "border-[#d7e2db] bg-white/92 hover:border-[#91b7a9] hover:bg-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    onClick={() => onOpenUpgrade(option.basePlanId)}
                    disabled={billingBusy}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                      {option.badge || option.isDefault ? (
                        <span className="rounded-full border border-[#9ecab8] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1f5d4d]">
                          {option.badge || "Default"}
                        </span>
                      ) : null}
                    </div>
                    {option.cadenceLabel ? (
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4c776b]">
                        {option.cadenceLabel}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs leading-5 text-slate-500">{option.description}</p>
                    <p className="mt-3 text-xs font-semibold text-[#1f5d4d]">
                      {billingBusy ? "Opening Google Play..." : `Choose ${option.label.toLowerCase()}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div ref={planActionsControlsRef} className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {showUpgradeAction ? (
              hasGooglePlayPlanChoices ? null : useStripeUpgradeAction ? (
                <button
                  type="button"
                  className="nb-btn-primary rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onOpenUpgrade}
                  disabled={billingBusy}
                >
                  {billingBusy ? "Opening..." : upgradeLabel}
                </button>
              ) : (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="nb-btn-primary rounded-full px-3 py-1.5 text-sm"
                >
                  {upgradeLabel}
                </a>
              )
            ) : null}
            {showLifetimePurchaseAction ? (
              <button
                type="button"
                className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onOpenLifetimePurchase}
                disabled={billingBusy}
              >
                {billingBusy ? "Opening..." : lifetimeLabel}
              </button>
            ) : null}
            {showBillingPortalAction ? (
              useStripePortalAction ? (
                <button
                  type="button"
                  className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onOpenBillingPortal}
                  disabled={billingBusy}
                >
                  {billingBusy ? "Opening..." : manageBillingLabel}
                </button>
              ) : (
                <a
                  href={billingPortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
                >
                  {manageBillingLabel}
                </a>
              )
            ) : null}
            {showRestorePurchasesAction ? (
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                  restoreRecommended ? "nb-btn-primary" : "nb-btn-ghost"
                }`}
                onClick={onRestorePurchases}
                disabled={billingBusy}
              >
                {billingBusy ? "Checking..." : "Restore purchases"}
              </button>
            ) : null}
          </div>
          {billingDebugEnabled ? (
            <div className="w-full rounded-[20px] border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2 text-[11px] leading-5 text-amber-950">
              <p className="font-semibold uppercase tracking-[0.16em] text-amber-700">Billing debug</p>
              <p className="mt-1">
                <span className="font-semibold">Status:</span> {billingDebugState?.lastStatus || "none"}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Verification:</span> {billingDebugState?.lastVerificationMessage || "No verification yet."}
              </p>
              {billingDebugState?.lastError ? (
                <p className="mt-1">
                  <span className="font-semibold">Error:</span> {billingDebugState.lastError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LauncherOperationsQueueSection({
  summary,
  loading,
  busyInvoiceId,
  busyActionId,
  onResumeDraft,
  onResumeWithBillie,
  onSendReminder,
  onMarkPaid,
  onInvoiceAgain,
  onStartFromMemory,
  onOpenLibrary,
  onStartInvoice
}) {
  const hasInvoices = Boolean(summary?.hasInvoices);
  if (!hasInvoices && !loading) {
    return null;
  }
  const actionToneClass = {
    draft: "border-emerald-200 bg-emerald-50 text-emerald-950",
    "follow-up": "border-amber-200 bg-amber-50 text-amber-950",
    "repeat-due": "border-violet-200 bg-violet-50 text-violet-950",
    "repeat-soon": "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950",
    sent: "border-sky-200 bg-sky-50 text-sky-950",
    repeat: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950",
    payment: "border-emerald-200 bg-emerald-50 text-emerald-950"
  };
  const stats = [
    { label: "Drafts", value: summary?.draftCount ?? 0 },
    { label: "Sent", value: summary?.sentCount ?? 0 },
    { label: "Open", value: summary?.openBalanceLabel ?? "$0.00" },
    { label: "Paid", value: summary?.paidCount ?? 0 }
  ];
  const actions = Array.isArray(summary?.actions) ? summary.actions : [];

  return (
    <section className="nb-surface nb-surface--elevated mt-6 rounded-[30px] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3d6f61]">Today&apos;s queue</p>
          <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
            Invoice command center
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {loading
              ? "Checking saved invoices..."
              : summary?.headline || "See what needs action before starting new work."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
          {stats.map((stat) => (
            <div key={stat.label} className="nb-metric-card text-center">
              <p className="nb-stat-value">{stat.value}</p>
              <p className="nb-stat-label">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
      {actions.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {actions.map((action, index) => {
            const toneClass = actionToneClass[action.tone] ?? "border-slate-200 bg-slate-50 text-slate-900";
            const isPrimary = index === 0;
            const isBusy = Boolean(
              (action.invoiceId && busyInvoiceId === action.invoiceId) ||
                (action.busyId && busyActionId === action.busyId)
            );
            const isSecondaryBusy = Boolean(
              action.secondaryBusyId && busyActionId === action.secondaryBusyId
            );
            const isActionBusy = isBusy || isSecondaryBusy;
            return (
              <div
                key={action.id}
                className={`rounded-[24px] border p-4 ${toneClass} ${
                  isPrimary ? "ring-2 ring-[#14532d]/10 md:col-span-2" : ""
                }`}
              >
                {isPrimary ? (
                  <p className="mb-2 inline-flex rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#14532d]">
                    Next up
                  </p>
                ) : null}
                <p className="text-sm font-semibold">{action.title}</p>
                <p className="mt-2 min-h-[44px] text-sm leading-6 opacity-80">{action.detail}</p>
                {action.action === "open-link" && action.href ? (
                  <a
                    href={action.href}
                    target="_blank"
                    rel="noreferrer"
                    className="nb-btn-primary mt-3 inline-flex rounded-full px-3 py-1.5 text-sm"
                  >
                    {action.cta}
                  </a>
                ) : action.action === "resume-draft" ? (
                  <button
                    type="button"
                    className="nb-btn-primary mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.ariaLabel || action.cta}
                    onClick={() => onResumeDraft(action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {isBusy ? "Opening..." : action.cta}
                  </button>
                ) : action.action === "send-reminder" ? (
                  <button
                    type="button"
                    className="nb-btn-primary mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.ariaLabel || action.cta}
                    onClick={() => onSendReminder?.(action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {isBusy ? "Sending..." : action.cta}
                  </button>
                ) : action.action === "invoice-again" ? (
                  <button
                    type="button"
                    className="nb-btn-primary mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.ariaLabel || action.cta}
                    onClick={() => onInvoiceAgain?.(action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {isBusy ? "Opening..." : action.cta}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nb-btn-secondary mt-3 rounded-full px-3 py-1.5 text-sm"
                    onClick={onOpenLibrary}
                  >
                    {action.cta}
                  </button>
                )}
                {action.secondaryAction === "mark-paid" ? (
                  <button
                    type="button"
                    className="nb-btn-secondary ml-2 mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.secondaryAriaLabel || action.secondaryCta}
                    onClick={() => onMarkPaid?.(action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {isSecondaryBusy ? "Saving..." : action.secondaryCta}
                  </button>
                ) : action.secondaryAction === "start-from-memory" ? (
                  <button
                    type="button"
                    className="nb-btn-secondary ml-2 mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.secondaryAriaLabel || action.secondaryCta}
                    onClick={() => onStartFromMemory?.(action.memoryClientName, action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {action.secondaryCta}
                  </button>
                ) : action.secondaryAction === "resume-with-billie" ? (
                  <button
                    type="button"
                    className="nb-btn-secondary ml-2 mt-3 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={action.secondaryAriaLabel || action.secondaryCta}
                    onClick={() => onResumeWithBillie?.(action.invoiceId)}
                    disabled={isActionBusy}
                  >
                    {isSecondaryBusy ? "Opening..." : action.secondaryCta}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : hasInvoices ? (
        <div className="nb-subcard mt-5 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">All caught up</p>
            <p className="mt-1 text-sm text-slate-600">
              No open follow-ups or drafts need attention right now.
            </p>
          </div>
          <button type="button" className="nb-btn-primary rounded-full px-4 py-2" onClick={onStartInvoice}>
            Start next invoice
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LauncherOnboardingSection({
  status,
  onContinue,
  onContinueSetup,
  onOpenSignIn,
  onStartNextInvoice,
  onOpenLibrary,
  onOpenEditor,
  onOpenFeedback,
  onDismissCompletion
}) {
  const launchReadyVisible = Boolean(status?.complete && status?.setupComplete);
  if (!status?.visible && !status?.completionVisible && !status?.setupVisible && !launchReadyVisible) {
    return null;
  }
  if (launchReadyVisible && !status?.completionVisible && !status?.setupVisible) {
    return (
      <section
        className="nb-surface nb-surface--elevated mt-6 rounded-[30px] p-5 md:p-6"
        data-testid="launcher-v2-ready-section"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Workspace ready</p>
            <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
              Your repeat-work setup is ready.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              First invoice loop complete, account linked, branding saved, memory reviewed, and service catalog checked. The next best move is testing send, payment, and customer-facing paths on real jobs.
            </p>
          </div>
          <button type="button" className="nb-btn-primary rounded-full px-4 py-2 text-sm" onClick={onStartNextInvoice}>
            Start next invoice
          </button>
        </div>
        <LauncherLaunchRunway
          onOpenLibrary={onOpenLibrary}
          onOpenEditor={onOpenEditor}
          onOpenFeedback={onOpenFeedback}
        />
      </section>
    );
  }
  if (status?.completionVisible) {
    return (
      <section
        className="nb-surface nb-surface--elevated mt-6 rounded-[30px] p-5 md:p-6"
        data-testid="launcher-onboarding-complete"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">First invoice complete</p>
            <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
              You finished the full first-invoice loop.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Notes captured, draft reviewed, editor opened, invoice saved, and PDF exported. The next run should feel faster already.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="nb-btn-primary rounded-full px-4 py-2 text-sm" onClick={onStartNextInvoice}>
              Start next invoice
            </button>
            <button type="button" className="nb-btn-ghost rounded-full px-4 py-2 text-sm" onClick={onDismissCompletion}>
              Dismiss
            </button>
          </div>
        </div>
        <LauncherSetupChecklist status={status} onContinueSetup={onContinueSetup} />
        <LauncherLaunchRunway
          onOpenLibrary={onOpenLibrary}
          onOpenEditor={onOpenEditor}
          onOpenFeedback={onOpenFeedback}
        />
      </section>
    );
  }
  if (status?.setupVisible) {
    return (
      <section
        className="nb-surface nb-surface--elevated mt-6 rounded-[30px] p-5 md:p-6"
        data-testid="launcher-setup-section"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f8b5f]">Complete your setup</p>
            <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
              Make the next invoice even easier.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The core loop is working. These last setup pieces make repeat work quicker and steadier.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="nb-btn-primary rounded-full px-4 py-2 text-sm" onClick={onStartNextInvoice}>
              Start next invoice
            </button>
          </div>
        </div>
        <LauncherSetupChecklist status={status} onContinueSetup={onContinueSetup} />
        <LauncherLaunchRunway
          onOpenLibrary={onOpenLibrary}
          onOpenEditor={onOpenEditor}
          onOpenFeedback={onOpenFeedback}
        />
      </section>
    );
  }
  const nextStep = status.nextStep;
  return (
    <section className="nb-surface nb-surface--elevated mt-6 rounded-[30px] p-5 md:p-6" data-testid="launcher-onboarding-section">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4f8b5f]">Getting started</p>
          {status?.walkthroughActive ? (
            <p
              className="mt-2 inline-flex rounded-full border border-[#4f8b5f]/20 bg-[#f1faf3] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#14532d]"
              data-testid="launcher-guided-walkthrough-chip"
            >
              Guided walkthrough active
            </p>
          ) : null}
          <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
            Start with the rough version, then move one calm step at a time.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {status?.walkthroughActive
              ? "Follow one clear step at a time until the invoice is ready to save, send, and reopen later without confusion."
              : `${status.completedCount} of ${status.totalSteps} complete. Keep the first run simple and finish the next obvious step.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
            <span className="rounded-full border border-[#4f8b5f]/20 bg-[#f1faf3] px-2.5 py-1 text-[#14532d]">Safe walkthrough</span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">Money stays visible</span>
          </div>
        </div>
        <div className="lg:min-w-[260px]">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-[#14532d] transition-all duration-300"
              style={{ width: `${status.progressPercent}%` }}
            />
          </div>
          {nextStep ? (
            <div className="mt-3 rounded-[22px] border border-[#4f8b5f]/16 bg-[#f1faf3] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4f8b5f]">Next step</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{nextStep.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{nextStep.helper}</p>
              <button
                type="button"
                className="nb-btn-primary mt-3 rounded-full px-4 py-2 text-sm"
                onClick={() => onContinue?.(nextStep)}
              >
                {nextStep.ctaLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {status.steps.map((step, index) => {
          const stepClass = step.complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : nextStep?.id === step.id
              ? "border-[#4f8b5f]/25 bg-[#f1faf3] text-slate-900"
              : "border-slate-200 bg-white/85 text-slate-700";
          return (
            <div key={step.id} className={`rounded-[22px] border px-3 py-3 ${stepClass}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.complete
                      ? "bg-emerald-600 text-white"
                      : nextStep?.id === step.id
                        ? "bg-[#14532d] text-white"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {step.complete ? "OK" : index + 1}
                </span>
                <p className="text-xs font-semibold">{step.label}</p>
              </div>
              <p className="mt-2 text-xs leading-5 opacity-80">{step.helper}</p>
            </div>
          );
        })}
      </div>
      {status.optionalSteps.some((step) => !step.complete) ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white/82 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Optional</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              Sign in when you want to keep this progress.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Keep exploring in guest mode, or sign in when you want saved invoices, billing, and repeat-work setup to stay with your account.
            </p>
          </div>
          <button
            type="button"
            className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
            onClick={onOpenSignIn}
          >
            Open sign-in
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LauncherLaunchRunway({ onOpenLibrary, onOpenEditor, onOpenFeedback }) {
  const runwayCards = [
    {
      title: "Send flow check",
      body: "Open the library, send or record a send, then make sure reminders and mark-paid feel trustworthy.",
      ctaLabel: "Open library",
      onClick: onOpenLibrary
    },
    {
      title: "Portal and payment check",
      body: "Open the editor, save a draft, then create or refresh the customer portal and payment link so the first real send feels complete.",
      ctaLabel: "Open editor",
      onClick: onOpenEditor
    },
    {
      title: "Feedback check",
      body: "Use the feedback page after each run so bug reports include the screen, device, and workflow details needed to fix issues fast.",
      ctaLabel: "Send feedback",
      onClick: onOpenFeedback
    }
  ];

  return (
    <div
      className="mt-5 rounded-[26px] border border-[#4f8b5f]/18 bg-[linear-gradient(135deg,_#f1faf3_0%,_#ffffff_56%,_#ecfdf5_100%)] p-4"
      data-testid="launcher-v2-runway"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4f8b5f]">Launch runway</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Paths to rehearse before launch</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            These are the safest checks for making the product feel dependable on real work.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {runwayCards.map((card) => (
          <div key={card.title} className="rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{card.title}</p>
            <p className="mt-2 min-h-[60px] text-xs leading-5 text-slate-600">{card.body}</p>
            <button
              type="button"
              className="nb-btn-secondary mt-3 rounded-full px-3 py-1.5 text-xs"
              onClick={card.onClick}
            >
              {card.ctaLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LauncherSetupChecklist({ status, onContinueSetup }) {
  const setupSteps = Array.isArray(status?.setupSteps) ? status.setupSteps : [];
  if (setupSteps.length === 0) {
    return null;
  }
  const nextSetupStep = status?.setupNextStep ?? null;
  const completionLabel = status?.setupComplete
    ? "Workspace setup complete"
    : `${status?.setupCompletedCount ?? 0} of ${status?.setupTotalSteps ?? setupSteps.length} setup steps complete`;
  const helperCopy = status?.setupComplete
    ? "Your account, branding, memory, and saved services are ready."
    : "These are the moves that make repeat work easier.";
  return (
    <div className="mt-5" data-testid="launcher-setup-progress">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Workspace power-ups</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{completionLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{helperCopy}</p>
        </div>
        {nextSetupStep ? (
          <button
            type="button"
            className="nb-btn-secondary rounded-full px-4 py-2 text-sm"
            onClick={() => onContinueSetup?.(nextSetupStep)}
          >
            {nextSetupStep.ctaLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${status?.setupProgressPercent ?? 0}%` }}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {setupSteps.map((step, index) => {
          const stepClass = step.complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : nextSetupStep?.id === step.id
              ? "border-[#4f8b5f]/25 bg-[#f1faf3] text-slate-900"
              : "border-slate-200 bg-white/85 text-slate-700";
          return (
            <div key={step.id} className={`rounded-[22px] border px-3 py-3 ${stepClass}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.complete
                      ? "bg-emerald-600 text-white"
                      : nextSetupStep?.id === step.id
                        ? "bg-[#14532d] text-white"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {step.complete ? "OK" : index + 1}
                </span>
                <p className="text-xs font-semibold">{step.label}</p>
              </div>
              <p className="mt-2 text-xs leading-5 opacity-80">{step.helper}</p>
              {!step.complete ? (
                <button
                  type="button"
                  className="nb-btn-ghost mt-3 rounded-full px-3 py-1.5 text-xs"
                  onClick={() => onContinueSetup?.(step)}
                >
                  {step.ctaLabel}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LauncherDraftRecoverySection({
  drafts,
  loading,
  busyInvoiceId,
  onResumeDraft,
  onResumeWithBillie,
  onOpenLibrary
}) {
  if (loading || !Array.isArray(drafts) || drafts.length === 0) {
    return null;
  }
  return (
    <section className="nb-surface mt-5 rounded-[28px] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">Draft recovery</p>
          <p className="mt-1 text-sm text-slate-600">Pick up where you left off.</p>
        </div>
        <button
          type="button"
          className="nb-btn-secondary rounded-full px-3 py-1 text-xs"
          onClick={onOpenLibrary}
        >
          Open library
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {drafts.map((draft) => (
          <div
            key={draft.invoiceId}
            className="nb-subcard flex flex-wrap items-center justify-between gap-3 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {draft.invoiceNumber || "Draft invoice"}
              </p>
              <p className="text-xs text-slate-500">
                {draft.updatedLabel ? `Updated ${draft.updatedLabel}` : "Updated recently"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="nb-btn-ghost rounded-full px-3 py-1.5"
                aria-label={`Resume ${draft.invoiceNumber || "draft invoice"}`}
                onClick={() => onResumeDraft(draft.invoiceId)}
                disabled={busyInvoiceId === draft.invoiceId}
              >
                {busyInvoiceId === draft.invoiceId ? "Opening..." : "Resume"}
              </button>
              <button
                type="button"
                className="nb-btn-secondary rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:text-slate-300"
                aria-label={`Open ${draft.invoiceNumber || "draft invoice"} with Billie`}
                onClick={() => onResumeWithBillie?.(draft.invoiceId)}
                disabled={busyInvoiceId === draft.invoiceId}
              >
                {busyInvoiceId === draft.invoiceId ? "Opening..." : "Open with Billie"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LauncherStartSection({
  primaryOption,
  hasSavedHistory,
  hasResumeDraft,
  onResumeDraft,
  onTrySampleNotes,
  onOpenScratchpad,
  showAlternateStarts,
  onToggleAlternateStarts
}) {
  const firstInvoiceSteps = [
    ["1", "Load a realistic sample", "See the rough-note format without using real client data."],
    ["2", "Build the draft", "Billie turns the notes into line items, dates, and terms."],
    ["3", "Review, save, or send", "You approve the money decisions before saving, exporting, or sending."]
  ];
  return (
    <section
      className="nb-surface nb-surface--elevated nb-hero-glow nb-reveal-up mt-6 overflow-hidden rounded-[32px] p-0"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(217,236,228,0.96), rgba(255,255,255,0) 42%), radial-gradient(circle at top right, rgba(184,106,52,0.16), rgba(255,255,255,0) 24%), linear-gradient(145deg, #fffefb 0%, #f5f1e8 62%, #edf2ee 100%)"
      }}
    >
      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)] md:gap-6 md:p-8 lg:p-10">
        <div className="relative">
          <div className="inline-flex rounded-full border border-[#3d6f61]/14 bg-white/82 px-3 py-1 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#3d6f61]">Start here</p>
          </div>
          <p className="nb-assistant-chip nb-assistant-chip--ready mt-3 inline-flex text-xs normal-case tracking-normal">
            <span className="nb-assistant-chip__dot" aria-hidden="true" />
            Billie ready
          </p>
          <h2 className="nb-hero-title mt-4 max-w-3xl">
            Turn rough job notes into a clean invoice, statement, and follow-up.
          </h2>
          <p className="nb-hero-copy mt-4 max-w-2xl">
            Start with the messy version. Billie builds the first draft, you approve the money decisions, and NoteBill keeps the path to save, send, follow up, and repeat work clear.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Monthly or lifetime",
              "Money decisions stay visible",
              "Built for repeat work"
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/70 bg-white/78 px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-slate-700 shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 md:mt-6">
            {[
              ["1", "Drop in the notes", "Paste the real-world version first."],
              ["2", "Approve the money", "Confirm the choices that affect totals."],
              ["3", "Finish with confidence", "Save, export, or send without a cleanup pass."]
            ].map(([step, title, copy]) => (
              <div
                key={step}
                className="nb-subcard border-white/70 bg-white/78 p-4 shadow-sm backdrop-blur"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#17493c_0%,_#245a4c_100%)] text-xs font-bold text-white shadow-[0_12px_28px_rgba(23,73,60,0.18)]">
                    {step}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="nb-surface nb-surface--muted rounded-[30px] p-4 md:p-6 lg:p-7">
          <div className="rounded-[24px] bg-[linear-gradient(145deg,_#17493c_0%,_#245a4c_58%,_#12352c_100%)] px-4 py-4 text-white shadow-[0_24px_60px_rgba(23,73,60,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d9ece4]">Recommended path</p>
            <p className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>
              One calm route from notes to invoice.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-100">
              If you only learn one start option first, make it this one. It is the quickest path for most service jobs.
            </p>
          </div>
          <div className="mt-3">
            {primaryOption ? (
              <LauncherCard
                key={primaryOption.key}
                title={primaryOption.title}
                description={primaryOption.description}
                icon={primaryOption.icon}
                onClick={primaryOption.onClick}
                disabled={primaryOption.disabled}
                badge="Recommended"
              />
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {hasResumeDraft ? (
              <button
                type="button"
                className="nb-btn-secondary rounded-full px-3 py-1.5"
                onClick={onResumeDraft}
              >
                Resume last draft
              </button>
            ) : null}
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-3 py-1.5"
              onClick={onTrySampleNotes}
            >
              Start with Billie
            </button>
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-3 py-1.5"
              onClick={onOpenScratchpad}
            >
              Paste my real notes
            </button>
            <button
              type="button"
              className="nb-btn-ghost rounded-full px-3 py-1.5 text-sm"
              onClick={onToggleAlternateStarts}
              aria-expanded={showAlternateStarts}
              aria-controls="alternate-start-options"
            >
              {showAlternateStarts ? "Hide other starts" : "Need a different start?"}
            </button>
          </div>
          {!hasSavedHistory ? (
            <div
              className="mt-4 rounded-[26px] border border-[#3d6f61]/18 bg-[linear-gradient(145deg,_#f6f2e8_0%,_#ffffff_52%,_#eef4f0_100%)] px-4 py-4 shadow-sm md:px-5 md:py-5"
              data-testid="launcher-first-invoice-guide"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d6f61]">
                    Guided first invoice
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#17493c]">
                    New here? Start with Billie first. It is the clearest path for contractors and repeat service jobs when all you have is rough job notes.
                  </p>
                </div>
                <button
                  type="button"
                  className="nb-btn-primary shrink-0 rounded-full px-3 py-1.5 text-xs"
                  onClick={onTrySampleNotes}
                >
                  Start with Billie
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {firstInvoiceSteps.map(([step, title, copy]) => (
                  <div key={step} className="flex items-start gap-2 rounded-[18px] bg-white/78 px-3 py-2.5 shadow-sm">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#17493c_0%,_#245a4c_100%)] text-[11px] font-bold text-white">
                      {step}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Start here unless you already have a file to import, need the library, or want a blank invoice. Once
            the first draft feels useful, Pro keeps repeat-client details, reminders, payment links, saved job context,
            and sync ready for the next invoice.
          </p>
        </div>
      </div>
    </section>
  );
}

function LauncherAlternateStartsSection({ showAlternateStarts, quickStartOptions }) {
  if (!showAlternateStarts) {
    return null;
  }
  return (
    <section
      id="alternate-start-options"
      className="nb-accent-panel nb-reveal-up mt-5"
    >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="nb-section-chip">Other starts</div>
          <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
            Different routes when the main path is not the right fit.
          </p>
        </div>
        <p className="max-w-md text-xs leading-5 text-slate-500">
          Use these when you already have source material, want a blank invoice, or need a more hands-on workflow.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quickStartOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="nb-subcard rounded-[24px] border-white/75 bg-white/84 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#3d6f61]/40 hover:bg-white md:p-5"
            onClick={option.onClick}
            disabled={option.disabled}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-[#3d6f61]/10 bg-[#eef4f0] text-[#17493c]">
                {React.cloneElement(option.icon, { className: "h-5 w-5" })}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 sm:block">{option.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function LauncherManageSection({ showManageOptions, onToggleManageOptions, manageOptions }) {
  return (
    <section className="nb-accent-panel nb-reveal-up mt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="nb-section-chip">Manage</div>
          <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
            Brand, memory, and library tools in one quieter zone.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            These are the lower-frequency controls that make repeat work cleaner once the main invoicing path is humming.
          </p>
        </div>
        <button
          type="button"
          className="nb-btn-secondary rounded-full px-3 py-2 text-xs"
          onClick={onToggleManageOptions}
          aria-expanded={showManageOptions}
          aria-controls="launcher-manage-options"
        >
          {showManageOptions ? "Hide manage tools" : "Show manage tools"}
        </button>
      </div>
      {showManageOptions ? (
        <div id="launcher-manage-options" className="mt-4 grid gap-3 md:grid-cols-2">
          {manageOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className="nb-subcard rounded-[24px] border-white/75 bg-white/84 p-4 text-left text-sm font-semibold text-slate-700 transition hover:border-[#3d6f61]/40 hover:bg-white md:p-5"
              onClick={option.onClick}
              disabled={option.disabled}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-[#3d6f61]/10 bg-[#f5f1e8] text-[#17493c]">
                  {React.cloneElement(option.icon, { className: "h-5 w-5" })}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                  <p className="mt-1 text-xs font-normal leading-5 text-slate-600 sm:block">{option.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LauncherAuthModal({
  open,
  authBusy,
  authFlow,
  authEmail,
  authEmailError,
  authNotice,
  authPreviewUrl,
  authLinkCooldownSeconds,
  authReturnPathLabel,
  authProviders,
  authProvidersBusy,
  authProvidersError,
  onChangeEmail,
  onCancel,
  onContinueAsGuest,
  onStartGoogle,
  onSubmit
}) {
  if (!open) {
    return null;
  }
  const emailLinkProvider = Array.isArray(authProviders)
    ? authProviders.find((provider) => provider?.id === "email_link")
    : null;
  const googleProvider = Array.isArray(authProviders)
    ? authProviders.find((provider) => provider?.id === "google")
    : null;
  const preferEmailFirstOnWeb = !Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === "android");
  const emailLinkReady = emailLinkProvider ? emailLinkProvider.available : true;
  const googleReady = Boolean(googleProvider?.available);
  const resendCooldownSeconds = Number(authLinkCooldownSeconds ?? 0) || 0;
  const canResendEmailLink = emailLinkReady && !authBusy && resendCooldownSeconds <= 0;
  const emailLinkButtonLabel =
    authBusy && authFlow === "email_link"
      ? "Sending sign-in link..."
      : resendCooldownSeconds > 0
        ? `Resend in ${resendCooldownSeconds}s`
        : "Email me a sign-in link";
  return (
    <div className="nb-modal-backdrop fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="nb-surface nb-surface--elevated nb-hero-glow max-h-[min(90vh,44rem)] w-full max-w-md overflow-y-auto rounded-[30px] p-5 md:p-7">
        <div className="nb-section-chip">Account access</div>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
          Save your work
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Sign in when you want saved invoices, billing, repeat-client setup, and upgrades tied to your email.
          Your current draft can stay in guest mode until you are ready.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
          <span className="rounded-full border border-[#3d6f61]/14 bg-[#eef4f0] px-2.5 py-1 text-[#17493c]">
            No password to remember
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            Guest mode stays available
          </span>
        </div>
        <p className="mt-3 max-w-md text-xs leading-5 text-slate-500">
          Keep moving in guest mode for now, or sign in once you want this workflow to follow you across devices.
        </p>
        {preferEmailFirstOnWeb ? (
          <p className="mt-2 text-xs font-semibold leading-5 text-[#17493c]">
            On web, email-link sign-in is usually the smoothest path.
          </p>
        ) : null}
        {authReturnPathLabel ? (
          <p className="mt-3 rounded-2xl border border-[#3d6f61]/14 bg-[#eef4f0] px-3 py-2 text-xs font-semibold text-[#17493c]">
            {authReturnPathLabel}
          </p>
        ) : null}
        {authProvidersBusy ? (
          <p className="mt-5 text-xs text-slate-500">Checking available sign-in methods...</p>
        ) : null}
        {authProvidersError ? <p className="mt-5 text-xs text-rose-600">{authProvidersError}</p> : null}
        {preferEmailFirstOnWeb ? (
          <>
            <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="launcher-auth-email">
              Email link sign-in
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {emailLinkProvider?.warning || "We'll email you a secure sign-in link. No password needed."}
            </p>
            {resendCooldownSeconds > 0 ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                We just sent a link. Give it a moment before resending, then check spam if it still does not arrive.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                If it does not arrive in a couple of minutes, check spam and try again once.
              </p>
            )}
            <input
              id="launcher-auth-email"
              type="email"
              autoFocus
              value={authEmail}
              onChange={onChangeEmail}
              className="nb-input mt-1 rounded-xl px-3 py-2.5"
              placeholder="you@example.com"
              disabled={authBusy || !emailLinkReady}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !authBusy) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
            />
            {authEmailError ? <p className="mt-2 text-sm text-rose-600">{authEmailError}</p> : null}
            {authNotice ? <p className="mt-2 text-sm text-sky-700">{authNotice}</p> : null}
            {authPreviewUrl ? (
              <a
                href={authPreviewUrl}
                className="mt-2 inline-flex text-sm font-semibold text-[#17493c] underline underline-offset-2"
              >
                Open preview sign-in link
              </a>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              You can close this and keep drafting. Sign-in mainly matters when you want saved invoices, upgrades, and billing to follow you across devices.
            </p>
          </>
        ) : null}
        {googleProvider ? (
          <div className={`nb-glass-list ${preferEmailFirstOnWeb ? "mt-5" : "mt-4"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Google Sign-In</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {googleProvider.warning ||
                    "Use your Google account and come right back into the same NoteBill workspace."}
                </p>
              </div>
              <button
                type="button"
                className={`${googleReady ? "nb-btn-primary" : "nb-btn-secondary"} rounded-xl px-3 py-2 text-sm disabled:opacity-60`}
                onClick={onStartGoogle}
                disabled={authBusy || !googleReady}
              >
                {authBusy && authFlow === "google"
                  ? "Opening Google..."
                  : googleReady
                    ? "Continue with Google"
                    : "Google Sign-In unavailable"}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Best when you already use Google on Android and want the quickest return to the same workspace.
            </p>
          </div>
        ) : null}
        {!preferEmailFirstOnWeb ? (
          <>
            <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="launcher-auth-email">
              Email link sign-in
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {emailLinkProvider?.warning || "We'll email you a secure sign-in link. No password needed."}
            </p>
            {resendCooldownSeconds > 0 ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                We just sent a link. Give it a moment before resending, then check spam if it still does not arrive.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                If it does not arrive in a couple of minutes, check spam and try again once.
              </p>
            )}
            <input
              id="launcher-auth-email"
              type="email"
              autoFocus
              value={authEmail}
              onChange={onChangeEmail}
              className="nb-input mt-1 rounded-xl px-3 py-2.5"
              placeholder="you@example.com"
              disabled={authBusy || !emailLinkReady}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !authBusy) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
            />
            {authEmailError ? <p className="mt-2 text-sm text-rose-600">{authEmailError}</p> : null}
            {authNotice ? <p className="mt-2 text-sm text-sky-700">{authNotice}</p> : null}
            {authPreviewUrl ? (
              <a
                href={authPreviewUrl}
                className="mt-2 inline-flex text-sm font-semibold text-[#17493c] underline underline-offset-2"
              >
                Open preview sign-in link
              </a>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              You can close this and keep drafting. Sign-in mainly matters when you want saved invoices, upgrades, and billing to follow you across devices.
            </p>
          </>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="nb-btn-secondary rounded-xl px-3 py-1.5 disabled:opacity-60"
            onClick={onContinueAsGuest}
          >
            Continue as guest
          </button>
          <button
            type="button"
            className="nb-btn-primary rounded-xl px-3 py-1.5 disabled:opacity-60"
            onClick={onSubmit}
            disabled={!canResendEmailLink}
          >
            {emailLinkButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

window.InvoiceLauncherSections = {
  AccountStrip: LauncherAccountStrip,
  OperationsQueueSection: LauncherOperationsQueueSection,
  OnboardingSection: LauncherOnboardingSection,
  DraftRecoverySection: LauncherDraftRecoverySection,
  StartSection: LauncherStartSection,
  AlternateStartsSection: LauncherAlternateStartsSection,
  ManageSection: LauncherManageSection,
  AuthModal: LauncherAuthModal
};
