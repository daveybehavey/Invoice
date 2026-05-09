import { runJsonTask } from "../ai/openaiClient.js";
import { normalizeInvoice } from "../lib/invoiceMath.js";
import {
  DecisionAction,
  FinishedInvoice,
  FinishedInvoiceSchema,
  InvoiceAuditSchema,
  InvoiceEditResponseSchema,
  LaborPricingChoice,
  Material,
  OpenDecision,
  StructuredInvoice,
  StructuredInvoiceSchema,
  Task
} from "../models/invoice.js";
import { evaluateInvoiceOutputQuality, OutputQualityGate } from "./outputQualityGate.js";

type CreateInvoiceInput = {
  messyInput?: string;
  uploadedInvoiceText?: string;
  lastUserMessage?: string;
  mode?: ParseMode;
};

type ParseMode = "full" | "fast";
type AuditStatus = "completed" | "timed_out" | "failed" | "skipped";

type AuditOutcome = {
  audit: InvoiceAudit | null;
  status: AuditStatus;
};

type CreateInvoiceReadyResult = {
  kind: "invoice_ready";
  structuredInvoice: StructuredInvoice;
  invoice: FinishedInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
  qualityGate: OutputQualityGate;
  auditStatus?: AuditStatus;
};

type CreateInvoiceLaborFollowUpResult = {
  kind: "labor_pricing_follow_up";
  structuredInvoice: StructuredInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
  auditStatus?: AuditStatus;
  followUp: {
    type: "labor_pricing";
    message: string;
    options: Array<{
      billingType: "hourly" | "flat";
      label: string;
    }>;
    laborItems: Array<{
      description: string;
      date?: string;
      hours?: number;
    }>;
  };
};

type CreateInvoiceDiscountFollowUpResult = {
  kind: "discount_follow_up";
  structuredInvoice: StructuredInvoice;
  invoice: FinishedInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
  qualityGate: OutputQualityGate;
  auditStatus?: AuditStatus;
  followUp: {
    type: "discount";
    message: string;
    suggestedReason?: string;
  };
};

export type CreateInvoiceResult =
  | CreateInvoiceReadyResult
  | CreateInvoiceLaborFollowUpResult
  | CreateInvoiceDiscountFollowUpResult;

type InvoiceAudit = {
  assumptions: string[];
  decisions: Array<{
    kind: "tax" | "billing";
    prompt: string;
    sourceSnippet?: string;
  }>;
  unparsedLines: string[];
};

type RewordSingleLineResponse = {
  description: string;
};

type RewordDescriptionsResponse = {
  lineItems: Array<{
    id: string;
    description: string;
  }>;
};

type RewordFullInvoiceResponse = {
  lineItems: Array<{
    id: string;
    description: string;
  }>;
  notes?: string;
};

type WordingRewriteSource = {
  lineItems: Array<{
    id: string;
    description: string;
  }>;
  notes?: string;
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec"
];

const isExplicitDate = (value?: string): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase().trim();
  return MONTHS.some((month) => new RegExp(`\\b${month}\\s+\\d{1,2}\\b`).test(normalized));
};

const extractExplicitDateLabel = (value?: string): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  for (const month of MONTHS) {
    const match = normalized.match(new RegExp(`\\b(${month})\\s+(\\d{1,2})\\b`));
    if (match) {
      const monthLabel = match[1];
      const day = match[2];
      return `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${day}`;
    }
  }
  return null;
};

export async function createInvoiceFromInput(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const sourceText = buildSourceText(input);
  const taxDirective = detectExplicitTaxDirective(sourceText);
  const taxAmbiguity = detectTaxAmbiguity(sourceText);
  const parseMode: ParseMode = input.mode ?? "full";
  const parsedInvoice = shouldChunkInput(input.messyInput, input.uploadedInvoiceText)
    ? await parseStructuredInvoiceFromChunks(input.messyInput ?? "")
    : await parseMessyInputToStructuredInvoice(sourceText);
  const structuredInvoice = applyExplicitServicePeriod(
    applyFreeLaborMinutesFromText(
      applyInlineLaborMinutesFromText(
        applyInlineLaborPricingFromText(parsedInvoice, sourceText),
        sourceText
      ),
      sourceText
    ),
    sourceText
  );
  const namedInvoice = applyCustomerNameFallback(structuredInvoice, sourceText);
  const optionalLaborTasks = identifyOptionalLaborTasks(structuredInvoice, sourceText);
  const sanitizedNotes = sanitizeStructuredNotes(namedInvoice.notes);
  const sanitizedInvoice: StructuredInvoice = {
    ...namedInvoice,
    notes: sanitizedNotes.cleanedNotes
  };
  const unpricedLaborTasks = extractUnpricedLaborTasks(namedInvoice).filter(
    (taskRef) => !optionalLaborTasks.has(normalizeDecisionText(taskRef.task.description))
  );

  if (needsLaborPricingFollowUp(unpricedLaborTasks)) {
    const unparsedLines = filterUnparsedLines(
      mergeUnparsedLines(
      sanitizedNotes.removedLines,
      extractUnparsedLines(sourceText, sanitizedInvoice)
      )
    );
    return {
      kind: "labor_pricing_follow_up",
      structuredInvoice: sanitizedInvoice,
      openDecisions: [],
      assumptions: normalizeAssumptions(
        sanitizedNotes.taxAmbiguityFound ? ["Tax assumed 0%."] : [],
        taxDirective
      ),
      unparsedLines,
      followUp: {
        type: "labor_pricing",
        message:
          "I see labor work, but some labor pricing is missing. Please choose how labor should be billed.",
        options: [
          { billingType: "hourly", label: "Hourly (rate + hours per labor line)" },
          { billingType: "flat", label: "Flat labor amount" }
        ],
        laborItems: unpricedLaborTasks.map((item) => ({
          description: item.task.description,
          date: item.date,
          hours: item.task.hours
        }))
      }
    };
  }

  const invoice = await generateFinishedInvoice(sanitizedInvoice);
  const customerFallback = extractCustomerNameFromSource(sourceText);
  const invoiceWithCustomer =
    invoice.customerName && invoice.customerName.trim()
      ? invoice
      : customerFallback
        ? { ...invoice, customerName: customerFallback }
        : invoice;
  const invoiceWithIssueDate = hasExplicitIssueDate(sourceText)
    ? invoiceWithCustomer
    : { ...invoiceWithCustomer, issueDate: undefined };
  const discountIntent = detectDiscountIntent(sourceText);
  const servicePeriodAssumption = buildServicePeriodAssumption(sanitizedInvoice);
  const auditOutcome =
    parseMode === "fast"
      ? { audit: null, status: "skipped" as const }
      : await auditInvoiceInterpretationWithTimeout(sourceText, sanitizedInvoice);
  const audit = auditOutcome.audit;
  const auditDecisions = audit ? decisionsFromAudit(audit.decisions) : [];
  const heuristicDecisions = audit ? extractAmbiguousBillingDecisions(sourceText) : [];
  const openDecisions = audit
    ? filterResolvedDecisions(
        mergeDecisions(auditDecisions, heuristicDecisions),
        sourceText,
        input.lastUserMessage
      )
    : detectOpenDecisionsFromText(sourceText, input.lastUserMessage);
  const assumptions = normalizeAssumptions(
    [
      ...(audit?.assumptions ?? []),
      ...(servicePeriodAssumption ? [servicePeriodAssumption] : []),
      ...(sanitizedNotes.taxAmbiguityFound || (taxAmbiguity && taxDirective === "none")
        ? ["Tax assumed 0%."]
        : [])
    ],
    taxDirective
  );
  const heuristicUnparsed = extractUnparsedLines(sourceText, sanitizedInvoice, openDecisions);
  const auditUnparsed = audit?.unparsedLines ?? [];
  const unparsedLines =
    auditUnparsed.length > 0
      ? mergeUnparsedLines(sanitizedNotes.removedLines, mergeUnparsedLines(auditUnparsed, heuristicUnparsed))
      : mergeUnparsedLines(sanitizedNotes.removedLines, heuristicUnparsed);
  const cleanedUnparsed = filterUnparsedLines(unparsedLines);
  const cleanedDecisions = filterDecisionsAgainstInvoice(
    openDecisions,
    invoiceWithIssueDate,
    taxDirective,
    sourceText
  );
  const invoiceWithHolds = applyDecisionPricingHolds(invoiceWithIssueDate, cleanedDecisions);
  const cleanedInvoice = filterInvoiceNotes(invoiceWithHolds, sourceText, cleanedDecisions);
  const cleanedAssumptions = filterAssumptionsAgainstDecisions(assumptions, cleanedDecisions);
  const outputQuality = evaluateInvoiceOutputQuality({
    structuredInvoice: sanitizedInvoice,
    invoice: cleanedInvoice
  });

  if (discountIntent.kind === "apply") {
    const discountedInvoice = applyDiscountToInvoice(
      cleanedInvoice,
      discountIntent.amount,
      discountIntent.reason
    );
    return {
      kind: "invoice_ready",
      structuredInvoice: sanitizedInvoice,
      invoice: discountedInvoice,
      openDecisions: cleanedDecisions,
      assumptions: cleanedAssumptions,
      unparsedLines: cleanedUnparsed,
      qualityGate: evaluateInvoiceOutputQuality({
        structuredInvoice: sanitizedInvoice,
        invoice: discountedInvoice
      }),
      auditStatus: auditOutcome.status
    };
  }

  return {
    kind: "invoice_ready",
    structuredInvoice: sanitizedInvoice,
    invoice: cleanedInvoice,
    openDecisions: cleanedDecisions,
    assumptions: cleanedAssumptions,
    unparsedLines: cleanedUnparsed,
    qualityGate: outputQuality,
    auditStatus: auditOutcome.status
  };
}

export async function continueInvoiceAfterLaborPricing(
  structuredInvoice: StructuredInvoice,
  laborPricing: LaborPricingChoice,
  sourceText?: string,
  lastUserMessage?: string,
  mode?: ParseMode
): Promise<CreateInvoiceReadyResult> {
  const parsedStructuredInvoice = StructuredInvoiceSchema.parse(structuredInvoice);
  const withLaborPricing = applyLaborPricing(parsedStructuredInvoice, laborPricing);
  const source = sourceText ?? withLaborPricing.notes ?? "";
  const withFreeMinutes = applyFreeLaborMinutesFromText(withLaborPricing, source);
  const taxDirective = detectExplicitTaxDirective(source);
  const taxAmbiguity = detectTaxAmbiguity(source);
  const sanitizedNotes = sanitizeStructuredNotes(withFreeMinutes.notes);
  const sanitizedInvoice: StructuredInvoice = {
    ...withFreeMinutes,
    notes: sanitizedNotes.cleanedNotes
  };
  const invoice = await generateFinishedInvoice(sanitizedInvoice);
  const customerFallback = extractCustomerNameFromSource(source);
  const invoiceWithCustomer =
    invoice.customerName && invoice.customerName.trim()
      ? invoice
      : customerFallback
        ? { ...invoice, customerName: customerFallback }
        : invoice;
  const invoiceWithIssueDate = hasExplicitIssueDate(source)
    ? invoiceWithCustomer
    : { ...invoiceWithCustomer, issueDate: undefined };
  const discountIntent = detectDiscountIntent(source);
  const servicePeriodAssumption = buildServicePeriodAssumption(sanitizedInvoice);
  const parseMode: ParseMode = mode ?? "full";
  const auditOutcome =
    parseMode === "fast"
      ? { audit: null, status: "skipped" as const }
      : await auditInvoiceInterpretationWithTimeout(source, sanitizedInvoice);
  const audit = auditOutcome.audit;
  const auditDecisions = audit ? decisionsFromAudit(audit.decisions) : [];
  const heuristicDecisions = audit ? extractAmbiguousBillingDecisions(source) : [];
  const openDecisions = audit
    ? filterResolvedDecisions(mergeDecisions(auditDecisions, heuristicDecisions), source, lastUserMessage)
    : detectOpenDecisionsFromText(source, lastUserMessage);
  const assumptions = normalizeAssumptions(
    [
      ...(audit?.assumptions ?? []),
      ...(servicePeriodAssumption ? [servicePeriodAssumption] : []),
      ...(sanitizedNotes.taxAmbiguityFound || (taxAmbiguity && taxDirective === "none")
        ? ["Tax assumed 0%."]
        : [])
    ],
    taxDirective
  );
  const heuristicUnparsed = extractUnparsedLines(source, sanitizedInvoice, openDecisions);
  const auditUnparsed = audit?.unparsedLines ?? [];
  const unparsedLines =
    auditUnparsed.length > 0
      ? mergeUnparsedLines(sanitizedNotes.removedLines, mergeUnparsedLines(auditUnparsed, heuristicUnparsed))
      : mergeUnparsedLines(sanitizedNotes.removedLines, heuristicUnparsed);
  const cleanedUnparsed = filterUnparsedLines(unparsedLines);
  const cleanedDecisions = filterDecisionsAgainstInvoice(
    openDecisions,
    invoiceWithIssueDate,
    taxDirective,
    source
  );
  const invoiceWithHolds = applyDecisionPricingHolds(invoiceWithIssueDate, cleanedDecisions);
  const cleanedInvoice = filterInvoiceNotes(
    invoiceWithHolds,
    sourceText ?? withLaborPricing.notes ?? "",
    cleanedDecisions
  );
  const cleanedAssumptions = filterAssumptionsAgainstDecisions(assumptions, cleanedDecisions);
  const outputQuality = evaluateInvoiceOutputQuality({
    structuredInvoice: sanitizedInvoice,
    invoice: cleanedInvoice
  });

  if (discountIntent.kind === "apply") {
    const discountedInvoice = applyDiscountToInvoice(
      cleanedInvoice,
      discountIntent.amount,
      discountIntent.reason
    );
    return {
      kind: "invoice_ready",
      structuredInvoice: sanitizedInvoice,
      invoice: discountedInvoice,
      openDecisions: cleanedDecisions,
      assumptions: cleanedAssumptions,
      unparsedLines: cleanedUnparsed,
      qualityGate: evaluateInvoiceOutputQuality({
        structuredInvoice: sanitizedInvoice,
        invoice: discountedInvoice
      }),
      auditStatus: auditOutcome.status
    };
  }

  return {
    kind: "invoice_ready",
    structuredInvoice: sanitizedInvoice,
    invoice: cleanedInvoice,
    openDecisions: cleanedDecisions,
    assumptions: cleanedAssumptions,
    unparsedLines: cleanedUnparsed,
    qualityGate: outputQuality,
    auditStatus: auditOutcome.status
  };
}

