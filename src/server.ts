import "dotenv/config";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
  RecordPaymentRequestSchema,
  RemovePaymentRequestSchema,
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
  rewriteFollowUpMessage,
  runInvoiceAuditOverlay
} from "./services/invoicePipeline.js";
import { buildPdfFilename, createInvoicePdfBuffer } from "./services/invoicePdf.js";
import {
  buildClientStatementPdfFilename,
  createClientStatementPdfBuffer
} from "./services/clientStatementPdf.js";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeInvoicePaymentLink,
  getStripeBillingCapabilities,
  processStripeWebhookEvent
} from "./services/stripeBilling.js";
import { getBillingEntitlementsSummary } from "./services/billingEntitlementsStore.js";
import {
  getGooglePlayBillingCapabilities,
  getGooglePlayBillingDiagnostics,
  verifyGooglePlayOneTimeProductPurchase,
  verifyGooglePlaySubscriptionPurchase
} from "./services/googlePlayBilling.js";
import {
  getGooglePlayVerifyDiagnostics,
  recordGooglePlayVerifyAttempt
} from "./services/googlePlayVerifyDiagnosticsStore.js";
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
  sendClientStatementEmail,
  sendAuthSignInEmail,
  sendInvoiceEmail,
  sendLaunchTestEmail
} from "./services/invoiceEmailDelivery.js";
import {
  listClientStatementActivity,
  listRecentClientStatementActivity,
  recordClientStatementActivity
} from "./services/clientStatementActivityStore.js";
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
  completeGoogleNativeAuth,
  completeGoogleAuthCallback,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  readCookieValue
} from "./services/googleAuth.js";
import { buildFreePlanLimitMessage, getAccountPlanSummary } from "./services/accountPlanPolicy.js";
import { getInvoiceAuthPolicy } from "./services/invoiceAuthPolicy.js";
import { getInvoiceAuthProviderCapabilities } from "./services/invoiceAuthProviders.js";
import {
  getRevenueSignalsSnapshot,
  RevenueAttributionSchema,
  RevenueSignalNameSchema,
  trackRevenueSignal
} from "./services/revenueSignalsStore.js";
import { getGoogleAdsCampaignWatchSnapshot } from "./services/googleAdsCampaignWatch.js";
import { PUBLIC_PAGE_METADATA, injectPageMetadata } from "./publicPageMetadata.js";

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
let spaShellHtmlCache: string | null = null;
const TRANSPARENT_GIF_BUFFER = Buffer.from("R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");
const ANDROID_APP_LINKS_DEFAULT_PACKAGE_NAME = "app.notebill.app";

function getSpaShellHtml() {
  if (spaShellHtmlCache !== null) {
    return spaShellHtmlCache;
  }
  try {
    spaShellHtmlCache = readFileSync(path.join(publicDir, "spa-shell.html"), "utf8");
  } catch {
    spaShellHtmlCache = "";
  }
  return spaShellHtmlCache;
}

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
      if (result.subscriptionUnlock) {
        await trackRevenueSignalSafely({
          event: "pro_unlock_verified",
          ownerId: result.subscriptionUnlock.ownerId,
          source: result.subscriptionUnlock.source
        });
      }
      res.json({ ok: true, handled: result.handled, eventType: result.eventType });
    } catch (error) {
      next(error);
    }
  }
);
app.use(express.json({ limit: "4mb" }));

app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
  const statements = buildAndroidAppLinksStatements();
  if (!statements.length) {
    res
      .status(503)
      .json({ error: "Android App Links are not configured yet. Set the Play signing fingerprint first." });
    return;
  }
  res.type("application/json").send(JSON.stringify(statements, null, 2));
});

