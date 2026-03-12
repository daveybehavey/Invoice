const launcherSectionUiPrimitives = window.InvoiceUIPrimitives;
if (!launcherSectionUiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before launcher sections.");
}

const { LauncherCard } = launcherSectionUiPrimitives;

function LauncherAccountStrip({
  authSession,
  authBusy,
  planSummary,
  planAtLimit,
  planWarning,
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
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-600">
          {authSession?.email ? `Signed in as ${authSession.email}` : "Not signed in (local mode)"}
        </p>
        {planSummary ? (
          <p className={`text-xs ${planAtLimit ? "text-amber-700" : "text-slate-500"}`}>{planSummary}</p>
        ) : null}
        {planWarning && !planAtLimit ? (
          <p className="mt-1 text-xs font-semibold text-amber-700">{planWarning}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasPlanActions ? (
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
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
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            onClick={onSignOut}
            disabled={authBusy}
          >
            {authBusy ? "Signing out..." : "Sign out"}
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-900 disabled:opacity-60"
            onClick={onOpenSignIn}
            disabled={authBusy}
          >
            Sign in
          </button>
        )}
      </div>
      {showPlanActions ? (
        <div id="launcher-plan-actions" className="mt-1 flex w-full flex-wrap items-center justify-end gap-2">
          {showUpgradeAction ? (
            useStripeUpgradeAction ? (
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800"
              >
                Upgrade
              </a>
            )
          ) : null}
          {showBillingPortalAction ? (
            useStripePortalAction ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
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

function LauncherDraftRecoverySection({ drafts, loading, busyInvoiceId, onResumeDraft, onOpenLibrary }) {
  if (loading || !Array.isArray(drafts) || drafts.length === 0) {
    return null;
  }
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft recovery</p>
          <p className="mt-1 text-sm text-slate-600">Resume unfinished invoices in one tap.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
          onClick={onOpenLibrary}
        >
          Open library
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {drafts.map((draft) => (
          <div
            key={draft.invoiceId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
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
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
              aria-label={`Resume ${draft.invoiceNumber || "draft invoice"}`}
              onClick={() => onResumeDraft(draft.invoiceId)}
              disabled={busyInvoiceId === draft.invoiceId}
            >
              {busyInvoiceId === draft.invoiceId ? "Opening..." : "Resume"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LauncherStartSection({
  primaryOption,
  hasResumeDraft,
  onResumeDraft,
  showAlternateStarts,
  onToggleAlternateStarts
}) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start here</p>
      <p className="mt-1 text-sm text-slate-600">Paste notes. Confirm decisions. Generate invoice.</p>
      <div className="mt-4">
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
      {hasResumeDraft ? (
        <button
          type="button"
          className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
          onClick={onResumeDraft}
        >
          Resume last draft
        </button>
      ) : null}
      <div className="mt-3">
        <button
          type="button"
          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
          onClick={onToggleAlternateStarts}
          aria-expanded={showAlternateStarts}
          aria-controls="alternate-start-options"
        >
          {showAlternateStarts ? "Hide other starts" : "Other starts"}
        </button>
      </div>
    </section>
  );
}

function LauncherAlternateStartsSection({ showAlternateStarts, quickStartOptions }) {
  if (!showAlternateStarts) {
    return null;
  }
  return (
    <section id="alternate-start-options" className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other ways to start</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {quickStartOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            onClick={option.onClick}
            disabled={option.disabled}
          >
            {option.title}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Use these only when you already have a file or need a blank draft.
      </p>
    </section>
  );
}

function LauncherManageSection({ showManageOptions, onToggleManageOptions, manageOptions }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manage</p>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
          onClick={onToggleManageOptions}
          aria-expanded={showManageOptions}
          aria-controls="launcher-manage-options"
        >
          {showManageOptions ? "Hide manage tools" : "Show manage tools"}
        </button>
      </div>
      {showManageOptions ? (
        <div id="launcher-manage-options" className="mt-3 flex flex-wrap gap-2">
          {manageOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              onClick={option.onClick}
              disabled={option.disabled}
            >
              {option.title}
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
  authEmail,
  authEmailError,
  onChangeEmail,
  onCancel,
  onSubmit
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter your email to keep invoices scoped to your account.
        </p>
        <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="launcher-auth-email">
          Email
        </label>
        <input
          id="launcher-auth-email"
          type="email"
          autoFocus
          value={authEmail}
          onChange={onChangeEmail}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-200 focus:border-blue-700 focus:ring-2"
          placeholder="you@example.com"
          disabled={authBusy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !authBusy) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        {authEmailError ? <p className="mt-2 text-sm text-rose-600">{authEmailError}</p> : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            onClick={onCancel}
            disabled={authBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-900 disabled:opacity-60"
            onClick={onSubmit}
            disabled={authBusy}
          >
            {authBusy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

window.InvoiceLauncherSections = {
  AccountStrip: LauncherAccountStrip,
  DraftRecoverySection: LauncherDraftRecoverySection,
  StartSection: LauncherStartSection,
  AlternateStartsSection: LauncherAlternateStartsSection,
  ManageSection: LauncherManageSection,
  AuthModal: LauncherAuthModal
};
