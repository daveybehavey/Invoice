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

export const FinishedInvoiceSchema = z.object({
  invoiceNumber: OptionalString,
  issueDate: OptionalString,
  servicePeriodStart: OptionalString,
  servicePeriodEnd: OptionalString,
  customerName: OptionalString,
  currency: CurrencyString,
  lineItems: z.array(InvoiceLineItemSchema).min(1),
  notes: OptionalString,
  subtotal: OptionalNumber,
  total: OptionalNumber,
  balanceDue: OptionalNumber
});

export const ChangeLineWordingRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  lineItemId: z.string().min(1),
  tone: OptionalString
});

export const FullInvoiceRewordRequestSchema = z.object({
  invoice: FinishedInvoiceSchema,
  tone: OptionalString
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
  laborPricing: LaborPricingChoiceSchema
});

export const SavedInvoiceStatusSchema = z.enum(["draft", "sent", "paid"]);
export const SavedInvoiceSourceTypeSchema = z.enum(["text_input", "upload"]);

export const SavedInvoiceDataSchema = z.object({
  structuredInvoice: StructuredInvoiceSchema,
  finishedInvoice: FinishedInvoiceSchema
});

export const SavedInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: SavedInvoiceStatusSchema,
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
  sourceType: SavedInvoiceSourceTypeSchema
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
