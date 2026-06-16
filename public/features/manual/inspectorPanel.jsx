(() => {
  const { useEffect, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const accountPlanUtils = window.InvoiceAccountPlanUtils;
  if (!accountPlanUtils) {
    throw new Error(
      "Missing /utils/accountPlan.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }
  const paymentMethodsUtils = window.InvoicePaymentMethods;
  if (!paymentMethodsUtils) {
    throw new Error(
      "Missing /utils/paymentMethods.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }
  const paymentProgressUtils = window.InvoicePaymentProgressUtils;
  if (!paymentProgressUtils) {
    throw new Error(
      "Missing /utils/paymentProgress.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }
  const estimateWorkflowUtils = window.InvoiceEstimateWorkflowUtils;
  if (!estimateWorkflowUtils) {
    throw new Error(
      "Missing /utils/estimateWorkflow.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }

  const { polishLineItemDescription } = formatUtils;
  const {
    formatPlanSummary,
    getPlanUpgradeUrl,
    getPlanBillingPortalUrl,
    getPlanPrelimitWarning,
    getPlanUsageModel
  } = accountPlanUtils;
  const { getPaymentMethodDisplayData } = paymentMethodsUtils;
  const { buildPaymentProgressSummary } = paymentProgressUtils;
  const { buildEstimateWorkflowSummary } = estimateWorkflowUtils;
  const { hasStripeCheckout, hasStripePortal, getGooglePlaySubscriptionPlans, startUpgradeCheckout, openBillingPortal, getBillingEnvironment } =
    billingActions;
  const { DEFAULT_ACCENT_COLOR, buildAccentPalette } = brandThemeUtils;
  const {
    STYLE_PRESETS,
    STYLE_OPTIONS,
    TEMPLATE_PREVIEWS,
    SPACING_DENSITY_PRESETS,
    SPACING_DENSITY_OPTIONS
  } = styleCatalogUtils;

  const BILLIE_STYLE_ACCENTS = [
    { label: "Navy", value: "#093064", matches: [/\bnavy\b/, /dark blue/, /deep blue/] },
    { label: "Forest", value: "#14532d", matches: [/\bforest\b/, /\bgreen\b/, /\bemerald\b/] },
    { label: "Sage", value: "#5a9c69", matches: [/\bsage\b/, /muted green/, /soft green/] },
    { label: "Mint", value: "#d7f1dd", matches: [/\bmint\b/, /light green/, /pale green/] },
    { label: "Teal", value: "#0f766e", matches: [/\bteal\b/, /blue green/, /ocean/] },
    { label: "Rose", value: "#be123c", matches: [/\brose\b/, /burgundy/, /\bred\b/] },
    { label: "Charcoal", value: "#111827", matches: [/\bcharcoal\b/, /\bblack\b/, /slate/] }
  ];
  const HEADER_LAYOUT_OPTIONS = [
    { id: "split", label: "Split" },
    { id: "centered", label: "Centered" }
  ];
  const LAYOUT_STUDIO_RECIPES = [
    {
      id: "classic-send-ready",
      label: "Classic send-ready",
      description: "Balanced spacing and a steady header for most invoices.",
      stylePreset: "default",
      headerLayout: "split",
      spacingDensity: "balanced",
      accentColor: "#14532d"
    },
    {
      id: "field-estimate",
      label: "Field estimate",
      description: "Tighter spacing and a centered header when you want a faster mobile-ready draft.",
      stylePreset: "compact",
      headerLayout: "centered",
      spacingDensity: "tight",
      accentColor: "#111827"
    },
    {
      id: "premium-handoff",
      label: "Premium handoff",
      description: "Airier spacing and a stronger visual presence for polished customer-facing sends.",
      stylePreset: "spacious",
      headerLayout: "centered",
      spacingDensity: "airy",
      accentColor: "#5a9c69"
    }
  ];

  const manualAssistantHelpers = window.InvoiceManualAssistantHelpers;
  if (!manualAssistantHelpers) {
    throw new Error(
      "Missing /features/manual/assistantCommandHelpers.js load. Ensure it is loaded before /features/manual/inspectorPanel.jsx."
    );
  }
  const {
    resolveBillieStyleCommand,
    resolveBillieWordingCommand,
    resolveBillieTaxCommand,
    resolveBillieDiscountCommand,
    resolveBilliePaymentLinkCommand,
    resolveBillieLineValueCommand,
    resolveBillieLineWordingCommand,
    buildAssistantChangePreview
  } = manualAssistantHelpers;
  const billieTelemetryUtils = window.InvoiceBillieTelemetry;
  const getInitialAssistantTimingSummary = () => {
    if (!billieTelemetryUtils) {
      return "";
    }
    return billieTelemetryUtils.formatRefineSummaryLabel(
      billieTelemetryUtils.getRefineSummary("manual")
    );
  };
  const buildBillieChangeSummary = (entries) => {
    const previewEntries = Array.isArray(entries) ? entries : [];
    let lineChangeCount = 0;
    let notesUpdated = false;
    previewEntries.forEach((entry) => {
      const label = typeof entry?.label === "string" ? entry.label.trim().toLowerCase() : "";
      if (!label) {
        return;
      }
      if (label.includes("note")) {
        notesUpdated = true;
        return;
      }
      lineChangeCount += 1;
    });
    const parts = [];
    if (lineChangeCount === 1) {
      parts.push("1 line updated");
    } else if (lineChangeCount > 1) {
      parts.push(`${lineChangeCount} lines updated`);
    }
    if (notesUpdated) {
      parts.push("notes updated");
    }
    return parts.length > 0 ? `Latest: ${parts.join(" + ")}` : "";
  };

function InspectorPanel({
  activeTab,
  onTabChange,
  onClose,
  showCloseButton,
  hideInternalTabs,
  logoUrl,
  logoVisible,
  notesVisible,
  headerLayout,
  spacingDensity,
  taxRate,
  discountAmount,
  paymentLinkUrl,
  paymentRecords = [],
  onLogoChange,
  onLogoRemove,
  onLogoVisibilityChange,
  onNotesVisibilityChange,
  registrationBlockVisible,
  onRegistrationBlockVisibilityChange,
  onHeaderLayoutChange,
  onSpacingDensityChange,
  onTaxRateChange,
  onDiscountAmountChange,
  onPaymentLinkChange,
  onGeneratePaymentLink,
  onRecordPayment,
  onRemovePayment,
  onUpdateLineItemValues,
  stylePreset,
  onStylePresetChange,
  accentColor,
  onAccentColorChange,
  savedLayoutStudioFavorite,
  onSaveLayoutStudioFavorite,
  onApplyLayoutStudioFavorite,
  onClearLayoutStudioFavorite,
  onPrint,
  onDownloadPdf,
  onSaveInvoice,
  documentType = "invoice",
  saveStatus,
  saveError,
  saveNeedsAuth,
  saveAuthHint,
  paymentLinkBusy,
  paymentLinkError,
  paymentRecordBusy,
  paymentRecordError,
  accountPlan,
  onSaveAuthRetry,
  onGoToLauncherSignIn,
  savedInvoiceId,
  savedInvoiceStatus,
  statusUpdateLoading,
  statusUpdateError,
  onUpdateSavedInvoiceStatus,
  savedEstimateReviewState,
  estimateReviewUpdateLoading,
  estimateReviewUpdateError,
  onUpdateSavedEstimateReviewState,
  previewData,
  toneSource,
  onPolishDescriptions,
  buildRewriteInvoicePayload,
  onApplyRewrite,
  buildEditableInvoicePayload,
  onApplyAiEdit,
  assistantCommandRequest,
  onAssistantCommandHandled,
  onAssistantRuntimeChange,
  acceptAssistantCommands = true
}) {
  const [toneAction, setToneAction] = useState(null);
  const [selectedTone, setSelectedTone] = useState(null);
  const [toneStatus, setToneStatus] = useState("");
  const [toneLoading, setToneLoading] = useState(false);
  const [toneError, setToneError] = useState("");
  const [pendingRewrite, setPendingRewrite] = useState(null);
  const toneRequestIdRef = useRef(0);
  const [assistantInstruction, setAssistantInstruction] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantTimingSummary, setAssistantTimingSummary] = useState(() =>
    getInitialAssistantTimingSummary()
  );
  const [assistantChangePreview, setAssistantChangePreview] = useState([]);
  const [assistantUndoState, setAssistantUndoState] = useState(null);
  const [pendingAssistantEdit, setPendingAssistantEdit] = useState(null);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const [showPrintActions, setShowPrintActions] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentDateInput, setPaymentDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNoteInput, setPaymentNoteInput] = useState("");
  const previewCloseButtonRef = useRef(null);
  const previewFocusReturnRef = useRef(null);
  const assistantRequestIdRef = useRef(0);
  const handledAssistantCommandRef = useRef("");
  const assistantQuickActions = [
    {
      id: "premium-look",
      label: "Premium look",
      instruction: "Make this invoice feel premium with a centered header, airy spacing, and a navy accent."
    },
    {
      id: "clean-minimal-look",
      label: "Clean minimal look",
      instruction: "Use a clean minimal layout with tighter spacing and a charcoal accent."
    },
    {
      id: "formal-descriptions",
      label: "Formal descriptions",
      instruction: "Make the descriptions more formal."
    },
    {
      id: "stronger-descriptions",
      label: "Stronger wording",
      instruction: "Make the descriptions stronger and more decisive."
    },
    {
      id: "simpler-descriptions",
      label: "Simpler wording",
      instruction: "Make the descriptions simpler and clearer."
    },
    {
      id: "refine-notes",
      label: "Refine notes",
      instruction: "Make the notes more professional."
    },
    {
      id: notesVisible ? "hide-notes" : "show-notes",
      label: notesVisible ? "Hide notes" : "Show notes",
      instruction: notesVisible ? "Hide the notes on the invoice." : "Show the notes on the invoice."
    }
  ];
  const assistantLineQuickActions = (Array.isArray(previewData?.lineItems) ? previewData.lineItems : [])
    .map((item, index) => ({
      id: item?.id ?? `line-${index + 1}`,
      lineNumber: index + 1,
      description: typeof item?.description === "string" ? item.description.trim() : ""
    }))
    .filter((item) => item.description.length > 0)
    .slice(0, 3)
    .map((item) => ({
      id: `line-refine-${item.id}`,
      label: `Refine line ${item.lineNumber}`,
      instruction: `Refine line ${item.lineNumber} wording.`,
      helperText: item.description
    }));
  const assistantChangeSummary = buildBillieChangeSummary(assistantChangePreview);
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
    { id: "assistant", label: "Edit with Billie", content: "Billie edits" },
    { id: "export", label: "Export", content: "Export options coming soon" }
  ];
  const styleOptions = STYLE_OPTIONS;
  const toneOptions = ["Formal", "Neutral", "Friendly"];
  const accentSwatches = ["#093064", "#14532d", "#5a9c69", "#d7f1dd", "#0f766e", "#be123c", "#111827"];
  const activeStyleOption = styleOptions.find((option) => option.id === stylePreset) ?? styleOptions[0] ?? null;
  const activeHeaderLayoutLabel =
    HEADER_LAYOUT_OPTIONS.find((option) => option.id === headerLayout)?.label ?? "Split";
  const activeSpacingLabel =
    SPACING_DENSITY_OPTIONS.find((option) => option.id === spacingDensity)?.label ?? "Standard";
  const favoriteStyleOption = savedLayoutStudioFavorite
    ? styleOptions.find((option) => option.id === savedLayoutStudioFavorite.stylePreset) ?? null
    : null;
  const favoriteHeaderLayoutLabel = savedLayoutStudioFavorite
    ? HEADER_LAYOUT_OPTIONS.find((option) => option.id === savedLayoutStudioFavorite.headerLayout)?.label ?? "Split"
    : "";
  const favoriteSpacingLabel = savedLayoutStudioFavorite
    ? SPACING_DENSITY_OPTIONS.find((option) => option.id === savedLayoutStudioFavorite.spacingDensity)?.label ?? "Standard"
    : "";
  const accent = buildAccentPalette(accentColor);
  const accentButtonStyle = {
    backgroundColor: accent.primary,
    borderColor: accent.primary,
    color: accent.buttonText
  };
  const accentGhostButtonStyle = {
    backgroundColor: accent.soft,
    borderColor: accent.border,
    color: accent.text
  };
  const invoiceStatus = savedInvoiceStatus || (savedInvoiceId ? "draft" : "");
  const documentTitle = documentType === "estimate" ? "ESTIMATE" : "INVOICE";
  const documentNumberLabel = documentType === "estimate" ? "Estimate #" : "Invoice #";
  const saveLabel = savedInvoiceId
    ? documentType === "estimate"
      ? "Update saved estimate"
      : "Update saved invoice"
    : documentType === "estimate"
      ? "Save estimate"
      : "Save invoice";
  const planLimitReached = !savedInvoiceId && Boolean(accountPlan?.upgradeRequired);
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planWarning = !planLimitReached ? getPlanPrelimitWarning(accountPlan) : "";
  const planUpgradeUrl = getPlanUpgradeUrl(accountPlan);
  const planBillingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const googlePlayEntitlements = accountPlan?.billing?.googlePlay?.entitlements ?? {};
  const googlePlayRecoveryState =
    accountPlan?.plan === "free" &&
    Number.isFinite(googlePlayEntitlements?.subscriptionCount) &&
    Number(googlePlayEntitlements.subscriptionCount) > 0 &&
    (!Number.isFinite(googlePlayEntitlements?.activeSubscriptionCount) ||
      Number(googlePlayEntitlements.activeSubscriptionCount) <= 0);
  const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
  const useStripePortalAction =
    (accountPlan?.plan === "pro" || googlePlayRecoveryState) && hasStripePortal(accountPlan);
  const planUsageToneClass =
    planUsage?.statusTone === "limit"
      ? "nb-usage-meter--limit"
      : planUsage?.statusTone === "warning"
        ? "nb-usage-meter--warning"
        : "";
  const showUpgradeAction =
    accountPlan?.plan === "free" && (Boolean(planUpgradeUrl) || useStripeUpgradeAction);
  const showBillingPortalAction =
    (accountPlan?.plan === "pro" || googlePlayRecoveryState) &&
    (Boolean(planBillingPortalUrl) || useStripePortalAction);
  const billingEnvironment = getBillingEnvironment(accountPlan);
  const googlePlaySubscriptionPlans = getGooglePlaySubscriptionPlans(accountPlan);
  const hasGooglePlayPlanChoices =
    billingEnvironment?.mode === "google-play" && googlePlaySubscriptionPlans.length > 1;
  const upgradeActionLabel =
    billingEnvironment?.mode === "google-play" ? "Upgrade in Google Play" : "Upgrade plan";
  const manageBillingLabel =
    billingEnvironment?.mode === "google-play" ? "Manage in Google Play" : "Manage billing";
  const billingEnvironmentHint =
    billingEnvironment?.hint || "Use the billing controls that match this device.";
  const recoveryEnvironmentHint = googlePlayRecoveryState
    ? "Google Play already knows about purchase history on this account. Restore purchases from the launcher first, or open Google Play management to inspect the subscription state."
    : "";
  const showInstalledAppGuard = billingEnvironment?.mode === "android-browser";
  const invoiceStatusStyles = {
    draft: "nb-chip nb-chip--soft normal-case tracking-normal",
    sent: "nb-chip nb-chip--info normal-case tracking-normal",
    paid: "nb-chip nb-chip--success normal-case tracking-normal"
  };
  const canMarkSent = invoiceStatus === "draft" || invoiceStatus === "paid";
  const canMarkPaid = invoiceStatus === "sent";
  const canMarkDraft = invoiceStatus === "sent" || invoiceStatus === "paid";
  const handleUpgradeAction = async (basePlanId = "") => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, {
        basePlanId,
        successPath: "/manual?billing=success",
        cancelPath: "/manual?billing=cancelled"
      });
    } catch (billingActionError) {
      setBillingError(billingActionError?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const handleBillingAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await openBillingPortal(accountPlan, { returnPath: "/manual" });
    } catch (billingActionError) {
      setBillingError(billingActionError?.message || "Unable to open billing settings.");
    } finally {
      setBillingBusy(false);
    }
  };

  const buildAssistantUndoState = () => ({
    invoice: {
      invoiceNumber: previewData?.invoiceNumber ?? "",
      issueDate: previewData?.invoiceDate ?? "",
      customerName: previewData?.billToDetails ?? "",
      notes: previewData?.notes ?? "",
      paymentLinkUrl: previewData?.paymentLinkUrl ?? "",
      lineItems: Array.isArray(previewData?.lineItems)
        ? previewData.lineItems.map((item) => ({
            id: item.id,
            type: "other",
            description: item.description ?? "",
            quantity: item.qty === "" ? undefined : Number.parseFloat(item.qty),
            unitPrice: item.rate === "" ? undefined : Number.parseFloat(item.rate)
          }))
        : []
    },
    style: {
      stylePreset,
      accentColor,
      logoVisible,
      notesVisible,
      headerLayout,
      spacingDensity,
      taxRate,
      discountAmount
    }
  });
  const restoreAssistantUndoState = (undoState) => {
    if (!undoState) {
      return;
    }
    onApplyAiEdit?.(undoState.invoice);
    onStylePresetChange?.(undoState.style.stylePreset);
    onAccentColorChange?.(undoState.style.accentColor);
    onLogoVisibilityChange?.(undoState.style.logoVisible);
    onNotesVisibilityChange?.(undoState.style.notesVisible);
    onHeaderLayoutChange?.(undoState.style.headerLayout);
    onSpacingDensityChange?.(undoState.style.spacingDensity);
    onTaxRateChange?.(undoState.style.taxRate);
    onDiscountAmountChange?.(undoState.style.discountAmount);
  };
  const applyLayoutStudioRecipe = (recipe) => {
    if (!recipe) {
      return;
    }
    onStylePresetChange?.(recipe.stylePreset);
    onHeaderLayoutChange?.(recipe.headerLayout);
    onSpacingDensityChange?.(recipe.spacingDensity);
    onAccentColorChange?.(recipe.accentColor);
  };
  const resetLayoutStudio = () => {
    applyLayoutStudioRecipe(LAYOUT_STUDIO_RECIPES[0]);
    onLogoVisibilityChange?.(true);
    onNotesVisibilityChange?.(true);
  };
  const handleRecordPaymentSubmit = async () => {
    const amount = Number.parseFloat(paymentAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    await onRecordPayment?.({
      amount,
      paidAt: paymentDateInput || undefined,
      note: paymentNoteInput.trim() || undefined
    });
    setPaymentAmountInput("");
    setPaymentNoteInput("");
  };

  useEffect(() => {
    if (!previewTemplateId) {
      return undefined;
    }
    previewFocusReturnRef.current = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewTemplateId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      previewCloseButtonRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const previous = previewFocusReturnRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [previewTemplateId]);

  const startRewrite = (tone) => {
    setSelectedTone(tone);
    const payloadResult = buildRewriteInvoicePayload();
    if (payloadResult.error) {
      setToneError(payloadResult.error);
      setToneLoading(false);
      setPendingRewrite(null);
      return;
    }
    const { invoice } = payloadResult;
    toneRequestIdRef.current += 1;
    const requestId = toneRequestIdRef.current;
    setToneLoading(true);
    setToneError("");
    setPendingRewrite(null);
    setToneStatus("");
    apiFetch("/api/invoices/reword-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice, tone })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Rewrite failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== toneRequestIdRef.current) {
          return;
        }
        const rewrittenInvoice = payload?.invoice;
        setPendingRewrite({
          lineItems: rewrittenInvoice?.lineItems ?? [],
          notes: rewrittenInvoice?.notes ?? ""
        });
        setToneLoading(false);
      })
      .catch((error) => {
        if (requestId !== toneRequestIdRef.current) {
          return;
        }
        setToneError("Rewrite failed. Try again.");
        setToneLoading(false);
      });
  };

  const recordAssistantTiming = (outcome, startedAtMs) => {
    if (!billieTelemetryUtils || !Number.isFinite(startedAtMs)) {
      return;
    }
    const durationMs = Math.max(0, Date.now() - startedAtMs);
    billieTelemetryUtils.recordRefineEvent({
      source: "manual",
      outcome,
      durationMs
    });
    setAssistantTimingSummary(
      billieTelemetryUtils.formatRefineSummaryLabel(
        billieTelemetryUtils.getRefineSummary("manual")
      )
    );
  };

  const runAssistantWordingRewrite = (instruction, wordingCommand, undoStateOverride = null) => {
    const appendUserMessage = wordingCommand.appendUserMessage !== false;
    const payloadResult = buildRewriteInvoicePayload?.();
    if (!payloadResult || payloadResult.error) {
      setAssistantError(payloadResult?.error ?? "Add at least one line item before editing.");
      return;
    }

    if (wordingCommand.scope === "notes" && !(payloadResult.invoice.notes ?? "").trim()) {
      setAssistantError("Add notes before asking Billie to rewrite them.");
      return;
    }

    const routePath =
      wordingCommand.scope === "notes"
        ? "/api/invoices/reword-notes"
        : wordingCommand.scope === "descriptions"
          ? "/api/invoices/reword-descriptions"
          : "/api/invoices/reword-full";
    const requestBody =
      wordingCommand.scope === "notes"
        ? { invoice: payloadResult.invoice, tone: wordingCommand.tone }
        : { invoice: payloadResult.invoice, tone: wordingCommand.tone };

    assistantRequestIdRef.current += 1;
    const requestId = assistantRequestIdRef.current;
    const startedAtMs = Date.now();
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantStatus(wordingCommand.loadingText);
    if (appendUserMessage) {
      setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    }

    apiFetch(routePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Rewrite failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        if (!payload?.invoice) {
          throw new Error("Rewrite failed");
        }
        setAssistantUndoState(undoStateOverride ?? buildAssistantUndoState());
        setAssistantChangePreview(
          buildAssistantChangePreview(payloadResult.invoice, payload.invoice, wordingCommand.scope)
        );
        onApplyRewrite?.({
          lineItems: payload.invoice.lineItems ?? [],
          notes: payload.invoice.notes ?? "",
          mode: wordingCommand.scope === "notes" ? "notes" : wordingCommand.scope
        });
        const responseText =
          wordingCommand.scope === "notes"
            ? "Notes updated. Numbers unchanged."
            : wordingCommand.scope === "descriptions"
              ? "Descriptions updated. Numbers unchanged."
              : "Wording updated. Numbers unchanged.";
        setAssistantMessages((prev) => [...prev, { role: "ai", text: responseText }]);
        setAssistantStatus("");
        setAssistantInstruction("");
        setAssistantLoading(false);
        recordAssistantTiming("success", startedAtMs);
      })
      .catch(() => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        setAssistantError("Rewrite failed. Try again.");
        setAssistantStatus("");
        setAssistantLoading(false);
        recordAssistantTiming("error", startedAtMs);
      });
  };

  const runAssistantLineRewrite = (instruction, lineWordingCommand, undoStateOverride = null) => {
    const appendUserMessage = lineWordingCommand.appendUserMessage !== false;
    const payloadResult = buildRewriteInvoicePayload?.();
    if (!payloadResult || payloadResult.error) {
      setAssistantError(payloadResult?.error ?? "Add at least one line item before editing.");
      return;
    }
    if (!lineWordingCommand?.targetLineId) {
      setAssistantError(lineWordingCommand?.responseText || "Pick a line item to refine.");
      return;
    }

    assistantRequestIdRef.current += 1;
    const requestId = assistantRequestIdRef.current;
    const startedAtMs = Date.now();
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantStatus(lineWordingCommand.loadingText || "Billie is refining line wording…");
    if (appendUserMessage) {
      setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    }

    apiFetch("/api/invoices/reword-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice: payloadResult.invoice,
        lineItemId: lineWordingCommand.targetLineId,
        tone: lineWordingCommand.tone
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Rewrite failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        if (!payload?.invoice) {
          throw new Error("Rewrite failed");
        }
        setAssistantUndoState(undoStateOverride ?? buildAssistantUndoState());
        setAssistantChangePreview(
          buildAssistantChangePreview(
            payloadResult.invoice,
            payload.invoice,
            "line_item",
            lineWordingCommand.targetLineId
          )
        );
        onApplyRewrite?.({
          lineItems: payload.invoice.lineItems ?? [],
          notes: payload.invoice.notes ?? "",
          mode: "line_item"
        });
        setAssistantMessages((prev) => [
          ...prev,
          { role: "ai", text: lineWordingCommand.responseText || "Line updated. Numbers unchanged." }
        ]);
        setAssistantStatus("");
        setAssistantInstruction("");
        setAssistantLoading(false);
        recordAssistantTiming("success", startedAtMs);
      })
      .catch(() => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        setAssistantError("Rewrite failed. Try again.");
        setAssistantStatus("");
        setAssistantLoading(false);
        recordAssistantTiming("error", startedAtMs);
      });
  };

  const applyAssistantStyleCommand = (styleCommand) => {
    if (!styleCommand) {
      return false;
    }
    let applied = false;
    if (styleCommand.stylePreset) {
      onStylePresetChange?.(styleCommand.stylePreset);
      applied = true;
    }
    if (styleCommand.accentColor) {
      onAccentColorChange?.(styleCommand.accentColor);
      applied = true;
    }
    if (styleCommand.logoVisible !== null) {
      onLogoVisibilityChange?.(styleCommand.logoVisible);
      applied = true;
    }
    if (styleCommand.notesVisible !== null) {
      onNotesVisibilityChange?.(styleCommand.notesVisible);
      applied = true;
    }
    if (styleCommand.headerLayout) {
      onHeaderLayoutChange?.(styleCommand.headerLayout);
      applied = true;
    }
    if (styleCommand.spacingDensity) {
      onSpacingDensityChange?.(styleCommand.spacingDensity);
      applied = true;
    }
    return applied;
  };

  const submitAssistantEdit = (instructionOverride = null) => {
    const instructionSource =
      typeof instructionOverride === "string" ? instructionOverride : assistantInstruction;
    const instruction = instructionSource.trim();
    if (!instruction) {
      setAssistantError("Add an instruction for Billie.");
      return;
    }
    if (pendingAssistantEdit) {
      setAssistantError("Apply or discard the pending changes first.");
      return;
    }
    const styleCommand = resolveBillieStyleCommand(instruction, {
      logoUrl,
      logoVisible,
      stylePresets: STYLE_PRESETS,
      spacingDensityPresets: SPACING_DENSITY_PRESETS,
      styleAccents: BILLIE_STYLE_ACCENTS
    });
    const taxCommand = resolveBillieTaxCommand(instruction);
    const discountCommand = resolveBillieDiscountCommand(instruction, { subtotal: previewData?.subtotal });
    const paymentLinkCommand = resolveBilliePaymentLinkCommand(instruction);
    const lineValueCommand = resolveBillieLineValueCommand(instruction, { lineItems: previewData?.lineItems });
    const lineWordingCommand =
      lineValueCommand || paymentLinkCommand
        ? null
        : resolveBillieLineWordingCommand(instruction, { lineItems: previewData?.lineItems });
    const wordingCommand =
      lineValueCommand || paymentLinkCommand || lineWordingCommand
        ? null
        : resolveBillieWordingCommand(instruction);
    if (
      (styleCommand || taxCommand || discountCommand || paymentLinkCommand || lineValueCommand) &&
      (wordingCommand || lineWordingCommand)
    ) {
      const undoState = buildAssistantUndoState();
      const localResponses = [];
      const styleApplied = styleCommand ? applyAssistantStyleCommand(styleCommand) : false;
      if (styleCommand?.responseText) {
        localResponses.push({ role: "ai", text: styleCommand.responseText });
      }
      if (taxCommand) {
        onTaxRateChange?.(taxCommand.taxRate);
        localResponses.push({ role: "ai", text: taxCommand.responseText });
      }
      if (discountCommand) {
        if (discountCommand.discountAmount !== undefined) {
          onDiscountAmountChange?.(discountCommand.discountAmount);
        }
        if (discountCommand.responseText) {
          localResponses.push({ role: "ai", text: discountCommand.responseText });
        }
      }
      if (paymentLinkCommand) {
        if (paymentLinkCommand.paymentLinkUrl !== undefined) {
          onPaymentLinkChange?.(paymentLinkCommand.paymentLinkUrl);
        }
        if (paymentLinkCommand.responseText) {
          localResponses.push({ role: "ai", text: paymentLinkCommand.responseText });
        }
      }
      if (lineValueCommand) {
        if (lineValueCommand.targetLineId && lineValueCommand.updates) {
          onUpdateLineItemValues?.(lineValueCommand.targetLineId, lineValueCommand.updates);
        }
        if (lineValueCommand.responseText) {
          localResponses.push({ role: "ai", text: lineValueCommand.responseText });
        }
      }
      setAssistantError("");
      setAssistantMessages((prev) => [
        ...prev,
        { role: "user", text: instruction },
        ...localResponses
      ]);
      setAssistantInstruction("");
      setAssistantChangePreview([]);
      if (
        styleApplied ||
        taxCommand ||
        discountCommand?.discountAmount !== undefined ||
        paymentLinkCommand?.paymentLinkUrl !== undefined ||
        lineValueCommand?.targetLineId
      ) {
        setAssistantStatus("");
      }
      if (lineWordingCommand) {
        runAssistantLineRewrite(
          instruction,
          {
            ...lineWordingCommand,
            appendUserMessage: false
          },
          undoState
        );
        return;
      }
      runAssistantWordingRewrite(
        instruction,
        {
          ...wordingCommand,
          appendUserMessage: false
        },
        undoState
      );
      return;
    }
    if (styleCommand || taxCommand || discountCommand || paymentLinkCommand || lineValueCommand) {
      setAssistantUndoState(buildAssistantUndoState());
      if (styleCommand) {
        applyAssistantStyleCommand(styleCommand);
      }
      if (taxCommand) {
        onTaxRateChange?.(taxCommand.taxRate);
      }
      if (discountCommand?.discountAmount !== undefined) {
        onDiscountAmountChange?.(discountCommand.discountAmount);
      }
      if (paymentLinkCommand?.paymentLinkUrl !== undefined) {
        onPaymentLinkChange?.(paymentLinkCommand.paymentLinkUrl);
      }
      if (lineValueCommand?.targetLineId && lineValueCommand.updates) {
        onUpdateLineItemValues?.(lineValueCommand.targetLineId, lineValueCommand.updates);
      }
      setAssistantError("");
      setAssistantStatus("");
      setAssistantChangePreview([]);
      setAssistantMessages((prev) => [
        ...prev,
        { role: "user", text: instruction },
        ...(styleCommand?.responseText ? [{ role: "ai", text: styleCommand.responseText }] : []),
        ...(taxCommand?.responseText ? [{ role: "ai", text: taxCommand.responseText }] : []),
        ...(discountCommand?.responseText ? [{ role: "ai", text: discountCommand.responseText }] : []),
        ...(paymentLinkCommand?.responseText
          ? [{ role: "ai", text: paymentLinkCommand.responseText }]
          : []),
        ...(lineValueCommand?.responseText ? [{ role: "ai", text: lineValueCommand.responseText }] : [])
      ]);
      setAssistantInstruction("");
      return;
    }
    if (wordingCommand) {
      runAssistantWordingRewrite(instruction, wordingCommand);
      return;
    }
    if (lineWordingCommand) {
      runAssistantLineRewrite(instruction, lineWordingCommand);
      return;
    }
    const payloadResult = buildEditableInvoicePayload?.();
    if (!payloadResult || payloadResult.error) {
      setAssistantError(payloadResult?.error ?? "Add at least one line item before editing.");
      return;
    }
    const { invoice } = payloadResult;
    assistantRequestIdRef.current += 1;
    const requestId = assistantRequestIdRef.current;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantStatus("");
    setAssistantChangePreview([]);
    setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    apiFetch("/api/invoices/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice, instruction })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Edit failed");
        }
        return response.json();
      })
      .then((payload) => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        if (payload?.followUp) {
          setAssistantStatus(payload.followUp);
          setAssistantMessages((prev) => [...prev, { role: "ai", text: payload.followUp }]);
          setAssistantLoading(false);
          setAssistantInstruction("");
          return;
        }
        if (payload?.invoice) {
          const summary = buildEditSummary(invoice, payload.invoice);
          setPendingAssistantEdit({ invoice: payload.invoice, summary });
          setAssistantMessages((prev) => [
            ...prev,
            {
              role: "ai",
              text: "I drafted updates. Review and apply when ready."
            }
          ]);
          setAssistantInstruction("");
        } else {
          setAssistantError("No updates returned. Try again.");
        }
        setAssistantLoading(false);
      })
      .catch(() => {
        if (requestId !== assistantRequestIdRef.current) {
          return;
        }
        setAssistantError("Edit failed. Try again.");
        setAssistantLoading(false);
      });
  };

  const buildEditSummary = (before, after) => {
    if (!before || !after) {
      return ["Review the suggested changes before applying."];
    }
    const summary = [];
    if (before.customerName !== after.customerName) {
      summary.push("Client updated");
    }
    if (before.issueDate !== after.issueDate) {
      summary.push("Invoice date updated");
    }
    if (before.invoiceNumber !== after.invoiceNumber) {
      summary.push("Invoice number updated");
    }
    if ((before.notes ?? "") !== (after.notes ?? "")) {
      summary.push("Notes updated");
    }
    if ((before.paymentLinkUrl ?? "") !== (after.paymentLinkUrl ?? "")) {
      summary.push("Payment link updated");
    }
    const beforeLines = Array.isArray(before.lineItems) ? before.lineItems : [];
    const afterLines = Array.isArray(after.lineItems) ? after.lineItems : [];
    if (beforeLines.length !== afterLines.length) {
      summary.push(`Line items: ${beforeLines.length} → ${afterLines.length}`);
    }
    const changes = [];
    afterLines.forEach((line) => {
      const match =
        beforeLines.find((item) => item.id && line.id && item.id === line.id) ??
        beforeLines.find((item) => item.description === line.description);
      if (!match) {
        changes.push(`Added: ${line.description}`);
        return;
      }
      if (
        match.description !== line.description ||
        match.quantity !== line.quantity ||
        match.unitPrice !== line.unitPrice
      ) {
        changes.push(`Updated: ${line.description || match.description}`);
      }
    });
    const trimmedChanges = changes.filter(Boolean).slice(0, 3);
    if (trimmedChanges.length > 0) {
      summary.push(...trimmedChanges);
    }
    if (summary.length === 0) {
      summary.push("Minor wording updates");
    }
    return summary;
  };

  const handleApplyPendingEdit = () => {
    if (!pendingAssistantEdit) {
      return;
    }
    setAssistantUndoState(buildAssistantUndoState());
    setAssistantChangePreview([]);
    onApplyAiEdit?.(pendingAssistantEdit.invoice);
    setAssistantMessages((prev) => [...prev, { role: "ai", text: "Changes applied." }]);
    setPendingAssistantEdit(null);
  };

  const handleDiscardPendingEdit = () => {
    if (!pendingAssistantEdit) {
      return;
    }
    setAssistantMessages((prev) => [...prev, { role: "ai", text: "Okay — discarded that draft." }]);
    setPendingAssistantEdit(null);
  };
  const handleUndoAssistantChange = () => {
    if (!assistantUndoState) {
      return;
    }
    restoreAssistantUndoState(assistantUndoState);
    setAssistantUndoState(null);
    setAssistantChangePreview([]);
    setAssistantStatus("");
    setAssistantError("");
    setPendingAssistantEdit(null);
    setAssistantMessages((prev) => [...prev, { role: "ai", text: "Undid last Billie change." }]);
  };

  const buildPreview = (items, previewNotes) => {
    const descriptionLines = items
      .filter((item) => item.description && item.description.trim())
      .map((item, index) => `${index + 1}. ${item.description.trim()}`)
      .join("\n");
    if (toneAction === "descriptions") {
      return descriptionLines || "No line item descriptions yet.";
    }
    const notesText = previewNotes?.trim() ? previewNotes.trim() : "No notes yet.";
    return `Descriptions:\n${descriptionLines || "No line item descriptions yet."}\n\nNotes:\n${notesText}`;
  };

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content ?? "";
  const beforePreview = buildPreview(toneSource?.lineItems ?? [], toneSource?.notes ?? "");
  const afterPreview = pendingRewrite
    ? buildPreview(pendingRewrite.lineItems ?? [], pendingRewrite.notes ?? "")
    : toneLoading
      ? "Generating preview..."
      : selectedTone
        ? "Select a tone to see a preview."
        : "Select a tone to see a preview.";
  const templateCatalog = STYLE_PRESETS;
  const templatePreviews = TEMPLATE_PREVIEWS;
  const previewTemplate = previewTemplateId ? templateCatalog[previewTemplateId] : null;
  const previewIsSelected = previewTemplateId && stylePreset === previewTemplateId;
  const previewPreset = previewTemplate ?? templateCatalog.default;
  const previewSpacing =
    SPACING_DENSITY_PRESETS[previewData?.spacingDensity ?? spacingDensity] ??
    SPACING_DENSITY_PRESETS.balanced;
  const previewLineItems = Array.isArray(previewData?.lineItems) ? previewData.lineItems : [];
  const parsedLineItems = previewLineItems
    .filter(
      (item) =>
        item &&
        (item.description?.trim() || `${item.qty ?? ""}`.trim() || `${item.rate ?? ""}`.trim())
    )
    .map((item) => {
      const quantity = Number.parseFloat(`${item.qty ?? ""}`);
      const rate = Number.parseFloat(`${item.rate ?? ""}`);
      const hasQuantity = Number.isFinite(quantity);
      const hasRate = Number.isFinite(rate);
      return {
        id: item.id,
        description: polishLineItemDescription(item.description?.trim()) || "Untitled line item",
        qty: hasQuantity ? quantity : null,
        rate: hasRate ? rate : null,
        amount: hasQuantity && hasRate ? quantity * rate : null
      };
    });
  const previewItems =
    parsedLineItems.length > 0
      ? parsedLineItems
      : [
          {
            id: "preview-placeholder",
            description: "Add line items to see them here.",
            qty: null,
            rate: null,
            amount: null,
            placeholder: true
          }
        ];
  const formatPreviewMoney = (value) =>
    Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
  const previewSubtotal = Number.isFinite(previewData?.subtotal)
    ? previewData.subtotal
    : parsedLineItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const previewTaxRate = Number.parseFloat(`${previewData?.taxRate ?? ""}`);
  const previewTaxAmount = Number.isFinite(previewData?.taxAmount)
    ? previewData.taxAmount
    : Number.isFinite(previewTaxRate)
      ? previewSubtotal * (previewTaxRate / 100)
      : 0;
  const previewTotal = Number.isFinite(previewData?.total)
    ? previewData.total
    : previewSubtotal + previewTaxAmount;
  const previewInvoiceNumber =
    previewData?.invoiceNumber?.trim() || (previewItems[0]?.placeholder ? "Invoice" : "Invoice");
  const previewIssueDate = previewData?.invoiceDate?.trim() || "—";
  const previewFromDetails = previewData?.fromDetails?.trim() || "Add your business details";
  const previewBillToDetails = previewData?.billToDetails?.trim() || "Add client details";
  const previewNotes = previewData?.notes?.trim() || "Add payment terms or a note.";
  const previewPaymentLink = previewData?.paymentLinkUrl?.trim() || "";
  const previewPaymentMethods = Array.isArray(previewData?.paymentMethods) ? previewData.paymentMethods : [];
  const previewPaymentRecords = Array.isArray(previewData?.paymentRecords) ? previewData.paymentRecords : paymentRecords;
  const previewBalanceDue = Number.isFinite(previewData?.balanceDue) ? previewData.balanceDue : previewTotal;
  const previewAmountPaid = Number.isFinite(previewData?.amountPaid)
    ? previewData.amountPaid
    : Math.max(0, previewTotal - previewBalanceDue);
  const previewPaymentsTotal = previewPaymentRecords.reduce((sum, payment) => {
    const amount = Number(payment?.amount ?? 0);
    return sum + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
  }, 0);
  const previewLatestPayment = previewPaymentRecords[0] ?? null;
  const previewPaymentProgressSummary = buildPaymentProgressSummary(previewTotal, previewBalanceDue, previewPaymentRecords, {
    timelineLimit: 3
  });
  const previewEstimateWorkflowSummary =
    documentType === "estimate" ? buildEstimateWorkflowSummary(previewData ?? {}) : null;
  const hasClientDetails = Boolean(previewData?.billToDetails?.trim());
  const hasBillableLineItem = parsedLineItems.some(
    (item) => !item.placeholder && item.description?.trim() && Number.isFinite(item.amount) && item.amount > 0
  );
  const hasInvoiceTotal = Number.isFinite(previewTotal) && previewTotal > 0;
  const hasPaymentTerms = Boolean(previewData?.notes?.trim() || previewPaymentLink);
  const sendReady = hasClientDetails && hasBillableLineItem && hasInvoiceTotal;
  const readinessItems = [
    {
      id: "client",
      label: "Client",
      ready: hasClientDetails,
      status: hasClientDetails ? "Client added" : "Add client"
    },
    {
      id: "line-items",
      label: "Line items",
      ready: hasBillableLineItem,
      status: hasBillableLineItem ? "Billable item added" : "Add work, quantity, and rate"
    },
    {
      id: "total",
      label: "Total",
      ready: hasInvoiceTotal,
      status: hasInvoiceTotal ? `${formatPreviewMoney(previewTotal)} total` : "Add an amount"
    },
    {
      id: "terms",
      label: "Terms",
      ready: hasPaymentTerms,
      optional: true,
      status: hasPaymentTerms ? "Payment info added" : "Optional but helpful"
    }
  ];
  const paymentStateLabel =
    invoiceStatus === "paid"
      ? "Paid in full"
      : previewAmountPaid > 0 && previewBalanceDue > 0
        ? `Partially paid: ${formatPreviewMoney(previewBalanceDue)} remaining`
        : `Open balance: ${formatPreviewMoney(previewBalanceDue)}`;
  const paymentStateClass =
    invoiceStatus === "paid"
      ? "nb-chip nb-chip--success normal-case tracking-normal"
      : previewAmountPaid > 0 && previewBalanceDue > 0
        ? "nb-chip nb-chip--info normal-case tracking-normal"
        : "nb-chip nb-chip--warning normal-case tracking-normal";
  const activeTabButtonId = `invoice-workspace-tab-${activeTab}`;
  const activeTabPanelId = `invoice-workspace-panel-${activeTab}`;

  useEffect(() => {
    const requestId = assistantCommandRequest?.id;
    const instruction = assistantCommandRequest?.instruction;
    const commandSource = assistantCommandRequest?.source ?? "assistant";
    if (
      !acceptAssistantCommands ||
      !requestId ||
      !instruction ||
      handledAssistantCommandRef.current === requestId
    ) {
      return;
    }
    handledAssistantCommandRef.current = requestId;
    if (commandSource !== "workspace") {
      onTabChange?.("assistant");
    }
    submitAssistantEdit(instruction);
    onAssistantCommandHandled?.(requestId);
  }, [acceptAssistantCommands, assistantCommandRequest, onAssistantCommandHandled, onTabChange]);

  useEffect(() => {
    const latestAssistantMessage =
      [...assistantMessages].reverse().find((message) => message.role === "ai")?.text ?? "";
    onAssistantRuntimeChange?.({
      loading: assistantLoading,
      status: assistantStatus,
      error: assistantError,
      latestMessage: latestAssistantMessage,
      hasPendingEdit: Boolean(pendingAssistantEdit),
      canUndo: Boolean(assistantUndoState),
      changePreviewCount: assistantChangePreview.length,
      changeSummary: assistantChangeSummary,
      timingSummary: assistantTimingSummary
    });
  }, [
    assistantLoading,
    assistantStatus,
    assistantError,
    assistantMessages,
    pendingAssistantEdit,
    assistantUndoState,
    assistantChangePreview,
    assistantChangeSummary,
    assistantTimingSummary,
    onAssistantRuntimeChange
  ]);
  const previewAccent = buildAccentPalette(previewData?.accentColor ?? accentColor ?? DEFAULT_ACCENT_COLOR);

  return (
    <>
      <div className="nb-surface nb-surface--elevated flex h-full min-h-0 flex-col rounded-[28px] p-0 md:rounded-[30px]">
        {!hideInternalTabs ? (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(23,73,60,0.08)] bg-white/88 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Invoice workspace panels">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`invoice-workspace-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`invoice-workspace-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    activeTab === tab.id ? "" : "text-slate-600"
                  }`}
                  style={activeTab === tab.id ? accentButtonStyle : undefined}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {showCloseButton ? (
              <button
                type="button"
                className="nb-btn-ghost shrink-0"
                onClick={onClose}
              >
                Close
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          id={activeTabPanelId}
          role="tabpanel"
          aria-labelledby={activeTabButtonId}
          className={`flex-1 overflow-y-auto px-4 py-5 text-sm text-slate-600 ${hideInternalTabs ? "pt-4" : ""}`}
        >
          {activeTab === "style" ? (
            <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(90,156,105,0.16),transparent_56%),linear-gradient(180deg,#ffffff_0%,#f8fff8_100%)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5a9c69]">
                  Layout Studio
                </p>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-[22rem] space-y-2">
                    <p className="text-lg font-semibold text-slate-900">Shape a look that feels like your business.</p>
                    <p className="text-xs leading-5 text-slate-600">
                      Start with a base style, then mix accent, header, spacing, logo, notes, and Billie prompts into a reusable invoice look.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                      {activeStyleOption?.label || "Classic"} template
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                      {activeHeaderLayoutLabel} header
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                      {activeSpacingLabel} spacing
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                    onClick={() => setPreviewTemplateId(stylePreset || "default")}
                  >
                    Preview current look
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                    onClick={resetLayoutStudio}
                  >
                    Reset to classic
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Quick recipes</p>
                  <p className="mt-1 text-xs text-slate-500">
                    One tap applies a full layout direction so you do not have to tweak each control manually.
                  </p>
                </div>
                <div className="grid gap-3">
                  {LAYOUT_STUDIO_RECIPES.map((recipe) => {
                    const isRecipeActive =
                      stylePreset === recipe.stylePreset &&
                      headerLayout === recipe.headerLayout &&
                      spacingDensity === recipe.spacingDensity &&
                      String(accentColor || "").toLowerCase() === recipe.accentColor.toLowerCase();
                    return (
                      <button
                        key={recipe.id}
                        type="button"
                        className={`rounded-2xl border p-3 text-left transition ${
                          isRecipeActive
                            ? "shadow-sm"
                            : "border-slate-200 bg-white/88 hover:border-slate-300"
                        }`}
                        style={isRecipeActive ? { borderColor: accent.border, backgroundColor: accent.soft } : undefined}
                        onClick={() => applyLayoutStudioRecipe(recipe)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{recipe.label}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{recipe.description}</p>
                          </div>
                          {isRecipeActive ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={accentGhostButtonStyle}
                            >
                              Active
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                            {(STYLE_PRESETS[recipe.stylePreset]?.label || recipe.stylePreset)} template
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                            {(HEADER_LAYOUT_OPTIONS.find((option) => option.id === recipe.headerLayout)?.label || recipe.headerLayout)} header
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                            {(SPACING_DENSITY_PRESETS[recipe.spacingDensity]?.label || recipe.spacingDensity)} spacing
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Favorite look</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Save one preferred invoice look so you can come back to it fast.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                    onClick={onSaveLayoutStudioFavorite}
                  >
                    Save current look
                  </button>
                </div>
                {savedLayoutStudioFavorite ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                        {favoriteStyleOption?.label || "Classic"} template
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                        {favoriteHeaderLayoutLabel} header
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                        {favoriteSpacingLabel} spacing
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                        onClick={onApplyLayoutStudioFavorite}
                      >
                        Apply favorite
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                        onClick={onClearLayoutStudioFavorite}
                      >
                        Clear saved favorite
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No saved favorite yet. Save one after you land on a look you want to reuse.</p>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Base styles</p>
                <p className="mt-1 text-xs text-slate-500">These are starting points, not limits. Mix them with spacing, header, color, and Billie edits.</p>
                <div className="mt-3 grid gap-3">
                  {styleOptions.map((option) => {
                    const preview = templatePreviews[option.id] ?? templatePreviews.default;
                    const isSelected = stylePreset === option.id;
                    return (
                      <div
                        key={option.id}
                        role="button"
                        tabIndex={0}
                        className={`w-full cursor-pointer rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 ${
                          isSelected
                            ? "shadow-sm"
                            : "border-slate-200 bg-white/88 hover:border-slate-300"
                        }`}
                        style={isSelected ? { borderColor: accent.border, backgroundColor: accent.soft } : undefined}
                        onClick={() => onStylePresetChange(option.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onStylePresetChange(option.id);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {option.label}
                          </span>
                          {isSelected ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={accentGhostButtonStyle}
                            >
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold"
                          style={{ color: accent.text }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviewTemplateId(option.id);
                          }}
                        >
                          Preview
                        </button>
                        <div className="mt-3 space-y-2">
                          <div className={`h-2 w-20 rounded-sm ${preview.title}`} />
                          <div className={`h-px ${preview.rule}`} />
                          <div className="space-y-1">
                            <div className={`h-2 w-full rounded-sm ${preview.row}`} />
                            <div className={`h-2 w-5/6 rounded-sm ${preview.row}`} />
                            <div className={`h-2 w-4/6 rounded-sm ${preview.row}`} />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className={`h-2 w-14 rounded-sm ${preview.totals}`} />
                            <div className={`h-2 w-12 rounded-sm ${preview.totalStrong}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Accent color</p>
                <p className="text-xs text-slate-500">Applies to highlights, buttons, and totals.</p>
                <div className="flex flex-wrap gap-2">
                  {accentSwatches.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`h-8 w-8 rounded-full border ${
                        accentColor === swatch ? "border-slate-900" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => onAccentColorChange?.(swatch)}
                      aria-label={`Set accent color ${swatch}`}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Custom
                  <input
                    type="color"
                    className="h-8 w-10 rounded border border-slate-200 bg-white p-1"
                    value={accentColor ?? "#5a9c69"}
                    onChange={(event) => onAccentColorChange?.(event.target.value)}
                  />
                  <span className="font-mono text-[11px] text-slate-500">{accentColor ?? "#5a9c69"}</span>
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Header layout</p>
                <p className="text-xs text-slate-500">Choose how the invoice header is arranged.</p>
                <div className="flex flex-wrap gap-2">
                  {HEADER_LAYOUT_OPTIONS.map((option) => {
                    const isSelected = headerLayout === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                          isSelected ? "" : "border-slate-200 text-slate-600"
                        }`}
                        style={isSelected ? accentButtonStyle : undefined}
                        onClick={() => onHeaderLayoutChange?.(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Spacing density</p>
                <p className="text-xs text-slate-500">Adjust how tight or airy the invoice feels.</p>
                <div className="flex flex-wrap gap-2">
                  {SPACING_DENSITY_OPTIONS.map((option) => {
                    const isSelected = spacingDensity === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                          isSelected ? "" : "border-slate-200 text-slate-600"
                        }`}
                        style={isSelected ? accentButtonStyle : undefined}
                        onClick={() => onSpacingDensityChange?.(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Logo</p>
                <p className="mt-1 text-xs text-slate-500">PNG, JPG, or SVG</p>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="block w-full text-sm text-slate-600"
                onChange={onLogoChange}
              />
              {logoUrl ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-600"
                    onClick={onLogoRemove}
                  >
                    Remove logo
                  </button>
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-600"
                    onClick={() => onLogoVisibilityChange?.(!logoVisible)}
                  >
                    {logoVisible ? "Hide on invoice" : "Show on invoice"}
                  </button>
                  <p className="text-xs text-slate-500">
                    {logoVisible ? "Logo is visible on the invoice." : "Logo is hidden from the invoice."}
                  </p>
                </div>
              ) : null}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Notes / Terms</p>
                  <p className="mt-1 text-xs text-slate-500">Show or hide notes on the invoice.</p>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600"
                  onClick={() => onNotesVisibilityChange?.(!notesVisible)}
                >
                  {notesVisible ? "Hide on invoice" : "Show on invoice"}
                </button>
                <p className="text-xs text-slate-500">
                  {notesVisible
                    ? "Notes are visible on the invoice."
                    : "Notes are hidden from the invoice."}
                </p>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Registrations block</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Show or hide business and tax IDs on the invoice. Hidden automatically when no IDs are saved.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600"
                  aria-label={registrationBlockVisible ? "Hide registration block on invoice" : "Show registration block on invoice"}
                  onClick={() => onRegistrationBlockVisibilityChange?.(!registrationBlockVisible)}
                >
                  {registrationBlockVisible ? "Hide on invoice" : "Show on invoice"}
                </button>
                <p className="text-xs text-slate-500">
                  {registrationBlockVisible
                    ? "Registration IDs are visible on the invoice when present."
                    : "Registration IDs stay saved but are hidden from the invoice."}
                </p>
              </div>
            </div>
          ) : activeTab === "tone" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Rewrite wording only. Amounts are never changed.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setToneAction("descriptions");
                  setSelectedTone(null);
                  setToneStatus("");
                  setToneError("");
                  setPendingRewrite(null);
                }}
              >
                Rewrite descriptions
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  setToneAction("full");
                  setSelectedTone(null);
                  setToneStatus("");
                  setToneError("");
                  setPendingRewrite(null);
                }}
              >
                Rewrite entire invoice text
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  const changedCount = Number(onPolishDescriptions?.() ?? 0);
                  setToneStatus(
                    changedCount > 0
                      ? `Polished ${changedCount} line item${changedCount > 1 ? "s" : ""}.`
                      : "No wording updates needed."
                  );
                  setToneError("");
                }}
              >
                Quick clean descriptions
              </button>
            </div>

            {toneAction ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Select tone
                </p>
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        selectedTone === tone ? "" : "border border-slate-200 text-slate-600"
                      }`}
                      style={selectedTone === tone ? accentButtonStyle : undefined}
                      onClick={() => startRewrite(tone)}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {toneAction ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Before</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{beforePreview}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">After</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{afterPreview}</p>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  style={accentButtonStyle}
                  disabled={!selectedTone || toneLoading || !pendingRewrite}
                  onClick={() => {
                    onApplyRewrite({
                      lineItems: pendingRewrite?.lineItems ?? [],
                      notes: pendingRewrite?.notes ?? "",
                      mode: toneAction
                    });
                    setToneStatus("Changes applied.");
                  }}
                >
                  Apply changes
                </button>
                {toneLoading ? <p className="text-xs text-slate-500">Rewriting...</p> : null}
                {toneError ? <p className="text-xs text-rose-600">{toneError}</p> : null}
                {toneStatus ? <p className="text-xs text-slate-500">{toneStatus}</p> : null}
              </div>
            ) : null}
          </div>
        ) : activeTab === "assistant" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Edit with Billie</p>
              <p className="mt-1 text-xs text-slate-500">
                Ask for wording or design changes without retyping. Billie only adjusts the parts you request.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                {assistantQuickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    style={accentGhostButtonStyle}
                    onClick={() => submitAssistantEdit(action.instruction)}
                    disabled={assistantLoading || !!pendingAssistantEdit}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            {assistantLineQuickActions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Line actions
                </p>
                <div className="flex flex-wrap gap-2">
                  {assistantLineQuickActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      style={accentGhostButtonStyle}
                      onClick={() => submitAssistantEdit(action.instruction)}
                      disabled={assistantLoading || !!pendingAssistantEdit}
                      title={action.helperText}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Conversation
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {assistantMessages.length > 0 ? (
                  assistantMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        message.role === "user" ? "" : "bg-white text-slate-600"
                      }`}
                      style={message.role === "user" ? accentGhostButtonStyle : undefined}
                    >
                      <p className="font-semibold uppercase tracking-wide text-[10px]">
                        {message.role === "user" ? "You" : "Billie"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{message.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    Ask for changes like “Make descriptions more formal.” or “Set payment link to
                    https://pay.example.com/invoice/123”. You can also say “Make this feel premium with a centered header and navy accent.”
                  </p>
                )}
              </div>
            </div>
            {assistantUndoState ? (
              <button
                type="button"
                className="w-full rounded-lg border px-3 py-2 text-sm font-semibold"
                style={accentGhostButtonStyle}
                onClick={handleUndoAssistantChange}
                disabled={assistantLoading}
              >
                Undo last Billie change
              </button>
            ) : null}
            {assistantChangePreview.length > 0 ? (
              <div
                className="space-y-3 rounded-lg border p-3"
                style={{ borderColor: accent.border, backgroundColor: accent.soft }}
                data-testid="manual-billie-change-preview"
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent.text }}>
                  Last Billie change
                </p>
                <div className="space-y-3">
                  {assistantChangePreview.map((entry, index) => (
                    <div key={`${entry.label}-${index}`} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {entry.label}
                      </p>
                      <p className="text-xs text-slate-500">Before</p>
                      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        {entry.before}
                      </p>
                      <p className="text-xs text-slate-500">After</p>
                      <p className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                        {entry.after}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Example: Use the bold template with a navy accent."
              value={assistantInstruction}
              onChange={(event) => setAssistantInstruction(event.target.value)}
              disabled={assistantLoading}
            />
            {pendingAssistantEdit ? (
              <div
                className="space-y-3 rounded-lg border p-3"
                style={{ borderColor: accent.border, backgroundColor: accent.soft }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent.text }}>
                  Pending changes
                </p>
                <ul className="space-y-1 text-xs" style={{ color: accent.text }}>
                  {pendingAssistantEdit.summary.map((item, index) => (
                    <li key={`summary-${index}`}>{item}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    style={accentButtonStyle}
                    onClick={handleApplyPendingEdit}
                    disabled={assistantLoading}
                  >
                    Apply changes
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                    style={{ borderColor: accent.border, color: accent.text }}
                    onClick={handleDiscardPendingEdit}
                    disabled={assistantLoading}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              style={accentButtonStyle}
              onClick={submitAssistantEdit}
              disabled={assistantLoading || !!pendingAssistantEdit}
            >
              Draft edit
            </button>
            {assistantLoading && assistantStatus ? (
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: accent.border, backgroundColor: accent.soft, color: accent.text }}
              >
                <span
                  className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full"
                  style={{ backgroundColor: accent.primary }}
                />
                <span>{assistantStatus}</span>
              </div>
            ) : assistantLoading ? (
              <p className="text-xs text-slate-500">Applying changes...</p>
            ) : null}
            {assistantTimingSummary ? (
              <p className="text-[11px] text-slate-500">{assistantTimingSummary}</p>
            ) : null}
            {assistantChangeSummary ? (
              <p
                className="text-[11px] font-medium text-slate-500"
                data-testid="manual-billie-change-summary"
              >
                {assistantChangeSummary}
              </p>
            ) : null}
            {assistantError ? <p className="text-xs text-rose-600">{assistantError}</p> : null}
            {assistantStatus && !assistantLoading ? <p className="text-xs text-slate-500">{assistantStatus}</p> : null}
          </div>
        ) : activeTab === "export" ? (
          <div className="space-y-4">
            <div
              className={`rounded-2xl border p-3 ${
                sendReady
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-amber-200 bg-amber-50/75"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Send-ready check</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {sendReady
                      ? "Core details are set. Save or download when you are ready."
                      : "Add the missing basics before sending this to a client."}
                  </p>
                </div>
                <span
                  className={`nb-chip normal-case tracking-normal ${
                    sendReady ? "nb-chip--success" : "nb-chip--warning"
                  }`}
                >
                  {sendReady ? "Ready to send" : "Needs review"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {readinessItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          item.ready ? "bg-emerald-500" : item.optional ? "bg-slate-300" : "bg-amber-500"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-slate-800">{item.label}</span>
                    </div>
                    <span className="min-w-0 text-right text-xs font-semibold text-slate-600">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Save to library</p>
                {saveStatus ? (
                  <span className="text-xs font-semibold" style={{ color: accent.text }}>
                    {saveStatus}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Save it once so you can reopen it, send it, export it, and manage the next steps from the library.
              </p>
              {planSummary ? (
                <p className={`text-xs ${planLimitReached ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                  {planSummary}
                </p>
              ) : null}
              {planUsage?.finite ? (
                <div className={`nb-usage-meter ${planUsageToneClass}`}>
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
              {planWarning ? (
                <p className="text-xs font-semibold text-amber-700">{planWarning}</p>
              ) : null}
              {showBillingPortalAction ? (
                useStripePortalAction ? (
                  <button
                    type="button"
                    className="inline-flex text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                    onClick={handleBillingAction}
                    disabled={billingBusy}
                  >
                    {billingBusy ? "Opening billing..." : manageBillingLabel}
                  </button>
                ) : (
                  <a
                    href={planBillingPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-800 hover:underline"
                  >
                    {manageBillingLabel}
                  </a>
                )
              ) : null}
              {recoveryEnvironmentHint ? (
                <p className="text-xs leading-5 text-amber-700">{recoveryEnvironmentHint}</p>
              ) : null}
              {planLimitReached ? (
                <div className="nb-banner nb-banner--warning px-2 py-2" role="status" aria-live="polite">
                  <p className="text-xs font-semibold text-amber-900">
                    Save limit reached. Update existing invoices or upgrade to save more.
                  </p>
                  {showInstalledAppGuard ? (
                    <div className="nb-platform-guard mt-2" role="status" aria-live="polite">
                      <p className="nb-platform-guard__eyebrow">Open the app</p>
                      <p className="nb-platform-guard__title">Google Play upgrades only work inside the installed NoteBill app.</p>
                      <p className="nb-platform-guard__copy">
                        Keep editing here if you want, then open the Android app icon when you are ready to upgrade and save more invoices.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] leading-5 text-amber-800">{recoveryEnvironmentHint || billingEnvironmentHint}</p>
                  )}
                  {showUpgradeAction ? (
                    hasGooglePlayPlanChoices ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                        className="nb-btn-secondary mt-2 inline-flex rounded-lg px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleUpgradeAction}
                        disabled={billingBusy}
                      >
                        {billingBusy ? "Opening..." : upgradeActionLabel}
                      </button>
                    ) : (
                      <a
                        href={planUpgradeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="nb-btn-secondary mt-2 inline-flex rounded-lg px-2 py-1 text-xs"
                      >
                        {upgradeActionLabel}
                      </a>
                    )
                  ) : null}
                </div>
              ) : null}
              {billingError ? (
                <p className="text-xs text-rose-600" role="alert">
                  {billingError}{" "}
                  <a href="/support" className="font-semibold underline underline-offset-2">
                    Get support
                  </a>
                </p>
              ) : null}
              {!billingError && recoveryEnvironmentHint ? (
                <p className="text-xs text-amber-700" role="status">
                  {recoveryEnvironmentHint}
                </p>
              ) : null}
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                style={accentButtonStyle}
                onClick={onSaveInvoice}
                disabled={planLimitReached || Boolean(saveStatus && saveStatus !== "Saved")}
              >
                {saveLabel}
              </button>
              {saveError ? (
                <p className="text-xs text-rose-600" role="alert">
                  {saveError}{" "}
                  <a href="/support" className="font-semibold underline underline-offset-2">
                    Get support
                  </a>
                </p>
              ) : null}
              {saveNeedsAuth ? (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-600">Sign in once, then save this draft to your account.</p>
                  {saveAuthHint ? <p className="text-xs text-slate-500">{saveAuthHint}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      onClick={onGoToLauncherSignIn}
                    >
                      Open sign-in
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs font-semibold"
                      style={accentGhostButtonStyle}
                      onClick={onSaveAuthRetry}
                    >
                      I signed in, retry
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {savedInvoiceId && documentType !== "estimate" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Invoice status</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className={`${invoiceStatusStyles[invoiceStatus] ?? invoiceStatusStyles.draft}`}>
                      Status: {invoiceStatus || "draft"}
                    </span>
                    <span className={paymentStateClass}>
                      {paymentStateLabel}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Track draft, sent, and paid state for this saved invoice.</p>
                <div className="flex flex-wrap gap-2">
                  {canMarkSent ? (
                    <button
                      type="button"
                      className="nb-btn-secondary rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:text-blue-300"
                      onClick={() => onUpdateSavedInvoiceStatus("sent")}
                      disabled={statusUpdateLoading}
                    >
                      {invoiceStatus === "paid" ? "Mark sent again" : "Mark sent"}
                    </button>
                  ) : null}
                  {canMarkPaid ? (
                    <button
                      type="button"
                      className="nb-btn-secondary rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:text-blue-300"
                      onClick={() => onUpdateSavedInvoiceStatus("paid")}
                      disabled={statusUpdateLoading}
                    >
                      Mark paid
                    </button>
                  ) : null}
                  {canMarkDraft ? (
                    <button
                      type="button"
                      className="nb-btn-ghost rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:text-slate-300"
                      onClick={() => onUpdateSavedInvoiceStatus("draft")}
                      disabled={statusUpdateLoading}
                    >
                      Mark draft
                    </button>
                  ) : null}
                </div>
                {statusUpdateError ? <p className="text-xs text-rose-600">{statusUpdateError}</p> : null}
              </div>
            ) : null}
            {savedInvoiceId && documentType === "estimate" ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-sm font-semibold text-slate-900">Estimate mode</p>
                <p className="text-xs leading-5 text-slate-500">
                  {previewEstimateWorkflowSummary?.actionHint ||
                    "Estimates stay outside the send, payment, and status workflow until you convert them into invoices."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className={invoiceStatusStyles[savedEstimateReviewState] ?? invoiceStatusStyles.draft}>
                    Review: {savedEstimateReviewState || "draft"}
                  </span>
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:text-blue-300"
                    onClick={() =>
                      onUpdateSavedEstimateReviewState(savedEstimateReviewState === "approved" ? "needs_review" : "approved")
                    }
                    disabled={estimateReviewUpdateLoading}
                  >
                    {estimateReviewUpdateLoading
                      ? "Saving..."
                      : savedEstimateReviewState === "approved"
                        ? "Mark needs review"
                        : "Mark approved"}
                  </button>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  {previewEstimateWorkflowSummary?.nextStepLabel || "Next step: convert it when the work is ready to bill."}
                </p>
                {estimateReviewUpdateError ? <p className="text-xs text-rose-600">{estimateReviewUpdateError}</p> : null}
              </div>
            ) : null}
            {savedInvoiceId && documentType !== "estimate" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Recorded payments</p>
                    <p className="text-xs text-slate-500">
                      Log partial payments here so the remaining balance stays honest.
                    </p>
                  </div>
                  <span className="nb-chip nb-chip--soft normal-case tracking-normal text-[11px]">
                    {formatPreviewMoney(previewAmountPaid)} received
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Amount
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      placeholder="0.00"
                      value={paymentAmountInput}
                      onChange={(event) => setPaymentAmountInput(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Paid on
                    </span>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      value={paymentDateInput}
                      onChange={(event) => setPaymentDateInput(event.target.value)}
                    />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Note
                  </span>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    placeholder="Deposit, milestone 1, cash, e-transfer..."
                    value={paymentNoteInput}
                    onChange={(event) => setPaymentNoteInput(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  style={accentButtonStyle}
                  onClick={handleRecordPaymentSubmit}
                  disabled={paymentRecordBusy || !paymentAmountInput.trim()}
                >
                  {paymentRecordBusy ? "Recording..." : "Record payment"}
                </button>
                {paymentRecordError ? <p className="text-xs text-rose-600">{paymentRecordError}</p> : null}
                <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Payment progress</p>
                    <span className="nb-chip nb-chip--soft normal-case tracking-normal text-[11px]">
                      {formatPreviewMoney(previewPaymentsTotal)} recorded
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="nb-chip nb-chip--info normal-case tracking-normal text-[11px]">
                      {previewPaymentProgressSummary.milestoneLabel}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Keep deposits and milestone payments honest as work moves forward.
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {previewPaymentProgressSummary.nextStepLabel}
                  </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#5a9c69] to-[#14532d]"
                    style={{ width: `${previewPaymentProgressSummary.progressPercent}%` }}
                  />
                </div>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {previewPaymentProgressSummary.progressPercent.toFixed(0)}% complete
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md bg-slate-50 px-2 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Paid</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatPreviewMoney(previewPaymentsTotal)}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 px-2 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Remaining</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatPreviewMoney(previewBalanceDue)}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 px-2 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Latest</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {previewLatestPayment ? formatPreviewMoney(Number(previewLatestPayment.amount ?? 0)) : "None"}
                      </p>
                    </div>
                  </div>
                  {previewPaymentMethods.length > 0 ? (
                    <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        Payment instructions
                      </p>
                      <div className="mt-2 space-y-2">
                        {previewPaymentMethods.map((method, index) => {
                          const { label, details } = getPaymentMethodDisplayData(method);
                          return (
                            <div key={method?.id || `${label}-${index}`} className="rounded-md bg-white px-2 py-2">
                              <p className="text-sm font-semibold text-slate-900">{label}</p>
                              <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                                {details || "Add payment instructions."}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                {previewPaymentRecords.length > 0 ? (
                  <div className="space-y-2">
                    {previewPaymentRecords.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatPreviewMoney(payment.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {payment.paidAt?.trim() || "Recorded payment"}
                            {payment.note?.trim() ? ` · ${payment.note.trim()}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => onRemovePayment?.(payment.id)}
                          disabled={paymentRecordBusy}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No payments recorded yet. Add deposits or milestone payments as they arrive.
                  </p>
                )}
              </div>
            ) : null}
            {savedInvoiceId ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Online payment</p>
                    <p className="text-xs text-slate-500">
                      Create a checkout link and include it in sends and exports.
                    </p>
                  </div>
                  {previewPaymentLink ? (
                    <span className="nb-chip nb-chip--success normal-case tracking-normal text-[11px]">
                      Link ready
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    style={accentButtonStyle}
                    onClick={onGeneratePaymentLink}
                    disabled={paymentLinkBusy}
                  >
                    {paymentLinkBusy
                      ? "Creating link..."
                      : previewPaymentLink
                      ? "Refresh hosted payment link"
                      : "Create hosted payment link"}
                  </button>
                  {previewPaymentLink ? (
                    <a
                      href={previewPaymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      Open hosted payment link
                    </a>
                  ) : null}
                </div>
                {paymentLinkError ? (
                  <p className="text-xs text-rose-600">
                    {paymentLinkError}{" "}
                    <a href="/support" className="font-semibold underline underline-offset-2">
                      Get support
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Download PDF</p>
              <p className="text-xs text-slate-500">Save a PDF copy of the current invoice.</p>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={onDownloadPdf}
              >
                Download PDF
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                onClick={() => setShowPrintActions((current) => !current)}
                aria-expanded={showPrintActions}
                aria-controls="manual-export-print-actions"
              >
                {showPrintActions ? "Hide print options" : "Need print options?"}
              </button>
              {showPrintActions ? (
                <div id="manual-export-print-actions" className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Print</p>
                  <p className="text-xs text-slate-500">Open the print dialog for this invoice.</p>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                    onClick={onPrint}
                  >
                    Print
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          activeContent
        )}
      </div>
    </div>
    {previewTemplate ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        aria-describedby="template-preview-description"
        onClick={() => setPreviewTemplateId(null)}
      >
        <div
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Template preview
              </p>
              <p id="template-preview-title" className="text-lg font-semibold text-slate-900">
                {previewTemplate.label}
              </p>
              <p id="template-preview-description" className="mt-1 text-xs text-slate-500">
                Preview the selected invoice template, then close this dialog to keep editing.
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-slate-500"
              onClick={() => setPreviewTemplateId(null)}
              ref={previewCloseButtonRef}
            >
              Close
            </button>
          </div>
          <div className="px-6 py-5">
            <div
              className={`rounded-2xl border ${previewSpacing.shellPaddingClass} ${previewPreset.shellClass} ${previewPreset.textClass}`}
              data-spacing-density={previewData?.spacingDensity ?? spacingDensity}
            >
              <div className={previewSpacing.sectionGapClass || previewPreset.sectionGap}>
                <div className={`flex items-center justify-between ${previewPreset.metaClass}`}>
                  <span>Invoice Document</span>
                  <span>Preview</span>
                </div>

                <header className="space-y-5" data-header-layout={previewData?.headerLayout ?? "split"}>
                  {previewData?.logoUrl && previewData?.logoVisible !== false ? (
                    <div
                      className={`flex ${previewData?.headerLayout === "centered" ? "justify-center" : "items-center"}`}
                    >
                      <img
                        src={previewData.logoUrl}
                        alt="Company logo"
                        className="h-10 w-auto max-w-[160px] object-contain"
                      />
                    </div>
                  ) : null}
                  <div
                    className={`flex flex-wrap gap-4 ${
                      previewData?.headerLayout === "centered"
                        ? "flex-col items-center text-center"
                        : "items-start justify-between"
                    }`}
                  >
                    <div>
                  <h1 className={previewPreset.titleClass}>{documentTitle}</h1>
                      <p
                        className="mt-2 text-xs font-semibold uppercase tracking-[0.2em]"
                        style={{ color: previewAccent.text }}
                      >
                        NoteBill draft
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          {documentNumberLabel}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {previewInvoiceNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Date
                        </span>
                        <span className="font-semibold text-slate-900">{previewIssueDate}</span>
                      </div>
                    </div>
                  </div>
                </header>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>From</p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewFromDetails}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>
                      Bill To
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewBillToDetails}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className={`min-w-full text-left ${previewPreset.textClass}`}>
                      <thead className={previewPreset.tableHeadClass}>
                        <tr>
                          <th className="border-b border-slate-200 pb-2 pr-3">Description</th>
                          <th className="border-b border-slate-200 pb-2 pr-3">Qty</th>
                          <th className="border-b border-slate-200 pb-2 pr-3">Rate</th>
                          <th className="border-b border-slate-200 pb-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewItems.map((item) => (
                          <tr key={item.id} className="odd:bg-slate-50/70">
                            <td className="py-3 pr-3 align-top">
                              <p className="font-semibold text-slate-800">{item.description}</p>
                              {item.placeholder ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  Start by adding a line item in the editor.
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 pr-3 align-top text-sm text-slate-600">
                              {Number.isFinite(item.qty) ? item.qty : "—"}
                            </td>
                            <td className="py-3 pr-3 align-top text-sm text-slate-600">
                              {Number.isFinite(item.rate) ? formatPreviewMoney(item.rate) : "—"}
                            </td>
                            <td className="py-3 text-right align-top text-sm text-slate-600">
                              {Number.isFinite(item.amount) ? (
                                formatPreviewMoney(item.amount)
                              ) : item.placeholder ? (
                                "—"
                              ) : (
                                <span className="text-xs font-semibold text-amber-600">
                                  Needs value
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="flex justify-end">
                  <div
                    className={`w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 ${previewPreset.textClass}`}
                  >
                    <div className={`flex justify-between ${previewPreset.totalsMutedClass}`}>
                      <span>Subtotal</span>
                      <span>{formatPreviewMoney(previewSubtotal)}</span>
                    </div>
                    <div className={`flex justify-between ${previewPreset.totalsMutedClass}`}>
                      <span>Tax</span>
                      <span>{formatPreviewMoney(previewTaxAmount)}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${previewPreset.totalsStrongClass}`}>
                      <span>Total</span>
                      <span style={{ color: previewAccent.text }}>{formatPreviewMoney(previewTotal)}</span>
                    </div>
                  </div>
                </section>

                {previewData?.notesVisible !== false ? (
                  <section className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>
                      Notes / Terms
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="whitespace-pre-line">{previewNotes}</p>
                    </div>
                  </section>
                ) : null}
                {previewPaymentLink ? (
                  <section className="space-y-2">
                    <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>Pay online</p>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <a
                        href={previewPaymentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-semibold underline-offset-2 hover:underline"
                        style={{ color: previewAccent.text }}
                      >
                        {previewPaymentLink}
                      </a>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500">
              {previewIsSelected ? "Currently selected template." : "Preview only."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
                onClick={() => setPreviewTemplateId(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
                style={{
                  backgroundColor: previewAccent.primary,
                  borderColor: previewAccent.primary
                }}
                onClick={() => {
                  if (previewTemplateId) {
                    onStylePresetChange(previewTemplateId);
                  }
                  setPreviewTemplateId(null);
                }}
              >
                Use this template
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

  window.InvoiceManualInspector = {
    InspectorPanel
  };
})();