type ApplyDecisionInput = {
  structuredInvoice: StructuredInvoice;
  openDecisions: OpenDecision[];
  assumptions?: string[];
  unparsedLines?: string[];
  decisionAction: DecisionAction;
  pendingTaxRate?: string;
};

type ApplyDecisionResult = {
  structuredInvoice: StructuredInvoice;
  invoice: FinishedInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
  qualityGate: OutputQualityGate;
  pendingTaxRate?: string;
};

export async function applyDecisionActionToDraft(
  input: ApplyDecisionInput
): Promise<ApplyDecisionResult> {
  const sanitizedInvoice = StructuredInvoiceSchema.parse(input.structuredInvoice);
  const currentOpenDecisions = normalizeOpenDecisions(input.openDecisions ?? []);
  const decisionAction = input.decisionAction;
  const selectedDecisions = selectTargetDecisions(currentOpenDecisions, decisionAction);
  const selectedDecisionIds = new Set(selectedDecisions.map((decision) => decision.id));
  const excludeSelected =
    decisionAction.type === "exclude" || decisionAction.type === "bulk_exclude";
  const selectedTaxDecisions = selectedDecisions.filter((decision) => decision.kind === "tax");
  const taxApplySelected =
    (decisionAction.type === "tax_apply" || decisionAction.type === "bulk_include") &&
    selectedTaxDecisions.length > 0;
  const taxSkipSelected =
    (decisionAction.type === "tax_skip" || decisionAction.type === "bulk_exclude") &&
    selectedTaxDecisions.length > 0;

  let nextStructuredInvoice = cloneStructuredInvoice(sanitizedInvoice);
  if (excludeSelected) {
    selectedDecisions
      .filter((decision) => decision.kind === "billing")
      .forEach((decision) => {
        nextStructuredInvoice = applyBillingExclusionToStructuredInvoice(nextStructuredInvoice, decision);
      });
  }

  const remainingOpenDecisions = currentOpenDecisions.filter(
    (decision) => !selectedDecisionIds.has(decision.id)
  );

  const baseInvoice = await generateFinishedInvoice(nextStructuredInvoice);
  const heldInvoice = applyDecisionPricingHolds(baseInvoice, remainingOpenDecisions);
  const qualityGate = evaluateInvoiceOutputQuality({
    structuredInvoice: nextStructuredInvoice,
    invoice: heldInvoice
  });

  let nextPendingTaxRate = sanitizeTaxRate(input.pendingTaxRate);
  if (taxSkipSelected) {
    nextPendingTaxRate = undefined;
  }
  if (taxApplySelected) {
    const detectedTaxRate = selectedTaxDecisions
      .map((decision) => extractTaxRateFromDecision(decision))
      .find((value): value is string => Boolean(value));
    if (detectedTaxRate) {
      nextPendingTaxRate = detectedTaxRate;
    }
  }

  const assumptions = normalizeAssumptions(
    filterAssumptionsAfterDecisionAction(
      input.assumptions ?? [],
      remainingOpenDecisions,
      taxApplySelected,
      taxSkipSelected
    )
  );

  return {
    structuredInvoice: nextStructuredInvoice,
    invoice: heldInvoice,
    openDecisions: remainingOpenDecisions,
    assumptions,
    unparsedLines: Array.isArray(input.unparsedLines) ? input.unparsedLines : [],
    qualityGate,
    pendingTaxRate: nextPendingTaxRate
  };
}

export function applyDiscountAfterFollowUp(
  invoice: FinishedInvoice,
  discountAmount: number,
  discountReason?: string
): FinishedInvoice {
  return applyDiscountToInvoice(FinishedInvoiceSchema.parse(invoice), discountAmount, discountReason);
}

export async function changeLineWording(
  invoice: FinishedInvoice,
  lineItemId: string,
  tone?: string
): Promise<FinishedInvoice> {
  const targetLineItem = invoice.lineItems.find((lineItem) => lineItem.id === lineItemId);
  if (!targetLineItem) {
    throw new Error(`Line item "${lineItemId}" was not found.`);
  }

  if (supportsDeterministicDescriptionWordingTone(tone)) {
    const updatedInvoice: FinishedInvoice = {
      ...invoice,
      lineItems: invoice.lineItems.map((lineItem) =>
        lineItem.id === lineItemId
          ? {
              ...lineItem,
              description: finalizeRewordedLineItemDescription(lineItem.description, lineItem.description)
            }
          : lineItem
      )
    };

    return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
  }

  const taskPrompt = [
    "Reword a single invoice line item.",
    "Keep the same meaning and professionalism.",
    "Do not change price, quantity, or unit context.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    "Return JSON with shape: {\"description\":\"...\"}.",
    `Original line description: ${JSON.stringify(targetLineItem.description)}`
  ].join("\n");

  const modelResponse = await runJsonTask<RewordSingleLineResponse>(taskPrompt, {
    taskType: "wording"
  });

  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((lineItem) =>
      lineItem.id === lineItemId
        ? {
            ...lineItem,
            description: finalizeRewordedLineItemDescription(lineItem.description, modelResponse.description)
          }
        : lineItem
    )
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
}

export async function changeNotesWording(
  invoice: FinishedInvoice,
  tone?: string
): Promise<FinishedInvoice> {
  const currentNotes = (invoice.notes ?? "").trim();
  if (!currentNotes) {
    return normalizeInvoice(FinishedInvoiceSchema.parse(invoice));
  }

  const taskPrompt = [
    "Rewrite invoice notes only.",
    "Keep the same meaning and professionalism.",
    "Do not change line items, quantities, rates, dates, or totals.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    "Return JSON with shape: {\"notes\":\"...\"}.",
    `Original invoice notes: ${JSON.stringify(currentNotes)}`
  ].join("\n");

  const modelResponse = await runJsonTask<{ notes: string }>(taskPrompt, {
    taskType: "wording",
    maxCompletionTokens: Math.min(500, Math.max(180, Math.ceil(currentNotes.length / 3)))
  });

  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    notes: modelResponse.notes
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
}

export async function changeDescriptionsWording(
  invoice: FinishedInvoice,
  tone?: string
): Promise<FinishedInvoice> {
  if (!Array.isArray(invoice.lineItems) || invoice.lineItems.length === 0) {
    return normalizeInvoice(FinishedInvoiceSchema.parse(invoice));
  }

  if (invoice.lineItems.length === 1 && !(invoice.notes ?? "").trim()) {
    const [singleLineItem] = invoice.lineItems;
    if (singleLineItem?.id) {
      return changeLineWording(invoice, singleLineItem.id, tone);
    }
  }

  if (supportsDeterministicDescriptionWordingTone(tone)) {
    const updatedInvoice: FinishedInvoice = {
      ...invoice,
      lineItems: invoice.lineItems.map((lineItem) => ({
        ...lineItem,
        description: finalizeRewordedLineItemDescription(lineItem.description, lineItem.description)
      }))
    };

    return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
  }

  const lineItemSource = invoice.lineItems.map((lineItem, index) => ({
    id: lineItem.id ?? `line-${index + 1}`,
    description: lineItem.description
  }));
  const taskPrompt = [
    "Rewrite invoice line-item descriptions only.",
    "Keep the same meaning and professionalism for every line item.",
    "Do not change notes, amounts, quantities, rates, dates, IDs, or totals.",
    "Do not add, remove, merge, split, or reorder line items.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    'Return JSON with shape: {"lineItems":[{"id":"...","description":"..."}]}.',
    `Line-item source JSON: ${JSON.stringify(lineItemSource)}`
  ].join("\n");

  const wordingTokenBudget = Math.min(
    1600,
    Math.max(500, invoice.lineItems.length * 160)
  );
  const modelResponse = await runJsonTask<RewordDescriptionsResponse>(taskPrompt, {
    taskType: "wording",
    maxCompletionTokens: wordingTokenBudget
  });

  const descriptionById = new Map(
    modelResponse.lineItems.map((lineItem) => [lineItem.id, lineItem.description])
  );
  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((lineItem, index) => ({
      ...lineItem,
      description: finalizeRewordedLineItemDescription(
        lineItem.description,
        descriptionById.get(lineItem.id ?? lineItemSource[index]?.id ?? "") ?? lineItem.description
      )
    }))
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
}

export async function rewordFullInvoice(invoice: FinishedInvoice, tone?: string): Promise<FinishedInvoice> {
  if (!(invoice.notes ?? "").trim() && supportsDeterministicDescriptionWordingTone(tone)) {
    return changeDescriptionsWording(invoice, tone);
  }

  if (invoice.lineItems.length === 1 && !(invoice.notes ?? "").trim()) {
    const [singleLineItem] = invoice.lineItems;
    if (singleLineItem?.id) {
      return changeLineWording(invoice, singleLineItem.id, tone);
    }
  }

  const wordingSource: WordingRewriteSource = {
    lineItems: invoice.lineItems.map((lineItem, index) => ({
      id: lineItem.id ?? `line-${index + 1}`,
      description: lineItem.description
    })),
    notes: invoice.notes
  };
  const taskPrompt = [
    "Rewrite invoice wording only.",
    "Rewrite line item descriptions and notes so they are clean, client-facing, and concise.",
    "Keep the same meaning for every line.",
    "Do not change amounts, quantities, rates, dates, IDs, or totals.",
    "Do not add, remove, or reorder line items.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    "Return JSON with shape: {\"lineItems\":[{\"id\":\"...\",\"description\":\"...\"}],\"notes\":\"optional\"}.",
    `Wording source JSON: ${JSON.stringify(wordingSource)}`
  ].join("\n");
  const wordingTokenBudget = Math.min(
    2200,
    Math.max(700, invoice.lineItems.length * 180 + Math.ceil((invoice.notes ?? "").trim().length / 4))
  );

  const modelResponse = await runJsonTask<RewordFullInvoiceResponse>(taskPrompt, {
    taskType: "wording",
    maxCompletionTokens: wordingTokenBudget
  });
  const descriptionById = new Map(modelResponse.lineItems.map((lineItem) => [lineItem.id, lineItem.description]));

  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((lineItem, index) => ({
      ...lineItem,
      description: finalizeRewordedLineItemDescription(
        lineItem.description,
        descriptionById.get(lineItem.id ?? wordingSource.lineItems[index]?.id ?? "") ?? lineItem.description
      )
    })),
    notes: modelResponse.notes ?? invoice.notes
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
}

export async function applyInvoiceEditInstruction(
  invoice: FinishedInvoice,
  instruction: string
): Promise<{ invoice: FinishedInvoice; followUp?: string }> {
  const taskPrompt = [
    "You update an existing invoice based on a user instruction.",
    "Return JSON with shape: {\"invoice\":{...},\"followUp\":\"optional string\"}.",
    "Rules:",
    "- Only change fields explicitly requested.",
    "- Do not change invoiceNumber unless asked.",
    "- Do not invent labor hours, rates, or amounts.",
    "- If the instruction is ambiguous, leave the invoice unchanged and ask a follow-up question.",
    "- Preserve currency, existing IDs, and totals will be recalculated.",
    `User instruction: ${instruction}`,
    `Current invoice JSON: ${JSON.stringify(invoice)}`
  ].join("\n");

  const modelResponse = await runJsonTask<{ invoice: FinishedInvoice; followUp?: string }>(taskPrompt);
  const parsed = InvoiceEditResponseSchema.parse(modelResponse);
  const normalizedInvoice = normalizeInvoice(FinishedInvoiceSchema.parse(parsed.invoice));
  const followUp = parsed.followUp?.trim();

  return {
    invoice: normalizedInvoice,
    followUp: followUp && followUp.length > 0 ? followUp : undefined
  };
}

async function parseMessyInputToStructuredInvoice(sourceText: string): Promise<StructuredInvoice> {
  const taskPrompt = [
    "Parse messy invoice/job notes into a structured invoice model.",
    "Output JSON with this shape:",
    "{",
    "  \"customerName\": \"optional string\",",
    "  \"invoiceNumber\": \"optional string\",",
    "  \"issueDate\": \"optional string\",",
    "  \"dueDate\": \"optional string\",",
    "  \"servicePeriodStart\": \"optional string\",",
    "  \"servicePeriodEnd\": \"optional string\",",
    "  \"workSessions\": [",
    "    {",
    "      \"date\": \"optional string\",",
    "      \"tasks\": [",
    "        {\"description\": \"string\", \"hours\": 0, \"rate\": 0, \"amount\": 0}",
    "      ]",
    "    }",
    "  ],",
    "  \"materials\": [",
    "    {\"description\": \"string\", \"quantity\": 0, \"unitCost\": 0, \"amount\": 0}",
    "  ],",
    "  \"notes\": \"optional string\"",
    "}",
    "Rules:",
    "- Keep tasks itemized, not overly grouped.",
    "- Prefer the user's task wording; avoid generic labels like \"Labor\" if a specific task is mentioned.",
    "- Group work sessions by date when a date exists.",
    "- Omit unknown numeric fields instead of guessing.",
    "- Never infer or invent labor hours, labor rate, or labor amount when they are missing.",
    "- If the notes explicitly say a visit/task was free or not charged, set amount to 0 for that task.",
    "- If the notes explicitly say a part/material was free or not charged, set amount to 0 for that material.",
    "- Use numbers (not strings) for numeric values.",
    `Source text:\n${sourceText}`
  ].join("\n");

  const modelResponse = await runJsonTask<StructuredInvoice>(taskPrompt);
  return StructuredInvoiceSchema.parse(modelResponse);
}

async function auditInvoiceInterpretation(
  sourceText: string,
  structuredInvoice: StructuredInvoice
): Promise<InvoiceAudit | null> {
  if (!sourceText.trim()) {
    return null;
  }
  const taskPrompt = [
    "You are auditing a parsed invoice against messy source notes.",
    "Return JSON with this shape:",
    "{",
    "  \"assumptions\": [\"string\"],",
    "  \"decisions\": [",
    "    {\"kind\":\"tax|billing\", \"prompt\":\"string\", \"sourceSnippet\":\"optional\"}",
    "  ],",
    "  \"unparsedLines\": [\"string\"]",
    "}",
    "Rules:",
    "- If the notes explicitly say no charge/free/didn't charge, do NOT create a decision; add an assumption instead.",
    "- If something is ambiguous (e.g. maybe/up to you/sometimes/do what makes sense), add a decision.",
    "- Only add a tax decision if the user explicitly asks to apply tax or gives a tax rate.",
    "- If tax is mentioned ambiguously, add assumption: \"Tax assumed 0%\".",
    "- If any source lines are not reflected in the structured invoice, list them in unparsedLines.",
    "- Keep unparsedLines short (verbatim snippets) and only include relevant notes.",
    "- Keep decisions short and specific to the item.",
    "- Do not invent amounts or add new items.",
    `Source text:\n${sourceText}`,
    `Structured invoice JSON:\n${JSON.stringify(structuredInvoice)}`
  ].join("\n");

  try {
    const modelResponse = await runJsonTask<InvoiceAudit>(taskPrompt);
    return InvoiceAuditSchema.parse(modelResponse);
  } catch (error) {
    warnInvoiceAuditFailure(error);
    return null;
  }
}

async function auditInvoiceInterpretationWithTimeout(
  sourceText: string,
  structuredInvoice: StructuredInvoice,
  timeoutMs: number = AUDIT_TIMEOUT_MS
): Promise<AuditOutcome> {
  if (!sourceText.trim()) {
    return { audit: null, status: "skipped" };
  }

  return await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ audit: null, status: "timed_out" });
    }, timeoutMs);

    auditInvoiceInterpretation(sourceText, structuredInvoice)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve({ audit: result, status: "completed" });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        warnInvoiceAuditFailure(error);
        resolve({ audit: null, status: "failed" });
      });
  });
}

