import { runJsonTask } from "../ai/openaiClient.js";
import { normalizeInvoice } from "../lib/invoiceMath.js";
import {
  FinishedInvoice,
  FinishedInvoiceSchema,
  LaborPricingChoice,
  Material,
  StructuredInvoice,
  StructuredInvoiceSchema,
  Task
} from "../models/invoice.js";

type CreateInvoiceInput = {
  messyInput?: string;
  uploadedInvoiceText?: string;
};

type CreateInvoiceReadyResult = {
  kind: "invoice_ready";
  structuredInvoice: StructuredInvoice;
  invoice: FinishedInvoice;
};

type CreateInvoiceLaborFollowUpResult = {
  kind: "labor_pricing_follow_up";
  structuredInvoice: StructuredInvoice;
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

export async function createInvoiceFromInput(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const sourceText = buildSourceText(input);
  const structuredInvoice = await parseMessyInputToStructuredInvoice(sourceText);
  const unpricedLaborTasks = extractUnpricedLaborTasks(structuredInvoice);

  if (needsLaborPricingFollowUp(unpricedLaborTasks)) {
    return {
      kind: "labor_pricing_follow_up",
      structuredInvoice,
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

  const invoice = await generateFinishedInvoice(structuredInvoice);
  const discountIntent = detectDiscountIntent(sourceText);

  if (discountIntent.kind === "apply") {
    return {
      kind: "invoice_ready",
      structuredInvoice,
      invoice: applyDiscountToInvoice(invoice, discountIntent.amount, discountIntent.reason)
    };
  }

  return {
    kind: "invoice_ready",
    structuredInvoice,
    invoice
  };
}

export async function continueInvoiceAfterLaborPricing(
  structuredInvoice: StructuredInvoice,
  laborPricing: LaborPricingChoice,
  sourceText?: string
): Promise<CreateInvoiceReadyResult> {
  const parsedStructuredInvoice = StructuredInvoiceSchema.parse(structuredInvoice);
  const withLaborPricing = applyLaborPricing(parsedStructuredInvoice, laborPricing);
  const invoice = await generateFinishedInvoice(withLaborPricing);
  const discountIntent = detectDiscountIntent(sourceText ?? withLaborPricing.notes ?? "");

  if (discountIntent.kind === "apply") {
    return {
      kind: "invoice_ready",
      structuredInvoice: withLaborPricing,
      invoice: applyDiscountToInvoice(invoice, discountIntent.amount, discountIntent.reason)
    };
  }

  return {
    kind: "invoice_ready",
    structuredInvoice: withLaborPricing,
    invoice
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
    "- Group work sessions by date when a date exists.",
    "- Omit unknown numeric fields instead of guessing.",
    "- Never infer or invent labor hours, labor rate, or labor amount when they are missing.",
    "- Use numbers (not strings) for numeric values.",
    `Source text:\n${sourceText}`
  ].join("\n");

  const modelResponse = await runJsonTask<StructuredInvoice>(taskPrompt);
  return StructuredInvoiceSchema.parse(modelResponse);
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
    discountReason: discountReason?.trim() ? discountReason.trim() : invoice.discountReason
  };

  return normalizeInvoice(FinishedInvoiceSchema.parse(withDiscount));
}

function buildLaborLineItem(task: Task, sessionDate?: string) {
  const hours = task.hours;
  const rate = task.rate;
  const amount = task.amount;

  if (typeof hours === "number" && typeof rate === "number") {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(rate),
      amount: roundToCents(typeof amount === "number" ? amount : hours * rate),
      sourceSessionDate: sessionDate
    };
  }

  if (typeof amount === "number" && typeof hours === "number" && hours > 0) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: roundToCents(amount / hours),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (typeof amount === "number" && typeof rate === "number" && rate > 0) {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(amount / rate),
      unitPrice: roundToCents(rate),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (typeof amount === "number") {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: 1,
      unitPrice: roundToCents(amount),
      amount: roundToCents(amount),
      sourceSessionDate: sessionDate
    };
  }

  if (typeof hours === "number" && typeof rate !== "number") {
    return {
      type: "labor" as const,
      description: task.description,
      quantity: roundToCents(hours),
      unitPrice: 0,
      amount: 0,
      sourceSessionDate: sessionDate
    };
  }

  if (typeof rate === "number") {
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
