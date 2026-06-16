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
  clientId?: string;
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
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? "development").trim().toLowerCase() || "development";
  const emailCapabilities = input.emailCapabilities ?? getInvoiceEmailCapabilities();
  const emailConfigured = emailCapabilities.configured && emailCapabilities.provider !== "none";
  const emailAvailable = emailConfigured || nodeEnv !== "production";
  const googleReadiness = getGoogleAuthReadiness({
    clientId: input.googleClientId,
    clientSecret: input.googleClientSecret
  });
  const googleClientId = normalizeText(input.googleClientId);

  return [
    {
      id: "email_link",
      label: "Email sign-in link",
      kind: "email_link",
      implemented: true,
      configured: emailConfigured,
      available: emailAvailable,
      warning: emailAvailable
        ? emailConfigured
          ? undefined
          : "Email sign-in will use preview links until an email provider is configured."
        : "A configured email delivery provider is required for email sign-in in production."
    },
    {
      id: "google",
      label: "Google Sign-In",
      kind: "oauth",
      implemented: true,
      configured: googleReadiness.configured,
      available: googleReadiness.available,
      clientId: googleClientId || undefined,
      warning: googleReadiness.warning
    }
  ];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
