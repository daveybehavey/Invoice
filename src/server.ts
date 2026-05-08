import "dotenv/config";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  ApplyDecisionRequestSchema,
  ChangeDescriptionsWordingRequestSchema,
  ChangeNotesWordingRequestSchema,
  ChangeLineWordingRequestSchema,
  DiscountFollowUpRequestSchema,
  FinishedInvoiceSchema,
  FullInvoiceRewordRequestSchema,
  InvoiceAuditRequestSchema,
  InvoiceEditRequestSchema,
  InvoicePdfExportRequestSchema,
  LaborPricingFollowUpRequestSchema,
  SaveInvoiceRequestSchema,
  UpdateInvoiceStatusRequestSchema
} from "./models/invoice.js";
import type { InvoiceListItem, SavedInvoice } from "./models/invoice.js";
import {
  applyDecisionActionToDraft,
  applyDiscountAfterFollowUp,
  changeDescriptionsWording,
  changeNotesWording,
  applyInvoiceEditInstruction,
  changeLineWording,
  continueInvoiceAfterLaborPricing,
  createInvoiceFromInput,
  rewordFullInvoice,
  runInvoiceAuditOverlay
} from "./services/invoicePipeline.js";
import { buildPdfFilename, createInvoicePdfBuffer } from "./services/invoicePdf.js";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeInvoicePaymentLink,
  getStripeBillingCapabilities,
  processStripeWebhookEvent
} from "./services/stripeBilling.js";
import { getBillingEntitlementsSummary } from "./services/billingEntitlementsStore.js";
import {
  assertSavedInvoicePersistencePolicy,
  getSavedInvoiceBackend,
  getSavedInvoiceBackendMode,
  getSavedInvoicePersistencePolicy,
  getSavedInvoiceRepository,
  resolveSavedInvoiceRequireMigrationComplete,
  isSavedInvoicePostgresUrlConfigured
} from "./services/savedInvoiceRepository.js";
import { getOcrMetricsSnapshot, trackOcrConfidenceMetric } from "./services/ocrMetricsStore.js";
import {
  getInvoiceDeliveryStoreSummary,
  getInvoiceDeliverySummary,
  getInvoiceDeliverySummariesByInvoiceIds,
  markInvoiceDeliveryOpenedByTrackingToken,
  markInvoiceDeliveryOpened,
  recordInvoiceDeliverySend
} from "./services/invoiceDeliveryStore.js";
import {
  getInvoiceEmailCapabilities,
  getInvoiceEmailDiagnostics,
  sendAuthSignInEmail,
  sendInvoiceEmail,
  sendLaunchTestEmail
} from "./services/invoiceEmailDelivery.js";
import {
  listDueInvoiceReminderCandidates,
  runDueInvoiceReminders,
  sendInvoiceReminderById
} from "./services/invoiceReminderScheduler.js";
import {
  exportOcrMetricsSnapshot,
  isOcrMetricsExportConfigured
} from "./services/ocrMetricsExporter.js";
import { getSavedInvoiceStoreSummary } from "./services/savedInvoiceStore.js";
import { getFlowFrictionSnapshot } from "./services/flowFrictionReport.js";
import { getIntakeTelemetryTrends } from "./services/intakeTelemetryTrends.js";
import {
  extractUploadedAudioText,
  extractUploadedImageText,
  extractUploadedInvoiceText
} from "./services/uploadTextExtractor.js";
import {
  createAuthSessionForEmail,
  createEmailSignInToken,
  getAuthSessionFromRequest,
  verifyEmailSignInToken
} from "./services/authSession.js";
import {
  buildGoogleAuthErrorUrl,
  buildGoogleAuthStart,
  buildGoogleAuthStateCookieHeader,
  buildGoogleAuthSuccessUrl,
  completeGoogleAuthCallback,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  readCookieValue
} from "./services/googleAuth.js";
import { buildFreePlanLimitMessage, getAccountPlanSummary } from "./services/accountPlanPolicy.js";
import { getInvoiceAuthPolicy } from "./services/invoiceAuthPolicy.js";
import { getInvoiceAuthProviderCapabilities } from "./services/invoiceAuthProviders.js";
import {
  getRevenueSignalsSnapshot,
  RevenueSignalNameSchema,
  trackRevenueSignal
} from "./services/revenueSignalsStore.js";

const app = express();
assertSavedInvoicePersistencePolicy();
await assertSavedInvoiceMigrationPolicy();
assertInvoiceAuthSessionPolicy();
const savedInvoiceRepository = getSavedInvoiceRepository();
const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES }
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES }
});
const port = Number(process.env.PORT ?? 3000);
const publicDir = path.resolve(process.cwd(), "public");
const TRANSPARENT_GIF_BUFFER = Buffer.from("R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");

app.use(cors());
app.post(
  "/api/billing/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = asOptionalString(req.headers["stripe-signature"]);
      if (!signature) {
        throw new HttpStatusError(400, "Missing Stripe signature header.");
      }
      const rawBody =
        req.body instanceof Buffer
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}), "utf8");
      const result = await processStripeWebhookEvent({ rawBody, signature });
      if (result.invoicePayment) {
        await markSavedInvoicePaidFromStripePayment(result.invoicePayment);
      }
      res.json({ ok: true, handled: result.handled, eventType: result.eventType });
    } catch (error) {
      next(error);
    }
  }
);
app.use(express.json({ limit: "4mb" }));
app.use(express.static(publicDir));

const spaRoutes = [
  "/",
  "/auth/verify",
  "/auth/google",
  "/ai-intake",
  "/manual",
  "/scratchpad",
  "/import",
  "/diagnostics",
  "/settings/business",
  "/settings/memory",
  "/settings/services",
  "/clients",
  "/portal",
  "/privacy",
  "/help",
  "/support",
  "/feedback",
  "/data-deletion",
  "/delete-account"
];
app.get(spaRoutes, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/invoices", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/portal/:invoiceId/:token", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/account/plan", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerId = getRequestOwnerId(req);
    const authSession = getAuthSessionFromRequest(req);
    const summary = await getAccountPlanSummary({
      ownerId,
      authSession,
      repository: savedInvoiceRepository
    });
    res.json({
      ...summary,
      billing: getStripeBillingCapabilities()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/billing/checkout-session", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        successPath: z.string().trim().optional(),
        cancelPath: z.string().trim().optional()
      })
      .default({})
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    const authSession = getAuthSessionFromRequest(req);
    const checkoutSession = await createStripeCheckoutSession({
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      baseUrl: resolvePublicBaseUrl(req),
      successPath: parsedRequest.successPath,
      cancelPath: parsedRequest.cancelPath
    });
    await trackRevenueSignalSafely({
      event: "checkout_started",
      ownerId,
      source: "billing_checkout"
    });
    res.json(checkoutSession);
  } catch (error) {
    next(error);
  }
});