function warnInvoiceAuditFailure(error: unknown): void {
  if (
    process.env.NODE_ENV === "test" &&
    error instanceof Error &&
    /Mock response queue is empty/i.test(error.message)
  ) {
    return;
  }

  console.warn("Invoice audit failed", error);
}

export async function runInvoiceAuditOverlay(input: {
  sourceText: string;
  structuredInvoice: StructuredInvoice;
  lastUserMessage?: string;
}): Promise<{
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
}> {
  const sourceText = input.sourceText ?? "";
  const parsedInvoice = StructuredInvoiceSchema.parse(input.structuredInvoice);
  const sanitizedNotes = sanitizeStructuredNotes(parsedInvoice.notes);
  const taxDirective = detectExplicitTaxDirective(sourceText);
  const taxAmbiguity = detectTaxAmbiguity(sourceText);
  const audit = await auditInvoiceInterpretation(sourceText, parsedInvoice);
  if (!audit) {
    return {
      openDecisions: [],
      assumptions: normalizeAssumptions(
        sanitizedNotes.taxAmbiguityFound || (taxAmbiguity && taxDirective === "none")
          ? ["Tax assumed 0%."]
          : [],
        taxDirective
      ),
      unparsedLines: filterUnparsedLines(sanitizedNotes.removedLines)
    };
  }

  const auditDecisions = decisionsFromAudit(audit.decisions);
  const heuristicDecisions = extractAmbiguousBillingDecisions(sourceText);
  const openDecisions = filterResolvedDecisions(
    mergeDecisions(auditDecisions, heuristicDecisions),
    sourceText,
    input.lastUserMessage
  );
  const assumptions = normalizeAssumptions(
    [
      ...audit.assumptions,
      ...(sanitizedNotes.taxAmbiguityFound || (taxAmbiguity && taxDirective === "none")
        ? ["Tax assumed 0%."]
        : [])
    ],
    taxDirective
  );
  const mergedUnparsed = mergeUnparsedLines(sanitizedNotes.removedLines, audit.unparsedLines ?? []);
  const unparsedLines = filterUnparsedLines(mergedUnparsed);

  return {
    openDecisions,
    assumptions,
    unparsedLines
  };
}

function applyInlineLaborPricingFromText(
  structuredInvoice: StructuredInvoice,
  sourceText: string
): StructuredInvoice {
  if (!sourceText.trim()) {
    return structuredInvoice;
  }

  const hoursThenRate = sourceText.match(
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:@|at)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)\b/i
  );
  const rateThenHours = sourceText.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)\s*.*?(\d+(?:\.\d+)?)\s*hours?\b/i
  );

  if (!hoursThenRate && !rateThenHours) {
    return structuredInvoice;
  }

  const hours = Number(hoursThenRate?.[1] ?? rateThenHours?.[2]);
  const rate = Number(hoursThenRate?.[2] ?? rateThenHours?.[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(rate)) {
    return structuredInvoice;
  }

  const nextStructuredInvoice: StructuredInvoice = {
    ...structuredInvoice,
    workSessions: structuredInvoice.workSessions.map((session) => ({
      ...session,
      tasks: session.tasks.map((task) => ({ ...task }))
    })),
    materials: structuredInvoice.materials.map((material) => ({ ...material }))
  };

  const laborTaskRefs = extractUnpricedLaborTasks(nextStructuredInvoice);
  if (laborTaskRefs.length !== 1) {
    return structuredInvoice;
  }

  const ref = laborTaskRefs[0];
  ref.task.hours = roundToCents(hours);
  ref.task.rate = roundToCents(rate);
  ref.task.amount = roundToCents(hours * rate);

  return nextStructuredInvoice;
}

function applyInlineLaborMinutesFromText(
  structuredInvoice: StructuredInvoice,
  sourceText: string
): StructuredInvoice {
  if (!sourceText.trim()) {
    return structuredInvoice;
  }

  const minutesThenRate = sourceText.match(
    /(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)\s*(?:@|at)\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)\b/i
  );
  const rateThenMinutes = sourceText.match(
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\/hr|per hour|hr)\s*.*?(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)\b/i
  );

  if (!minutesThenRate && !rateThenMinutes) {
    return structuredInvoice;
  }

  const minutes = Number(minutesThenRate?.[1] ?? rateThenMinutes?.[2]);
  const rate = Number(minutesThenRate?.[2] ?? rateThenMinutes?.[1]);
  if (!Number.isFinite(minutes) || !Number.isFinite(rate) || minutes <= 0 || rate <= 0) {
    return structuredInvoice;
  }

  const nextStructuredInvoice: StructuredInvoice = {
    ...structuredInvoice,
    workSessions: structuredInvoice.workSessions.map((session) => ({
      ...session,
      tasks: session.tasks.map((task) => ({ ...task }))
    })),
    materials: structuredInvoice.materials.map((material) => ({ ...material }))
  };

  const laborTaskRefs = extractUnpricedLaborTasks(nextStructuredInvoice);
  if (laborTaskRefs.length !== 1) {
    return structuredInvoice;
  }

  const ref = laborTaskRefs[0];
  const resolvedHours =
    typeof ref.task.hours === "number" && ref.task.hours > 0
      ? ref.task.hours
      : minutes / 60;
  if (!Number.isFinite(resolvedHours) || resolvedHours <= 0) {
    return structuredInvoice;
  }

  ref.task.hours = roundToCents(resolvedHours);
  if (!(typeof ref.task.rate === "number" && ref.task.rate > 0)) {
    ref.task.rate = roundToCents(rate);
  }
  if (typeof ref.task.rate === "number" && ref.task.rate > 0 && typeof ref.task.amount !== "number") {
    ref.task.amount = roundToCents(ref.task.hours * ref.task.rate);
  }

  return nextStructuredInvoice;
}

function applyFreeLaborMinutesFromText(
  structuredInvoice: StructuredInvoice,
  sourceText: string
): StructuredInvoice {
  if (!sourceText.trim()) {
    return structuredInvoice;
  }

  const normalizedSource = sourceText.replace(/[’‘]/g, "'").replace(/[“”]/g, "\"");
  const freeChargeRegex = /\b(?:did\s+not\s+charge|didn't\s+charge|didnt\s+charge|no\s+charge|free)\b/i;
  const sentenceSignals = normalizedSource
    .split(/\r?\n|[.!?]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((sentence, index) => ({
      index,
      sentence,
      minutesMatch: sentence.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)\b/i),
      hasFreeCharge: freeChargeRegex.test(sentence)
    }));

  const directMatch = sentenceSignals.find(
    ({ minutesMatch, hasFreeCharge }) => Boolean(minutesMatch) && hasFreeCharge
  );
  const contextualMatch =
    directMatch ??
    sentenceSignals.find(
      ({ index, minutesMatch }) =>
        Boolean(minutesMatch) &&
        sentenceSignals.some(
          (candidate) => candidate.hasFreeCharge && Math.abs(candidate.index - index) <= 1
        )
    );

  if (!contextualMatch) {
    return structuredInvoice;
  }

  const nextStructuredInvoice: StructuredInvoice = {
    ...structuredInvoice,
    workSessions: structuredInvoice.workSessions.map((session) => ({
      ...session,
      tasks: session.tasks.map((task) => ({ ...task }))
    })),
    materials: structuredInvoice.materials.map((material) => ({ ...material }))
  };

  const freeTasks: Task[] = [];
  nextStructuredInvoice.workSessions.forEach((session) => {
    session.tasks.forEach((task) => {
      if (typeof task.amount === "number" && task.amount === 0) {
        const hasHours = typeof task.hours === "number" && task.hours > 0;
        if (!hasHours) {
          freeTasks.push(task);
        }
      }
    });
  });

  if (freeTasks.length !== 1) {
    return structuredInvoice;
  }

  const minutesValue = Number(contextualMatch.minutesMatch?.[1]);
  if (!Number.isFinite(minutesValue) || minutesValue <= 0) {
    return structuredInvoice;
  }

  freeTasks[0].hours = roundToCents(minutesValue / 60);
  return nextStructuredInvoice;
}

