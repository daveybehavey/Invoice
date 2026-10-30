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
  hasUnresolvedNumericBillingFollowUp,
  rewordFullInvoice,
  runInvoiceAuditOverlay
} from "./services/invoicePipeline.js";
import { buildPdfFilename, createInvoicePdfBuffer } from "./services/invoicePdf.js";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeInvoicePaymentLink,
  getStripeBillingCapabilities,
  processStripeWebhookEvent,
  resolveAuthenticatedCheckoutOwnership
} from "./services/stripeBilling.js";
import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
  buildPrivacySections,
  buildTermsDownloadFilename,
  buildTermsDownloadPath,
  buildTermsPlainText,
  getLegalFoundationSnapshot,
  resolveTermsDocument
} from "./services/legalFoundation.js";
import { deliverContractCopy } from "./services/contractCopyDelivery.js";
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
  beginInvoiceDeliveryDispatch,
  cancelInvoiceDeliveryClaim,
  countInvoiceDeliveryClaims,
  getInvoiceDeliveryClaimById,
  getInvoiceDeliveryClaimByResendAction,
  getInvoiceDeliveryStoreSummary,
  getInvoiceDeliverySummary,
  getInvoiceDeliverySummariesByInvoiceIds,
  markInvoiceDeliveryOpenedByTrackingToken,
  markInvoiceDeliveryOpened,
  recordInvoiceDeliveryClaimOutcome,
  releaseInvoiceDeliveryClaim,
  reserveInvoiceDeliveryClaim,
  setInvoiceReminderAnchor,
  type DeliveryClaim
} from "./services/invoiceDeliveryStore.js";
import {
  getInvoiceEmailCapabilities,
  getInvoiceEmailDiagnostics,
  isDefinitiveProviderRejection,
  sendAuthSignInEmail,
  sendInvoiceEmail,
  sendLaunchTestEmail
} from "./services/invoiceEmailDelivery.js";
import {
  CLIENT_PORTAL_BLOCKED_MESSAGE,
  invoiceSendIsBlocked,
  PAYMENT_LINK_BLOCKED_MESSAGE,
  SEND_BLOCKED_MESSAGE
} from "./services/invoiceSendGate.js";
import {
  isReminderHistoryRestartEnabled,
  listDueInvoiceReminderCandidates,
  resolveInvoiceReminderSettings,
  runDueInvoiceReminders,
  sendInvoiceReminderById
} from "./services/invoiceReminderScheduler.js";
import {
  exportOcrMetricsSnapshot,
  isOcrMetricsExportConfigured
} from "./services/ocrMetricsExporter.js";
import { getSavedInvoiceStoreSummary } from "./services/savedInvoiceStore.js";
import {
  calculateInvoiceBalanceMinor,
  findReusablePaymentLink,
  getExactCollectibleBalanceMinor,
  hasLegacyPaymentLink,
  invalidateLinksForBalanceChange,
  normalizeMoneyCurrency,
  reconstructGrossTotalMinor,
  supersedeActivePaymentLinks,
  toAmountMinorExact
} from "./services/invoicePaymentSettlement.js";
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
  inspectEmailSignInToken,
  type InvoiceAuthSession
} from "./services/authSession.js";
import { consumeEmailSignInNonce } from "./services/emailSignInRedemptionStore.js";
import { reserveProviderUsage } from "./services/providerUsageGate.js";
import {
  buildLaunchTestIdempotencyKey,
  recordLaunchTestClaimOutcome,
  reserveLaunchTestClaim
} from "./services/launchTestDispatchStore.js";
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
        await savedInvoiceRepository.settleStripeInvoicePayment({
          invoiceId: result.invoicePayment.invoiceId,
          ownerId: result.invoicePayment.ownerId,
          eventId: result.invoicePayment.eventId,
          paymentIntentId: result.invoicePayment.paymentIntentId,
          paymentLinkRecordId: result.invoicePayment.paymentLinkRecordId,
          amountReceivedMinor: result.invoicePayment.amountReceivedMinor,
          currency: result.invoicePayment.currency,
          receivedAt: new Date().toISOString()
        });
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
  "/dashboard",
  "/portal",
  "/privacy",
  "/terms",
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

app.get("/api/legal/foundation", (_req: Request, res: Response) => {
  res.json(getLegalFoundationSnapshot());
});

app.get("/api/legal/documents/:kind", (req: Request, res: Response, next: NextFunction) => {
  try {
    const kind = z.enum(["terms", "privacy"]).parse(req.params.kind);
    const versionQuery =
      typeof req.query.version === "string" ? req.query.version.trim() : undefined;
    const formatQuery =
      typeof req.query.format === "string" ? req.query.format.trim().toLowerCase() : undefined;

    if (kind === "terms") {
      let termsDoc;
      try {
        termsDoc = resolveTermsDocument(versionQuery || null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Terms version.";
        throw new HttpStatusError(/Unknown Terms version/i.test(message) ? 404 : 400, message);
      }

      if (formatQuery === "txt") {
        const filename = buildTermsDownloadFilename(termsDoc.version);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buildTermsPlainText(termsDoc.version));
        return;
      }

      res.json({
        kind,
        version: termsDoc.version,
        effectiveDate: termsDoc.effectiveDate,
        isCurrent: termsDoc.isCurrent,
        sections: termsDoc.sections,
        termsUrlPath: termsDoc.termsUrlPath,
        downloadPath: buildTermsDownloadPath(termsDoc.version)
      });
      return;
    }

    if (versionQuery && versionQuery !== LEGAL_PRIVACY_VERSION) {
      throw new HttpStatusError(
        404,
        `Unknown Privacy version "${versionQuery}". Current version: ${LEGAL_PRIVACY_VERSION}.`
      );
    }
    res.json({
      kind,
      version: LEGAL_PRIVACY_VERSION,
      effectiveDate: getLegalFoundationSnapshot().effectiveDate,
      isCurrent: true,
      sections: buildPrivacySections(),
      privacyUrlPath: "/privacy"
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
        cancelPath: z.string().trim().optional(),
        resumeIntentId: z.string().trim().min(1).max(128).optional(),
        termsVersion: z.string().trim().min(1).max(64).optional(),
        termsAccepted: z.union([z.boolean(), z.string()]).optional()
      })
      .default({})
      .parse(req.body ?? {});
    const authSession = getAuthSessionFromRequest(req);
    let ownership: { ownerId: string; userId: string; email: string };
    try {
      ownership = resolveAuthenticatedCheckoutOwnership(authSession);
    } catch (_error) {
      throw new HttpStatusError(401, "Sign in to upgrade to Pro.");
    }
    // Ownership is always session-derived; guest headers / body cannot choose entitlement owner.
    const checkoutSession = await createStripeCheckoutSession({
      ownerId: ownership.ownerId,
      userId: ownership.userId,
      email: ownership.email,
      baseUrl: resolvePublicBaseUrl(req),
      successPath: parsedRequest.successPath,
      cancelPath: parsedRequest.cancelPath,
      resumeIntentId: parsedRequest.resumeIntentId,
      termsVersion: parsedRequest.termsVersion,
      termsAccepted: parsedRequest.termsAccepted
    });
    await trackRevenueSignalSafely({
      event: "checkout_started",
      ownerId: ownership.ownerId,
      source: "billing_checkout"
    });
    res.json(checkoutSession);
  } catch (error) {
    next(error);
  }
});

