import { z } from "zod";

const OptionalString = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  return value;
}, z.string().min(1).optional());

const OptionalNumber = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}, z.number().finite().nonnegative().optional());

const PositiveNumber = z.preprocess((value) => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}, z.number().finite().positive());

const CurrencyString = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  return value;
}, z.string().min(1).default("USD"));

const OptionalUrl = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  return value;
}, z.string().url().optional());

export const TaskSchema = z.object({
  description: z.string().min(1),
  hours: OptionalNumber,
  rate: OptionalNumber,
  amount: OptionalNumber
});

export const WorkSessionSchema = z.object({
  date: OptionalString,
  tasks: z.array(TaskSchema).default([])
});

export const MaterialSchema = z.object({
  description: z.string().min(1),
  quantity: OptionalNumber,
  unitCost: OptionalNumber,
  amount: OptionalNumber
});

export const StructuredInvoiceSchema = z.object({
  customerName: OptionalString,
  invoiceNumber: OptionalString,
  issueDate: OptionalString,
  dueDate: OptionalString,
  servicePeriodStart: OptionalString,
  servicePeriodEnd: OptionalString,
  workSessions: z.array(WorkSessionSchema).default([]),
  materials: z.array(MaterialSchema).default([]),
  notes: OptionalString
});

export const InvoiceLineItemSchema = z.object({
  id: OptionalString,
  type: z.enum(["labor", "material", "other"]).default("other"),
  description: z.string().min(1),
  quantity: OptionalNumber,
  unitPrice: OptionalNumber,
  amount: OptionalNumber,
  sourceSessionDate: OptionalString
});

export const InvoiceDecisionSchema = z.object({
  kind: z.enum(["tax", "billing"]),
  prompt: z.string().min(1),
  sourceSnippet: OptionalString
});

export const OpenDecisionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["tax", "billing"]),
  prompt: z.string().min(1),
  sourceSnippet: OptionalString,
  keywords: z.array(z.string().min(1)).optional()
});

export const InvoiceAuditSchema = z.object({
  assumptions: z.array(z.string()).default([]),
  decisions: z.array(InvoiceDecisionSchema).default([]),
  unparsedLines: z.array(z.string()).default([])
});

export const FinishedInvoiceSchema = z.object({
  invoiceNumber: OptionalString,
  issueDate: OptionalString,
  dueDate: OptionalString,
  servicePeriodStart: OptionalString,
  servicePeriodEnd: OptionalString,
  customerName: OptionalString,
  currency: CurrencyString,
  lineItems: z.array(InvoiceLineItemSchema).min(1),
  notes: OptionalString,
  paymentLinkUrl: OptionalUrl,
  portalAccessToken: OptionalString,
  discountAmount: OptionalNumber,
  discountReason: OptionalString,
  subtotal: OptionalNumber,
  total: OptionalNumber,
  balanceDue: OptionalNumber
});

export const ChangeLineWordingRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  lineItemId: z.string().min(1),
  tone: OptionalString
});

export const ChangeNotesWordingRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  tone: OptionalString
});

export const ChangeDescriptionsWordingRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  tone: OptionalString
});

export const FullInvoiceRewordRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  tone: OptionalString
});

export const InvoiceEditRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  instruction: z.string().min(1)
});

export const InvoiceEditResponseSchema = z.object({
  invoice: FinishedInvoiceSchema,
  followUp: OptionalString
});

export const LaborPricingChoiceSchema = z.discriminatedUnion("billingType", [
  z.object({
    billingType: z.literal("hourly"),
    rate: PositiveNumber,
    lineHours: z.array(PositiveNumber).min(1)
  }),
  z.object({
    billingType: z.literal("flat"),
    flatAmount: PositiveNumber
  })
]);

export const LaborPricingFollowUpRequestSchema = z.object({
  structuredInvoice: StructuredInvoiceSchema,
  laborPricing: LaborPricingChoiceSchema,
  sourceText: OptionalString,
  lastUserMessage: OptionalString,
  mode: z.enum(["full", "fast"]).optional()
});

