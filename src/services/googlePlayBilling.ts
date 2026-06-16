import { JWT } from "google-auth-library";
import {
  applyGooglePlaySubscriptionEntitlement,
  getGooglePlayEntitlementsSummary
} from "./googlePlayEntitlementsStore.js";

type GooglePlayBillingCapabilities = {
  provider: "google_play" | "none";
  available: boolean;
  hasServiceAccount: boolean;
  hasPackageName: boolean;
  hasProductId: boolean;
  hasSubscriptionProductId: boolean;
  hasLifetimeProductId: boolean;
  hasSubscriptionBasePlanId: boolean;
  hasSubscriptionOfferId: boolean;
  hasManageUrl: boolean;
  verificationAvailable: boolean;
  packageName: string | null;
  subscriptionProductId: string | null;
  subscriptionBasePlanId: string | null;
  subscriptionOfferId: string | null;
  subscriptionPlans: GooglePlaySubscriptionPlanOption[];
  lifetimeProductId: string | null;
  manageSubscriptionsUrl: string | null;
};

export type GooglePlaySubscriptionPlanOption = {
  basePlanId: string;
  label: string;
  cadenceLabel: string;
  description: string;
  badge: string | null;
  offerId: string | null;
  isDefault: boolean;
};

type GooglePlayVerificationResult = {
  purchaseToken: string;
  packageName: string;
  productId: string;
  productType: "subscription" | "one_time";
  subscriptionState: string;
  purchaseState: string | null;
  expiryAt: string | null;
  acknowledged: boolean;
  latestOrderId: string | null;
  basePlanId: string | null;
  consumptionState: string | null;
};

type GooglePlayVerificationInput = {
  purchaseToken: string;
  productId?: string;
  packageName?: string;
  basePlanId?: string;
  ownerId?: string;
  userId?: string;
  email?: string;
};

type GooglePlayServiceAccount = {
  client_email: string;
  private_key: string;
};

const GOOGLE_PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export function getGooglePlayBillingCapabilities(): GooglePlayBillingCapabilities {
  const packageName = normalizeText(process.env.GOOGLE_PLAY_PACKAGE_NAME);
  const subscriptionProductId =
    normalizeText(process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID) || "notebill_premium";
  const subscriptionBasePlanId =
    normalizeText(process.env.GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ID) || "premium-monthly";
  const subscriptionOfferId = normalizeText(process.env.GOOGLE_PLAY_SUBSCRIPTION_OFFER_ID);
  const subscriptionPlans = resolveGooglePlaySubscriptionPlans({
    defaultBasePlanId: subscriptionBasePlanId,
    defaultOfferId: subscriptionOfferId
  });
  const lifetimeProductId = normalizeText(process.env.GOOGLE_PLAY_LIFETIME_PRODUCT_ID);
  const hasServiceAccount = Boolean(readGooglePlayServiceAccount());
  const hasProductId = Boolean(subscriptionProductId || lifetimeProductId);
  const hasManageUrl = Boolean(packageName && subscriptionProductId);
  const verificationAvailable = Boolean(hasServiceAccount && packageName && hasProductId);
  return {
    provider: verificationAvailable ? "google_play" : "none",
    available: verificationAvailable,
    hasServiceAccount,
    hasPackageName: Boolean(packageName),
    hasProductId,
    hasSubscriptionProductId: Boolean(subscriptionProductId),
    hasLifetimeProductId: Boolean(lifetimeProductId),
    hasSubscriptionBasePlanId: Boolean(subscriptionBasePlanId),
    hasSubscriptionOfferId: Boolean(subscriptionOfferId),
    hasManageUrl,
    verificationAvailable,
    packageName,
    subscriptionProductId,
    subscriptionBasePlanId,
    subscriptionOfferId,
    subscriptionPlans,
    lifetimeProductId,
    manageSubscriptionsUrl: buildGooglePlayManageSubscriptionsUrl({
      packageName,
      productId: subscriptionProductId
    })
  };
}

