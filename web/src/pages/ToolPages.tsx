import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calculator, CheckCircle2, Download, FileSignature, HelpCircle, Percent, Wrench } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { InvoicePaperSheet } from "../components/InvoicePaperSheet";
import { parseRoughNotesInstant, TRADE_PRESETS } from "../lib/instantParser";
import { computeDueDate, formatMoney, generateInvoiceNumber, roundToCents, syncFinishedInvoiceTotals } from "../lib/money";
import { exportInvoicePdf } from "../lib/pdfExport";
import type { FinishedInvoice, QuoteOption } from "../lib/types";

function ToolFaqSection({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <section className="mt-14 border-t border-[#E2E7E3] pt-10">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0F5132]">
        <HelpCircle className="h-4 w-4" />
        <span>Quick Trade FAQ</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.q} className="rounded-2xl border border-[#E2E7E3] bg-white p-5">
            <h2 className="text-sm font-bold text-[#101915]">{item.q}</h2>
            <p className="mt-2 text-xs leading-relaxed text-[#47554E]">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const GENERATOR_PRESETS = [
  { id: "plumber", label: "Plumber", notes: TRADE_PRESETS[0].notes },
  {
    id: "electrician",
    label: "Electrician",
    notes:
      "Upgraded kitchen GFCI outlets and replaced 20A breaker for Jordan Lee at 518 Maple St. 2.5 hrs at $115/hr, two 20A GFCI receptacles $48, breaker $36. Net 15."
  },
  { id: "handyman", label: "Handyman", notes: TRADE_PRESETS[1].notes },
  { id: "landscaper", label: "Landscaper", notes: TRADE_PRESETS[2].notes },
  { id: "freelancer", label: "Freelancer", notes: TRADE_PRESETS[3].notes }
];

