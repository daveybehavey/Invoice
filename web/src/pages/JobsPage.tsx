import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  Eye,
  FilePlus2,
  History,
  Loader2,
  MessageCircle,
  NotebookPen,
  Radar,
  Search,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { VoiceMicButton } from "../components/VoiceMicButton";
import {
  deleteSavedInvoice,
  duplicateSavedInvoice,
  listSavedInvoices,
  recordSavedInvoicePayment,
  sendInvoiceReminder,
  trackClientRevenueSignal,
  updateSavedInvoiceStatus
} from "../lib/api";
import { estimateNotesValue, parseRoughNotesInstant } from "../lib/instantParser";
import {
  addScratchpadNote,
  deleteLocalDraft,
  deleteScratchpadNote,
  getLocalDraftHistory,
  getScratchpadNotes
} from "../lib/localStore";
import { formatMoney, roundToCents } from "../lib/money";
import type { LocalDraftSnapshot, SavedInvoiceListItem, ScratchpadNote } from "../lib/types";

function getChaseStage(inv: SavedInvoiceListItem, todayIso: string): {
  label: string;
  nudgeText: string;
} {
  const daysSinceSent = inv.delivery?.sentAt
    ? Math.floor((Date.now() - Date.parse(inv.delivery.sentAt)) / 86_400_000)
    : 0;
  const openAmt = formatMoney(inv.balanceDue ?? inv.total ?? 0);
  const client = inv.customerName || "there";
  const num = inv.invoiceNumber || "your invoice";

  if (inv.dueDate && inv.dueDate < todayIso) {
    return {
      label: "+7d Polite Overdue",
      nudgeText: `Hi ${client}, quick follow-up on invoice ${num} (${openAmt}), which is now past due. Please let me know if you need another copy or payment link — thank you!`
    };
  }
  if (inv.dueDate === todayIso) {
    return {
      label: "Due Today",
      nudgeText: `Hi ${client}, just a friendly reminder that invoice ${num} (${openAmt}) is due today. Thanks so much!`
    };
  }
  if (inv.delivery?.openedAt) {
    return {
      label: "Opened by Client",
      nudgeText: `Hi ${client}, checking in on invoice ${num} (${openAmt}) in case you had any questions. Happy to help!`
    };
  }
  if (daysSinceSent >= 3) {
    return {
      label: "Day 3 Check-in",
      nudgeText: `Hi ${client}, wanted to make sure invoice ${num} (${openAmt}) landed cleanly in your inbox. Let me know if anything looks off!`
    };
  }
  return {
    label: "Sent",
    nudgeText: `Hi ${client}, following up on invoice ${num} (${openAmt}). Thank you for your business!`
  };
}

