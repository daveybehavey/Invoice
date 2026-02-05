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
  },
  {
    id: "msg-2",
    role: "user",
    text: "Logo + website tweaks for Sarah. Brand refresh and home page edits."
  },
  {
    id: "msg-3",
    role: "ai",
    text: "Got it. Do you want a flat fee for the logo or hourly time?"
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
  const assumptions = [
    { id: "assumption-1", text: "Logo design billed as flat $300" },
    { id: "assumption-2", text: "Website work billed hourly" }
  ];

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
          {hasAiMessage ? (
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
                onClick={() => navigate("/manual")}
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState("style");

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
    const nextUrl = URL.createObjectURL(file);
    setLogoUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
    event.target.value = "";
  };

  const handleLogoRemove = () => {
    setLogoUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  };

  const isMobileInspectorOpen = inspectorOpen;
  const invoiceInteractionClass = isMobileInspectorOpen
    ? "pointer-events-none select-none opacity-60 md:pointer-events-auto md:opacity-100"
    : "";

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <div className={`w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${invoiceInteractionClass}`}>
          <div className="space-y-6">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Invoice Document</span>
              <span>Draft</span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setInspectorOpen(true)}
              >
                Customize / Export
              </button>
            </div>

            <header className="space-y-4">
              <h1 className="text-2xl font-semibold text-slate-900">INVOICE</h1>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Invoice #
                  <input
                    type="text"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Date
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    value={invoiceDate}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                  />
                </label>
              </div>
            </header>

            {logoUrl ? (
              <div className="flex items-center">
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="h-12 w-auto max-w-[200px] object-contain"
                />
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">From</p>
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Your Name / Company"
                  value={fromDetails}
                  onChange={(event) => setFromDetails(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Bill To</p>
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Client Name"
                  value={billToDetails}
                  onChange={(event) => setBillToDetails(event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
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
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                            placeholder="$0"
                            value={item.rate}
                            onChange={(event) =>
                              handleLineItemChange(item.id, "rate", event.target.value)
                            }
                          />
                        </td>
                        <td className="py-3 text-right align-top text-slate-600">
                          {formatMoney(getLineAmount(item))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-emerald-700"
                onClick={handleAddLineItem}
              >
                + Add line item
              </button>
            </section>

            <section className="flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
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
              <p className="text-sm font-semibold text-slate-700">Notes / Terms</p>
              <textarea
                rows={4}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Thank you for your business"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </section>
          </div>
        </div>

        <div className="hidden md:block">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            logoUrl={logoUrl}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
          />
        </div>
      </main>

      {isMobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white/95 md:hidden">
          <InspectorPanel
            activeTab={activeInspectorTab}
            onTabChange={setActiveInspectorTab}
            onClose={() => setInspectorOpen(false)}
            showCloseButton
            logoUrl={logoUrl}
            onLogoChange={handleLogoChange}
            onLogoRemove={handleLogoRemove}
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
  onLogoRemove
}) {
  const tabs = [
    { id: "style", label: "Style", content: "Style controls coming soon" },
    { id: "tone", label: "Tone", content: "Tone controls coming soon" },
    { id: "export", label: "Export", content: "Export options coming soon" }
  ];

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content ?? "";

  return (
    <div className="flex h-full flex-col border border-slate-200 bg-white shadow-sm md:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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
      <div className="flex-1 px-4 py-5 text-sm text-slate-600">
        {activeTab === "style" ? (
          <div className="space-y-4">
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
