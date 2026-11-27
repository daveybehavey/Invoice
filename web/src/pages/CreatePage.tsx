import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquareText,
  Package,
  Percent,
  RotateCcw,
  Save,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { useApp } from "../components/AppContext";
import { AppShell } from "../components/AppShell";
import { InvoicePaperSheet } from "../components/InvoicePaperSheet";
import { JobTimerWidget } from "../components/JobTimerWidget";
import { PhotoProofUploader } from "../components/PhotoProofUploader";
import { VoiceMicButton } from "../components/VoiceMicButton";
import {
  AuthRequiredError,
  createClientPortalLink,
  createPaymentLink,
  editInvoiceWithBillie,
  extractUploadDocText,
  extractUploadImageText,
  generateInvoiceFromInput,
  getSavedInvoiceById,
  rewordFullInvoiceApi,
  rewordLineItem,
  saveInvoiceCloud,
  sendInvoiceEmail,
  trackClientRevenueSignal
} from "../lib/api";
import { parseRoughNotesInstant, TRADE_PRESETS } from "../lib/instantParser";
import {
  archiveDraftLocally,
  createEmptyDraft,
  getSavedClients,
  getSavedServices,
  getTradeBundles,
  saveClientFromInvoice
} from "../lib/localStore";
import {
  computeDueDate,
  computeInvoiceTotals,
  formatMoney,
  isLineUnpriced,
  roundToCents,
  syncFinishedInvoiceTotals
} from "../lib/money";
import { exportInvoicePdf } from "../lib/pdfExport";
import type {
  ActiveDraft,
  FinishedInvoice,
  InvoiceThemeId,
  QuoteOption,
  SavedClient,
  TradeBundle
} from "../lib/types";

const THEME_OPTIONS: Array<{ id: InvoiceThemeId; label: string }> = [
  { id: "field_pro", label: "Field Pro" },
  { id: "editorial", label: "Editorial" },
  { id: "bold_trade", label: "Bold Trade" },
  { id: "clean_minimal", label: "Minimal" }
];

type PowerDrawer = "none" | "timer" | "bundles" | "photos" | "markup";

