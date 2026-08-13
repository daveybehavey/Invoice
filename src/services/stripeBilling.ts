import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  applyCheckoutSessionEntitlement,
  applySubscriptionEntitlement,
  findBillingCustomerIdForOwner
} from "./billingEntitlementsStore.js";
import {
  TERMS_ACCEPTANCE_METHOD,
  assertValidTermsAcknowledgement,
  listRegisteredTermsVersions
} from "./legalFoundation.js";

const CHECKOUT_SESSION_ID_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

/**
 * Append or replace `acceptedTermsVersion` on a Checkout success path.
 * Preserves an existing `session_id={CHECKOUT_SESSION_ID}` placeholder when present.
 * Stable: same inputs always produce the same string.
 */
export function appendAcceptedTermsVersionToSuccessPath(
  successPath: string,
  termsVersion: string
): string {
  const version = typeof termsVersion === "string" ? termsVersion.trim() : "";
  if (!version) {
    throw new Error("acceptedTermsVersion requires a Terms version.");
  }
  const registered = listRegisteredTermsVersions();
  if (!registered.includes(version)) {
    throw new Error(
      `Unknown Terms version "${version}". Registered versions: ${registered.join(", ")}.`
    );
  }
  const raw = typeof successPath === "string" ? successPath.trim() : "";
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    throw new Error("successPath must be an absolute app path.");
  }
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : raw.slice(hashIndex);
  const qIndex = withoutHash.indexOf("?");
  const pathname = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex);
  const search = qIndex === -1 ? "" : withoutHash.slice(qIndex + 1);
  const params = new URLSearchParams(search);
  params.set("acceptedTermsVersion", version);
  let query = params.toString();
  // Keep Stripe's unencoded placeholder form if it was present (or reintroduced by encoding).
  if (query.includes(encodeURIComponent(CHECKOUT_SESSION_ID_PLACEHOLDER))) {
    query = query.split(encodeURIComponent(CHECKOUT_SESSION_ID_PLACEHOLDER)).join(
      CHECKOUT_SESSION_ID_PLACEHOLDER
    );
  }
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export type StripeBillingCapabilities = {
  provider: "stripe" | "none";
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  webhookAvailable: boolean;
  invoicePaymentAvailable: boolean;
  hasSecretKey: boolean;
  hasPublishableKey: boolean;
  hasCheckoutPrice: boolean;
  hasWebhookSecret: boolean;
  secretKeyMode: "live" | "test" | "unknown" | "none";
  publishableKeyMode: "live" | "test" | "unknown" | "none";
  liveMode: boolean;
};

type CheckoutSessionInput = {
  ownerId: string;
  userId: string;
  email: string;
  baseUrl: string;
  successPath?: string;
  cancelPath?: string;
  resumeIntentId?: string;
  termsVersion?: string;
  termsAccepted?: boolean | string;
  /**
   * Optional client-reported click time for diagnostics only.
   * Never sent to Stripe metadata or included in provider create params —
   * Stripe Checkout Session `created` is the authoritative durable provider time.
   */
  clientReportedAcknowledgedAt?: string;
};

type BillingPortalSessionInput = {
  email: string;
  userId?: string;
  ownerId?: string;
  customerId?: string;
  baseUrl: string;
  returnPath?: string;
};

type CheckoutSessionResult = {
  url: string;
  sessionId: string;
  /** ISO timestamp from Stripe Checkout Session `created` when available. */
  providerCreatedAt?: string;
};

/** Stable creator input for Stripe (or test seam). No client timestamps. */
type CheckoutSessionCreatorInput = {
  ownerId: string;
  userId: string;
  email: string;
  baseUrl: string;
  successPath: string;
  cancelPath: string;
  clientReferenceId: string;
  resumeIntentId?: string;
  termsVersion: string;
  termsAccepted: true;
  termsAcceptanceMethod: typeof TERMS_ACCEPTANCE_METHOD;
};

/** Options forwarded to Stripe (or the test creator seam) for Checkout session create. */
export type CheckoutSessionCreatorRequestOptions = {
  idempotencyKey?: string;
};

type CheckoutSessionCreator = (
  input: CheckoutSessionCreatorInput,
  requestOptions?: CheckoutSessionCreatorRequestOptions
) => Promise<CheckoutSessionResult>;

type BillingPortalCreatorInput = BillingPortalSessionInput & {
  resolvedCustomerId: string;
};

