import { isInvoiceSessionSecretConfigured } from "./authSession.js";
import {
  type InvoiceEmailCapabilities,
  getInvoiceEmailCapabilities
} from "./invoiceEmailDelivery.js";
import {
  type InvoiceAuthProviderCapability,
  getInvoiceAuthProviderCapabilities
} from "./invoiceAuthProviders.js";

export type InvoiceAuthPolicy = {
  nodeEnv: string;
  requireAuth: boolean;
  sessionSecretConfigured: boolean;
  emailProviderConfigured: boolean;
  providers: InvoiceAuthProviderCapability[];
  productionReady: boolean;
  warning?: string;
};

type InvoiceAuthPolicyInput = {
  nodeEnv?: string;
  requireAuthEnv?: string;
  sessionSecret?: string;
  emailCapabilities?: InvoiceEmailCapabilities;
};

export function getInvoiceAuthPolicy(input: InvoiceAuthPolicyInput = {}): InvoiceAuthPolicy {
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? "development").trim() || "development";
  const requireAuth = resolveInvoiceRequireAuth(input.requireAuthEnv ?? process.env.INVOICE_REQUIRE_AUTH, nodeEnv);
  const sessionSecretConfigured = isInvoiceSessionSecretConfigured(
    input.sessionSecret ?? process.env.INVOICE_SESSION_SECRET
  );
  const emailReadiness = getInvoiceAuthEmailReadiness(input.emailCapabilities);
  const providers = getInvoiceAuthProviderCapabilities({
    nodeEnv,
    emailCapabilities: input.emailCapabilities
  });
  const interactiveProviderReady = providers.some((provider) => provider.available);
  const productionReady = !requireAuth || (sessionSecretConfigured && interactiveProviderReady);

  return {
    nodeEnv,
    requireAuth,
    sessionSecretConfigured,
    emailProviderConfigured: emailReadiness.ready,
    providers,
    productionReady,
    warning: productionReady
      ? undefined
      : !sessionSecretConfigured
        ? "Authentication is required, but INVOICE_SESSION_SECRET is missing or using an insecure default."
        : interactiveProviderReady
          ? undefined
          : "A configured email delivery provider is required for verified email sign-in, or finish Google Sign-In setup."
  };
}

export function getInvoiceAuthEmailReadiness(
  capabilities: InvoiceEmailCapabilities = getInvoiceEmailCapabilities()
): {
  ready: boolean;
  warning?: string;
} {
  if (capabilities.configured && capabilities.provider !== "none") {
    return { ready: true };
  }
  return {
    ready: false,
    warning: "A configured email delivery provider is required for verified email sign-in."
  };
}

export function resolveInvoiceRequireAuth(value: string | undefined, nodeEnv: string): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return nodeEnv.toLowerCase() === "production";
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}
