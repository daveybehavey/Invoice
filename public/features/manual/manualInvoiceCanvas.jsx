(() => {
  const { useLocation, useNavigate, useSearchParams } = ReactRouterDOM;
  const { useEffect, useMemo, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
  const onboardingUtils = window.InvoiceOnboardingState;
  if (!onboardingUtils) {
    throw new Error(
      "Missing /utils/onboardingState.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const {
    buildStatus: buildOnboardingStatus,
    dismissWalkthrough: dismissOnboardingWalkthrough,
    markStep: markOnboardingStep,
    acknowledgeCompletion: acknowledgeOnboardingCompletion,
    subscribe: subscribeToOnboardingState
  } = onboardingUtils;

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const manualInspectorUtils = window.InvoiceManualInspector;
  if (!manualInspectorUtils) {
    throw new Error(
      "Missing /features/manual/inspectorPanel.jsx load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const brandThemeUtils = window.InvoiceBrandTheme;
  if (!brandThemeUtils) {
    throw new Error(
      "Missing /utils/brandTheme.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const styleCatalogUtils = window.InvoiceManualStyleCatalog;
  if (!styleCatalogUtils) {
    throw new Error(
      "Missing /utils/manualStyleCatalog.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const businessProfileUtils = window.InvoiceBusinessProfile;
  if (!businessProfileUtils) {
    throw new Error(
      "Missing /utils/businessProfile.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const logoImageUtils = window.InvoiceLogoImage;
  if (!logoImageUtils) {
    throw new Error(
      "Missing /utils/logoImage.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }

  const { polishLineItemDescription } = formatUtils;
  const { InspectorPanel } = manualInspectorUtils;
  const { DEFAULT_ACCENT_COLOR, normalizeAccentColor, buildAccentPalette } = brandThemeUtils;
  const { STYLE_PRESETS, SPACING_DENSITY_PRESETS } = styleCatalogUtils;
  const { getBusinessProfile, applyBusinessProfileToDraft } = businessProfileUtils;
  const { rememberClientDetails, getClientDefaultNotes, getClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary, rememberLineItems } = lineItemLibraryUtils;
  const { readLogoFileForStorage } = logoImageUtils;
  const manualDraftStorageUtils = window.InvoiceManualDraftStorage;
  if (!manualDraftStorageUtils) {
    throw new Error(
      "Missing /features/manual/manualDraftStorage.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const { resolveInitialDraftMeta } = manualDraftStorageUtils;
  const smartRateSuggestionUtils = window.InvoiceManualSmartRateSuggestions;
  if (!smartRateSuggestionUtils) {
    throw new Error(
      "Missing /features/manual/smartRateSuggestions.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const { rankSavedLineItems, buildLineRateSuggestionsByLineId } = smartRateSuggestionUtils;
  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/manual/manualInvoiceCanvas.jsx."
    );
  }
  const { readBillingNoticeFromUrl } = billingActions;
  const billieWorkspaceStorageKey = requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const readBillieWorkspaceInstruction = () => {
    try {
      const raw = window.localStorage.getItem(billieWorkspaceStorageKey);
      return typeof raw === "string" ? raw : "";
    } catch (_error) {
      return "";
    }
  };
  const writeBillieWorkspaceInstruction = (value) => {
    try {
      window.localStorage.setItem(billieWorkspaceStorageKey, value);
    } catch (_error) {
      // Best-effort only.
    }
  };
  const trackRevenueSignal = (event, source) => {
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source
      })
    }).catch(() => {});
  };

  const PAYMENT_TERM_QUICK_PICKS = [
    { id: "receipt", label: "Due on receipt", text: "Payment due on receipt.", dueInDays: 0 },
    { id: "net-7", label: "Net 7", text: "Payment due within 7 days.", dueInDays: 7 },
    { id: "net-14", label: "Net 14", text: "Payment due within 14 days.", dueInDays: 14 },
    { id: "net-30", label: "Net 30", text: "Payment due within 30 days.", dueInDays: 30 }
  ];
  const PAYMENT_TERM_LINE_PATTERN =
    /^(due on receipt|payment due|payment is due|please remit payment|net\s*\d+|payable within)/i;

  const DEPOSIT_PLAN_LINE_PATTERN =
    /^(deposit:|payment schedule:|milestone\s*\d+|balance due|progress payment|retainer:)/i;
  const RETAINER_PLAN_LINE_PATTERN =
    /^(retainer:|subscription:|monthly retainer|weekly retainer|on-call support)/i;
  const TRADE_TEMPLATE_LINE_PATTERN =
    /^(trade template:|plumbing scope:|electrical scope:|cleaning scope:|landscaping scope:|handyman scope:)/i;

  const applyStructuredNoteToNotes = (currentNotes, templateText, linePattern) => {
    const existingLines = String(currentNotes ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !linePattern.test(line));
    return [templateText, ...existingLines].join("\n");
  };

  const applyPaymentTermToNotes = (currentNotes, termText) => {
    return applyStructuredNoteToNotes(currentNotes, termText, PAYMENT_TERM_LINE_PATTERN);
  };

  const DEPOSIT_PLAN_QUICK_PICKS = [
    {
      id: "deposit-25",
      label: "25% deposit",
      text: "Deposit: 25% due before work begins.\nBalance due on completion."
    },
    {
      id: "deposit-50",
      label: "50% deposit",
      text: "Deposit: 50% due before work begins.\nBalance due on completion."
    },
    {
      id: "milestone-plan",
      label: "Milestone plan",
      text:
        "Payment schedule:\n- Milestone 1 due to begin\n- Milestone 2 due at midpoint\n- Balance due on completion."
    }
  ];

  const applyDepositPlanToNotes = (currentNotes, planText) => {
    return applyStructuredNoteToNotes(currentNotes, planText, DEPOSIT_PLAN_LINE_PATTERN);
  };

  const RETAINER_PLAN_QUICK_PICKS = [
    {
      id: "retainer-monthly",
      label: "Monthly retainer",
      text: "Retainer: Monthly service plan billed on the first business day of each month."
    },
    {
      id: "retainer-weekly",
      label: "Weekly retainer",
      text: "Retainer: Weekly support plan billed every Monday."
    },
    {
      id: "retainer-on-call",
      label: "On-call support",
      text: "Retainer: On-call support plan billed as a recurring monthly service."
    }
  ];

  const applyRetainerPlanToNotes = (currentNotes, planText) => {
    return applyStructuredNoteToNotes(currentNotes, planText, RETAINER_PLAN_LINE_PATTERN);
  };

  const TRADE_TEMPLATE_QUICK_PICKS = [
    {
      id: "trade-plumbing",
      label: "Plumbing",
      lineItem: "Plumbing service",
      text: "Trade template: Plumbing\nPlumbing scope: inspection, repair, fixture replacement, cleanup."
    },
    {
      id: "trade-electrical",
      label: "Electrical",
      lineItem: "Electrical service",
      text: "Trade template: Electrical\nElectrical scope: troubleshooting, repair, installation, cleanup."
    },
    {
      id: "trade-cleaning",
      label: "Cleaning",
      lineItem: "Cleaning service",
      text: "Trade template: Cleaning\nCleaning scope: rooms, surfaces, supplies, and final cleanup."
    },
    {
      id: "trade-landscaping",
      label: "Landscaping",
      lineItem: "Landscaping service",
      text: "Trade template: Landscaping\nLandscaping scope: trim, cleanup, hauling, and site finish."
    }
  ];

  const applyTradeTemplateToNotes = (currentNotes, templateText) => {
    return applyStructuredNoteToNotes(currentNotes, templateText, TRADE_TEMPLATE_LINE_PATTERN);
  };
  const PAYMENT_SCHEDULE_LINE_PATTERN =
    /^(deposit:|payment schedule:|milestone\s*\d+|balance due|progress payment)/i;
  const NOTE_MERGE_RULES = [
    { id: "payment_term", pattern: PAYMENT_TERM_LINE_PATTERN },
    { id: "payment_schedule", pattern: PAYMENT_SCHEDULE_LINE_PATTERN },
    { id: "retainer", pattern: RETAINER_PLAN_LINE_PATTERN },
    { id: "trade_template", pattern: TRADE_TEMPLATE_LINE_PATTERN }
  ];
  const normalizeNoteLine = (line) =>
    String(line ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const getStructuredNoteGroup = (line) => {
    const normalizedLine = String(line ?? "").trim();
    if (!normalizedLine) {
      return "";
    }
    const matchingRule = NOTE_MERGE_RULES.find(({ pattern }) => pattern.test(normalizedLine));
    return matchingRule?.id ?? "";
  };
  const appendSuggestedNotes = (currentNotes, suggestedNotes) => {
    const existing = typeof currentNotes === "string" ? currentNotes.trim() : "";
    const incoming = typeof suggestedNotes === "string" ? suggestedNotes.trim() : "";
    if (!incoming) {
      return existing;
    }
    if (!existing) {
      return incoming;
    }
    const normalizedExisting = existing.toLowerCase();
    const normalizedIncoming = incoming.toLowerCase();
    if (normalizedExisting === normalizedIncoming || normalizedExisting.includes(normalizedIncoming)) {
      return existing;
    }
    const incomingLines = incoming
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const incomingGroups = new Set(incomingLines.map(getStructuredNoteGroup).filter(Boolean));
    if (incomingGroups.size === 0) {
      return `${existing}\n\n${incoming}`;
    }
    const nextLines = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const group = getStructuredNoteGroup(line);
        return !group || !incomingGroups.has(group);
      });
    const seenLines = new Set(nextLines.map(normalizeNoteLine));
    incomingLines.forEach((line) => {
      const normalizedLine = normalizeNoteLine(line);
      if (!normalizedLine || seenLines.has(normalizedLine)) {
        return;
      }
      nextLines.push(line);
      seenLines.add(normalizedLine);
    });
    return nextLines.join("\n");
  };
  const addDaysToIsoDate = (dateValue, days) => {
    const baseDate = typeof dateValue === "string" && dateValue.trim() ? new Date(`${dateValue}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      return "";
    }
    baseDate.setDate(baseDate.getDate() + Math.max(0, Number(days) || 0));
    return baseDate.toISOString().slice(0, 10);
  };

  const formatElapsedHours = (startedAtMs, endedAtMs = Date.now()) => {
    if (!Number.isFinite(startedAtMs) || endedAtMs <= startedAtMs) {
      return "0";
    }
    const hours = Math.max(0.01, Math.round(((endedAtMs - startedAtMs) / 36e5) * 100) / 100);
    return String(hours);
  };

  const EMPTY_BILLIE_CHANGE_HIGHLIGHT = {
    lineItemIds: [],
    notes: false
  };

function ManualInvoiceCanvas() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
  const [onboardingStatus, setOnboardingStatus] = useState(() =>
    buildOnboardingStatus({ authSession: requestIdentity.getAuthSession?.() ?? null })
  );
  const [billingNotice, setBillingNotice] = useState(null);
  const [importedDraftNotice, setImportedDraftNotice] = useState("");
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const initialDraftMetaRef = useRef(
    resolveInitialDraftMeta({
      draftStorageKey,
      legacyDraftStorageKey
    })
  );
  const initialDraftMeta = initialDraftMetaRef.current;
  const initialDraft = initialDraftMeta?.draft ?? null;
  const initialBusinessProfileRef = useRef(getBusinessProfile());
  const initialBusinessProfile = initialBusinessProfileRef.current;
  const seededDraft = applyBusinessProfileToDraft(initialDraft ?? {}, initialBusinessProfile);
  const [invoiceNumber, setInvoiceNumber] = useState(() => initialDraft?.invoiceNumber ?? "INV-0001");
  const [invoiceDate, setInvoiceDate] = useState(() => initialDraft?.invoiceDate ?? "");
  const [dueDate, setDueDate] = useState(() => initialDraft?.dueDate ?? "");
  const [fromDetails, setFromDetails] = useState(
    () => initialDraft?.fromDetails ?? seededDraft?.fromDetails ?? ""
  );
  const [billToDetails, setBillToDetails] = useState(() => initialDraft?.billToDetails ?? "");
  const [notes, setNotes] = useState(() => initialDraft?.notes ?? "");
  const [paymentLinkUrl, setPaymentLinkUrl] = useState(() => initialDraft?.paymentLinkUrl ?? "");
  const [taxRate, setTaxRate] = useState(() => initialDraft?.taxRate ?? "0");
  const [discountAmount, setDiscountAmount] = useState(() =>
    initialDraft?.discountAmount === undefined ? "0" : String(initialDraft.discountAmount)
  );
  const [lineItems, setLineItems] = useState(() =>
    Array.isArray(initialDraft?.lineItems) && initialDraft.lineItems.length > 0
      ? initialDraft.lineItems
      : [{ id: "line-1", description: "", qty: "", rate: "" }]
  );
  const [logoUrl, setLogoUrl] = useState(() => initialDraft?.logoUrl ?? seededDraft?.logoUrl ?? null);
  const [logoVisible, setLogoVisible] = useState(() => initialDraft?.logoVisible ?? true);
  const [notesVisible, setNotesVisible] = useState(() => initialDraft?.notesVisible ?? true);
  const [headerLayout, setHeaderLayout] = useState(() => initialDraft?.headerLayout ?? "split");
  const [spacingDensity, setSpacingDensity] = useState(() => initialDraft?.spacingDensity ?? "balanced");
  const [stylePreset, setStylePreset] = useState(
    () => initialDraft?.stylePreset ?? seededDraft?.stylePreset ?? "default"
  );
  const [accentColor, setAccentColor] = useState(() =>
    normalizeAccentColor(initialDraft?.accentColor ?? seededDraft?.accentColor ?? DEFAULT_ACCENT_COLOR)
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState(() =>
    searchParams.get("tab") === "assistant" ? "assistant" : "style"
  );
  const [draftStatus, setDraftStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNeedsAuth, setSaveNeedsAuth] = useState(false);
  const [saveAuthRequiredPolicy, setSaveAuthRequiredPolicy] = useState(false);
  const [saveAuthProviders, setSaveAuthProviders] = useState([]);
  const [accountPlan, setAccountPlan] = useState(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState(() => initialDraft?.savedInvoiceId ?? "");
  const [savedInvoiceStatus, setSavedInvoiceStatus] = useState(
    () => initialDraft?.savedInvoiceStatus ?? (initialDraft?.savedInvoiceId ? "draft" : "")
  );
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState("");
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState("");
  const [portalAccessToken, setPortalAccessToken] = useState(() => initialDraft?.portalAccessToken ?? "");
  const [clientPortalBusy, setClientPortalBusy] = useState(false);
  const [clientPortalError, setClientPortalError] = useState("");
  const [assistantCommandRequest, setAssistantCommandRequest] = useState(null);
  const [billieWorkspaceInstruction, setBillieWorkspaceInstruction] = useState(() => readBillieWorkspaceInstruction());
  const [billieWorkspaceError, setBillieWorkspaceError] = useState("");
  const [timeCaptureDescription, setTimeCaptureDescription] = useState(
    () => initialDraft?.timeCapture?.description ?? ""
  );
  const [timeCaptureRate, setTimeCaptureRate] = useState(() => initialDraft?.timeCapture?.rate ?? "");
  const [timeCaptureStartedAt, setTimeCaptureStartedAt] = useState(() =>
    Number.isFinite(initialDraft?.timeCapture?.startedAt) ? initialDraft.timeCapture.startedAt : null
  );
  const [timeCaptureStatus, setTimeCaptureStatus] = useState(
    () => initialDraft?.timeCapture?.status ?? ""
  );
  const [receiptCaptureBusy, setReceiptCaptureBusy] = useState(false);
  const [receiptCaptureError, setReceiptCaptureError] = useState("");
  const [receiptCaptureNotice, setReceiptCaptureNotice] = useState("");
  const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
  const [voiceNoteError, setVoiceNoteError] = useState("");
  const [voiceNoteNotice, setVoiceNoteNotice] = useState("");
  const refreshOnboardingStatus = (sessionOverride) => {
    setOnboardingStatus(
      buildOnboardingStatus({
        authSession: sessionOverride ?? requestIdentity.getAuthSession?.() ?? authSession ?? null
      })
    );
  };
  const completeOnboardingStep = (stepId) => {
    markOnboardingStep(stepId);
    refreshOnboardingStatus();
  };
  const [sharePackBusy, setSharePackBusy] = useState(false);
  const [sharePackNotice, setSharePackNotice] = useState("");
  const [sharePackPreview, setSharePackPreview] = useState("");
  const receiptCaptureInputRef = useRef(null);
  const voiceNoteInputRef = useRef(null);
  const [assistantWorkspaceRuntime, setAssistantWorkspaceRuntime] = useState({
    loading: false,
    status: "",
    error: "",
    latestMessage: "",
    hasPendingEdit: false,
    canUndo: false,
    changePreviewCount: 0,
    changeSummary: "",
    timingSummary: ""
  });
  const [billieChangeHighlight, setBillieChangeHighlight] = useState(EMPTY_BILLIE_CHANGE_HIGHLIGHT);
  const emailLinkSaveProvider = Array.isArray(saveAuthProviders)
    ? saveAuthProviders.find((provider) => provider?.id === "email_link")
    : null;
  const saveAuthHint = emailLinkSaveProvider?.available
    ? "Use launcher sign-in to send yourself an email link, then retry save here."
    : emailLinkSaveProvider?.warning || "Use launcher sign-in, then retry save here.";

  useEffect(() => {
    if (searchParams.get("source") === "import") {
      setImportedDraftNotice("Imported draft ready for Billie review.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("tab") === "assistant") {
      setActiveInspectorTab((current) => (current === "assistant" ? current : "assistant"));
      setInspectorOpen(true);
    }
  }, [searchParams]);
  const [savedLineItemLibrary, setSavedLineItemLibrary] = useState(() => getLineItemLibrary());
  const [clientMemoryList, setClientMemoryList] = useState(() => getClientMemory());
  const [recentClientContext, setRecentClientContext] = useState([]);
  const [showSavedLineItems, setShowSavedLineItems] = useState(false);
  const clientPortalUrl =
    savedInvoiceId && portalAccessToken
      ? `${window.location.origin}/portal/${savedInvoiceId}/${encodeURIComponent(portalAccessToken)}`
      : "";
  const saveTimeoutRef = useRef(null);
  const clearStatusTimeoutRef = useRef(null);
  const billieChangeHighlightTimeoutRef = useRef(null);
  const draftStatusLabel = "Draft restored";
  const rankedSavedLineItems = useMemo(
    () =>
      rankSavedLineItems({
        billToDetails,
        lineItems,
        savedLineItemLibrary
      }),
    [billToDetails, lineItems, savedLineItemLibrary]
  );
  const clientMemoryItems = useMemo(
    () => rankedSavedLineItems.filter(({ clientMatch }) => clientMatch).slice(0, 3),
    [rankedSavedLineItems]
  );
  const lineRateSuggestionsByLineId = useMemo(
    () =>
      buildLineRateSuggestionsByLineId({
        billToDetails,
        lineItems,
        savedLineItemLibrary
      }),
    [billToDetails, lineItems, savedLineItemLibrary]
  );
  const recommendedSavedLineItems = useMemo(
    () =>
      rankedSavedLineItems
        .filter(({ clientMatch, serviceMatchScore }) => clientMatch || serviceMatchScore > 0)
        .slice(0, 3),
    [rankedSavedLineItems]
  );
  const highlightedLineItemIds = useMemo(
    () => new Set(billieChangeHighlight.lineItemIds),
    [billieChangeHighlight.lineItemIds]
  );

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    writeBillieWorkspaceInstruction(billieWorkspaceInstruction);
  }, [billieWorkspaceInstruction]);

  useEffect(
    () => () => {
      if (billieChangeHighlightTimeoutRef.current) {
        window.clearTimeout(billieChangeHighlightTimeoutRef.current);
      }
    },
    []
  );

  const activePreset = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.default;
  const activeSpacing = SPACING_DENSITY_PRESETS[spacingDensity] ?? SPACING_DENSITY_PRESETS.balanced;

  const parseNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatMoney = (value) => `$${value.toFixed(2)}`;
  const triggerBillieChangeHighlight = ({ lineItemIds = [], notes: highlightNotes = false }) => {
    if (billieChangeHighlightTimeoutRef.current) {
      window.clearTimeout(billieChangeHighlightTimeoutRef.current);
    }
    if (!lineItemIds.length && !highlightNotes) {
      setBillieChangeHighlight(EMPTY_BILLIE_CHANGE_HIGHLIGHT);
      billieChangeHighlightTimeoutRef.current = null;
      return;
    }
    setBillieChangeHighlight({
      lineItemIds,
      notes: highlightNotes
    });
    billieChangeHighlightTimeoutRef.current = window.setTimeout(() => {
      setBillieChangeHighlight(EMPTY_BILLIE_CHANGE_HIGHLIGHT);
      billieChangeHighlightTimeoutRef.current = null;
    }, 1800);
  };
  const formatSavedRateContext = (suggestion) => {
    if (!suggestion || !Number.isFinite(suggestion.rate)) {
      return "";
    }
    const rateLabel = `$${suggestion.rate.toFixed(2)}/hr`;
    const clientName =
      typeof suggestion.clientName === "string" ? suggestion.clientName.trim() : "";
    const serviceDescription =
      typeof suggestion.description === "string" ? suggestion.description.trim() : "";
    const qtyLabel =
      suggestion.qty === null || suggestion.qty === undefined || suggestion.qty === ""
        ? ""
        : `, qty ${suggestion.qty}`;
    if (suggestion.clientMatch && clientName) {
      return serviceDescription
        ? `Last time you billed ${clientName} for ${serviceDescription}, the rate was ${rateLabel}${qtyLabel}.`
        : `Last time you billed ${clientName}, the rate was ${rateLabel}${qtyLabel}.`;
    }
    return serviceDescription
      ? `Similar saved service ${serviceDescription} used ${rateLabel}${qtyLabel}.`
      : `Similar saved service used ${rateLabel}${qtyLabel}.`;
  };
  const getPrimaryBillToName = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.split("\n")[0]?.trim() ?? "";
  };
  const formatSavedItemUsage = (value) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 1) {
      return "Used before";
    }
    return `Used ${parsed} times`;
  };
  const formatRecurringCadence = (intervalDays) => {
    const parsed = Number(intervalDays);
    if (!Number.isFinite(parsed)) {
      return "";
    }
    const rounded = Math.round(parsed);
    if (rounded === 7) return "weekly";
    if (rounded === 14) return "biweekly";
    if (rounded === 30) return "monthly";
    return `${rounded}-day`;
  };
  const formatClientMemoryHints = (entry) =>
    [
      entry?.recipientEmail ? "email" : "",
      entry?.defaultNotes ? "note" : "",
      entry?.recurringIntervalDays ? formatRecurringCadence(entry.recurringIntervalDays) : ""
    ]
      .filter(Boolean)
      .join(", ");
  const getClientMemorySuggestionPriority = (entry, searchTerm) => {
    if (!entry?.details || !entry?.name) {
      return -1;
    }
    const needle = String(searchTerm ?? "").trim().toLowerCase();
    const name = String(entry.name ?? "").trim().toLowerCase();
    const details = String(entry.details ?? "").trim().toLowerCase();
    if (!needle) {
      return 100;
    }
    if (name === needle || details === needle) {
      return 500;
    }
    if (name.startsWith(needle) || details.startsWith(needle)) {
      return 400;
    }
    if (name.includes(needle) || details.includes(needle)) {
      return 300;
    }
    return -1;
  };

  const getLineAmount = (item) => parseNumber(item.qty) * parseNumber(item.rate);
  const subtotal = lineItems.reduce((sum, item) => sum + getLineAmount(item), 0);
  const effectiveDiscountAmount = Math.min(subtotal, Math.max(0, parseNumber(discountAmount)));
  const discountedSubtotal = Math.max(0, subtotal - effectiveDiscountAmount);
  const taxAmount = discountedSubtotal * (parseNumber(taxRate) / 100);
  const total = discountedSubtotal + taxAmount;
  const previewData = {
    invoiceNumber,
    invoiceDate,
    dueDate,
    fromDetails,
    billToDetails,
    notes,
    paymentLinkUrl,
    taxRate,
    discountAmount: effectiveDiscountAmount,
    subtotal,
    taxAmount,
    total,
    lineItems,
    logoUrl,
    logoVisible,
    notesVisible,
    headerLayout,
    spacingDensity,
    accentColor
  };

  const accent = buildAccentPalette(accentColor);
  const accentButtonStyle = {
    backgroundColor: accent.primary,
    borderColor: accent.primary,
    color: "#ffffff"
  };
  const accentGhostButtonStyle = {
    backgroundColor: accent.soft,
    borderColor: accent.border,
    color: accent.primary
  };
  const primaryBillToName = getPrimaryBillToName(billToDetails);
  const clientDefaultNotes = getClientDefaultNotes(primaryBillToName);
  const normalizedBillToSearch = primaryBillToName.toLocaleLowerCase();
  const currentServiceMemoryCandidate = lineItems.find(
    (item) => `${item?.description ?? ""}`.trim() && `${item?.rate ?? ""}`.trim()
  );
  const timerRateSuggestion =
    timeCaptureRate.trim() ||
    (currentServiceMemoryCandidate?.rate ? String(currentServiceMemoryCandidate.rate) : "");
  const isTimeCaptureRunning = Number.isFinite(timeCaptureStartedAt);
  const elapsedTimeCaptureLabel = isTimeCaptureRunning
    ? `${formatElapsedHours(timeCaptureStartedAt)}h running`
    : "";
  const clientMemorySuggestions = clientMemoryList
    .map((entry) => ({
      entry,
      priority: getClientMemorySuggestionPriority(entry, normalizedBillToSearch)
    }))
    .filter(({ priority, entry }) => priority >= 0 && entry.details !== billToDetails.trim())
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.entry.updatedAt.localeCompare(left.entry.updatedAt);
    })
    .slice(0, 4);
  const noteSuggestions = useMemo(() => {
    const currentNotes = typeof notes === "string" ? notes.trim().toLowerCase() : "";
    const seenNoteTexts = new Set();
    const suggestions = [];
    const rememberSuggestion = (suggestion) => {
      const normalizedText =
        typeof suggestion?.text === "string" ? suggestion.text.trim().toLowerCase() : "";
      if (!normalizedText || normalizedText === currentNotes || seenNoteTexts.has(normalizedText)) {
        return;
      }
      seenNoteTexts.add(normalizedText);
      suggestions.push({
        id: suggestion.id,
        title: suggestion.title,
        source: suggestion.source,
        actionLabel: suggestion.actionLabel,
        appliedMessage: suggestion.appliedMessage,
        appendedMessage: suggestion.appendedMessage,
        text: suggestion.text.trim()
      });
    };
    if (clientDefaultNotes) {
      rememberSuggestion({
        id: "client-memory-note",
        title: "Saved client note",
        source: "Saved in client memory",
        actionLabel: "Use saved client note",
        appliedMessage: "Applied saved client note",
        appendedMessage: "Added saved client note",
        text: clientDefaultNotes
      });
    }
    recentClientContext.forEach((entry, index) => {
      const noteText = typeof entry?.notes === "string" ? entry.notes.trim() : "";
      if (!noteText) {
        return;
      }
      const invoiceNumber =
        typeof entry?.invoiceNumber === "string" ? entry.invoiceNumber.trim() : "";
      rememberSuggestion({
        id: entry?.invoiceId ? `recent-note-${entry.invoiceId}` : `recent-note-${index}`,
        title: invoiceNumber ? `Recent note from ${invoiceNumber}` : "Recent invoice note",
        source: invoiceNumber ? `Recent invoice ${invoiceNumber}` : "Recent invoice",
        actionLabel: invoiceNumber ? `Use note from ${invoiceNumber}` : "Use recent invoice note",
        appliedMessage: invoiceNumber ? `Applied note from ${invoiceNumber}` : "Applied recent invoice note",
        appendedMessage: invoiceNumber ? `Added note from ${invoiceNumber}` : "Added recent invoice note",
        text: noteText
      });
    });
    return suggestions;
  }, [clientDefaultNotes, notes, recentClientContext]);
  const hasNoteSuggestions = noteSuggestions.length > 0;

  useEffect(() => {
    if (!primaryBillToName) {
      setRecentClientContext([]);
      return undefined;
    }
    const abortController = new AbortController();
    setRecentClientContext([]);
    apiFetch(
      `/api/invoices/recent-context?client=${encodeURIComponent(primaryBillToName)}&limit=3`,
      { signal: abortController.signal }
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load recent client context.");
        }
        setRecentClientContext(Array.isArray(payload?.matches) ? payload.matches : []);
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }
        setRecentClientContext([]);
      });
    return () => abortController.abort();
  }, [authSession?.userId, primaryBillToName]);

  const handleLineItemChange = (id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };
  const handleUpdateLineItemValues = (id, updates) => {
    if (!id || !updates) {
      return;
    }
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return {
          ...item,
          ...(updates.qty !== undefined ? { qty: updates.qty } : {}),
          ...(updates.rate !== undefined ? { rate: updates.rate } : {})
        };
      })
    );
  };

  const handleStartTimeCapture = () => {
    if (isTimeCaptureRunning) {
      return;
    }
    if (!timeCaptureRate.trim() && timerRateSuggestion) {
      setTimeCaptureRate(timerRateSuggestion);
    }
    setTimeCaptureStartedAt(Date.now());
    setTimeCaptureStatus("Timer started");
    if (clearStatusTimeoutRef.current) {
      window.clearTimeout(clearStatusTimeoutRef.current);
    }
    clearStatusTimeoutRef.current = window.setTimeout(() => {
      setTimeCaptureStatus("");
    }, 1800);
  };

  const handleStopTimeCapture = () => {
    if (!isTimeCaptureRunning) {
      return;
    }
    const description = timeCaptureDescription.trim() || "Billable time";
    const qty = formatElapsedHours(timeCaptureStartedAt);
    const nextRate = timerRateSuggestion.trim();
    setLineItems((prev) => [
      {
        id: `line-${Date.now()}`,
        description,
        qty,
        rate: nextRate
      },
      ...prev
    ]);
    setTimeCaptureStartedAt(null);
    setTimedDraftStatus(`Added ${qty}h time entry`);
  };

  const handleResetTimeCapture = () => {
    setTimeCaptureStartedAt(null);
    setTimeCaptureDescription("");
    setTimeCaptureRate("");
    setTimeCaptureStatus("");
  };

  const handleReceiptCaptureUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    setReceiptCaptureBusy(true);
    setReceiptCaptureError("");
    try {
      const formData = new FormData();
      formData.append("invoiceFile", file);
      const response = await apiFetch("/api/invoices/extract-notes", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not extract receipt text.");
      }
      const extractedText =
        typeof payload?.extractedText === "string" ? payload.extractedText.trim() : "";
      if (!extractedText) {
        throw new Error("No readable receipt text found.");
      }
      const receiptText = `Expense receipt: ${file.name}\n${extractedText}`;
      setNotes((current) => {
        const existing = current.trim();
        return existing ? `${existing}\n\n${receiptText}` : receiptText;
      });
      setNotesVisible(true);
      setReceiptCaptureNotice(`Added receipt from ${file.name}. Review it, then save the invoice.`);
    } catch (error) {
      setReceiptCaptureError(error?.message || "Could not extract receipt text.");
    } finally {
      setReceiptCaptureBusy(false);
      if (event?.target) {
        event.target.value = "";
      }
    }
  };

  const handleVoiceNoteUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    setVoiceNoteBusy(true);
    setVoiceNoteError("");
    try {
      const formData = new FormData();
      formData.append("audioFile", file);
      const response = await apiFetch("/api/invoices/transcribe-audio", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not transcribe that voice note.");
      }
      const transcript =
        typeof payload?.extractedText === "string" ? payload.extractedText.trim() : "";
      if (!transcript) {
        throw new Error("No transcript returned for that voice note.");
      }
      setNotes((current) => {
        const existing = current.trim();
        return existing ? `${existing}\n\n${transcript}` : transcript;
      });
      setNotesVisible(true);
      setVoiceNoteNotice(`Added transcript from ${file.name}. Review it, then save the invoice.`);
      setTimedDraftStatus(`Added voice note from ${file.name}`);
      trackRevenueSignal("manual_voice_note_transcribed", "manual_voice_upload");
    } catch (error) {
      setVoiceNoteError(error?.message || "Could not transcribe that voice note.");
    } finally {
      setVoiceNoteBusy(false);
      if (event?.target) {
        event.target.value = "";
      }
    }
  };

  const buildSharePackText = () => {
    const editableResult = buildEditableInvoicePayload();
    if (editableResult.error) {
      return "";
    }
    const invoice = editableResult.invoice;
    const shareLines = [
      `Invoice ${invoice.invoiceNumber || "Draft"}`,
      invoice.customerName ? `Client: ${invoice.customerName}` : "",
      `Total: ${formatMoney(invoice.total ?? 0)}`,
      invoice.dueDate ? `Due date: ${invoice.dueDate}` : "",
      invoice.paymentLinkUrl ? `Payment link: ${invoice.paymentLinkUrl}` : "",
      invoice.portalAccessToken ? `Client portal: ${window.location.origin}/portal/${savedInvoiceId}/${encodeURIComponent(invoice.portalAccessToken)}` : "",
      invoice.notes ? `Notes: ${invoice.notes}` : ""
    ].filter(Boolean);
    return shareLines.join("\n");
  };

  const handleCopySharePack = async () => {
    const sharePackText = buildSharePackText();
    if (!sharePackText) {
      setSaveError("Add a line item before copying a share pack.");
      return;
    }
    setSharePackBusy(true);
    setSharePackNotice("");
    try {
      setSharePackPreview(sharePackText);
      void navigator.clipboard?.writeText?.(sharePackText).catch(() => {});
      setSharePackNotice("Share pack copied. Paste it into email or chat.");
      setTimedDraftStatus("Copied share pack");
    } catch (error) {
      setSharePackNotice(error?.message || "Could not copy the share pack.");
    } finally {
      setSharePackBusy(false);
    }
  };

  const handleLineItemDescriptionBlur = (id) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const polished = polishLineItemDescription(item.description);
        if (!polished || polished === item.description) {
          return item;
        }
        return { ...item, description: polished };
      })
    );
  };

  const handlePolishDescriptions = () => {
    const nextLineItems = lineItems.map((item) => {
      const polished = polishLineItemDescription(item.description);
      if (!polished) {
        return item;
      }
      return { ...item, description: polished };
    });
    const changedCount = nextLineItems.reduce((count, item, index) => {
      return item.description !== lineItems[index]?.description ? count + 1 : count;
    }, 0);
    if (changedCount > 0) {
      setLineItems(nextLineItems);
      setDraftStatus(`Polished ${changedCount} line item${changedCount > 1 ? "s" : ""}`);
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 1800);
    }
    return changedCount;
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: `line-${Date.now()}`, description: "", qty: "", rate: "" }
    ]);
  };

  const setTimedDraftStatus = (message) => {
    setDraftStatus(message);
    if (clearStatusTimeoutRef.current) {
      window.clearTimeout(clearStatusTimeoutRef.current);
    }
    clearStatusTimeoutRef.current = window.setTimeout(() => {
      setDraftStatus("");
    }, 1800);
  };

  const handleInsertSavedLineItem = (entry) => {
    if (!entry?.description) {
      return;
    }
    const nextLineItem = {
      id: `line-${Date.now()}`,
      description: entry.description,
      qty: entry.qty ?? "",
      rate: entry.rate ?? ""
    };
    setLineItems((prev) => {
      const emptyIndex = prev.findIndex(
        (item) => !item.description.trim() && item.qty === "" && item.rate === ""
      );
      if (emptyIndex === -1) {
        return [...prev, nextLineItem];
      }
      return prev.map((item, index) => (index === emptyIndex ? nextLineItem : item));
    });
    setTimedDraftStatus(`Inserted saved item: ${entry.description}`);
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "service_memory_reused",
        source: "manual_saved_item_reuse"
      })
    }).catch(() => {});
  };

  const handleRememberCurrentLineItem = (item) => {
    const normalizedDescription = `${item?.description ?? ""}`.trim();
    if (!normalizedDescription) {
      return;
    }
    const nextLineItemLibrary = rememberLineItems(
      [
        {
          description: normalizedDescription,
          qty: item?.qty ?? "",
          rate: item?.rate ?? ""
        }
      ],
      {
        clientName: billToDetails
      }
    );
    setSavedLineItemLibrary(nextLineItemLibrary);
    setTimedDraftStatus(`Saved service memory for ${normalizedDescription}`);
    trackRevenueSignal("service_memory_saved", "manual_current_line_save");
  };

  const handleApplySuggestedRate = (lineId, suggestion) => {
    if (!lineId || !suggestion || !Number.isFinite(suggestion.rate)) {
      return;
    }
    handleLineItemChange(lineId, "rate", String(suggestion.rate));
    const matchLabel = suggestion.clientMatch ? "client match" : "service match";
    const confidenceLabel = suggestion.confidence ? `, ${suggestion.confidence} confidence` : "";
    setTimedDraftStatus(
      `Applied suggested rate $${suggestion.rate.toFixed(2)}/hr (${matchLabel}${confidenceLabel})`
    );
  };
  const handleApplyNoteSuggestion = (suggestion) => {
    const nextNotes = typeof suggestion?.text === "string" ? suggestion.text.trim() : "";
    if (!nextNotes) {
      return;
    }
    const currentNotes = typeof notes === "string" ? notes.trim() : "";
    if (currentNotes === nextNotes) {
      setTimedDraftStatus("Saved note already matches current notes");
      return;
    }
    setNotes(nextNotes);
    setNotesVisible(true);
    triggerBillieChangeHighlight({ notes: true });
    setTimedDraftStatus(suggestion.appliedMessage || "Applied saved note");
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: suggestion.id === "client-memory-note" ? "client_memory_reused" : "recent_note_reused",
        source: suggestion.id === "client-memory-note" ? "manual_client_note_reuse" : "manual_recent_note_reuse"
      })
    }).catch(() => {});
  };
  const handleAppendNoteSuggestion = (suggestion) => {
    const incomingNotes = typeof suggestion?.text === "string" ? suggestion.text.trim() : "";
    if (!incomingNotes) {
      return;
    }
    const currentNotes = typeof notes === "string" ? notes.trim() : "";
    const mergedNotes = appendSuggestedNotes(currentNotes, incomingNotes);
    if (mergedNotes === currentNotes) {
      setTimedDraftStatus("That note is already included");
      return;
    }
    setNotes(mergedNotes);
    setNotesVisible(true);
    triggerBillieChangeHighlight({ notes: true });
    setTimedDraftStatus(suggestion.appendedMessage || "Added saved note");
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: suggestion.id === "client-memory-note" ? "client_memory_reused" : "recent_note_reused",
        source:
          suggestion.id === "client-memory-note"
            ? "manual_client_note_append"
            : "manual_recent_note_append"
      })
    }).catch(() => {});
  };
  const handleApplyPaymentTerm = (term) => {
    if (!term?.text) {
      return;
    }
    setNotes((current) => applyPaymentTermToNotes(current, term.text));
    setDueDate(addDaysToIsoDate(invoiceDate, term.dueInDays));
    setNotesVisible(true);
    setTimedDraftStatus(`${term.label} terms applied`);
  };
  const handleApplyDepositPlan = (plan) => {
    if (!plan?.text) {
      return;
    }
    setNotes((current) => applyDepositPlanToNotes(current, plan.text));
    setNotesVisible(true);
    setTimedDraftStatus(`${plan.label} applied`);
    trackRevenueSignal("deposit_plan_applied", "manual_deposit_plan_quick_pick");
  };
  const handleApplyRetainerPlan = (plan) => {
    if (!plan?.text) {
      return;
    }
    setNotes((current) => applyRetainerPlanToNotes(current, plan.text));
    setNotesVisible(true);
    setTimedDraftStatus(`${plan.label} applied`);
    trackRevenueSignal("retainer_plan_applied", "manual_retainer_plan_quick_pick");
  };
  const handleApplyTradeTemplate = (template) => {
    if (!template?.text) {
      return;
    }
    setNotes((current) => applyTradeTemplateToNotes(current, template.text));
    setLineItems((prev) => {
      const next = prev.map((item) => ({ ...item }));
      const emptyIndex = next.findIndex(
        (item) => !item.description.trim() && item.qty === "" && item.rate === ""
      );
      if (emptyIndex === -1) {
        return next;
      }
      next[emptyIndex] = {
        ...next[emptyIndex],
        description: template.lineItem || next[emptyIndex].description
      };
      return next;
    });
    setNotesVisible(true);
    setTimedDraftStatus(`${template.label} template applied`);
    trackRevenueSignal("trade_template_applied", "manual_trade_template_quick_pick");
  };
  const handleApplyClientMemory = (entry) => {
    if (!entry?.details) {
      return;
    }
    setBillToDetails(entry.details);
    setTimedDraftStatus(`Applied client details for ${entry.name || "saved client"}`);
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_memory_reused",
        source: "manual_client_details_reuse"
      })
    }).catch(() => {});
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const result = await readLogoFileForStorage(file);
      setLogoUrl(result.dataUrl);
      setLogoVisible(true);
      setSaveError("");
      if (result.convertedFromSvg) {
        setDraftStatus("SVG logo converted to PNG for PDF compatibility");
        if (clearStatusTimeoutRef.current) {
          window.clearTimeout(clearStatusTimeoutRef.current);
        }
        clearStatusTimeoutRef.current = window.setTimeout(() => {
          setDraftStatus("");
        }, 1800);
      }
    } catch (_error) {
      setSaveError("Couldn't read that logo file.");
    }
    event.target.value = "";
  };

  const handleLogoRemove = () => {
    setLogoUrl(null);
    setLogoVisible(true);
  };

  const handleAccentColorChange = (nextColor) => {
    setAccentColor(normalizeAccentColor(nextColor));
  };

  const buildRewriteInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before rewriting." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      dueDate: dueDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: polishLineItemDescription(item.description),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      paymentLinkUrl: paymentLinkUrl?.trim() || undefined,
      portalAccessToken: portalAccessToken?.trim() || undefined,
      discountAmount: effectiveDiscountAmount,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
  };

  const buildEditableInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before using Edit with Billie." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      dueDate: dueDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: polishLineItemDescription(item.description),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      paymentLinkUrl: paymentLinkUrl?.trim() || undefined,
      portalAccessToken: portalAccessToken?.trim() || undefined,
      discountAmount: effectiveDiscountAmount,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
  };

  const buildPdfExportPayload = () => {
    const editableResult = buildEditableInvoicePayload();
    if (editableResult.error) {
      return { error: "Add at least one line item description before downloading PDF." };
    }
    return {
      payload: {
        invoice: editableResult.invoice,
        fromDetails: fromDetails?.trim() || undefined,
        billToDetails: billToDetails?.trim() || undefined,
        accentColor,
        stylePreset,
        logoUrl: logoUrl ?? undefined,
        logoVisible,
        notesVisible,
        headerLayout,
        spacingDensity
      }
    };
  };

  const applyAiEdit = (updatedInvoice) => {
    if (!updatedInvoice) {
      return;
    }
    if (updatedInvoice.invoiceNumber !== undefined) {
      setInvoiceNumber(updatedInvoice.invoiceNumber ?? "");
    }
    if (updatedInvoice.issueDate !== undefined) {
      setInvoiceDate(updatedInvoice.issueDate ?? "");
    }
    if (updatedInvoice.dueDate !== undefined) {
      setDueDate(updatedInvoice.dueDate ?? "");
    }
    if (updatedInvoice.customerName !== undefined) {
      setBillToDetails(updatedInvoice.customerName ?? "");
    }
    if (updatedInvoice.notes !== undefined) {
      setNotes(updatedInvoice.notes ?? "");
    }
    if (updatedInvoice.paymentLinkUrl !== undefined) {
      setPaymentLinkUrl(updatedInvoice.paymentLinkUrl ?? "");
    }
    if (updatedInvoice.portalAccessToken !== undefined) {
      setPortalAccessToken(updatedInvoice.portalAccessToken ?? "");
    }
    if (updatedInvoice.discountAmount !== undefined) {
      setDiscountAmount(String(updatedInvoice.discountAmount ?? 0));
    }
    if (Array.isArray(updatedInvoice.lineItems) && updatedInvoice.lineItems.length > 0) {
      setLineItems(
        updatedInvoice.lineItems.map((item, index) => ({
          id: item.id ?? `line-${Date.now()}-${index}`,
          description: polishLineItemDescription(item.description ?? ""),
          qty: Number.isFinite(item.quantity) ? String(item.quantity) : "",
          rate: Number.isFinite(item.unitPrice) ? String(item.unitPrice) : ""
        }))
      );
    }
  };

  const applyRewriteChanges = ({ lineItems: rewrittenLines, notes: rewrittenNotes, mode }) => {
    const changedLineItemIds = [];
    if (Array.isArray(rewrittenLines) && rewrittenLines.length > 0) {
      const nextLineItems = lineItems.map((item, index) => {
        const match =
          rewrittenLines.find((line) => line.id && line.id === item.id) ?? rewrittenLines[index];
        if (match && typeof match.description === "string") {
          const nextDescription = polishLineItemDescription(match.description);
          if (nextDescription !== item.description) {
            changedLineItemIds.push(item.id);
            return { ...item, description: nextDescription };
          }
        }
        return item;
      });
      if (changedLineItemIds.length > 0) {
        setLineItems(nextLineItems);
      }
    }
    const notesChanged =
      (mode === "full" || mode === "notes") &&
      typeof rewrittenNotes === "string" &&
      rewrittenNotes !== notes;
    if (notesChanged) {
      setNotes(rewrittenNotes);
    }
    if (changedLineItemIds.length > 0 || notesChanged) {
      triggerBillieChangeHighlight({
        lineItemIds: changedLineItemIds,
        notes: notesChanged
      });
    }
  };

  const persistDraft = () => {
    const payload = {
      invoiceNumber,
      invoiceDate,
      dueDate,
      fromDetails,
      billToDetails,
      notes,
      paymentLinkUrl,
      portalAccessToken,
      taxRate,
      discountAmount,
      lineItems,
      logoUrl,
      logoVisible,
      notesVisible,
      headerLayout,
      spacingDensity,
      stylePreset,
      accentColor,
      timeCapture: {
        description: timeCaptureDescription,
        rate: timeCaptureRate,
        startedAt: timeCaptureStartedAt,
        status: timeCaptureStatus
      },
      savedInvoiceId,
      savedInvoiceStatus
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  };

  useEffect(() => {
    if (initialDraft) {
      setDraftStatus(draftStatusLabel);
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 2000);
    }
  }, [initialDraft, draftStatusLabel]);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      persistDraft();
      setDraftStatus("Draft saved");
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 1500);
    }, 500);
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    invoiceNumber,
    invoiceDate,
    dueDate,
    fromDetails,
    billToDetails,
    notes,
    paymentLinkUrl,
    taxRate,
    discountAmount,
    lineItems,
    logoUrl,
    logoVisible,
    notesVisible,
    headerLayout,
    spacingDensity,
    stylePreset,
    accentColor,
    timeCaptureDescription,
    timeCaptureRate,
    timeCaptureStartedAt,
    timeCaptureStatus,
    savedInvoiceId,
    savedInvoiceStatus
  ]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const exportPayload = buildPdfExportPayload();
    if (exportPayload.error) {
      setSaveError(exportPayload.error);
      setSaveStatus("");
      return;
    }
    try {
      setSaveError("");
      const response = await apiFetch("/api/invoices/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportPayload.payload)
      });
      const responsePayload = await response
        .clone()
        .json()
        .catch(() => null);
      if (!response.ok) {
        throw new Error(responsePayload?.error || "Couldn't export PDF.");
      }
      const pdfBlob = await response.blob();
      const objectUrl = window.URL.createObjectURL(pdfBlob);
      const safeNumber = invoiceNumber?.trim() ? invoiceNumber.trim() : "Draft";
      const filenameSuffix =
        safeNumber
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "Draft";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `Invoice-${filenameSuffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
      completeOnboardingStep("export_pdf");
      setDraftStatus("PDF download started");
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 2600);
    } catch (error) {
      setSaveError(error?.message || "Couldn't export PDF.");
      setSaveStatus("");
    }
  };

  const buildStructuredInvoiceFromDraft = () => ({
    customerName: billToDetails?.trim() || undefined,
    invoiceNumber: invoiceNumber?.trim() || undefined,
    issueDate: invoiceDate || undefined,
    dueDate: dueDate || undefined,
    servicePeriodStart: undefined,
    servicePeriodEnd: undefined,
    workSessions: [],
    materials: [],
    notes: notes?.trim() || undefined
  });

  const handleSaveInvoice = async () => {
    const editableResult = buildEditableInvoicePayload();
    if (editableResult.error) {
      setSaveError("Add at least one line item description before saving.");
      setSaveStatus("");
      setSaveNeedsAuth(false);
      return;
    }
    const currentSession = requestIdentity.getAuthSession?.() ?? authSession;
    if (saveAuthRequiredPolicy && !currentSession?.userId) {
      setSaveNeedsAuth(true);
      setSaveError("Sign in required to save invoices.");
      setSaveStatus("");
      return;
    }
    if (!savedInvoiceId && accountPlan?.upgradeRequired) {
      setSaveNeedsAuth(false);
      setSaveError("Free plan limit reached. Upgrade to save more invoices.");
      setSaveStatus("");
      return;
    }
    setSaveError("");
    setStatusUpdateError("");
    setSaveNeedsAuth(false);
    setSaveStatus(savedInvoiceId ? "Updating..." : "Saving...");
    try {
      const response = await apiFetch("/api/invoices/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmSave: true,
          invoiceId: savedInvoiceId || undefined,
          sourceType: "text_input",
          invoiceData: {
            structuredInvoice: buildStructuredInvoiceFromDraft(),
            finishedInvoice: editableResult.invoice
          }
        })
      });
      if (!response.ok) {
        let apiErrorMessage = "Save failed";
        try {
          const errorPayload = await response.json();
          if (typeof errorPayload?.error === "string" && errorPayload.error.trim()) {
            apiErrorMessage = errorPayload.error.trim();
          }
        } catch (_error) {
          // Keep fallback message.
        }
        const apiError = new Error(apiErrorMessage);
        apiError.status = response.status;
        throw apiError;
      }
      const payload = await response.json();
      const nextId = payload?.invoice?.invoiceId ?? "";
      if (nextId) {
        setSavedInvoiceId(nextId);
      }
      setSavedInvoiceStatus(payload?.invoice?.status ?? "draft");
      setPortalAccessToken(payload?.invoice?.invoiceData?.finishedInvoice?.portalAccessToken ?? portalAccessToken);
      setClientMemoryList(
        rememberClientDetails(billToDetails, {
          defaultNotes: notes
        })
      );
      setSavedLineItemLibrary(
        rememberLineItems(editableResult.invoice.lineItems, {
          clientName: billToDetails
        })
      );
      completeOnboardingStep("save_invoice");
      setSaveNeedsAuth(false);
      setSaveStatus("Saved");
      window.setTimeout(() => setSaveStatus(""), 1500);
      void refreshAccountPlan();
    } catch (error) {
      console.error("Failed to save invoice", error);
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      if (status === 401) {
        setSaveNeedsAuth(true);
        setSaveError("Sign in required to save invoices.");
      } else if (status === 402) {
        setSaveNeedsAuth(false);
        setSaveError(error?.message || "Free plan save limit reached.");
        void refreshAccountPlan();
      } else {
        setSaveNeedsAuth(false);
        setSaveError(error?.message || "Save failed. Try again.");
      }
      setSaveStatus("");
    }
  };

  const handleUpdateSavedInvoiceStatus = async (nextStatus) => {
    if (!savedInvoiceId) {
      setStatusUpdateError("Save invoice first to track status.");
      return;
    }
    setStatusUpdateLoading(true);
    setStatusUpdateError("");
    setSaveError("");
    try {
      const response = await apiFetch(`/api/invoices/${savedInvoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(payload?.error || "Couldn't update invoice status.");
        requestError.status = response.status;
        throw requestError;
      }
      const appliedStatus = payload?.invoice?.status ?? nextStatus;
      setSavedInvoiceStatus(appliedStatus);
      setSaveStatus(
        appliedStatus === "paid" ? "Marked paid" : appliedStatus === "sent" ? "Marked sent" : "Marked draft"
      );
      window.setTimeout(() => setSaveStatus(""), 1500);
    } catch (error) {
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      if (status === 401) {
        setSaveNeedsAuth(true);
      }
      setStatusUpdateError(error?.message || "Couldn't update invoice status.");
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleGeneratePaymentLink = async () => {
    if (!savedInvoiceId) {
      setPaymentLinkError("Save invoice first to create a payment link.");
      return;
    }
    setPaymentLinkBusy(true);
    setPaymentLinkError("");
    setSaveError("");
    try {
      const response = await apiFetch(`/api/invoices/${savedInvoiceId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(payload?.error || "Couldn't create payment link.");
        requestError.status = response.status;
        throw requestError;
      }
      const nextPaymentLink = payload?.paymentLinkUrl ?? payload?.invoice?.invoiceData?.finishedInvoice?.paymentLinkUrl ?? "";
      setPaymentLinkUrl(nextPaymentLink);
      setSaveStatus(nextPaymentLink ? "Hosted payment link ready" : "Hosted payment link unchanged");
      window.setTimeout(() => setSaveStatus(""), 1500);
    } catch (error) {
      setPaymentLinkError(error?.message || "Couldn't create payment link.");
    } finally {
      setPaymentLinkBusy(false);
    }
  };

  const handleGenerateClientPortalLink = async () => {
    if (!savedInvoiceId) {
      setClientPortalError("Save invoice first to create a client portal link.");
      return;
    }
    setClientPortalBusy(true);
    setClientPortalError("");
    setSaveError("");
    try {
      const response = await apiFetch(`/api/invoices/${savedInvoiceId}/client-portal-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(payload?.error || "Couldn't create client portal link.");
        requestError.status = response.status;
        throw requestError;
      }
      const nextToken = payload?.invoice?.invoiceData?.finishedInvoice?.portalAccessToken ?? "";
      if (nextToken) {
        setPortalAccessToken(nextToken);
      }
      setSaveStatus(nextToken ? "Client portal ready" : "Client portal unchanged");
      window.setTimeout(() => setSaveStatus(""), 1500);
    } catch (error) {
      setClientPortalError(error?.message || "Couldn't create client portal link.");
    } finally {
      setClientPortalBusy(false);
    }
  };

  const handleBillieLineRefine = (lineNumber, description) => {
    setActiveInspectorTab("assistant");
    setInspectorOpen(true);
    setBillieWorkspaceError("");
    setAssistantCommandRequest({
      id: `${Date.now()}-${lineNumber}`,
      instruction: `Refine line ${lineNumber} wording.`,
      description
    });
  };

  const submitBillieWorkspaceInstruction = (instruction) => {
    const trimmedInstruction = `${instruction ?? ""}`.trim();
    if (!trimmedInstruction) {
      setBillieWorkspaceError("Add an instruction for Billie.");
      return;
    }
    setBillieWorkspaceError("");
    setBillieWorkspaceInstruction("");
    writeBillieWorkspaceInstruction("");
    trackRevenueSignal("billie_workspace_instruction_submitted", "workspace");
    setAssistantCommandRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      instruction: trimmedInstruction,
      source: "workspace"
    });
  };

  const billieWorkspaceActions = [
    {
      id: "formal-descriptions",
      label: "Formal descriptions",
      instruction: "Make the descriptions more formal."
    },
    {
      id: "simpler-descriptions",
      label: "Simpler wording",
      instruction: "Make the descriptions simpler and clearer."
    },
    {
      id: "stronger-descriptions",
      label: "Stronger wording",
      instruction: "Make the descriptions stronger and more decisive."
    },
    {
      id: "refine-notes",
      label: "Refine notes",
      instruction: "Make the notes more professional."
    }
  ];

  const isMobileInspectorOpen = inspectorOpen;
  const invoiceInteractionClass = isMobileInspectorOpen
    ? "pointer-events-none select-none opacity-60 md:pointer-events-auto md:opacity-100"
    : "";
  const mobileInspectorTabs = [
    { id: "style", label: "Style", icon: "✨" },
    { id: "tone", label: "Tone", icon: "🎙️" },
    { id: "assistant", label: "Billie Edit", icon: "✍️" },
    { id: "export", label: "Export", icon: "⬇️" }
  ];
  const activeMobileTabLabel =
    mobileInspectorTabs.find((tab) => tab.id === activeInspectorTab)?.label ?? "Tools";
  const billieWorkspaceExpanded = activeInspectorTab !== "assistant" && !inspectorOpen;

  const refreshAuthSessionState = async (shouldApply = () => true) => {
    try {
      const session = await requestIdentity.refreshSession();
      if (shouldApply()) {
        setAuthSession(session);
        refreshOnboardingStatus(session);
      }
      return session;
    } catch (_error) {
      if (shouldApply()) {
        setAuthSession(null);
        refreshOnboardingStatus(null);
      }
      return null;
    }
  };

  const refreshSaveAuthPolicy = async (shouldApply = () => true) => {
    try {
      const response = await apiFetch("/api/system/persistence");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load persistence policy.");
      }
      const authRequired = Boolean(payload?.authRequired);
      if (shouldApply()) {
        setSaveAuthRequiredPolicy(authRequired);
        setSaveAuthProviders(Array.isArray(payload?.authProviders) ? payload.authProviders : []);
      }
      return authRequired;
    } catch (_error) {
      if (shouldApply()) {
        setSaveAuthRequiredPolicy(false);
        setSaveAuthProviders([]);
      }
      return false;
    }
  };

  const refreshAccountPlan = async (shouldApply = () => true) => {
    try {
      const response = await apiFetch("/api/account/plan");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (shouldApply()) {
          setAccountPlan(null);
        }
        return null;
      }
      if (shouldApply()) {
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      }
      return payload;
    } catch (_error) {
      if (shouldApply()) {
        setAccountPlan(null);
      }
      return null;
    }
  };

  const handleSaveAuthRetry = async () => {
    const session = await refreshAuthSessionState();
    const authRequired = await refreshSaveAuthPolicy();
    await refreshAccountPlan();
    if (authRequired && !session?.userId) {
      setSaveNeedsAuth(true);
      setSaveError("Sign in required to save invoices.");
      setSaveStatus("");
      return;
    }
    await handleSaveInvoice();
  };

  useEffect(() => {
    let active = true;
    refreshAuthSessionState(() => active).then((session) => {
      if (!active) {
        return;
      }
      if (!session) {
        setAuthSession(null);
      }
    });
    void refreshSaveAuthPolicy(() => active);
    void refreshAccountPlan(() => active);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    completeOnboardingStep("open_editor");
  }, []);

  useEffect(() => {
    refreshOnboardingStatus(authSession);
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    return subscribeToOnboardingState(() => {
      refreshOnboardingStatus();
    });
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    if (!initialDraftMeta?.fromLegacy || !initialDraft) {
      return;
    }
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(initialDraft));
      window.localStorage.removeItem(legacyDraftStorageKey);
    } catch (_error) {
      // Best-effort migration only.
    }
  }, [draftStorageKey, legacyDraftStorageKey, initialDraftMeta, initialDraft]);

  const handleOnboardingContinue = () => {
    const nextStep = onboardingStatus.nextStep;
    if (!nextStep?.id) {
      return;
    }
    if (nextStep.id === "save_invoice") {
      void handleSaveInvoice();
      return;
    }
    if (nextStep.id === "export_pdf") {
      void handleDownloadPdf();
      return;
    }
    if (nextStep.routeHint === "ai-intake") {
      navigate("/ai-intake");
      return;
    }
    navigate("/");
  };

  const handleDismissOnboardingCompletion = () => {
    acknowledgeOnboardingCompletion();
    refreshOnboardingStatus();
  };

  const handleDismissWalkthrough = () => {
    dismissOnboardingWalkthrough();
    refreshOnboardingStatus();
  };

  return (
    <div className="nb-page nb-page--manual min-h-screen" style={{ backgroundImage: `radial-gradient(circle at top, ${accent.muted} 0%, rgba(248,250,252,0) 46%)` }}>
      <main className="nb-page-shell nb-page-shell--wide mx-auto flex w-full flex-col pb-24 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-6 md:pb-8">
        {billingNotice ? (
          <div
            className={`nb-banner mb-4 text-sm font-medium md:col-span-2 ${
              billingNotice.tone === "green"
                ? "nb-banner--success"
                : "nb-banner--warning"
            }`}
          >
            {billingNotice.message}
          </div>
        ) : null}
        {importedDraftNotice ? (
          <div className="nb-banner nb-banner--success mb-4 text-sm font-medium md:col-span-2">
            {importedDraftNotice}
          </div>
        ) : null}
        {onboardingStatus.visible || onboardingStatus.completionVisible ? (
          <section
            className="nb-surface nb-surface--elevated mb-4 rounded-[30px] p-4 md:col-span-2 no-print"
            data-testid="manual-onboarding-section"
          >
            {onboardingStatus.completionVisible ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      First invoice complete
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      You finished the first full NoteBill loop.
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Your first invoice is drafted, saved, and exported. Next best move: personalize the experience so the second invoice feels even faster.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="nb-btn-primary rounded-full px-4 py-2 text-sm"
                      style={accentButtonStyle}
                      onClick={() => navigate("/settings/business?from=onboarding-complete")}
                    >
                      Set up branding
                    </button>
                    <button
                      type="button"
                      className="nb-btn-ghost rounded-full px-4 py-2 text-sm"
                      onClick={handleDismissOnboardingCompletion}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    className="rounded-[22px] border border-emerald-100 bg-emerald-50/60 p-4 text-left"
                    onClick={() => navigate("/settings/business?from=onboarding-complete")}
                  >
                    <p className="text-sm font-semibold text-slate-900">Branding</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Add your logo, colors, and defaults before the public launch push.
                    </p>
                  </button>
                  <button
                    type="button"
                    className="rounded-[22px] border border-emerald-100 bg-emerald-50/60 p-4 text-left"
                    onClick={() => navigate("/settings/memory?from=onboarding-complete")}
                  >
                    <p className="text-sm font-semibold text-slate-900">Client memory</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Review what repeat-client details NoteBill has already remembered.
                    </p>
                  </button>
                  <button
                    type="button"
                    className="rounded-[22px] border border-emerald-100 bg-emerald-50/60 p-4 text-left"
                    onClick={() => navigate("/settings/services?from=onboarding-complete")}
                  >
                    <p className="text-sm font-semibold text-slate-900">Service catalog</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Save reusable line items so repeat work gets even faster.
                    </p>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                      {onboardingStatus.walkthroughActive ? "Guided walkthrough" : "First invoice progress"}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {onboardingStatus.completedCount} of {onboardingStatus.totalSteps} core steps complete
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {onboardingStatus.walkthroughActive
                        ? "You made it to the editor. Save this draft first, then export the PDF so you finish the full first-invoice loop."
                        : onboardingStatus.nextStep?.helper ||
                        "You are in the editor now. Save and export to finish the first complete loop."}
                    </p>
                    {!authSession?.userId ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Optional: sign in from the launcher if you want saved work tied to your email before public launch.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onboardingStatus.nextStep ? (
                      <button
                        type="button"
                        className="nb-btn-primary rounded-full px-4 py-2 text-sm"
                        style={accentButtonStyle}
                        onClick={handleOnboardingContinue}
                      >
                        {onboardingStatus.nextStep.ctaLabel}
                      </button>
                    ) : null}
                    {onboardingStatus.walkthroughActive ? (
                      <button
                        type="button"
                        className="nb-btn-ghost rounded-full px-4 py-2 text-sm"
                        onClick={handleDismissWalkthrough}
                      >
                        Hide guide
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ backgroundColor: accent.primary, width: `${onboardingStatus.progressPercent}%` }}
                  />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  {onboardingStatus.steps.map((step, index) => {
                    const isNext = onboardingStatus.nextStep?.id === step.id;
                    const stepClass = step.complete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : isNext
                        ? "border-[#6993d2]/20 bg-[#f6f9ff] text-slate-900"
                        : "border-slate-200 bg-white/82 text-slate-700";
                    return (
                      <div key={step.id} className={`rounded-2xl border px-3 py-3 ${stepClass}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
                          Step {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{step.label}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        ) : null}
        <div className="mb-4 flex items-center justify-between gap-3 md:col-span-2 no-print">
          <button
            type="button"
            className="nb-btn-ghost"
            onClick={() => {
              persistDraft();
              navigate("/");
            }}
          >
            &larr; Back
          </button>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-semibold text-slate-500 underline-offset-2 transition hover:bg-white/70 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/")}
          >
            {authSession?.email ? `Account: ${authSession.email}` : "Account: local mode"}
          </button>
        </div>
        <section
          className="nb-assistant-panel mb-4 rounded-[30px] p-4 md:col-span-2 no-print"
          data-testid="manual-billie-workspace"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Work with Billie
              </p>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">Refine the invoice without leaving the draft.</h2>
                <p className="text-sm text-slate-600">
                  Ask Billie to polish wording and presentation while keeping money changes guarded.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="nb-btn-ghost inline-flex rounded-full px-3 py-2 text-sm font-semibold"
              style={accentGhostButtonStyle}
              onClick={() => {
                setActiveInspectorTab("assistant");
                setInspectorOpen(true);
              }}
            >
              {billieWorkspaceExpanded ? "Open full Billie tools" : "Billie tools open"}
            </button>
          </div>
          {billieWorkspaceExpanded ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {billieWorkspaceActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="nb-btn-secondary rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    style={accentGhostButtonStyle}
                    onClick={() => submitBillieWorkspaceInstruction(action.instruction)}
                    disabled={assistantWorkspaceRuntime.loading || assistantWorkspaceRuntime.hasPendingEdit}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start">
                <textarea
                  rows={2}
                  className="nb-textarea min-h-[88px] flex-1 resize-none px-3 py-3"
                  placeholder="Ask Billie to refine wording, notes, or safe presentation changes…"
                  value={billieWorkspaceInstruction}
                  onChange={(event) => {
                    setBillieWorkspaceInstruction(event.target.value);
                    if (billieWorkspaceError) {
                      setBillieWorkspaceError("");
                    }
                  }}
                  disabled={assistantWorkspaceRuntime.loading || assistantWorkspaceRuntime.hasPendingEdit}
                />
                <button
                  type="button"
                  className="nb-btn-primary inline-flex min-w-[132px] items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  style={accentButtonStyle}
                  onClick={() => submitBillieWorkspaceInstruction(billieWorkspaceInstruction)}
                  disabled={assistantWorkspaceRuntime.loading || assistantWorkspaceRuntime.hasPendingEdit}
                >
                  Ask Billie
                </button>
              </div>
            </>
          ) : null}
          <div className="mt-3 min-h-[20px]">
            {assistantWorkspaceRuntime.loading ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="nb-assistant-chip nb-assistant-chip--working">
                  <span className="nb-assistant-chip__dot animate-pulse" />
                  <span>{assistantWorkspaceRuntime.status || "Billie is working..."}</span>
                </div>
                {assistantWorkspaceRuntime.timingSummary ? (
                  <span className="text-[11px] font-medium text-slate-500">
                    {assistantWorkspaceRuntime.timingSummary}
                  </span>
                ) : null}
              </div>
            ) : billieWorkspaceError || assistantWorkspaceRuntime.error ? (
              <p className="text-xs font-medium text-rose-600">
                {billieWorkspaceError || assistantWorkspaceRuntime.error}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="nb-assistant-chip nb-assistant-chip--ready">
                  <span className="nb-assistant-chip__dot" />
                  <span>
                    {billieWorkspaceExpanded ? "Billie ready" : "Billie tools available"}
                  </span>
                </div>
                {assistantWorkspaceRuntime.timingSummary ? (
                  <span className="text-[11px] font-medium text-slate-500">
                    {assistantWorkspaceRuntime.timingSummary}
                  </span>
                ) : null}
                {assistantWorkspaceRuntime.changeSummary ? (
                  <span
                    className="text-[11px] font-medium text-slate-500"
                    data-testid="manual-workspace-change-summary"
                  >
                    {assistantWorkspaceRuntime.changeSummary}
                  </span>
                ) : null}
                {billieWorkspaceExpanded && assistantWorkspaceRuntime.latestMessage ? (
                  <span className="text-xs font-medium text-slate-600">
                    {assistantWorkspaceRuntime.latestMessage}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    {billieWorkspaceExpanded
                      ? "Billie updates the draft live and keeps numbers unchanged unless you make an explicit money decision."
                      : "Billie tools are open. Use the detailed panel for history, previews, and undo."}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
        <div
          className={`printable-invoice relative w-full overflow-hidden rounded-[32px] border ${activeSpacing.shellPaddingClass} ${activePreset.shellClass} ${invoiceInteractionClass}`}
          style={{ borderColor: accent.border }}
          data-spacing-density={spacingDensity}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{ background: `linear-gradient(180deg, ${accent.soft} 0%, rgba(255,255,255,0) 100%)` }}
          />
          <div className={`relative ${activeSpacing.sectionGapClass || activePreset.sectionGap}`}>
            <div className={`flex items-center justify-between ${activePreset.metaClass}`}>
              <span>Invoice Document</span>
              <span className="flex items-center gap-2">
                {draftStatus ? <span className="text-xs text-slate-400">{draftStatus}</span> : null}
                <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: accent.border, color: accent.primary }}>
                  Draft
                </span>
              </span>
            </div>
            <div
              className="h-1 w-full rounded-full"
              style={{ backgroundColor: accent.soft, boxShadow: `inset 0 0 0 1px ${accent.border}` }}
            />
            <div className="hidden justify-end gap-2 no-print md:flex">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
                style={accentGhostButtonStyle}
                onClick={() => {
                  setActiveInspectorTab("assistant");
                  setInspectorOpen(true);
                }}
              >
                Edit with Billie
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setInspectorOpen(true)}
              >
                Customize / Export
              </button>
            </div>

            <header className="space-y-5" data-header-layout={headerLayout}>
              {logoUrl && logoVisible ? (
                <div className={`flex ${headerLayout === "centered" ? "justify-center" : "items-center"}`}>
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-12 w-auto max-w-[200px] object-contain"
                  />
                </div>
              ) : null}
              <div
                className={`flex flex-wrap gap-4 ${
                  headerLayout === "centered"
                    ? "flex-col items-center text-center"
                    : "items-start justify-between"
                }`}
              >
                <div>
                  <h1 className={activePreset.titleClass}>INVOICE</h1>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: accent.primary }}>
                    NoteBill · prepared with Billie
                  </p>
                </div>
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <label className={`${activePreset.textClass} ${activePreset.labelClass} flex items-center gap-3`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Invoice #</span>
                    <input
                      type="text"
                      className={`min-w-[150px] ${activePreset.inputClass} ${activePreset.textClass}`}
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                    />
                  </label>
                  <label className={`${activePreset.textClass} ${activePreset.labelClass} flex items-center gap-3`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Date</span>
                    <input
                      type="date"
                      className={`min-w-[150px] ${activePreset.inputClass} ${activePreset.textClass}`}
                      value={invoiceDate}
                      onChange={(event) => setInvoiceDate(event.target.value)}
                    />
                  </label>
                  <label className={`${activePreset.textClass} ${activePreset.labelClass} flex items-center gap-3`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Due</span>
                    <input
                      type="date"
                      aria-label="Due date"
                      className={`min-w-[150px] ${activePreset.inputClass} ${activePreset.textClass}`}
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </label>
                </div>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>From</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none ${activePreset.inputClass} ${activePreset.textClass}`}
                  placeholder="Your Name / Company"
                  value={fromDetails}
                  onChange={(event) => setFromDetails(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>Bill To</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none ${activePreset.inputClass} ${activePreset.textClass}`}
                  placeholder="Client Name"
                  value={billToDetails}
                  onChange={(event) => setBillToDetails(event.target.value)}
                />
                {clientMemorySuggestions.length > 0 ? (
                  <div className="no-print rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Repeat client matches
                      </p>
                      <p className="text-xs text-slate-600">
                        Tap one to paste saved client details into Bill To.
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {clientMemorySuggestions.map(({ entry, priority }) => {
                        const hintLabel = formatClientMemoryHints(entry);
                        const isBestMatch = priority >= 400;
                        return (
                          <button
                            key={entry.lookupKey}
                            type="button"
                            className="inline-flex min-h-[48px] flex-col items-start gap-0.5 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-left text-xs font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300"
                            onClick={() => handleApplyClientMemory(entry)}
                            aria-label={`Use saved client ${entry.name}`}
                          >
                            <span className="text-sm font-semibold text-emerald-900">{entry.name}</span>
                            <span className="text-[11px] font-medium text-emerald-700">
                              {isBestMatch ? "Best match" : "Saved client"}
                              {hintLabel ? ` · ${hintLabel}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {clientMemoryItems.length > 0 ? (
              <section className="no-print rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Client memory
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Past work{primaryBillToName ? ` for ${primaryBillToName}` : ""}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Reuse prior wording and rates only when you choose. Money never changes automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="self-start rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300"
                    onClick={() => setShowSavedLineItems(true)}
                  >
                    Show all saved items
                  </button>
                  <button
                    type="button"
                    className="self-start rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300"
                    onClick={() => navigate("/settings/services")}
                  >
                    Open service catalog
                  </button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {clientMemoryItems.map(({ entry }) => (
                    <button
                      key={`client-memory-${entry.lookupKey}`}
                      type="button"
                      className="rounded-xl border border-white/80 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                      onClick={() => handleInsertSavedLineItem(entry)}
                      aria-label={`Reuse ${entry.description} from client memory`}
                    >
                      <span className="block font-semibold text-slate-800">{entry.description}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {[
                          entry.qty ? `Qty ${entry.qty}` : "",
                          entry.rate ? `Rate $${entry.rate}` : "",
                          formatSavedItemUsage(entry.usageCount)
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentServiceMemoryCandidate ? (
              <section className="no-print rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Service memory
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Save this service for next time
                    </h3>
                    <p className="text-xs text-slate-600">
                      Keep the current line item in memory so the next similar invoice is faster to build.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="self-start rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300"
                    onClick={() => handleRememberCurrentLineItem(currentServiceMemoryCandidate)}
                  >
                    Save current service
                  </button>
                </div>
              </section>
            ) : null}

            <section className="no-print rounded-2xl border border-sky-200 bg-sky-50/70 p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Time capture
                  </p>
                  <h3 className="text-sm font-semibold text-slate-900">Turn billable time into a line item</h3>
                  <p className="text-xs text-slate-600">
                    Start a timer when you begin work, then stop it to add hours directly to this invoice.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-300"
                    onClick={handleStartTimeCapture}
                    disabled={isTimeCaptureRunning}
                  >
                    Start timer
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleStopTimeCapture}
                    disabled={!isTimeCaptureRunning}
                  >
                    Stop & add line item
                  </button>
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-300"
                    onClick={handleResetTimeCapture}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Time note
                  </span>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Site visit, cleanup, repair..."
                    value={timeCaptureDescription}
                    onChange={(event) => setTimeCaptureDescription(event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                    Time rate
                  </span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder={timerRateSuggestion ? String(timerRateSuggestion) : "0"}
                    value={timeCaptureRate}
                    onChange={(event) => setTimeCaptureRate(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sky-800">
                <span className="rounded-full bg-white px-2 py-1 font-semibold">
                  {isTimeCaptureRunning ? elapsedTimeCaptureLabel || "Timer running" : "Timer idle"}
                </span>
                {timerRateSuggestion ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold">
                    Suggested rate {`$${timerRateSuggestion}`}/hr
                  </span>
                ) : null}
                {timeCaptureStatus ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold">{timeCaptureStatus}</span>
                ) : null}
              </div>
            </section>

            <section className="no-print rounded-2xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Receipt / expense capture
                  </p>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Turn a receipt or expense photo into reviewable text
                  </h3>
                  <p className="text-xs text-slate-600">
                    Upload a receipt, mileage slip, or supply photo and we&apos;ll append the extracted text into your notes before you save.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => receiptCaptureInputRef.current?.click()}
                    disabled={receiptCaptureBusy}
                  >
                    {receiptCaptureBusy ? "Scanning..." : "Add receipt photo"}
                  </button>
                  <input
                    ref={receiptCaptureInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReceiptCaptureUpload}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                {receiptCaptureNotice ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold">
                    {receiptCaptureNotice}
                  </span>
                ) : null}
                {receiptCaptureError ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold text-red-700">
                    {receiptCaptureError}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="no-print rounded-2xl border border-rose-200 bg-rose-50/70 p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                    Voice notes to invoice
                  </p>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Turn a spoken note into editable invoice text
                  </h3>
                  <p className="text-xs text-slate-600">
                    Upload an audio note and we&apos;ll append the transcript into your notes before you save.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-800 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => voiceNoteInputRef.current?.click()}
                    disabled={voiceNoteBusy}
                  >
                    {voiceNoteBusy ? "Transcribing..." : "Add voice note"}
                  </button>
                  <input
                    ref={voiceNoteInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleVoiceNoteUpload}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-rose-800">
                {voiceNoteNotice ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold">{voiceNoteNotice}</span>
                ) : null}
                {voiceNoteError ? (
                  <span className="rounded-full bg-white px-2 py-1 font-semibold text-red-700">
                    {voiceNoteError}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="space-y-3">
              <div className="space-y-3 md:hidden">
                {lineItems.map((item, index) => {
                  const rateSuggestion = item?.id ? lineRateSuggestionsByLineId[item.id] : null;
                  const hasAmount = item.qty !== "" && item.rate !== "";
                  const lineItemHighlighted = highlightedLineItemIds.has(item.id);
                  const rateSuggestionContext = formatSavedRateContext(rateSuggestion);
                  return (
                    <div
                      key={`${item.id}-mobile`}
                      data-testid={`manual-line-item-${item.id}`}
                      data-billie-highlight={lineItemHighlighted ? "true" : "false"}
                      className={`rounded-2xl border p-3 transition-colors duration-500 ${
                        lineItemHighlighted
                          ? "border-emerald-300 bg-emerald-50/80 shadow-sm"
                          : "border-slate-200 bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>
                          Line {index + 1}
                        </p>
                        <p className="text-sm font-semibold text-slate-600 tabular-nums">
                          {hasAmount ? formatMoney(getLineAmount(item)) : "Needs value"}
                        </p>
                      </div>
                      <label className="mt-3 block space-y-1">
                        <span className={`${activePreset.textClass} ${activePreset.labelClass}`}>Description</span>
                        <input
                          type="text"
                          className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                          placeholder="Description"
                          value={item.description}
                          onChange={(event) =>
                            handleLineItemChange(item.id, "description", event.target.value)
                          }
                          onBlur={() => handleLineItemDescriptionBlur(item.id)}
                        />
                      </label>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="block space-y-1">
                          <span className={`${activePreset.textClass} ${activePreset.labelClass}`}>Qty</span>
                          <input
                            type="number"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="0"
                            value={item.qty}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "qty", event.target.value)
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className={`${activePreset.textClass} ${activePreset.labelClass}`}>Rate</span>
                          <input
                            type="number"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="$0"
                            value={item.rate}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "rate", event.target.value)
                            }
                          />
                        </label>
                      </div>
                      {rateSuggestion ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {rateSuggestionContext ? (
                            <p
                              className="w-full text-[11px] text-slate-500"
                              data-testid={`manual-rate-memory-${item.id}`}
                            >
                              {rateSuggestionContext}
                            </p>
                          ) : null}
                          <p className="w-full text-[11px] text-slate-500">
                            Rate only. Description and quantity stay as-is.
                          </p>
                          <button
                            type="button"
                            className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 transition hover:border-blue-300 hover:text-blue-900"
                            onClick={() => handleApplySuggestedRate(item.id, rateSuggestion)}
                            aria-label={`Apply suggested rate $${rateSuggestion.rate.toFixed(2)} to line ${index + 1}`}
                          >
                            {`Use suggested $${rateSuggestion.rate.toFixed(2)}/hr`}
                          </button>
                          {rateSuggestion.confidence === "high" ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              High confidence
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {item.description?.trim() ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            style={accentGhostButtonStyle}
                            onClick={() => handleBillieLineRefine(index + 1, item.description)}
                            aria-label={`Billie polish line ${index + 1}`}
                          >
                            Billie polish
                          </button>
                          {item.rate !== "" ? (
                            <button
                              type="button"
                              className="inline-flex rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:border-emerald-300"
                              onClick={() => handleRememberCurrentLineItem(item)}
                              aria-label={`Save line ${index + 1} to service memory`}
                            >
                              Save service
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className={`min-w-full text-left ${activePreset.textClass}`}>
                  <thead className={activePreset.tableHeadClass}>
                    <tr>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3 pl-2">Description</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3">Qty</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-3">Rate</th>
                      <th className="border-b border-slate-200 bg-slate-100/70 pb-2 pr-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item, index) => {
                      const rateSuggestion = item?.id ? lineRateSuggestionsByLineId[item.id] : null;
                      const lineItemHighlighted = highlightedLineItemIds.has(item.id);
                      const rateSuggestionContext = formatSavedRateContext(rateSuggestion);
                      return (
                        <tr
                          key={item.id}
                          data-testid={`manual-line-item-${item.id}`}
                          data-billie-highlight={lineItemHighlighted ? "true" : "false"}
                          className={`transition-colors duration-500 ${
                            lineItemHighlighted ? "bg-emerald-50/80" : "odd:bg-slate-50/70"
                          }`}
                        >
                          <td className="py-3 pr-3 pl-2 align-top">
                            <input
                              type="text"
                              className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                              placeholder="Description"
                              value={item.description}
                              onChange={(event) =>
                                handleLineItemChange(item.id, "description", event.target.value)
                              }
                              onBlur={() => handleLineItemDescriptionBlur(item.id)}
                            />
                            {item.description?.trim() ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                  style={accentGhostButtonStyle}
                                  onClick={() => handleBillieLineRefine(index + 1, item.description)}
                                  aria-label={`Billie polish line ${index + 1}`}
                                >
                                  Billie polish
                                </button>
                                <span className="text-[11px] text-slate-400">line {index + 1}</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <input
                              type="number"
                              className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                              placeholder="0"
                              value={item.qty}
                              onChange={(event) =>
                                handleLineItemChange(item.id, "qty", event.target.value)
                              }
                            />
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <input
                              type="number"
                              className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                              placeholder="$0"
                              value={item.rate}
                              onChange={(event) =>
                                handleLineItemChange(item.id, "rate", event.target.value)
                              }
                            />
                          {rateSuggestion ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {rateSuggestionContext ? (
                                <p
                                  className="w-full text-[11px] text-slate-500"
                                  data-testid={`manual-rate-memory-${item.id}`}
                                >
                                  {rateSuggestionContext}
                                </p>
                              ) : null}
                              <p className="w-full text-[11px] text-slate-500">
                                Rate only. Description and quantity stay as-is.
                              </p>
                              <button
                                type="button"
                                className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 transition hover:border-blue-300 hover:text-blue-900"
                                onClick={() => handleApplySuggestedRate(item.id, rateSuggestion)}
                                aria-label={`Apply suggested rate $${rateSuggestion.rate.toFixed(2)} to line ${index + 1}`}
                              >
                                {`Use suggested $${rateSuggestion.rate.toFixed(2)}/hr`}
                              </button>
                              {rateSuggestion.confidence === "high" ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                  High confidence
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {item.description?.trim() ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {item.rate !== "" ? (
                                <button
                                  type="button"
                                  className="inline-flex rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:border-emerald-300"
                                  onClick={() => handleRememberCurrentLineItem(item)}
                                  aria-label={`Save line ${index + 1} to service memory`}
                                >
                                  Save service
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                          <td className="py-3 pr-2 text-right align-top text-slate-600 tabular-nums">
                            {item.qty !== "" && item.rate !== "" ? (
                              formatMoney(getLineAmount(item))
                            ) : (
                              <span className="text-xs font-semibold text-amber-600">Needs value</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className={`${activePreset.textClass} inline-flex min-h-10 items-center rounded-full px-3 font-semibold transition hover:bg-slate-50`}
                style={{ color: accent.primary }}
                onClick={handleAddLineItem}
              >
                + Add line item
              </button>
              {recommendedSavedLineItems.length > 0 ? (
                <div
                  className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"
                  data-testid="manual-recommended-saved-items"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Recommended from saved work
                    </p>
                    <p className="text-xs text-emerald-900">
                      Reuse a familiar service line without changing money automatically.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedSavedLineItems.map(({ entry, clientMatch, serviceMatchScore, usageCount }) => (
                      <button
                        key={`recommended-${entry.lookupKey}`}
                        type="button"
                        className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300"
                        onClick={() => handleInsertSavedLineItem(entry)}
                        aria-label={`Insert recommended saved item ${entry.description}`}
                      >
                        <span className="block">{entry.description}</span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {[entry.clientName || "", formatSavedItemUsage(usageCount)].filter(Boolean).join(" · ")}
                        </span>
                        {entry.qty || entry.rate ? (
                          <span className="mt-1 block text-xs font-medium text-slate-500">
                            {[entry.qty ? `Qty ${entry.qty}` : "", entry.rate ? `Rate $${entry.rate}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                        {clientMatch ? (
                          <span className="mt-1 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Client match
                          </span>
                        ) : serviceMatchScore > 0 ? (
                          <span className="mt-1 inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            Service match
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {rankedSavedLineItems.length > 0 ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <button
                    type="button"
                    className="text-sm font-semibold"
                    style={{ color: accent.primary }}
                    onClick={() => setShowSavedLineItems((value) => !value)}
                  >
                    {showSavedLineItems ? "Hide saved items" : `Saved items (${rankedSavedLineItems.length})`}
                  </button>
                  {showSavedLineItems ? (
                    <div className="flex flex-wrap gap-2">
                      {rankedSavedLineItems.slice(0, 8).map(({ entry, clientMatch, serviceMatchScore, usageCount }) => (
                        <button
                          key={entry.lookupKey}
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
                          onClick={() => handleInsertSavedLineItem(entry)}
                          aria-label={`Insert saved item ${entry.description}`}
                        >
                          <span className="block">{entry.description}</span>
                          <span className="mt-1 block text-xs font-medium text-slate-500">
                            {[entry.clientName || "", formatSavedItemUsage(usageCount)].filter(Boolean).join(" · ")}
                          </span>
                          {entry.qty || entry.rate ? (
                            <span className="mt-1 block text-xs font-medium text-slate-500">
                              {[entry.qty ? `Qty ${entry.qty}` : "", entry.rate ? `Rate $${entry.rate}` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                          {clientMatch ? (
                            <span className="mt-1 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Client match
                            </span>
                          ) : serviceMatchScore > 0 ? (
                            <span className="mt-1 inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              Service match
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="flex justify-end">
              <div
                className={`w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 ${activePreset.textClass}`}
                style={{ borderColor: accent.border, boxShadow: `0 8px 24px -20px ${accent.border}` }}
              >
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(subtotal)}</span>
                </div>
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span className="flex items-center gap-2">
                    Discount
                    <input
                      type="number"
                      aria-label="Discount amount"
                      className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={discountAmount}
                      min="0"
                      step="0.01"
                      onChange={(event) => setDiscountAmount(event.target.value)}
                    />
                    <span className="text-xs text-slate-400">$</span>
                  </span>
                  <span className="tabular-nums">
                    {effectiveDiscountAmount > 0 ? `-${formatMoney(effectiveDiscountAmount)}` : formatMoney(0)}
                  </span>
                </div>
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span className="flex items-center gap-2">
                    Tax
                    <input
                      type="number"
                      aria-label="Tax rate"
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(taxAmount)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${activePreset.totalsStrongClass}`}>
                  <span>Total</span>
                  <span className="tabular-nums" style={{ color: accent.primary }}>{formatMoney(total)}</span>
                </div>
              </div>
            </section>

            <section
              className={`space-y-2 rounded-2xl transition-colors duration-500 ${
                billieChangeHighlight.notes ? "bg-emerald-50/40" : ""
              }`}
              data-testid="manual-notes-section"
              data-notes-visible={notesVisible ? "true" : "false"}
              data-billie-highlight={billieChangeHighlight.notes ? "true" : "false"}
            >
              <div className="flex items-center justify-between gap-3">
                <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>Notes / Terms</p>
                <span
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: notesVisible ? accent.soft : "#fff7ed",
                    borderColor: notesVisible ? accent.border : "#fdba74",
                    color: notesVisible ? accent.text : "#9a3412"
                  }}
                >
                  {notesVisible ? "Visible on invoice" : "Hidden on invoice"}
                </span>
              </div>
              {notesVisible ? null : (
                <p className="text-xs text-slate-500">
                  Notes stay editable here but are hidden from the invoice preview and PDF.
                </p>
              )}
              {hasNoteSuggestions ? (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 no-print"
                  data-testid="manual-note-suggestions-card"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Repeat-work notes
                    </p>
                    <p className="text-xs text-emerald-900">
                      Reuse a saved client note or pull wording from recent invoices. Replace the current note or add more detail without touching totals.
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {noteSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              {suggestion.source}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {suggestion.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-700">{suggestion.text}</p>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Replace the current note or add this detail without touching totals.
                            </p>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto">
                            <button
                              type="button"
                              data-testid={`manual-apply-note-suggestion-${suggestion.id}`}
                              className="min-h-10 w-full rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 sm:w-auto"
                              aria-label={suggestion.actionLabel}
                              onClick={() => handleApplyNoteSuggestion(suggestion)}
                            >
                              Replace current notes
                            </button>
                            <button
                              type="button"
                              data-testid={`manual-append-note-suggestion-${suggestion.id}`}
                              className="min-h-10 w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white sm:w-auto"
                              aria-label={`Add note from ${suggestion.source.toLowerCase()} to current notes`}
                              onClick={() => handleAppendNoteSuggestion(suggestion)}
                            >
                              Add to current notes
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 no-print">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Deposits & milestones
                    </p>
                    <p className="mt-1 hidden text-xs text-amber-800 sm:block">
                      Adds a payment schedule note without changing invoice totals.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    {DEPOSIT_PLAN_QUICK_PICKS.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className="min-h-10 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-50 sm:text-xs"
                        onClick={() => handleApplyDepositPlan(plan)}
                      >
                        {plan.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 no-print">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Subscriptions & retainers
                    </p>
                    <p className="mt-1 hidden text-xs text-violet-800 sm:block">
                      Adds a recurring service note for monthly or weekly plans.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    {RETAINER_PLAN_QUICK_PICKS.map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        className="min-h-10 rounded-full border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-50 sm:text-xs"
                        onClick={() => handleApplyRetainerPlan(plan)}
                      >
                        {plan.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 no-print">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      Templates by trade
                    </p>
                    <p className="mt-1 hidden text-xs text-indigo-800 sm:block">
                      Adds a trade-specific starter note and fills the first blank line item.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {TRADE_TEMPLATE_QUICK_PICKS.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="min-h-10 rounded-full border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-50 sm:text-xs"
                        onClick={() => handleApplyTradeTemplate(template)}
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 no-print">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quick terms
                    </p>
                    <p className="mt-1 hidden text-xs text-slate-500 sm:block">
                      Adds a clear due-date line without changing invoice totals.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {PAYMENT_TERM_QUICK_PICKS.map((term) => (
                      <button
                        key={term.id}
                        type="button"
                        className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white sm:text-xs"
                        onClick={() => handleApplyPaymentTerm(term)}
                      >
                        {term.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea
                rows={4}
                className={`w-full resize-none transition-colors duration-500 ${
                  notesVisible ? "bg-slate-50/70" : "border-dashed bg-slate-50/40"
                } ${
                  billieChangeHighlight.notes ? "border-emerald-300 bg-emerald-50/70" : ""
                } ${activePreset.inputClass} ${activePreset.textClass}`}
                placeholder="Thank you for your business"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="payment-link-url"
                  className={`${activePreset.textClass} ${activePreset.labelClass}`}
                >
                  Payment link
                </label>
                <span className="text-[11px] font-semibold text-slate-400">Optional</span>
              </div>
                <input
                  id="payment-link-url"
                  aria-label="Hosted payment link"
                  type="url"
                  className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                  placeholder="https://pay.example.com/invoice/123"
                  value={paymentLinkUrl}
                  onChange={(event) => setPaymentLinkUrl(event.target.value)}
              />
              {paymentLinkUrl.trim().length > 0 ? (
                <a
                  href={paymentLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-xs font-semibold underline-offset-2 hover:underline"
                  style={{ color: accent.primary }}
                >
                  Open hosted payment link
                </a>
              ) : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className={`${activePreset.textClass} ${activePreset.labelClass}`}>
                  Export / share pack
                </label>
                <span className="text-[11px] font-semibold text-slate-400">Optional</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ color: accent.primary }}
                  onClick={handleCopySharePack}
                  disabled={sharePackBusy}
                >
                  {sharePackBusy ? "Copying..." : "Copy share pack"}
                </button>
                {sharePackNotice ? (
                  <span className="text-xs font-semibold text-slate-500">{sharePackNotice}</span>
                ) : null}
              </div>
              {sharePackPreview ? (
                <textarea
                  aria-label="Share pack preview"
                  readOnly
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-700 shadow-sm"
                  value={sharePackPreview}
                />
              ) : null}
              <p className="text-[11px] leading-5 text-slate-500">
                Copies a concise email-ready summary with the invoice number, client, total, due date, payment link, and portal link when available.
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className={`${activePreset.textClass} ${activePreset.labelClass}`}>
                  Client portal
                </label>
                <span className="text-[11px] font-semibold text-slate-400">Optional</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="min-h-10 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
                  style={{ color: accent.primary }}
                  onClick={handleGenerateClientPortalLink}
                  disabled={clientPortalBusy || !savedInvoiceId}
                >
                  {clientPortalBusy ? "Creating portal..." : clientPortalUrl ? "Refresh client portal" : "Create client portal"}
                </button>
                {clientPortalUrl ? (
                  <a
                    href={clientPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold underline-offset-2 hover:underline"
                    style={{ color: accent.primary }}
                  >
                    Open client portal
                  </a>
                ) : null}
              </div>
              {clientPortalError ? <p className="text-xs text-red-600">{clientPortalError}</p> : null}
              <p className="text-[11px] leading-5 text-slate-500">
                Share a read-only invoice portal with the customer so they can review the invoice and
                payment details in one place.
              </p>
            </section>
          </div>
        </div>

        <div className="hidden md:block no-print">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            logoUrl={logoUrl}
            logoVisible={logoVisible}
            notesVisible={notesVisible}
            headerLayout={headerLayout}
            spacingDensity={spacingDensity}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
            onLogoVisibilityChange={setLogoVisible}
            onNotesVisibilityChange={setNotesVisible}
            onHeaderLayoutChange={setHeaderLayout}
            onSpacingDensityChange={setSpacingDensity}
            stylePreset={stylePreset}
            onStylePresetChange={setStylePreset}
            accentColor={accentColor}
            onAccentColorChange={handleAccentColorChange}
            taxRate={taxRate}
            onTaxRateChange={setTaxRate}
            discountAmount={discountAmount}
            onDiscountAmountChange={setDiscountAmount}
            paymentLinkUrl={paymentLinkUrl}
            onPaymentLinkChange={setPaymentLinkUrl}
            onGeneratePaymentLink={handleGeneratePaymentLink}
            onUpdateLineItemValues={handleUpdateLineItemValues}
            onPrint={handlePrint}
            onDownloadPdf={handleDownloadPdf}
            onSaveInvoice={handleSaveInvoice}
            saveStatus={saveStatus}
            saveError={saveError}
            saveNeedsAuth={saveNeedsAuth}
            saveAuthHint={saveAuthHint}
            paymentLinkBusy={paymentLinkBusy}
            paymentLinkError={paymentLinkError}
            accountPlan={accountPlan}
            onSaveAuthRetry={handleSaveAuthRetry}
            onGoToLauncherSignIn={() => {
              persistDraft();
              navigate(`/?auth=sign-in&returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
            }}
            savedInvoiceId={savedInvoiceId}
            savedInvoiceStatus={savedInvoiceStatus}
            statusUpdateLoading={statusUpdateLoading}
            statusUpdateError={statusUpdateError}
            onUpdateSavedInvoiceStatus={handleUpdateSavedInvoiceStatus}
            previewData={previewData}
            toneSource={{ lineItems, notes }}
            onPolishDescriptions={handlePolishDescriptions}
            buildRewriteInvoicePayload={buildRewriteInvoicePayload}
            onApplyRewrite={applyRewriteChanges}
            buildEditableInvoicePayload={buildEditableInvoicePayload}
            onApplyAiEdit={applyAiEdit}
            assistantCommandRequest={assistantCommandRequest}
            onAssistantCommandHandled={(requestId) =>
              setAssistantCommandRequest((current) => (current?.id === requestId ? null : current))
            }
            onAssistantRuntimeChange={setAssistantWorkspaceRuntime}
            acceptAssistantCommands
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden no-print">
        <div className="mx-auto max-w-6xl px-4 py-2">
          <p className="mb-1 text-center text-[11px] font-semibold text-slate-500">
            {isMobileInspectorOpen ? `${activeMobileTabLabel} panel open` : "Invoice tools"}
          </p>
          <div className="flex items-center justify-around">
            {mobileInspectorTabs.map((tab) => {
              const isActive = activeInspectorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`flex min-w-[68px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    isActive ? "" : "text-slate-500"
                  }`}
                  style={isActive ? accentGhostButtonStyle : undefined}
                  onClick={() => {
                    setActiveInspectorTab(tab.id);
                    setInspectorOpen(true);
                  }}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] leading-none" aria-hidden="true">
                    {tab.icon}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isMobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 md:hidden no-print">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35"
            aria-label="Close tools panel"
            onClick={() => setInspectorOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">{activeMobileTabLabel}</span>
              <button
                type="button"
                className="text-xs font-semibold text-slate-600"
                onClick={() => setInspectorOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="h-[calc(82vh-44px)] overflow-hidden">
              <InspectorPanel
                activeTab={activeInspectorTab}
                onTabChange={setActiveInspectorTab}
                onClose={() => setInspectorOpen(false)}
                hideInternalTabs
                logoUrl={logoUrl}
                logoVisible={logoVisible}
                notesVisible={notesVisible}
                headerLayout={headerLayout}
                spacingDensity={spacingDensity}
                onLogoChange={handleLogoChange}
                onLogoRemove={handleLogoRemove}
                onLogoVisibilityChange={setLogoVisible}
                onNotesVisibilityChange={setNotesVisible}
                onHeaderLayoutChange={setHeaderLayout}
                onSpacingDensityChange={setSpacingDensity}
                stylePreset={stylePreset}
                onStylePresetChange={setStylePreset}
                accentColor={accentColor}
                onAccentColorChange={handleAccentColorChange}
                taxRate={taxRate}
                onTaxRateChange={setTaxRate}
                discountAmount={discountAmount}
                onDiscountAmountChange={setDiscountAmount}
                paymentLinkUrl={paymentLinkUrl}
                onPaymentLinkChange={setPaymentLinkUrl}
                onGeneratePaymentLink={handleGeneratePaymentLink}
                onUpdateLineItemValues={handleUpdateLineItemValues}
                onPrint={handlePrint}
                onDownloadPdf={handleDownloadPdf}
                onSaveInvoice={handleSaveInvoice}
                saveStatus={saveStatus}
                saveError={saveError}
                saveNeedsAuth={saveNeedsAuth}
                saveAuthHint={saveAuthHint}
                paymentLinkBusy={paymentLinkBusy}
                paymentLinkError={paymentLinkError}
                accountPlan={accountPlan}
                onSaveAuthRetry={handleSaveAuthRetry}
                onGoToLauncherSignIn={() => {
                  persistDraft();
                  navigate(`/?auth=sign-in&returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
                }}
                savedInvoiceId={savedInvoiceId}
                savedInvoiceStatus={savedInvoiceStatus}
                statusUpdateLoading={statusUpdateLoading}
                statusUpdateError={statusUpdateError}
                onUpdateSavedInvoiceStatus={handleUpdateSavedInvoiceStatus}
                previewData={previewData}
                toneSource={{ lineItems, notes }}
                onPolishDescriptions={handlePolishDescriptions}
                buildRewriteInvoicePayload={buildRewriteInvoicePayload}
                onApplyRewrite={applyRewriteChanges}
                buildEditableInvoicePayload={buildEditableInvoicePayload}
                onApplyAiEdit={applyAiEdit}
                assistantCommandRequest={assistantCommandRequest}
                onAssistantCommandHandled={(requestId) =>
                  setAssistantCommandRequest((current) => (current?.id === requestId ? null : current))
                }
                onAssistantRuntimeChange={setAssistantWorkspaceRuntime}
                acceptAssistantCommands={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

  window.InvoiceManualCanvas = {
    ManualInvoiceCanvas
  };
})();
