import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  Clock,
  Download,
  Lock,
  ShieldCheck,
  Star,
  Zap
} from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { InvoicePaperSheet } from "../components/InvoicePaperSheet";
import { VoiceMicButton } from "../components/VoiceMicButton";
import { parseRoughNotesInstant, TRADE_PRESETS } from "../lib/instantParser";
import { formatMoney, syncFinishedInvoiceTotals } from "../lib/money";
import { exportInvoicePdf } from "../lib/pdfExport";

export function LandingPage() {
  const { profile, updateDraft, showToast } = useApp();
  const navigate = useNavigate();

  const [activePresetId, setActivePresetId] = useState(TRADE_PRESETS[0].id);
  const [sandboxText, setSandboxText] = useState(TRADE_PRESETS[0].notes);
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, number | "included" | "skip">>({});

  const parsed = useMemo(() => {
    const base = parseRoughNotesInstant(sandboxText, {
      currency: profile.defaultCurrency,
      defaultTaxRate: profile.defaultTaxRate,
      defaultTerms: profile.defaultTerms
    });
    const patchedLines = base.invoice.lineItems
      .filter((item) => resolvedPrices[item.id] !== "skip")
      .map((item) => {
        const choice = resolvedPrices[item.id];
        if (choice === "included") {
          return { ...item, amount: 0, unitPrice: 0, quantity: 1, explicitFree: true };
        }
        if (typeof choice === "number") {
          return { ...item, amount: choice, unitPrice: choice, quantity: 1, explicitFree: false };
        }
        return item;
      });
    const invoice = syncFinishedInvoiceTotals({ ...base.invoice, lineItems: patchedLines }, base.taxRate);
    const openDecisions = base.openDecisions.filter(
      (d) => !d.lineItemId || !(d.lineItemId in resolvedPrices)
    );
    return { ...base, invoice, openDecisions };
  }, [sandboxText, resolvedPrices, profile.defaultCurrency, profile.defaultTaxRate, profile.defaultTerms]);

  const activePreset = TRADE_PRESETS.find((p) => p.id === activePresetId) ?? TRADE_PRESETS[0];

  const handleSelectPreset = (presetId: string) => {
    const found = TRADE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(found.id);
    setSandboxText(found.notes);
    setResolvedPrices({});
  };

  const handleOpenInWorkbench = () => {
    updateDraft((prev) => ({
      ...prev,
      rawInput: sandboxText,
      customerEmail: parsed.customerEmail || prev.customerEmail,
      taxRate: parsed.taxRate,
      paymentTerms: parsed.paymentTerms,
      invoice: parsed.invoice,
      structuredInvoice: parsed.structuredInvoice,
      openDecisions: parsed.openDecisions,
      assumptions: parsed.assumptions
    }));
    navigate("/create");
  };

  const handleDownloadSamplePdf = async () => {
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
      {/* Hero + Live Magic Sandbox */}
      <section className="paper-grid-bg border-b border-[#E2E7E3] pb-14 pt-8 sm:pb-20 sm:pt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0F5132]/20 bg-[#E8F5EE] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#0F5132]">
              <Zap className="h-3.5 w-3.5" />
              Built for Tradespeople, Contractors & Solo Pros
            </div>
            <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-[#101915] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Dump the mess. Get paid before you leave the driveway.
            </h1>
            <p className="mt-4 text-base text-[#47554E] sm:text-lg">
              Paste a client text thread, talk into your phone, or snap a receipt. NoteBill builds quotes &amp;
              invoices in seconds, captures photo proof &amp; client signatures, and never invents a price without
              your tap.
            </p>
          </div>

          {/* Interactive Hero Magic Sandbox */}
          <div id="sandbox" className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* Left: Rough Notes Box */}
            <div className="rounded-2xl border border-[#D9E0DC] bg-white p-5 shadow-card lg:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
                  1. Paste notes or a text thread
                </span>
                <VoiceMicButton
                  onTranscript={(txt) => setSandboxText((prev) => `${prev.trim()} ${txt}`.trim())}
                  onUnsupported={() =>
                    showToast("Voice dictation uses your browser's speech engine (Chrome / Safari).", "info")
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {TRADE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      activePresetId === preset.id
                        ? "bg-[#101915] text-white"
                        : "bg-[#F5F6F2] text-[#47554E] hover:bg-[#E8F5EE] hover:text-[#0F5132]"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={5}
                aria-label="Messy job notes sandbox"
                value={sandboxText}
                onChange={(e) => {
                  setSandboxText(e.target.value);
                  setResolvedPrices({});
                }}
                placeholder="Example: Fixed leaky pipe for Mike on Tue. 2 hrs at $95/hr, copper fitting $28, hauled old heater..."
                className="mt-3 w-full resize-none rounded-xl border border-[#D9E0DC] bg-[#F5F6F2]/60 p-3.5 text-sm leading-relaxed text-[#101915] outline-none transition focus:border-[#0F5132] focus:bg-white focus:ring-2 focus:ring-[#0F5132]/15"
              />

              {parsed.openDecisions.length > 0 && (
                <div className="mt-3 space-y-2 rounded-xl border border-[#F59E0B]/50 bg-[#FEF3C7]/70 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#B45309]">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Needs your tap (zero silent $0 guesses)</span>
                  </div>
                  {parsed.openDecisions.map((dec) => {
                    const quickAmt = activePreset.quickDecisionAmount ?? 45;
                    return (
                      <div key={dec.id} className="space-y-2 pt-1">
                        <p className="text-xs font-medium text-[#101915]">{dec.prompt}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {dec.lineItemId && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setResolvedPrices((p) => ({ ...p, [dec.lineItemId!]: quickAmt }))
                                }
                                className="rounded-lg bg-[#0F5132] px-2.5 py-1 font-mono text-xs font-semibold text-white hover:bg-[#146C43]"
                              >
                                +${quickAmt}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setResolvedPrices((p) => ({ ...p, [dec.lineItemId!]: "included" }))
                                }
                                className="rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                              >
                                Included ($0)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setResolvedPrices((p) => ({ ...p, [dec.lineItemId!]: "skip" }))
                                }
                                className="rounded-lg border border-transparent px-2 py-1 text-xs font-semibold text-[#6B7A72] hover:text-[#9F1239]"
                              >
                                Skip line
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={handleOpenInWorkbench}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F5132] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#146C43]"
                >
                  <span>Open in Full Workbench</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSamplePdf}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-4 py-3 text-sm font-semibold text-[#101915] transition hover:bg-[#F5F6F2]"
                >
                  <Download className="h-4 w-4 text-[#0F5132]" />
                  <span>PDF</span>
                </button>
              </div>
              <p className="mt-2.5 text-center text-[11px] text-[#6B7A72]">
                No account required to draft or download PDF.
              </p>
            </div>

            {/* Right: Live Crisp Paper Preview */}
            <div className="lg:col-span-7">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
                  2. Live client-ready invoice
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-[#0F5132]">
                  Total: {formatMoney(parsed.invoice.total, parsed.invoice.currency)}
                </span>
              </div>
              <InvoicePaperSheet
                invoice={parsed.invoice}
                profile={{ ...profile, businessName: "Cedar Creek Plumbing & Home" }}
                theme={profile.defaultTheme}
                taxRate={parsed.taxRate}
                readOnly
                poweredByVisible
              />
            </div>
          </div>
        </div>
      </section>

      {/* Power Feature Grid */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F5EE] text-[#0F5132]">
              <Clock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-serif text-xl font-bold text-[#101915]">
              Job Timer, Bundles &amp; Parts Markup
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#47554E]">
              Time the job live, drop in 1-tap service bundles, apply +15%/20%/30% materials markup, and never
              leave forgotten parts or 30-minute add-ons on the table.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#B45309]">
              <Camera className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-serif text-xl font-bold text-[#101915]">
              Quotes, Signatures &amp; Photo Proof
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#47554E]">
              Send Good/Better/Best quotes with 1-tap client signature approval, attach Before/After job-site
              photos, and convert to a Deposit or Final invoice in one click.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F5EE] text-[#0F5132]">
              <Star className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-serif text-xl font-bold text-[#101915]">
              Get Paid Fast &amp; Win 5-Star Reviews
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#47554E]">
              Accept Stripe cards, Apple Pay, e-Transfer, Venmo, or Zelle. When paid, 1 tap texts a receipt with
              your Google Review link so great jobs fuel your next leads.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="border-t border-[#E2E7E3] bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-bold text-[#101915]">
              Catches one forgotten add-on and pays for itself 10x
            </h2>
            <p className="mt-2 text-sm text-[#47554E]">
              Start drafting and exporting PDFs free. Upgrade to Pro when you want unlimited sends, quotes, photo
              proof, and automated follow-ups.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E2E7E3] bg-[#F5F6F2]/50 p-6">
              <div className="text-sm font-bold text-[#47554E]">Free</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold text-[#101915]">$0</span>
                <span className="text-sm text-[#6B7A72]">/ forever</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-[#47554E]">
                {[
                  "Unlimited local drafts, Truck Scratchpad & PDF export",
                  "4 clean invoice themes + live rough-note parser",
                  "Up to 3 cloud-saved invoices/month",
                  "Includes subtle Powered by NoteBill footer"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5132]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/create"
                className="mt-6 block w-full rounded-xl border border-[#D9E0DC] bg-white py-2.5 text-center text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                Start Free Now
              </Link>
            </div>

            <div className="relative rounded-2xl border-2 border-[#0F5132] bg-white p-6 shadow-paper">
              <span className="absolute -top-3 right-5 rounded-full bg-[#0F5132] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                Pro Power
              </span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#0F5132]">NoteBill Pro</span>
                <span className="rounded-full bg-[#E8F5EE] px-2.5 py-0.5 text-[11px] font-bold text-[#0F5132]">
                  Or $149/yr (Save 35%)
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-4xl font-bold text-[#101915]">$19</span>
                <span className="text-sm text-[#6B7A72]">USD / month</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-[#47554E]">
                {[
                  "Unlimited cloud invoices, quotes & zero NoteBill watermark",
                  "Client quote e-approval, signatures, deposits & photo proof",
                  "1-tap Email + SMS + WhatsApp + Stripe Pay Links",
                  "Polite auto-chase ladder, Google Review Ask & Tax CSV export",
                  "Full Billie AI cleanup, receipt OCR & repeat-client memory"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5132]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/pricing"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F5132] py-2.5 text-sm font-semibold text-white hover:bg-[#146C43]"
              >
                <Lock className="h-4 w-4" />
                <span>See Pro Plan Details</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
