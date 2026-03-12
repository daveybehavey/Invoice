import { FinishedInvoice } from "../models/invoice.js";

export type InvoiceEmailProvider = "none" | "resend";

export type InvoiceEmailCapabilities = {
  provider: InvoiceEmailProvider;
  configured: boolean;
  fromEmail: string | null;
};

export type InvoiceEmailSendResult = {
  mode: "record_only" | "provider";
  provider: InvoiceEmailProvider;
  providerMessageId?: string;
  warning?: string;
};

type SendInvoiceEmailInput = {
  recipientEmail: string;
  invoice: FinishedInvoice;
  invoiceId: string;
  openTrackingPixelUrl: string;
  messageType?: "invoice" | "reminder";
};

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM_EMAIL = "NoteBill <invoices@notebill.app>";

export function getInvoiceEmailCapabilities(): InvoiceEmailCapabilities {
  const provider = resolveInvoiceEmailProvider();
  const fromEmail = resolveInvoiceFromEmail();
  if (provider === "resend") {
    const apiKey = getOptionalEnv(process.env.RESEND_API_KEY);
    return {
      provider,
      configured: Boolean(apiKey && fromEmail),
      fromEmail
    };
  }
  return {
    provider: "none",
    configured: false,
    fromEmail
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
  }, 12_000);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildResendPayload(input, fromEmail))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(resolveResendErrorMessage(payload, response.status));
    }
    const providerMessageId =
      typeof payload?.id === "string" && payload.id.trim().length > 0 ? payload.id.trim() : undefined;
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

function buildResendPayload(input: SendInvoiceEmailInput, fromEmail: string): Record<string, unknown> {
  const subject = buildInvoiceEmailSubject(input);
  const text = buildInvoiceEmailText(input);
  const html = buildInvoiceEmailHtml(input);
  return {
    from: fromEmail,
    to: [input.recipientEmail],
    subject,
    text,
    html
  };
}

function buildInvoiceEmailSubject(input: SendInvoiceEmailInput): string {
  const invoice = input.invoice;
  const invoiceNumber = toOptionalTrimmedString(invoice.invoiceNumber);
  const prefix = input.messageType === "reminder" ? "Payment reminder" : "Invoice";
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
    typeof invoice.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0
      ? `Pay online: ${invoice.paymentLinkUrl.trim()}`
      : "";
  const linePreview = invoice.lineItems
    .slice(0, 8)
    .map((lineItem) => `- ${lineItem.description}: ${formatCurrency(lineItem.amount, invoice.currency)}`)
    .join("\n");
  const introLine =
    input.messageType === "reminder"
      ? `This is a reminder for invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`
      : `Here is your invoice${invoiceNumber ? ` (${invoiceNumber})` : ""}${issueDate ? ` dated ${issueDate}` : ""}.`;
  return [
    `Hi ${customerName},`,
    "",
    introLine,
    "",
    linePreview,
    "",
    `Total due: ${total}`,
    paymentLine,
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
      ? `Hi ${customerName}, this is a reminder for your invoice.`
      : `Hi ${customerName}, here is your invoice.`;
  const paymentBlock = paymentLink
    ? `<p style="margin:16px 0 0 0;font-size:14px;line-height:1.5;">
        <a href="${escapeAttribute(paymentLink)}" style="color:#0b63ce;">Pay online</a>
      </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
            <tr>
              <td>
                <h1 style="margin:0;font-size:20px;color:#093064;">Invoice ${invoiceNumber}</h1>
                <p style="margin:6px 0 0 0;font-size:14px;color:#475569;">Issue date: ${issueDate}</p>
                <p style="margin:12px 0 0 0;font-size:14px;color:#334155;">${introLine}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;">
                  ${lineRows}
                </table>
                <p style="margin:16px 0 0 0;font-size:16px;font-weight:700;color:#0f172a;">Total due: ${total}</p>
                ${paymentBlock}
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