export function FreeInvoiceGeneratorPage() {
  const { profile, updateDraft, showToast } = useApp();
  const navigate = useNavigate();

  const [presetId, setPresetId] = useState(GENERATOR_PRESETS[0].id);
  const [notes, setNotes] = useState(GENERATOR_PRESETS[0].notes);
  const [taxRate, setTaxRate] = useState<number>(profile.defaultTaxRate || 0);

  const parsed = useMemo(() => {
    const res = parseRoughNotesInstant(notes, {
      currency: profile.defaultCurrency,
      defaultTaxRate: taxRate,
      defaultTerms: profile.defaultTerms
    });
    const invoice = syncFinishedInvoiceTotals(res.invoice, taxRate);
    return { ...res, invoice };
  }, [notes, taxRate, profile.defaultCurrency, profile.defaultTerms]);

  const handleOpenWorkbench = () => {
    updateDraft((prev) => ({
      ...prev,
      invoiceId: undefined,
      rawInput: notes,
      customerEmail: parsed.customerEmail || prev.customerEmail,
      taxRate,
      paymentTerms: parsed.paymentTerms,
      invoice: parsed.invoice,
      structuredInvoice: parsed.structuredInvoice,
      openDecisions: parsed.openDecisions,
      assumptions: parsed.assumptions
    }));
    navigate("/create");
  };

  const handleDownloadPdf = async () => {
    const res = await exportInvoicePdf({
      invoice: parsed.invoice,
      profile,
      theme: profile.defaultTheme,
      poweredByVisible: true
    });
    if (res.method === "download") {
      showToast(`Downloaded ${res.filename}`, "success");
    }
  };

  return (
    <AppShell mode="marketing">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0F5132]">
            <Wrench className="h-3.5 w-3.5" />
            Free Tool · Zero Account Required
          </span>
          <h1 className="mt-3 font-serif text-3xl font-bold text-[#101915] sm:text-4xl">
            Free Contractor &amp; Freelancer Invoice Generator
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[#47554E] sm:text-base">
            Paste rough job notes, pick your trade preset, adjust tax, and export a clean PDF invoice in seconds.
            Missing prices stay flagged instead of being quietly zeroed out.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#D9E0DC] bg-white p-5 shadow-card lg:col-span-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">1. Choose trade preset</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {GENERATOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPresetId(p.id);
                    setNotes(p.notes);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    presetId === p.id
                      ? "bg-[#101915] text-white"
                      : "bg-[#F5F6F2] text-[#47554E] hover:bg-[#E8F5EE] hover:text-[#0F5132]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
              2. Edit your job notes
            </label>
            <textarea
              rows={6}
              aria-label="Job notes for free invoice generator"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#D9E0DC] bg-[#F5F6F2]/60 p-3 text-sm leading-relaxed text-[#101915] outline-none focus:border-[#0F5132] focus:bg-white"
            />

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/70 px-3.5 py-2.5">
              <label htmlFor="free-gen-tax" className="text-xs font-bold text-[#47554E]">
                Sales Tax / GST %
              </label>
              <select
                id="free-gen-tax"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                className="rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1 font-mono text-xs font-semibold text-[#101915]"
              >
                <option value={0}>0% (No tax)</option>
                <option value={5}>5%</option>
                <option value={7}>7%</option>
                <option value={8.25}>8.25%</option>
                <option value={10}>10%</option>
                <option value={12}>12%</option>
                <option value={13}>13%</option>
              </select>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={handleOpenWorkbench}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F5132] px-4 py-3 text-sm font-semibold text-white hover:bg-[#146C43]"
              >
                <span>Open in Full Workbench</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-4 py-3 text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <Download className="h-4 w-4 text-[#0F5132]" />
                <span>Download Free PDF</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Live Invoice Preview</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#0F5132]">
                Total: {formatMoney(parsed.invoice.total, parsed.invoice.currency)}
              </span>
            </div>
            <InvoicePaperSheet
              invoice={parsed.invoice}
              profile={profile}
              theme={profile.defaultTheme}
              taxRate={taxRate}
              readOnly
              poweredByVisible
            />
          </div>
        </div>

        <ToolFaqSection
          items={[
            {
              q: "Do I need an account to download a PDF invoice?",
              a: "No. You can type rough notes, inspect every line item and tax calculation, and export a clean PDF right away without signing up."
            },
            {
              q: "What happens if I forget a price in my notes?",
              a: "NoteBill flags unpriced tasks explicitly instead of guessing $0, so you never accidentally give away labor or materials."
            },
            {
              q: "Can I add my business logo, photos, and card payment link?",
              a: "Yes — click Open in Full Workbench to switch themes, add job-site photos, track live hours, save your branding, or share a client portal link."
            }
          ]}
        />
      </div>
    </AppShell>
  );
}

interface QuoteTemplatePreset {
  id: string;
  label: string;
  customerName: string;
  notes: string;
  options: QuoteOption[];
}

