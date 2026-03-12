(() => {
  function ReviewSnapshotCard({
    messageId,
    showAssumptionsCard,
    isTyping,
    isCompactViewport,
    reviewDetailsToggleLabel,
    hasReviewSecondaryContent,
    showReviewSecondary,
    showReviewExpandedSections,
    payload,
    sections,
    quickFixes,
    pendingDecisionCount,
    foundText,
    decisionsText,
    nextStepText,
    decisionCtaLabel,
    capturedPreviewSummary,
    capturedPreviewHiddenCount,
    previewItems,
    remainingPreviewCount,
    hasMissingAmounts,
    hasLaborGaps,
    hasUnparsed,
    auditStatus,
    auditSummary,
    decisionKeywordSets,
    focusInputWithValue,
    setReviewCardCollapsed,
    scrollToSection,
    decisionsRef,
    getLineItemStatus,
    formatMoney,
    formatLaborDuration,
    recentlyChangedLineIds,
    recentlyChangedDescriptions,
    billieStatus,
    recentClientContext,
    submitUserMessage,
    onBillieLineRefine,
    onBillieNotesRefine
  }) {
    const [activeBillieTarget, setActiveBillieTarget] = React.useState(null);
    const [showTransparencyComparison, setShowTransparencyComparison] = React.useState(false);
    const normalizedDescriptions = Array.isArray(recentlyChangedDescriptions)
      ? recentlyChangedDescriptions
      : [];
    const changedLineIdSet = new Set(
      Array.isArray(recentlyChangedLineIds) ? recentlyChangedLineIds.filter(Boolean) : []
    );
    const hasBillieHighlights = changedLineIdSet.size > 0 || normalizedDescriptions.length > 0;
    const billieIsWorking = billieStatus?.kind === "working";
    const recentContextEntries = Array.isArray(recentClientContext) ? recentClientContext : [];
    const hasRecentClientContext = recentContextEntries.length > 0;
    const normalizedSourceTranscript =
      typeof payload?.sourceText === "string" ? payload.sourceText.replace(/\s+/g, " ").trim() : "";
    const sourcePreview = normalizedSourceTranscript
      ? normalizedSourceTranscript.length > 240
        ? `${normalizedSourceTranscript.slice(0, 240).trimEnd()}…`
        : normalizedSourceTranscript
      : "Your original notes are preserved in chat history.";
    const polishedDescriptions = Array.isArray(payload?.lineItems)
      ? payload.lineItems
          .map((lineItem) =>
            typeof lineItem?.description === "string" ? lineItem.description.trim() : ""
          )
          .filter(Boolean)
      : [];
    const sourceSegments = normalizedSourceTranscript
      ? normalizedSourceTranscript
          .split(/\n|;|\. +|, +/g)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    const sourcePreviewList = sourceSegments.slice(0, 3);
    const polishedPreviewList = polishedDescriptions.slice(0, 3);
    const polishedPreviewText =
      polishedPreviewList.join(", ") || "No captured draft lines yet.";
    const remainingPolishedCount = Math.max(0, polishedDescriptions.length - polishedPreviewList.length);
    const remainingSourceCount = Math.max(0, sourceSegments.length - sourcePreviewList.length);
    const cleanedLineCount = polishedDescriptions.length;
    const hasTransparencyPreview = true;
    const billieContextButtonClass =
      "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300";
    const billieContextActionClass =
      "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300";
    const billieToneActions = [
      { id: "professional", label: "Refine", tone: "Professional" },
      { id: "simpler", label: "Simpler", tone: "Simpler" },
      { id: "formal", label: "Formal", tone: "More formal" },
      { id: "stronger", label: "Stronger", tone: "Stronger" }
    ];

    React.useEffect(() => {
      if (!showReviewExpandedSections || isTyping) {
        setActiveBillieTarget(null);
      }
    }, [showReviewExpandedSections, isTyping]);

    React.useEffect(() => {
      if (!showReviewSecondary || isTyping) {
        setShowTransparencyComparison(false);
      }
    }, [showReviewSecondary, isTyping]);

    const formatRecentDate = (value) => {
      if (!value) {
        return "";
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return "";
      }
      return parsed.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    };

    return (
      <div key={messageId} className="flex justify-start">
        <div
          className={`w-full border border-slate-200 bg-white p-4 text-sm shadow-sm ${
            showAssumptionsCard
              ? "rounded-t-2xl rounded-b-none border-b-0 sm:rounded-2xl sm:border-b"
              : "rounded-2xl"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Review</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">Draft snapshot</p>
                {billieIsWorking ? (
                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Refining
                    <span className="ml-1 inline-flex w-4 justify-start" aria-hidden="true">
                      <span className="typing-dot">.</span>
                      <span className="typing-dot">.</span>
                      <span className="typing-dot">.</span>
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                onClick={() => focusInputWithValue("Update: ")}
                disabled={isTyping}
              >
                Edit with Billie
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {payload.customerName ? (
                <p>
                  <span className="font-semibold text-slate-900">Client:</span> {payload.customerName}
                </p>
              ) : null}
              {payload.servicePeriodStart || payload.servicePeriodEnd ? (
                <p className={payload.customerName ? "mt-1" : undefined}>
                  <span className="font-semibold text-slate-900">Service period:</span>{" "}
                  {payload.servicePeriodStart && payload.servicePeriodEnd
                    ? payload.servicePeriodStart === payload.servicePeriodEnd
                      ? payload.servicePeriodStart
                      : `${payload.servicePeriodStart} to ${payload.servicePeriodEnd}`
                    : payload.servicePeriodStart || payload.servicePeriodEnd}
                </p>
              ) : null}
              <p
                className={
                  payload.customerName || payload.servicePeriodStart || payload.servicePeriodEnd
                    ? "mt-1"
                    : undefined
                }
              >
                <span className="font-semibold text-slate-900">Found:</span> {foundText}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-slate-900">Decisions:</span> {decisionsText}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-slate-900">Next:</span> {nextStepText}
                {pendingDecisionCount > 0 ? (
                  <button
                    type="button"
                    className="ml-2 inline-flex items-center rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-900 shadow-sm transition hover:border-blue-400 hover:bg-blue-200"
                    onClick={() => scrollToSection(decisionsRef)}
                    disabled={isTyping}
                  >
                    {decisionCtaLabel}
                  </button>
                ) : null}
              </p>
              {capturedPreviewSummary ? (
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Captured:</span>{" "}
                  {capturedPreviewSummary}
                  {capturedPreviewHiddenCount > 0 ? ` (+${capturedPreviewHiddenCount} more)` : ""}
                </p>
              ) : null}
              {hasReviewSecondaryContent ? (
                <p className="mt-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                    onClick={() => setReviewCardCollapsed((prev) => !prev)}
                    disabled={isTyping}
                  >
                    {reviewDetailsToggleLabel}
                  </button>
                </p>
              ) : null}
              {pendingDecisionCount > 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Some amounts stay hidden until you choose Add or Skip.
                </p>
              ) : null}
            </div>
            {showReviewSecondary && previewItems.length > 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </p>
                <div className="mt-2 space-y-1.5">
                  {previewItems.map((item, index) => (
                    <div
                      key={`preview-${item.id ?? "item"}-${index}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex-1 truncate text-slate-700">{item.label}</span>
                      {item.valueText ? (
                        <span className="text-slate-600">{item.valueText}</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {item.needsRate
                            ? "needs rate"
                            : item.needsAmount
                              ? "needs amount"
                              : "needs info"}
                        </span>
                      )}
                    </div>
                  ))}
                  {remainingPreviewCount > 0 ? (
                    <p className="text-xs text-slate-400">+{remainingPreviewCount} more</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {showReviewSecondary && hasTransparencyPreview ? (
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Before and after
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Cleaned lines:</span> {cleanedLineCount}
                </p>
                <p className="mt-1 text-xs text-slate-600">{sourcePreview}</p>
                <div className="mt-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                    onClick={() => setShowTransparencyComparison((prev) => !prev)}
                    disabled={isTyping}
                  >
                    {showTransparencyComparison ? "Hide full comparison" : "Show full comparison"}
                  </button>
                </div>
                {showTransparencyComparison ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        From your notes
                      </p>
                      {sourcePreviewList.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
                          {sourcePreviewList.map((line, index) => (
                            <li key={`source-line-${index}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-slate-600">No source note lines available.</p>
                      )}
                      {remainingSourceCount > 0 ? (
                        <p className="mt-1 text-[11px] text-slate-500">+{remainingSourceCount} more</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Client-facing draft
                      </p>
                      {polishedPreviewList.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-700">
                          {polishedPreviewList.map((line, index) => (
                            <li key={`draft-line-${index}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-slate-700">No captured draft lines yet.</p>
                      )}
                      {remainingPolishedCount > 0 ? (
                        <p className="mt-1 text-[11px] text-slate-500">+{remainingPolishedCount} more</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-700">
                    {polishedPreviewText}
                    {remainingPolishedCount > 0 ? ` (+${remainingPolishedCount} more)` : ""}
                  </p>
                )}
              </div>
            ) : null}
            {billieStatus && !isCompactViewport ? (
              <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  billieStatus.kind === "safe"
                    ? "border-blue-300 bg-blue-100 text-blue-900"
                    : billieStatus.kind === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : billieStatus.kind === "working"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {billieStatus.kind === "safe" ? "✓ " : billieStatus.kind === "warning" ? "⚠ " : ""}
                <span>{billieStatus.text}</span>
                {billieStatus.kind === "working" ? (
                  <span className="ml-1 inline-flex w-4 justify-start" aria-hidden="true">
                    <span className="typing-dot">.</span>
                    <span className="typing-dot">.</span>
                    <span className="typing-dot">.</span>
                  </span>
                ) : null}
              </div>
            ) : null}
            {showReviewSecondary && quickFixes.length > 0 && pendingDecisionCount === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quick actions
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickFixes.slice(0, 3).map((fix) => (
                    <button
                      key={fix.id}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                      onClick={() => focusInputWithValue(fix.value)}
                      disabled={isTyping}
                    >
                      {fix.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {showReviewSecondary ? (
              <p className="text-xs text-slate-500">
                I flag unclear money items below. You decide what to bill.
              </p>
            ) : null}
            {showReviewSecondary && hasRecentClientContext ? (
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent for {payload.customerName}
                </p>
                <div className="mt-2 space-y-2">
                  {recentContextEntries.map((entry) => {
                    const servicePeriod =
                      entry.servicePeriodStart && entry.servicePeriodEnd
                        ? entry.servicePeriodStart === entry.servicePeriodEnd
                          ? entry.servicePeriodStart
                          : `${entry.servicePeriodStart} to ${entry.servicePeriodEnd}`
                        : entry.servicePeriodStart || entry.servicePeriodEnd || formatRecentDate(entry.updatedAt);
                    const descriptions = Array.isArray(entry.lineItemDescriptions)
                      ? entry.lineItemDescriptions.slice(0, 3)
                      : [];
                    const notePreview =
                      typeof entry.notes === "string" && entry.notes.trim()
                        ? entry.notes.trim().slice(0, 120)
                        : "";
                    return (
                      <div
                        key={entry.invoiceId}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-slate-800">
                            {entry.invoiceNumber || "Prior invoice"}
                          </p>
                          {servicePeriod ? <p>{servicePeriod}</p> : null}
                        </div>
                        {descriptions.length > 0 ? (
                          <p className="mt-1">
                            <span className="font-semibold text-slate-700">Jobs:</span>{" "}
                            {descriptions.join(", ")}
                          </p>
                        ) : null}
                        {notePreview ? (
                          <p className="mt-1">
                            <span className="font-semibold text-slate-700">Notes:</span> {notePreview}
                            {entry.notes.trim().length > notePreview.length ? "…" : ""}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {showReviewExpandedSections
              ? sections.map((section) => (
                  <div key={section.id} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {section.label}
                    </p>
                    <div className="space-y-2">
                      {section.items.map((item, index) => {
                        const status = getLineItemStatus(item, decisionKeywordSets);
                        const amount = Number.isFinite(item.amount) ? formatMoney(item.amount) : "";
                        const duration =
                          item.type === "labor" ? formatLaborDuration(item.quantity) : "";
                        const rate =
                          item.type === "labor" && Number.isFinite(item.unitPrice)
                            ? `${formatMoney(item.unitPrice)}/hr`
                            : "";
                        const laborMeta = [duration, rate].filter(Boolean).join(" × ");
                        const meta = laborMeta && amount ? `${laborMeta} • ${amount}` : laborMeta || amount;
                        const normalizedDescription = (item.description ?? "").trim().toLowerCase();
                        const isRecentlyChanged =
                          changedLineIdSet.has(item.id ?? `line-${index}`) ||
                          normalizedDescriptions.includes(normalizedDescription);
                        const targetId = item.id ?? `${section.id}-${index}`;
                        const showBillieActions =
                          activeBillieTarget?.type === "line_item" &&
                          activeBillieTarget?.id === targetId;
                        return (
                          <div
                            key={`${section.id}-${item.id ?? "item"}-${index}`}
                            className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                              isRecentlyChanged
                                ? "border-blue-300 bg-blue-100/70"
                                : "border-slate-100 bg-slate-50"
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold text-slate-800">{item.description}</p>
                              {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
                              {isRecentlyChanged ? (
                                <p className="text-[11px] font-semibold text-blue-900">Updated by Billie</p>
                              ) : null}
                              {showBillieActions ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {billieToneActions.map((action) => (
                                    <button
                                      key={`${targetId}-${action.id}`}
                                      type="button"
                                      className={billieContextActionClass}
                                      aria-label={
                                        action.id === "professional"
                                          ? `Refine ${item.description}`
                                          : action.id === "simpler"
                                            ? `Make ${item.description} simpler`
                                            : action.id === "formal"
                                              ? `Make ${item.description} more formal`
                                              : `Make ${item.description} stronger`
                                      }
                                      onClick={() => {
                                        setActiveBillieTarget(null);
                                        onBillieLineRefine?.(item.id, action.tone, item.description);
                                      }}
                                      disabled={isTyping}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.id ? (
                                <button
                                  type="button"
                                  className={billieContextButtonClass}
                                  aria-label={`Billie for ${item.description}`}
                                  onClick={() =>
                                    setActiveBillieTarget((current) =>
                                      current?.type === "line_item" && current?.id === targetId
                                        ? null
                                        : { type: "line_item", id: targetId }
                                    )
                                  }
                                  disabled={isTyping}
                                >
                                  Billie
                                </button>
                              ) : null}
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${status.badgeClass}`}
                              >
                                {status.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              : null}
            {showReviewExpandedSections && hasBillieHighlights ? (
              <p className="text-xs text-blue-900">Recent changes are highlighted for 1–2 seconds.</p>
            ) : null}
          </div>

          {showReviewExpandedSections && auditStatus === "completed" && auditSummary ? (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
              {auditSummary}
            </div>
          ) : null}

          {showReviewExpandedSections && payload.notes ? (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                <button
                  type="button"
                  className={billieContextButtonClass}
                  aria-label="Billie for notes"
                  onClick={() =>
                    setActiveBillieTarget((current) =>
                      current?.type === "notes" ? null : { type: "notes" }
                    )
                  }
                  disabled={isTyping}
                >
                  Billie
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-700">{payload.notes}</p>
              {activeBillieTarget?.type === "notes" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {billieToneActions.map((action) => (
                    <button
                      key={`notes-${action.id}`}
                      type="button"
                      className={billieContextActionClass}
                      aria-label={
                        action.id === "professional"
                          ? "Refine notes"
                          : action.id === "simpler"
                            ? "Make notes simpler"
                            : action.id === "formal"
                              ? "Make notes more formal"
                              : "Make notes stronger"
                      }
                      onClick={() => {
                        setActiveBillieTarget(null);
                        onBillieNotesRefine?.(action.tone);
                      }}
                      disabled={isTyping}
                    >
                      {action.id === "professional" ? "Refine notes" : action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showReviewExpandedSections && payload.unparsed.length > 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Not yet captured
              </p>
              <div className="mt-2 space-y-2">
                {payload.unparsed.map((item, index) => (
                  <div key={`${item}-${index}`} className="space-y-2">
                    <p className="text-sm text-slate-700">{item}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                        onClick={() => submitUserMessage(`Add to notes: ${item}`)}
                        disabled={isTyping}
                      >
                        Add to notes
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                        onClick={() => submitUserMessage(`Add line item: ${item}`)}
                        disabled={isTyping}
                      >
                        Create line item
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {showReviewExpandedSections && hasMissingAmounts ? (
            <p className="mt-3 text-xs text-amber-600">
              Some line items still need an amount before you can generate.
            </p>
          ) : null}

          {showReviewExpandedSections && hasLaborGaps ? (
            <p className="mt-1 text-xs text-amber-600">
              Some labor entries still need hours or rates.
            </p>
          ) : null}

          {showReviewExpandedSections && hasUnparsed ? (
            <p className="mt-1 text-xs text-slate-500">
              Unparsed notes are kept in details so nothing gets lost.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  window.InvoiceIntakeReview = {
    ReviewSnapshotCard
  };
})();
