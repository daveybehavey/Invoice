import Stripe from "stripe";
import {
  applyCheckoutSessionEntitlement,
  applySubscriptionEntitlement
} from "./billingEntitlementsStore.js";

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
  userId?: string;
  email?: string;
  baseUrl: string;
  successPath?: string;
  cancelPath?: string;
};

type BillingPortalSessionInput = {
  email: string;
  baseUrl: string;
  returnPath?: string;
};

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
): Promise<{ url: string; sessionId: string }> {
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.hasSecretKey) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }
  const priceId = getOptionalEnv(process.env.STRIPE_PRICE_ID);
  if (!priceId) {
    throw new Error("Stripe checkout is not configured (missing STRIPE_PRICE_ID).");
  }
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }

  const successPath = normalizePathWithFallback(input.successPath, "/?billing=success");
  const cancelPath = normalizePathWithFallback(input.cancelPath, "/?billing=cancelled");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    customer_email: input.email,
    subscription_data: {
      metadata: {
        ownerId: input.ownerId,
        userId: input.userId ?? "",
        email: input.email ?? ""
      }
    },
    client_reference_id: input.ownerId,
    success_url: `${input.baseUrl}${successPath}`,
    cancel_url: `${input.baseUrl}${cancelPath}`,
    metadata: {
      ownerId: input.ownerId,
      userId: input.userId ?? "",
      email: input.email ?? ""
    }
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a redirect URL.");
  }
  return {
    url: session.url,
    sessionId: session.id
  };
}

export async function createStripeBillingPortalSession(
  input: BillingPortalSessionInput
): Promise<{ url: string }> {
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.hasSecretKey) {
    throw new Error("Stripe billing is not configured (missing STRIPE_SECRET_KEY).");
  }
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }

  const customer = await findStripeCustomerByEmail(stripe, input.email);
  if (!customer?.id) {
    throw new Error("No Stripe customer found for this account yet.");
  }

  const returnPath = normalizePathWithFallback(input.returnPath, "/");
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
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