/** Authenticated Checkout ownership must come from the server session only. */
export function resolveAuthenticatedCheckoutOwnership(authSession: {
  userId?: string | null;
  email?: string | null;
} | null | undefined): { ownerId: string; userId: string; email: string } {
  const userId = typeof authSession?.userId === "string" ? authSession.userId.trim() : "";
  const email = typeof authSession?.email === "string" ? authSession.email.trim().toLowerCase() : "";
  if (!userId || !email) {
    throw new Error("Sign in to upgrade to Pro.");
  }
  return {
    ownerId: userId,
    userId,
    email
  };
}

type InvoicePaymentLinkInput = {
  invoiceId: string;
  ownerId: string;
  baseUrl: string;
  invoiceNumber?: string;
  customerName?: string;
  total: number;
  currency?: string;
  successPath?: string;
};

type InvoicePaymentLinkResult = {
  url: string;
  paymentLinkId: string;
};

type InvoicePaymentWebhookEffect = {
  invoiceId: string;
  ownerId: string;
  paymentIntentId: string;
};

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-02-25.clover";

let cachedStripeClient:
  | {
      secretKey: string;
      client: Stripe;
    }
  | null = null;
let invoicePaymentLinkCreatorForTests:
  | ((input: InvoicePaymentLinkInput) => Promise<InvoicePaymentLinkResult>)
  | null = null;
let checkoutSessionCreatorForTests: CheckoutSessionCreator | null = null;
let billingPortalSessionCreatorForTests:
  | ((input: BillingPortalCreatorInput) => Promise<{ url: string }>)
  | null = null;

/**
 * In-flight coalescing within one process/isolate for the same owner+resume intent.
 * Sequential / cross-isolate correctness comes from Stripe idempotency keys only —
 * there is intentionally no completed-session process cache (avoids unbounded Memory).
 */
const checkoutIntentInFlight = new Map<string, Promise<CheckoutSessionResult>>();

function checkoutIntentInFlightKey(ownerId: string, resumeIntentId: string): string {
  return `${ownerId}::${resumeIntentId}`;
}

/**
 * Deterministic Stripe Checkout idempotency key for an authenticated owner + resume intent.
 * Hashed so keys stay within Stripe limits and do not expose raw identity.
 */
export function buildCheckoutResumeIdempotencyKey(ownerId: string, resumeIntentId: string): string {
  const owner = normalizeText(ownerId);
  const intent = normalizeText(resumeIntentId);
  if (!owner || !intent) {
    throw new Error("Checkout idempotency key requires an authenticated owner and resume intent.");
  }
  const digest = createHash("sha256")
    .update(`notebill.checkout.v1\0${owner}\0${intent}`, "utf8")
    .digest("hex");
  return `nb_co_${digest}`;
}

export type StripeCheckoutSessionCreateParams = {
  mode: "subscription";
  line_items: Array<{ price: string; quantity: number }>;
  allow_promotion_codes: true;
  customer_email: string;
  subscription_data: {
    metadata: Record<string, string>;
  };
  client_reference_id: string;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
};

/**
 * Byte-stable Stripe Checkout Session create params for the same owner + resume
 * intent + termsVersion + termsAccepted. Client click timestamps are excluded.
 * Authoritative durable provider time is Stripe Checkout Session `created`.
 */
export function buildStripeCheckoutSessionCreateParams(input: {
  ownerId: string;
  userId: string;
  email: string;
  baseUrl: string;
  successPath: string;
  cancelPath: string;
  priceId: string;
  resumeIntentId?: string;
  termsVersion: string;
  termsAccepted: true;
  termsAcceptanceMethod?: typeof TERMS_ACCEPTANCE_METHOD;
}): StripeCheckoutSessionCreateParams {
  const resumeIntentId = normalizeText(input.resumeIntentId);
  const termsMetadata = {
    termsVersion: input.termsVersion,
    termsAccepted: "true",
    termsAcceptanceMethod: input.termsAcceptanceMethod ?? TERMS_ACCEPTANCE_METHOD
  };
  const ownershipMetadata = {
    ownerId: input.ownerId,
    userId: input.userId,
    email: input.email,
    ...(resumeIntentId ? { resumeIntentId } : {}),
    ...termsMetadata
  };
  return {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    customer_email: input.email,
    subscription_data: {
      metadata: ownershipMetadata
    },
    client_reference_id: input.ownerId,
    success_url: `${input.baseUrl}${input.successPath}`,
    cancel_url: `${input.baseUrl}${input.cancelPath}`,
    metadata: ownershipMetadata
  };
}

