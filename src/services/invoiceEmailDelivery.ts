import { FinishedInvoice } from "../models/invoice.js";
import { buildPdfFilename, createInvoicePdfBuffer } from "./invoicePdf.js";

export type InvoiceEmailProvider = "none" | "resend";

export type InvoiceEmailCapabilities = {
  provider: InvoiceEmailProvider;
  configured: boolean;
  fromEmail: string | null;
  fromAddress: string | null;
  fromDomain: string | null;
  launchTestRecipientConfigured: boolean;
};

export type InvoiceEmailVerification = {
  checked: boolean;
  ready: boolean;
  domainId: string | null;
  domainStatus: string | null;
  sendingCapability: string | null;
  warning: string | null;
};

export type InvoiceEmailDiagnostics = {
  capabilities: InvoiceEmailCapabilities;
  verification: InvoiceEmailVerification;
};

export type InvoiceEmailSendResult = {
  mode: "record_only" | "provider";
  provider: InvoiceEmailProvider;
  providerMessageId?: string;
  warning?: string;
};

type SendLaunchTestEmailInput = {
  recipientEmail: string;
  appBaseUrl?: string;
};

type SendInvoiceEmailInput = {
  recipientEmail: string;
  invoice: FinishedInvoice;
  invoiceId: string;
  openTrackingPixelUrl: string;
  customerInvoiceUrl?: string;
  messageType?: "invoice" | "estimate" | "reminder" | "receipt";
  reminderTone?: "friendly" | "firm";
  reminderLateFeePercent?: number;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_API_URL = "https://api.resend.com/domains";
const DEFAULT_FROM_EMAIL = "NoteBill <invoices@notebill.app>";
const RESEND_REQUEST_TIMEOUT_MS = 12_000;
const RESEND_VERIFICATION_CACHE_TTL_MS = 60_000;

const resendVerificationCache = new Map<
  string,
  {
    expiresAt: number;
    result: InvoiceEmailVerification;
  }
>();

export function resetInvoiceEmailVerificationCacheForTests(): void {
  resendVerificationCache.clear();
}

export function getInvoiceEmailCapabilities(): InvoiceEmailCapabilities {
  const provider = resolveInvoiceEmailProvider();
  const fromEmail = resolveInvoiceFromEmail();
  const fromAddress = resolveInvoiceFromAddress(fromEmail);
  const fromDomain = fromAddress ? fromAddress.split("@")[1] ?? null : null;
  const launchTestRecipientConfigured = Boolean(getOptionalEnv(process.env.INVOICE_LAUNCH_TEST_EMAIL));
  if (provider === "resend") {
    const apiKey = getOptionalEnv(process.env.RESEND_API_KEY);
    return {
      provider,
      configured: Boolean(apiKey && fromAddress),
      fromEmail,
      fromAddress,
      fromDomain,
      launchTestRecipientConfigured
    };
  }
  return {
    provider: "none",
    configured: false,
    fromEmail,
    fromAddress,
    fromDomain,
    launchTestRecipientConfigured
  };
}

export async function getInvoiceEmailDiagnostics(): Promise<InvoiceEmailDiagnostics> {
  const capabilities = getInvoiceEmailCapabilities();
  const verification = await getInvoiceEmailVerification(capabilities);
  return {
    capabilities,
    verification
  };
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<InvoiceEmailSendResult> {
  const capabilities = getInvoiceEmailCapabilities();
  if (!capabilities.configured || capabilities.provider === "none") {
    return {
      mode: "record_only",
      provider: "none",
      warning: "Email provider is not configured; delivery is tracked without sending."
    };
  }
  if (capabilities.provider === "resend") {
    return sendViaResend(input, capabilities.fromEmail ?? DEFAULT_FROM_EMAIL);
  }
  return {
    mode: "record_only",
    provider: "none",
    warning: "Email provider is not configured; delivery is tracked without sending."
  };
}

export async function sendLaunchTestEmail(
  input: SendLaunchTestEmailInput
): Promise<InvoiceEmailSendResult & { recipientEmail: string }> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!isValidEmailAddress(recipientEmail)) {
    throw new Error("Launch test recipient email is invalid.");
  }
  const result = await sendInvoiceEmail({
    recipientEmail,
    invoiceId: "launch-test",
    openTrackingPixelUrl: buildLaunchTestPixelUrl(input.appBaseUrl),
    messageType: "invoice",
    invoice: {
      invoiceNumber: "NOTEBILL-LAUNCH",
      issueDate: new Date().toISOString().slice(0, 10),
      customerName: "Launch verification",
      currency: "USD",
      lineItems: [
        {
          id: "launch-test-line",
          type: "other",
          description: "NoteBill launch test message",
          quantity: 1,
          unitPrice: 0,
          amount: 0
        }
      ],
      notes:
        "This is a launch-readiness verification email. If you received it, NoteBill email delivery is configured.",
      subtotal: 0,
      total: 0,
      balanceDue: 0
    }
  });
  return {
    ...result,
    recipientEmail
  };
}