app.post("/api/billing/portal-session", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        returnPath: z.string().trim().optional()
      })
      .default({})
      .parse(req.body ?? {});
    const authSession = getAuthSessionFromRequest(req);
    if (!authSession?.email) {
      throw new HttpStatusError(401, "Sign in to open billing settings.");
    }
    const portalSession = await createStripeBillingPortalSession({
      email: authSession.email,
      baseUrl: resolvePublicBaseUrl(req),
      returnPath: parsedRequest.returnPath
    });
    res.json(portalSession);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/client-portal-link", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = z
      .object({
        refresh: z.boolean().optional()
      })
      .default({})
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before creating a portal link.");
    }
    const portalAccessToken =
      parsedRequest.refresh || !savedInvoice.invoiceData.finishedInvoice.portalAccessToken
        ? randomUUID()
        : savedInvoice.invoiceData.finishedInvoice.portalAccessToken;
    const invoice = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId,
      invoiceId,
      sourceType: savedInvoice.sourceType,
      invoiceData: {
        structuredInvoice: savedInvoice.invoiceData.structuredInvoice,
        finishedInvoice: {
          ...savedInvoice.invoiceData.finishedInvoice,
          portalAccessToken
        }
      }
    });
    res.json({
      invoice,
      clientPortalUrl: `${resolvePublicBaseUrl(req)}/portal/${invoiceId}/${encodeURIComponent(portalAccessToken)}`
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/providers", async (_req: Request, res: Response) => {
  const providers = getInvoiceAuthProviderCapabilities();
  res.json({ providers });
});

app.post("/api/auth/session", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z
      .object({
        provider: z.enum(["email_link", "google"]).optional(),
        email: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().email().optional()
        )
      })
      .parse(req.body);
    const provider = parsed.provider ?? "email_link";
    if (provider === "google") {
      const googleProvider = getInvoiceAuthProviderCapabilities().find((candidate) => candidate.id === "google");
      throw new HttpStatusError(
        409,
        googleProvider?.warning ?? "Use the Google Sign-In start route instead."
      );
    }
    if (!parsed.email) {
      throw new HttpStatusError(400, "Email is required for email sign-in.");
    }
    const requested = createEmailSignInToken(parsed.email);
    const signInUrl = `${resolvePublicBaseUrl(req)}/auth/verify?token=${encodeURIComponent(requested.token)}`;
    const delivery = await sendAuthSignInEmail({
      recipientEmail: parsed.email,
      signInUrl,
      expiresAt: requested.expiresAt
    });

    if (delivery.mode === "record_only") {
      if ((process.env.NODE_ENV ?? "development").trim() === "production") {
        throw new HttpStatusError(
          503,
          "Email sign-in is unavailable right now. Configure a working email provider before enabling account sign-in."
        );
      }
      res.json({
        emailSent: false,
        expiresAt: requested.expiresAt,
        previewUrl: signInUrl,
        warning: delivery.warning ?? "Email provider is not configured; using preview mode."
      });
      return;
    }

    res.json({
      emailSent: true,
      expiresAt: requested.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/google/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const googleProvider = getInvoiceAuthProviderCapabilities().find((candidate) => candidate.id === "google");
    if (!googleProvider?.available) {
      throw new HttpStatusError(503, googleProvider?.warning ?? "Google Sign-In isn't available right now.");
    }
    const parsed = z
      .object({
        returnTo: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().optional()
        )
      })
      .parse(req.query);
    const publicBaseUrl = resolvePublicBaseUrl(req);
    const secure = publicBaseUrl.startsWith("https://");
    const start = buildGoogleAuthStart({
      baseUrl: publicBaseUrl,
      returnPath: parsed.returnTo
    });
    res.setHeader(
      "Set-Cookie",
      buildGoogleAuthStateCookieHeader({
        value: start.cookieValue,
        expiresAt: start.expiresAt,
        secure
      })
    );
    res.redirect(start.redirectUrl);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
  const publicBaseUrl = resolvePublicBaseUrl(req);
  const secure = publicBaseUrl.startsWith("https://");
  const clearStateCookie = () =>
    res.setHeader(
      "Set-Cookie",
      buildGoogleAuthStateCookieHeader({
        secure
      })
    );

  try {
    const parsed = z
      .object({
        code: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).optional()
        ),
        state: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).optional()
        ),
        error: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().optional()
        ),
        error_description: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().optional()
        )
      })
      .parse(req.query);

    if (parsed.error) {
      clearStateCookie();
      const message = parsed.error_description || parsed.error || "Google Sign-In was cancelled.";
      res.redirect(buildGoogleAuthErrorUrl({ baseUrl: publicBaseUrl, error: message }));
      return;
    }
    if (!parsed.code || !parsed.state) {
      clearStateCookie();
      res.redirect(
        buildGoogleAuthErrorUrl({
          baseUrl: publicBaseUrl,
          error: "Google Sign-In did not return the required callback details."
        })
      );
      return;
    }

    const cookieValue = readCookieValue(asOptionalString(req.headers.cookie) ?? "", GOOGLE_OAUTH_STATE_COOKIE_NAME);
    const completed = await completeGoogleAuthCallback({
      baseUrl: publicBaseUrl,
      code: parsed.code,
      stateToken: parsed.state,
      cookieValue
    });
    const created = createAuthSessionForEmail(completed.identity.email);
    await trackRevenueSignalSafely({
      event: "account_signed_in",
      ownerId: created.session.userId,
      source: "auth_google"
    });
    clearStateCookie();
    res.redirect(
      buildGoogleAuthSuccessUrl({
        baseUrl: publicBaseUrl,
        token: created.token,
        session: created.session,
        returnPath: completed.returnPath
      })
    );
  } catch (error) {
    clearStateCookie();
    const message = error instanceof Error ? error.message : "Google Sign-In failed.";
    res.redirect(buildGoogleAuthErrorUrl({ baseUrl: publicBaseUrl, error: message }));
  }
});