/** Stripe-relevant fields from creator input (for idempotency param parity tests). */
export function serializeStripeRelevantCheckoutParams(
  creatorInput: CheckoutSessionCreatorInput,
  priceId = "price_test_stable"
): string {
  return JSON.stringify(
    buildStripeCheckoutSessionCreateParams({
      ownerId: creatorInput.ownerId,
      userId: creatorInput.userId,
      email: creatorInput.email,
      baseUrl: creatorInput.baseUrl,
      successPath: creatorInput.successPath,
      cancelPath: creatorInput.cancelPath,
      priceId,
      resumeIntentId: creatorInput.resumeIntentId,
      termsVersion: creatorInput.termsVersion,
      termsAccepted: creatorInput.termsAccepted,
      termsAcceptanceMethod: creatorInput.termsAcceptanceMethod
    })
  );
}

export function getStripeBillingCapabilities(): StripeBillingCapabilities {
  const secretKey = getOptionalEnv(process.env.STRIPE_SECRET_KEY);
  const publishableKey = getOptionalEnv(process.env.STRIPE_PUBLISHABLE_KEY);
  const checkoutPriceId = getOptionalEnv(process.env.STRIPE_PRICE_ID);
  const webhookSecret = getOptionalEnv(process.env.STRIPE_WEBHOOK_SECRET);
  const secretKeyMode = detectStripeKeyMode(secretKey, "sk_");
  const publishableKeyMode = detectStripeKeyMode(publishableKey, "pk_");
  return {
    provider: secretKey ? "stripe" : "none",
    checkoutAvailable: Boolean(secretKey && checkoutPriceId),
    portalAvailable: Boolean(secretKey),
    webhookAvailable: Boolean(secretKey && webhookSecret),
    invoicePaymentAvailable: Boolean(secretKey),
    hasSecretKey: Boolean(secretKey),
    hasPublishableKey: Boolean(publishableKey),
    hasCheckoutPrice: Boolean(checkoutPriceId),
    hasWebhookSecret: Boolean(webhookSecret),
    secretKeyMode,
    publishableKeyMode,
    liveMode:
      secretKeyMode === "live" &&
      (publishableKeyMode === "none" || publishableKeyMode === "live")
  };
}

