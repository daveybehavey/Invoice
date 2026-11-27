import { computeDueDate, generateInvoiceNumber, roundToCents, syncFinishedInvoiceTotals } from "./money";
import type {
  ActiveDraft,
  BusinessProfile,
  FinishedInvoice,
  JobTimerState,
  LocalDraftSnapshot,
  PaymentMethod,
  SavedClient,
  SavedService,
  ScratchpadNote,
  TradeBundle
} from "./types";

const KEYS = {
  ACTIVE_DRAFT: "notebill.v3.activeDraft",
  DRAFT_HISTORY: "notebill.v3.draftHistory",
  AUTH_RETURN_DRAFT: "notebill.v3.authReturnDraft",
  AUTH_RETURN_PATH: "notebill.v3.authReturnPath",
  BUSINESS_PROFILE: "notebill.v3.businessProfile",
  CLIENTS: "notebill.v3.clients",
  SERVICES: "notebill.v3.services",
  SCRATCHPAD: "notebill.v3.scratchpad",
  BUNDLES: "notebill.v3.bundles",
  JOB_TIMER: "notebill.v3.jobTimer",
  // Legacy identity keys preserved so existing sessions & Google OAuth work seamlessly
  OWNER_ID: "invoiceOwnerId",
  SESSION_TOKEN: "invoiceSessionToken",
  AUTH_SESSION: "invoiceAuthSession"
} as const;

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: "pm_etransfer", kind: "etransfer", label: "Interac e-Transfer", details: "", enabled: false },
  { id: "pm_venmo", kind: "custom", label: "Venmo", details: "", enabled: false },
  { id: "pm_zelle", kind: "bank_transfer", label: "Zelle", details: "", enabled: false },
  { id: "pm_cheque", kind: "cheque", label: "Cheque", details: "Payable to business name", enabled: false },
  { id: "pm_cash", kind: "cash", label: "Cash", details: "Paid on site", enabled: false }
];

export const DEFAULT_TRADE_BUNDLES: TradeBundle[] = [
  {
    id: "bnd_trip",
    name: "Service Call",
    description: "Service call & diagnostic dispatch",
    type: "other",
    quantity: 1,
    unitPrice: 95
  },
  {
    id: "bnd_labor",
    name: "1 Hr Labor",
    description: "On-site skilled labor",
    type: "labor",
    quantity: 1,
    unitPrice: 95
  },
  {
    id: "bnd_parts",
    name: "Shop Supplies",
    description: "Fasteners, fittings & consumables",
    type: "material",
    quantity: 1,
    unitPrice: 45
  },
  {
    id: "bnd_haul",
    name: "Haul-Away",
    description: "Debris removal & disposal",
    type: "other",
    quantity: 1,
    unitPrice: 65
  }
];

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  businessName: "Your Business Name",
  email: "",
  phone: "",
  address: "",
  taxIdLabel: "Tax ID",
  taxIdValue: "",
  defaultHourlyRate: 95,
  defaultTaxRate: 0,
  defaultTerms: "net_15",
  defaultCurrency: "USD",
  defaultTheme: "field_pro",
  accentColor: "#0F5132",
  googleReviewUrl: "",
  defaultPaymentMethods: DEFAULT_PAYMENT_METHODS,
  defaultMaterialsMarkupPercent: 0,
  defaultTipEnabled: false
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort storage
  }
}

export function getBusinessProfile(): BusinessProfile {
  const stored = readJson<Partial<BusinessProfile>>(KEYS.BUSINESS_PROFILE, {});
  return {
    ...DEFAULT_BUSINESS_PROFILE,
    ...stored,
    defaultPaymentMethods:
      Array.isArray(stored.defaultPaymentMethods) && stored.defaultPaymentMethods.length > 0
        ? stored.defaultPaymentMethods
        : DEFAULT_PAYMENT_METHODS
  };
}