async function sendViaResend(input: SendInvoiceEmailInput, fromEmail: string): Promise<InvoiceEmailSendResult> {
  const apiKey = getOptionalEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return {
      mode: "record_only",
      provider: "none",
      warning: "RESEND_API_KEY is missing; delivery is tracked without sending."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("timeout"));
  }, RESEND_REQUEST_TIMEOUT_MS);
  try {
    const payload = await buildResendPayload(input, fromEmail);
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(resolveResendErrorMessage(responsePayload, response.status));
    }
    const providerMessageId =
      typeof responsePayload?.id === "string" && responsePayload.id.trim().length > 0
        ? responsePayload.id.trim()
        : undefined;
    return {
      mode: "provider",
      provider: "resend",
      providerMessageId
    };
  } catch (error) {
    throw new Error(`Failed to send email via Resend: ${getErrorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function getInvoiceEmailVerification(
  capabilities: InvoiceEmailCapabilities
): Promise<InvoiceEmailVerification> {
  if (!capabilities.configured || capabilities.provider !== "resend") {
    return {
      checked: false,
      ready: false,
      domainId: null,
      domainStatus: null,
      sendingCapability: null,
      warning: null
    };
  }

  const apiKey = getOptionalEnv(process.env.RESEND_API_KEY);
  const fromDomain = capabilities.fromDomain;
  if (!apiKey || !fromDomain) {
    return {
      checked: false,
      ready: false,
      domainId: null,
      domainStatus: null,
      sendingCapability: null,
      warning: null
    };
  }

  const cacheKey = `${fromDomain}::${apiKey}`;
  const cached = resendVerificationCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("timeout"));
  }, RESEND_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_DOMAINS_API_URL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(resolveResendErrorMessage(payload, response.status));
    }

    const domains = Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
    const matchingDomain = domains.find((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const name = "name" in entry && typeof entry.name === "string" ? entry.name.trim().toLowerCase() : "";
      return name === fromDomain.toLowerCase();
    }) as
      | {
          id?: unknown;
          name?: unknown;
          status?: unknown;
          capabilities?: { sending?: unknown };
        }
      | undefined;

    if (!matchingDomain) {
      const result = {
        checked: true,
        ready: false,
        domainId: null,
        domainStatus: null,
        sendingCapability: null,
        warning: `Resend domain ${fromDomain} is not configured.`
      } satisfies InvoiceEmailVerification;
      resendVerificationCache.set(cacheKey, { expiresAt: now + RESEND_VERIFICATION_CACHE_TTL_MS, result });
      return result;
    }

    const domainStatus = typeof matchingDomain.status === "string" ? matchingDomain.status.trim().toLowerCase() : null;
    const sendingCapability =
      matchingDomain.capabilities && typeof matchingDomain.capabilities.sending === "string"
        ? matchingDomain.capabilities.sending.trim().toLowerCase()
        : null;
    const ready = domainStatus === "verified" && sendingCapability === "enabled";
    const result = {
      checked: true,
      ready,
      domainId: typeof matchingDomain.id === "string" ? matchingDomain.id : null,
      domainStatus,
      sendingCapability,
      warning: ready
        ? null
        : `Resend domain ${fromDomain} is not verified for sending${domainStatus ? ` (status: ${domainStatus})` : ""}.`
    } satisfies InvoiceEmailVerification;
    resendVerificationCache.set(cacheKey, { expiresAt: now + RESEND_VERIFICATION_CACHE_TTL_MS, result });
    return result;
  } catch (error) {
    const result = {
      checked: true,
      ready: false,
      domainId: null,
      domainStatus: null,
      sendingCapability: null,
      warning: `Unable to verify Resend domain readiness: ${getErrorMessage(error)}`
    } satisfies InvoiceEmailVerification;
    resendVerificationCache.set(cacheKey, { expiresAt: now + RESEND_VERIFICATION_CACHE_TTL_MS, result });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

type ResendAttachmentPayload = {
  filename: string;
  content: string;
};

async function buildResendPayload(input: SendInvoiceEmailInput, fromEmail: string): Promise<Record<string, unknown>> {
  const subject = buildInvoiceEmailSubject(input);
  const text = buildInvoiceEmailText(input);
  const html = buildInvoiceEmailHtml(input);
  const attachment = await buildInvoicePdfAttachment(input.invoice);
  return {
    from: fromEmail,
    to: [input.recipientEmail],
    subject,
    text,
    html,
    attachments: [attachment]
  };
}

async function buildInvoicePdfAttachment(invoice: FinishedInvoice): Promise<ResendAttachmentPayload> {
  const pdfBuffer = await createInvoicePdfBuffer({ invoice });
  return {
    filename: buildPdfFilename(invoice.invoiceNumber),
    content: pdfBuffer.toString("base64")
  };
}

function buildInvoiceEmailSubject(input: SendInvoiceEmailInput): string {
  const invoice = input.invoice;
  const invoiceNumber = toOptionalTrimmedString(invoice.invoiceNumber);
  if (input.messageType === "reminder") {
    const prefix = input.reminderTone === "firm" ? "Final payment reminder" : "Payment reminder";
    if (invoiceNumber) {
      return `${prefix} ${invoiceNumber}`;
    }
    return `${prefix} from NoteBill`;
  }
  const prefix =
    input.messageType === "receipt" ? "Receipt" : input.messageType === "estimate" ? "Estimate" : "Invoice";
  if (invoiceNumber) {
    return `${prefix} ${invoiceNumber}`;
  }
  return `${prefix} from NoteBill`;
}

function buildInvoiceEmailText(input: SendInvoiceEmailInput): string {
  const invoice = input.invoice;
  const invoiceNumber = toOptionalTrimmedString(invoice.invoiceNumber) ?? input.invoiceId;
  const issueDate = toOptionalTrimmedString(invoice.issueDate);
  const customerName = toOptionalTrimmedString(invoice.customerName) ?? "there";
  const total = formatCurrency(invoice.total, invoice.currency);
  const paymentLine =
    input.messageType !== "receipt" &&
    input.messageType !== "estimate" &&
    typeof invoice.paymentLinkUrl === "string" &&
    invoice.paymentLinkUrl.trim().length > 0
      ? `Pay online: ${invoice.paymentLinkUrl.trim()}`
      : "";
  const customerDocumentLabel = input.messageType === "estimate" ? "estimate" : "invoice";
  const customerInvoiceLine =
    typeof input.customerInvoiceUrl === "string" && input.customerInvoiceUrl.trim().length > 0
      ? `View ${customerDocumentLabel}: ${input.customerInvoiceUrl.trim()}`
      : "";
  const linePreview = invoice.lineItems
    .slice(0, 8)
    .map((lineItem) => `- ${lineItem.description}: ${formatCurrency(lineItem.amount, invoice.currency)}`)
    .join("\n");
  const introLine =
    input.messageType === "reminder"
      ? input.reminderTone === "firm"
        ? `This is a final reminder for invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}. Please arrange payment as soon as possible.`
        : `This is a reminder for invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`
      : input.messageType === "receipt"
        ? `We received your payment for invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`
        : input.messageType === "estimate"
          ? `Here is your estimate${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`
        : `Here is your invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`;
  const reminderLateFeeLine =
    input.messageType === "reminder"
      ? buildReminderLateFeeNotice(input.reminderLateFeePercent, {
          tone: input.reminderTone,
          format: "text"
        })
      : "";
  const billingStageLine = buildBillingStageSummaryLine(invoice, "text");
  const projectBillingLines = buildProjectBillingLines(invoice, "text") as string[];
  const attachmentTextLines = buildAttachmentLines(invoice, "text") as string[];
  const totalLabel = input.messageType === "receipt" ? "Paid amount" : "Total due";
  return [
    `Hi ${customerName},`,
    "",
    introLine,
    reminderLateFeeLine,
    billingStageLine,
    ...projectBillingLines,
    "",
    linePreview,
    "",
    `${totalLabel}: ${total}`,
    ...attachmentTextLines,
    paymentLine,
    customerInvoiceLine,
    "",
    "Sent with NoteBill."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildInvoiceEmailHtml(input: SendInvoiceEmailInput): string {
  const invoice = input.invoice;
  const invoiceNumber = escapeHtml(toOptionalTrimmedString(invoice.invoiceNumber) ?? input.invoiceId);
  const issueDate = escapeHtml(toOptionalTrimmedString(invoice.issueDate) ?? "N/A");
  const customerName = escapeHtml(toOptionalTrimmedString(invoice.customerName) ?? "Client");
  const total = escapeHtml(formatCurrency(invoice.total, invoice.currency));
  const paymentLink =
    input.messageType !== "estimate" &&
    typeof invoice.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0
      ? invoice.paymentLinkUrl.trim()
      : "";
  const lineRows = invoice.lineItems
    .slice(0, 8)
    .map((lineItem) => {
      const description = escapeHtml(lineItem.description);
      const amount = escapeHtml(formatCurrency(lineItem.amount, invoice.currency));
      return `<tr><td style="padding:6px 0;color:#0f172a;">${description}</td><td style="padding:6px 0;text-align:right;color:#0f172a;">${amount}</td></tr>`;
    })
    .join("");

  const introLine =
    input.messageType === "reminder"
      ? input.reminderTone === "firm"
        ? `Hi ${customerName}, this is a final reminder for your invoice. Please arrange payment as soon as possible.`
        : `Hi ${customerName}, this is a reminder for your invoice.`
      : input.messageType === "receipt"
        ? `Hi ${customerName}, we received your payment. Your receipt is attached.`
        : input.messageType === "estimate"
          ? `Hi ${customerName}, here is your estimate.`
        : `Hi ${customerName}, here is your invoice.`;
  const reminderLateFeeLine =
    input.messageType === "reminder"
      ? buildReminderLateFeeNotice(input.reminderLateFeePercent, {
          tone: input.reminderTone,
          format: "html"
        })
      : "";
  const billingStageHtml = buildBillingStageSummaryLine(invoice, "html");
  const projectBillingHtml = buildProjectBillingLines(invoice, "html") as string;
  const attachmentHtml = buildAttachmentLines(invoice, "html") as string;
  const paymentBlock = paymentLink
    ? `<p style="margin:16px 0 0 0;font-size:14px;line-height:1.5;">
        <a href="${escapeAttribute(paymentLink)}" style="color:#0b63ce;">Pay online</a>
      </p>`
    : "";
  const customerInvoiceUrl =
    typeof input.customerInvoiceUrl === "string" && input.customerInvoiceUrl.trim().length > 0
      ? input.customerInvoiceUrl.trim()
      : "";
  const customerInvoiceLabel = input.messageType === "estimate" ? "View estimate" : "View invoice";
  const customerInvoiceBlock = customerInvoiceUrl
    ? `<p style="margin:10px 0 0 0;font-size:14px;line-height:1.5;">
        <a href="${escapeAttribute(customerInvoiceUrl)}" style="color:#0b63ce;">${customerInvoiceLabel}</a>
      </p>`
    : "";
  const totalLabel = input.messageType === "receipt" ? "Paid amount" : "Total due";
  const headingLabel = input.messageType === "estimate" ? "Estimate" : "Invoice";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <tr>
              <td>
                <h1 style="margin:0;font-size:20px;color:#093064;">${headingLabel} ${invoiceNumber}</h1>
                <p style="margin:6px 0 0 0;font-size:14px;color:#475569;">Issue date: ${issueDate}</p>
                <p style="margin:12px 0 0 0;font-size:14px;color:#334155;">${introLine}</p>
                ${reminderLateFeeLine}
                ${billingStageHtml}
                ${projectBillingHtml}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;">
                  ${lineRows}
                </table>
                <p style="margin:16px 0 0 0;font-size:16px;font-weight:700;color:#0f172a;">${totalLabel}: ${total}</p>
                ${attachmentHtml}
                ${input.messageType === "receipt" ? "" : paymentBlock}
                ${customerInvoiceBlock}
                <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">Sent with NoteBill.</p>
                <img src="${escapeAttribute(input.openTrackingPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;outline:none;" />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function resolveInvoiceEmailProvider(): InvoiceEmailProvider {
  const configured = getOptionalEnv(process.env.INVOICE_EMAIL_PROVIDER);
  if (!configured) {
    return getOptionalEnv(process.env.RESEND_API_KEY) ? "resend" : "none";
  }
  if (configured === "resend") {
    return "resend";
  }
  return "none";
}

function resolveInvoiceFromEmail(): string | null {
  const configured = getOptionalEnv(process.env.INVOICE_FROM_EMAIL);
  if (configured) {
    return configured;
  }
  return DEFAULT_FROM_EMAIL;
}

function resolveInvoiceFromAddress(fromEmail: string | null): string | null {
  if (!fromEmail) {
    return null;
  }
  const match = fromEmail.match(/<([^>]+)>/);
  const candidate = (match?.[1] ?? fromEmail).trim().toLowerCase();
  return isValidEmailAddress(candidate) ? candidate : null;
}

function buildLaunchTestPixelUrl(appBaseUrl?: string): string {
  const baseUrl = getOptionalEnv(appBaseUrl) ?? getOptionalEnv(process.env.APP_BASE_URL);
  if (!baseUrl) {
    return "https://app.notebill.app/api/invoices/launch-test/delivery/opened?token=launch-test";
  }
  return `${baseUrl.replace(/\/+$/, "")}/api/invoices/launch-test/delivery/opened?token=launch-test`;
}

function formatCurrency(value: unknown, currency: unknown): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const currencyCode =
    typeof currency === "string" && currency.trim().length === 3 ? currency.trim().toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getOptionalEnv(value: string | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : null;
}

function resolveResendErrorMessage(payload: unknown, statusCode: number): string {
  const message =
    typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "";
  if (message) {
    return `${message} (status ${statusCode})`;
  }
  return `Request failed with status ${statusCode}.`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return "Unknown error.";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function buildBillingStageSummaryLine(
  invoice: FinishedInvoice,
  format: "text" | "html"
): string {
  const stage =
    invoice.billingStage === "deposit" ||
    invoice.billingStage === "progress" ||
    invoice.billingStage === "final"
      ? invoice.billingStage
      : "standard";
  if (stage === "standard") {
    return "";
  }
  const label = stage === "deposit" ? "Deposit" : stage === "progress" ? "Progress" : "Final";
  if (format === "html") {
    return `<p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:#334155;"><strong>Billing stage:</strong> ${escapeHtml(label)}</p>`;
  }
  return `Billing stage: ${label}`;
}

