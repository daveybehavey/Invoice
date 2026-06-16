import { FinishedInvoice } from "../models/invoice.js";
import { buildPaymentMethodHtml, buildPaymentMethodTextLines } from "./paymentMethods.js";

export type InvoiceEmailProvider = "none" | "resend" | "smtp2go";

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
  messageType?: "invoice" | "reminder";
};

type ClientStatementInvoiceSummary = {
  invoiceNumber?: string | null;
  dueDate?: string | null;
  total?: number | null;
  balanceDue?: number | null;
  currency?: string | null;
};

type SendClientStatementEmailInput = {
  recipientEmail: string;
  clientName: string;
  preparedAt: string;
  openBalance: number;
  currency?: string | null;
  invoices: ClientStatementInvoiceSummary[];
};

type SendAuthSignInEmailInput = {
  recipientEmail: string;
  signInUrl: string;
  expiresAt: string;
};

type TransactionalEmailInput = {
  recipientEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_API_URL = "https://api.resend.com/domains";
const SMTP2GO_API_URL = "https://api.smtp2go.com/v3/email/send";
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
  if (provider === "smtp2go") {
    const apiKey = getOptionalEnv(process.env.SMTP2GO_API_KEY);
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
  return sendTransactionalEmail({
    recipientEmail: input.recipientEmail,
    subject: buildInvoiceEmailSubject(input),
    textBody: buildInvoiceEmailText(input),
    htmlBody: buildInvoiceEmailHtml(input)
  });
}

export async function sendClientStatementEmail(
  input: SendClientStatementEmailInput
): Promise<InvoiceEmailSendResult> {
  return sendTransactionalEmail({
    recipientEmail: input.recipientEmail,
    subject: buildClientStatementEmailSubject(input),
    textBody: buildClientStatementEmailText(input),
    htmlBody: buildClientStatementEmailHtml(input)
  });
}

export async function sendAuthSignInEmail(
  input: SendAuthSignInEmailInput
): Promise<InvoiceEmailSendResult & { recipientEmail: string }> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!isValidEmailAddress(recipientEmail)) {
    throw new Error("Sign-in recipient email is invalid.");
  }
  const result = await sendTransactionalEmail({
    recipientEmail,
    subject: "Sign in to NoteBill",
    textBody: buildAuthSignInEmailText({ ...input, recipientEmail }),
    htmlBody: buildAuthSignInEmailHtml({ ...input, recipientEmail })
  });
  return {
    ...result,
    recipientEmail
  };
}

async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<InvoiceEmailSendResult> {
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
  if (capabilities.provider === "smtp2go") {
    return sendViaSmtp2go(input, capabilities.fromEmail ?? DEFAULT_FROM_EMAIL);
  }
  return {
    mode: "record_only",
    provider: "none",
    warning: "Email provider is not configured; delivery is tracked without sending."
  };
}