async function generateFinishedInvoice(structuredInvoice: StructuredInvoice): Promise<FinishedInvoice> {
  const laborLineItems = structuredInvoice.workSessions.flatMap((session) =>
    session.tasks.map((task) => buildLaborLineItem(task, session.date))
  );
  const materialLineItems = structuredInvoice.materials.map((material) => buildMaterialLineItem(material));

  const invoice: FinishedInvoice = {
    documentType: "invoice",
    invoiceNumber: structuredInvoice.invoiceNumber ?? generateInvoiceNumber(),
    issueDate: structuredInvoice.issueDate,
    dueDate: structuredInvoice.dueDate,
    servicePeriodStart: structuredInvoice.servicePeriodStart,
    servicePeriodEnd: structuredInvoice.servicePeriodEnd,
    customerName: structuredInvoice.customerName,
    currency: "USD",
    lineItems: [...laborLineItems, ...materialLineItems],
    notes: structuredInvoice.notes
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(invoice));
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ymd}-${suffix}`;
}

function buildSourceText(input: CreateInvoiceInput): string {
  const messyInput = input.messyInput?.trim();
  const uploadedInvoiceText = input.uploadedInvoiceText?.trim();
  const parts: string[] = [];

  if (messyInput) {
    parts.push(`Messy job notes:\n${messyInput}`);
  }

  if (uploadedInvoiceText) {
    parts.push(`Uploaded invoice text:\n${uploadedInvoiceText}`);
  }

  if (!parts.length) {
    throw new Error("Provide messyInput text, uploadedInvoiceText, or both.");
  }

  return parts.join("\n\n---\n\n");
}

function applyExplicitServicePeriod(
  invoice: StructuredInvoice,
  sourceText: string
): StructuredInvoice {
  void sourceText;
  const explicitDates = collectExplicitSessionDateLabels(invoice);
  if (explicitDates.length === 0) {
    return invoice;
  }
  const hasExplicitStart = isExplicitDate(invoice.servicePeriodStart);
  const hasExplicitEnd = isExplicitDate(invoice.servicePeriodEnd);
  if (hasExplicitStart && hasExplicitEnd) {
    return invoice;
  }
  const sorted = explicitDates
    .slice()
    .sort((a, b) => dateLabelSortIndex(a) - dateLabelSortIndex(b));
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const nextServicePeriodStart = hasExplicitStart ? invoice.servicePeriodStart : earliest;
  const nextServicePeriodEnd = hasExplicitEnd
    ? invoice.servicePeriodEnd
    : invoice.servicePeriodEnd ?? (sorted.length > 1 ? latest : nextServicePeriodStart ?? earliest);
  return {
    ...invoice,
    servicePeriodStart: nextServicePeriodStart,
    servicePeriodEnd: nextServicePeriodEnd
  };
}

function collectExplicitSessionDateLabels(invoice: StructuredInvoice): string[] {
  const labels = new Set<string>();
  invoice.workSessions.forEach((session) => {
    const label = extractExplicitDateLabel(session.date);
    if (label) {
      labels.add(label);
    }
  });
  return Array.from(labels);
}

function dateLabelSortIndex(label: string): number {
  const lower = label.toLowerCase();
  for (let idx = 0; idx < MONTHS.length; idx += 1) {
    const month = MONTHS[idx];
    const match = lower.match(new RegExp(`\\b${month}\\s+(\\d{1,2})\\b`));
    if (match) {
      return idx * 32 + Number(match[1]);
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function buildServicePeriodAssumption(invoice: StructuredInvoice): string | null {
  const explicitDates = collectExplicitSessionDateLabels(invoice);
  if (explicitDates.length < 2) {
    return null;
  }
  const sorted = explicitDates
    .slice()
    .sort((a, b) => dateLabelSortIndex(a) - dateLabelSortIndex(b));
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const start = invoice.servicePeriodStart?.trim();
  const end = invoice.servicePeriodEnd?.trim();
  if (!start || !end || start === end) {
    return null;
  }
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalize(start) !== normalize(earliest) || normalize(end) !== normalize(latest)) {
    return null;
  }
  return `Service period set to ${earliest} to ${latest}.`;
}

const CHUNK_THRESHOLD = 4000;
const CHUNK_MAX_CHARS = 2000;
const CHUNK_LIMIT = 4;
const AUDIT_TIMEOUT_MS = 2500;

function shouldChunkInput(messyInput?: string, uploadedInvoiceText?: string): boolean {
  if (!messyInput || uploadedInvoiceText) {
    return false;
  }
  return messyInput.length > CHUNK_THRESHOLD;
}

function splitInputIntoChunks(input: string): string[] {
  const paragraphs = input
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return [input];
  }
  const chunks: string[] = [];
  let current = "";
  paragraphs.forEach((paragraph) => {
    const separator = current ? "\n\n" : "";
    if (current && current.length + separator.length + paragraph.length > CHUNK_MAX_CHARS) {
      chunks.push(current);
      current = paragraph;
      return;
    }
    current = `${current}${separator}${paragraph}`;
  });
  if (current) {
    chunks.push(current);
  }
  if (chunks.length > CHUNK_LIMIT) {
    return chunks.slice(0, CHUNK_LIMIT);
  }
  return chunks;
}

function mergeNotes(primary?: string, secondary?: string): string | undefined {
  const lines = new Set<string>();
  [primary, secondary]
    .filter(Boolean)
    .flatMap((value) => value?.split(/\r?\n+/) ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => lines.add(line));
  if (!lines.size) {
    return undefined;
  }
  return Array.from(lines).join("\n");
}

function mergeStructuredInvoices(
  base: StructuredInvoice,
  next: StructuredInvoice
): StructuredInvoice {
  return {
    customerName: base.customerName ?? next.customerName,
    invoiceNumber: base.invoiceNumber ?? next.invoiceNumber,
    issueDate: base.issueDate ?? next.issueDate,
    servicePeriodStart: base.servicePeriodStart ?? next.servicePeriodStart,
    servicePeriodEnd: base.servicePeriodEnd ?? next.servicePeriodEnd,
    workSessions: [...base.workSessions, ...next.workSessions],
    materials: [...base.materials, ...next.materials],
    notes: mergeNotes(base.notes, next.notes)
  };
}

async function parseStructuredInvoiceFromChunks(input: string): Promise<StructuredInvoice> {
  const chunks = splitInputIntoChunks(input);
  let merged: StructuredInvoice | null = null;
  for (const chunk of chunks) {
    const chunkSource = buildSourceText({ messyInput: chunk });
    const parsed = await parseMessyInputToStructuredInvoice(chunkSource);
    merged = merged ? mergeStructuredInvoices(merged, parsed) : parsed;
  }
  if (!merged) {
    return StructuredInvoiceSchema.parse({
      workSessions: [],
      materials: []
    });
  }
  return merged;
}

function applyCustomerNameFallback(
  invoice: StructuredInvoice,
  sourceText: string
): StructuredInvoice {
  if (invoice.customerName && invoice.customerName.trim()) {
    return invoice;
  }
  const fallbackName = extractCustomerNameFromSource(sourceText);
  if (!fallbackName) {
    return invoice;
  }
  return {
    ...invoice,
    customerName: fallbackName
  };
}

function extractCustomerNameFromSource(sourceText: string): string | undefined {
  if (!sourceText.trim()) {
    return undefined;
  }
  const normalizedSource = sourceText
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"");
  const lines = normalizedSource
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  const nameToken = "[\\p{L}][\\p{L}'.-]+";
  const namePattern = `${nameToken}(?:\\s+${nameToken}){1,4}`;
  const billRegex = new RegExp(`\\b(?:bill to|bill)\\s+(${namePattern})`, "iu");
  const clientRegex = new RegExp(`\\b(?:client|customer)\\s*[:\\-]\\s*(${namePattern})`, "iu");
  const parenRegex = new RegExp(`\\((${namePattern}),\\s*\\d{1,5}\\s+[^)]+\\)`, "iu");
  const addressRegex = new RegExp(`(${namePattern}),\\s*\\d{1,5}\\s+[\\p{L}0-9.\\s]+\\b`, "iu");

  lines.forEach((line) => {
    const billMatch = line.match(billRegex);
    if (billMatch?.[1]) {
      candidates.push(billMatch[1]);
      return;
    }
    const clientMatch = line.match(clientRegex);
    if (clientMatch?.[1]) {
      candidates.push(clientMatch[1]);
      return;
    }
    const parenMatch = line.match(parenRegex);
    if (parenMatch?.[1]) {
      candidates.push(parenMatch[1]);
      return;
    }
    const addressMatch = line.match(addressRegex);
    if (addressMatch?.[1]) {
      candidates.push(addressMatch[1]);
    }
  });

  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[^\p{L}\p{N}\s.'-]/gu, "").trim();
    if (!cleaned) {
      continue;
    }
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      continue;
    }
    if (cleaned.length > 60) {
      continue;
    }
    if (/\d/.test(cleaned) || /@/.test(cleaned)) {
      continue;
    }
    const stopWords = new Set([
      "jan",
      "january",
      "feb",
      "february",
      "mar",
      "march",
      "apr",
      "april",
      "may",
      "jun",
      "june",
      "jul",
      "july",
      "aug",
      "august",
      "sep",
      "sept",
      "september",
      "oct",
      "october",
      "nov",
      "november",
      "dec",
      "december",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "labor",
      "invoice",
      "service",
      "visit",
      "job",
      "task",
      "parts",
      "material",
      "materials"
    ]);
    const invalid = words.some((word) => stopWords.has(word.toLowerCase()));
    if (invalid) {
      continue;
    }
    return cleaned;
  }

  return undefined;
}

function needsLaborPricingFollowUp(laborTasks: LaborTaskRef[]): boolean {
  return laborTasks.length > 0;
}

function applyLaborPricing(structuredInvoice: StructuredInvoice, laborPricing: LaborPricingChoice): StructuredInvoice {
  const nextStructuredInvoice: StructuredInvoice = {
    ...structuredInvoice,
    workSessions: structuredInvoice.workSessions.map((session) => ({
      ...session,
      tasks: session.tasks.map((task) => ({ ...task }))
    })),
    materials: structuredInvoice.materials.map((material) => ({ ...material }))
  };

  const laborTaskRefs = extractUnpricedLaborTasks(nextStructuredInvoice);

  if (!laborTaskRefs.length) {
    throw new Error("Labor pricing follow-up was provided, but no unpriced labor tasks were found.");
  }

  if (laborPricing.billingType === "hourly") {
    if (laborPricing.lineHours.length !== laborTaskRefs.length) {
      throw new Error("Please provide hours for every labor line item.");
    }

    laborTaskRefs.forEach((ref, index) => {
      const hours = laborPricing.lineHours[index];
      ref.task.hours = roundToCents(hours);
      ref.task.rate = roundToCents(laborPricing.rate);
      ref.task.amount = roundToCents(hours * laborPricing.rate);
    });

    return nextStructuredInvoice;
  }

  const amountShares = splitAcrossItems(laborPricing.flatAmount, laborTaskRefs.length);
  laborTaskRefs.forEach((ref, index) => {
    ref.task.hours = undefined;
    ref.task.rate = undefined;
    ref.task.amount = amountShares[index];
  });

  return nextStructuredInvoice;
}

function splitAcrossItems(total: number, itemCount: number): number[] {
  if (itemCount <= 0) {
    return [];
  }

  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / itemCount);
  const remainder = totalCents - base * itemCount;

  return Array.from({ length: itemCount }, (_value, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

type LaborTaskRef = {
  task: Task;
  date?: string;
};

function extractUnpricedLaborTasks(structuredInvoice: StructuredInvoice): LaborTaskRef[] {
  return structuredInvoice.workSessions.flatMap((session) =>
    session.tasks
      .filter((task) => !isLaborTaskPriced(task))
      .map((task) => ({
        task,
        date: session.date
      }))
  );
}

function isLaborTaskPriced(task: Task): boolean {
  if (typeof task.amount === "number") {
    return true;
  }

  return typeof task.hours === "number" && task.hours > 0 && typeof task.rate === "number" && task.rate > 0;
}

const UNCERTAINTY_PHRASES = [
  "up to you",
  "if it makes sense",
  "if that makes sense",
  "i guess",
  "i suppose",
  "not sure",
  "unsure",
  "sometimes",
  "maybe",
  "if needed",
  "as needed",
  "if you think",
  "depends",
  "depending"
];

function splitIntoSentences(sourceText: string): string[] {
  return sourceText
    .split(/(?:\r?\n)+|(?<!\d)[.!?]+(?!\d)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function detectOpenDecisionsFromText(sourceText: string, lastUserMessage?: string): OpenDecision[] {
  if (!sourceText) {
    return [];
  }
  const sentences = splitIntoSentences(sourceText);
  const sentenceHasUncertainty = sentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    return UNCERTAINTY_PHRASES.some((phrase) => lower.includes(phrase));
  });
  const taxSentenceIndices = new Set<number>();
  sentences.forEach((sentence, index) => {
    if (/\btax\b/i.test(sentence)) {
      taxSentenceIndices.add(index);
    }
  });
  const decisions = new Map<string, { decision: OpenDecision; index: number }>();

  const actionVerbs =
    /\b(fixed|repair(?:ed)?|install(?:ed)?|replace(?:d)?|tighten(?:ed)?|adjust(?:ed)?|inspect(?:ed)?|clean(?:ed)?|swap(?:ped)?|paint(?:ed)?|design(?:ed)?|refresh(?:ed)?|update(?:d)?)\b/i;
  const isLowContextBillingSentence = (sentence: string) => {
    const keywords = extractKeywords(sentence);
    const hasActionVerb = actionVerbs.test(sentence);
    const hasTimeOnly = /\b\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/i.test(sentence);
    return !hasActionVerb && hasTimeOnly && keywords.length <= 3;
  };
  const isGenericBillingFollowUp = (sentence: string) => {
    const normalized = normalizeDecisionText(sentence);
    const hasBillingLanguage = /\b(bill|charge|invoice|billing)\b/i.test(normalized);
    const hasPronoun = /\b(this|that|it|them|those|these)\b/i.test(normalized);
    const hasActionVerb = actionVerbs.test(sentence);
    return !hasActionVerb && (hasBillingLanguage || hasPronoun || normalized.includes("up to you"));
  };

  const isLikelyTaxSentence = (sentence: string, index: number) => {
    if (taxSentenceIndices.size === 0) {
      return false;
    }
    const normalized = normalizeDecisionText(sentence);
    const hasPercent =
      /\d+(?:\.\d+)?%/.test(sentence) || /\bpercent\b/i.test(sentence);
    const hasAddIntent = /\b(add|apply|charge|include)\b/i.test(normalized);
    const hasAmbiguity =
      /\b(sometimes|depends|depending|maybe|not sure|unsure|if applicable|unless specified)\b/i.test(
        normalized
      );
    const hasTaxWord = /\btax\b/i.test(normalized);
    const priorIsTax = taxSentenceIndices.has(index - 1);
    return (hasTaxWord || priorIsTax) && hasPercent && hasAddIntent && hasAmbiguity;
  };

  sentences.forEach((sentence, index) => {
    const lower = sentence.toLowerCase();
    const hasUncertainty = sentenceHasUncertainty[index];
    if (!hasUncertainty) {
      return;
    }
    if (isLikelyTaxSentence(sentence, index)) {
      return;
    }
    let decisionSentence = sentence;
    if (index > 0 && isLowContextBillingSentence(sentence)) {
      decisionSentence = `${sentences[index - 1]} ${sentence}`;
    } else if (index > 0 && isGenericBillingFollowUp(sentence)) {
      const previousSentence = sentences[index - 1];
      const previousHasActionVerb = actionVerbs.test(previousSentence);
      if (previousHasActionVerb) {
        if (sentenceHasUncertainty[index - 1]) {
          decisionSentence = previousSentence;
        } else {
          decisionSentence = `${previousSentence} ${sentence}`;
        }
      }
    }
    const decision = buildDecisionFromSentence(decisionSentence);
    if (!decision) {
      return;
    }
    const prompt = decision.prompt;
    const id = `decision-${hashString(prompt)}`;
    const entry = {
      ...decision,
      id,
      sourceSnippet: sentence
    };
    const existing = decisions.get(id);
    if (!existing || index >= existing.index) {
      decisions.set(id, { decision: entry, index });
    }
  });

  const resolutionCandidates = sentences.map((sentence, index) => ({
    text: sentence,
    index
  }));
  const trimmedLastMessage = lastUserMessage?.trim();
  if (trimmedLastMessage) {
    resolutionCandidates.push({ text: trimmedLastMessage, index: sentences.length + 1 });
  }

  if (!resolutionCandidates.length) {
    return dedupeOverlappingBillingDecisions(
      Array.from(decisions.values()).map((entry) => entry.decision)
    );
  }

  const unresolved: OpenDecision[] = [];
  decisions.forEach(({ decision, index }) => {
    let resolved = false;
    let lastReason: string | undefined;
    let lastCandidateText: string | undefined;
    for (const candidate of resolutionCandidates) {
      if (candidate.index <= index) {
        continue;
      }
      const result = evaluateDecisionResolution(decision, candidate.text);
      lastReason = result.reason;
      lastCandidateText = candidate.text;
      if (result.resolved) {
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      logDecisionUnresolved(
        decision,
        lastReason ?? "resolution_candidate_missing",
        lastCandidateText ? normalizeDecisionText(lastCandidateText) : undefined
      );
      unresolved.push(decision);
    }
  });

  return dedupeOverlappingBillingDecisions(unresolved);
}

function decisionsFromAudit(
  decisions: Array<{ kind: "tax" | "billing"; prompt: string; sourceSnippet?: string }>
): OpenDecision[] {
  return decisions.map((decision) => ({
    id: `decision-${hashString(decision.prompt)}`,
    kind: decision.kind,
    prompt: decision.prompt,
    sourceSnippet: decision.sourceSnippet,
    keywords: extractKeywords([decision.prompt, decision.sourceSnippet ?? ""].join(" "))
  }));
}

function filterResolvedDecisions(
  decisions: OpenDecision[],
  sourceText: string,
  lastUserMessage?: string
): OpenDecision[] {
  const candidateTexts = splitIntoSentences(sourceText)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const trimmedLast = lastUserMessage?.trim();
  if (trimmedLast) {
    candidateTexts.push(trimmedLast);
  }

  if (!candidateTexts.length) {
    return decisions;
  }

  return decisions.filter((decision) => {
    const resolved = candidateTexts.some((candidate) =>
      evaluateDecisionResolution(decision, candidate).resolved
    );
    if (resolved) {
      return false;
    }
    if (trimmedLast) {
      const result = evaluateDecisionResolution(decision, trimmedLast);
      if (!result.resolved) {
        logDecisionUnresolved(
          decision,
          result.reason ?? "resolution_mismatch",
          normalizeDecisionText(trimmedLast)
        );
      }
    }
    return true;
  });
}

function mergeDecisions(primary: OpenDecision[], secondary: OpenDecision[]): OpenDecision[] {
  const merged = new Map<string, OpenDecision>();
  primary.forEach((decision) => merged.set(decision.id, decision));
  secondary.forEach((decision) => {
    if (merged.has(decision.id)) {
      return;
    }
    merged.set(decision.id, decision);
  });

  return dedupeOverlappingBillingDecisions(Array.from(merged.values()));
}

function normalizeOpenDecisions(decisions: OpenDecision[]): OpenDecision[] {
  return decisions.map((decision) => ({
    ...decision,
    id: decision.id || `decision-${hashString(decision.prompt)}`,
    keywords:
      Array.isArray(decision.keywords) && decision.keywords.length > 0
        ? decision.keywords
        : extractKeywords([decision.prompt, decision.sourceSnippet ?? ""].join(" "))
  }));
}

function cloneStructuredInvoice(structuredInvoice: StructuredInvoice): StructuredInvoice {
  return {
    ...structuredInvoice,
    workSessions: structuredInvoice.workSessions.map((session) => ({
      ...session,
      tasks: session.tasks.map((task) => ({ ...task }))
    })),
    materials: structuredInvoice.materials.map((material) => ({ ...material }))
  };
}

function selectTargetDecisions(
  openDecisions: OpenDecision[],
  decisionAction: DecisionAction
): OpenDecision[] {
  if (!openDecisions.length) {
    return [];
  }
  if (decisionAction.type === "bulk_include" || decisionAction.type === "bulk_exclude") {
    return openDecisions;
  }

  const expectedKind =
    decisionAction.type === "tax_apply" || decisionAction.type === "tax_skip"
      ? "tax"
      : decisionAction.kind;
  const candidateDecisions =
    expectedKind === "tax" || expectedKind === "billing"
      ? openDecisions.filter((decision) => decision.kind === expectedKind)
      : openDecisions;
  if (!candidateDecisions.length) {
    return [];
  }

  if (decisionAction.id) {
    const byId =
      candidateDecisions.find((decision) => decision.id === decisionAction.id) ??
      openDecisions.find((decision) => decision.id === decisionAction.id);
    if (byId) {
      return [byId];
    }
  }

  if (decisionAction.snippet) {
    const bySnippet = findDecisionBySnippet(candidateDecisions, decisionAction.snippet);
    if (bySnippet) {
      return [bySnippet];
    }
  }

  return [candidateDecisions[0]];
}

function findDecisionBySnippet(
  decisions: OpenDecision[],
  snippet: string
): OpenDecision | undefined {
  const normalizedSnippet = normalizeDecisionText(snippet);
  if (!normalizedSnippet) {
    return undefined;
  }
  const snippetKeywords = new Set(expandKeywordVariants(extractKeywords(normalizedSnippet)));
  let bestDecision: OpenDecision | undefined;
  let bestScore = -1;

  decisions.forEach((decision) => {
    let score = 0;
    const decisionKeywords = buildDecisionContextKeywords(decision);
    const overlap = countKeywordOverlap(decisionKeywords, snippetKeywords);
    score += overlap * 3;

    const normalizedPrompt = normalizeDecisionText(decision.prompt ?? "");
    const normalizedSource = normalizeDecisionText(decision.sourceSnippet ?? "");
    if (normalizedPrompt.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedPrompt)) {
      score += 4;
    }
    if (normalizedSource.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedSource)) {
      score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDecision = decision;
    }
  });

  return bestScore > 0 ? bestDecision : undefined;
}

function applyBillingExclusionToStructuredInvoice(
  structuredInvoice: StructuredInvoice,
  decision: OpenDecision
): StructuredInvoice {
  const decisionKeywords = buildDecisionContextKeywords(decision);
  if (!decisionKeywords.size) {
    return structuredInvoice;
  }
  const overlapThreshold = decisionKeywords.size <= 2 ? 1 : 2;
  const shouldExclude = (description: string) => {
    const itemKeywords = new Set(expandKeywordVariants(extractKeywords(description)));
    if (!itemKeywords.size) {
      return false;
    }
    const overlap = countKeywordOverlap(decisionKeywords, itemKeywords);
    return overlap >= overlapThreshold;
  };

  let hasChanges = false;
  const nextWorkSessions = structuredInvoice.workSessions.map((session) => ({
    ...session,
    tasks: session.tasks.map((task) => {
      if (!shouldExclude(task.description)) {
        return task;
      }
      hasChanges = true;
      return {
        ...task,
        rate: typeof task.rate === "number" ? 0 : task.rate,
        amount: 0
      };
    })
  }));
  const nextMaterials = structuredInvoice.materials.map((material) => {
    if (!shouldExclude(material.description)) {
      return material;
    }
    hasChanges = true;
    return {
      ...material,
      unitCost: typeof material.unitCost === "number" ? 0 : material.unitCost,
      amount: 0
    };
  });

  if (!hasChanges) {
    return structuredInvoice;
  }

  return {
    ...structuredInvoice,
    workSessions: nextWorkSessions,
    materials: nextMaterials
  };
}

function sanitizeTaxRate(taxRate?: string): string | undefined {
  if (!taxRate) {
    return undefined;
  }
  const parsed = Number.parseFloat(taxRate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return undefined;
  }
  return String(roundToCents(parsed));
}

function extractTaxRateFromDecision(decision: OpenDecision): string | undefined {
  const text = [decision.prompt, decision.sourceSnippet ?? ""].join(" ");
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return undefined;
  }
  return String(roundToCents(parsed));
}

function filterAssumptionsAfterDecisionAction(
  assumptions: string[],
  openDecisions: OpenDecision[],
  taxApplySelected: boolean,
  taxSkipSelected: boolean
): string[] {
  const filtered = filterAssumptionsAgainstDecisions(assumptions, openDecisions).filter(
    (assumption) => assumption.trim().length > 0
  );
  if (taxApplySelected) {
    return filtered.filter((assumption) => !/tax assumed 0%/i.test(assumption));
  }
  if (taxSkipSelected) {
    const hasTaxAssumption = filtered.some((assumption) => /tax assumed 0%/i.test(assumption));
    if (!hasTaxAssumption) {
      return [...filtered, "Tax assumed 0%."];
    }
  }
  return filtered;
}

const GENERIC_DECISION_TERMS = new Set([
  "bill",
  "billing",
  "charge",
  "charged",
  "invoice",
  "item",
  "confirm",
  "apply",
  "add",
  "include",
  "added",
  "needs",
  "needed",
  "decision",
  "should"
]);

function buildDecisionContextKeywords(decision: OpenDecision): Set<string> {
  const baseKeywords = decision.keywords ?? [];
  const promptKeywords = extractKeywords(decision.prompt ?? "");
  const snippetKeywords = extractKeywords(decision.sourceSnippet ?? "");
  const combined = expandKeywordVariants([...baseKeywords, ...promptKeywords, ...snippetKeywords]);
  return new Set(
    combined.filter((keyword) => keyword.length >= 4 && !GENERIC_DECISION_TERMS.has(keyword))
  );
}

function countKeywordOverlap(primary: Set<string>, secondary: Set<string>): number {
  let overlap = 0;
  primary.forEach((keyword) => {
    if (secondary.has(keyword)) {
      overlap += 1;
    }
  });
  return overlap;
}

function isGenericBillingDecision(decision: OpenDecision): boolean {
  if (decision.kind !== "billing") {
    return false;
  }
  const normalizedPrompt = normalizeDecisionText(decision.prompt ?? "");
  return normalizedPrompt.startsWith("bill this item") || normalizedPrompt.startsWith("confirm ");
}

function dedupeOverlappingBillingDecisions(decisions: OpenDecision[]): OpenDecision[] {
  if (decisions.length <= 1) {
    return decisions;
  }

  const deduped: OpenDecision[] = [];
  const seenPrompts = new Set<string>();

  decisions.forEach((decision) => {
    const normalizedPromptText = normalizeDecisionText(decision.prompt ?? "");
    const promptKey = `${decision.kind}:${normalizedPromptText}`;
    if (seenPrompts.has(promptKey)) {
      return;
    }

    if (decision.kind !== "billing") {
      deduped.push(decision);
      seenPrompts.add(promptKey);
      return;
    }

    const candidateKeywords = buildDecisionContextKeywords(decision);
    const candidateIsGeneric = isGenericBillingDecision(decision);
    let merged = false;

    for (let index = 0; index < deduped.length; index += 1) {
      const existing = deduped[index];
      if (existing.kind !== "billing") {
        continue;
      }
      const existingNormalizedPrompt = normalizeDecisionText(existing.prompt ?? "");
      const existingKeywords = buildDecisionContextKeywords(existing);
      const overlapCount = countKeywordOverlap(candidateKeywords, existingKeywords);
      if (overlapCount < 2) {
        continue;
      }

      const existingIsGeneric = isGenericBillingDecision(existing);
      const promptsOverlap =
        normalizedPromptText.includes(existingNormalizedPrompt) ||
        existingNormalizedPrompt.includes(normalizedPromptText);
      if (!candidateIsGeneric && !existingIsGeneric && !promptsOverlap) {
        continue;
      }
      if (candidateIsGeneric && !existingIsGeneric) {
        merged = true;
        break;
      }
      if (!candidateIsGeneric && existingIsGeneric) {
        deduped[index] = decision;
        seenPrompts.add(promptKey);
        merged = true;
        break;
      }

      const candidateScore = candidateKeywords.size + (candidateIsGeneric ? 0 : 2);
      const existingScore = existingKeywords.size + (existingIsGeneric ? 0 : 2);
      if (candidateScore > existingScore) {
        deduped[index] = decision;
        seenPrompts.add(promptKey);
      }
      merged = true;
      break;
    }

    if (!merged) {
      deduped.push(decision);
      seenPrompts.add(promptKey);
    }
  });

  return deduped;
}

function extractAmbiguousBillingDecisions(sourceText: string): OpenDecision[] {
  const sentences = splitIntoSentences(sourceText);
  if (!sentences.length) {
    return [];
  }

  const noChargeMarkers =
    /\b(no charge|no-charge|didn't charge|did not charge|not charged|no cost|complimentary|free)\b/i;
  const ambiguousMarkers =
    /\b(maybe|might|not sure|unsure|up to you|do what makes sense|if you want|if needed|optional)\b/i;
  const billingMarkers = /\b(bill|charge|invoice|include)\b/i;
  const actionVerbs =
    /\b(fixed|repair(?:ed)?|installed|replaced|tightened|adjusted|inspected|cleaned|patched|paint(?:ed)?|tuned|tweak(?:ed)?|designed|updated)\b/i;

  const decisions: OpenDecision[] = [];
  sentences.forEach((sentence) => {
    const normalizedSentence = normalizeDecisionText(sentence);
    if (noChargeMarkers.test(normalizedSentence)) {
      return;
    }
    if (!ambiguousMarkers.test(sentence)) {
      return;
    }
    if (sentence.toLowerCase().includes("tax")) {
      return;
    }
    if (!billingMarkers.test(sentence) && !actionVerbs.test(sentence)) {
      return;
    }
    const snippet = sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
    const prompt = `Bill this item? \"${snippet}\"`;
    decisions.push({
      id: `decision-${hashString(prompt)}`,
      kind: "billing",
      prompt,
      sourceSnippet: snippet,
      keywords: extractKeywords(sentence)
    });
  });

  return decisions;
}

