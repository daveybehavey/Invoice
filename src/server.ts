import "dotenv/config";
import fs from "node:fs/promises";
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
  getInvoiceDeliveryByTrackingToken,
  getInvoiceDeliveryStoreSummary,
  getInvoiceDeliverySummary,
  getInvoiceDeliverySummariesByInvoiceIds,
  markInvoiceDeliveryOpenedByTrackingToken,
  markInvoiceDeliveryOpened,
  recordInvoiceDeliverySend
} from "./services/invoiceDeliveryStore.js";
import {
  getInvoiceEmailDiagnostics,
  sendInvoiceEmail,
  sendLaunchTestEmail
} from "./services/invoiceEmailDelivery.js";
import {
  listDueInvoiceReminderCandidates,
  resolveInvoiceReminderSettings,
  runDueInvoiceReminders,
  sendInvoiceReminderById
} from "./services/invoiceReminderScheduler.js";
import {
  getStoredInvoiceReminderSettings,
  saveStoredInvoiceReminderSettings
} from "./services/invoiceReminderSettingsStore.js";
import {
  exportOcrMetricsSnapshot,
  isOcrMetricsExportConfigured
} from "./services/ocrMetricsExporter.js";
import { getSavedInvoiceStoreSummary } from "./services/savedInvoiceStore.js";
import { getFlowFrictionSnapshot } from "./services/flowFrictionReport.js";
import { getIntakeTelemetryTrends } from "./services/intakeTelemetryTrends.js";
import {
  getUpgradeTelemetryFunnelSummary,
  trackUpgradeTelemetryEvent
} from "./services/upgradeTelemetryStore.js";
import {
  extractUploadedAudioText,
  extractUploadedImageText,
  extractUploadedInvoiceText
} from "./services/uploadTextExtractor.js";
import {
  resolveStoredInvoiceAttachmentPath,
  storeInvoiceAttachment
} from "./services/invoiceAttachmentStore.js";
import {
  createAuthSessionForEmail,
  getAuthSessionFromRequest,
  isInvoiceSessionSecretConfigured
} from "./services/authSession.js";
import { buildFreePlanLimitMessage, getAccountPlanSummary } from "./services/accountPlanPolicy.js";
import { resolveLauncherBillieAssistantReply } from "./services/launcherBillieAssistant.js";
import { resolveAccountTeamSummary } from "./services/accountTeamPolicy.js";

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
const EstimateApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
const LauncherAssistantRequestSchema = z.object({
  message: z.preprocess((value) => asOptionalString(value) ?? "", z.string().max(400))
});
const UpgradeTelemetryEventRequestSchema = z.object({
  eventType: z.enum([
    "warning_view",
    "limit_view",
    "upgrade_click",
    "checkout_started",
    "checkout_success",
    "checkout_cancelled",
    "billing_portal_opened"
  ]),
  source: z.enum(["launcher", "intake", "manual", "library", "import", "unknown"]),
  planTier: z.enum(["free", "pro"]).optional(),
  remainingSaves: z.number().int().nonnegative().nullable().optional()
});

type FinishedInvoice = z.infer<typeof FinishedInvoiceSchema>;

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