export async function verifyGooglePlaySubscriptionPurchase(
  input: GooglePlayVerificationInput
): Promise<GooglePlayVerificationResult> {
  const capabilities = getGooglePlayBillingCapabilities();
  if (!capabilities.hasServiceAccount || !capabilities.hasPackageName || !capabilities.hasSubscriptionProductId) {
    throw new Error(
      "Google Play billing is not configured yet. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_PACKAGE_NAME, and GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID."
    );
  }

  return verifyGooglePlayProductPurchase({
    ...input,
    productType: "subscription",
    expectedProductId: capabilities.subscriptionProductId || "",
    allowedBasePlanIds: capabilities.subscriptionPlans.map((plan) => plan.basePlanId),
    packageName: normalizeText(input.packageName) || capabilities.packageName || ""
  });
}

export async function verifyGooglePlayOneTimeProductPurchase(
  input: GooglePlayVerificationInput
): Promise<GooglePlayVerificationResult> {
  const capabilities = getGooglePlayBillingCapabilities();
  if (!capabilities.hasServiceAccount || !capabilities.hasPackageName || !capabilities.hasLifetimeProductId) {
    throw new Error(
      "Google Play lifetime billing is not configured yet. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_PLAY_PACKAGE_NAME, and GOOGLE_PLAY_LIFETIME_PRODUCT_ID."
    );
  }

  return verifyGooglePlayProductPurchase({
    ...input,
    productType: "one_time",
    expectedProductId: capabilities.lifetimeProductId || "",
    packageName: normalizeText(input.packageName) || capabilities.packageName || ""
  });
}

function buildGooglePlayManageSubscriptionsUrl(input: {
  packageName?: string | null;
  productId?: string | null;
} = {}): string | null {
  const packageName = normalizeText(input.packageName ?? process.env.GOOGLE_PLAY_PACKAGE_NAME);
  if (!packageName) {
    return null;
  }
  const productId = normalizeText(input.productId ?? process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID);
  const params = new URLSearchParams({ package: packageName });
  if (productId) {
    params.set("sku", productId);
  }
  return `https://play.google.com/store/account/subscriptions?${params.toString()}`;
}

export async function getGooglePlayBillingDiagnostics(): Promise<{
  provider: "google_play" | "none";
  capabilities: GooglePlayBillingCapabilities;
  entitlements: Awaited<ReturnType<typeof getGooglePlayEntitlementsSummary>>;
  warning: string | null;
}> {
  const capabilities = getGooglePlayBillingCapabilities();
  const entitlements = await getGooglePlayEntitlementsSummary();
  const warning = resolveGooglePlayBillingWarning(capabilities, entitlements);
  return {
    provider: capabilities.provider,
    capabilities,
    entitlements,
    warning
  };
}

function resolveGooglePlayBillingWarning(
  capabilities: GooglePlayBillingCapabilities,
  entitlements: Awaited<ReturnType<typeof getGooglePlayEntitlementsSummary>>
): string | null {
  if (!capabilities.hasServiceAccount) {
    return "Google Play billing is not configured yet (missing GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).";
  }
  if (!capabilities.hasPackageName) {
    return "Google Play billing is missing GOOGLE_PLAY_PACKAGE_NAME.";
  }
  if (!capabilities.hasProductId) {
    return "Google Play billing is missing GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID or GOOGLE_PLAY_LIFETIME_PRODUCT_ID.";
  }
  if (entitlements.subscriptionCount > 0 && entitlements.activeSubscriptionCount === 0) {
    return "Google Play subscription records exist, but none are active.";
  }
  return null;
}

