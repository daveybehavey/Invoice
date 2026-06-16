(() => {
  function IntakeDecisionPanel({
    showAssumptionsCard,
    hasReviewCard,
    openDecisionCount,
    canGenerateInvoice,
    showContextDetailsToggle,
    isCompactViewport,
    setAssumptionsCollapsed,
    contextDetailsToggleLabel,
    summaryTimeLabel,
    showConfirmDetails,
    showQuickDecisions,
    hasVisibleDetails,
    hasDecisions,
    decisionsRef,
    quickDecisionHeading,
    decisionProgressLabel,
    showDecisionWhy,
    setShowDecisionWhy,
    isTyping,
    decisionApplyPending,
    decisionApplyLabel,
    visibleDecisionItems,
    buildDecisionActions,
    decisionIncludeButtonClass,
    decisionExcludeButtonClass,
    handleDecisionAction,
    hasMoreDecisions,
    showAllDecisions,
    clampedDecisionIndex,
    decisionItems,
    setDecisionFocusIndex,
    setShowAllDecisions,
    taxAssumptionPresent,
    pendingTaxRate,
    setPendingTaxRate,
    appendAiMessage,
    suggestedTaxRate,
    focusInputWithValue,
    showAssumptionDetails,
    unparsedRef,
    auditStatus,
    auditSummary,
    auditSummaryTimeLabel,
    handleManualDeepAudit,
    structuredInvoice,
    unparsedItems,
    submitUserMessage,
    assumptionItems,
    auditAssumptionItems,
    primaryCtaDisabled,
    handlePrimaryCta,
    primaryCtaLabel,
    ctaHelper,
    planLimitReached,
    planSummary,
    planUsage,
    planWarning,
    showUpgradeAction,
    useStripeUpgradeAction,
    upgradeUrl,
    upgradeActionLabel,
    googlePlaySubscriptionPlans,
    billingEnvironmentMode,
    billingEnvironmentHint,
    billingBusy,
    billingError,
    handleUpgradeAction
  }) {
    if (!showAssumptionsCard) {
      return null;
    }
    const usageToneClass =
      planUsage?.statusTone === "limit"
        ? "nb-usage-meter--limit"
        : planUsage?.statusTone === "warning"
          ? "nb-usage-meter--warning"
          : "";
    const showInstalledAppGuard = billingEnvironmentMode === "android-browser";
    const hasGooglePlayPlanChoices =
      billingEnvironmentMode === "google-play" &&
      Array.isArray(googlePlaySubscriptionPlans) &&
      googlePlaySubscriptionPlans.length > 1;
    return (
      <div className={`space-y-2 ${hasReviewCard ? "mt-0 sm:mt-3" : "mt-2 sm:mt-3"}`}>
        <section
          className={`nb-assistant-panel w-full ${
            hasReviewCard
              ? "rounded-b-2xl rounded-t-none border-t-0 sm:rounded-2xl sm:border"
              : "rounded-2xl"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {openDecisionCount > 0
                  ? "Decisions"
                  : canGenerateInvoice
                    ? "Ready to generate"
                    : "Confirm"}
              </h2>
              {openDecisionCount > 0 ? (
                <span className="nb-chip nb-chip--warning px-2 py-1 normal-case tracking-normal">
                  {openDecisionCount} decision{openDecisionCount > 1 ? "s" : ""} open
                </span>
              ) : null}
            </div>
          </div>
          {summaryTimeLabel ? (
            <p className="mt-1 text-xs text-slate-500">Summary updated {summaryTimeLabel}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">Billie suggests options. You make final money calls.</p>
          {showContextDetailsToggle ? (
            <p className="mt-2">
              <button
                type="button"
                className="nb-btn-secondary inline-flex rounded-full px-2.5 py-1 text-xs"
                onClick={() => setAssumptionsCollapsed((prev) => !prev)}
              >
                {contextDetailsToggleLabel}
              </button>
            </p>
          ) : null}
          {openDecisionCount > 0 && showConfirmDetails && !showQuickDecisions ? (
            <p className="mt-2 text-xs text-amber-800">Money decision pending. Choose Add or Skip to continue.</p>
          ) : null}
          {showConfirmDetails && (showQuickDecisions || hasVisibleDetails || hasDecisions) ? (
            <>
              {showQuickDecisions ? (
                <div
                  className="nb-banner nb-banner--warning mt-3 rounded-[22px] p-3"
                  ref={decisionsRef}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        {quickDecisionHeading}
                      </p>
                      {openDecisionCount > 0 ? (
                        <span className="nb-chip nb-chip--warning px-2 py-0.5 normal-case tracking-normal">
                          {`Decision ${decisionProgressLabel}`}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                      onClick={() => setShowDecisionWhy((prev) => !prev)}
                      disabled={isTyping || decisionApplyPending}
                    >
                      {showDecisionWhy ? (
                        <>
                          <span className="sm:hidden">Hide</span>
                          <span className="hidden sm:inline">Hide why</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">Why?</span>
                          <span className="hidden sm:inline">Why am I seeing this?</span>
                        </>
                      )}
                    </button>
                  </div>
                  {decisionApplyPending ? (
                    <div className="nb-banner nb-banner--info mt-2 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-blue-900">
                        {decisionApplyLabel || "Billie: Applying decision..."}
                      </p>
                    </div>
                  ) : null}
                  {showDecisionWhy ? (
                    <p className="mt-2 text-sm text-amber-900">
                      These items were unclear in your notes. Billie does not auto-decide money.
                      Choose Add or Skip to continue.
                    </p>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    {visibleDecisionItems.map((item) => {
                      const {
                        display,
                        includeLabel,
                        excludeLabel,
                        includeValue,
                        excludeValue,
                        includeAction,
                        excludeAction
                      } = buildDecisionActions(item);
                      return (
                        <div key={`quick-${item.id}`} className="space-y-2">
                          <p className="text-sm text-amber-900">{display}</p>
                          {item.context ? (
                            <p className="text-xs text-amber-800">{item.context}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={decisionIncludeButtonClass}
                              onClick={() => handleDecisionAction(includeAction, includeValue)}
                              disabled={isTyping}
                            >
                              {includeLabel}
                            </button>
                            <button
                              type="button"
                              className={decisionExcludeButtonClass}
                              onClick={() => handleDecisionAction(excludeAction, excludeValue)}
                              disabled={isTyping}
                            >
                              {excludeLabel}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {hasMoreDecisions && !showAllDecisions ? (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-semibold text-amber-800">
                        <span>{`Decision ${clampedDecisionIndex + 1} of ${decisionItems.length}`}</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-amber-800 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300 sm:hidden"
                          onClick={() =>
                            setDecisionFocusIndex((prev) =>
                              Math.min(decisionItems.length - 1, prev + 1)
                            )
                          }
                          disabled={isTyping || clampedDecisionIndex >= decisionItems.length - 1}
                        >
                          Next
                        </button>
                        <div className="hidden flex-wrap gap-2 sm:flex">
                          <button
                            type="button"
                            className="text-xs font-semibold text-amber-800 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                            onClick={() => setDecisionFocusIndex((prev) => Math.max(0, prev - 1))}
                            disabled={isTyping || clampedDecisionIndex === 0}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-amber-800 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                            onClick={() =>
                              setDecisionFocusIndex((prev) =>
                                Math.min(decisionItems.length - 1, prev + 1)
                              )
                            }
                            disabled={isTyping || clampedDecisionIndex >= decisionItems.length - 1}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {hasMoreDecisions ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                          onClick={() => setShowAllDecisions((prev) => !prev)}
                          disabled={isTyping}
                        >
                          {showAllDecisions
                            ? "Show one decision"
                            : `See all decisions (${decisionItems.length})`}
                        </button>
                      </div>
                    ) : null}
                    {showAllDecisions && decisionItems.length > 1 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-900">
                          Optional: apply one choice to all remaining decisions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={decisionIncludeButtonClass}
                            onClick={() => {
                              const includeAll = decisionItems
                                .map((item) => buildDecisionActions(item).includeValue)
                                .join("\n");
                              handleDecisionAction({ type: "bulk_include" }, includeAll);
                            }}
                            disabled={isTyping}
                          >
                            Add all
                          </button>
                          <button
                            type="button"
                            className={decisionExcludeButtonClass}
                            onClick={() => {
                              const excludeAll = decisionItems
                                .map((item) => buildDecisionActions(item).excludeValue)
                                .join("\n");
                              handleDecisionAction({ type: "bulk_exclude" }, excludeAll);
                            }}
                            disabled={isTyping}
                          >
                            Skip all
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {!hasDecisions && (taxAssumptionPresent || pendingTaxRate) ? (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-900">
                          {pendingTaxRate
                            ? `Tax set to ${pendingTaxRate}% (draft).`
                            : "Tax default: 0%."}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {pendingTaxRate ? (
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() => {
                                setPendingTaxRate(null);
                                appendAiMessage("Okay — keeping tax at 0%.");
                              }}
                              disabled={isTyping}
                            >
                              Clear tax
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() => appendAiMessage("Okay — keeping tax at 0%.")}
                              disabled={isTyping}
                            >
                              Keep 0%
                            </button>
                          )}
                          {typeof suggestedTaxRate === "number" ? (
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() => {
                                setPendingTaxRate(String(suggestedTaxRate));
                                appendAiMessage(
                                  `Got it — I’ll set tax to ${suggestedTaxRate}% in the draft.`
                                );
                              }}
                              disabled={isTyping}
                            >
                              Use {suggestedTaxRate}%
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                            onClick={() => {
                              setPendingTaxRate(null);
                              focusInputWithValue("Tax rate is ");
                            }}
                            disabled={isTyping}
                          >
                            Set tax rate
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {showAssumptionDetails && hasDecisions && !showQuickDecisions ? (
                <div
                  className="nb-banner nb-banner--warning mt-3 rounded-[22px] p-3"
                  ref={decisionsRef}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Decisions needed
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-amber-900">
                    {decisionItems.map((item) => {
                      const {
                        display,
                        includeLabel,
                        excludeLabel,
                        includeValue,
                        excludeValue,
                        includeAction,
                        excludeAction
                      } = buildDecisionActions(item);
                      return (
                        <li key={item.id}>
                          <div className="space-y-2">
                            <p>{`Decision needed: ${display}`}</p>
                            {item.context ? <p className="text-xs text-amber-800">{item.context}</p> : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={decisionIncludeButtonClass}
                                onClick={() => handleDecisionAction(includeAction, includeValue)}
                                disabled={isTyping}
                              >
                                {includeLabel}
                              </button>
                              <button
                                type="button"
                                className={decisionExcludeButtonClass}
                                onClick={() => handleDecisionAction(excludeAction, excludeValue)}
                                disabled={isTyping}
                              >
                                {excludeLabel}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {showAssumptionDetails && hasVisibleDetails ? (
                <div
                  className="nb-subcard mt-3 p-3"
                  ref={unparsedRef}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Details
                  </p>
                  {auditStatus === "running" ? (
                    <p className="mt-2 text-xs text-slate-500">Deep check running…</p>
                  ) : null}
                  {auditStatus === "timed_out" ? (
                    <p className="mt-2 text-xs text-amber-600">
                      Deep check timed out — continuing with current snapshot.
                    </p>
                  ) : null}
                  {auditStatus === "failed" ? (
                    <p className="mt-2 text-xs text-amber-600">
                      Deep check failed — continuing with current snapshot.
                    </p>
                  ) : null}
                  {auditStatus === "completed" && auditSummary ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {auditSummary}
                      {auditSummaryTimeLabel ? ` (${auditSummaryTimeLabel})` : ""}
                    </p>
                  ) : null}
                  {auditStatus === "timed_out" || auditStatus === "failed" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-300"
                        onClick={handleManualDeepAudit}
                        disabled={auditStatus === "running" || !structuredInvoice}
                      >
                        Run deep check
                      </button>
                      <span className="text-xs text-slate-400">
                        Re-check for missed decisions or notes.
                      </span>
                    </div>
                  ) : null}
                  {unparsedItems.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Needs review</p>
                      <ul className="mt-1 list-disc space-y-2 pl-5 text-sm text-slate-700">
                        {unparsedItems.map((item) => (
                          <li key={item.id}>
                            <div className="space-y-2">
                              <p>{item.text}</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                type="button"
                                  className="nb-btn-secondary rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-300"
                                  onClick={() => submitUserMessage(`Add to notes: ${item.text}`)}
                                  disabled={isTyping}
                                >
                                  Add to notes
                                </button>
                                <button
                                type="button"
                                  className="nb-btn-secondary rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-300"
                                  onClick={() => submitUserMessage(`Add line item: ${item.text}`)}
                                  disabled={isTyping}
                                >
                                  Create line item
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {assumptionItems.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-600">Captured context</p>
                      <ul className="mt-1 list-disc space-y-2 pl-5 text-sm text-slate-600">
                        {assumptionItems.map((item) => (
                          <li key={item.id}>{item.text}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {auditAssumptionItems.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-600">Billie assumptions</p>
                      <ul className="mt-1 list-disc space-y-2 pl-5 text-sm text-slate-600">
                        {auditAssumptionItems.map((item) => (
                          <li key={item.id}>{item.text}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="mt-3 space-y-2">
            <button
              type="button"
              className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 active:scale-[0.98] ${
                primaryCtaDisabled
                  ? "cursor-not-allowed bg-slate-200 text-slate-500"
                  : "nb-btn-primary text-white"
              }`}
              disabled={primaryCtaDisabled}
              onClick={handlePrimaryCta}
            >
              {primaryCtaLabel}
            </button>
            {!(openDecisionCount > 0 && showQuickDecisions) && ctaHelper ? (
              <p className="text-xs text-slate-500">{ctaHelper}</p>
            ) : null}
            {planLimitReached ? (
              <div className="nb-banner nb-banner--warning rounded-xl p-3" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-amber-900">Free plan limit reached</p>
                {planSummary ? (
                  <p className="mt-1 text-xs font-semibold text-amber-800">{planSummary}</p>
                ) : null}
                {planUsage?.finite ? (
                  <div className={`nb-usage-meter mt-2 ${usageToneClass}`}>
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
                <p className="mt-1 text-xs text-amber-800">
                  You can keep generating drafts. Upgrade when you are ready to save this as a real reusable invoice and unlock the full follow-up workflow.
                </p>
                {showInstalledAppGuard ? (
                  <div className="nb-platform-guard mt-3" role="status" aria-live="polite">
                    <p className="nb-platform-guard__eyebrow">Installed app required</p>
                    <p className="nb-platform-guard__title">Open the installed NoteBill app for Google Play upgrades.</p>
                    <p className="nb-platform-guard__copy">
                      This Android browser view can still draft and review. Billing belongs in the real app so Google Play can finish the upgrade.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] leading-5 text-amber-800">{billingEnvironmentHint}</p>
                )}
                {showUpgradeAction ? (
                  <div className="mt-2">
                    {hasGooglePlayPlanChoices ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {googlePlaySubscriptionPlans.map((option) => (
                          <button
                            key={option.basePlanId}
                            type="button"
                            className={`rounded-[18px] border px-3 py-3 text-left transition ${
                              option.isDefault
                                ? "border-amber-300 bg-amber-50 shadow-[0_14px_30px_rgba(217,119,6,0.12)]"
                                : "border-amber-200 bg-white/90 hover:border-amber-300 hover:bg-white"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                            onClick={() => handleUpgradeAction(option.basePlanId)}
                            disabled={billingBusy}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-amber-950">{option.label}</span>
                              {option.badge || option.isDefault ? (
                                <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900">
                                  {option.badge || "Default"}
                                </span>
                              ) : null}
                            </div>
                            {option.cadenceLabel ? (
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                                {option.cadenceLabel}
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs leading-5 text-amber-900/80">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    ) : useStripeUpgradeAction ? (
                      <button
                        type="button"
                        className="nb-btn-secondary rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-amber-300"
                        onClick={handleUpgradeAction}
                        disabled={billingBusy}
                      >
                        {billingBusy ? "Opening..." : upgradeActionLabel}
                      </button>
                    ) : (
                      <a
                        href={upgradeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="nb-btn-secondary inline-flex rounded-full px-3 py-1 text-xs"
                      >
                        {upgradeActionLabel}
                      </a>
                    )}
                  </div>
                ) : null}
                {billingError ? (
                  <p className="mt-2 text-xs text-rose-700" role="alert">
                    {billingError}{" "}
                    <a href="/support" className="font-semibold underline underline-offset-2">
                      Get support
                    </a>
                  </p>
                ) : null}
              </div>
            ) : planWarning ? (
              <div className="nb-banner nb-banner--warning rounded-xl p-3">
                {planSummary ? (
                  <p className="text-xs text-amber-800">{planSummary}</p>
                ) : null}
                {planUsage?.finite ? (
                  <div className={`nb-usage-meter mt-2 ${usageToneClass}`}>
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
                <p className="mt-1 text-xs font-semibold text-amber-900">{planWarning}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  window.InvoiceIntakeDecision = {
    IntakeDecisionPanel
  };
})();