async function sendViaSmtp2go(input: TransactionalEmailInput, fromEmail: string): Promise<InvoiceEmailSendResult> {
  const apiKey = getOptionalEnv(process.env.SMTP2GO_API_KEY);
  if (!apiKey) {
    return {
      mode: "record_only",
      provider: "none",
      warning: "SMTP2GO_API_KEY is missing; delivery is tracked without sending."
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("timeout"));
  }, RESEND_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SMTP2GO_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(buildSmtp2goPayload(input, fromEmail, apiKey))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(resolveSmtp2goErrorMessage(payload, response.status));
    }
    const providerMessageId = resolveSmtp2goMessageId(payload);
    return {
      mode: "provider",
      provider: "smtp2go",
      providerMessageId
    };
  } catch (error) {
    throw new Error(`Failed to send email via SMTP2GO: ${getErrorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
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
      documentType: "invoice",
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

async function sendViaResend(input: TransactionalEmailInput, fromEmail: string): Promise<InvoiceEmailSendResult> {
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

async function getInvoiceEmailVerification(
  capabilities: InvoiceEmailCapabilities
): Promise<InvoiceEmailVerification> {
  if (!capabilities.configured || capabilities.provider !== "resend") {
    if (capabilities.configured && capabilities.provider === "smtp2go") {
      return {
        checked: false,
        ready: true,
        domainId: null,
        domainStatus: "configured",
        sendingCapability: "enabled",
        warning: null
      };
    }
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

function buildResendPayload(input: TransactionalEmailInput, fromEmail: string): Record<string, unknown> {
  return {
    from: fromEmail,
    to: [input.recipientEmail],
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody
  };
}

function buildSmtp2goPayload(
  input: TransactionalEmailInput,
  fromEmail: string,
  apiKey: string
): Record<string, unknown> {
  return {
    api_key: apiKey,
    sender: fromEmail,
    to: [input.recipientEmail],
    subject: input.subject,
    text_body: input.textBody,
    html_body: input.htmlBody
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
  const dueDate = toOptionalTrimmedString(invoice.dueDate);
  const customerName = toOptionalTrimmedString(invoice.customerName) ?? "there";
  const total = formatCurrency(invoice.total, invoice.currency);
  const paymentLine =
    typeof invoice.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0
      ? `Pay online: ${invoice.paymentLinkUrl.trim()}`
      : "";
  const paymentMethodsLine = buildPaymentMethodTextLines(invoice.paymentMethods);
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
      dueDate ? `Due date: ${dueDate}` : "",
      paymentLine,
      paymentMethodsLine,
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
  const dueDate = toOptionalTrimmedString(invoice.dueDate);
  const customerName = escapeHtml(toOptionalTrimmedString(invoice.customerName) ?? "Client");
  const total = escapeHtml(formatCurrency(invoice.total, invoice.currency));
  const paymentLink =
    typeof invoice.paymentLinkUrl === "string" && invoice.paymentLinkUrl.trim().length > 0
      ? invoice.paymentLinkUrl.trim()
      : "";
  const paymentMethodsBlock = buildPaymentMethodHtml(invoice.paymentMethods);
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
                ${
                  dueDate
                    ? `<p style="margin:6px 0 0 0;font-size:14px;color:#475569;">Due date: ${escapeHtml(dueDate)}</p>`
                    : ""
                }
                <p style="margin:12px 0 0 0;font-size:14px;color:#334155;">${introLine}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;">
                  ${lineRows}
                </table>
                <p style="margin:16px 0 0 0;font-size:16px;font-weight:700;color:#0f172a;">Total due: ${total}</p>
                ${paymentBlock}
                ${paymentMethodsBlock}
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

function buildClientStatementEmailSubject(input: SendClientStatementEmailInput): string {
  const clientName = toOptionalTrimmedString(input.clientName);
  return clientName ? `${clientName} statement from NoteBill` : "Client statement from NoteBill";
}

function buildClientStatementEmailText(input: SendClientStatementEmailInput): string {
  const clientName = toOptionalTrimmedString(input.clientName) ?? "your account";
  const currency = resolveStatementCurrency(input);
  const preparedAt = formatStatementPreparedAt(input.preparedAt);
  const invoiceLines =
    input.invoices.length > 0
      ? input.invoices.map((invoice) => {
          const invoiceNumber = toOptionalTrimmedString(invoice.invoiceNumber) ?? "Draft";
          const balanceDue = formatCurrency(Number(invoice.balanceDue ?? 0), currency);
          const dueDate = toOptionalTrimmedString(invoice.dueDate);
          const total = Number.isFinite(Number(invoice.total))
            ? `Total ${formatCurrency(Number(invoice.total), currency)}`
            : "";
          return `- ${invoiceNumber}: ${balanceDue} open${dueDate ? `, due ${dueDate}` : ""}${total ? `, ${total}` : ""}`;
        })
      : ["- No open invoices were found."];
  return [
    `Hi ${clientName},`,
    "",
    preparedAt
      ? `Here is your current NoteBill statement prepared ${preparedAt}.`
      : "Here is your current NoteBill statement.",
    "",
    ...invoiceLines,
    "",
    `Total open balance: ${formatCurrency(input.openBalance, currency)}`,
    "",
    "If anything looks off, reply and I can adjust it right away.",
    "",
    "Sent with NoteBill."
  ].join("\n");
}

function buildClientStatementEmailHtml(input: SendClientStatementEmailInput): string {
  const clientName = escapeHtml(toOptionalTrimmedString(input.clientName) ?? "Client");
  const currency = resolveStatementCurrency(input);
  const preparedAt = formatStatementPreparedAt(input.preparedAt);
  const rows = input.invoices.length
    ? input.invoices
        .map((invoice) => {
          const invoiceNumber = escapeHtml(toOptionalTrimmedString(invoice.invoiceNumber) ?? "Draft");
          const dueDate = escapeHtml(toOptionalTrimmedString(invoice.dueDate) ?? "Not set");
          const total = escapeHtml(
            Number.isFinite(Number(invoice.total)) ? formatCurrency(Number(invoice.total), currency) : "-"
          );
          const openBalance = escapeHtml(formatCurrency(Number(invoice.balanceDue ?? 0), currency));
          return `<tr>
            <td style="padding:8px 0;color:#0f172a;">${invoiceNumber}</td>
            <td style="padding:8px 0;color:#475569;">${dueDate}</td>
            <td style="padding:8px 0;text-align:right;color:#0f172a;">${total}</td>
            <td style="padding:8px 0;text-align:right;color:#0f172a;font-weight:700;">${openBalance}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" style="padding:8px 0;color:#475569;">No open invoices were found.</td></tr>`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
            <tr>
              <td>
                <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#17493c;font-weight:700;">Client statement</p>
                <h1 style="margin:10px 0 0 0;font-size:24px;color:#093064;">${clientName}</h1>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#475569;">
                  ${preparedAt ? `Here is your current NoteBill statement prepared ${escapeHtml(preparedAt)}.` : "Here is your current NoteBill statement."}
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:0 0 10px 0;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Invoice</th>
                      <th style="padding:0 0 10px 0;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Due</th>
                      <th style="padding:0 0 10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Total</th>
                      <th style="padding:0 0 10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
                <p style="margin:18px 0 0 0;font-size:16px;font-weight:700;color:#0f172a;">Total open balance: ${escapeHtml(
                  formatCurrency(input.openBalance, currency)
                )}</p>
                <p style="margin:18px 0 0 0;font-size:13px;color:#64748b;">If anything looks off, reply and I can adjust it right away.</p>
                <p style="margin:18px 0 0 0;font-size:12px;color:#64748b;">Sent with NoteBill.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildAuthSignInEmailText(input: SendAuthSignInEmailInput & { recipientEmail: string }): string {
  const expiresAt = formatEmailTimestamp(input.expiresAt);
  return [
    "Use the link below to sign in to NoteBill:",
    "",
    input.signInUrl,
    "",
    expiresAt ? `This sign-in link expires ${expiresAt}.` : "This sign-in link expires soon.",
    "If you did not request this email, you can ignore it."
  ].join("\n");
}

function resolveStatementCurrency(input: SendClientStatementEmailInput): string {
  const explicit = toOptionalTrimmedString(input.currency);
  if (explicit) {
    return explicit;
  }
  const firstInvoiceCurrency = input.invoices
    .map((invoice) => toOptionalTrimmedString(invoice.currency))
    .find(Boolean);
  return firstInvoiceCurrency ?? "USD";
}

function formatStatementPreparedAt(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildAuthSignInEmailHtml(input: SendAuthSignInEmailInput & { recipientEmail: string }): string {
  const expiresAt = formatEmailTimestamp(input.expiresAt);
  const expiresLine = expiresAt
    ? `This sign-in link expires ${escapeHtml(expiresAt)}.`
    : "This sign-in link expires soon.";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
            <tr>
              <td>
                <h1 style="margin:0;font-size:22px;color:#093064;">Sign in to NoteBill</h1>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#334155;">
                  Click the secure link below to finish signing in.
                </p>
                <p style="margin:20px 0 0 0;">
                  <a
                    href="${escapeAttribute(input.signInUrl)}"
                    style="display:inline-block;border-radius:999px;background:#093064;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:14px;font-weight:700;"
                  >
                    Sign in to NoteBill
                  </a>
                </p>
                <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#475569;">
                  ${expiresLine}
                </p>
                <p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                  If you did not request this email, you can safely ignore it.
                </p>
                <p style="margin:20px 0 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="${escapeAttribute(input.signInUrl)}" style="color:#0b63ce;">${escapeHtml(input.signInUrl)}</a>
                </p>
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
    if (getOptionalEnv(process.env.RESEND_API_KEY)) {
      return "resend";
    }
    if (getOptionalEnv(process.env.SMTP2GO_API_KEY)) {
      return "smtp2go";
    }
    return "none";
  }
  if (configured === "resend") {
    return "resend";
  }
  if (configured === "smtp2go") {
    return "smtp2go";
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

function resolveSmtp2goErrorMessage(payload: unknown, statusCode: number): string {
  const data =
    typeof payload === "object" && payload && "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;
  const errorMessage =
    data && "error" in data && typeof data.error === "string"
      ? data.error
      : typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "";
  if (errorMessage) {
    return `${errorMessage} (status ${statusCode})`;
  }
  return `Request failed with status ${statusCode}.`;
}

function resolveSmtp2goMessageId(payload: unknown): string | undefined {
  const data =
    typeof payload === "object" && payload && "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;
  const candidate =
    data && "email_id" in data && typeof data.email_id === "string"
      ? data.email_id
      : data && "message_id" in data && typeof data.message_id === "string"
        ? data.message_id
        : typeof payload === "object" && payload && "request_id" in payload && typeof payload.request_id === "string"
          ? payload.request_id
          : undefined;
  return candidate?.trim() ? candidate.trim() : undefined;
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

function formatEmailTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}
