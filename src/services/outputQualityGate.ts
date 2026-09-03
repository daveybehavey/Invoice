import { FinishedInvoice, StructuredInvoice } from "../models/invoice.js";

export type OutputQualityIssueCode =
  | "missing_line_items"
  | "totals_missing"
  | "totals_conflict"
  | "labor_material_separation"
  | "labor_pricing_format"
  | "missing_price"
  | "description_clarity"
  | "multi_day_structure";

export interface OutputQualityIssue {
  code: OutputQualityIssueCode;
  message: string;
  lineItemId?: string;
}

export interface OutputQualityGate {
  status: "pass" | "needs_review";
  blockerCount: number;
  warningCount: number;
  blockers: OutputQualityIssue[];
  warnings: OutputQualityIssue[];
}

interface EvaluateOutputQualityInput {
  structuredInvoice: StructuredInvoice;
  invoice: FinishedInvoice;
}

const INFORMAL_DESCRIPTION_PATTERN =
  /\b(thing|stuff|misc|etc|kinda|sorta|whatever|patched stuff|fixed thing|quick fix)\b/i;
const FIRST_PERSON_PATTERN = /\b(i|we|my|our)\b/i;
const MONTH_PATTERN = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b/i;
const MONEY_TOLERANCE = 0.01;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isExplicitDate = (value?: string): boolean => {
  if (!value) {
    return false;
  }
  return MONTH_PATTERN.test(value.toLowerCase());
};

export function evaluateInvoiceOutputQuality({
  structuredInvoice,
  invoice
}: EvaluateOutputQualityInput): OutputQualityGate {
  const blockers: OutputQualityIssue[] = [];
  const warnings: OutputQualityIssue[] = [];
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  // Rule: structure.line_items_present
  if (lineItems.length === 0) {
    blockers.push({
      code: "missing_line_items",
      message: "No line items were captured. Add at least one billable item."
    });
  }

  // Rule: structure.totals_present
  if (!isFiniteNumber(invoice.subtotal) || !isFiniteNumber(invoice.total)) {
    blockers.push({
      code: "totals_missing",
      message: "Subtotal or total is missing. Rebuild or update the draft totals."
    });
  } else {
    const discountAmount = isFiniteNumber(invoice.discountAmount) ? invoice.discountAmount : 0;
    const lineItemTotal = lineItems.reduce((sum, item) => {
      if (isFiniteNumber(item.amount)) {
        return sum + item.amount;
      }
      const canDeriveAmount = isFiniteNumber(item.quantity) && isFiniteNumber(item.unitPrice);
      if (canDeriveAmount) {
        const quantity = item.quantity as number;
        const unitPrice = item.unitPrice as number;
        return sum + quantity * unitPrice;
      }
      return sum;
    }, 0);

    if (Math.abs(lineItemTotal - invoice.subtotal) > MONEY_TOLERANCE) {
      blockers.push({
        code: "totals_conflict",
        message: "Subtotal does not match line-item amounts. Review totals before generating."
      });
    }

    const minimumExpectedTotal = invoice.subtotal - discountAmount;
    if (invoice.total < minimumExpectedTotal - MONEY_TOLERANCE) {
      blockers.push({
        code: "totals_conflict",
        message: "Total is lower than subtotal minus discount. Review tax/discount values."
      });
    }
  }

  const structuredLaborCount = structuredInvoice.workSessions.reduce(
    (count, session) => count + session.tasks.length,
    0
  );
  const structuredMaterialCount = structuredInvoice.materials.length;
  const invoiceLaborCount = lineItems.filter((item) => item.type === "labor").length;
  const invoiceMaterialCount = lineItems.filter((item) => item.type === "material").length;

  if (
    structuredLaborCount > 0 &&
    structuredMaterialCount > 0 &&
    (invoiceLaborCount === 0 || invoiceMaterialCount === 0)
  ) {
    warnings.push({
      code: "labor_material_separation",
      message: "Labor and materials were not separated clearly. Review line item types."
    });
  }

  lineItems.forEach((lineItem) => {
    const description = (lineItem.description ?? "").trim();
    if (!description) {
      blockers.push({
        code: "description_clarity",
        lineItemId: lineItem.id,
        message: "A line item is missing a client-facing description."
      });
      return;
    }

    const hasAmount = isFiniteNumber(lineItem.amount);
    const hasUnitPrice = isFiniteNumber(lineItem.unitPrice);
    const hasQuantity = isFiniteNumber(lineItem.quantity) && (lineItem.quantity as number) > 0;
    const isExplicitZeroCharge = hasAmount && lineItem.amount === 0 && hasUnitPrice && lineItem.unitPrice === 0;
    if (!isExplicitZeroCharge && (!hasAmount || !hasUnitPrice || !hasQuantity)) {
      blockers.push({
        code: "missing_price",
        lineItemId: lineItem.id,
        message: `Line item "${description}" is missing a required price, quantity, or amount.`
      });
    }

    if (INFORMAL_DESCRIPTION_PATTERN.test(description) || FIRST_PERSON_PATTERN.test(description)) {
      warnings.push({
        code: "description_clarity",
        lineItemId: lineItem.id,
        message: `Line item "${description}" should use cleaner client-facing wording.`
      });
    } else if (description.split(/\s+/).filter(Boolean).length > 14) {
      warnings.push({
        code: "description_clarity",
        lineItemId: lineItem.id,
        message: `Line item "${description}" is long. Consider shortening for readability.`
      });
    }

    if (lineItem.type === "labor" && isFiniteNumber(lineItem.amount) && lineItem.amount > 0) {
      const hasQuantity = isFiniteNumber(lineItem.quantity) && lineItem.quantity > 0;
      const hasRate = isFiniteNumber(lineItem.unitPrice) && lineItem.unitPrice >= 0;
      if (!hasQuantity || !hasRate) {
        blockers.push({
          code: "labor_pricing_format",
          lineItemId: lineItem.id,
          message: `Labor line "${description}" must show hours and rate explicitly.`
        });
      }
    }
  });

  const explicitSessionDates = new Set<string>();
  structuredInvoice.workSessions.forEach((session) => {
    if (isExplicitDate(session.date)) {
      explicitSessionDates.add((session.date ?? "").trim().toLowerCase());
    }
  });

  if (explicitSessionDates.size > 1) {
    const laborDates = new Set<string>();
    lineItems
      .filter((lineItem) => lineItem.type === "labor")
      .forEach((lineItem) => {
        if (isExplicitDate(lineItem.sourceSessionDate)) {
          laborDates.add((lineItem.sourceSessionDate ?? "").trim().toLowerCase());
        }
      });
    const hasServicePeriod = Boolean(invoice.servicePeriodStart || invoice.servicePeriodEnd);
    if (laborDates.size <= 1 && !hasServicePeriod) {
      warnings.push({
        code: "multi_day_structure",
        message:
          "This looks like multi-day work. Add date context or service period for clearer client review."
      });
    }
  }

  return {
    status: blockers.length > 0 ? "needs_review" : "pass",
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings
  };
}
