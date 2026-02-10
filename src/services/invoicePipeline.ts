import { runJsonTask } from "../ai/openaiClient.js";
import { normalizeInvoice } from "../lib/invoiceMath.js";
import {
  FinishedInvoice,
  FinishedInvoiceSchema,
  InvoiceAuditSchema,
  InvoiceEditResponseSchema,
  LaborPricingChoice,
  Material,
  StructuredInvoice,
  StructuredInvoiceSchema,
  Task
} from "../models/invoice.js";

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

type OpenDecision = {
  id: string;
  kind: "tax" | "billing";
  prompt: string;
  sourceSnippet?: string;
  keywords?: string[];
};

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

type RewordFullInvoiceResponse = {
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
    applyInlineLaborMinutesFromText(
      applyInlineLaborPricingFromText(parsedInvoice, sourceText),
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
  const invoiceWithIssueDate = hasExplicitIssueDate(sourceText)
    ? invoice
    : { ...invoice, issueDate: undefined };
  const discountIntent = detectDiscountIntent(sourceText);
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

  if (discountIntent.kind === "apply") {
    return {
      kind: "invoice_ready",
      structuredInvoice: sanitizedInvoice,
      invoice: applyDiscountToInvoice(
        cleanedInvoice,
        discountIntent.amount,
        discountIntent.reason
      ),
      openDecisions: cleanedDecisions,
      assumptions: cleanedAssumptions,
      unparsedLines: cleanedUnparsed,
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
  const taxDirective = detectExplicitTaxDirective(source);
  const taxAmbiguity = detectTaxAmbiguity(source);
  const sanitizedNotes = sanitizeStructuredNotes(withLaborPricing.notes);
  const sanitizedInvoice: StructuredInvoice = {
    ...withLaborPricing,
    notes: sanitizedNotes.cleanedNotes
  };
  const invoice = await generateFinishedInvoice(sanitizedInvoice);
  const invoiceWithIssueDate = hasExplicitIssueDate(source)
    ? invoice
    : { ...invoice, issueDate: undefined };
  const discountIntent = detectDiscountIntent(source);
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

  if (discountIntent.kind === "apply") {
    return {
      kind: "invoice_ready",
      structuredInvoice: sanitizedInvoice,
      invoice: applyDiscountToInvoice(
        cleanedInvoice,
        discountIntent.amount,
        discountIntent.reason
      ),
      openDecisions: cleanedDecisions,
      assumptions: cleanedAssumptions,
      unparsedLines: cleanedUnparsed,
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
    auditStatus: auditOutcome.status
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

  const taskPrompt = [
    "Reword a single invoice line item.",
    "Keep the same meaning and professionalism.",
    "Do not change price, quantity, or unit context.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    "Return JSON with shape: {\"description\":\"...\"}.",
    `Original line description: ${JSON.stringify(targetLineItem.description)}`
  ].join("\n");

  const modelResponse = await runJsonTask<RewordSingleLineResponse>(taskPrompt);

  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((lineItem) =>
      lineItem.id === lineItemId
        ? {
            ...lineItem,
            description: modelResponse.description
          }
        : lineItem
    )
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(updatedInvoice));
}

export async function rewordFullInvoice(invoice: FinishedInvoice, tone?: string): Promise<FinishedInvoice> {
  const taskPrompt = [
    "Reword all invoice line item descriptions.",
    "Keep the same meaning and professionalism for each line.",
    "Do not change amounts, quantities, rates, dates, or IDs.",
    `Tone preference: ${tone ?? "neutral professional"}.`,
    "Return JSON with shape: {\"lineItems\":[{\"id\":\"...\",\"description\":\"...\"}],\"notes\":\"optional\"}.",
    `Invoice JSON: ${JSON.stringify(invoice)}`
  ].join("\n");

  const modelResponse = await runJsonTask<RewordFullInvoiceResponse>(taskPrompt);
  const descriptionById = new Map(modelResponse.lineItems.map((lineItem) => [lineItem.id, lineItem.description]));

  const updatedInvoice: FinishedInvoice = {
    ...invoice,
    lineItems: invoice.lineItems.map((lineItem) => ({
      ...lineItem,
      description: descriptionById.get(lineItem.id ?? "") ?? lineItem.description
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
    console.warn("Invoice audit failed", error);
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
      console.warn("[audit:timeout]", { timeoutMs });
      resolve({ audit: null, status: "timed_out" });
    }, timeoutMs);

    auditInvoiceInterpretation(sourceText, structuredInvoice)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve({ audit: result, status: "completed" });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.warn("Invoice audit failed", error);
        resolve({ audit: null, status: "failed" });
      });
  });
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

async function generateFinishedInvoice(structuredInvoice: StructuredInvoice): Promise<FinishedInvoice> {
  const laborLineItems = structuredInvoice.workSessions.flatMap((session) =>
    session.tasks.map((task) => buildLaborLineItem(task, session.date))
  );
  const materialLineItems = structuredInvoice.materials.map((material) => buildMaterialLineItem(material));

  const invoice: FinishedInvoice = {
    invoiceNumber: structuredInvoice.invoiceNumber ?? generateInvoiceNumber(),
    issueDate: structuredInvoice.issueDate,
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
  if (isExplicitDate(invoice.servicePeriodStart)) {
    return invoice;
  }
  const explicitDates: string[] = [];
  invoice.workSessions.forEach((session) => {
    const label = extractExplicitDateLabel(session.date);
    if (label) {
      explicitDates.push(label);
    }
  });
  if (explicitDates.length === 0) {
    return invoice;
  }
  const indexByLabel = (label: string) => {
    const lower = label.toLowerCase();
    for (let idx = 0; idx < MONTHS.length; idx += 1) {
      const month = MONTHS[idx];
      const match = lower.match(new RegExp(`\\b${month}\\s+(\\d{1,2})\\b`));
      if (match) {
        return idx * 32 + Number(match[1]);
      }
    }
    return Number.MAX_SAFE_INTEGER;
  };
  const sorted = explicitDates
    .slice()
    .sort((a, b) => indexByLabel(a) - indexByLabel(b));
  const earliest = sorted[0];
  return {
    ...invoice,
    servicePeriodStart: earliest,
    servicePeriodEnd: invoice.servicePeriodEnd ?? earliest
  };
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
  const lines = sourceText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  const billRegex = /\b(?:bill to|bill)\s+([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,4})/i;
  const clientRegex = /\b(?:client|customer)\s*[:\-]\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,4})/i;
  const parenRegex = /\(([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,4}),\s*\d{1,5}\s+[^)]+\)/;
  const addressRegex = /([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,4}),\s*\d{1,5}\s+[A-Za-z0-9.\s]+\b/;

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
          return;
        }
        decisionSentence = `${previousSentence} ${sentence}`;
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
    return Array.from(decisions.values()).map((entry) => entry.decision);
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

  return unresolved;
}

function decisionsFromAudit(
  decisions: Array<{ kind: "tax" | "billing"; prompt: string; sourceSnippet?: string }>
): OpenDecision[] {
  return decisions.map((decision) => ({
    id: `decision-${hashString(decision.prompt)}`,
    kind: decision.kind,
    prompt: decision.prompt,
    sourceSnippet: decision.sourceSnippet,
    keywords: extractKeywords(decision.sourceSnippet ?? decision.prompt)
  }));
}

function filterResolvedDecisions(
  decisions: OpenDecision[],
  sourceText: string,
  lastUserMessage?: string
): OpenDecision[] {
  const trimmedLast = lastUserMessage?.trim();
  if (!trimmedLast) {
    return decisions;
  }

  return decisions.filter((decision) => {
    return !evaluateDecisionResolution(decision, trimmedLast).resolved;
  });
}

function mergeDecisions(primary: OpenDecision[], secondary: OpenDecision[]): OpenDecision[] {
  const merged = new Map<string, OpenDecision>();
  primary.forEach((decision) => merged.set(decision.id, decision));

  const getKeywords = (decision: OpenDecision) =>
    new Set(decision.keywords ?? extractKeywords(decision.sourceSnippet ?? decision.prompt));

  secondary.forEach((decision) => {
    if (merged.has(decision.id)) {
      return;
    }
    const secondaryKeywords = getKeywords(decision);
    const hasOverlap = Array.from(merged.values()).some((existing) => {
      const existingKeywords = getKeywords(existing);
      let overlapCount = 0;
      secondaryKeywords.forEach((keyword) => {
        if (existingKeywords.has(keyword)) {
          overlapCount += 1;
        }
      });
      return overlapCount >= 2;
    });
    if (!hasOverlap) {
      merged.set(decision.id, decision);
    }
  });

  return Array.from(merged.values());
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
      /^bill this item\?/i.test(prompt) || /^confirm:/i.test(prompt);
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
  if (lower.includes("bill") || lower.includes("charge") || lower.includes("invoice")) {
    const snippet = buildDecisionSnippet(sentence);
    return {
      kind: "billing",
      prompt: `Bill this item? "${snippet}"`,
      keywords: extractKeywords(sentence)
    };
  }
  const trimmed = buildDecisionSnippet(sentence);
  return {
    kind: "billing",
    prompt: `Confirm: ${trimmed}`,
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

function logDecisionUnresolved(decision: OpenDecision, reason: string, resolutionText?: string) {
  console.log("[decision:unresolved]", {
    id: decision.id,
    kind: decision.kind,
    prompt: decision.prompt,
    reason,
    resolutionText: resolutionText ?? ""
  });
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

function buildLaborLineItem(task: Task, sessionDate?: string) {
  const hours = task.hours;
  const rate = task.rate;
  const amount = task.amount;
  const hasAmount = typeof amount === "number";
  const hasHours = typeof hours === "number";
  const hasRate = typeof rate === "number";

  if (hasHours && hasRate && (rate > 0 || !hasAmount)) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(rate),
      amount: roundToCents(typeof amount === "number" ? amount : hours * rate),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount && hasHours && hours > 0) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(amount / hours),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount && hasRate && rate > 0) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(amount / rate),
      unitPrice: roundToCents(rate),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasAmount) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: 1,
      unitPrice: roundToCents(amount),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (hasHours && !hasRate) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: 0,
      amount: 0,
      sourceSessionDate: sessionDate
    };
  }

  if (hasRate) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: 1,
      unitPrice: roundToCents(rate),
      amount: roundToCents(rate),
      sourceSessionDate: sessionDate
    };
  }

  return {
    type: "labor" as const,
    description: task.description,
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    sourceSessionDate: sessionDate
  };
}

function buildMaterialLineItem(material: Material) {
  const quantity = typeof material.quantity === "number" ? material.quantity : 1;
  const safeQuantity = quantity > 0 ? quantity : 1;

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
    description: material.description,
    quantity: roundToCents(safeQuantity),
    unitPrice: roundToCents(unitPrice ?? 0),
    amount: roundToCents(amount)
  };
}
