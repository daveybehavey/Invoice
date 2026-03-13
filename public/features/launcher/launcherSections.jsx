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
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/50 bg-white/80 px-4 py-3 shadow-[0_18px_40px_rgba(9,48,100,0.08)] backdrop-blur">
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
            className="rounded-full border border-[#6993d2]/25 bg-[#f4f8fd] px-3 py-1.5 text-sm font-semibold text-[#093064] disabled:opacity-60"
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
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            onClick={onSignOut}
            disabled={authBusy}
          >
            {authBusy ? "Signing out..." : "Sign out"}
          </button>
        ) : (
          <button
            type="button"
            className="rounded-full border border-[#6993d2]/35 bg-[#acd0f4] px-3 py-1.5 text-sm font-semibold text-[#093064] disabled:opacity-60"
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
                className="rounded-full border border-[#6993d2]/35 bg-[#093064] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-full border border-[#6993d2]/35 bg-[#093064] px-3 py-1.5 text-sm font-semibold text-white"
              >
                Upgrade
              </a>
            )
          ) : null}
          {showBillingPortalAction ? (
            useStripePortalAction ? (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
    <section className="mt-5 rounded-[28px] border border-[#6993d2]/15 bg-white/90 p-5 shadow-[0_18px_40px_rgba(9,48,100,0.06)] backdrop-blur md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Draft recovery</p>
          <p className="mt-1 text-sm text-slate-600">Pick up where you left off without digging through the library.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
          onClick={onOpenLibrary}
        >
          Open library
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {drafts.map((draft) => (
          <div
            key={draft.invoiceId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3"
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
              className="rounded-full border border-[#6993d2]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#093064] hover:border-[#6993d2]/50"
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
      className="mt-6 overflow-hidden rounded-[32px] border border-[#6993d2]/20 bg-white shadow-[0_25px_70px_rgba(9,48,100,0.12)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(172,204,240,0.9), rgba(255,255,255,0) 42%), linear-gradient(180deg, #ffffff 0%, #f6f9fd 100%)"
      }}
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)] md:gap-5 md:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6993d2]">Start here</p>
          <h2 className="mt-2 text-[1.75rem] text-slate-900 md:text-4xl" style={{ fontFamily: "'Fraunces', serif" }}>
            Invoices from notes, not forms.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 md:mt-3 md:text-base">
            Billie does the heavy lift. You stay in control of prices, tax, and what actually gets sent.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 md:mt-5 md:gap-3">
            {[
              ["1", "Paste", "Drop in notes, photos, or messy job details."],
              ["2", "Review", "Confirm the money decisions that matter."],
              ["3", "Send", "Export, save, or send the polished invoice."]
            ].map(([step, title, copy]) => (
              <div
                key={step}
                className="rounded-2xl border border-white/70 bg-white/75 p-3 shadow-sm backdrop-blur"
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
        <div className="rounded-[28px] border border-[#6993d2]/25 bg-white/90 p-4 shadow-[0_18px_40px_rgba(9,48,100,0.08)] backdrop-blur md:p-5">
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
                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
                onClick={onResumeDraft}
              >
                Resume last draft
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex rounded-full border border-[#6993d2]/25 bg-[#f4f8fd] px-3 py-1.5 text-sm font-semibold text-[#093064] hover:border-[#6993d2]/45"
              onClick={onToggleAlternateStarts}
              aria-expanded={showAlternateStarts}
              aria-controls="alternate-start-options"
            >
              {showAlternateStarts ? "Hide other starts" : "Need a different start?"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Best for messy notes, text dumps, or talking through a job the way you naturally would.
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
      className="mt-5 rounded-[28px] border border-[#6993d2]/15 bg-white/90 p-5 shadow-[0_18px_40px_rgba(9,48,100,0.06)] backdrop-blur md:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Other ways to start</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quickStartOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6993d2]/40 hover:bg-white"
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
        Use these only when you already have a file or need a blank draft.
      </p>
    </section>
  );
}

function LauncherManageSection({ showManageOptions, onToggleManageOptions, manageOptions }) {
  return (
    <section className="mt-5 rounded-[28px] border border-[#6993d2]/15 bg-white/90 p-5 shadow-[0_18px_40px_rgba(9,48,100,0.06)] backdrop-blur md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">Manage</p>
          <p className="mt-1 text-sm text-slate-600">Library, branding, and the parts you touch less often.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
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
              className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4 text-left text-sm font-semibold text-slate-700 transition hover:border-[#6993d2]/40 hover:bg-white"
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
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
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