const spaRoutes = [
  "/",
  "/auth/verify",
  "/auth/google",
  "/ai-intake",
  "/manual",
  "/scratchpad",
  "/notes",
  "/import",
  "/diagnostics",
  "/library",
  "/stats",
  "/prefs",
  "/settings/business",
  "/settings/memory",
  "/settings/services",
  "/clients",
  "/dashboard",
  "/invoice-app-for-contractors",
  "/invoice-app-for-service-businesses",
  "/ai-invoice-app",
  "/ai-invoicing-app",
  "/ai-billing-app",
  "/bill-maker-app",
  "/mobile-billing-app",
  "/how-to-make-an-invoice-on-your-phone",
  "/mobile-invoice-app",
  "/invoice-app-on-phone",
  "/client-statements-and-follow-up",
  "/portal",
  "/privacy",
  "/help",
  "/support",
  "/feedback",
  "/data-deletion",
  "/delete-account"
];
app.get(spaRoutes, (req: Request, res: Response) => {
  const metadata = PUBLIC_PAGE_METADATA[req.path as keyof typeof PUBLIC_PAGE_METADATA];
  const spaShellHtml = getSpaShellHtml();
  if (metadata && spaShellHtml) {
    res.type("html").send(injectPageMetadata(spaShellHtml, req.path, metadata));
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/invoices", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/portal/:invoiceId/:token", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use(express.static(publicDir));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/account/plan", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerId = getRequestOwnerId(req);
    const authSession = getAuthSessionFromRequest(req);
    const [summary, googlePlayDiagnostics] = await Promise.all([
      getAccountPlanSummary({
        ownerId,
        authSession,
        repository: savedInvoiceRepository
      }),
      getGooglePlayBillingDiagnostics()
    ]);
    const stripeBilling = getStripeBillingCapabilities();
    const googlePlayBilling = googlePlayDiagnostics.capabilities;
    res.json({
      ...summary,
      billing: {
        ...stripeBilling,
        provider: stripeBilling.provider !== "none" ? stripeBilling.provider : googlePlayBilling.provider,
        googlePlay: {
          ...googlePlayBilling,
          entitlements: googlePlayDiagnostics.entitlements,
          warning: googlePlayDiagnostics.warning
        }
      }
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
      source: "billing_checkout",
      request: req
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

app.post("/api/billing/google-play/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        purchaseToken: z.string().trim().min(1),
        productId: z.string().trim().optional(),
        packageName: z.string().trim().optional(),
        basePlanId: z.string().trim().optional()
      })
      .parse(req.body ?? {});
    const authSession = getAuthSessionFromRequest(req);
    const ownerId = getRequestOwnerId(req);
    await recordGooglePlayVerifyAttempt({
      phase: "received",
      productType: "subscription",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: parsedRequest.productId,
      packageName: parsedRequest.packageName,
      basePlanId: parsedRequest.basePlanId,
      purchaseTokenSuffix: parsedRequest.purchaseToken.slice(-8),
      message: "Subscription verification request received."
    });
    const result = await verifyGooglePlaySubscriptionPurchase({
      purchaseToken: parsedRequest.purchaseToken,
      productId: parsedRequest.productId,
      packageName: parsedRequest.packageName,
      basePlanId: parsedRequest.basePlanId,
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email
    });
    await trackRevenueSignalSafely({
      event: "pro_unlock_verified",
      ownerId,
      source: `google_play_subscription:${parsedRequest.basePlanId || "default"}`,
      request: req
    });
    await recordGooglePlayVerifyAttempt({
      phase: "verified",
      productType: "subscription",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: result.productId,
      packageName: result.packageName,
      basePlanId: result.basePlanId || parsedRequest.basePlanId || "",
      purchaseTokenSuffix: result.purchaseToken.slice(-8),
      subscriptionState: result.subscriptionState,
      purchaseState: result.purchaseState || "",
      expiryAt: result.expiryAt || "",
      acknowledged: result.acknowledged,
      message: "Subscription verification succeeded."
    });
    res.json({
      ok: true,
      result
    });
  } catch (error) {
    const authSession = getAuthSessionFromRequest(req);
    const ownerId = getRequestOwnerId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    await recordGooglePlayVerifyAttempt({
      phase: "failed",
      productType: "subscription",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: typeof body.productId === "string" ? body.productId : "",
      packageName: typeof body.packageName === "string" ? body.packageName : "",
      basePlanId: typeof body.basePlanId === "string" ? body.basePlanId : "",
      purchaseTokenSuffix: typeof body.purchaseToken === "string" ? body.purchaseToken.slice(-8) : "",
      message: error instanceof Error ? error.message : "Subscription verification failed."
    });
    next(error);
  }
});

app.post("/api/billing/google-play/lifetime/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        purchaseToken: z.string().trim().min(1),
        productId: z.string().trim().optional(),
        packageName: z.string().trim().optional()
      })
      .parse(req.body ?? {});
    const authSession = getAuthSessionFromRequest(req);
    const ownerId = getRequestOwnerId(req);
    await recordGooglePlayVerifyAttempt({
      phase: "received",
      productType: "one_time",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: parsedRequest.productId,
      packageName: parsedRequest.packageName,
      purchaseTokenSuffix: parsedRequest.purchaseToken.slice(-8),
      message: "Lifetime verification request received."
    });
    const result = await verifyGooglePlayOneTimeProductPurchase({
      purchaseToken: parsedRequest.purchaseToken,
      productId: parsedRequest.productId,
      packageName: parsedRequest.packageName,
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email
    });
    await trackRevenueSignalSafely({
      event: "lifetime_unlock_verified",
      ownerId,
      source: "google_play_lifetime",
      request: req
    });
    await recordGooglePlayVerifyAttempt({
      phase: "verified",
      productType: "one_time",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: result.productId,
      packageName: result.packageName,
      purchaseTokenSuffix: result.purchaseToken.slice(-8),
      subscriptionState: result.subscriptionState,
      purchaseState: result.purchaseState || "",
      expiryAt: result.expiryAt || "",
      acknowledged: result.acknowledged,
      message: "Lifetime verification succeeded."
    });
    res.json({
      ok: true,
      result
    });
  } catch (error) {
    const authSession = getAuthSessionFromRequest(req);
    const ownerId = getRequestOwnerId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    await recordGooglePlayVerifyAttempt({
      phase: "failed",
      productType: "one_time",
      ownerId,
      userId: authSession?.userId,
      email: authSession?.email,
      productId: typeof body.productId === "string" ? body.productId : "",
      packageName: typeof body.packageName === "string" ? body.packageName : "",
      purchaseTokenSuffix: typeof body.purchaseToken === "string" ? body.purchaseToken.slice(-8) : "",
      message: error instanceof Error ? error.message : "Lifetime verification failed."
    });
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to create client portal links.");
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
  const providers = getInvoiceAuthProviderCapabilities({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET
  });
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

app.post("/api/auth/google/native", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const googleProvider = getInvoiceAuthProviderCapabilities({
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET
    }).find((candidate) => candidate.id === "google");
    if (!googleProvider?.available) {
      throw new HttpStatusError(503, googleProvider?.warning ?? "Google Sign-In isn't available right now.");
    }
    const parsed = z
      .object({
        idToken: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1)
        )
      })
      .parse(req.body);

    const completed = await completeGoogleNativeAuth({
      idToken: parsed.idToken
    });
    const created = createAuthSessionForEmail(completed.identity.email);
    await trackRevenueSignalSafely({
      event: "account_signed_in",
      ownerId: created.session.userId,
      source: "auth_google_native",
      request: req
    });
    res.json({
      ok: true,
      token: created.token,
      session: created.session
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
      source: "auth_google",
      request: req
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
      source: "auth_verify",
      request: req
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
    const stripeCapabilities = getStripeBillingCapabilities();
    const googlePlayDiagnostics = await getGooglePlayBillingDiagnostics();
    const googlePlayVerifyDiagnostics = await getGooglePlayVerifyDiagnostics();
    const entitlements = await getBillingEntitlementsSummary();
    const requireLiveMode = resolveLaunchRequireLiveBilling(
      process.env.INVOICE_LAUNCH_REQUIRE_LIVE_BILLING,
      process.env.NODE_ENV
    );
    const stripeWarning = resolveBillingSystemWarning(stripeCapabilities, entitlements, { requireLiveMode });
    const primaryProvider =
      stripeCapabilities.provider !== "none"
        ? stripeCapabilities.provider
        : googlePlayDiagnostics.provider;
    const warning = stripeWarning ?? (primaryProvider === "google_play" ? googlePlayDiagnostics.warning : null);
    res.json({
      provider: primaryProvider,
      capabilities: {
        ...stripeCapabilities,
        provider: primaryProvider,
        googlePlay: googlePlayDiagnostics.capabilities
      },
      googlePlayVerifyDiagnostics,
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

app.get("/api/system/google-ads/campaign-status", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await getGoogleAdsCampaignWatchSnapshot();
    res.json(snapshot);
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
    if (parsedRequest.event === "pro_unlock_verified" || parsedRequest.event === "lifetime_unlock_verified") {
      throw new HttpStatusError(403, "Verified billing events can only be recorded by the billing provider.");
    }
    await trackRevenueSignalSafely({
      event: parsedRequest.event,
      ownerId: getRequestOwnerId(req),
      source: parsedRequest.source ?? "client",
      request: req
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
          source: "from_input",
          request: req
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

app.post("/api/invoices/rewrite-follow-up-message", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = RewriteFollowUpMessageRequestSchema.parse(req.body);
    const message = await rewriteFollowUpMessage(parsedRequest.message, parsedRequest.tone);
    res.json({ message });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/export-pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = InvoicePdfExportRequestSchema.parse(req.body);
    const pdfBuffer = await createInvoicePdfBuffer(parsedRequest);
    const filename = buildPdfFilename(
      parsedRequest.invoice.invoiceNumber,
      parsedRequest.invoice.documentType
    );
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
        source: "invoice_save",
        request: req
      });
      const savedInvoiceCount = (await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId)).length;
      if (savedInvoiceCount === 1) {
        await trackRevenueSignalSafely({
          event: "first_invoice_saved",
          ownerId,
          source: "invoice_save",
          request: req
        });
      }
      if (savedInvoiceCount === 2) {
        await trackRevenueSignalSafely({
          event: "second_invoice_saved",
          ownerId,
          source: "invoice_save",
          request: req
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to send invoices from NoteBill.");
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
      source: "invoice_send",
      request: req
    });
    if (existingInvoice.status === "draft") {
      const invoices = await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId);
      const sentInvoiceCount = invoices.filter(
        (saved) => saved?.status === "sent" || saved?.status === "paid"
      ).length;
      if (sentInvoiceCount === 1) {
        await trackRevenueSignalSafely({
          event: "first_invoice_sent",
          ownerId,
          source: "invoice_send",
          request: req
        });
      }
    }
    const hadPaymentLinkBeforeSend = Boolean(existingInvoice.invoiceData?.finishedInvoice?.paymentLinkUrl?.trim());
    const hasPaymentLinkAfterSend = Boolean(invoice.invoiceData?.finishedInvoice?.paymentLinkUrl?.trim());
    if (!hadPaymentLinkBeforeSend && hasPaymentLinkAfterSend) {
      const invoices = await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId);
      const invoicesWithPaymentLinks = invoices.filter((saved) => Boolean(saved?.paymentLinkUrl?.trim())).length;
      if (invoicesWithPaymentLinks === 1) {
        await trackRevenueSignalSafely({
          event: "first_payment_link_added",
          ownerId,
          source: "invoice_send",
          request: req
        });
      }
    }
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to create hosted payment links.");
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before creating a payment link.");
    }
    if (!getStripeBillingCapabilities().invoicePaymentAvailable) {
      throw new HttpStatusError(400, "Invoice payments are not configured yet.");
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
      source: "payment_link",
      request: req
    });
    const hadPaymentLinkBefore = Boolean(savedInvoice.invoiceData?.finishedInvoice?.paymentLinkUrl?.trim());
    const hasPaymentLinkAfter = Boolean(invoice.invoiceData?.finishedInvoice?.paymentLinkUrl?.trim());
    if (!hadPaymentLinkBefore && hasPaymentLinkAfter) {
      const invoices = await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId);
      const invoicesWithPaymentLinks = invoices.filter((saved) => Boolean(saved?.paymentLinkUrl?.trim())).length;
      if (invoicesWithPaymentLinks === 1) {
        await trackRevenueSignalSafely({
          event: "first_payment_link_added",
          ownerId,
          source: "payment_link",
          request: req
        });
      }
    }
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to send invoice reminders.");
    const reminder = await sendInvoiceReminderById({
      ownerId,
      invoiceId,
      repository: savedInvoiceRepository,
      baseUrl: resolvePublicBaseUrl(req)
    });
    await trackRevenueSignalSafely({
      event: "reminder_sent",
      ownerId,
      source: "send_reminder",
      request: req
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

app.post("/api/clients/statement/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        clientName: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).max(160)
        ),
        recipientEmail: z.preprocess(
          (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
          z.string().email()
        )
      })
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to send client statements.");
    const statement = await buildClientStatementForOwner(ownerId, parsedRequest.clientName, parsedRequest.recipientEmail);
    const sendResult = await sendClientStatementEmail({
      recipientEmail: parsedRequest.recipientEmail,
      clientName: statement.clientName,
      preparedAt: statement.preparedAt,
      openBalance: statement.openBalance,
      currency: statement.currency,
      invoices: statement.invoices.map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        total: invoice.total,
        balanceDue: invoice.balanceDue,
        currency: statement.currency
      }))
    });
    await recordClientStatementActivity({
      ownerId,
      clientName: statement.clientName,
      action: "emailed_statement",
      detail: `Statement emailed to ${parsedRequest.recipientEmail}`,
      recipientEmail: parsedRequest.recipientEmail
    });
    res.json({
      clientName: statement.clientName,
      recipientEmail: parsedRequest.recipientEmail,
      openInvoiceCount: statement.openInvoiceCount,
      openBalance: statement.openBalance,
      preparedAt: statement.preparedAt,
      mode: sendResult.mode,
      provider: sendResult.provider,
      warning: sendResult.warning ?? null
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients/statement/activity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedQuery = z
      .object({
        clientName: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).max(160)
        ),
        limit: z
          .preprocess((value) => {
            if (typeof value === "string" && value.trim()) {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : value;
            }
            return value;
          }, z.number().int().min(1).max(20))
          .optional()
      })
      .parse(req.query ?? {});
    const ownerId = getRequestOwnerId(req);
    const activities = await listClientStatementActivity({
      ownerId,
      clientName: parsedQuery.clientName,
      limit: parsedQuery.limit ?? 8
    });
    res.json({ activities });
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients/statement/activity/recent", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedQuery = z
      .object({
        limit: z
          .preprocess((value) => {
            if (typeof value === "string" && value.trim()) {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : value;
            }
            return value;
          }, z.number().int().min(1).max(20))
          .optional()
      })
      .parse(req.query ?? {});
    const ownerId = getRequestOwnerId(req);
    const activities = await listRecentClientStatementActivity({
      ownerId,
      limit: parsedQuery.limit ?? 8
    });
    res.json({ activities });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clients/statement/activity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        clientName: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).max(160)
        ),
        action: z.enum([
          "viewed_statement",
          "copied_statement",
          "copied_follow_up",
          "emailed_statement",
          "printed_statement",
          "downloaded_pdf"
        ]),
        detail: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(1).max(240)),
        recipientEmail: z
          .preprocess((value) => (typeof value === "string" ? value.trim().toLowerCase() : value), z.string().email())
          .optional()
      })
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    const activity = await recordClientStatementActivity({
      ownerId,
      clientName: parsedRequest.clientName,
      action: parsedRequest.action,
      detail: parsedRequest.detail,
      recipientEmail: parsedRequest.recipientEmail
    });
    res.json({ activity });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clients/statement/export-pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        clientName: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().min(1).max(160)
        ),
        recipientEmail: z
          .preprocess((value) => (typeof value === "string" ? value.trim().toLowerCase() : value), z.string().email())
          .optional()
      })
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to export client statements.");
    const statement = await buildClientStatementForOwner(ownerId, parsedRequest.clientName, parsedRequest.recipientEmail);
    const pdfBuffer = await createClientStatementPdfBuffer({
      clientName: statement.clientName,
      recipientEmail: statement.recipientEmail,
      preparedAt: statement.preparedAt,
      openBalance: statement.openBalance,
      currency: statement.currency,
      invoices: statement.invoices.map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        total: invoice.total,
        balanceDue: invoice.balanceDue,
        statusLabel: invoice.statusLabel
      }))
    });
    const filename = buildClientStatementPdfFilename(statement.clientName);
    await recordClientStatementActivity({
      ownerId,
      clientName: statement.clientName,
      action: "downloaded_pdf",
      detail: `Statement PDF downloaded${parsedRequest.recipientEmail ? ` for ${parsedRequest.recipientEmail}` : ""}`,
      recipientEmail: parsedRequest.recipientEmail
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.byteLength));
    res.status(200).send(pdfBuffer);
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to run invoice reminders.");
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
    await requireProWorkflowAccess(req, ownerId, "Upgrade to Pro to duplicate saved invoices.");
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