export function CreatePage() {
  const { session, plan, profile, draft, updateDraft, openAuthModal, showToast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mobileTab, setMobileTab] = useState<"notes" | "preview">("notes");
  const [activePowerDrawer, setActivePowerDrawer] = useState<PowerDrawer>("none");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [billieInstruction, setBillieInstruction] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rewordingLineId, setRewordingLineId] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ActiveDraft | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string>("");
  const [decisionInputs, setDecisionInputs] = useState<Record<string, string>>({});

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const savedClients = useMemo(() => getSavedClients(), [draft.updatedAt]);
  const savedServices = useMemo(() => getSavedServices(), [draft.updatedAt]);
  const tradeBundles = useMemo(() => getTradeBundles(), []);

  useEffect(() => {
    const isNew = searchParams.get("new") === "1";
    const id = searchParams.get("id")?.trim();
    if (isNew) {
      const hasContent =
        draft.invoice.lineItems.some((l) => l.description.trim().length > 0) ||
        draft.rawInput.trim().length > 0;
      if (hasContent) {
        archiveDraftLocally(draft);
        showToast("Previous draft saved to Recent Local Drafts.", "info");
      }
      updateDraft(createEmptyDraft(profile));
      setUndoSnapshot(null);
      setLastSavedAt(null);
      setSearchParams({}, { replace: true });
      return;
    }
    if (id && id !== draft.invoiceId) {
      setBusyAction("loading");
      getSavedInvoiceById(id)
        .then((full) => {
          updateDraft({
            invoiceId: full.invoiceId,
            sourceType: full.sourceType,
            rawInput: full.invoiceData.sourceNote || "",
            customerEmail: full.delivery?.recipientEmail || "",
            taxRate: profile.defaultTaxRate,
            paymentTerms: profile.defaultTerms,
            theme: profile.defaultTheme,
            invoice: full.invoiceData.finishedInvoice,
            structuredInvoice: full.invoiceData.structuredInvoice,
            openDecisions: [],
            assumptions: [],
            updatedAt: full.updatedAt
          });
          setSearchParams({}, { replace: true });
        })
        .catch((err) => {
          if (err instanceof AuthRequiredError) {
            openAuthModal("Sign in to open your saved cloud invoice.", `/create?id=${id}`);
          } else {
            showToast(err instanceof Error ? err.message : "Could not load invoice.", "error");
          }
        })
        .finally(() => setBusyAction(null));
    }
  }, [searchParams, setSearchParams, updateDraft, profile, draft.invoiceId, openAuthModal, showToast]);

  const unpricedLines = useMemo(
    () => draft.invoice.lineItems.filter((item) => item.description.trim() && isLineUnpriced(item)),
    [draft.invoice.lineItems]
  );

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        lineItems: draft.invoice.lineItems,
        discountAmount: draft.invoice.discountAmount,
        taxRate: draft.taxRate,
        paymentRecords: draft.invoice.paymentRecords
      }),
    [draft.invoice.lineItems, draft.invoice.discountAmount, draft.taxRate, draft.invoice.paymentRecords]
  );

  const isReadyToSend =
    Boolean(draft.invoice.customerName?.trim()) &&
    draft.invoice.lineItems.some((l) => l.description.trim()) &&
    unpricedLines.length === 0 &&
    totals.total > 0;

  const applyInvoiceUpdate = (transform: (inv: FinishedInvoice) => FinishedInvoice) => {
    updateDraft((prev) => {
      const nextInvoice = transform(prev.invoice);
      const synced = syncFinishedInvoiceTotals(nextInvoice, prev.taxRate);
      const syncedWithDeposit =
        synced.depositPercent && synced.total
          ? { ...synced, depositAmount: roundToCents((synced.total * synced.depositPercent) / 100) }
          : synced;
      return {
        ...prev,
        invoice: syncedWithDeposit,
        openDecisions: prev.openDecisions.filter((d) => {
          if (!d.lineItemId) return true;
          const line = syncedWithDeposit.lineItems.find((l) => l.id === d.lineItemId);
          return line ? isLineUnpriced(line) : false;
        })
      };
    });
  };

  const setInvoice = (nextInvoice: FinishedInvoice) => {
    applyInvoiceUpdate(() => nextInvoice);
  };

  const runInstantBuild = (notesOverride?: string) => {
    const notes = notesOverride ?? draft.rawInput;
    if (!notes.trim()) {
      showToast("Paste or speak a quick job note first.", "warning");
      return;
    }
    const parsed = parseRoughNotesInstant(notes, {
      invoiceNumber: draft.invoice.invoiceNumber,
      currency: draft.invoice.currency || profile.defaultCurrency,
      defaultTaxRate: draft.taxRate,
      defaultTerms: draft.paymentTerms,
      documentType: draft.invoice.documentType,
      defaultMarkupPercent: draft.invoice.materialsMarkupPercent ?? profile.defaultMaterialsMarkupPercent
    });
    updateDraft((prev) => ({
      ...prev,
      rawInput: notes,
      customerEmail: parsed.customerEmail || prev.customerEmail,
      taxRate: parsed.taxRate,
      paymentTerms: parsed.paymentTerms,
      invoice: {
        ...parsed.invoice,
        jobPhotos: prev.invoice.jobPhotos,
        paymentMethods:
          prev.invoice.paymentMethods.length > 0
            ? prev.invoice.paymentMethods
            : (profile.defaultPaymentMethods || []).filter((m) => m.enabled),
        tipEnabled: prev.invoice.tipEnabled ?? profile.defaultTipEnabled,
        cardFeePassThrough: prev.invoice.cardFeePassThrough
      },
      structuredInvoice: parsed.structuredInvoice,
      openDecisions: parsed.openDecisions,
      assumptions: parsed.assumptions
    }));
    showToast(
      parsed.openDecisions.length > 0
        ? `Draft built — ${parsed.openDecisions.length} price check needs your tap.`
        : "Draft built cleanly from your notes.",
      parsed.openDecisions.length > 0 ? "warning" : "success"
    );
  };

  const handleBuildInvoice = async () => {
    const notes = draft.rawInput.trim();
    if (!notes) {
      showToast("Add some rough job notes first, or tap a sample trade preset.", "warning");
      return;
    }

    runInstantBuild(notes);

    if (!session) {
      return;
    }

    setBusyAction("billie_parse");
    try {
      const res = await generateInvoiceFromInput({ messyInput: notes, mode: "full" });
      if (res.invoice) {
        updateDraft((prev) => ({
          ...prev,
          invoice: syncFinishedInvoiceTotals(
            {
              ...res.invoice!,
              jobPhotos: prev.invoice.jobPhotos,
              paymentMethods: prev.invoice.paymentMethods,
              tipEnabled: prev.invoice.tipEnabled,
              cardFeePassThrough: prev.invoice.cardFeePassThrough
            },
            prev.taxRate
          ),
          structuredInvoice: res.structuredInvoice,
          openDecisions: res.openDecisions || [],
          assumptions: res.assumptions || []
        }));
        showToast("Billie AI structured your invoice.", "success");
      } else if (res.followUp) {
        updateDraft((prev) => ({
          ...prev,
          structuredInvoice: res.structuredInvoice,
          openDecisions: res.openDecisions || []
        }));
        showToast(res.followUp, "info");
      }
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) {
        showToast(err instanceof Error ? err.message : "Using live local draft.", "info");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>, kind: "photo" | "doc") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (kind === "photo" && !session) {
      openAuthModal("Sign in to extract text from receipt or handwritten job-note photos.", "/create");
      return;
    }

    setBusyAction("upload");
    try {
      if (kind === "photo") {
        const res = await extractUploadImageText(file);
        const merged = [draft.rawInput.trim(), res.extractedText].filter(Boolean).join("\n");
        runInstantBuild(merged);
      } else {
        const res = await extractUploadDocText(file);
        const merged = [draft.rawInput.trim(), res.extractedText].filter(Boolean).join("\n");
        updateDraft((prev) => ({ ...prev, sourceType: "upload" }));
        runInstantBuild(merged);
      }
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal("Sign in to extract text from uploaded images or files.", "/create");
      } else {
        showToast(err instanceof Error ? err.message : "Could not read uploaded file.", "error");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const resolveLinePrice = (lineId: string, choice: "custom" | "rate" | "included" | "remove", amount?: number) => {
    if (choice === "remove") {
      setInvoice({
        ...draft.invoice,
        lineItems: draft.invoice.lineItems.filter((l) => l.id !== lineId)
      });
      return;
    }
    const nextLines = draft.invoice.lineItems.map((l) => {
      if (l.id !== lineId) return l;
      if (choice === "included") {
        return { ...l, unitPrice: 0, amount: 0, quantity: l.quantity ?? 1, explicitFree: true };
      }
      const val = amount ?? Number.parseFloat(decisionInputs[lineId] || "");
      if (!Number.isFinite(val) || val < 0) return l;
      if (choice === "rate" && typeof l.quantity === "number" && l.quantity > 0) {
        return {
          ...l,
          unitPrice: val,
          amount: Math.round(l.quantity * val * 100) / 100,
          explicitFree: false
        };
      }
      return {
        ...l,
        quantity: l.quantity ?? 1,
        unitPrice: val,
        amount: Math.round((l.quantity ?? 1) * val * 100) / 100,
        explicitFree: false
      };
    });
    setInvoice({ ...draft.invoice, lineItems: nextLines });
  };

  const handleAddBundle = (bundle: TradeBundle) => {
    setInvoice({
      ...draft.invoice,
      lineItems: [
        ...draft.invoice.lineItems,
        {
          id: `bnd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          type: bundle.type,
          description: bundle.description,
          quantity: bundle.quantity,
          unitPrice: bundle.unitPrice,
          amount: roundToCents(bundle.quantity * bundle.unitPrice)
        }
      ]
    });
    showToast(`Added "${bundle.name}" (${formatMoney(bundle.quantity * bundle.unitPrice, draft.invoice.currency)})`, "success");
  };

  const handleApplyMaterialsMarkup = (nextPct: number) => {
    const prevPct = draft.invoice.materialsMarkupPercent ?? 0;
    const prevFactor = 1 + prevPct / 100;
    const nextFactor = 1 + nextPct / 100;
    const updatedLines = draft.invoice.lineItems.map((l) => {
      if (l.type !== "material" || l.explicitFree) return l;
      const baseUnit =
        typeof l.unitPrice === "number"
          ? l.unitPrice / prevFactor
          : typeof l.amount === "number"
            ? l.amount / prevFactor / (l.quantity || 1)
            : undefined;
      if (baseUnit === undefined) return l;
      const newUnit = roundToCents(baseUnit * nextFactor);
      const qty = l.quantity ?? 1;
      return {
        ...l,
        unitPrice: newUnit,
        amount: roundToCents(qty * newUnit)
      };
    });
    setInvoice({
      ...draft.invoice,
      materialsMarkupPercent: nextPct > 0 ? nextPct : undefined,
      lineItems: updatedLines
    });
    showToast(nextPct > 0 ? `Applied +${nextPct}% materials markup.` : "Reset materials markup to 0%.", "info");
  };

  const handleGenerateTieredQuote = () => {
    const base = totals.total > 0 ? totals.total : 250;
    const options: QuoteOption[] = [
      {
        id: "tier_good",
        tier: "good",
        label: "Standard Repair",
        description: "Core repair & standard parts",
        amount: roundToCents(base)
      },
      {
        id: "tier_better",
        tier: "better",
        label: "Full Replacement",
        description: "Upgraded parts + 1-yr workmanship warranty",
        amount: roundToCents(base * 1.35),
        recommended: true
      },
      {
        id: "tier_best",
        tier: "best",
        label: "Premium + Care Plan",
        description: "Priority service + 3-yr full warranty",
        amount: roundToCents(base * 1.7)
      }
    ];
    setInvoice({
      ...draft.invoice,
      documentType: "estimate",
      quoteOptions: options
    });
    showToast("Added Good / Better / Best tiered quote options!", "success");
  };

  const handleConvertQuoteToInvoice = (mode: "deposit" | "final") => {
    const current = draft.invoice;
    if (mode === "deposit") {
      const pct = current.depositPercent || 30;
      const depAmt = roundToCents((totals.total * pct) / 100);
      setInvoice({
        ...current,
        documentType: "invoice",
        depositPercent: undefined,
        depositAmount: undefined,
        quoteOptions: undefined,
        lineItems: [
          {
            id: `dep_${Date.now().toString(36)}`,
            type: "other",
            description: `${pct}% Project Deposit (${current.invoiceNumber || "Quote"})`,
            quantity: 1,
            unitPrice: depAmt,
            amount: depAmt
          }
        ],
        notes: `Deposit invoice (${pct}% of ${formatMoney(totals.total, current.currency)}). Remaining balance due upon completion.`
      });
      showToast(`Converted quote into ${pct}% Deposit Invoice.`, "success");
      return;
    }
    setInvoice({
      ...current,
      documentType: "invoice",
      quoteOptions: undefined,
      depositPercent: undefined,
      depositAmount: undefined
    });
    showToast("Converted Quote to Final Invoice!", "success");
  };

  const applyClientMemory = (client: SavedClient) => {
    const newLines =
      client.lastServices.length > 0
        ? client.lastServices.map((s, idx) => ({
            id: `mem_${Date.now().toString(36)}_${idx}`,
            type: s.type,
            description: s.description,
            quantity: s.quantity ?? 1,
            unitPrice: s.unitPrice,
            amount: s.amount
          }))
        : draft.invoice.lineItems;

    updateDraft((prev) => ({
      ...prev,
      customerEmail: client.email || prev.customerEmail,
      invoice: syncFinishedInvoiceTotals(
        {
          ...prev.invoice,
          customerName: client.name,
          lineItems: newLines
        },
        prev.taxRate
      )
    }));
    showToast(`Loaded ${client.name}'s last job setup.`, "success");
  };

  const handleToneRewrite = async (tone: string) => {
    if (!session) {
      openAuthModal("Sign in to rewrite invoice wording with Billie AI (numbers stay 100% locked).", "/create");
      return;
    }
    if (draft.invoice.lineItems.length === 0) {
      showToast("Add at least one line item first.", "warning");
      return;
    }
    setUndoSnapshot(draft);
    setBusyAction("reword");
    try {
      const res = await rewordFullInvoiceApi(syncFinishedInvoiceTotals(draft.invoice, draft.taxRate), tone);
      setInvoice(res.invoice);
      showToast(`Polished in ${tone} tone — numbers unchanged.`, "success");
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal(err.message, "/create");
      } else {
        showToast(err instanceof Error ? err.message : "Could not rewrite invoice.", "error");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleBillieInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    const instruction = billieInstruction.trim();
    if (!instruction) return;
    if (!session) {
      openAuthModal("Sign in to use Billie safe-wording edits.", "/create");
      return;
    }
    setUndoSnapshot(draft);
    setBusyAction("billie_edit");
    trackClientRevenueSignal("billie_workspace_instruction_submitted", "v3_create");
    try {
      const res = await editInvoiceWithBillie(
        syncFinishedInvoiceTotals(draft.invoice, draft.taxRate),
        instruction
      );
      setInvoice(res.invoice);
      setBillieInstruction("");
      showToast(res.followUp || "Applied wording update — numbers unchanged.", "success");
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal(err.message, "/create");
      } else {
        showToast(err instanceof Error ? err.message : "Billie edit failed.", "error");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRewordSingleLine = async (lineId: string) => {
    if (!session) {
      openAuthModal("Sign in to polish line-item wording with Billie AI.", "/create");
      return;
    }
    setUndoSnapshot(draft);
    setRewordingLineId(lineId);
    try {
      const res = await rewordLineItem(syncFinishedInvoiceTotals(draft.invoice, draft.taxRate), lineId);
      setInvoice(res.invoice);
      showToast("Line polished — price unchanged.", "success");
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal(err.message, "/create");
      } else {
        showToast(err instanceof Error ? err.message : "Could not reword line.", "error");
      }
    } finally {
      setRewordingLineId(null);
    }
  };

  const handleSaveCloud = async (): Promise<string | null> => {
    const cleanedLines = draft.invoice.lineItems.filter((l) => l.description.trim().length > 0);
    if (cleanedLines.length === 0) {
      showToast("Add at least one line item before saving.", "warning");
      return null;
    }

    const finished = syncFinishedInvoiceTotals({ ...draft.invoice, lineItems: cleanedLines }, draft.taxRate);
    saveClientFromInvoice(finished, draft.customerEmail);

    if (!session) {
      openAuthModal("Sign in to save this invoice to your cloud library and unlock sending & payment links.", "/create");
      return null;
    }

    setBusyAction("save");
    try {
      const res = await saveInvoiceCloud({
        invoiceId: draft.invoiceId,
        sourceType: draft.sourceType,
        structuredInvoice: draft.structuredInvoice || {
          customerName: finished.customerName,
          invoiceNumber: finished.invoiceNumber,
          issueDate: finished.issueDate,
          dueDate: finished.dueDate,
          workSessions: [],
          materials: [],
          notes: finished.notes
        },
        finishedInvoice: finished,
        sourceNote: draft.rawInput || undefined
      });
      updateDraft((prev) => ({
        ...prev,
        invoiceId: res.invoice.invoiceId,
        invoice: res.invoice.invoiceData.finishedInvoice
      }));
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      showToast("Saved to your cloud Jobs library.", "success");
      return res.invoice.invoiceId;
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        openAuthModal("Sign in to save to your cloud library.", "/create");
      } else {
        showToast(err instanceof Error ? err.message : "Save failed.", "error");
      }
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenSendModal = async () => {
    if (!isReadyToSend) {
      showToast("Add client name and resolve all item prices before sending.", "warning");
      return;
    }
    if (!session) {
      openAuthModal("Sign in to email invoices, create Stripe payment links, or share a client portal.", "/create");
      return;
    }
    if (!draft.invoiceId) {
      const savedId = await handleSaveCloud();
      if (!savedId) return;
    }
    setSendModalOpen(true);
  };

  const handleCreatePayLink = async () => {
    if (!draft.invoiceId) return;
    setBusyAction("paylink");
    try {
      const res = await createPaymentLink(draft.invoiceId);
      updateDraft((prev) => ({ ...prev, invoice: res.invoice.invoiceData.finishedInvoice }));
      showToast("Stripe payment link created!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create Stripe payment link.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePortal = async () => {
    if (!draft.invoiceId) return;
    setBusyAction("portal");
    try {
      const res = await createClientPortalLink(draft.invoiceId);
      setPortalUrl(res.clientPortalUrl);
      await navigator.clipboard?.writeText(res.clientPortalUrl).catch(() => undefined);
      showToast("Client portal link copied to clipboard!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create portal link.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendEmail = async () => {
    if (!draft.invoiceId) return;
    const recipient = draft.customerEmail.trim();
    if (!recipient) {
      showToast("Enter the client's email address first.", "warning");
      return;
    }
    setBusyAction("email");
    try {
      const res = await sendInvoiceEmail(draft.invoiceId, recipient);
      updateDraft((prev) => ({ ...prev, invoice: res.invoice.invoiceData.finishedInvoice }));
      showToast(
        res.warning || `Invoice emailed to ${recipient}!`,
        res.warning ? "warning" : "success"
      );
      setSendModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send email.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const smsShareText = `Hi ${draft.invoice.customerName || "there"}, here is your ${
    draft.invoice.documentType === "estimate" ? "quote" : "invoice"
  } ${draft.invoice.invoiceNumber || ""} for ${formatMoney(totals.total, draft.invoice.currency)} from ${
    profile.businessName || "NoteBill"
  }.${draft.invoice.paymentLinkUrl ? ` Pay online: ${draft.invoice.paymentLinkUrl}` : ""}${
    portalUrl ? ` View & approve: ${portalUrl}` : ""
  }`;

  const togglePowerDrawer = (drawer: PowerDrawer) => {
    setActivePowerDrawer((curr) => (curr === drawer ? "none" : drawer));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "Enter") {
        if (busyAction || !draft.rawInput.trim()) return;
        e.preventDefault();
        void handleBuildInvoice();
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (session) {
          void handleSaveCloud();
        } else {
          archiveDraftLocally(draft);
          saveClientFromInvoice(draft.invoice, draft.customerEmail);
          showToast("Saved to Recent Local Drafts on this device.", "success");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyAction, draft, session]);

  const poweredByVisible = plan?.plan !== "pro";

  return (
    <AppShell mode="workspace">
      {/* Mobile segmented switcher */}
      <div className="no-print mb-4 grid grid-cols-2 gap-1 rounded-xl border border-[#E2E7E3] bg-white p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("notes")}
          className={`rounded-lg py-2 text-xs font-bold transition ${
            mobileTab === "notes" ? "bg-[#101915] text-white" : "text-[#47554E]"
          }`}
        >
          Notes & Decisions {unpricedLines.length > 0 ? `(${unpricedLines.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={`rounded-lg py-2 font-mono text-xs font-bold transition ${
            mobileTab === "preview" ? "bg-[#0F5132] text-white" : "text-[#47554E]"
          }`}
        >
          Live {draft.invoice.documentType === "estimate" ? "Quote" : "Invoice"} (
          {formatMoney(totals.total, draft.invoice.currency)})
        </button>
      </div>

      {/* Split-Screen Workbench */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT DOCK */}
        <div className={`no-print space-y-4 lg:col-span-5 ${mobileTab === "preview" ? "hidden lg:block" : ""}`}>
          {/* Mode Bar: Invoice vs Quote/Estimate */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E2E7E3] bg-white px-4 py-2.5 shadow-card">
            <div className="inline-flex rounded-xl bg-[#F5F6F2] p-1">
              {(["invoice", "estimate"] as const).map((docType) => (
                <button
                  key={docType}
                  type="button"
                  onClick={() => setInvoice({ ...draft.invoice, documentType: docType })}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                    draft.invoice.documentType === docType
                      ? "bg-[#101915] text-white"
                      : "text-[#47554E] hover:text-[#101915]"
                  }`}
                >
                  {docType === "invoice" ? "Invoice" : "Quote / Estimate"}
                </button>
              ))}
            </div>

            {draft.invoice.documentType === "estimate" && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleConvertQuoteToInvoice("deposit")}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#0F5132]/30 bg-[#E8F5EE] px-2.5 py-1 text-[11px] font-bold text-[#0F5132] hover:bg-[#0F5132] hover:text-white"
                >
                  <ArrowRightLeft className="h-3 w-3" /> Deposit Inv
                </button>
                <button
                  type="button"
                  onClick={() => handleConvertQuoteToInvoice("final")}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0F5132] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#146C43]"
                >
                  <Check className="h-3 w-3" /> Final Inv
                </button>
              </div>
            )}
          </div>

          {/* 1. Magic Capture Card */}
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0F5132]" />
                <h1 className="text-sm font-bold text-[#101915]">Magic Capture</h1>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  title="Upload receipt or handwritten note photo"
                  className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                >
                  <Camera className="h-3.5 w-3.5 text-[#0F5132]" />
                  <span>Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  title="Import PDF, TXT, or CSV invoice"
                  className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                >
                  <Upload className="h-3.5 w-3.5 text-[#0F5132]" />
                  <span>File</span>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleFileImport(e, "photo")}
                />
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".txt,.csv,.pdf,.md"
                  className="hidden"
                  onChange={(e) => void handleFileImport(e, "doc")}
                />
              </div>
            </div>

            <div className="mt-3">
              <VoiceMicButton
                variant="truck"
                label="Hold / Tap to Dictate Job Note"
                onTranscript={(txt) =>
                  updateDraft((prev) => ({
                    ...prev,
                    rawInput: `${prev.rawInput.trim()} ${txt}`.trim()
                  }))
                }
                onFinished={() => runInstantBuild()}
                onUnsupported={() => showToast("Voice dictation uses Chrome or Safari speech recognition.", "info")}
              />
            </div>

            <textarea
              rows={5}
              aria-label="Job notes input"
              value={draft.rawInput}
              onChange={(e) => updateDraft((prev) => ({ ...prev, rawInput: e.target.value }))}
              placeholder="Paste a messy text thread, job rant, hours, parts, or quote notes..."
              className="mt-3 w-full resize-y rounded-xl border border-[#D9E0DC] bg-[#F5F6F2]/60 p-3.5 text-sm leading-relaxed text-[#101915] outline-none transition focus:border-[#0F5132] focus:bg-white focus:ring-2 focus:ring-[#0F5132]/15"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {TRADE_PRESETS.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => runInstantBuild(p.notes)}
                    className="rounded-lg bg-[#F5F6F2] px-2 py-1 text-[11px] font-semibold text-[#47554E] hover:bg-[#E8F5EE] hover:text-[#0F5132]"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => runInstantBuild(TRADE_PRESETS[4].notes)}
                  className="rounded-lg bg-[#E8F5EE] px-2 py-1 text-[11px] font-semibold text-[#0F5132] hover:bg-[#0F5132] hover:text-white"
                >
                  SMS Paste
                </button>
              </div>

              <button
                type="button"
                disabled={busyAction === "billie_parse" || busyAction === "upload"}
                onClick={() => void handleBuildInvoice()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F5132] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#146C43] disabled:opacity-60"
              >
                {busyAction === "billie_parse" || busyAction === "upload" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{session ? "Build with Billie AI" : "Build Invoice"}</span>
              </button>
            </div>

            {savedClients.length > 0 && (
              <div className="mt-4 border-t border-[#E2E7E3] pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                  Bill Again (Repeat Clients)
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {savedClients.slice(0, 5).map((cli) => (
                    <button
                      key={cli.id}
                      type="button"
                      onClick={() => applyClientMemory(cli)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E7E3] bg-[#F5F6F2] px-2.5 py-1 text-xs font-semibold text-[#101915] hover:border-[#0F5132] hover:bg-[#E8F5EE]"
                    >
                      <span>{cli.name}</span>
                      {cli.lastHourlyRate && (
                        <span className="font-mono text-[10px] text-[#0F5132]">${cli.lastHourlyRate}/hr</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Field Power Tools Strip (Timer, Quick-Bundles, Job Photos, Markup & Quote) */}
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-3.5 shadow-card">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => togglePowerDrawer("timer")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                  activePowerDrawer === "timer"
                    ? "bg-[#101915] text-white"
                    : "bg-[#F5F6F2] text-[#101915] hover:bg-[#E8F5EE]"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Timer</span>
              </button>
              <button
                type="button"
                onClick={() => togglePowerDrawer("bundles")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                  activePowerDrawer === "bundles"
                    ? "bg-[#101915] text-white"
                    : "bg-[#F5F6F2] text-[#101915] hover:bg-[#E8F5EE]"
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Bundles</span>
              </button>
              <button
                type="button"
                onClick={() => togglePowerDrawer("photos")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                  activePowerDrawer === "photos"
                    ? "bg-[#101915] text-white"
                    : "bg-[#F5F6F2] text-[#101915] hover:bg-[#E8F5EE]"
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Photos ({draft.invoice.jobPhotos?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => togglePowerDrawer("markup")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${
                  activePowerDrawer === "markup"
                    ? "bg-[#101915] text-white"
                    : "bg-[#F5F6F2] text-[#101915] hover:bg-[#E8F5EE]"
                }`}
              >
                <Percent className="h-3.5 w-3.5" />
                <span>Markup / Quote</span>
              </button>
            </div>

            {activePowerDrawer === "timer" && (
              <div className="mt-3 border-t border-[#E2E7E3] pt-3">
                <JobTimerWidget
                  defaultHourlyRate={profile.defaultHourlyRate || 95}
                  currency={draft.invoice.currency}
                  onAddTime={({ description, hours, rate }) => {
                    applyInvoiceUpdate((curr) => ({
                      ...curr,
                      lineItems: [
                        ...curr.lineItems,
                        {
                          id: `tm_${Date.now().toString(36)}`,
                          type: "labor",
                          description,
                          quantity: hours,
                          unitPrice: rate,
                          amount: roundToCents(hours * rate)
                        }
                      ]
                    }));
                    showToast(`Added ${hours}h (${formatMoney(hours * rate, draft.invoice.currency)}) to invoice!`, "success");
                  }}
                />
              </div>
            )}

            {activePowerDrawer === "bundles" && (
              <div className="mt-3 border-t border-[#E2E7E3] pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                  1-Tap Trade Quick-Bundles
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {tradeBundles.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleAddBundle(b)}
                      className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/60 px-3 py-2 text-left hover:border-[#0F5132] hover:bg-[#E8F5EE]"
                    >
                      <span className="text-xs font-bold text-[#101915]">+ {b.name}</span>
                      <span className="font-mono text-xs font-semibold text-[#0F5132]">
                        {formatMoney(b.quantity * b.unitPrice, draft.invoice.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePowerDrawer === "photos" && (
              <div className="mt-3 border-t border-[#E2E7E3] pt-3">
                <PhotoProofUploader
                  photos={draft.invoice.jobPhotos || []}
                  onChange={(jobPhotos) => setInvoice({ ...draft.invoice, jobPhotos })}
                />
              </div>
            )}

            {activePowerDrawer === "markup" && (
              <div className="mt-3 space-y-3 border-t border-[#E2E7E3] pt-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                    Materials Markup (Client sees marked-up price)
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[0, 15, 20, 30].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleApplyMaterialsMarkup(pct)}
                        className={`rounded-lg px-3 py-1 font-mono text-xs font-bold ${
                          (draft.invoice.materialsMarkupPercent ?? 0) === pct
                            ? "bg-[#0F5132] text-white"
                            : "border border-[#D9E0DC] bg-white text-[#101915]"
                        }`}
                      >
                        {pct === 0 ? "0%" : `+${pct}%`}
                      </button>
                    ))}
                  </div>
                  <label className="mt-2.5 flex items-center gap-2 text-xs text-[#47554E]">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.invoice.hideMaterialsBreakdown)}
                      onChange={(e) =>
                        setInvoice({ ...draft.invoice, hideMaterialsBreakdown: e.target.checked })
                      }
                      className="rounded border-[#D9E0DC] text-[#0F5132]"
                    />
                    <span>Roll materials into single "Parts & Materials" line on client portal</span>
                  </label>
                </div>

                <div className="border-t border-[#E2E7E3] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                      Deposit & Tiered Quote Options
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateTieredQuote}
                      className="text-xs font-bold text-[#0F5132] hover:underline"
                    >
                      + Good / Better / Best Tiers
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[0, 25, 30, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          setInvoice({
                            ...draft.invoice,
                            depositPercent: pct > 0 ? pct : undefined,
                            depositAmount: pct > 0 ? roundToCents((totals.total * pct) / 100) : undefined
                          })
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          (draft.invoice.depositPercent ?? 0) === pct
                            ? "bg-[#101915] text-white"
                            : "border border-[#D9E0DC] bg-white text-[#47554E]"
                        }`}
                      >
                        {pct === 0 ? "No deposit" : `${pct}% deposit`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Money Decisions Panel */}
          {unpricedLines.length > 0 && (
            <div className="rounded-2xl border-2 border-[#F59E0B] bg-[#FEF3C7]/60 p-5 shadow-card">
              <div className="flex items-center gap-2 text-sm font-bold text-[#B45309]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {unpricedLines.length} {unpricedLines.length === 1 ? "item needs" : "items need"} your price decision
                </span>
              </div>
              <p className="mt-1 text-xs text-[#78350F]">
                NoteBill never silently guesses $0. Confirm a price, apply your default rate, or mark included.
              </p>

              <div className="mt-3 space-y-3">
                {unpricedLines.map((line) => (
                  <div key={line.id} className="rounded-xl border border-[#F59E0B]/40 bg-white p-3">
                    <div className="text-xs font-bold text-[#101915]">{line.description}</div>
                    {typeof line.quantity === "number" && (
                      <div className="text-[11px] text-[#6B7A72]">{line.quantity} hrs logged</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder={line.type === "labor" && line.quantity ? "$/hr" : "$ amount"}
                        value={decisionInputs[line.id] || ""}
                        onChange={(e) =>
                          setDecisionInputs((p) => ({ ...p, [line.id]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-[#D9E0DC] px-2.5 py-1 font-mono text-xs outline-none focus:border-[#0F5132]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          resolveLinePrice(
                            line.id,
                            line.type === "labor" && line.quantity ? "rate" : "custom"
                          )
                        }
                        className="rounded-lg bg-[#0F5132] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#146C43]"
                      >
                        Apply
                      </button>
                      {profile.defaultHourlyRate && line.type === "labor" && (
                        <button
                          type="button"
                          onClick={() =>
                            resolveLinePrice(
                              line.id,
                              line.quantity ? "rate" : "custom",
                              profile.defaultHourlyRate
                            )
                          }
                          className="rounded-lg border border-[#0F5132]/30 bg-[#E8F5EE] px-2.5 py-1 font-mono text-xs font-semibold text-[#0F5132]"
                        >
                          Use ${profile.defaultHourlyRate}/hr
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => resolveLinePrice(line.id, "included")}
                        className="rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1 text-xs font-semibold text-[#47554E] hover:bg-[#F5F6F2]"
                      >
                        Included ($0)
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveLinePrice(line.id, "remove")}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-[#9F1239] hover:bg-[#FFF1F2]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Billie Safe-Wording Co-Pilot */}
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-4 shadow-card">
            <button
              type="button"
              onClick={() => setCopilotOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#0F5132]" />
                <span className="text-sm font-bold text-[#101915]">Billie Wording Co-Pilot</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F5EE] px-2 py-0.5 text-[10px] font-bold text-[#0F5132]">
                  <Lock className="h-2.5 w-2.5" /> Numbers Locked
                </span>
              </div>
              {copilotOpen ? (
                <ChevronUp className="h-4 w-4 text-[#6B7A72]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#6B7A72]" />
              )}
            </button>

            {copilotOpen && (
              <div className="mt-4 space-y-3 border-t border-[#E2E7E3] pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {["Neutral Professional", "Warm & Friendly", "Crisp & Short", "Detailed"].map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      disabled={busyAction === "reword"}
                      onClick={() => void handleToneRewrite(tone)}
                      className="rounded-lg border border-[#D9E0DC] bg-[#F5F6F2] px-2.5 py-1.5 text-xs font-semibold text-[#101915] hover:border-[#0F5132] hover:bg-[#E8F5EE]"
                    >
                      {tone}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleBillieInstruction} className="flex gap-2">
                  <input
                    type="text"
                    value={billieInstruction}
                    onChange={(e) => setBillieInstruction(e.target.value)}
                    placeholder='e.g. "Mention 1-year workmanship warranty"'
                    className="flex-1 rounded-xl border border-[#D9E0DC] px-3 py-2 text-xs outline-none focus:border-[#0F5132]"
                  />
                  <button
                    type="submit"
                    disabled={busyAction === "billie_edit"}
                    className="rounded-xl bg-[#101915] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F5132] disabled:opacity-60"
                  >
                    Apply
                  </button>
                </form>

                {savedServices.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                      Quick-Add Saved Services
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {savedServices.slice(0, 6).map((svc) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() =>
                            setInvoice({
                              ...draft.invoice,
                              lineItems: [
                                ...draft.invoice.lineItems,
                                {
                                  id: `svc_${Date.now().toString(36)}`,
                                  type: svc.type,
                                  description: svc.description,
                                  quantity: svc.defaultQty ?? 1,
                                  unitPrice: svc.defaultRate,
                                  amount:
                                    typeof svc.defaultRate === "number"
                                      ? Math.round((svc.defaultQty ?? 1) * svc.defaultRate * 100) / 100
                                      : undefined
                                }
                              ]
                            })
                          }
                          className="rounded-lg border border-[#E2E7E3] bg-white px-2.5 py-1 text-[11px] font-medium text-[#47554E] hover:border-[#0F5132] hover:text-[#0F5132]"
                        >
                          + {svc.description}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Terms, Tax, Tips & Payment Methods */}
          <div className="rounded-2xl border border-[#E2E7E3] bg-white p-4 shadow-card">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-bold text-[#101915]">Terms, Tax, Tips & Payment Options</span>
              {detailsOpen ? (
                <ChevronUp className="h-4 w-4 text-[#6B7A72]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#6B7A72]" />
              )}
            </button>

            {detailsOpen && (
              <div className="mt-4 space-y-3 border-t border-[#E2E7E3] pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#6B7A72]">Payment Terms</label>
                    <select
                      value={draft.paymentTerms}
                      onChange={(e) => {
                        const terms = e.target.value as ActiveDraft["paymentTerms"];
                        const issue = draft.invoice.issueDate || new Date().toISOString().slice(0, 10);
                        updateDraft((prev) => ({
                          ...prev,
                          paymentTerms: terms,
                          invoice: {
                            ...prev.invoice,
                            issueDate: issue,
                            dueDate: computeDueDate(issue, terms)
                          }
                        }));
                      }}
                      className="mt-1 w-full rounded-xl border border-[#D9E0DC] bg-white px-3 py-2 text-xs font-semibold text-[#101915]"
                    >
                      <option value="due_on_receipt">Due on receipt</option>
                      <option value="net_7">Net 7 days</option>
                      <option value="net_15">Net 15 days</option>
                      <option value="net_30">Net 30 days</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-[#6B7A72]">Tax %</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="30"
                      value={draft.taxRate}
                      onChange={(e) => {
                        const rate = Math.max(0, Number.parseFloat(e.target.value) || 0);
                        updateDraft((prev) => ({
                          ...prev,
                          taxRate: rate,
                          invoice: syncFinishedInvoiceTotals(prev.invoice, rate)
                        }));
                      }}
                      className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-xs"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-[#6B7A72]">Discount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.invoice.discountAmount ?? ""}
                      placeholder="0.00"
                      onChange={(e) =>
                        setInvoice({
                          ...draft.invoice,
                          discountAmount: e.target.value === "" ? undefined : Number(e.target.value)
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-[#D9E0DC] px-3 py-2 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#101915]">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.invoice.tipEnabled)}
                      onChange={(e) => setInvoice({ ...draft.invoice, tipEnabled: e.target.checked })}
                      className="rounded border-[#D9E0DC] text-[#0F5132]"
                    />
                    <span>Show optional Tip picker (10% / 15% / 20%) on Client Portal</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#101915]">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.invoice.cardFeePassThrough)}
                      onChange={(e) =>
                        setInvoice({ ...draft.invoice, cardFeePassThrough: e.target.checked })
                      }
                      className="rounded border-[#D9E0DC] text-[#0F5132]"
                    />
                    <span>Note 2.9% card convenience fee estimate on invoice</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT CANVAS */}
        <div className={`lg:col-span-7 ${mobileTab === "notes" ? "hidden lg:block" : ""}`}>
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E2E7E3] bg-white px-4 py-2.5 shadow-card">
            <div className="flex flex-wrap items-center gap-1.5">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateDraft((prev) => ({ ...prev, theme: t.id }))}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    draft.theme === t.id
                      ? "bg-[#101915] text-white"
                      : "text-[#47554E] hover:bg-[#F5F6F2]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {undoSnapshot && (
                <button
                  type="button"
                  onClick={() => {
                    updateDraft(undoSnapshot);
                    setUndoSnapshot(null);
                    showToast("Reverted last Billie edit.", "info");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0DC] px-2.5 py-1 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                >
                  <RotateCcw className="h-3 w-3" /> Undo
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isReadyToSend ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F5EE] px-2.5 py-1 text-xs font-bold text-[#0F5132]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ready to send
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-xs font-bold text-[#B45309]">
                  {unpricedLines.length > 0
                    ? `${unpricedLines.length} price(s) to confirm`
                    : "Add client & line item"}
                </span>
              )}
            </div>
          </div>

          <div className="print-only-container">
            <InvoicePaperSheet
              invoice={draft.invoice}
              profile={profile}
              theme={draft.theme}
              taxRate={draft.taxRate}
              customerEmail={draft.customerEmail}
              poweredByVisible={poweredByVisible}
              onChangeInvoice={setInvoice}
              onChangeCustomerEmail={(customerEmail) =>
                updateDraft((prev) => ({ ...prev, customerEmail }))
              }
              onRewordLine={(lineId) => void handleRewordSingleLine(lineId)}
              rewordingLineId={rewordingLineId}
            />
          </div>

          {/* Action Rail */}
          <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E7E3] bg-white p-4 shadow-card">
            <div className="text-xs text-[#6B7A72]">
              <span>
                {lastSavedAt
                  ? `Cloud saved at ${lastSavedAt}`
                  : session
                    ? "Autosaved on device · Click Save to sync cloud"
                    : "Autosaved on device"}
              </span>
              <span className="ml-2 hidden font-mono text-[11px] text-[#94A39B] sm:inline">
                · Ctrl+S save · Ctrl+Enter build
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  archiveDraftLocally(draft);
                  saveClientFromInvoice(draft.invoice, draft.customerEmail);
                  void exportInvoicePdf({
                    invoice: draft.invoice,
                    profile,
                    customerEmail: draft.customerEmail,
                    theme: draft.theme,
                    poweredByVisible
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0DC] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2]"
              >
                <Download className="h-4 w-4 text-[#0F5132]" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                disabled={busyAction === "save"}
                onClick={() => void handleSaveCloud()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0DC] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#101915] hover:bg-[#F5F6F2] disabled:opacity-60"
              >
                {busyAction === "save" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 text-[#0F5132]" />
                )}
                <span>{draft.invoiceId ? "Update" : "Save"}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleOpenSendModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F5132] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-[#146C43]"
              >
                <Send className="h-4 w-4" />
                <span>Send & Get Paid</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Send & Get Paid Modal */}
      {sendModalOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#101915]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-[#E2E7E3] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setSendModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-[#6B7A72] hover:bg-[#F5F6F2]"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="font-serif text-2xl font-bold text-[#101915]">
              {draft.invoice.documentType === "estimate" ? "Send Quote for Approval" : "Send & Get Paid"}
            </h2>
            <p className="mt-1 text-xs text-[#47554E]">
              {draft.invoice.invoiceNumber} ·{" "}
              <span className="font-mono font-bold text-[#0F5132]">
                {formatMoney(totals.total, draft.invoice.currency)}
              </span>
            </p>

            <div className="mt-5 space-y-4">
              {/* Stripe Pay Link & Client Portal */}
              <div className="space-y-3 rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/70 p-4">
                {draft.invoice.documentType === "invoice" && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#101915]">1-Tap Stripe Pay Link</div>
                      <div className="text-[11px] text-[#6B7A72]">
                        Attach a hosted card / Apple Pay checkout link.
                      </div>
                    </div>
                    {draft.invoice.paymentLinkUrl ? (
                      <a
                        href={draft.invoice.paymentLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#E8F5EE] px-2.5 py-1 text-xs font-bold text-[#0F5132]"
                      >
                        <Check className="h-3.5 w-3.5" /> Active <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction === "paylink"}
                        onClick={() => void handleCreatePayLink()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#101915] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F5132]"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>{busyAction === "paylink" ? "Creating..." : "Create Pay Link"}</span>
                      </button>
                    )}
                  </div>
                )}

                <div
                  className={`flex flex-wrap items-center justify-between gap-2 ${
                    draft.invoice.documentType === "invoice" ? "border-t border-[#E2E7E3] pt-3" : ""
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-[#101915]">Client Portal Link</div>
                    <div className="text-[11px] text-[#6B7A72]">
                      {draft.invoice.documentType === "estimate"
                        ? "Client views photos, picks tier & taps Approve & Sign."
                        : "Client views photos, pays by Stripe or e-Transfer/Venmo."}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === "portal"}
                    onClick={() => void handleCreatePortal()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9E0DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#101915] hover:bg-[#F5F6F2]"
                  >
                    <Copy className="h-3.5 w-3.5 text-[#0F5132]" />
                    <span>{portalUrl ? "Copy Portal Link" : "Generate & Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Email Send */}
              <div>
                <label className="block text-xs font-bold text-[#47554E]">Email directly to client</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="email"
                    value={draft.customerEmail}
                    onChange={(e) => updateDraft((prev) => ({ ...prev, customerEmail: e.target.value }))}
                    placeholder="client@email.com"
                    className="flex-1 rounded-xl border border-[#D9E0DC] px-3 py-2 text-sm outline-none focus:border-[#0F5132]"
                  />
                  <button
                    type="button"
                    disabled={busyAction === "email"}
                    onClick={() => void handleSendEmail()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F5132] px-4 py-2 text-sm font-semibold text-white hover:bg-[#146C43] disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    <span>{busyAction === "email" ? "Sending..." : "Send Email"}</span>
                  </button>
                </div>
              </div>

              {/* 1-Tap SMS / WhatsApp / Share */}
              <div className="space-y-2.5 border-t border-[#E2E7E3] pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#47554E]">
                    <MessageSquareText className="h-3.5 w-3.5 text-[#0F5132]" /> Text / WhatsApp Share
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={`sms:?&body=${encodeURIComponent(smsShareText)}`}
                      className="rounded-lg bg-[#101915] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0F5132]"
                    >
                      Text SMS
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(smsShareText)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0F5132] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#146C43]"
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                    {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                      <button
                        type="button"
                        onClick={() =>
                          void navigator
                            .share({ title: `Invoice ${draft.invoice.invoiceNumber}`, text: smsShareText })
                            .catch(() => undefined)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1 text-xs font-semibold text-[#101915]"
                      >
                        <Share2 className="h-3 w-3" /> Share
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(smsShareText);
                        showToast("Message copied to clipboard!", "success");
                      }}
                      className="text-xs font-semibold text-[#0F5132] hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <p className="rounded-xl bg-[#F5F6F2] p-3 text-xs text-[#47554E]">{smsShareText}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
