const { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } = ReactRouterDOM;
const { useEffect, useState } = React;

const uiPrimitives = window.InvoiceUIPrimitives;
if (!uiPrimitives) {
  throw new Error("Missing /ui/primitives.jsx load. Ensure it is loaded before /launcher.jsx.");
}

const {
  SparklesIcon,
  PencilIcon,
  UploadIcon,
  ArchiveIcon,
  SwatchIcon,
  FeedbackIcon,
  NotebookIcon,
  SquaresIcon
} = uiPrimitives;

const accountPlanUtils = window.InvoiceAccountPlanUtils;
if (!accountPlanUtils) {
  throw new Error("Missing /utils/accountPlan.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  formatPlanSummary,
  getPlanUpgradeUrl,
  getPlanBillingPortalUrl,
  getPlanPrelimitWarning,
  getPlanValuePitch,
  getPlanFeatureHighlights,
  getPlanUsageModel,
  getBillingStatusModel
} =
  accountPlanUtils;
const billingActions = window.InvoiceBillingActions;
if (!billingActions) {
  throw new Error("Missing /utils/billingActions.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  hasStripeCheckout,
  hasStripePortal,
  getGooglePlaySubscriptionPlans,
  hasGooglePlayLifetimePurchase,
  hasGooglePlayRestore,
  startUpgradeCheckout,
  startLifetimePurchase,
  restoreGooglePlayPurchases,
  openBillingPortal,
  isAndroidNativePlatform
} = billingActions;

const requestIdentity = window.InvoiceRequestIdentity;
if (!requestIdentity) {
  throw new Error("Missing /utils/requestIdentity.js load. Ensure it is loaded before /launcher.jsx.");
}
const publicConfig = window.InvoicePublicConfig && typeof window.InvoicePublicConfig === "object" ? window.InvoicePublicConfig : {};
const internalBillingDebugEnabled = Boolean(publicConfig.internalBillingDebug);
const nativeGoogleSignInTimeoutMs = 60000;

const {
  apiFetch,
  getAuthSession,
  getPublicGoogleClientId,
  getGoogleAuthStartUrl,
  refreshSession,
  requestSignInLink,
  loadAuthProviders,
  completeEmailLinkSignIn,
  completeRedirectSignIn,
  signOut
} =
  requestIdentity;
const clientMemoryUtils = window.InvoiceClientMemory;
if (!clientMemoryUtils) {
  throw new Error("Missing /utils/clientMemory.js load. Ensure it is loaded before /launcher.jsx.");
}
const { getClientMemory, getClientRecurringInterval } = clientMemoryUtils;
const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
if (!lineItemLibraryUtils) {
  throw new Error("Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /launcher.jsx.");
}
const { getLineItemLibrary } = lineItemLibraryUtils;
const onboardingUtils = window.InvoiceOnboardingState;
if (!onboardingUtils) {
  throw new Error("Missing /utils/onboardingState.js load. Ensure it is loaded before /launcher.jsx.");
}

const {
  buildStatus: buildOnboardingStatus,
  activateWalkthrough: activateOnboardingWalkthrough,
  subscribe: subscribeToOnboardingState,
  acknowledgeCompletion: acknowledgeOnboardingCompletion
} = onboardingUtils;

const launcherSectionUtils = window.InvoiceLauncherSections;
if (!launcherSectionUtils) {
  throw new Error(
    "Missing /features/launcher/launcherSections.jsx load. Ensure it is loaded before /launcher.jsx."
  );
}

const {
  AccountStrip,
  OperationsQueueSection,
  OnboardingSection,
  DraftRecoverySection,
  StartSection,
  AlternateStartsSection,
  ManageSection,
  AuthModal
} = launcherSectionUtils;
const launcherHelperUtils = window.InvoiceLauncherHelpers;
if (!launcherHelperUtils) {
  throw new Error(
    "Missing /features/launcher/launcherHelpers.js load. Ensure it is loaded before /launcher.jsx."
  );
}

const {
  readBillingNoticeFromUrl,
  isValidEmail,
  isDiagnosticsHost,
  buildLauncherOptions,
  buildPlanActionState,
  hasResumeDraftForKey
} = launcherHelperUtils;
const normalizeGoogleClientId = (value) => (typeof value === "string" ? value.trim() : "");
const resolveNativeGoogleClientId = (provider) => {
  const providerClientId = normalizeGoogleClientId(provider?.clientId);
  if (providerClientId) {
    return providerClientId;
  }
  return typeof getPublicGoogleClientId === "function" ? normalizeGoogleClientId(getPublicGoogleClientId()) : "";
};
const intakeReadinessUtils = window.InvoiceIntakeReadiness;
if (!intakeReadinessUtils) {
  throw new Error("Missing /features/intake/readiness.js load. Ensure it is loaded before /launcher.jsx.");
}

const { buildDraftFromFinishedInvoice } = intakeReadinessUtils;

const deferredFeatureScriptPromises = new Map();

const ROUTE_SCRIPT_GROUPS = {
  businessBranding: [
    "/utils/brandTheme.js",
    "/utils/manualStyleCatalog.js",
    "/utils/businessProfile.js",
    "/utils/logoImage.js"
  ],
  payments: ["/utils/paymentMethods.js", "/utils/paymentProgress.js"],
  workflow: ["/utils/estimateWorkflow.js", "/utils/recurring.js"],
  intakeCore: [
    "/features/intake/controller.js",
    "/features/intake/runtime.js",
    "/features/intake/orchestration.js",
    "/features/intake/actions.js",
    "/features/intake/reviewModel.js",
    "/features/intake/aiIntakeHelpers.js"
  ],
  manualSupport: [
    "/features/manual/manualDraftStorage.js",
    "/features/manual/assistantCommandHelpers.js",
    "/features/manual/smartRateSuggestions.js"
  ]
};

const FEATURE_ROUTES = {
  aiIntake: {
    loadingTitle: "Billie workspace",
    globalName: "InvoiceIntakeFeature",
    componentName: "AIIntake",
    scripts: [
      ...ROUTE_SCRIPT_GROUPS.businessBranding,
      "/utils/importCleanup.js",
      ...ROUTE_SCRIPT_GROUPS.intakeCore,
      ...ROUTE_SCRIPT_GROUPS.manualSupport,
      "/dist/features/intake/reviewCard.js",
      "/dist/features/intake/decisionPanel.js",
      "/dist/features/intake/aiIntake.js"
    ]
  },
  library: {
    loadingTitle: "invoice library",
    globalName: "InvoiceLibraryFeature",
    componentName: "InvoiceLibrary",
    scripts: [...ROUTE_SCRIPT_GROUPS.workflow, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/library/invoiceLibrary.js"]
  },
  manual: {
    loadingTitle: "invoice editor",
    globalName: "InvoiceManualCanvas",
    componentName: "ManualInvoiceCanvas",
    scripts: [
      ...ROUTE_SCRIPT_GROUPS.businessBranding,
      ...ROUTE_SCRIPT_GROUPS.payments,
      ...ROUTE_SCRIPT_GROUPS.workflow,
      ...ROUTE_SCRIPT_GROUPS.manualSupport,
      "/dist/features/manual/inspectorPanel.js",
      "/dist/features/manual/manualInvoiceCanvas.js"
    ]
  },
  import: {
    loadingTitle: "import review",
    globalName: "InvoiceImportFeature",
    componentName: "ImportInvoice",
    scripts: [...ROUTE_SCRIPT_GROUPS.businessBranding, "/dist/features/import/importInvoice.js"]
  },
  diagnostics: {
    loadingTitle: "diagnostics",
    globalName: "InvoiceDiagnosticsFeature",
    componentName: "IntakeDiagnostics",
    scripts: ["/dist/features/diagnostics/intakeDiagnostics.js"]
  },
  businessIdentity: {
    loadingTitle: "business settings",
    globalName: "InvoiceBusinessIdentityFeature",
    componentName: "BusinessIdentitySettings",
    scripts: [...ROUTE_SCRIPT_GROUPS.businessBranding, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/settings/businessIdentity.js"]
  },
  clientMemory: {
    loadingTitle: "client memory",
    globalName: "InvoiceBusinessIdentityFeature",
    componentName: "ClientMemorySettings",
    scripts: [...ROUTE_SCRIPT_GROUPS.businessBranding, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/settings/businessIdentity.js"]
  },
  services: {
    loadingTitle: "service catalog",
    globalName: "InvoiceBusinessIdentityFeature",
    componentName: "ServiceCatalogSettings",
    scripts: [...ROUTE_SCRIPT_GROUPS.businessBranding, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/settings/businessIdentity.js"]
  },
  clientWorkspace: {
    loadingTitle: "client workspace",
    globalName: "InvoiceClientWorkspaceFeature",
    componentName: "ClientWorkspacePage",
    scripts: [...ROUTE_SCRIPT_GROUPS.workflow, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/settings/clientWorkspace.js"]
  },
  operatorDashboard: {
    loadingTitle: "dashboard",
    globalName: "InvoiceOperatorDashboardFeature",
    componentName: "OperatorDashboardPage",
    scripts: ["/utils/dashboardMetrics.js", ...ROUTE_SCRIPT_GROUPS.workflow, ...ROUTE_SCRIPT_GROUPS.payments, "/dist/features/settings/operatorDashboard.js"]
  },
  scratchpad: {
    loadingTitle: "daily scratchpad",
    globalName: "InvoiceScratchpadPage",
    componentName: "DailyScratchpadPage",
    scripts: ["/dist/features/scratchpad/dailyScratchpad.js"]
  },
  clientPortal: {
    loadingTitle: "client portal",
    globalName: "InvoicePortalFeature",
    componentName: "ClientPortalPage",
    scripts: ["/utils/paymentMethods.js", "/dist/features/portal/clientPortal.js"]
  }
};

function loadScriptOnce(src) {
  const normalizedSrc = typeof src === "string" ? src.trim() : "";
  if (!normalizedSrc) {
    return Promise.resolve();
  }
  if (deferredFeatureScriptPromises.has(normalizedSrc)) {
    return deferredFeatureScriptPromises.get(normalizedSrc);
  }
  const existing = document.querySelector(`script[src="${normalizedSrc}"]`);
  if (existing) {
    const readyPromise = Promise.resolve();
    deferredFeatureScriptPromises.set(normalizedSrc, readyPromise);
    return readyPromise;
  }
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = normalizedSrc;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load ${normalizedSrc}`));
    document.body.appendChild(script);
  });
  deferredFeatureScriptPromises.set(normalizedSrc, promise);
  return promise;
}

function loadFeatureScripts(scripts) {
  return (Array.isArray(scripts) ? scripts : []).reduce(
    (chain, src) => chain.then(() => loadScriptOnce(src)),
    Promise.resolve()
  );
}

function resolveFeatureComponent(globalName, componentName) {
  const registry = globalName ? window[globalName] : null;
  const component = registry && componentName ? registry[componentName] : null;
  if (typeof component !== "function") {
    throw new Error(`Missing ${componentName} from ${globalName}.`);
  }
  return component;
}

function deriveTaxRate(invoice) {
  if (!invoice) {
    return "0";
  }
  const subtotal = Number(invoice.subtotal);
  const total = Number(invoice.total);
  if (!Number.isFinite(subtotal) || !Number.isFinite(total) || subtotal <= 0) {
    return "0";
  }
  const taxAmount = total - subtotal;
  if (taxAmount <= 0) {
    return "0";
  }
  return ((taxAmount / subtotal) * 100).toFixed(2);
}

function parseDisplayTimestamp(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const AUTH_PENDING_RETURN_PATH_STORAGE_KEY = "invoiceAuthPendingReturnPath";
const GOOGLE_NATIVE_AUTH_MARKER = "nativeAuth";
const GOOGLE_NATIVE_AUTH_SCHEME = "app.notebill.app";
const GOOGLE_NATIVE_AUTH_HOST = "auth";
const GOOGLE_NATIVE_AUTH_PATH = "/google";

function sanitizeInternalAppPath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  try {
    const parsed = new URL(raw, "https://notebill.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return "/";
  }
}

function markNativeGoogleAuthReturnPath(value) {
  const path = sanitizeInternalAppPath(value);
  try {
    const parsed = new URL(path, "https://notebill.local");
    parsed.searchParams.set(GOOGLE_NATIVE_AUTH_MARKER, "1");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return `${path}${path.includes("?") ? "&" : "?"}${GOOGLE_NATIVE_AUTH_MARKER}=1`;
  }
}

function stripNativeGoogleAuthMarker(value) {
  const path = sanitizeInternalAppPath(value);
  try {
    const parsed = new URL(path, "https://notebill.local");
    const isNative = parsed.searchParams.get(GOOGLE_NATIVE_AUTH_MARKER) === "1";
    if (isNative) {
      parsed.searchParams.delete(GOOGLE_NATIVE_AUTH_MARKER);
    }
    return {
      path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      native: isNative
    };
  } catch (_error) {
    return {
      path,
      native: false
    };
  }
}

function buildGoogleNativeAuthDeepLink(hashParams, nextPath) {
  const params = new URLSearchParams(hashParams);
  const cleanNext = stripNativeGoogleAuthMarker(nextPath).path;
  params.set("next", cleanNext);
  params.set("nativeAuth", "1");
  return `https://app.notebill.app${GOOGLE_NATIVE_AUTH_PATH}?${params.toString()}`;
}

function parseGoogleNativeAuthDeepLink(rawUrl) {
  const text = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!text) {
    return null;
  }
  try {
    const parsed = new URL(text);
    const queryParams = new URLSearchParams(parsed.search || "");
    const hashParams = new URLSearchParams((parsed.hash || "").replace(/^#/, ""));
    const tokenParams = queryParams.size > 0 ? queryParams : hashParams;
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "app.notebill.app" &&
      parsed.pathname === GOOGLE_NATIVE_AUTH_PATH
    ) {
      const nextPath = stripNativeGoogleAuthMarker(tokenParams.get("next") || "/").path;
      tokenParams.set("next", nextPath);
      return `/auth/google?${tokenParams.toString()}`;
    }
    if (parsed.protocol === "intent:") {
      const nextPath = stripNativeGoogleAuthMarker(tokenParams.get("next") || "/").path;
      tokenParams.set("next", nextPath);
      return `/auth/google?${tokenParams.toString()}`;
    }
    if (parsed.protocol === "android-app:") {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const scheme = pathParts[0] || "";
      const host = pathParts[1] || "";
      const route = `/${pathParts.slice(2).join("/")}`;
      if (scheme !== GOOGLE_NATIVE_AUTH_SCHEME || host !== GOOGLE_NATIVE_AUTH_HOST || route !== GOOGLE_NATIVE_AUTH_PATH) {
        return null;
      }
      const nextPath = stripNativeGoogleAuthMarker(tokenParams.get("next") || "/").path;
      tokenParams.set("next", nextPath);
      return `/auth/google?${tokenParams.toString()}`;
    }
    if (
      parsed.protocol !== `${GOOGLE_NATIVE_AUTH_SCHEME}:` ||
      parsed.hostname !== GOOGLE_NATIVE_AUTH_HOST ||
      parsed.pathname !== GOOGLE_NATIVE_AUTH_PATH
    ) {
      return null;
    }
    const nextPath = stripNativeGoogleAuthMarker(tokenParams.get("next") || "/").path;
    tokenParams.set("next", nextPath);
    return `/auth/google?${tokenParams.toString()}`;
  } catch (_error) {
    return null;
  }
}

function writePendingAuthReturnPath(value) {
  const nextPath = sanitizeInternalAppPath(value);
  try {
    window.sessionStorage.setItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY, nextPath);
  } catch (_error) {
    // Best-effort only.
  }
  return nextPath;
}

function consumePendingAuthReturnPath() {
  try {
    const stored = window.sessionStorage.getItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_PENDING_RETURN_PATH_STORAGE_KEY);
    return sanitizeInternalAppPath(stored);
  } catch (_error) {
    return "/";
  }
}

function describeAuthReturnPath(value) {
  const path = stripNativeGoogleAuthMarker(value).path;
  if (path.startsWith("/settings/business")) {
    return "After sign-in, you'll go straight to branding setup.";
  }
  if (path.startsWith("/settings/memory")) {
    return "After sign-in, you'll go straight to saved client details.";
  }
  if (path.startsWith("/settings/services")) {
    return "After sign-in, you'll go straight to the service catalog.";
  }
  if (path.startsWith("/manual")) {
    return "After sign-in, you'll return to the invoice editor.";
  }
  if (path.startsWith("/invoices")) {
    return "After sign-in, you'll return to the invoice library.";
  }
  if (path.startsWith("/ai-intake")) {
    return "After sign-in, you'll return to Billie intake.";
  }
  return "After sign-in, you'll come right back here.";
}

function getInvoiceDueDateValue(invoice) {
  return invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "";
}

function getInvoiceOpenBalance(invoice) {
  const amount = Number(
    invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? invoice?.total
  );
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

function formatUpdatedLabel(value) {
  if (!value) {
    return "";
  }
  const parsed = parseDisplayTimestamp(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const date = new Date(parsed);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }
  const parsed = parseDisplayTimestamp(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyLabel(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}

function parseRecurringTimestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function readRecurringSchedules(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    const entries =
      parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : {};
    return Object.entries(entries).reduce((nextEntries, [invoiceId, entry]) => {
      if (!invoiceId || !entry || typeof entry !== "object") {
        return nextEntries;
      }
      const intervalDays = normalizeRecurringInterval(entry.intervalDays);
      const nextDueAt = new Date(parseRecurringTimestamp(entry.nextDueAt)).toISOString();
      nextEntries[invoiceId] = {
        intervalDays,
        nextDueAt,
        autoSendEnabled: Boolean(entry.autoSendEnabled),
        lastAutoSendAt:
          typeof entry.lastAutoSendAt === "string" && entry.lastAutoSendAt.trim()
            ? entry.lastAutoSendAt
            : "",
        lastAutoSendRecipient:
          typeof entry.lastAutoSendRecipient === "string" ? entry.lastAutoSendRecipient.trim().toLowerCase() : ""
      };
      return nextEntries;
    }, {});
  } catch (_error) {
    return {};
  }
}

function writeRecurringSchedules(storageKey, entries) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ entries }));
  } catch (_error) {
    // Best-effort only.
  }
}

function buildRepeatWorkStarter(clientMemoryEntries, savedLineItems) {
  const memoryEntries = Array.isArray(clientMemoryEntries) ? clientMemoryEntries : [];
  const items = Array.isArray(savedLineItems) ? savedLineItems : [];
  const candidates = memoryEntries
    .map((entry) => {
      const normalizedName = typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : "";
      if (!normalizedName) {
        return null;
      }
      const matchingItems = items
        .filter((item) => typeof item?.clientName === "string" && item.clientName.trim().toLowerCase() === normalizedName)
        .sort((left, right) => {
          const usageDelta = Number(right?.usageCount ?? 0) - Number(left?.usageCount ?? 0);
          if (usageDelta !== 0) {
            return usageDelta;
          }
          return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
        });
      if (!matchingItems.length) {
        return null;
      }
      return {
        entry,
        leadItem: matchingItems[0],
        savedItemCount: matchingItems.length
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(right.entry?.updatedAt ?? "").localeCompare(String(left.entry?.updatedAt ?? "")));
  return candidates[0] ?? null;
}

function buildRepeatWorkStarterForClient(clientName, clientMemoryEntries, savedLineItems) {
  const normalizedTarget = typeof clientName === "string" ? clientName.trim().toLowerCase() : "";
  if (!normalizedTarget) {
    return null;
  }
  return (
    (Array.isArray(clientMemoryEntries) ? clientMemoryEntries : [])
      .map((entry) => {
        const normalizedName = typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : "";
        if (!normalizedName || normalizedName !== normalizedTarget) {
          return null;
        }
        const matchingItems = (Array.isArray(savedLineItems) ? savedLineItems : [])
          .filter((item) => typeof item?.clientName === "string" && item.clientName.trim().toLowerCase() === normalizedTarget)
          .sort((left, right) => {
            const usageDelta = Number(right?.usageCount ?? 0) - Number(left?.usageCount ?? 0);
            if (usageDelta !== 0) {
              return usageDelta;
            }
            return String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? ""));
          });
        if (!matchingItems.length) {
          return null;
        }
        return {
          entry,
          leadItem: matchingItems[0],
          savedItemCount: matchingItems.length
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(right.entry?.updatedAt ?? "").localeCompare(String(left.entry?.updatedAt ?? "")))[0] ?? null
  );
}

function normalizeRecurringInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1) {
    return 30;
  }
  return Math.min(rounded, 365);
}

function formatRecurringCadence(intervalDays) {
  const normalized = normalizeRecurringInterval(intervalDays);
  if (normalized === 7) {
    return "weekly";
  }
  if (normalized === 14) {
    return "biweekly";
  }
  if (normalized === 30) {
    return "monthly";
  }
  return `${normalized}-day`;
}

function buildBillieWorkspaceStarterInstruction(finishedInvoice, defaultInstruction) {
  const hasLineItems = Array.isArray(finishedInvoice?.lineItems)
    ? finishedInvoice.lineItems.some(
        (lineItem) => typeof lineItem?.description === "string" && lineItem.description.trim()
      )
    : false;
  const hasNotes = typeof finishedInvoice?.notes === "string" && finishedInvoice.notes.trim().length > 0;
  if (hasLineItems && hasNotes) {
    return (
      defaultInstruction ||
      "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
    );
  }
  if (hasLineItems) {
    return "Refine the invoice wording so this saved draft feels polished and client-ready. Keep numbers unchanged.";
  }
  if (hasNotes) {
    return "Refine the notes so this saved draft feels polished and client-ready. Keep numbers unchanged.";
  }
  return "Refine the client-facing wording and presentation while keeping numbers unchanged.";
}

function buildLauncherPostReminderNextStepNotice(invoice) {
  const paymentLinkReady = Boolean(String(invoice?.paymentLinkUrl ?? "").trim());
  const deliveryOpened = Boolean(invoice?.delivery?.openedAt) || invoice?.delivery?.status === "opened";
  const dueDateValue = getInvoiceDueDateValue(invoice);
  const dueDateMs = toTimestamp(dueDateValue);
  const isPastDue =
    invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs > 0 && dueDateMs <= Date.now();

  if (!paymentLinkReady) {
    return "Next: add a hosted payment link so the follow-up points to an easier payment path.";
  }
  if (isPastDue && deliveryOpened) {
    return "Next: watch for payment and mark it paid as soon as the money lands.";
  }
  if (isPastDue && !deliveryOpened) {
    return "Next: if it still stays unopened, re-send it or confirm the best delivery route.";
  }
  return "Next: watch for a reply or payment before nudging again.";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const RECURRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function buildLauncherOperationsSummary(invoices, options = {}, nowMs = Date.now()) {
  const activeInvoices = Array.isArray(invoices)
    ? invoices.filter((invoice) => invoice && invoice.status !== "deleted")
    : [];
  const clientMemoryEntries = Array.isArray(options?.clientMemoryEntries) ? options.clientMemoryEntries : [];
  const savedLineItems = Array.isArray(options?.savedLineItems) ? options.savedLineItems : [];
  const recurringSchedulesByInvoiceId =
    options?.recurringSchedulesByInvoiceId && typeof options.recurringSchedulesByInvoiceId === "object"
      ? options.recurringSchedulesByInvoiceId
      : {};
  const resolveRecurringInterval =
    typeof options?.getRecurringInterval === "function" ? options.getRecurringInterval : () => null;
  const byUpdatedDesc = (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
  const drafts = activeInvoices.filter((invoice) => invoice.status === "draft").sort(byUpdatedDesc);
  const sent = activeInvoices.filter((invoice) => invoice.status === "sent").sort(byUpdatedDesc);
  const unpaidSent = sent.filter((invoice) => getInvoiceOpenBalance(invoice) > 0);
  const paid = activeInvoices.filter((invoice) => invoice.status === "paid").sort(byUpdatedDesc);
  const recurringReminderInvoices = activeInvoices
    .map((invoice) => {
      const recurringEntry = recurringSchedulesByInvoiceId[invoice.invoiceId];
      if (!recurringEntry) {
        return null;
      }
      return {
        ...invoice,
        recurringEntry,
        nextDueMs: parseRecurringTimestamp(recurringEntry.nextDueAt)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.nextDueMs - right.nextDueMs);
  const dueRecurringInvoices = recurringReminderInvoices.filter((invoice) => invoice.nextDueMs <= nowMs);
  const upcomingRecurringInvoices = recurringReminderInvoices.filter(
    (invoice) => invoice.nextDueMs > nowMs && invoice.nextDueMs - nowMs <= RECURRING_SOON_WINDOW_MS
  );
  const nextRecurringCandidate = (dueRecurringInvoices[0] ?? recurringReminderInvoices[0]) || null;
  const staleSent = unpaidSent
    .map((invoice) => {
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = toTimestamp(dueDateValue);
      const daysSinceUpdate = Math.max(0, Math.floor((nowMs - toTimestamp(invoice.updatedAt)) / 86400000));
      const isPastDue = dueDateMs > 0 && dueDateMs <= nowMs;
      return {
        invoice,
        daysSinceUpdate,
        dueDateValue,
        dueDateMs,
        isPastDue
      };
    })
    .filter((entry) => entry.isPastDue || entry.daysSinceUpdate >= 14)
    .sort((a, b) => {
      if (a.isPastDue !== b.isPastDue) {
        return a.isPastDue ? -1 : 1;
      }
      if (a.isPastDue && b.isPastDue) {
        return a.dueDateMs - b.dueDateMs;
      }
      return b.daysSinceUpdate - a.daysSinceUpdate;
    });
  const paymentLinkInvoice = unpaidSent.find((invoice) => invoice.paymentLinkUrl);
  const repeatCandidate = paid[0];
  const openBalance = unpaidSent.reduce((sum, invoice) => sum + getInvoiceOpenBalance(invoice), 0);
  const actions = [];
  const latestDraft = drafts[0];
  if (latestDraft) {
    actions.push({
      id: `resume:${latestDraft.invoiceId}`,
      tone: "draft",
      title: "Resume latest draft",
      detail: `${latestDraft.invoiceNumber || "Draft invoice"} was updated ${
        formatUpdatedLabel(latestDraft.updatedAt) || "recently"
      }. Reopen it without losing your place, then keep moving toward save, send, or payment setup.`,
      cta: "Resume draft",
      ariaLabel: `Resume ${latestDraft.invoiceNumber || "draft invoice"}`,
      action: "resume-draft",
      invoiceId: latestDraft.invoiceId,
      secondaryCta: "Open with Billie",
      secondaryAction: "resume-with-billie",
      secondaryAriaLabel: `Open ${latestDraft.invoiceNumber || "draft invoice"} with Billie`,
      secondaryBusyId: `resume-billie:${latestDraft.invoiceId}`
    });
  }
  if (staleSent[0]) {
    const { invoice, daysSinceUpdate, dueDateValue, isPastDue } = staleSent[0];
    const delivery = invoice?.delivery ?? null;
    const reminderRecipient = delivery?.recipientEmail ?? "";
    const hasTrackedDelivery = Boolean(delivery?.recipientEmail) && Boolean(delivery?.sentAt);
    const deliveryOpened = Boolean(delivery?.openedAt) || delivery?.status === "opened";
    const canSendReminder = reminderRecipient.trim().length > 0;
    const dueDateLabel = formatUpdatedLabel(dueDateValue);
    const openBalanceLabel = formatMoneyLabel(getInvoiceOpenBalance(invoice));
    const overdueLabel =
      isPastDue && dueDateLabel
        ? `${invoice.invoiceNumber || "Sent invoice"} was due ${dueDateLabel}.`
        : `${invoice.invoiceNumber || "Sent invoice"} has been open for ${daysSinceUpdate} days.`;
    let followUpTitle = "Follow up on sent invoice";
    let followUpDetail = `${overdueLabel} Open balance: ${openBalanceLabel}.`;
    let followUpCta = canSendReminder ? "Send reminder" : "Review follow-ups";
    let followUpAction = canSendReminder ? "send-reminder" : "open-library";
    let followUpBusyId = canSendReminder ? `reminder:${invoice.invoiceId}` : undefined;
    let followUpAriaLabel = canSendReminder
      ? `Send reminder for ${invoice.invoiceNumber || "sent invoice"}`
      : undefined;
    if (!hasTrackedDelivery) {
      followUpTitle = "Track delivery for sent invoice";
      followUpDetail = `${overdueLabel} Delivery is not being tracked yet, so it is worth confirming the send first before you lean on reminders or payment follow-up.`;
      followUpCta = "Review send flow";
      followUpAction = "open-library";
      followUpBusyId = undefined;
      followUpAriaLabel = undefined;
    } else if (isPastDue && !deliveryOpened) {
      followUpTitle = "Re-send or confirm delivery";
      followUpDetail = `${overdueLabel} The client still has not opened it. Put the invoice back in front of them or confirm delivery before you escalate into a payment reminder.`;
      followUpCta = "Review delivery";
      followUpAction = "open-library";
      followUpBusyId = undefined;
      followUpAriaLabel = undefined;
    } else if (isPastDue && deliveryOpened) {
      followUpTitle = "Send focused reminder";
      followUpDetail = `${overdueLabel} The client already opened it, so a short direct reminder is the cleanest next move.`;
      followUpCta = canSendReminder ? "Send focused reminder" : "Review follow-ups";
      followUpAction = canSendReminder ? "send-reminder" : "open-library";
      followUpBusyId = canSendReminder ? `reminder:${invoice.invoiceId}` : undefined;
      followUpAriaLabel = canSendReminder
        ? `Send reminder for ${invoice.invoiceNumber || "sent invoice"}`
        : undefined;
    } else if (canSendReminder) {
      followUpDetail = `${overdueLabel} Open balance: ${openBalanceLabel}. Last sent to ${reminderRecipient}.`;
    }
    actions.push({
      id: `follow-up:${invoice.invoiceId}`,
      tone: "follow-up",
      title: followUpTitle,
      detail: followUpDetail,
      cta: followUpCta,
      ariaLabel: followUpAriaLabel,
      action: followUpAction,
      busyId: followUpBusyId,
      secondaryCta: "Mark paid",
      secondaryAction: "mark-paid",
      secondaryAriaLabel: `Mark ${invoice.invoiceNumber || "sent invoice"} paid`,
      secondaryBusyId: `mark-paid:${invoice.invoiceId}`,
      invoiceId: invoice.invoiceId
    });
  } else if (unpaidSent.length > 0) {
    actions.push({
      id: "sent:review",
      tone: "sent",
      title: "Track sent invoices",
      detail: `${pluralize(unpaidSent.length, "sent invoice")} still ${
        unpaidSent.length === 1 ? "needs" : "need"
      } payment tracking. Open balance: ${formatMoneyLabel(openBalance)}.`,
      cta: "Open sent work",
      action: "open-library"
    });
  }
  if (nextRecurringCandidate) {
    const dueLabel = formatUpdatedLabel(nextRecurringCandidate.recurringEntry?.nextDueAt);
    const recurringIsDueNow = nextRecurringCandidate.nextDueMs <= nowMs;
    const recurringIsSoon =
      !recurringIsDueNow && nextRecurringCandidate.nextDueMs - nowMs <= RECURRING_SOON_WINDOW_MS;
    const recurringMemoryStarter = buildRepeatWorkStarterForClient(
      nextRecurringCandidate.customerName ?? "",
      clientMemoryEntries,
      savedLineItems
    );
    const recurringMemoryLabel = recurringMemoryStarter?.leadItem?.description || "";
    actions.push({
      id: `recurring:${nextRecurringCandidate.invoiceId}`,
      tone: recurringIsDueNow ? "repeat-due" : recurringIsSoon ? "repeat-soon" : "repeat",
      title: recurringIsDueNow
        ? "Recurring invoice due now"
        : recurringIsSoon
          ? "Recurring invoice due soon"
          : "Recurring invoice coming up",
      detail: recurringIsDueNow
        ? `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
            nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
          } is due${dueLabel ? ` ${dueLabel}` : " soon"}. Reopen it now so the repeat job keeps moving.${
            recurringMemoryLabel ? ` Saved ${recurringMemoryLabel} memory is ready too.` : ""
          }`
        : recurringIsSoon
          ? `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
              nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
            } is next due${dueLabel ? ` ${dueLabel}` : " soon"}. Start it early so the repeat job is ready before it lands on you.${
              recurringMemoryLabel ? ` Saved ${recurringMemoryLabel} memory is ready too.` : ""
            }`
          : `${nextRecurringCandidate.invoiceNumber || "Draft invoice"}${
              nextRecurringCandidate.customerName ? ` for ${nextRecurringCandidate.customerName}` : ""
            } is next due${dueLabel ? ` ${dueLabel}` : " soon"}. Open it early if you want a head start.${
              recurringMemoryLabel ? ` Saved ${recurringMemoryLabel} memory is ready too.` : ""
            }`,
      cta: recurringIsDueNow ? "Open repeat invoice" : recurringIsSoon ? "Prep repeat invoice" : "Start early",
      ariaLabel: `Open repeat invoice from ${nextRecurringCandidate.invoiceNumber || "saved invoice"}`,
      action: "invoice-again",
      busyId: `invoice-again:${nextRecurringCandidate.invoiceId}`,
      invoiceId: nextRecurringCandidate.invoiceId,
      secondaryCta: recurringMemoryStarter ? "Start with saved details" : undefined,
      secondaryAction: recurringMemoryStarter ? "start-from-memory" : undefined,
      secondaryAriaLabel: recurringMemoryStarter
        ? `Start upcoming repeat invoice with saved details for ${
            nextRecurringCandidate.customerName || "repeat client"
          }`
        : undefined,
      memoryClientName: recurringMemoryStarter?.entry?.name || ""
    });
  }
  if (repeatCandidate) {
    const repeatMemoryStarter = buildRepeatWorkStarterForClient(
      repeatCandidate.customerName ?? "",
      clientMemoryEntries,
      savedLineItems
    );
    const repeatRecurringInterval = resolveRecurringInterval(repeatCandidate.customerName ?? "");
    const repeatRecurringLabel = repeatRecurringInterval ? formatRecurringCadence(repeatRecurringInterval) : "";
    const repeatMemoryLabel = repeatMemoryStarter?.leadItem?.description || "";
    let repeatDetail = `Start a fresh editable draft from ${
      repeatCandidate.invoiceNumber || "a paid invoice"
    }${repeatCandidate.customerName ? ` for ${repeatCandidate.customerName}` : ""}.`;
    if (repeatRecurringLabel && repeatMemoryLabel) {
      repeatDetail += ` Saved ${repeatRecurringLabel} cadence and ${repeatMemoryLabel} memory are ready.`;
    } else if (repeatRecurringLabel) {
      repeatDetail += ` Saved ${repeatRecurringLabel} cadence is ready for the next job.`;
    } else if (repeatMemoryLabel) {
      repeatDetail += ` Saved ${repeatMemoryLabel} memory is ready to prefill the next draft.`;
    }
    actions.push({
      id: `invoice-again:${repeatCandidate.invoiceId}`,
      tone: "repeat",
      title: "Invoice a repeat client",
      detail: repeatDetail,
      cta: "Invoice again",
      ariaLabel: `Invoice again from ${repeatCandidate.invoiceNumber || "paid invoice"}`,
      action: "invoice-again",
      busyId: `invoice-again:${repeatCandidate.invoiceId}`,
      invoiceId: repeatCandidate.invoiceId,
      secondaryCta: repeatMemoryStarter ? "Start with saved details" : undefined,
      secondaryAction: repeatMemoryStarter ? "start-from-memory" : undefined,
      secondaryAriaLabel: repeatMemoryStarter
        ? `Start with saved details for ${repeatCandidate.customerName || "repeat client"}`
        : undefined,
      memoryClientName: repeatMemoryStarter?.entry?.name || ""
    });
  }
  if (paymentLinkInvoice?.paymentLinkUrl) {
    actions.push({
      id: `pay-link:${paymentLinkInvoice.invoiceId}`,
      tone: "payment",
      title: "Hosted payment link ready",
      detail: `${paymentLinkInvoice.invoiceNumber || "Invoice"} has a hosted payment link.`,
      cta: "Open hosted payment link",
      href: paymentLinkInvoice.paymentLinkUrl,
      action: "open-link"
    });
  }
  const actionRank = {
    "follow-up": 0,
    "repeat-due": 1,
    "repeat-soon": 2,
    draft: 3,
    payment: 4,
    repeat: 5,
    sent: 6
  };
  const recurringDueCount = dueRecurringInvoices.length;
  const recurringSoonCount = upcomingRecurringInvoices.length;
  const nextRecurringSoon = upcomingRecurringInvoices[0] ?? null;
  const nextRecurringSoonLabel = formatUpdatedLabel(nextRecurringSoon?.recurringEntry?.nextDueAt);
  return {
    hasInvoices: activeInvoices.length > 0,
    invoiceCount: activeInvoices.length,
    draftCount: drafts.length,
    sentCount: sent.length,
    paidCount: paid.length,
    staleSentCount: staleSent.length,
    recurringDueCount,
    recurringSoonCount,
    openBalance,
    openBalanceLabel: formatMoneyLabel(openBalance),
    headline:
      staleSent.length > 0
        ? `${staleSent.length === 1 ? "1 invoice needs" : `${staleSent.length} invoices need`} follow-up.`
        : recurringDueCount > 0
          ? `${recurringDueCount === 1 ? "1 recurring invoice is due now." : `${recurringDueCount} recurring invoices are due now.`}`
        : recurringSoonCount > 0
          ? `${
              recurringSoonCount === 1
                ? `1 recurring invoice is due soon${nextRecurringSoonLabel ? ` on ${nextRecurringSoonLabel}` : ""}.`
                : `${recurringSoonCount} recurring invoices are due soon.`
            }`
        : unpaidSent.length > 0
          ? `${formatMoneyLabel(openBalance)} open across ${pluralize(unpaidSent.length, "sent invoice")}.`
          : drafts.length > 0
            ? `${pluralize(drafts.length, "draft")} waiting to finish.`
            : "All caught up.",
    actions: actions
      .sort((left, right) => (actionRank[left.tone] ?? 99) - (actionRank[right.tone] ?? 99))
      .slice(0, 3)
  };
}

function Launcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authSession, setAuthSession] = useState(() => getAuthSession?.() ?? null);
  const [onboardingStatus, setOnboardingStatus] = useState(() =>
    buildOnboardingStatus({ authSession: getAuthSession?.() ?? null })
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authEmailError, setAuthEmailError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authPreviewUrl, setAuthPreviewUrl] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authFlow, setAuthFlow] = useState("");
  const [authLinkSentAt, setAuthLinkSentAt] = useState(0);
  const [, setAuthLinkTicker] = useState(0);
  const [authError, setAuthError] = useState("");
  const [authProviders, setAuthProviders] = useState([]);
  const [authProvidersBusy, setAuthProvidersBusy] = useState(false);
  const [authProvidersError, setAuthProvidersError] = useState("");
  const [authSuccessNotice, setAuthSuccessNotice] = useState("");
  const [authReturnPath, setAuthReturnPath] = useState("/");
  const [accountPlan, setAccountPlan] = useState(null);
  const [billingNotice, setBillingNotice] = useState(null);
  const preferEmailFirstOnWeb = typeof window !== "undefined" ? !isAndroidNativePlatform() : true;
  const guestEntryStorageKey =
    requestIdentity.getScopedStorageKey?.("guestEntryDismissed") ?? "invoiceGuestEntryDismissed";
  const [guestEntryDismissed, setGuestEntryDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (internalBillingDebugEnabled) {
      return true;
    }
    return window.localStorage.getItem(guestEntryStorageKey) === "true";
  });
  const showDiagnosticsLink =
    typeof window !== "undefined" && isDiagnosticsHost(window.location.hostname);
  const authLinkCooldownSeconds = authLinkSentAt
    ? Math.max(0, Math.ceil((authLinkSentAt + 30_000 - Date.now()) / 1000))
    : 0;

  useEffect(() => {
    const notice = readBillingNoticeFromUrl();
    if (notice) {
      setBillingNotice(notice);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(guestEntryStorageKey, guestEntryDismissed ? "true" : "false");
  }, [guestEntryDismissed, guestEntryStorageKey]);

  useEffect(() => {
    if (authSession?.userId) {
      return;
    }
    if (searchParams.get("auth") !== "sign-in") {
      return;
    }
    const requestedReturnPath = sanitizeInternalAppPath(searchParams.get("returnTo"));
    openSignInModal({ returnTo: requestedReturnPath });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("auth");
    nextParams.delete("returnTo");
    setSearchParams(nextParams, { replace: true });
  }, [authSession?.userId, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) {
          return;
        }
        setAuthSession(session);
        try {
          const rawNotice = window.sessionStorage.getItem("invoiceAuthJustSignedIn");
          if (rawNotice) {
            const parsed = JSON.parse(rawNotice);
            const email = typeof parsed?.email === "string" ? parsed.email.trim() : session?.email ?? "";
            const provider = parsed?.provider === "google" ? "Google Sign-In" : "email link";
            setAuthSuccessNotice(
              email
                ? `Signed in as ${email} with ${provider}. Setup progress is now tied to your account.`
                : "Signed in. Setup progress is now tied to your account."
            );
            window.sessionStorage.removeItem("invoiceAuthJustSignedIn");
          }
        } catch (_error) {
          window.sessionStorage.removeItem("invoiceAuthJustSignedIn");
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAuthSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setOnboardingStatus(buildOnboardingStatus({ authSession }));
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    if (!authSession?.userId) {
      return;
    }
    setAuthBusy(false);
    setAuthFlow("");
    setAuthLinkSentAt(0);
  }, [authSession?.userId]);

  useEffect(() => {
    if (!authModalOpen || !authLinkSentAt) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setAuthLinkTicker((current) => current + 1);
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [authLinkSentAt, authModalOpen]);

  useEffect(() => {
    const unsubscribe = subscribeToOnboardingState(() => {
      setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
    });
    const handleFocus = () => {
      setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
      if (authSession?.userId) {
        void reloadAccountPlan();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [authSession?.userId, authSession?.email]);

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const response = await apiFetch("/api/account/plan");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setAccountPlan(null);
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        setAccountPlan(payload && typeof payload === "object" ? payload : null);
      } catch (_error) {
        if (!active) {
          return;
        }
        setAccountPlan(null);
      }
    };
    loadPlan();
    return () => {
      active = false;
    };
  }, [authSession?.userId]);

  useEffect(() => {
    if (!authModalOpen) {
      return undefined;
    }
    const handleKeydown = (event) => {
      if (event.key === "Escape" && !authBusy) {
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [authModalOpen, authBusy]);

  useEffect(() => {
    if (!authModalOpen) {
      return undefined;
    }
    let active = true;
    setAuthProvidersBusy(true);
    setAuthProvidersError("");
    loadAuthProviders()
      .then((providers) => {
        if (!active) {
          return;
        }
        setAuthProviders(Array.isArray(providers) ? providers : []);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAuthProviders([]);
        setAuthProvidersError(error?.message || "Couldn't load sign-in options.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setAuthProvidersBusy(false);
      });
    return () => {
      active = false;
    };
  }, [authModalOpen]);

  const handleSignIn = async () => {
    const emailLinkProvider = Array.isArray(authProviders)
      ? authProviders.find((provider) => provider?.id === "email_link")
      : null;
    if (emailLinkProvider && !emailLinkProvider.available) {
      const message = emailLinkProvider.warning || "Email sign-in isn't available right now.";
      setAuthError(message);
      setAuthEmailError(message);
      return;
    }
    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthEmailError("Enter your email.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setAuthEmailError("Enter a valid email address.");
      return;
    }
    setAuthBusy(true);
    setAuthFlow("email_link");
    setAuthError("");
    setAuthEmailError("");
    setAuthNotice("");
    setAuthPreviewUrl("");
    setAuthLinkSentAt(0);
    window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_requested", "email_link");
    try {
      writePendingAuthReturnPath(authReturnPath);
      const payload = await requestSignInLink(normalizedEmail);
      const notice = payload?.emailSent
        ? `Check ${normalizedEmail} for your secure sign-in link.`
        : payload?.previewUrl
          ? "Email delivery is not configured here, so a preview sign-in link is available below."
          : "If the address is valid, a sign-in link is on the way.";
      setAuthNotice(notice);
      setAuthPreviewUrl(typeof payload?.previewUrl === "string" ? payload.previewUrl : "");
      setAuthLinkSentAt(Date.now());
      window.InvoiceRevenueAnalytics?.trackAuthSignal?.(
        payload?.emailSent ? "email_sign_in_link_sent" : "email_sign_in_link_previewed",
        "email_link"
      );
    } catch (error) {
      const message = error?.message || "Sign in failed.";
      setAuthError(message);
      setAuthEmailError(message);
      window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_request_failed", "email_link");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthFlow("google");
    setAuthError("");
    setAuthNotice("Checking Google Sign-In...");
    setAuthPreviewUrl("");
    let providers = [];
    try {
      providers = (await loadAuthProviders()) ?? [];
      setAuthProviders(Array.isArray(providers) ? providers : []);
    } catch (error) {
      const message = error?.message || "Google Sign-In isn't available right now.";
      setAuthBusy(false);
      setAuthFlow("");
      setAuthNotice("");
      setAuthError(message);
      return;
    }
    const googleProvider = Array.isArray(providers)
      ? providers.find((provider) => provider?.id === "google")
      : null;
    if (!googleProvider?.available) {
      const message = googleProvider?.warning || "Google Sign-In isn't available right now.";
      setAuthBusy(false);
      setAuthFlow("");
      setAuthError(message);
      setAuthNotice("");
      return;
    }
    setAuthNotice("Opening Google Sign-In...");
    try {
      const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
        let timerId;
        try {
          return await Promise.race([
            promise,
            new Promise((_, reject) => {
              timerId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            })
          ]);
        } finally {
          if (timerId) {
            window.clearTimeout(timerId);
          }
        }
      };
      const nativeGoogleClientId = resolveNativeGoogleClientId(googleProvider);
      const nativeGoogleAuthPlugin = window.Capacitor?.Plugins?.GoogleAuth ?? null;
      const nativeGoogleAuthAvailable =
        Boolean(nativeGoogleAuthPlugin?.signIn) &&
        typeof requestIdentity.completeNativeGoogleSignIn === "function";
      const isCapacitorRuntime = Boolean(window.Capacitor);
      if (nativeGoogleAuthAvailable) {
        if (!nativeGoogleClientId) {
          throw new Error("Google Sign-In isn't configured for native login yet.");
        }
        const session = await withTimeout(
          requestIdentity.completeNativeGoogleSignIn({
            clientId: nativeGoogleClientId
          }),
          nativeGoogleSignInTimeoutMs,
          "Google Sign-In is taking longer than expected. Please finish it in Google and return to NoteBill."
        );
        setAuthSession(session);
        setAuthModalOpen(false);
        setAuthSuccessNotice(
          session?.email
            ? `Signed in as ${session.email} with Google Sign-In. Setup progress is now tied to your account.`
            : "Signed in with Google. Setup progress is now tied to your account."
        );
        setAuthBusy(false);
        setAuthFlow("");
        navigate(authReturnPath, { replace: true });
        return;
      }
      if (isCapacitorRuntime) {
        throw new Error("Native Google Sign-In isn't available on this build.");
      }
      const returnPath = writePendingAuthReturnPath(
        authReturnPath
      );
      const startUrl =
        typeof getGoogleAuthStartUrl === "function"
          ? getGoogleAuthStartUrl(returnPath)
          : `/api/auth/google/start?returnTo=${encodeURIComponent(returnPath)}`;
      window.location.assign(String(startUrl));
    } catch (error) {
      setAuthBusy(false);
      setAuthFlow("");
      setAuthNotice("");
      setAuthError(error?.message || "Couldn't start Google Sign-In.");
    }
  };

  const resolveSetupContinuationPath = () => {
    const nextSetupAfterSignIn = Array.isArray(onboardingStatus?.setupSteps)
      ? onboardingStatus.setupSteps.find((step) => !step.complete && step.id !== "sign_in")
      : null;
    if (!nextSetupAfterSignIn?.routeHint) {
      return "/";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/business") {
      return "/settings/business?from=onboarding-complete";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/memory") {
      return "/settings/memory?from=onboarding-complete";
    }
    if (nextSetupAfterSignIn.routeHint === "settings/services") {
      return "/settings/services?from=onboarding-complete";
    }
    return "/";
  };

  const deriveDefaultAuthReturnPath = () => {
    const currentPath = sanitizeInternalAppPath(`${location.pathname}${location.search}${location.hash}`);
    if (currentPath !== "/") {
      return currentPath;
    }
    if (onboardingStatus?.setupNextStep?.id === "sign_in" || onboardingStatus?.setupVisible || onboardingStatus?.completionVisible) {
      return resolveSetupContinuationPath();
    }
    return "/";
  };

  const openSignInModal = (options = {}) => {
    if (internalBillingDebugEnabled) {
      setGuestEntryDismissed(true);
      setAuthModalOpen(false);
      setAuthBusy(false);
      setAuthFlow("");
      setAuthError("");
      setAuthSuccessNotice("Internal debug build: staying in guest mode so we can test the app flow.");
      return;
    }
    const returnPath = sanitizeInternalAppPath(options?.returnTo || deriveDefaultAuthReturnPath());
    setAuthError("");
    setAuthEmailError("");
    setAuthNotice("");
    setAuthPreviewUrl("");
    setAuthFlow("");
    setAuthProvidersError("");
    setAuthReturnPath(returnPath);
    setAuthEmail(authSession?.email ?? "");
    setAuthLinkSentAt(0);
    setAuthModalOpen(true);
  };
  const handleContinueAsGuest = () => {
    setGuestEntryDismissed(true);
    setAuthError("");
    setAuthSuccessNotice("Continuing as a guest. You can sign in later to sync saved work.");
    setAuthModalOpen(false);
  };
  useEffect(() => {
    if (!internalBillingDebugEnabled) {
      return;
    }
    setGuestEntryDismissed(true);
    setAuthModalOpen(false);
    setAuthBusy(false);
    setAuthFlow("");
    setAuthError("");
  }, []);
  const showWelcomeEntry = !internalBillingDebugEnabled && !authSession?.userId && !guestEntryDismissed;

  const handleSignOut = async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccessNotice("");
    try {
      await signOut();
      setAuthSession(null);
    } catch (error) {
      setAuthError(error?.message || "Sign out failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const options = buildLauncherOptions({
    navigate,
    icons: {
      sparkles: <SparklesIcon />,
      notebook: <NotebookIcon />,
      upload: <UploadIcon />,
      pencil: <PencilIcon />,
      archive: <ArchiveIcon />,
      swatch: <SwatchIcon />,
      feedback: <FeedbackIcon />
    }
  });
  const planSummary = formatPlanSummary(accountPlan);
  const planUsage = getPlanUsageModel(accountPlan);
  const planAtLimit = Boolean(accountPlan?.upgradeRequired);
  const planWarning = getPlanPrelimitWarning(accountPlan);
  const planPitch = getPlanValuePitch(accountPlan);
  const planFeatureHighlights = getPlanFeatureHighlights(accountPlan);
  const billingStatus = getBillingStatusModel(accountPlan);
  const upgradeUrl = getPlanUpgradeUrl(accountPlan);
  const billingPortalUrl = getPlanBillingPortalUrl(accountPlan);
  const googlePlaySubscriptionPlans = getGooglePlaySubscriptionPlans(accountPlan);
  const {
    useStripeUpgradeAction,
    useStripePortalAction,
    showUpgradeAction,
    showLifetimePurchaseAction,
    showBillingPortalAction,
    showRestorePurchasesAction,
    hasPlanActions,
    billingEnvironment
  } = buildPlanActionState({
    accountPlan,
    upgradeUrl,
    billingPortalUrl,
    hasStripeCheckout,
    hasStripePortal,
    hasGooglePlayLifetimePurchase,
    hasGooglePlayRestore
  });
  const draftStorageKey = requestIdentity.getScopedStorageKey?.("invoiceDraft") ?? "invoiceDraft";
  const billieWorkspaceStorageKey =
    requestIdentity.getScopedStorageKey?.("billieWorkspaceInstruction") ?? "billieWorkspaceInstruction";
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";
  const [hasResumeDraft, setHasResumeDraft] = useState(false);
  const [showAlternateStarts, setShowAlternateStarts] = useState(false);
  const [showPlanActions, setShowPlanActions] = useState(() => internalBillingDebugEnabled);
  const [showManageOptions, setShowManageOptions] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingDebugState, setBillingDebugState] = useState(() =>
    billingActions?.isInternalBillingDebugEnabled?.() ? billingActions?.getBillingDebugState?.() ?? null : null
  );
  const [draftRecoveryItems, setDraftRecoveryItems] = useState([]);
  const [draftRecoveryLoading, setDraftRecoveryLoading] = useState(false);
  const [operationsSummary, setOperationsSummary] = useState(() =>
    buildLauncherOperationsSummary([])
  );
  const [resumeDraftBusyId, setResumeDraftBusyId] = useState("");
  const [operationsBusyActionId, setOperationsBusyActionId] = useState("");
  const [operationsNotice, setOperationsNotice] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [savedWorkRefreshToken, setSavedWorkRefreshToken] = useState(0);
  const clientMemoryEntries = getClientMemory?.() ?? [];
  const savedLineItems = getLineItemLibrary?.() ?? [];
  const repeatWorkStarter = buildRepeatWorkStarter(clientMemoryEntries, savedLineItems);
  const effectiveShowPlanActions = internalBillingDebugEnabled || showPlanActions;
  const syncBillingDebugState = () => {
    if (!billingActions?.isInternalBillingDebugEnabled?.()) {
      setBillingDebugState(null);
      return;
    }
    setBillingDebugState(billingActions?.getBillingDebugState?.() ?? null);
  };
  const primaryOption = (() => {
    const primaryAction = Array.isArray(operationsSummary?.actions) ? operationsSummary.actions[0] : null;
    if (primaryAction) {
      if (primaryAction.action === "resume-draft") {
        return {
          key: "resume-draft",
          title: primaryAction.title || "Resume latest draft",
          description: primaryAction.detail || "Pick up where you left off.",
          icon: <NotebookIcon />,
          onClick: () => handleResumeSavedDraft(primaryAction.invoiceId),
          disabled: Boolean(resumeDraftBusyId && resumeDraftBusyId === primaryAction.invoiceId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "send-reminder") {
        return {
          key: "send-reminder",
          title: primaryAction.title || "Follow up on sent invoice",
          description: primaryAction.detail || "Send a reminder for an open invoice.",
          icon: <FeedbackIcon />,
          onClick: () => handleLauncherSendReminder(primaryAction.invoiceId),
          disabled:
            Boolean(operationsBusyActionId) || Boolean(primaryAction.busyId && operationsBusyActionId === primaryAction.busyId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "invoice-again") {
        return {
          key: "invoice-again",
          title: primaryAction.title || "Invoice a repeat client",
          description: primaryAction.detail || "Start a fresh draft from a paid invoice.",
          icon: <SparklesIcon />,
          onClick: () => handleLauncherInvoiceAgain(primaryAction.invoiceId),
          disabled: Boolean(operationsBusyActionId && primaryAction.busyId && operationsBusyActionId === primaryAction.busyId),
          badge: "Next up"
        };
      }
      if (primaryAction.action === "open-link" && primaryAction.href) {
        return {
          key: "payment-link",
          title: primaryAction.title || "Hosted payment link ready",
          description: primaryAction.detail || "Open the payment link when you're ready.",
          icon: <UploadIcon />,
          onClick: () => window.open(primaryAction.href, "_blank", "noreferrer"),
          disabled: false,
          badge: "Next up"
        };
      }
      return {
        key: "open-library",
        title: primaryAction.title || "Review sent invoices",
        description: primaryAction.detail || "Open the library for the next step.",
        icon: <ArchiveIcon />,
        onClick: () => navigate("/invoices"),
        disabled: false,
        badge: "Next up"
      };
    }
    return operationsSummary?.hasInvoices
      ? options.find((option) => option.key === "ai") ?? options[0]
      : options.find((option) => option.key === "ai") ??
        options.find((option) => option.key === "scratchpad") ??
        options[0];
  })();
  const handleStartFromMemory = () => {
    if (!repeatWorkStarter?.entry || !repeatWorkStarter?.leadItem) {
      navigate("/manual");
      return;
    }
    const draft = {
      billToDetails: repeatWorkStarter.entry.details || repeatWorkStarter.entry.name || "",
      notes: repeatWorkStarter.entry.defaultNotes || "",
      lineItems: [
        {
          id: `line-${Date.now()}`,
          description: repeatWorkStarter.leadItem.description || "",
          qty: repeatWorkStarter.leadItem.qty ?? "",
          rate: repeatWorkStarter.leadItem.rate ?? ""
        }
      ],
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_memory_reused",
        source: "launcher_repeat_bundle_reuse"
      })
    }).catch(() => {});
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "service_memory_reused",
        source: "launcher_repeat_bundle_reuse"
      })
    }).catch(() => {});
    navigate("/manual");
  };
  const handleStartFromMemoryForClient = (clientName, fallbackInvoiceId = "") => {
    const specificStarter = buildRepeatWorkStarterForClient(clientName, getClientMemory?.() ?? [], getLineItemLibrary?.() ?? []);
    if (!specificStarter?.entry || !specificStarter?.leadItem) {
      if (fallbackInvoiceId) {
        void handleLauncherInvoiceAgain(fallbackInvoiceId);
        return;
      }
      navigate("/manual");
      return;
    }
    const draft = {
      billToDetails: specificStarter.entry.details || specificStarter.entry.name || "",
      notes: specificStarter.entry.defaultNotes || "",
      lineItems: [
        {
          id: `line-${Date.now()}`,
          description: specificStarter.leadItem.description || "",
          qty: specificStarter.leadItem.qty ?? "",
          rate: specificStarter.leadItem.rate ?? ""
        }
      ],
      savedInvoiceId: "",
      savedInvoiceStatus: ""
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "client_memory_reused",
        source: "launcher_command_center_repeat_memory"
      })
    }).catch(() => {});
    void apiFetch("/api/telemetry/revenue-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "service_memory_reused",
        source: "launcher_command_center_repeat_memory"
      })
    }).catch(() => {});
    if (fallbackInvoiceId) {
      const recurringEntries = readRecurringSchedules(recurringStorageKey);
      const recurringEntry = recurringEntries[fallbackInvoiceId];
      if (recurringEntry) {
        const nextEntries = {
          ...recurringEntries,
          [fallbackInvoiceId]: {
            ...recurringEntry,
            nextDueAt: new Date(
              Date.now() + normalizeRecurringInterval(recurringEntry.intervalDays) * 24 * 60 * 60 * 1000
            ).toISOString()
          }
        };
        writeRecurringSchedules(recurringStorageKey, nextEntries);
      }
    }
    navigate("/manual");
  };
  const quickStartOptions = options
    .filter((option) => option.key === "scratchpad" || option.key === "import" || option.key === "manual")
    .concat(
      repeatWorkStarter
        ? [
            {
              key: "repeat-memory",
              title: `Repeat client: ${repeatWorkStarter.entry.name}`,
              description: `Start with ${repeatWorkStarter.leadItem.description}${
                repeatWorkStarter.savedItemCount > 1
                  ? ` and ${repeatWorkStarter.savedItemCount - 1} more saved match${
                      repeatWorkStarter.savedItemCount - 1 > 1 ? "es" : ""
                    }`
                  : ""
              }.`,
              icon: <ArchiveIcon />,
              onClick: handleStartFromMemory,
              disabled: false
            }
          ]
        : []
    );
  const manageOptions = options.filter(
    (option) =>
      option.key === "library" ||
      option.key === "identity" ||
      option.key === "memory" ||
      option.key === "services" ||
      option.key === "feedback" ||
      option.key === "support"
  );

  const handleUpgradeAction = async (basePlanId = "") => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startUpgradeCheckout(accountPlan, { basePlanId, successPath: "/?billing=success" });
      const nextPlan = await reloadAccountPlan();
      if (nextPlan?.plan === "pro") {
        setBillingNotice({
          tone: "green",
          message: "Google Play upgrade landed. Pro is active on this account."
        });
      }
    } catch (error) {
      setBillingError(error?.message || "Unable to open upgrade.");
    } finally {
      syncBillingDebugState();
      setBillingBusy(false);
    }
  };

  const handleLifetimePurchaseAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await startLifetimePurchase(accountPlan, { successPath: "/?billing=success" });
      const nextPlan = await reloadAccountPlan();
      if (nextPlan?.plan === "pro") {
        setBillingNotice({
          tone: "green",
          message: "Google Play purchase landed. Pro is active on this account."
        });
      }
    } catch (error) {
      setBillingError(error?.message || "Unable to open lifetime purchase.");
    } finally {
      syncBillingDebugState();
      setBillingBusy(false);
    }
  };

  const handleBillingAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    try {
      await openBillingPortal(accountPlan, { returnPath: "/" });
    } catch (error) {
      setBillingError(error?.message || "Unable to open billing.");
    } finally {
      syncBillingDebugState();
      setBillingBusy(false);
    }
  };

  useEffect(() => {
    const checkDraft = () => {
      setHasResumeDraft(hasResumeDraftForKey(draftStorageKey));
    };
    checkDraft();
    window.addEventListener("focus", checkDraft);
    return () => {
      window.removeEventListener("focus", checkDraft);
    };
  }, [draftStorageKey, authSession?.userId]);

  useEffect(() => {
    let active = true;
    const loadDraftRecovery = async () => {
      setDraftRecoveryLoading(true);
      try {
        const response = await apiFetch("/api/invoices");
        if (!active) {
          return;
        }
        if (!response.ok) {
          setDraftRecoveryItems([]);
          setOperationsSummary(
            buildLauncherOperationsSummary([], {
              clientMemoryEntries,
              savedLineItems,
              recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
              getRecurringInterval: getClientRecurringInterval
            })
          );
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
        const drafts = invoices
              .filter((invoice) => invoice?.status === "draft")
              .slice(0, 3)
              .map((invoice) => ({
                invoiceId: invoice.invoiceId,
                invoiceNumber: invoice.invoiceNumber || "Draft invoice",
                updatedLabel: formatUpdatedLabel(invoice.updatedAt)
              }));
        setDraftRecoveryItems(drafts);
        setOperationsSummary(
          buildLauncherOperationsSummary(invoices, {
            clientMemoryEntries,
            savedLineItems,
            recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
            getRecurringInterval: getClientRecurringInterval
          })
        );
      } catch (_error) {
        if (!active) {
          return;
        }
        setDraftRecoveryItems([]);
        setOperationsSummary(
          buildLauncherOperationsSummary([], {
            clientMemoryEntries,
            savedLineItems,
            recurringSchedulesByInvoiceId: readRecurringSchedules(recurringStorageKey),
            getRecurringInterval: getClientRecurringInterval
          })
        );
      } finally {
        if (active) {
          setDraftRecoveryLoading(false);
        }
      }
    };
    void loadDraftRecovery();
    const handleFocus = () => {
      void loadDraftRecovery();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [authSession?.userId, savedWorkRefreshToken]);

  const handleResumeSavedDraft = async (invoiceId, options = {}) => {
    if (!invoiceId || resumeDraftBusyId) {
      return;
    }
    setAuthError("");
    setResumeDraftBusyId(invoiceId);
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to open draft.");
      }
      const savedInvoice = payload?.invoice;
      const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice;
      if (!finishedInvoice) {
        throw new Error("Saved draft is incomplete.");
      }
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: deriveTaxRate(finishedInvoice),
        savedInvoiceId: savedInvoice?.invoiceId ?? "",
        savedInvoiceStatus: savedInvoice?.status ?? "draft"
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      if (options?.openWithBillie) {
        try {
          window.localStorage.setItem(
            billieWorkspaceStorageKey,
            buildBillieWorkspaceStarterInstruction(
              finishedInvoice,
              "Refine the invoice wording and notes so this saved draft feels polished and client-ready. Keep numbers unchanged."
            )
          );
        } catch (_error) {
          // Best-effort only.
        }
      }
      navigate(options?.openWithBillie ? "/manual?tab=assistant&source=library" : "/manual");
    } catch (error) {
      setAuthError(error?.message || "Failed to open draft.");
    } finally {
      setResumeDraftBusyId("");
    }
  };

  const reloadAccountPlan = async () => {
    try {
      const response = await apiFetch("/api/account/plan");
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      const nextPlan = payload && typeof payload === "object" ? payload : null;
      setAccountPlan(nextPlan);
      return nextPlan;
    } catch (_error) {
      return null;
    }
  };

  const handleRestorePurchasesAction = async () => {
    setBillingBusy(true);
    setBillingError("");
    setBillingNotice(null);
    try {
      const result = await restoreGooglePlayPurchases(accountPlan);
      const nextPlan = await reloadAccountPlan();
      setBillingNotice({
        tone: result?.restoredCount > 0 ? "green" : "amber",
        message:
          result?.message ||
          (nextPlan?.plan === "pro"
            ? "Your Google Play purchase was restored. Pro is active."
            : "No active Google Play purchases were found.")
      });
    } catch (error) {
      setBillingError(error?.message || "Unable to restore Google Play purchases.");
    } finally {
      syncBillingDebugState();
      setBillingBusy(false);
    }
  };

  const handleContinueOnboarding = (step) => {
    if (!step?.id) {
      navigate("/ai-intake");
      return;
    }
    if (step.routeHint === "manual") {
      navigate("/manual");
      return;
    }
    if (step.id === "capture_notes") {
      activateOnboardingWalkthrough();
      navigate("/ai-intake?sample=starter");
      return;
    }
    navigate("/ai-intake");
  };

  const handleStartGuidedWalkthrough = () => {
    activateOnboardingWalkthrough();
    navigate("/ai-intake?sample=starter");
  };

  const handleDismissOnboardingCompletion = () => {
    acknowledgeOnboardingCompletion();
    setOnboardingStatus(buildOnboardingStatus({ authSession: getAuthSession?.() ?? authSession ?? null }));
  };

  const handleContinueSetup = (step) => {
    if (!step?.routeHint) {
      return;
    }
    if (step.routeHint === "sign-in") {
      openSignInModal();
      return;
    }
    if (step.routeHint === "settings/business") {
      navigate("/settings/business?from=onboarding-complete");
      return;
    }
    if (step.routeHint === "settings/memory") {
      navigate("/settings/memory?from=onboarding-complete");
      return;
    }
    if (step.routeHint === "settings/services") {
      navigate("/settings/services?from=onboarding-complete");
    }
  };

  const handleContinueAfterSignIn = () => {
    const nextStep = onboardingStatus?.setupNextStep;
    setAuthSuccessNotice("");
    if (nextStep) {
      handleContinueSetup(nextStep);
    }
  };

  const handleLauncherSendReminder = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `reminder:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send reminder.");
      }
      const recipient =
        payload?.reminder?.recipientEmail ?? payload?.delivery?.recipientEmail ?? "the saved recipient";
      const invoice = payload?.invoice ?? null;
      const dueDateValue = getInvoiceDueDateValue(invoice);
      const dueDateMs = toTimestamp(dueDateValue);
      const isPastDue =
        invoice?.status === "sent" && Number.isFinite(dueDateMs) && dueDateMs > 0 && dueDateMs <= Date.now();
      const deliveryOpened = Boolean(invoice?.delivery?.openedAt) || invoice?.delivery?.status === "opened";
      const isFocusedReminder = isPastDue && deliveryOpened;
      const nextStepNotice = buildLauncherPostReminderNextStepNotice(invoice);
      setOperationsNotice(
        payload?.mode === "provider"
          ? `${
              isFocusedReminder ? "Focused reminder" : "Reminder"
            } sent to ${recipient}. Delivery tracking is now active. ${nextStepNotice}`
          : payload?.warning
            ? `${
                isFocusedReminder ? "Focused reminder" : "Reminder"
              } recorded for ${recipient}. ${payload.warning} ${nextStepNotice}`
            : `${
                isFocusedReminder ? "Focused reminder" : "Reminder"
              } recorded for ${recipient}. Configure an email provider to send automatically. ${nextStepNotice}`
      );
      setSavedWorkRefreshToken((current) => current + 1);
    } catch (error) {
      setOperationsError(error?.message || "Failed to send reminder.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  const handleLauncherMarkPaid = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `mark-paid:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to mark invoice paid.");
      }
      const invoiceNumber =
        payload?.invoice?.invoiceData?.finishedInvoice?.invoiceNumber ||
        payload?.invoice?.invoiceNumber ||
        "Invoice";
      setOperationsNotice(`${invoiceNumber} marked paid.`);
      setSavedWorkRefreshToken((current) => current + 1);
    } catch (error) {
      setOperationsError(error?.message || "Failed to mark invoice paid.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  const handleLauncherInvoiceAgain = async (invoiceId) => {
    if (!invoiceId || operationsBusyActionId) {
      return;
    }
    const busyId = `invoice-again:${invoiceId}`;
    setOperationsBusyActionId(busyId);
    setOperationsNotice("");
    setOperationsError("");
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start repeat invoice.");
      }
      const savedInvoice = payload?.invoice;
      const finishedInvoice = savedInvoice?.invoiceData?.finishedInvoice;
      if (!finishedInvoice) {
        throw new Error("Saved invoice is incomplete.");
      }
      const draft = buildDraftFromFinishedInvoice(finishedInvoice, {
        taxRate: deriveTaxRate(finishedInvoice),
        freshDraft: true,
        savedInvoiceId: "",
        savedInvoiceStatus: ""
      });
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      await apiFetch("/api/telemetry/revenue-signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "invoice_again_started",
          source: "launcher_command_center"
        })
      }).catch(() => {});
      navigate("/manual");
    } catch (error) {
      setOperationsError(error?.message || "Failed to start repeat invoice.");
    } finally {
      setOperationsBusyActionId("");
    }
  };

  if (showWelcomeEntry) {
    return (
      <div
        className="nb-page nb-page--launcher min-h-screen overflow-hidden text-slate-900"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, rgba(172,204,240,0.88), rgba(238,244,251,0) 30%), radial-gradient(circle at top right, rgba(105,147,210,0.18), rgba(238,244,251,0) 28%), linear-gradient(180deg, #f8fbff 0%, #eef4fb 48%, #f7fbff 100%)"
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(120deg,rgba(20,83,45,0.05),rgba(20,83,45,0)_36%)]" />
        <div className="pointer-events-none absolute left-[-120px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#d7f1dd]/40 blur-3xl" />
        <div className="pointer-events-none absolute right-[-80px] top-[80px] h-[220px] w-[220px] rounded-full bg-[#4f8b5f]/20 blur-3xl" />
        <main className="nb-page-shell nb-page-shell--wide relative flex min-h-screen items-center justify-center py-6 md:py-14">
          <section className="nb-surface nb-surface--elevated w-full max-w-4xl overflow-hidden rounded-[36px] border-white/70 bg-white/78 p-5 shadow-[0_24px_80px_rgba(20,83,45,0.12)] md:p-8 lg:p-10">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:items-center">
              <div>
                <div className="flex items-center gap-4">
                  <img
                    src="/icons/notebill.svg"
                    alt="NoteBill"
                    className="h-16 w-16 rounded-2xl border border-[#4f8b5f]/20 bg-white p-2 shadow-sm"
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4f8b5f]">
                      Billie helps, you approve
                    </p>
                    <h1
                      className="mt-2 text-4xl font-semibold text-slate-900 md:text-6xl"
                      style={{ fontFamily: "'Fraunces', serif" }}
                    >
                      NoteBill
                    </h1>
                  </div>
                </div>
                <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 md:text-lg">
                  Start with Billie if you are new, or keep it in guest mode while you feel out the workflow.
                  Build a clean invoice faster and keep the money decisions visible.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Best first step", "Run the sample walkthrough before you touch real client work."],
                    ["Quick explore", "Continue as a guest and start immediately without signing in."],
                    ["Save later", "Sign in when you want saved work, billing, and repeat-client setup tied to your account."]
                  ].map(([title, copy]) => (
                    <div
                      key={title}
                      className="rounded-[22px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,250,245,0.92))] px-4 py-4 shadow-[0_10px_30px_rgba(20,83,45,0.05)]"
                    >
                      <p className="text-sm font-semibold text-[#14532d]">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div
                data-testid="launcher-first-invoice-guide"
                className="rounded-[30px] border border-[#4f8b5f]/20 bg-[#14532d] p-5 text-white shadow-[0_24px_60px_rgba(20,83,45,0.22)] md:p-6"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7f1dd]">Start here</p>
                <h2 className="mt-3 text-2xl leading-tight text-white" style={{ fontFamily: "'Fraunces', serif" }}>
                  Start with the guided sample.
                </h2>
                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    className="nb-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                    onClick={handleStartGuidedWalkthrough}
                    disabled={authBusy}
                  >
                    Start with Billie
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-white/18 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/16"
                    onClick={handleContinueAsGuest}
                    disabled={authBusy}
                  >
                    Explore in guest mode
                  </button>
                </div>
                <div className="mt-4 rounded-[24px] border border-white/14 bg-white/8 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7f1dd]">
                    Save work later
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    Sign in once you want saved invoices, billing, and repeat-client setup to travel with your account instead of only this device.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                        preferEmailFirstOnWeb
                          ? "nb-btn-primary"
                          : "nb-btn-secondary border-emerald-200 bg-emerald-50 text-emerald-950 shadow-[0_10px_24px_rgba(20,83,45,0.08)]"
                      }`}
                      onClick={() => openSignInModal()}
                      disabled={authBusy}
                    >
                      Continue with email
                    </button>
                    <button
                      type="button"
                      className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                        preferEmailFirstOnWeb
                          ? "nb-btn-secondary border-emerald-200 bg-emerald-50 text-emerald-950 shadow-[0_10px_24px_rgba(20,83,45,0.08)]"
                          : "nb-btn-primary"
                      }`}
                      onClick={() => void handleGoogleSignIn()}
                      disabled={authBusy}
                    >
                      {authBusy && authFlow === "google" ? "Opening Google..." : "Continue with Google"}
                    </button>
                  </div>
                  {!preferEmailFirstOnWeb ? null : (
                    <p className="mt-3 text-xs leading-5 text-[#d7f1dd]">
                      On web, email-link sign-in is usually the most reliable path.
                    </p>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#d7f1dd]">
                  <a href="/privacy" className="underline decoration-[#d7f1dd]/50 underline-offset-4 hover:text-white">
                    Privacy policy
                  </a>
                  <a href="/support" className="underline decoration-[#d7f1dd]/50 underline-offset-4 hover:text-white">
                    Support
                  </a>
                </div>
                {authNotice ? <p className="mt-3 text-sm text-[#d7f1dd]">{authNotice}</p> : null}
                {authError ? <p className="mt-3 text-sm text-rose-200">{authError}</p> : null}
              </div>
            </div>
          </section>
        </main>
        <AuthModal
          open={authModalOpen}
          authBusy={authBusy}
          authFlow={authFlow}
          authEmail={authEmail}
          authEmailError={authEmailError}
          authNotice={authNotice}
          authPreviewUrl={authPreviewUrl}
          authLinkCooldownSeconds={authLinkCooldownSeconds}
          authReturnPathLabel={describeAuthReturnPath(authReturnPath)}
          authProviders={authProviders}
          authProvidersBusy={authProvidersBusy}
          authProvidersError={authProvidersError}
          onChangeEmail={(event) => {
            setAuthEmail(event.target.value);
            setAuthEmailError("");
            setAuthNotice("");
            setAuthPreviewUrl("");
            setAuthLinkSentAt(0);
          }}
          onContinueAsGuest={handleContinueAsGuest}
          onStartGoogle={handleGoogleSignIn}
          onSubmit={handleSignIn}
        />
      </div>
    );
  }

  return (
    <div
      className="nb-page nb-page--launcher min-h-screen overflow-hidden text-slate-900"
      style={{
          backgroundImage:
            "radial-gradient(circle at top left, rgba(215,241,221,0.88), rgba(238,248,241,0) 30%), radial-gradient(circle at top right, rgba(79,139,95,0.18), rgba(238,248,241,0) 28%), linear-gradient(180deg, #f8fdf9 0%, #eef8f1 48%, #f7fbf8 100%)"
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(120deg,rgba(20,83,45,0.05),rgba(20,83,45,0)_36%)]" />
      <div className="pointer-events-none absolute left-[-120px] top-[120px] h-[240px] w-[240px] rounded-full bg-[#d7f1dd]/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-80px] top-[80px] h-[220px] w-[220px] rounded-full bg-[#4f8b5f]/20 blur-3xl" />
      <main className="nb-page-shell nb-page-shell--wide relative max-w-xl md:max-w-6xl md:py-14">
        <section className="nb-surface nb-surface--elevated overflow-hidden rounded-[32px] border-white/70 bg-white/76 p-0">
          <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] md:gap-8 md:p-8 lg:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-[#4f8b5f]/25 bg-[#eef8f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#14532d]">
                  NoteBill
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4f8b5f]">
                  Billie helps, you approve
                </span>
              </div>
              <div className="mt-5 max-w-3xl">
                <h1
                  className="nb-title text-[2rem] leading-[1.02] text-slate-900 md:text-6xl"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Turn rough job notes into a client-ready invoice on your phone.
                </h1>
                <p className="nb-copy mt-3 max-w-2xl md:mt-4 md:leading-7">
                  Built for contractors, solo operators, and repeat service work. Paste what happened, let Billie build the first draft, approve the money decisions, then save, send, and follow up without losing the thread.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d6f61]">
                {["Contractors", "Repeat service work", "Phone-first invoicing"].map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-[#d5e5de] bg-white/88 px-3 py-1"
                  >
                    {pill}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 md:mt-6 md:gap-3">
                {[
                  ["Messy field notes", "Job notes, screenshots, PDFs, photos, or voice notes from the field."],
                  ["Visible money review", "Approve the parts that change totals, timing, or client trust."],
                  ["Ready for repeat work", "Save, send, follow up, and reopen the next similar job faster."]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="nb-subcard rounded-[24px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(238,248,241,0.94))] px-3 py-3 shadow-[0_10px_30px_rgba(20,83,45,0.05)] md:px-4 md:py-4"
                  >
                    <p className="text-sm font-semibold text-[#14532d]">{title}</p>
                    <p className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block md:mt-1.5">{copy}</p>
                  </div>
                ))}
              </div>
              <AccountStrip
                authSession={authSession}
                authBusy={authBusy}
                planSummary={planSummary}
                planUsage={planUsage}
                planAtLimit={planAtLimit}
                planWarning={planWarning}
                planPitch={planPitch}
                planFeatureHighlights={planFeatureHighlights}
                billingStatus={billingStatus}
                hasPlanActions={hasPlanActions}
                showUpgradeAction={showUpgradeAction}
                upgradeUrl={upgradeUrl}
                useStripeUpgradeAction={useStripeUpgradeAction}
                googlePlaySubscriptionPlans={googlePlaySubscriptionPlans}
                showLifetimePurchaseAction={showLifetimePurchaseAction}
                onOpenLifetimePurchase={handleLifetimePurchaseAction}
                showBillingPortalAction={showBillingPortalAction}
                showRestorePurchasesAction={showRestorePurchasesAction}
                onRestorePurchases={handleRestorePurchasesAction}
                billingPortalUrl={billingPortalUrl}
                useStripePortalAction={useStripePortalAction}
                billingBusy={billingBusy}
                billingEnvironment={billingEnvironment}
                billingDebugState={billingDebugState}
                onOpenUpgrade={handleUpgradeAction}
                onOpenBillingPortal={handleBillingAction}
                onOpenSignIn={openSignInModal}
                onSignOut={handleSignOut}
                hideSignInButton={internalBillingDebugEnabled}
                showPlanActions={effectiveShowPlanActions}
                onTogglePlanActions={() => {
                  if (!internalBillingDebugEnabled) {
                    setShowPlanActions((current) => !current);
                  }
                }}
              />
              {billingNotice ? (
                <p
                  className={`nb-banner mt-3 ${
                    billingNotice.tone === "green"
                      ? "nb-banner--success"
                      : "nb-banner--warning"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {billingNotice.message}
                </p>
              ) : null}
              {authError ? (
                <p className="mt-3 text-sm text-rose-600" role="alert">
                  {authError}{" "}
                  <a href="/support" className="font-semibold underline underline-offset-2">
                    Get support
                  </a>
                </p>
              ) : null}
              {authSuccessNotice ? (
                <div className="nb-banner nb-banner--success mt-3 rounded-[22px] px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-950" role="status" aria-live="polite">
                    {authSuccessNotice}
                  </p>
                </div>
              ) : null}
              {billingError ? (
                <p className="mt-3 text-sm text-rose-600" role="alert">
                  {billingError}{" "}
                  <a href="/support" className="font-semibold underline underline-offset-2">
                    Get support
                  </a>
                </p>
              ) : null}
              <div className="mt-4 rounded-[24px] border border-[#4f8b5f]/18 bg-[#14532d] px-4 py-4 text-white shadow-[0_14px_40px_rgba(20,83,45,0.18)] md:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7f1dd]">Built for real work</p>
                <p className="mt-2 text-base font-semibold text-white">Billie drafts fast. You approve the money.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  One clear start. Visible draft changes. No silent total edits.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#4f8b5f]">
                <a href="/privacy" className="underline decoration-[#4f8b5f]/50 underline-offset-4 hover:text-[#14532d]">
                  Privacy policy
                </a>
                <a href="/support" className="underline decoration-[#4f8b5f]/50 underline-offset-4 hover:text-[#14532d]">
                  Support
                </a>
              </div>
            </div>
            <aside className="hidden flex-col justify-between rounded-[30px] border border-[#4f8b5f]/22 bg-[#14532d] p-5 text-white shadow-[0_20px_60px_rgba(20,83,45,0.22)] md:flex md:p-6 lg:p-7">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7f1dd]">
                  Built for real work
                </p>
                <h2
                  className="mt-4 text-3xl leading-tight text-white"
                  style={{ fontFamily: "'Fraunces', serif" }}
                >
                  Fast enough between jobs. Clean enough to send before the day is over.
                </h2>
                <div className="mt-6 space-y-3">
                  {[
                    "Billie cleans up structure and wording, but never makes silent money decisions.",
                    "Start from rough notes, a file import, or a blank invoice when you need more control.",
                    "The invoice stays visible while you work, so nothing important feels hidden."
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[22px] bg-white/8 px-3 py-3">
                      <span
                        className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d7f1dd]"
                        aria-hidden="true"
                      >
                        <span className="h-2 w-2 rounded-full bg-[#14532d]" />
                      </span>
                      <p className="text-sm leading-6 text-slate-100">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/8 p-4 md:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7f1dd]">Best first step</p>
                <p className="mt-2 text-lg font-semibold text-white">Paste the rough version first.</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Most people only need one path: paste the notes, let Billie draft fast, approve the money details, then send.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="mt-7 space-y-5 md:mt-8">
          <OperationsQueueSection
            summary={operationsSummary}
            loading={draftRecoveryLoading}
            busyInvoiceId={resumeDraftBusyId}
            busyActionId={operationsBusyActionId}
            onResumeDraft={handleResumeSavedDraft}
            onResumeWithBillie={(invoiceId) => handleResumeSavedDraft(invoiceId, { openWithBillie: true })}
            onSendReminder={handleLauncherSendReminder}
            onMarkPaid={handleLauncherMarkPaid}
            onInvoiceAgain={handleLauncherInvoiceAgain}
            onStartFromMemory={handleStartFromMemoryForClient}
            onOpenLibrary={() => navigate("/invoices")}
            onStartInvoice={() => navigate("/ai-intake")}
          />
          {operationsNotice ? (
            <p className="nb-banner nb-banner--success" role="status" aria-live="polite">
              {operationsNotice}
            </p>
          ) : null}
          {operationsError ? (
            <p className="nb-banner nb-banner--warning" role="alert">
              {operationsError}
            </p>
          ) : null}
          <OnboardingSection
            status={onboardingStatus}
            onContinue={handleContinueOnboarding}
            onContinueSetup={handleContinueSetup}
            onOpenSignIn={openSignInModal}
            onStartNextInvoice={() => navigate("/ai-intake")}
            onOpenLibrary={() => navigate("/invoices")}
            onOpenEditor={() => navigate("/manual")}
            onOpenFeedback={() => navigate("/feedback")}
            onDismissCompletion={handleDismissOnboardingCompletion}
          />
          <StartSection
            primaryOption={primaryOption}
            hasSavedHistory={operationsSummary?.hasInvoices}
            hasResumeDraft={hasResumeDraft}
            onResumeDraft={() => navigate("/manual")}
            onTrySampleNotes={handleStartGuidedWalkthrough}
            onOpenScratchpad={() => navigate("/scratchpad")}
            showAlternateStarts={showAlternateStarts}
            onToggleAlternateStarts={() => setShowAlternateStarts((current) => !current)}
          />
          <DraftRecoverySection
            drafts={draftRecoveryItems}
            loading={draftRecoveryLoading}
            busyInvoiceId={resumeDraftBusyId}
            onResumeDraft={handleResumeSavedDraft}
            onResumeWithBillie={(invoiceId) => handleResumeSavedDraft(invoiceId, { openWithBillie: true })}
            onOpenLibrary={() => navigate("/invoices")}
          />

          <AlternateStartsSection
            showAlternateStarts={showAlternateStarts}
            quickStartOptions={quickStartOptions}
          />

          <ManageSection
            showManageOptions={showManageOptions}
            onToggleManageOptions={() => setShowManageOptions((current) => !current)}
            manageOptions={manageOptions}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
            onClick={() => navigate("/feedback")}
          >
            Feedback
          </button>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
          >
            Support
          </a>
          {showDiagnosticsLink ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-700 hover:underline"
              onClick={() => navigate("/diagnostics")}
            >
              Internal diagnostics
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold uppercase tracking-[0.18em] text-slate-400">Popular pages</span>
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:border-[#3d6f61]/30 hover:text-[#17493c]" href="/invoice-app-for-contractors">
            Invoice app for contractors
          </a>
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:border-[#3d6f61]/30 hover:text-[#17493c]" href="/invoice-app-for-service-businesses">
            Service businesses
          </a>
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:border-[#3d6f61]/30 hover:text-[#17493c]" href="/mobile-invoice-app">
            Mobile invoice app
          </a>
          <a className="rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:border-[#3d6f61]/30 hover:text-[#17493c]" href="/client-statements-and-follow-up">
            Statements and follow-up
          </a>
        </div>
      </main>
      <AuthModal
        open={authModalOpen}
        authBusy={authBusy}
        authFlow={authFlow}
        authEmail={authEmail}
        authEmailError={authEmailError}
        authNotice={authNotice}
        authPreviewUrl={authPreviewUrl}
        authLinkCooldownSeconds={authLinkCooldownSeconds}
        authReturnPathLabel={describeAuthReturnPath(authReturnPath)}
        authProviders={authProviders}
        authProvidersBusy={authProvidersBusy}
        authProvidersError={authProvidersError}
        onChangeEmail={(event) => {
          setAuthEmail(event.target.value);
          setAuthEmailError("");
          setAuthNotice("");
          setAuthPreviewUrl("");
          setAuthLinkSentAt(0);
        }}
        onContinueAsGuest={handleContinueAsGuest}
        onStartGoogle={handleGoogleSignIn}
        onSubmit={handleSignIn}
      />
    </div>
  );
}

function EmailLinkVerificationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Verifying your sign-in link...");

  useEffect(() => {
    let active = true;
    const linkToken = searchParams.get("token")?.trim();
    if (!linkToken) {
      setStatus("error");
      setMessage("This sign-in link is missing a token.");
      window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_link_missing_token", "email_link");
      return undefined;
    }

    window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_link_opened", "email_link");
    completeEmailLinkSignIn(linkToken)
      .then((session) => {
        if (!active) {
          return;
        }
        try {
          window.sessionStorage.setItem(
            "invoiceAuthJustSignedIn",
            JSON.stringify({ provider: "email_link", email: session?.email ?? "" })
          );
        } catch (_error) {
          // Best-effort handoff only.
        }
        setStatus("success");
        setMessage("Signed in. Taking you back to NoteBill...");
        window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_link_verified", "email_link");
        const returnPath = consumePendingAuthReturnPath();
        window.setTimeout(() => {
          if (active) {
            navigate(returnPath, { replace: true });
          }
        }, 1200);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setStatus("error");
        setMessage(error?.message || "This sign-in link is invalid or expired.");
        window.InvoiceRevenueAnalytics?.trackAuthSignal?.("email_sign_in_link_failed", "email_link");
      });

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  const toneClass =
    status === "success" ? "text-emerald-700" : status === "error" ? "text-rose-600" : "text-slate-600";

  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <div className="nb-surface nb-surface--elevated">
          <p className="nb-kicker">Account verification</p>
          <h1 className="nb-section-title mt-3">Email sign-in</h1>
          <p className={`mt-3 text-sm leading-7 ${toneClass}`}>{message}</p>
          {status === "error" ? (
            <button type="button" className="nb-btn-primary mt-5" onClick={() => navigate("/", { replace: true })}>
              Return to launcher
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function GoogleSignInCompletionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("Finishing Google Sign-In...");

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const completionParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      completionParams.set(key, value);
    }
    for (const [key, value] of hashParams.entries()) {
      if (!completionParams.has(key)) {
        completionParams.set(key, value);
      }
    }
    const errorMessage = completionParams.get("error")?.trim();
    const storedNextPath =
      completionParams.get("next")?.trim() || consumePendingAuthReturnPath();
    const { path: nextPath, native } = stripNativeGoogleAuthMarker(storedNextPath);
    const nativeFlow = completionParams.get("nativeAuth") === "1" || native;

    if (errorMessage) {
      setStatus("error");
      setMessage(errorMessage);
      return undefined;
    }

    const token = completionParams.get("token")?.trim();
    const userId = completionParams.get("userId")?.trim();
    const email = completionParams.get("email")?.trim();
    const expiresAt = completionParams.get("expiresAt")?.trim();
    if (!token || !userId || !email || !expiresAt) {
      setStatus("error");
      setMessage("Google Sign-In did not return a complete session.");
      return undefined;
    }

    try {
      const session = completeRedirectSignIn(token, { userId, email, expiresAt });
      try {
        window.sessionStorage.setItem(
          "invoiceAuthJustSignedIn",
          JSON.stringify({ provider: "google", email: session?.email ?? email })
        );
      } catch (_error) {
        // Best-effort handoff only.
      }
      window.history.replaceState({}, document.title, "/auth/google");
      setStatus("success");
      setMessage(
        nativeFlow ? "Signed in with Google. Returning to NoteBill..." : "Signed in with Google. Taking you back to NoteBill..."
      );
      window.setTimeout(() => {
        if (active) {
          navigate(nextPath.startsWith("/") ? nextPath : "/", { replace: true });
        }
      }, 1200);
    } catch (error) {
      if (!active) {
        return undefined;
      }
      setStatus("error");
      setMessage(error?.message || "Google Sign-In failed.");
    }

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  const toneClass =
    status === "success" ? "text-emerald-700" : status === "error" ? "text-rose-600" : "text-slate-600";

  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <div className="nb-surface nb-surface--elevated">
          <p className="nb-kicker">Account verification</p>
          <h1 className="nb-section-title mt-3">Google Sign-In</h1>
          <p className={`mt-3 text-sm leading-7 ${toneClass}`}>{message}</p>
          {status === "error" ? (
            <button type="button" className="nb-btn-primary mt-5" onClick={() => navigate("/", { replace: true })}>
              Return to launcher
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Placeholder({ title, description }) {
  const navigate = useNavigate();
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
        <button
          type="button"
          className="nb-btn-ghost"
          onClick={() => navigate("/")}
        >
          Back to launcher
        </button>
        <div className="nb-surface nb-surface--elevated mt-4">
          <h1 className="nb-section-title">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
      </main>
    </div>
  );
}

function DeferredFeatureRoute({ featureKey }) {
  const feature = FEATURE_ROUTES[featureKey];
  const featureIdentity = feature ? `${feature.globalName}:${feature.componentName}` : "";
  const [LoadedComponent, setLoadedComponent] = useState(() => {
    try {
      return resolveFeatureComponent(feature?.globalName, feature?.componentName);
    } catch (_error) {
      return null;
    }
  });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!feature) {
      setLoadedComponent(null);
      setLoadError("");
      return undefined;
    }
    try {
      const resolvedComponent = resolveFeatureComponent(feature.globalName, feature.componentName);
      setLoadedComponent(() => resolvedComponent);
      setLoadError("");
    } catch (_error) {
      setLoadedComponent(null);
      setLoadError("");
    }
    return undefined;
  }, [featureIdentity]);

  useEffect(() => {
    if (!feature || LoadedComponent) {
      return undefined;
    }
    let cancelled = false;
    loadFeatureScripts(feature.scripts)
      .then(() => {
        if (cancelled) {
          return;
        }
        const resolvedComponent = resolveFeatureComponent(feature.globalName, feature.componentName);
        setLoadedComponent(() => resolvedComponent);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Unable to load this workspace.");
      });
    return () => {
      cancelled = true;
    };
  }, [featureIdentity, feature, LoadedComponent]);

  if (!feature) {
    return <Placeholder title="Page not found" description="Return to the launcher to continue." />;
  }
  if (loadError) {
    return (
      <Placeholder
        title={`Unable to load ${feature.loadingTitle}`}
        description={`${loadError} Return to the launcher and try again.`}
      />
    );
  }
  if (!LoadedComponent) {
    return (
      <div className="nb-page nb-page--quiet">
        <main className="nb-page-shell nb-page-shell--medium max-w-xl py-10">
          <div className="nb-surface nb-surface--elevated mt-4">
            <p className="nb-section-chip">Loading</p>
            <p className="mt-3 text-sm text-slate-600" role="status">
              Preparing {feature.loadingTitle}.
            </p>
          </div>
        </main>
      </div>
    );
  }
  return <LoadedComponent key={featureIdentity} />;
}

function AppChrome({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname || "/";
  const hiddenRoutes = [
    "/auth/verify",
    "/auth/google",
    "/portal",
    "/privacy",
    "/help",
    "/support",
    "/feedback",
    "/data-deletion",
    "/delete-account",
    "/invoice-app-for-contractors",
    "/invoice-app-for-service-businesses",
    "/mobile-invoice-app",
    "/invoice-app-on-phone",
    "/client-statements-and-follow-up"
  ];
  const showNav = !hiddenRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const navItems = [
    { label: "Launcher", mobileLabel: "Home", path: "/", icon: SparklesIcon },
    { label: "Library", mobileLabel: "Library", path: "/invoices", icon: ArchiveIcon },
    { label: "Scratchpad", mobileLabel: "Notes", path: "/scratchpad", icon: NotebookIcon },
    { label: "Dashboard", mobileLabel: "Stats", path: "/dashboard", icon: SquaresIcon },
    { label: "Settings", mobileLabel: "Prefs", path: "/settings/business", icon: SwatchIcon }
  ];
  const isActive = (path) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`));

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <a href="#app-main" className="nb-skip-link">
        Skip to content
      </a>
      {showNav ? (
        <>
          <div className="sticky top-0 z-50 hidden border-b border-[rgba(23,73,60,0.08)] bg-[rgba(251,250,246,0.88)] backdrop-blur-xl md:block">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 md:px-6">
              <button
                type="button"
                className="hidden shrink-0 items-center gap-2 rounded-full border border-[rgba(23,73,60,0.08)] bg-white/88 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(23,73,60,0.16)] sm:inline-flex"
                onClick={() => navigate("/")}
              >
                <img src="/icons/notebill.svg" alt="" aria-hidden="true" className="h-7 w-7 rounded-xl" />
                <span>NoteBill</span>
              </button>
              <nav
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-[rgba(23,73,60,0.08)] bg-white/74 p-1 shadow-sm"
                aria-label="Primary"
              >
                {navItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-[#17493c] text-white shadow-[0_12px_30px_rgba(23,73,60,0.16)]"
                          : "text-slate-700 hover:bg-white/92 hover:text-slate-950"
                      }`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => navigate(item.path)}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-[#3d6f61]"}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                className="hidden shrink-0 rounded-full bg-[linear-gradient(135deg,_#245a4c_0%,_#17493c_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(23,73,60,0.18)] transition hover:-translate-y-0.5 sm:inline-flex"
                onClick={() => navigate("/ai-intake")}
              >
                New invoice
              </button>
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-50 relative border-t border-[rgba(23,73,60,0.08)] bg-[rgba(251,250,246,0.96)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
            <div className="mx-auto grid max-w-2xl grid-cols-5 gap-0.5">
              {navItems.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`flex min-h-[3.75rem] flex-col items-center justify-center rounded-2xl px-1.5 py-2 text-[11px] font-semibold leading-none transition ${
                      active
                        ? "bg-[#17493c] text-white shadow-[0_10px_24px_rgba(23,73,60,0.16)]"
                        : "text-slate-700 hover:bg-white/85 hover:text-slate-950"
                    }`}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    onClick={() => navigate(item.path)}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-white" : "text-[#3d6f61]"}`} />
                    <span className="mt-1 block max-w-full truncate text-[10px] font-semibold leading-tight">
                      {item.mobileLabel || item.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="absolute right-3 top-[-3.3rem] inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-[linear-gradient(135deg,_#245a4c_0%,_#17493c_100%)] text-white shadow-[0_18px_36px_rgba(23,73,60,0.2)] transition hover:-translate-y-0.5"
              aria-label="New invoice"
              onClick={() => navigate("/ai-intake")}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                +
              </span>
            </button>
          </div>
        </>
      ) : null}
      <div id="app-main" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

const PUBLIC_INFO_LAST_UPDATED = "2026-04-21";
const SUPPORT_EMAIL = "support@notebill.app";
const CONTACT_EMAIL = "contact@notebill.app";
const INFO_EMAIL = "info@notebill.app";
const DIRECT_CONTACT_EMAIL = "david@notebill.app";
const NOTE_BILL_SITE_URL = "https://app.notebill.app";
const GOOGLE_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.notebill.app";
const FEEDBACK_EMAIL_SUBJECT = "NoteBill tester feedback";
const FEEDBACK_EMAIL_BODY = [
  "What I was trying to do:",
  "",
  "What happened:",
  "",
  "What I expected:",
  "",
  "Device model and Android version:",
  "",
  "Screenshot or invoice ID, if relevant:"
].join("\n");

function buildFeedbackMailto(deviceDetails = "") {
  const details = typeof deviceDetails === "string" && deviceDetails.trim() ? deviceDetails.trim() : "";
  const body = details
    ? `${FEEDBACK_EMAIL_BODY}\n\n---\n${details}`
    : FEEDBACK_EMAIL_BODY;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(FEEDBACK_EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

function buildFeedbackDeviceDetails() {
  const userAgent = navigator.userAgent || "Unknown user agent";
  const safePageUrl = `${window.location.origin}${window.location.pathname}`;
  const viewport = `${window.innerWidth}x${window.innerHeight}`;
  const screenSize = window.screen ? `${window.screen.width}x${window.screen.height}` : "Unknown";
  const pixelRatio = window.devicePixelRatio ? String(window.devicePixelRatio) : "Unknown";
  const connection = navigator.connection?.effectiveType
    ? `${navigator.connection.effectiveType} connection`
    : "Connection unknown";

  return [
    "NoteBill feedback details",
    `Generated: ${new Date().toISOString()}`,
    `Page: ${safePageUrl}`,
    `Viewport: ${viewport}`,
    `Screen: ${screenSize}`,
    `Pixel ratio: ${pixelRatio}`,
    `Network: ${connection}`,
    `User agent: ${userAgent}`
  ].join("\n");
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Timed out")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function PublicInfoPage({ kicker, title, intro, highlights, sections, footerNote, actions, children }) {
  const pageActions = actions ?? [
    { href: "/", label: "Open NoteBill", tone: "primary" },
    { href: "/support", label: "Support", tone: "ghost" }
  ];
  return (
    <div className="nb-page nb-page--quiet">
      <main className="nb-page-shell nb-page-shell--medium py-8 md:py-10">
        <div className="nb-surface nb-surface--elevated">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="nb-kicker">{kicker}</p>
              <h1 className="nb-title mt-3 text-4xl md:text-5xl">{title}</h1>
              <p className="nb-copy mt-4 max-w-3xl">{intro}</p>
              {Array.isArray(highlights) && highlights.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {highlights.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-[#d5e5de] bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2d5e50]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {pageActions.map((action) => (
                typeof action.onClick === "function" ? (
                  <button
                    key={`${action.href}:${action.label}`}
                    type="button"
                    className={action.tone === "primary" ? "nb-btn-primary" : "nb-btn-ghost"}
                    onClick={() => {
                      action.onClick?.();
                      if (action.href) {
                        window.setTimeout(() => window.location.assign(action.href), 120);
                      }
                    }}
                  >
                    {action.label}
                  </button>
                ) : (
                  <a
                    key={`${action.href}:${action.label}`}
                    className={action.tone === "primary" ? "nb-btn-primary" : "nb-btn-ghost"}
                    href={action.href}
                  >
                    {action.label}
                  </a>
                )
              ))}
            </div>
          </div>

          {children ? <div className="mt-6">{children}</div> : null}

          <div className="mt-6 space-y-4">
            {sections.map((section) => (
              <section key={section.title} className="nb-subcard">
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {paragraph}
                  </p>
                ))}
                {section.items?.length ? (
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

      {footerNote ? <p className="mt-6 text-xs leading-6 text-slate-500">{footerNote}</p> : null}
        </div>
      </main>
    </div>
  );
}

function usePublicPageMetadata({ title, description, path, structuredData = null }) {
  useEffect(() => {
    const nextTitle = `${title} | NoteBill`;
    const nextDescription = description;
    const nextCanonical = `${NOTE_BILL_SITE_URL}${path}`;
    const trackedMetaSelectors = [
      ["meta[name='description']", nextDescription],
      ["meta[property='og:title']", nextTitle],
      ["meta[property='og:description']", nextDescription],
      ["meta[property='og:url']", nextCanonical],
      ["meta[name='twitter:title']", nextTitle],
      ["meta[name='twitter:description']", nextDescription]
    ];

    const snapshot = {
      title: document.title,
      canonical: document.querySelector("link[rel='canonical']")?.getAttribute("href") ?? "",
      meta: new Map()
    };

    trackedMetaSelectors.forEach(([selector, value]) => {
      const element = document.querySelector(selector);
      if (!element) {
        return;
      }
      snapshot.meta.set(selector, element.getAttribute("content") ?? "");
      element.setAttribute("content", value);
    });

    let canonicalLink = document.querySelector("link[rel='canonical']");
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", nextCanonical);

    document.title = nextTitle;

    let structuredDataScript = document.getElementById("nb-dynamic-structured-data");
    const previousStructuredData = structuredDataScript?.textContent ?? null;
    if (structuredData) {
      if (!structuredDataScript) {
        structuredDataScript = document.createElement("script");
        structuredDataScript.setAttribute("type", "application/ld+json");
        structuredDataScript.setAttribute("id", "nb-dynamic-structured-data");
        document.head.appendChild(structuredDataScript);
      }
      structuredDataScript.textContent = JSON.stringify(structuredData);
    }

    return () => {
      document.title = snapshot.title;
      trackedMetaSelectors.forEach(([selector]) => {
        const element = document.querySelector(selector);
        if (!element) {
          return;
        }
        const previousValue = snapshot.meta.get(selector);
        if (typeof previousValue === "string") {
          element.setAttribute("content", previousValue);
        }
      });
      const currentCanonical = document.querySelector("link[rel='canonical']");
      if (currentCanonical && snapshot.canonical) {
        currentCanonical.setAttribute("href", snapshot.canonical);
      }
      const currentStructuredData = document.getElementById("nb-dynamic-structured-data");
      if (!currentStructuredData) {
        return;
      }
      if (previousStructuredData) {
        currentStructuredData.textContent = previousStructuredData;
        return;
      }
      currentStructuredData.remove();
    };
  }, [description, path, structuredData, title]);
}

function SeoLandingPage({
  kicker,
  title,
  intro,
  highlights,
  description,
  path,
  sections,
  footerNote,
  actions,
  children,
  structuredData = null
}) {
  usePublicPageMetadata({ title, description, path, structuredData });
  return (
    <PublicInfoPage
      kicker={kicker}
      title={title}
      intro={intro}
      highlights={highlights}
      sections={sections}
      footerNote={footerNote}
      actions={actions}
      children={children}
    />
  );
}

function PricingChoicePanel({
  primaryHref = "/ai-intake?mode=quick",
  primaryLabel = "Quick AI invoice",
  title = "Pick the billing path that fits how you invoice",
  intro =
    "Start free to see the draft flow. Monthly Pro keeps the repeat workflow active with saved details, sending, reminders, payment links, and memory. Lifetime Pro is the one-time unlock if you want the same workflow without a subscription.",
  monthlyDescription = "Best if you invoice regularly and want the repeat workflow, saved client details, and send/remind tools to stay ready.",
  lifetimeDescription = "Best if you want a one-time unlock and plan to keep NoteBill in your kit long term.",
  footerNote = "Free helps you try the draft flow. Paid helps you run the same workflow every month.",
  installCalloutTitle = "Using Android as your main workflow?",
  installCalloutBody = "Open the installed app for the cleanest Android sign-in, billing, saved workflow, and restore flow."
}) {
  return (
    <section id="pricing" className="nb-highlight-panel scroll-mt-28" data-testid="seo-pricing-choice">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="nb-kicker">Pricing</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{intro}</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <a href={primaryHref} className="nb-btn-primary shrink-0">
            {primaryLabel}
          </a>
          <a
            href={GOOGLE_PLAY_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="nb-btn-ghost shrink-0 border border-[#d5e5de] bg-white/90"
          >
            Find us on Google Play
          </a>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#7bc197] bg-[#f3fbf6] px-4 py-4 shadow-[0_12px_28px_rgba(23,73,60,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Monthly Pro</p>
            <span className="rounded-full border border-[#bfe2cb] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2d5e50]">
              Recommended
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {monthlyDescription}
          </p>
        </div>
        <div className="rounded-2xl border border-[#d5e5de] bg-white/90 px-4 py-4 shadow-[0_10px_24px_rgba(23,73,60,0.06)]">
          <p className="text-sm font-semibold text-slate-900">Lifetime Pro</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{lifetimeDescription}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{footerNote}</p>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#d5e5de] bg-white/88 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-slate-900">{installCalloutTitle}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{installCalloutBody}</p>
        </div>
        <a
          href={GOOGLE_PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          className="nb-btn-ghost shrink-0 self-start sm:self-auto"
        >
          Find us on Google Play
        </a>
      </div>
    </section>
  );
}

function trackLandingRevenueSignal(event, source) {
  window.InvoiceRevenueAnalytics?.trackRevenueSignal?.(event, source || "landing_page");
}

const GOOGLE_PLAY_BADGE_URL = "/landing/google-play-badge-official.png";

function GooglePlayBadgeLink({
  onClick,
  className = "",
  label = "Get it on Google Play",
  subtle = false
}) {
  return (
    <a
      href={GOOGLE_PLAY_STORE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      onClick={onClick}
      className={[
        "group inline-flex rounded-[24px] border border-white/14 bg-[#0a0d0b] p-2 shadow-[0_18px_44px_rgba(8,15,11,0.32)] transition hover:-translate-y-0.5 hover:border-white/28 hover:shadow-[0_26px_54px_rgba(8,15,11,0.36)]",
        subtle ? "bg-[#111714] shadow-[0_12px_24px_rgba(8,15,11,0.22)]" : "",
        className
      ].join(" ")}
    >
      <img
        src={GOOGLE_PLAY_BADGE_URL}
        alt={label}
        loading="eager"
        decoding="async"
        className="h-[54px] w-auto rounded-[14px] object-contain"
      />
    </a>
  );
}

function PhoneLandingPreviewGallery() {
  const shots = [
    {
      src: "/landing/phone-workflow-1.svg",
      alt: "NoteBill phone screen showing rough notes turning into a draft invoice.",
      title: "Rough notes to first draft",
      body: "Start from the kind of notes you already have and move into a reviewable invoice fast.",
      width: 1200,
      height: 900
    },
    {
      src: "/landing/phone-workflow-2.svg",
      alt: "NoteBill phone screen showing the invoice review and save step.",
      title: "Clear review before save",
      body: "Keep the money decisions visible, then save once the draft feels right.",
      width: 1200,
      height: 900
    },
    {
      src: "/landing/phone-workflow-3.svg",
      alt: "NoteBill phone screen showing library follow-up and payment path.",
      title: "Follow-up stays close",
      body: "Saved invoices keep the next steps visible, so reminders and payment handoff stay calm.",
      width: 1200,
      height: 900
    }
  ];

  return (
    <section className="mt-10 rounded-[34px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_20px_56px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="nb-kicker">What the install gets you</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
            The draft, review, and follow-up path stay connected instead of scattered across tools
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 md:text-[15px]">
            People usually do not need a huge finance suite on their phone. They need one clean place to capture the
            work, review the invoice, and keep the next money-moving step easy to find.
          </p>
        </div>
        <a
          href={GOOGLE_PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 self-start rounded-full border border-[#d6e7dd] bg-white/88 px-4 py-2 text-sm font-semibold text-[#17493c] shadow-[0_12px_28px_rgba(20,83,45,0.06)]"
        >
          Find us on Google Play
        </a>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <div className="rounded-[32px] border border-[#d7e7de] bg-[linear-gradient(180deg,#113427_0%,#17493c_100%)] p-4 shadow-[0_24px_60px_rgba(20,83,45,0.14)] md:p-5">
          <div className="rounded-[28px] border border-white/16 bg-white/8 p-3 backdrop-blur md:p-4">
            <img
              src={shots[0].src}
              alt={shots[0].alt}
              width={shots[0].width}
              height={shots[0].height}
              loading="eager"
              decoding="async"
              className="h-auto w-full rounded-[24px] border border-white/18 bg-white/90"
            />
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[22px] border border-white/14 bg-white/10 px-4 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Start fast</p>
              <p className="mt-2 text-base font-semibold">{shots[0].title}</p>
              <p className="mt-2 text-sm leading-6 text-white/76">{shots[0].body}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/14 bg-white/10 px-4 py-4 text-white">
                <p className="text-sm font-semibold">You still approve the money part</p>
                <p className="mt-2 text-sm leading-6 text-white/76">
                  Billie helps structure the draft, but the invoice still goes through a visible review before save or send.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/14 bg-white/10 px-4 py-4 text-white">
                <p className="text-sm font-semibold">Install if Android is your real workflow</p>
                <p className="mt-2 text-sm leading-6 text-white/76">
                  Google Play upgrades and restore stay cleaner when the app already lives on the same phone as the notes.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          {shots.slice(1).map((shot) => (
            <div
              key={shot.title}
              className="grid gap-3 rounded-[30px] border border-[#d7e7de] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(242,249,244,0.94))] p-3 shadow-[0_18px_46px_rgba(20,83,45,0.08)] sm:grid-cols-[0.9fr_1.1fr]"
            >
              <img
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                loading="lazy"
                decoding="async"
                className="h-full w-full rounded-[22px] border border-[#dbe8e0] bg-white object-cover"
              />
              <div className="flex flex-col justify-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2d5e50]">
                  {shot.title === shots[1].title ? "Review and save" : "Stay on top of payment"}
                </p>
                <p className="mt-2 text-lg font-semibold leading-7 text-slate-950">{shot.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{shot.body}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  {shot.title === shots[1].title
                    ? "Check the draft before it becomes real"
                    : "Keep send and follow-up tied to the invoice"}
                </p>
              </div>
            </div>
          ))}
          <div className="rounded-[30px] border border-[#d7e7de] bg-[#f9fbf9] px-5 py-5 shadow-[0_18px_46px_rgba(20,83,45,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2d5e50]">Install confidence</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              Free install first. Upgrade only if it actually earns a place in your workflow.
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              That is the right way to judge this app. Get the cleaner phone flow first, then decide whether Pro is worth
              it once you have seen the save, send, and follow-up path for real.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function InvoiceExportStyleShowcase() {
  const samples = [
    {
      title: "North Shore Paint Co",
      subtitle: "Classic layout \u00b7 painter finish work",
      body: "A repaint invoice with labor, materials, and a balance block that still feels polished on first open.",
      href: "/landing/invoice-export-samples/classic-split.pdf",
      badge: "Classic",
      previewSrc: "/landing/invoice-export-samples/classic-split.preview.png",
      previewAlt: "Classic exported painter invoice example from NoteBill.",
      previewWidth: 1090,
      previewHeight: 1314
    },
    {
      title: "Harbour HVAC Service",
      subtitle: "Minimal layout \u00b7 HVAC service call",
      body: "A tighter service-call invoice for diagnostics, parts, and one quick payment decision without visual clutter.",
      href: "/landing/invoice-export-samples/minimal-centered.pdf",
      badge: "Minimal",
      previewSrc: "/landing/invoice-export-samples/minimal-centered.preview.png",
      previewAlt: "Minimal exported HVAC invoice example from NoteBill.",
      previewWidth: 1090,
      previewHeight: 1343
    },
    {
      title: "Cedar Ridge Grounds Co",
      subtitle: "Bold layout \u00b7 landscape monthly billing",
      body: "A more branded monthly billing invoice that still feels client-safe when recurring work needs a stronger look.",
      href: "/landing/invoice-export-samples/bold-split.pdf",
      badge: "Bold",
      previewSrc: "/landing/invoice-export-samples/bold-split.preview.png",
      previewAlt: "Bold exported landscape invoice example from NoteBill.",
      previewWidth: 1090,
      previewHeight: 1345
    }
  ];

  return (
    <section className="mt-10 rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#ffffff_0%,#f7faf8_100%)] px-5 py-6 shadow-[0_22px_58px_rgba(15,23,42,0.06)] md:px-6 md:py-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="nb-kicker">Real exported invoice examples</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
            Real exported invoices that look client-ready on first open
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 md:text-[15px]">
            These are actual PDFs exported from NoteBill. Each sample uses a different layout so the page shows
            believable work, not a placeholder illustration.
          </p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Tap a sample to inspect the full PDF
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#44695c]">
        <span className="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Real PDFs from the app</span>
        <span className="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Three visual directions</span>
        <span className="rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-3 py-2">Open the full sample PDF</span>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {samples.map((sample) => (
          <article
            key={sample.title}
            className="overflow-hidden rounded-[30px] border border-[#d7e2da] bg-white p-4 shadow-[0_18px_52px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(15,23,42,0.12)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real PDF sample</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{sample.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{sample.subtitle}</p>
              </div>
              <span className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {sample.badge}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-[24px] border border-[#d9e4dc] bg-[#f6f8f7] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="overflow-hidden rounded-[18px] border border-[#dfe7e1] bg-white shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                <img
                  src={sample.previewSrc}
                  alt={sample.previewAlt}
                  width={sample.previewWidth}
                  height={sample.previewHeight}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full bg-white object-contain"
                />
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-600">{sample.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={sample.href}
                target="_blank"
                rel="noreferrer"
                data-revenue-cta="sample-pdf"
                onClick={() => trackLandingRevenueSignal("landing_invoice_sample_opened", "landing:phone")}
                className="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)] transition hover:-translate-y-0.5"
              >
                Open sample PDF
              </a>
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Exported from the app</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrustAndFaqPanel({
  title = "What to know before you try it",
  intro = "A few quick answers so you can decide fast without digging through long docs.",
  whatItIs = [],
  whatItIsNot = [],
  faqs = []
}) {
  return (
    <section className="nb-highlight-panel scroll-mt-28" data-testid="seo-trust-faq">
      <div className="max-w-3xl">
        <p className="nb-kicker">Trust and clarity</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{intro}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#d5e5de] bg-white/90 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">What it is</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {whatItIs.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[#d5e5de] bg-white/90 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">What it is not</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {whatItIsNot.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#c58f3b]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {faqs.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-2xl border border-slate-200 bg-white/86 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{faq.question}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ComparisonPanel({ title, intro, cards = [] }) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  return (
    <section className="nb-highlight-panel scroll-mt-28">
      <div className="max-w-3xl">
        <p className="nb-kicker">Comparison</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{intro}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className={[
              "rounded-2xl border px-4 py-4 shadow-[0_12px_28px_rgba(20,83,45,0.05)]",
              card.emphasis
                ? "border-[#7bc197] bg-[#f3fbf6]"
                : "border-[#d5e5de] bg-white/90"
            ].join(" ")}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2d5e50]">{card.kicker}</p>
            <h3 className="mt-2 text-base font-semibold text-slate-950">{card.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
            {Array.isArray(card.points) && card.points.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {card.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function RelatedWorkflowLinks({
  title = "Explore related ways to use NoteBill",
  intro = "Use these pages if your search was close to this one but not exactly the same intent.",
  links = []
}) {
  if (!Array.isArray(links) || links.length === 0) {
    return null;
  }

  return (
    <section className="nb-highlight-panel scroll-mt-28" data-testid="seo-related-links">
      <div className="max-w-3xl">
        <p className="nb-kicker">Related workflows</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{intro}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-[#d5e5de] bg-white/90 px-4 py-4 shadow-[0_12px_28px_rgba(20,83,45,0.05)] transition hover:-translate-y-0.5 hover:border-[#bdd5c7]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2d5e50]">{link.kicker}</p>
            <p className="mt-2 text-base font-semibold text-slate-950">{link.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{link.body}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Open page</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <SeoLandingPage
      kicker="Privacy"
      title="NoteBill Privacy Policy"
      intro="NoteBill helps you turn rough notes, imports, and draft invoice details into professional invoices. This policy explains what information we may collect, how it may be used, and what choices you have when using the product."
      description="NoteBill privacy policy covering invoices, drafts, imports, billing, and deletion choices."
      path="/privacy"
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. For privacy or deletion requests, email ${SUPPORT_EMAIL} or use the public data deletion page.`}
      actions={[
        { href: "/", label: "Open NoteBill", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Information we may collect",
          items: [
            "Email address and session-related identifiers when you sign in or keep invoices tied to your account.",
            "Content you provide, including notes, invoice details, uploaded invoice files, images, and saved drafts.",
            "Audio notes and transcripts if audio transcription is enabled.",
            "Billing and subscription metadata if paid plans, payment links, or subscription checkout are enabled.",
            "Limited diagnostic or quality information used to run, secure, and improve the product."
          ],
          paragraphs: []
        },
        {
          title: "How we use information",
          items: [
            "To generate, edit, save, export, send, and reopen invoices.",
            "To authenticate users and scope invoice data to the correct account.",
            "To process imports, transcription, OCR, and invoice-generation workflows.",
            "To support subscription billing, payment-link creation, and invoice email delivery when those features are enabled.",
            "To troubleshoot issues, prevent abuse, and improve reliability."
          ],
          paragraphs: []
        },
        {
          title: "Service providers",
          paragraphs: [
            "Depending on which features are enabled in production, NoteBill may use service providers such as OpenAI for AI-assisted processing, billing providers for payment features, and SMTP2GO, Resend, or another email delivery provider for sending invoices or reminders.",
            "These providers are used to operate the service, not to sell your information."
          ]
        },
        {
          title: "Sharing and disclosure",
          items: [
            "We do not sell your personal information.",
            "We may share information with service providers that help us operate NoteBill.",
            "We may disclose information when required to comply with law, protect the service, investigate abuse, or support a business transfer."
          ],
          paragraphs: []
        },
        {
          title: "Your choices",
          items: [
            "You can delete saved invoices from the app.",
            "You can avoid optional features like uploads, transcription, billing, or email sending if you do not want to use them.",
            "You can request account-related privacy help through the support channel listed on the support page.",
            "You can request account and associated data deletion through the public data deletion page or by emailing support@notebill.app."
          ],
          paragraphs: []
        },
        {
          title: "Security and retention",
          paragraphs: [
            "NoteBill uses reasonable safeguards designed to protect information in transit and at rest, but no system can guarantee absolute security.",
            "Information is kept only as long as needed to provide the service, comply with legal obligations, resolve disputes, and maintain backups or security records where necessary."
          ]
        },
        {
          title: "Children's privacy",
          paragraphs: [
            "NoteBill is not directed to children under 13, and we do not knowingly collect personal information from children under 13."
          ]
        }
      ]}
    />
  );
}

function SupportPage() {
  return (
    <SeoLandingPage
      kicker="Support"
      title="NoteBill Support"
      intro="Use this page when you need a real reply about billing, sign-in, invoice delivery, privacy, or account issues. It is the cleanest path for anything that needs a human answer."
      description="NoteBill support page for billing, sign-in, invoice delivery, privacy, and account questions."
      path="/support"
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open app", tone: "primary" },
        { href: "/privacy", label: "Privacy", tone: "ghost" },
        { href: "/data-deletion", label: "Data deletion", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Best contact paths",
          items: [
            `Support email: ${SUPPORT_EMAIL}`,
            `Info email: ${INFO_EMAIL}`,
            `Direct contact: ${DIRECT_CONTACT_EMAIL}`,
            `Website: ${NOTE_BILL_SITE_URL}`,
            "Service name: NoteBill"
          ],
          paragraphs: []
        },
        {
          title: "What to include when you contact support",
          items: [
            "The email address used with your NoteBill account, if applicable.",
            "A short description of the problem and what you were trying to do.",
            "The device model and Android version if the issue is mobile-specific.",
            "Screenshots or the invoice ID if the problem relates to a saved draft or send flow.",
            "Whether the issue is about billing, restore purchases, payment links, or the client portal."
          ],
          paragraphs: []
        },
        {
          title: "Fastest fixes before you write us",
          items: [
            "For Google Play upgrades or restores, sign in with the same account that owns the purchase and try Restore purchases once.",
            "For save, send, or follow-up confusion, reopen the invoice from the library so you can confirm the draft, payment link, and portal from one place.",
            "For delivery issues, check the recipient email and resend from the library before assuming the invoice is lost."
          ],
          paragraphs: []
        },
        {
          title: "What happens after you contact support",
          items: [
            "A real person reviews the message and replies by email.",
            "If we need more context, we may ask for a screenshot, invoice number, device details, or the account email tied to the issue.",
            "If the issue is about billing or restore purchases, we may also ask which Google account or subscription path was used so we can trace the account safely."
          ],
          paragraphs: []
        },
        {
          title: "Privacy and account deletion requests",
          paragraphs: [
            "If you want your NoteBill account and associated data deleted, email support@notebill.app or use the public data deletion page.",
            "For account-level deletion requests, include the email address tied to your NoteBill account so we can verify ownership before acting on the request."
          ],
          items: []
        },
        {
          title: "Typical support topics",
          items: [
            "Signing in or session issues",
            "Invoice import, OCR, or transcription questions",
            "Saved drafts, export, and send behavior",
            "Billing, subscription, or payment-link questions",
            "Privacy or data deletion requests"
          ],
          paragraphs: []
        }
      ]}
    />
  );
}

function HelpCenterPage() {
  const commonTasks = [
    {
      title: "Build your first invoice",
      body: "Paste rough notes and let Billie make the first draft fast. Use the manual editor if you want full control from a blank draft.",
      action: { href: "/ai-intake?mode=quick", label: "Quick AI invoice" }
    },
    {
      title: "Finish and save a draft",
      body: "Open the manual editor, confirm the client, line items, totals, and notes, then save to the library so the invoice is reusable and ready for payment handoff.",
      action: { href: "/manual", label: "Open invoice editor" }
    },
    {
      title: "Send and follow up",
      body: "Use the library to send invoices, track delivery, create reminders, and reopen repeat work from one place.",
      action: { href: "/invoices", label: "Open invoice library" }
    },
    {
      title: "Set up the first paid handoff",
      body: "After you save the invoice, add the hosted payment link or client portal before sending so the first customer path already feels complete.",
      action: { href: "/manual", label: "Finish in editor" }
    },
    {
      title: "Report a bug or confusing step",
      body: "The feedback page is the fastest path for tester reports, screenshots, and device details.",
      action: { href: "/feedback", label: "Send feedback" }
    }
  ];
  const faqItems = [
    {
      question: "Where should I start if I only have messy job notes?",
      answer:
        "Use Billie intake. Paste the notes, review what Billie captured, then open the draft in the manual editor for final approval."
    },
    {
      question: "How do I make repeat invoices faster?",
      answer:
        "Save the draft to the library, save strong services to memory, and reuse repeat-client shortcuts from the launcher, manual editor, or library."
    },
    {
      question: "Why can I not create a payment link or client portal yet?",
      answer:
        "Those flows need a saved invoice first. Save the draft, then create the hosted payment link or client portal from the editor or library."
    },
    {
      question: "What should I do right after upgrading to Pro?",
      answer:
        "Save the invoice you are working on first, then add the payment link or client portal if you want the cleanest first customer handoff."
    },
    {
      question: "What makes the first customer send feel finished?",
      answer:
        "Save the invoice first, then add the hosted payment link or client portal before you send. That gives the customer a clearer, easier path to review and pay."
    },
    {
      question: "What should I send if something breaks?",
      answer:
        "Tell us what you were trying to do, what happened, what you expected, and include a screenshot or invoice number if you have one."
    }
  ];

  return (
    <SeoLandingPage
      kicker="Help center"
      title="NoteBill Help Center"
      intro="Use this page when you want the fastest path to the right screen, the right workflow, or the right support channel. It is designed to keep you moving without digging through long docs."
      description="NoteBill help center for invoices, drafts, sending, repeat work, and workflow basics."
      path="/help"
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. Need human help? Email ${SUPPORT_EMAIL}.`}
      actions={[
        { href: "/", label: "Open app", tone: "primary" },
        { href: "/feedback", label: "Feedback", tone: "ghost" },
        { href: "/support", label: "Support", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Best place to go next",
          items: [
            "Use Billie intake when you have rough notes and want NoteBill to prepare the draft.",
            "Use the manual editor when you want full control over client details, line items, notes, payment links, and portal setup.",
            "Use the invoice library when the work is already saved and you want send, payment, follow-up, or repeat-work actions."
          ],
          paragraphs: []
        },
        {
          title: "When to use feedback vs support",
          items: [
            "Use Feedback for bugs, confusing UI, cramped mobile layouts, slow screens, or anything testers notice while using the app.",
            "Use Support for account issues, billing questions, privacy requests, delivery problems, or anything that needs a direct reply."
          ],
          paragraphs: []
        },
        {
          title: "Fastest recovery path",
          items: [
            "If the draft already exists, reopen it from the library first.",
            "If the issue is billing-related, make sure you are signed in with the same account that owns the upgrade before you try Restore purchases.",
            "If the issue is about sending or payment, confirm the saved invoice, then add the payment link or client portal before resending."
          ],
          paragraphs: []
        }
      ]}
    >
      <section className="nb-highlight-panel" data-testid="help-center-quick-starts">
        <div>
          <p className="nb-kicker">Quick starts</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Most common things people need help with</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {commonTasks.map((task) => (
            <div key={task.title} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{task.body}</p>
              <a href={task.action.href} className="mt-3 inline-flex rounded-full border border-[#d5e5de] bg-white px-3 py-1.5 text-xs font-semibold text-[#17493c]">
                {task.action.label}
              </a>
            </div>
          ))}
        </div>
      </section>
      <section className="nb-highlight-panel" data-testid="help-center-faq">
        <div>
          <p className="nb-kicker">Fast answers</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Questions we expect most often</h2>
        </div>
        <div className="mt-4 space-y-3">
          {faqItems.map((item) => (
            <div key={item.question} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{item.question}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </SeoLandingPage>
  );
}

function FeedbackPage() {
  const [deviceDetails] = useState(() => buildFeedbackDeviceDetails());
  const [copyStatus, setCopyStatus] = useState("");
  const v2TesterMissions = [
    {
      label: "Onboarding",
      body: "Start from sample notes and see if the first-invoice guide makes the next step obvious."
    },
    {
      label: "Sign-in",
      body: "Try email-link sign-in, or Google Sign-In if this build has Google enabled."
    },
    {
      label: "Send/payment",
      body: "Save an invoice, open the library, and check whether send, payment, and follow-up status feel clear."
    },
    {
      label: "Portal",
      body: "Create or open a client portal link and confirm the customer-facing invoice feels trustworthy."
    }
  ];

  const handleCopyDeviceDetails = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Copy is unavailable here. Long-press the details below and copy them.");
      return;
    }

    try {
      await withTimeout(navigator.clipboard.writeText(deviceDetails), 1500);
      setCopyStatus("Device details copied.");
    } catch {
      setCopyStatus("Copy failed. Long-press the details below and copy them.");
    }
  };

  return (
    <SeoLandingPage
      kicker="Tester feedback"
      title="NoteBill Feedback"
      intro="If something feels confusing, broken, cramped, slow, or just a little weird on your phone, send it here. Small papercuts count because they are exactly what make an invoice app feel hard or easy."
      description="NoteBill feedback page for bugs, screenshots, workflow confusion, and product suggestions."
      path="/feedback"
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}. Feedback goes to ${SUPPORT_EMAIL}.`}
      actions={[
        { href: buildFeedbackMailto(deviceDetails), label: "Email feedback", tone: "primary" },
        { href: "/", label: "Open app", tone: "ghost" },
        { href: "/support", label: "Support", tone: "ghost" }
      ]}
      sections={[
        {
          title: "Fastest useful report",
          items: [
            "What you were trying to do.",
            "What happened instead.",
            "What you expected to happen.",
            "Your phone model and Android version, if you know them.",
            "A screenshot, screen recording, or invoice ID if the issue is visual or tied to saved work.",
            `If the email button does not open, send the same details to ${SUPPORT_EMAIL}.`
          ],
          paragraphs: []
        },
        {
          title: "What we especially want to catch",
          items: [
            "Anything that blocks sign-in, invoice generation, saving, exporting, or sending.",
            "Visual bugs like clipped buttons, overlapping text, tiny tap targets, or screens that feel crowded.",
            "Invoice math issues, confusing wording, or anything that makes you hesitate before sending.",
            "Moments where Billie does not understand normal job notes or makes the invoice harder to finish."
          ],
          paragraphs: []
        },
        {
          title: "Two-minute tester script",
          items: [
            "Start from notes or sample notes and build an invoice.",
            "Check the client, line items, total, tax, and due date.",
            "Save the invoice, reopen it from the library, then export the PDF.",
            "If you sign in, confirm the email-link flow feels understandable and not spooky.",
            "Tell us the first place you felt unsure, even if you eventually figured it out."
          ],
          paragraphs: []
        },
        {
          title: "Tiny notes are welcome",
          paragraphs: [
            "You do not need to write a perfect bug report. Even a short note like \"the Generate button was cut off on my Galaxy\" is useful enough to improve the next build."
          ],
          items: []
        }
      ]}
    >
      <section className="nb-highlight-panel" data-testid="feedback-v2-test-plan">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="nb-kicker">V2 tester pass</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">Best flows to test before public launch</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              If you only have a few minutes, run one of these paths and tell us where you hesitated.
            </p>
          </div>
          <a href={buildFeedbackMailto(deviceDetails)} className="nb-btn-primary shrink-0">
            Email V2 feedback
          </a>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {v2TesterMissions.map((mission) => (
            <div key={mission.label} className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{mission.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{mission.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="nb-highlight-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Copy device details</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              If a screen looks cramped or a button is cut off, paste these details into your feedback so we
              can reproduce it faster.
            </p>
          </div>
          <button type="button" className="nb-btn-secondary shrink-0" onClick={handleCopyDeviceDetails}>
            Copy device details
          </button>
        </div>
        {copyStatus ? (
          <p className="mt-3 text-sm font-semibold text-slate-700" role="status">
            {copyStatus}
          </p>
        ) : null}
        <pre className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white/85 p-4 font-mono text-[11px] leading-5 text-slate-600">
          {deviceDetails}
        </pre>
      </section>
    </SeoLandingPage>
  );
}

function DataDeletionPage() {
  return (
    <SeoLandingPage
      kicker="Data deletion"
      title="NoteBill Account and Data Deletion"
      intro="If you want your NoteBill account and associated data deleted, use the request path below. This page is intended to satisfy the public account-deletion URL requirement for app marketplaces and to give users a clear way to start a deletion request outside the app."
      description="NoteBill account and data deletion request page."
      path="/data-deletion"
      footerNote={`Last updated: ${PUBLIC_INFO_LAST_UPDATED}.`}
      actions={[
        { href: "/", label: "Open app", tone: "primary" },
        { href: "/support", label: "Support", tone: "ghost" },
        { href: "/privacy", label: "Privacy", tone: "ghost" }
      ]}
      sections={[
        {
          title: "How to request deletion",
          paragraphs: [
            `Email ${SUPPORT_EMAIL} with a subject such as "NoteBill data deletion request" or "Delete my NoteBill account".`
          ],
          items: [
            "Include the email address associated with your NoteBill account.",
            "If your request relates to billing, include any recent invoice, subscription, or payment details that help us locate the account.",
            "If you no longer have access to the original email address, include enough detail for us to verify ownership before we act on the request."
          ]
        },
        {
          title: "What happens after you contact us",
          items: [
            "We may ask you to verify account ownership before processing the request.",
            "After verification, we will delete or de-identify account-linked data that we are not required to keep.",
            "If your account includes saved invoices, drafts, or imported source material tied to the verified account, those records are included in the account-level deletion workflow."
          ],
          paragraphs: []
        },
        {
          title: "Typical timeline",
          items: [
            "We review deletion requests manually so we can verify ownership safely.",
            "If we need more information, we will reply by email before acting on the request.",
            "Once the request is verified, we complete the deletion workflow as quickly as reasonably possible."
          ],
          paragraphs: []
        },
        {
          title: "What may be retained",
          items: [
            "Security, fraud-prevention, legal, tax, dispute, and backup records may be retained where required or reasonably necessary.",
            "Payment and subscription records may be retained by us or our billing providers for accounting, compliance, or audit obligations."
          ],
          paragraphs: []
        },
        {
          title: "What you can delete directly in the app",
          items: [
            "Saved invoices can be removed from within NoteBill.",
            "Deleting invoices inside the app is separate from an account-level deletion request."
          ],
          paragraphs: []
        },
        {
          title: "Related pages",
          items: [
            "Privacy policy: /privacy",
            "Support: /support",
            `Website: ${NOTE_BILL_SITE_URL}`
          ],
          paragraphs: []
        }
      ]}
    />
  );
}

function InvoiceAppForContractorsPage() {
  return (
    <SeoLandingPage
      kicker="Invoice app for contractors"
      title="Invoice App for Contractors"
      intro="NoteBill helps contractors turn rough job notes, site details, and unfinished totals into a clean invoice, client statement, and follow-up without rebuilding the same paperwork every time."
      highlights={["Rough notes to clean invoice", "Statements and follow-up", "Mobile and desktop"]}
      description="Invoice app for contractors that turns rough job notes into clean invoices, statements, and follow-up."
      path="/invoice-app-for-contractors"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Quick AI invoice", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Best for contractors who want one clean path from job notes to invoice, statement, and follow-up."
      sections={[
        {
          title: "Start from rough job notes",
          paragraphs: [
            "Paste the job details you already have and let NoteBill shape the first draft. That keeps the setup fast when the work was tracked on the move, in a text thread, or on a scrap of paper.",
            "You still approve the money decisions before anything is saved, exported, or sent, so the workflow stays quick without getting sloppy."
          ],
          items: [
            "Job notes become a draft invoice faster.",
            "Client details can be reused on repeat work.",
            "You can keep the workflow moving on mobile or desktop."
          ]
        },
        {
          title: "Built for repeat jobs and collections",
          paragraphs: [
            "Contractors often invoice the same client again and again. NoteBill keeps the path to statements, reminders, and follow-up visible so you do not have to rebuild the same workflow each time.",
            "If the client has partial payment or an open balance, the workspace keeps that recovery path easy to find and easy to act on."
          ],
          items: [
            "Statements and reminders stay in reach.",
            "Partial payment follow-up is visible in the workspace.",
            "Repeat-client memory reduces setup time."
          ]
        },
        {
          title: "Pricing that stays simple",
          paragraphs: [
            "Monthly Pro is the easy ongoing option for contractors who invoice every week.",
            "Lifetime Pro is the one-and-done option for people who know they will keep using NoteBill."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">Good fit if you</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Need to invoice from the truck, jobsite, or between visits.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Want the client statement and follow-up path in one place.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Prefer a clean invoice flow over a big accounting system.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="A quick sanity check for contractors who want to know whether this is a workflow tool or just another invoice template."
        whatItIs={[
          "A fast path from rough job notes to a reviewable invoice draft.",
          "A place to keep statements, reminders, and repeat-client memory in one loop.",
          "A mobile-first workflow that still stays usable on desktop."
        ]}
        whatItIsNot={[
          "A full accounting suite.",
          "A logo designer or generic document editor.",
          "An autopilot that changes your totals without approval."
        ]}
      faqs={[
          {
            question: "Can I use it from the jobsite?",
            answer:
              "Yes. The quick AI invoice path is designed to start from rough notes on a phone and move into a clean draft fast."
          },
          {
            question: "Do I still approve the money?",
            answer:
              "Yes. AI helps with wording and structure, but totals, discounts, tax, and send decisions stay under your control."
          },
          {
            question: "Why not just use ChatGPT?",
            answer:
              "ChatGPT can draft text, but NoteBill is built for the full workflow: draft, review, save, send, statements, reminders, and repeat-client follow-up in one place."
          }
        ]}
      />
      <RelatedWorkflowLinks
        links={[
          {
            href: "/mobile-invoice-app",
            kicker: "Phone workflow",
            title: "Try NoteBill on your phone",
            body: "Best if you want the mobile workflow page before choosing the install path."
          },
          {
            href: "/ai-invoicing-app",
            kicker: "AI drafting",
            title: "AI invoicing app",
            body: "Best if you want AI to help turn rough job notes into a cleaner draft first."
          },
          {
            href: "/bill-maker-app",
            kicker: "Faster draft",
            title: "Bill maker app",
            body: "Best if the search was really about making a bill or invoice quickly from rough notes."
          },
          {
            href: "/client-statements-and-follow-up",
            kicker: "Collections",
            title: "Statements and follow-up",
            body: "Best if the real pain is open balances, reminders, and recovery after the send."
          }
        ]}
      />
      <PricingChoicePanel />
    </SeoLandingPage>
  );
}

function InvoiceAppForServiceBusinessesPage() {
  return (
    <SeoLandingPage
      kicker="Invoice app for service businesses"
      title="Invoice App for Service Businesses"
      intro="NoteBill is built for service businesses that need a fast way to turn notes into invoices, statements, and follow-up without making the owner or office spend all day on admin."
      highlights={["Fast review before send", "Open balances stay visible", "Monthly or lifetime"]}
      description="Invoice app for service businesses with invoices, statements, follow-up, and repeat-client memory."
      path="/invoice-app-for-service-businesses"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Quick AI invoice", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="A strong fit for solo operators and small teams that need less admin drag and clearer collections."
      sections={[
        {
          title: "Keep the workflow simple",
          paragraphs: [
            "Service businesses need speed. NoteBill keeps the path from notes to invoice short, while still giving you a clean review step before the money decisions are locked in.",
            "That means less back-and-forth, fewer missing details, and a cleaner handoff to the client."
          ],
          items: [
            "Simple draft review before send.",
            "Statements and follow-up stay connected to the client.",
            "The same repeat-client flow works on mobile or desktop."
          ]
        },
        {
          title: "Collections should not feel scattered",
          paragraphs: [
            "If a client needs a reminder, a statement, or a partial-payment follow-up, the workspace keeps those actions close to the open balance so you can move quickly without hunting through different screens."
          ],
          items: [
            "Open balances stay visible.",
            "Follow-up actions are easy to find.",
            "The operator view surfaces recent collections work."
          ]
        },
        {
          title: "Choose the pricing path that fits",
          paragraphs: [
            "Monthly Pro is the simple ongoing option if you want a running subscription.",
            "Lifetime Pro is the one-and-done option if you want to pay once and keep using NoteBill."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">Good fit if you</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Run a small service business and need faster invoicing.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Want statements and follow-up without extra software overhead.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Need one clear place for repeat work and client memory.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="Service businesses usually want speed, repeatability, and less admin. This block helps make that clear before the pricing decision."
        whatItIs={[
          "A mobile-first workflow for turning service notes into a clean invoice.",
          "A way to keep reminders and statements close to the open balance.",
          "A repeat-work helper for businesses that bill the same clients again."
        ]}
        whatItIsNot={[
          "Heavy accounting software.",
          "A design tool that makes you rebuild everything from scratch.",
          "A black box that finalizes money decisions for you."
        ]}
      faqs={[
          {
            question: "Is this okay for repeat clients?",
            answer:
              "Yes. Saved client memory and statement follow-up are part of the value, so repeat work gets faster over time."
          },
          {
            question: "Will this feel too complicated for a small team?",
            answer:
              "No. The goal is a short path from notes to send-ready draft, with the collections tools only where you need them."
          },
          {
            question: "Why not just use ChatGPT?",
            answer:
              "Because the app is not just drafting text. It keeps the invoice workflow, client memory, statements, and follow-up in one place so the work can be repeated."
          }
        ]}
      />
      <RelatedWorkflowLinks
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/ai-billing-app",
            kicker: "AI follow-up",
            title: "AI billing app",
            body: "Best if the real need is reminders, payment handoff, and cleaner collections wording."
          },
          {
            href: "/mobile-billing-app",
            kicker: "Billing focus",
            title: "Mobile billing app",
            body: "Best if your search was really about billing, reminders, and getting paid on phone."
          },
          {
            href: "/how-to-make-an-invoice-on-your-phone",
            kicker: "How-to guide",
            title: "How to make an invoice on your phone",
            body: "Best if you want a simple practical guide before deciding whether to install anything."
          }
        ]}
      />
      <PricingChoicePanel />
    </SeoLandingPage>
  );
}

function MobileInvoiceAppPage() {
  return (
    <SeoLandingPage
      kicker="Mobile invoice app"
      title="Mobile Invoice App"
      intro="NoteBill keeps the important parts of invoicing easy on a phone: rough notes, quick review, statement follow-up, and the next step to get paid."
      highlights={["Built for phones first", "Statements stay close", "No crowded screens"]}
      description="Mobile invoice app for fast note-to-invoice flow, statements, and follow-up on phone or desktop."
      path="/mobile-invoice-app"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Quick AI invoice", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Designed to stay clear on mobile without getting too crowded on desktop."
      sections={[
        {
          title: "Fast on a phone, clean on desktop",
          paragraphs: [
            "The launcher and core workflow are built to stay readable on small screens and still feel polished on a desktop browser.",
            "That matters if you invoice from the field but also clean things up later at a desk."
          ],
          items: [
            "The first path is short and obvious.",
            "Action cards stay tappable on mobile.",
            "Desktop keeps the same calm hierarchy."
          ]
        },
        {
          title: "You still control the money",
          paragraphs: [
            "Billie helps build the first draft, but you still confirm the parts that change totals before the invoice gets saved or sent.",
            "That keeps the mobile workflow quick without making it sloppy."
          ],
          items: [
            "Review before send.",
            "Follow-up stays visible.",
            "Repeat-client memory keeps the flow moving."
          ]
        },
        {
          title: "Simple pricing",
          paragraphs: [
            "Monthly Pro is the easy ongoing plan if you want to try the workflow with low friction.",
            "Lifetime Pro is the one-and-done option if you know NoteBill will stay in your workflow."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">Why mobile users like it</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>It starts from rough notes, not a blank accounting form.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>It keeps statement and follow-up actions close to the invoice.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>It avoids the crowded feel of heavier finance software.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="If you want a fast phone-first invoice app, these are the main trust questions people ask before trying it."
        whatItIs={[
          "A quick way to turn notes into a draft on a phone.",
          "A mobile-first workflow that still stays polished on desktop.",
          "A tool that keeps follow-up and statements near the invoice."
        ]}
        whatItIsNot={[
          "A crowded finance dashboard.",
          "A giant accounting package.",
          "A chatbot that takes over money decisions."
        ]}
      faqs={[
          {
            question: "Is the mobile experience actually the main thing?",
            answer:
              "Yes. The screens are designed to stay readable and tappable on a phone first, then still feel clean on desktop."
          },
          {
            question: "Can I start with just rough notes?",
            answer:
              "Yes. That is the main path: paste rough notes, review the draft, and move toward send."
          },
          {
            question: "Why not just use ChatGPT?",
            answer:
              "Because this flow is built around invoicing, not chatting. You get a fast draft, then the save/send/follow-up steps stay connected to the same invoice."
          }
        ]}
      />
      <RelatedWorkflowLinks
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Install first",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Android install angle, Play billing path, and main conversion path."
          },
          {
            href: "/bill-maker-app",
            kicker: "Fast drafting",
            title: "Bill maker app",
            body: "Best if the real need is making a bill quickly from field notes instead of blank templates."
          },
          {
            href: "/mobile-billing-app",
            kicker: "Billing flow",
            title: "Mobile billing app",
            body: "Best if your pain is keeping billing, payment links, and follow-up together."
          }
        ]}
      />
      <PricingChoicePanel />
    </SeoLandingPage>
  );
}

function BillMakerAppPage() {
  return (
    <SeoLandingPage
      kicker="Bill maker app"
      title="Bill Maker App"
      intro="NoteBill is a bill maker app for people who start with rough notes, not perfect paperwork. It helps turn field notes into a clean invoice or bill without rebuilding the same information by hand."
      highlights={["Start from notes", "Review before send", "Phone or desktop"]} 
      description="Bill maker app for turning rough job notes into clean bills, invoices, and follow-up."
      path="/bill-maker-app"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Try the draft flow", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Useful if the fastest version of the job is: write notes now, shape the bill cleanly later, then send with confidence."
      sections={[
        {
          title: "A bill maker app should not start with a blank form",
          paragraphs: [
            "Most people searching for a bill maker app do not want more setup. They want a faster path from what happened on the job to something professional enough to send.",
            "That is why NoteBill starts from rough notes first, then helps shape the invoice while keeping the money review visible."
          ],
          items: [
            "Paste or type rough notes first.",
            "Review totals and wording before save or send.",
            "Keep payment link and follow-up tied to the same invoice."
          ]
        },
        {
          title: "Better than generic bill templates",
          paragraphs: [
            "Templates are fine if the job details are already clean. They are slower when the real input is messy notes, short text messages, or a half-finished job log.",
            "NoteBill is better when the problem is not design, but turning rough billing information into something sendable faster."
          ],
          items: [
            "Less retyping.",
            "Less hopping between tools.",
            "A cleaner review step before the invoice becomes real."
          ]
        }
      ]}
    >
      <TrustAndFaqPanel
        intro="People searching for a bill maker app usually want speed and simplicity first, then trust."
        whatItIs={[
          "A faster way to turn messy work notes into a clean bill or invoice.",
          "A workflow that keeps review, payment link, and follow-up close together.",
          "A practical invoice tool for real service work, not just static templates."
        ]}
        whatItIsNot={[
          "A bookkeeping suite.",
          "A one-screen template gallery with no workflow around it.",
          "A tool that changes money decisions without your review."
        ]}
        faqs={[
          {
            question: "Can I make a bill from rough notes?",
            answer:
              "Yes. That is one of the main reasons to use NoteBill instead of a blank invoice template."
          },
          {
            question: "Do I still check the totals?",
            answer:
              "Yes. You still review the money and wording before the invoice is saved or sent."
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related invoice and billing paths"
        intro="These are the closest pages if your search was about mobile billing, installing on Android, or learning the basic phone workflow first."
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/mobile-billing-app",
            kicker: "Billing flow",
            title: "Mobile billing app",
            body: "Best if your real pain is billing, payment links, and follow-up rather than just making the first bill."
          },
          {
            href: "/how-to-make-an-invoice-on-your-phone",
            kicker: "How-to guide",
            title: "How to make an invoice on your phone",
            body: "Best if you want the practical step-by-step version before you try the app."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Try the bill draft flow" />
    </SeoLandingPage>
  );
}

function MobileBillingAppPage() {
  return (
    <SeoLandingPage
      kicker="Mobile billing app"
      title="Mobile Billing App"
      intro="NoteBill is a mobile billing app for service businesses that need the billing path to stay simple: rough notes, clear invoice review, payment handoff, and follow-up in one place."
      highlights={["Billing path stays connected", "Payment handoff nearby", "Built for repeat work"]}
      description="Mobile billing app for rough notes, clear invoice review, payment handoff, and follow-up."
      path="/mobile-billing-app"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Try the billing draft flow", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Best when the hard part is not writing the invoice, but keeping billing, reminders, and the next money-moving step organized."
      sections={[
        {
          title: "Billing should stay attached to the invoice",
          paragraphs: [
            "A mobile billing app should not just make the first document. It should help you keep the payment path, reminder path, and next follow-up step easy to find after the invoice exists.",
            "That is where NoteBill is stronger than just a basic invoice creator."
          ],
          items: [
            "Payment link setup stays near the invoice.",
            "Follow-up and reminder actions stay visible.",
            "Repeat-client memory helps the next billing cycle move faster."
          ]
        },
        {
          title: "Good if you bill from the field and follow up later",
          paragraphs: [
            "Some owners invoice from the truck, some from the office, and most from both. The workflow should still make sense when the notes begin on a phone and the final send happens later.",
            "The mobile billing path in NoteBill is built around that reality."
          ],
          items: [
            "Phone-first capture.",
            "Desktop-safe cleanup later.",
            "Calmer follow-up when the invoice is already sent."
          ]
        }
      ]}
    >
      <TrustAndFaqPanel
        intro="This page is for people whose real problem is keeping billing organized after the draft exists."
        whatItIs={[
          "A mobile billing workflow with payment handoff close by.",
          "A way to keep reminders and follow-up tied to the same invoice.",
          "A cleaner path than stitching billing together across different apps."
        ]}
        whatItIsNot={[
          "A giant finance suite.",
          "A one-click autopilot for money decisions.",
          "A generic CRM trying to do billing as a side feature."
        ]}
        faqs={[
          {
            question: "Is this more than just making the invoice?",
            answer:
              "Yes. The billing value is that payment links, reminders, and follow-up stay close after the invoice is saved."
          },
          {
            question: "Can I still use it if the work starts on a phone?",
            answer:
              "Yes. That is one of the main intended workflows."
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related invoice pages"
        intro="If your search was closer to bill making, mobile invoicing, or phone-first install intent, these pages are the closest next click."
        links={[
          {
            href: "/ai-invoicing-app",
            kicker: "AI drafting",
            title: "AI invoicing app",
            body: "Best if the real need is shaping the first draft from rough notes faster."
          },
          {
            href: "/mobile-invoice-app",
            kicker: "Mobile invoicing",
            title: "Mobile invoice app",
            body: "Best if the question is whether the invoice workflow itself stays clean on a phone."
          },
          {
            href: "/ai-billing-app",
            kicker: "AI follow-up",
            title: "AI billing app",
            body: "Best if your pain is reminders, payment handoff, and cleaner billing wording."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Try the mobile billing flow" />
    </SeoLandingPage>
  );
}

function AIInvoicingAppPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "NoteBill",
        operatingSystem: "Android",
        applicationCategory: "BusinessApplication",
        url: `${NOTE_BILL_SITE_URL}/ai-invoicing-app`,
        downloadUrl: GOOGLE_PLAY_STORE_URL,
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          }
        ],
        description:
          "AI invoice generator for rough notes, cleaner drafts, and a visible review before you save or send."
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Does AI change my totals?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "No. AI helps shape wording and structure, but totals, discounts, tax, and send decisions stay under your control."
            }
          },
          {
            "@type": "Question",
            name: "Can I start from rough notes?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. That is the main point: start from the notes you already have, then review the invoice before it becomes final."
            }
          },
          {
            "@type": "Question",
            name: "Why not just use ChatGPT?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "ChatGPT can draft text, but NoteBill keeps the invoice, review, save, send, payment handoff, and follow-up in one workflow."
            }
          }
        ]
      }
    ]
  };

  return (
    <SeoLandingPage
      kicker="AI invoice generator"
      title="AI Invoice Generator"
      intro="NoteBill is an AI invoice generator for freelancers, contractors, and small business owners who start from rough notes and want a client-ready invoice without spreadsheet friction."
      highlights={["Rough notes to invoice", "Review before send", "Google Play + web"]}
      description="AI invoice generator for rough notes, cleaner drafts, and a visible review before send."
      path="/ai-invoicing-app"
      structuredData={structuredData}
      actions={[
        { href: GOOGLE_PLAY_STORE_URL, label: "Download on Google Play", tone: "primary" },
        { href: "/landing/invoice-export-samples/classic-split.pdf", label: "View sample invoice", tone: "ghost" },
        { href: "/ai-intake?mode=quick", label: "Try the web draft flow", tone: "ghost" }
      ]}
      footerNote="Free helps you test the draft flow. Pro helps you keep the repeat workflow, sending, reminders, payment links, memory, and sync ready for repeat invoicing."
      sections={[
        {
          title: "Messy notes are the real problem",
          paragraphs: [
            "Most people looking for an AI invoice generator are not starting from a clean template. They are starting from text messages, rough notes, job scraps, or a half-finished invoice they need to finish fast.",
            "NoteBill is built for that moment: turn the rough input into a clear draft, then slow down just long enough to review the money before anything goes out."
          ],
          items: [
            "Rough notes become a draft faster.",
            "Blank-template friction drops away.",
            "The invoice still stays readable enough to trust."
          ]
        },
        {
          title: "How the generator works",
          paragraphs: [
            "The flow is simple: add the job and client details you already have, let Billie help shape the draft, then review and edit before you export or send.",
            "Once the invoice is ready, the same workflow keeps the handoff path close so follow-up does not get lost."
          ],
          items: [
            "Add job and client details.",
            "Let AI help draft and clean up the wording.",
            "Review before save or send.",
            "Export, send, and follow up from the same invoice."
          ]
        },
        {
          title: "Who it is for",
          paragraphs: [
            "This page is for freelancers, contractors, service businesses, solo operators, and anyone who invoices from their phone and wants the workflow to feel lighter.",
            "If you usually work out of spreadsheets or blank templates, this is aimed at making the first draft faster and the final invoice easier to trust."
          ],
          items: [
            "Freelancers and contractors.",
            "Small service businesses.",
            "People invoicing from their phone.",
            "People who want less spreadsheet friction."
          ]
        },
        {
          title: "Free vs Pro value",
          paragraphs: [
            "Free helps you try invoice creation and see whether the workflow fits how you work.",
            "Pro is for repeat users who want saved workflow, sending, reminders, payment links, memory, sync/persistence, and repeat use without starting over every time."
          ],
          items: [
            "Free: test the draft flow.",
            "Pro: keep the repeat workflow ready.",
            "Better for monthly invoicing and repeat clients."
          ]
        }
      ]}
    >
      <section className="nb-highlight-panel">
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="nb-kicker">Sample proof</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              See a real exported invoice before you install
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-700 md:text-[15px]">
              This is an actual PDF exported from NoteBill. It shows the end result people care about: a clean invoice
              that looks client-ready instead of like a rough draft.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/landing/invoice-export-samples/classic-split.pdf"
                target="_blank"
                rel="noreferrer"
                data-revenue-cta="sample-pdf"
                className="nb-btn-primary"
              >
                View sample invoice
              </a>
              <a href={GOOGLE_PLAY_STORE_URL} target="_blank" rel="noreferrer" className="nb-btn-ghost">
                Download on Google Play
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-[#d5e5de] bg-white shadow-[0_16px_36px_rgba(20,83,45,0.08)]">
            <img
              src="/landing/invoice-export-samples/classic-split.preview.png"
              alt="Real exported invoice preview from NoteBill showing a painter finish work invoice."
              width="1090"
              height="1314"
              loading="eager"
              decoding="async"
              className="h-auto w-full object-contain"
            />
          </div>
        </div>
      </section>
      <TrustAndFaqPanel
        intro="This page is for people who want AI to help with the invoice draft, but do not want the app to take over the money decision."
        whatItIs={[
          "An AI-assisted way to shape rough notes into a cleaner invoice draft.",
          "A phone-first workflow that keeps the review step visible.",
          "A practical invoice generator rather than a generic chatbot."
        ]}
        whatItIsNot={[
          "An autopilot that finalizes the invoice without approval.",
          "A giant accounting suite.",
          "A logo generator or branding toy."
        ]}
        faqs={[
          {
            question: "Can AI help me start from rough notes?",
            answer:
              "Yes. That is the main use case: take messy job notes and get to a cleaner reviewable draft faster."
          },
          {
            question: "Do I still check the totals?",
            answer:
              "Yes. The money side stays visible so you can approve it before save or send."
          },
          {
            question: "Can I view a sample invoice first?",
            answer:
              "Yes. The page includes a real exported sample invoice so you can inspect the output before you install."
          },
          {
            question: "Is this better than a blank template?",
            answer:
              "Usually yes if the real input is rough notes, quick messages, or an unfinished job log instead of neat paperwork."
          },
          {
            question: "Can I download on Google Play?",
            answer:
              "Yes. The Android install path is available from the page, and the Google Play app is the main way to use NoteBill on a phone."
          }
        ]}
      />
      <ComparisonPanel
        title="Why NoteBill is better than a generic chatbot or blank template"
        intro="This is the shortest practical answer for people deciding whether the app is actually better than the tools they already have."
        cards={[
          {
            kicker: "NoteBill",
            title: "AI invoice workflow with review built in",
            body: "The AI helps shape the draft, then the invoice stays attached to save, send, payment handoff, and follow-up.",
            points: [
              "Rough notes become a draft faster.",
              "Money stays visible before send.",
              "Follow-up does not get lost after the invoice exists."
            ],
            emphasis: true
          },
          {
            kicker: "ChatGPT",
            title: "Good for writing text",
            body: "Useful if you mainly need help wording a note, but it does not keep the invoice workflow connected after the draft.",
            points: [
              "Great for rough wording.",
              "Not built around invoices or saved billing state.",
              "You still need to move the result into another tool."
            ]
          },
          {
            kicker: "Blank template",
            title: "Good when the details are already clean",
            body: "Fine if everything is already organized, but slower when the real input is messy notes, messages, or a half-finished job log.",
            points: [
              "Helpful for neat paperwork.",
              "Less helpful for rough field notes.",
              "Can make the first draft feel like extra admin."
            ]
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related AI and invoice pages"
        intro="These are the closest next pages if you want the AI billing angle, mobile workflow, or the simplest bill maker path."
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Install first",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/ai-invoice-app",
            kicker: "Exact-match AI",
            title: "AI invoice app",
            body: "Best if you want the shorter exact-match page that compares the app to a generic chatbot."
          },
          {
            href: "/ai-billing-app",
            kicker: "AI follow-up",
            title: "AI billing app",
            body: "Best if your real pain is reminders, payment handoff, and cleaner billing follow-up."
          },
          {
            href: "/mobile-invoice-app",
            kicker: "Phone workflow",
            title: "Try NoteBill on your phone",
            body: "Best if you want the mobile workflow page before choosing the install path."
          },
          {
            href: "/bill-maker-app",
            kicker: "Fast bill drafting",
            title: "Bill maker app",
            body: "Best if the main need is turning rough notes into the first bill fast."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Try the web draft flow" />
    </SeoLandingPage>
  );
}

function AIInvoiceAppPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "NoteBill",
        operatingSystem: "Android",
        applicationCategory: "BusinessApplication",
        url: `${NOTE_BILL_SITE_URL}/ai-invoice-app`,
        downloadUrl: GOOGLE_PLAY_STORE_URL,
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          }
        ],
        description:
          "AI invoice app for rough notes, cleaner drafts, and a clearer review before save or send."
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How is this different from ChatGPT?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "ChatGPT can draft text, but NoteBill keeps the invoice, review, save, send, payment handoff, and follow-up in one workflow."
            }
          },
          {
            "@type": "Question",
            name: "Can AI start from rough notes?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. The point is to turn messy job notes into a cleaner reviewable draft faster."
            }
          }
        ]
      }
    ]
  };

  return (
    <SeoLandingPage
      kicker="AI invoice app"
      title="AI Invoice App"
      intro="NoteBill is an AI invoice app for rough notes, cleaner drafts, and a clearer review before save or send."
      highlights={["Exact-match AI intent", "Review before send", "Draft from notes"]}
      description="AI invoice app for rough notes, cleaner drafts, and a clearer review before save or send."
      path="/ai-invoice-app"
      structuredData={structuredData}
      actions={[
        { href: "/ai-intake?mode=quick", label: "Try the AI draft flow", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Best if the real search intent is an AI invoice app that can take you from notes to a reviewable draft without losing control of the money part."
      sections={[
        {
          title: "Start from the notes you already have",
          paragraphs: [
            "A good AI invoice app should help you get from rough notes, messages, and half-finished job details to a draft you can review quickly.",
            "That is the value here: less retyping, less blank-page friction, and a cleaner first pass without hiding the invoice from you."
          ],
          items: [
            "Rough notes become a cleaner draft.",
            "The invoice still stays readable enough to trust.",
            "You keep the final say over totals and wording."
          ]
        },
        {
          title: "Why this is better than a generic chatbot",
          paragraphs: [
            "A chatbot can help write text, but an invoice app has to keep the invoice, save state, payment handoff, and follow-up together after the draft is done.",
            "That is why NoteBill is more useful than a blank chat box if your goal is to actually send a bill and get paid."
          ],
          items: [
            "Draft, review, save, send stay connected.",
            "Payment links and reminders stay attached.",
            "The workflow feels like a product, not a prompt."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">What people usually want from this search</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>AI to help draft the invoice from rough notes.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>A clear review step before the invoice is saved or sent.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>A practical billing workflow instead of just a chatbot response.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="This page is for people who want the short answer: AI can help invoice drafting, but the money part should stay visible."
        whatItIs={[
          "An AI-assisted invoice workflow.",
          "A cleaner alternative to a blank form.",
          "A review-before-send path that still feels like invoicing."
        ]}
        whatItIsNot={[
          "A generic chatbot with no invoice context.",
          "A design tool.",
          "A black box that changes totals without approval."
        ]}
        faqs={[
          {
            question: "Can AI help me start the invoice?",
            answer:
              "Yes. That is the main job: turn rough notes into a cleaner reviewable draft faster."
          },
          {
            question: "Do I still approve the totals?",
            answer:
              "Yes. Totals, discounts, tax, and send decisions stay under your control."
          },
          {
            question: "Why use this instead of ChatGPT?",
            answer:
              "Because the invoice workflow stays attached after the draft. That makes it useful for real billing, not just writing text."
          }
        ]}
      />
      <ComparisonPanel
        title="Why this beats a generic chatbot or template when you need a bill"
        intro="The best answer here is practical: the workflow stays connected after the draft, so it can actually support billing instead of just writing text."
        cards={[
          {
            kicker: "NoteBill",
            title: "AI invoice app with a real invoice flow",
            body: "Rough notes go in, a reviewable invoice comes out, and save/send/payment handoff stay attached.",
            points: [
              "Built for drafting invoices, not just messages.",
              "Keeps payment and follow-up in the same workflow.",
              "Feels like a tool, not a prompt."
            ],
            emphasis: true
          },
          {
            kicker: "ChatGPT",
            title: "Great writing helper",
            body: "Useful for wording, but the invoice and billing steps still need to be handled elsewhere.",
            points: [
              "Good at drafting copy.",
              "Not centered on billing state.",
              "Can leave you stitching tools together."
            ]
          },
          {
            kicker: "Blank template",
            title: "Fine when the job is already clean",
            body: "Works if all the details are already organized, but it can slow you down when the real input is messy notes or field messages.",
            points: [
              "Fine for tidy paperwork.",
              "Slower for rough notes.",
              "Can make the first pass feel heavier than it should."
            ]
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related AI invoice pages"
        intro="These are the closest next clicks if you want the broader AI invoicing page or the follow-up side."
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/ai-invoicing-app",
            kicker: "Broad AI invoicing",
            title: "AI invoicing app",
            body: "Best if you want the longer-form AI invoice page with more explanation."
          },
          {
            href: "/ai-billing-app",
            kicker: "Follow-up",
            title: "AI billing app",
            body: "Best if your pain is reminders, payment handoff, and collections wording."
          },
          {
            href: "/bill-maker-app",
            kicker: "Fast bill creation",
            title: "Bill maker app",
            body: "Best if the main need is turning notes into the first bill faster."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Try AI invoice drafting" />
    </SeoLandingPage>
  );
}

function AIBillingAppPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "NoteBill",
        operatingSystem: "Android",
        applicationCategory: "BusinessApplication",
        url: `${NOTE_BILL_SITE_URL}/ai-billing-app`,
        downloadUrl: GOOGLE_PLAY_STORE_URL,
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          }
        ],
        description:
          "AI billing app for reminders, follow-up wording, payment handoff, and cleaner billing flow."
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Can AI help with follow-up wording?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. Billie can help make reminders shorter, firmer, friendlier, or more professional while leaving the invoice and money details alone."
            }
          },
          {
            "@type": "Question",
            name: "Does the app still keep payment handoff attached?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. The billing path is built to keep payment links, reminders, and follow-up tied to the invoice."
            }
          },
          {
            "@type": "Question",
            name: "Is this only for overdue invoices?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "No. It also helps with the cleaner billing path right after the invoice is saved, sent, or reopened."
            }
          }
        ]
      }
    ]
  };

  return (
    <SeoLandingPage
      kicker="AI billing app"
      title="AI Billing App"
      intro="NoteBill is an AI billing app for reminders, follow-up wording, payment handoff, and cleaner collections after the invoice exists."
      highlights={["AI follow-up help", "Payment handoff stays visible", "Review before send"]}
      description="AI billing app for reminders, follow-up wording, payment handoff, and cleaner billing flow."
      path="/ai-billing-app"
      structuredData={structuredData}
      actions={[
        { href: "/ai-intake?mode=quick", label: "Try the billing draft flow", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="Best if the hard part is not making the first bill, but keeping the billing and recovery path clear after the invoice exists."
      sections={[
        {
          title: "AI helps with the words around the bill",
          paragraphs: [
            "Billing usually gets messy after the draft is already sent: reminders, payment nudges, resend wording, and what to say when a client asks for another copy.",
            "That is where AI can be genuinely useful without stepping on the money side."
          ],
          items: [
            "Reminder wording can be friendlier, firmer, shorter, or more professional.",
            "Follow-up stays tied to the invoice instead of floating away in email chaos.",
            "The recovery path stays calm and obvious."
          ]
        },
        {
          title: "The billing path should still feel connected",
          paragraphs: [
            "A good AI billing app does more than write a note. It keeps payment handoff, statement work, and the next reminder easy to find from the same invoice workspace.",
            "That helps the follow-up feel like a continuation of the invoice, not a separate tool hunt."
          ],
          items: [
            "Payment links stay attached to the invoice.",
            "Open balances stay visible.",
            "Collections work does not feel scattered."
          ]
        },
        {
          title: "Good for service businesses and repeat clients",
          paragraphs: [
            "If you bill the same clients again and again, a safer AI billing workflow can save time on the wording while still letting you control the actual billing decisions.",
            "That makes the recurring part of the job easier without making it feel automated in a risky way."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">Safe billing AI boundaries</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>AI can help write the follow-up note, but it does not change the invoice amount or payment state.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>The goal is cleaner billing and calmer collections, not more noise.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Reminder tone can be adapted to match the client relationship without losing the underlying invoice context.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="This page is for people who already have an invoice out and want AI to help with the follow-up, without making billing feel weird or hidden."
        whatItIs={[
          "An AI-assisted way to write better billing follow-up notes.",
          "A workspace that keeps reminders, statements, and payment links close to the invoice.",
          "A calmer recovery path after the invoice has been sent."
        ]}
        whatItIsNot={[
          "A black box that changes payment state on its own.",
          "A generic chat tool with no billing context.",
          "A bulky finance suite."
        ]}
        faqs={[
          {
            question: "Can AI help me rewrite reminders?",
            answer:
              "Yes. It can help you make the note shorter, firmer, friendlier, or more professional while keeping the invoice context intact."
          },
          {
            question: "Does the app keep payment links and follow-up together?",
            answer:
              "Yes. That is one of the biggest reasons to use NoteBill instead of separate tools for each step."
          },
          {
            question: "Is this just for overdue invoices?",
            answer:
              "No. It also helps after the first send, when the cleanest next move is usually a reminder, payment link, or statement."
          }
        ]}
      />
      <ComparisonPanel
        title="Why this is better than a generic chatbot when collections matter"
        intro="A chatbot can help write a note, but NoteBill keeps the reminder, payment handoff, and invoice context together so the next action stays obvious."
        cards={[
          {
            kicker: "NoteBill",
            title: "AI billing app with the recovery path attached",
            body: "Reminder wording is easier to refine, but the invoice, payment link, and follow-up stay connected.",
            points: [
              "Reminder tone can change without losing context.",
              "Payment handoff stays visible.",
              "Collections stay calmer and easier to repeat."
            ],
            emphasis: true
          },
          {
            kicker: "ChatGPT",
            title: "Useful for a quick message",
            body: "Good for rewriting text, but the billing workflow still lives somewhere else and can become scattered.",
            points: [
              "Can write the reminder copy.",
              "Doesn't track the invoice context.",
              "You still need another place for the actual billing flow."
            ]
          },
          {
            kicker: "Blank template",
            title: "Works for a one-off note",
            body: "Okay if you just need a single reminder, but not ideal when you need statements, resend history, or repeat follow-up.",
            points: [
              "Okay for one-off wording.",
              "Not built for repeated collections work.",
              "Can make the recovery path feel disorganized."
            ]
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related AI and billing pages"
        intro="These are the closest pages if you want the AI drafting side, the mobile billing workflow, or the collections path."
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/ai-invoicing-app",
            kicker: "AI drafting",
            title: "AI invoicing app",
            body: "Best if you want the rough-notes-to-draft side first."
          },
          {
            href: "/client-statements-and-follow-up",
            kicker: "Collections",
            title: "Client statements and follow-up",
            body: "Best if your pain is open balances, reminders, and statement recovery."
          },
          {
            href: "/mobile-billing-app",
            kicker: "Mobile billing",
            title: "Mobile billing app",
            body: "Best if you want the broader billing flow to stay easy on a phone."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Try AI billing" />
    </SeoLandingPage>
  );
}

function HowToMakeAnInvoiceOnYourPhonePage() {
  return (
    <SeoLandingPage
      kicker="How to make an invoice on your phone"
      title="How to Make an Invoice on Your Phone"
      intro="If you want to make an invoice on your phone, start with the notes you already have, review the money clearly, then save or send once it looks right. That is usually faster than starting from a blank invoice template."
      highlights={["Start from real notes", "Review before send", "Install only if it helps"]} 
      description="How to make an invoice on your phone using rough notes, clear review, and a practical mobile workflow."
      path="/how-to-make-an-invoice-on-your-phone"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Try the phone draft flow", tone: "primary" },
        { href: "/invoice-app-on-phone", label: "See the Android install page", tone: "ghost" }
      ]}
      footerNote="Best if you searched for the practical how-to first and want the shortest path from notes to a sendable invoice."
      sections={[
        {
          title: "1. Start with the notes you already have",
          paragraphs: [
            "The fastest phone workflow usually starts with rough notes, a text thread, or a quick list of what happened on the job. That is a better starting point than forcing everything into a blank invoice form first."
          ],
          items: [
            "Paste or type the job notes first.",
            "Let Billie shape the first draft.",
            "Keep the first pass focused on what happened, not on perfect formatting."
          ]
        },
        {
          title: "2. Review the money before you save or send",
          paragraphs: [
            "A draft only helps if you can still check the totals clearly. Review the invoice, confirm the client, pricing, and wording, then save once it feels solid."
          ],
          items: [
            "Confirm line items and totals.",
            "Adjust wording before it becomes client-facing.",
            "Save first so payment links and follow-up can stay attached later."
          ]
        },
        {
          title: "3. Install only if the Android path really helps",
          paragraphs: [
            "If Android is where the work already starts, the installed path can feel cleaner because billing, restore, saved drafts, and repeat use stay inside the same app. If not, use the web draft flow first and decide after the workflow proves itself."
          ],
          items: [
            "Try the web draft flow first if you want the lowest-friction start.",
            "Install from Google Play if the phone-first path is the real fit.",
            "Upgrade only if save, send, and follow-up actually feel better."
          ]
        }
      ]}
    >
      <TrustAndFaqPanel
        intro="This page is for people who want the simple version first: what should I do, in what order, and why?"
        whatItIs={[
          "A practical way to make an invoice on your phone from messy notes.",
          "A short review path before the invoice is saved or sent.",
          "A workflow that can stay on web first or move into Android if that is the better fit."
        ]}
        whatItIsNot={[
          "A long accounting tutorial.",
          "A fancy template picker with no real workflow around it.",
          "An autopilot that finalizes the money side without you."
        ]}
        faqs={[
          {
            question: "Do I need to install the app first?",
            answer:
              "No. You can try the web draft flow first and only install if the phone-first workflow feels like the better long-term fit."
          },
          {
            question: "Can I do this from rough notes?",
            answer:
              "Yes. That is the main point: start from what you already wrote down, then review the invoice before it becomes final."
          },
          {
            question: "What if I really want a billing app, not just invoice creation?",
            answer:
              "Then the mobile billing page is the better next click because it focuses more on payment handoff, reminders, and follow-up."
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related phone-first invoice paths"
        intro="These are the closest next pages if your search was more about installing the app, making bills faster, or keeping billing and follow-up together."
        links={[
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          },
          {
            href: "/ai-invoicing-app",
            kicker: "AI drafting",
            title: "AI invoicing app",
            body: "Best if you want AI to help shape rough notes into a cleaner draft first."
          },
          {
            href: "/ai-billing-app",
            kicker: "AI follow-up",
            title: "AI billing app",
            body: "Best if the real pain is reminders, payment handoff, and cleaner follow-up wording."
          },
          {
            href: "/mobile-billing-app",
            kicker: "Billing and follow-up",
            title: "Mobile billing app",
            body: "Best if your pain is keeping payment links, reminders, and next steps attached after the invoice exists."
          }
        ]}
      />
      <PricingChoicePanel primaryLabel="Start with the phone draft flow" />
    </SeoLandingPage>
  );
}

function InvoiceAppOnPhonePage() {
  useEffect(() => {
    trackLandingRevenueSignal("billing_plan_viewed", "landing:phone");
  }, []);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "NoteBill",
        operatingSystem: "Android",
        applicationCategory: "BusinessApplication",
        url: `${NOTE_BILL_SITE_URL}/invoice-app-on-phone`,
        downloadUrl: GOOGLE_PLAY_STORE_URL,
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
          }
        ],
        description:
          "Phone-first invoice and billing app for turning rough job notes into clean invoices, payment handoff, and follow-up."
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Can I try it before I pay?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. The install is free, the web draft flow is still available, and the point is to see whether the workflow earns a place in your business before you upgrade."
            }
          },
          {
            "@type": "Question",
            name: "Do I still approve the money part?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. Billie helps shape the draft, but totals, discounts, tax, and send decisions stay visible before anything becomes final."
            }
          },
          {
            "@type": "Question",
            name: "Why install instead of staying on web?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Use the Android app if that is where the work already starts. Google Play billing and restore stay inside the same app, and save, payment link, and follow-up stay attached to the same invoice."
            }
          }
        ]
      }
    ]
  };

  usePublicPageMetadata({
    title: "Invoice app on phone for freelancers and contractors",
    description:
      "Phone-first invoice, bill maker, and mobile billing app for rough notes, clean invoices, and follow-up on Google Play.",
    path: "/invoice-app-on-phone",
    structuredData
  });

  const playCtaClick = () => trackLandingRevenueSignal("billing_plan_selected", "landing:phone");
  const sampleInvoiceClick = () => trackLandingRevenueSignal("landing_invoice_sample_opened", "landing:phone");
  const valuePillars = ["Phone-first invoicing", "Review before send", "Google Play billing"];
  const firstMinuteSteps = [
    {
      step: "01",
      title: "Paste rough notes",
      body: "Use the job details you already have instead of rewriting everything into a form first."
    },
    {
      step: "02",
      title: "Review the clean draft",
      body: "Billie helps structure the invoice, but the totals and final wording stay visible before you save or send."
    },
    {
      step: "03",
      title: "Install if Android is your everyday workflow",
      body: "Google Play billing and restore stay inside the installed app, which makes upgrades and repeat use feel more complete."
    }
  ];
  const installReasons = [
    "Start from rough notes instead of a blank invoice template.",
    "Keep Google Play billing and restore inside the same app people use in the field.",
    "Save, payment link, and follow-up stay tied to the same invoice once the job is done."
  ];

  return (
    <div className="nb-page nb-page--quiet bg-[linear-gradient(180deg,#f4f7f4_0%,#eef4ef_100%)]">
      <main className="nb-page-shell py-6 pb-32 md:py-10 md:pb-10">
        <section className="relative overflow-hidden rounded-[38px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_28px_70px_rgba(15,23,42,0.08)] md:px-8 md:py-8 lg:px-10 lg:py-10">
          <div className="pointer-events-none absolute right-[-8%] top-[-4%] h-72 w-72 rounded-full bg-[#d9eee1]/45 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-18%] left-[24%] h-72 w-72 rounded-full bg-[#edf5ef] blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.96fr] lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center rounded-full border border-[#d4e2d8] bg-[#f6faf7] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#2d5e50]">
                Invoice app on phone
              </span>
              <h1 className="mt-4 max-w-[11ch] text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl lg:text-[3.55rem] lg:leading-[1.02]">
                From rough job notes to a client-ready invoice on your phone.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-600 md:text-lg">
                NoteBill helps freelancers, contractors, and small business owners turn messy job notes into
                client-ready invoices on the phone without fighting blank templates or bulky accounting tools.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {valuePillars.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#d7e2da] bg-[#f9fbfa] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#44695c]"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-4 lg:max-w-xl">
                <GooglePlayBadgeLink onClick={playCtaClick} className="w-full max-w-[320px]" />
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/landing/invoice-export-samples/classic-split.pdf"
                    target="_blank"
                    rel="noreferrer"
                    data-revenue-cta="sample-pdf"
                    onClick={sampleInvoiceClick}
                    className="inline-flex items-center justify-center rounded-full border border-[#cfe1d6] bg-white px-5 py-3 text-sm font-semibold text-[#17493c] shadow-[0_10px_24px_rgba(20,83,45,0.06)] transition hover:-translate-y-0.5 hover:border-[#b8cec0]"
                  >
                    View sample invoice
                  </a>
                  <a
                    href="/ai-intake?mode=quick"
                    className="text-sm font-semibold text-[#2d5e50] underline decoration-[#bfd0c3] decoration-2 underline-offset-4 transition hover:text-[#17493c]"
                  >
                    Try the web version first
                  </a>
                </div>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                Free install on Google Play. Paid unlocks the repeat workflow: saved client details, sends, reminders,
                payment links, memory, and sync when the app becomes part of your monthly routine.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Review first</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Money and wording stay visible before you save or send.</p>
                </div>
                <div className="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Phone-first</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">The workflow feels designed for the same phone where the notes already live.</p>
                </div>
                <div className="rounded-[22px] border border-[#d7e2da] bg-[#f8fbf8] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Billing nearby</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Save, payment link, and follow-up stay attached to the same invoice.</p>
                </div>
              </div>
              <div className="mt-4 rounded-[24px] border border-[#d9e4dc] bg-[#f8fbf9] px-4 py-4 text-sm leading-7 text-slate-600">
                If you searched for a bill maker app, billing app, or invoice app on phone, the promise is the same:
                start from rough notes, review the money clearly, and keep the send and payment path attached to the
                same invoice.
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span>Google Play billing</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#adc4b6]" />
                <span>Monthly Pro or Lifetime Pro</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#adc4b6]" />
                <span>Phone-first, desktop-ready</span>
              </div>
            </div>
            <div className="relative">
              <div className="rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#f8fbf8_0%,#eef5f0_100%)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
                    <div className="rounded-[30px] border border-[#d9e4dc] bg-[#fdfefd] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                      <img
                        src="/landing/phone-workflow-1.svg"
                        alt="NoteBill phone screen showing rough notes turning into a draft invoice."
                        width={1200}
                        height={900}
                        className="mx-auto w-full max-w-[280px] rounded-[24px] border border-[#e4ebe6] bg-white"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                    <div className="grid content-start gap-3">
                      <div className="rounded-[26px] border border-[#d7e2da] bg-white px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">
                          What the install gets you
                        </p>
                        <p className="mt-2 text-xl font-semibold leading-8 text-slate-950">
                          Start from the notes you already have instead of rebuilding the invoice from scratch.
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Billie helps shape the draft, but the workflow still slows down at the right moment so you can
                          review the money and wording before anything goes out.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[24px] border border-[#d7e2da] bg-white px-4 py-4">
                          <p className="text-sm font-semibold text-slate-950">Cleaner than templates</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            You are not dropped into a blank invoice form before the draft is even visible.
                          </p>
                        </div>
                        <div className="rounded-[24px] border border-[#d7e2da] bg-white px-4 py-4">
                          <p className="text-sm font-semibold text-slate-950">Cleaner than app soup</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                          Save, payment, and follow-up stay closer than they do across chat, docs, and a finance tool.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="hidden rounded-[28px] border border-[#d7e2da] bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:block">
                    <div className="flex items-center justify-between gap-3 px-2 pb-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Real export proof</p>
                        <p className="mt-1 text-sm text-slate-600">A real sample invoice exported from the app, not a fake preview block.</p>
                      </div>
                      <a
                        href="/landing/invoice-export-samples/classic-split.pdf"
                        target="_blank"
                        rel="noreferrer"
                        className="hidden rounded-full border border-[#d7e2da] bg-[#f8fbf8] px-4 py-2 text-sm font-semibold text-[#17493c] md:inline-flex"
                      >
                        Open sample PDF
                      </a>
                    </div>
                    <div className="overflow-hidden rounded-[22px] border border-[#e2e9e4] bg-white">
                      <img
                        src="/landing/invoice-export-samples/classic-split.preview.png"
                        alt="Real exported invoice preview from NoteBill showing a painter finish work invoice."
                        width={1090}
                        height={1314}
                        loading="eager"
                        decoding="async"
                        className="h-auto w-full bg-white object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p className="nb-kicker">What happens after the tap</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">A short path from notes to a sendable invoice</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {firstMinuteSteps.map((step) => (
                <div key={step.step} className="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2d5e50]">{step.step}</p>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[32px] border border-[#d9e4dc] bg-[linear-gradient(180deg,#ffffff_0%,#f7faf8_100%)] px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p className="nb-kicker">Why install instead of staying on web</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Use the app if Android is where the work already starts</h2>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
              {installReasons.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-[22px] border border-[#d7e2da] bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-950">Still want a lower-friction first look?</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Try the web draft flow first, then install from Google Play once you know the note-to-invoice path fits the way you work.
              </p>
            </div>
          </div>
        </section>

        <InvoiceExportStyleShowcase />

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p className="nb-kicker">What to know before you install</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Use it free first. Pay only if the workflow earns it.
              </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">What it is</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li className="flex items-start gap-3"><span className="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" /><span>A phone-first invoice and billing workflow for messy job notes.</span></li>
                  <li className="flex items-start gap-3"><span className="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" /><span>A cleaner path from draft review to save, send, payment, and follow-up.</span></li>
                </ul>
              </div>
              <div className="rounded-[24px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">What it is not</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li className="flex items-start gap-3"><span className="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#c58f3b]" /><span>A generic blank invoice template.</span></li>
                  <li className="flex items-start gap-3"><span className="mt-[0.5rem] inline-flex h-2 w-2 rounded-full bg-[#c58f3b]" /><span>A bookkeeping suite trying to do everything.</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="rounded-[32px] border border-[#d9e4dc] bg-white px-5 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)] md:px-6">
            <p className="nb-kicker">Quick answers</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[22px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">Can I try it before I pay?</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Yes. The install is free, the web draft flow is still available, and the point is to see whether the workflow earns a place in your business before you upgrade.
                </p>
              </div>
              <div className="rounded-[22px] border border-[#dfe7e1] bg-[#f8fbf8] px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">Do I still approve the money part?</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Yes. Billie helps shape the draft, but totals, discounts, tax, and send decisions stay visible before anything becomes final.
                </p>
              </div>
            </div>
          </div>
        </section>

      <RelatedWorkflowLinks
        title="Related phone-first invoice pages"
        intro="If this search was close but not quite the right fit, these pages cover the nearest bill-making, billing, and step-by-step phone invoice intents."
        links={[
          {
            href: "/",
            kicker: "Home",
            title: "NoteBill homepage",
            body: "Best if you want the broader product overview before choosing a specific workflow."
          },
          {
            href: "/ai-invoicing-app",
            kicker: "AI drafting",
            title: "AI invoicing app",
            body: "Best if you want AI to help shape rough notes into a cleaner draft first."
            },
            {
              href: "/ai-billing-app",
              kicker: "AI follow-up",
              title: "AI billing app",
              body: "Best if the real pain is reminders, payment handoff, and cleaner follow-up wording."
            },
            {
              href: "/mobile-billing-app",
              kicker: "Billing path",
              title: "Mobile billing app",
              body: "Best if the main pain is keeping payment, reminders, and follow-up attached after the invoice exists."
            }
          ]}
        />

        <PricingChoicePanel
          primaryLabel="Start with the web draft flow"
          title="Try the workflow free, then choose the billing path that fits"
          intro="The safest way to judge NoteBill is to use the draft flow first. If the phone-first workflow feels better than templates or heavier finance tools, then upgrade inside the path that matches your device."
          monthlyDescription="Best if you want the simplest ongoing way to keep the workflow active while you prove it out in real jobs."
          lifetimeDescription="Best if you already know the app will stay in your workflow and you would rather pay once."
          footerNote="No pressure to pay first. The point is to see the draft, review, save, and payment handoff path before you choose."
          installCalloutTitle="Using Android as the main workflow?"
          installCalloutBody="Install from Google Play for the cleanest billing, restore, and saved-work path on the same phone where the notes already live."
        />

        <section className="mt-6 overflow-hidden rounded-[34px] border border-[#d9e4dc] bg-[linear-gradient(145deg,#10261b_0%,#17493c_52%,#143628_100%)] px-5 py-6 text-white shadow-[0_24px_72px_rgba(20,83,45,0.16)] md:px-8 md:py-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d8ece0]">Ready to install</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                Put the invoice workflow on the same phone where the job notes already live.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/76 md:text-[15px]">
                If the phone is where the work starts, the app should meet you there with a clean draft, a clearer review,
                and an easier path to getting paid.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <GooglePlayBadgeLink onClick={playCtaClick} subtle className="w-full min-w-[300px]" />
              <a
                href={GOOGLE_PLAY_STORE_URL}
                target="_blank"
                rel="noreferrer"
                onClick={playCtaClick}
                className="text-center text-sm font-semibold text-white/74 underline decoration-white/24 underline-offset-4 hover:text-white"
              >
                Find us on Google Play
              </a>
            </div>
          </div>
        </section>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3 md:hidden">
          <div className="pointer-events-auto rounded-[28px] border border-white/70 bg-white/92 p-2 shadow-[0_18px_46px_rgba(20,83,45,0.18)] backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2d5e50]">Android install</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">Get the cleanest phone-first path in the real app.</p>
              </div>
            </div>
            <GooglePlayBadgeLink onClick={playCtaClick} className="w-full justify-center" subtle />
          </div>
        </div>
      </main>
    </div>
  );
}

function ClientStatementsFollowUpPage() {
  return (
    <SeoLandingPage
      kicker="Client statements and follow-up"
      title="Client Statements and Follow-Up"
      intro="NoteBill keeps client statements, reminders, and collections follow-up in one clean path so open balances are easier to act on."
      highlights={["Copy, print, email, or download", "Reminders stay visible", "Open balances stay calm"]}
      description="Client statements and follow-up workflow for open balances, reminders, and collections."
      path="/client-statements-and-follow-up"
      actions={[
        { href: "/ai-intake?mode=quick", label: "Quick AI invoice", tone: "primary" },
        { href: "#pricing", label: "See pricing", tone: "ghost" }
      ]}
      footerNote="A good fit if your biggest admin problem is not creating invoices, but getting the follow-up done."
      sections={[
        {
          title: "One place for the next money-moving step",
          paragraphs: [
            "When a client has an open balance, the workspace keeps statements, reminders, and follow-up close to the invoice history. That helps you move from what is owed to what should I do next without losing the thread."
          ],
          items: [
            "Statements are easy to copy, print, email, or download.",
            "Reminder activity is visible in the operator dashboard.",
            "Partial-payment and overdue paths stay easy to find."
          ]
        },
        {
          title: "Good collections work should feel calm",
          paragraphs: [
            "The goal is not more noise. It is a small set of obvious actions that help you follow up without feeling like you are rebuilding the whole situation each time.",
            "That is why the workspace surfaces the latest statement action and the dashboard shows the recent recovery lanes."
          ],
          items: [
            "Less switching between screens.",
            "Less wondering what was already sent.",
            "More obvious next steps."
          ]
        },
        {
          title: "Pricing stays simple",
          paragraphs: [
            "Monthly Pro is the simple ongoing option if you want the full collections workflow month to month.",
            "Lifetime Pro is the one-and-done option if you want to keep NoteBill without a recurring subscription."
          ]
        }
      ]}
    >
      <div className="nb-subcard">
        <h2 className="text-lg font-semibold text-slate-900">Best for</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700 md:text-[15px]">
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Businesses that need a statement-ready follow-up workflow.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Owners who want reminders and partial-payment recovery in one place.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-[0.55rem] inline-flex h-2 w-2 rounded-full bg-[#4f8b5f]" />
            <span>Anyone who wants collections work to feel less scattered.</span>
          </li>
        </ul>
      </div>
      <TrustAndFaqPanel
        intro="Collections pages convert better when people can quickly see whether this is about getting organized or getting paid."
        whatItIs={[
          "A calm place to manage statements, reminders, and follow-up.",
          "A way to keep open balances visible without rebuilding the whole situation.",
          "A workflow that turns follow-up into a clear next step."
        ]}
        whatItIsNot={[
          "A generic support page.",
          "A payment-only tool with no context.",
          "A cluttered dashboard that hides the next action."
        ]}
      faqs={[
          {
            question: "Can I copy, print, email, or download statements?",
            answer:
              "Yes. The statement workflow is built to make those actions easy to reach from the client workspace."
          },
          {
            question: "Is this meant for overdue balances too?",
            answer:
              "Yes. The point is to keep reminders and recovery paths close so overdue follow-up feels calmer and more deliberate."
          },
          {
            question: "Why not just use ChatGPT?",
            answer:
              "Because collections need context and repeatability. NoteBill keeps the open balance, statement history, and follow-up actions together so you can act quickly."
          }
        ]}
      />
      <RelatedWorkflowLinks
        title="Related billing and invoice pages"
        intro="These pages are the closest next step if your real need is making the invoice faster, billing from a phone, or installing the Android workflow."
        links={[
          {
            href: "/ai-billing-app",
            kicker: "AI follow-up",
            title: "AI billing app",
            body: "Best if you want help with reminders, payment handoff, and cleaner collections wording."
          },
          {
            href: "/bill-maker-app",
            kicker: "Faster invoice start",
            title: "Bill maker app",
            body: "Best if the pain is turning rough job notes into the first clean invoice faster."
          },
          {
            href: "/invoice-app-on-phone",
            kicker: "Android install",
            title: "Download the phone-first invoice app",
            body: "Best if you want the Google Play install page and the main conversion path."
          }
        ]}
      />
      <PricingChoicePanel />
    </SeoLandingPage>
  );
}

function NativeGoogleAuthBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const capacitorApp = window.Capacitor?.Plugins?.App;
    if (!capacitorApp?.addListener) {
      return undefined;
    }

    let removed = false;
    let listenerHandle = null;

    const handleUrl = (event) => {
      if (removed) {
        return;
      }
      const internalUrl = parseGoogleNativeAuthDeepLink(typeof event?.url === "string" ? event.url : "");
      if (!internalUrl) {
        return;
      }
      navigate(internalUrl, { replace: true });
    };

    Promise.resolve(capacitorApp.addListener("appUrlOpen", handleUrl))
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch(() => {
        listenerHandle = null;
      });

    if (typeof capacitorApp.getLaunchUrl === "function") {
      Promise.resolve(capacitorApp.getLaunchUrl())
        .then((result) => {
          handleUrl(result);
        })
        .catch(() => {
          // Best-effort only.
        });
    }

    return () => {
      removed = true;
      if (listenerHandle?.remove) {
        Promise.resolve(listenerHandle.remove()).catch(() => {});
      }
    };
  }, [navigate]);

  return null;
}

function NativeAppOpenBridge() {
  useEffect(() => {
    let removed = false;
    let listenerHandle = null;
    let retryHandle = null;

    const emitAppOpen = (source) => {
      const revenueAnalytics = window.InvoiceRevenueAnalytics;
      if (!revenueAnalytics) {
        return false;
      }
      revenueAnalytics.trackRevenueSignalWithCooldown?.("app_opened", source, 30_000);
      revenueAnalytics.trackRevenueSignalOnce?.("first_app_opened", source);
      return true;
    };

    const isNativeApp = () =>
      Boolean(
        window.Capacitor?.isNativePlatform?.() ||
          ["android", "ios"].includes(String(window.Capacitor?.getPlatform?.() ?? "").toLowerCase())
      );

    const startBridge = (attempt = 0) => {
      if (removed) {
        return;
      }
      if (!isNativeApp()) {
        if (attempt < 80) {
          retryHandle = window.setTimeout(() => startBridge(attempt + 1), 50);
        }
        return;
      }

      const capacitorApp = window.Capacitor?.Plugins?.App;
      if (!capacitorApp?.addListener) {
        return;
      }

      emitAppOpen("app_lifecycle:launch");

    const handleStateChange = (event) => {
      if (removed) {
        return;
      }
      if (event?.isActive === false) {
        return;
      }
      emitAppOpen("app_lifecycle:resume");
    };

    Promise.resolve(capacitorApp.addListener("appStateChange", handleStateChange))
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch(() => {
        listenerHandle = null;
      });
    };

    startBridge();

    return () => {
      removed = true;
      if (retryHandle) {
        window.clearTimeout(retryHandle);
      }
      if (listenerHandle?.remove) {
        Promise.resolve(listenerHandle.remove()).catch(() => {});
      }
    };
  }, []);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AppChrome>
        <NativeAppOpenBridge />
        <NativeGoogleAuthBridge />
        <Routes>
          <Route path="/" element={<Launcher />} />
          <Route path="/scratchpad" element={<DeferredFeatureRoute featureKey="scratchpad" />} />
          <Route path="/notes" element={<Navigate replace to="/scratchpad" />} />
          <Route path="/portal/:invoiceId/:token" element={<DeferredFeatureRoute featureKey="clientPortal" />} />
          <Route path="/auth/verify" element={<EmailLinkVerificationPage />} />
          <Route path="/auth/google" element={<GoogleSignInCompletionPage />} />
          <Route path="/ai-intake" element={<DeferredFeatureRoute featureKey="aiIntake" />} />
          <Route path="/invoices" element={<DeferredFeatureRoute featureKey="library" />} />
          <Route path="/library" element={<Navigate replace to="/invoices" />} />
          <Route path="/manual" element={<DeferredFeatureRoute featureKey="manual" />} />
          <Route path="/import" element={<DeferredFeatureRoute featureKey="import" />} />
          <Route path="/diagnostics" element={<DeferredFeatureRoute featureKey="diagnostics" />} />
          <Route path="/settings/business" element={<DeferredFeatureRoute featureKey="businessIdentity" />} />
          <Route path="/settings/memory" element={<DeferredFeatureRoute featureKey="clientMemory" />} />
          <Route path="/settings/services" element={<DeferredFeatureRoute featureKey="services" />} />
          <Route path="/clients" element={<DeferredFeatureRoute featureKey="clientWorkspace" />} />
          <Route path="/dashboard" element={<DeferredFeatureRoute featureKey="operatorDashboard" />} />
          <Route path="/stats" element={<Navigate replace to="/dashboard" />} />
          <Route path="/prefs" element={<Navigate replace to="/settings/business" />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
          <Route path="/invoice-app-for-contractors" element={<InvoiceAppForContractorsPage />} />
          <Route path="/invoice-app-for-service-businesses" element={<InvoiceAppForServiceBusinessesPage />} />
          <Route path="/ai-invoice-app" element={<AIInvoiceAppPage />} />
          <Route path="/ai-invoicing-app" element={<AIInvoicingAppPage />} />
          <Route path="/ai-billing-app" element={<AIBillingAppPage />} />
          <Route path="/bill-maker-app" element={<BillMakerAppPage />} />
          <Route path="/mobile-billing-app" element={<MobileBillingAppPage />} />
          <Route path="/how-to-make-an-invoice-on-your-phone" element={<HowToMakeAnInvoiceOnYourPhonePage />} />
          <Route path="/mobile-invoice-app" element={<MobileInvoiceAppPage />} />
          <Route path="/invoice-app-on-phone" element={<InvoiceAppOnPhonePage />} />
          <Route path="/client-statements-and-follow-up" element={<ClientStatementsFollowUpPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/data-deletion" element={<DataDeletionPage />} />
          <Route path="/delete-account" element={<DataDeletionPage />} />
          <Route
            path="*"
            element={<Placeholder title="Page not found" description="Return to the launcher to continue." />}
          />
        </Routes>
      </AppChrome>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