async function verifyGooglePlayProductPurchase(input: {
  purchaseToken: string;
  packageName: string;
  expectedProductId: string;
  productType: "subscription" | "one_time";
  productId?: string;
  basePlanId?: string;
  allowedBasePlanIds?: string[];
  ownerId?: string;
  userId?: string;
  email?: string;
}): Promise<GooglePlayVerificationResult> {
  const purchaseToken = normalizeText(input.purchaseToken);
  if (!purchaseToken) {
    throw new Error("Google Play purchase token is required.");
  }
  const packageName = normalizeText(input.packageName);
  if (!packageName) {
    throw new Error("Google Play package name is missing.");
  }

  const accessToken = await getGooglePlayAccessToken();
  const response = await fetch(buildGooglePlayPurchaseLookupUrl({
    packageName,
    productId: input.expectedProductId || input.productId || "",
    purchaseToken,
    productType: input.productType
  }), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const googleError = extractGooglePlayError(payload);
    throw new Error(
      `Google Play purchase verification failed (${response.status}${googleError.reason ? ` ${googleError.reason}` : ""}): ${
        googleError.message || "Unable to verify purchase."
      }`
    );
  }

  if (input.productType === "subscription") {
    return await finalizeSubscriptionPurchaseVerification({
      payload,
      input,
      purchaseToken,
      packageName
    });
  }

  return await finalizeOneTimePurchaseVerification({
    payload,
    input,
    purchaseToken,
    packageName
  });
}

