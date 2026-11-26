import type { FinishedInvoice, InvoiceLineItem, PaymentRecord } from "./types";

export interface ComputedTotals {
  subtotal: number;
  discountAmount: number;
  discountedSubtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

export function roundToCents(value: unknown): number {
  const parsed = toFiniteNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function toCents(value: unknown): number {
  const parsed = toFiniteNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function isLineUnpriced(item: InvoiceLineItem): boolean {
  if (item.explicitFree) {
    return false;
  }
  if (typeof item.amount === "number" && Number.isFinite(item.amount)) {
    return false;
  }
  if (
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice)
  ) {
    return false;
  }
  return true;
}

/**
 * Mirrors server `normalizeLineItem` + `public/utils/invoiceMoney.js`:
 * explicit amount takes precedence; otherwise quantity * unitPrice, rounded to cents.
 * Unpriced lines contribute 0 to subtotal while remaining flagged by `isLineUnpriced`.
 */
export function resolveLineAmount(item: Partial<InvoiceLineItem> | null | undefined): number {
  if (!item) {
    return 0;
  }
  if (item.explicitFree) {
    return 0;
  }
  const explicitAmount = toFiniteNumber(item.amount);
  if (Number.isFinite(explicitAmount)) {
    return roundToCents(explicitAmount);
  }
  const qty = toFiniteNumber(item.quantity);
  const price = toFiniteNumber(item.unitPrice);
  if (Number.isFinite(qty) && Number.isFinite(price)) {
    return roundToCents(qty * price);
  }
  return 0;
}

export function sumPaymentRecords(records?: PaymentRecord[]): number {
  if (!Array.isArray(records)) {
    return 0;
  }
  const cents = records.reduce((sum, rec) => {
    const amt = toFiniteNumber(rec?.amount);
    return sum + (Number.isFinite(amt) ? Math.round(amt * 100) : 0);
  }, 0);
  return cents / 100;
}

/**
 * Integer-cent invoice computation:
 * - Sums cent-rounded described line items
 * - Applies discount before tax
 * - Computes tax on discounted subtotal
 * - Subtracts recorded payments, floored at 0
 */
export function computeInvoiceTotals(input: {
  lineItems?: InvoiceLineItem[];
  discountAmount?: number;
  taxRate?: number;
  paymentRecords?: PaymentRecord[];
}): ComputedTotals {
  const billableItems = (input.lineItems ?? []).filter((item) => item.description.trim().length > 0);
  const subtotalCents = billableItems.reduce((sum, item) => sum + Math.round(resolveLineAmount(item) * 100), 0);
  const requestedDiscountCents = Math.max(0, toCents(input.discountAmount ?? 0));
  const discountCents = Math.min(subtotalCents, requestedDiscountCents);
  const discountedSubtotalCents = Math.max(0, subtotalCents - discountCents);
  const parsedTaxRate = toFiniteNumber(input.taxRate);
  const safeTaxRate = Number.isFinite(parsedTaxRate) && parsedTaxRate > 0 ? parsedTaxRate : 0;
  const taxCents = Math.round(discountedSubtotalCents * (safeTaxRate / 100));
  const totalCents = discountedSubtotalCents + taxCents;
  const amountPaidCents = Math.round(sumPaymentRecords(input.paymentRecords) * 100);
  const balanceDueCents = Math.max(0, totalCents - amountPaidCents);

  return {
    subtotal: subtotalCents / 100,
    discountAmount: discountCents / 100,
    discountedSubtotal: discountedSubtotalCents / 100,
    taxAmount: taxCents / 100,
    total: totalCents / 100,
    amountPaid: amountPaidCents / 100,
    balanceDue: balanceDueCents / 100
  };
}

export function syncFinishedInvoiceTotals(invoice: FinishedInvoice, taxRate = 0): FinishedInvoice {
  const lineItems = invoice.lineItems.map((item, idx) => {
    const id = item.id || `line_${idx + 1}`;
    if (item.explicitFree) {
      return { ...item, id, amount: 0 };
    }
    if (typeof item.amount === "number" && Number.isFinite(item.amount)) {
      return { ...item, id, amount: roundToCents(item.amount) };
    }
    if (
      typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) &&
      typeof item.unitPrice === "number" &&
      Number.isFinite(item.unitPrice)
    ) {
      return { ...item, id, amount: roundToCents(item.quantity * item.unitPrice) };
    }
    return { ...item, id };
  });

  const totals = computeInvoiceTotals({
    lineItems,
    discountAmount: invoice.discountAmount,
    taxRate,
    paymentRecords: invoice.paymentRecords
  });

  return {
    ...invoice,
    lineItems,
    discountAmount: totals.discountAmount > 0 ? totals.discountAmount : undefined,
    subtotal: totals.subtotal,
    total: totals.total,
    balanceDue: totals.balanceDue
  };
}

export function formatMoney(amount: unknown, currency = "USD"): string {
  const safeCurrency = (currency || "USD").trim().toUpperCase();
  const value = roundToCents(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(100 + Math.random() * 900));
  return `INV-${y}${m}${d}-${rand}`;
}

export function computeDueDate(
  issueDateIso: string,
  terms: "due_on_receipt" | "net_7" | "net_15" | "net_30"
): string {
  const daysMap = {
    due_on_receipt: 0,
    net_7: 7,
    net_15: 15,
    net_30: 30
  } as const;
  const parsed = Date.parse(issueDateIso);
  const base = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  base.setDate(base.getDate() + daysMap[terms]);
  return base.toISOString().slice(0, 10);
}