export async function createStripeInvoicePaymentLink(
  input: InvoicePaymentLinkInput
): Promise<InvoicePaymentLinkResult> {
  if (invoicePaymentLinkCreatorForTests) {
    return invoicePaymentLinkCreatorForTests(input);
  }
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.hasSecretKey) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }

  const amountCents = Math.round(Number(input.total) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Invoice total must be greater than 0 before creating a payment link.");
  }

  const invoiceNumber = normalizeText(input.invoiceNumber) || input.invoiceId;
  const customerName = normalizeText(input.customerName);
  const successPath = normalizePathWithFallback(
    input.successPath,
    `/manual?payment=success&invoiceId=${encodeURIComponent(input.invoiceId)}`
  );
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: normalizeCurrency(input.currency),
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${invoiceNumber}`,
            description: customerName ? `Payment for ${customerName}` : undefined
          }
        },
        quantity: 1
      }
    ],
    after_completion: {
      type: "redirect",
      redirect: {
        url: `${input.baseUrl}${successPath}`
      }
    },
    metadata: {
      paymentKind: "saved_invoice_payment",
      invoiceId: input.invoiceId,
      ownerId: input.ownerId,
      invoiceNumber
    },
    payment_intent_data: {
      metadata: {
        paymentKind: "saved_invoice_payment",
        invoiceId: input.invoiceId,
        ownerId: input.ownerId,
        invoiceNumber
      }
    }
  });

  return {
    url: paymentLink.url,
    paymentLinkId: paymentLink.id
  };
}

export async function createStripeCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  const ownership = resolveAuthenticatedCheckoutOwnership({
    userId: input.userId,
    email: input.email
  });
  if (input.ownerId.trim() !== ownership.ownerId) {
    throw new Error("Checkout ownership must match the authenticated user.");
  }

  const resumeIntentId = normalizeText(input.resumeIntentId);
  const intentKey = resumeIntentId
    ? checkoutIntentInFlightKey(ownership.ownerId, resumeIntentId)
    : "";

  if (intentKey) {
    const inFlight = checkoutIntentInFlight.get(intentKey);
    if (inFlight) {
      return inFlight;
    }

    const pending = createCheckoutSessionOnce(input, ownership, resumeIntentId);
    checkoutIntentInFlight.set(intentKey, pending);
    try {
      return await pending;
    } finally {
      // Clear in-flight on settle (success or failure) so retries are not poisoned.
      checkoutIntentInFlight.delete(intentKey);
    }
  }

  return createCheckoutSessionOnce(input, ownership, resumeIntentId);
}

async function createCheckoutSessionOnce(
  input: CheckoutSessionInput,
  ownership: { ownerId: string; userId: string; email: string },
  resumeIntentId: string
): Promise<CheckoutSessionResult> {
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.hasSecretKey && !checkoutSessionCreatorForTests) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }
  const priceId = getOptionalEnv(process.env.STRIPE_PRICE_ID);
  if (!priceId && !checkoutSessionCreatorForTests) {
    throw new Error("Stripe checkout is not configured (missing STRIPE_PRICE_ID).");
  }

  const normalizedSuccessPath = normalizePathWithFallback(
    input.successPath,
    "/?billing=success"
  );
  const cancelPath = normalizePathWithFallback(input.cancelPath, "/?billing=cancelled");
  const termsAck = assertValidTermsAcknowledgement({
    termsVersion: input.termsVersion,
    termsAccepted: input.termsAccepted
  });
  const successPath = appendAcceptedTermsVersionToSuccessPath(
    normalizedSuccessPath,
    termsAck.termsVersion
  );
  // clientReportedAcknowledgedAt is intentionally omitted from creatorInput and Stripe params.
  const creatorInput: CheckoutSessionCreatorInput = {
    ownerId: ownership.ownerId,
    userId: ownership.userId,
    email: ownership.email,
    baseUrl: input.baseUrl,
    clientReferenceId: ownership.ownerId,
    successPath,
    cancelPath,
    resumeIntentId: resumeIntentId || undefined,
    termsVersion: termsAck.termsVersion,
    termsAccepted: termsAck.termsAccepted,
    termsAcceptanceMethod: termsAck.termsAcceptanceMethod
  };
  const requestOptions: CheckoutSessionCreatorRequestOptions | undefined = resumeIntentId
    ? {
        idempotencyKey: buildCheckoutResumeIdempotencyKey(ownership.ownerId, resumeIntentId)
      }
    : undefined;

  let result: CheckoutSessionResult;
  if (checkoutSessionCreatorForTests) {
    result = await checkoutSessionCreatorForTests(creatorInput, requestOptions);
  } else {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new Error("Stripe billing is not configured.");
    }
    if (!priceId) {
      throw new Error("Stripe checkout is not configured (missing STRIPE_PRICE_ID).");
    }
    const createParams = buildStripeCheckoutSessionCreateParams({
      ownerId: ownership.ownerId,
      userId: ownership.userId,
      email: ownership.email,
      baseUrl: input.baseUrl,
      successPath,
      cancelPath,
      priceId,
      resumeIntentId: resumeIntentId || undefined,
      termsVersion: termsAck.termsVersion,
      termsAccepted: termsAck.termsAccepted,
      termsAcceptanceMethod: termsAck.termsAcceptanceMethod
    });
    const session = await stripe.checkout.sessions.create(createParams, requestOptions);
    if (!session.url) {
      throw new Error("Stripe checkout session did not return a redirect URL.");
    }
    result = {
      url: session.url,
      sessionId: session.id,
      providerCreatedAt:
        typeof session.created === "number"
          ? new Date(session.created * 1000).toISOString()
          : undefined
    };
  }

  return result;
}

export async function createStripeBillingPortalSession(
  input: BillingPortalSessionInput
): Promise<{ url: string }> {
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.hasSecretKey && !billingPortalSessionCreatorForTests) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }

  let customerId = typeof input.customerId === "string" ? input.customerId.trim() : "";
  if (!customerId) {
    customerId =
      (await findBillingCustomerIdForOwner({
        userId: input.userId,
        ownerId: input.ownerId
      })) ?? "";
  }

  if (billingPortalSessionCreatorForTests) {
    if (!customerId) {
      throw new Error("No Stripe customer found for this account yet.");
    }
    return billingPortalSessionCreatorForTests({
      ...input,
      resolvedCustomerId: customerId
    });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }
  if (!customerId) {
    const customer = await findStripeCustomerByEmail(stripe, input.email);
    customerId = customer?.id ?? "";
  }
  if (!customerId) {
    throw new Error("No Stripe customer found for this account yet.");
  }

  const returnPath = normalizePathWithFallback(input.returnPath, "/");
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${input.baseUrl}${returnPath}`
  });

  return { url: session.url };
}

