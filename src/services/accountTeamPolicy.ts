import type { InvoiceAuthSession } from "./authSession.js";

export type AccountTeamRole = "owner" | "helper";

export type AccountTeamCapabilities = {
  canApplyMoneyActions: boolean;
  canCreatePaymentLinks: boolean;
  canMarkInvoicesPaid: boolean;
  canApproveEstimates: boolean;
  canConvertEstimates: boolean;
  canRunReminderAutomation: boolean;
};

export type AccountTeamSummary = {
  role: AccountTeamRole;
  capabilities: AccountTeamCapabilities;
};

export function resolveAccountTeamSummary(input: {
  authSession?: InvoiceAuthSession | null;
  ownerId: string;
}): AccountTeamSummary {
  const role = resolveAccountTeamRole(input);
  return {
    role,
    capabilities: getAccountTeamCapabilities(role)
  };
}

function resolveAccountTeamRole(input: {
  authSession?: InvoiceAuthSession | null;
  ownerId: string;
}): AccountTeamRole {
  const helperEmails = parseCsvSet(process.env.INVOICE_TEAM_HELPER_EMAILS, { lowercase: true });
  const helperUserIds = parseCsvSet(process.env.INVOICE_TEAM_HELPER_USER_IDS);
  const ownerEmails = parseCsvSet(process.env.INVOICE_TEAM_OWNER_EMAILS, { lowercase: true });
  const ownerUserIds = parseCsvSet(process.env.INVOICE_TEAM_OWNER_USER_IDS);
  const auth = input.authSession ?? null;

  if (!auth) {
    // Local/no-auth mode defaults to owner for backward-compatible behavior.
    return "owner";
  }

  const normalizedEmail = auth.email.trim().toLowerCase();
  const normalizedUserId = auth.userId.trim();

  if (helperEmails.has(normalizedEmail) || helperUserIds.has(normalizedUserId)) {
    return "helper";
  }

  const ownerListsConfigured = ownerEmails.size > 0 || ownerUserIds.size > 0;
  if (!ownerListsConfigured) {
    return "owner";
  }

  if (ownerEmails.has(normalizedEmail) || ownerUserIds.has(normalizedUserId)) {
    return "owner";
  }

  // When owner lists are configured, unknown users become helper by default.
  return "helper";
}

function getAccountTeamCapabilities(role: AccountTeamRole): AccountTeamCapabilities {
  if (role === "owner") {
    return {
      canApplyMoneyActions: true,
      canCreatePaymentLinks: true,
      canMarkInvoicesPaid: true,
      canApproveEstimates: true,
      canConvertEstimates: true,
      canRunReminderAutomation: true
    };
  }

  return {
    canApplyMoneyActions: false,
    canCreatePaymentLinks: false,
    canMarkInvoicesPaid: false,
    canApproveEstimates: false,
    canConvertEstimates: false,
    canRunReminderAutomation: false
  };
}

function parseCsvSet(
  value: string | undefined,
  options?: {
    lowercase?: boolean;
  }
): Set<string> {
  if (!value?.trim()) {
    return new Set();
  }

  const lowercase = options?.lowercase ?? false;
  const normalized = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (lowercase ? entry.toLowerCase() : entry));
  return new Set(normalized);
}
