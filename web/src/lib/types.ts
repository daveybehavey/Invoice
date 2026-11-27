export type InvoiceDocumentType = "invoice" | "estimate";

export type LineItemType = "labor" | "material" | "other";

export interface InvoiceLineItem {
  id: string;
  type: LineItemType;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  sourceSessionDate?: string;
  explicitFree?: boolean;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  paidAt?: string;
  note?: string;
}

export type PaymentMethodKind = "cheque" | "etransfer" | "bank_transfer" | "cash" | "custom";

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  label?: string;
  details?: string;
  enabled?: boolean;
}

export interface JobPhoto {
  id: string;
  dataUrl: string;
  caption?: string;
  stage?: "before" | "after" | "progress";
}

export interface QuoteOption {
  id: string;
  tier: "good" | "better" | "best";
  label: string;
  description?: string;
  amount: number;
  recommended?: boolean;
}

export interface QuoteApproval {
  approvedBy: string;
  approvedAt: string;
  selectedOptionId?: string;
  signatureDataUrl?: string;
  note?: string;
}

export interface ClientPaymentNotice {
  method: string;
  sentAt: string;
  note?: string;
}

export interface FinishedInvoice {
  documentType: InvoiceDocumentType;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  customerName?: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  paymentLinkUrl?: string;
  portalAccessToken?: string;
  discountAmount?: number;
  discountReason?: string;
  subtotal?: number;
  total?: number;
  balanceDue?: number;
  paymentRecords: PaymentRecord[];
  paymentMethods: PaymentMethod[];
  monetaryRevision?: number;
  jobPhotos?: JobPhoto[];
  depositPercent?: number;
  depositAmount?: number;
  quoteOptions?: QuoteOption[];
  quoteApproval?: QuoteApproval;
  clientPaymentNotice?: ClientPaymentNotice;
  tipEnabled?: boolean;
  cardFeePassThrough?: boolean;
  materialsMarkupPercent?: number;
  hideMaterialsBreakdown?: boolean;
}

export interface StructuredTask {
  description: string;
  hours?: number;
  rate?: number;
  amount?: number;
  explicitFree?: boolean;
}

export interface StructuredWorkSession {
  date?: string;
  tasks: StructuredTask[];
}

export interface StructuredMaterial {
  description: string;
  quantity?: number;
  unitCost?: number;
  amount?: number;
  explicitFree?: boolean;
}

export interface StructuredInvoice {
  customerName?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  workSessions: StructuredWorkSession[];
  materials: StructuredMaterial[];
  notes?: string;
}

export interface OpenDecision {
  id: string;
  kind: "tax" | "billing";
  prompt: string;
  sourceSnippet?: string;
  lineItemId?: string;
  suggestedAction?: "price" | "tax";
}

export type InvoiceThemeId = "field_pro" | "editorial" | "bold_trade" | "clean_minimal";

export interface BusinessProfile {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  taxIdLabel: string;
  taxIdValue: string;
  defaultHourlyRate?: number;
  defaultTaxRate: number;
  defaultTerms: "due_on_receipt" | "net_7" | "net_15" | "net_30";
  defaultCurrency: string;
  defaultTheme: InvoiceThemeId;
  logoDataUrl?: string;
  accentColor: string;
  googleReviewUrl: string;
  defaultPaymentMethods: PaymentMethod[];
  defaultMaterialsMarkupPercent: number;
  defaultTipEnabled: boolean;
}

export interface TradeBundle {
  id: string;
  name: string;
  description: string;
  type: LineItemType;
  quantity: number;
  unitPrice: number;
}

export interface JobTimerState {
  running: boolean;
  startedAtMs: number | null;
  accumulatedMs: number;
  description: string;
  hourlyRate: number;
  roundingMinutes: 1 | 15 | 30;
}

export interface ActiveDraft {
  invoiceId?: string;
  sourceType: "text_input" | "upload";
  rawInput: string;
  customerEmail: string;
  taxRate: number;
  paymentTerms: "due_on_receipt" | "net_7" | "net_15" | "net_30";
  theme: InvoiceThemeId;
  invoice: FinishedInvoice;
  structuredInvoice?: StructuredInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  updatedAt: string;
}

export interface LocalDraftSnapshot {
  id: string;
  invoiceNumber: string;
  customerName: string;
  documentType: InvoiceDocumentType;
  currency: string;
  total: number;
  savedAt: string;
  draft: ActiveDraft;
}

export interface SavedClient {
  id: string;
  name: string;
  email?: string;
  address?: string;
  lastHourlyRate?: number;
  lastTotal?: number;
  lastBilledAt: string;
  lastServices: Array<{
    description: string;
    type: LineItemType;
    unitPrice?: number;
    quantity?: number;
    amount?: number;
  }>;
}

export interface SavedService {
  id: string;
  description: string;
  type: LineItemType;
  defaultRate?: number;
  defaultQty?: number;
  usageCount: number;
  updatedAt: string;
}

export interface ScratchpadNote {
  id: string;
  text: string;
  createdAt: string;
  clientHint?: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  expiresAt: string;
}

export interface AuthProviderCapability {
  id: "email_link" | "google";
  label: string;
  available: boolean;
  warning?: string;
}

export interface AuthPolicy {
  authRequired: boolean;
  authProviders: AuthProviderCapability[];
}

export interface AccountPlanSummary {
  plan: "free" | "pro";
  canCreateInvoice: boolean;
  upgradeRequired: boolean;
  links: {
    upgradeUrl: string | null;
    billingPortalUrl: string | null;
  };
  limits: {
    invoicesPerMonth: number | null;
  };
  usage: {
    invoicesCreated: number;
    invoicesRemaining: number | null;
  };
  billing?: {
    checkoutAvailable?: boolean;
    portalAvailable?: boolean;
    invoicePaymentAvailable?: boolean;
  };
}

export type SavedInvoiceStatus = "draft" | "sent" | "paid" | "deleted";

export interface DeliverySummary {
  status?: string;
  recipientEmail?: string;
  sentAt?: string;
  openedAt?: string;
  reminderCount?: number;
  lastReminderAt?: string;
}

export interface SavedInvoiceListItem {
  invoiceId: string;
  createdAt: string;
  updatedAt: string;
  status: SavedInvoiceStatus;
  sourceType: "text_input" | "upload";
  documentType: InvoiceDocumentType;
  invoiceNumber?: string;
  customerName?: string;
  total?: number;
  balanceDue?: number;
  dueDate?: string;
  paymentLinkUrl?: string;
  paymentRecords: PaymentRecord[];
  sendBlocked: boolean;
  delivery?: DeliverySummary | null;
}

export interface SavedInvoiceFull {
  invoiceId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  status: SavedInvoiceStatus;
  sourceType: "text_input" | "upload";
  invoiceData: {
    structuredInvoice: StructuredInvoice;
    finishedInvoice: FinishedInvoice;
    sourceNote?: string;
  };
  delivery?: DeliverySummary | null;
}
