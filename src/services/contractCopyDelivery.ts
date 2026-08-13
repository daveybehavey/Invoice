import {

  LEGAL_SUPPLIER,

  LEGAL_TERMS_VERSION,

  buildTermsDownloadPath,

  buildTermsPlainText,

  buildVersionedTermsPath,

  resolveTermsDocument

} from "./legalFoundation.js";

import {

  getInvoiceEmailCapabilities,

  sendPlainTransactionalEmail

} from "./invoiceEmailDelivery.js";



export type ContractCopyDeliveryInput = {

  email: string;

  userId: string;

  termsVersion?: string;

  baseUrl: string;

};



export type ContractCopyDeliveryResult = {

  delivered: boolean;

  channel: "email" | "none";

  termsVersion: string;

  termsUrl: string;

  downloadUrl: string;

  messageId?: string;

  coalesced?: boolean;

  emailConfigured: boolean;

  statusMessage?: string;

};



type ContractCopyEmailSender = (input: {

  to: string;

  subject: string;

  text: string;

  html: string;

}) => Promise<{ messageId: string }>;



const CONTRACT_COPY_RATE_LIMIT_MS = 60_000;



type RateLimitEntry = {

  expiresAt: number;

  result: ContractCopyDeliveryResult;

};



const contractCopyRateLimitByKey = new Map<string, RateLimitEntry>();



let contractCopyEmailSenderForTests: ContractCopyEmailSender | null = null;



export function setContractCopyEmailSenderForTests(sender: ContractCopyEmailSender | null): void {

  contractCopyEmailSenderForTests = sender;

}



export function clearContractCopyRateLimitForTests(): void {

  contractCopyRateLimitByKey.clear();

}



function contractCopyRateLimitKey(userId: string, termsVersion: string): string {

  return `${userId}\0${termsVersion}`;

}



function buildContractCopyBody(

  baseUrl: string,

  termsVersion: string

): { text: string; html: string; termsUrl: string; downloadUrl: string } {

  const origin = baseUrl.replace(/\/$/, "");

  const termsPath = buildVersionedTermsPath(termsVersion);

  const downloadPath = buildTermsDownloadPath(termsVersion);

  const termsUrl = `${origin}${termsPath}`;

  const downloadUrl = `${origin}${downloadPath}`;

  const plainTerms = buildTermsPlainText(termsVersion);

  const text = [

    "Your NoteBill Pro contract copy",

    "",

    `Supplier: ${LEGAL_SUPPLIER.legalName}`,

    `Product: NoteBill (a product of ${LEGAL_SUPPLIER.tradeStyle})`,

    `Terms version: ${termsVersion}`,

    `Retainable Terms URL: ${termsUrl}`,

    `Download plain-text Terms: ${downloadUrl}`,

    "",

    plainTerms

  ].join("\n");

  const escaped = plainTerms

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;");

  const html = `<p>Your NoteBill Pro contract copy</p>

<p>Supplier: ${LEGAL_SUPPLIER.legalName}<br/>

Product: NoteBill (a product of ${LEGAL_SUPPLIER.tradeStyle})<br/>

Terms version: <strong>${termsVersion}</strong><br/>

<a href="${termsUrl}">Open retainable Terms</a><br/>

<a href="${downloadUrl}">Download plain-text Terms</a></p>

<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${escaped}</pre>`;

  return { text, html, termsUrl, downloadUrl };

}



export async function deliverContractCopy(

  input: ContractCopyDeliveryInput

): Promise<ContractCopyDeliveryResult> {

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";

  const userId = typeof input.userId === "string" ? input.userId.trim() : "";

  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";

  if (!email || !userId || !baseUrl) {

    throw new Error("Contract copy requires an authenticated email, user id, and base URL.");

  }



  // Resolve/validate Terms version before any cache lookup so unknown versions never coalesce.

  const termsDoc = resolveTermsDocument(

    typeof input.termsVersion === "string" && input.termsVersion.trim()

      ? input.termsVersion.trim()

      : LEGAL_TERMS_VERSION

  );

  const termsVersion = termsDoc.version;

  const rateLimitKey = contractCopyRateLimitKey(userId, termsVersion);



  const now = Date.now();

  const existing = contractCopyRateLimitByKey.get(rateLimitKey);

  if (existing && existing.expiresAt > now) {

    return { ...existing.result, coalesced: true };

  }



  const body = buildContractCopyBody(baseUrl, termsVersion);

  const subject = `NoteBill Pro contract copy (${termsVersion})`;

  const origin = baseUrl.replace(/\/$/, "");

  const downloadUrl = `${origin}${buildTermsDownloadPath(termsVersion)}`;



  if (contractCopyEmailSenderForTests) {

    const sent = await contractCopyEmailSenderForTests({

      to: email,

      subject,

      text: body.text,

      html: body.html

    });

    const result: ContractCopyDeliveryResult = {

      delivered: true,

      channel: "email",

      termsVersion,

      termsUrl: body.termsUrl,

      downloadUrl,

      messageId: sent.messageId,

      emailConfigured: true,

      statusMessage: "Contract copy emailed."

    };

    contractCopyRateLimitByKey.set(rateLimitKey, {

      expiresAt: now + CONTRACT_COPY_RATE_LIMIT_MS,

      result

    });

    return result;

  }



  const capabilities = getInvoiceEmailCapabilities();

  if (!capabilities.configured) {

    const result: ContractCopyDeliveryResult = {

      delivered: false,

      channel: "none",

      termsVersion,

      termsUrl: body.termsUrl,

      downloadUrl,

      emailConfigured: false,

      statusMessage:

        "Email delivery is not configured. Download or print the Terms from the retainable URL or download path."

    };

    contractCopyRateLimitByKey.set(rateLimitKey, {

      expiresAt: now + CONTRACT_COPY_RATE_LIMIT_MS,

      result

    });

    return result;

  }



  const sent = await sendPlainTransactionalEmail({

    recipientEmail: email,

    subject,

    textBody: body.text,

    htmlBody: body.html

  });



  const result: ContractCopyDeliveryResult = {

    delivered: true,

    channel: "email",

    termsVersion,

    termsUrl: body.termsUrl,

    downloadUrl,

    messageId: sent.providerMessageId,

    emailConfigured: true,

    statusMessage: "Contract copy emailed."

  };

  contractCopyRateLimitByKey.set(rateLimitKey, {

    expiresAt: now + CONTRACT_COPY_RATE_LIMIT_MS,

    result

  });

  return result;

}
