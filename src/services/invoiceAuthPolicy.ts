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

export function normalizeInvoiceNodeEnv(value: string | undefined): string {
  const normalized = (value ?? "development").trim().toLowerCase();
  return normalized || "development";
}

export function getInvoiceAuthPolicy(input: InvoiceAuthPolicyInput = {}): InvoiceAuthPolicy {
  const nodeEnv = normalizeInvoiceNodeEnv(input.nodeEnv ?? process.env.NODE_ENV);
  const requireAuthEnv = input.requireAuthEnv ?? process.env.INVOICE_REQUIRE_AUTH;
  // An explicit false is distinguished from the effective requirement: in
  // production the override is prohibited, so effective auth stays on and
  // the deployment reports non-ready until the override is removed.
  const explicitFalse = parseBooleanEnv(requireAuthEnv) === false;
  const production = nodeEnv === "production";
  const requireAuth = production ? true : resolveInvoiceRequireAuth(requireAuthEnv, nodeEnv);
  const sessionSecretConfigured = isInvoiceSessionSecretConfigured(
    input.sessionSecret ?? process.env.INVOICE_SESSION_SECRET
  );
  const emailReadiness = getInvoiceAuthEmailReadiness(input.emailCapabilities);
  const providers = getInvoiceAuthProviderCapabilities({
    nodeEnv,
    emailCapabilities: input.emailCapabilities
  });
  const interactiveProviderReady = providers.some((provider) => provider.available);
  const productionReady =
    !(production && explicitFalse) && (!requireAuth || (sessionSecretConfigured && interactiveProviderReady));

  return {
    nodeEnv,
    requireAuth,
    sessionSecretConfigured,
    emailProviderConfigured: emailReadiness.ready,
    providers,
    productionReady,
    warning: productionReady
      ? undefined
      : production && explicitFalse
        ? "INVOICE_REQUIRE_AUTH=false is prohibited in production: authentication is always required when NODE_ENV is production. Remove the override or set INVOICE_REQUIRE_AUTH=true."
        : !sessionSecretConfigured
          ? "Authentication is required, but INVOICE_SESSION_SECRET is missing or using an insecure default."
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
  // Production always requires authentication; INVOICE_REQUIRE_AUTH=false
  // is a prohibited override there, never an effective setting.
  if (normalizeInvoiceNodeEnv(nodeEnv) === "production") {
    return true;
  }
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return false;
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
