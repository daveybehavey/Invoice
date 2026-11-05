import {
  type InvoiceEmailCapabilities,
  getInvoiceEmailCapabilities
} from "./invoiceEmailDelivery.js";
import { getGoogleAuthReadiness } from "./googleAuth.js";

export type InvoiceAuthProviderId = "email_link" | "google";

export type InvoiceAuthProviderCapability = {
  id: InvoiceAuthProviderId;
  label: string;
  kind: "email_link" | "oauth";
  implemented: boolean;
  configured: boolean;
  available: boolean;
  warning?: string;
};

type InvoiceAuthProviderInput = {
  nodeEnv?: string;
  emailCapabilities?: InvoiceEmailCapabilities;
  googleClientId?: string;
  googleClientSecret?: string;
};

export function getInvoiceAuthProviderCapabilities(
  input: InvoiceAuthProviderInput = {}
): InvoiceAuthProviderCapability[] {
  const emailCapabilities = input.emailCapabilities ?? getInvoiceEmailCapabilities();
  const emailConfigured = emailCapabilities.configured && emailCapabilities.provider !== "none";
  // Match /api/auth/session: unconfigured email delivery fails closed with
  // 503 (record_only), so never advertise email sign-in — including the old
  // "preview links" path — as available when delivery cannot send mail.
  const emailAvailable = emailConfigured;
  const googleReadiness = getGoogleAuthReadiness({
    clientId: input.googleClientId,
    clientSecret: input.googleClientSecret
  });

  return [
    {
      id: "email_link",
      label: "Email sign-in link",
      kind: "email_link",
      implemented: true,
      configured: emailConfigured,
      available: emailAvailable,
      warning: emailAvailable
        ? undefined
        : "A configured email delivery provider is required for email sign-in."
    },
    {
      id: "google",
      label: "Google Sign-In",
      kind: "oauth",
      implemented: true,
      configured: googleReadiness.configured,
      available: googleReadiness.available,
      warning: googleReadiness.warning
    }
  ];
}
