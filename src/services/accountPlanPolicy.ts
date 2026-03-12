import type { InvoiceAuthSession } from "./authSession.js";
import type { SavedInvoiceRepository } from "./savedInvoiceRepository.js";
import { hasActiveStripeEntitlement } from "./billingEntitlementsStore.js";

export type AccountPlanTier = "free" | "pro";

export type AccountPlanSummary = {
  plan: AccountPlanTier;
  canCreateInvoice: boolean;
  upgradeRequired: boolean;
  links: {
    upgradeUrl: string | null;
    billingPortalUrl: string | null;
  };
  period: {
    start: string;
    end: string;
  };
  limits: {
    invoicesPerMonth: number | null;
  };
  usage: {
    invoicesCreated: number;
    invoicesRemaining: number | null;
  };
};

export async function getAccountPlanSummary(input: {
  ownerId: string;
  authSession?: InvoiceAuthSession | null;
  repository: Pick<SavedInvoiceRepository, "listSavedInvoiceMetadata">;
  now?: Date;
}): Promise<AccountPlanSummary> {
  const now = input.now ?? new Date();
  const period = getMonthlyPeriodUtc(now);
  const links = getPlanLinks();
  const invoices = await input.repository.listSavedInvoiceMetadata(true, input.ownerId);
  const invoicesCreated = invoices.reduce((count, invoice) => {
    const createdAtMs = Date.parse(invoice.createdAt);
    if (!Number.isFinite(createdAtMs)) {
      return count;
    }
    return createdAtMs >= period.startMs && createdAtMs < period.endMs ? count + 1 : count;
  }, 0);

  const plan = await resolveAccountPlanTier(input.authSession, input.ownerId);
  if (plan === "pro") {
    return {
      plan,
      canCreateInvoice: true,
      upgradeRequired: false,
      links,
      period: {
        start: period.startIso,
        end: period.endIso
      },
      limits: {
        invoicesPerMonth: null
      },
      usage: {
        invoicesCreated,
        invoicesRemaining: null
      }
    };
  }

  const invoicesPerMonth = resolveFreeMonthlySaveLimit();
  const invoicesRemaining =
    invoicesPerMonth === null ? null : Math.max(0, invoicesPerMonth - invoicesCreated);
  const canCreateInvoice = invoicesPerMonth === null ? true : invoicesCreated < invoicesPerMonth;

  return {
    plan,
    canCreateInvoice,
    upgradeRequired: !canCreateInvoice,
    links,
    period: {
      start: period.startIso,
      end: period.endIso
    },
    limits: {
      invoicesPerMonth
    },
    usage: {
      invoicesCreated,
      invoicesRemaining
    }
  };
}

export function buildFreePlanLimitMessage(summary: AccountPlanSummary): string {
  if (summary.plan !== "free") {
    return "Plan limit reached.";
  }
  const limit = summary.limits.invoicesPerMonth;
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return "Free plan limit reached.";
  }
  return `Free plan limit reached (${summary.usage.invoicesCreated}/${limit} invoices this month). Upgrade to save more.`;
}

async function resolveAccountPlanTier(
  authSession: InvoiceAuthSession | null | undefined,
  ownerId: string
): Promise<AccountPlanTier> {
  const defaultPlan = resolveDefaultPlan();
  if (defaultPlan === "pro") {
    return "pro";
  }

  const proEmails = parseCsvToSet(process.env.INVOICE_PRO_EMAILS);
  const proUserIds = parseCsvToSet(process.env.INVOICE_PRO_USER_IDS);
  const proOwnerIds = parseCsvToSet(process.env.INVOICE_PRO_OWNER_IDS);
  if (authSession?.email && proEmails.has(authSession.email.trim().toLowerCase())) {
    return "pro";
  }
  if (authSession?.userId && proUserIds.has(authSession.userId.trim())) {
    return "pro";
  }
  if (ownerId && proOwnerIds.has(ownerId.trim())) {
    return "pro";
  }
  const hasBillingEntitlement = await hasActiveStripeEntitlement({
    ownerId,
    userId: authSession?.userId,
    email: authSession?.email
  });
  if (hasBillingEntitlement) {
    return "pro";
  }
  return "free";
}

function resolveDefaultPlan(): AccountPlanTier {
  const value = (process.env.INVOICE_DEFAULT_PLAN ?? "free").trim().toLowerCase();
  return value === "pro" ? "pro" : "free";
}

function getPlanLinks(): {
  upgradeUrl: string | null;
  billingPortalUrl: string | null;
} {
  return {
    upgradeUrl: parseOptionalHttpUrl(process.env.INVOICE_UPGRADE_URL),
    billingPortalUrl: parseOptionalHttpUrl(process.env.INVOICE_BILLING_PORTAL_URL)
  };
}

function resolveFreeMonthlySaveLimit(): number | null {
  const parsed = parsePositiveInteger(process.env.INVOICE_FREE_SAVE_LIMIT_PER_MONTH);
  if (parsed !== null) {
    return parsed;
  }
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  return nodeEnv === "production" ? 25 : null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseOptionalHttpUrl(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function parseCsvToSet(value: string | undefined): Set<string> {
  if (!value?.trim()) {
    return new Set();
  }
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function getMonthlyPeriodUtc(now: Date): {
  startIso: string;
  endIso: string;
  startMs: number;
  endMs: number;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime()
  };
}