function identifyOptionalLaborTasks(
  structuredInvoice: StructuredInvoice,
  sourceText: string
): Set<string> {
  const decisions = extractAmbiguousBillingDecisions(sourceText);
  if (!decisions.length) {
    return new Set();
  }
  const decisionKeywordSets = decisions.map((decision) => {
    const keywords = decision.keywords ?? extractKeywords(decision.sourceSnippet ?? decision.prompt);
    return new Set(keywords);
  });
  const optionalTasks = new Set<string>();

  structuredInvoice.workSessions.forEach((session) => {
    session.tasks.forEach((task) => {
      const taskKeywords = new Set(extractKeywords(task.description));
      const matchesDecision = decisionKeywordSets.some((decisionKeywords) => {
        let overlapCount = 0;
        taskKeywords.forEach((keyword) => {
          if (decisionKeywords.has(keyword)) {
            overlapCount += 1;
          }
        });
        return overlapCount >= 2;
      });
      if (matchesDecision) {
        optionalTasks.add(normalizeDecisionText(task.description));
      }
    });
  });

  return optionalTasks;
}

function sanitizeStructuredNotes(notes?: string): {
  cleanedNotes?: string;
  removedLines: string[];
  taxAmbiguityFound: boolean;
} {
  if (!notes || !notes.trim()) {
    return { cleanedNotes: notes, removedLines: [], taxAmbiguityFound: false };
  }

  const lines = notes
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const internalMarkers = [
    /\bneed to\b/i,
    /\border\b/i,
    /\bnext week\b/i,
    /\breminder\b/i,
    /\bfollow up\b/i,
    /\bcall\b/i,
    /\bquote\b/i,
    /\bestimate\b/i,
    /\bdrill\b/i,
    /\btool\b/i,
    /\bpurchase\b/i,
    /\bbuy\b/i,
    /\bto do\b/i
  ];
  const decisionMarkers =
    /\b(up to you|do what makes sense|if you want|optional|not sure|unsure|maybe|if needed|as needed)\b/i;
  const taxAmbiguousMarkers =
    /\b(sometimes|maybe|if applicable|not sure|do what makes sense|might|may apply|unless specified)\b/i;
  const hasExplicitTax = (line: string) => {
    if (taxAmbiguousMarkers.test(line)) {
      return false;
    }
    return (
      /\b(apply|add|include|charge)\s+(?:sales\s+)?tax\b/i.test(line) ||
      /\btax\s+at\b/i.test(line) ||
      /\bno\s+tax\b/i.test(line) ||
      /\bwithout\s+tax\b/i.test(line) ||
      /\btax[-\s]*exempt\b/i.test(line) ||
      /\btax[-\s]*free\b/i.test(line) ||
      /\b\d+(?:\.\d+)?%\s*tax\b/i.test(line)
    );
  };

  const kept: string[] = [];
  const removed: string[] = [];
  let taxAmbiguityFound = false;

  lines.forEach((line) => {
    const isInternal = internalMarkers.some((marker) => marker.test(line));
    const hasTax = /\btax\b/i.test(line);
    const isAmbiguousTax = hasTax && taxAmbiguousMarkers.test(line) && !hasExplicitTax(line);
    if (isAmbiguousTax) {
      taxAmbiguityFound = true;
    }
    if (hasTax) {
      return;
    }
    if (decisionMarkers.test(line)) {
      return;
    }
    if (isInternal) {
      removed.push(line);
      return;
    }
    kept.push(line);
  });

  const cleanedNotes = kept.length ? kept.join("\n") : undefined;
  return { cleanedNotes, removedLines: removed, taxAmbiguityFound };
}