export const DiscountFollowUpRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  discountAmount: PositiveNumber,
  discountReason: OptionalString
});

export const InvoiceAuditRequestSchema = z.object({
  sourceText: z.string().min(1),
  structuredInvoice: StructuredInvoiceSchema,
  lastUserMessage: OptionalString
});

export const DecisionActionSchema = z.object({
  type: z.enum(["include", "exclude", "tax_apply", "tax_skip", "bulk_include", "bulk_exclude"]),
  id: OptionalString,
  kind: z.enum(["tax", "billing"]).optional(),
  snippet: OptionalString
});

export const ApplyDecisionRequestSchema = z.object({
  structuredInvoice: StructuredInvoiceSchema,
  openDecisions: z.array(OpenDecisionSchema),
  assumptions: z.array(z.string()).default([]),
  unparsedLines: z.array(z.string()).default([]),
  decisionAction: DecisionActionSchema,
  pendingTaxRate: OptionalString,
  debugTiming: z.boolean().optional()
});

export const InvoicePdfExportRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  fromDetails: OptionalString,
  billToDetails: OptionalString,
  accentColor: OptionalString,
  stylePreset: OptionalString,
  logoUrl: OptionalString,
  logoVisible: z.boolean().optional(),
  notesVisible: z.boolean().optional(),
  headerLayout: z.enum(["split", "centered"]).optional(),
  spacingDensity: z.enum(["tight", "balanced", "airy"]).optional()
});

export const SavedInvoiceStatusSchema = z.enum(["draft", "sent", "paid", "deleted"]);
export const SavedInvoiceSourceTypeSchema = z.enum(["text_input", "upload"]);

export const SavedInvoiceDataSchema = z.object({
  structuredInvoice: StructuredInvoiceSchema,
  finishedInvoice: FinishedInvoiceSchema
});

export const SavedInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  ownerId: z.string().min(1).default("local-default"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: SavedInvoiceStatusSchema,
  previousStatus: SavedInvoiceStatusSchema.optional(),
  deletedAt: OptionalString,
  sourceType: SavedInvoiceSourceTypeSchema,
  invoiceData: SavedInvoiceDataSchema
});

export const SaveInvoiceRequestSchema = z.object({
  confirmSave: z.literal(true),
  invoiceId: z.string().uuid().optional(),
  sourceType: SavedInvoiceSourceTypeSchema,
  invoiceData: SavedInvoiceDataSchema
});

export const UpdateInvoiceStatusRequestSchema = z.object({
  status: SavedInvoiceStatusSchema
});

export const InvoiceListItemSchema = z.object({
  invoiceId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: SavedInvoiceStatusSchema,
  sourceType: SavedInvoiceSourceTypeSchema,
  invoiceNumber: OptionalString,
  customerName: OptionalString,
  total: OptionalNumber,
  balanceDue: OptionalNumber,
  dueDate: OptionalString,
  paymentLinkUrl: OptionalUrl
});

export const RecentClientContextItemSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: OptionalString,
  updatedAt: z.string().datetime(),
  servicePeriodStart: OptionalString,
  servicePeriodEnd: OptionalString,
  total: OptionalNumber,
  notes: OptionalString,
  lineItemDescriptions: z.array(z.string().min(1)).default([])
});

export type StructuredInvoice = z.infer<typeof StructuredInvoiceSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type FinishedInvoice = z.infer<typeof FinishedInvoiceSchema>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
export type LaborPricingChoice = z.infer<typeof LaborPricingChoiceSchema>;
export type SavedInvoice = z.infer<typeof SavedInvoiceSchema>;
export type SavedInvoiceStatus = z.infer<typeof SavedInvoiceStatusSchema>;
export type SavedInvoiceSourceType = z.infer<typeof SavedInvoiceSourceTypeSchema>;
export type SavedInvoiceData = z.infer<typeof SavedInvoiceDataSchema>;
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>;
export type RecentClientContextItem = z.infer<typeof RecentClientContextItemSchema>;
export type OpenDecision = z.infer<typeof OpenDecisionSchema>;
export type DecisionAction = z.infer<typeof DecisionActionSchema>;
