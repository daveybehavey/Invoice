import {
  clearStoredAuthSession,
  getStoredAuthSession,
  getStoredOwnerId,
  getStoredSessionToken,
  setStoredAuthSession
} from "./localStore";
import type {
  AccountPlanSummary,
  AuthPolicy,
  AuthSession,
  FinishedInvoice,
  OpenDecision,
  SavedInvoiceFull,
  SavedInvoiceListItem,
  SavedInvoiceStatus,
  StructuredInvoice
} from "./types";

export class AuthRequiredError extends Error {
  status = 401;
  constructor(message = "Sign in required to use this cloud feature.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function buildAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getStoredSessionToken();
  const session = getStoredAuthSession();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (!headers.has("x-invoice-user-id")) {
    headers.set("x-invoice-user-id", session?.userId || getStoredOwnerId());
  }
  return headers;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildAuthHeaders(init.headers);
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401) {
    throw new AuthRequiredError();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(response.status, payload.error || `Request failed (${response.status}).`);
    }
    throw new ApiError(response.status, `Request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export async function fetchAuthPolicy(): Promise<AuthPolicy> {
  return apiRequest<AuthPolicy>("/api/auth/policy");
}

export async function verifyCurrentSession(): Promise<AuthSession | null> {
  const token = getStoredSessionToken();
  if (!token) {
    clearStoredAuthSession();
    return null;
  }
  try {
    const res = await fetch("/api/auth/session", {
      headers: buildAuthHeaders(),
      credentials: "include"
    });
    if (!res.ok) {
      clearStoredAuthSession();
      return null;
    }
    const payload = (await res.json()) as { session?: AuthSession };
    if (!payload.session?.userId) {
      clearStoredAuthSession();
      return null;
    }
    setStoredAuthSession(token, payload.session);
    return payload.session;
  } catch {
    return getStoredAuthSession();
  }
}

export async function requestEmailSignInLink(email: string): Promise<{ emailSent: boolean; expiresAt: string }> {
  return apiRequest("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, provider: "email_link" })
  });
}

export async function verifyEmailSignInToken(token: string): Promise<AuthSession> {
  const payload = await apiRequest<{ token: string; session: AuthSession }>("/api/auth/session/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  setStoredAuthSession(payload.token, payload.session);
  return payload.session;
}

export function getGoogleAuthUrl(returnTo = "/create"): string {
  const safe = returnTo.startsWith("/") ? returnTo : "/create";
  return `/api/auth/google/start?returnTo=${encodeURIComponent(safe)}`;
}

export async function signOutAccount(): Promise<void> {
  clearStoredAuthSession();
  await fetch("/api/auth/session", { method: "DELETE", credentials: "include" }).catch(() => undefined);
}

/**
 * Only fetches /api/account/plan when a valid session exists (or auth is disabled),
 * eliminating unauthenticated 401 console spam on guest landing/workbench load.
 */
export async function fetchAccountPlanIfSignedIn(
  session: AuthSession | null,
  policy: AuthPolicy | null
): Promise<AccountPlanSummary | null> {
  if (!session && policy?.authRequired !== false) {
    return null;
  }
  try {
    return await apiRequest<AccountPlanSummary>("/api/account/plan");
  } catch {
    return null;
  }
}

export interface FromInputResponse {
  needsFollowUp: boolean;
  followUp?: string;
  structuredInvoice: StructuredInvoice;
  invoice?: FinishedInvoice;
  openDecisions: OpenDecision[];
  assumptions: string[];
  unparsedLines: string[];
}

export async function generateInvoiceFromInput(input: {
  messyInput?: string;
  uploadedInvoiceText?: string;
  mode?: "fast" | "full";
  file?: File;
}): Promise<FromInputResponse> {
  if (input.file) {
    const formData = new FormData();
    formData.append("invoiceFile", input.file);
    if (input.messyInput) formData.append("messyInput", input.messyInput);
    if (input.mode) formData.append("mode", input.mode);
    return apiRequest<FromInputResponse>("/api/invoices/from-input", {
      method: "POST",
      body: formData
    });
  }

  return apiRequest<FromInputResponse>("/api/invoices/from-input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messyInput: input.messyInput,
      uploadedInvoiceText: input.uploadedInvoiceText,
      mode: input.mode ?? "full"
    })
  });
}

export async function extractUploadImageText(file: File): Promise<{ extractedText: string; warnings?: string[] }> {
  const formData = new FormData();
  formData.append("invoiceFile", file);
  return apiRequest("/api/invoices/extract-notes", {
    method: "POST",
    body: formData
  });
}

export async function extractUploadDocText(file: File): Promise<{ extractedText: string }> {
  const formData = new FormData();
  formData.append("invoiceFile", file);
  return apiRequest("/api/invoices/extract-upload-text", {
    method: "POST",
    body: formData
  });
}

export async function rewordLineItem(
  invoice: FinishedInvoice,
  lineItemId: string,
  tone?: string
): Promise<{ invoice: FinishedInvoice }> {
  return apiRequest("/api/invoices/reword-line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice, lineItemId, tone })
  });
}

export async function rewordFullInvoiceApi(
  invoice: FinishedInvoice,
  tone: string
): Promise<{ invoice: FinishedInvoice }> {
  return apiRequest("/api/invoices/reword-full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice, tone })
  });
}

export async function editInvoiceWithBillie(
  invoice: FinishedInvoice,
  instruction: string
): Promise<{ invoice: FinishedInvoice; followUp?: string }> {
  return apiRequest("/api/invoices/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice, instruction })
  });
}

export async function saveInvoiceCloud(input: {
  invoiceId?: string;
  sourceType: "text_input" | "upload";
  structuredInvoice: StructuredInvoice;
  finishedInvoice: FinishedInvoice;
  sourceNote?: string;
}): Promise<{ invoice: SavedInvoiceFull }> {
  return apiRequest("/api/invoices/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmSave: true,
      invoiceId: input.invoiceId,
      sourceType: input.sourceType,
      invoiceData: {
        structuredInvoice: input.structuredInvoice,
        finishedInvoice: input.finishedInvoice,
        sourceNote: input.sourceNote
      }
    })
  });
}

export async function listSavedInvoices(): Promise<SavedInvoiceListItem[]> {
  const res = await apiRequest<{ invoices: SavedInvoiceListItem[] }>("/api/invoices");
  return res.invoices || [];
}

export async function getSavedInvoiceById(id: string): Promise<SavedInvoiceFull> {
  const res = await apiRequest<{ invoice: SavedInvoiceFull }>(`/api/invoices/${encodeURIComponent(id)}`);
  return res.invoice;
}

export async function duplicateSavedInvoice(id: string): Promise<SavedInvoiceFull> {
  const res = await apiRequest<{ invoice: SavedInvoiceFull }>(`/api/invoices/${encodeURIComponent(id)}/duplicate`, {
    method: "POST"
  });
  return res.invoice;
}

export async function updateSavedInvoiceStatus(
  id: string,
  status: SavedInvoiceStatus
): Promise<SavedInvoiceFull> {
  const res = await apiRequest<{ invoice: SavedInvoiceFull }>(`/api/invoices/${encodeURIComponent(id)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  return res.invoice;
}

export async function recordSavedInvoicePayment(
  id: string,
  amount: number,
  note?: string
): Promise<SavedInvoiceFull> {
  const res = await apiRequest<{ invoice: SavedInvoiceFull }>(
    `/api/invoices/${encodeURIComponent(id)}/record-payment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, paidAt: new Date().toISOString().slice(0, 10), note })
    }
  );
  return res.invoice;
}

export async function deleteSavedInvoice(id: string): Promise<void> {
  await apiRequest(`/api/invoices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sendInvoiceEmail(
  id: string,
  recipientEmail: string,
  intent?: "resend",
  resendActionId?: string
): Promise<{ invoice: SavedInvoiceFull; warning?: string | null; mode: string }> {
  return apiRequest(`/api/invoices/${encodeURIComponent(id)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientEmail, intent, resendActionId })
  });
}

export async function createPaymentLink(id: string): Promise<{ paymentLinkUrl: string; invoice: SavedInvoiceFull }> {
  return apiRequest(`/api/invoices/${encodeURIComponent(id)}/payment-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export async function createClientPortalLink(id: string): Promise<{ clientPortalUrl: string; invoice: SavedInvoiceFull }> {
  return apiRequest(`/api/invoices/${encodeURIComponent(id)}/client-portal-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export async function sendInvoiceReminder(id: string): Promise<{ warning?: string | null; mode: string }> {
  return apiRequest(`/api/invoices/${encodeURIComponent(id)}/send-reminder`, { method: "POST" });
}

export async function fetchPublicPortalInvoice(
  id: string,
  token: string
): Promise<{ invoice: SavedInvoiceFull; history: unknown[] }> {
  return apiRequest(
    `/api/public/invoices/${encodeURIComponent(id)}/portal?token=${encodeURIComponent(token)}`
  );
}

export async function approvePublicPortalQuote(input: {
  invoiceId: string;
  token: string;
  approvedBy: string;
  selectedOptionId?: string;
  signatureDataUrl?: string;
  note?: string;
}): Promise<{ invoice: SavedInvoiceFull }> {
  return apiRequest(`/api/public/invoices/${encodeURIComponent(input.invoiceId)}/portal/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: input.token,
      approvedBy: input.approvedBy,
      selectedOptionId: input.selectedOptionId,
      signatureDataUrl: input.signatureDataUrl,
      note: input.note
    })
  });
}

export async function submitPublicPortalPaymentNotice(input: {
  invoiceId: string;
  token: string;
  method: string;
  note?: string;
}): Promise<{ invoice: SavedInvoiceFull }> {
  return apiRequest(
    `/api/public/invoices/${encodeURIComponent(input.invoiceId)}/portal/payment-notice`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: input.token,
        method: input.method,
        note: input.note
      })
    }
  );
}