function buildGooglePlayPurchaseLookupUrl(input: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  productType: "subscription" | "one_time";
}): string {
  if (input.productType === "subscription") {
    return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      input.packageName
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
  }
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName
  )}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}`;
}

async function finalizeSubscriptionPurchaseVerification(input: {
  payload: Record<string, unknown>;
  input: {
    purchaseToken: string;
    packageName: string;
    expectedProductId: string;
    productId?: string;
    basePlanId?: string;
    allowedBasePlanIds?: string[];
    ownerId?: string;
    userId?: string;
    email?: string;
  };
  purchaseToken: string;
  packageName: string;
}): Promise<GooglePlayVerificationResult> {
  const payload = input.payload as Record<string, unknown>;
  const subscriptionState = normalizeText(String(payload.subscriptionState ?? ""));
  const lineItems = Array.isArray(payload.lineItems) ? (payload.lineItems as Array<Record<string, unknown>>) : [];
  const lineItemProductId =
    lineItems
      .map((item) => normalizeText(String(item?.productId ?? "")))
      .find(Boolean) || normalizeText(input.input.productId) || input.input.expectedProductId || "";
  const basePlanId =
    lineItems
      .map((item) => {
        const offerDetails = item.offerDetails as Record<string, unknown> | undefined;
        return normalizeText(
          String(
            offerDetails?.basePlanId ??
              item.basePlanId ??
              item.subscriptionBasePlanId ??
              ""
          )
        );
      })
      .find(Boolean) || normalizeText(input.input.basePlanId);
  const latestOrderId = normalizeText(String(payload.latestOrderId ?? ""));
  const acknowledged = String(payload.acknowledgementState || "").toUpperCase().includes("ACKNOWLEDGED");
  const expiryAt = getLatestExpiryAt(lineItems as Array<Record<string, unknown>>);
  const active = isGooglePlaySubscriptionActive(subscriptionState, expiryAt);
  const expectedProductId = normalizeText(input.input.expectedProductId);
  const expectedBasePlanId = normalizeText(input.input.basePlanId);
  const allowedBasePlanIds = Array.isArray(input.input.allowedBasePlanIds)
    ? input.input.allowedBasePlanIds.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  if (expectedProductId && lineItemProductId && lineItemProductId !== expectedProductId) {
    throw new Error(
      `Google Play subscription product mismatch. Expected ${expectedProductId}, got ${lineItemProductId}.`
    );
  }

  if (expectedBasePlanId && basePlanId && basePlanId !== expectedBasePlanId) {
    throw new Error(
      `Google Play subscription base plan mismatch. Expected ${expectedBasePlanId}, got ${basePlanId}.`
    );
  }

  if (!expectedBasePlanId && allowedBasePlanIds.length > 0 && basePlanId && !allowedBasePlanIds.includes(basePlanId)) {
    throw new Error(
      `Google Play subscription base plan mismatch. Expected one of ${allowedBasePlanIds.join(", ")}, got ${basePlanId}.`
    );
  }

  if (!active) {
    throw new Error("That Google Play subscription is not active yet.");
  }

  await applyGooglePlaySubscriptionEntitlement({
    purchaseToken: input.purchaseToken,
    productId: lineItemProductId,
    packageName: input.packageName,
    ownerId: input.input.ownerId,
    userId: input.input.userId,
    email: input.input.email,
    subscriptionState,
    expiryAt,
    acknowledgedAt: acknowledged ? new Date().toISOString() : "",
    latestOrderId
  });

  return {
    purchaseToken: input.purchaseToken,
    packageName: input.packageName,
    productId: lineItemProductId,
    productType: "subscription",
    subscriptionState,
    purchaseState: null,
    expiryAt,
    acknowledged,
    latestOrderId: latestOrderId || null,
    basePlanId: basePlanId || null,
    consumptionState: null
  };
}

async function finalizeOneTimePurchaseVerification(input: {
  payload: Record<string, unknown>;
  input: {
    purchaseToken: string;
    packageName: string;
    expectedProductId: string;
    productId?: string;
    basePlanId?: string;
    ownerId?: string;
    userId?: string;
    email?: string;
  };
  purchaseToken: string;
  packageName: string;
}): Promise<GooglePlayVerificationResult> {
  const payload = input.payload as Record<string, unknown>;
  const purchaseState = normalizeText(String(payload.purchaseState ?? ""));
  const purchaseStateValue = Number.parseInt(purchaseState || "0", 10);
  if (purchaseStateValue !== 0) {
    throw new Error("That Google Play lifetime purchase is not active yet.");
  }

  const productId =
    normalizeText(String(payload.productId ?? "")) ||
    normalizeText(input.input.productId) ||
    input.input.expectedProductId ||
    "";
  const expectedProductId = normalizeText(input.input.expectedProductId);
  if (expectedProductId && productId && productId !== expectedProductId) {
    throw new Error(
      `Google Play lifetime product mismatch. Expected ${expectedProductId}, got ${productId}.`
    );
  }
  const latestOrderId = normalizeText(String(payload.orderId ?? ""));
  const acknowledgedState = normalizeText(String(payload.acknowledgementState ?? ""));
  const acknowledged =
    acknowledgedState === "1" || acknowledgedState.toUpperCase().includes("ACKNOWLEDGED") || acknowledgedState === "ACKNOWLEDGED";
  const consumptionState = normalizeText(String(payload.consumptionState ?? ""));

  await applyGooglePlaySubscriptionEntitlement({
    purchaseToken: input.purchaseToken,
    productId,
    packageName: input.packageName,
    ownerId: input.input.ownerId,
    userId: input.input.userId,
    email: input.input.email,
    subscriptionState: "ONE_TIME_PURCHASED",
    expiryAt: null,
    acknowledgedAt: acknowledged ? new Date().toISOString() : "",
    latestOrderId
  });

  return {
    purchaseToken: input.purchaseToken,
    packageName: input.packageName,
    productId,
    productType: "one_time",
    subscriptionState: "ONE_TIME_PURCHASED",
    purchaseState: purchaseState || "0",
    expiryAt: null,
    acknowledged,
    latestOrderId: latestOrderId || null,
    basePlanId: null,
    consumptionState: consumptionState || null
  };
}

async function getGooglePlayAccessToken(): Promise<string> {
  const credentials = readGooglePlayServiceAccount();
  if (!credentials) {
    throw new Error("Google Play billing service account credentials are missing.");
  }
  const authClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [GOOGLE_PLAY_SCOPE]
  });
  const accessToken = await authClient.getAccessToken();
  const token = typeof accessToken === "string" ? accessToken : accessToken?.token ?? "";
  if (!token) {
    throw new Error("Unable to get a Google Play API access token.");
  }
  return token;
}

function readGooglePlayServiceAccount(): GooglePlayServiceAccount | null {
  const raw = normalizeText(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GooglePlayServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key
    };
  } catch (_error) {
    return null;
  }
}

function extractGooglePlayError(payload: unknown): {
  message: string;
  reason: string;
} {
  if (!payload || typeof payload !== "object") {
    return { message: "", reason: "" };
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return { message: "", reason: "" };
  }
  const errorRecord = error as {
    message?: unknown;
    status?: unknown;
    errors?: unknown;
  };
  const message = normalizeText(typeof errorRecord.message === "string" ? errorRecord.message : "");
  const status = normalizeText(typeof errorRecord.status === "string" ? errorRecord.status : "");
  const details = Array.isArray(errorRecord.errors) ? errorRecord.errors : [];
  const detailReason =
    details
      .map((detail) => {
        if (!detail || typeof detail !== "object") {
          return "";
        }
        const reason = (detail as { reason?: unknown }).reason;
        return normalizeText(typeof reason === "string" ? reason : "");
      })
      .find(Boolean) || "";
  return {
    message,
    reason: detailReason || status
  };
}

function getLatestExpiryAt(lineItems: Array<Record<string, unknown>>): string | null {
  const expiryTimes = lineItems
    .map((lineItem: Record<string, unknown>) => normalizeText(String(lineItem?.expiryTime ?? "")))
    .filter(Boolean)
    .filter((value) => Number.isFinite(Date.parse(value)));
  if (expiryTimes.length === 0) {
    return null;
  }
  return expiryTimes.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function isGooglePlaySubscriptionActive(subscriptionState: string, expiryAt: string | null): boolean {
  const normalizedState = subscriptionState.trim().toUpperCase();
  if (normalizedState === "SUBSCRIPTION_STATE_ACTIVE" || normalizedState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
    return true;
  }
  if (!expiryAt || !Number.isFinite(Date.parse(expiryAt))) {
    return normalizedState === "SUBSCRIPTION_STATE_CANCELED";
  }
  const expiryMs = Date.parse(expiryAt);
  return expiryMs > Date.now() && normalizedState !== "SUBSCRIPTION_STATE_EXPIRED";
}

function resolveGooglePlaySubscriptionPlans(input: {
  defaultBasePlanId: string;
  defaultOfferId: string;
}): GooglePlaySubscriptionPlanOption[] {
  const configuredPlanIds = normalizeText(process.env.GOOGLE_PLAY_SUBSCRIPTION_PLAN_IDS);
  const rawPlanIds = (configuredPlanIds ? configuredPlanIds.split(",") : [input.defaultBasePlanId])
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const planIds = Array.from(new Set(rawPlanIds.length ? rawPlanIds : [input.defaultBasePlanId])).filter(Boolean);
  return planIds.map((basePlanId) => {
    const metadata = describeGooglePlayBasePlan(basePlanId);
    return {
      basePlanId,
      label: metadata.label,
      cadenceLabel: metadata.cadenceLabel,
      description: metadata.description,
      badge: metadata.badge,
      offerId: basePlanId === input.defaultBasePlanId ? input.defaultOfferId || null : null,
      isDefault: basePlanId === input.defaultBasePlanId
    };
  });
}

function describeGooglePlayBasePlan(basePlanId: string): {
  label: string;
  cadenceLabel: string;
  description: string;
  badge: string | null;
} {
  const normalized = normalizeText(basePlanId).toLowerCase();
  if (normalized.includes("weekly") || normalized.includes("week")) {
    return {
      label: "Weekly",
      cadenceLabel: "7-day cadence",
      description: "Best for a quick short-term test drive before committing to a longer plan.",
      badge: "Most flexible"
    };
  }
  if (normalized.includes("yearly") || normalized.includes("annual") || normalized.includes("year")) {
    return {
      label: "Yearly",
      cadenceLabel: "12-month cadence",
      description: "Best for steady repeat use if NoteBill is already part of your workflow.",
      badge: "Best value"
    };
  }
  if (normalized.includes("3month") || normalized.includes("3-month") || normalized.includes("quarter")) {
    return {
      label: "3 months",
      cadenceLabel: "90-day cadence",
      description: "A practical middle ground when monthly feels too short and yearly feels too soon.",
      badge: "Balanced"
    };
  }
  return {
    label: "Monthly",
    cadenceLabel: "30-day cadence",
    description: "The easiest starting point for most people who want the full workflow without a long commitment.",
    badge: "Recommended"
  };
}

function normalizeText(value: string | undefined | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}