app.post("/api/invoices/:id/record-payment", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = RecordPaymentRequestSchema.parse(req.body);
    const ownerId = getRequestOwnerId(req);
    const invoice = await recordSavedInvoicePayment({ invoiceId, ownerId, ...parsedRequest });
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/remove-payment", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = RemovePaymentRequestSchema.parse(req.body);
    const ownerId = getRequestOwnerId(req);
    const invoice = await removeSavedInvoicePayment({ invoiceId, ownerId, paymentId: parsedRequest.paymentId });
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
  request?: Request;
}): Promise<void> {
  try {
    await trackRevenueSignal({
      event: input.event,
      ownerId: input.ownerId,
      source: input.source,
      attribution: input.request ? getRequestAttribution(input.request) : undefined
    });
  } catch (error) {
    // Revenue telemetry should never block invoice work.
    // eslint-disable-next-line no-console
    console.error("Failed to track revenue signal", error);
  }
}

function getRequestAttribution(req: Request): z.infer<typeof RevenueAttributionSchema> | undefined {
  const encoded = asOptionalString(req.headers["x-notebill-attribution"]);
  if (!encoded || encoded.length > 2000) {
    return undefined;
  }
  try {
    const parsed = RevenueAttributionSchema.parse(JSON.parse(decodeURIComponent(encoded)));
    return Object.values(parsed).some(Boolean) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function requireProWorkflowAccess(req: Request, ownerId: string, message: string): Promise<void> {
  const planSummary = await getAccountPlanSummary({
    ownerId,
    authSession: getAuthSessionFromRequest(req),
    repository: savedInvoiceRepository
  });
  if (planSummary.plan !== "pro") {
    throw new HttpStatusError(402, message);
  }
}

type ClientStatementData = {
  clientName: string;
  recipientEmail?: string;
  preparedAt: string;
  openBalance: number;
  openInvoiceCount: number;
  currency: string;
  invoices: Array<{
    invoiceNumber?: string;
    dueDate?: string | null;
    total?: number | null;
    balanceDue?: number | null;
    statusLabel: string;
  }>;
};

async function buildClientStatementForOwner(
  ownerId: string,
  clientName: string,
  recipientEmail?: string
): Promise<ClientStatementData> {
  const invoices = await savedInvoiceRepository.listSavedInvoiceMetadata(false, ownerId);
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "sent" &&
      Number(invoice.balanceDue ?? 0) > 0 &&
      isSamePortalCustomer(invoice.customerName, clientName)
  );
  if (!matchingInvoices.length) {
    throw new HttpStatusError(400, "No open sent invoices were found for this client.");
  }
  const openBalance = matchingInvoices.reduce((sum, invoice) => {
    const amount = Number(invoice.balanceDue ?? 0);
    return sum + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
  }, 0);
  return {
    clientName,
    recipientEmail,
    preparedAt: new Date().toISOString(),
    openBalance,
    openInvoiceCount: matchingInvoices.length,
    currency: "USD",
    invoices: matchingInvoices
      .sort((left, right) => String(left.dueDate ?? "").localeCompare(String(right.dueDate ?? "")))
      .slice(0, 24)
      .map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        total: invoice.total,
        balanceDue: invoice.balanceDue,
        statusLabel: buildClientStatementInvoiceStatusLabel(invoice)
      }))
  };
}