app.post("/api/assistant/launcher", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = LauncherAssistantRequestSchema.parse(req.body ?? {});
    const reply = await resolveLauncherBillieAssistantReply(parsedRequest.message);
    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

const spaRoutes = ["/", "/ai-intake", "/manual", "/import", "/diagnostics", "/settings/business", "/pay/:invoiceId"];
app.get(spaRoutes, (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/invoices", (_req: Request, res: Response) => {
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
    const upgradeGuidance = await resolveAccountUpgradeGuidance(summary.plan);
    const team = resolveAccountTeamSummary({
      authSession,
      ownerId
    });
    res.json({
      ...summary,
      upgradeGuidance,
      team,
      billing: getStripeBillingCapabilities()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/account/team", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerId = getRequestOwnerId(req);
    const authSession = getAuthSessionFromRequest(req);
    const team = resolveAccountTeamSummary({
      authSession,
      ownerId
    });
    res.json({
      ownerId,
      authEmail: authSession?.email ?? null,
      ...team
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

app.post("/api/auth/session", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = z
      .object({
        email: z.preprocess(
          (value) => (typeof value === "string" ? value.trim() : value),
          z.string().email()
        )
      })
      .parse(req.body);
    const created = createAuthSessionForEmail(parsed.email);
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
    const storedReminderSettings = await getStoredInvoiceReminderSettings({ ownerId });
    const reminderPreview = await listDueInvoiceReminderCandidates({
      ownerId,
      repository: savedInvoiceRepository,
      settings: storedReminderSettings.settings
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
        settingsSource: storedReminderSettings.source,
        settingsUpdatedAt: storedReminderSettings.updatedAt,
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

app.get("/api/system/ops-health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const launchSummary = await buildLaunchSummary(req);
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
    const ownerId = getRequestOwnerId(req);
    const reminderSettings = (await getStoredInvoiceReminderSettings({ ownerId })).settings;
    const reminderPreview = await listDueInvoiceReminderCandidates({
      ownerId,
      repository: savedInvoiceRepository,
      settings: reminderSettings
    });
    const upgradeFunnel = await getUpgradeTelemetryFunnelSummary();
    const thresholds = {
      minOpenRate: resolveOpsMinOpenRate(),
      warningDueThreshold: resolveOpsWarningDueThreshold(),
      criticalDueThreshold: resolveOpsCriticalDueThreshold()
    };
    const alerts = buildOpsHealthAlerts({
      launchReady: launchSummary.ready,
      launchWarningCount: launchSummary.warningCount,
      billing: {
        capabilities: billingCapabilities,
        warning: billingWarning,
        entitlements: billingEntitlements,
        requireLiveMode: requireLiveBilling
      },
      delivery: {
        diagnostics: deliveryDiagnostics,
        summary: deliverySummary,
        warning: deliveryWarning,
        remindersDueCount: reminderPreview.due.length
      },
      upgradeFunnel,
      thresholds
    });
    const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
    const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
    const deliverySentCount = Number(deliverySummary.sentCount ?? 0);
    const deliveryOpenedCount = Number(deliverySummary.openedCount ?? 0);
    const deliveryOpenRate =
      deliverySentCount > 0 ? Number((deliveryOpenedCount / deliverySentCount).toFixed(4)) : null;
    const upgradeViews24h = Number(upgradeFunnel.windows.last24h.totalViews ?? 0);
    const upgradeClickRate24h =
      upgradeFunnel.windows.last24h.clickRateFromViews === null
        ? null
        : Number(upgradeFunnel.windows.last24h.clickRateFromViews ?? 0);
    const upgradeCheckoutSuccessRate7d =
      upgradeFunnel.windows.last7d.checkoutSuccessRateFromStarts === null
        ? null
        : Number(upgradeFunnel.windows.last7d.checkoutSuccessRateFromStarts ?? 0);
    res.json({
      passed: criticalCount === 0,
      timestamp: new Date().toISOString(),
      summary: {
        criticalCount,
        warningCount
      },
      metrics: {
        launchReady: launchSummary.ready,
        launchWarnings: launchSummary.warningCount,
        billingLiveMode: Boolean(billingCapabilities.liveMode),
        activeSubscriptions: Number(billingEntitlements.activeSubscriptionCount ?? 0),
        deliveryConfigured: Boolean(deliveryDiagnostics.capabilities.configured),
        deliveryVerified: Boolean(deliveryDiagnostics.verification.ready),
        deliverySentCount,
        deliveryOpenedCount,
        deliveryOpenRate,
        remindersDueCount: reminderPreview.due.length,
        upgradeViews24h,
        upgradeClickRate24h,
        upgradeCheckoutSuccessRate7d
      },
      thresholds,
      alerts
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/launch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = await buildLaunchSummary(req);
    res.json(payload);
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

app.post("/api/telemetry/upgrade-events", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpgradeTelemetryEventRequestSchema.parse(req.body ?? {});
    await trackUpgradeTelemetryEvent({
      eventType: parsed.eventType,
      source: parsed.source,
      ownerId: getRequestOwnerId(req),
      planTier: parsed.planTier ?? null,
      remainingSaves: parsed.remainingSaves ?? null
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/telemetry/upgrade-funnel", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getUpgradeTelemetryFunnelSummary();
    res.json(summary);
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
  "/api/invoices/attachments/upload",
  importUpload.single("attachmentFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ownerId = getRequestOwnerId(req);
      if (!req.file) {
        throw new HttpStatusError(400, "Upload a file first.");
      }
      const attachment = await storeInvoiceAttachment({
        ownerId,
        file: req.file
      });
      const absoluteUrl = attachment.url.startsWith("http://") || attachment.url.startsWith("https://")
        ? attachment.url
        : `${resolvePublicBaseUrl(req)}${attachment.url}`;
      res.status(201).json({
        attachment: {
          id: attachment.id,
          label: attachment.label,
          url: absoluteUrl,
          type: attachment.type,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/invoices/attachments/files/:ownerKey/:fileName",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ownerKey = asOptionalString(req.params.ownerKey);
      const fileName = asOptionalString(req.params.fileName);
      if (!ownerKey || !fileName) {
        throw new HttpStatusError(400, "Invalid attachment file path.");
      }
      const filePath = resolveStoredInvoiceAttachmentPath(ownerKey, fileName);
      if (!filePath) {
        throw new HttpStatusError(400, "Invalid attachment file path.");
      }
      try {
        await fs.access(filePath);
      } catch (_error) {
        throw new HttpStatusError(404, "Attachment file was not found.");
      }
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.sendFile(filePath);
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
    const existingSavedInvoice = parsedRequest.invoiceId
      ? await savedInvoiceRepository.getSavedInvoiceById(parsedRequest.invoiceId, ownerId)
      : null;
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
    const normalizedInvoiceData = {
      ...parsedRequest.invoiceData,
      finishedInvoice: normalizeEstimateStateForFinishedInvoice(
        parsedRequest.invoiceData.finishedInvoice,
        existingSavedInvoice?.invoiceData.finishedInvoice
      )
    };

    const savedInvoice = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId,
      invoiceId: parsedRequest.invoiceId,
      sourceType: parsedRequest.sourceType,
      invoiceData: normalizedInvoiceData
    });

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

app.get("/api/invoices/export-accounting.csv", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z
      .object({
        includeDeleted: z
          .preprocess((value) => {
            if (typeof value !== "string") {
              return value;
            }
            return value.trim().toLowerCase();
          }, z.enum(["true", "false"]).optional())
          .optional(),
        status: z.preprocess(parseStatusFilterValues, z.array(z.enum(["draft", "sent", "paid", "deleted"])).optional()),
        from: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().optional()),
        to: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().optional())
      })
      .default({})
      .parse(req.query ?? {});

    const ownerId = getRequestOwnerId(req);
    const includeDeleted = query.includeDeleted === "true" || (query.status?.includes("deleted") ?? false);
    const statuses = query.status ? new Set(query.status) : null;
    const fromMs = parseCsvExportDate(query.from, { boundary: "start", label: "from" });
    const toMs = parseCsvExportDate(query.to, { boundary: "end", label: "to" });

    const metadata = await savedInvoiceRepository.listSavedInvoiceMetadata(includeDeleted, ownerId);
    const selectedMetadata = statuses ? metadata.filter((invoice) => statuses.has(invoice.status)) : metadata;
    const savedInvoices = await Promise.all(
      selectedMetadata.map((invoice) => savedInvoiceRepository.getSavedInvoiceById(invoice.invoiceId, ownerId))
    );
    const filteredInvoices = savedInvoices.filter((invoice) => {
      const exportDateMs = resolveInvoiceExportDateMs(invoice);
      if (fromMs !== undefined && exportDateMs < fromMs) {
        return false;
      }
      if (toMs !== undefined && exportDateMs > toMs) {
        return false;
      }
      return true;
    });

    const deliveryByInvoice = await getInvoiceDeliverySummariesByInvoiceIds({
      ownerId,
      invoiceIds: filteredInvoices.map((invoice) => invoice.invoiceId)
    });
    const csv = buildAccountingCsv(filteredInvoices, deliveryByInvoice);
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const filename = `notebill-accounting-export-${dateSuffix}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
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

app.get("/api/public/invoices/:id/payment", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const trackingToken = parsePublicTrackingToken(req.query.token);
    const match = await getInvoiceDeliveryByTrackingToken({ invoiceId, trackingToken });
    if (!match) {
      throw new HttpStatusError(404, "Payment page not found.");
    }
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, match.ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(404, "Payment page not found.");
    }
    res.json({ invoice: buildPublicInvoiceSummary(savedInvoice) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/invoices/:id/estimate-approval", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const trackingToken = parsePublicTrackingToken(req.query.token);
    const parsedRequest = z
      .object({
        status: z.enum(["approved", "rejected"]).default("approved")
      })
      .parse(req.body ?? {});
    const match = await getInvoiceDeliveryByTrackingToken({ invoiceId, trackingToken });
    if (!match) {
      throw new HttpStatusError(404, "Estimate page not found.");
    }
    const existing = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, match.ownerId);
    if (existing.status === "deleted") {
      throw new HttpStatusError(404, "Estimate page not found.");
    }
    const finished = existing.invoiceData.finishedInvoice;
    if ((finished.documentType ?? "invoice") !== "estimate") {
      throw new HttpStatusError(400, "Only estimates can be approved.");
    }

    const updatedFinished = normalizeEstimateStateForFinishedInvoice(
      {
        ...finished,
        estimateApprovalStatus: parsedRequest.status,
        estimateApprovedAt: parsedRequest.status === "approved" ? finished.estimateApprovedAt : undefined,
        estimateApprovedBy:
          parsedRequest.status === "approved"
            ? asOptionalString(finished.estimateApprovedBy) ?? match.recipientEmail
            : undefined,
        estimateApprovalSource: parsedRequest.status === "approved" ? "customer" : undefined
      },
      finished
    );
    const updatedInvoice = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId: match.ownerId,
      invoiceId,
      sourceType: existing.sourceType,
      invoiceData: {
        ...existing.invoiceData,
        finishedInvoice: updatedFinished
      }
    });
    await markInvoiceDeliveryOpenedByTrackingToken({ invoiceId, trackingToken });
    res.json({ invoice: buildPublicInvoiceSummary(updatedInvoice) });
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
    const shouldEnsurePaymentLink =
      existingInvoice.invoiceData.finishedInvoice.documentType !== "estimate";
    const invoiceWithPaymentLink = shouldEnsurePaymentLink
      ? await ensureSavedInvoicePaymentLink({
          ownerId,
          invoice: existingInvoice,
          baseUrl: resolvePublicBaseUrl(req)
        })
      : existingInvoice;

    const trackingToken = randomUUID();
    const customerInvoiceUrl = `${resolvePublicBaseUrl(req)}/pay/${invoiceId}?token=${encodeURIComponent(trackingToken)}`;
    const openTrackingPixelUrl = `${resolvePublicBaseUrl(req)}/api/invoices/${invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
    const sendResult = await sendInvoiceEmail({
      recipientEmail: parsedRequest.recipientEmail,
      invoice: invoiceWithPaymentLink.invoiceData.finishedInvoice,
      invoiceId,
      messageType:
        invoiceWithPaymentLink.invoiceData.finishedInvoice.documentType === "estimate"
          ? "estimate"
          : "invoice",
      openTrackingPixelUrl,
      customerInvoiceUrl
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
    assertTeamCapability(req, ownerId, "canCreatePaymentLinks", "Helpers cannot create payment links.");
    const savedInvoice = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (savedInvoice.status === "deleted") {
      throw new HttpStatusError(400, "Restore this invoice before creating a payment link.");
    }
    if (savedInvoice.invoiceData.finishedInvoice.documentType === "estimate") {
      throw new HttpStatusError(400, "Convert estimate to invoice before creating a payment link.");
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
    res.json({
      reminder: {
        invoiceId: reminder.invoiceId,
        invoiceNumber: reminder.invoiceNumber,
        recipientEmail: reminder.recipientEmail,
        reminderTone: reminder.reminderTone,
        lateFeePercentApplied: reminder.lateFeePercentApplied
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

app.get("/api/invoices/reminders/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerId = getRequestOwnerId(req);
    const stored = await getStoredInvoiceReminderSettings({ ownerId });
    res.json({
      ownerId,
      settings: stored.settings,
      source: stored.source,
      updatedAt: stored.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/invoices/reminders/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedRequest = z
      .object({
        maxPerRun: z.number().int().min(1).max(100).optional(),
        dueAfterDays: z.number().int().min(1).max(120).optional(),
        cooldownDays: z.number().int().min(1).max(60).optional()
      })
      .default({})
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    assertTeamCapability(req, ownerId, "canRunReminderAutomation", "Helpers cannot update reminder automation settings.");
    const saved = await saveStoredInvoiceReminderSettings({
      ownerId,
      settings: {
        maxPerRun: parsedRequest.maxPerRun,
        dueAfterDays: parsedRequest.dueAfterDays,
        cooldownDays: parsedRequest.cooldownDays
      }
    });
    res.json({
      ownerId,
      settings: saved.settings,
      source: "stored",
      updatedAt: saved.updatedAt
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
    const storedReminderSettings = await getStoredInvoiceReminderSettings({ ownerId });
    const mergedSettings = resolveInvoiceReminderSettings({
      dueAfterDays: parsedRequest.dueAfterDays ?? storedReminderSettings.settings.dueAfterDays,
      cooldownDays: parsedRequest.cooldownDays ?? storedReminderSettings.settings.cooldownDays,
      maxPerRun: parsedRequest.maxPerRun ?? storedReminderSettings.settings.maxPerRun
    });
    if (parsedRequest.dryRun) {
      const preview = await listDueInvoiceReminderCandidates({
        ownerId,
        repository: savedInvoiceRepository,
        settings: mergedSettings
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
    assertTeamCapability(req, ownerId, "canRunReminderAutomation", "Helpers cannot run reminder automation.");
    const runResult = await runDueInvoiceReminders({
      ownerId,
      repository: savedInvoiceRepository,
      baseUrl: resolvePublicBaseUrl(req),
      settings: mergedSettings
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

app.post("/api/invoices/:id/estimate-approval", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = z
      .object({
        status: EstimateApprovalStatusSchema
      })
      .parse(req.body ?? {});
    const ownerId = getRequestOwnerId(req);
    assertTeamCapability(req, ownerId, "canApproveEstimates", "Helpers cannot approve or reject estimates.");
    const existing = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (existing.status === "deleted") {
      throw new HttpStatusError(400, "Restore this estimate before updating approval.");
    }
    const finished = existing.invoiceData.finishedInvoice;
    if ((finished.documentType ?? "invoice") !== "estimate") {
      throw new HttpStatusError(400, "Only estimates support approval state.");
    }
    const updatedFinished = normalizeEstimateStateForFinishedInvoice(
      {
        ...finished,
        estimateApprovalStatus: parsedRequest.status,
        estimateApprovedAt: parsedRequest.status === "approved" ? finished.estimateApprovedAt : undefined,
        estimateApprovedBy:
          parsedRequest.status === "approved"
            ? asOptionalString(finished.estimateApprovedBy) ?? ownerId
            : undefined,
        estimateApprovalSource: parsedRequest.status === "approved" ? "owner" : undefined
      },
      finished
    );
    const updated = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId,
      invoiceId,
      sourceType: existing.sourceType,
      invoiceData: {
        ...existing.invoiceData,
        finishedInvoice: updatedFinished
      }
    });
    res.json({ invoice: updated });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/convert-to-invoice", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const ownerId = getRequestOwnerId(req);
    assertTeamCapability(req, ownerId, "canConvertEstimates", "Helpers cannot convert estimates to invoices.");
    const existing = await savedInvoiceRepository.getSavedInvoiceById(invoiceId, ownerId);
    if (existing.status === "deleted") {
      throw new HttpStatusError(400, "Restore this document before converting.");
    }
    const finished = existing.invoiceData.finishedInvoice;
    if ((finished.documentType ?? "invoice") !== "estimate") {
      res.json({ invoice: existing, converted: false });
      return;
    }
    const estimateApprovalStatus = normalizeEstimateApprovalStatus(finished.estimateApprovalStatus);
    if (estimateApprovalStatus !== "approved") {
      throw new HttpStatusError(400, "Approve the estimate before converting it to an invoice.");
    }
    const shouldIssueNewNumber =
      typeof finished.invoiceNumber !== "string" ||
      !finished.invoiceNumber.trim() ||
      finished.invoiceNumber.trim().toUpperCase().startsWith("EST-");
    const convertedFinished = normalizeEstimateStateForFinishedInvoice({
      ...finished,
      documentType: "invoice" as const,
      invoiceNumber: shouldIssueNewNumber ? buildServerInvoiceNumber() : finished.invoiceNumber
    });
    const converted = await savedInvoiceRepository.saveInvoiceDocument({
      ownerId,
      invoiceId,
      sourceType: existing.sourceType,
      invoiceData: {
        ...existing.invoiceData,
        finishedInvoice: convertedFinished
      }
    });
    res.json({ invoice: converted, converted: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/invoices/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = z.string().uuid().parse(req.params.id);
    const parsedRequest = UpdateInvoiceStatusRequestSchema.parse(req.body);
    const ownerId = getRequestOwnerId(req);
    if (parsedRequest.status === "paid") {
      assertTeamCapability(req, ownerId, "canMarkInvoicesPaid", "Helpers cannot mark invoices as paid.");
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

function asOptionalString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : undefined;
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEstimateApprovalStatus(value: unknown): z.infer<typeof EstimateApprovalStatusSchema> {
  if (value === "approved" || value === "rejected") {
    return value;
  }
  return "pending";
}

function normalizeEstimateStateForFinishedInvoice(
  finished: FinishedInvoice,
  previous?: FinishedInvoice
): FinishedInvoice {
  const normalizedDocumentType = finished.documentType === "estimate" ? "estimate" : "invoice";
  if (normalizedDocumentType !== "estimate") {
    return {
      ...finished,
      documentType: "invoice",
      estimateApprovalStatus: undefined,
      estimateApprovedAt: undefined,
      estimateApprovedBy: undefined,
      estimateApprovalSource: undefined
    };
  }
  const previousApprovalStatus =
    previous?.documentType === "estimate"
      ? normalizeEstimateApprovalStatus(previous.estimateApprovalStatus)
      : "pending";
  const approvalStatus = normalizeEstimateApprovalStatus(
    finished.estimateApprovalStatus ?? previousApprovalStatus
  );
  const previousApprovedAt =
    previous?.documentType === "estimate" &&
    normalizeEstimateApprovalStatus(previous.estimateApprovalStatus) === "approved"
      ? asOptionalString(previous.estimateApprovedAt)
      : undefined;
  const approvedAt =
    approvalStatus === "approved"
      ? asOptionalString(finished.estimateApprovedAt) ?? previousApprovedAt ?? new Date().toISOString()
      : undefined;
  const previousApprovedBy =
    previous?.documentType === "estimate" &&
    normalizeEstimateApprovalStatus(previous.estimateApprovalStatus) === "approved"
      ? asOptionalString(previous.estimateApprovedBy)
      : undefined;
  const approvalSource =
    finished.estimateApprovalSource === "owner" || finished.estimateApprovalSource === "customer"
      ? finished.estimateApprovalSource
      : previous?.estimateApprovalSource === "owner" || previous?.estimateApprovalSource === "customer"
        ? previous.estimateApprovalSource
        : undefined;
  const approvedBy =
    approvalStatus === "approved"
      ? asOptionalString(finished.estimateApprovedBy) ?? previousApprovedBy
      : undefined;
  return {
    ...finished,
    documentType: "estimate",
    estimateApprovalStatus: approvalStatus,
    estimateApprovedAt: approvedAt,
    estimateApprovedBy: approvedBy,
    estimateApprovalSource: approvalStatus === "approved" ? approvalSource : undefined
  };
}

function parsePublicTrackingToken(value: unknown): string {
  return z
    .preprocess((candidate) => (typeof candidate === "string" ? candidate.trim() : candidate), z.string().min(8))
    .parse(value);
}

function buildPublicInvoiceSummary(
  savedInvoice: Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>
): {
  invoiceId: string;
  documentType: "invoice" | "estimate";
  billingStage: "standard" | "deposit" | "progress" | "final";
  projectTotal: number | null;
  projectPaidToDate: number | null;
  projectBalanceAfterInvoice: number | null;
  estimateApprovalStatus: "pending" | "approved" | "rejected" | null;
  estimateApprovedAt: string | null;
  estimateApprovedBy: string | null;
  estimateApprovalSource: "owner" | "customer" | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  customerName: string | null;
  currency: string;
  subtotal: number;
  total: number;
  balanceDue: number;
  status: string;
  paymentLinkUrl: string | null;
  attachments: Array<{ label: string; url: string; type: "photo" | "document" | "link" | "other" }>;
} {
  const finished = savedInvoice.invoiceData.finishedInvoice;
  const documentType = finished.documentType === "estimate" ? "estimate" : "invoice";
  const billingStage =
    finished.billingStage === "deposit" ||
    finished.billingStage === "progress" ||
    finished.billingStage === "final"
      ? finished.billingStage
      : "standard";
  const attachments = Array.isArray(finished.attachments)
    ? finished.attachments
        .map((attachment) => {
          const normalizedType: "photo" | "document" | "link" | "other" =
            attachment.type === "photo" ||
            attachment.type === "document" ||
            attachment.type === "other"
              ? attachment.type
              : "link";
          return {
            label: attachment.label,
            url: attachment.url,
            type: normalizedType
          };
        })
        .filter((attachment) => attachment.label && attachment.url)
    : [];
  return {
    invoiceId: savedInvoice.invoiceId,
    documentType,
    billingStage,
    projectTotal: Number.isFinite(finished.projectTotal) ? Number(finished.projectTotal) : null,
    projectPaidToDate: Number.isFinite(finished.projectPaidToDate) ? Number(finished.projectPaidToDate) : null,
    projectBalanceAfterInvoice: Number.isFinite(finished.projectBalanceAfterInvoice)
      ? Number(finished.projectBalanceAfterInvoice)
      : null,
    estimateApprovalStatus:
      documentType === "estimate" ? normalizeEstimateApprovalStatus(finished.estimateApprovalStatus) : null,
    estimateApprovedAt: documentType === "estimate" ? asOptionalString(finished.estimateApprovedAt) ?? null : null,
    estimateApprovedBy: documentType === "estimate" ? asOptionalString(finished.estimateApprovedBy) ?? null : null,
    estimateApprovalSource:
      documentType === "estimate" &&
      (finished.estimateApprovalSource === "owner" || finished.estimateApprovalSource === "customer")
        ? finished.estimateApprovalSource
        : null,
    invoiceNumber: finished.invoiceNumber ?? null,
    issueDate: finished.issueDate ?? null,
    customerName: finished.customerName ?? null,
    currency: finished.currency ?? "USD",
    subtotal: Number(finished.subtotal ?? 0),
    total: Number(finished.total ?? 0),
    balanceDue: Number(finished.balanceDue ?? finished.total ?? 0),
    status: savedInvoice.status,
    paymentLinkUrl: finished.paymentLinkUrl ?? null,
    attachments
  };
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

function buildServerInvoiceNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const suffix = `${Math.floor(Math.random() * 10000)}`.padStart(4, "0");
  return `INV-${ymd}-${suffix}`;
}

function resolveSystemBaseUrl(): string {
  const envBaseUrl = asOptionalString(process.env.APP_BASE_URL);
  if (envBaseUrl) {
    try {
      const parsed = new URL(envBaseUrl);
      return parsed.origin;
    } catch (_error) {
      // ignore invalid APP_BASE_URL and fallback to NoteBill app origin
    }
  }
  return "https://app.notebill.app";
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

type LaunchSummaryPayload = {
  ready: boolean;
  warningCount: number;
  publicBaseUrl: string;
  publicBaseUrlReady: boolean;
  persistence: {
    ready: boolean;
    backend: string;
    configuredBackend: string;
    configuredMode: string;
    postgresRequired: boolean;
    migrationRequired: boolean;
    warning: string | null;
  };
  auth: {
    ready: boolean;
    required: boolean;
    warning: string | null;
  };
  billing: {
    ready: boolean;
    provider: string;
    warning: string | null;
    requireLiveMode: boolean;
    capabilities: ReturnType<typeof getStripeBillingCapabilities>;
    entitlements: Awaited<ReturnType<typeof getBillingEntitlementsSummary>>;
  };
  delivery: {
    ready: boolean;
    provider: string;
    warning: string | null;
    capabilities: Awaited<ReturnType<typeof getInvoiceEmailDiagnostics>>["capabilities"];
    verification: Awaited<ReturnType<typeof getInvoiceEmailDiagnostics>>["verification"];
    summary: Awaited<ReturnType<typeof getInvoiceDeliveryStoreSummary>>;
  };
  checks: Array<{
    id: string;
    ok: boolean;
    detail: string;
  }>;
};

async function buildLaunchSummary(req: Request): Promise<LaunchSummaryPayload> {
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
  return {
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
  };
}

type OpsAlert = {
  severity: "critical" | "warning";
  key: string;
  message: string;
};

function buildOpsHealthAlerts(input: {
  launchReady: boolean;
  launchWarningCount: number;
  billing: {
    capabilities: ReturnType<typeof getStripeBillingCapabilities>;
    warning: string | null;
    entitlements: Awaited<ReturnType<typeof getBillingEntitlementsSummary>>;
    requireLiveMode: boolean;
  };
  delivery: {
    diagnostics: Awaited<ReturnType<typeof getInvoiceEmailDiagnostics>>;
    summary: Awaited<ReturnType<typeof getInvoiceDeliveryStoreSummary>>;
    warning: string | null;
    remindersDueCount: number;
  };
  upgradeFunnel: Awaited<ReturnType<typeof getUpgradeTelemetryFunnelSummary>>;
  thresholds: {
    minOpenRate: number;
    warningDueThreshold: number;
    criticalDueThreshold: number;
  };
}): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  const pushAlert = (severity: OpsAlert["severity"], key: string, message: string) => {
    alerts.push({ severity, key, message });
  };

  if (!input.launchReady || input.launchWarningCount > 0) {
    pushAlert("critical", "launch", "Launch readiness is not green.");
  }

  if (input.billing.warning) {
    pushAlert("critical", "billing", input.billing.warning);
  } else {
    if (!input.billing.capabilities.checkoutAvailable || !input.billing.capabilities.webhookAvailable) {
      pushAlert("critical", "billing_capability", "Stripe checkout/webhook capability is incomplete.");
    }
    if (input.billing.requireLiveMode && !input.billing.capabilities.liveMode) {
      pushAlert("critical", "billing_live_mode", "Launch policy requires live Stripe keys.");
    }
  }
  if ((input.billing.entitlements.missingIdentityCount ?? 0) > 0) {
    pushAlert("warning", "billing_identity", "Some Stripe entitlements are missing account identity links.");
  }

  if (input.delivery.warning) {
    pushAlert("critical", "delivery", input.delivery.warning);
  } else if (!input.delivery.diagnostics.capabilities.configured || !input.delivery.diagnostics.verification.ready) {
    pushAlert("critical", "delivery_config", "Email delivery is not fully configured/verified.");
  }

  const sentCount = Number(input.delivery.summary.sentCount ?? 0);
  const openedCount = Number(input.delivery.summary.openedCount ?? 0);
  const openRate = sentCount > 0 ? openedCount / sentCount : null;
  if (openRate !== null && sentCount >= 20 && openRate < input.thresholds.minOpenRate) {
    pushAlert(
      "warning",
      "delivery_open_rate",
      `Delivery open rate is low (${(openRate * 100).toFixed(1)}% across ${sentCount} sends).`
    );
  }

  const dueCount = Number(input.delivery.remindersDueCount ?? 0);
  if (dueCount >= input.thresholds.criticalDueThreshold) {
    pushAlert("critical", "reminders_backlog", `Reminder backlog is high (${dueCount} currently due).`);
  } else if (dueCount >= input.thresholds.warningDueThreshold) {
    pushAlert("warning", "reminders_backlog", `Reminder backlog warning (${dueCount} currently due).`);
  }

  const totalViews = Number(input.upgradeFunnel.windows.last24h.totalViews ?? 0);
  const clickRate = Number(input.upgradeFunnel.windows.last24h.clickRateFromViews ?? 0);
  if (totalViews >= 20 && clickRate < 0.06) {
    pushAlert(
      "warning",
      "upgrade_click_rate",
      `Upgrade click-through is low (${(clickRate * 100).toFixed(1)}% across ${totalViews} warning/limit views).`
    );
  }
  if (input.upgradeFunnel.recommendations.some((item) => item.severity === "warning")) {
    pushAlert("warning", "upgrade_funnel_recommendation", "Upgrade funnel has warning recommendations.");
  }

  return alerts;
}

function resolveOpsMinOpenRate(): number {
  const value = Number(process.env.OPS_HEALTH_MIN_OPEN_RATE ?? "0.2");
  return Number.isFinite(value) && value > 0 && value < 1 ? value : 0.2;
}

function resolveOpsWarningDueThreshold(): number {
  const value = Number.parseInt(process.env.OPS_HEALTH_WARNING_DUE_THRESHOLD ?? "10", 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function resolveOpsCriticalDueThreshold(): number {
  const value = Number.parseInt(process.env.OPS_HEALTH_CRITICAL_DUE_THRESHOLD ?? "25", 10);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

type AccountUpgradeGuidance = {
  prelimitStartRemaining: number;
  warningVariant: "default" | "early";
  reason: "default" | "low_click_rate" | "low_checkout_start_rate";
  updatedAt: string | null;
  telemetryWindow: {
    totalViews: number;
    clickRateFromViews: number | null;
    checkoutStartRateFromClicks: number | null;
  };
};

async function resolveAccountUpgradeGuidance(
  planTier: "free" | "pro"
): Promise<AccountUpgradeGuidance | null> {
  if (planTier !== "free") {
    return null;
  }
  const fallback: AccountUpgradeGuidance = {
    prelimitStartRemaining: 3,
    warningVariant: "default",
    reason: "default",
    updatedAt: null,
    telemetryWindow: {
      totalViews: 0,
      clickRateFromViews: null,
      checkoutStartRateFromClicks: null
    }
  };
  try {
    const funnel = await getUpgradeTelemetryFunnelSummary();
    const last24h = funnel.windows.last24h;
    if (last24h.totalViews >= 20 && last24h.clickRateFromViews !== null && last24h.clickRateFromViews < 0.06) {
      return {
        prelimitStartRemaining: 5,
        warningVariant: "early",
        reason: "low_click_rate",
        updatedAt: funnel.updatedAt || null,
        telemetryWindow: {
          totalViews: last24h.totalViews,
          clickRateFromViews: last24h.clickRateFromViews,
          checkoutStartRateFromClicks: last24h.checkoutStartRateFromClicks
        }
      };
    }
    if (
      last24h.upgradeClicks >= 10 &&
      last24h.checkoutStartRateFromClicks !== null &&
      last24h.checkoutStartRateFromClicks < 0.55
    ) {
      return {
        prelimitStartRemaining: 4,
        warningVariant: "early",
        reason: "low_checkout_start_rate",
        updatedAt: funnel.updatedAt || null,
        telemetryWindow: {
          totalViews: last24h.totalViews,
          clickRateFromViews: last24h.clickRateFromViews,
          checkoutStartRateFromClicks: last24h.checkoutStartRateFromClicks
        }
      };
    }
    return {
      ...fallback,
      updatedAt: funnel.updatedAt || null,
      telemetryWindow: {
        totalViews: last24h.totalViews,
        clickRateFromViews: last24h.clickRateFromViews,
        checkoutStartRateFromClicks: last24h.checkoutStartRateFromClicks
      }
    };
  } catch (_error) {
    return fallback;
  }
}

function asOptionalParseMode(value: unknown): "fast" | "full" | undefined {
  return value === "fast" || value === "full" ? value : undefined;
}

function parseStatusFilterValues(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseStatusFilterValues(entry) ?? []);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  }
  return value as string[];
}

function parseCsvExportDate(
  value: string | undefined,
  options: { boundary: "start" | "end"; label: "from" | "to" }
): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = options.boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return Date.parse(`${trimmed}${suffix}`);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  throw new HttpStatusError(400, `Invalid ${options.label} date. Use YYYY-MM-DD or an ISO datetime.`);
}

function resolveInvoiceExportDateMs(
  invoice: Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>
): number {
  const issueDate = asOptionalString(invoice.invoiceData.finishedInvoice.issueDate);
  if (issueDate) {
    const issueDateMs = Date.parse(issueDate);
    if (Number.isFinite(issueDateMs)) {
      return issueDateMs;
    }
  }
  const updatedAtMs = Date.parse(invoice.updatedAt);
  if (Number.isFinite(updatedAtMs)) {
    return updatedAtMs;
  }
  const createdAtMs = Date.parse(invoice.createdAt);
  if (Number.isFinite(createdAtMs)) {
    return createdAtMs;
  }
  return Date.now();
}

function buildAccountingCsv(
  invoices: Array<Awaited<ReturnType<typeof savedInvoiceRepository.getSavedInvoiceById>>>,
  deliveryByInvoice: Awaited<ReturnType<typeof getInvoiceDeliverySummariesByInvoiceIds>>
): string {
  const header = [
    "invoice_id",
    "document_type",
    "billing_stage",
    "invoice_number",
    "status",
    "source_type",
    "issue_date",
    "service_period_start",
    "service_period_end",
    "customer_name",
    "estimate_approval_status",
    "estimate_approved_at",
    "estimate_approved_by",
    "estimate_approval_source",
    "currency",
    "subtotal",
    "discount_amount",
    "total",
    "balance_due",
    "project_total",
    "project_paid_to_date",
    "project_balance_after_invoice",
    "line_item_count",
    "attachment_count",
    "payment_link_url",
    "recipient_email",
    "delivery_send_count",
    "delivery_sent_at",
    "delivery_opened_at",
    "created_at",
    "updated_at"
  ];

  const rows = [...invoices]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map((invoice) => {
      const finished = invoice.invoiceData.finishedInvoice;
      const delivery = deliveryByInvoice[invoice.invoiceId];
      return [
        invoice.invoiceId,
        finished.documentType ?? "invoice",
        finished.billingStage ?? "standard",
        finished.invoiceNumber ?? "",
        invoice.status,
        invoice.sourceType,
        finished.issueDate ?? "",
        finished.servicePeriodStart ?? "",
        finished.servicePeriodEnd ?? "",
        finished.customerName ?? "",
        finished.documentType === "estimate"
          ? normalizeEstimateApprovalStatus(finished.estimateApprovalStatus)
          : "",
        finished.documentType === "estimate" ? finished.estimateApprovedAt ?? "" : "",
        finished.documentType === "estimate" ? finished.estimateApprovedBy ?? "" : "",
        finished.documentType === "estimate" ? finished.estimateApprovalSource ?? "" : "",
        finished.currency ?? "USD",
        formatCsvNumber(finished.subtotal),
        formatCsvNumber(finished.discountAmount),
        formatCsvNumber(finished.total),
        formatCsvNumber(finished.balanceDue),
        formatCsvNumber(finished.projectTotal),
        formatCsvNumber(finished.projectPaidToDate),
        formatCsvNumber(finished.projectBalanceAfterInvoice),
        String(finished.lineItems.length),
        String(Array.isArray(finished.attachments) ? finished.attachments.length : 0),
        finished.paymentLinkUrl ?? "",
        delivery?.recipientEmail ?? "",
        String(delivery?.sendCount ?? 0),
        delivery?.sentAt ?? "",
        delivery?.openedAt ?? "",
        invoice.createdAt,
        invoice.updatedAt
      ];
    });

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n").concat("\n");
}

function formatCsvNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2);
}

function escapeCsvCell(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
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

function assertTeamCapability(
  req: Request,
  ownerId: string,
  capability: keyof ReturnType<typeof resolveAccountTeamSummary>["capabilities"],
  message: string
): void {
  const authSession = getAuthSessionFromRequest(req);
  const team = resolveAccountTeamSummary({
    authSession,
    ownerId
  });
  if (team.capabilities[capability]) {
    return;
  }
  throw new HttpStatusError(403, message);
}

function getInvoiceAuthPolicy(): {
  nodeEnv: string;
  requireAuth: boolean;
  sessionSecretConfigured: boolean;
  productionReady: boolean;
  warning?: string;
} {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim() || "development";
  const requireAuth = resolveInvoiceRequireAuth(process.env.INVOICE_REQUIRE_AUTH, nodeEnv);
  const sessionSecretConfigured = isInvoiceSessionSecretConfigured();
  const productionReady = !requireAuth || sessionSecretConfigured;
  return {
    nodeEnv,
    requireAuth,
    sessionSecretConfigured,
    productionReady,
    warning: productionReady
      ? undefined
      : "Authentication is required, but INVOICE_SESSION_SECRET is missing or using an insecure default."
  };
}

function assertInvoiceAuthSessionPolicy(): void {
  const policy = getInvoiceAuthPolicy();
  if (policy.productionReady) {
    return;
  }
  throw new Error(
    [
      "Invoice auth policy is not production-ready.",
      `NODE_ENV=${policy.nodeEnv} requires authentication but INVOICE_SESSION_SECRET is not safely configured.`,
      "Set INVOICE_SESSION_SECRET to a strong non-default value, or override INVOICE_REQUIRE_AUTH=false for local-only mode."
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

function resolveInvoiceRequireAuth(value: string | undefined, nodeEnv: string): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return nodeEnv.toLowerCase() === "production";
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
  const wasAlreadyPaid = savedInvoice.status === "paid";
  const existingDelivery = await getInvoiceDeliverySummary({ ownerId: input.ownerId, invoiceId: input.invoiceId }).catch(
    () => null
  );
  const receiptRecipientEmail = existingDelivery?.recipientEmail?.trim().toLowerCase() || null;
  const currentInvoice = savedInvoice.invoiceData.finishedInvoice;
  const paidInvoice = {
    ...currentInvoice,
    balanceDue: 0
  };
  await savedInvoiceRepository.saveInvoiceDocument({
    ownerId: input.ownerId,
    invoiceId: input.invoiceId,
    sourceType: savedInvoice.sourceType,
    invoiceData: {
      ...savedInvoice.invoiceData,
      finishedInvoice: paidInvoice
    }
  });
  if (!wasAlreadyPaid) {
    await savedInvoiceRepository.updateSavedInvoiceStatus(input.invoiceId, "paid", input.ownerId);
  }
  if (!wasAlreadyPaid && receiptRecipientEmail) {
    try {
      const baseUrl = resolveSystemBaseUrl();
      const trackingToken = randomUUID();
      const openTrackingPixelUrl = `${baseUrl}/api/invoices/${input.invoiceId}/delivery/opened/pixel?token=${encodeURIComponent(trackingToken)}`;
      const customerInvoiceUrl = `${baseUrl}/pay/${input.invoiceId}?token=${encodeURIComponent(trackingToken)}`;
      const sendResult = await sendInvoiceEmail({
        recipientEmail: receiptRecipientEmail,
        invoice: paidInvoice,
        invoiceId: input.invoiceId,
        openTrackingPixelUrl,
        customerInvoiceUrl,
        messageType: "receipt"
      });
      if (sendResult.mode === "provider") {
        await recordInvoiceDeliverySend({
          ownerId: input.ownerId,
          invoiceId: input.invoiceId,
          recipientEmail: receiptRecipientEmail,
          trackingToken,
          mode: sendResult.mode,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to send paid receipt email", error);
    }
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