app.post("/api/billing/contract-copy", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        termsVersion: z.string().trim().min(1).max(64).optional()
      })
      .default({})
      .parse(req.body ?? {});
    const authSession = getAuthSessionFromRequest(req);
    if (!authSession?.userId || !authSession.email) {
      throw new HttpStatusError(401, "Sign in to request a contract copy.");
    }
    const result = await deliverContractCopy({
      email: authSession.email,
      userId: authSession.userId,
      termsVersion: parsedRequest.termsVersion || LEGAL_TERMS_VERSION,
      baseUrl: resolvePublicBaseUrl(req)
    });
    res.json(result);
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
    if (!authSession?.userId || !authSession.email) {
      throw new HttpStatusError(401, "Sign in to open billing settings.");
    }
    const portalSession = await createStripeBillingPortalSession({
      email: authSession.email,
      userId: authSession.userId,
      ownerId: authSession.userId,
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
    if (
      invoiceSendIsBlocked({
        finishedInvoice: savedInvoice.invoiceData.finishedInvoice,
        sourceNote: savedInvoice.invoiceData.sourceNote
      })
    ) {
      throw new HttpStatusError(400, CLIENT_PORTAL_BLOCKED_MESSAGE);
    }
    // The token is written through a fresh-state transform inside the
    // store's serialization — never as a whole-document save of the
    // snapshot read above, which could overwrite a concurrent settlement.
    let portalAccessToken = "";
    const invoice = await savedInvoiceRepository.mutateSavedInvoice({
      invoiceId,
      ownerId,
      mutate: (current) => {
        const existingToken = current.invoiceData.finishedInvoice.portalAccessToken;
        portalAccessToken = parsedRequest.refresh || !existingToken ? randomUUID() : existingToken;
        return {
          ...current,
          invoiceData: {
            ...current.invoiceData,
            finishedInvoice: {
              ...current.invoiceData.finishedInvoice,
              portalAccessToken
            }
          }
        };
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
    // SEC-02: resolve the trusted origin before creating the token or
    // sending email; unconfigured/invalid origin is a controlled 503
    // and no usable token is ever created or returned.
    const publicBaseUrl = resolvePublicBaseUrl(req);
    const requested = createEmailSignInToken(parsed.email);
    const signInUrl = `${publicBaseUrl}/auth/verify?token=${encodeURIComponent(requested.token)}`;
    const delivery = await sendAuthSignInEmail({
      recipientEmail: parsed.email,
      signInUrl,
      expiresAt: requested.expiresAt
    });

    if (delivery.mode === "record_only") {
      // Fail closed in every environment: when email delivery is not
      // configured, never hand the caller a usable sign-in link.
      throw new HttpStatusError(
        503,
        "Email sign-in is unavailable right now. Configure a working email provider before enabling account sign-in."
      );
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

app.get("/api/auth/google/callback", async (req: Request, res: Response, next: NextFunction) => {
  // SEC-02 follow-up: resolve the trusted origin first, but a
  // resolution failure must reach the error middleware like every
  // other route — with no configured origin there is no error URL to
  // redirect to and no cookie context to clear against, so forward
  // the controlled 503 via next BEFORE any cookie logic. Throwing
  // here outside a try would escape the async handler as an
  // unhandled rejection under Express 4.
  let publicBaseUrl: string;
  try {
    publicBaseUrl = resolvePublicBaseUrl(req);
  } catch (error) {
    next(error);
    return;
  }
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
    // SEC-03: validation is separated from redemption. The nonce is
    // consumed atomically BEFORE any session is created; a duplicate
    // redemption receives the same generic invalid/expired response as
    // any other invalid link, and a redemption-store failure is a 503
    // with no session — never a fallback to stateless verification.
    const inspected = inspectEmailSignInToken(parsed.token);
    if (!inspected) {
      throw new HttpStatusError(400, "This sign-in link is invalid or expired.");
    }
    let consumption: Awaited<ReturnType<typeof consumeEmailSignInNonce>>;
    try {
      consumption = await consumeEmailSignInNonce({
        nonce: inspected.nonce,
        expiresAtEpochSeconds: inspected.expiresAtEpochSeconds
      });
    } catch (_error) {
      throw new HttpStatusError(503, "Sign-in is unavailable right now. Please request a new sign-in link.");
    }
    if (consumption !== "consumed") {
      throw new HttpStatusError(400, "This sign-in link is invalid or expired.");
    }
    const created = createAuthSessionForEmail(inspected.email);
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
    // SEC-05: launch-test dispatch requires a validated session in every
    // environment, then explicit operator authorization. Caller-supplied
    // owner headers/query values play no part in either decision.
    const authSession = getAuthSessionFromRequest(req);
    if (!authSession?.userId) {
      throw new HttpStatusError(401, "Authentication required.");
    }
    if (!isLaunchTestOperator(authSession)) {
      throw new HttpStatusError(403, "Launch test email is restricted to authorized operators.");
    }
    const actionId = asOptionalString(req.body?.actionId);
    if (!actionId || !LAUNCH_TEST_ACTION_ID_PATTERN.test(actionId)) {
      throw new HttpStatusError(
        400,
        "A stable actionId (8-128 characters: letters, digits, '.', '_', ':', '-') is required for launch test dispatch."
      );
    }
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

    // The durable claim is reserved before any provider dispatch. A
    // claim-store failure is a controlled 503 with no dispatch.
    let reservation: Awaited<ReturnType<typeof reserveLaunchTestClaim>>;
    try {
      reservation = await reserveLaunchTestClaim({
        actionId,
        operatorUserId: authSession.userId,
        recipientEmail
      });
    } catch (_error) {
      throw new HttpStatusError(503, "Launch test dispatch is unavailable right now.");
    }
    if (reservation.outcome === "conflict") {
      throw new HttpStatusError(
        409,
        "This actionId was already used with a different operator or recipient. Use a new actionId for a new dispatch."
      );
    }
    if (reservation.outcome === "limit_reached") {
      throw new HttpStatusError(429, "Launch test dispatch limit reached. Try again tomorrow.");
    }
    if (reservation.outcome === "existing") {
      const claim = reservation.claim;
      if (claim.state === "settled" && claim.outcomeMode === "failed") {
        res.status(502).json({
          ok: false,
          replayed: true,
          actionId,
          recipientEmail: claim.recipientEmail,
          error: claim.outcomeWarning ?? "Launch test dispatch failed."
        });
        return;
      }
      if (claim.state === "settled") {
        // Replay the recorded outcome; never dispatch twice for one action.
        res.json({
          ok: true,
          replayed: true,
          actionId,
          recipientEmail: claim.recipientEmail,
          mode: claim.outcomeMode,
          provider: claim.outcomeProvider,
          providerMessageId: claim.outcomeProviderMessageId,
          warning: claim.outcomeWarning
        });
        return;
      }
      // "reserved" (dispatch in progress) or "uncertain" (dispatch began
      // but its outcome is unknown): block automatic redispatch.
      throw new HttpStatusError(
        409,
        "This launch test action is already in progress or its outcome is uncertain. Reconcile it before dispatching again."
      );
    }

    let result: Awaited<ReturnType<typeof sendLaunchTestEmail>>;
    try {
      result = await sendLaunchTestEmail({
        recipientEmail,
        appBaseUrl: process.env.APP_BASE_URL,
        idempotencyKey: buildLaunchTestIdempotencyKey(actionId)
      });
    } catch (error) {
      // A definitive provider rejection proves no email was accepted, so
      // the claim settles as failed; any other failure leaves the outcome
      // uncertain and the claim blocks blind retry.
      const message = error instanceof Error ? error.message : "Launch test dispatch failed.";
      await recordLaunchTestClaimOutcome({
        actionId,
        state: isDefinitiveProviderRejection(error) ? "settled" : "uncertain",
        outcomeMode: isDefinitiveProviderRejection(error) ? "failed" : undefined,
        outcomeWarning: message
      }).catch(() => undefined);
      throw error;
    }
    await recordLaunchTestClaimOutcome({
      actionId,
      state: "settled",
      outcomeMode: result.mode === "provider" ? "provider" : "record_only",
      outcomeProvider: result.provider,
      outcomeProviderMessageId: result.providerMessageId ?? null,
      outcomeWarning: result.warning ?? null
    }).catch(() => undefined);
    res.json({
      ok: true,
      actionId,
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
    // SEC-02: diagnostics report the configured origin only; when it is
    // missing/invalid they report non-readiness without constructing a
    // request-derived fallback and without failing the whole report.
    const publicBaseUrl = resolveConfiguredPublicBaseUrl();
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
        needsFollowUp: hasUnresolvedNumericBillingFollowUp({
          openDecisions: result.openDecisions,
          qualityGate: result.qualityGate
        }),
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

app.post(
  "/api/invoices/extract-notes",
  requireProviderDispatchSession,
  imageUpload.single("invoiceFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new Error("Upload an image file first.");
      }
      await reserveProviderDispatchUsage(res, "ocr");
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
  }
);

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
  requireProviderDispatchSession,
  importUpload.single("audioFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new Error("Upload an audio note first.");
      }
      await reserveProviderDispatchUsage(res, "transcription");
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
      needsFollowUp: hasUnresolvedNumericBillingFollowUp({
        openDecisions: result.openDecisions,
        qualityGate: result.qualityGate
      }),
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
      needsFollowUp: hasUnresolvedNumericBillingFollowUp({
        openDecisions: result.openDecisions,
        qualityGate: result.qualityGate
      }),
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

    // Payment-link state and provider payment records are server-owned:
    // the store merges them against the freshly stored invoice inside its
    // serialization (see saveInvoiceDocument), and a monetary edit made by
    // this save invalidates outstanding links there — a link issued for
    // amount X can never settle amount Y, and a save can never overwrite a
    // settlement that landed after the client's snapshot was taken.
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
        ),
        // §C: an explicit owner resend (the library's resend action)
        // establishes a NEW logical send under a resend occurrence
        // identity. A bare repeat of this request is a retry of the
        // original operation and replays its recorded outcome instead.
        intent: z.enum(["resend"]).optional(),
        // §C (conformance Q7): the durable identity of the one
        // deliberate resend action this request belongs to. Transport
        // retries of the same action carry the same id and replay the
        // claim that action established; only a new id establishes a
        // new logical send. REQUIRED for resend intent — enforced
        // immediately below (Q7.1): without an identity, a repeated
        // "resend" is indistinguishable from a duplicate of an
        // earlier resend, and occurrence-minting each repeat
        // dispatched a fresh provider send.
        resendActionId: z.string().trim().min(1).max(128).optional()
      })
      .parse(req.body ?? {});
    // Q7.1: the identity check runs before any claim is reserved or
    // anything is dispatched. The shipped library client always
    // mints and sends an action id, so this refuses only requests
    // that could never be replayed safely. Initial sends and bare
    // retries carry no resend intent and are untouched.
    if (parsedRequest.intent === "resend" && !parsedRequest.resendActionId) {
      throw new HttpStatusError(
        400,
        "This resend is missing its action identity, so it cannot be sent safely. Reload the invoice and try the resend again."
      );
    }
    const ownerId = getRequestOwnerId(req);
    const existingInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (existingInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before sending.");
    }
    // Slice 0 (design invariant 1): paid invoices are rejected from the
    // ordinary send path — a send must never act on a settled invoice.
    if (existingInvoice.status === "paid") {
      throw new HttpStatusError(400, "This invoice is already paid.");
    }
    if (
      invoiceSendIsBlocked({
        finishedInvoice: existingInvoice.invoiceData.finishedInvoice,
        sourceNote: existingInvoice.invoiceData.sourceNote
      })
    ) {
      throw new HttpStatusError(400, SEND_BLOCKED_MESSAGE);
    }
    const invoiceWithPaymentLink = await ensureSavedInvoicePaymentLink({
      ownerId,
      invoice: existingInvoice,
      baseUrl: resolvePublicBaseUrl(req)
    });

    // Slice 0 (§C): reserve the durable claim for this logical send
    // BEFORE dispatch. The claim key binds invoice, recipient, purpose,
    // and the monetary revision of the prepared content; the provider
    // idempotency key derives from it deterministically.
    const recipientEmail = parsedRequest.recipientEmail;
    const authorizedRevision = invoiceWithPaymentLink.invoiceData.finishedInvoice.monetaryRevision;
    // Q7: a resend request bearing an action identity first resolves
    // the claim that action already established, if any. A retry of
    // the same action (e.g. its acceptance persisted but the HTTP
    // response was lost) replays that claim — it never mints the next
    // resend occurrence. The identity binds the action's recipient
    // and authorized revision: a request whose recipient or revision
    // differs from the bound claim is not that action's retry and
    // falls through to the ordinary flow.
    let resendActionReplayed = false;
    let reservation: Awaited<ReturnType<typeof reserveInvoiceDeliveryClaim>> | null = null;
    if (parsedRequest.intent === "resend" && parsedRequest.resendActionId) {
      const actionClaim = await getInvoiceDeliveryClaimByResendAction({
        ownerId,
        invoiceId,
        resendActionId: parsedRequest.resendActionId
      });
      if (
        actionClaim &&
        actionClaim.recipientEmail === recipientEmail &&
        actionClaim.authorizedRevision === authorizedRevision
      ) {
        resendActionReplayed = true;
        if (actionClaim.status === "reserved" || actionClaim.status === "dispatching") {
          reservation = { outcome: "blocked", reason: "send_in_progress", claim: actionClaim };
        } else if (actionClaim.status === "blocked_unknown") {
          reservation = { outcome: "blocked", reason: "unresolved_send", claim: actionClaim };
        } else {
          reservation = { outcome: "existing", claim: actionClaim };
        }
      }
    }
    if (!reservation) {
      reservation = await reserveInvoiceDeliveryClaim({
        ownerId,
        invoiceId,
        recipientEmail,
        basePurpose: "initial_send",
        purpose: "initial_send",
        authorizedRevision,
        // A resend action that establishes the initial claim (the
        // invoice had no resolved send yet) binds its identity to
        // that claim too, so its retries replay instead of minting.
        resendActionId:
          parsedRequest.intent === "resend" ? parsedRequest.resendActionId : undefined,
        // A bare retry's replay-vs-mint decision is made inside the
        // reservation mutation (§C/§D): when the initial claim
        // resolved without counting, the mutation itself resolves the
        // counted recovery to replay or mints the recovery occurrence
        // — never from a read taken before it, which two overlapping
        // bare retries could both observe as "no recovery yet".
        bareRetry: parsedRequest.intent !== "resend"
      });
      // Q7: the reservation resolves the action identity atomically,
      // inside the store's mutation boundary. When it returns the
      // claim this request's action already established — the
      // pre-reservation lookup above raced a concurrent identical
      // request and observed nothing — this request is that action's
      // replay, exactly as if the lookup had found the claim.
      if (
        reservation.outcome === "existing" &&
        parsedRequest.intent === "resend" &&
        parsedRequest.resendActionId &&
        reservation.claim.resendActionId === parsedRequest.resendActionId
      ) {
        resendActionReplayed = true;
      }
    }
    if (reservation.outcome === "existing" && !resendActionReplayed && parsedRequest.intent === "resend") {
      // The claim for this (recipient, revision) already resolved. A
      // resolution counts as a send only when the provider accepted
      // (§D): failed / cancelled / owner-released claims — and
      // record_only recordings, which §D says create no send outcome
      // at all — never block a fresh logical attempt. Only an
      // explicit owner resend (intent: "resend") establishes a new
      // logical send, so this walk runs for resend intent only: the
      // fresh attempt takes the next resend occurrence (§C), walking
      // past any resend identities that already resolved too. When
      // the fresh claim belongs to a resend action, the action's
      // durable identity is stamped on it so the action's own
      // retries replay it (Q7).
      //
      // A bare retry never walks: its reservation above already
      // resolved replay-vs-mint atomically inside the store mutation
      // (the counted recovery to replay, or the recovery occurrence
      // to dispatch, is the reservation's claim by now). Resolving
      // that decision from reads taken here — the counted-recovery
      // lookup and the occurrence count — let two overlapping bare
      // retries both observe "no recovery yet" and dispatch a
      // duplicate recovery.
      let resendNumber =
        (await countInvoiceDeliveryClaims({ ownerId, invoiceId, basePurpose: "resend" })) + 1;
      for (;;) {
        const attempt = await reserveInvoiceDeliveryClaim({
          ownerId,
          invoiceId,
          recipientEmail,
          basePurpose: "resend",
          purpose: `resend_${resendNumber}`,
          authorizedRevision,
          resendActionId: parsedRequest.resendActionId
        });
        if (attempt.outcome !== "existing") {
          reservation = attempt;
          break;
        }
        // Q7: the reservation resolved this request's action
        // identity atomically and returned the claim the action
        // already established (a concurrent identical request won
        // the race while this one walked occurrences). This
        // request is that action's replay — it must not walk on
        // to the next occurrence and dispatch again.
        if (
          parsedRequest.resendActionId &&
          attempt.claim.resendActionId === parsedRequest.resendActionId
        ) {
          reservation = attempt;
          resendActionReplayed = true;
          break;
        }
        resendNumber += 1;
      }
    }
    if (reservation.outcome === "blocked") {
      // Structured 409 rather than the bare error shape: the owner
      // release endpoint is addressed by claim ID, so the response
      // must name the blocking claim — otherwise the recovery the
      // message asks for cannot be performed from any owner-facing
      // surface. The delivery summary exposes the same claim as
      // delivery.blockingClaim. The `error` message text is unchanged.
      res.status(409).json({
        error:
          reservation.reason === "unresolved_send"
            ? "This invoice has an unresolved delivery attempt. Reconcile or release it before sending again."
            : "A send for this invoice is already in progress.",
        blockingClaim: {
          claimId: reservation.claim.claimId,
          reason: reservation.reason
        }
      });
      return;
    }
    const claim: DeliveryClaim = reservation.claim;
    if (reservation.outcome === "existing") {
      // Replay the RECORDED outcome — including failure. A claim the
      // provider definitively rejected resolves this request as the
      // failure it was: the original attempt answered with an HTTP
      // error, and a transport retry of that action (the library
      // retains the action identity precisely because no answer
      // arrived) must not be told the send succeeded. Falling through
      // to the success shape below made it report "Invoice re-sent"
      // for an email that was never accepted.
      if (claim.outcomeKind === "failed") {
        res.status(400).json({
          error:
            "The email provider rejected this send, so no email was delivered. Fix the problem and try sending again."
        });
        return;
      }
      // Q7.2: a claim the owner RELEASED without acceptance (the
      // UNKNOWN case) replays with its recorded disposition —
      // released, not accepted — never with the success shape below,
      // which made the library present "Invoice re-sent" for an
      // action that dispatched nothing and was never accepted. The
      // 409 tells the client this action is closed; a genuinely new
      // resend carries a new action identity and dispatches through
      // the ordinary flow, never reaching this branch.
      if (
        claim.status === "released" &&
        claim.outcomeKind !== "accepted" &&
        claim.outcomeKind !== "delivered"
      ) {
        res.status(409).json({
          error:
            "This resend was released without a verified acceptance, so it counts as not sent. Start a new resend to send the invoice again.",
          claimId: claim.claimId
        });
        return;
      }
      // Crash-window recovery (Slice 0 design: recovery retries the
      // guarded completion from a persisted successful outcome). If
      // the resolved claim is a provider acceptance whose guarded
      // status completion never landed — the process stopped, or the
      // invoice-store write failed, after the outcome was persisted —
      // replay the completion now, from the claim's authorized
      // revision. completeInvoiceDelivery is itself guarded (fresh
      // draft → sent only, at that revision; paid/deleted preserved),
      // and no email is dispatched.
      if (
        claim.mode === "provider" &&
        (claim.outcomeKind === "accepted" || claim.outcomeKind === "delivered")
      ) {
        await savedInvoiceRepository.completeInvoiceDelivery({
          invoiceId,
          ownerId,
          authorizedRevision: claim.authorizedRevision
        });
      }
      // Idempotent replay: this logical send already resolved. Return
      // its recorded outcome and fresh state — never dispatch twice.
      const invoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
      const delivery = await getInvoiceDeliverySummary({ ownerId, invoiceId });
      if (!delivery) {
        throw new HttpStatusError(500, "Delivery summary missing after send.");
      }
      res.json({
        invoice,
        delivery,
        mode: claim.mode ?? "record_only",
        provider: claim.provider ?? "none",
        warning:
          claim.mode === "record_only"
            ? "Email provider is not configured; delivery is tracked without sending."
            : null
      });
      return;
    }

    // Fresh authorization immediately before dispatch (invariant 1):
    // reread under the repository's serialization and require the
    // invoice to still be sendable at exactly the authorized revision.
    // The dispatched content is the fresh record, so what is sent is
    // what was authorized.
    const freshInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    const freshEligible =
      (freshInvoice.status === "draft" || freshInvoice.status === "sent") &&
      freshInvoice.invoiceData.finishedInvoice.monetaryRevision === authorizedRevision;
    if (!freshEligible) {
      await cancelInvoiceDeliveryClaim({
        ownerId,
        claimId: claim.claimId,
        generation: claim.generation,
        reason: "stale_authorization"
      }).catch(() => undefined);
      throw new HttpStatusError(
        409,
        "This invoice changed before the email could be sent. Review the invoice and try again."
      );
    }

    const trackingToken = randomUUID();
    await beginInvoiceDeliveryDispatch({
      ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      trackingToken
    });
    const openTrackingPixelUrl = `${resolvePublicBaseUrl(req)}/api/invoices/${invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
    let sendResult;
    try {
      sendResult = await sendInvoiceEmail({
        recipientEmail,
        invoice: freshInvoice.invoiceData.finishedInvoice,
        invoiceId,
        openTrackingPixelUrl,
        idempotencyKey: claim.providerIdempotencyKey
      });
    } catch (error) {
      // §D outcome taxonomy: a definitive provider rejection (the
      // provider answered and refused the submission) is FAILED — it
      // releases the ambiguity block so the owner can correct the
      // problem and retry. Any other throw leaves acceptance
      // unprovable: UNKNOWN, and the claim blocks further sends until
      // it is reconciled or released by the owner — never a blind
      // retry.
      const rejection = isDefinitiveProviderRejection(error) ? error : null;
      await recordInvoiceDeliveryClaimOutcome({
        ownerId,
        claimId: claim.claimId,
        generation: claim.generation,
        outcome: rejection ? "failed" : "unknown",
        mode: "provider",
        provider: rejection ? rejection.provider : "none"
      }).catch(() => undefined);
      throw error;
    }

    // The outcome event is appended BEFORE the guarded status
    // transition, so delivery evidence never depends on the transition.
    await recordInvoiceDeliveryClaimOutcome({
      ownerId,
      claimId: claim.claimId,
      generation: claim.generation,
      outcome: sendResult.mode === "provider" ? "accepted" : "recorded",
      mode: sendResult.mode,
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId
    });

    // Guarded completion against fresh state (invariants 3, 4, 6):
    // only ACCEPTED completes, and only draft → sent; a payment that
    // landed mid-flight is preserved exactly. record_only completes
    // nothing and returns the fresh record untouched.
    const invoice =
      sendResult.mode === "provider"
        ? (
            await savedInvoiceRepository.completeInvoiceDelivery({
              invoiceId,
              ownerId,
              authorizedRevision
            })
          ).invoice
        : await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    const delivery = await getInvoiceDeliverySummary({ ownerId, invoiceId });
    if (!delivery) {
      throw new HttpStatusError(500, "Delivery summary missing after send.");
    }
    if (sendResult.mode === "provider") {
      await trackRevenueSignalSafely({
        event: "invoice_sent",
        ownerId,
        source: "invoice_send"
      });
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
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before creating a payment link.");
    }
    if (savedInvoice.invoiceData.finishedInvoice.documentType === "estimate") {
      throw new HttpStatusError(400, "Convert this estimate into an invoice before creating a payment link.");
    }
    if (!getStripeBillingCapabilities().invoicePaymentAvailable) {
      throw new HttpStatusError(400, "Stripe invoice payments are not configured yet.");
    }
    if (
      invoiceSendIsBlocked({
        finishedInvoice: savedInvoice.invoiceData.finishedInvoice,
        sourceNote: savedInvoice.invoiceData.sourceNote
      })
    ) {
      throw new HttpStatusError(400, PAYMENT_LINK_BLOCKED_MESSAGE);
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
    // Slice 0 (invariant 8): a record_only reminder is not a sent
    // reminder and fires no revenue success signal.
    if (reminder.mode === "provider") {
      await trackRevenueSignalSafely({
        event: "reminder_sent",
        ownerId,
        source: "send_reminder"
      });
    }
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

app.post(
  "/api/invoices/:id/reminders/confirm-schedule",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoiceId = z.string().uuid().parse(req.params.id);
      const parsedRequest = z
        .object({
          nextDueAt: z.string().datetime().optional()
        })
        .default({})
        .parse(req.body ?? {});
      const ownerId = getRequestOwnerId(req);
      // §B gate REMINDER_HISTORY_RESTART_ENABLED (F1): the restart
      // control is server-owned and ships in its approved (enabled)
      // state per David's 2026-10-23 sign-off. While disabled, the
      // endpoint refuses outright — no anchor, no send evidence.
      if (!isReminderHistoryRestartEnabled()) {
        throw new HttpStatusError(
          403,
          "Reminder restart is disabled on this server (REMINDER_HISTORY_RESTART_ENABLED). No schedule was recorded."
        );
      }
      // §E: explicit owner confirmation restarts reminder scheduling
      // for THIS invoice only. It records eligibility, not a send: it
      // creates no delivery event, no send count, and no timing claim.
      const invoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
      if (invoice.status === "deleted" || invoice.status === "paid") {
        throw new HttpStatusError(400, "Reminders can only be scheduled for open invoices.");
      }
      const settings = resolveInvoiceReminderSettings();
      const now = new Date();
      const anchor = await setInvoiceReminderAnchor({
        ownerId,
        invoiceId,
        activatedAt: now.toISOString(),
        nextDueAt:
          parsedRequest.nextDueAt ?? new Date(now.getTime() + settings.dueAfterDays * 24 * 60 * 60 * 1000).toISOString()
      });
      res.json({ anchor });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/invoices/:id/delivery/claims/:claimId/release",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoiceId = z.string().uuid().parse(req.params.id);
      const claimId = z.string().min(1).parse(req.params.claimId);
      const parsedRequest = z
        .object({
          reason: z.string().trim().min(1).max(500)
        })
        .parse(req.body ?? {});
      const ownerId = getRequestOwnerId(req);
      // §C owner release of an unresolved claim (UNKNOWN outcome,
      // lease-expired dispatching, an abandoned reservation whose
      // lease expired before dispatch began, or an ACCEPTED send
      // whose final delivery/failure resolution has not been recorded
      // — §D): recorded durably with actor/time/reason. It fabricates
      // no acceptance — it only permits a future logical send under a
      // fresh claim, and an accepted claim's count/timestamp stand.
      const existingClaim = await getInvoiceDeliveryClaimById({ ownerId, claimId });
      if (!existingClaim || existingClaim.invoiceId !== invoiceId) {
        throw new HttpStatusError(404, "Delivery claim was not found for this invoice.");
      }
      const claim = await releaseInvoiceDeliveryClaim({
        ownerId,
        claimId,
        actor: ownerId,
        reason: parsedRequest.reason
      });
      res.json({ claim });
    } catch (error) {
      next(error);
    }
  }
);

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
    if (parsedRequest.status === "sent" || parsedRequest.status === "paid") {
      const existingInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
      if (
        invoiceSendIsBlocked({
          finishedInvoice: existingInvoice.invoiceData.finishedInvoice,
          sourceNote: existingInvoice.invoiceData.sourceNote
        })
      ) {
        throw new HttpStatusError(400, SEND_BLOCKED_MESSAGE);
      }
    }
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

// SEC-02 (S52-5 / S54-4): the public origin is configuration-only.
// Request data — Host, X-Forwarded-Proto, X-Forwarded-Protocol — can
// never influence it, so an attacker who controls those headers cannot
// poison emailed sign-in links, portal links, billing return URLs, or
// tracking URLs. A valid APP_BASE_URL is an absolute HTTPS URL (or an
// explicitly configured HTTP loopback origin for local development),
// without embedded credentials, canonicalized to its origin. When no
// valid origin is configured, callers that would build a URL fail
// closed instead of inventing one from the request.
function validatePublicBaseUrl(value: string | undefined): string | null {
  const normalized = asOptionalString(value);
  if (!normalized) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (_error) {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  const isHttps = parsed.protocol === "https:";
  const isLoopbackHttp = parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
  if (!isHttps && !isLoopbackHttp) {
    return null;
  }
  if (!parsed.origin || parsed.origin === "null") {
    return null;
  }
  return parsed.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function resolveConfiguredPublicBaseUrl(): string | null {
  return validatePublicBaseUrl(process.env.APP_BASE_URL);
}

function resolvePublicBaseUrl(_req: Request): string {
  const configured = resolveConfiguredPublicBaseUrl();
  if (!configured) {
    throw new HttpStatusError(
      503,
      "Application base URL is not configured. Set APP_BASE_URL to the public application origin."
    );
  }
  return configured;
}

function isConfiguredPublicBaseUrl(value: string | undefined): boolean {
  return validatePublicBaseUrl(value) !== null;
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

// SEC-04 (S52-5 / S54-4): paid provider dispatch (OCR, transcription)
// requires a validated session in every environment — including
// development auth-disabled mode — and a usage reservation before the
// provider is called. The session check runs as route middleware BEFORE
// the Multer upload middleware, and the usage principal comes only from
// the validated session, never from caller-selected owner headers or
// query parameters (getRequestOwnerId is not sufficient here).
function requireProviderDispatchSession(req: Request, res: Response, next: NextFunction): void {
  const session = getAuthSessionFromRequest(req);
  if (!session?.userId) {
    next(new HttpStatusError(401, "Authentication required."));
    return;
  }
  res.locals.providerDispatchSession = session;
  next();
}

async function reserveProviderDispatchUsage(
  res: Response,
  operationClass: "ocr" | "transcription"
): Promise<void> {
  const session = res.locals.providerDispatchSession as InvoiceAuthSession | undefined;
  if (!session?.userId) {
    throw new HttpStatusError(401, "Authentication required.");
  }
  let reservation: Awaited<ReturnType<typeof reserveProviderUsage>>;
  try {
    reservation = await reserveProviderUsage({ operationClass, principalId: session.userId });
  } catch (_error) {
    // Enforcement unavailable: fail closed, no provider call.
    throw new HttpStatusError(503, "Extraction is unavailable right now.");
  }
  if (!reservation.admitted) {
    throw new HttpStatusError(429, "Extraction usage limit reached. Please try again later.");
  }
}

// SEC-05: operator authorization for launch-test dispatch is a
// server-controlled allowlist of session user IDs
// (INVOICE_LAUNCH_TEST_OPERATOR_USER_IDS, comma-separated), empty by
// default — when it is empty, no signed-in user is an operator.
const LAUNCH_TEST_ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function isLaunchTestOperator(session: InvoiceAuthSession | null): boolean {
  if (!session?.userId) {
    return false;
  }
  const configured = (process.env.INVOICE_LAUNCH_TEST_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(session.userId);
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
  const finishedInvoice = input.invoice.invoiceData.finishedInvoice;
  if (finishedInvoice.documentType === "estimate") {
    return input.invoice;
  }
  // Reuse an existing link only while it is verifiably bound to the current
  // balance, currency, and monetary revision. A stored URL on its own is no
  // longer proof that the link still collects the right amount. Links minted
  // before link records existed keep the legacy reuse behaviour and settle
  // through the legacy exact-amount binding.
  if (
    finishedInvoice.paymentLinkUrl?.trim() &&
    ((hasLegacyPaymentLink(finishedInvoice) &&
      getExactCollectibleBalanceMinor(finishedInvoice) !== null) ||
      findReusablePaymentLink(finishedInvoice))
  ) {
    return input.invoice;
  }
  const capabilities = getStripeBillingCapabilities();
  if (!capabilities.invoicePaymentAvailable) {
    return input.invoice;
  }
  const total = Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0);
  // Stripe still refuses a $0 payment link. Explicit free invoices may send without one.
  if (!Number.isFinite(total) || total <= 0) {
    return input.invoice;
  }
  // Non-refresh requests converge: if a concurrent request installs a
  // reusable link while this one is minting, the persist step returns
  // that link instead of superseding it (fix round 10).
  return createAndPersistSavedInvoicePaymentLink({ ...input, reuseConcurrentLink: true });
}

/** Thrown inside the link-persist transform when the invoice's money moved
 * after the Stripe link was minted (concurrent edit, payment, or
 * settlement): the minted link collects a now-wrong amount, so it must not
 * be installed. The caller retries once against fresh state. */
class PaymentLinkStateChangedError extends Error {
  constructor() {
    super("Invoice monetary state changed while creating a payment link.");
    this.name = "PaymentLinkStateChangedError";
  }
}

async function createAndPersistSavedInvoicePaymentLink(input: {
  ownerId: string;
  invoice: Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>;
  baseUrl: string;
  /** Non-refresh requests only: when the persist transform finds a
   * reusable link already installed (a concurrent request won the
   * race), return that link instead of superseding it with the one
   * minted here. An explicit refresh always installs its new link. */
  reuseConcurrentLink?: boolean;
}) {
  // The Stripe call cannot run inside the store's serialization, so the
  // flow is: read current state, mint at Stripe, then persist through a
  // fresh-state transform that refuses to install the link if the money
  // moved in between. A refused link is orphaned at Stripe (harmless: a
  // payment on it binds to no local record and lands as unmatched), and
  // creation retries once against the fresh state.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const currentInvoice =
      attempt === 0
        ? input.invoice
        : await savedInvoiceRepository.getSavedInvoiceById(input.invoice.invoiceId, input.ownerId);
    const finishedInvoice = currentInvoice.invoiceData.finishedInvoice;
    if (finishedInvoice.documentType === "estimate") {
      throw new HttpStatusError(400, "Convert this estimate into an invoice before creating a payment link.");
    }
    const total = Number(finishedInvoice.balanceDue ?? finishedInvoice.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      if (attempt > 0) {
        // A concurrent settlement/payment zeroed the balance between
        // attempts: there is nothing left to collect.
        return currentInvoice;
      }
      throw new HttpStatusError(400, "Invoice total must be greater than 0 before creating a payment link.");
    }
    // The link may only be minted for an exactly collectible balance
    // (fix round 11): the total and every payment record must have
    // exact minor-unit forms and the record-derived balance must
    // equal the stored balance — the same arithmetic settlement's
    // exact paid test performs. Validating only the balance was not
    // enough: a fractional-cent edit can leave an exact preserved
    // balance under a non-representable total, and a link minted
    // against that balance collects money settlement then rejects as
    // non_representable_total.
    const amountMinor = getExactCollectibleBalanceMinor(finishedInvoice);
    if (amountMinor === null) {
      if (toAmountMinorExact(total) === null) {
        throw new HttpStatusError(
          400,
          "Invoice balance includes fractions of a cent and cannot be collected exactly. Adjust the invoice total before creating a payment link."
        );
      }
      throw new HttpStatusError(
        400,
        "This invoice's total or existing payments are not exact to the cent, so a payment link cannot be created safely."
      );
    }

    const nowIso = new Date().toISOString();
    const paymentLinkRecordId = randomUUID();
    const mintedRevision = finishedInvoice.monetaryRevision ?? 0;
    const mintedCurrency = normalizeMoneyCurrency(finishedInvoice.currency);
    const paymentLink = await createStripeInvoicePaymentLink({
      invoiceId: input.invoice.invoiceId,
      ownerId: input.ownerId,
      baseUrl: input.baseUrl,
      invoiceNumber: finishedInvoice.invoiceNumber,
      customerName: finishedInvoice.customerName,
      total,
      currency: finishedInvoice.currency,
      paymentLinkRecordId,
      amountMinor
    });

    try {
      // The new link supersedes every previously active link; the record is
      // the durable binding a later settlement is verified against. The
      // transform runs on the freshly stored invoice, so a concurrent edit
      // or settlement is preserved rather than overwritten.
      return await savedInvoiceRepository.mutateSavedInvoice({
        invoiceId: input.invoice.invoiceId,
        ownerId: input.ownerId,
        mutate: (fresh) => {
          const freshFinished = fresh.invoiceData.finishedInvoice;
          if (input.reuseConcurrentLink && findReusablePaymentLink(freshFinished)) {
            // A concurrent non-refresh request installed a link bound
            // to the current money while this request was minting.
            // Reuse it: installing the link minted here would
            // supersede the one the other caller already returned,
            // and a payment on that superseded URL would land
            // unmatched (fix round 10). The link minted here is
            // orphaned at Stripe — a payment on it binds to no local
            // record and is captured as unmatched, never applied.
            return fresh;
          }
          // The fresh state must still be exactly collectible for the
          // amount minted (fix round 11): a concurrent edit that made
          // the total or records non-representable — or moved the
          // record-derived balance away from the stored balance —
          // aborts the install exactly like a moved amount does, and
          // the retry surfaces the precise refusal.
          const freshAmountMinor = getExactCollectibleBalanceMinor(freshFinished);
          if (
            freshFinished.documentType === "estimate" ||
            freshAmountMinor !== amountMinor ||
            normalizeMoneyCurrency(freshFinished.currency) !== mintedCurrency ||
            (freshFinished.monetaryRevision ?? 0) !== mintedRevision
          ) {
            throw new PaymentLinkStateChangedError();
          }
          const superseded = supersedeActivePaymentLinks(freshFinished, nowIso);
          return {
            ...fresh,
            invoiceData: {
              ...fresh.invoiceData,
              finishedInvoice: {
                ...superseded,
                paymentLinkUrl: paymentLink.url,
                paymentLinks: [
                  ...(superseded.paymentLinks ?? []),
                  {
                    id: paymentLinkRecordId,
                    provider: "stripe" as const,
                    providerPaymentLinkId: paymentLink.paymentLinkId,
                    amountMinor,
                    currency: mintedCurrency.toUpperCase(),
                    invoiceRevision: mintedRevision,
                    status: "active" as const,
                    createdAt: nowIso
                  }
                ]
              }
            }
          };
        }
      });
    } catch (error) {
      if (error instanceof PaymentLinkStateChangedError) {
        continue;
      }
      throw error;
    }
  }
  throw new HttpStatusError(409, "Invoice changed while creating a payment link. Please retry.");
}

/**
 * The stable total a record/remove payment mutation anchors its
 * balance recompute to, in major units — or null when the stored
 * state cannot anchor exactly (fix round 12). An invoice carrying a
 * total anchors to it. A total-less (legacy) invoice anchors to the
 * gross reconstructed from the fresh stored state — stored balance
 * plus all stored payment records, the save path's exact
 * reconstruction — and the mutation persists that value as the
 * invoice's total, so no later writer can mistake the shrinking
 * balance for the gross. Before this round these writers fell back
 * to `total ?? balanceDue`: recording $40 then $20 on a total-less
 * $100 invoice subtracted both records from the already-reduced $60
 * balance and landed at $0/paid, and removing a record restored
 * nothing. When reconstruction has no exact minor-unit form the
 * mutation fails closed, exactly as it does for a non-representable
 * stored total.
 */
function stableTotalForPaymentMutation(
  currentInvoice: SavedInvoice["invoiceData"]["finishedInvoice"]
): number | null {
  if (currentInvoice.total != null) {
    return Number(currentInvoice.total);
  }
  const reconstructedGrossMinor = reconstructGrossTotalMinor(currentInvoice);
  return reconstructedGrossMinor === null ? null : reconstructedGrossMinor / 100;
}

async function recordSavedInvoicePayment(input: {
  invoiceId: string;
  ownerId: string;
  amount: number;
  paidAt?: string;
  note?: string;
}): Promise<SavedInvoice> {
  // The whole read-modify-write — including the status transition — runs
  // as one fresh-state transform inside the store's serialization: the
  // balance is recomputed from the current stored invoice and the status
  // is decided from that same fresh state in the same mutation, so a
  // settlement or removal landing concurrently can never be overwritten
  // by a status computed from a stale balance in a separate call.
  //
  // Exact minor-unit accounting, mirroring provider settlement: the
  // payment amount must be exactly representable in minor units and must
  // not exceed the balance due, and "paid" requires a post-payment
  // balance of exactly zero. A fractional-cent amount or an overpayment
  // is refused with a 400 (nothing is recorded) rather than rounded or
  // clamped into paid — the manual-path analogue of settlement capturing
  // an unbindable payment as unmatched instead of applying it.
  return savedInvoiceRepository.mutateSavedInvoice({
    invoiceId: input.invoiceId,
    ownerId: input.ownerId,
    mutate: (current) => {
      if (current.status === "deleted") {
        throw new HttpStatusError(400, "Restore this invoice before recording a payment.");
      }
      const currentInvoice = current.invoiceData.finishedInvoice;
      if (currentInvoice.documentType === "estimate") {
        throw new HttpStatusError(400, "Convert this estimate into an invoice before recording payment.");
      }
      if (toAmountMinorExact(input.amount) === null) {
        throw new HttpStatusError(400, "Payment amount must be exact to the cent.");
      }
      const nextPaymentRecords = [
        ...(currentInvoice.paymentRecords ?? []),
        {
          id: randomUUID(),
          amount: input.amount,
          paidAt: input.paidAt?.trim() || new Date().toISOString().slice(0, 10),
          note: input.note?.trim() || undefined
        }
      ];
      const invoiceTotal = stableTotalForPaymentMutation(currentInvoice);
      if (invoiceTotal === null) {
        throw new HttpStatusError(
          400,
          "This invoice's total or existing payments are not exact to the cent, so a payment cannot be recorded safely."
        );
      }
      const nextBalanceMinor = calculateInvoiceBalanceMinor(invoiceTotal, nextPaymentRecords);
      if (nextBalanceMinor === null) {
        throw new HttpStatusError(
          400,
          "This invoice's total or existing payments are not exact to the cent, so a payment cannot be recorded safely."
        );
      }
      if (nextBalanceMinor < 0) {
        throw new HttpStatusError(400, "Payment exceeds the balance due on this invoice.");
      }
      // Fail-closed: refuse draft→sent via partial payment when send is blocked.
      // Full payment (→paid) is allowed even on a messy draft.
      if (
        current.status === "draft" &&
        nextBalanceMinor > 0 &&
        invoiceSendIsBlocked({
          finishedInvoice: currentInvoice,
          sourceNote: current.invoiceData.sourceNote
        })
      ) {
        throw new HttpStatusError(400, SEND_BLOCKED_MESSAGE);
      }
      const nextStatus: SavedInvoice["status"] =
        nextBalanceMinor === 0
          ? "paid"
          : current.status === "draft" || current.status === "paid"
            ? "sent"
            : current.status;
      return {
        ...current,
        status: nextStatus,
        invoiceData: {
          ...current.invoiceData,
          // A manual payment changes the balance, so any outstanding payment
          // link now collects the wrong amount and is invalidated with the edit.
          finishedInvoice: invalidateLinksForBalanceChange(
            {
              ...currentInvoice,
              // Persist the stable total the recompute anchored to
              // (fix round 12): for a total-less legacy invoice this
              // materializes the reconstructed gross; for one already
              // carrying a total it restates the same value.
              total: invoiceTotal,
              balanceDue: nextBalanceMinor / 100,
              paymentRecords: nextPaymentRecords
            },
            new Date().toISOString()
          )
        }
      };
    }
  });
}

async function removeSavedInvoicePayment(input: {
  invoiceId: string;
  ownerId: string;
  paymentId: string;
}): Promise<SavedInvoice> {
  // Same fresh-state discipline as record-payment: the removal, the exact
  // balance recompute, the send-blocked check, AND the status transition
  // all run against the current stored invoice inside the store's
  // serialization — the status is decided in the same mutation from
  // fresh state, never in a separate call computed from an earlier
  // mutation's balance. Removing a provider-evidence record is refused —
  // settlement evidence is removed only through reconciliation, never by
  // editing it away.
  return savedInvoiceRepository.mutateSavedInvoice({
    invoiceId: input.invoiceId,
    ownerId: input.ownerId,
    mutate: (current) => {
      if (current.status === "deleted") {
        throw new HttpStatusError(400, "Restore this invoice before editing payments.");
      }
      const currentInvoice = current.invoiceData.finishedInvoice;
      const target = (currentInvoice.paymentRecords ?? []).find((payment) => payment.id === input.paymentId);
      if (!target) {
        throw new HttpStatusError(404, "Payment record not found.");
      }
      if (target.providerPaymentIntentId) {
        throw new HttpStatusError(
          400,
          "Provider payment records are settlement evidence and cannot be removed here."
        );
      }
      const nextPaymentRecords = (currentInvoice.paymentRecords ?? []).filter(
        (payment) => payment.id !== input.paymentId
      );
      const invoiceTotal = stableTotalForPaymentMutation(currentInvoice);
      if (invoiceTotal === null) {
        throw new HttpStatusError(
          400,
          "This invoice's total or remaining payments are not exact to the cent, so the balance cannot be recomputed safely."
        );
      }
      const nextBalanceMinor = calculateInvoiceBalanceMinor(invoiceTotal, nextPaymentRecords);
      if (nextBalanceMinor === null) {
        throw new HttpStatusError(
          400,
          "This invoice's total or remaining payments are not exact to the cent, so the balance cannot be recomputed safely."
        );
      }
      // Fail-closed: refuse paid→sent via remove-payment when send is blocked.
      if (
        current.status === "paid" &&
        nextBalanceMinor > 0 &&
        invoiceSendIsBlocked({
          finishedInvoice: currentInvoice,
          sourceNote: current.invoiceData.sourceNote
        })
      ) {
        throw new HttpStatusError(400, SEND_BLOCKED_MESSAGE);
      }
      return {
        ...current,
        // A paid invoice left with a positive balance reopens to "sent" —
        // decided here, inside the mutation, from the fresh balance.
        status: current.status === "paid" && nextBalanceMinor > 0 ? "sent" : current.status,
        invoiceData: {
          ...current.invoiceData,
          finishedInvoice: invalidateLinksForBalanceChange(
            {
              ...currentInvoice,
              // Persist the stable total the recompute anchored to
              // (fix round 12), as in record-payment.
              total: invoiceTotal,
              // The stored balance never reads negative: an over-covered
              // invoice is zero due, while the exact minor-unit value
              // above drives the status decision.
              balanceDue: Math.max(0, nextBalanceMinor) / 100,
              paymentRecords: nextPaymentRecords
            },
            new Date().toISOString()
          )
        }
      };
    }
  });
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