app.post("/api/auth/session/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z
      .object({
        token: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1)
        )
      })
      .parse(req.body);
    const verified = verifyEmailSignInToken(parsed.token);
    if (!verified?.email) {
      throw new HttpStatusError(400, "This sign-in link is invalid or expired.");
    }
    const created = createAuthSessionForEmail(verified.email);
    await trackRevenueSignalSafely({
      event: "account_signed_in",
      ownerId: created.session.userId,
      source: "auth_verify"
    });
    res.json(created);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (req: Request, res: Response) => {
  const session = getAuthSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "No active session." });
    return;
  }
  res.json({ session });
});

app.delete("/api/auth/session", (_req: Request, res: Response) => {
  res.status(204).send();
});

app.get("/api/system/persistence", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const runtimePolicy = getSavedInvoicePersistencePolicy();
    const authPolicy = getInvoiceAuthPolicy();
    const migrationPolicy = await getSavedInvoiceMigrationPolicy();
    const defaultOwnerId = asOptionalString(process.env.INVOICE_DEFAULT_USER_ID) ?? "local-default";
    res.json({
      invoiceStoreBackend: savedInvoiceRepository.backend,
      configuredBackend: getSavedInvoiceBackend(),
      configuredMode: getSavedInvoiceBackendMode(),
      postgresUrlConfigured: isSavedInvoicePostgresUrlConfigured(),
      nodeEnv: runtimePolicy.nodeEnv,
      postgresRequired: runtimePolicy.requirePostgres,
      migrationRequired: migrationPolicy.requireMigrationComplete,
      migrationReady: migrationPolicy.migrationReady,
      migrationWarning: migrationPolicy.warning ?? null,
      productionReady: runtimePolicy.productionReady,
      warning: runtimePolicy.warning ?? null,
      authRequired: authPolicy.requireAuth,
      authSessionSecretConfigured: authPolicy.sessionSecretConfigured,
      authEmailProviderConfigured: authPolicy.emailProviderConfigured,
      authProviders: authPolicy.providers,
      authPolicyReady: authPolicy.productionReady,
      authWarning: authPolicy.warning ?? null,
      defaultOwnerId
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/persistence/migration", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const runtimePolicy = getSavedInvoicePersistencePolicy();
    const authPolicy = getInvoiceAuthPolicy();
    const fileStore = await getSavedInvoiceStoreSummary();
    const migrationStatus = evaluatePersistenceMigrationStatus(
      runtimePolicy.resolvedBackend,
      fileStore.invoiceCount
    );
    const migrationPolicy = await getSavedInvoiceMigrationPolicy(fileStore.invoiceCount);
    res.json({
      invoiceStoreBackend: savedInvoiceRepository.backend,
      configuredBackend: getSavedInvoiceBackend(),
      configuredMode: getSavedInvoiceBackendMode(),
      postgresUrlConfigured: isSavedInvoicePostgresUrlConfigured(),
      nodeEnv: runtimePolicy.nodeEnv,
      postgresRequired: runtimePolicy.requirePostgres,
      productionReady: runtimePolicy.productionReady,
      warning: runtimePolicy.warning ?? null,
      authRequired: authPolicy.requireAuth,
      authSessionSecretConfigured: authPolicy.sessionSecretConfigured,
      authEmailProviderConfigured: authPolicy.emailProviderConfigured,
      authProviders: authPolicy.providers,
      authPolicyReady: authPolicy.productionReady,
      authWarning: authPolicy.warning ?? null,
      migrationRequired: migrationPolicy.requireMigrationComplete,
      migrationReady: migrationPolicy.migrationReady,
      migrationWarning: migrationPolicy.warning ?? null,
      fileStore,
      migrationStatus,
      migrationCommand: "npm run migrate:invoices:postgres -- --dry-run"
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/billing", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const capabilities = getStripeBillingCapabilities();
    const entitlements = await getBillingEntitlementsSummary();
    const requireLiveMode = resolveLaunchRequireLiveBilling(
      process.env.INVOICE_LAUNCH_REQUIRE_LIVE_BILLING,
      process.env.NODE_ENV
    );
    const warning = resolveBillingSystemWarning(capabilities, entitlements, { requireLiveMode });
    res.json({
      provider: capabilities.provider,
      capabilities,
      entitlements,
      warning,
      launchPolicy: {
        requireLiveMode
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/delivery", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryDiagnostics = await getInvoiceEmailDiagnostics();
    const summary = await getInvoiceDeliveryStoreSummary();
    const ownerId = getRequestOwnerId(req);
    const reminderPreview = await listDueInvoiceReminderCandidates({
      ownerId,
      repository: savedInvoiceRepository
    });
    const warning = resolveDeliverySystemWarning(deliveryDiagnostics, summary);
    res.json({
      provider: deliveryDiagnostics.capabilities.provider,
      capabilities: deliveryDiagnostics.capabilities,
      verification: deliveryDiagnostics.verification,
      summary,
      reminders: {
        ownerId,
        settings: reminderPreview.settings,
        scannedCount: reminderPreview.scannedCount,
        dueCount: reminderPreview.due.length,
        due: reminderPreview.due.slice(0, 10)
      },
      warning
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/system/delivery/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authSession = getAuthSessionFromRequest(req);
    const allowCustomRecipient = (process.env.NODE_ENV ?? "development").trim().toLowerCase() !== "production";
    const recipientEmail =
      (allowCustomRecipient ? asOptionalString(req.body?.recipientEmail) : null) ??
      asOptionalString(authSession?.email) ??
      asOptionalString(process.env.INVOICE_LAUNCH_TEST_EMAIL);
    if (!recipientEmail) {
      throw new HttpStatusError(
        400,
        "Missing launch test recipient. Set INVOICE_LAUNCH_TEST_EMAIL or sign in with an email-backed session."
      );
    }
    const result = await sendLaunchTestEmail({
      recipientEmail,
      appBaseUrl: process.env.APP_BASE_URL
    });
    res.json({
      ok: true,
      recipientEmail: result.recipientEmail,
      mode: result.mode,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      warning: result.warning ?? null
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/launch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const persistencePolicy = getSavedInvoicePersistencePolicy();
    const authPolicy = getInvoiceAuthPolicy();
    const migrationPolicy = await getSavedInvoiceMigrationPolicy();
    const billingCapabilities = getStripeBillingCapabilities();
    const billingEntitlements = await getBillingEntitlementsSummary();
    const requireLiveBilling = resolveLaunchRequireLiveBilling(
      process.env.INVOICE_LAUNCH_REQUIRE_LIVE_BILLING,
      process.env.NODE_ENV
    );
    const billingWarning = resolveBillingSystemWarning(billingCapabilities, billingEntitlements, {
      requireLiveMode: requireLiveBilling
    });
    const deliveryDiagnostics = await getInvoiceEmailDiagnostics();
    const deliverySummary = await getInvoiceDeliveryStoreSummary();
    const deliveryWarning = resolveDeliverySystemWarning(deliveryDiagnostics, deliverySummary);
    const publicBaseUrl = resolvePublicBaseUrl(req);
    const publicBaseUrlReady = isConfiguredPublicBaseUrl(process.env.APP_BASE_URL);
    const persistenceReady = persistencePolicy.productionReady && migrationPolicy.migrationReady;
    const authReady = authPolicy.productionReady;
    const billingReady = !billingWarning;
    const deliveryReady = !deliveryWarning;
    const checks = [
      {
        id: "persistence",
        ok: persistenceReady,
        detail: persistencePolicy.warning ?? migrationPolicy.warning ?? "Persistence policy ready."
      },
      {
        id: "auth",
        ok: authReady,
        detail: authPolicy.warning ?? "Auth policy ready."
      },
      {
        id: "billing",
        ok: billingReady,
        detail: billingWarning ?? "Billing ready."
      },
      {
        id: "delivery",
        ok: deliveryReady,
        detail: deliveryWarning ?? "Delivery ready."
      },
      {
        id: "public-base-url",
        ok: publicBaseUrlReady,
        detail: publicBaseUrlReady
          ? `Using ${publicBaseUrl}`
          : "APP_BASE_URL is missing or invalid for launch checks."
      }
    ];
    const warningCount = checks.filter((check) => !check.ok).length;
    res.json({
      ready: warningCount === 0,
      warningCount,
      publicBaseUrl,
      publicBaseUrlReady,
      persistence: {
        ready: persistenceReady,
        backend: savedInvoiceRepository.backend,
        configuredBackend: getSavedInvoiceBackend(),
        configuredMode: getSavedInvoiceBackendMode(),
        postgresRequired: persistencePolicy.requirePostgres,
        migrationRequired: migrationPolicy.requireMigrationComplete,
        warning: persistencePolicy.warning ?? migrationPolicy.warning ?? null
      },
      auth: {
        ready: authReady,
        required: authPolicy.requireAuth,
        warning: authPolicy.warning ?? null
      },
      billing: {
        ready: billingReady,
        provider: billingCapabilities.provider,
        warning: billingWarning,
        requireLiveMode: requireLiveBilling,
        capabilities: billingCapabilities,
        entitlements: billingEntitlements
      },
      delivery: {
        ready: deliveryReady,
        provider: deliveryDiagnostics.capabilities.provider,
        warning: deliveryWarning,
        capabilities: deliveryDiagnostics.capabilities,
        verification: deliveryDiagnostics.verification,
        summary: deliverySummary
      },
      checks
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telemetry/ocr-confidence", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await getOcrMetricsSnapshot();
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post("/api/telemetry/ocr-confidence/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const force = Boolean(req.body?.force);
    const result = await exportOcrMetricsSnapshot({ force });
    res.json({
      ...result,
      configured: isOcrMetricsExportConfigured()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telemetry/flow-friction", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await getFlowFrictionSnapshot();
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/telemetry/intake-trends", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const trends = await getIntakeTelemetryTrends();
    res.json(trends);
  } catch (error) {
    next(error);
  }
});

app.get("/api/telemetry/revenue-signals", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await getRevenueSignalsSnapshot();
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.post("/api/telemetry/revenue-signals", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        event: RevenueSignalNameSchema,
        source: z.string().trim().min(1).max(80).optional()
      })
      .parse(req.body ?? {});
    await trackRevenueSignalSafely({
      event: parsedRequest.event,
      ownerId: getRequestOwnerId(req),
      source: parsedRequest.source ?? "client"
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/invoices/from-input",
  importUpload.single("invoiceFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messyInput = asOptionalString(req.body.messyInput);
      const uploadedInvoiceTextFromBody = asOptionalString(req.body.uploadedInvoiceText);
      const lastUserMessage = asOptionalString(req.body.lastUserMessage);
      const mode = asOptionalParseMode(req.body.mode);
      const uploadedInvoiceTextFromFile = req.file ? await extractUploadedInvoiceText(req.file) : undefined;

      const result = await createInvoiceFromInput({
        messyInput,
        uploadedInvoiceText: uploadedInvoiceTextFromBody ?? uploadedInvoiceTextFromFile,
        lastUserMessage,
        mode
      });
      if ("invoice" in result && result.invoice) {
        await trackRevenueSignalSafely({
          event: "invoice_generated",
          ownerId: getRequestOwnerId(req),
          source: "from_input"
        });
      }

      if (result.kind === "labor_pricing_follow_up") {
        res.json({
          needsFollowUp: true,
          followUp: result.followUp,
          structuredInvoice: result.structuredInvoice,
          openDecisions: result.openDecisions,
          assumptions: result.assumptions,
          unparsedLines: result.unparsedLines,
          auditStatus: result.auditStatus
        });
        return;
      }

      if (result.kind === "discount_follow_up") {
        res.json({
          needsFollowUp: true,
          followUp: result.followUp,
          structuredInvoice: result.structuredInvoice,
          invoice: result.invoice,
          openDecisions: result.openDecisions,
          assumptions: result.assumptions,
          unparsedLines: result.unparsedLines,
          qualityGate: result.qualityGate,
          auditStatus: result.auditStatus
        });
        return;
      }

      res.json({
        needsFollowUp: false,
        structuredInvoice: result.structuredInvoice,
        invoice: result.invoice,
        openDecisions: result.openDecisions,
        assumptions: result.assumptions,
        unparsedLines: result.unparsedLines,
        qualityGate: result.qualityGate,
        auditStatus: result.auditStatus
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/invoices/extract-notes", imageUpload.single("invoiceFile"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new Error("Upload an image file first.");
    }
    const extraction = await extractUploadedImageText(req.file);
    await trackOcrConfidenceMetric({
      confidence: extraction.confidence,
      confidenceReasons: extraction.confidenceReasons,
      warningCount: extraction.warnings.length
    });
    if (process.env.OCR_METRICS_EXPORT_AUTOSEND === "true") {
      void exportOcrMetricsSnapshot().catch((error) => {
        console.error("OCR metrics export failed", error);
      });
    }
    res.json({
      sourceType: "image",
      extractedText: extraction.text,
      warnings: extraction.warnings,
      confidence: extraction.confidence,
      confidenceReasons: extraction.confidenceReasons
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/invoices/extract-upload-text",
  importUpload.single("invoiceFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new Error("Upload a supported document first.");
      }
      const extractedText = await extractUploadedInvoiceText(req.file);
      res.json({
        sourceType: "document",
        extractedText
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/invoices/transcribe-audio",
  importUpload.single("audioFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new Error("Upload an audio note first.");
      }
      const transcript = await extractUploadedAudioText(req.file);
      res.json({
        sourceType: "audio",
        extractedText: transcript
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/invoices/from-input/labor-pricing", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = LaborPricingFollowUpRequestSchema.parse(req.body);
    const result = await continueInvoiceAfterLaborPricing(
      parsedRequest.structuredInvoice,
      parsedRequest.laborPricing,
      parsedRequest.sourceText,
      parsedRequest.lastUserMessage,
      parsedRequest.mode
    );

    res.json({
      needsFollowUp: false,
      structuredInvoice: result.structuredInvoice,
      invoice: result.invoice,
      openDecisions: result.openDecisions,
      assumptions: result.assumptions,
      unparsedLines: result.unparsedLines,
      qualityGate: result.qualityGate,
      auditStatus: result.auditStatus
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/apply-decision", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = ApplyDecisionRequestSchema.parse(req.body);
    const timingStart = performance.now();
    const result = await applyDecisionActionToDraft({
      structuredInvoice: parsedRequest.structuredInvoice,
      openDecisions: parsedRequest.openDecisions,
      assumptions: parsedRequest.assumptions,
      unparsedLines: parsedRequest.unparsedLines,
      decisionAction: parsedRequest.decisionAction,
      pendingTaxRate: parsedRequest.pendingTaxRate
    });
    const timingAfterApply = performance.now();

    const responsePayload: Record<string, unknown> = {
      structuredInvoice: result.structuredInvoice,
      invoice: result.invoice,
      openDecisions: result.openDecisions,
      assumptions: result.assumptions,
      unparsedLines: result.unparsedLines,
      qualityGate: result.qualityGate,
      pendingTaxRate: result.pendingTaxRate ?? null
    };

    if (parsedRequest.debugTiming) {
      const timingBeforeSend = performance.now();
      responsePayload._timing = {
        serverApplyMs: Number((timingAfterApply - timingStart).toFixed(3)),
        serverTotalMs: Number((timingBeforeSend - timingStart).toFixed(3))
      };
    }

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/audit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = InvoiceAuditRequestSchema.parse(req.body);
    const result = await runInvoiceAuditOverlay({
      sourceText: parsedRequest.sourceText,
      structuredInvoice: parsedRequest.structuredInvoice,
      lastUserMessage: parsedRequest.lastUserMessage
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/from-input/discount", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = DiscountFollowUpRequestSchema.parse(req.body);
    const invoice = applyDiscountAfterFollowUp(
      parsedRequest.invoice,
      parsedRequest.discountAmount,
      parsedRequest.discountReason
    );

    res.json({ needsFollowUp: false, invoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/reword-line", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = ChangeLineWordingRequestSchema.parse(req.body);
    const invoice = FinishedInvoiceSchema.parse(parsedRequest.invoice);

    const updatedInvoice = await changeLineWording(invoice, parsedRequest.lineItemId, parsedRequest.tone);
    res.json({ invoice: updatedInvoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/reword-notes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = ChangeNotesWordingRequestSchema.parse(req.body);
    const invoice = FinishedInvoiceSchema.parse(parsedRequest.invoice);

    const updatedInvoice = await changeNotesWording(invoice, parsedRequest.tone);
    res.json({ invoice: updatedInvoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/reword-descriptions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = ChangeDescriptionsWordingRequestSchema.parse(req.body);
    const invoice = FinishedInvoiceSchema.parse(parsedRequest.invoice);

    const updatedInvoice = await changeDescriptionsWording(invoice, parsedRequest.tone);
    res.json({ invoice: updatedInvoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/edit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = InvoiceEditRequestSchema.parse(req.body);
    const result = await applyInvoiceEditInstruction(parsedRequest.invoice, parsedRequest.instruction);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/reword-full", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = FullInvoiceRewordRequestSchema.parse(req.body);
    const invoice = FinishedInvoiceSchema.parse(parsedRequest.invoice);

    const updatedInvoice = await rewordFullInvoice(invoice, parsedRequest.tone);
    res.json({ invoice: updatedInvoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/export-pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = InvoicePdfExportRequestSchema.parse(req.body);
    const pdfBuffer = await createInvoicePdfBuffer(parsedRequest);
    const filename = buildPdfFilename(parsedRequest.invoice.invoiceNumber);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.byteLength));
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/save", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = SaveInvoiceRequestSchema.parse(req.body);
    const ownerId = getRequestOwnerId(req);
    const authSession = getAuthSessionFromRequest(req);
    if (!parsedRequest.invoiceId) {
      const planSummary = await getAccountPlanSummary({
        ownerId,
        authSession,
        repository: savedInvoiceRepository
      });
      if (!planSummary.canCreateInvoice) {
        throw new HttpStatusError(402, buildFreePlanLimitMessage(planSummary));
      }
    }

    const savedInvoice = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId,
      invoiceId: parsedRequest.invoiceId,
      sourceType: parsedRequest.sourceType,
      invoiceData: parsedRequest.invoiceData
    });
    if (!parsedRequest.invoiceId) {
      await trackRevenueSignalSafely({
        event: "invoice_saved",
        ownerId,
        source: "invoice_save"
      });
      const savedInvoiceCount = (await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId)).length;
      if (savedInvoiceCount === 2) {
        await trackRevenueSignalSafely({
          event: "second_invoice_saved",
          ownerId,
          source: "invoice_save"
        });
      }
    }

    res.json({ invoice: savedInvoice });
  } catch (error) {
    next(error);
  }
});

app.get("/api/invoices", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const includeDeleted = _req.query.includeDeleted === "true";
    const ownerId = getRequestOwnerId(_req);
    const invoices = await savedInvoiceRepository.listSavedInvoiceMetadata(includeDeleted, ownerId);
    const deliverySummaries = await getInvoiceDeliverySummariesByInvoiceIds({
      ownerId,
      invoiceIds: invoices.map((invoice) => invoice.invoiceId)
    });
    res.json({
      invoices: invoices.map((invoice) => ({
        ...invoice,
        delivery: deliverySummaries[invoice.invoiceId] ?? null
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/invoices/recent-context", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({
      client: z.string().trim().min(1),
      limit: z.coerce.number().int().min(1).max(5).optional()
    }).parse(req.query);
    const ownerId = getRequestOwnerId(req);
    const matches = await savedInvoiceRepository.listRecentClientContext(
      query.client,
      query.limit ?? 2,
      ownerId
    );
    res.json({ client: query.client, matches });
  } catch (error) {
    next(error);
  }
});

app.get("/api/invoices/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    const invoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    const delivery = await getInvoiceDeliverySummary({ ownerId, invoiceId });
    res.json({
      invoice: {
        ...invoice,
        delivery
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/invoices/:id/portal", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const portalToken = asOptionalString(req.query.token);
    if (!portalToken) {
      throw new HttpStatusError(400, "Missing portal token.");
    }
    const invoice = await savedInvoiceRepository.getSavedInvoiceByPortalToken(invoiceId, portalToken);
    if (!invoice) {
      throw new HttpStatusError(404, "Portal link not found.");
    }
    const customerName =
      invoice.invoiceData.finishedInvoice.customerName ?? invoice.invoiceData.structuredInvoice.customerName ?? "";
    const history =
      customerName.trim().length > 0
        ? (await savedInvoiceRepository.listSavedInvoiceMetadata(false, invoice.ownerId))
            .filter((entry) => entry.invoiceId !== invoice.invoiceId)
            .filter((entry) => isSamePortalCustomer(entry.customerName, customerName))
            .slice(0, 5)
            .map(toPublicPortalHistoryItem)
        : [];
    res.json({
      invoice: toPublicPortalInvoice(invoice),
      history
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = z
      .object({
        recipientEmail: z.preprocess(
          (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
          z.string().email()
        )
      })
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    const existingInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (existingInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before sending.");
    }
    const invoiceWithPaymentLink = await ensureSavedInvoicePaymentLink({
      ownerId,
      invoice: existingInvoice,
      baseUrl: resolvePublicBaseUrl(req)
    });

    const trackingToken = randomUUID();
    const openTrackingPixelUrl = `${resolvePublicBaseUrl(req)}/api/invoices/${invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
    const sendResult = await sendInvoiceEmail({
      recipientEmail: parsedRequest.recipientEmail,
      invoice: invoiceWithPaymentLink.invoiceData.finishedInvoice,
      invoiceId,
      openTrackingPixelUrl
    });

    const delivery = await recordInvoiceDeliverySend({
      ownerId,
      invoiceId,
      recipientEmail: parsedRequest.recipientEmail,
      trackingToken,
      mode: sendResult.mode,
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId
    });
    const invoice =
      invoiceWithPaymentLink.status === "sent"
        ? invoiceWithPaymentLink
        : await savedInvoiceRepository.updateSavedInvoiceStatus(invoiceId, "sent", ownerId);
    await trackRevenueSignalSafely({
      event: "invoice_sent",
      ownerId,
      source: "invoice_send"
    });
    res.json({
      invoice,
      delivery,
      mode: sendResult.mode,
      provider: sendResult.provider,
      warning: sendResult.warning ?? null
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/payment-link", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = z
      .object({
        refresh: z.boolean().optional()
      })
      .default({})
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before creating a payment link.");
    }
    if (!getStripeBillingCapabilities().invoicePaymentAvailable) {
      throw new HttpStatusError(400, "Stripe invoice payments are not configured yet.");
    }
    const invoice = parsedRequest.refresh
      ? await createAndPersistSavedInvoicePaymentLink({
          ownerId,
          invoice: savedInvoice,
          baseUrl: resolvePublicBaseUrl(req)
        })
      : await ensureSavedInvoicePaymentLink({
          ownerId,
          invoice: savedInvoice,
          baseUrl: resolvePublicBaseUrl(req)
        });
    await trackRevenueSignalSafely({
      event: "payment_link_created",
      ownerId,
      source: "payment_link"
    });
    res.json({
      invoice,
      paymentLinkUrl: invoice.invoiceData.finishedInvoice.paymentLinkUrl ?? ""
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/invoices/:id/delivery/opened/pixel", async (req: Request, res: Response) => {
  const invoiceId = req.params.id;
  const trackingToken = asOptionalString(req.query.token);
  if (!trackingToken) {
    sendTrackingPixelResponse(res);
    return;
  }
  try {
    await markInvoiceDeliveryOpenedByTrackingToken({ invoiceId, trackingToken });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to mark delivery opened from pixel route", error);
  }
  sendTrackingPixelResponse(res);
});

app.post("/api/invoices/:id/send-reminder", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    const reminder = await sendInvoiceReminderById({
      ownerId,
      invoiceId,
      repository: savedInvoiceRepository,
      baseUrl: resolvePublicBaseUrl(req)
    });
    await trackRevenueSignalSafely({
      event: "reminder_sent",
      ownerId,
      source: "send_reminder"
    });
    res.json({
      reminder: {
        invoiceId: reminder.invoiceId,
        invoiceNumber: reminder.invoiceNumber,
        recipientEmail: reminder.recipientEmail
      },
      invoice: reminder.invoice,
      delivery: reminder.delivery,
      mode: reminder.mode,
      provider: reminder.provider,
      warning: reminder.warning ?? null
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/reminders/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        dryRun: z.boolean().optional(),
        maxPerRun: z.number().int().min(1).max(100).optional(),
        dueAfterDays: z.number().int().min(1).max(120).optional(),
        cooldownDays: z.number().int().min(1).max(60).optional()
      })
      .default({})
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    if (parsedRequest.dryRun) {
      const preview = await listDueInvoiceReminderCandidates({
        ownerId,
        repository: savedInvoiceRepository,
        settings: {
          maxPerRun: parsedRequest.maxPerRun,
          dueAfterDays: parsedRequest.dueAfterDays,
          cooldownDays: parsedRequest.cooldownDays
        }
      });
      res.json({
        dryRun: true,
        settings: preview.settings,
        scannedCount: preview.scannedCount,
        dueCount: preview.due.length,
        due: preview.due
      });
      return;
    }
    const runResult = await runDueInvoiceReminders({
      ownerId,
      repository: savedInvoiceRepository,
      baseUrl: resolvePublicBaseUrl(req),
      settings: {
        maxPerRun: parsedRequest.maxPerRun,
        dueAfterDays: parsedRequest.dueAfterDays,
        cooldownDays: parsedRequest.cooldownDays
      }
    });
    res.json(runResult);
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/delivery/opened", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    const delivery = await markInvoiceDeliveryOpened({ ownerId, invoiceId });
    res.json({ delivery });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/duplicate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    const invoice = await savedInvoiceRepository.duplicateSavedInvoice(invoiceId, ownerId);
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = UpdateInvoiceStatusRequestSchema.parse(req.body);
    const ownerId = getRequestOwnerId(req);
    const invoice = await savedInvoiceRepository.updateSavedInvoiceStatus(
      invoiceId,
      parsedRequest.status,
      ownerId
    );
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    const invoice = await savedInvoiceRepository.restoreSavedInvoice(invoiceId, ownerId);
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/invoices/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    await savedInvoiceRepository.deleteSavedInvoice(invoiceId, ownerId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File is too large. Max upload size is 8MB." });
    return;
  }
  if (error instanceof HttpStatusError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (isErrorWithMessage(error)) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Unexpected server error." });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Invoice API listening on http://localhost:${port}`);
  });
}

async function trackRevenueSignalSafely(input: {
  event: z.infer<typeof RevenueSignalNameSchema>;
  ownerId: string;
  source: string;
}): Promise<void> {
  try {
    await trackRevenueSignal(input);
  } catch (error) {
    // Revenue telemetry should never block invoice work.
    // eslint-disable-next-line no-console
    console.error("Failed to track revenue signal", error);
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolvePublicBaseUrl(req: Request): string {
  const envBaseUrl = asOptionalString(process.env.APP_BASE_URL);
  if (envBaseUrl) {
    try {
      const parsed = new URL(envBaseUrl);
      return parsed.origin;
    } catch (_error) {
      // ignore invalid APP_BASE_URL and fallback to request-derived origin
    }
  }
  const hostHeader = asOptionalString(req.headers.host) ?? "localhost:3000";
  const forwardedProto =
    asOptionalString(req.headers["x-forwarded-proto"]) ??
    asOptionalString(req.headers["x-forwarded-protocol"]);
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : req.protocol;
  return `${protocol}://${hostHeader}`;
}

function isConfiguredPublicBaseUrl(value: string | undefined): boolean {
  const normalized = asOptionalString(value);
  if (!normalized) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function resolveBillingSystemWarning(
  capabilities: ReturnType<typeof getStripeBillingCapabilities>,
  entitlements: {
    subscriptionCount: number;
    activeSubscriptionCount: number;
    missingIdentityCount: number;
  },
  policy?: {
    requireLiveMode?: boolean;
  }
): string | null {
  if (!capabilities.hasSecretKey) {
    return "Stripe is not configured (missing STRIPE_SECRET_KEY).";
  }
  if (
    capabilities.hasPublishableKey &&
    capabilities.publishableKeyMode !== "none" &&
    capabilities.secretKeyMode !== "unknown" &&
    capabilities.publishableKeyMode !== "unknown" &&
    capabilities.publishableKeyMode !== capabilities.secretKeyMode
  ) {
    return "Stripe publishable and secret keys are using different modes.";
  }
  if (policy?.requireLiveMode && capabilities.secretKeyMode !== "live") {
    return "Stripe billing is still using test-mode or unknown keys; live launch requires live billing keys.";
  }
  if (!capabilities.hasCheckoutPrice) {
    return "Stripe checkout is disabled (missing STRIPE_PRICE_ID).";
  }
  if (!capabilities.hasWebhookSecret) {
    return "Webhook signature secret is missing; Pro entitlement sync is disabled.";
  }
  if (entitlements.subscriptionCount > 0 && entitlements.activeSubscriptionCount === 0) {
    return "Stripe has subscription records, but none are currently active.";
  }
  if (entitlements.missingIdentityCount > 0) {
    return "Some subscriptions are missing owner/user/email metadata. Plan sync may be incomplete.";
  }
  return null;
}

function resolveDeliverySystemWarning(
  deliveryDiagnostics: Awaited<ReturnType<typeof getInvoiceEmailDiagnostics>>,
  _summary: Awaited<ReturnType<typeof getInvoiceDeliveryStoreSummary>>
): string | null {
  if (!deliveryDiagnostics.capabilities.configured) {
    return "Invoice email provider is not configured; send actions are tracking-only.";
  }
  if (deliveryDiagnostics.verification.warning) {
    return deliveryDiagnostics.verification.warning;
  }
  return null;
}

function toPublicPortalInvoice(invoice: SavedInvoice) {
  const finishedInvoice = invoice.invoiceData.finishedInvoice;
  const structuredInvoice = invoice.invoiceData.structuredInvoice;
  return {
    invoiceId: invoice.invoiceId,
    updatedAt: invoice.updatedAt,
    status: invoice.status,
    invoiceData: {
      structuredInvoice: {
        customerName: structuredInvoice.customerName
      },
      finishedInvoice: {
        invoiceNumber: finishedInvoice.invoiceNumber,
        issueDate: finishedInvoice.issueDate,
        dueDate: finishedInvoice.dueDate,
        customerName: finishedInvoice.customerName,
        currency: finishedInvoice.currency,
        lineItems: finishedInvoice.lineItems,
        subtotal: finishedInvoice.subtotal,
        total: finishedInvoice.total,
        balanceDue: finishedInvoice.balanceDue,
        paymentLinkUrl: finishedInvoice.paymentLinkUrl,
        notes: finishedInvoice.notes
      }
    }
  };
}

function toPublicPortalHistoryItem(invoice: InvoiceListItem) {
  return {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    updatedAt: invoice.updatedAt,
    status: invoice.status,
    total: invoice.total,
    balanceDue: invoice.balanceDue,
    dueDate: invoice.dueDate
  };
}

function isSamePortalCustomer(left: string | undefined, right: string): boolean {
  return normalizePortalCustomerName(left) === normalizePortalCustomerName(right);
}

function normalizePortalCustomerName(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function asOptionalParseMode(value: unknown): "fast" | "full" | undefined {
  return value === "fast" || value === "full" ? value : undefined;
}

function getRequestOwnerId(req: Request): string {
  const authSession = getAuthSessionFromRequest(req);
  const authPolicy = getInvoiceAuthPolicy();
  if (authPolicy.requireAuth && !authSession?.userId) {
    throw new HttpStatusError(401, "Authentication required.");
  }
  if (authSession?.userId) {
    return authSession.userId;
  }
  const fromHeader = asOptionalString(req.headers["x-invoice-user-id"]) ?? asOptionalString(req.headers["x-user-id"]);
  const fromQuery = asOptionalString(req.query.userId);
  const defaultOwnerId = asOptionalString(process.env.INVOICE_DEFAULT_USER_ID) ?? "local-default";
  return fromHeader ?? fromQuery ?? defaultOwnerId;
}

function assertInvoiceAuthSessionPolicy(): void {
  const policy = getInvoiceAuthPolicy();
  if (policy.productionReady) {
    return;
  }
  throw new Error(
    [
      "Invoice auth policy is not production-ready.",
      `NODE_ENV=${policy.nodeEnv} requires authentication but auth prerequisites are incomplete.`,
      policy.warning ?? "A verified email sign-in provider is required in production.",
      "Set INVOICE_SESSION_SECRET to a strong non-default value, configure email delivery, or override INVOICE_REQUIRE_AUTH=false for local-only mode."
    ].join(" ")
  );
}

async function assertSavedInvoiceMigrationPolicy(): Promise<void> {
  const migrationPolicy = await getSavedInvoiceMigrationPolicy();
  if (migrationPolicy.migrationReady) {
    return;
  }
  throw new Error(
    [
      "Invoice persistence migration policy is not production-ready.",
      migrationPolicy.warning ?? "Legacy file-store invoices still require migration.",
      "Run `npm run migrate:invoices:postgres` and clear legacy file backlog before strict prod startup."
    ].join(" ")
  );
}

async function getSavedInvoiceMigrationPolicy(knownInvoiceCount?: number): Promise<{
  requireMigrationComplete: boolean;
  migrationReady: boolean;
  legacyInvoiceCount: number;
  warning?: string;
}> {
  const runtimePolicy = getSavedInvoicePersistencePolicy();
  const requireMigrationComplete = resolveSavedInvoiceRequireMigrationComplete(
    process.env.INVOICE_STORE_REQUIRE_MIGRATION_COMPLETE,
    {
      nodeEnv: runtimePolicy.nodeEnv,
      requirePostgres: runtimePolicy.requirePostgres
    }
  );
  const legacyInvoiceCount =
    typeof knownInvoiceCount === "number" ? knownInvoiceCount : (await getSavedInvoiceStoreSummary()).invoiceCount;
  const migrationReady =
    !requireMigrationComplete || runtimePolicy.resolvedBackend !== "postgres" || legacyInvoiceCount === 0;
  return {
    requireMigrationComplete,
    migrationReady,
    legacyInvoiceCount,
    warning: migrationReady
      ? undefined
      : "Migration completeness is required, but legacy file-store invoices are still present."
  };
}

function resolveLaunchRequireLiveBilling(value: string | undefined, nodeEnv: string | undefined): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return (nodeEnv ?? "development").trim().toLowerCase() === "production";
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

async function ensureSavedInvoicePaymentLink(input: {
  ownerId: string;
  invoice: Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>;
  baseUrl: string;
}) {
  const existingPaymentLink = input.invoice.invoiceData.finishedInvoice.paymentLinkUrl?.trim();
  if (existingPaymentLink) {
    return input.invoice;
  }
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.invoicePaymentAvailable) {
    return input.invoice;
  }
  return createAndPersistSavedInvoicePaymentLink(input);
}

async function createAndPersistSavedInvoicePaymentLink(input: {
  ownerId: string;
  invoice: Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>;
  baseUrl: string;
}) {
  const finishedInvoice = input.invoice.invoiceData.finishedInvoice;
  const total = Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new HttpStatusError(400, "Invoice total must be greater than 0 before creating a payment link.");
  }

  const paymentLink = await createStripeInvoicePaymentLink({
    invoiceId: input.invoice.invoiceId,
    ownerId: input.ownerId,
    baseUrl: input.baseUrl,
    invoiceNumber: finishedInvoice.invoiceNumber,
    customerName: finishedInvoice.customerName,
    total,
    currency: finishedInvoice.currency
  });

  return savedInvoiceRepository.saveInvoiceDocument({
    ownerId: input.ownerId,
    invoiceId: input.invoice.invoiceId,
    sourceType: input.invoice.sourceType,
    invoiceData: {
      ...input.invoice.invoiceData,
      finishedInvoice: {
        ...finishedInvoice,
        paymentLinkUrl: paymentLink.url
      }
    }
  });
}

async function markSavedInvoicePaidFromStripePayment(input: {
  invoiceId: string;
  ownerId: string;
  paymentIntentId: string;
}): Promise<void> {
  let savedInvoice;
  try {
    savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(input.invoiceId, input.ownerId);
  } catch (_error) {
    return;
  }
  if (savedInvoice.status === "deleted") {
    return;
  }
  const currentInvoice = savedInvoice.invoiceData.finishedInvoice;
  await savedInvoiceRepository.saveInvoiceDocument({
    ownerId: input.ownerId,
    invoiceId: input.invoiceId,
    sourceType: savedInvoice.sourceType,
    invoiceData: {
      ...savedInvoice.invoiceData,
      finishedInvoice: {
        ...currentInvoice,
        balanceDue: 0
      }
    }
  });
  if (savedInvoice.status !== "paid") {
    await savedInvoiceRepository.updateSavedInvoiceStatus(input.invoiceId, "paid", input.ownerId);
  }
}

function evaluatePersistenceMigrationStatus(
  resolvedBackend: "file" | "postgres",
  legacyInvoiceCount: number
): {
  backlogDetected: boolean;
  severity: "none" | "info" | "warn";
  message: string;
} {
  if (legacyInvoiceCount <= 0) {
    return {
      backlogDetected: false,
      severity: "none",
      message: "No legacy file-store invoices detected."
    };
  }

  if (resolvedBackend === "postgres") {
    return {
      backlogDetected: true,
      severity: "warn",
      message:
        "Legacy file-store invoices still exist while Postgres is active. Run migration and archive the file store."
    };
  }

  return {
    backlogDetected: true,
    severity: "info",
    message:
      "Legacy file-store invoices are present. Run migration before enforcing Postgres-only persistence."
  };
}

function sendTrackingPixelResponse(res: Response): void {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Length", String(TRANSPARENT_GIF_BUFFER.byteLength));
  res.status(200).send(TRANSPARENT_GIF_BUFFER);
}

class HttpStatusError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isErrorWithMessage(value: unknown): value is Error {
  return value instanceof Error;
}

export { app };