export function JobsPage() {
  const { session, profile, updateProfile, updateDraft, openAuthModal, showToast } = useApp();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<SavedInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "overdue" | "paid">("all");
  const [search, setSearch] = useState("");
  const [scratchInput, setScratchInput] = useState("");
  const [scratchNotes, setScratchNotes] = useState<ScratchpadNote[]>(() => getScratchpadNotes());
  const [localDrafts, setLocalDrafts] = useState<LocalDraftSnapshot[]>(() => getLocalDraftHistory());
  const [reviewAskInvoice, setReviewAskInvoice] = useState<SavedInvoiceListItem | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<SavedInvoiceListItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!session) {
      setInvoices([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listSavedInvoices();
      setInvoices(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load invoices.", "error");
    } finally {
      setLoading(false);
    }
  }, [session, showToast]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue = (inv: SavedInvoiceListItem) =>
    inv.status === "sent" &&
    (inv.balanceDue ?? inv.total ?? 0) > 0 &&
    Boolean(inv.dueDate && inv.dueDate < todayIso);

  const metrics = useMemo(() => {
    let unpaid = 0;
    let overdue = 0;
    let paidMonth = 0;
    const monthPrefix = todayIso.slice(0, 7);

    for (const inv of invoices) {
      if (inv.status === "deleted") continue;
      const open = inv.balanceDue ?? (inv.status === "paid" ? 0 : inv.total ?? 0);
      if (inv.status !== "paid" && open > 0) {
        unpaid += open;
        if (isOverdue(inv)) overdue += open;
      }
      if (inv.status === "paid" && inv.updatedAt.startsWith(monthPrefix)) {
        paidMonth += inv.total ?? 0;
      }
    }
    return { unpaid, overdue, paidMonth };
  }, [invoices, todayIso]);

  const unbilledTotalEstimate = useMemo(() => {
    return roundToCents(scratchNotes.reduce((sum, n) => sum + estimateNotesValue(n.text), 0));
  }, [scratchNotes]);

  const chaseQueue = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status === "sent" &&
          (inv.balanceDue ?? inv.total ?? 0) > 0
      ),
    [invoices]
  );

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.status === "deleted") return false;
      if (filter === "overdue" && !isOverdue(inv)) return false;
      if (filter !== "all" && filter !== "overdue" && inv.status !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${inv.customerName || ""} ${inv.invoiceNumber || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, filter, search]);

  const handleAddScratch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scratchInput.trim()) return;
    setScratchNotes(addScratchpadNote(scratchInput));
    setScratchInput("");
    trackClientRevenueSignal("scratchpad_note_saved", "v3_jobs");
    showToast("Saved to your Truck Scratchpad.", "success");
  };

  const handleConvertScratch = (note: ScratchpadNote) => {
    trackClientRevenueSignal("scratchpad_note_used_in_invoice", "v3_jobs");
    const parsed = parseRoughNotesInstant(note.text, {
      currency: profile.defaultCurrency,
      defaultTaxRate: profile.defaultTaxRate,
      defaultTerms: profile.defaultTerms,
      defaultMarkupPercent: profile.defaultMaterialsMarkupPercent
    });
    updateDraft({
      sourceType: "text_input",
      rawInput: note.text,
      customerEmail: parsed.customerEmail || "",
      taxRate: parsed.taxRate,
      paymentTerms: parsed.paymentTerms,
      theme: profile.defaultTheme,
      invoice: {
        ...parsed.invoice,
        paymentMethods: (profile.defaultPaymentMethods || []).filter((m) => m.enabled),
        tipEnabled: profile.defaultTipEnabled
      },
      structuredInvoice: parsed.structuredInvoice,
      openDecisions: parsed.openDecisions,
      assumptions: parsed.assumptions,
      updatedAt: new Date().toISOString()
    });
    navigate("/create");
  };

  const handleMarkPaid = async (inv: SavedInvoiceListItem) => {
    try {
      await updateSavedInvoiceStatus(inv.invoiceId, "paid");
      showToast("Marked paid!", "success");
      setReviewAskInvoice(inv);
      void loadInvoices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update status.", "error");
    }
  };

  const openPaymentModal = (inv: SavedInvoiceListItem) => {
    const open = roundToCents(inv.balanceDue ?? inv.total ?? 0);
    setPaymentModalInvoice(inv);
    setPaymentAmount(open > 0 ? open.toFixed(2) : "");
    setPaymentNote("");
  };

  const handleSubmitPartialPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;
    const amt = roundToCents(Number.parseFloat(paymentAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast("Enter a payment amount greater than $0.", "warning");
      return;
    }
    setPaymentBusy(true);
    try {
      const updated = await recordSavedInvoicePayment(
        paymentModalInvoice.invoiceId,
        amt,
        paymentNote.trim() || undefined
      );
      const remaining = roundToCents(updated.invoiceData.finishedInvoice.balanceDue ?? 0);
      const settled = updated.status === "paid" || remaining <= 0;
      const targetInv = paymentModalInvoice;
      setPaymentModalInvoice(null);
      if (settled) {
        showToast("Paid in full!", "success");
        setReviewAskInvoice(targetInv);
      } else {
        showToast(
          `Logged ${formatMoney(amt, profile.defaultCurrency)} (${formatMoney(remaining, profile.defaultCurrency)} remaining).`,
          "success"
        );
      }
      void loadInvoices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not record payment.", "error");
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleExportLocalCsv = () => {
    if (localDrafts.length === 0) return;
    const esc = (val: string | number | undefined) => {
      const str = String(val ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [["Invoice #", "Type", "Client", "Saved", "Total"].join(",")];
    let sum = 0;
    for (const item of localDrafts) {
      sum += roundToCents(item.total);
      rows.push(
        [
          esc(item.invoiceNumber),
          esc(item.documentType),
          esc(item.customerName),
          esc(item.savedAt.slice(0, 10)),
          roundToCents(item.total).toFixed(2)
        ].join(",")
      );
    }
    rows.push(["TOTALS", "", "", "", sum.toFixed(2)].join(","));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notebill-local-drafts-${new Date().getFullYear()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("Exported Local Drafts CSV!", "success");
  };

  const handleBillAgain = async (id: string) => {
    try {
      const dup = await duplicateSavedInvoice(id);
      navigate(`/create?id=${dup.invoiceId}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not duplicate invoice.", "error");
    }
  };

  const handleSendNudge = async (id: string) => {
    try {
      const res = await sendInvoiceReminder(id);
      showToast(res.warning || "Polite payment reminder sent!", res.warning ? "warning" : "success");
      void loadInvoices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send reminder.", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedInvoice(id);
      showToast("Moved to archive.", "info");
      void loadInvoices();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete invoice.", "error");
    }
  };

  const handleExportTaxCsv = () => {
    const active = invoices.filter((inv) => inv.status !== "deleted");
    if (active.length === 0) {
      showToast("No saved invoices to export yet.", "warning");
      return;
    }
    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [
      ["Invoice #", "Type", "Status", "Client", "Created", "Due Date", "Total", "Open Balance"].join(",")
    ];
    let sumTotal = 0;
    let sumOpen = 0;
    for (const inv of active) {
      const total = roundToCents(inv.total ?? 0);
      const open = roundToCents(inv.balanceDue ?? (inv.status === "paid" ? 0 : total));
      sumTotal += total;
      sumOpen += open;
      rows.push(
        [
          escapeCsv(inv.invoiceNumber || "Draft"),
          escapeCsv(inv.documentType),
          escapeCsv(inv.status),
          escapeCsv(inv.customerName || "Unnamed"),
          escapeCsv(inv.createdAt.slice(0, 10)),
          escapeCsv(inv.dueDate || ""),
          total.toFixed(2),
          open.toFixed(2)
        ].join(",")
      );
    }
    rows.push(["TOTALS", "", "", "", "", "", sumTotal.toFixed(2), sumOpen.toFixed(2)].join(","));

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notebill-tax-summary-${new Date().getFullYear()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("Exported Tax-Time CSV!", "success");
  };

  const reviewMessage = reviewAskInvoice
    ? `Thanks ${reviewAskInvoice.customerName || "again"}! We've marked invoice ${
        reviewAskInvoice.invoiceNumber || ""
      } (${formatMoney(reviewAskInvoice.total ?? 0, profile.defaultCurrency)}) as paid. If you were happy with the work, a quick Google review means the world to a small business${
        profile.googleReviewUrl ? `: ${profile.googleReviewUrl}` : "!"
      }`
    : "";

  return (
    <AppShell mode="workspace">
      <div className="space-y-6">
        {/* 3-Number Money Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-[#6B7A72]">Unpaid Open</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#101915]">
              {formatMoney(metrics.unpaid, profile.defaultCurrency)}
            </div>
          </div>
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-[#B45309]">Overdue</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#B45309]">
              {formatMoney(metrics.overdue, profile.defaultCurrency)}
            </div>
          </div>
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Paid This Month</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0F5132]">
              {formatMoney(metrics.paidMonth, profile.defaultCurrency)}
            </div>
          </div>
        </div>

        {/* Unbilled Money Radar */}
        {scratchNotes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0F5132]/30 bg-[#E8F5EE] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <Radar className="h-5 w-5 text-[#0F5132]" />
              <div className="text-sm font-semibold text-[#101915]">
                Unbilled Money Radar: <strong>{scratchNotes.length}</strong> job{" "}
                {scratchNotes.length === 1 ? "note" : "notes"} waiting
                {unbilledTotalEstimate > 0 && (
                  <span className="ml-1 font-mono text-[#0F5132]">
                    (~{formatMoney(unbilledTotalEstimate, profile.defaultCurrency)} est.)
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleConvertScratch(scratchNotes[0])}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F5132] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#146C43]"
            >
              <span>Bill Latest Note</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Truck Scratchpad */}
        <section className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-[#0F5132]" />
              <h2 className="text-base font-bold text-[#101915]">Truck Scratchpad</h2>
              <span className="rounded-full bg-[#F5F6F2] px-2 py-0.5 text-[11px] font-semibold text-[#6B7A72]">
                Saved on this device
              </span>
            </div>
            <VoiceMicButton
              label="Voice Dump"
              onTranscript={(txt) => setScratchInput((p) => `${p.trim()} ${txt}`.trim())}
              onUnsupported={() => showToast("Voice dictation uses your browser's speech API.", "info")}
            />
          </div>

          <form onSubmit={handleAddScratch} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={scratchInput}
              onChange={(e) => setScratchInput(e.target.value)}
              placeholder='Quick dump: "Dave on Elm St - 2 hrs fence repair at $85/hr + 4 posts $60"'
              className="flex-1 rounded-xl border border-[#D9E0DC] bg-[#F5F6F2]/60 px-3.5 py-2.5 text-sm outline-none focus:border-[#0F5132] focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#101915] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0F5132]"
            >
              Save Note
            </button>
          </form>

          {scratchNotes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {scratchNotes.map((note) => {
                const estVal = estimateNotesValue(note.text);
                return (
                  <div
                    key={note.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/50 p-3.5"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#6B7A72]">
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                        {estVal > 0 && (
                          <span className="font-bold text-[#0F5132]">
                            ~{formatMoney(estVal, profile.defaultCurrency)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[#101915]">{note.text}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleConvertScratch(note)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5132] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#146C43]"
                      >
                        <span>Turn into Invoice</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setScratchNotes(deleteScratchpadNote(note.id))}
                        aria-label="Delete scratchpad note"
                        className="rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#FFF1F2] hover:text-[#9F1239]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Local Drafts (This Device) */}
        {localDrafts.length > 0 && (
          <section className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#0F5132]" />
                <h2 className="text-base font-bold text-[#101915]">Recent Local Drafts (This Device)</h2>
                <span className="rounded-full bg-[#F5F6F2] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#47554E]">
                  {localDrafts.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportLocalCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0DC] bg-[#F5F6F2] px-2.5 py-1 text-xs font-semibold text-[#101915] hover:border-[#0F5132]"
              >
                <Download className="h-3.5 w-3.5 text-[#0F5132]" />
                <span>Export Local CSV</span>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {localDrafts.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/50 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-[#101915]">{item.customerName}</span>
                      <span className="rounded bg-[#E8F5EE] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#0F5132]">
                        {item.documentType === "estimate" ? "Quote" : "Invoice"}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-[#6B7A72]">
                      {item.invoiceNumber} · {formatMoney(item.total, item.currency)} ·{" "}
                      {new Date(item.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateDraft(item.draft);
                        navigate("/create");
                      }}
                      className="rounded-lg bg-[#0F5132] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#146C43]"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalDrafts(deleteLocalDraft(item.id))}
                      aria-label="Delete local draft"
                      className="rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#FFF1F2] hover:text-[#9F1239]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Polite Auto-Chase Ladder */}
        {session && chaseQueue.length > 0 && (
          <section className="rounded-2xl border border-[#F59E0B]/50 bg-[#FEF3C7]/45 p-5 shadow-card">
            <div className="flex items-center gap-2 text-sm font-bold text-[#B45309]">
              <Bell className="h-4 w-4" />
              <span>Follow-Up & Chase Ladder ({chaseQueue.length} open)</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {chaseQueue.map((inv) => {
                const stage = getChaseStage(inv, todayIso);
                return (
                  <div
                    key={inv.invoiceId}
                    className="space-y-2.5 rounded-xl border border-[#F59E0B]/30 bg-white p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#101915]">
                            {inv.customerName || "Unnamed Client"}
                          </span>
                          <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#B45309]">
                            {stage.label}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-[#6B7A72]">
                          {inv.invoiceNumber} · {formatMoney(inv.balanceDue ?? inv.total ?? 0)} open
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMarkPaid(inv)}
                        className="rounded-lg border border-[#0F5132] bg-[#E8F5EE] px-2.5 py-1 text-xs font-semibold text-[#0F5132]"
                      >
                        Mark Paid
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSendNudge(inv.invoiceId)}
                        className="rounded-lg bg-[#101915] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0F5132]"
                      >
                        Email Nudge
                      </button>
                      <a
                        href={`sms:?&body=${encodeURIComponent(stage.nudgeText)}`}
                        className="rounded-lg border border-[#D9E0DC] bg-[#F5F6F2] px-2.5 py-1 text-xs font-semibold text-[#101915]"
                      >
                        SMS Nudge
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(stage.nudgeText);
                          showToast("Polite follow-up copied!", "success");
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0F5132] hover:underline"
                      >
                        Copy Text
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Cloud Invoice Library + Tax CSV Export */}
        <section className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-[#101915]">Saved Invoices</h2>
              {session && invoices.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportTaxCsv}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0DC] bg-[#F5F6F2] px-2.5 py-1 text-xs font-semibold text-[#101915] hover:border-[#0F5132]"
                >
                  <Download className="h-3.5 w-3.5 text-[#0F5132]" />
                  <span>Export Tax CSV</span>
                </button>
              )}
            </div>

            {session && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7A72]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search client or #"
                    className="rounded-xl border border-[#D9E0DC] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#0F5132]"
                  />
                </div>
                <div className="flex gap-1 rounded-xl bg-[#F5F6F2] p-1">
                  {(["all", "draft", "sent", "overdue", "paid"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilter(tab)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${
                        filter === tab ? "bg-white text-[#101915] shadow-sm" : "text-[#6B7A72]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!session ? (
            <div className="mt-4 rounded-xl border border-[#0F5132]/20 bg-[#E8F5EE]/60 p-6 text-center">
              <h3 className="font-serif text-xl font-bold text-[#101915]">
                Sync your invoices across phone and truck
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-[#47554E]">
                Sign in to save cloud invoices, track when clients open them, export Tax-Time CSVs, and send
                1-tap Stripe payment links. Your Truck Scratchpad stays on this device either way.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openAuthModal("Sign in to access your cloud invoice library.", "/jobs")}
                  className="rounded-xl bg-[#0F5132] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#146C43]"
                >
                  Sign In to Sync Library
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/create")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0DC] bg-white px-4 py-2.5 text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                >
                  <FilePlus2 className="h-4 w-4 text-[#0F5132]" />
                  <span>Keep Drafting Locally</span>
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#0F5132]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6B7A72]">
              No matching invoices yet. Start one in{" "}
              <button
                type="button"
                onClick={() => navigate("/create")}
                className="font-semibold text-[#0F5132] underline"
              >
                Create
              </button>
              .
            </div>
          ) : (
            <div className="mt-4 divide-y divide-[#E2E7E3]">
              {filtered.map((inv) => {
                const overdue = isOverdue(inv);
                return (
                  <div
                    key={inv.invoiceId}
                    className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/create?id=${inv.invoiceId}`)}
                          className="text-sm font-bold text-[#101915] hover:text-[#0F5132] hover:underline"
                        >
                          {inv.customerName || "Unnamed Client"}
                        </button>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            inv.status === "paid"
                              ? "bg-[#E8F5EE] text-[#0F5132]"
                              : overdue
                                ? "bg-[#FEF3C7] text-[#B45309]"
                                : inv.status === "sent"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-[#F5F6F2] text-[#47554E]"
                          }`}
                        >
                          {overdue ? "overdue" : inv.status}
                        </span>
                        {inv.delivery?.openedAt && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F5132]">
                            <Eye className="h-3 w-3" /> Opened
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-[#6B7A72]">
                        {inv.invoiceNumber || "Draft"} · Updated{" "}
                        {new Date(inv.updatedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold tabular-nums text-[#101915]">
                          {formatMoney(inv.total ?? 0, profile.defaultCurrency)}
                        </div>
                        {inv.status !== "paid" && (inv.balanceDue ?? 0) > 0 && (
                          <div className="text-[11px] tabular-nums text-[#B45309]">
                            {formatMoney(inv.balanceDue ?? 0, profile.defaultCurrency)} open
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleBillAgain(inv.invoiceId)}
                          title="Bill Again (Duplicate)"
                          className="rounded-lg border border-[#E2E7E3] px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                        >
                          <Copy className="mr-1 inline h-3.5 w-3.5 text-[#0F5132]" />
                          Bill Again
                        </button>
                        {inv.status !== "paid" && (
                          <>
                            <button
                              type="button"
                              onClick={() => openPaymentModal(inv)}
                              title="Log Partial or Full Payment"
                              className="rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:border-[#0F5132] hover:bg-[#F5F6F2]"
                            >
                              <DollarSign className="mr-0.5 inline h-3.5 w-3.5 text-[#0F5132]" />
                              Log Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMarkPaid(inv)}
                              title="Mark Paid"
                              className="rounded-lg border border-[#0F5132]/30 bg-[#E8F5EE] px-2.5 py-1.5 text-xs font-semibold text-[#0F5132]"
                            >
                              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                              Paid
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(inv.invoiceId)}
                          title="Archive"
                          className="rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#FFF1F2] hover:text-[#9F1239]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Record Partial / Progress Payment Modal */}
      {paymentModalInvoice && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#101915]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setPaymentModalInvoice(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#F5F6F2]"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="font-serif text-2xl font-bold text-[#101915]">Record Payment</h2>
            <p className="mt-1 text-xs text-[#47554E]">
              {paymentModalInvoice.customerName || "Unnamed Client"} · {paymentModalInvoice.invoiceNumber || "Invoice"} ·{" "}
              <span className="font-mono font-bold text-[#0F5132]">
                {formatMoney(
                  paymentModalInvoice.balanceDue ?? paymentModalInvoice.total ?? 0,
                  profile.defaultCurrency
                )}{" "}
                open
              </span>
            </p>

            <form onSubmit={handleSubmitPartialPayment} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="partial-pay-amount" className="text-xs font-bold text-[#47554E]">
                    Amount Received ($)
                  </label>
                  <div className="flex gap-1">
                    {[
                      { label: "25%", factor: 0.25 },
                      { label: "50%", factor: 0.5 },
                      { label: "Full Balance", factor: 1 }
                    ].map((preset) => {
                      const open = roundToCents(paymentModalInvoice.balanceDue ?? paymentModalInvoice.total ?? 0);
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setPaymentAmount(roundToCents(open * preset.factor).toFixed(2))}
                          className="rounded-md bg-[#F5F6F2] px-2 py-0.5 text-[11px] font-semibold text-[#101915] hover:bg-[#E8F5EE] hover:text-[#0F5132]"
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  id="partial-pay-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#D9E0DC] px-3.5 py-2.5 font-mono text-base font-bold outline-none focus:border-[#0F5132]"
                />
              </div>

              <div>
                <label htmlFor="partial-pay-note" className="block text-xs font-bold text-[#47554E]">
                  Method / Reference Note (optional)
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["e-Transfer", "Cash", "Cheque", "Venmo / Zelle"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentNote(m)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        paymentNote === m
                          ? "border-[#0F5132] bg-[#E8F5EE] text-[#0F5132]"
                          : "border-[#D9E0DC] bg-white text-[#47554E]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  id="partial-pay-note"
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Interac e-Transfer ref #4821"
                  className="mt-2 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-xs outline-none focus:border-[#0F5132]"
                />
              </div>

              <button
                type="submit"
                disabled={paymentBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F5132] py-2.5 text-sm font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{paymentBusy ? "Recording..." : "Record Payment"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Paid Receipt -> 1-Tap Google Review Ask Modal */}
      {reviewAskInvoice && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#101915]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setReviewAskInvoice(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#F5F6F2]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-bold text-[#0F5132]">
              <Star className="h-3.5 w-3.5 fill-current" /> Cash Collected!
            </div>
            <h2 className="mt-3 font-serif text-2xl font-bold text-[#101915]">
              Send Receipt & Ask for a 5-Star Review
            </h2>
            <p className="mt-1 text-xs text-[#47554E]">
              Strike while the client is thrilled — one quick text turns paid jobs into Google reviews.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-[#47554E]">Your Google Business Review Link</label>
              <input
                type="url"
                value={profile.googleReviewUrl}
                onChange={(e) => updateProfile({ ...profile, googleReviewUrl: e.target.value })}
                placeholder="https://g.page/r/your-business/review"
                className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 text-xs outline-none focus:border-[#0F5132]"
              />
            </div>

            <p className="mt-3 rounded-xl bg-[#F5F6F2] p-3 text-xs text-[#101915]">{reviewMessage}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`sms:?&body=${encodeURIComponent(reviewMessage)}`}
                className="flex-1 rounded-xl bg-[#101915] py-2.5 text-center text-xs font-semibold text-white hover:bg-[#0F5132]"
              >
                Text via SMS
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(reviewMessage)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-[#0F5132] py-2.5 text-xs font-semibold text-white hover:bg-[#146C43]"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(reviewMessage);
                  showToast("Receipt & review message copied!", "success");
                }}
                className="rounded-xl border border-[#D9E0DC] px-3.5 py-2.5 text-xs font-semibold text-[#101915]"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