function applyDecisionPricingHolds(
  invoice: FinishedInvoice,
  openDecisions: OpenDecision[]
): FinishedInvoice {
  const billingDecisions = openDecisions.filter((decision) => decision.kind === "billing");
  if (billingDecisions.length === 0) {
    return invoice;
  }

  const decisionKeywords = billingDecisions.map((decision) => ({
    decision,
    keywords: new Set(decision.keywords ?? extractKeywords(decision.sourceSnippet ?? decision.prompt))
  }));

  const nextInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((item) => {
      const itemKeywords = new Set(extractKeywords(item.description));
      const matchesDecision = decisionKeywords.some(({ keywords }) => {
        let overlapCount = 0;
        keywords.forEach((keyword) => {
          if (itemKeywords.has(keyword)) {
            overlapCount += 1;
          }
        });
        return overlapCount >= 2;
      });
      if (!matchesDecision) {
        return item;
      }
      return {
        ...item,
        unitPrice: undefined,
        amount: undefined
      };
    })
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(nextInvoice));
}

function buildKeywordSet(
  structuredInvoice: StructuredInvoice,
  openDecisions: OpenDecision[] = []
): Set<string> {
  const keywords = new Set<string>();
  const addKeywords = (text?: string) => {
    if (!text) {
      return;
    }
    extractKeywords(text).forEach((keyword) => keywords.add(keyword));
  };

  addKeywords(structuredInvoice.customerName ?? "");
  addKeywords(structuredInvoice.notes ?? "");
  structuredInvoice.workSessions.forEach((session) => {
    session.tasks.forEach((task) => addKeywords(task.description));
  });
  structuredInvoice.materials.forEach((material) => addKeywords(material.description));
  openDecisions.forEach((decision) => {
    addKeywords(decision.prompt);
    addKeywords(decision.sourceSnippet ?? "");
  });

  return keywords;
}

function extractUnparsedLines(
  sourceText: string,
  structuredInvoice: StructuredInvoice,
  openDecisions: OpenDecision[] = []
): string[] {
  const text = sourceText.trim();
  if (!text) {
    return [];
  }
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const keywords = buildKeywordSet(structuredInvoice, openDecisions);
  const ignoredLine =
    /^(parts?|materials?|labor|notes?|misc|line items?|messy job notes|uploaded invoice text)\s*:?\s*$/i;
  const skipLine =
    /\b(up to you|do what makes sense|not sure|unsure|maybe|if applicable|sometimes)\b/i;
  const sessionDates = structuredInvoice.workSessions
    .map((session) => session.date?.trim().toLowerCase())
    .filter(Boolean);
  const knownAmounts = new Set<string>();
  const knownHours = new Set<string>();

  const addAmount = (value?: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    knownAmounts.add(Number(value).toFixed(2));
  };

  const addHours = (value?: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    knownHours.add(Number(value).toFixed(2));
  };

  structuredInvoice.workSessions.forEach((session) => {
    session.tasks.forEach((task) => {
      addAmount(task.amount);
      addAmount(task.rate);
      addHours(task.hours);
    });
  });
  structuredInvoice.materials.forEach((material) => {
    addAmount(material.amount);
    addAmount(material.unitCost);
  });
  const seen = new Set<string>();
  const unparsed: string[] = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (ignoredLine.test(line)) {
      continue;
    }
    if (skipLine.test(line) || /\btax\b/i.test(line)) {
      continue;
    }
    if (sessionDates.some((date) => date && lowerLine.includes(date))) {
      continue;
    }
    const dollarMatches = Array.from(line.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)).map((match) =>
      Number.parseFloat(match[1])
    );
    if (
      dollarMatches.some((value) => Number.isFinite(value) && knownAmounts.has(value.toFixed(2)))
    ) {
      continue;
    }
    const hoursMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
    if (hoursMatch) {
      const hoursValue = Number.parseFloat(hoursMatch[1]);
      if (Number.isFinite(hoursValue) && knownHours.has(hoursValue.toFixed(2))) {
        continue;
      }
    }
    const rateMatches = Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s*(?:\/hr|per hour|hr)\b/gi)).map(
      (match) => Number.parseFloat(match[1])
    );
    if (rateMatches.some((value) => Number.isFinite(value) && knownAmounts.has(value.toFixed(2)))) {
      continue;
    }
    const tokens = extractKeywords(line);
    if (!tokens.length) {
      continue;
    }
    const hasMatch = tokens.some((token) => keywords.has(token));
    if (hasMatch) {
      continue;
    }
    const normalized = normalizeDecisionText(line);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unparsed.push(line);
    if (unparsed.length >= 5) {
      break;
    }
  }

  return unparsed;
}

function mergeUnparsedLines(primary: string[], secondary: string[], maxItems = 5): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const keywordSets: Array<Set<string>> = [];
  const add = (line: string) => {
    const normalized = normalizeDecisionText(line);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    const keywords = new Set(extractKeywords(line));
    if (keywords.size > 0) {
      const overlapsExisting = keywordSets.some((existing) => {
        let overlapCount = 0;
        keywords.forEach((keyword) => {
          if (existing.has(keyword)) {
            overlapCount += 1;
          }
        });
        return overlapCount >= 2;
      });
      if (overlapsExisting) {
        return;
      }
      keywordSets.push(keywords);
    }
    seen.add(normalized);
    merged.push(line.trim());
  };
  primary.forEach(add);
  secondary.forEach(add);
  return merged.slice(0, maxItems);
}

function filterUnparsedLines(lines: string[]): string[] {
  if (!lines.length) {
    return [];
  }
  const skipPatterns = [
    /\btax\b/i,
    /\b(up to you|do what makes sense|not sure|unsure|maybe|if applicable|sometimes)\b/i
  ];
  return lines.filter((line) => {
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      return false;
    }
    if (/^\s*(bill\s+to|invoice\s+to)\b/i.test(line)) {
      return false;
    }
    if (/^\s*customer\s*[:\-]/i.test(line)) {
      return false;
    }
    if (/^\s*customer\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s*$/.test(line)) {
      return false;
    }
    if (/^\s*bill\s+[A-Z]/.test(line) && !/\$/.test(line)) {
      return false;
    }
    return true;
  });
}

function extractUserNoteCandidates(sourceText: string): string[] {
  if (!sourceText.trim()) {
    return [];
  }

  const noteMarkers =
    /\b(notes?|memo|special instructions|terms?|net\s*\d+|due|payment|payable|please|thank you|thanks|warranty|guarantee|make\s+checks?\s+payable|remit|ach|wire|bank|venmo|zelle|call|text|email|contact|access|gate|code|lockbox|entry|enter|leave|drop\s+off|pickup|schedule|availability)\b/i;
  const workMarkers =
    /\b(\d+(?:\.\d+)?\s*(?:hours?|hrs?)|\$|parts?|materials?|labor|rate|fixed|repair(?:ed)?|install(?:ed)?|replace(?:d)?|tighten(?:ed)?|adjust(?:ed)?|inspect(?:ed)?|clean(?:ed)?|service|visit)\b/i;

  const lines = sourceText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  let captureNext = false;

  lines.forEach((line) => {
    const labeled = line.match(/^(notes?|memo|special instructions|terms?)\s*[:\-]\s*(.*)$/i);
    if (labeled) {
      const rest = labeled[2]?.trim();
      if (rest) {
        candidates.push(rest);
      } else {
        captureNext = true;
      }
      return;
    }

    if (captureNext) {
      candidates.push(line);
      captureNext = false;
      return;
    }

    if (noteMarkers.test(line) && !workMarkers.test(line)) {
      candidates.push(line);
    }
  });

  return candidates;
}

function filterDecisionsAgainstInvoice(
  decisions: OpenDecision[],
  invoice: FinishedInvoice,
  taxDirective: TaxDirective,
  sourceText = ""
): OpenDecision[] {
  if (!decisions.length) {
    return decisions;
  }

  if (!hasExplicitTaxRequest(sourceText)) {
    decisions = decisions.filter((decision) => decision.kind !== "tax");
  }

  if (taxDirective !== "none") {
    decisions = decisions.filter((decision) => decision.kind !== "tax");
  }

  if (typeof invoice.discountAmount === "number" && invoice.discountAmount > 0) {
    decisions = decisions.filter((decision) => {
      const normalized = normalizeDecisionText(decision.prompt ?? "");
      if (normalized.includes("discount")) {
        return false;
      }
      return true;
    });
  }

  const laborRatesSet = new Set<string>();
  invoice.lineItems.forEach((item) => {
    if (item.type !== "labor" || typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      return;
    }
    laborRatesSet.add(item.unitPrice.toFixed(2));
  });
  const laborRates = Array.from(laborRatesSet);

  return decisions.filter((decision) => {
    const prompt = decision.prompt ?? "";
    const normalizedPrompt = normalizeDecisionText(prompt);
    const isItemBillingPrompt =
      /^bill\b/i.test(prompt) || /^confirm:/i.test(prompt);
    if (isItemBillingPrompt) {
      return true;
    }
    const mentionsRate =
      /\brate\b/i.test(prompt) ||
      /\/hr|per hour|hourly/i.test(prompt) ||
      normalizedPrompt.includes("rate");
    if (!mentionsRate || laborRates.length !== 1) {
      return true;
    }
    const promptRates = Array.from(prompt.matchAll(/\b(\d+(?:\.\d+)?)\b/g))
      .map((match) => Number.parseFloat(match[1]))
      .filter((value) => Number.isFinite(value))
      .map((value) => value.toFixed(2));
    if (!promptRates.length) {
      return true;
    }
    return !promptRates.includes(laborRates[0]);
  });
}

