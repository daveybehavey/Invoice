import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, Copy, CreditCard, Download, Loader2, Printer, Send, Sparkles } from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { InvoicePaperSheet } from "../components/InvoicePaperSheet";
import { SignaturePad } from "../components/SignaturePad";
import {
  approvePublicPortalQuote,
  fetchPublicPortalInvoice,
  submitPublicPortalPaymentNotice
} from "../lib/api";
import { computeInvoiceTotals, deriveEffectiveTaxRate, formatMoney, roundToCents } from "../lib/money";
import { exportInvoicePdf } from "../lib/pdfExport";
import type { SavedInvoiceFull } from "../lib/types";

export function PortalPage() {
  const { invoiceId, token } = useParams<{ invoiceId: string; token: string }>();
  const { profile, showToast } = useApp();
  const [record, setRecord] = useState<SavedInvoiceFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(undefined);
  const [tipPct, setTipPct] = useState<number>(0);
  const [approverName, setApproverName] = useState("");
  const [approverNote, setApproverNote] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!invoiceId || !token) {
      setError("This invoice portal link is incomplete.");
      setLoading(false);
      return;
    }
    let active = true;
    fetchPublicPortalInvoice(invoiceId, token)
      .then((res) => {
        if (!active) return;
        setRecord(res.invoice);
        const recTier = res.invoice.invoiceData.finishedInvoice.quoteOptions?.find((o) => o.recommended);
        if (recTier) setSelectedOptionId(recTier.id);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Invoice portal link could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invoiceId, token]);

  if (loading) {
    return (
      <AppShell mode="portal">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E2E7E3] bg-white py-20">
          <Loader2 className="h-7 w-7 animate-spin text-[#0F5132]" />
          <p className="mt-3 text-sm font-medium text-[#47554E]">Loading invoice...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !record) {
    return (
      <AppShell mode="portal">
        <div className="rounded-2xl border border-[#E2E7E3] bg-white p-8 text-center">
          <h1 className="font-serif text-2xl font-bold text-[#101915]">Invoice Unavailable</h1>
          <p className="mt-2 text-sm text-[#47554E]">{error || "This link may have expired."}</p>
        </div>
      </AppShell>
    );
  }

  const inv = record.invoiceData.finishedInvoice;
  const isQuote = inv.documentType === "estimate";
  const derivedTaxRate = deriveEffectiveTaxRate(inv);
  const totals = computeInvoiceTotals({
    lineItems: inv.lineItems,
    discountAmount: inv.discountAmount,
    taxRate: derivedTaxRate,
    paymentRecords: inv.paymentRecords
  });
  const portalProfile =
    profile.businessName === "Your Business Name"
      ? {
          ...profile,
          businessName: inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : "Service Invoice"
        }
      : profile;
  const selectedTier = inv.quoteOptions?.find((o) => o.id === selectedOptionId);
  const basePayable = selectedTier ? selectedTier.amount : totals.balanceDue;
  const tipAmount = inv.tipEnabled && tipPct > 0 ? roundToCents((basePayable * tipPct) / 100) : 0;
  const displayAmount = roundToCents(basePayable + tipAmount);
  const isPaid = !isQuote && totals.balanceDue <= 0 && (record.status === "paid" || totals.amountPaid > 0);
  const enabledAltMethods = (inv.paymentMethods || []).filter(
    (m) => m.enabled !== false && (m.label || m.details)
  );

  const handleApproveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceId || !token) return;
    if (!approverName.trim()) {
      showToast("Please type your full name to approve.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const res = await approvePublicPortalQuote({
        invoiceId,
        token,
        approvedBy: approverName.trim(),
        selectedOptionId,
        signatureDataUrl,
        note: approverNote.trim() || undefined
      });
      setRecord(res.invoice);
      showToast("Quote approved! Thank you.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not record approval.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentNotice = async (methodLabel: string) => {
    if (!invoiceId || !token) return;
    setSubmitting(true);
    try {
      const res = await submitPublicPortalPaymentNotice({
        invoiceId,
        token,
        method: methodLabel,
        note: tipAmount > 0 ? `Included ${tipPct}% tip (${formatMoney(tipAmount, inv.currency)})` : undefined
      });
      setRecord(res.invoice);
      showToast(
        `Notified ${profile.businessName && profile.businessName !== "Your Business Name" ? profile.businessName : "the sender"} that you sent ${methodLabel}.`,
        "success"
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send notice.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell mode="portal">
      {/* Top Action Card */}
      <div className="no-print mb-6 space-y-4 rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            {isPaid ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold text-[#0F5132]">
                <CheckCircle2 className="h-4 w-4" /> Paid in full
              </div>
            ) : isQuote && inv.quoteApproval ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold text-[#0F5132]">
                <CheckCircle2 className="h-4 w-4" /> Quote Approved
              </div>
            ) : (
              <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
                {isQuote ? "Quote Total" : "Balance Due"}
              </div>
            )}

            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#101915]">
              {formatMoney(displayAmount, inv.currency)}
            </div>
            {tipAmount > 0 && (
              <div className="text-xs font-semibold text-[#0F5132]">
                Includes {tipPct}% tip (+{formatMoney(tipAmount, inv.currency)})
              </div>
            )}
            {inv.dueDate && !isPaid && (
              <div className="mt-0.5 text-xs text-[#47554E]">
                {isQuote ? "Valid until" : "Due"} {inv.dueDate}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void exportInvoicePdf({ invoice: inv, profile: portalProfile, poweredByVisible: true })}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-4 py-2.5 text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
            >
              <Download className="h-4 w-4 text-[#0F5132]" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D9E0DC] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
            >
              <Printer className="h-4 w-4 text-[#0F5132]" />
              <span>Print</span>
            </button>
            {!isQuote && !isPaid && inv.paymentLinkUrl && (
              <a
                href={inv.paymentLinkUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F5132] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#146C43]"
              >
                <CreditCard className="h-4 w-4" />
                <span>Pay by Card / Apple Pay</span>
              </a>
            )}
          </div>
        </div>

        {/* Optional Tip Picker */}
        {!isQuote && !isPaid && inv.tipEnabled && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E7E3] pt-3">
            <span className="text-xs font-semibold text-[#47554E]">Add a thank-you tip:</span>
            {[0, 10, 15, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setTipPct(pct)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                  tipPct === pct
                    ? "bg-[#0F5132] text-white"
                    : "border border-[#D9E0DC] bg-[#F5F6F2] text-[#101915]"
                }`}
              >
                {pct === 0 ? "No tip" : `${pct}%`}
              </button>
            ))}
          </div>
        )}

        {/* Other Ways to Pay (e-Transfer / Venmo / Zelle / Cheque) */}
        {!isQuote && !isPaid && enabledAltMethods.length > 0 && (
          <div className="space-y-2 border-t border-[#E2E7E3] pt-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">
              Other Ways to Pay
            </div>
            {inv.clientPaymentNotice && (
              <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] px-3 py-2 text-xs font-semibold text-[#0F5132]">
                <Check className="h-4 w-4" />
                <span>
                  Payment notice sent ({inv.clientPaymentNotice.method}) on{" "}
                  {new Date(inv.clientPaymentNotice.sentAt).toLocaleDateString()}.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {enabledAltMethods.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#101915]">{m.label || m.kind}</div>
                    {m.details && <div className="truncate text-xs text-[#47554E]">{m.details}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.details && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(m.details!);
                          showToast(`Copied ${m.label || m.kind} details!`, "success");
                        }}
                        className="rounded-lg border border-[#D9E0DC] bg-white p-1.5 text-[#47554E] hover:text-[#101915]"
                        title="Copy payment details"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handlePaymentNotice(m.label || m.kind)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#101915] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0F5132]"
                    >
                      <Send className="h-3 w-3" /> I Sent It
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Quote Approval Card */}
        {isQuote && !inv.quoteApproval && (
          <form onSubmit={handleApproveQuote} className="space-y-3 border-t border-[#E2E7E3] pt-4">
            <div className="text-sm font-bold text-[#101915]">Approve & Sign Quote</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                placeholder="Your full name"
                className="rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
              />
              <input
                type="text"
                value={approverNote}
                onChange={(e) => setApproverNote(e.target.value)}
                placeholder="Optional note or preferred start date"
                className="rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
              />
            </div>
            <SignaturePad onChange={setSignatureDataUrl} />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F5132] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitting ? "Approving..." : "Approve Quote"}</span>
            </button>
          </form>
        )}
      </div>

      <div className="print-only-container">
        <InvoicePaperSheet
          invoice={inv}
          profile={portalProfile}
          taxRate={derivedTaxRate}
          readOnly
          poweredByVisible
          selectedQuoteOptionId={selectedOptionId}
          onSelectQuoteOption={isQuote && !inv.quoteApproval ? setSelectedOptionId : undefined}
        />
      </div>

      <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E7E3] bg-white px-5 py-3.5 text-xs text-[#47554E]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-[#0F5132]" />
          <span>Send invoices like this from your phone in seconds</span>
        </div>
        <Link
          to="/free-invoice-generator"
          className="inline-flex items-center gap-1 rounded-lg bg-[#E8F5EE] px-3 py-1.5 font-bold text-[#0F5132] hover:bg-[#0F5132] hover:text-white"
        >
          <span>Try NoteBill Free</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </AppShell>
  );
}