function buildProjectBillingLines(
  invoice: FinishedInvoice,
  format: "text" | "html"
): string[] | string {
  const lines: string[] = [];
  if (typeof invoice.projectTotal === "number" && Number.isFinite(invoice.projectTotal)) {
    lines.push(`Project total: ${formatCurrency(invoice.projectTotal, invoice.currency)}`);
  }
  if (typeof invoice.projectPaidToDate === "number" && Number.isFinite(invoice.projectPaidToDate)) {
    lines.push(`Paid to date: ${formatCurrency(invoice.projectPaidToDate, invoice.currency)}`);
  }
  if (
    typeof invoice.projectBalanceAfterInvoice === "number" &&
    Number.isFinite(invoice.projectBalanceAfterInvoice)
  ) {
    lines.push(
      `Remaining after this invoice: ${formatCurrency(
        Math.max(0, invoice.projectBalanceAfterInvoice),
        invoice.currency
      )}`
    );
  }
  if (format === "text") {
    return lines;
  }
  if (lines.length === 0) {
    return "";
  }
  const rows = lines
    .map((line) => `<li style="margin:0 0 4px 0;">${escapeHtml(line)}</li>`)
    .join("");
  return `<ul style="margin:8px 0 0 18px;padding:0;font-size:13px;color:#475569;">${rows}</ul>`;
}

