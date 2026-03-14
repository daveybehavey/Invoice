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
    <div className="nb-surface nb-surface--muted mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700">
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
        <div id="launcher-plan-actions" className="mt-1 flex w-full flex-wrap items-center justify-end gap-2">
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

function LauncherDraftRecoverySection({ drafts, loading, busyInvoiceId, onResumeDraft, onOpenLibrary }) {
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
    <section
      className="nb-surface nb-surface--elevated mt-6 overflow-hidden rounded-[32px] p-0"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(172,204,240,0.9), rgba(255,255,255,0) 42%), linear-gradient(180deg, #ffffff 0%, #f6f9fd 100%)"
      }}
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)] md:gap-5 md:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Start here</p>
          <h2 className="mt-2 text-[1.75rem] text-slate-900 md:text-4xl" style={{ fontFamily: "'Fraunces', serif" }}>
            Paste the rough version. Billie builds the draft.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 md:mt-3 md:text-base">
            This is the normal path. Best for job notes, screenshots, texts, or anything that still
            needs to be cleaned up.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 md:mt-5 md:gap-3">
            {[
              ["1", "Paste notes", "Drop in the messy version."],
              ["2", "Approve money", "Confirm only the decisions that affect totals."],
              ["3", "Send invoice", "Save, export, or send the finished version."]
            ].map(([step, title, copy]) => (
              <div
                key={step}
                className="nb-subcard border-white/70 bg-white/75 p-3 shadow-sm backdrop-blur"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#093064] text-xs font-bold text-white">
                    {step}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                </div>
                <p className="mt-2 hidden text-xs leading-5 text-slate-600 sm:block">{copy}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="nb-surface nb-surface--muted rounded-[28px] p-4 md:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6993d2]">Recommended path</p>
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
              className="nb-btn-ghost rounded-full px-3 py-1.5 text-sm"
              onClick={onToggleAlternateStarts}
              aria-expanded={showAlternateStarts}
              aria-controls="alternate-start-options"
            >
              {showAlternateStarts ? "Hide other starts" : "Need a different start?"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Start here unless you already have a file or want full manual control.
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
      className="nb-surface mt-5 rounded-[28px] p-5 md:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Other starting points</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quickStartOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="nb-subcard rounded-[24px] bg-slate-50/90 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6993d2]/40 hover:bg-white"
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
      <p className="mt-3 text-xs text-slate-500">
        Use these when you already have a file or want full manual control.
      </p>
    </section>
  );
}

function LauncherManageSection({ showManageOptions, onToggleManageOptions, manageOptions }) {
  return (
    <section className="nb-surface mt-5 rounded-[28px] p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Manage</p>
          <p className="mt-1 text-sm text-slate-600">Library, branding, and the tools you use less often.</p>
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
            className="nb-subcard rounded-[22px] bg-slate-50/90 p-4 text-left text-sm font-semibold text-slate-700 transition hover:border-[#6993d2]/40 hover:bg-white"
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
      <div className="nb-surface nb-surface--elevated w-full max-w-sm rounded-[28px] p-5">
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
          Sign in
        </h2>
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
          className="nb-input mt-1 rounded-xl px-3 py-2"
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