const QUOTE_PRESETS: QuoteTemplatePreset[] = [
  {
    id: "plumbing",
    label: "Plumbing Replacement",
    customerName: "Sarah Chen",
    notes: "Water heater & shutoff replacement options. Includes permits, haul-away, and 1-year workmanship warranty.",
    options: [
      {
        id: "tier_good",
        tier: "good",
        label: "Standard 40-Gal Tank Swap",
        description: "Direct tank swap + new braided supply lines",
        amount: 1450
      },
      {
        id: "tier_better",
        tier: "better",
        label: "Pro Upgrade + Expansion Tank",
        description: "Heavy-duty 50-gal tank, quarter-turn brass valve, expansion tank & pan",
        amount: 1925,
        recommended: true
      },
      {
        id: "tier_best",
        tier: "best",
        label: "Tankless High-Efficiency System",
        description: "On-demand condensing unit + isolation valves & recirculation loop",
        amount: 3400
      }
    ]
  },
  {
    id: "electrical",
    label: "Electrical Panel & EV",
    customerName: "Marcus Reid",
    notes: "Garage EV charger & subpanel upgrade options. ESA/city inspection coordinated after installation.",
    options: [
      {
        id: "tier_good",
        tier: "good",
        label: "Dedicated 50A Outlet",
        description: "NEMA 14-50 receptacle within 10 ft of main panel",
        amount: 680
      },
      {
        id: "tier_better",
        tier: "better",
        label: "Hardwired Level-2 Charger",
        description: "60A circuit, conduit run & wall-mount charger commissioning",
        amount: 1180,
        recommended: true
      },
      {
        id: "tier_best",
        tier: "best",
        label: "Full Load-Managed 200A Bundle",
        description: "Smart load controller, surge protection & dual-EV readiness",
        amount: 2450
      }
    ]
  },
  {
    id: "handyman",
    label: "Deck & Exterior Repair",
    customerName: "Elena Morales",
    notes: "Back deck board restoration and railing safety package.",
    options: [
      {
        id: "tier_good",
        tier: "good",
        label: "Spot Board & Post Repair",
        description: "Replace 6 damaged cedar boards & tighten loose rail posts",
        amount: 540
      },
      {
        id: "tier_better",
        tier: "better",
        label: "Refinish + Hardware Refresh",
        description: "Board swaps, structural screws, power wash & 2-coat stain",
        amount: 1150,
        recommended: true
      },
      {
        id: "tier_best",
        tier: "best",
        label: "Full Composite Resurface",
        description: "Hidden-fastener composite top deck + aluminum rail upgrade",
        amount: 2890
      }
    ]
  },
  {
    id: "freelance",
    label: "Web & Brand Sprint",
    customerName: "Loom & Leaf Studio",
    notes: "Website conversion refresh & mobile checkout speed optimization.",
    options: [
      {
        id: "tier_good",
        tier: "good",
        label: "Landing Page Polish",
        description: "Hero messaging, mobile layout fixes & speed compression",
        amount: 950
      },
      {
        id: "tier_better",
        tier: "better",
        label: "Full Funnel Redesign",
        description: "5 key pages, analytics events & checkout conversion pass",
        amount: 2200,
        recommended: true
      },
      {
        id: "tier_best",
        tier: "best",
        label: "Conversion + 60-Day Retainer",
        description: "Full redesign plus A/B copy testing & priority updates",
        amount: 3900
      }
    ]
  }
];

