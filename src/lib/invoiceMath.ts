import { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";

export function normalizeInvoice(invoice: FinishedInvoice): FinishedInvoice {
  const lineItems = invoice.lineItems.map((lineItem, index) => normalizeLineItem(lineItem, index));
  const subtotal = roundToCents(lineItems.reduce((sum, lineItem) => sum + (lineItem.amount ?? 0), 0));
  const discountAmount = roundToCents(Math.max(0, invoice.discountAmount ?? 0));
  const total = roundToCents(Math.max(0, subtotal - discountAmount));
  const balanceDue = roundToCents(invoice.balanceDue ?? total);

  return {
    ...invoice,
    lineItems,
    discountAmount,
    subtotal,
    total,
    balanceDue
  };
}

function normalizeLineItem(lineItem: InvoiceLineItem, index: number): InvoiceLineItem {
  const quantity = lineItem.quantity;
  const unitPrice = lineItem.unitPrice;
  const derivedAmount = deriveAmount(quantity, unitPrice);
  const amount = lineItem.amount ?? derivedAmount;
  const next: InvoiceLineItem = {
    ...lineItem,
    id: lineItem.id ?? `line_${index + 1}`
  };

  if (typeof amount === "number") {
    next.amount = roundToCents(amount);
  }

  return next;
}

function deriveAmount(quantity?: number, unitPrice?: number): number | undefined {
  if (typeof quantity === "number" && typeof unitPrice === "number") {
    return quantity * unitPrice;
  }

  return undefined;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
