import { CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { computeInvoiceTotals, formatMoney, isLineUnpriced, resolveLineAmount, roundToCents } from "../lib/money";
import type {
  BusinessProfile,
  FinishedInvoice,
  InvoiceLineItem,
  InvoiceThemeId,
  LineItemType
} from "../lib/types";

interface InvoicePaperSheetProps {
  invoice: FinishedInvoice;
  profile: BusinessProfile;
  theme?: InvoiceThemeId;
  taxRate?: number;
  customerEmail?: string;
  readOnly?: boolean;
  poweredByVisible?: boolean;
  selectedQuoteOptionId?: string;
  onSelectQuoteOption?: (optionId: string) => void;
  onChangeInvoice?: (next: FinishedInvoice) => void;
  onChangeCustomerEmail?: (email: string) => void;
  onRewordLine?: (lineId: string) => void;
  rewordingLineId?: string | null;
}

const THEME_STYLES: Record<
  InvoiceThemeId,
  {
    headerBg: string;
    headerText: string;
    accentText: string;
    badgeBg: string;
    tableHead: string;
  }
> = {
  field_pro: {
    headerBg: "border-b-2 border-[#0F5132] pb-5",
    headerText: "text-[#101915]",
    accentText: "text-[#0F5132]",
    badgeBg: "bg-[#E8F5EE] text-[#0F5132]",
    tableHead: "bg-[#F5F6F2] text-[#47554E]"
  },
  editorial: {
    headerBg: "border-b border-[#D9E0DC] pb-5",
    headerText: "text-[#101915]",
    accentText: "text-[#101915]",
    badgeBg: "bg-[#101915] text-white",
    tableHead: "border-b border-[#101915] bg-transparent text-[#101915]"
  },
  bold_trade: {
    headerBg: "rounded-t-xl -mx-6 -mt-6 px-6 py-5 mb-5 bg-[#101915] text-white",
    headerText: "text-white",
    accentText: "text-[#0F5132]",
    badgeBg: "bg-white/15 text-white",
    tableHead: "bg-[#101915] text-white"
  },
  clean_minimal: {
    headerBg: "border-b border-[#E2E7E3] pb-4",
    headerText: "text-[#101915]",
    accentText: "text-[#47554E]",
    badgeBg: "bg-[#F5F6F2] text-[#47554E]",
    tableHead: "border-b border-[#E2E7E3] bg-transparent text-[#6B7A72]"
  }
};

export function InvoicePaperSheet({
  invoice,
  profile,
  theme = "field_pro",
  taxRate = 0,
  customerEmail,
  readOnly = false,
  poweredByVisible = false,
  selectedQuoteOptionId,
  onSelectQuoteOption,
  onChangeInvoice,
  onChangeCustomerEmail,
  onRewordLine,
  rewordingLineId
}: InvoicePaperSheetProps) {
  const styles = THEME_STYLES[theme] || THEME_STYLES.field_pro;

  // When readOnly and lump-sum hide is active, roll material lines into a single clean line for client display.
  const displayLines = (() => {
    if (!readOnly || !invoice.hideMaterialsBreakdown) {
      return invoice.lineItems;
    }
    const materials = invoice.lineItems.filter((l) => l.type === "material" && l.description.trim());
    if (materials.length <= 1) {
      return invoice.lineItems;
    }
    const others = invoice.lineItems.filter((l) => l.type !== "material");
    const matTotal = roundToCents(materials.reduce((sum, item) => sum + resolveLineAmount(item), 0));
    const bundled: InvoiceLineItem = {
      id: "lump_materials",
      type: "material",
      description: "Parts & Materials",
      quantity: 1,
      unitPrice: matTotal,
      amount: matTotal
    };
    return [...others, bundled];
  })();

  const totals = computeInvoiceTotals({
    lineItems: invoice.lineItems,
    discountAmount: invoice.discountAmount,
    taxRate,
    paymentRecords: invoice.paymentRecords
  });

  const cardFeeAmount = invoice.cardFeePassThrough ? roundToCents(totals.balanceDue * 0.029) : 0;
  const enabledPaymentMethods = (invoice.paymentMethods || []).filter(
    (m) => m.enabled !== false && (m.label || m.details)
  );

  const updateLine = (lineId: string, patch: Partial<InvoiceLineItem>) => {
    if (!onChangeInvoice) return;
    const nextItems = invoice.lineItems.map((item) => {
      if (item.id !== lineId) return item;
      const updated: InvoiceLineItem = { ...item, ...patch };
      if ("quantity" in patch || "unitPrice" in patch) {
        if (
          typeof updated.quantity === "number" &&
          Number.isFinite(updated.quantity) &&
          typeof updated.unitPrice === "number" &&
          Number.isFinite(updated.unitPrice)
        ) {
          updated.amount = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
          updated.explicitFree = false;
        }
      }
      return updated;
    });
    onChangeInvoice({ ...invoice, lineItems: nextItems });
  };

  const removeLine = (lineId: string) => {
    if (!onChangeInvoice) return;
    onChangeInvoice({
      ...invoice,
      lineItems: invoice.lineItems.filter((item) => item.id !== lineId)
    });
  };

  const addLine = (type: LineItemType = "labor") => {
    if (!onChangeInvoice) return;
    const id = `line_${Date.now().toString(36)}`;
    onChangeInvoice({
      ...invoice,
      lineItems: [
        ...invoice.lineItems,
        {
          id,
          type,
          description: "",
          quantity: 1,
          unitPrice: type === "labor" && profile.defaultHourlyRate ? profile.defaultHourlyRate : undefined
        }
      ]
    });
  };

  return (
    <div
      id="notebill-invoice-sheet"
      className="rounded-2xl border border-[#D9E0DC] bg-white p-6 shadow-paper sm:p-8"
    >
      {/* Header */}
      <div className={`flex flex-col justify-between gap-4 sm:flex-row sm:items-start ${styles.headerBg}`}>
        <div className="flex items-start gap-3.5">
          {profile.logoDataUrl && (
            <img
              src={profile.logoDataUrl}
              alt={profile.businessName}
              className="h-12 w-12 rounded-lg border border-black/10 bg-white object-contain p-1"
            />
          )}
          <div>
            <div className={`text-lg font-bold ${styles.headerText}`}>
              {profile.businessName || "Your Business"}
            </div>
            <div
              className={`mt-0.5 space-y-0.5 text-xs ${
                theme === "bold_trade" ? "text-white/75" : "text-[#6B7A72]"
              }`}
            >
              {profile.address && <div>{profile.address}</div>}
              {(profile.phone || profile.email) && (
                <div>{[profile.phone, profile.email].filter(Boolean).join(" · ")}</div>
              )}
              {profile.taxIdValue && (
                <div>
                  {profile.taxIdLabel || "Tax ID"}: {profile.taxIdValue}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:text-right">
          <div
            className={`inline-block rounded-md px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles.badgeBg}`}
          >
            {invoice.documentType === "estimate" ? "Quote / Estimate" : "Invoice"}
          </div>
          <div className={`mt-1.5 font-mono text-base font-semibold ${styles.headerText}`}>
            {readOnly ? (
              invoice.invoiceNumber || "INV-DRAFT"
            ) : (
              <input
                type="text"
                aria-label="Invoice number"
                value={invoice.invoiceNumber || ""}
                onChange={(e) => onChangeInvoice?.({ ...invoice, invoiceNumber: e.target.value })}
                className="w-36 rounded border border-transparent bg-transparent font-mono text-sm font-semibold sm:text-right outline-none focus:border-[#0F5132] focus:bg-white focus:px-1.5 focus:text-[#101915]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Bill To & Dates */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">Bill To</div>
          {readOnly ? (
            <div className="mt-1 text-base font-semibold text-[#101915]">
              {invoice.customerName || "Client Name"}
            </div>
          ) : (
            <div className="mt-1 space-y-1">
              <input
                type="text"
                aria-label="Client name"
                value={invoice.customerName || ""}
                onChange={(e) => onChangeInvoice?.({ ...invoice, customerName: e.target.value })}
                placeholder="Client or company name"
                className="w-full rounded-lg border border-transparent bg-[#F5F6F2]/70 px-2.5 py-1.5 text-sm font-semibold text-[#101915] outline-none transition hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
              />
              {onChangeCustomerEmail && (
                <input
                  type="email"
                  aria-label="Client email"
                  value={customerEmail || ""}
                  onChange={(e) => onChangeCustomerEmail(e.target.value)}
                  placeholder="client@email.com (optional)"
                  className="w-full rounded-lg border border-transparent px-2.5 py-1 text-xs text-[#47554E] outline-none transition hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
                />
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:text-right">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">Issued</div>
            {readOnly ? (
              <div className="mt-1 font-mono text-xs font-medium text-[#101915]">
                {invoice.issueDate || "Today"}
              </div>
            ) : (
              <input
                type="date"
                aria-label="Issue date"
                value={invoice.issueDate || ""}
                onChange={(e) => onChangeInvoice?.({ ...invoice, issueDate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#E2E7E3] px-2 py-1 font-mono text-xs text-[#101915] outline-none focus:border-[#0F5132]"
              />
            )}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
              {invoice.documentType === "estimate" ? "Valid Until" : "Due Date"}
            </div>
            {readOnly ? (
              <div className="mt-1 font-mono text-xs font-medium text-[#101915]">
                {invoice.dueDate || "Upon receipt"}
              </div>
            ) : (
              <input
                type="date"
                aria-label="Due date"
                value={invoice.dueDate || ""}
                onChange={(e) => onChangeInvoice?.({ ...invoice, dueDate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#E2E7E3] px-2 py-1 font-mono text-xs text-[#101915] outline-none focus:border-[#0F5132]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Good / Better / Best Tiered Quote Options */}
      {invoice.documentType === "estimate" && invoice.quoteOptions && invoice.quoteOptions.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
            Quote Options
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {invoice.quoteOptions.map((opt) => {
              const selected = selectedQuoteOptionId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!onSelectQuoteOption}
                  onClick={() => onSelectQuoteOption?.(opt.id)}
                  className={`rounded-xl border p-3.5 text-left transition ${
                    selected
                      ? "border-[#0F5132] bg-[#E8F5EE]/70 ring-2 ring-[#0F5132]/20"
                      : opt.recommended
                        ? "border-[#0F5132]/40 bg-white"
                        : "border-[#E2E7E3] bg-[#F5F6F2]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F5132]">
                      {opt.tier}
                    </span>
                    {opt.recommended && (
                      <span className="rounded-full bg-[#0F5132] px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-bold text-[#101915]">{opt.label}</div>
                  {opt.description && (
                    <div className="mt-0.5 text-xs text-[#6B7A72]">{opt.description}</div>
                  )}
                  <div className="mt-2 font-mono text-base font-bold tabular-nums text-[#101915]">
                    {formatMoney(opt.amount, invoice.currency)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Line Items: Mobile Cards (<sm, hidden on print) + Desktop/Print Table */}
      <div className="mt-6">
        {!readOnly && displayLines.length > 0 && (
          <div className="no-print space-y-3 sm:hidden">
            {displayLines.map((item) => {
              const unpriced = isLineUnpriced(item);
              const amount = resolveLineAmount(item);
              return (
                <div
                  key={`mob_${item.id}`}
                  className={`rounded-xl border p-3 ${
                    unpriced ? "border-[#F59E0B] bg-[#FEF3C7]/40" : "border-[#E2E7E3] bg-[#F5F6F2]/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-[#E8F5EE] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#0F5132]">
                      {item.type}
                    </span>
                    <div className="flex items-center gap-1">
                      {onRewordLine && item.description.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => onRewordLine(item.id)}
                          disabled={rewordingLineId === item.id}
                          className="rounded p-1 text-[#0F5132]"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeLine(item.id)}
                        className="rounded p-1 text-[#6B7A72] hover:text-[#9F1239]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLine(item.id, { description: e.target.value })}
                    placeholder="Work or material description"
                    className="mt-2 w-full rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-sm font-medium text-[#101915]"
                  />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-[#6B7A72]">Qty</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.quantity ?? ""}
                        onChange={(e) =>
                          updateLine(item.id, {
                            quantity: e.target.value === "" ? undefined : Number(e.target.value),
                            amount: undefined
                          })
                        }
                        className="mt-0.5 w-full rounded-lg border border-[#D9E0DC] bg-white px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-[#6B7A72]">Rate</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.unitPrice ?? ""}
                        onChange={(e) =>
                          updateLine(item.id, {
                            unitPrice: e.target.value === "" ? undefined : Number(e.target.value),
                            amount: undefined
                          })
                        }
                        className="mt-0.5 w-full rounded-lg border border-[#D9E0DC] bg-white px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-[#6B7A72]">Amount</span>
                      <div className="mt-1.5 font-mono text-sm font-bold text-[#101915]">
                        {unpriced ? (
                          <span className="text-xs text-[#B45309]">TBD</span>
                        ) : item.explicitFree ? (
                          <span className="text-xs text-[#0F5132]">Included</span>
                        ) : (
                          formatMoney(amount, invoice.currency)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          className={`overflow-x-auto ${
            !readOnly && displayLines.length > 0 ? "hidden sm:block print:block" : ""
          }`}
        >
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={`rounded-lg text-[11px] font-bold uppercase tracking-wider ${styles.tableHead}`}>
                <th className="rounded-l-lg px-3 py-2.5">Description</th>
                <th className="w-20 px-2 py-2.5 text-right">Qty</th>
                <th className="w-24 px-2 py-2.5 text-right">Rate</th>
                <th className="w-28 rounded-r-lg px-3 py-2.5 text-right">Amount</th>
                {!readOnly && <th className="w-16 px-1 py-2.5 no-print" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E7E3]/70">
              {displayLines.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} className="py-8 text-center text-sm text-[#6B7A72]">
                    No line items yet. Type job notes on the left or tap <strong>+ Add line</strong> below.
                  </td>
                </tr>
              ) : (
                displayLines.map((item) => {
                  const unpriced = isLineUnpriced(item);
                  const amount = resolveLineAmount(item);
                  return (
                    <tr key={item.id} className={unpriced ? "bg-[#FEF3C7]/35" : ""}>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              item.type === "labor"
                                ? "bg-[#E8F5EE] text-[#0F5132]"
                                : item.type === "material"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {item.type}
                          </span>
                          {readOnly ? (
                            <div>
                              <div className="text-sm font-medium text-[#101915]">{item.description}</div>
                              {unpriced && (
                                <span className="mt-1 inline-block rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                                  Needs price
                                </span>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLine(item.id, { description: e.target.value })}
                              placeholder="Work or material description"
                              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-[#101915] outline-none hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
                            />
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-3 text-right align-top font-mono text-xs tabular-nums text-[#47554E]">
                        {readOnly ? (
                          item.quantity ?? "—"
                        ) : (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            aria-label="Quantity"
                            value={item.quantity ?? ""}
                            onChange={(e) =>
                              updateLine(item.id, {
                                quantity: e.target.value === "" ? undefined : Number(e.target.value),
                                amount: undefined
                              })
                            }
                            placeholder="1"
                            className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs tabular-nums outline-none hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
                          />
                        )}
                      </td>

                      <td className="px-2 py-3 text-right align-top font-mono text-xs tabular-nums text-[#47554E]">
                        {readOnly ? (
                          typeof item.unitPrice === "number" ? formatMoney(item.unitPrice, invoice.currency) : "—"
                        ) : (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            aria-label="Unit rate"
                            value={item.unitPrice ?? ""}
                            onChange={(e) =>
                              updateLine(item.id, {
                                unitPrice: e.target.value === "" ? undefined : Number(e.target.value),
                                amount: undefined
                              })
                            }
                            placeholder="$0.00"
                            className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs tabular-nums outline-none hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
                          />
                        )}
                      </td>

                      <td className="px-3 py-3 text-right align-top font-mono text-sm font-semibold tabular-nums text-[#101915]">
                        {unpriced ? (
                          readOnly ? (
                            <span className="text-xs font-semibold text-[#B45309]">TBD</span>
                          ) : (
                            <input
                              type="number"
                              step="any"
                              min="0"
                              aria-label="Line amount"
                              placeholder="$?"
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (Number.isFinite(val)) {
                                  updateLine(item.id, {
                                    amount: val,
                                    quantity: item.quantity ?? 1,
                                    unitPrice: val
                                  });
                                }
                              }}
                              className="w-20 rounded border border-[#F59E0B] bg-[#FEF3C7] px-1.5 py-0.5 text-right font-mono text-xs font-semibold text-[#B45309] outline-none"
                            />
                          )
                        ) : item.explicitFree ? (
                          <span className="text-xs font-semibold text-[#0F5132]">Included</span>
                        ) : readOnly ? (
                          formatMoney(amount, invoice.currency)
                        ) : (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            aria-label="Line amount"
                            value={amount}
                            onChange={(e) =>
                              updateLine(item.id, {
                                amount: e.target.value === "" ? undefined : Number(e.target.value),
                                explicitFree: false
                              })
                            }
                            className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-sm font-semibold tabular-nums outline-none hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
                          />
                        )}
                      </td>

                      {!readOnly && (
                        <td className="no-print px-1 py-2.5 text-right align-top">
                          <div className="inline-flex items-center gap-0.5">
                            {onRewordLine && item.description.trim().length > 0 && (
                              <button
                                type="button"
                                onClick={() => onRewordLine(item.id)}
                                disabled={rewordingLineId === item.id}
                                title="Polish wording with Billie"
                                className="rounded p-1 text-[#0F5132] hover:bg-[#E8F5EE] disabled:opacity-40"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(item.id)}
                              title="Remove line"
                              className="rounded p-1 text-[#6B7A72] hover:bg-[#FFF1F2] hover:text-[#9F1239]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <div className="no-print mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addLine("labor")}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#D9E0DC] px-2.5 py-1 text-xs font-semibold text-[#47554E] hover:border-[#0F5132] hover:text-[#0F5132]"
            >
              <Plus className="h-3.5 w-3.5" /> Add labor
            </button>
            <button
              type="button"
              onClick={() => addLine("material")}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#D9E0DC] px-2.5 py-1 text-xs font-semibold text-[#47554E] hover:border-[#0F5132] hover:text-[#0F5132]"
            >
              <Plus className="h-3.5 w-3.5" /> Add material
            </button>
          </div>
        )}
      </div>

      {/* Job-Site Before / After Photos */}
      {invoice.jobPhotos && invoice.jobPhotos.length > 0 && (
        <div className="mt-6 border-t border-[#E2E7E3] pt-5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
            Job Photo Proof
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {invoice.jobPhotos.map((ph) => (
              <div key={ph.id} className="overflow-hidden rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/50">
                <img src={ph.dataUrl} alt={ph.caption || "Job site photo"} className="h-24 w-full object-cover" />
                <div className="px-2 py-1.5">
                  {ph.stage && (
                    <span className="mr-1 rounded bg-[#E8F5EE] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#0F5132]">
                      {ph.stage}
                    </span>
                  )}
                  {ph.caption && <span className="text-[11px] text-[#47554E]">{ph.caption}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Quote Approval Stamp */}
      {invoice.quoteApproval && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0F5132]/30 bg-[#E8F5EE]/70 p-3.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#0F5132]" />
            <div>
              <div className="text-xs font-bold text-[#0F5132]">
                Approved by {invoice.quoteApproval.approvedBy}
              </div>
              <div className="text-[11px] text-[#47554E]">
                {new Date(invoice.quoteApproval.approvedAt).toLocaleString()}
              </div>
            </div>
          </div>
          {invoice.quoteApproval.signatureDataUrl && (
            <img
              src={invoice.quoteApproval.signatureDataUrl}
              alt="Client signature"
              className="h-10 rounded border border-[#0F5132]/20 bg-white px-2"
            />
          )}
        </div>
      )}

      {/* Totals & Notes */}
      <div className="mt-6 flex flex-col justify-between gap-6 border-t border-[#E2E7E3] pt-5 sm:flex-row">
        <div className="flex-1 space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">Notes & Terms</div>
            {readOnly ? (
              <p className="mt-1 whitespace-pre-line text-xs text-[#47554E]">
                {invoice.notes || "Thank you for your business."}
              </p>
            ) : (
              <textarea
                rows={2}
                value={invoice.notes || ""}
                onChange={(e) => onChangeInvoice?.({ ...invoice, notes: e.target.value })}
                placeholder="Payment terms, warranty, or thank-you note..."
                className="mt-1.5 w-full resize-none rounded-lg border border-transparent bg-[#F5F6F2]/70 p-2 text-xs text-[#47554E] outline-none hover:bg-[#F5F6F2] focus:border-[#0F5132] focus:bg-white"
              />
            )}
          </div>

          {enabledPaymentMethods.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7A72]">
                Accepted Payment Methods
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {enabledPaymentMethods.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-lg border border-[#E2E7E3] bg-[#F5F6F2]/70 px-2 py-0.5 text-[11px] text-[#47554E]"
                  >
                    <strong className="text-[#101915]">{m.label || m.kind}</strong>
                    {m.details ? `: ${m.details}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-full space-y-2 sm:w-64">
          <div className="flex justify-between text-xs text-[#47554E]">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.subtotal, invoice.currency)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-[#0F5132]">
              <span>Discount{invoice.discountReason ? ` (${invoice.discountReason})` : ""}</span>
              <span className="font-mono tabular-nums">-{formatMoney(totals.discountAmount, invoice.currency)}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-xs text-[#47554E]">
              <span>Tax ({taxRate}%)</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.taxAmount, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#E2E7E3] pt-2 text-base font-bold text-[#101915]">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.total, invoice.currency)}</span>
          </div>
          {cardFeeAmount > 0 && (
            <div className="flex justify-between text-[11px] text-[#6B7A72]">
              <span>Est. Card Fee (2.9%)</span>
              <span className="font-mono tabular-nums">+{formatMoney(cardFeeAmount, invoice.currency)}</span>
            </div>
          )}
          {invoice.depositPercent && invoice.depositPercent > 0 && (
            <div className="flex justify-between rounded-lg bg-[#E8F5EE] px-2.5 py-1.5 text-xs font-bold text-[#0F5132]">
              <span>{invoice.depositPercent}% Deposit Requested</span>
              <span className="font-mono tabular-nums">
                {formatMoney(
                  invoice.depositAmount ?? roundToCents((totals.total * invoice.depositPercent) / 100),
                  invoice.currency
                )}
              </span>
            </div>
          )}
          {totals.amountPaid > 0 && (
            <>
              <div className="flex justify-between text-xs text-[#0F5132]">
                <span>Paid</span>
                <span className="font-mono tabular-nums">-{formatMoney(totals.amountPaid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-[#E2E7E3] pt-1.5 text-sm font-bold text-[#101915]">
                <span>Balance Due</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.balanceDue, invoice.currency)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {poweredByVisible && (
        <div className="mt-6 border-t border-[#E2E7E3]/70 pt-3 text-center text-[11px] text-[#6B7A72]">
          Sent with <span className="font-semibold text-[#0F5132]">NoteBill</span> — Turn rough job notes into
          invoices at{" "}
          <a href="https://notebill.app" target="_blank" rel="noreferrer" className="underline">
            notebill.app
          </a>
        </div>
      )}
    </div>
  );
}