export function ContractorEstimateTemplatePage() {
  const { profile, updateDraft, showToast } = useApp();
  const navigate = useNavigate();

  const [presetId, setPresetId] = useState(QUOTE_PRESETS[0].id);
  const [customerName, setCustomerName] = useState(QUOTE_PRESETS[0].customerName);
  const [options, setOptions] = useState<QuoteOption[]>(QUOTE_PRESETS[0].options);
  const [depositPercent, setDepositPercent] = useState<number>(30);
  const [quoteNotes, setQuoteNotes] = useState(QUOTE_PRESETS[0].notes);

  const previewInvoice: FinishedInvoice = useMemo(() => {
    const recommended = options.find((o) => o.recommended) || options[1] || options[0];
    const primaryAmount = roundToCents(recommended?.amount ?? 0);
    const depositAmount = depositPercent > 0 ? roundToCents((primaryAmount * depositPercent) / 100) : undefined;
    const issueDate = new Date().toISOString().slice(0, 10);
    return syncFinishedInvoiceTotals(
      {
        documentType: "estimate",
        invoiceNumber: generateInvoiceNumber().replace("INV-", "EST-"),
        issueDate,
        dueDate: computeDueDate(issueDate, "net_15"),
        customerName: customerName.trim() || "Client Name",
        currency: profile.defaultCurrency,
        lineItems: [
          {
            id: "line_quote_primary",
            type: "labor",
            description: `${recommended.label}${recommended.description ? ` — ${recommended.description}` : ""}`,
            quantity: 1,
            unitPrice: primaryAmount,
            amount: primaryAmount
          }
        ],
        notes: quoteNotes.trim() || undefined,
        paymentRecords: [],
        paymentMethods: profile.defaultPaymentMethods,
        quoteOptions: options,
        depositPercent: depositPercent > 0 ? depositPercent : undefined,
        depositAmount
      },
      0
    );
  }, [customerName, options, depositPercent, quoteNotes, profile.defaultCurrency, profile.defaultPaymentMethods]);

  const handleSelectPreset = (id: string) => {
    const found = QUOTE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPresetId(found.id);
    setCustomerName(found.customerName);
    setOptions(found.options.map((o) => ({ ...o })));
    setQuoteNotes(found.notes);
  };

  const handleSendForSignature = () => {
    updateDraft((prev) => ({
      ...prev,
      invoiceId: undefined,
      rawInput: quoteNotes,
      taxRate: 0,
      invoice: previewInvoice,
      openDecisions: [],
      assumptions: []
    }));
    navigate("/create");
  };

  const handleDownloadQuotePdf = async () => {
    const res = await exportInvoicePdf({
      invoice: previewInvoice,
      profile,
      theme: profile.defaultTheme,
      poweredByVisible: true
    });
    if (res.method === "download") {
      showToast(`Downloaded ${res.filename}`, "success");
    }
  };

  return (
    <AppShell mode="marketing">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#B45309]">
            <FileSignature className="h-3.5 w-3.5" />
            Free Estimate Builder · Good / Better / Best
          </span>
          <h1 className="mt-3 font-serif text-3xl font-bold text-[#101915] sm:text-4xl">
            Contractor Estimate &amp; Good / Better / Best Quote Template
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[#47554E] sm:text-base">
            Give clients three clear options instead of one flat take-it-or-leave-it number, set an upfront deposit %,
            and send for 1-tap client signature approval.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-2xl border border-[#D9E0DC] bg-white p-5 shadow-card lg:col-span-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Trade Quote Preset</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUOTE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      presetId === p.id
                        ? "bg-[#101915] text-white"
                        : "bg-[#F5F6F2] text-[#47554E] hover:bg-[#E8F5EE] hover:text-[#0F5132]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[#47554E]">Client Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-xs font-medium outline-none focus:border-[#0F5132]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#47554E]">Deposit Requested</label>
                <div className="mt-1 flex gap-1">
                  {[0, 25, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDepositPercent(pct)}
                      className={`flex-1 rounded-lg border py-2 font-mono text-xs font-semibold ${
                        depositPercent === pct
                          ? "border-[#0F5132] bg-[#E8F5EE] text-[#0F5132]"
                          : "border-[#D9E0DC] bg-white text-[#47554E]"
                      }`}
                    >
                      {pct === 0 ? "None" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Editable 3-Tier Options</div>
              {options.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`rounded-xl border p-3 ${
                    opt.recommended ? "border-[#0F5132] bg-[#E8F5EE]/40" : "border-[#E2E7E3] bg-[#F5F6F2]/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F5132]">
                      {opt.tier}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((curr) => curr.map((o, i) => ({ ...o, recommended: i === idx })))
                      }
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        opt.recommended ? "bg-[#0F5132] text-white" : "bg-white text-[#6B7A72] border border-[#D9E0DC]"
                      }`}
                    >
                      {opt.recommended ? "Recommended" : "Set Default"}
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) =>
                        setOptions((curr) => curr.map((o, i) => (i === idx ? { ...o, label: e.target.value } : o)))
                      }
                      className="flex-1 rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-[#0F5132]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`${opt.tier} option price`}
                      value={opt.amount}
                      onChange={(e) =>
                        setOptions((curr) =>
                          curr.map((o, i) =>
                            i === idx ? { ...o, amount: Math.max(0, Number.parseFloat(e.target.value) || 0) } : o
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-right font-mono text-xs font-bold outline-none focus:border-[#0F5132]"
                    />
                  </div>
                  <input
                    type="text"
                    value={opt.description || ""}
                    onChange={(e) =>
                      setOptions((curr) => curr.map((o, i) => (i === idx ? { ...o, description: e.target.value } : o)))
                    }
                    placeholder="Scope description"
                    className="mt-1.5 w-full rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1 text-[11px] text-[#47554E] outline-none focus:border-[#0F5132]"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={handleSendForSignature}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F5132] px-4 py-3 text-sm font-semibold text-white hover:bg-[#146C43]"
              >
                <span>Send for Client E-Signature</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadQuotePdf()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-4 py-3 text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <Download className="h-4 w-4 text-[#0F5132]" />
                <span>Download Quote PDF</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Live Estimate Preview</span>
              {previewInvoice.depositAmount && (
                <span className="font-mono text-xs font-semibold text-[#B45309]">
                  {depositPercent}% Deposit: {formatMoney(previewInvoice.depositAmount, previewInvoice.currency)}
                </span>
              )}
            </div>
            <InvoicePaperSheet
              invoice={previewInvoice}
              profile={profile}
              theme={profile.defaultTheme}
              taxRate={0}
              readOnly
              poweredByVisible
            />
          </div>
        </div>

        <ToolFaqSection
          items={[
            {
              q: "Why do Good / Better / Best quotes close bigger jobs?",
              a: "Giving a homeowner or client three clear scopes shifts the question from 'yes or no' to 'which option fits best' — often lifting average ticket value."
            },
            {
              q: "How do I get a signature and deposit?",
              a: "Click Send for Client E-Signature to save and open your quote in the NoteBill workbench, then share the client portal link so your customer can pick a tier and sign on their phone."
            },
            {
              q: "Can I convert an approved estimate into a deposit or final invoice?",
              a: "Yes. One click in the workbench turns an approved quote into a Deposit Invoice or Final Invoice without retyping a single line."
            }
          ]}
        />
      </div>
    </AppShell>
  );
}

const MARKUP_REFERENCE_ROWS = [
  { markup: 15, margin: "13.0%" },
  { markup: 20, margin: "16.7%" },
  { markup: 25, margin: "20.0%" },
  { markup: 30, margin: "23.1%" },
  { markup: 50, margin: "33.3%" }
];

export function MaterialsMarkupCalculatorPage() {
  const { profile, updateDraft } = useApp();
  const navigate = useNavigate();

  const [materialsCost, setMaterialsCost] = useState<number>(200);
  const [mode, setMode] = useState<"markup" | "margin">("markup");
  const [pctValue, setPctValue] = useState<number>(25);
  const [laborHours, setLaborHours] = useState<number>(2);
  const [hourlyRate, setHourlyRate] = useState<number>(profile.defaultHourlyRate ?? 95);
  const [taxRate, setTaxRate] = useState<number>(0);

  const calc = useMemo(() => {
    const safeCost = Math.max(0, roundToCents(materialsCost));
    const safePct = Math.max(0, mode === "margin" ? Math.min(95, pctValue) : pctValue);

    const clientPartsPrice =
      mode === "markup"
        ? roundToCents(safeCost * (1 + safePct / 100))
        : safePct >= 100
          ? safeCost
          : roundToCents(safeCost / (1 - safePct / 100));

    const grossProfit = roundToCents(clientPartsPrice - safeCost);
    const effectiveMarkupPct = safeCost > 0 ? Math.round(((grossProfit / safeCost) * 100) * 10) / 10 : safePct;
    const effectiveMarginPct =
      clientPartsPrice > 0 ? Math.round(((grossProfit / clientPartsPrice) * 100) * 10) / 10 : 0;

    const laborAmount = roundToCents(Math.max(0, laborHours) * Math.max(0, hourlyRate));
    const preTaxTotal = roundToCents(clientPartsPrice + laborAmount);
    const taxAmount = roundToCents((preTaxTotal * Math.max(0, taxRate)) / 100);
    const grandTotal = roundToCents(preTaxTotal + taxAmount);

    return {
      safeCost,
      clientPartsPrice,
      grossProfit,
      effectiveMarkupPct,
      effectiveMarginPct,
      laborAmount,
      preTaxTotal,
      taxAmount,
      grandTotal
    };
  }, [materialsCost, mode, pctValue, laborHours, hourlyRate, taxRate]);

  const handleTurnIntoInvoice = () => {
    const issueDate = new Date().toISOString().slice(0, 10);
    const lineItems: FinishedInvoice["lineItems"] = [];
    if (calc.laborAmount > 0 || laborHours > 0) {
      lineItems.push({
        id: "line_calc_labor",
        type: "labor",
        description: "On-site labor & installation",
        quantity: Math.max(0, laborHours),
        unitPrice: Math.max(0, hourlyRate),
        amount: calc.laborAmount
      });
    }
    lineItems.push({
      id: "line_calc_parts",
      type: "material",
      description: `Materials & parts (Cost $${calc.safeCost.toFixed(2)} + ${calc.effectiveMarkupPct}% markup)`,
      quantity: 1,
      unitPrice: calc.clientPartsPrice,
      amount: calc.clientPartsPrice
    });

    const invoice = syncFinishedInvoiceTotals(
      {
        documentType: "invoice",
        invoiceNumber: generateInvoiceNumber(),
        issueDate,
        dueDate: computeDueDate(issueDate, profile.defaultTerms),
        customerName: "Client Name",
        currency: profile.defaultCurrency,
        lineItems,
        paymentRecords: [],
        paymentMethods: profile.defaultPaymentMethods,
        materialsMarkupPercent: calc.effectiveMarkupPct
      },
      taxRate
    );

    updateDraft((prev) => ({
      ...prev,
      invoiceId: undefined,
      rawInput: `Labor ${laborHours} hrs at $${hourlyRate}/hr, materials cost $${calc.safeCost.toFixed(2)} with ${calc.effectiveMarkupPct}% markup.`,
      taxRate,
      paymentTerms: profile.defaultTerms,
      invoice,
      openDecisions: [],
      assumptions: []
    }));
    navigate("/create");
  };

  return (
    <AppShell mode="marketing">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0F5132]">
            <Calculator className="h-3.5 w-3.5" />
            Free Contractor Profit Tool
          </span>
          <h1 className="mt-3 font-serif text-3xl font-bold text-[#101915] sm:text-4xl">
            Materials Markup vs. Profit Margin Calculator
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-[#47554E] sm:text-base">
            Stop confusing markup with profit margin on supply runs. Price materials accurately, protect your profit on
            parts &amp; warranty risk, and send the exact total into an itemized invoice.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left Inputs */}
          <div className="space-y-4 rounded-2xl border border-[#D9E0DC] bg-white p-6 shadow-card lg:col-span-6">
            <div>
              <label htmlFor="calc-materials-cost" className="block text-xs font-bold text-[#47554E]">
                Your Receipt / Materials Cost ($)
              </label>
              <input
                id="calc-materials-cost"
                type="number"
                min="0"
                step="any"
                value={materialsCost}
                onChange={(e) => setMaterialsCost(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                className="mt-1.5 w-full rounded-xl border border-[#D9E0DC] px-3.5 py-2.5 font-mono text-base font-bold text-[#101915] outline-none focus:border-[#0F5132]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#47554E]">Calculation Mode</span>
                <div className="inline-flex rounded-lg bg-[#F5F6F2] p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMode("markup")}
                    className={`rounded-md px-2.5 py-1 ${
                      mode === "markup" ? "bg-white text-[#0F5132] shadow-sm" : "text-[#6B7A72]"
                    }`}
                  >
                    Markup %
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("margin")}
                    className={`rounded-md px-2.5 py-1 ${
                      mode === "margin" ? "bg-white text-[#0F5132] shadow-sm" : "text-[#6B7A72]"
                    }`}
                  >
                    Target Margin %
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[15, 20, 25, 30, 50].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPctValue(v)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition ${
                      pctValue === v
                        ? "border-[#0F5132] bg-[#0F5132] text-white"
                        : "border-[#D9E0DC] bg-white text-[#47554E] hover:bg-[#E8F5EE]"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
                <div className="relative flex-1 min-w-[90px]">
                  <input
                    type="number"
                    min="0"
                    max={mode === "margin" ? 95 : 500}
                    step="any"
                    aria-label="Custom percentage"
                    value={pctValue}
                    onChange={(e) => setPctValue(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg border border-[#D9E0DC] px-2.5 py-1.5 pr-6 font-mono text-xs font-semibold outline-none focus:border-[#0F5132]"
                  />
                  <Percent className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-[#6B7A72]" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-[#E2E7E3] pt-4 sm:grid-cols-3">
              <div>
                <label htmlFor="calc-labor-hours" className="block text-xs font-bold text-[#47554E]">
                  Labor Hours
                </label>
                <input
                  id="calc-labor-hours"
                  type="number"
                  min="0"
                  step="any"
                  value={laborHours}
                  onChange={(e) => setLaborHours(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>
              <div>
                <label htmlFor="calc-hourly-rate" className="block text-xs font-bold text-[#47554E]">
                  Hourly Rate ($)
                </label>
                <input
                  id="calc-hourly-rate"
                  type="number"
                  min="0"
                  step="any"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>
              <div>
                <label htmlFor="calc-tax-rate" className="block text-xs font-bold text-[#47554E]">
                  Tax (%)
                </label>
                <input
                  id="calc-tax-rate"
                  type="number"
                  min="0"
                  max="30"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                  className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-sm outline-none focus:border-[#0F5132]"
                />
              </div>
            </div>
          </div>

          {/* Right Live Breakdown + Reference Table */}
          <div className="space-y-5 lg:col-span-6">
            <div className="rounded-2xl border-2 border-[#0F5132] bg-white p-6 shadow-paper">
              <div className="grid grid-cols-2 gap-4 border-b border-[#E2E7E3] pb-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
                    Client Materials Price
                  </div>
                  <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#0F5132]">
                    {formatMoney(calc.clientPartsPrice, profile.defaultCurrency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Gross Parts Profit</div>
                  <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#101915]">
                    {formatMoney(calc.grossProfit, profile.defaultCurrency)}
                  </div>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-[#47554E]">Effective Markup %</dt>
                  <dd className="font-mono font-semibold text-[#101915]">{calc.effectiveMarkupPct}%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#47554E]">Effective Profit Margin %</dt>
                  <dd className="font-mono font-semibold text-[#101915]">{calc.effectiveMarginPct}%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#47554E]">Labor Subtotal</dt>
                  <dd className="font-mono font-semibold text-[#101915]">
                    {formatMoney(calc.laborAmount, profile.defaultCurrency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#47554E]">Pre-Tax Job Total</dt>
                  <dd className="font-mono font-bold text-[#101915]">
                    {formatMoney(calc.preTaxTotal, profile.defaultCurrency)}
                  </dd>
                </div>
                {calc.taxAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-[#47554E]">Tax ({taxRate}%)</dt>
                    <dd className="font-mono font-semibold text-[#101915]">
                      {formatMoney(calc.taxAmount, profile.defaultCurrency)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-[#E2E7E3] pt-2.5 text-base font-bold">
                  <dt className="text-[#101915]">Total Client Invoice</dt>
                  <dd className="font-mono text-lg text-[#0F5132]">
                    {formatMoney(calc.grandTotal, profile.defaultCurrency)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={handleTurnIntoInvoice}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F5132] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#146C43]"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Turn Into Invoice in NoteBill</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
                Quick Markup-to-Margin Cheat Sheet
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-[#E2E7E3]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F6F2] text-[#47554E]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Markup Added</th>
                      <th className="px-3 py-2 font-bold">Actual Profit Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E7E3] font-mono">
                    {MARKUP_REFERENCE_ROWS.map((row) => (
                      <tr key={row.markup}>
                        <td className="px-3 py-1.5 font-semibold text-[#101915]">{row.markup}%</td>
                        <td className="px-3 py-1.5 text-[#0F5132]">{row.margin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <ToolFaqSection
          items={[
            {
              q: "What is the difference between 25% markup and 25% margin?",
              a: "A 25% markup on $200 parts adds $50 for a $250 selling price — which is a 20.0% profit margin ($50 / $250). A true 25% margin on $200 requires a $266.67 price."
            },
            {
              q: "Why do contractors mark up parts?",
              a: "Materials carry real overhead: supply-house drive time, card processing fees, warranty call-backs, and cash tied up before the client pays."
            },
            {
              q: "Can NoteBill hide my raw supply cost on the client PDF?",
              a: "Yes — click Turn Into Invoice in NoteBill and toggle Hide Materials Breakdown in the workbench before downloading or sending."
            }
          ]}
        />
      </div>
    </AppShell>
  );
}