function filterAssumptionsAgainstDecisions(
  assumptions: string[],
  decisions: OpenDecision[]
): string[] {
  if (!assumptions.length || !decisions.length) {
    return assumptions;
  }

  const decisionKeywordSets = decisions.map((decision) => {
    const decisionText = decision.sourceSnippet ?? decision.prompt ?? "";
    return new Set(extractKeywords(decisionText));
  });
  const hasTaxDecision = decisions.some((decision) => decision.kind === "tax");

  return assumptions.filter((assumption) => {
    const normalized = normalizeDecisionText(assumption);
    if (!normalized) {
      return false;
    }
    if (hasTaxDecision && normalized.includes("tax") && normalized.includes("assum")) {
      return false;
    }
    const assumptionKeywords = new Set(extractKeywords(assumption));
    const overlapsDecision = decisionKeywordSets.some((decisionKeywords) => {
      let overlapCount = 0;
      assumptionKeywords.forEach((keyword) => {
        if (decisionKeywords.has(keyword)) {
          overlapCount += 1;
        }
      });
      return overlapCount >= 2;
    });

    const ambiguousAssumption =
      /\b(undetermined|needs confirmation|requires confirmation|decision|up to you|optional|tbd|to be decided)\b/i.test(
        normalized
      );
    if (ambiguousAssumption && overlapsDecision) {
      return false;
    }
    const isNoCharge =
      /\b(no charge|no-charge|not charged|no cost|free|complimentary)\b/i.test(normalized);
    if (!isNoCharge) {
      return !overlapsDecision;
    }
    return !overlapsDecision;
  });
}

function filterInvoiceNotes(
  invoice: FinishedInvoice,
  sourceText: string,
  decisions: OpenDecision[]
): FinishedInvoice {
  if (!invoice.notes) {
    return invoice;
  }

  const userCandidates = extractUserNoteCandidates(sourceText);
  const noteMarkers =
    /\b(notes?|memo|special instructions|terms?|net\s*\d+|due|payment|payable|please|thank you|thanks|warranty|guarantee|make\s+checks?\s+payable|remit|ach|wire|bank|venmo|zelle|call|text|email|contact|access|gate|code|lockbox|entry|enter|leave|drop\s+off|pickup|schedule|availability)\b/i;
  const workMarkers =
    /\b(\d+(?:\.\d+)?\s*(?:hours?|hrs?)|\$|parts?|materials?|labor|rate|fixed|repair(?:ed)?|install(?:ed)?|replace(?:d)?|tighten(?:ed)?|adjust(?:ed)?|inspect(?:ed)?|clean(?:ed)?|service|visit)\b/i;

  const candidateKeywordSets = userCandidates.map((line) => new Set(extractKeywords(line)));
  const decisionKeywordSets = decisions.map((decision) =>
    new Set(extractKeywords(decision.sourceSnippet ?? decision.prompt ?? ""))
  );

  const lines = invoice.notes
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const kept = lines.filter((line) => {
    const normalizedLine = normalizeDecisionText(line);
    if (!normalizedLine) {
      return false;
    }

    let keep = false;
    if (candidateKeywordSets.length === 0) {
      keep = noteMarkers.test(line) && !workMarkers.test(line);
    } else {
      const lineKeywords = new Set(extractKeywords(line));
      const overlapsCandidate = candidateKeywordSets.some((candidateKeywords) => {
        let overlapCount = 0;
        lineKeywords.forEach((keyword) => {
          if (candidateKeywords.has(keyword)) {
            overlapCount += 1;
          }
        });
        return overlapCount >= 2;
      });
      keep =
        overlapsCandidate ||
        userCandidates.some((candidate) => normalizedLine.includes(normalizeDecisionText(candidate)));
    }

    if (!keep) {
      return false;
    }

    if (decisionKeywordSets.length === 0) {
      return true;
    }
    const lineKeywords = new Set(extractKeywords(line));
    if (lineKeywords.size === 0) {
      return true;
    }
    const overlapsDecision = decisionKeywordSets.some((decisionKeywords) => {
      let overlapCount = 0;
      lineKeywords.forEach((keyword) => {
        if (decisionKeywords.has(keyword)) {
          overlapCount += 1;
        }
      });
      return overlapCount >= 2;
    });
    return !overlapsDecision;
  });

  return {
    ...invoice,
    notes: kept.length ? kept.join("\n") : undefined
  };
}

function buildDecisionFromSentence(sentence: string): Omit<OpenDecision, "id" | "sourceSnippet"> | null {
  const normalizedSentence = normalizeDecisionText(sentence);
  const lower = sentence.toLowerCase();
  if (
    /\b(no charge|no-charge|didn't charge|did not charge|not charged|no cost|complimentary|free)\b/i.test(
      normalizedSentence
    )
  ) {
    return null;
  }
  if (lower.includes("tax")) {
    const ambiguousTax =
      /\b(sometimes|maybe|if applicable|not sure|do what makes sense|might|may apply|unless specified)\b/i.test(
        lower
      );
    if (ambiguousTax) {
      return null;
    }
    const explicitTaxRequest =
      /\b(apply|add|include|charge)\s+(?:sales\s+)?tax\b/i.test(lower) ||
      /\btax\s*\?\b/i.test(lower) ||
      /\bshould\s+i\s+.*tax\b/i.test(lower) ||
      /\bwant\s+.*tax\b/i.test(lower) ||
      /\b\d+(?:\.\d+)?%\s*tax\b/i.test(lower);
    if (!explicitTaxRequest) {
      return null;
    }
    return {
      kind: "tax",
      prompt: "Apply tax?",
      keywords: ["tax"]
    };
  }
  if (lower.includes("discount")) {
    return {
      kind: "billing",
      prompt: "Apply a discount?",
      keywords: ["discount"]
    };
  }
  const label = buildDecisionLabel(sentence);
  if (lower.includes("bill") || lower.includes("charge") || lower.includes("invoice")) {
    return {
      kind: "billing",
      prompt: label ? `Bill ${label}?` : "Bill this item?",
      keywords: extractKeywords(sentence)
    };
  }
  const trimmed = label ?? buildDecisionSnippet(sentence);
  return {
    kind: "billing",
    prompt: label ? `Bill ${trimmed}?` : `Confirm: ${trimmed}`,
    keywords: extractKeywords(sentence)
  };
}

