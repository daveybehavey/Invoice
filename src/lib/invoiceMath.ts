import { FinishedInvoice, InvoiceLineItem } from "../models/invoice.js";

export function normalizeInvoice(invoice: FinishedInvoice): FinishedInvoice {
  const lineItems = invoice.lineItems.map((lineItem, index) => normalizeLineItem(lineItem, index));
  const subtotal = roundToCents(lineItems.reduce((sum, lineItem) => sum + (lineItem.amount ?? 0), 0));
  const total = roundToCents(invoice.total ?? subtotal);
  const balanceDue = roundToCents(invoice.balanceDue ?? total);

  return {
    ...invoice,
    lineItems,
    subtotal,
    total,
    balanceDue
  };
}

function normalizeLineItem(lineItem: InvoiceLineItem, index: number): InvoiceLineItem {
  const quantity = lineItem.quantity;
  const unitPrice = lineItem.unitPrice;
  const amount = lineItem.amount ?? deriveAmount(quantity, unitPrice);

  return {
    ...lineItem,
    id: lineItem.id ?? `line_${index + 1}`,
    amount: roundToCents(amount)
  };
}

function deriveAmount(quantity?: number, unitPrice?: number): number {
  if (typeof quantity === "number" && typeof unitPrice === "number") {
    return quantity * unitPrice;
  }

  return 0;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