export async function processStripeWebhookEvent(input: {
  rawBody: Buffer | string;
  signature: string;
}): Promise<{
  eventId: string;
  eventType: string;
  handled: boolean;
  invoicePayment?: InvoicePaymentWebhookEffect;
}> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }
  const webhookSecret = getOptionalEnv(process.env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    throw new Error("Stripe webhooks are not configured (missing STRIPE_WEBHOOK_SECRET).");
  }
  const rawPayload = typeof input.rawBody === "string" ? input.rawBody : input.rawBody.toString("utf8");
  const event = stripe.webhooks.constructEvent(rawPayload, input.signature, webhookSecret);

  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompletedEvent(event.data.object as Stripe.Checkout.Session);
    return { eventId: event.id, eventType: event.type, handled: true };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
    return { eventId: event.id, eventType: event.type, handled: true };
  }

  if (event.type === "payment_intent.succeeded") {
    const invoicePayment = handlePaymentIntentSucceededEvent(event.data.object as Stripe.PaymentIntent);
    return {
      eventId: event.id,
      eventType: event.type,
      handled: Boolean(invoicePayment),
      invoicePayment: invoicePayment ?? undefined
    };
  }

  return { eventId: event.id, eventType: event.type, handled: false };
}

function getStripeClient(): Stripe | null {
  const secretKey = getOptionalEnv(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    return null;
  }
  if (cachedStripeClient?.secretKey === secretKey) {
    return cachedStripeClient.client;
  }
  const client = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION
  });
  cachedStripeClient = {
    secretKey,
    client
  };
  return client;
}

async function handleCheckoutSessionCompletedEvent(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = typeof session.customer === "string" ? session.customer : "";
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : "";
  const metadata = session.metadata ?? {};
  const email =
    normalizeEmail(session.customer_email) ||
    normalizeEmail(session.customer_details?.email) ||
    normalizeEmail(metadata.email);
  const ownerId = normalizeText(metadata.ownerId);
  const userId = normalizeText(metadata.userId);

  await applyCheckoutSessionEntitlement({
    customerId,
    subscriptionId,
    email,
    ownerId,
    userId
  });
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const subscriptionId = subscription.id;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : "";
  const metadata = subscription.metadata ?? {};
  await applySubscriptionEntitlement({
    subscriptionId,
    customerId,
    status: subscription.status,
    email: normalizeEmail(metadata.email),
    ownerId: normalizeText(metadata.ownerId),
    userId: normalizeText(metadata.userId)
  });
}

function handlePaymentIntentSucceededEvent(
  paymentIntent: Stripe.PaymentIntent
): InvoicePaymentWebhookEffect | null {
  const metadata = paymentIntent.metadata ?? {};
  if (normalizeText(metadata.paymentKind) !== "saved_invoice_payment") {
    return null;
  }
  const invoiceId = normalizeText(metadata.invoiceId);
  const ownerId = normalizeText(metadata.ownerId);
  if (!invoiceId || !ownerId) {
    return null;
  }
  return {
    invoiceId,
    ownerId,
    paymentIntentId: paymentIntent.id
  };
}

async function findStripeCustomerByEmail(stripe: Stripe, email: string): Promise<Stripe.Customer | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  const customers = await stripe.customers.list({
    email: normalizedEmail,
    limit: 1
  });
  const candidate = customers.data.find((entry) => !entry.deleted);
  return candidate ?? null;
}

function normalizePathWithFallback(value: string | undefined, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return fallback;
  }
  if (!normalized.startsWith("/")) {
    return fallback;
  }
  return normalized;
}

function getOptionalEnv(value: string | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : null;
}

function detectStripeKeyMode(
  value: string | null,
  expectedPrefix: "sk_" | "pk_"
): "live" | "test" | "unknown" | "none" {
  if (!value) {
    return "none";
  }
  if (value.startsWith(`${expectedPrefix}live_`)) {
    return "live";
  }
  if (value.startsWith(`${expectedPrefix}test_`)) {
    return "test";
  }
  return "unknown";
}

function normalizeText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeCurrency(value: string | undefined): string {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || "usd";
}

export function setInvoicePaymentLinkCreatorForTests(
  creator: ((input: InvoicePaymentLinkInput) => Promise<InvoicePaymentLinkResult>) | null
): void {
  invoicePaymentLinkCreatorForTests = creator;
}

export function setCheckoutSessionCreatorForTests(creator: CheckoutSessionCreator | null): void {
  checkoutSessionCreatorForTests = creator;
}

export function setBillingPortalSessionCreatorForTests(
  creator: ((input: BillingPortalCreatorInput) => Promise<{ url: string }>) | null
): void {
  billingPortalSessionCreatorForTests = creator;
}

/** Clears process-local in-flight Checkout coalescing (test isolate reset). */
export function clearCheckoutIntentSessionsForTests(): void {
  checkoutIntentInFlight.clear();
}
