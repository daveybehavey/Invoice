const { BrowserRouter, Routes, Route, useNavigate } = ReactRouterDOM;
const { useEffect, useRef, useState } = React;

const cardBase =
  "w-full rounded-xl border bg-white p-5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.99]";

function SparklesIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-2.846-2.846L2.5 12l2.846-.813a4.5 4.5 0 002.846-2.846L9 5.25l.813 2.846a4.5 4.5 0 002.846 2.846L15.5 12l-2.846.813a4.5 4.5 0 00-2.846 2.846zM18 16.5l.546 1.91a1.5 1.5 0 001.044 1.044L21.5 20l-1.91.546a1.5 1.5 0 00-1.044 1.044L18 23.5l-.546-1.91a1.5 1.5 0 00-1.044-1.044L14.5 20l1.91-.546a1.5 1.5 0 001.044-1.044L18 16.5z"
      />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.687a1.875 1.875 0 112.652 2.652L6.75 19.903l-4.5 1.125 1.125-4.5L16.862 4.487z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6l-2.25-2.25" />
    </svg>
  );
}

function UploadIcon({ className }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 6m0 0l4.5 4.5M12 6v10.5"
      />
    </svg>
  );
}

function LauncherCard({ title, description, icon, onClick, disabled, badge }) {
  const iconClass = disabled ? "h-6 w-6 text-slate-400" : "h-6 w-6 text-emerald-600";
  return (
    <button
      type="button"
      className={`${cardBase} ${
        disabled ? "cursor-not-allowed border-slate-200 bg-slate-50" : "border-slate-200"
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${disabled ? "bg-slate-100" : "bg-emerald-50"}`}>
          {React.cloneElement(icon, { className: iconClass })}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {badge ? (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </button>
  );
}

function Launcher() {
  const navigate = useNavigate();

  const options = [
    {
      key: "ai",
      title: "Let AI Build",
      description: "Paste notes or describe the job.",
      icon: <SparklesIcon />,
      onClick: () => navigate("/ai-intake"),
      disabled: false
    },
    {
      key: "manual",
      title: "Build It Yourself",
      description: "Start with a clean, editable invoice.",
      icon: <PencilIcon />,
      onClick: () => navigate("/manual"),
      disabled: false
    },
    {
      key: "import",
      title: "Import Existing Invoice",
      description: "Upload a PDF to edit and restyle.",
      icon: <UploadIcon />,
      onClick: () => navigate("/import"),
      disabled: true,
      badge: "Coming soon"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-10 md:max-w-4xl md:py-16">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Invoice Builder</p>
          <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Create a New Invoice</h1>
          <p className="text-sm text-slate-600 md:text-base">
            Choose how you want to start. You can always switch modes later.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {options.map((option) => (
            <LauncherCard
              key={option.key}
              title={option.title}
              description={option.description}
              icon={option.icon}
              onClick={option.onClick}
              disabled={option.disabled}
              badge={option.badge}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function Placeholder({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-10">
        <button
          type="button"
          className="text-sm font-semibold text-emerald-700"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </main>
    </div>
  );
}

const initialIntakeMessages = [
  {
    id: "msg-1",
    role: "ai",
    text: "Hi! Paste notes or describe the job and I'll build a draft invoice."
  }
];

const readDraftFromStorage = (key) => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error("Failed to read draft", error);
    return null;
  }
};

function AIIntake() {
  const navigate = useNavigate();
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
  const [auditStatus, setAuditStatus] = useState(null);
  const [auditSummary, setAuditSummary] = useState("");
  const [auditSummaryAt, setAuditSummaryAt] = useState(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [reviewCardCollapsed, setReviewCardCollapsed] = useState(true);
  const [showChatInput, setShowChatInput] = useState(false);
  const [assumptionsCollapsed, setAssumptionsCollapsed] = useState(false);
  const [decisionToast, setDecisionToast] = useState(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [decisionFocusIndex, setDecisionFocusIndex] = useState(0);
  const [showDecisionWhy, setShowDecisionWhy] = useState(false);
  const requestIdRef = useRef(0);
  const openDecisionSignatureRef = useRef("");
  const lastDecisionResolutionRef = useRef("");
  const decisionActionRef = useRef(null);
  const lastSummaryMetaRef = useRef({ at: null, requestId: null });
  const intakePhaseRef = useRef(intakePhase);
  const summaryLockRef = useRef(false);
  const listEndRef = useRef(null);
  const decisionsRef = useRef(null);
  const unparsedRef = useRef(null);
  const slowResponseTimeoutRef = useRef(null);
  const timeoutMessageIdRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastMessagesRef = useRef([]);
  const lastTranscriptRef = useRef("");
  const lastUserMessageRef = useRef("");
  const lastIntakeModeRef = useRef("full");
  const hasAutoCollapsedRef = useRef(false);
  const auditRequestIdRef = useRef(0);
  const openDecisionsRef = useRef([]);
  const assumptionsRef = useRef([]);
  const unparsedLinesRef = useRef([]);
  const decisionToastTimeoutRef = useRef(null);
  const intakeComplete = intakePhase === "ready_to_generate";
  const confirmationKeywords = ["yes", "yep", "correct", "looks good", "sounds good", "confirm"];
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

  const formatMoney = (value) =>
    Number.isFinite(value) ? `$${Number(value).toFixed(2)}` : "";

  const formatDisplayDescription = (text) => {
    if (!text) {
      return "";
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return "";
    }
    return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  };

  const normalizeSnippet = (text) =>
    text
      .toLowerCase()
      .replace(/[’‘‛]/g, "'")
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const extractKeywords = (text) =>
    normalizeSnippet(text)
      .split(" ")
      .filter((word) => word.length >= 4);

  const orderLineItemsForTranscript = (lineItems, transcript) => {
    if (!Array.isArray(lineItems) || lineItems.length <= 1) {
      return lineItems;
    }
    const normalizedTranscript = normalizeSnippet(transcript ?? "");
    if (!normalizedTranscript) {
      return lineItems;
    }
    return lineItems
      .map((item, index) => {
        const keywords = extractKeywords(item.description ?? "");
        let position = Number.POSITIVE_INFINITY;
        keywords.forEach((keyword) => {
          const idx = normalizedTranscript.indexOf(keyword);
          if (idx >= 0 && idx < position) {
            position = idx;
          }
        });
        return { item, position, index };
      })
      .sort((a, b) => {
        if (a.position === b.position) {
          return a.index - b.index;
        }
        return a.position - b.position;
      })
      .map((entry) => entry.item);
  };

  const extractTaxRateFromText = (text) => {
    if (!text) {
      return null;
    }
    const taxMatch =
      text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:sales\s+)?tax/i) ||
      text.match(/tax[^\\d]{0,10}(\d+(?:\.\d+)?)\s*%/i);
    if (!taxMatch) {
      return null;
    }
    const rate = Number.parseFloat(taxMatch[1]);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return null;
    }
    return rate;
  };

  const isExplicitNoTax = (text) =>
    /\b(no\s+tax|without\s+tax|exclude\s+tax|skip\s+tax|tax\s+exempt|tax[-\s]*free)\b/i.test(text);

  const mergeUniqueList = (current, incoming) => {
    const seen = new Set(current.map((item) => normalizeSnippet(item)));
    const merged = [...current];
    incoming.forEach((item) => {
      const normalized = normalizeSnippet(item);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      merged.push(item);
    });
    return merged;
  };

  const mergeDecisionLists = (current, incoming) => {
    const merged = new Map();
    current.forEach((decision) => {
      const key = decision.id ?? decision.prompt ?? JSON.stringify(decision);
      merged.set(key, decision);
    });
    incoming.forEach((decision) => {
      const key = decision.id ?? decision.prompt ?? JSON.stringify(decision);
      if (!merged.has(key)) {
        merged.set(key, decision);
      }
    });
    return Array.from(merged.values());
  };

  const buildTranscript = (nextMessages) =>
    nextMessages
      .filter((message) => message.role === "user")
      .map((message) => message.text.trim())
      .filter(Boolean)
      .join("\n");

  const buildSummaryText = (invoice, decisions = [], unparsedCount = 0) => {
    if (!invoice) {
      return "I need a bit more detail before drafting an invoice.";
    }
    const summaryLines = [];
    const itemCount = invoice.lineItems.length;
    summaryLines.push(
      `Here's what I found: ${itemCount} line item${itemCount > 1 ? "s" : ""} captured.`
    );
    if (decisions.length > 0) {
      summaryLines.push(
        `${decisions.length} decision${decisions.length > 1 ? "s" : ""} still ${
          decisions.length > 1 ? "need" : "needs"
        } your call.`
      );
    }
    if (unparsedCount > 0) {
      summaryLines.push(
        `${unparsedCount} note${unparsedCount > 1 ? "s" : ""} not captured yet.`
      );
    }
    summaryLines.push("Review the snapshot below.");
    if (decisions.length > 0) {
      return `${summaryLines.join(
        " "
      )}\n\nCheckpoint: Draft ready. Tap Confirm to generate (or reply \"confirm\"). You can resolve decisions now or later.`;
    }
    return `${summaryLines.join(
      " "
    )}\n\nCheckpoint: Draft ready. Tap Confirm to generate (or reply \"confirm\"). Send edits anytime.`;
  };

  const buildReviewPayload = (invoice, decisions = [], unparsed = []) => {
    if (!invoice) {
      return null;
    }
    const orderedLineItems = orderLineItemsForTranscript(
      invoice.lineItems ?? [],
      lastTranscriptRef.current
    );
    return {
      id: `review-${Date.now()}`,
      customerName: invoice.customerName ?? "",
      notes: invoice.notes ?? "",
      lineItems: orderedLineItems.map((item, index) => ({
        id: item.id ?? `review-line-${index}`,
        type: item.type ?? "other",
        description: formatDisplayDescription(item.description),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount
      })),
      decisions: decisions.map((decision) => ({
        id: decision.id,
        kind: decision.kind,
        prompt: decision.prompt,
        sourceSnippet: decision.sourceSnippet
      })),
      unparsed: Array.isArray(unparsed) ? unparsed : []
    };
  };

  const buildDecisionFollowUp = (decisions) => {
    const lines = decisions.map((decision) => `- ${decision.prompt}`);
    return `Pending decisions (optional to resolve now):\n${lines.join("\n")}`;
  };

  const buildDraftFromInvoice = (invoice, taxOverride) => {
    const today = new Date().toISOString().slice(0, 10);
    const issueDate =
      typeof invoice?.issueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(invoice.issueDate)
        ? invoice.issueDate.slice(0, 10)
        : "";
    const orderedLineItems = orderLineItemsForTranscript(
      invoice?.lineItems ?? [],
      lastTranscriptRef.current
    );
    const lineItems =
      orderedLineItems?.map((lineItem, index) => {
        const hasQuantity = Number.isFinite(lineItem.quantity);
        const hasUnitPrice = Number.isFinite(lineItem.unitPrice);
        const hasAmount = Number.isFinite(lineItem.amount);
        const qtyValue = hasQuantity ? String(lineItem.quantity) : "";
        const rateValue = hasUnitPrice
          ? String(lineItem.unitPrice)
          : !hasQuantity && !hasUnitPrice && hasAmount && lineItem.amount > 0
            ? String(lineItem.amount)
            : "";
        const finalQty = rateValue && !qtyValue ? "1" : qtyValue;
        return {
          id: lineItem.id ?? `line-${Date.now()}-${index}`,
          description: lineItem.description,
          qty: finalQty,
          rate: rateValue
        };
      }) ?? [];

    return {
      invoiceNumber: invoice?.invoiceNumber ?? "INV-0001",
      invoiceDate: issueDate || today,
      fromDetails: "",
      billToDetails: invoice?.customerName ?? "",
      notes: invoice?.notes ?? "",
      taxRate: taxOverride ?? "0",
      lineItems: lineItems.length
        ? lineItems
        : [{ id: `line-${Date.now()}`, description: "", qty: "", rate: "" }],
      logoUrl: null,
      stylePreset: "default"
    };
  };

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

  const showDecisionToast = (text) => {
    if (!text) {
      return;
    }
    setDecisionToast(text);
    if (decisionToastTimeoutRef.current) {
      window.clearTimeout(decisionToastTimeoutRef.current);
    }
    decisionToastTimeoutRef.current = window.setTimeout(() => {
      setDecisionToast(null);
      decisionToastTimeoutRef.current = null;
    }, 3500);
  };

  const buildDecisionAckMessage = (action, resolvedCount) => {
    if (!resolvedCount || resolvedCount <= 0) {
      return null;
    }
    if (!action) {
      return `Decision updated — ${resolvedCount} item${resolvedCount > 1 ? "s" : ""} resolved.`;
    }
    if (action.type === "bulk_include") {
      return `Got it — I’ll include all pending items. (${resolvedCount} resolved)`;
    }
    if (action.type === "bulk_exclude") {
      return `Got it — I won’t include any pending items. (${resolvedCount} resolved)`;
    }
    if (action.kind === "tax") {
      if (action.type === "tax_apply") {
        return "Got it — I’ll note tax should be applied.";
      }
      if (action.type === "tax_skip") {
        return "Got it — keeping tax at 0%.";
      }
    }
    const snippet = action.snippet ? shortenSnippet(action.snippet, 36) : "that item";
    if (action.type === "include") {
      return `Got it — I’ll include ${snippet}.`;
    }
    if (action.type === "exclude") {
      return `Got it — I won’t include ${snippet}.`;
    }
    return `Decision updated — ${resolvedCount} item${resolvedCount > 1 ? "s" : ""} resolved.`;
  };

  const handleDecisionAction = (action, message) => {
    const currentValue = inputValue.replace(/\s+$/, "");
    if (currentValue.trim()) {
      const prefix = currentValue.endsWith("\n") ? currentValue : `${currentValue}\n`;
      focusInputWithValue(`${prefix}${message}`);
      return;
    }
    decisionActionRef.current = action;
    const accepted = submitUserMessage(message);
    if (!accepted) {
      decisionActionRef.current = null;
    }
  };

  const appendSummaryMessage = (text, reviewPayload) => {
    setSummaryUpdatedAt(new Date());
    lastSummaryMetaRef.current = {
      at: Date.now(),
      requestId: requestIdRef.current
    };
    console.log("[summary:append]", lastSummaryMetaRef.current);
    setIsTyping(false);
    setReviewCardCollapsed(true);
    setShowChatInput(false);
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
  const openDecisionCount = openDecisions.length;
  const taxAssumptionPresent = assumptions.some((item) =>
    item.toLowerCase().includes("tax assumed")
  );
  const suggestedTaxRate = extractTaxRateFromText(lastTranscriptRef.current);
  const showAssumptionsCard = hasAssumptions || hasDecisions;
  const showAssumptionDetails = !hasReviewCard || !assumptionsCollapsed;

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
  const wizardStep = (() => {
    if (!finishedInvoice && intakePhase === "collecting") {
      return "paste";
    }
    if (intakePhase === "awaiting_follow_up") {
      return "decisions";
    }
    if (finishedInvoice && openDecisionCount > 0) {
      return "decisions";
    }
    if (finishedInvoice && intakePhase !== "ready_to_generate") {
      return "review";
    }
    if (intakePhase === "ready_to_generate") {
      return "confirm";
    }
    return "paste";
  })();
  const wizardSteps = [
    { id: "paste", label: "Paste" },
    { id: "review", label: "Review" },
    { id: "decisions", label: "Decisions" },
    { id: "confirm", label: "Generate" }
  ];
  const wizardStepIndex = wizardSteps.findIndex((step) => step.id === wizardStep);
  const scrollToSection = (ref) => {
    if (!ref?.current) {
      return;
    }
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const needsLaborPricing = intakePhase === "awaiting_follow_up" && followUp?.type === "labor_pricing";
  const needsLaborHoursOnly = needsLaborPricing && Number.isFinite(pendingLaborRate);
  const needsSummaryConfirmation = intakePhase === "ready_to_summarize";
  const showQuickDecisions =
    intakePhase === "ready_to_summarize" && (hasDecisions || taxAssumptionPresent || pendingTaxRate);
  const hasMoreDecisions = decisionItems.length > 1;
  const clampedDecisionIndex = Math.min(
    decisionFocusIndex,
    Math.max(0, decisionItems.length - 1)
  );
  const focusedDecisionItem = decisionItems[clampedDecisionIndex];
  const visibleDecisionItems = showAllDecisions
    ? decisionItems
    : focusedDecisionItem
      ? [focusedDecisionItem]
      : [];
  const quickDecisionHeading =
    openDecisionCount > 0 ? `Needs your call (${openDecisionCount})` : "Tax choice";
  const quickReplyLabel = needsLaborHoursOnly
    ? "Suggested hours"
    : needsLaborPricing
      ? "Suggested rates"
      : "Quick replies";
  const normalizedInput = inputValue.trim().toLowerCase();
  const canSendWhileTyping =
    isTyping &&
    intakePhase === "ready_to_summarize" &&
    confirmationKeywords.some((keyword) => normalizedInput.includes(keyword));
  const ctaDisabled = !intakeComplete;
  const ctaHelper = intakeComplete
    ? "Ready to generate."
    : needsLaborHoursOnly
      ? "Add hours for each labor line to continue."
      : needsLaborPricing
        ? "Provide labor pricing to continue."
      : needsSummaryConfirmation
        ? openDecisionCount > 0
          ? "Checkpoint ready — tap Confirm to generate (or reply \"confirm\"). Pending decisions can be resolved later."
          : "Checkpoint ready — tap Confirm to generate (or reply \"confirm\")."
        : openDecisionCount > 0
          ? "Pending decisions can be resolved anytime."
          : "Continue the conversation to build the draft.";

  const extractDecisionSnippet = (prompt) => {
    const quoted = prompt.match(/"([^"]+)"/);
    if (quoted?.[1]) {
      return quoted[1];
    }
    return prompt.replace(/^Bill this item\?\s*/i, "").replace(/^Confirm:\s*/i, "").trim();
  };

  const cleanDecisionSnippet = (snippet) => {
    if (!snippet) {
      return "";
    }
    let cleaned = snippet.trim();
    cleaned = cleaned.replace(/^(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b[,:-]?\s*/i, "");
    cleaned = cleaned.replace(/\b(not sure if i should bill|up to you|do what makes sense).*$/i, "");
    cleaned = cleaned.replace(/\bmaybe\b/gi, "");
    cleaned = cleaned.replace(/\s*[-–—]\s*$/g, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return cleaned;
  };

  const shortenSnippet = (snippet, maxLength = 48) => {
    if (snippet.length <= maxLength) {
      return snippet;
    }
    return `${snippet.slice(0, maxLength - 3)}...`;
  };

  const buildDecisionActions = (decision) => {
    const rawSnippet = extractDecisionSnippet(decision.prompt ?? "");
    const cleanedSnippet = cleanDecisionSnippet(rawSnippet) || rawSnippet;
    const snippet = shortenSnippet(cleanedSnippet);
    const baseAction = { kind: decision.kind, snippet: rawSnippet };
    const display =
      decision.kind === "tax"
        ? "Apply tax?"
        : rawSnippet
          ? `Bill ${snippet}?`
          : decision.prompt ?? "Decision needed";
    const includeLabel = decision.kind === "tax" ? "Apply tax" : "Include";
    const excludeLabel = decision.kind === "tax" ? "No tax" : "Exclude";
    const includeValue =
      decision.kind === "tax"
        ? "Apply tax."
        : `Include ${rawSnippet || decision.prompt || "this item"}.`;
    const excludeValue =
      decision.kind === "tax"
        ? "No tax."
        : `Don't include ${rawSnippet || decision.prompt || "this item"}.`;
    return {
      display,
      includeLabel,
      excludeLabel,
      includeValue,
      excludeValue,
      includeAction:
        decision.kind === "tax"
          ? { ...baseAction, type: "tax_apply" }
          : { ...baseAction, type: "include" },
      excludeAction:
        decision.kind === "tax"
          ? { ...baseAction, type: "tax_skip" }
          : { ...baseAction, type: "exclude" }
    };
  };

  const buildDecisionKeywordSets = (decisions) =>
    decisions.map((decision) => {
      const keywords =
        Array.isArray(decision.keywords) && decision.keywords.length
          ? decision.keywords
          : extractKeywords(decision.sourceSnippet ?? decision.prompt ?? "");
      return new Set(keywords);
    });

  const matchesDecision = (lineItem, decisionKeywordSets) => {
    const itemKeywords = new Set(extractKeywords(lineItem.description ?? ""));
    if (itemKeywords.size === 0) {
      return false;
    }
    return decisionKeywordSets.some((decisionKeywords) => {
      let overlapCount = 0;
      itemKeywords.forEach((keyword) => {
        if (decisionKeywords.has(keyword)) {
          overlapCount += 1;
        }
      });
      return overlapCount >= 2;
    });
  };

  const getLineItemStatus = (lineItem, decisionKeywordSets) => {
    const decisionMatch = matchesDecision(lineItem, decisionKeywordSets);
    if (decisionMatch) {
      return { label: "Decision needed", badgeClass: "bg-amber-100 text-amber-700" };
    }
    if (!Number.isFinite(lineItem.amount)) {
      return { label: "Needs detail", badgeClass: "bg-slate-100 text-slate-600" };
    }
    if (Number(lineItem.amount) === 0) {
      return { label: "No charge", badgeClass: "bg-slate-100 text-slate-600" };
    }
    return { label: "Captured", badgeClass: "bg-emerald-100 text-emerald-700" };
  };

  const focusInputWithValue = (value) => {
    setInputValue(value);
    if (hasReviewCard) {
      setShowChatInput(true);
    }
    setTimeout(() => {
      const input = document.getElementById("ai-intake-input");
      if (input) {
        input.focus();
      }
    }, 0);
  };

  const FAST_MODE_THRESHOLD = 1800;
  const SLOW_RESPONSE_MS_LONG = 30000;
  const SLOW_RESPONSE_MS_MEDIUM = 45000;
  const SLOW_RESPONSE_MIN_LENGTH = 800;

  const getSlowResponseDelay = (transcript) => {
    const length = transcript?.length ?? 0;
    if (length < SLOW_RESPONSE_MIN_LENGTH) {
      return null;
    }
    if (length >= FAST_MODE_THRESHOLD) {
      return SLOW_RESPONSE_MS_LONG;
    }
    return SLOW_RESPONSE_MS_MEDIUM;
  };

  const shouldUseFastMode = (transcript) => transcript.length >= FAST_MODE_THRESHOLD;
  const shouldRunDeepAudit = (status, transcript) => {
    if (status === "timed_out") {
      return true;
    }
    if (status === "skipped") {
      return transcript.length >= FAST_MODE_THRESHOLD;
    }
    return false;
  };

  const clearSlowResponseTimer = () => {
    if (slowResponseTimeoutRef.current) {
      window.clearTimeout(slowResponseTimeoutRef.current);
      slowResponseTimeoutRef.current = null;
    }
  };

  const dismissTimeoutMessage = (messageId) => {
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    timeoutMessageIdRef.current = null;
  };

  const appendTimeoutMessage = (mode, context = "intake") => {
    if (timeoutMessageIdRef.current) {
      return;
    }
    const id = `msg-timeout-${Date.now()}`;
    timeoutMessageIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "ai",
        kind: "timeout",
        payload: { mode, context }
      }
    ]);
  };

  const abortOngoingRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current += 1;
    clearSlowResponseTimer();
    setIsTyping(false);
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
    appendAiMessage("Okay — canceled. You can trim the notes or try again.");
  };

  const runDeepAudit = async ({ structuredInvoice, sourceText, decisionSignature }) => {
    if (!structuredInvoice || !sourceText) {
      return;
    }
    setAuditStatus("running");
    setAuditSummary("");
    setAuditSummaryAt(null);
    auditRequestIdRef.current += 1;
    const auditRequestId = auditRequestIdRef.current;

    try {
      const response = await fetch("/api/invoices/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredInvoice,
          sourceText,
          lastUserMessage: lastDecisionResolutionRef.current || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Audit failed.");
      }
      if (auditRequestId !== auditRequestIdRef.current) {
        return;
      }
      if (summaryLockRef.current || intakePhaseRef.current !== "ready_to_summarize") {
        return;
      }
      if (decisionSignature && decisionSignature !== openDecisionSignatureRef.current) {
        return;
      }

      const currentDecisions = openDecisionsRef.current ?? [];
      const currentAssumptions = assumptionsRef.current ?? [];
      const currentUnparsed = unparsedLinesRef.current ?? [];
      const incomingDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
      const incomingAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
      const incomingUnparsed = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];

      const mergedDecisions = mergeDecisionLists(currentDecisions, incomingDecisions);
      const mergedAssumptions = mergeUniqueList(currentAssumptions, incomingAssumptions);
      const mergedUnparsed = mergeUniqueList(currentUnparsed, incomingUnparsed);

      const addedDecisions = mergedDecisions.length - currentDecisions.length;
      const addedAssumptions = mergedAssumptions.length - currentAssumptions.length;
      const addedUnparsed = mergedUnparsed.length - currentUnparsed.length;

      if (addedDecisions || addedAssumptions || addedUnparsed) {
        setOpenDecisions(mergedDecisions);
        setAssumptions(mergedAssumptions);
        setUnparsedLines(mergedUnparsed);
        openDecisionSignatureRef.current = mergedDecisions
          .map((decision) => decision.prompt)
          .sort()
          .join("|");
        const updates = [];
        if (addedDecisions) {
          updates.push(`${addedDecisions} new decision${addedDecisions > 1 ? "s" : ""}`);
        }
        if (addedUnparsed) {
          updates.push(`${addedUnparsed} new note${addedUnparsed > 1 ? "s" : ""} not captured`);
        }
        if (addedAssumptions) {
          updates.push(`${addedAssumptions} new assumption${addedAssumptions > 1 ? "s" : ""}`);
        }
        appendAiMessage(`Deep check complete — ${updates.join(", ")}.`);
        setAuditSummary(`Deep check added ${updates.join(", ")}.`);
      } else {
        setAuditSummary("Deep check complete — no changes found.");
      }
      setAuditSummaryAt(Date.now());

      setAuditStatus("completed");
    } catch (error) {
      console.log("[audit:error]", error);
      setAuditStatus("failed");
    }
  };

  const handleManualDeepAudit = () => {
    const transcript = lastTranscriptRef.current ?? "";
    if (!structuredInvoice || !transcript.trim()) {
      return;
    }
    runDeepAudit({
      structuredInvoice,
      sourceText: transcript,
      decisionSignature: openDecisionSignatureRef.current ?? ""
    });
  };

  const maybeRunDeepAudit = ({ auditStatus: nextAuditStatus, transcript, structuredInvoice, decisionSignature }) => {
    if (!shouldRunDeepAudit(nextAuditStatus, transcript)) {
      return;
    }
    runDeepAudit({ structuredInvoice, sourceText: transcript, decisionSignature });
  };

  const quickReplies = (() => {
    if (intakePhase === "awaiting_follow_up" && followUp?.type === "labor_pricing") {
      const laborItems = followUp?.laborItems ?? [];
      const missingCount = laborItems.filter((item) => typeof item.hours !== "number").length;
      const targetCount = missingCount > 0 ? missingCount : laborItems.length;
      const formatLabel = (hoursList) => `Use ${hoursList.map((hour) => `${hour}h`).join(", ")}`;
      const formatValue = (hoursList) =>
        `${hoursList
          .map((hour) => `${hour} hour${hour === 1 ? "" : "s"}`)
          .join(", ")}.`;
      const buildHourSuggestions = (count) => {
        if (count <= 0) {
          return [];
        }
        if (count === 1) {
          return [[1], [2], [3]];
        }
        if (count === 2) {
          return [
            [1, 1],
            [2, 1],
            [2, 2]
          ];
        }
        if (count === 3) {
          return [
            [2, 1, 1],
            [1, 1, 1],
            [2, 2, 2]
          ];
        }
        return [];
      };

      if (Number.isFinite(pendingLaborRate)) {
        const suggestions = buildHourSuggestions(targetCount);
        return suggestions.map((hoursList, index) => ({
          id: `labor-hours-${index}`,
          label: formatLabel(hoursList),
          value: formatValue(hoursList)
        }));
      }

      const commonRates = [85, 95, 120];
      return commonRates.map((rate) => ({
        id: `labor-rate-${rate}`,
        label: `Use $${rate}/hr`,
        value: `Hourly $${rate}/hr.`
      }));
    }
    return [];
  })();

  const handleGenerateInvoice = () => {
    if (!finishedInvoice) {
      return;
    }
    try {
      const draft = buildDraftFromInvoice(finishedInvoice, pendingTaxRate ?? "0");
      window.localStorage.setItem("invoiceDraft", JSON.stringify(draft));
      navigate("/manual");
    } catch (error) {
      console.error("Failed to seed draft", error);
      appendAiMessage("Something went wrong while creating the draft.");
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
    setAuditStatus(null);
    setAuditSummary("");
    setAuditSummaryAt(null);
    setSummaryUpdatedAt(null);
    setReviewCardCollapsed(true);
    setShowChatInput(false);
    setDecisionToast(null);
    openDecisionSignatureRef.current = "";
    lastDecisionResolutionRef.current = "";
    decisionActionRef.current = null;
    if (decisionToastTimeoutRef.current) {
      window.clearTimeout(decisionToastTimeoutRef.current);
      decisionToastTimeoutRef.current = null;
    }
    auditRequestIdRef.current += 1;
  };

  useEffect(() => {
    if (openDecisions.length > 0) {
      scrollToSection(decisionsRef);
    }
  }, [openDecisions.length]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    intakePhaseRef.current = intakePhase;
    summaryLockRef.current = intakePhase === "ready_to_generate";
  }, [intakePhase]);

  useEffect(() => {
    if (hasReviewCard && !hasAutoCollapsedRef.current) {
      setAssumptionsCollapsed(true);
      hasAutoCollapsedRef.current = true;
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

  const runIntakeRequest = async (nextMessages, lastUserMessage, options = {}) => {
    const transcript = buildTranscript(nextMessages);
    if (!transcript) {
      return;
    }
    const preferredMode = options.mode ?? (shouldUseFastMode(transcript) ? "fast" : "full");
    const requestMode = preferredMode === "fast" ? "fast" : "full";
    lastMessagesRef.current = nextMessages;
    lastTranscriptRef.current = transcript;
    lastUserMessageRef.current = lastUserMessage ?? "";
    lastIntakeModeRef.current = requestMode;
    if (timeoutMessageIdRef.current) {
      dismissTimeoutMessage(timeoutMessageIdRef.current);
    }
    abortOngoingRequest();
    auditRequestIdRef.current += 1;
    setAuditStatus(null);
    setAuditSummary("");
    setAuditSummaryAt(null);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const requestStartedAt = Date.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsTyping(true);
    clearSlowResponseTimer();
    const slowDelay = getSlowResponseDelay(transcript);
    if (slowDelay) {
      slowResponseTimeoutRef.current = window.setTimeout(() => {
        if (requestId === requestIdRef.current && !summaryLockRef.current) {
          appendTimeoutMessage(requestMode, "intake");
        }
      }, slowDelay);
    }
    try {
      const response = await fetch("/api/invoices/from-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messyInput: transcript, lastUserMessage, mode: requestMode }),
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Intake failed.");
      }
      if (requestId !== requestIdRef.current) {
        console.log("[intake:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      if (summaryLockRef.current) {
        console.log("[intake:ignored:summary_lock]", {
          requestId,
          phase: intakePhaseRef.current
        });
        return;
      }
      const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
      const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
      const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
      const nextAuditStatus = payload?.auditStatus ?? null;
      setAuditStatus(nextAuditStatus);
      setOpenDecisions(nextOpenDecisions);
      setAssumptions(nextAssumptions);
      setUnparsedLines(nextUnparsedLines);
      setPendingLaborRate(null);
      const previousDecisions = openDecisionsRef.current ?? [];
      const resolvedCount = Math.max(0, previousDecisions.length - nextOpenDecisions.length);
      const decisionAction = decisionActionRef.current;
      decisionActionRef.current = null;
      const decisionAck = buildDecisionAckMessage(decisionAction, resolvedCount);

      if (payload?.needsFollowUp) {
        setLaborPricingNote("");
        setPendingLaborRate(null);
        setFollowUp(payload.followUp ?? null);
        setStructuredInvoice(payload.structuredInvoice ?? null);
        setFinishedInvoice(null);
        setIntakePhase("awaiting_follow_up");
        const followUpText = payload?.followUp?.message
          ? `${payload.followUp.message} Reply with either a flat amount (e.g. "flat $300") or an hourly rate and hours per line. You can also tap a suggested rate below.`
          : "I need a bit more pricing detail. Share either a flat amount or an hourly rate + hours.";
        if (decisionAck) {
          appendAiMessage(decisionAck);
          showDecisionToast(decisionAck);
        }
        appendAiMessage(followUpText);
        const responseAt = Date.now();
        const summaryAt = lastSummaryMetaRef.current?.at;
        console.log("[intake:response]", {
          requestId,
          requestStartedAt,
          responseAt,
          summaryAt,
          summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
          completedAfterSummary: summaryAt ? responseAt > summaryAt : false,
          needsFollowUp: true
        });
        return;
      }
      setFollowUp(null);
      setStructuredInvoice(payload.structuredInvoice ?? null);
      setFinishedInvoice(payload.invoice ?? null);
      const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
      if (nextOpenDecisions.length > 0) {
        setIntakePhase("ready_to_summarize");
        const isRepeatDecision =
          decisionSignature && decisionSignature === openDecisionSignatureRef.current;
        const followUpMessage = isRepeatDecision
          ? buildDecisionFollowUp(nextOpenDecisions)
          : buildSummaryText(payload.invoice, nextOpenDecisions, nextUnparsedLines.length);
        openDecisionSignatureRef.current = decisionSignature;
        if (decisionAck) {
          appendAiMessage(decisionAck);
          showDecisionToast(decisionAck);
        }
        isRepeatDecision
          ? appendAiMessage(followUpMessage)
          : appendSummaryMessage(
              followUpMessage,
              buildReviewPayload(payload.invoice, nextOpenDecisions, nextUnparsedLines)
            );
        maybeRunDeepAudit({
          auditStatus: nextAuditStatus,
          transcript,
          structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
          decisionSignature
        });
        const responseAt = Date.now();
        const summaryAt = lastSummaryMetaRef.current?.at;
        console.log("[intake:response]", {
          requestId,
          requestStartedAt,
          responseAt,
          summaryAt,
          summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
          completedAfterSummary: summaryAt ? responseAt > summaryAt : false,
          needsFollowUp: false,
          openDecisions: nextOpenDecisions.map((decision) => ({
            id: decision.id,
            kind: decision.kind
          }))
        });
      } else {
        setIntakePhase("ready_to_summarize");
        openDecisionSignatureRef.current = "";
        if (decisionAck) {
          appendAiMessage(decisionAck);
          showDecisionToast(decisionAck);
        }
        appendSummaryMessage(
          buildSummaryText(payload.invoice, [], nextUnparsedLines.length),
          buildReviewPayload(payload.invoice, [], nextUnparsedLines)
        );
        maybeRunDeepAudit({
          auditStatus: nextAuditStatus,
          transcript,
          structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
          decisionSignature: ""
        });
        const responseAt = Date.now();
        const summaryAt = lastSummaryMetaRef.current?.at;
        console.log("[intake:response]", {
          requestId,
          requestStartedAt,
          responseAt,
          summaryAt,
          summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
          completedAfterSummary: summaryAt ? responseAt > summaryAt : false,
          needsFollowUp: false,
          openDecisions: []
        });
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        console.log("[intake:error:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      decisionActionRef.current = null;
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      const responseAt = Date.now();
      const summaryAt = lastSummaryMetaRef.current?.at;
      console.log("[intake:error]", {
        requestId,
        requestStartedAt,
        responseAt,
        summaryAt,
        summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
        completedAfterSummary: summaryAt ? responseAt > summaryAt : false
      });
      appendAiMessage("Sorry—something went wrong. Can you try that again?");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsTyping(false);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      clearSlowResponseTimer();
    }
  };

  const runLaborPricingRequest = async (laborPricing, transcript) => {
    if (!structuredInvoice) {
      appendAiMessage("I need to re-check the details before finishing. Please resend your notes.");
      setIntakePhase("collecting");
      return;
    }
    lastTranscriptRef.current = transcript ?? lastTranscriptRef.current;
    if (timeoutMessageIdRef.current) {
      dismissTimeoutMessage(timeoutMessageIdRef.current);
    }
    abortOngoingRequest();
    auditRequestIdRef.current += 1;
    setAuditStatus(null);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const requestStartedAt = Date.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsTyping(true);
    clearSlowResponseTimer();
    const slowDelay = getSlowResponseDelay(transcript ?? lastTranscriptRef.current);
    if (slowDelay) {
      slowResponseTimeoutRef.current = window.setTimeout(() => {
        if (requestId === requestIdRef.current && !summaryLockRef.current) {
          appendTimeoutMessage(lastIntakeModeRef.current, "labor");
        }
      }, slowDelay);
    }
    try {
      const response = await fetch("/api/invoices/from-input/labor-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredInvoice,
          laborPricing,
          sourceText: transcript,
          mode: lastIntakeModeRef.current
        }),
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Labor pricing failed.");
      }
      if (requestId !== requestIdRef.current) {
        console.log("[labor:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      if (summaryLockRef.current) {
        console.log("[labor:ignored:summary_lock]", {
          requestId,
          phase: intakePhaseRef.current
        });
        return;
      }
      const nextOpenDecisions = Array.isArray(payload?.openDecisions) ? payload.openDecisions : [];
      const nextAssumptions = Array.isArray(payload?.assumptions) ? payload.assumptions : [];
      const nextUnparsedLines = Array.isArray(payload?.unparsedLines) ? payload.unparsedLines : [];
      const nextAuditStatus = payload?.auditStatus ?? null;
      setAuditStatus(nextAuditStatus);
      setOpenDecisions(nextOpenDecisions);
      setAssumptions(nextAssumptions);
      setUnparsedLines(nextUnparsedLines);
      setPendingLaborRate(null);
      const previousDecisions = openDecisionsRef.current ?? [];
      const resolvedCount = Math.max(0, previousDecisions.length - nextOpenDecisions.length);
      const decisionAction = decisionActionRef.current;
      decisionActionRef.current = null;
      const decisionAck = buildDecisionAckMessage(decisionAction, resolvedCount);
      setFollowUp(null);
      setStructuredInvoice(payload.structuredInvoice ?? structuredInvoice);
      setFinishedInvoice(payload.invoice ?? null);
      const decisionSignature = nextOpenDecisions.map((decision) => decision.prompt).sort().join("|");
      if (nextOpenDecisions.length > 0) {
        setIntakePhase("ready_to_summarize");
        const isRepeatDecision =
          decisionSignature && decisionSignature === openDecisionSignatureRef.current;
        const followUpMessage = isRepeatDecision
          ? buildDecisionFollowUp(nextOpenDecisions)
          : buildSummaryText(payload.invoice, nextOpenDecisions, nextUnparsedLines.length);
        openDecisionSignatureRef.current = decisionSignature;
        if (decisionAck) {
          appendAiMessage(decisionAck);
          showDecisionToast(decisionAck);
        }
        isRepeatDecision
          ? appendAiMessage(followUpMessage)
          : appendSummaryMessage(
              followUpMessage,
              buildReviewPayload(payload.invoice, nextOpenDecisions, nextUnparsedLines)
            );
        maybeRunDeepAudit({
          auditStatus: nextAuditStatus,
          transcript: transcript ?? lastTranscriptRef.current,
          structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
          decisionSignature
        });
        const responseAt = Date.now();
        const summaryAt = lastSummaryMetaRef.current?.at;
        console.log("[labor:response]", {
          requestId,
          requestStartedAt,
          responseAt,
          summaryAt,
          summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
          completedAfterSummary: summaryAt ? responseAt > summaryAt : false,
          openDecisions: nextOpenDecisions.map((decision) => ({
            id: decision.id,
            kind: decision.kind
          }))
        });
      } else {
        setIntakePhase("ready_to_summarize");
        openDecisionSignatureRef.current = "";
        if (decisionAck) {
          appendAiMessage(decisionAck);
          showDecisionToast(decisionAck);
        }
        appendSummaryMessage(
          buildSummaryText(payload.invoice, [], nextUnparsedLines.length),
          buildReviewPayload(payload.invoice, [], nextUnparsedLines)
        );
        maybeRunDeepAudit({
          auditStatus: nextAuditStatus,
          transcript: transcript ?? lastTranscriptRef.current,
          structuredInvoice: payload.structuredInvoice ?? structuredInvoice,
          decisionSignature: ""
        });
        const responseAt = Date.now();
        const summaryAt = lastSummaryMetaRef.current?.at;
        console.log("[labor:response]", {
          requestId,
          requestStartedAt,
          responseAt,
          summaryAt,
          summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
          completedAfterSummary: summaryAt ? responseAt > summaryAt : false,
          openDecisions: []
        });
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        console.log("[labor:error:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      decisionActionRef.current = null;
      if (timeoutMessageIdRef.current) {
        dismissTimeoutMessage(timeoutMessageIdRef.current);
      }
      const responseAt = Date.now();
      const summaryAt = lastSummaryMetaRef.current?.at;
      console.log("[labor:error]", {
        requestId,
        requestStartedAt,
        responseAt,
        summaryAt,
        summaryRequestId: lastSummaryMetaRef.current?.requestId ?? null,
        completedAfterSummary: summaryAt ? responseAt > summaryAt : false
      });
      appendAiMessage("I still need the labor pricing details to finish the invoice.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsTyping(false);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      clearSlowResponseTimer();
    }
  };

  const runInvoiceEditRequest = async (instruction) => {
    if (!finishedInvoice) {
      appendAiMessage("I need a draft before I can edit it. Please generate one first.");
      return;
    }
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const requestStartedAt = Date.now();
    setIsTyping(true);
    try {
      const response = await fetch("/api/invoices/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice: finishedInvoice,
          instruction
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Edit failed.");
      }
      if (requestId !== requestIdRef.current) {
        console.log("[edit:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      const nextInvoice = payload?.invoice ?? finishedInvoice;
      setFinishedInvoice(nextInvoice);
      appendSummaryMessage(
        buildSummaryText(nextInvoice, openDecisions, unparsedLines.length),
        buildReviewPayload(nextInvoice, openDecisions, unparsedLines)
      );
      if (payload?.followUp) {
        appendAiMessage(payload.followUp);
      }
      setIntakePhase("ready_to_generate");
      const responseAt = Date.now();
      console.log("[edit:response]", {
        requestId,
        requestStartedAt,
        responseAt
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        console.log("[edit:error:stale]", { requestId, current: requestIdRef.current });
        return;
      }
      console.log("[edit:error]", { requestId, requestStartedAt, responseAt: Date.now() });
      appendAiMessage("Sorry—something went wrong while updating the draft.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsTyping(false);
      }
    }
  };

  const parseLaborPricing = (text, laborItems = [], options = {}) => {
    const pendingRate = Number.isFinite(options.pendingRate) ? Number(options.pendingRate) : null;
    const normalized = text.toLowerCase();
    const laborKeywords = new Set(["labor", "hour", "hours", "hr", "rate", "time", "visit", "work", "service"]);
    const itemKeywords = new Set();
    laborItems.forEach((item) => {
      const description = item?.description ?? "";
      description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
        .forEach((word) => itemKeywords.add(word));
    });
    const hasLaborContext =
      Array.from(laborKeywords).some((word) => normalized.includes(word)) ||
      Array.from(itemKeywords).some((word) => normalized.includes(word));
    const isNegative =
      normalized.includes("not included") ||
      normalized.includes("not covered") ||
      normalized.includes("not in the fee");
    const includedInFlat =
      (normalized.includes("included in the flat") ||
        normalized.includes("included in flat") ||
        normalized.includes("included in the fee") ||
        normalized.includes("included in the $")) &&
      !isNegative;
    const noCharge =
      (normalized.includes("no extra charge") ||
        normalized.includes("no extra hourly") ||
        normalized.includes("no extra fee") ||
        normalized.includes("no charge")) &&
      !isNegative;
    const alreadyCovered =
      (normalized.includes("already covered") || normalized.includes("covered already")) &&
      !isNegative;
    const declinedBilling =
      (normalized.includes("no billing") ||
        normalized.includes("dont bill") ||
        normalized.includes("don't bill") ||
        normalized.includes("do not bill")) &&
      !isNegative;
    const resolutionType = includedInFlat
      ? "included_in_flat_fee"
      : noCharge
        ? "no_charge"
        : alreadyCovered
          ? "already_covered"
          : declinedBilling
            ? "declined_billing"
            : null;
    if (resolutionType && hasLaborContext) {
      return { resolutionType };
    }

    const hourlyIntent =
      normalized.includes("hourly") ||
      normalized.includes("/hr") ||
      normalized.includes("per hour") ||
      normalized.includes("hr");
    const flatIntent =
      normalized.includes("flat") ||
      normalized.includes("flat fee") ||
      normalized.includes("total") ||
      normalized.includes("lump sum");

    const rateMatch =
      text.match(/(?:rate|hourly|per hour|\/hr|hr)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
      text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)/i);
    const rate = rateMatch ? Number(rateMatch[1]) : null;

    const hourMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/gi)).map(
      (match) => Number(match[1])
    );
    const hasHours = hourMatches.length > 0;
    const shouldTreatHourly = hourlyIntent || Boolean(rateMatch) || (pendingRate && hasHours);

    if (shouldTreatHourly) {
      const effectiveRate = rate ?? pendingRate;
      if (!effectiveRate) {
        return { error: "Please include an hourly rate (e.g. $95/hr)." };
      }
      const existingHours = laborItems.map((item) => item.hours).filter((value) => value !== undefined);
      const missingCount = laborItems.length - existingHours.length;
      const parsedHours =
        hourMatches.length > 0
          ? hourMatches
          : missingCount === 0
            ? existingHours
            : [];

      let lineHours = [];
      if (missingCount === 0 && existingHours.length === laborItems.length) {
        lineHours = existingHours;
      } else if (parsedHours.length === laborItems.length) {
        lineHours = parsedHours;
      } else if (parsedHours.length === missingCount && existingHours.length > 0) {
        let parsedIndex = 0;
        lineHours = laborItems.map((item) => {
          if (typeof item.hours === "number") {
            return item.hours;
          }
          const nextHour = parsedHours[parsedIndex];
          parsedIndex += 1;
          return nextHour;
        });
      }

      if (lineHours.length !== laborItems.length || lineHours.some((value) => !Number.isFinite(value))) {
        if (!hasHours && missingCount > 0) {
          return { rateOnly: effectiveRate };
        }
        return {
          error: `Please provide hours for each labor line (${laborItems.length} total).`
        };
      }

      return {
        laborPricing: {
          billingType: "hourly",
          rate: effectiveRate,
          lineHours
        }
      };
    }

    if (flatIntent) {
      const flatMatch =
        text.match(/flat\s*(?:fee|amount)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
        text.match(/total\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
        text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      const flatAmount = flatMatch ? Number(flatMatch[1]) : null;
      if (!flatAmount) {
        return { error: "Please include a flat amount (e.g. flat $250)." };
      }
      return {
        laborPricing: {
          billingType: "flat",
          flatAmount
        }
      };
    }

    return {
      error: "Please reply with a flat amount or an hourly rate plus hours."
    };
  };

  const submitUserMessage = (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    const normalized = trimmed.toLowerCase();
    if (isExplicitNoTax(normalized)) {
      setPendingTaxRate(null);
    }
    const hasTaxRateInstruction =
      /\b(tax\s*rate|apply\s+tax|add\s+tax|include\s+tax|charge\s+tax|set\s+tax)\b/i.test(trimmed);
    const detectedTaxRate = hasTaxRateInstruction ? extractTaxRateFromText(trimmed) : null;
    if (detectedTaxRate !== null) {
      setPendingTaxRate(String(detectedTaxRate));
    }
    const canConfirmWhileTyping =
      intakePhase === "ready_to_summarize" &&
      confirmationKeywords.some((keyword) => normalized.includes(keyword));
    const confirmationCandidate = confirmationKeywords.some((keyword) => normalized.includes(keyword));
    const decisionSnapshot = openDecisions.map((decision) => ({
      id: decision.id,
      kind: decision.kind,
      resolved: false
    }));
    if (confirmationCandidate) {
      console.log("[confirm:submit]", {
        message: trimmed,
        intakePhase,
        openDecisionsCount: openDecisions.length,
        openDecisions: decisionSnapshot,
        isTyping,
        canConfirmWhileTyping
      });
    }
    if (isTyping && !canConfirmWhileTyping) {
      if (confirmationCandidate) {
        console.log("[confirm:block:isTyping]", {
          intakePhase,
          openDecisionsCount: openDecisions.length,
          isTyping,
          canConfirmWhileTyping
        });
      }
      return false;
    }
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: trimmed
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputValue("");

    if (intakePhase === "ready_to_generate") {
      runInvoiceEditRequest(trimmed);
      return true;
    }

    if (intakePhase === "ready_to_summarize") {
      const isAffirmative = confirmationKeywords.some((keyword) => normalized.includes(keyword));
      const isNegative = rejectionKeywords.some((keyword) => normalized.includes(keyword));
      const hasNumbers = /\d/.test(normalized);
      const wordCount = normalized.split(/\s+/).length;

      if (isAffirmative) {
        console.log("[confirm:enter]", {
          intakePhase,
          openDecisionsCount: openDecisions.length,
          isTyping,
          canConfirmWhileTyping
        });
        setIntakePhase("ready_to_generate");
        appendAiMessage("Checkpoint confirmed — ready to generate the draft invoice.");
        return true;
      }

      if (isNegative && !hasNumbers && wordCount <= 4) {
        setIntakePhase("collecting");
        appendAiMessage("Got it. What should I fix?");
        return true;
      }
    }

    if (intakePhase === "awaiting_follow_up" && followUp?.type === "labor_pricing") {
      const parseResult = parseLaborPricing(trimmed, followUp?.laborItems ?? [], {
        pendingRate: pendingLaborRate
      });
      if (parseResult?.resolutionType) {
        const resolutionCopy = {
          included_in_flat_fee: "Included in flat fee — no separate charge.",
          no_charge: "No extra charge — got it.",
          already_covered: "Already covered — I’ll move on.",
          declined_billing: "Not billed separately — understood."
        }[parseResult.resolutionType];
        setLaborPricingNote(resolutionCopy ?? "");
        setPendingLaborRate(null);
        appendAiMessage(resolutionCopy ?? "Got it — no separate charge.");
        setIntakePhase("collecting");
        const shouldResolveDecisions = openDecisions.length > 0 && intakePhase !== "awaiting_follow_up";
        const resolutionText = shouldResolveDecisions
          ? trimmed
          : lastDecisionResolutionRef.current || undefined;
        if (shouldResolveDecisions) {
          lastDecisionResolutionRef.current = trimmed;
        }
        runIntakeRequest(nextMessages, resolutionText);
        return true;
      }
      if (parseResult?.laborPricing) {
        setPendingLaborRate(null);
        setLaborPricingNote("");
        appendAiMessage(
          parseResult.laborPricing.billingType === "flat"
            ? "Flat labor amount noted."
            : "Hourly rate noted."
        );
        runLaborPricingRequest(parseResult.laborPricing, buildTranscript(nextMessages));
        return true;
      }
      if (parseResult?.rateOnly) {
        const rate = parseResult.rateOnly;
        setPendingLaborRate(rate);
        const itemCount = followUp?.laborItems?.length ?? 0;
        const rateNote = itemCount
          ? `Rate noted at $${rate}/hr — add hours for ${itemCount} item${itemCount > 1 ? "s" : ""}.`
          : `Rate noted at $${rate}/hr — add hours for each labor line.`;
        setLaborPricingNote(rateNote);
        appendAiMessage(
          `Got it — $${rate}/hr. How many hours for each labor line? Reply like: \"2 hours, 1 hour\".`
        );
        return true;
      }
      if (parseResult?.error) {
        appendAiMessage(parseResult.error);
        return true;
      }
    }

    const shouldResolveDecisions = openDecisions.length > 0 && intakePhase !== "awaiting_follow_up";
    const resolutionText = shouldResolveDecisions ? trimmed : lastDecisionResolutionRef.current || undefined;
    if (shouldResolveDecisions) {
      lastDecisionResolutionRef.current = trimmed;
    }
    runIntakeRequest(nextMessages, resolutionText);
    return true;
  };

  const handleSend = (event) => {
    event.preventDefault();
    submitUserMessage(inputValue);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm font-semibold text-emerald-700"
              onClick={() => navigate("/")}
            >
              Back
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
              onClick={handleResetIntake}
            >
              New intake
            </button>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">AI Invoice Assistant</p>
            <p className="text-xs text-slate-500">Draft in progress</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28">
          <div className="flex-1 overflow-y-auto pb-4 pt-6">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Intake steps
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {wizardSteps.map((step, index) => {
                    const status =
                      index < wizardStepIndex ? "complete" : index === wizardStepIndex ? "active" : "upcoming";
                    const badgeClass =
                      status === "complete"
                        ? "bg-emerald-600 text-white"
                        : status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500";
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${badgeClass}`}>
                          {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {wizardStep === "paste" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Paste your notes</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Drop anything here — dates, rates, parts, or “not sure” items. I’ll organize it.
                  </p>
                  <textarea
                    id="ai-intake-input"
                    rows={6}
                    className="mt-4 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="Example: Jan 10 fixed sink 2h at $90/hr. Parts: washer $5. Not sure if I should bill cabinet adjustment."
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-emerald-300"
                      onClick={() => submitUserMessage(inputValue)}
                      disabled={!inputValue.trim() || isTyping}
                    >
                      Build invoice
                    </button>
                    {isTyping ? <p className="text-xs text-slate-500">Working on it…</p> : null}
                  </div>
                </div>
              ) : null}

              {intakePhase === "awaiting_follow_up" && followUp ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <p className="text-sm font-semibold text-amber-900">Pricing needed</p>
                  <p className="mt-1 text-sm text-amber-900">{followUp.message}</p>
                  {quickReplies.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickReplies.map((reply) => (
                        <button
                          key={reply.id}
                          type="button"
                          className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-400"
                          onClick={() => submitUserMessage(reply.value)}
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
                      className="flex-1 resize-none rounded-xl border border-amber-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Reply with a rate and hours or a flat amount…"
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                    />
                    <button
                      type="button"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-emerald-300"
                      onClick={() => submitUserMessage(inputValue)}
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
                      <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm">
                        <p className="text-sm font-semibold text-amber-900">
                          {isLaborTimeout ? "Still working on labor pricing." : "Still working on this."}
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                          {canRetryShort
                            ? "Want me to keep going or try a shorter pass?"
                            : "Want me to keep going or cancel?"}
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
                              Retry shorter
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
                  const payload = message.payload;
                  const decisionKeywordSets = buildDecisionKeywordSets(payload.decisions ?? []);
                  const categorized = payload.lineItems.reduce(
                    (acc, item) => {
                      const type = item.type ?? "other";
                      if (type === "labor") {
                        acc.labor.push(item);
                      } else if (type === "material") {
                        acc.material.push(item);
                      } else {
                        acc.other.push(item);
                      }
                      return acc;
                    },
                    { labor: [], material: [], other: [] }
                  );
                  const sections = [
                    { id: "labor", label: "Work", items: categorized.labor },
                    { id: "material", label: "Materials", items: categorized.material },
                    { id: "other", label: "Other", items: categorized.other }
                  ].filter((section) => section.items.length > 0);
                  const quickFixes = [];
                  const primaryLaborRate =
                    categorized.labor.find((item) => Number.isFinite(item.unitPrice))?.unitPrice ??
                    categorized.labor.find((item) => Number.isFinite(item.amount))?.amount ??
                    null;
                  const pendingDecisionCount = payload.decisions.length;
                  const nextStepText =
                    pendingDecisionCount > 0
                      ? `Next: resolve ${pendingDecisionCount} decision${
                          pendingDecisionCount > 1 ? "s" : ""
                        } below to generate the invoice.`
                      : "Next: confirm below to generate the invoice.";
                  if (primaryLaborRate) {
                    quickFixes.push({
                      id: "fix-rate",
                      label: "Change rate",
                      value: `Change the labor rate to $${primaryLaborRate}/hr.`
                    });
                  }
                  if (categorized.labor.length > 0) {
                    quickFixes.push({
                      id: "fix-hours",
                      label: "Update hours",
                      value: "Update the labor hours to: "
                    });
                  }
                  if (payload.lineItems.length > 0) {
                    quickFixes.push({
                      id: "fix-exclude",
                      label: "Exclude item",
                      value: `Exclude ${payload.lineItems[0].description}.`
                    });
                  }
                  if (payload.notes) {
                    quickFixes.push({
                      id: "fix-notes",
                      label: "Edit notes",
                      value: "Update the invoice notes to: "
                    });
                  }
                  if (payload.customerName) {
                    quickFixes.push({
                      id: "fix-client",
                      label: "Update client",
                      value: `Update the client name to `
                    });
                  }

                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Review
                            </p>
                            <p className="text-sm font-semibold text-slate-900">Draft snapshot</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {payload.customerName ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                Client: {payload.customerName}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => focusInputWithValue("Update: ")}
                              disabled={isTyping}
                            >
                              Fix by chat
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                              onClick={() => setReviewCardCollapsed((prev) => !prev)}
                              disabled={isTyping}
                            >
                              {reviewCardCollapsed ? "Show details" : "Hide details"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            <span className="font-semibold text-slate-900">Next step:</span>{" "}
                            {nextStepText}
                            {pendingDecisionCount > 0 ? (
                              <button
                                type="button"
                                className="ml-2 inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                                onClick={() => scrollToSection(decisionsRef)}
                                disabled={isTyping}
                              >
                                Go to decisions
                              </button>
                            ) : null}
                          </div>
                          {reviewCardCollapsed && summarySnapshot ? (
                            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
                              {summarySnapshot}
                            </div>
                          ) : null}
                          {!reviewCardCollapsed
                            ? sections.map((section) => (
                                <div key={section.id} className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {section.label}
                                  </p>
                                  <div className="space-y-2">
                                    {section.items.map((item) => {
                                      const status = getLineItemStatus(item, decisionKeywordSets);
                                      return (
                                        <div
                                          key={item.id}
                                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                                        >
                                          <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-800">
                                              {item.description}
                                            </p>
                                            {Number.isFinite(item.amount) ? (
                                              <p className="text-xs text-slate-500">
                                                {formatMoney(item.amount)}
                                              </p>
                                            ) : null}
                                          </div>
                                          <span
                                            className={`rounded-full px-2 py-1 text-xs font-semibold ${status.badgeClass}`}
                                          >
                                            {status.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            : null}
                        </div>

                        {!reviewCardCollapsed && payload.notes ? (
                          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Notes
                            </p>
                            <p className="mt-1 text-sm text-slate-700">{payload.notes}</p>
                          </div>
                        ) : null}

                        {!reviewCardCollapsed && payload.decisions.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                              Decisions pending
                            </p>
                            <p className="mt-1 text-sm text-amber-900">
                              Resolve {payload.decisions.length} item{payload.decisions.length > 1 ? "s" : ""} below
                              to generate the invoice.
                            </p>
                            <button
                              type="button"
                              className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-amber-800 hover:text-amber-900"
                              onClick={() => scrollToSection(decisionsRef)}
                              disabled={isTyping}
                            >
                              Jump to decisions
                            </button>
                          </div>
                        ) : null}

                        {!reviewCardCollapsed && payload.unparsed.length > 0 ? (
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

                        {!reviewCardCollapsed && quickFixes.length > 0 ? (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Quick fixes
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {quickFixes.map((fix) => (
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
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        message.role === "user"
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-slate-800"
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                );
              })}
              {isTyping ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    <span>AI is typing</span>
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
          </div>
          {showAssumptionsCard ? (
            <div className="mt-3 space-y-2">
              <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {openDecisionCount > 0 ? "Decisions" : "Confirm"}
                    </h2>
                    {openDecisionCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        {openDecisionCount} decision{openDecisionCount > 1 ? "s" : ""} open
                      </span>
                    ) : null}
                  </div>
                  {hasReviewCard ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-700"
                      onClick={() => setAssumptionsCollapsed((prev) => !prev)}
                    >
                      {assumptionsCollapsed ? "Show details" : "Hide details"}
                    </button>
                  ) : null}
                </div>
                {summaryTimeLabel ? (
                  <p className="mt-1 text-xs text-slate-500">Summary updated {summaryTimeLabel}</p>
                ) : null}
                {auditStatus === "running" ? (
                  <p className="mt-1 text-xs text-slate-500">Deep check running…</p>
                ) : null}
                {auditStatus === "timed_out" ? (
                  <p className="mt-1 text-xs text-amber-600">
                    Deep check timed out — continuing with current snapshot.
                  </p>
                ) : null}
                {auditStatus === "failed" ? (
                  <p className="mt-1 text-xs text-amber-600">Deep check failed — continuing with current snapshot.</p>
                ) : null}
                {auditStatus === "completed" && auditSummary ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {auditSummary}
                    {auditSummaryTimeLabel ? ` (${auditSummaryTimeLabel})` : ""}
                  </p>
                ) : null}
                {(auditStatus === "timed_out" || auditStatus === "failed") ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
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
                {hasReviewCard && assumptionsCollapsed ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Details hidden — the review card above has the latest snapshot.
                  </p>
                ) : null}
                {intakePhase === "ready_to_summarize" ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Review & confirm (required)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        onClick={() => submitUserMessage("Confirm.")}
                        disabled={isTyping}
                      >
                        Confirm
                      </button>
                      {hasDecisions && !showQuickDecisions ? (
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                          onClick={() => scrollToSection(decisionsRef)}
                          disabled={isTyping}
                        >
                          Resolve decisions
                        </button>
                      ) : null}
                      {unparsedItems.length > 0 ? (
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                          onClick={() => scrollToSection(unparsedRef)}
                          disabled={isTyping}
                        >
                          Review not captured
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {showQuickDecisions ? (
                  <div
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                    ref={decisionsRef}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        {quickDecisionHeading}
                      </p>
                      <button
                        type="button"
                        className="text-xs font-semibold text-amber-800 hover:text-amber-900"
                        onClick={() => setShowDecisionWhy((prev) => !prev)}
                        disabled={isTyping}
                      >
                        {showDecisionWhy ? "Hide why" : "Why am I seeing this?"}
                      </button>
                    </div>
                    {showDecisionWhy ? (
                      <p className="mt-2 text-sm text-amber-900">
                        These are items your notes were unclear about. Choose Include or Exclude so I
                        don’t guess on money.
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
                                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                                onClick={() => handleDecisionAction(includeAction, includeValue)}
                                disabled={isTyping}
                              >
                                {includeLabel}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
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
                          <span>
                            Decision {clampedDecisionIndex + 1} of {decisionItems.length}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-amber-800 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() =>
                                setDecisionFocusIndex((prev) => Math.max(0, prev - 1))
                              }
                              disabled={isTyping || clampedDecisionIndex === 0}
                            >
                              Previous
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
                              ? "Show fewer decisions"
                              : `Show all decisions (${decisionItems.length})`}
                          </button>
                        </div>
                      ) : null}
                      {showAllDecisions && decisionItems.length > 1 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-amber-900">Resolve all pending items</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() => {
                                const includeAll = decisionItems
                                  .map((item) => buildDecisionActions(item).includeValue)
                                  .join("\n");
                                handleDecisionAction({ type: "bulk_include" }, includeAll);
                              }}
                              disabled={isTyping}
                            >
                              Include all
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                              onClick={() => {
                                const excludeAll = decisionItems
                                  .map((item) => buildDecisionActions(item).excludeValue)
                                  .join("\n");
                                handleDecisionAction({ type: "bulk_exclude" }, excludeAll);
                              }}
                              disabled={isTyping}
                            >
                              Exclude all
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {taxAssumptionPresent || pendingTaxRate ? (
                        <div className="space-y-2">
                          <p className="text-sm text-amber-900">
                            {pendingTaxRate
                              ? `Tax set to ${pendingTaxRate}% (draft).`
                              : "Tax: 0% assumed."}
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
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
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
                            {item.context ? (
                              <p className="text-xs text-amber-800">{item.context}</p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                                  onClick={() => handleDecisionAction(includeAction, includeValue)}
                                  disabled={isTyping}
                                >
                                  {includeLabel}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
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
                {showAssumptionDetails && unparsedItems.length > 0 ? (
                  <div
                    className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    ref={unparsedRef}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Not yet captured
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
                      {unparsedItems.map((item) => (
                        <li key={item.id}>
                          <div className="space-y-2">
                            <p>{item.text}</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
                                onClick={() => submitUserMessage(`Add to notes: ${item.text}`)}
                                disabled={isTyping}
                              >
                                Add to notes
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
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
                {showAssumptionDetails && assumptionItems.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Captured from notes
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">
                      {assumptionItems.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {showAssumptionDetails && auditAssumptionItems.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Assumptions made
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">
                      {auditAssumptionItems.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {quickReplies.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-600">{quickReplyLabel}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickReplies.map((reply) => (
                        <button
                          key={reply.id}
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                          onClick={() => submitUserMessage(reply.value)}
                          disabled={isTyping}
                        >
                          {reply.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
              <div className="space-y-2">
                <button
                  type="button"
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.98] ${
                    ctaDisabled
                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                      : "bg-emerald-600 text-white"
                  }`}
                  disabled={ctaDisabled}
                  onClick={handleGenerateInvoice}
                >
                  Generate Invoice
                </button>
                <p className="text-xs text-slate-500">{ctaHelper}</p>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {decisionToast ? (
        <div className="fixed bottom-24 left-0 right-0 z-40 flex justify-center px-4">
          <div className="max-w-3xl flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
            {decisionToast}
          </div>
        </div>
      ) : null}

      {hasReviewCard && !showChatInput ? (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Need to change something?</p>
              <p className="text-xs text-slate-500">Ask the AI to edit after you review.</p>
            </div>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
              onClick={() => {
                setShowChatInput(true);
                focusInputWithValue("Update: ");
              }}
            >
              Edit by chat
            </button>
          </div>
        </div>
      ) : null}
      {showChatInput ? (
        <form
          onSubmit={handleSend}
          className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <label className="sr-only" htmlFor="ai-intake-input">
                Message
              </label>
              <textarea
                id="ai-intake-input"
                rows={1}
                className="max-h-32 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder={intakeComplete ? "Ask for changes..." : "Paste your notes here..."}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-emerald-300"
              disabled={!inputValue.trim() || (isTyping && !canSendWhileTyping)}
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ManualInvoiceCanvas() {
  const navigate = useNavigate();
  const draftStorageKey = "invoiceDraft";
  const initialDraftRef = useRef(readDraftFromStorage(draftStorageKey));
  const initialDraft = initialDraftRef.current;
  const [invoiceNumber, setInvoiceNumber] = useState(() => initialDraft?.invoiceNumber ?? "INV-0001");
  const [invoiceDate, setInvoiceDate] = useState(() => initialDraft?.invoiceDate ?? "");
  const [fromDetails, setFromDetails] = useState(() => initialDraft?.fromDetails ?? "");
  const [billToDetails, setBillToDetails] = useState(() => initialDraft?.billToDetails ?? "");
  const [notes, setNotes] = useState(() => initialDraft?.notes ?? "");
  const [taxRate, setTaxRate] = useState(() => initialDraft?.taxRate ?? "0");
  const [lineItems, setLineItems] = useState(() =>
    Array.isArray(initialDraft?.lineItems) && initialDraft.lineItems.length > 0
      ? initialDraft.lineItems
      : [{ id: "line-1", description: "", qty: "", rate: "" }]
  );
  const [logoUrl, setLogoUrl] = useState(() => initialDraft?.logoUrl ?? null);
  const [stylePreset, setStylePreset] = useState(() => initialDraft?.stylePreset ?? "default");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState("style");
  const [draftStatus, setDraftStatus] = useState("");
  const saveTimeoutRef = useRef(null);
  const clearStatusTimeoutRef = useRef(null);
  const draftStatusLabel = "Draft restored";

  const stylePresets = {
    default: {
      label: "Classic",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-6",
      shellClass: "border-slate-200 bg-white shadow-sm",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-3xl font-['Fraunces'] tracking-[0.12em] text-slate-900",
      labelClass: "text-slate-700 font-semibold",
      inputClass:
        "rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    compact: {
      label: "Minimal",
      textClass: "text-[13px] text-slate-700 font-['Sora']",
      sectionGap: "space-y-5",
      shellClass: "border-slate-100 bg-white shadow-sm",
      metaClass: "text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-2xl font-semibold tracking-tight text-slate-900",
      labelClass: "text-slate-600 font-medium",
      inputClass:
        "rounded-md border border-slate-200 px-3 py-2 text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200",
      tableHeadClass: "text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    spacious: {
      label: "Bold",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-7",
      shellClass: "border-slate-200 bg-white shadow-md",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500",
      titleClass: "text-3xl font-['Archivo_Black'] tracking-[0.22em] text-slate-900",
      labelClass: "text-slate-800 font-semibold",
      inputClass:
        "rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    }
  };
  const activePreset = stylePresets[stylePreset] ?? stylePresets.default;

  const parseNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatMoney = (value) => `$${value.toFixed(2)}`;

  const getLineAmount = (item) => parseNumber(item.qty) * parseNumber(item.rate);
  const subtotal = lineItems.reduce((sum, item) => sum + getLineAmount(item), 0);
  const taxAmount = subtotal * (parseNumber(taxRate) / 100);
  const total = subtotal + taxAmount;
  const previewData = {
    invoiceNumber,
    invoiceDate,
    fromDetails,
    billToDetails,
    notes,
    taxRate,
    subtotal,
    taxAmount,
    total,
    lineItems,
    logoUrl
  };

  const handleLineItemChange = (id, field, value) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: `line-${Date.now()}`, description: "", qty: "", rate: "" }
    ]);
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        return;
      }
      setLogoUrl(result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleLogoRemove = () => {
    setLogoUrl(null);
  };

  const buildRewriteInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before rewriting." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: item.description.trim(),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
  };

  const buildEditableInvoicePayload = () => {
    const itemsWithDescriptions = lineItems.filter((item) => item.description.trim().length > 0);
    if (itemsWithDescriptions.length === 0) {
      return { error: "Add at least one line item description before using Fix by chat." };
    }
    const invoice = {
      invoiceNumber: invoiceNumber?.trim() || undefined,
      issueDate: invoiceDate || undefined,
      customerName: billToDetails?.trim() || undefined,
      currency: "USD",
      lineItems: itemsWithDescriptions.map((item) => ({
        id: item.id,
        type: "other",
        description: item.description.trim(),
        quantity: item.qty === "" ? undefined : parseNumber(item.qty),
        unitPrice: item.rate === "" ? undefined : parseNumber(item.rate),
        amount: getLineAmount(item)
      })),
      notes: notes?.trim() || undefined,
      subtotal,
      total,
      balanceDue: total
    };
    return { invoice };
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
    if (updatedInvoice.customerName !== undefined) {
      setBillToDetails(updatedInvoice.customerName ?? "");
    }
    if (updatedInvoice.notes !== undefined) {
      setNotes(updatedInvoice.notes ?? "");
    }
    if (Array.isArray(updatedInvoice.lineItems) && updatedInvoice.lineItems.length > 0) {
      setLineItems(
        updatedInvoice.lineItems.map((item, index) => ({
          id: item.id ?? `line-${Date.now()}-${index}`,
          description: item.description ?? "",
          qty: Number.isFinite(item.quantity) ? String(item.quantity) : "",
          rate: Number.isFinite(item.unitPrice) ? String(item.unitPrice) : ""
        }))
      );
    }
  };

  const applyRewriteChanges = ({ lineItems: rewrittenLines, notes: rewrittenNotes, mode }) => {
    if (Array.isArray(rewrittenLines) && rewrittenLines.length > 0) {
      setLineItems((prev) =>
        prev.map((item, index) => {
          const match =
            rewrittenLines.find((line) => line.id && line.id === item.id) ?? rewrittenLines[index];
          if (match && typeof match.description === "string") {
            return { ...item, description: match.description };
          }
          return item;
        })
      );
    }
    if (mode === "full" && typeof rewrittenNotes === "string") {
      setNotes(rewrittenNotes);
    }
  };

  const persistDraft = () => {
    const payload = {
      invoiceNumber,
      invoiceDate,
      fromDetails,
      billToDetails,
      notes,
      taxRate,
      lineItems,
      logoUrl,
      stylePreset
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
    fromDetails,
    billToDetails,
    notes,
    taxRate,
    lineItems,
    logoUrl,
    stylePreset
  ]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const previousTitle = document.title;
    const safeNumber = invoiceNumber?.trim() ? invoiceNumber.trim() : "Invoice";
    document.title = `Invoice-${safeNumber}`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 1000);
  };

  const isMobileInspectorOpen = inspectorOpen;
  const invoiceInteractionClass = isMobileInspectorOpen
    ? "pointer-events-none select-none opacity-60 md:pointer-events-auto md:opacity-100"
    : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <div className="mb-4 md:col-span-2 no-print">
          <button
            type="button"
            className="text-sm font-semibold text-slate-700"
            onClick={() => {
              persistDraft();
              navigate("/");
            }}
          >
            &larr; Back
          </button>
        </div>
        <div
          className={`printable-invoice w-full rounded-2xl border p-6 ${activePreset.shellClass} ${invoiceInteractionClass}`}
        >
          <div className={activePreset.sectionGap}>
            <div className={`flex items-center justify-between ${activePreset.metaClass}`}>
              <span>Invoice Document</span>
              <span className="flex items-center gap-2">
                {draftStatus ? <span className="text-xs text-slate-400">{draftStatus}</span> : null}
                <span>Draft</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 no-print">
              <button
                type="button"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                onClick={() => {
                  setActiveInspectorTab("assistant");
                  setInspectorOpen(true);
                }}
              >
                Fix by chat
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setInspectorOpen(true)}
              >
                Customize / Export
              </button>
            </div>

            <header className="space-y-5">
              {logoUrl ? (
                <div className="flex items-center">
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-12 w-auto max-w-[200px] object-contain"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className={activePreset.titleClass}>INVOICE</h1>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Draft document
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
              </div>
            </section>

            <section className="space-y-3">
              <div className="overflow-x-auto">
                <table className={`min-w-full text-left ${activePreset.textClass}`}>
                  <thead className={activePreset.tableHeadClass}>
                    <tr>
                      <th className="border-b border-slate-200 pb-2 pr-3">Description</th>
                      <th className="border-b border-slate-200 pb-2 pr-3">Qty</th>
                      <th className="border-b border-slate-200 pb-2 pr-3">Rate</th>
                      <th className="border-b border-slate-200 pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item) => (
                      <tr key={item.id} className="odd:bg-slate-50/70">
                        <td className="py-3 pr-3 align-top">
                          <input
                            type="text"
                            className={`w-full ${activePreset.inputClass} ${activePreset.textClass}`}
                            placeholder="Description"
                            value={item.description}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "description", event.target.value)
                            }
                          />
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
                        </td>
                        <td className="py-3 text-right align-top text-slate-600">
                          {item.qty !== "" && item.rate !== "" ? (
                            formatMoney(getLineAmount(item))
                          ) : (
                            <span className="text-xs font-semibold text-amber-600">Needs value</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className={`${activePreset.textClass} font-semibold text-emerald-700`}
                onClick={handleAddLineItem}
              >
                + Add line item
              </button>
            </section>

            <section className="flex justify-end">
              <div
                className={`w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 ${activePreset.textClass}`}
              >
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className={`flex justify-between ${activePreset.totalsMutedClass}`}>
                  <span className="flex items-center gap-2">
                    Tax
                    <input
                      type="number"
                      className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </span>
                  <span>{formatMoney(taxAmount)}</span>
                </div>
                <div className={`flex justify-between font-semibold ${activePreset.totalsStrongClass}`}>
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <p className={`${activePreset.textClass} ${activePreset.labelClass}`}>Notes / Terms</p>
              <textarea
                rows={4}
                className={`w-full resize-none bg-slate-50/70 ${activePreset.inputClass} ${activePreset.textClass}`}
                placeholder="Thank you for your business"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </section>
          </div>
        </div>

        <div className="hidden md:block no-print">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            logoUrl={logoUrl}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
            stylePreset={stylePreset}
            onStylePresetChange={setStylePreset}
            onPrint={handlePrint}
            onDownloadPdf={handleDownloadPdf}
            previewData={previewData}
            toneSource={{ lineItems, notes }}
            buildRewriteInvoicePayload={buildRewriteInvoicePayload}
            onApplyRewrite={applyRewriteChanges}
            buildEditableInvoicePayload={buildEditableInvoicePayload}
            onApplyAiEdit={applyAiEdit}
          />
        </div>
      </main>

      {isMobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white/95 md:hidden no-print">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            onClose={() => setInspectorOpen(false)}
            showCloseButton
            logoUrl={logoUrl}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
            stylePreset={stylePreset}
            onStylePresetChange={setStylePreset}
            onPrint={handlePrint}
            onDownloadPdf={handleDownloadPdf}
            previewData={previewData}
            toneSource={{ lineItems, notes }}
            buildRewriteInvoicePayload={buildRewriteInvoicePayload}
            onApplyRewrite={applyRewriteChanges}
            buildEditableInvoicePayload={buildEditableInvoicePayload}
            onApplyAiEdit={applyAiEdit}
          />
        </div>
      ) : null}
    </div>
  );
}

function InspectorPanel({
  activeTab,
  onTabChange,
  onClose,
  showCloseButton,
  logoUrl,
  onLogoChange,
  onLogoRemove,
  stylePreset,
  onStylePresetChange,
  onPrint,
  onDownloadPdf,
  previewData,
  toneSource,
  buildRewriteInvoicePayload,
  onApplyRewrite,
  buildEditableInvoicePayload,
  onApplyAiEdit
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
  const [pendingAssistantEdit, setPendingAssistantEdit] = useState(null);
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const previewCloseButtonRef = useRef(null);
  const previewFocusReturnRef = useRef(null);
  const assistantRequestIdRef = useRef(0);
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
    { id: "assistant", label: "Fix by chat", content: "AI edits" },
    { id: "export", label: "Export", content: "Export options coming soon" }
  ];
  const styleOptions = [
    { id: "default", label: "Classic" },
    { id: "compact", label: "Minimal" },
    { id: "spacious", label: "Bold" }
  ];
  const toneOptions = ["Formal", "Neutral", "Friendly"];

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
    fetch("/api/invoices/reword-full", {
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

  const submitAssistantEdit = () => {
    const instruction = assistantInstruction.trim();
    if (!instruction) {
      setAssistantError("Add an instruction for the AI.");
      return;
    }
    if (pendingAssistantEdit) {
      setAssistantError("Apply or discard the pending changes first.");
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
    setAssistantMessages((prev) => [...prev, { role: "user", text: instruction }]);
    fetch("/api/invoices/edit", {
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
        setAssistantError("Fix by chat failed. Try again.");
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

  const buildPreview = (items, previewNotes) => {
    const descriptionLines = items
      .filter((item) => item.description && item.description.trim())
      .map((item, index) => `${index + 1}. ${item.description.trim()}`)
      .join("\n");
    if (toneAction === "descriptions") {
      return descriptionLines || "No descriptions yet.";
    }
    const notesText = previewNotes?.trim() ? previewNotes.trim() : "No notes yet.";
    return `Descriptions:\n${descriptionLines || "No descriptions yet."}\n\nNotes:\n${notesText}`;
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
  const templateCatalog = {
    default: {
      name: "Classic",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-6",
      shellClass: "border-slate-200 bg-white shadow-sm",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-3xl font-['Fraunces'] tracking-[0.12em] text-slate-900",
      labelClass: "text-slate-700 font-semibold",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    compact: {
      name: "Minimal",
      textClass: "text-[13px] text-slate-700 font-['Sora']",
      sectionGap: "space-y-5",
      shellClass: "border-slate-100 bg-white shadow-sm",
      metaClass: "text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400",
      titleClass: "text-2xl font-semibold tracking-tight text-slate-900",
      labelClass: "text-slate-600 font-medium",
      tableHeadClass: "text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    },
    spacious: {
      name: "Bold",
      textClass: "text-sm text-slate-800 font-['Manrope']",
      sectionGap: "space-y-7",
      shellClass: "border-slate-200 bg-white shadow-md",
      metaClass: "text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500",
      titleClass: "text-3xl font-['Archivo_Black'] tracking-[0.22em] text-slate-900",
      labelClass: "text-slate-800 font-semibold",
      tableHeadClass: "text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500",
      totalsMutedClass: "text-slate-600",
      totalsStrongClass: "text-slate-900"
    }
  };
  const previewTemplate = previewTemplateId ? templateCatalog[previewTemplateId] : null;
  const templatePreviews = {
    default: {
      title: "bg-slate-900",
      rule: "bg-slate-200",
      row: "bg-slate-200",
      totals: "bg-slate-300",
      totalStrong: "bg-slate-900"
    },
    compact: {
      title: "bg-slate-400",
      rule: "bg-slate-200",
      row: "bg-slate-100",
      totals: "bg-slate-200",
      totalStrong: "bg-slate-500"
    },
    spacious: {
      title: "bg-slate-900",
      rule: "bg-slate-300",
      row: "bg-slate-200",
      totals: "bg-slate-300",
      totalStrong: "bg-slate-900"
    }
  };
  const previewIsSelected = previewTemplateId && stylePreset === previewTemplateId;
  const previewPreset = previewTemplate ?? templateCatalog.default;
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
        description: item.description?.trim() || "Untitled line item",
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

  return (
    <>
      <div className="flex h-full min-h-0 flex-col border border-slate-200 bg-white shadow-sm md:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  activeTab === tab.id ? "bg-emerald-600 text-white" : "text-slate-600"
                }`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {showCloseButton ? (
            <button
              type="button"
              className="text-sm font-semibold text-slate-600"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 text-sm text-slate-600">
          {activeTab === "style" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Templates</p>
                <div className="mt-3 grid gap-3">
                  {styleOptions.map((option) => {
                    const preview = templatePreviews[option.id] ?? templatePreviews.default;
                    const isSelected = stylePreset === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50/60 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        onClick={() => onStylePresetChange(option.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            {option.label}
                          </span>
                          {isSelected ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
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
                </div>
              ) : null}
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
                        selectedTone === tone
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-200 text-slate-600"
                      }`}
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
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
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
              <p className="text-sm font-semibold text-slate-900">Edit with AI</p>
              <p className="mt-1 text-xs text-slate-500">
                Ask for changes without retyping. The AI will only adjust what you request.
              </p>
            </div>
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
                        message.role === "user"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-white text-slate-600"
                      }`}
                    >
                      <p className="font-semibold uppercase tracking-wide text-[10px]">
                        {message.role === "user" ? "You" : "AI"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{message.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    Ask for changes like “Rename the logo line item to Brand refresh” or “Remove the
                    parking fee.”
                  </p>
                )}
              </div>
            </div>
            <textarea
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="Example: Change the labor rate to $80/hr and remove the parking line."
              value={assistantInstruction}
              onChange={(event) => setAssistantInstruction(event.target.value)}
              disabled={assistantLoading}
            />
            {pendingAssistantEdit ? (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Pending changes
                </p>
                <ul className="space-y-1 text-xs text-emerald-800">
                  {pendingAssistantEdit.summary.map((item, index) => (
                    <li key={`summary-${index}`}>{item}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                    onClick={handleApplyPendingEdit}
                    disabled={assistantLoading}
                  >
                    Apply changes
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700"
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
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
              onClick={submitAssistantEdit}
              disabled={assistantLoading || !!pendingAssistantEdit}
            >
              Draft edit
            </button>
            {assistantLoading ? <p className="text-xs text-slate-500">Applying changes...</p> : null}
            {assistantError ? <p className="text-xs text-rose-600">{assistantError}</p> : null}
            {assistantStatus ? <p className="text-xs text-slate-500">{assistantStatus}</p> : null}
          </div>
        ) : activeTab === "export" ? (
          <div className="space-y-4">
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
        aria-label="Template preview"
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
              <p className="text-lg font-semibold text-slate-900">{previewTemplate.name}</p>
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
              className={`rounded-2xl border p-6 ${previewPreset.shellClass} ${previewPreset.textClass}`}
            >
              <div className={previewPreset.sectionGap}>
                <div className={`flex items-center justify-between ${previewPreset.metaClass}`}>
                  <span>Invoice Document</span>
                  <span>Preview</span>
                </div>

                <header className="space-y-5">
                  {previewData?.logoUrl ? (
                    <div className="flex items-center">
                      <img
                        src={previewData.logoUrl}
                        alt="Company logo"
                        className="h-10 w-auto max-w-[160px] object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1 className={previewPreset.titleClass}>INVOICE</h1>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Draft document
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Invoice #
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
                      <span>{formatPreviewMoney(previewTotal)}</span>
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <p className={`${previewPreset.textClass} ${previewPreset.labelClass}`}>
                    Notes / Terms
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <p className="whitespace-pre-line">{previewNotes}</p>
                  </div>
                </section>
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
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Launcher />} />
        <Route path="/ai-intake" element={<AIIntake />} />
        <Route path="/manual" element={<ManualInvoiceCanvas />} />
        <Route
          path="/import"
          element={<Placeholder title="Import Invoice" description="This screen is queued up next." />}
        />
        <Route
          path="*"
          element={<Placeholder title="Page not found" description="Return to the launcher to continue." />}
        />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
