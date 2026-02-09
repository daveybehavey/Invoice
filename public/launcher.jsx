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
  const [openDecisions, setOpenDecisions] = useState([]);
  const [assumptions, setAssumptions] = useState([]);
  const [unparsedLines, setUnparsedLines] = useState([]);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const requestIdRef = useRef(0);
  const openDecisionSignatureRef = useRef("");
  const lastDecisionResolutionRef = useRef("");
  const lastSummaryMetaRef = useRef({ at: null, requestId: null });
  const intakePhaseRef = useRef(intakePhase);
  const summaryLockRef = useRef(false);
  const listEndRef = useRef(null);
  const decisionsRef = useRef(null);
  const unparsedRef = useRef(null);
  const intakeComplete = intakePhase === "ready_to_generate";
  const confirmationKeywords = ["yes", "yep", "correct", "looks good", "sounds good", "confirm"];
  const rejectionKeywords = ["no", "not correct", "wrong", "incorrect", "needs change"];

  const formatMoney = (value) =>
    Number.isFinite(value) ? `$${Number(value).toFixed(2)}` : "";

  const buildTranscript = (nextMessages) =>
    nextMessages
      .filter((message) => message.role === "user")
      .map((message) => message.text.trim())
      .filter(Boolean)
      .join("\n");

  const buildSummaryText = (invoice, decisions = []) => {
    if (!invoice) {
      return "I need a bit more detail before drafting an invoice.";
    }
    const summaryLines = [];
    if (invoice.customerName) {
      summaryLines.push(`Client: ${invoice.customerName}`);
    }
    summaryLines.push("Line items:");
    invoice.lineItems.forEach((lineItem, index) => {
      const amountText = Number.isFinite(lineItem.amount)
        ? ` — ${formatMoney(lineItem.amount)}`
        : "";
      summaryLines.push(`${index + 1}. ${lineItem.description}${amountText}`);
    });
    if (invoice.notes) {
      summaryLines.push(`Notes: ${invoice.notes}`);
    }
    if (decisions.length > 0) {
      summaryLines.push("Pending decisions (can be resolved later):");
      decisions.forEach((decision) => {
        summaryLines.push(`- ${decision.prompt}`);
      });
      return `Summary:\n${summaryLines.join("\n")}\n\nCheckpoint: Draft ready. Pending decisions can be resolved anytime. Reply \"confirm\" to generate or send edits.`;
    }
    return `Summary:\n${summaryLines.join("\n")}\n\nCheckpoint: Draft ready. Reply \"confirm\" to generate or send edits.`;
  };

  const buildDecisionFollowUp = (decisions) => {
    const lines = decisions.map((decision) => `- ${decision.prompt}`);
    return `Pending decisions (optional to resolve now):\n${lines.join("\n")}`;
  };

  const buildDraftFromInvoice = (invoice) => {
    const today = new Date().toISOString().slice(0, 10);
    const issueDate =
      typeof invoice?.issueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(invoice.issueDate)
        ? invoice.issueDate.slice(0, 10)
        : "";
    const lineItems =
      invoice?.lineItems?.map((lineItem, index) => {
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
      taxRate: "0",
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

  const appendSummaryMessage = (text) => {
    setSummaryUpdatedAt(new Date());
    lastSummaryMetaRef.current = {
      at: Date.now(),
      requestId: requestIdRef.current
    };
    console.log("[summary:append]", lastSummaryMetaRef.current);
    setIsTyping(false);
    appendAiMessage(text);
  };

  const decisionItems = openDecisions.map((decision, index) => ({
    id: decision.id ?? `decision-${index}`,
    text: `Decision needed: ${decision.prompt}`,
    prompt: decision.prompt,
    kind: decision.kind
  }));

  const assumptionItems = (() => {
    if (finishedInvoice) {
      const items = finishedInvoice.lineItems.map((lineItem, index) => ({
        id: `assumption-line-${lineItem.id ?? index}`,
        text: `${lineItem.description}${
          Number.isFinite(lineItem.amount) ? ` — ${formatMoney(lineItem.amount)}` : ""
        }`
      }));
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

  const auditAssumptionItems = assumptions.map((item, index) => ({
    id: `assumption-audit-${index}`,
    text: item
  }));

  const unparsedItems = unparsedLines.map((item, index) => ({
    id: `unparsed-${index}`,
    text: item
  }));

  const hasAssumptions =
    assumptionItems.length > 0 || auditAssumptionItems.length > 0 || unparsedItems.length > 0;
  const hasDecisions = decisionItems.length > 0;
  const openDecisionCount = openDecisions.length;
  const showAssumptionsCard = hasAssumptions || hasDecisions;

  const summaryTimeLabel = summaryUpdatedAt
    ? summaryUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
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
  const scrollToSection = (ref) => {
    if (!ref?.current) {
      return;
    }
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const needsLaborPricing = intakePhase === "awaiting_follow_up" && followUp?.type === "labor_pricing";
  const needsLaborHoursOnly = needsLaborPricing && Number.isFinite(pendingLaborRate);
  const needsSummaryConfirmation = intakePhase === "ready_to_summarize";
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
          ? "Checkpoint ready — confirm to generate. Pending decisions can be resolved later."
          : "Checkpoint ready — confirm to generate."
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

  const shortenSnippet = (snippet, maxLength = 48) => {
    if (snippet.length <= maxLength) {
      return snippet;
    }
    return `${snippet.slice(0, maxLength - 3)}...`;
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
      const draft = buildDraftFromInvoice(finishedInvoice);
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
    setOpenDecisions([]);
    setAssumptions([]);
    setUnparsedLines([]);
    setSummaryUpdatedAt(null);
    openDecisionSignatureRef.current = "";
    lastDecisionResolutionRef.current = "";
  };

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    intakePhaseRef.current = intakePhase;
    summaryLockRef.current = intakePhase === "ready_to_generate";
  }, [intakePhase]);

  const runIntakeRequest = async (nextMessages, lastUserMessage) => {
    const transcript = buildTranscript(nextMessages);
    if (!transcript) {
      return;
    }
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const requestStartedAt = Date.now();
    setIsTyping(true);
    try {
      const response = await fetch("/api/invoices/from-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messyInput: transcript, lastUserMessage })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Intake failed.");
      }
      if (requestId !== requestIdRef.current) {
        console.log("[intake:stale]", { requestId, current: requestIdRef.current });
        return;
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
      setOpenDecisions(nextOpenDecisions);
      setAssumptions(nextAssumptions);
      setUnparsedLines(nextUnparsedLines);
      setPendingLaborRate(null);

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
          : buildSummaryText(payload.invoice, nextOpenDecisions);
        openDecisionSignatureRef.current = decisionSignature;
        isRepeatDecision ? appendAiMessage(followUpMessage) : appendSummaryMessage(followUpMessage);
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
        appendSummaryMessage(buildSummaryText(payload.invoice));
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
    }
  };

  const runLaborPricingRequest = async (laborPricing, transcript) => {
    if (!structuredInvoice) {
      appendAiMessage("I need to re-check the details before finishing. Please resend your notes.");
      setIntakePhase("collecting");
      return;
    }
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const requestStartedAt = Date.now();
    setIsTyping(true);
    try {
      const response = await fetch("/api/invoices/from-input/labor-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredInvoice,
          laborPricing,
          sourceText: transcript
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Labor pricing failed.");
      }
      if (requestId !== requestIdRef.current) {
        console.log("[labor:stale]", { requestId, current: requestIdRef.current });
        return;
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
      setOpenDecisions(nextOpenDecisions);
      setAssumptions(nextAssumptions);
      setUnparsedLines(nextUnparsedLines);
      setPendingLaborRate(null);
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
          : buildSummaryText(payload.invoice, nextOpenDecisions);
        openDecisionSignatureRef.current = decisionSignature;
        isRepeatDecision ? appendAiMessage(followUpMessage) : appendSummaryMessage(followUpMessage);
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
        appendSummaryMessage(buildSummaryText(payload.invoice));
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
      appendSummaryMessage(buildSummaryText(nextInvoice, openDecisions));
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
      return;
    }
    const normalized = trimmed.toLowerCase();
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
      return;
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
      return;
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
        return;
      }

      if (isNegative && !hasNumbers && wordCount <= 4) {
        setIntakePhase("collecting");
        appendAiMessage("Got it. What should I fix?");
        return;
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
        return;
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
        return;
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
        return;
      }
      if (parseResult?.error) {
        appendAiMessage(parseResult.error);
        return;
      }
    }

    const shouldResolveDecisions = openDecisions.length > 0 && intakePhase !== "awaiting_follow_up";
    const resolutionText = shouldResolveDecisions ? trimmed : lastDecisionResolutionRef.current || undefined;
    if (shouldResolveDecisions) {
      lastDecisionResolutionRef.current = trimmed;
    }
    runIntakeRequest(nextMessages, resolutionText);
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
            <div className="space-y-4">
              {messages.map((message) => (
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
              ))}
              {isTyping ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    AI is typing...
                  </div>
                </div>
              ) : null}
              <div ref={listEndRef} />
            </div>
          </div>
          {showAssumptionsCard ? (
            <div className="mt-4 space-y-3">
              <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Assumptions</h2>
                  {openDecisionCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      {openDecisionCount} decision{openDecisionCount > 1 ? "s" : ""} open
                    </span>
                  ) : null}
                </div>
                {summaryTimeLabel ? (
                  <p className="mt-1 text-xs text-slate-500">Summary updated {summaryTimeLabel}</p>
                ) : null}
                {summarySnapshot ? (
                  <p className="mt-1 text-xs text-slate-500">{summarySnapshot}</p>
                ) : null}
                {intakePhase === "ready_to_summarize" ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Next steps
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        onClick={() => submitUserMessage("Confirm.")}
                        disabled={isTyping}
                      >
                        Confirm draft
                      </button>
                      {hasDecisions ? (
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
                {hasDecisions ? (
                  <div
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                    ref={decisionsRef}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Decisions needed
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-amber-900">
                      {decisionItems.map((item) => {
                        const rawSnippet = extractDecisionSnippet(item.prompt);
                        const snippet = shortenSnippet(rawSnippet);
                        const includeLabel = item.kind === "tax" ? "Apply tax" : `Include: ${snippet}`;
                        const excludeLabel =
                          item.kind === "tax" ? "No tax" : `Don't include: ${snippet}`;
                        const includeValue =
                          item.kind === "tax" ? "Apply tax." : `Include ${rawSnippet}.`;
                        const excludeValue =
                          item.kind === "tax" ? "No tax." : `Don't include ${rawSnippet}.`;
                        return (
                          <li key={item.id}>
                            <div className="space-y-2">
                              <p>{item.text}</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                                  onClick={() => submitUserMessage(includeValue)}
                                  disabled={isTyping}
                                >
                                  {includeLabel}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-amber-300"
                                  onClick={() => submitUserMessage(excludeValue)}
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
                {unparsedItems.length > 0 ? (
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
                {assumptionItems.length > 0 ? (
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
                {auditAssumptionItems.length > 0 ? (
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
              placeholder={intakeComplete ? "Refine the draft..." : "Type your reply..."}
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
    </div>
  );
}

function ManualInvoiceCanvas() {
  const navigate = useNavigate();
  const [invoiceNumber, setInvoiceNumber] = useState("INV-0001");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [fromDetails, setFromDetails] = useState("");
  const [billToDetails, setBillToDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [lineItems, setLineItems] = useState([
    { id: "line-1", description: "", qty: "", rate: "" }
  ]);
  const [logoUrl, setLogoUrl] = useState(null);
  const [stylePreset, setStylePreset] = useState("default");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState("style");
  const [draftStatus, setDraftStatus] = useState("");
  const saveTimeoutRef = useRef(null);
  const clearStatusTimeoutRef = useRef(null);
  const hasRestoredRef = useRef(false);
  const draftStorageKey = "invoiceDraft";

  const stylePresets = {
    default: { label: "Default", textClass: "text-sm", sectionGap: "space-y-6" },
    compact: { label: "Compact", textClass: "text-sm", sectionGap: "space-y-4" },
    spacious: { label: "Spacious", textClass: "text-base", sectionGap: "space-y-8" }
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
      return { error: "Add at least one line item description before using AI edits." };
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

  useEffect(() => {
    const stored = window.localStorage.getItem(draftStorageKey);
    if (!stored) {
      hasRestoredRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed.invoiceNumber !== undefined) {
        setInvoiceNumber(parsed.invoiceNumber);
      }
      if (parsed.invoiceDate !== undefined) {
        setInvoiceDate(parsed.invoiceDate);
      }
      if (parsed.fromDetails !== undefined) {
        setFromDetails(parsed.fromDetails);
      }
      if (parsed.billToDetails !== undefined) {
        setBillToDetails(parsed.billToDetails);
      }
      if (parsed.notes !== undefined) {
        setNotes(parsed.notes);
      }
      if (parsed.taxRate !== undefined) {
        setTaxRate(parsed.taxRate);
      }
      if (parsed.stylePreset !== undefined) {
        setStylePreset(parsed.stylePreset);
      }
      if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
        setLineItems(parsed.lineItems);
      }
      if (parsed.logoUrl !== undefined) {
        setLogoUrl(parsed.logoUrl);
      }
      setDraftStatus("Draft restored");
      if (clearStatusTimeoutRef.current) {
        window.clearTimeout(clearStatusTimeoutRef.current);
      }
      clearStatusTimeoutRef.current = window.setTimeout(() => {
        setDraftStatus("");
      }, 2000);
    } catch (error) {
      console.error("Failed to restore draft", error);
    } finally {
      hasRestoredRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
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
            onClick={() => navigate("/")}
          >
            &larr; Back
          </button>
        </div>
        <div className={`printable-invoice w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${invoiceInteractionClass}`}>
          <div className={activePreset.sectionGap}>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                AI Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setInspectorOpen(true)}
              >
                Customize / Export
              </button>
            </div>

            <header className="space-y-4">
              {logoUrl ? (
                <div className="flex items-center">
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-12 w-auto max-w-[200px] object-contain"
                  />
                </div>
              ) : null}
              <h1 className="text-2xl font-semibold text-slate-900">INVOICE</h1>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={`${activePreset.textClass} font-semibold text-slate-700`}>
                  Invoice #
                  <input
                    type="text"
                    className={`mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                  />
                </label>
                <label className={`${activePreset.textClass} font-semibold text-slate-700`}>
                  Date
                  <input
                    type="date"
                    className={`mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                  />
                </label>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className={`${activePreset.textClass} font-semibold text-slate-700`}>From</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
                  placeholder="Your Name / Company"
                  value={fromDetails}
                  onChange={(event) => setFromDetails(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className={`${activePreset.textClass} font-semibold text-slate-700`}>Bill To</p>
                <textarea
                  rows={3}
                  className={`w-full resize-none rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
                  placeholder="Client Name"
                  value={billToDetails}
                  onChange={(event) => setBillToDetails(event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="overflow-x-auto">
                <table className={`min-w-full text-left ${activePreset.textClass}`}>
                  <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 pb-2 pr-3">Description</th>
                      <th className="border-b border-slate-200 pb-2 pr-3">Qty</th>
                      <th className="border-b border-slate-200 pb-2 pr-3">Rate</th>
                      <th className="border-b border-slate-200 pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 pr-3 align-top">
                          <input
                            type="text"
                            className={`w-full rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
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
                            className={`w-full rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
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
                            className={`w-full rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
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
              <div className={`w-full max-w-xs space-y-2 ${activePreset.textClass}`}>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
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
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <p className={`${activePreset.textClass} font-semibold text-slate-700`}>Notes / Terms</p>
              <textarea
                rows={4}
                className={`w-full resize-none rounded-lg border border-slate-200 px-3 py-2 ${activePreset.textClass} text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200`}
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
  const assistantRequestIdRef = useRef(0);
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
    { id: "assistant", label: "AI Edit", content: "AI edits" },
    { id: "export", label: "Export", content: "Export options coming soon" }
  ];
  const styleOptions = [
    { id: "default", label: "Default" },
    { id: "compact", label: "Compact" },
    { id: "spacious", label: "Spacious" }
  ];
  const toneOptions = ["Formal", "Neutral", "Friendly"];

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
          setAssistantLoading(false);
          return;
        }
        if (payload?.invoice) {
          onApplyAiEdit?.(payload.invoice);
          setAssistantStatus("Changes applied.");
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
        setAssistantError("AI edit failed. Try again.");
        setAssistantLoading(false);
      });
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

  return (
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
              <p className="text-sm font-semibold text-slate-900">Presets</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {styleOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      stylePreset === option.id
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 text-slate-600"
                    }`}
                    onClick={() => onStylePresetChange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
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
                  <img src={logoUrl} alt="Logo preview" className="h-16 w-auto object-contain" />
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
            <textarea
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="Example: Change the labor rate to $80/hr and remove the parking line."
              value={assistantInstruction}
              onChange={(event) => setAssistantInstruction(event.target.value)}
            />
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
              onClick={submitAssistantEdit}
              disabled={assistantLoading}
            >
              Apply edit
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
