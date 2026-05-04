import {
  type InvoiceEmailCapabilities,
  getInvoiceEmailCapabilities
} from "./invoiceEmailDelivery.js";

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
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? "development").trim().toLowerCase() || "development";
  const emailCapabilities = input.emailCapabilities ?? getInvoiceEmailCapabilities();
  const emailConfigured = emailCapabilities.configured && emailCapabilities.provider !== "none";
  const emailAvailable = emailConfigured || nodeEnv !== "production";
  const googleClientIdConfigured = Boolean((input.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "").trim());
  const googleClientSecretConfigured = Boolean(
    (input.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim()
  );
  const googleConfigured = googleClientIdConfigured && googleClientSecretConfigured;

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
      implemented: false,
      configured: googleConfigured,
      available: false,
      warning: googleConfigured
        ? "Google client credentials are present, but the OAuth callback flow is not enabled yet."
        : "Google Sign-In groundwork is in place, but Google client credentials are not configured yet."
    }
  ];
}