export function saveBusinessProfile(profile: BusinessProfile): void {
  writeJson(KEYS.BUSINESS_PROFILE, profile);
}

export function createEmptyDraft(profile = getBusinessProfile()): ActiveDraft {
  const issueDate = new Date().toISOString().slice(0, 10);
  const enabledMethods = (profile.defaultPaymentMethods || []).filter((m) => m.enabled);
  const invoice: FinishedInvoice = syncFinishedInvoiceTotals(
    {
      documentType: "invoice",
      invoiceNumber: generateInvoiceNumber(),
      issueDate,
      dueDate: computeDueDate(issueDate, profile.defaultTerms),
      customerName: "",
      currency: profile.defaultCurrency || "USD",
      lineItems: [],
      notes: "Thank you for your business.",
      paymentRecords: [],
      paymentMethods: enabledMethods,
      tipEnabled: profile.defaultTipEnabled,
      materialsMarkupPercent: profile.defaultMaterialsMarkupPercent || 0
    },
    profile.defaultTaxRate
  );

  return {
    sourceType: "text_input",
    rawInput: "",
    customerEmail: "",
    taxRate: profile.defaultTaxRate,
    paymentTerms: profile.defaultTerms,
    theme: profile.defaultTheme,
    invoice,
    openDecisions: [],
    assumptions: [],
    updatedAt: new Date().toISOString()
  };
}

export function getActiveDraft(): ActiveDraft {
  const stored = readJson<ActiveDraft | null>(KEYS.ACTIVE_DRAFT, null);
  if (stored && stored.invoice && Array.isArray(stored.invoice.lineItems)) {
    return stored;
  }
  return createEmptyDraft();
}

export function saveActiveDraft(draft: ActiveDraft): void {
  writeJson(KEYS.ACTIVE_DRAFT, { ...draft, updatedAt: new Date().toISOString() });
}

export function getLocalDraftHistory(): LocalDraftSnapshot[] {
  const stored = readJson<LocalDraftSnapshot[]>(KEYS.DRAFT_HISTORY, []);
  return Array.isArray(stored) ? stored : [];
}