function buildDecisionSnippet(sentence: string): string {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  let cleaned = normalized.replace(
    /\b(not sure if i should bill|up to you|do what makes sense|if you think|depends|depending)\b.*$/i,
    ""
  );
  cleaned = cleaned.replace(/\bmaybe\b/gi, "");
  cleaned = cleaned.replace(/\s*[-–—]\s*$/g, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (cleaned.length > 120) {
    return `${cleaned.slice(0, 117)}...`;
  }
  return cleaned || normalized;
}

function buildDecisionLabel(sentence: string): string | null {
  const base = buildDecisionSnippet(sentence);
  if (!base) {
    return null;
  }
  let cleaned = base.trim();
  cleaned = cleaned.replace(
    /^(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b[,:-]?\s*/i,
    ""
  );
  cleaned = cleaned.replace(/^also\s+/i, "");
  cleaned = cleaned.replace(/\b(?:i|we)\b\s+/i, "");
  cleaned = cleaned.replace(/^(bill|charge|invoice)\b\s*/i, "");
  cleaned = cleaned.replace(/\bwhile\s+i\s+was\s+there\b/gi, "");
  cleaned = cleaned.replace(/\bwhile\s+was\s+there\b/gi, "");
  cleaned = cleaned.replace(/\bwhile\s+was\b/gi, "");
  cleaned = cleaned.replace(/\bduring\s+the\s+visit\b/gi, "");
  cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/gi, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  cleaned = cleaned.replace(/^[,\s]+|[,\s]+$/g, "").trim();
  cleaned = cleaned.replace(/\s*,\s*/g, " ");
  if (!cleaned) {
    return null;
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 8) {
    cleaned = words.slice(0, 8).join(" ");
  }
  return cleaned.trim();
}

type TaxDirective = "apply" | "exclude" | "none";

function normalizeAssumptions(assumptions: string[], taxDirective: TaxDirective = "none"): string[] {
  if (!assumptions.length) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  let hasTaxAssumption = false;
  const genericPatterns = [
    /\ball\s+(?:line\s+items?|items?)\s+(?:are\s+)?(captured|included|reflected|accounted)\b/i,
    /\ball\s+labor\s+and\s+materials?\s+(?:are\s+)?(captured|included|reflected|accounted)\b/i,
    /\beverything\s+(?:is\s+)?(captured|included|reflected|accounted)\b/i,
    /\bno\s+additional\s+assumptions\b/i,
    /\bno\s+other\s+assumptions\b/i
  ];

  assumptions.forEach((assumption) => {
    if (!assumption) {
      return;
    }
    const normalizedText = normalizeDecisionText(assumption);
    if (!normalizedText || seen.has(normalizedText)) {
      return;
    }
    if (taxDirective !== "none" && normalizedText.includes("tax")) {
      return;
    }
    if (genericPatterns.some((pattern) => pattern.test(normalizedText))) {
      return;
    }
    const isTaxAssumption =
      normalizedText.includes("tax") &&
      (normalizedText.includes("assum") || normalizedText.includes("0"));
    if (isTaxAssumption) {
      if (taxDirective !== "none") {
        return;
      }
      if (hasTaxAssumption) {
        return;
      }
      hasTaxAssumption = true;
      normalized.push("Tax assumed 0%.");
      seen.add(normalizedText);
      return;
    }
    seen.add(normalizedText);
    normalized.push(assumption);
  });

  return normalized;
}

function detectTaxAmbiguity(sourceText: string): boolean {
  const normalized = normalizeDecisionText(sourceText);
  if (!normalized || !normalized.includes("tax")) {
    return false;
  }
  return /\b(sometimes|maybe|might|if applicable|not sure|do what makes sense|may apply|unless specified|depends|depending)\b/i.test(
    normalized
  );
}

function detectExplicitTaxDirective(sourceText: string): TaxDirective {
  const normalized = normalizeDecisionText(sourceText);
  if (!normalized || !normalized.includes("tax")) {
    return "none";
  }

  const ambiguousTax =
    /\b(sometimes|maybe|might|if applicable|not sure|do what makes sense|may apply|unless specified)\b/i.test(
      normalized
    );
  if (ambiguousTax) {
    return "none";
  }

  const exclude =
    /\bno\s+tax\b/i.test(normalized) ||
    /\bwithout\s+tax\b/i.test(normalized) ||
    /\bdo\s+not\s+apply\s+tax\b/i.test(normalized) ||
    /\bdon(?:'|)t\s+apply\s+tax\b/i.test(normalized) ||
    /\btax\s+exempt\b/i.test(normalized) ||
    /\btax[-\s]*free\b/i.test(normalized);
  if (exclude) {
    return "exclude";
  }

  const apply =
    /\b(apply|add|include|charge)\s+(?:sales\s+)?tax\b/i.test(normalized) ||
    /\btax\s+at\b/i.test(normalized) ||
    /\bwith\s+tax\b/i.test(normalized) ||
    /\b\d+(?:\.\d+)?%\s*tax\b/i.test(normalized);
  if (apply) {
    return "apply";
  }

  return "none";
}

function hasExplicitTaxRequest(sourceText: string): boolean {
  const normalized = normalizeDecisionText(sourceText);
  if (!normalized || !normalized.includes("tax")) {
    return false;
  }
  const ambiguousTax =
    /\b(sometimes|maybe|might|if applicable|not sure|do what makes sense|may apply|unless specified)\b/i.test(
      normalized
    );
  if (ambiguousTax) {
    return false;
  }
  const raw = sourceText.toLowerCase();
  return (
    /\b(apply|add|include|charge)\s+(?:sales\s+)?tax\b/i.test(raw) ||
    /\btax\s*\?\b/i.test(raw) ||
    /\bshould\s+i\s+.*tax\b/i.test(raw) ||
    /\bdo\s+i\s+.*tax\b/i.test(raw) ||
    /\bneed\s+.*tax\b/i.test(raw) ||
    /\bwant\s+.*tax\b/i.test(raw) ||
    /\bwith\s+tax\b/i.test(raw) ||
    /\btax\s+at\b/i.test(raw) ||
    /\b\d+(?:\.\d+)?%\s*tax\b/i.test(raw)
  );
}

function hasExplicitIssueDate(sourceText: string): boolean {
  const normalized = normalizeDecisionText(sourceText);
  if (!normalized || !normalized.includes("invoice") || !normalized.includes("date")) {
    return false;
  }
  return (
    /\binvoice\s+(?:date|dated)\b/i.test(normalized) ||
    /\bissue\s+date\b/i.test(normalized) ||
    /\bdate\s+of\s+invoice\b/i.test(normalized) ||
    /\bdate\s+for\s+invoice\b/i.test(normalized) ||
    /\bdated\s+invoice\b/i.test(normalized)
  );
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeDecisionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘‛]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandKeywordVariants(words: string[]): string[] {
  const expanded = new Set<string>();
  words.forEach((word) => {
    if (!word) {
      return;
    }
    expanded.add(word);
    if (word.endsWith("s") && word.length > 4) {
      expanded.add(word.slice(0, -1));
    }
  });
  return Array.from(expanded);
}

function logDecisionUnresolved(_decision: OpenDecision, _reason: string, _resolutionText?: string) {
  return;
}

type DecisionResolutionResult = {
  resolved: boolean;
  reason?: string;
};

function evaluateDecisionResolution(decision: OpenDecision, resolutionText: string): DecisionResolutionResult {
  const normalized = normalizeDecisionText(resolutionText);
  if (!normalized) {
    return { resolved: false, reason: "resolution_text_missing" };
  }
  const hasAmbiguousResolution = UNCERTAINTY_PHRASES.some((phrase) => normalized.includes(phrase));
  if (hasAmbiguousResolution) {
    return { resolved: false, reason: "resolution_ambiguous" };
  }
  const resolutionKeywords = new Set(expandKeywordVariants(extractKeywords(normalized)));

  if (decision.kind === "tax") {
    const taxYes =
      /\b(apply|add|include|charge)\s+(?:sales\s+)?tax(?:es)?\b/i.test(normalized) ||
      /\btax\s+at\b/i.test(normalized) ||
      /\bwith\s+tax(?:es)?\b/i.test(normalized);
    const taxNo =
      /\b(no|without|exclude|skip)\s+(?:sales\s+)?tax(?:es)?\b/i.test(normalized) ||
      /\bdo\s+not\s+apply\s+tax\b/i.test(normalized) ||
      /\bdon(?:'|)t\s+apply\s+tax\b/i.test(normalized) ||
      /\btax\s+exempt\b/i.test(normalized) ||
      /\btax[-\s]*free\b/i.test(normalized);
    if (taxYes || taxNo) {
      return { resolved: true };
    }
    return { resolved: false, reason: "tax_intent_missing" };
  }

  const isDiscountDecision =
    decision.prompt.toLowerCase().includes("discount") ||
    (decision.keywords ?? []).some((keyword) => keyword === "discount");
  if (isDiscountDecision) {
    const discountYes =
      /\b(apply|add|include)\s+discount\b/i.test(normalized) ||
      /\bdiscount\s+it\b/i.test(normalized);
    const discountNo =
      /\b(no|without|exclude|skip)\s+discount\b/i.test(normalized) ||
      /\bdo\s+not\s+discount\b/i.test(normalized) ||
      /\bdon(?:'|)t\s+discount\b/i.test(normalized);
    if (discountYes || discountNo) {
      return { resolved: true };
    }
    return { resolved: false, reason: "discount_intent_missing" };
  }

  const billingNo =
    /\bno\s+charge\b/i.test(normalized) ||
    /\bdon(?:'|)t\s+bill\b/i.test(normalized) ||
    /\bdo\s+not\s+bill\b/i.test(normalized) ||
    /\bnot\s+billed\b/i.test(normalized) ||
    /\bwaive\b/i.test(normalized) ||
    /\bfree\b/i.test(normalized) ||
    /\bincluded\s+in\s+flat\b/i.test(normalized) ||
    /\bno\s+bill\b/i.test(normalized);
  const billingYes =
    !billingNo &&
    (/\b(bill|charge|invoice|include)\b/i.test(normalized) ||
      /\badd\b/i.test(normalized));

  if (!billingYes && !billingNo) {
    return { resolved: false, reason: "billing_intent_missing" };
  }

  const keywords = decision.keywords ?? [];
  const promptKeywords = extractKeywords(decision.prompt ?? "");
  const contextKeywords = expandKeywordVariants(Array.from(new Set([...keywords, ...promptKeywords])));

  const isBillToDirective = /\bbill\s+to\b/i.test(normalized);
  if (isBillToDirective) {
    const nonBillContext = contextKeywords.filter((keyword) => keyword !== "bill");
    const hasNonBillOverlap =
      nonBillContext.length > 0 &&
      nonBillContext.some((keyword) => resolutionKeywords.has(keyword) || normalized.includes(keyword));
    if (!hasNonBillOverlap) {
      return { resolved: false, reason: "bill_to_directive" };
    }
  }

  const hasContextOverlap =
    contextKeywords.length > 0 &&
    contextKeywords.some((keyword) => resolutionKeywords.has(keyword) || normalized.includes(keyword));

  if (hasContextOverlap) {
    return { resolved: true };
  }

  const refersToItem = /\b(this|that|it|them|those|these)\b/i.test(normalized);
  const hasSnippet = /\".+\"/.test(decision.prompt);
  if (refersToItem && hasSnippet) {
    return { resolved: true };
  }

  if (contextKeywords.length === 0) {
    return { resolved: true };
  }

  return { resolved: false, reason: "billing_intent_missing_context" };
}

function isDecisionResolved(
  decision: OpenDecision,
  resolutionText: string,
  options: { log?: boolean } = {}
): boolean {
  const result = evaluateDecisionResolution(decision, resolutionText);
  if (!result.resolved && options.log) {
    logDecisionUnresolved(decision, result.reason ?? "resolution_mismatch", normalizeDecisionText(resolutionText));
  }
  return result.resolved;
}

function extractKeywords(sentence: string): string[] {
  const stopWords = new Set([
    "this",
    "that",
    "with",
    "from",
    "into",
    "your",
    "their",
    "them",
    "they",
    "about",
    "maybe",
    "guess",
    "sometimes",
    "should",
    "could",
    "would",
    "might",
    "make",
    "makes",
    "sense",
    "just",
    "also",
    "like",
    "kind",
    "sort"
  ]);
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
}

type DiscountIntent =
  | { kind: "none" }
  | { kind: "apply"; amount: number; reason?: string };

function detectDiscountIntent(sourceText: string): DiscountIntent {
  const text = sourceText.trim();
  if (!text) {
    return { kind: "none" };
  }

  const explicitAmountMatch =
    text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:courtesy\s+)?(?:discount|credit|off)\b/i) ??
    text.match(/\b(?:discount|credit)\b[^$0-9]{0,25}\$?\s*(\d+(?:\.\d{1,2})?)/i) ??
    text.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?\s*)?(?:off)\b/i);

  const reasonMatch =
    text.match(/\b(?:discount|credit|off)\b[^.:\n-]{0,80}\b(?:because|for)\b([^.\n]+)/i) ??
    text.match(/\b(?:because|for)\b([^.\n]+)\b(?:discount|credit|off)/i);
  const reason = reasonMatch?.[1]?.trim();

  if (explicitAmountMatch) {
    const amount = Number(explicitAmountMatch[1]);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        kind: "apply",
        amount: roundToCents(amount),
        reason: reason && reason.length > 2 ? `Discount for ${reason}` : undefined
      };
    }
  }

  return { kind: "none" };
}

function applyDiscountToInvoice(invoice: FinishedInvoice, discountAmount: number, discountReason?: string): FinishedInvoice {
  const withDiscount: FinishedInvoice = {
    ...invoice,
    discountAmount: roundToCents(discountAmount),
    discountReason: discountReason?.trim() ? discountReason.trim() : invoice.discountReason,
    balanceDue: undefined
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(withDiscount));
}

function polishLineItemDescription(text?: string): string {
  if (!text) {
    return "";
  }
  let cleaned = text.trim().replace(/\s+/g, " ").replace(/\.+$/, "");
  if (!cleaned) {
    return "";
  }
  cleaned = cleaned.replace(/^(i|we)\s+/i, "");
  cleaned = cleaned.replace(/^did\s+(an|a|the)?\s*/i, "");
  cleaned = cleaned.replace(
    /\b(?:about|around|roughly|approximately|maybe|quickly|real quick|kind of|sort of)\b/gi,
    ""
  );
  cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:mins?|minutes?|hours?|hrs?)\b/gi, "");
  cleaned = cleaned.replace(/\b(?:at|@)\s*\$?\d+(?:\.\d+)?\s*\/?\s*(?:hr|hour)\b/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const nounMappings = [
    { re: /^(fixed|fix|repaired?|repair|patched?|patch)\s+(.+)/i, suffix: "repair" },
    { re: /^(replaced|replace|swapped?|swap)\s+(.+)/i, suffix: "replacement" },
    { re: /^(installed|install)\s+(.+)/i, suffix: "installation" },
    { re: /^(cleaned|clean)\s+(.+)/i, suffix: "cleaning" },
    { re: /^(inspected|inspect|checked|check)\s+(.+)/i, suffix: "inspection" },
    { re: /^(adjusted|adjust|tightened|tighten)\s+(.+)/i, suffix: "adjustment" },
    { re: /^(tuned|tune)\s+(.+)/i, suffix: "tuning" },
    { re: /^(painted|paint)\s+(.+)/i, suffix: "painting" },
    { re: /^(updated|update|tweaked|tweak)\s+(.+)/i, suffix: "update" },
    { re: /^(designed|design)\s+(.+)/i, suffix: "design" }
  ];
  const buildMappedPhrase = (segment: string): string | null => {
    for (const mapping of nounMappings) {
      const match = segment.match(mapping.re);
      const objectText = match?.[2]?.trim();
      if (!objectText) {
        continue;
      }
      const normalizedObject = objectText
        .replace(/^(the|a|an|my|our|your|his|her|their)\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalizedObject || normalizedObject.split(" ").length > 8) {
        continue;
      }
      return `${normalizedObject} ${mapping.suffix}`;
    }
    return null;
  };

  const compoundSegments = cleaned
    .split(/\s+(?:and|&)\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (compoundSegments.length > 1) {
    const mappedSegments = compoundSegments.map((segment) => buildMappedPhrase(segment));
    if (mappedSegments.every(Boolean)) {
      cleaned = mappedSegments.join(" and ");
    } else {
      const mappedSingle = buildMappedPhrase(cleaned);
      if (mappedSingle) {
        cleaned = mappedSingle;
      }
    }
  } else {
    const mappedSingle = buildMappedPhrase(cleaned);
    if (mappedSingle) {
      cleaned = mappedSingle;
    }
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : "";
}

function supportsDeterministicDescriptionWordingTone(tone?: string): boolean {
  const normalizedTone = tone?.trim().toLowerCase();
  return normalizedTone === "formal" || normalizedTone === "neutral";
}

function finalizeRewordedLineItemDescription(originalDescription: string, rewrittenDescription?: string): string {
  const polishedOriginal = polishLineItemDescription(originalDescription);
  const rawRewritten = (rewrittenDescription ?? "").trim();
  const polishedRewritten = polishLineItemDescription(rawRewritten);
  if (!polishedRewritten) {
    return polishedOriginal;
  }
  if (/^(?:of|for|to|and|with)\b/i.test(rawRewritten) && polishedOriginal) {
    return polishedOriginal;
  }
  if (/^(?:of|for|to|and|with)\b/i.test(polishedRewritten) && polishedOriginal) {
    return polishedOriginal;
  }
  if (
    /\b(?:replacement|installation|inspection|adjustment|cleaning|painting|tuning|update|design)\s+repair\b/i.test(
      polishedRewritten
    ) &&
    polishedOriginal
  ) {
    return polishedOriginal;
  }
  return polishedRewritten;
}

function buildLaborLineItem(task: Task, sessionDate?: string) {
  const hours = task.hours;
  const rate = task.rate;
  const amount = task.amount;
  const hasAmount = typeof amount === "number";
  const hasHours = typeof hours === "number";
  const hasRate = typeof rate === "number";
  const description = polishLineItemDescription(task.description);

  if (hasHours && hasRate && (rate > 0 || !hasAmount)) {
    return {
      type: "labor" as const,
      description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(rate),
      amount: roundToCents(typeof amount === "number" ? amount : hours * rate),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount && hasHours && hours > 0) {
    return {
      type: "labor" as const,
      description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(amount / hours),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount && hasRate && rate > 0) {
    return {
      type: "labor" as const,
      description,
      quantity: roundToCents(amount / rate),
      unitPrice: roundToCents(rate),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount) {
    return {
      type: "labor" as const,
      description,
      quantity: 1,
      unitPrice: roundToCents(amount),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasHours && !hasRate) {
    return {
      type: "labor" as const,
      description,
      quantity: roundToCents(hours),
      unitPrice: 0,
      amount: 0,
      sourceSessionDate: sessionDate
    };
  }

  if (hasRate) {
    return {
      type: "labor" as const,
      description,
      quantity: 1,
      unitPrice: roundToCents(rate),
      amount: roundToCents(rate),
      sourceSessionDate: sessionDate
    };
  }

  return {
    type: "labor" as const,
    description,
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    sourceSessionDate: sessionDate
  };
}

function buildMaterialLineItem(material: Material) {
  const quantity = typeof material.quantity === "number" ? material.quantity : 1;
  const safeQuantity = quantity > 0 ? quantity : 1;
  const description = polishLineItemDescription(material.description);

  let unitPrice: number | undefined;
  if (typeof material.unitCost === "number") {
    unitPrice = material.unitCost;
  } else if (typeof material.amount === "number") {
    unitPrice = material.amount / safeQuantity;
  }

  const amount =
    typeof material.amount === "number"
      ? material.amount
      : typeof unitPrice === "number"
        ? safeQuantity * unitPrice
        : 0;

  return {
    type: "material" as const,
    description,
    quantity: roundToCents(safeQuantity),
    unitPrice: roundToCents(unitPrice ?? 0),
    amount: roundToCents(amount)
  };
}
