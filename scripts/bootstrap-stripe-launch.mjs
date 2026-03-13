import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Stripe from 'stripe';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const API_VERSION = '2026-02-25.clover';
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'payment_intent.succeeded'
];
const MANAGED_BY = 'notebill-launch-bootstrap';

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return '';
  return fs.readFileSync(ENV_PATH, 'utf8');
}

function upsertEnvValue(key, value) {
  const current = readEnvFile();
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, next, 'utf8');
}

function requireEnv(name) {
  const value = (process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function detectStripeKeyMode(key, prefix) {
  const value = (key ?? '').trim();
  if (!value) return 'missing';
  if (value.startsWith(`${prefix}_live_`)) return 'live';
  if (value.startsWith(`${prefix}_test_`)) return 'test';
  return 'unknown';
}

function getLaunchPricingConfig() {
  const amount = Number.parseInt((process.env.STRIPE_LAUNCH_PRICE_AMOUNT_CENTS ?? '1900').trim(), 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('STRIPE_LAUNCH_PRICE_AMOUNT_CENTS must be a positive integer amount in cents.');
  }
  const currency = (process.env.STRIPE_LAUNCH_PRICE_CURRENCY ?? 'usd').trim().toLowerCase();
  const interval = (process.env.STRIPE_LAUNCH_PRICE_INTERVAL ?? 'month').trim().toLowerCase();
  if (!['day', 'week', 'month', 'year'].includes(interval)) {
    throw new Error('STRIPE_LAUNCH_PRICE_INTERVAL must be one of day, week, month, year.');
  }
  const productName = (process.env.STRIPE_LAUNCH_PRODUCT_NAME ?? 'NoteBill Pro').trim();
  return { amount, currency, interval, productName };
}

async function findOrCreateManagedProduct(stripe, productName) {
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.managedBy === MANAGED_BY) {
      return product;
    }
  }
  return stripe.products.create({
    name: productName,
    description: 'NoteBill Pro subscription',
    metadata: {
      managedBy: MANAGED_BY,
      tier: 'pro'
    }
  });
}

async function findOrCreateManagedPrice(stripe, productId, pricing) {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (
      price.type === 'recurring' &&
      price.currency === pricing.currency &&
      price.unit_amount === pricing.amount &&
      price.recurring?.interval === pricing.interval
    ) {
      return { price, created: false };
    }
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: pricing.currency,
    unit_amount: pricing.amount,
    recurring: { interval: pricing.interval },
    nickname: `${pricing.productName} ${pricing.interval}`,
    metadata: {
      managedBy: MANAGED_BY,
      tier: 'pro'
    }
  });
  return { price, created: true };
}

async function rotateManagedWebhookEndpoint(stripe, webhookUrl) {
  const matchingManagedEndpoints = [];
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === webhookUrl && endpoint.metadata?.managedBy === MANAGED_BY) {
      matchingManagedEndpoints.push(endpoint);
    }
  }

  const created = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: 'NoteBill live billing webhook',
    metadata: {
      managedBy: MANAGED_BY,
      scope: 'launch'
    }
  });

  if (!created.secret) {
    throw new Error('Stripe webhook endpoint creation did not return a signing secret.');
  }

  for (const endpoint of matchingManagedEndpoints) {
    if (endpoint.id !== created.id) {
      await stripe.webhookEndpoints.del(endpoint.id);
    }
  }

  return created;
}

async function main() {
  const secretKey = requireEnv('STRIPE_SECRET_KEY');
  const secretMode = detectStripeKeyMode(secretKey, 'sk');
  if (secretMode !== 'live') {
    throw new Error(`STRIPE_SECRET_KEY must be live before bootstrapping launch billing (current mode: ${secretMode}).`);
  }

  const publishableMode = detectStripeKeyMode(process.env.STRIPE_PUBLISHABLE_KEY, 'pk');
  if (publishableMode !== 'live') {
    console.warn(`warning: STRIPE_PUBLISHABLE_KEY is ${publishableMode}; launch checkout will still fail until it is live.`);
  }

  const appBaseUrl = requireEnv('APP_BASE_URL');
  const webhookUrl = new URL('/api/billing/stripe/webhook', appBaseUrl).toString();
  const pricing = getLaunchPricingConfig();
  const stripe = new Stripe(secretKey, { apiVersion: API_VERSION });

  const product = await findOrCreateManagedProduct(stripe, pricing.productName);
  const { price, created: createdPrice } = await findOrCreateManagedPrice(stripe, product.id, pricing);
  const webhook = await rotateManagedWebhookEndpoint(stripe, webhookUrl);

  upsertEnvValue('STRIPE_PRICE_ID', price.id);
  upsertEnvValue('STRIPE_WEBHOOK_SECRET', webhook.secret);

  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  if (resendKey && !(process.env.INVOICE_EMAIL_PROVIDER ?? '').trim()) {
    upsertEnvValue('INVOICE_EMAIL_PROVIDER', 'resend');
  }

  console.log('Stripe launch billing bootstrap complete.');
  console.log(`product: ${product.id}`);
  console.log(`price: ${price.id} ${createdPrice ? '(created)' : '(reused)'}`);
  console.log(`webhook: ${webhook.id} -> ${webhookUrl}`);
  console.log('Updated .env keys: STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET' + (resendKey && !(process.env.INVOICE_EMAIL_PROVIDER ?? '').trim() ? ', INVOICE_EMAIL_PROVIDER' : ''));
  console.log(`pricing: ${pricing.amount} ${pricing.currency.toUpperCase()} / ${pricing.interval}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
