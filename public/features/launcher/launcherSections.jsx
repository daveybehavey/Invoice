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
  hasPlanActions,
  showPlanActions,
  onTogglePlanActions,
  showUpgradeAction,
  upgradeUrl,
  useStripeUpgradeAction,
  showBillingPortalAction,
  billingPortalUrl,
  useStripePortalAction,
  billingBusy,
  onOpenUpgrade,
  onOpenBillingPortal,
  onOpenSignIn,
  onSignOut
}) {
  const usageToneClass =
    planUsage?.statusTone === "limit"
      ? "nb-usage-meter--limit"
      : planUsage?.statusTone === "warning"
        ? "nb-usage-meter--warning"
        : "";
  return (
    <div className="nb-accent-panel nb-reveal-up mt-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="nb-section-chip">Account</div>
        <p className="mt-3 text-base font-semibold text-slate-800">
          {authSession?.email ? `Signed in as ${authSession.email}` : "Not signed in (local mode)"}
        </p>
        {planSummary ? (
          <p className={`mt-1 text-xs ${planAtLimit ? "text-amber-700" : "text-slate-500"}`}>{planSummary}</p>
        ) : null}
        {planWarning && !planAtLimit ? (
          <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
        ) : null}
        {planPitch ? <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{planPitch}</p> : null}
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
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {hasPlanActions ? (
          <button
            type="button"
            className="nb-btn-ghost text-sm disabled:opacity-60"
            onClick={onTogglePlanActions}
            aria-expanded={showPlanActions}
            aria-controls="launcher-plan-actions"
          >
            {showPlanActions ? "Hide plan options" : "Plan options"}
          </button>
        ) : null}
        {authSession?.email ? (
          <button
            type="button"
            className="nb-btn-secondary rounded-full px-3 py-1.5 disabled:opacity-60"
            onClick={onSignOut}
            disabled={authBusy}
          >
            {authBusy ? "Signing out..." : "Sign out"}
          </button>
        ) : (
          <button
            type="button"
            className="nb-btn-ghost rounded-full bg-[#acd0f4] px-3 py-1.5 text-sm disabled:opacity-60"
            onClick={onOpenSignIn}
            disabled={authBusy}
          >
            Sign in
          </button>
        )}
      </div>
      {showPlanActions ? (
        <div
          id="launcher-plan-actions"
          className="nb-glass-list mt-1 flex w-full flex-wrap items-center gap-2 sm:justify-end"
        >
          {showUpgradeAction ? (
            useStripeUpgradeAction ? (
              <button
                type="button"
                className="nb-btn-primary rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onOpenUpgrade}
                disabled={billingBusy}
              >
                {billingBusy ? "Opening..." : "Upgrade"}
              </button>
            ) : (
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noreferrer"
                className="nb-btn-primary rounded-full px-3 py-1.5 text-sm"
              >
                Upgrade
              </a>
            )
          ) : null}
          {showBillingPortalAction ? (
            useStripePortalAction ? (
              <button
                type="button"
                className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onOpenBillingPortal}
                disabled={billingBusy}
              >
                {billingBusy ? "Opening..." : "Billing"}
              </button>
            ) : (
              <a
                href={billingPortalUrl}
                target="_blank"
                rel="noreferrer"
                className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
              >
                Billing
              </a>
            )
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
    draft: "border-blue-200 bg-blue-50 text-blue-950",
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Today&apos;s queue</p>
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
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-center">
              <p className="text-lg font-semibold text-[#093064]">{stat.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {stat.label}
              </p>
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
                  isPrimary ? "ring-2 ring-[#093064]/10 md:col-span-2" : ""
                }`}
              >
                {isPrimary ? (
                  <p className="mb-2 inline-flex rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#093064]">
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
              V2 launch runway is unlocked.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              First invoice loop complete, account linked, branding saved, memory reviewed, and service catalog checked. Now the highest-value work is testing the real send, payment, and customer-facing paths.
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
              Notes captured, draft reviewed, editor opened, invoice saved, and PDF exported. Now let&apos;s turn that first invoice into a setup advantage for the second one.
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Complete your setup</p>
            <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
              Turn that first invoice into a faster second one.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The core loop is done. These setup power-ups make repeat jobs feel calmer, faster, and more like your business.
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Getting started</p>
          {status?.walkthroughActive ? (
            <p
              className="mt-2 inline-flex rounded-full border border-[#6993d2]/20 bg-[#f6f9ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#093064]"
              data-testid="launcher-guided-walkthrough-chip"
            >
              Guided walkthrough active
            </p>
          ) : null}
          <h2 className="mt-2 text-2xl text-slate-900 md:text-3xl" style={{ fontFamily: "'Fraunces', serif" }}>
            Finish your first invoice with confidence.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {status?.walkthroughActive
              ? "You are on the guided path. Follow the next step and keep the sample job moving until you reach save and export."
              : `${status.completedCount} of ${status.totalSteps} complete. Keep moving one trust-building step at a time.`}
          </p>
        </div>
        <div className="lg:min-w-[260px]">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-[#093064] transition-all duration-300"
              style={{ width: `${status.progressPercent}%` }}
            />
          </div>
          {nextStep ? (
            <div className="mt-3 rounded-[22px] border border-[#6993d2]/16 bg-[#f7faff] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Next step</p>
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
              ? "border-[#6993d2]/25 bg-[#f6f9ff] text-slate-900"
              : "border-slate-200 bg-white/85 text-slate-700";
          return (
            <div key={step.id} className={`rounded-[22px] border px-3 py-3 ${stepClass}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.complete
                      ? "bg-emerald-600 text-white"
                      : nextStep?.id === step.id
                        ? "bg-[#093064] text-white"
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
              Sign in to keep saved work tied to your email.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Email-link sign-in is always available here, and Google Sign-In can be enabled in builds that have Google credentials configured.
            </p>
          </div>
          <button
            type="button"
            className="nb-btn-secondary rounded-full px-3 py-1.5 text-sm"
            onClick={onOpenSignIn}
          >
            Open sign-in options
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LauncherLaunchRunway({ onOpenLibrary, onOpenEditor, onOpenFeedback }) {
  const runwayCards = [
    {
      title: "Send/payment dress rehearsal",
      body: "Open the library, send or record a send, then confirm reminders and mark-paid feel trustworthy.",
      ctaLabel: "Open library",
      onClick: onOpenLibrary
    },
    {
      title: "Portal-ready invoice",
      body: "Open the editor, save a draft, then create or refresh the customer portal and payment link from the export panel.",
      ctaLabel: "Open editor",
      onClick: onOpenEditor
    },
    {
      title: "Tester feedback loop",
      body: "Use the feedback page after each run so tester reports include the device details needed to fix issues fast.",
      ctaLabel: "Open feedback",
      onClick: onOpenFeedback
    }
  ];

  return (
    <div
      className="mt-5 rounded-[26px] border border-[#6993d2]/18 bg-[linear-gradient(135deg,_#f7faff_0%,_#ffffff_56%,_#ecfdf5_100%)] p-4"
      data-testid="launcher-v2-runway"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">V2 launch runway</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Next best blocks after setup</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            These are the safest high-reward paths to rehearse before the public Play Store push.
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
    ? "Your account, branding, memory, and saved services are ready for repeat work."
    : "These are the high-leverage moves that make the next invoice feel much more automatic.";
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
              ? "border-[#6993d2]/25 bg-[#f6f9ff] text-slate-900"
              : "border-slate-200 bg-white/85 text-slate-700";
          return (
            <div key={step.id} className={`rounded-[22px] border px-3 py-3 ${stepClass}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.complete
                      ? "bg-emerald-600 text-white"
                      : nextSetupStep?.id === step.id
                        ? "bg-[#093064] text-white"
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Draft recovery</p>
          <p className="mt-1 text-sm text-slate-600">Open the last draft you were working on without hunting for it.</p>
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
            className="nb-subcard flex flex-wrap items-center justify-between gap-2 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {draft.invoiceNumber || "Draft invoice"}
              </p>
              <p className="text-xs text-slate-500">
                {draft.updatedLabel ? `Updated ${draft.updatedLabel}` : "Updated recently"}
              </p>
            </div>
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
    ["3", "Review before sending", "You confirm money decisions before saving or exporting."]
  ];
  return (
    <section
      className="nb-surface nb-surface--elevated nb-hero-glow nb-reveal-up mt-6 overflow-hidden rounded-[36px] p-0"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(185,215,246,0.95), rgba(255,255,255,0) 40%), radial-gradient(circle at top right, rgba(243,194,125,0.18), rgba(255,255,255,0) 24%), linear-gradient(145deg, #ffffff 0%, #f5f9ff 60%, #eef5ff 100%)"
      }}
    >
      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)] md:gap-6 md:p-8">
        <div className="relative">
          <div className="inline-flex rounded-full border border-[#6993d2]/14 bg-white/82 px-3 py-1 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#5f8fd2]">Start Here</p>
          </div>
          <p className="nb-assistant-chip nb-assistant-chip--ready mt-3 inline-flex text-xs normal-case tracking-normal">
            <span className="nb-assistant-chip__dot" aria-hidden="true" />
            Billie ready
          </p>
          <h2 className="nb-hero-title mt-4 max-w-3xl">
            Turn rough field notes into a client-ready invoice before the day gets away from you.
          </h2>
          <p className="nb-hero-copy mt-4 max-w-2xl">
            Start with the messy version. Billie organizes the draft, flags the money decisions that need your call, and keeps the send-ready path clear from the first tap.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Fastest path for most jobs",
              "Money never changes silently",
              "Built to save, send, and repeat"
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
              ["1", "Paste notes", "Drop in the messy version."],
              ["2", "Approve money", "Confirm decisions that change totals."],
              ["3", "Send invoice", "Save, export, or send immediately."]
            ].map(([step, title, copy]) => (
              <div
                key={step}
                className="nb-subcard border-white/70 bg-white/78 p-4 shadow-sm backdrop-blur"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#093064_0%,_#184d8e_100%)] text-xs font-bold text-white shadow-[0_12px_28px_rgba(8,47,99,0.18)]">
                    {step}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="nb-surface nb-surface--muted rounded-[30px] p-4 md:p-5">
          <div className="rounded-[24px] bg-[linear-gradient(145deg,_#093064_0%,_#0e437c_58%,_#123d6d_100%)] px-4 py-4 text-white shadow-[0_24px_60px_rgba(8,47,99,0.18)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c5dcf7]">Recommended path</p>
            <p className="mt-2 text-lg font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>
              One calm route from notes to invoice.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-100">
              If you only use one start option, use this one.
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
              Try sample notes
            </button>
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-3 py-1.5"
              onClick={onOpenScratchpad}
            >
              Open scratchpad
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
              className="mt-4 rounded-[26px] border border-[#6993d2]/18 bg-[linear-gradient(145deg,_#f6f9ff_0%,_#ffffff_52%,_#eef6ff_100%)] px-4 py-4 shadow-sm"
              data-testid="launcher-first-invoice-guide"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                    Guided first invoice
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#093064]">
                    First invoice? Try sample notes for a quick walkthrough, or open scratchpad to collect
                    real notes during the day.
                  </p>
                </div>
                <button
                  type="button"
                  className="nb-btn-primary shrink-0 rounded-full px-3 py-1.5 text-xs"
                  onClick={onTrySampleNotes}
                >
                  Start walkthrough
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {firstInvoiceSteps.map(([step, title, copy]) => (
                  <div key={step} className="flex items-start gap-2 rounded-2xl bg-white/78 px-3 py-2 shadow-sm">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#093064_0%,_#184d8e_100%)] text-[11px] font-bold text-white">
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
            Start here unless you already have a file or want a blank invoice from scratch.
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
            Different routes when the default path is not the right fit.
          </p>
        </div>
        <p className="max-w-md text-xs leading-5 text-slate-500">
          Use these when you already have source material, want a clean blank invoice, or need a more manual route.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quickStartOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="nb-subcard rounded-[24px] border-white/75 bg-white/84 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6993d2]/40 hover:bg-white"
            onClick={option.onClick}
            disabled={option.disabled}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#acd0f4] text-[#093064]">
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="nb-section-chip">Manage</div>
          <p className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
            Brand, memory, and library tools in one quieter zone.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            These are the lower-frequency controls that still matter once the main invoicing path is humming.
          </p>
        </div>
        <button
          type="button"
          className="nb-btn-secondary rounded-full px-3 py-1 text-xs"
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
              className="nb-subcard rounded-[22px] border-white/75 bg-white/84 p-4 text-left text-sm font-semibold text-slate-700 transition hover:border-[#6993d2]/40 hover:bg-white"
              onClick={option.onClick}
              disabled={option.disabled}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4f8fd] text-[#093064]">
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
  authReturnPathLabel,
  authProviders,
  authProvidersBusy,
  authProvidersError,
  onChangeEmail,
  onCancel,
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
  const emailLinkReady = emailLinkProvider ? emailLinkProvider.available : true;
  const googleReady = Boolean(googleProvider?.available);
  return (
    <div className="nb-modal-backdrop fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="nb-surface nb-surface--elevated nb-hero-glow w-full max-w-md rounded-[30px] p-5 md:p-6">
        <div className="nb-section-chip">Account access</div>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
          Sign in
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep saved work tied to your email with whichever sign-in path is ready for this build.
        </p>
        {authReturnPathLabel ? (
          <p className="mt-3 rounded-2xl border border-[#6993d2]/16 bg-[#f7faff] px-3 py-2 text-xs font-semibold text-[#093064]">
            {authReturnPathLabel}
          </p>
        ) : null}
        <div className="mt-5 space-y-2" data-testid="launcher-auth-provider-list">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sign-in methods</p>
          {authProvidersBusy ? (
            <p className="text-xs text-slate-500">Checking available sign-in methods...</p>
          ) : null}
          {authProvidersError ? <p className="text-xs text-rose-600">{authProvidersError}</p> : null}
          {Array.isArray(authProviders) && authProviders.length > 0 ? (
            <div className="space-y-2">
              {authProviders.map((provider) => {
                const toneClass = provider.available
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-slate-200 bg-slate-50 text-slate-700";
                const statusLabel = provider.available
                  ? "Available now"
                  : provider.implemented
                    ? "Needs setup"
                    : "Planned next";
                return (
                  <div key={provider.id} className={`rounded-[20px] border px-3 py-3 ${toneClass}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{provider.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {provider.warning || (provider.available ? "Ready to use." : "Not available yet.")}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {googleProvider ? (
          <div className="nb-glass-list mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Google Sign-In</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {googleProvider.warning ||
                    "Use your Google account and come right back with the same NoteBill session model."}
                </p>
              </div>
              <button
                type="button"
                className={`${googleReady ? "nb-btn-primary" : "nb-btn-secondary"} rounded-xl px-3 py-1.5 text-sm disabled:opacity-60`}
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
          </div>
        ) : null}
        <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="launcher-auth-email">
          Email link sign-in
        </label>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {emailLinkProvider?.warning || "We&apos;ll send a secure sign-in link to your inbox."}
        </p>
        <input
          id="launcher-auth-email"
          type="email"
          autoFocus
          value={authEmail}
          onChange={onChangeEmail}
          className="nb-input mt-1 rounded-xl px-3 py-2"
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
            className="mt-2 inline-flex text-sm font-semibold text-[#093064] underline underline-offset-2"
          >
            Open preview sign-in link
          </a>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="nb-btn-secondary rounded-xl px-3 py-1.5 disabled:opacity-60"
            onClick={onCancel}
            disabled={authBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nb-btn-primary rounded-xl px-3 py-1.5 disabled:opacity-60"
            onClick={onSubmit}
            disabled={authBusy || !emailLinkReady}
          >
            {authBusy && authFlow === "email_link" ? "Sending link..." : "Email sign-in link"}
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