function buildClientStatementInvoiceStatusLabel(
  invoice: {
    status?: string | null;
    delivery?: { status?: string | null } | null;
    total?: number | null;
    balanceDue?: number | null;
  }
): string {
  const labels: string[] = [];
  if (invoice.delivery?.status === "opened") {
    labels.push("Opened");
  } else if (invoice.status === "sent") {
    labels.push("Sent");
  }
  const total = Number(invoice.total ?? 0);
  const balance = Number(invoice.balanceDue ?? total);
  if (Number.isFinite(total) && Number.isFinite(balance) && total > balance && balance > 0) {
    labels.push("Partial payment");
  }
  return labels.join(" · ") || "Open";
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

function buildAndroidAppLinksStatements(): Array<{
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}> {
  const packageName =
    asOptionalString(process.env.ANDROID_APP_LINKS_PACKAGE_NAME ?? process.env.ANDROID_PACKAGE_NAME)?.trim() ||
    ANDROID_APP_LINKS_DEFAULT_PACKAGE_NAME;
  const fingerprints = readAndroidAppLinksFingerprints();
  if (!packageName || !fingerprints.length) {
    return [];
  }
  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds"
      ],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}

function readAndroidAppLinksFingerprints(): string[] {
  const rawValues = [
    process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS,
    process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINT,
    process.env.GOOGLE_PLAY_APP_SIGNING_SHA256_CERT_FINGERPRINTS,
    process.env.GOOGLE_PLAY_APP_SIGNING_SHA256_CERT_FINGERPRINT
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(","));
  const fingerprints = rawValues
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .map((value) => value.replace(/[^A-F0-9]/g, ""))
    .filter(Boolean)
    .map((value) => value.match(/.{2}/g)?.join(":") ?? value)
    .filter(Boolean);
  return Array.from(new Set(fingerprints));
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
        documentType: finishedInvoice.documentType,
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
        paymentMethods: finishedInvoice.paymentMethods,
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

const RewriteFollowUpMessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  tone: z.string().trim().max(120).optional()
});

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