export async function startProCheckoutSession(options: {
  successPath?: string;
  cancelPath?: string;
  termsAccepted?: boolean;
  termsVersion?: string;
}): Promise<{ checkoutUrl: string }> {
  const response = await fetch("/api/billing/checkout-session", {
    method: "POST",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({
      successPath: options.successPath || "/brand?upgrade=success",
      cancelPath: options.cancelPath || "/pricing?upgrade=cancelled",
      termsAccepted: options.termsAccepted ?? true,
      termsVersion: options.termsVersion || "2026-11-03.1"
    })
  });
  if (response.status === 401) {
    throw new AuthRequiredError("Sign in to upgrade to NoteBill Pro.");
  }
  const data = (await response.json()) as { checkoutUrl?: string; url?: string; error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error || "Could not start Stripe checkout.");
  }
  return { checkoutUrl: data.checkoutUrl || data.url || "" };
}

export async function openStripeBillingPortal(): Promise<{ portalUrl: string }> {
  const res = await apiRequest<{ portalUrl?: string; url?: string }>("/api/billing/portal-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnPath: "/brand" })
  });
  return { portalUrl: res.portalUrl || res.url || "" };
}

export async function fetchLegalDocument(
  kind: "terms" | "privacy",
  version?: string
): Promise<{
  kind: string;
  version: string;
  effectiveDate: string;
  isCurrent: boolean;
  sections: Array<{ title: string; paragraphs: string[]; items?: string[] }>;
  termsUrlPath?: string;
  downloadPath?: string;
  privacyUrlPath?: string;
}> {
  const qs = version && version.trim() ? `?version=${encodeURIComponent(version.trim())}` : "";
  return apiRequest(`/api/legal/documents/${kind}${qs}`);
}

export async function requestContractCopy(termsVersion: string): Promise<{
  delivered: boolean;
  channel?: string;
  coalesced?: boolean;
}> {
  return apiRequest("/api/billing/contract-copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termsVersion })
  });
}

export function trackClientRevenueSignal(
  event:
    | "checkout_started"
    | "scratchpad_note_saved"
    | "scratchpad_note_used_in_invoice"
    | "billie_workspace_instruction_submitted",
  source = "web_v3"
): void {
  fetch("/api/telemetry/revenue-signals", {
    method: "POST",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ event, source })
  }).catch(() => undefined);
}