function buildAttachmentLines(
  invoice: FinishedInvoice,
  format: "text" | "html"
): string[] | string {
  const attachments = Array.isArray(invoice.attachments)
    ? invoice.attachments
        .map((attachment) => ({
          label: toOptionalTrimmedString(attachment.label) ?? "",
          url: toOptionalTrimmedString(attachment.url) ?? ""
        }))
        .filter((attachment) => attachment.label.length > 0 && attachment.url.length > 0)
        .slice(0, 8)
    : [];
  if (attachments.length === 0) {
    return format === "text" ? [] : "";
  }
  if (format === "text") {
    return [
      "Attachments:",
      ...attachments.map((attachment) => `- ${attachment.label}: ${attachment.url}`)
    ];
  }
  const rows = attachments
    .map(
      (attachment) =>
        `<li style="margin:0 0 4px 0;"><a href="${escapeAttribute(attachment.url)}" style="color:#0b63ce;">${escapeHtml(attachment.label)}</a></li>`
    )
    .join("");
  return `<div style="margin:12px 0 0 0;">
    <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#334155;">Attachments</p>
    <ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#475569;">${rows}</ul>
  </div>`;
}

function buildReminderLateFeeNotice(
  value: unknown,
  options: {
    tone?: "friendly" | "firm";
    format: "text" | "html";
  }
): string {
  const lateFeePercent = normalizeReminderLateFeePercent(value);
  if (lateFeePercent === null) {
    return "";
  }

  const percentLabel = formatReminderPercent(lateFeePercent);
  const sentence =
    options.tone === "firm"
      ? `A ${percentLabel}% late fee may be applied to overdue balances.`
      : `To avoid a ${percentLabel}% late fee, please pay soon.`;

  if (options.format === "html") {
    return `<p style="margin:10px 0 0 0;font-size:13px;line-height:1.5;color:#92400e;font-weight:600;">${escapeHtml(sentence)}</p>`;
  }

  return sentence;
}

function normalizeReminderLateFeePercent(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.round(parsed * 100) / 100;
  if (normalized <= 0 || normalized > 50) {
    return null;
  }
  return normalized;
}

function formatReminderPercent(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}