function roundCurrencyAmount(value: number): number {
  return Math.max(0, Number(value.toFixed(2)));
}

function calculateInvoiceBalance(total: number, paymentRecords: Array<{ amount?: number }>): number {
  const amountPaid = paymentRecords.reduce((sum, record) => sum + Number(record?.amount ?? 0), 0);
  return roundCurrencyAmount(total - amountPaid);
}

async function recordSavedInvoicePayment(input: {
  invoiceId: string;
  ownerId: string;
  amount: number;
  paidAt?: string;
  note?: string;
}): Promise<SavedInvoice> {
  const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(input.invoiceId, input.ownerId);
  if (savedInvoice.status === "deleted") {
    throw new HttpStatusError(400, "Restore this invoice before recording a payment.");
  }
  if (savedInvoice.invoiceData.finishedInvoice.documentType === "estimate") {
    throw new HttpStatusError(400, "Convert this estimate into an invoice before recording payment.");
  }
  const currentInvoice = savedInvoice.invoiceData.finishedInvoice;
  const nextPaymentRecords = [
    ...(currentInvoice.paymentRecords ?? []),
    {
      id: randomUUID(),
      amount: input.amount,
      paidAt: input.paidAt?.trim() || new Date().toISOString().slice(0, 10),
      note: input.note?.trim() || undefined
    }
  ];
  const invoiceTotal = Number(currentInvoice.total ?? currentInvoice.balanceDue ?? 0);
  const nextBalanceDue = calculateInvoiceBalance(invoiceTotal, nextPaymentRecords);
  let nextInvoice = await savedInvoiceRepository.saveInvoiceDocument({
    ownerId: input.ownerId,
    invoiceId: input.invoiceId,
    sourceType: savedInvoice.sourceType,
    invoiceData: {
      ...savedInvoice.invoiceData,
      finishedInvoice: {
        ...currentInvoice,
        balanceDue: nextBalanceDue,
        paymentRecords: nextPaymentRecords
      }
    }
  });
  if (nextBalanceDue <= 0 && savedInvoice.status !== "paid") {
    nextInvoice = await savedInvoiceRepository.updateSavedInvoiceStatus(input.invoiceId, "paid", input.ownerId);
  } else if (nextBalanceDue > 0 && savedInvoice.status === "draft") {
    nextInvoice = await savedInvoiceRepository.updateSavedInvoiceStatus(input.invoiceId, "sent", input.ownerId);
  }
  return nextInvoice;
}

