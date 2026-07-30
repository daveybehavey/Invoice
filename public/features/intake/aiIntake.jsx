(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useEffect, useMemo, useRef, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }
  const apiFetch = requestIdentity.apiFetch ?? window.fetch.bind(window);
  const onboardingUtils = window.InvoiceOnboardingState;
  if (!onboardingUtils) {
    throw new Error(
      "Missing /utils/onboardingState.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }
  const {
    buildStatus: buildOnboardingStatus,
    activateWalkthrough: activateOnboardingWalkthrough,
    dismissWalkthrough: dismissOnboardingWalkthrough,
    markStep: markOnboardingStep,
    subscribe: subscribeToOnboardingState
  } = onboardingUtils;

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeHelperUtils = window.InvoiceIntakeHelpers;
  if (!intakeHelperUtils) {
    throw new Error(
      "Missing /utils/intakeHelpers.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeReadinessUtils = window.InvoiceIntakeReadiness;
  if (!intakeReadinessUtils) {
    throw new Error(
      "Missing /features/intake/readiness.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeRuntimeUtils = window.InvoiceIntakeRuntime;
  if (!intakeRuntimeUtils) {
    throw new Error(
      "Missing /features/intake/runtime.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeOrchestrationUtils = window.InvoiceIntakeOrchestration;
  if (!intakeOrchestrationUtils) {
    throw new Error(
      "Missing /features/intake/orchestration.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeActionUtils = window.InvoiceIntakeActions;
  if (!intakeActionUtils) {
    throw new Error(
      "Missing /features/intake/actions.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeControllerUtils = window.InvoiceIntakeController;
  if (!intakeControllerUtils) {
    throw new Error(
      "Missing /features/intake/controller.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeReviewModelUtils = window.InvoiceIntakeReviewModel;
  if (!intakeReviewModelUtils) {
    throw new Error(
      "Missing /features/intake/reviewModel.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeReviewComponents = window.InvoiceIntakeReview;
  if (!intakeReviewComponents) {
    throw new Error(
      "Missing /features/intake/reviewCard.jsx load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const intakeDecisionComponents = window.InvoiceIntakeDecision;
  if (!intakeDecisionComponents) {
    throw new Error(
      "Missing /features/intake/decisionPanel.jsx load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const {
    formatRateToken,
    cloneJson,
    formatMoney,
    formatLaborDuration,
    formatDisplayDescription
  } = formatUtils;

  const { extractKeywords } = intakeHelperUtils;

  const {
    isReadinessDebugEnabled,
    logReadinessEvent,
    evaluateIntakeReadiness,
    evaluateResponseReadiness,
    buildDraftFromFinishedInvoice
  } = intakeReadinessUtils;

  const { getSlowResponseDelay, shouldUseFastMode, shouldRunDeepAudit, createIntakeRuntime } =
    intakeRuntimeUtils;
  const { createIntakeOrchestrator } = intakeOrchestrationUtils;
  const { createIntakeActionHandlers } = intakeActionUtils;

  const {
    applyDecisionActionToInvoice,
    orderLineItemsForTranscript,
    extractTaxRateFromText,
    isExplicitNoTax,
    mergeUniqueList,
    mergeDecisionLists,
    buildTranscript,
    buildSummaryText,
    buildReviewPayload,
    buildDecisionFollowUp,
    buildDraftFromInvoice,
    buildDecisionActions,
    buildDecisionAckMessage
  } = intakeControllerUtils;

  const { buildDecisionKeywordSets, getLineItemStatus, buildReviewSnapshotModel } =
    intakeReviewModelUtils;
  const { ReviewSnapshotCard } = intakeReviewComponents;
  const { IntakeDecisionPanel } = intakeDecisionComponents;

  const accountPlanUtils = window.InvoiceAccountPlanUtils;
  if (!accountPlanUtils) {
    throw new Error(
      "Missing /utils/accountPlan.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }
  const { formatPlanSummary, getPlanUpgradeUrl, getPlanPrelimitWarning, getPlanUsageModel } =
    accountPlanUtils;

  const billingActions = window.InvoiceBillingActions;
  if (!billingActions) {
    throw new Error(
      "Missing /utils/billingActions.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }
  const { hasStripeCheckout, startUpgradeCheckout, readBillingNoticeFromUrl } = billingActions;

  const businessProfileUtils = window.InvoiceBusinessProfile;
  if (!businessProfileUtils) {
    throw new Error(
      "Missing /utils/businessProfile.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const { applyBusinessProfileToDraft } = businessProfileUtils;
  const clientMemoryUtils = window.InvoiceClientMemory;
  const getClientDefaultNotes = clientMemoryUtils?.getClientDefaultNotes;
  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  const getLineItemLibrary = lineItemLibraryUtils?.getLineItemLibrary;
  const smartRateSuggestionUtils = window.InvoiceManualSmartRateSuggestions;
  const rankSavedLineItems = smartRateSuggestionUtils?.rankSavedLineItems;
  const buildSavedRateContextsByLineId = smartRateSuggestionUtils?.buildSavedRateContextsByLineId;

  const aiIntakeHelperUtils = window.InvoiceAIIntakeHelpers;
  if (!aiIntakeHelperUtils) {
    throw new Error(
      "Missing /features/intake/aiIntakeHelpers.js load. Ensure it is loaded before /features/intake/aiIntake.jsx."
    );
  }

  const {
    initialIntakeMessages,
    readDraftFromStorage,
    readStoredLaborRate,
    storeLaborRate,
    buildBillieChangePreview,
    buildLaborQuickReplies
  } = aiIntakeHelperUtils;
  const billieTelemetryUtils = window.InvoiceBillieTelemetry;
  const getInitialRefineSummaryLabel = () => {
    if (!billieTelemetryUtils) {
      return "";
    }
    return billieTelemetryUtils.formatRefineSummaryLabel(
      billieTelemetryUtils.getRefineSummary("intake")
    );
  };

  const SAMPLE_JOB_NOTES = [
    "Apr 18 - Jordan Lee, 44 Maple Ave.",
    "Repaired leaking kitchen sink.",
    "2.25 hours at $95/hr.",
    "Replaced supply line $18.50 and washer kit $7.",
    "Client asked for no tax this time.",
    "Payment due in 14 days."
  ].join("\n");
  const PAYMENT_TERM_LINE_PATTERN =
    /^(due on receipt|payment due|payment is due|please remit payment|net\s*\d+|payable within)/i;
  const PAYMENT_SCHEDULE_LINE_PATTERN =
    /^(deposit:|payment schedule:|milestone\s*\d+|balance due|progress payment)/i;
  const RETAINER_PLAN_LINE_PATTERN =
    /^(retainer:|subscription:|monthly retainer|weekly retainer|on-call support)/i;
  const TRADE_TEMPLATE_LINE_PATTERN =
    /^(trade template:|plumbing scope:|electrical scope:|cleaning scope:|landscaping scope:|handyman scope:)/i;
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
  const mergeSuggestedNotes = (currentNotes, suggestedNotes) => {
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

function AIIntake() {
  const navigate = useNavigate();
  const legacyDraftStorageKey = "invoiceDraft";
  const draftStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? legacyDraftStorageKey;
  const billieWorkspaceStorageKey =
    requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const legacyImportSeedStorageKey = "invoiceImportSeed";
  const importSeedStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceImportSeed") ?? legacyImportSeedStorageKey;
  const legacyScratchpadSeedStorageKey = "invoiceScratchpadSeed";
  const scratchpadSeedStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceScratchpadSeed") ?? legacyScratchpadSeedStorageKey;
  const legacyLaborRateStorageKey = "invoiceLastLaborRate";
  const laborRateStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceLastLaborRate") ?? legacyLaborRateStorageKey;
  const [authSession, setAuthSession] = useState(() => requestIdentity.getAuthSession?.() ?? null);
  const [onboardingStatus, setOnboardingStatus] = useState(() =>
    buildOnboardingStatus({ authSession: requestIdentity.getAuthSession?.() ?? null })
  );
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingNotice, setBillingNotice] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [importStudioContext, setImportStudioContext] = useState(null);
  const [scratchpadSeedNotice, setScratchpadSeedNotice] = useState("");
  const [messages, setMessages] = useState(initialIntakeMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [intakePhase, setIntakePhase] = useState("collecting");
  const [followUp, setFollowUp] = useState(null);
  const [structuredInvoice, setStructuredInvoice] = useState(null);
  const [finishedInvoice, setFinishedInvoice] = useState(null);
  const [laborPricingNote, setLaborPricingNote] = useState("");
  const [pendingLaborRate, setPendingLaborRate] = useState(null);
  const [pendingTaxRate, setPendingTaxRate] = useState(null);
  const [openDecisions, setOpenDecisions] = useState([]);
  const [assumptions, setAssumptions] = useState([]);
  const [unparsedLines, setUnparsedLines] = useState([]);
  const [outputQuality, setOutputQuality] = useState(null);
  const [auditStatus, setAuditStatus] = useState(null);
  const [auditSummary, setAuditSummary] = useState("");
  const [auditSummaryAt, setAuditSummaryAt] = useState(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [reviewCardCollapsed, setReviewCardCollapsed] = useState(true);
  const [showChatInput, setShowChatInput] = useState(false);
  const [assumptionsCollapsed, setAssumptionsCollapsed] = useState(true);
  const [decisionToast, setDecisionToast] = useState(null);
  const [billieStatus, setBillieStatus] = useState(null);
  const [billieRefineSummaryLabel, setBillieRefineSummaryLabel] = useState(() =>
    getInitialRefineSummaryLabel()
  );
  const [billieUndoState, setBillieUndoState] = useState(null);
  const [billieChangePreview, setBillieChangePreview] = useState([]);
  const [recentlyChangedLines, setRecentlyChangedLines] = useState({
    ids: [],
    descriptions: []
  });
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [decisionFocusIndex, setDecisionFocusIndex] = useState(0);
  const [showDecisionWhy, setShowDecisionWhy] = useState(false);
  const [optimisticDecisionState, setOptimisticDecisionState] = useState(null);
  const [recentClientContext, setRecentClientContext] = useState([]);
  const [savedLaborRate, setSavedLaborRate] = useState(() => {
    const scopedRate = readStoredLaborRate(laborRateStorageKey);
    if (scopedRate !== null) {
      return scopedRate;
    }
    if (laborRateStorageKey !== legacyLaborRateStorageKey) {
      return readStoredLaborRate(legacyLaborRateStorageKey);
    }
    return null;
  });
  const [decisionUndoState, setDecisionUndoState] = useState(null);
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [wizardStepsExpanded, setWizardStepsExpanded] = useState(false);
  const [starterGuideActive, setStarterGuideActive] = useState(false);
  const [billieChipTrayExpanded, setBillieChipTrayExpanded] = useState(false);
  const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
  const [voiceNoteError, setVoiceNoteError] = useState("");
  const [voiceNoteNotice, setVoiceNoteNotice] = useState("");
  const audioUploadInputRef = useRef(null);
  const formatImportStudioPreview = (value) => {
    const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    if (!normalized) {
      return "";
    }
    return normalized.length > 320 ? `${normalized.slice(0, 320).trimEnd()}…` : normalized;
  };
  const applyImportStudioSourceToInput = () => {
    const sourceText =
      typeof importStudioContext?.sourceText === "string" ? importStudioContext.sourceText.trim() : "";
    if (!sourceText) {
      return;
    }
    const prefill = `Use this imported source text to clean up anything the draft missed or left uncertain:\n\n${sourceText}`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
  const applyImportStudioUnparsedToInput = () => {
    const missingLines = Array.isArray(unparsedLines)
      ? unparsedLines.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    if (missingLines.length === 0) {
      return;
    }
    const prefill = `Use these uncaptured imported lines to finish the cleanup:\n\n${missingLines
      .map((line) => `- ${line}`)
      .join("\n")}`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
  const applyImportStudioDecisionsToInput = () => {
    const openDecisionPrompts = Array.isArray(visibleDecisionSource)
      ? visibleDecisionSource
          .map((item) => String(item?.prompt ?? item?.text ?? "").trim())
          .filter(Boolean)
      : [];
    if (openDecisionPrompts.length === 0) {
      return;
    }
    const prefill = `Use these unresolved imported decisions to finish the cleanup:\n\n${openDecisionPrompts
      .map((line) => `- ${line}`)
      .join("\n")}`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
  const applyImportStudioAssumptionsToInput = () => {
    const draftAssumptions = Array.isArray(auditAssumptionItems)
      ? auditAssumptionItems.map((item) => String(item?.text ?? "").trim()).filter(Boolean)
      : [];
    if (draftAssumptions.length === 0) {
      return;
    }
    const prefill = `Use these imported assumptions to double-check the cleanup and tell me what still needs confirmation:\n\n${draftAssumptions
      .map((line) => `- ${line}`)
      .join("\n")}`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
  const applyImportStudioBlockersToInput = () => {
    const blockerLines = Array.isArray(outputQuality?.blockers)
      ? outputQuality.blockers.map((item) => String(item?.message ?? "").trim()).filter(Boolean)
      : [];
    if (blockerLines.length === 0) {
      return;
    }
    const prefill = `Use these quality blockers to finish the import cleanup before I build the final draft:\n\n${blockerLines
      .map((line) => `- ${line}`)
      .join("\n")}`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
  const applyImportStudioComparisonToInput = () => {
    if (!importDraftComparison) {
      return;
    }
    const sourceLines = Array.isArray(importDraftComparison.sourceSessions)
      ? importDraftComparison.sourceSessions.flatMap((session) => {
          const header = `${session.date}${session.taskCount ? ` · ${session.taskCount} task${session.taskCount === 1 ? "" : "s"}` : ""}`;
          const previewLines = Array.isArray(session.taskPreview) ? session.taskPreview : [];
          return [header, ...previewLines.map((item) => `  - ${item}`)];
        })
      : [];
    const draftLines = Array.isArray(importDraftComparison.draftLineItems)
      ? importDraftComparison.draftLineItems.map((item) => {
          const detail = typeof item?.detail === "string" && item.detail.trim() ? ` · ${item.detail.trim()}` : "";
          return `${item.description}${detail}`;
        })
      : [];
    if (sourceLines.length === 0 && draftLines.length === 0) {
      return;
    }
    const prefill = `Use this source-vs-draft comparison to finish the import cleanup:\n\n${
      sourceLines.length > 0
        ? `Source sessions:\n${sourceLines.map((line) => `- ${line}`).join("\n")}`
        : "Source sessions: none yet"
    }\n\n${
      draftLines.length > 0
        ? `Draft line items:\n${draftLines.map((line) => `- ${line}`).join("\n")}`
        : "Draft line items: none yet"
    }`;
    setInputValue(prefill);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = document.getElementById("ai-intake-input");
        if (input instanceof HTMLTextAreaElement) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  };
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

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    let active = true;
    requestIdentity
      .refreshSession()
      .then((session) => {
        if (!active) {
          return;
        }
        setAuthSession(session);
        refreshOnboardingStatus(session);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAuthSession(null);
        refreshOnboardingStatus(null);
      });
    return () => {
      active = false;
    };
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
    let active = true;
    apiFetch("/api/account/plan")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) {
          return;
        }
        if (!response.ok) {
          setAccountPlan(null);
          return;
        }
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAccountPlan(null);
      });
    return () => {
      active = false;
    };
  }, [authSession?.userId, authSession?.email]);

  const readinessDebugEnabled = isReadinessDebugEnabled();
  const [readinessPanelOpen, setReadinessPanelOpen] = useState(readinessDebugEnabled);
  const [readinessDebugEvents, setReadinessDebugEvents] = useState([]);
  const requestIdRef = useRef(0);
  const openDecisionSignatureRef = useRef("");
  const lastDecisionResolutionRef = useRef("");
  const decisionActionRef = useRef(null);
  const lastSummaryMetaRef = useRef({ at: null, requestId: null });
  const readinessSignatureRef = useRef("");
  const intakePhaseRef = useRef(intakePhase);
  const summaryLockRef = useRef(false);
  const listEndRef = useRef(null);
  const decisionsRef = useRef(null);
  const lastDecisionCountRef = useRef(0);
  const unparsedRef = useRef(null);
  const slowResponseTimeoutRef = useRef(null);
  const timeoutMessageIdRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastMessagesRef = useRef([]);
  const lastTranscriptRef = useRef("");
  const lastUserMessageRef = useRef("");
  const lastIntakeModeRef = useRef("full");
  const importSeedRef = useRef(false);
  const sampleSeedRef = useRef(false);
  const hasAutoCollapsedRef = useRef(false);
  const auditRequestIdRef = useRef(0);
  const openDecisionsRef = useRef([]);
  const assumptionsRef = useRef([]);
  const unparsedLinesRef = useRef([]);
  const decisionToastTimeoutRef = useRef(null);
  const decisionUndoTimeoutRef = useRef(null);
  const billieStatusTimeoutRef = useRef(null);
  const billieHighlightTimeoutRef = useRef(null);
  const pendingDecisionUndoRef = useRef(null);
  const billieRefineStartMsRef = useRef(null);
  const intakeComplete = intakePhase === "ready_to_generate";
  const confirmationKeywords = [];
  const rejectionKeywords = ["no", "not correct", "wrong", "incorrect", "needs change"];
  const hasReviewCard = messages.some((message) => message.kind === "review");
  const reviewMessageId = hasReviewCard
    ? [...messages].reverse().find((message) => message.kind === "review")?.id ?? null
    : null;
  const visibleMessages = hasReviewCard
    ? messages.filter(
        (message) => message.kind === "timeout" || message.id === reviewMessageId
      )
    : messages.filter((message) => message.kind === "timeout");
  const {
    clearSlowResponseTimer,
    dismissTimeoutMessage,
    appendTimeoutMessage,
    shouldIgnorePostSummaryResponse,
    abortOngoingRequest
  } = createIntakeRuntime({
    slowResponseTimeoutRef,
    timeoutMessageIdRef,
    abortControllerRef,
    requestIdRef,
    lastSummaryMetaRef,
    intakePhaseRef,
    setMessages,
    setIsTyping
  });

  useEffect(() => {
    if (sampleSeedRef.current || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("sample") !== "starter") {
      return;
    }
    sampleSeedRef.current = true;
    activateOnboardingWalkthrough();
    setInputValue(SAMPLE_JOB_NOTES);
    setStarterGuideActive(true);
    setVoiceNoteNotice("Sample notes loaded. Review them, then build the invoice.");
    completeOnboardingStep("capture_notes");
    params.delete("sample");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const currentReviewClientName =
    typeof finishedInvoice?.customerName === "string" ? finishedInvoice.customerName.trim() : "";
  const savedLineItemLibrary = useMemo(
    () => (typeof getLineItemLibrary === "function" ? getLineItemLibrary() : []),
    [authSession?.userId, authSession?.email]
  );
  const reviewRepeatWorkContext = useMemo(() => {
    const currentNotes =
      typeof finishedInvoice?.notes === "string" ? finishedInvoice.notes.trim() : "";
    const normalizedCurrentNotes = currentNotes.toLowerCase();
    const noteSuggestions = [];
    const seenNoteTexts = new Set();
    const rememberNoteSuggestion = (suggestion) => {
      const normalizedText =
        typeof suggestion?.text === "string" ? suggestion.text.trim().toLowerCase() : "";
      if (!normalizedText || normalizedText === normalizedCurrentNotes || seenNoteTexts.has(normalizedText)) {
        return;
      }
      seenNoteTexts.add(normalizedText);
      noteSuggestions.push({
        id: suggestion.id,
        label: suggestion.label,
        source: suggestion.source,
        text: suggestion.text.trim()
      });
    };
    const savedClientDefaultNotes =
      typeof getClientDefaultNotes === "function" ? getClientDefaultNotes(currentReviewClientName) : "";
    if (savedClientDefaultNotes) {
      rememberNoteSuggestion({
        id: "client-memory-note",
        label: "Use prior client note",
        source: "Saved in client memory",
        text: savedClientDefaultNotes
      });
    }
    recentClientContext.forEach((entry, index) => {
      const noteText = typeof entry?.notes === "string" ? entry.notes.trim() : "";
      if (!noteText) {
        return;
      }
      rememberNoteSuggestion({
        id: entry?.invoiceId ? `recent-note-${entry.invoiceId}` : `recent-note-${index}`,
        label: entry?.invoiceNumber ? `Use note from ${entry.invoiceNumber}` : "Use recent invoice note",
        source: entry?.invoiceNumber ? `Recent invoice ${entry.invoiceNumber}` : "Recent invoice",
        text: noteText
      });
    });
    const reviewLineItems = Array.isArray(finishedInvoice?.lineItems)
      ? finishedInvoice.lineItems.map((item, index) => ({
          id: item?.id ?? `review-line-${index}`,
          description: item?.description ?? "",
          quantity: item?.quantity,
          amount: item?.amount,
          unitPrice: item?.unitPrice,
          rate: item?.unitPrice
        }))
      : [];
    if (!currentReviewClientName || reviewLineItems.length === 0 || savedLineItemLibrary.length === 0) {
      return {
        matchedSavedItems: [],
        rateContextByLineId: {},
        noteSuggestions,
        currentNotes
      };
    }
    const matchedSavedItems =
      typeof rankSavedLineItems === "function"
        ? rankSavedLineItems({
            billToDetails: currentReviewClientName,
            lineItems: reviewLineItems,
            savedLineItemLibrary
          })
            .filter(({ clientMatch, serviceMatchScore }) => clientMatch || serviceMatchScore > 0)
            .slice(0, 3)
        : [];
    const rawRateContexts =
      typeof buildSavedRateContextsByLineId === "function"
        ? buildSavedRateContextsByLineId({
            billToDetails: currentReviewClientName,
            lineItems: reviewLineItems,
            savedLineItemLibrary,
            includeRatedLines: true
          })
        : {};
    const rateContextByLineId = reviewLineItems.reduce((accumulator, item) => {
      const suggestion = rawRateContexts?.[item.id];
      if (suggestion) {
        const savedDescription =
          typeof suggestion.description === "string" ? suggestion.description.trim() : "";
        const currentDescription =
          typeof item.description === "string" ? item.description.trim() : "";
        accumulator[item.id] = {
          currentDescription,
          currentRateText: Number.isFinite(item.unitPrice) ? `${formatMoney(item.unitPrice)}/hr` : "",
          currentQuantityText: Number.isFinite(item.quantity) ? String(item.quantity) : "",
          currentLaborMetaText:
            Number.isFinite(item.quantity) &&
            Number.isFinite(item.unitPrice) &&
            Number.isFinite(item.amount)
              ? `${formatLaborDuration(item.quantity)} × ${formatMoney(item.unitPrice)}/hr • ${formatMoney(item.amount)}`
              : "",
          savedDescription,
          canApplySavedWording:
            Boolean(savedDescription) &&
            savedDescription.toLowerCase() !== currentDescription.toLowerCase(),
          text: formatSavedRateContext(suggestion),
          suggestion
        };
      }
      return accumulator;
    }, {});
    return {
      matchedSavedItems,
      rateContextByLineId,
      noteSuggestions,
      currentNotes
    };
  }, [
    buildSavedRateContextsByLineId,
    currentReviewClientName,
    finishedInvoice,
    getClientDefaultNotes,
    recentClientContext,
    rankSavedLineItems,
    savedLineItemLibrary
  ]);

  useEffect(() => {
    if (!currentReviewClientName) {
      setRecentClientContext([]);
      return undefined;
    }
    const abortController = new AbortController();
    setRecentClientContext([]);
    apiFetch(
      `/api/invoices/recent-context?client=${encodeURIComponent(currentReviewClientName)}&limit=2`,
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
  }, [currentReviewClientName, authSession?.userId]);

  const appendAiMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "ai",
        text
      }
    ]);
  };

  const showDecisionToast = (text, options = {}) => {
    if (!text) {
      return;
    }
    const durationMs =
      Number.isFinite(options.durationMs) && options.durationMs > 0 ? options.durationMs : 3500;
    setDecisionToast(text);
    if (decisionToastTimeoutRef.current) {
      window.clearTimeout(decisionToastTimeoutRef.current);
    }
    decisionToastTimeoutRef.current = window.setTimeout(() => {
      setDecisionToast(null);
      decisionToastTimeoutRef.current = null;
    }, durationMs);
  };

  const showBillieStatus = (status, options = {}) => {
    if (billieStatusTimeoutRef.current) {
      window.clearTimeout(billieStatusTimeoutRef.current);
      billieStatusTimeoutRef.current = null;
    }
    if (!status || !status.text) {
      setBillieStatus(null);
      return;
    }
    const isSticky = Boolean(options.sticky);
    const durationMs =
      Number.isFinite(options.durationMs) && options.durationMs > 0 ? options.durationMs : 8000;
    setBillieStatus(status);
    if (isSticky) {
      return;
    }
    billieStatusTimeoutRef.current = window.setTimeout(() => {
      setBillieStatus(null);
      billieStatusTimeoutRef.current = null;
    }, durationMs);
  };

  const setTransientBillieHighlights = (patch) => {
    const ids = Array.isArray(patch?.changedLineItemIds)
      ? patch.changedLineItemIds.filter((id) => typeof id === "string" && id.trim())
      : [];
    const descriptions = Array.isArray(patch?.changedLineItemDescriptions)
      ? patch.changedLineItemDescriptions
          .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
          .filter(Boolean)
      : [];
    setRecentlyChangedLines({ ids, descriptions });
    if (billieHighlightTimeoutRef.current) {
      window.clearTimeout(billieHighlightTimeoutRef.current);
    }
    billieHighlightTimeoutRef.current = window.setTimeout(() => {
      setRecentlyChangedLines({ ids: [], descriptions: [] });
      billieHighlightTimeoutRef.current = null;
    }, 1600);
  };

  const clearDecisionUndoState = () => {
    setDecisionUndoState(null);
    if (decisionUndoTimeoutRef.current) {
      window.clearTimeout(decisionUndoTimeoutRef.current);
      decisionUndoTimeoutRef.current = null;
    }
  };

  const startDecisionUndoWindow = (snapshot, message) => {
    if (!snapshot) {
      clearDecisionUndoState();
      return;
    }
    setDecisionUndoState({
      ...snapshot,
      message: message || "Decision updated."
    });
    if (decisionUndoTimeoutRef.current) {
      window.clearTimeout(decisionUndoTimeoutRef.current);
    }
    decisionUndoTimeoutRef.current = window.setTimeout(() => {
      setDecisionUndoState(null);
      decisionUndoTimeoutRef.current = null;
    }, 9000);
  };

  const captureDecisionUndoSnapshot = () => ({
    intakePhase,
    finishedInvoice: cloneJson(finishedInvoice),
    structuredInvoice: cloneJson(structuredInvoice),
    openDecisions: cloneJson(openDecisions),
    assumptions: cloneJson(assumptions),
    unparsedLines: cloneJson(unparsedLines),
    outputQuality: cloneJson(outputQuality),
    pendingTaxRate
  });

  const handleDecisionAction = (action, message) => {
    const currentValue = inputValue.replace(/\s+$/, "");
    if (currentValue.trim()) {
      const prefix = currentValue.endsWith("\n") ? currentValue : `${currentValue}\n`;
      focusInputWithValue(`${prefix}${message}`);
      return;
    }
    const hiddenDecisionIds =
      action?.type === "bulk_include" || action?.type === "bulk_exclude"
        ? decisionItems.map((item) => String(item.id))
        : action?.id
          ? [String(action.id)]
          : [];
    setOptimisticDecisionState({
      pending: true,
      hiddenDecisionIds,
      label: "Billie: Applying decision..."
    });
    showBillieStatus({ kind: "info", text: "Applying decision..." }, { durationMs: 5000 });
    pendingDecisionUndoRef.current = captureDecisionUndoSnapshot();
    decisionActionRef.current = action;
    const accepted = handleSubmitUserMessage(message, { clickTimeMs: window.performance.now() });
    if (!accepted) {
      setOptimisticDecisionState(null);
      showBillieStatus(null);
      decisionActionRef.current = null;
      pendingDecisionUndoRef.current = null;
    }
  };

  const handleDecisionRequestComplete = (result) => {
    setOptimisticDecisionState(null);
    if (result?.status === "error") {
      showBillieStatus({ kind: "warning", text: "Couldn't apply decision. Restored." }, { durationMs: 5000 });
      return;
    }
    if (result?.status === "success") {
      showBillieStatus(null);
    }
  };

  const handleUndoDecision = () => {
    if (!decisionUndoState) {
      return;
    }
    const restoredInvoice = decisionUndoState.finishedInvoice ?? null;
    const restoredDecisions = Array.isArray(decisionUndoState.openDecisions)
      ? decisionUndoState.openDecisions
      : [];
    const restoredUnparsed = Array.isArray(decisionUndoState.unparsedLines)
      ? decisionUndoState.unparsedLines
      : [];
    setFinishedInvoice(restoredInvoice);
    setStructuredInvoice(decisionUndoState.structuredInvoice ?? null);
    setOpenDecisions(restoredDecisions);
    setAssumptions(Array.isArray(decisionUndoState.assumptions) ? decisionUndoState.assumptions : []);
    setUnparsedLines(restoredUnparsed);
    setOutputQuality(decisionUndoState.outputQuality ?? null);
    setPendingTaxRate(decisionUndoState.pendingTaxRate ?? null);
    setFollowUp(null);
    setIntakePhase(decisionUndoState.intakePhase ?? "ready_to_summarize");
    openDecisionSignatureRef.current = restoredDecisions.map((decision) => decision.prompt).sort().join("|");
    if (restoredInvoice) {
      appendSummaryMessage(
        buildSummaryText(
          restoredInvoice,
          restoredDecisions,
          restoredUnparsed.length,
          decisionUndoState.outputQuality?.blockerCount ?? 0
        ),
        buildReviewPayload(
          restoredInvoice,
          restoredDecisions,
          restoredUnparsed,
          lastTranscriptRef.current,
          decisionUndoState.outputQuality ?? null,
          decisionUndoState.structuredInvoice ?? null
        )
      );
    }
    clearDecisionUndoState();
    showDecisionToast("Undid last decision.");
  };

  const handleBilliePatchApplied = ({ patch, previousInvoice, nextInvoice }) => {
    if (!previousInvoice || !patch?.hasChanges) {
      return;
    }
    setBillieUndoState({
      previousInvoice: cloneJson(previousInvoice),
      changedLineItemIds: Array.isArray(patch.changedLineItemIds)
        ? [...patch.changedLineItemIds]
        : [],
      changedLineItemDescriptions: Array.isArray(patch.changedLineItemDescriptions)
        ? [...patch.changedLineItemDescriptions]
        : []
    });
    setBillieChangePreview(buildBillieChangePreview(previousInvoice, nextInvoice));
    setTransientBillieHighlights(patch);
    showBillieStatus(
      {
        kind: patch.numbersUnchanged ? "safe" : "warning",
        text: patch.numbersUnchanged ? "Numbers unchanged" : "Review changes"
      },
      { durationMs: 9000 }
    );
  };

  const handleBilliePatchRejected = ({ patch }) => {
    const hasMoneyViolation = Array.isArray(patch?.violations)
      ? patch.violations.some((violation) => violation.type === "money")
      : false;
    showBillieStatus(
      {
        kind: hasMoneyViolation ? "warning" : "info",
        text: hasMoneyViolation ? "Money decision required" : "No changes applied"
      },
      { durationMs: 9000 }
    );
  };

  const handleApplySavedWording = (lineItemId, savedDescription) => {
    const normalizedDescription =
      typeof savedDescription === "string" ? savedDescription.trim() : "";
    if (!finishedInvoice || !lineItemId || !normalizedDescription) {
      return;
    }
    const previousInvoice = cloneJson(finishedInvoice);
    const nextLineItems = (Array.isArray(previousInvoice.lineItems) ? previousInvoice.lineItems : []).map(
      (lineItem) => {
        if (lineItem?.id !== lineItemId) {
          return lineItem;
        }
        return {
          ...lineItem,
          description: normalizedDescription
        };
      }
    );
    const targetLine = nextLineItems.find((lineItem) => lineItem?.id === lineItemId);
    const previousLine = (Array.isArray(previousInvoice.lineItems) ? previousInvoice.lineItems : []).find(
      (lineItem) => lineItem?.id === lineItemId
    );
    if (!targetLine || !previousLine) {
      return;
    }
    if ((previousLine.description ?? "").trim() === normalizedDescription) {
      showBillieStatus({ kind: "info", text: "Saved wording already matches this draft line" }, { durationMs: 4000 });
      return;
    }
    const nextInvoice = {
      ...previousInvoice,
      lineItems: nextLineItems
    };
    setFinishedInvoice(nextInvoice);
    setBillieUndoState({
      previousInvoice,
      changedLineItemIds: [lineItemId],
      changedLineItemDescriptions: [normalizedDescription]
    });
    setBillieChangePreview(buildBillieChangePreview(previousInvoice, nextInvoice));
    setTransientBillieHighlights({
      changedLineItemIds: [lineItemId],
      changedLineItemDescriptions: [normalizedDescription]
    });
    appendSummaryMessage(
      buildSummaryText(
        nextInvoice,
        openDecisions,
        unparsedLines.length,
        outputQuality?.blockerCount ?? 0
      ),
      buildReviewPayload(
        nextInvoice,
        openDecisions,
        unparsedLines,
        lastTranscriptRef.current,
        outputQuality ?? null,
        structuredInvoice
      )
    );
    showBillieStatus({ kind: "safe", text: "Numbers unchanged" }, { durationMs: 9000 });
  };

  const handleApplySavedNotes = (nextNotesText, mode = "replace") => {
    const incomingNotes = typeof nextNotesText === "string" ? nextNotesText.trim() : "";
    if (!finishedInvoice || !incomingNotes) {
      return;
    }
    const previousInvoice = cloneJson(finishedInvoice);
    const currentNotes = typeof previousInvoice.notes === "string" ? previousInvoice.notes.trim() : "";
    const normalizedCurrentNotes = currentNotes.toLowerCase();
    const normalizedIncomingNotes = incomingNotes.toLowerCase();
    if (mode === "append") {
      if (
        normalizedCurrentNotes &&
        (normalizedCurrentNotes === normalizedIncomingNotes ||
          normalizedCurrentNotes.includes(normalizedIncomingNotes))
      ) {
        showBillieStatus({ kind: "info", text: "That note is already included" }, { durationMs: 4000 });
        return;
      }
    } else if (currentNotes === incomingNotes) {
      showBillieStatus({ kind: "info", text: "Saved notes already match this draft" }, { durationMs: 4000 });
      return;
    }
    const nextNotes =
      mode === "append" ? mergeSuggestedNotes(currentNotes, incomingNotes) : incomingNotes;
    const nextInvoice = {
      ...previousInvoice,
      notes: nextNotes
    };
    setFinishedInvoice(nextInvoice);
    setBillieUndoState({
      previousInvoice,
      changedLineItemIds: [],
      changedLineItemDescriptions: []
    });
    setBillieChangePreview(buildBillieChangePreview(previousInvoice, nextInvoice));
    appendSummaryMessage(
      buildSummaryText(
        nextInvoice,
        openDecisions,
        unparsedLines.length,
        outputQuality?.blockerCount ?? 0
      ),
      buildReviewPayload(
        nextInvoice,
        openDecisions,
        unparsedLines,
        lastTranscriptRef.current,
        outputQuality ?? null,
        structuredInvoice
      )
    );
    showBillieStatus({ kind: "safe", text: "Numbers unchanged" }, { durationMs: 9000 });
  };

  const handleUndoBilliePatch = () => {
    if (!billieUndoState?.previousInvoice) {
      return;
    }
    const restoredInvoice = cloneJson(billieUndoState.previousInvoice);
    const restoredDecisions = Array.isArray(openDecisionsRef.current)
      ? openDecisionsRef.current
      : [];
    const restoredUnparsed = Array.isArray(unparsedLinesRef.current) ? unparsedLinesRef.current : [];
    const restoredQuality = outputQuality ?? null;
    setFinishedInvoice(restoredInvoice);
    setTransientBillieHighlights({
      changedLineItemIds: billieUndoState.changedLineItemIds ?? [],
      changedLineItemDescriptions: billieUndoState.changedLineItemDescriptions ?? []
    });
    appendSummaryMessage(
      buildSummaryText(
        restoredInvoice,
        restoredDecisions,
        restoredUnparsed.length,
        restoredQuality?.blockerCount ?? 0
      ),
      buildReviewPayload(
        restoredInvoice,
        restoredDecisions,
        restoredUnparsed,
        lastTranscriptRef.current,
        restoredQuality,
        structuredInvoice
      )
    );
    setBillieUndoState(null);
    setBillieChangePreview([]);
    showBillieStatus({ kind: "info", text: "Undid last Billie change" }, { durationMs: 5000 });
  };

  const handleBillieEditLifecycle = ({ phase, outcome, targetType }) => {
    if (phase === "start") {
      billieRefineStartMsRef.current = Date.now();
      const targetText =
        targetType === "line_item"
          ? "Billie: Refining selected line"
          : targetType === "notes"
            ? "Billie: Refining notes"
            : "Billie: Refining wording";
      showBillieStatus({ kind: "working", text: targetText }, { sticky: true });
      return;
    }
    if (phase !== "complete") {
      return;
    }
    const startedAtMs = Number.isFinite(billieRefineStartMsRef.current)
      ? billieRefineStartMsRef.current
      : null;
    if (billieTelemetryUtils && startedAtMs && outcome !== "ignored") {
      const durationMs = Math.max(0, Date.now() - startedAtMs);
      billieTelemetryUtils.recordRefineEvent({
        source: "intake",
        outcome,
        durationMs
      });
      setBillieRefineSummaryLabel(
        billieTelemetryUtils.formatRefineSummaryLabel(
          billieTelemetryUtils.getRefineSummary("intake")
        )
      );
    }
    billieRefineStartMsRef.current = null;
    if (outcome === "no_change") {
      showBillieStatus({ kind: "info", text: "No wording changes needed" }, { durationMs: 4000 });
      return;
    }
    if (outcome === "error") {
      showBillieStatus({ kind: "warning", text: "Refine failed. Draft unchanged." }, { durationMs: 5000 });
      return;
    }
    if (outcome === "ignored") {
      showBillieStatus(null);
    }
  };

  const appendSummaryMessage = (text, reviewPayload) => {
    setSummaryUpdatedAt(new Date());
    lastSummaryMetaRef.current = {
      at: Date.now(),
      requestId: requestIdRef.current
    };
    setIsTyping(false);
    setReviewCardCollapsed(true);
    setAssumptionsCollapsed(true);
    setShowChatInput(true);
    setMessages((prev) => {
      const next = [...prev];
      if (reviewPayload) {
        next.push({
          id: reviewPayload.id ?? `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "ai",
          kind: "review",
          payload: reviewPayload
        });
      }
      next.push({
        id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "ai",
        text
      });
      return next;
    });
  };

  const decisionItems = openDecisions.map((decision, index) => ({
    id: decision.id ?? `decision-${index}`,
    text: `Decision needed: ${decision.prompt}`,
    prompt: decision.prompt,
    kind: decision.kind,
    context: decision.sourceSnippet ?? ""
  }));
  const decisionApplyPending = Boolean(optimisticDecisionState?.pending);
  const optimisticHiddenDecisionIds = new Set(
    (optimisticDecisionState?.hiddenDecisionIds ?? []).map((value) => String(value))
  );
  const visibleDecisionSource = decisionApplyPending
    ? decisionItems.filter((item) => !optimisticHiddenDecisionIds.has(String(item.id)))
    : decisionItems;
  const optimisticHiddenCount = Math.max(0, decisionItems.length - visibleDecisionSource.length);

  const assumptionItems = (() => {
    if (finishedInvoice) {
      const orderedLineItems = orderLineItemsForTranscript(
        finishedInvoice.lineItems ?? [],
        lastTranscriptRef.current
      );
      const items = orderedLineItems.map((lineItem, index) => ({
        id: `assumption-line-${lineItem.id ?? index}`,
        text: `${formatDisplayDescription(lineItem.description)}${
          Number.isFinite(lineItem.amount) ? ` — ${formatMoney(lineItem.amount)}` : ""
        }`
      }));
      const qualityBlockers = Array.isArray(outputQuality?.blockers) ? outputQuality.blockers : [];
      qualityBlockers.forEach((blocker, index) => {
        items.unshift({
          id: `assumption-quality-${blocker.code ?? index}-${index}`,
          text: blocker.message ?? "Review item needs attention."
        });
      });
      if (pendingTaxRate) {
        items.unshift({
          id: "assumption-tax-rate",
          text: `Tax rate set to ${pendingTaxRate}% (draft).`
        });
      }
      if (finishedInvoice.notes) {
        items.push({ id: "assumption-notes", text: `Notes: ${finishedInvoice.notes}` });
      }
      if (finishedInvoice.customerName) {
        items.unshift({ id: "assumption-client", text: `Client: ${finishedInvoice.customerName}` });
      }
      return items;
    }
    if (laborPricingNote) {
      return [{ id: "labor-note", text: laborPricingNote }];
    }
    if (followUp?.type === "labor_pricing") {
      const itemCount = followUp.laborItems?.length ?? 0;
      return [
        {
          id: "pricing-needed",
          text: itemCount
            ? `Labor pricing needed for ${itemCount} item${itemCount > 1 ? "s" : ""}.`
            : "Labor pricing needed."
        }
      ];
    }
    return [];
  })();

  const filteredAssumptions = pendingTaxRate
    ? assumptions.filter((item) => !item.toLowerCase().includes("tax assumed"))
    : assumptions;
  const auditAssumptionItems = [
    ...(pendingTaxRate && !finishedInvoice
      ? [{ id: "assumption-tax-rate", text: `Tax rate set to ${pendingTaxRate}% (draft).` }]
      : []),
    ...filteredAssumptions.map((item, index) => ({
      id: `assumption-audit-${index}`,
      text: item
    }))
  ];

  const unparsedItems = unparsedLines.map((item, index) => ({
    id: `unparsed-${index}`,
    text: item
  }));

  const hasAssumptions =
    assumptionItems.length > 0 || auditAssumptionItems.length > 0 || unparsedItems.length > 0;
  const hasDecisions = decisionItems.length > 0;
  const hasVisibleDecisions = visibleDecisionSource.length > 0;
  const intakeReadiness = evaluateIntakeReadiness({
    intakePhase,
    followUp,
    finishedInvoice,
    openDecisionCount: openDecisions.length,
    qualityBlockerCount: outputQuality?.blockerCount ?? 0,
    pendingLaborRate
  });
  const openDecisionCount = intakeReadiness.openDecisionCount;
  const readinessSnapshot = {
    intakePhase,
    targetPhase: intakeReadiness.targetPhase,
    lockReason: intakeReadiness.lockReason,
    canGenerate: intakeReadiness.canGenerate,
    needsFollowUp: intakeReadiness.needsFollowUp,
    openDecisionCount: intakeReadiness.openDecisionCount,
    qualityBlockerCount: intakeReadiness.qualityBlockerCount,
    hasFinishedInvoice: intakeReadiness.hasFinishedInvoice,
    needsSummaryConfirmation: intakeReadiness.needsSummaryConfirmation
  };
  const readinessSignature = JSON.stringify(readinessSnapshot);
  const taxAssumptionPresent = assumptions.some((item) =>
    item.toLowerCase().includes("tax assumed")
  );
  const suggestedTaxRate = extractTaxRateFromText(lastTranscriptRef.current);
  const hasNonTaxAssumptions = assumptions.some(
    (item) => !item.toLowerCase().includes("tax assumed")
  );
  const hasExplicitTaxDraft = Boolean(pendingTaxRate && !finishedInvoice);
  const hasQualityBlockers = (outputQuality?.blockerCount ?? 0) > 0;
  const hasVisibleAssumptions = hasNonTaxAssumptions || unparsedItems.length > 0 || hasExplicitTaxDraft;
  const hasVisibleDetails =
    hasVisibleAssumptions ||
    hasQualityBlockers ||
    auditStatus === "timed_out" ||
    auditStatus === "failed";
  const importCoverageSummary = importStudioContext
    ? {
        captured: [
          importStudioContext.fileName ? `File: ${importStudioContext.fileName}` : null,
          importStudioContext.preview ? "Source preview loaded" : null,
          "Original text stays available for cleanup"
        ].filter(Boolean),
        cleanup: [
          `${importStudioContext.openDecisionCount} decision${importStudioContext.openDecisionCount === 1 ? "" : "s"} pending`,
          `${importStudioContext.unparsedCount} uncaptured line${importStudioContext.unparsedCount === 1 ? "" : "s"}`,
          `${importStudioContext.assumptionCount} assumption${importStudioContext.assumptionCount === 1 ? "" : "s"}`,
          importStudioContext.qualityBlockerCount > 0
            ? `${importStudioContext.qualityBlockerCount} quality blocker${importStudioContext.qualityBlockerCount === 1 ? "" : "s"}`
            : null,
          importStudioContext.needsFollowUp ? "Missing money details still need a reply" : null
        ].filter(Boolean)
      }
    : null;
  const importDraftComparison = importStudioContext
    ? {
        sourceSessions: Array.isArray(structuredInvoice?.workSessions)
          ? structuredInvoice.workSessions
              .map((session, index) => {
                const date = typeof session?.date === "string" ? session.date.trim() : "";
                const taskCount = Array.isArray(session?.tasks) ? session.tasks.length : 0;
                const taskPreview = Array.isArray(session?.tasks)
                  ? session.tasks
                      .map((task) => (typeof task?.description === "string" ? task.description.trim() : ""))
                      .filter(Boolean)
                      .slice(0, 2)
                  : [];
                return date
                  ? {
                      id: `source-session-${index}`,
                      date,
                      taskCount,
                      taskPreview
                    }
                  : null;
              })
              .filter(Boolean)
          : [],
        draftLineItems: Array.isArray(finishedInvoice?.lineItems)
          ? finishedInvoice.lineItems
              .map((item, index) => {
                const description =
                  typeof item?.description === "string" && item.description.trim()
                    ? item.description.trim()
                    : `Line item ${index + 1}`;
                const quantity = Number.isFinite(item?.quantity) ? Number(item.quantity) : null;
                const unitPrice = Number.isFinite(item?.unitPrice) ? Number(item.unitPrice) : null;
                const amount = Number.isFinite(item?.amount) ? Number(item.amount) : null;
                const parts = [];
                if (quantity !== null && unitPrice !== null) {
                  parts.push(`${quantity} × ${unitPrice}`);
                } else if (quantity !== null) {
                  parts.push(`Qty ${quantity}`);
                } else if (unitPrice !== null) {
                  parts.push(`Rate ${unitPrice}`);
                }
                if (amount !== null) {
                  parts.push(`Total ${amount}`);
                }
                return {
                  id: item?.id ?? `draft-line-${index}`,
                  description,
                  detail: parts.join(" • ")
                };
              })
              .filter(Boolean)
          : [],
        clientName:
          typeof finishedInvoice?.customerName === "string" && finishedInvoice.customerName.trim()
            ? finishedInvoice.customerName.trim()
            : typeof structuredInvoice?.customerName === "string" && structuredInvoice.customerName.trim()
              ? structuredInvoice.customerName.trim()
              : "",
        lineItemCount: Array.isArray(finishedInvoice?.lineItems) ? finishedInvoice.lineItems.length : 0,
        noteCount:
          typeof finishedInvoice?.notes === "string" && finishedInvoice.notes.trim()
            ? 1
            : 0,
        totalLabel: (() => {
          const totalValue = Number(finishedInvoice?.total);
          if (!Number.isFinite(totalValue)) {
            return "";
          }
          const currencyCode =
            typeof finishedInvoice?.currency === "string" && finishedInvoice.currency.trim().length === 3
              ? finishedInvoice.currency.trim().toUpperCase()
              : "USD";
          try {
            return new Intl.NumberFormat([], { style: "currency", currency: currencyCode }).format(totalValue);
          } catch (_error) {
            return totalValue.toFixed(2);
          }
        })(),
        statusLabel:
          finishedInvoice
            ? finishedInvoice.status === "estimate"
              ? "Estimate draft"
              : finishedInvoice.status === "partial"
                ? "Partial payment draft"
                : "Invoice draft"
            : "Waiting for the cleaned draft"
      }
    : null;
  const needsLaborPricing = intakeReadiness.needsFollowUp;
  const needsLaborHoursOnly = intakeReadiness.needsLaborHoursOnly;
  const showConfirmDetails =
    openDecisionCount > 0 || hasVisibleDetails || hasDecisions || needsLaborPricing || hasQualityBlockers;
  const showAssumptionsCard = hasReviewCard || showConfirmDetails;
  const showAssumptionDetails = !hasReviewCard || !assumptionsCollapsed;
  const showReviewSecondary = isCompactViewport ? !reviewCardCollapsed : true;
  const showReviewExpandedSections = !reviewCardCollapsed;
  const readinessDebugSnapshot = {
    ...readinessSnapshot,
    showAssumptionsCard,
    showAssumptionDetails,
    showReviewSecondary,
    showReviewExpandedSections,
    showChatInput,
    summaryLocked: summaryLockRef.current,
    requestId: requestIdRef.current,
    followUpType: followUp?.type ?? null,
    pendingLaborRate,
    pendingTaxRate
  };
  const readinessDebugFields = [
    ["phase", readinessDebugSnapshot.intakePhase],
    ["target", readinessDebugSnapshot.targetPhase],
    ["lock", readinessDebugSnapshot.lockReason],
    ["step", intakeReadiness.wizardStep],
    ["canGenerate", readinessDebugSnapshot.canGenerate ? "true" : "false"],
    ["needsFollowUp", readinessDebugSnapshot.needsFollowUp ? "true" : "false"],
    ["openDecisions", String(readinessDebugSnapshot.openDecisionCount)],
    ["qualityBlockers", String(readinessDebugSnapshot.qualityBlockerCount ?? 0)],
    ["needsConfirm", readinessDebugSnapshot.needsSummaryConfirmation ? "true" : "false"],
    ["showChatInput", readinessDebugSnapshot.showChatInput ? "true" : "false"],
    ["summaryLocked", readinessDebugSnapshot.summaryLocked ? "true" : "false"]
  ];

  const summaryTimeLabel = summaryUpdatedAt
    ? summaryUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
  const auditSummaryTimeLabel = auditSummaryAt
    ? new Date(auditSummaryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
  const summarySnapshot = (() => {
    if (!finishedInvoice || !finishedInvoice.lineItems?.length) {
      return "";
    }
    const parts = [`Captured ${finishedInvoice.lineItems.length} line item${finishedInvoice.lineItems.length > 1 ? "s" : ""}`];
    if (openDecisionCount > 0) {
      parts.push(`${openDecisionCount} decision${openDecisionCount > 1 ? "s" : ""} pending`);
    }
    if (unparsedItems.length > 0) {
      parts.push(`${unparsedItems.length} not captured`);
    }
    return parts.join(" • ");
  })();
  const wizardStep = intakeReadiness.wizardStep;
  const wizardSteps = [
    { id: "paste", label: "Paste" },
    { id: "review", label: "Review" },
    { id: "decisions", label: "Decisions" },
    { id: "confirm", label: "Generate" }
  ];
  const wizardStepIndex = wizardSteps.findIndex((step) => step.id === wizardStep);
  const safeWizardStepIndex = wizardStepIndex >= 0 ? wizardStepIndex : 0;
  const wizardStepLabel = wizardSteps[safeWizardStepIndex]?.label || "Paste";
  const shouldShowWizardDetails = !isCompactViewport || wizardStepsExpanded;
  const wizardProgressPercent = ((safeWizardStepIndex + 1) / wizardSteps.length) * 100;
  const starterWalkthroughSteps = [
    {
      id: "sample",
      label: "Sample notes loaded",
      complete: Boolean(inputValue.trim())
    },
    {
      id: "review",
      label: "Draft review visible",
      complete: hasReviewCard
    },
    {
      id: "generate",
      label: "Ready to generate",
      complete: Boolean(intakeReadiness.canGenerate)
    }
  ];
  const scrollToSection = (ref) => {
    if (!ref?.current) {
      return;
    }
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const needsSummaryConfirmation = intakeReadiness.needsSummaryConfirmation;
  const showQuickDecisions =
    decisionApplyPending ||
    (intakeReadiness.lockReason === "open_decisions" &&
      (hasVisibleDecisions || taxAssumptionPresent || pendingTaxRate));
  const hasMoreDecisions = visibleDecisionSource.length > 1;
  const clampedDecisionIndex = Math.min(
    decisionFocusIndex,
    Math.max(0, visibleDecisionSource.length - 1)
  );
  const focusedDecisionItem = visibleDecisionSource[clampedDecisionIndex];
  const visibleDecisionItems = showAllDecisions
    ? visibleDecisionSource
    : focusedDecisionItem
      ? [focusedDecisionItem]
      : [];
  const decisionProgressLabel = hasMoreDecisions
    ? `${clampedDecisionIndex + 1} of ${visibleDecisionSource.length}`
    : "1 of 1";
  const displayOpenDecisionCount = decisionApplyPending
    ? Math.max(0, openDecisionCount - optimisticHiddenCount)
    : openDecisionCount;
  const quickDecisionHeading = decisionApplyPending
    ? "Applying decision"
    : displayOpenDecisionCount > 0
      ? "Needs your call"
      : "Tax choice";
  const quickReplyLabel = needsLaborHoursOnly
    ? "Suggested hours"
    : needsLaborPricing
      ? "Suggested rates"
      : "Quick replies";
  const hasIntakeProgress =
    messages.length > 1 ||
    Boolean(inputValue.trim()) ||
    Boolean(followUp) ||
    intakePhase !== "collecting" ||
    hasReviewCard;
  const intakeHeaderStatus = hasReviewCard
    ? "Draft in progress"
    : intakePhase === "awaiting_follow_up"
      ? "Waiting for your pricing input"
      : "Ready for notes";
  const billieWorkspaceVisible = hasReviewCard && intakePhase !== "awaiting_follow_up";
  const showBillieComposer = (showChatInput || billieWorkspaceVisible) && intakePhase !== "awaiting_follow_up";
  const billieActionChips = billieWorkspaceVisible
    ? [
        {
          id: "billie-refine",
          label: "Refine wording",
          value: "Refine wording for clarity and professionalism. Keep all numbers and line items unchanged.",
          tone: "Professional"
        },
        {
          id: "billie-simpler",
          label: "Make simpler",
          value: "Rewrite descriptions in simpler plain language. Keep all numbers and line items unchanged.",
          tone: "Simpler"
        },
        {
          id: "billie-formal",
          label: "More formal",
          value: "Make the invoice language more formal and client-ready. Keep all numbers and line items unchanged.",
          tone: "More formal"
        },
        {
          id: "billie-stronger",
          label: "Make stronger",
          value: "Use stronger, confident action verbs for each line item. Keep all numbers and line items unchanged.",
          tone: "Stronger"
        }
      ]
    : [];
  useEffect(() => {
    if (!isCompactViewport || !billieWorkspaceVisible) {
      setBillieChipTrayExpanded(false);
    }
  }, [isCompactViewport, billieWorkspaceVisible]);
  const visibleBillieActionChips =
    isCompactViewport && !billieChipTrayExpanded ? billieActionChips.slice(0, 3) : billieActionChips;
  const hasHiddenBillieActionChips =
    isCompactViewport && billieActionChips.length > visibleBillieActionChips.length;
  const canSendWhileTyping = false;
  const canGenerateInvoice = intakeReadiness.canGenerate;
  const ctaDisabled = !canGenerateInvoice;
  const ctaHelper = intakeReadiness.helperText;
  const hasDecisionPrimaryPath = intakeReadiness.lockReason === "open_decisions";
  const primaryCtaLabel = hasDecisionPrimaryPath ? "Resolve decisions" : "Generate Invoice";
  const primaryCtaDisabled = hasDecisionPrimaryPath ? false : ctaDisabled;
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planLimitReached = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const useStripeUpgradeAction = accountPlan?.plan === "free" && hasStripeCheckout(accountPlan);
  const showUpgradeAction = planLimitReached && (Boolean(upgradeUrl) || useStripeUpgradeAction);
  const showIntakePlanBanner = hasReviewCard && planLimitReached;
  const reviewDetailsToggleLabel = reviewCardCollapsed ? "Show review details" : "Hide review details";
  const showContextDetailsToggle = hasReviewCard && hasVisibleDetails;
  const contextDetailsToggleLabel = assumptionsCollapsed
    ? "Show context details"
    : "Hide context details";
  const activeBillieStatus = billieStatus ?? { kind: "ready", text: "Billie ready" };
  const billieChangeSummary = useMemo(
    () => buildBillieChangeSummary(billieChangePreview),
    [billieChangePreview]
  );
  const billieStatusClass =
    activeBillieStatus.kind === "safe"
      ? "nb-assistant-chip nb-assistant-chip--safe"
      : activeBillieStatus.kind === "warning"
        ? "nb-assistant-chip nb-assistant-chip--warning"
        : activeBillieStatus.kind === "working"
          ? "nb-assistant-chip nb-assistant-chip--working"
          : "nb-assistant-chip nb-assistant-chip--ready";
  const decisionIncludeButtonClass =
    "rounded-full border border-amber-600 bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:border-amber-300 disabled:bg-amber-300";
  const decisionExcludeButtonClass =
    "rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300";

  const handlePrimaryCta = () => {
    if (hasDecisionPrimaryPath) {
      scrollToSection(decisionsRef);
      return;
    }
    handleGenerateInvoice();
  };

  const handleUpgradeAction = async () => {
    if (!showUpgradeAction || billingBusy) {
      return;
    }
    setBillingError("");
    setBillingBusy(true);
    try {
      if (useStripeUpgradeAction) {
        await startUpgradeCheckout(accountPlan, {
          successPath: "/ai-intake?billing=success",
          cancelPath: "/ai-intake?billing=cancelled"
        });
        return;
      }
      if (upgradeUrl) {
        window.open(upgradeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Upgrade is not configured yet.");
    } catch (error) {
      setBillingError(error?.message || "Unable to open upgrade.");
    } finally {
      setBillingBusy(false);
    }
  };

  const focusInputWithValue = (value) => {
    const nextValue = value ?? "";
    setInputValue(nextValue);
    if (hasReviewCard) {
      setShowChatInput(true);
    }
    setTimeout(() => {
      const inputs = Array.from(document.querySelectorAll("textarea#ai-intake-input"));
      const input =
        inputs.find((candidate) => {
          const element = candidate;
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
        }) ?? inputs[0];
      if (input) {
        input.focus();
        if (typeof input.setSelectionRange === "function") {
          const length = input.value.length;
          input.setSelectionRange(length, length);
        }
      }
    }, 0);
  };

  const retryWithShortPass = () => {
    if (!timeoutMessageIdRef.current) {
      return;
    }
    dismissTimeoutMessage(timeoutMessageIdRef.current);
    abortOngoingRequest();
    if (!lastMessagesRef.current.length) {
      return;
    }
    runIntakeRequest(lastMessagesRef.current, lastUserMessageRef.current, {
      mode: "fast",
      forceShortPass: true
    });
  };

  const handleTimeoutKeepWorking = (messageId) => {
    dismissTimeoutMessage(messageId);
  };

  const handleTimeoutCancel = (messageId) => {
    dismissTimeoutMessage(messageId);
    abortOngoingRequest();
    setIntakePhase("collecting");
    appendAiMessage("Canceled. You can shorten the notes and try again.");
  };
  const { runDeepAudit, runIntakeRequest, runDecisionActionRequest, runLaborPricingRequest } =
    createIntakeOrchestrator({
      slowResponseTimeoutRef,
      requestIdRef,
      auditRequestIdRef,
      timeoutMessageIdRef,
      abortControllerRef,
      lastMessagesRef,
      lastTranscriptRef,
      lastUserMessageRef,
      lastIntakeModeRef,
      openDecisionSignatureRef,
      lastSummaryMetaRef,
      intakePhaseRef,
      summaryLockRef,
      openDecisionsRef,
      assumptionsRef,
      unparsedLinesRef,
      decisionActionRef,
      pendingDecisionUndoRef,
      lastDecisionResolutionRef,
      setIsTyping,
      setAuditStatus,
      setAuditSummary,
      setAuditSummaryAt,
      setOpenDecisions,
      setAssumptions,
      setUnparsedLines,
      setOutputQuality,
      setPendingLaborRate,
      setPendingTaxRate,
      setLaborPricingNote,
      setFollowUp,
      setStructuredInvoice,
      setFinishedInvoice,
      setIntakePhase,
      appendAiMessage,
      appendSummaryMessage,
      showDecisionToast,
      startDecisionUndoWindow,
      clearDecisionUndoState,
      evaluateResponseReadiness,
      logReadinessEvent,
      shouldUseFastMode,
      shouldRunDeepAudit,
      getSlowResponseDelay,
      clearSlowResponseTimer,
      dismissTimeoutMessage,
      appendTimeoutMessage,
      shouldIgnorePostSummaryResponse,
      abortOngoingRequest,
      onDecisionRequestComplete: handleDecisionRequestComplete,
      mergeDecisionLists,
      mergeUniqueList,
      buildDecisionAckMessage,
      applyDecisionActionToInvoice,
      buildDecisionFollowUp,
      buildSummaryText,
      buildReviewPayload,
      buildTranscript,
      structuredInvoice
    });

  const handleManualDeepAudit = () => {
    const transcript = lastTranscriptRef.current ?? "";
    if (!structuredInvoice || !transcript.trim()) {
      return;
    }
    runDeepAudit({
      structuredInvoice,
      sourceText: transcript,
      decisionSignature: openDecisionSignatureRef.current ?? "",
      summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null
    });
  };

  const quickReplies = buildLaborQuickReplies({
    intakePhase,
    followUp,
    pendingLaborRate,
    savedLaborRate,
    currentClientName:
      finishedInvoice?.customerName ??
      structuredInvoice?.customerName ??
      followUp?.customerName ??
      "",
    lineItemLibrary: savedLineItemLibrary,
    formatRateToken
  });

  const handleGenerateInvoice = () => {
    if (!finishedInvoice) {
      return;
    }
    try {
      const draft = applyBusinessProfileToDraft(
        buildDraftFromInvoice(finishedInvoice, pendingTaxRate ?? "0", lastTranscriptRef.current)
      );
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      completeOnboardingStep("open_editor");
      navigate("/manual");
    } catch (error) {
      console.error("Failed to seed draft", error);
      appendAiMessage("Something went wrong while creating the draft.");
    }
  };

  const buildManualBillieHandoffInstruction = () => {
    const lineItemCount = Array.isArray(finishedInvoice?.lineItems)
      ? finishedInvoice.lineItems.filter((item) => typeof item?.description === "string" && item.description.trim()).length
      : 0;
    const hasNotes = typeof finishedInvoice?.notes === "string" && finishedInvoice.notes.trim().length > 0;
    if (lineItemCount > 0 && hasNotes) {
      return "Refine the line item wording and notes so this invoice feels polished and client-ready. Keep numbers unchanged.";
    }
    if (lineItemCount > 0) {
      return "Refine the line item wording so this invoice feels polished and client-ready. Keep numbers unchanged.";
    }
    if (hasNotes) {
      return "Refine the notes so this invoice feels polished and client-ready. Keep numbers unchanged.";
    }
    return "Refine the client-facing wording and presentation while keeping numbers unchanged.";
  };

  const handleOpenManualBillieWorkspace = () => {
    if (!finishedInvoice) {
      return;
    }
    try {
      const draft = applyBusinessProfileToDraft(
        buildDraftFromInvoice(finishedInvoice, pendingTaxRate ?? "0", lastTranscriptRef.current)
      );
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      window.localStorage.setItem(
        billieWorkspaceStorageKey,
        buildManualBillieHandoffInstruction()
      );
      completeOnboardingStep("open_editor");
      navigate("/manual?tab=assistant&source=intake");
    } catch (error) {
      console.error("Failed to seed Billie handoff draft", error);
      appendAiMessage("Something went wrong while opening Billie workspace.");
    }
  };

  const handleLoadStarterSample = () => {
    setInputValue(SAMPLE_JOB_NOTES);
    setStarterGuideActive(true);
    setVoiceNoteNotice("Sample notes loaded. Review them, then build the invoice.");
    completeOnboardingStep("capture_notes");
  };

  const triggerVoiceNoteUpload = () => {
    audioUploadInputRef.current?.click();
  };

  const handleVoiceNoteSelected = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    setVoiceNoteBusy(true);
    setVoiceNoteError("");
    setVoiceNoteNotice("");
    try {
      const formData = new FormData();
      formData.append("audioFile", file);
      const response = await apiFetch("/api/invoices/transcribe-audio", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not transcribe that audio note.");
      }
      const transcript = typeof payload?.extractedText === "string" ? payload.extractedText.trim() : "";
      if (!transcript) {
        throw new Error("No transcript returned for that audio note.");
      }
      setInputValue((current) => [current.trim(), transcript].filter(Boolean).join("\n\n"));
      setVoiceNoteNotice(`Added transcript from ${file.name}. Review it, then build the invoice.`);
    } catch (error) {
      setVoiceNoteError(error?.message || "Could not transcribe that audio note.");
    } finally {
      setVoiceNoteBusy(false);
      if (event?.target) {
        event.target.value = "";
      }
    }
  };

  const handleResetIntake = () => {
    requestIdRef.current += 1;
    setMessages(initialIntakeMessages);
    setInputValue("");
    setIsTyping(false);
    setIntakePhase("collecting");
    setFollowUp(null);
    setStructuredInvoice(null);
    setFinishedInvoice(null);
    setLaborPricingNote("");
    setPendingLaborRate(null);
    setPendingTaxRate(null);
    setOpenDecisions([]);
    setAssumptions([]);
    setUnparsedLines([]);
    setOutputQuality(null);
    setAuditStatus(null);
    setAuditSummary("");
    setAuditSummaryAt(null);
    setSummaryUpdatedAt(null);
    setReviewCardCollapsed(true);
    setShowChatInput(false);
    setAssumptionsCollapsed(true);
    setShowAllDecisions(false);
    setDecisionFocusIndex(0);
    setShowDecisionWhy(false);
    setDecisionToast(null);
    setDecisionUndoState(null);
    setBillieStatus(null);
    setBillieUndoState(null);
    setBillieChangePreview([]);
    setRecentlyChangedLines({ ids: [], descriptions: [] });
    openDecisionSignatureRef.current = "";
    lastDecisionResolutionRef.current = "";
    decisionActionRef.current = null;
    pendingDecisionUndoRef.current = null;
    if (decisionToastTimeoutRef.current) {
      window.clearTimeout(decisionToastTimeoutRef.current);
      decisionToastTimeoutRef.current = null;
    }
    if (decisionUndoTimeoutRef.current) {
      window.clearTimeout(decisionUndoTimeoutRef.current);
      decisionUndoTimeoutRef.current = null;
    }
    if (billieStatusTimeoutRef.current) {
      window.clearTimeout(billieStatusTimeoutRef.current);
      billieStatusTimeoutRef.current = null;
    }
    if (billieHighlightTimeoutRef.current) {
      window.clearTimeout(billieHighlightTimeoutRef.current);
      billieHighlightTimeoutRef.current = null;
    }
    auditRequestIdRef.current += 1;
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleMediaChange = (event) => {
      setIsCompactViewport(Boolean(event?.matches));
    };
    setIsCompactViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaChange);
      return () => mediaQuery.removeEventListener("change", handleMediaChange);
    }
    mediaQuery.addListener(handleMediaChange);
    return () => mediaQuery.removeListener(handleMediaChange);
  }, []);

  useEffect(() => {
    if (!isCompactViewport) {
      setWizardStepsExpanded(false);
    }
  }, [isCompactViewport]);

  useEffect(() => {
    if (!readinessDebugEnabled) {
      setReadinessPanelOpen(false);
      setReadinessDebugEvents([]);
      return;
    }
    setReadinessPanelOpen(true);
  }, [readinessDebugEnabled]);

  useEffect(() => {
    if (!readinessDebugEnabled || typeof window === "undefined") {
      return;
    }
    const handleReadinessEvent = (event) => {
      const detail = event?.detail;
      if (!detail?.event) {
        return;
      }
      setReadinessDebugEvents((previous) => {
        const nextEvent = {
          event: detail.event,
          payload: detail.payload ?? {},
          timestamp: Number.isFinite(detail.timestamp) ? detail.timestamp : Date.now()
        };
        const tail = previous.slice(-11);
        return [...tail, nextEvent];
      });
    };
    window.addEventListener("invoice:readiness-debug", handleReadinessEvent);
    return () => window.removeEventListener("invoice:readiness-debug", handleReadinessEvent);
  }, [readinessDebugEnabled]);

  useEffect(() => {
    const previousCount = lastDecisionCountRef.current;
    if (openDecisions.length > 0 && previousCount === 0) {
      scrollToSection(decisionsRef);
    }
    lastDecisionCountRef.current = openDecisions.length;
  }, [openDecisions.length]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    return () => {
      if (decisionToastTimeoutRef.current) {
        window.clearTimeout(decisionToastTimeoutRef.current);
        decisionToastTimeoutRef.current = null;
      }
      if (decisionUndoTimeoutRef.current) {
        window.clearTimeout(decisionUndoTimeoutRef.current);
        decisionUndoTimeoutRef.current = null;
      }
      if (billieStatusTimeoutRef.current) {
        window.clearTimeout(billieStatusTimeoutRef.current);
        billieStatusTimeoutRef.current = null;
      }
      if (billieHighlightTimeoutRef.current) {
        window.clearTimeout(billieHighlightTimeoutRef.current);
        billieHighlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    intakePhaseRef.current = intakePhase;
    summaryLockRef.current = intakePhase === "ready_to_generate";
  }, [intakePhase]);

  useEffect(() => {
    if (!isReadinessDebugEnabled()) {
      return;
    }
    if (readinessSignature === readinessSignatureRef.current) {
      return;
    }
    readinessSignatureRef.current = readinessSignature;
  }, [readinessSignature]);

  useEffect(() => {
    if (importSeedRef.current) {
      return;
    }
    const seedFromScoped = readDraftFromStorage(importSeedStorageKey);
    const seedFromLegacy =
      !seedFromScoped && importSeedStorageKey !== legacyImportSeedStorageKey
        ? readDraftFromStorage(legacyImportSeedStorageKey)
        : null;
    const seed = seedFromScoped ?? seedFromLegacy;
    if (!seed) {
      return;
    }
    importSeedRef.current = true;
    window.localStorage.removeItem(seedFromScoped ? importSeedStorageKey : legacyImportSeedStorageKey);

    const payload = seed?.payload ?? {};
    const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
    const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
    const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
    const fileName = typeof seed?.fileName === "string" ? seed.fileName.trim() : "";
    const notes = typeof seed?.notes === "string" ? seed.notes.trim() : "";
    const userText =
      [fileName ? `Uploaded invoice: ${fileName}.` : "", notes].filter(Boolean).join(" ").trim() ||
      "Uploaded an invoice to import.";
    const seedTranscript =
      typeof seed?.sourceText === "string" && seed.sourceText.trim()
        ? seed.sourceText.trim()
        : userText;
    const nextSeedFollowUp = payload?.needsFollowUp ? payload.followUp ?? null : null;
    const nextSeedInvoice = payload?.needsFollowUp ? null : payload?.invoice ?? null;
    const nextSeedQuality = payload?.qualityGate ?? null;
    setImportStudioContext({
      fileName,
      sourceText: seedTranscript,
      preview: formatImportStudioPreview(seedTranscript),
      openDecisionCount: nextOpenDecisions.length,
      assumptionCount: nextAssumptions.length,
      unparsedCount: nextUnparsedLines.length,
      qualityBlockerCount: nextSeedQuality?.blockerCount ?? 0,
      needsFollowUp: Boolean(payload?.needsFollowUp)
    });
    const seedReadiness = evaluateResponseReadiness({
      followUp: nextSeedFollowUp,
      finishedInvoice: nextSeedInvoice,
      openDecisionCount: nextOpenDecisions.length,
      qualityBlockerCount: nextSeedQuality?.blockerCount ?? 0,
      pendingLaborRate: null
    });
    logReadinessEvent("import_seed", {
      payloadNeedsFollowUp: Boolean(payload?.needsFollowUp),
      seedTargetPhase: seedReadiness.targetPhase,
      seedLockReason: seedReadiness.lockReason,
      seedCanGenerate: seedReadiness.canGenerate,
      openDecisionCount: nextOpenDecisions.length,
      qualityBlockerCount: nextSeedQuality?.blockerCount ?? 0,
      hasInvoice: Boolean(nextSeedInvoice)
    });
    const seededMessages = [
      initialIntakeMessages[0],
      { id: `msg-${Date.now()}-user`, role: "user", text: userText }
    ];

    setMessages(seededMessages);
    setInputValue("");
    setIsTyping(false);
    setAuditSummary("");
    setAuditSummaryAt(null);
    setSummaryUpdatedAt(null);
    setOpenDecisions(nextOpenDecisions);
    setAssumptions(nextAssumptions);
    setUnparsedLines(nextUnparsedLines);
    setOutputQuality(nextSeedQuality);
    setAuditStatus(payload?.auditStatus ?? null);
    setStructuredInvoice(payload?.structuredInvoice ?? null);
    setPendingLaborRate(null);
    setPendingTaxRate(null);

    lastMessagesRef.current = seededMessages;
    lastTranscriptRef.current = seedTranscript;
    lastUserMessageRef.current = userText;
    lastIntakeModeRef.current = "full";

    if (payload?.needsFollowUp) {
      setLaborPricingNote("");
      setFollowUp(payload.followUp ?? null);
      setFinishedInvoice(null);
      setIntakePhase(seedReadiness.targetPhase);
      return;
    }

    const nextInvoice = payload?.invoice ?? null;
    if (!nextInvoice) {
      appendAiMessage(
        "I could not build a usable draft from that upload. Try another file, or paste the key details."
      );
      setIntakePhase(seedReadiness.targetPhase);
      return;
    }

    setFollowUp(null);
    setFinishedInvoice(nextInvoice);
    const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
    openDecisionSignatureRef.current = decisionSignature;
    setIntakePhase(seedReadiness.targetPhase);
    appendSummaryMessage(
      buildSummaryText(
        nextInvoice,
        nextOpenDecisions,
        nextUnparsedLines.length,
        nextSeedQuality?.blockerCount ?? 0
      ),
      buildReviewPayload(
        nextInvoice,
        nextOpenDecisions,
        nextUnparsedLines,
        seedTranscript,
        nextSeedQuality,
        payload?.structuredInvoice ?? null
      )
    );
  }, [importSeedStorageKey, legacyImportSeedStorageKey]);

  useEffect(() => {
    const seedFromScoped = readDraftFromStorage(scratchpadSeedStorageKey);
    const seedFromLegacy =
      !seedFromScoped && scratchpadSeedStorageKey !== legacyScratchpadSeedStorageKey
        ? readDraftFromStorage(legacyScratchpadSeedStorageKey)
        : null;
    const seed = seedFromScoped ?? seedFromLegacy;
    if (!seed || inputValue.trim() || messages.length > initialIntakeMessages.length) {
      return;
    }
    const nextText = typeof seed?.text === "string" ? seed.text.trim() : "";
    if (!nextText) {
      return;
    }
    const seedTags = Array.isArray(seed?.tags) ? seed.tags.filter((tag) => typeof tag === "string" && tag.trim()) : [];
    setInputValue(nextText);
    setScratchpadSeedNotice(
      seedTags.length > 0
        ? `Scratchpad note loaded with tags: ${seedTags.map((tag) => `#${tag}`).join(", ")}`
        : "Scratchpad note loaded into Billie intake."
    );
    window.localStorage.removeItem(seedFromScoped ? scratchpadSeedStorageKey : legacyScratchpadSeedStorageKey);
  }, [scratchpadSeedStorageKey, legacyScratchpadSeedStorageKey, inputValue, messages.length]);

  useEffect(() => {
    if (hasReviewCard && !hasAutoCollapsedRef.current) {
      setAssumptionsCollapsed(true);
      hasAutoCollapsedRef.current = true;
    }
  }, [hasReviewCard]);

  useEffect(() => {
    if (hasReviewCard) {
      completeOnboardingStep("review_draft");
    }
  }, [hasReviewCard]);

  useEffect(() => {
    openDecisionsRef.current = openDecisions;
  }, [openDecisions]);

  useEffect(() => {
    setShowAllDecisions(false);
    setDecisionFocusIndex(0);
    setShowDecisionWhy(false);
  }, [openDecisions.length]);

  useEffect(() => {
    assumptionsRef.current = assumptions;
  }, [assumptions]);

  useEffect(() => {
    unparsedLinesRef.current = unparsedLines;
  }, [unparsedLines]);

  const { submitUserMessage, refineBillieLineItem, refineBillieNotes } = createIntakeActionHandlers({
    requestIdRef,
    lastDecisionResolutionRef,
    lastTranscriptRef,
    setMessages,
    setInputValue,
    setPendingTaxRate,
    setPendingLaborRate,
    setLaborPricingNote,
    setSavedLaborRate,
    setFinishedInvoice,
    setIntakePhase,
    setIsTyping,
    appendAiMessage,
    appendSummaryMessage,
    runIntakeRequest,
    runDecisionActionRequest,
    runLaborPricingRequest,
    evaluateIntakeReadiness,
    logReadinessEvent,
    buildSummaryText,
    buildReviewPayload,
    buildTranscript,
    extractTaxRateFromText,
    isExplicitNoTax,
    storeLaborRate: (rate) => storeLaborRate(rate, laborRateStorageKey),
    onBilliePatchApplied: handleBilliePatchApplied,
    onBilliePatchRejected: handleBilliePatchRejected,
    onBillieEditLifecycle: handleBillieEditLifecycle,
    rejectionKeywords,
    getDecisionAction: () => decisionActionRef.current,
    getState: () => ({
      structuredInvoice,
      finishedInvoice,
      openDecisions,
      assumptions,
      unparsedLines,
      outputQuality,
      pendingLaborRate,
      pendingTaxRate,
      messages,
      isTyping,
      intakePhase,
      intakeReadiness,
      hasReviewCard,
      showChatInput: showChatInput || billieWorkspaceVisible,
      followUp
    })
  });

  const handleSubmitUserMessage = (text, options = {}) => {
    const accepted = submitUserMessage(text, options);
    if (accepted && typeof text === "string" && text.trim()) {
      completeOnboardingStep("capture_notes");
    }
    return accepted;
  };

  const handleOnboardingContinue = (step) => {
    if (!step?.id) {
      return;
    }
    if (step.id === "capture_notes") {
      if (!inputValue.trim()) {
        handleLoadStarterSample();
      }
      return;
    }
    if (step.id === "review_draft") {
      if (!hasReviewCard && inputValue.trim()) {
        handleSubmitUserMessage(inputValue);
      }
      return;
    }
    if (step.id === "open_editor") {
      if (finishedInvoice) {
        handleGenerateInvoice();
      }
      return;
    }
    navigate("/manual");
  };

  const handleDismissWalkthrough = () => {
    dismissOnboardingWalkthrough();
    setStarterGuideActive(false);
    refreshOnboardingStatus();
  };

  const handleSend = (event) => {
    event.preventDefault();
    handleSubmitUserMessage(inputValue);
  };
  const intakeRepeatSuggestionCount =
    (Array.isArray(reviewRepeatWorkContext?.matchedSavedItems)
      ? reviewRepeatWorkContext.matchedSavedItems.length
      : 0) +
    (Array.isArray(reviewRepeatWorkContext?.noteSuggestions)
      ? reviewRepeatWorkContext.noteSuggestions.length
      : 0);
  const billieNextUpGuide = (() => {
    if (!inputValue.trim() && !hasReviewCard && !followUp) {
      return {
        eyebrow: "Billie next up",
        title: "Load notes to start the draft.",
        detail:
          "Paste rough job notes, add a voice note, or use the sample path so Billie has something real to organize.",
        actions: [
          {
            id: "sample",
            label: "Try sample notes",
            onClick: handleLoadStarterSample
          },
          {
            id: "focus-notes",
            label: "Paste notes",
            onClick: () => focusInputWithValue("")
          }
        ]
      };
    }

    if (!hasReviewCard && inputValue.trim()) {
      return {
        eyebrow: starterGuideActive ? "Starter walkthrough" : "Billie next up",
        title: starterGuideActive ? "Build this sample into a draft." : "Build the draft from these notes.",
        detail: starterGuideActive
          ? "Scan the sample job first, then let Billie turn it into a reviewable draft."
          : "Billie has enough detail to structure a draft. Build it now so you can review the money decisions in context.",
        actions: [
          {
            id: "build-draft",
            label: isTyping ? "Building..." : "Build invoice",
            disabled: isTyping,
            onClick: () => handleSubmitUserMessage(inputValue)
          }
        ]
      };
    }

    if (intakePhase === "awaiting_follow_up" && followUp) {
      return {
        eyebrow: "Billie next up",
        title: "Answer the missing pricing question.",
        detail:
          followUp.message || "Billie found missing money details. Reply with the rate, hours, or amount before continuing.",
        actions: [
          {
            id: "reply",
            label: "Reply with pricing",
            onClick: () => focusInputWithValue(inputValue || "")
          }
        ]
      };
    }

    if (displayOpenDecisionCount > 0) {
      return {
        eyebrow: "Billie next up",
        title: "Resolve the money decisions first.",
        detail:
          displayOpenDecisionCount === 1
            ? "There is 1 billable choice still open. Pick Add or Skip so Billie can finish the draft safely."
            : `There are ${displayOpenDecisionCount} billable choices still open. Clear those first so the draft can move forward safely.`,
        actions: [
          {
            id: "resolve-decisions",
            label: "Resolve decisions",
            onClick: () => scrollToSection(decisionsRef)
          },
          {
            id: "ask-billie",
            label: "Ask Billie",
            onClick: () => focusInputWithValue("Update: ")
          }
        ]
      };
    }

    if (hasReviewCard && !canGenerateInvoice) {
      return {
        eyebrow: "Billie next up",
        title: "Review the draft before you generate.",
        detail:
          intakeRepeatSuggestionCount > 0
            ? `Billie also found ${intakeRepeatSuggestionCount} repeat-work cue${
                intakeRepeatSuggestionCount > 1 ? "s" : ""
              } you can reuse before opening the editor.`
            : ctaHelper || "Use the review card to check wording, notes, and any items Billie could not fully place yet.",
        actions: [
          !showReviewExpandedSections
            ? {
                id: "show-details",
                label: "Show review details",
                onClick: () => setReviewCardCollapsed(false)
              }
            : null,
          {
            id: "ask-billie",
            label: "Ask Billie",
            onClick: () => focusInputWithValue("Update: ")
          }
        ].filter(Boolean)
      };
    }

    if (hasReviewCard && canGenerateInvoice) {
      return {
        eyebrow: "Billie next up",
        title: "The draft is ready for the editor.",
        detail:
          intakeRepeatSuggestionCount > 0
            ? `Review the saved wording and note cues if you want, then open the editor with repeat-work context already in place.`
            : "Billie finished the capture pass. Generate now and continue the handoff in the manual editor.",
        actions: [
          {
            id: "generate",
            label: "Generate Invoice",
            onClick: handleGenerateInvoice
          },
          {
            id: "open-billie-workspace",
            label: "Open Billie workspace",
            onClick: handleOpenManualBillieWorkspace
          },
          {
            id: "ask-billie",
            label: "Ask Billie",
            onClick: () => focusInputWithValue("Update: ")
          }
        ]
      };
    }

    return null;
  })();

  return (
    <div className="nb-page nb-page--intake flex min-h-screen flex-col">
      <header className="nb-page-header">
        <div className="nb-page-header__inner max-w-6xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="nb-btn-ghost"
              onClick={() => navigate("/")}
            >
              Back
            </button>
            {hasIntakeProgress ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900"
                onClick={handleResetIntake}
              >
                New intake
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900"
              onClick={() => navigate("/help")}
            >
              Help center
            </button>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5f8fd2]">Billie intake</p>
            <p className="mt-1 text-xl font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Build the draft before you touch the editor.
            </p>
            <p className="mt-1 text-xs text-slate-500">{intakeHeaderStatus}</p>
            <p className="mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 shadow-sm">
              Billie suggests. You approve money decisions.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex min-h-10 items-center justify-center rounded-full border border-white/70 bg-white/70 px-3 text-xs font-semibold text-slate-500 shadow-sm underline-offset-2 transition hover:bg-white/90 hover:text-slate-700 hover:underline"
              onClick={() => navigate("/")}
            >
              {authSession?.email ? `Account: ${authSession.email}` : "Account: local mode"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div
          className={`nb-page-shell nb-page-shell--wide flex w-full flex-1 flex-col ${
            showBillieComposer ? "nb-page-shell--with-billie-composer" : "pb-28"
          }`}
        >
          <div className="nb-page-grid flex-1 pt-6">
            <div className="min-w-0 space-y-6">
              {billingNotice ? (
                <div
                  className={`nb-banner font-medium ${
                    billingNotice.tone === "green"
                      ? "nb-banner--success"
                      : "nb-banner--warning"
                  }`}
                >
                  {billingNotice.message}
                </div>
              ) : null}
              {billieNextUpGuide ? (
                <section
                  className="nb-surface nb-surface--elevated nb-hero-glow rounded-[30px] border border-[#6993d2]/18 bg-[linear-gradient(145deg,_#f7faff_0%,_#ffffff_56%,_#edf6ff_100%)] p-5"
                  data-testid="intake-billie-next-up"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                        {billieNextUpGuide.eyebrow}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                        {billieNextUpGuide.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {billieNextUpGuide.detail}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {billieNextUpGuide.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          className="inline-flex min-h-10 items-center rounded-full border border-[#6993d2]/20 bg-white px-3 text-sm font-semibold text-[#285ea8] transition hover:border-[#6993d2]/35 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={action.onClick}
                          disabled={action.disabled}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
              <div className="nb-surface nb-surface--muted rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.88)_0%,_rgba(242,247,255,0.92)_100%)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Intake steps
                  </p>
                  {isCompactViewport ? (
                    <button
                      type="button"
                      className="nb-btn-secondary rounded-full px-3 py-1.5 text-xs shadow-sm"
                      onClick={() => setWizardStepsExpanded((current) => !current)}
                      aria-expanded={wizardStepsExpanded}
                      aria-controls="intake-step-details"
                    >
                      {wizardStepsExpanded ? "Hide steps" : "Show steps"}
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Step {safeWizardStepIndex + 1} of {wizardSteps.length}: {wizardStepLabel}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ backgroundColor: "#093064", width: `${wizardProgressPercent}%` }}
                  />
                </div>
                {shouldShowWizardDetails ? (
                  <div id="intake-step-details" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {wizardSteps.map((step, index) => {
                      const status =
                        index < safeWizardStepIndex
                          ? "complete"
                          : index === safeWizardStepIndex
                            ? "active"
                            : "upcoming";
                      const badgeClass =
                        status === "complete"
                          ? "bg-blue-800 text-white"
                          : status === "active"
                            ? "bg-blue-100 text-blue-900"
                            : "bg-slate-100 text-slate-500";
                      return (
                        <div key={step.id} className="flex items-center gap-2">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${badgeClass}`}
                          >
                            {index + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {onboardingStatus.visible ? (
                <div
                  className="nb-surface rounded-[30px] border border-[#6993d2]/18 bg-[linear-gradient(145deg,_rgba(255,255,255,0.96)_0%,_rgba(247,250,255,0.92)_100%)] p-5"
                  data-testid="intake-onboarding-section"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                        {onboardingStatus.walkthroughActive ? "Guided walkthrough" : "First invoice progress"}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900" style={{ fontFamily: "'Fraunces', serif" }}>
                        {onboardingStatus.completedCount} of {onboardingStatus.totalSteps} core steps complete
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {onboardingStatus.walkthroughActive
                          ? "Stay with the sample job, review what Billie captured, and only move on once the draft feels trustworthy."
                          : onboardingStatus.nextStep?.helper ||
                          "Keep moving through the first invoice flow one clear step at a time."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onboardingStatus.nextStep ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-sm"
                          onClick={() => handleOnboardingContinue(onboardingStatus.nextStep)}
                        >
                          {onboardingStatus.nextStep.ctaLabel}
                        </button>
                      ) : null}
                      {onboardingStatus.walkthroughActive ? (
                        <button
                          type="button"
                          className="nb-btn-ghost shrink-0 rounded-full px-3 py-1.5 text-sm"
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
                      style={{ backgroundColor: "#093064", width: `${onboardingStatus.progressPercent}%` }}
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
                </div>
              ) : null}

              {starterGuideActive ? (
                <div
                  className="nb-surface nb-hero-glow rounded-[30px] border-[#6993d2]/20 bg-[linear-gradient(145deg,_#f6f9ff_0%,_#ffffff_58%,_#edf5ff_100%)] p-5"
                  data-testid="intake-starter-walkthrough"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                        Starter walkthrough
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#093064]" style={{ fontFamily: "'Fraunces', serif" }}>
                        Follow the sample job from rough notes to a reviewed invoice.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        First move: scan the sample notes, then press Build invoice to see how Billie turns rough field notes into a draft.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="nb-btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs"
                      onClick={handleDismissWalkthrough}
                    >
                      Hide guide
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {starterWalkthroughSteps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`rounded-2xl border px-3 py-3 ${
                          step.complete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                            : "border-slate-200 bg-white/80 text-slate-700"
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
                          Step {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{step.label}</p>
                        <p className="mt-1 text-xs">
                          {step.complete ? "Complete" : index === 0 ? "Review the loaded notes first." : "Coming up next."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {importStudioContext ? (
                <div
                  className="nb-surface nb-surface--elevated rounded-[30px] border-[#6993d2]/18 bg-[linear-gradient(145deg,_#f8fbff_0%,_#ffffff_55%,_#edf6ff_100%)] p-5"
                  data-testid="import-cleanup-studio"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6993d2]">
                        Import cleanup studio
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#093064]" style={{ fontFamily: "'Fraunces', serif" }}>
                        Keep the original import close while you clean up what Billie could not settle automatically.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        NoteBill already pulled this file into review. Use the source text, unresolved decisions, and missing lines together instead of starting over.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                        onClick={applyImportStudioSourceToInput}
                      >
                        Use source in chat
                      </button>
                      {importDraftComparison ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                          onClick={applyImportStudioComparisonToInput}
                        >
                          Use compare in chat
                        </button>
                      ) : null}
                      {visibleDecisionSource.length > 0 ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                          onClick={applyImportStudioDecisionsToInput}
                        >
                          Use decisions in chat
                        </button>
                      ) : null}
                      {unparsedItems.length > 0 ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                          onClick={applyImportStudioUnparsedToInput}
                        >
                          Use uncaptured lines
                        </button>
                      ) : null}
                      {auditAssumptionItems.length > 0 ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                          onClick={applyImportStudioAssumptionsToInput}
                        >
                          Use assumptions in chat
                        </button>
                      ) : null}
                      {hasQualityBlockers ? (
                        <button
                          type="button"
                          className="nb-btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs"
                          onClick={applyImportStudioBlockersToInput}
                        >
                          Use blockers in chat
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {importStudioContext.fileName ? (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        {importStudioContext.fileName}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-[#6993d2]/20 bg-[#f6f9ff] px-3 py-1 font-semibold text-[#093064]">
                      {importStudioContext.openDecisionCount} decision{importStudioContext.openDecisionCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                      {importStudioContext.unparsedCount} uncaptured line{importStudioContext.unparsedCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                      {importStudioContext.assumptionCount} assumption{importStudioContext.assumptionCount === 1 ? "" : "s"}
                    </span>
                    {importStudioContext.qualityBlockerCount > 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                        {importStudioContext.qualityBlockerCount} quality blocker{importStudioContext.qualityBlockerCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {importStudioContext.needsFollowUp ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                        Missing money details need a reply
                      </span>
                    ) : null}
                  </div>
                  {importCoverageSummary ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-[#6993d2]/18 bg-white/88 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6993d2]">
                          Captured context
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">What Billie already has from the import</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                          {importCoverageSummary.captured.map((item) => (
                            <li key={item} className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          Still needs cleanup
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">What still needs a human or Billie check</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                          {importCoverageSummary.cleanup.map((item) => (
                            <li key={item} className="rounded-xl border border-amber-100 bg-white/85 px-3 py-2">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                  {importStudioContext.preview || importDraftComparison ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {importStudioContext.preview ? (
                        <div className="rounded-2xl border border-slate-200 bg-white/88 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Imported source
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">
                              Keep this close while you clean up the draft
                            </p>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {importStudioContext.preview}
                          </p>
                        </div>
                      ) : null}
                      {importDraftComparison ? (
                        <div className="rounded-2xl border border-[#6993d2]/18 bg-[#f6f9ff] p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6993d2]">
                              Current draft snapshot
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">
                              What the cleaned draft currently knows
                            </p>
                          </div>
                          <div className="mt-3 space-y-3">
                            <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                Status
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{importDraftComparison.statusLabel}</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Client
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {importDraftComparison.clientName || "Not captured yet"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Total
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {importDraftComparison.totalLabel || "Waiting on the cleaned draft"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Line items
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {importDraftComparison.lineItemCount > 0
                                    ? `${importDraftComparison.lineItemCount} captured`
                                    : "Still waiting"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Notes
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {importDraftComparison.noteCount > 0 ? "Included" : "Not yet captured"}
                                </p>
                              </div>
                            </div>
                            {importDraftComparison.sourceSessions.length > 0 ? (
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Source sessions
                                </p>
                                <div className="mt-2 space-y-2">
                                  {importDraftComparison.sourceSessions.slice(0, 3).map((session) => (
                                    <div key={session.id} className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2">
                                      <p className="text-sm font-semibold text-slate-900">{session.date}</p>
                                      <p className="text-xs text-slate-500">
                                        {session.taskCount > 0
                                          ? `${session.taskCount} task${session.taskCount === 1 ? "" : "s"} captured`
                                          : "No tasks captured"}
                                      </p>
                                      {session.taskPreview.length > 0 ? (
                                        <p className="mt-1 text-xs leading-5 text-slate-600">
                                          {session.taskPreview.join(", ")}
                                        </p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {importDraftComparison.draftLineItems.length > 0 ? (
                              <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  Draft line items
                                </p>
                                <div className="mt-2 space-y-2">
                                  {importDraftComparison.draftLineItems.slice(0, 3).map((lineItem) => (
                                    <div key={lineItem.id} className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2">
                                      <p className="text-sm font-semibold text-slate-900">{lineItem.description}</p>
                                      {lineItem.detail ? (
                                        <p className="mt-1 text-xs text-slate-600">{lineItem.detail}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <p className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm leading-6 text-slate-700">
                              {finishedInvoice
                                ? "This draft is ready to compare against the import and keep refining before you commit."
                                : "No cleaned draft yet. Billie will build one after the cleanup decisions are settled."}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {visibleDecisionSource.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white/88 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Unresolved decisions
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          Pull these straight into Billie when the import needs a clear answer.
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {visibleDecisionSource.slice(0, 4).map((item) => (
                          <p
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm leading-6 text-slate-700"
                          >
                            {item.prompt || item.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {auditAssumptionItems.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white/88 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Assumptions to confirm
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          These are the current cleanup assumptions worth sanity-checking before you finalize the draft.
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {auditAssumptionItems.slice(0, 4).map((item) => (
                          <p
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm leading-6 text-slate-700"
                          >
                            {item.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {unparsedItems.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                          Uncaptured lines
                        </p>
                        <p className="text-[11px] font-medium text-amber-800">
                          These lines still need cleanup attention
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {unparsedItems.slice(0, 4).map((item) => (
                          <p
                            key={item.id}
                            className="rounded-xl border border-amber-100 bg-white/85 px-3 py-2 text-sm leading-6 text-slate-700"
                          >
                            {item.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {hasQualityBlockers ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                          Quality blockers
                        </p>
                        <p className="text-[11px] font-medium text-amber-800">
                          Fix these before you trust the final import draft.
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(Array.isArray(outputQuality?.blockers) ? outputQuality.blockers : []).slice(0, 4).map((blocker, index) => (
                          <p
                            key={`blocker-${blocker?.code ?? index}-${index}`}
                            className="rounded-xl border border-amber-100 bg-white/85 px-3 py-2 text-sm leading-6 text-slate-700"
                          >
                            {blocker?.message || "Review item needs attention."}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {scratchpadSeedNotice ? (
                <div
                  className="nb-surface rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-4"
                  data-testid="scratchpad-seed-notice"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Scratchpad handoff
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-950">{scratchpadSeedNotice}</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-900">
                    Review the rough note below, then press Build invoice when you want Billie to structure it.
                  </p>
                </div>
              ) : null}

              {wizardStep === "paste" ? (
                <div className="nb-surface nb-surface--elevated rounded-[30px] p-5">
                  <p className="text-sm font-semibold text-slate-900">Paste your notes</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Paste them as-is: dates, hours, rates, parts, and anything still uncertain.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="nb-btn-ghost"
                      onClick={handleLoadStarterSample}
                      disabled={voiceNoteBusy || isTyping}
                    >
                      Try sample notes
                    </button>
                    <input
                      ref={audioUploadInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleVoiceNoteSelected}
                    />
                    <button
                      type="button"
                      className="nb-btn-secondary inline-flex h-10 px-4 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={triggerVoiceNoteUpload}
                      disabled={voiceNoteBusy || isTyping}
                    >
                      {voiceNoteBusy ? "Transcribing voice note..." : "Add voice note"}
                    </button>
                    <p className="text-xs text-slate-500">
                      Upload or record an audio note. Billie will turn it into editable text first.
                    </p>
                  </div>
                  {voiceNoteNotice ? <p className="mt-3 text-xs font-semibold text-blue-800">{voiceNoteNotice}</p> : null}
                  {voiceNoteError ? <p className="mt-3 text-xs font-semibold text-rose-600">{voiceNoteError}</p> : null}
                  <textarea
                    id="ai-intake-input"
                    rows={6}
                    className="nb-textarea mt-4 resize-none"
                    placeholder="Example: Jan 10 fixed sink, 2h at $90/hr. Parts: washer $5. Not sure if cabinet adjustment should be billed."
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="nb-btn-primary inline-flex h-11 px-5 disabled:cursor-not-allowed disabled:bg-blue-300"
                      onClick={() => handleSubmitUserMessage(inputValue)}
                      disabled={!inputValue.trim() || isTyping}
                    >
                      Build invoice
                    </button>
                    {isTyping ? <p className="text-xs text-slate-500">Reading your notes…</p> : null}
                  </div>
                </div>
              ) : null}

              {intakePhase === "awaiting_follow_up" && followUp ? (
                <div className="nb-banner nb-banner--warning rounded-[28px] p-5 shadow-sm">
                  <p className="text-sm font-semibold text-amber-900">Pricing needed</p>
                  <p className="mt-1 text-sm text-amber-900">{followUp.message}</p>
                  {quickReplies.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickReplies.map((reply) => (
                        <button
                          key={reply.id}
                          type="button"
                          className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-400"
                          onClick={() => handleSubmitUserMessage(reply.value)}
                          disabled={isTyping}
                        >
                          {reply.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <textarea
                      id="ai-intake-input"
                      rows={2}
                      className="nb-textarea flex-1 resize-none border-amber-200 bg-white/88 py-2"
                      placeholder="Reply with a rate and hours or a flat amount…"
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                    />
                    <button
                      type="button"
                      className="nb-btn-primary inline-flex h-11 px-5 disabled:cursor-not-allowed disabled:bg-blue-300"
                      onClick={() => handleSubmitUserMessage(inputValue)}
                      disabled={!inputValue.trim() || isTyping}
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : null}

              {visibleMessages.map((message) => {
                if (message.kind === "timeout" && message.payload) {
                  const isLaborTimeout = message.payload.context === "labor";
                  const canRetryShort =
                    message.payload.context === "intake" && message.payload.mode !== "fast";
                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="nb-banner nb-banner--warning w-full p-4 text-sm shadow-sm">
                        <p className="text-sm font-semibold text-amber-900">
                          {isLaborTimeout ? "Still checking labor pricing..." : "Still working..."}
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                          {canRetryShort
                            ? "Do you want me to keep going, or run a faster pass?"
                            : "Do you want me to keep going, or cancel?"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900"
                            onClick={() => handleTimeoutKeepWorking(message.id)}
                            disabled={isTyping}
                          >
                            Keep working
                          </button>
                          {canRetryShort ? (
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900"
                              onClick={retryWithShortPass}
                              disabled={isTyping}
                            >
                              Retry faster
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900"
                            onClick={() => handleTimeoutCancel(message.id)}
                            disabled={isTyping}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (message.kind === "review" && message.payload) {
                  const payload = {
                    ...message.payload,
                    decisions: openDecisions,
                    assumptions,
                    unparsedLines,
                    qualityGate: outputQuality ?? message.payload.qualityGate
                  };
                  const decisionKeywordSets = buildDecisionKeywordSets(
                    payload.decisions ?? [],
                    extractKeywords
                  );
                  const {
                    sections,
                    timelineEntries,
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
                    hasReviewSecondaryContent
                  } = buildReviewSnapshotModel({
                    payload,
                    formatMoney,
                    formatLaborDuration,
                    formatDisplayDescription
                  });
                  const getLineItemStatusForReview = (lineItem, decisionKeywords) =>
                    getLineItemStatus(lineItem, decisionKeywords, extractKeywords);

                  return (
                    <ReviewSnapshotCard
                      key={message.id}
                      messageId={message.id}
                      showAssumptionsCard={showAssumptionsCard}
                      isTyping={isTyping}
                      isCompactViewport={isCompactViewport}
                      reviewDetailsToggleLabel={reviewDetailsToggleLabel}
                      hasReviewSecondaryContent={hasReviewSecondaryContent}
                      showReviewSecondary={showReviewSecondary}
                      showReviewExpandedSections={showReviewExpandedSections}
                      payload={payload}
                      sections={sections}
                      timelineEntries={timelineEntries}
                      quickFixes={quickFixes}
                      pendingDecisionCount={pendingDecisionCount}
                      foundText={foundText}
                      decisionsText={decisionsText}
                      nextStepText={nextStepText}
                      decisionCtaLabel={decisionCtaLabel}
                      capturedPreviewSummary={capturedPreviewSummary}
                      capturedPreviewHiddenCount={capturedPreviewHiddenCount}
                      previewItems={previewItems}
                      remainingPreviewCount={remainingPreviewCount}
                      hasMissingAmounts={hasMissingAmounts}
                      hasLaborGaps={hasLaborGaps}
                      hasUnparsed={hasUnparsed}
                      auditStatus={auditStatus}
                      auditSummary={auditSummary}
                      decisionKeywordSets={decisionKeywordSets}
                      focusInputWithValue={focusInputWithValue}
                      setReviewCardCollapsed={setReviewCardCollapsed}
                      scrollToSection={scrollToSection}
                      decisionsRef={decisionsRef}
                      getLineItemStatus={getLineItemStatusForReview}
                      formatMoney={formatMoney}
                      formatLaborDuration={formatLaborDuration}
                      recentlyChangedLineIds={recentlyChangedLines.ids}
                      recentlyChangedDescriptions={recentlyChangedLines.descriptions}
                      billieStatus={billieStatus}
                      billieChangeSummary={billieChangeSummary}
                      recentClientContext={recentClientContext}
                      repeatWorkSuggestions={reviewRepeatWorkContext}
                      submitUserMessage={handleSubmitUserMessage}
                      onApplySavedWording={handleApplySavedWording}
                      onApplySavedNotes={handleApplySavedNotes}
                      onBillieLineRefine={refineBillieLineItem}
                      onBillieNotesRefine={refineBillieNotes}
                      onOpenBillieWorkspace={canGenerateInvoice ? handleOpenManualBillieWorkspace : null}
                    />
                  );
                }

                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                          className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        message.role === "user"
                          ? "bg-[#093064] text-white"
                          : "nb-surface nb-surface--quiet text-slate-800"
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                );
              })}
              {isTyping && billieStatus?.kind !== "working" ? (
                <div className="flex justify-start">
                  <div className="nb-surface nb-surface--quiet rounded-[24px] px-4 py-3 text-sm text-slate-500">
                    <span>Billie is typing</span>
                    <span className="ml-1 inline-flex w-4 justify-start" aria-hidden="true">
                      <span className="typing-dot">.</span>
                      <span className="typing-dot">.</span>
                      <span className="typing-dot">.</span>
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={listEndRef} />
            </div>
            <div className="nb-sticky-panel mt-6 xl:mt-0">
              <IntakeDecisionPanel
                showAssumptionsCard={showAssumptionsCard}
                hasReviewCard={hasReviewCard}
                openDecisionCount={displayOpenDecisionCount}
                canGenerateInvoice={canGenerateInvoice}
                showContextDetailsToggle={showContextDetailsToggle}
                isCompactViewport={isCompactViewport}
                setAssumptionsCollapsed={setAssumptionsCollapsed}
                contextDetailsToggleLabel={contextDetailsToggleLabel}
                summaryTimeLabel={summaryTimeLabel}
                showConfirmDetails={showConfirmDetails}
                showQuickDecisions={showQuickDecisions}
                hasVisibleDetails={hasVisibleDetails}
                hasDecisions={hasDecisions}
                decisionsRef={decisionsRef}
                quickDecisionHeading={quickDecisionHeading}
                decisionProgressLabel={decisionProgressLabel}
                showDecisionWhy={showDecisionWhy}
                setShowDecisionWhy={setShowDecisionWhy}
                isTyping={isTyping}
                decisionApplyPending={decisionApplyPending}
                decisionApplyLabel={optimisticDecisionState?.label ?? "Billie: Applying decision..."}
                visibleDecisionItems={visibleDecisionItems}
                buildDecisionActions={buildDecisionActions}
                decisionIncludeButtonClass={decisionIncludeButtonClass}
                decisionExcludeButtonClass={decisionExcludeButtonClass}
                handleDecisionAction={handleDecisionAction}
                hasMoreDecisions={hasMoreDecisions}
                showAllDecisions={showAllDecisions}
                clampedDecisionIndex={clampedDecisionIndex}
                decisionItems={visibleDecisionSource}
                setDecisionFocusIndex={setDecisionFocusIndex}
                setShowAllDecisions={setShowAllDecisions}
                taxAssumptionPresent={taxAssumptionPresent}
                pendingTaxRate={pendingTaxRate}
                setPendingTaxRate={setPendingTaxRate}
                appendAiMessage={appendAiMessage}
                suggestedTaxRate={suggestedTaxRate}
                focusInputWithValue={focusInputWithValue}
                showAssumptionDetails={showAssumptionDetails}
                unparsedRef={unparsedRef}
                auditStatus={auditStatus}
                auditSummary={auditSummary}
                auditSummaryTimeLabel={auditSummaryTimeLabel}
                handleManualDeepAudit={handleManualDeepAudit}
                structuredInvoice={structuredInvoice}
                unparsedItems={unparsedItems}
                submitUserMessage={handleSubmitUserMessage}
                assumptionItems={assumptionItems}
                auditAssumptionItems={auditAssumptionItems}
                primaryCtaDisabled={primaryCtaDisabled}
                handlePrimaryCta={handlePrimaryCta}
                primaryCtaLabel={primaryCtaLabel}
                ctaHelper={ctaHelper}
                planLimitReached={showIntakePlanBanner}
                planSummary={planSummary}
                planUsage={planUsage}
                planWarning={hasReviewCard && !showIntakePlanBanner ? planWarning : ""}
                showUpgradeAction={showUpgradeAction}
                useStripeUpgradeAction={useStripeUpgradeAction}
                upgradeUrl={upgradeUrl}
                billingBusy={billingBusy}
                billingError={billingError}
                handleUpgradeAction={handleUpgradeAction}
              />
            </div>
          </div>
        </div>
      </main>

      {decisionToast ? (
        <div className="pointer-events-none fixed left-0 right-0 top-20 z-40 flex justify-center px-4 md:bottom-24 md:top-auto">
          <div className="nb-banner nb-banner--info max-w-3xl flex-1 font-semibold">
            <div className="flex items-center justify-between gap-3">
              <span>{decisionToast}</span>
              {decisionUndoState ? (
                <button
                  type="button"
                  className="nb-btn-secondary pointer-events-auto rounded-full border-blue-300 bg-white px-3 py-1 text-xs text-blue-900 hover:border-blue-400 hover:text-blue-950"
                  onClick={handleUndoDecision}
                >
                  Undo
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {readinessDebugEnabled ? (
        <aside className="fixed bottom-24 right-3 z-40 w-[min(92vw,24rem)] rounded-xl border border-slate-300 bg-white/95 text-xs shadow-lg backdrop-blur-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-t-xl border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
            onClick={() => setReadinessPanelOpen((prev) => !prev)}
          >
            <span>Readiness debug</span>
            <span className="text-[11px] text-slate-500">
              {readinessPanelOpen ? "Hide" : "Show"}
            </span>
          </button>
          {readinessPanelOpen ? (
            <div className="space-y-3 px-3 py-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {readinessDebugFields.map(([label, value]) => (
                  <React.Fragment key={label}>
                    <span className="text-slate-500">{label}</span>
                    <span className="font-mono text-[11px] text-slate-700">{String(value)}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="font-semibold text-slate-600">latest snapshot</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-slate-600">
                  {JSON.stringify(readinessDebugSnapshot, null, 2)}
                </pre>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="font-semibold text-slate-600">
                  events ({readinessDebugEvents.length})
                </p>
                <div className="mt-1 max-h-36 space-y-1 overflow-auto">
                  {readinessDebugEvents.length === 0 ? (
                    <p className="text-[10px] text-slate-500">No readiness events yet.</p>
                  ) : (
                    readinessDebugEvents
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <div
                          key={`${entry.timestamp}-${entry.event}-${index}`}
                          className="rounded border border-slate-200 bg-white px-2 py-1"
                        >
                          <p className="font-mono text-[10px] text-slate-700">
                            {entry.event} @{" "}
                            {new Date(entry.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </p>
                          <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10px] text-slate-500">
                            {JSON.stringify(entry.payload)}
                          </pre>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      {showBillieComposer ? (
        <form
          onSubmit={handleSend}
          className="nb-billie-composer fixed bottom-0 left-0 right-0 border-t border-[rgba(9,48,100,0.08)] bg-white/84 backdrop-blur"
        >
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ask Billie
                </p>
                <p className="text-[11px] text-slate-500">Wording only. Numbers stay locked.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className={billieStatusClass}>
                  <span className="nb-assistant-chip__dot" aria-hidden="true" />
                  {activeBillieStatus.kind === "safe"
                    ? `✓ ${activeBillieStatus.text}`
                    : activeBillieStatus.kind === "warning"
                      ? `⚠ ${activeBillieStatus.text}`
                      : activeBillieStatus.kind === "working"
                        ? (
                          <>
                            <span>{activeBillieStatus.text}</span>
                            <span className="ml-1 inline-flex w-4 justify-start" aria-hidden="true">
                              <span className="typing-dot">.</span>
                              <span className="typing-dot">.</span>
                              <span className="typing-dot">.</span>
                            </span>
                          </>
                        )
                        : activeBillieStatus.text}
                </span>
                {billieRefineSummaryLabel ? (
                  <span className="text-[11px] font-medium text-slate-500">{billieRefineSummaryLabel}</span>
                ) : null}
                {billieChangeSummary ? (
                  <span
                    className="text-[11px] font-medium text-slate-500"
                    data-testid="intake-billie-change-summary"
                  >
                    {billieChangeSummary}
                  </span>
                ) : null}
                {billieUndoState ? (
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full px-3 py-1 text-xs"
                    onClick={handleUndoBilliePatch}
                  >
                    Undo last Billie change
                  </button>
                ) : null}
              </div>
            </div>
            {billieActionChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {visibleBillieActionChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="nb-btn-secondary rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:text-slate-400"
                    onClick={() =>
                      handleSubmitUserMessage(chip.value, {
                        billieRefineTone: chip.tone
                      })
                    }
                    disabled={isTyping}
                  >
                    {chip.label}
                  </button>
                ))}
                {hasHiddenBillieActionChips ? (
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full bg-slate-50 px-3 py-1 text-xs"
                    onClick={() => setBillieChipTrayExpanded(true)}
                    disabled={isTyping}
                  >
                    More
                  </button>
                ) : null}
                {isCompactViewport && billieChipTrayExpanded && billieActionChips.length > 3 ? (
                  <button
                    type="button"
                    className="nb-btn-secondary rounded-full bg-slate-50 px-3 py-1 text-xs"
                    onClick={() => setBillieChipTrayExpanded(false)}
                    disabled={isTyping}
                  >
                    Less
                  </button>
                ) : null}
              </div>
            ) : null}
            {billieChangePreview.length > 0 ? (
              <div
                className="nb-subcard px-3 py-3"
                data-testid="billie-change-preview"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last Billie change
                  </p>
                </div>
                <div className="mt-2 space-y-3">
                  {billieChangePreview.map((entry) => (
                    <div key={entry.id} className="space-y-2 rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {entry.label}
                      </p>
                      <div className="space-y-1">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500">Before</p>
                          <p className="text-sm text-slate-700">{entry.before}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold text-blue-900">After</p>
                          <p className="text-sm font-semibold text-slate-900">{entry.after}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="flex-1">
              <label className="sr-only" htmlFor="ai-intake-input">
                Message
              </label>
              <textarea
                id="ai-intake-input"
                rows={1}
                className="nb-textarea max-h-32 resize-none"
                placeholder={
                  intakeComplete
                    ? "Ask Billie to polish wording. Numbers stay locked."
                    : "Ask Billie about the draft..."
                }
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-800 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-300"
                disabled={!inputValue.trim() || (isTyping && !canSendWhileTyping)}
              >
                Ask Billie
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

  window.InvoiceIntakeFeature = {
    AIIntake
  };
})();