export function archiveDraftLocally(draft: ActiveDraft): LocalDraftSnapshot[] {
  const hasLines = draft.invoice.lineItems.some((l) => l.description.trim().length > 0);
  const hasNotes = draft.rawInput.trim().length > 0;
  if (!hasLines && !hasNotes) {
    return getLocalDraftHistory();
  }

  const synced = syncFinishedInvoiceTotals(draft.invoice, draft.taxRate);
  const dedupeKey = (synced.invoiceNumber || draft.invoiceId || "").trim();
  const id = dedupeKey
    ? `ld_${dedupeKey.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
    : `ld_${Date.now().toString(36)}`;

  const snapshot: LocalDraftSnapshot = {
    id,
    invoiceNumber: synced.invoiceNumber || "Draft",
    customerName: synced.customerName?.trim() || "Unnamed Client",
    documentType: synced.documentType,
    currency: synced.currency || "USD",
    total: roundToCents(synced.total ?? 0),
    savedAt: new Date().toISOString(),
    draft: {
      ...draft,
      invoice: synced,
      updatedAt: new Date().toISOString()
    }
  };

  const existing = getLocalDraftHistory();
  const filtered = existing.filter((item) => item.id !== id);
  const next = [snapshot, ...filtered]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 25);
  writeJson(KEYS.DRAFT_HISTORY, next);
  return next;
}

export function deleteLocalDraft(id: string): LocalDraftSnapshot[] {
  const next = getLocalDraftHistory().filter((item) => item.id !== id);
  writeJson(KEYS.DRAFT_HISTORY, next);
  return next;
}

export function clearLocalDraftHistory(): void {
  writeJson(KEYS.DRAFT_HISTORY, []);
}

export function saveAuthReturnHandoff(draft: ActiveDraft, returnPath: string): void {
  writeJson(KEYS.AUTH_RETURN_DRAFT, {
    draft,
    expiresAt: Date.now() + 30 * 60 * 1000
  });
  try {
    window.localStorage.setItem(KEYS.AUTH_RETURN_PATH, returnPath);
  } catch {
    // Ignore storage errors
  }
}

export function consumeAuthReturnDraft(): ActiveDraft | null {
  try {
    const raw = window.localStorage.getItem(KEYS.AUTH_RETURN_DRAFT);
    window.localStorage.removeItem(KEYS.AUTH_RETURN_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: ActiveDraft; expiresAt?: number };
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      return null;
    }
    return parsed.draft ?? null;
  } catch {
    return null;
  }
}

export function consumeAuthReturnPath(): string {
  try {
    const path = window.localStorage.getItem(KEYS.AUTH_RETURN_PATH) || "/create";
    window.localStorage.removeItem(KEYS.AUTH_RETURN_PATH);
    return path.startsWith("/") ? path : "/create";
  } catch {
    return "/create";
  }
}

export function getTradeBundles(): TradeBundle[] {
  const stored = readJson<TradeBundle[] | null>(KEYS.BUNDLES, null);
  return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_TRADE_BUNDLES;
}

export function saveTradeBundle(bundle: TradeBundle): TradeBundle[] {
  const current = getTradeBundles();
  const next = [bundle, ...current.filter((b) => b.id !== bundle.id)];
  writeJson(KEYS.BUNDLES, next);
  return next;
}

export function deleteTradeBundle(id: string): TradeBundle[] {
  const next = getTradeBundles().filter((b) => b.id !== id);
  writeJson(KEYS.BUNDLES, next);
  return next;
}

export function getJobTimerState(defaultRate = 95): JobTimerState {
  const stored = readJson<Partial<JobTimerState>>(KEYS.JOB_TIMER, {});
  return {
    running: Boolean(stored.running),
    startedAtMs: typeof stored.startedAtMs === "number" ? stored.startedAtMs : null,
    accumulatedMs: typeof stored.accumulatedMs === "number" ? stored.accumulatedMs : 0,
    description: stored.description || "On-site job labor",
    hourlyRate: typeof stored.hourlyRate === "number" ? stored.hourlyRate : defaultRate,
    roundingMinutes:
      stored.roundingMinutes === 15 || stored.roundingMinutes === 30 ? stored.roundingMinutes : 15
  };
}

export function saveJobTimerState(state: JobTimerState): void {
  writeJson(KEYS.JOB_TIMER, state);
}

export function getSavedClients(): SavedClient[] {
  return readJson<SavedClient[]>(KEYS.CLIENTS, []);
}

export function saveClientFromInvoice(invoice: FinishedInvoice, email?: string): void {
  const name = invoice.customerName?.trim();
  if (!name) return;
  const existing = getSavedClients();
  const normalized = name.toLowerCase();
  const laborLines = invoice.lineItems.filter((l) => l.type === "labor" && typeof l.unitPrice === "number");
  const lastHourlyRate = laborLines[0]?.unitPrice;
  const services = invoice.lineItems
    .filter((l) => l.description.trim().length > 0)
    .slice(0, 6)
    .map((l) => ({
      description: l.description.trim(),
      type: l.type,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      amount: l.amount
    }));

  const nextEntry: SavedClient = {
    id: `cli_${normalized.replace(/[^a-z0-9]+/g, "_")}`,
    name,
    email: email?.trim() || undefined,
    lastHourlyRate,
    lastTotal: invoice.total,
    lastBilledAt: new Date().toISOString(),
    lastServices: services
  };

  const filtered = existing.filter((c) => c.name.trim().toLowerCase() !== normalized);
  writeJson(KEYS.CLIENTS, [nextEntry, ...filtered].slice(0, 40));
  recordServicesFromInvoice(invoice);
}

export function deleteSavedClient(clientId: string): SavedClient[] {
  const next = getSavedClients().filter((c) => c.id !== clientId);
  writeJson(KEYS.CLIENTS, next);
  return next;
}

export function clearAllClientMemory(): void {
  writeJson(KEYS.CLIENTS, []);
  writeJson(KEYS.SERVICES, []);
}

export function getSavedServices(): SavedService[] {
  return readJson<SavedService[]>(KEYS.SERVICES, []);
}

export function recordServicesFromInvoice(invoice: FinishedInvoice): void {
  const existing = getSavedServices();
  const map = new Map(existing.map((s) => [s.description.toLowerCase(), s]));

  for (const item of invoice.lineItems) {
    const desc = item.description.trim();
    if (!desc) continue;
    const key = desc.toLowerCase();
    const prev = map.get(key);
    map.set(key, {
      id: prev?.id ?? `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      description: desc,
      type: item.type,
      defaultRate: item.unitPrice ?? item.amount ?? prev?.defaultRate,
      defaultQty: item.quantity ?? prev?.defaultQty ?? 1,
      usageCount: (prev?.usageCount ?? 0) + 1,
      updatedAt: new Date().toISOString()
    });
  }

  const sorted = Array.from(map.values())
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 50);
  writeJson(KEYS.SERVICES, sorted);
}