async function removeSavedInvoicePayment(input: {
  invoiceId: string;
  ownerId: string;
  paymentId: string;
}): Promise<SavedInvoice> {
  const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(input.invoiceId, input.ownerId);
  if (savedInvoice.status === "deleted") {
    throw new HttpStatusError(400, "Restore this invoice before editing payments.");
  }
  const currentInvoice = savedInvoice.invoiceData.finishedInvoice;
  const nextPaymentRecords = (currentInvoice.paymentRecords ?? []).filter(
    (payment) => payment.id !== input.paymentId
  );
  if (nextPaymentRecords.length === (currentInvoice.paymentRecords ?? []).length) {
    throw new HttpStatusError(404, "Payment record not found.");
  }
  const invoiceTotal = Number(currentInvoice.total ?? currentInvoice.balanceDue ?? 0);
  const nextBalanceDue = calculateInvoiceBalance(invoiceTotal, nextPaymentRecords);
  let nextInvoice = await savedInvoiceRepository.saveInvoiceDocument({
    ownerId: input.ownerId,
    invoiceId: input.invoiceId,
    sourceType: savedInvoice.sourceType,
    invoiceData: {
      ...savedInvoice.invoiceData,
      finishedInvoice: {
        ...currentInvoice,
        balanceDue: nextBalanceDue,
        paymentRecords: nextPaymentRecords
      }
    }
  });
  if (savedInvoice.status === "paid" && nextBalanceDue > 0) {
    nextInvoice = await savedInvoiceRepository.updateSavedInvoiceStatus(input.invoiceId, "sent", input.ownerId);
  }
  return nextInvoice;
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
