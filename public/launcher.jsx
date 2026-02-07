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
  const listEndRef = useRef(null);
  const readyToGenerate = true;
  const hasAiMessage = messages.some((message) => message.role === "ai");
  const hasUserInput = messages.some((message) => message.role === "user");
  const assumptions = hasUserInput
    ? []
    : [
        { id: "assumption-1", text: "Logo design billed as flat $300" },
        { id: "assumption-2", text: "Website work billed hourly" }
      ];

  const buildDraftFromIntake = () => {
    const amountMatch = (text) => {
      const match = text.match(/\$?\s?(\d+(?:\.\d{1,2})?)/);
      return match ? match[1] : "";
    };
    const lineItems = assumptions.length
      ? assumptions.map((assumption, index) => {
          const amount = amountMatch(assumption.text);
          return {
            id: `line-${Date.now()}-${index}`,
            description: assumption.text,
            qty: amount ? "1" : "",
            rate: amount || ""
          };
        })
      : [{ id: `line-${Date.now()}`, description: "", qty: "", rate: "" }];

    const userNotes = messages
      .filter((message) => message.role === "user")
      .map((message) => message.text.trim())
      .filter(Boolean)
      .join("\n");

    return {
      invoiceNumber: "INV-0001",
      invoiceDate: new Date().toISOString().slice(0, 10),
      fromDetails: "",
      billToDetails: "",
      notes: userNotes,
      taxRate: "0",
      lineItems,
      logoUrl: null,
      stylePreset: "default"
    };
  };

  const handleGenerateInvoice = () => {
    try {
      const draft = buildDraftFromIntake();
      window.localStorage.setItem("invoiceDraft", JSON.stringify(draft));
    } catch (error) {
      console.error("Failed to seed draft", error);
    } finally {
      navigate("/manual");
    }
  };

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  const handleSend = (event) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isTyping) {
      return;
    }
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: trimmed
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    window.setTimeout(() => {
      const aiMessage = {
        id: `msg-${Date.now()}-ai`,
        role: "ai",
        text: "Thanks. What hourly rate should I use for the website tweaks?"
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 700);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <button
            type="button"
            className="text-sm font-semibold text-emerald-700"
            onClick={() => navigate("/")}
          >
            Back
          </button>
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
          {hasAiMessage && assumptions.length > 0 ? (
            <div className="mt-4 space-y-3">
              <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Assumptions so far</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
                  {assumptions.map((item) => (
                    <li key={item.id}>{item.text}</li>
                  ))}
                </ul>
              </section>
              <button
                type="button"
                className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.98] ${
                  readyToGenerate
                    ? "bg-emerald-600 text-white"
                    : "cursor-not-allowed bg-slate-200 text-slate-500"
                }`}
                disabled={!readyToGenerate}
                onClick={handleGenerateInvoice}
              >
                Generate Invoice
              </button>
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
              placeholder="Type your reply..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-emerald-300"
            disabled={!inputValue.trim() || isTyping}
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
            <div className="flex justify-end no-print">
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
  onApplyRewrite
}) {
  const [toneAction, setToneAction] = useState(null);
  const [selectedTone, setSelectedTone] = useState(null);
  const [toneStatus, setToneStatus] = useState("");
  const [toneLoading, setToneLoading] = useState(false);
  const [toneError, setToneError] = useState("");
  const [pendingRewrite, setPendingRewrite] = useState(null);
  const toneRequestIdRef = useRef(0);
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
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