export function deleteSavedService(serviceId: string): SavedService[] {
  const next = getSavedServices().filter((s) => s.id !== serviceId);
  writeJson(KEYS.SERVICES, next);
  return next;
}

export function getScratchpadNotes(): ScratchpadNote[] {
  return readJson<ScratchpadNote[]>(KEYS.SCRATCHPAD, []);
}

export function addScratchpadNote(text: string): ScratchpadNote[] {
  const trimmed = text.trim();
  if (!trimmed) return getScratchpadNotes();
  const note: ScratchpadNote = {
    id: `note_${Date.now().toString(36)}`,
    text: trimmed,
    createdAt: new Date().toISOString()
  };
  const next = [note, ...getScratchpadNotes()];
  writeJson(KEYS.SCRATCHPAD, next);
  return next;
}

export function deleteScratchpadNote(id: string): ScratchpadNote[] {
  const next = getScratchpadNotes().filter((n) => n.id !== id);
  writeJson(KEYS.SCRATCHPAD, next);
  return next;
}

export function getStoredOwnerId(): string {
  try {
    const existing = window.localStorage.getItem(KEYS.OWNER_ID);
    if (existing && existing.trim()) return existing.trim();
    const generated =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(KEYS.OWNER_ID, generated);
    return generated;
  } catch {
    return "local-default";
  }
}

export function getStoredSessionToken(): string | null {
  try {
    const t = window.localStorage.getItem(KEYS.SESSION_TOKEN);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function getStoredAuthSession() {
  try {
    const raw = window.localStorage.getItem(KEYS.AUTH_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; email?: string; expiresAt?: string };
    if (!parsed?.userId || !parsed?.email) return null;
    if (parsed.expiresAt) {
      const exp = Date.parse(parsed.expiresAt);
      if (Number.isFinite(exp) && exp <= Date.now()) {
        clearStoredAuthSession();
        return null;
      }
    }
    return {
      userId: parsed.userId,
      email: parsed.email,
      expiresAt: parsed.expiresAt || ""
    };
  } catch {
    return null;
  }
}

export function setStoredAuthSession(
  token: string,
  session: { userId: string; email: string; expiresAt: string }
): void {
  try {
    window.localStorage.setItem(KEYS.SESSION_TOKEN, token);
    window.localStorage.setItem(KEYS.AUTH_SESSION, JSON.stringify(session));
    window.localStorage.setItem(KEYS.OWNER_ID, session.userId);
  } catch {
    // Best effort
  }
}

export function clearStoredAuthSession(): void {
  try {
    window.localStorage.removeItem(KEYS.SESSION_TOKEN);
    window.localStorage.removeItem(KEYS.AUTH_SESSION);
  } catch {
    // Best effort
  }
}
