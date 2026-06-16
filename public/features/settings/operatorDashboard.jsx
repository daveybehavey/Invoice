(() => {
  const { useEffect, useMemo, useState } = React;
  const { useNavigate } = ReactRouterDOM;

  const requestIdentity = window.InvoiceRequestIdentity;
  if (!requestIdentity) {
    throw new Error(
      "Missing /utils/requestIdentity.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const clientMemoryUtils = window.InvoiceClientMemory;
  if (!clientMemoryUtils) {
    throw new Error(
      "Missing /utils/clientMemory.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const lineItemLibraryUtils = window.InvoiceLineItemLibrary;
  if (!lineItemLibraryUtils) {
    throw new Error(
      "Missing /utils/lineItemLibrary.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const formatUtils = window.InvoiceFormatUtils;
  if (!formatUtils) {
    throw new Error(
      "Missing /utils/formatters.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const recurringUtils = window.InvoiceRecurringUtils;
  if (!recurringUtils) {
    throw new Error(
      "Missing /utils/recurring.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const paymentProgressUtils = window.InvoicePaymentProgressUtils;
  if (!paymentProgressUtils) {
    throw new Error(
      "Missing /utils/paymentProgress.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }
  const dashboardMetricsUtils = window.InvoiceDashboardMetrics;
  if (!dashboardMetricsUtils) {
    throw new Error(
      "Missing /utils/dashboardMetrics.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }
  const estimateWorkflowUtils = window.InvoiceEstimateWorkflowUtils;
  if (!estimateWorkflowUtils) {
    throw new Error(
      "Missing /utils/estimateWorkflow.js load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const uiPrimitives = window.InvoiceUIPrimitives;
  if (!uiPrimitives) {
    throw new Error(
      "Missing /ui/primitives.jsx load. Ensure it is loaded before /features/settings/operatorDashboard.jsx."
    );
  }

  const { getClientMemory } = clientMemoryUtils;
  const { getLineItemLibrary } = lineItemLibraryUtils;
  const { formatMoney } = formatUtils;
  const {
    readRecurringSchedules,
    getRecurringAutoSendRecipient,
    buildRecurringScheduleSummary,
    buildRecurringNextStepLabel
  } = recurringUtils;
  const {
    buildPaymentProgressSummary,
    getInvoicePaymentRecords,
    getInvoiceLatestPayment,
    getInvoiceOpenBalance,
    hasPartialPayment
  } = paymentProgressUtils;
  const {
    buildCollectionsAgingSnapshot,
    buildDashboardPriorityLane,
    buildRecentActivityEntries,
    buildWeeklyMomentumCards
  } = dashboardMetricsUtils;
  const { buildEstimateWorkflowSummary } = estimateWorkflowUtils;
  const { getInvoiceDocumentType, getEstimateReviewState } = estimateWorkflowUtils;
  const { StatusChip } = uiPrimitives;
  const apiFetch = requestIdentity.apiFetch ?? window.fetch.bind(window);
  const recurringStorageKey =
    requestIdentity.getScopedStorageKey?.("invoiceRecurringSchedules") ?? "invoiceRecurringSchedules";

  const normalizeName = (value) => (typeof value === "string" ? value.trim().toLocaleLowerCase() : "");
  const recurringDayMs = 24 * 60 * 60 * 1000;
  const recurringSoonWindowMs = 7 * recurringDayMs;

  const parseTimestamp = (value) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const parseDueDate = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-").map(Number);
      return new Date(year, month - 1, day).getTime();
    }
    return parseTimestamp(text);
  };

  const formatCountLabel = (value, singular, plural = `${singular}s`) => {
    const count = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `${count} ${count === 1 ? singular : plural}`;
  };

  const formatDateTime = (value) => {
    const parsed = parseTimestamp(value);
    if (!Number.isFinite(parsed)) {
      return "recently";
    }
    return new Date(parsed).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const getInvoiceClientName = (invoice) =>
    String(invoice?.customerName ?? invoice?.invoiceData?.finishedInvoice?.customerName ?? "").trim();
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
  const getStatementActivityLabel = (action) => {
    switch (action) {
      case "viewed_statement":
        return "Viewed statement";
      case "copied_statement":
        return "Copied statement";
      case "copied_follow_up":
        return "Copied follow-up";
      case "emailed_statement":
        return "Emailed statement";
      case "printed_statement":
        return "Printed statement";
      case "downloaded_pdf":
        return "Downloaded PDF";
      default:
        return "Statement activity";
    }
  };
  const getStatementActivityTone = (action) => {
    switch (action) {
      case "emailed_statement":
      case "downloaded_pdf":
        return "success";
      case "printed_statement":
      case "viewed_statement":
        return "info";
      default:
        return "soft";
    }
  };
  const campaignWatchCampaignLabel = (campaign) => {
    if (!campaign) {
      return "No campaign data";
    }
    const reasons = Array.isArray(campaign.primaryStatusReasons) ? campaign.primaryStatusReasons : [];
    if (campaign.status === "PAUSED") {
      return "Paused";
    }
    if (reasons.includes("CAMPAIGN_PENDING") || reasons.includes("MOST_ADS_UNDER_REVIEW")) {
      return "Pending review";
    }
    if (campaign.primaryStatus === "ELIGIBLE" || campaign.servingStatus === "SERVING") {
      return "Eligible to spend";
    }
    return campaign.status || "Monitoring";
  };
  const authSignalLabel = (event) => {
    switch (event) {
      case "email_sign_in_requested":
        return "Sign-in requested";
      case "email_sign_in_link_sent":
        return "Link sent";
      case "email_sign_in_link_previewed":
        return "Preview link";
      case "email_sign_in_request_failed":
        return "Request failed";
      case "email_sign_in_link_opened":
        return "Link opened";
      case "email_sign_in_link_verified":
        return "Link verified";
      case "email_sign_in_link_failed":
        return "Link failed";
      case "account_signed_in":
        return "Account signed in";
      default:
        return event || "Auth signal";
    }
  };
  const authSignalTone = (event) => {
    switch (event) {
      case "email_sign_in_link_verified":
      case "account_signed_in":
        return "success";
      case "email_sign_in_request_failed":
      case "email_sign_in_link_failed":
        return "warning";
      default:
        return "soft";
    }
  };
  const revenueSignalLabel = (event) => {
    switch (event) {
      case "first_draft_started":
        return "First draft started";
      case "invoice_generated":
        return "Invoice generated";
      case "invoice_saved":
        return "Invoice saved";
      case "first_invoice_saved":
        return "First invoice saved";
      case "second_invoice_saved":
        return "Second invoice saved";
      case "invoice_sent":
        return "Invoice sent";
      case "first_invoice_sent":
        return "First invoice sent";
      case "reminder_sent":
        return "Reminder sent";
      case "payment_link_created":
        return "Payment link created";
      case "first_payment_link_added":
        return "First payment link added";
      case "first_invoice_reopened":
        return "First invoice reopened";
      case "invoice_again_started":
        return "Repeat invoice started";
      case "service_memory_reused":
        return "Service memory reused";
      case "service_memory_saved":
        return "Service memory saved";
      case "client_memory_reused":
        return "Client memory reused";
      case "recurring_schedule_set":
        return "Recurring schedule set";
      case "checkout_started":
        return "Checkout started";
      case "billing_plan_viewed":
        return "Pricing viewed";
      case "billing_plan_selected":
        return "Pricing selected";
      case "billing_manage_opened":
        return "Billing opened";
      case "google_play_verification_failed":
        return "Google Play failed";
      case "pro_unlock_verified":
        return "Pro unlocked";
      case "lifetime_unlock_verified":
        return "Lifetime unlocked";
      case "account_signed_in":
        return "Account signed in";
      case "email_sign_in_requested":
        return "Email sign-in requested";
      case "email_sign_in_link_sent":
        return "Email link sent";
      case "email_sign_in_link_previewed":
        return "Email link previewed";
      case "email_sign_in_request_failed":
        return "Email sign-in failed";
      case "email_sign_in_link_opened":
        return "Email link opened";
      case "email_sign_in_link_verified":
        return "Email link verified";
      case "email_sign_in_link_failed":
        return "Email link failed";
      case "scratchpad_note_saved":
        return "Scratchpad note saved";
      case "scratchpad_voice_note_transcribed":
        return "Voice note transcribed";
      case "scratchpad_note_used_in_invoice":
        return "Scratchpad used in invoice";
      case "billie_workspace_instruction_submitted":
        return "Billie instruction sent";
      default:
        return String(event || "Signal")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  };
  const revenueSignalTone = (event) => {
    switch (event) {
      case "first_draft_started":
      case "invoice_sent":
      case "invoice_saved":
      case "first_invoice_saved":
      case "first_invoice_sent":
      case "first_payment_link_added":
      case "first_invoice_reopened":
      case "checkout_started":
      case "billing_plan_selected":
      case "account_signed_in":
      case "pro_unlock_verified":
      case "lifetime_unlock_verified":
      case "email_sign_in_link_sent":
      case "email_sign_in_link_opened":
      case "email_sign_in_link_verified":
      case "scratchpad_note_used_in_invoice":
      case "scratchpad_note_saved":
      case "billie_workspace_instruction_submitted":
        return "success";
      case "email_sign_in_request_failed":
      case "email_sign_in_link_failed":
      case "google_play_verification_failed":
        return "warning";
      default:
        return "soft";
    }
  };
  const formatPercentLabel = (numerator, denominator) => {
    const numeratorValue = Number(numerator ?? 0);
    const denominatorValue = Number(denominator ?? 0);
    if (!Number.isFinite(numeratorValue) || !Number.isFinite(denominatorValue) || denominatorValue <= 0) {
      return "n/a";
    }
    return `${Math.max(0, Math.min(100, Math.round((numeratorValue / denominatorValue) * 100)))}%`;
  };
  const formatDropOffLabel = (current, previous) => {
    const rate = formatPercentLabel(current, previous);
    if (rate === "n/a") {
      return rate;
    }
    return `${Math.max(0, 100 - Number.parseInt(rate, 10))}%`;
  };
  const buildAttributionLabel = (attribution) => {
    if (!attribution || typeof attribution !== "object") {
      return "Direct / unknown";
    }
    const parts = [attribution.utmSource, attribution.utmMedium, attribution.utmCampaign]
      .filter((part) => typeof part === "string" && part.trim())
      .map((part) => part.trim());
    if (parts.length > 0) {
      return parts.join(" / ");
    }
    if (typeof attribution.landingPath === "string" && attribution.landingPath.trim()) {
      return attribution.landingPath.trim();
    }
    return "Direct / unknown";
  };
  const landingFunnelRangeOptions = [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "all", label: "All time" }
  ];
  const landingFunnelEvents = new Set([
    "billing_plan_viewed",
    "landing_invoice_sample_opened",
    "billing_plan_selected",
    "app_opened",
    "first_app_opened",
    "first_draft_started",
    "invoice_generated",
    "invoice_saved",
    "invoice_sent",
    "first_invoice_saved",
    "first_invoice_sent",
    "checkout_started",
    "pro_unlock_verified",
    "lifetime_unlock_verified"
  ]);
  const supportingProductEvents = [
    {
      event: "account_signed_in",
      label: "Signups / logins",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "first_draft_started",
      label: "Invoice started",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "invoice_generated",
      label: "Invoice completed",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "invoice_saved",
      label: "Invoice saved",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "invoice_sent",
      label: "Invoice sent",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "reminder_sent",
      label: "Follow-up / reminder",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "billing_plan_viewed",
      label: "Landing / paywall views",
      detail: "Shared telemetry for the pitch page and in-app pricing view",
      status: "available"
    },
    {
      event: "app_opened",
      label: "App opened",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "first_app_opened",
      label: "First app open",
      detail: "Tracked once per owner/device when possible",
      status: "available"
    },
    {
      event: "billing_plan_selected",
      label: "Upgrade CTA clicked",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "checkout_started",
      label: "Checkout started",
      detail: "Tracked in revenue telemetry",
      status: "available"
    },
    {
      event: "pro_unlock_verified",
      label: "Pro unlocks",
      detail: "Verified by billing provider",
      status: "available"
    },
    {
      event: "lifetime_unlock_verified",
      label: "Lifetime unlocks",
      detail: "Verified by billing provider",
      status: "available"
    },
    {
      event: "downloaded_pdf",
      label: "PDF exported",
      detail: "Tracked in client statement activity, not unified in revenue telemetry yet",
      status: "partial"
    }
  ];
  const getLandingFunnelRangeWindow = (rangeId) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (rangeId === "today") {
      return { label: "Today", startAt: startOfToday.getTime(), endAt: now.getTime() };
    }
    if (rangeId === "30d") {
      return {
        label: "Last 30 days",
        startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime(),
        endAt: now.getTime()
      };
    }
    if (rangeId === "all") {
      return { label: "All time", startAt: Number.NEGATIVE_INFINITY, endAt: Number.POSITIVE_INFINITY };
    }
    return {
      label: "Last 7 days",
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime(),
      endAt: now.getTime()
    };
  };
  const getAttributionSummary = (attribution) => {
    const source = typeof attribution?.utmSource === "string" && attribution.utmSource.trim() ? attribution.utmSource.trim() : "Direct / unknown";
    const medium = typeof attribution?.utmMedium === "string" && attribution.utmMedium.trim() ? attribution.utmMedium.trim() : "n/a";
    const campaign = typeof attribution?.utmCampaign === "string" && attribution.utmCampaign.trim() ? attribution.utmCampaign.trim() : "n/a";
    const landingPath =
      typeof attribution?.landingPath === "string" && attribution.landingPath.trim() ? attribution.landingPath.trim() : "n/a";
    return {
      label: buildAttributionLabel(attribution),
      source,
      medium,
      campaign,
      landingPath
    };
  };
  const buildLandingFunnelReport = (revenueSignalsSnapshot, rangeId) => {
    const events = Array.isArray(revenueSignalsSnapshot?.events) ? revenueSignalsSnapshot.events : [];
    const owners = revenueSignalsSnapshot?.owners ?? {};
    const rangeWindow = getLandingFunnelRangeWindow(rangeId);
    const filteredEvents =
      rangeId === "all"
        ? events
        : events.filter((event) => {
            const parsedAt = Date.parse(event?.at ?? "");
            return Number.isFinite(parsedAt) && parsedAt >= rangeWindow.startAt && parsedAt <= rangeWindow.endAt;
          });
    const funnelEvents = filteredEvents.filter((event) => landingFunnelEvents.has(event.event));
    const supportEventCounts = new Map();
    for (const event of filteredEvents) {
      supportEventCounts.set(event.event, (supportEventCounts.get(event.event) ?? 0) + 1);
    }

    const stageStats = {
      landing: { owners: new Set(), events: 0 },
      proof: { owners: new Set(), events: 0 },
      cta: { owners: new Set(), events: 0 },
      appOpen: { owners: new Set(), events: 0 },
      firstAppOpen: { owners: new Set(), events: 0 },
      firstInvoiceStarted: { owners: new Set(), events: 0 },
      invoiceComplete: { owners: new Set(), events: 0 },
      checkout: { owners: new Set(), events: 0 },
      unlock: { owners: new Set(), events: 0 }
    };
    const sourceBuckets = new Map();

    for (const event of funnelEvents) {
      const ownerKey = String(event.ownerKey ?? "").trim();
      if (!ownerKey) {
        continue;
      }
      const attribution = event.attribution ?? owners[ownerKey]?.firstTouchAttribution;
      const attributionSummary = getAttributionSummary(attribution);
      const sourceKey = attributionSummary.label;
      const bucket =
        sourceBuckets.get(sourceKey) ??
        {
          ...attributionSummary,
          events: 0,
          owners: new Set(),
          landingOwners: new Set(),
          proofOwners: new Set(),
          ctaOwners: new Set(),
          checkoutOwners: new Set(),
          unlockOwners: new Set(),
          unlockEvents: 0
        };
      bucket.events += 1;
      bucket.owners.add(ownerKey);
      if (event.event === "billing_plan_viewed") {
        stageStats.landing.events += 1;
        stageStats.landing.owners.add(ownerKey);
        bucket.landingOwners.add(ownerKey);
      } else if (event.event === "landing_invoice_sample_opened") {
        stageStats.proof.events += 1;
        stageStats.proof.owners.add(ownerKey);
        bucket.proofOwners.add(ownerKey);
      } else if (event.event === "billing_plan_selected") {
        stageStats.cta.events += 1;
        stageStats.cta.owners.add(ownerKey);
        bucket.ctaOwners.add(ownerKey);
      } else if (event.event === "app_opened") {
        stageStats.appOpen.events += 1;
        stageStats.appOpen.owners.add(ownerKey);
      } else if (event.event === "first_app_opened") {
        stageStats.firstAppOpen.events += 1;
        stageStats.firstAppOpen.owners.add(ownerKey);
      } else if (event.event === "first_draft_started") {
        stageStats.firstInvoiceStarted.events += 1;
        stageStats.firstInvoiceStarted.owners.add(ownerKey);
      } else if (
        event.event === "invoice_generated" ||
        event.event === "invoice_saved" ||
        event.event === "invoice_sent" ||
        event.event === "first_invoice_saved" ||
        event.event === "first_invoice_sent"
      ) {
        stageStats.invoiceComplete.events += 1;
        stageStats.invoiceComplete.owners.add(ownerKey);
      } else if (event.event === "checkout_started") {
        stageStats.checkout.events += 1;
        stageStats.checkout.owners.add(ownerKey);
        bucket.checkoutOwners.add(ownerKey);
      } else if (event.event === "pro_unlock_verified" || event.event === "lifetime_unlock_verified") {
        stageStats.unlock.events += 1;
        stageStats.unlock.owners.add(ownerKey);
        bucket.unlockOwners.add(ownerKey);
        bucket.unlockEvents += 1;
      }
      sourceBuckets.set(sourceKey, bucket);
    }

    const stageRows = [
      {
        key: "landing",
        event: "billing_plan_viewed",
        label: "Landing page views",
        detail: "Unique owners who reached the pitch page",
        count: stageStats.landing.owners.size,
        events: stageStats.landing.events,
        tone: "soft"
      },
      {
        key: "proof",
        event: "landing_invoice_sample_opened",
        label: "Sample PDF opens",
        detail: "Unique owners who opened the real export proof",
        count: stageStats.proof.owners.size,
        events: stageStats.proof.events,
        tone: "info"
      },
      {
        key: "cta",
        event: "billing_plan_selected",
        label: "Google Play CTA clicks",
        detail: "Unique owners who clicked the install path",
        count: stageStats.cta.owners.size,
        events: stageStats.cta.events,
        tone: "success"
      },
      {
        key: "appOpen",
        event: "app_opened",
        label: "App opens",
        detail: "Unique owners who opened or resumed the native app after a click",
        count: stageStats.appOpen.owners.size,
        events: stageStats.appOpen.events,
        tone: "info"
      },
      {
        key: "firstAppOpen",
        event: "first_app_opened",
        label: "First app opens",
        detail: "First observed app open in local telemetry / owner context",
        count: stageStats.firstAppOpen.owners.size,
        events: stageStats.firstAppOpen.events,
        tone: "info"
      },
      {
        key: "firstInvoiceStarted",
        event: "first_draft_started",
        label: "First invoice started",
        detail: "Unique owners who started a first draft",
        count: stageStats.firstInvoiceStarted.owners.size,
        events: stageStats.firstInvoiceStarted.events,
        tone: "soft"
      },
      {
        key: "invoiceComplete",
        event: "invoice_saved",
        label: "First invoice completed / saved / sent",
        detail: "Unique owners who reached a saved or sent invoice milestone",
        count: stageStats.invoiceComplete.owners.size,
        events: stageStats.invoiceComplete.events,
        tone: "soft"
      },
      {
        key: "checkout",
        event: "checkout_started",
        label: "Checkout started",
        detail: "Unique owners who reached checkout",
        count: stageStats.checkout.owners.size,
        events: stageStats.checkout.events,
        tone: "success"
      },
      {
        key: "unlock",
        event: "pro_unlock_verified",
        label: "Pro unlocks",
        detail: "Verified unlocks recorded by the billing provider",
        count: stageStats.unlock.owners.size,
        events: stageStats.unlock.events,
        tone: "success"
      }
    ].map((stage, index, rows) => {
      const previous = index > 0 ? rows[index - 1] : null;
      const conversion = previous && previous.count > 0 ? Math.round((stage.count / previous.count) * 100) : null;
      return {
        ...stage,
        stepRate: previous ? (conversion === null ? "n/a" : `${Math.max(0, Math.min(100, conversion))}%`) : "n/a",
        dropOff: previous ? (conversion === null ? "n/a" : `${Math.max(0, 100 - conversion)}%`) : "n/a"
      };
    });

    const sourceRows = Array.from(sourceBuckets.values())
      .sort((left, right) => right.unlockOwners.size - left.unlockOwners.size || right.events - left.events)
      .slice(0, 6)
      .map((bucket) => {
        const landingOwners = bucket.landingOwners.size;
        const unlockOwners = bucket.unlockOwners.size;
        const conversionRate = landingOwners > 0 ? `${Math.round((unlockOwners / landingOwners) * 100)}%` : "n/a";
        return {
          label: bucket.label,
          source: bucket.source,
          medium: bucket.medium,
          campaign: bucket.campaign,
          landingPath: bucket.landingPath,
          events: bucket.events,
          landingOwners,
          proofOwners: bucket.proofOwners.size,
          ctaOwners: bucket.ctaOwners.size,
          checkoutOwners: bucket.checkoutOwners.size,
          unlockOwners,
          unlockEvents: bucket.unlockEvents,
          conversionRate
        };
      });

    const proofOwners = stageStats.proof.owners;
    const ctaOwners = stageStats.cta.owners;
    const appOpenOwners = stageStats.appOpen.owners;
    const firstAppOpenOwners = stageStats.firstAppOpen.owners;
    const firstInvoiceStartedOwners = stageStats.firstInvoiceStarted.owners;
    const invoiceCompleteOwners = stageStats.invoiceComplete.owners;
    const checkoutOwners = stageStats.checkout.owners;
    const unlockOwners = stageStats.unlock.owners;
    const proofAndUnlockOwners = new Set([...proofOwners].filter((ownerKey) => unlockOwners.has(ownerKey)));
    const proofAndCtaOwners = new Set([...proofOwners].filter((ownerKey) => ctaOwners.has(ownerKey)));
    const ctaAndAppOpenOwners = new Set([...ctaOwners].filter((ownerKey) => appOpenOwners.has(ownerKey)));
    const appOpenAndFirstAppOpenOwners = new Set([...appOpenOwners].filter((ownerKey) => firstAppOpenOwners.has(ownerKey)));
    const firstAppOpenAndInvoiceStartOwners = new Set(
      [...firstAppOpenOwners].filter((ownerKey) => firstInvoiceStartedOwners.has(ownerKey))
    );
    const invoiceStartAndCompleteOwners = new Set(
      [...firstInvoiceStartedOwners].filter((ownerKey) => invoiceCompleteOwners.has(ownerKey))
    );
    const ctaAndUnlockOwners = new Set([...ctaOwners].filter((ownerKey) => unlockOwners.has(ownerKey)));
    const proofToUnlockRate = proofOwners.size > 0 ? `${Math.round((proofAndUnlockOwners.size / proofOwners.size) * 100)}%` : "n/a";
    const ctaToUnlockRate = ctaOwners.size > 0 ? `${Math.round((ctaAndUnlockOwners.size / ctaOwners.size) * 100)}%` : "n/a";
    const ctaToAppOpenRate = ctaOwners.size > 0 ? `${Math.round((ctaAndAppOpenOwners.size / ctaOwners.size) * 100)}%` : "n/a";
    const appOpenToFirstOpenRate =
      appOpenOwners.size > 0 ? `${Math.round((appOpenAndFirstAppOpenOwners.size / appOpenOwners.size) * 100)}%` : "n/a";
    const firstAppOpenToInvoiceStartRate =
      firstAppOpenOwners.size > 0
        ? `${Math.round((firstAppOpenAndInvoiceStartOwners.size / firstAppOpenOwners.size) * 100)}%`
        : "n/a";
    const invoiceStartToCompleteRate =
      firstInvoiceStartedOwners.size > 0
        ? `${Math.round((invoiceStartAndCompleteOwners.size / firstInvoiceStartedOwners.size) * 100)}%`
        : "n/a";
    const checkoutToUnlockRate =
      checkoutOwners.size > 0 ? `${Math.round((new Set([...checkoutOwners].filter((ownerKey) => unlockOwners.has(ownerKey))).size / checkoutOwners.size) * 100)}%` : "n/a";

    const recentLandingSignals = funnelEvents
      .slice(-8)
      .reverse()
      .map((event) => ({
        ...event,
        label: revenueSignalLabel(event.event),
        tone: revenueSignalTone(event.event),
        timeLabel: formatDateTime(event.at)
      }));

    const supportingEvents = supportingProductEvents.map((entry) => ({
      ...entry,
      count: Number(supportEventCounts.get(entry.event) ?? 0),
      available: entry.status !== "missing"
    }));

    return {
      rangeLabel: rangeWindow.label,
      trackedSourceLabel: revenueSignalsSnapshot?.source || "snapshot",
      totalOwners: Object.keys(owners).length,
      totalEvents: filteredEvents.length,
      stageRows,
      sourceRows,
      recentLandingSignals,
      supportEventCounts,
      supportingEvents,
      notes: {
        proofAndUnlockOwners: proofAndUnlockOwners.size,
        proofAndCtaOwners: proofAndCtaOwners.size,
        ctaAndAppOpenOwners: ctaAndAppOpenOwners.size,
        appOpenAndFirstAppOpenOwners: appOpenAndFirstAppOpenOwners.size,
        firstAppOpenAndInvoiceStartOwners: firstAppOpenAndInvoiceStartOwners.size,
        invoiceStartAndCompleteOwners: invoiceStartAndCompleteOwners.size,
        ctaAndUnlockOwners: ctaAndUnlockOwners.size,
        proofToUnlockRate,
        ctaToUnlockRate,
        ctaToAppOpenRate,
        appOpenToFirstOpenRate,
        firstAppOpenToInvoiceStartRate,
        invoiceStartToCompleteRate,
        checkoutToUnlockRate,
        proofOwners: proofOwners.size,
        ctaOwners: ctaOwners.size,
        appOpenOwners: appOpenOwners.size,
        firstAppOpenOwners: firstAppOpenOwners.size,
        firstInvoiceStartedOwners: firstInvoiceStartedOwners.size,
        invoiceCompleteOwners: invoiceCompleteOwners.size,
        checkoutOwners: checkoutOwners.size,
        unlockOwners: unlockOwners.size
      }
    };
  };
  function OperatorDashboardPage() {
    const navigate = useNavigate();
    const [savedInvoices, setSavedInvoices] = useState([]);
    const [billingInfo, setBillingInfo] = useState(null);
    const [deliveryInfo, setDeliveryInfo] = useState(null);
    const [campaignWatchInfo, setCampaignWatchInfo] = useState(null);
    const [revenueSignalsInfo, setRevenueSignalsInfo] = useState(null);
    const [statementActivityFeed, setStatementActivityFeed] = useState([]);
    const [landingFunnelRange, setLandingFunnelRange] = useState("7d");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [estimateActionId, setEstimateActionId] = useState("");
    const [estimateNotice, setEstimateNotice] = useState("");
    const [recurringNotice, setRecurringNotice] = useState("");
    const [recurringSchedules, setRecurringSchedules] = useState(() => readRecurringSchedules(recurringStorageKey));

    useEffect(() => {
      let active = true;
      setLoading(true);
      Promise.all([
        apiFetch("/api/invoices"),
        apiFetch("/api/system/billing").catch(() => null),
        apiFetch("/api/system/delivery").catch(() => null),
        apiFetch("/api/system/google-ads/campaign-status").catch(() => null),
        apiFetch("/api/clients/statement/activity/recent?limit=8").catch(() => null),
        apiFetch("/api/telemetry/revenue-signals?limit=20").catch(() => null)
      ])
        .then(async ([invoiceResponse, billingResponse, deliveryResponse, campaignWatchResponse, statementActivityResponse, revenueSignalsResponse]) => {
          if (!invoiceResponse.ok) {
            throw new Error("Failed to load dashboard.");
          }
          const payload = await invoiceResponse.json();
          const billingPayload = billingResponse?.ok ? await billingResponse.json().catch(() => null) : null;
          const deliveryPayload = deliveryResponse?.ok ? await deliveryResponse.json().catch(() => null) : null;
          const campaignWatchPayload = campaignWatchResponse?.ok
            ? await campaignWatchResponse.json().catch(() => null)
            : null;
          const statementActivityPayload = statementActivityResponse?.ok
            ? await statementActivityResponse.json().catch(() => null)
            : null;
          const revenueSignalsPayload = revenueSignalsResponse?.ok
            ? await revenueSignalsResponse.json().catch(() => null)
            : null;
          if (!active) {
            return;
          }
          setSavedInvoices(Array.isArray(payload?.invoices) ? payload.invoices : []);
          setBillingInfo(billingPayload && typeof billingPayload === "object" ? billingPayload : null);
          setDeliveryInfo(deliveryPayload && typeof deliveryPayload === "object" ? deliveryPayload : null);
          setCampaignWatchInfo(campaignWatchPayload && typeof campaignWatchPayload === "object" ? campaignWatchPayload : null);
          setRevenueSignalsInfo(
            revenueSignalsPayload && typeof revenueSignalsPayload === "object" ? revenueSignalsPayload : null
          );
          setStatementActivityFeed(
            Array.isArray(statementActivityPayload?.activities) ? statementActivityPayload.activities : []
          );
          setError("");
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setSavedInvoices([]);
          setBillingInfo(null);
          setDeliveryInfo(null);
          setCampaignWatchInfo(null);
          setRevenueSignalsInfo(null);
          setStatementActivityFeed([]);
          setError("Dashboard metrics are unavailable right now.");
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      setRecurringSchedules(readRecurringSchedules(recurringStorageKey));
      setRecurringNotice("");
    }, [recurringStorageKey]);

    const requestJson = async (input, init, fallbackMessage) => {
      const response = await apiFetch(input, init);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(payload?.error || fallbackMessage);
        requestError.status = response.status;
        throw requestError;
      }
      return payload;
    };

    const googlePlayBilling = billingInfo?.capabilities?.googlePlay ?? {};
    const googlePlayEntitlements = googlePlayBilling?.entitlements ?? {};
    const googlePlaySubscriptionCount = Number(googlePlayEntitlements?.subscriptionCount ?? 0) || 0;
    const googlePlayActiveSubscriptionCount = Number(googlePlayEntitlements?.activeSubscriptionCount ?? 0) || 0;
    const stripeActiveSubscriptionCount = Number(billingInfo?.entitlements?.activeSubscriptionCount ?? 0) || 0;
    const googlePlayNeedsRecovery =
      Boolean(googlePlayBilling?.verificationAvailable) &&
      googlePlaySubscriptionCount > 0 &&
      googlePlayActiveSubscriptionCount <= 0;
    const googlePlayPlanCount = Array.isArray(googlePlayBilling?.subscriptionPlans)
      ? googlePlayBilling.subscriptionPlans.length
      : 0;
    const campaignWatch = campaignWatchInfo?.campaign ?? null;
    const campaignWatchSummary = campaignWatchInfo?.summary ?? null;
    const campaignWatchConfigured = Boolean(campaignWatchInfo?.configured);
    const campaignWatchBudget = Number(campaignWatch?.budgetMicros ?? 0) / 1_000_000;
    const campaignWatchImpressions = Number(campaignWatch?.impressions ?? 0);
    const campaignWatchClicks = Number(campaignWatch?.clicks ?? 0);
    const campaignWatchCost = Number(campaignWatch?.costMicros ?? 0) / 1_000_000;
    const campaignWatchConversions = Number(campaignWatch?.conversions ?? 0);
    const campaignWatchAds = Array.isArray(campaignWatchInfo?.ads) ? campaignWatchInfo.ads : [];
    const campaignWatchApprovedAds = campaignWatchAds.filter((ad) => ad.approvalStatus === "APPROVED").length;
    const campaignWatchTone = campaignWatchSummary?.tone || "soft";
    const campaignWatchEligibleStatus =
      campaignWatch?.primaryStatus || campaignWatch?.servingStatus || campaignWatchSummary?.label || "Monitoring";
    const revenueSignalsSummary = revenueSignalsInfo?.summary ?? null;
    const landingFunnelReport = useMemo(
      () => buildLandingFunnelReport(revenueSignalsInfo, landingFunnelRange),
      [revenueSignalsInfo, landingFunnelRange]
    );
    const userBehaviorSnapshot = useMemo(() => {
      const summary = revenueSignalsSummary ?? {};
      const byEventEntries = Object.entries(revenueSignalsInfo?.byEvent ?? {})
        .filter(([, count]) => Number(count) > 0)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 6);
      return {
        cards: [
          {
            label: "Owners seen",
            value: summary.ownerCount ?? 0,
            helper: "Unique owners with tracked activity"
          },
          {
            label: "Signed in",
            value: summary.accountSignedInOwners ?? 0,
            helper: "Owners who reached auth"
          },
          {
            label: "Invoices saved",
            value: summary.activatedOwners ?? 0,
            helper: "Owners who saved a draft"
          },
          {
            label: "Checkout started",
            value: summary.checkoutOwners ?? 0,
            helper: "Owners who reached checkout"
          },
          {
            label: "Attributed owners",
            value: summary.attributedOwners ?? 0,
            helper: "Owners tied to a campaign landing"
          },
          {
            label: "Telemetry unlocks",
            value: summary.proUnlockVerifiedOwners ?? 0,
            helper: "Client telemetry only; verify billing separately"
          }
        ],
        topSignals: byEventEntries.map(([event, count]) => ({
          event,
          label: revenueSignalLabel(event),
          tone: revenueSignalTone(event),
          count
        }))
      };
    }, [revenueSignalsInfo, revenueSignalsSummary]);
    const recentAuthSignals = useMemo(() => {
      const authEvents = new Set([
        "email_sign_in_requested",
        "email_sign_in_link_sent",
        "email_sign_in_link_previewed",
        "email_sign_in_request_failed",
        "email_sign_in_link_opened",
        "email_sign_in_link_verified",
        "email_sign_in_link_failed",
        "account_signed_in"
      ]);
      return Array.isArray(revenueSignalsInfo?.recentEvents)
        ? revenueSignalsInfo.recentEvents
            .filter((event) => authEvents.has(event.event))
            .slice(-8)
            .reverse()
            .map((event) => ({
              ...event,
              label: authSignalLabel(event.event),
              tone: authSignalTone(event.event),
              timeLabel: formatDateTime(event.at)
            }))
        : [];
    }, [revenueSignalsInfo]);

    const clientMemory = getClientMemory();
    const savedServices = getLineItemLibrary();
    const recurringEntries = recurringSchedules;
    const activeInvoices = savedInvoices.filter((invoice) => invoice && invoice.status !== "deleted");
    const estimateInvoices = activeInvoices.filter((invoice) => getInvoiceDocumentType(invoice) === "estimate");
    const sentInvoices = activeInvoices.filter((invoice) => invoice.status === "sent");
    const paidInvoices = activeInvoices.filter((invoice) => invoice.status === "paid");
    const partiallyPaidInvoices = activeInvoices.filter((invoice) => hasPartialPayment(invoice));
    const overdueInvoiceCount = sentInvoices.filter((invoice) => {
      const dueMs = parseDueDate(invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "");
      return Number.isFinite(dueMs) && dueMs <= Date.now();
    }).length;
    const totalOpenBalance = sentInvoices.reduce((total, invoice) => {
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);
    const overdueOpenBalance = sentInvoices.reduce((total, invoice) => {
      const dueMs = parseDueDate(invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "");
      if (!Number.isFinite(dueMs) || dueMs > Date.now()) {
        return total;
      }
      const amount = Number(invoice?.balanceDue ?? invoice?.invoiceData?.finishedInvoice?.balanceDue ?? 0);
      return total + (Number.isFinite(amount) ? Math.max(amount, 0) : 0);
    }, 0);

    const urgentFollowUps = useMemo(() => {
      const nowMs = Date.now();
      return sentInvoices
        .map((invoice) => {
          const dueDate = invoice?.dueDate ?? invoice?.invoiceData?.finishedInvoice?.dueDate ?? "";
          const dueMs = parseDueDate(dueDate);
          return {
            invoice,
            dueDate,
            dueMs,
            isOverdue: Number.isFinite(dueMs) && dueMs <= nowMs
          };
        })
        .sort((left, right) => {
          if (left.isOverdue !== right.isOverdue) {
            return left.isOverdue ? -1 : 1;
          }
          return (left.dueMs || Number.MAX_SAFE_INTEGER) - (right.dueMs || Number.MAX_SAFE_INTEGER);
        })
        .slice(0, 4);
    }, [sentInvoices]);

    const recurringWork = useMemo(() => {
      const nowMs = Date.now();
      return activeInvoices
        .map((invoice) => {
          const entry = recurringEntries[invoice.invoiceId];
          if (!entry) {
            return null;
          }
          const recurringSummary = buildRecurringScheduleSummary(entry, {
            nowMs,
            dueSoonWindowMs: recurringSoonWindowMs,
            runHistoryLimit: 2
          });
          return {
            invoice,
            intervalDays: Number(entry.intervalDays ?? 30) || 30,
            recurringSummary
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.recurringSummary.nextDueMs - right.recurringSummary.nextDueMs);
    }, [activeInvoices, recurringEntries]);

    const recurringSendHistory = useMemo(() => {
      return recurringWork
        .filter((entry) => Boolean(entry.recurringSummary.lastAutoSendAt))
        .sort(
          (left, right) =>
            parseTimestamp(right.recurringSummary.lastAutoSendAt) - parseTimestamp(left.recurringSummary.lastAutoSendAt)
        )
        .slice(0, 4);
    }, [recurringWork]);

    const recentActivity = useMemo(
      () =>
        buildRecentActivityEntries({
          invoices: activeInvoices,
          getClientName: getInvoiceClientName,
          formatDateTime,
          formatMoney
        }),
      [activeInvoices, formatDateTime, formatMoney]
    );

    const recentStatementActivity = useMemo(() => {
      return Array.isArray(statementActivityFeed)
        ? statementActivityFeed.slice(0, 6).map((entry) => ({
            ...entry,
            actionLabel: getStatementActivityLabel(entry.action),
            actionTone: getStatementActivityTone(entry.action),
            timeLabel: formatDateTime(entry.recordedAt)
          }))
        : [];
    }, [statementActivityFeed]);

    const dashboardMomentum = useMemo(() => {
      const nowMs = Date.now();
      return buildWeeklyMomentumCards({
        invoices: activeInvoices,
        recurringSendHistory,
        formatMoney,
        nowMs
      });
    }, [activeInvoices, recurringSendHistory]);

    const collectionsAgingSnapshot = useMemo(
      () =>
        buildCollectionsAgingSnapshot({
          invoices: activeInvoices,
          formatMoney,
          nowMs: Date.now()
        }),
      [activeInvoices, formatMoney]
    );

    const toggleRecurringAutoSend = (invoiceId, enabled) => {
      const existing = recurringSchedules[invoiceId];
      if (!existing) {
        setError("Recurring schedule not found.");
        return;
      }
      const invoice = activeInvoices.find((candidate) => candidate.invoiceId === invoiceId);
      const recipientEmail = getRecurringAutoSendRecipient(invoice, clientMemory);
      if (enabled && !recipientEmail) {
        setError("Recurring auto-send needs a remembered recipient email.");
        return;
      }
      const nextSchedules = {
        ...recurringSchedules,
        [invoiceId]: {
          ...existing,
          autoSendEnabled: Boolean(enabled)
        }
      };
      setRecurringSchedules(nextSchedules);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(recurringStorageKey, JSON.stringify({ entries: nextSchedules }));
      }
      setError("");
      setRecurringNotice(
        enabled
          ? `Recurring auto-send armed for ${recipientEmail || "the remembered recipient"}.`
          : "Recurring auto-send paused for now."
      );
    };

    const runRecurringAutoSend = async (invoice) => {
      if (!invoice?.invoiceId) {
        return;
      }
      const recurringEntry = recurringSchedules[invoice.invoiceId];
      if (!recurringEntry?.autoSendEnabled) {
        setError("Arm recurring auto-send before running it.");
        return;
      }
      const recipientEmail = getRecurringAutoSendRecipient(invoice, clientMemory);
      if (!recipientEmail) {
        setError("Recurring auto-send needs a remembered recipient email.");
        return;
      }
      setError("");
      setRecurringNotice(`Running recurring send for ${recipientEmail}...`);
      const nextDueAt = new Date(
        Date.now() + normalizeRecurringInterval(recurringEntry.intervalDays) * recurringDayMs
      ).toISOString();
      const nextSchedules = {
        ...recurringSchedules,
        [invoice.invoiceId]: {
          ...recurringEntry,
          nextDueAt,
          autoSendEnabled: true,
          lastAutoSendAt: new Date().toISOString(),
          lastAutoSendRecipient: recipientEmail,
          autoSendRunCount: Math.max(0, Number(recurringEntry.autoSendRunCount ?? 0) || 0) + 1,
          lastAutoSendMode: "running",
          runHistory: [
            {
              runAt: new Date().toISOString(),
              recipient: recipientEmail,
              mode: "running"
            },
            ...(Array.isArray(recurringEntry.runHistory) ? recurringEntry.runHistory : [])
          ].slice(0, 5)
        }
      };
      setRecurringSchedules(nextSchedules);
      window.localStorage.setItem(recurringStorageKey, JSON.stringify({ entries: nextSchedules }));
      try {
        const payload = await requestJson(
          `/api/invoices/${invoice.invoiceId}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipientEmail })
          },
          "Failed to send recurring invoice."
        );
        setRecurringSchedules({
          ...nextSchedules,
          [invoice.invoiceId]: {
            ...nextSchedules[invoice.invoiceId],
            lastAutoSendMode: String(payload?.mode ?? "recorded"),
            runHistory: [
              {
                runAt: new Date().toISOString(),
                recipient: recipientEmail,
                mode: String(payload?.mode ?? "recorded")
              },
              ...(Array.isArray(nextSchedules[invoice.invoiceId].runHistory)
                ? nextSchedules[invoice.invoiceId].runHistory.slice(1)
                : [])
            ].slice(0, 5)
          }
        });
        window.localStorage.setItem(
          recurringStorageKey,
          JSON.stringify({
            entries: {
              ...nextSchedules,
              [invoice.invoiceId]: {
                ...nextSchedules[invoice.invoiceId],
                lastAutoSendMode: String(payload?.mode ?? "recorded"),
                runHistory: [
                  {
                    runAt: new Date().toISOString(),
                    recipient: recipientEmail,
                    mode: String(payload?.mode ?? "recorded")
                  },
                  ...(Array.isArray(nextSchedules[invoice.invoiceId].runHistory)
                    ? nextSchedules[invoice.invoiceId].runHistory.slice(1)
                    : [])
                ].slice(0, 5)
              }
            }
          })
        );
        setRecurringNotice(
          `Recurring send run for ${recipientEmail}. Next due ${formatDateTime(nextDueAt)}. Watch delivery before nudging again.`
        );
        setSavedInvoices((prev) =>
          prev.map((candidate) =>
            candidate.invoiceId === invoice.invoiceId
              ? {
                  ...candidate,
                  status: payload?.invoice?.status ?? candidate.status,
                  updatedAt: payload?.invoice?.updatedAt ?? candidate.updatedAt,
                  delivery: payload?.delivery ?? candidate.delivery ?? null
                }
              : candidate
          )
        );
      } catch (sendError) {
        setError(sendError?.message || "Failed to send recurring invoice.");
      }
    };

    const handleConvertEstimateToInvoice = async (invoice) => {
      if (!invoice?.invoiceId) {
        return;
      }
      setEstimateActionId(invoice.invoiceId);
      setError("");
      setEstimateNotice("");
      try {
        const payload = await requestJson(`/api/invoices/${invoice.invoiceId}`, undefined, "Failed to load estimate.");
        const savedInvoice = payload?.invoice;
        const invoiceData = savedInvoice?.invoiceData;
        const finishedInvoice = invoiceData?.finishedInvoice;
        if (!savedInvoice?.invoiceId || !invoiceData || !finishedInvoice) {
          throw new Error("Saved estimate data is incomplete.");
        }
        if (finishedInvoice.documentType !== "estimate") {
          throw new Error("This saved document is already an invoice.");
        }
        const savePayload = await requestJson(
          "/api/invoices/save",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirmSave: true,
              invoiceId: savedInvoice.invoiceId,
              sourceType: savedInvoice.sourceType,
              invoiceData: {
                ...invoiceData,
                finishedInvoice: {
                  ...finishedInvoice,
                  documentType: "invoice",
                  convertedFromEstimateAt: new Date().toISOString(),
                  sourceEstimateNumber: finishedInvoice.invoiceNumber || ""
                }
              }
            })
          },
          "Failed to convert estimate."
        );
        const updatedInvoice = savePayload?.invoice;
        if (updatedInvoice?.invoiceId) {
          setSavedInvoices((prev) =>
            prev.map((existing) =>
              existing.invoiceId === updatedInvoice.invoiceId ? { ...existing, ...updatedInvoice } : existing
            )
          );
          setEstimateNotice(
            `Converted ${updatedInvoice.invoiceNumber || "the estimate"} into a draft invoice. Next: open it, confirm payment terms, and send when ready.`
          );
        }
      } catch (convertError) {
        setError(convertError?.message || "Failed to convert estimate.");
      } finally {
        setEstimateActionId("");
      }
    };

    const handleSetEstimateReviewState = async (invoice, reviewState) => {
      if (!invoice?.invoiceId) {
        return;
      }
      setEstimateActionId(invoice.invoiceId);
      setError("");
      setEstimateNotice("");
      try {
        const payload = await requestJson(`/api/invoices/${invoice.invoiceId}`, undefined, "Failed to load estimate.");
        const savedInvoice = payload?.invoice;
        const invoiceData = savedInvoice?.invoiceData;
        const finishedInvoice = invoiceData?.finishedInvoice;
        if (!savedInvoice?.invoiceId || !invoiceData || !finishedInvoice) {
          throw new Error("Saved estimate data is incomplete.");
        }
        if (finishedInvoice.documentType !== "estimate") {
          throw new Error("This saved document is already an invoice.");
        }
        const nextReviewState = reviewState === "approved" ? "approved" : "needs_review";
        const savePayload = await requestJson(
          "/api/invoices/save",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirmSave: true,
              invoiceId: savedInvoice.invoiceId,
              sourceType: savedInvoice.sourceType,
              invoiceData: {
                ...invoiceData,
                finishedInvoice: {
                  ...finishedInvoice,
                  estimateReviewState: nextReviewState,
                  estimateReviewUpdatedAt: new Date().toISOString()
                }
              }
            })
          },
          "Failed to update estimate review state."
        );
        const updatedInvoice = savePayload?.invoice;
        if (updatedInvoice?.invoiceId) {
          setSavedInvoices((prev) =>
            prev.map((existing) =>
              existing.invoiceId === updatedInvoice.invoiceId ? { ...existing, ...updatedInvoice } : existing
            )
          );
          setEstimateNotice(
            nextReviewState === "approved"
              ? `Marked ${updatedInvoice.invoiceNumber || "the estimate"} as approved. Next: convert it when the work is ready to bill.`
              : `Marked ${updatedInvoice.invoiceNumber || "the estimate"} as needing review. Next: reopen it with Billie and tidy the missing pieces.`
          );
        }
      } catch (reviewError) {
        setError(reviewError?.message || "Failed to update estimate review state.");
      } finally {
        setEstimateActionId("");
      }
    };

    const repeatReadyClients = useMemo(() => {
      return clientMemory
        .map((entry) => {
          const lookupKey = normalizeName(entry.name);
          const matchingServices = savedServices.filter(
            (service) => normalizeName(service?.clientName) === lookupKey
          );
          const matchingInvoices = activeInvoices.filter(
            (invoice) => normalizeName(getInvoiceClientName(invoice)) === lookupKey
          );
          return {
            entry,
            matchingServices,
            matchingInvoices,
            readinessScore:
              (entry.recipientEmail ? 1 : 0) +
              (entry.defaultNotes ? 1 : 0) +
              (entry.recurringIntervalDays ? 1 : 0) +
              (matchingServices.length > 0 ? 1 : 0)
          };
        })
        .sort((left, right) => right.readinessScore - left.readinessScore || right.matchingInvoices.length - left.matchingInvoices.length)
        .slice(0, 4);
    }, [activeInvoices, clientMemory, savedServices]);

    const dueNowCount = recurringWork.filter((entry) => entry.dueNow).length;
    const dueSoonCount = recurringWork.filter((entry) => entry.dueSoon).length;
    const topEstimate = estimateInvoices[0] ?? null;
    const topPartialPayment = partiallyPaidInvoices[0] ?? null;
    const topRecurring = recurringWork[0] ?? null;
    const topFollowUp = urgentFollowUps[0]?.invoice ?? null;
    const topEstimateSummary = topEstimate ? buildEstimateWorkflowSummary(topEstimate) : null;
    const repeatReadyClient = repeatReadyClients[0]?.entry ?? null;
    const hasOpenedOverdueFollowUp = urgentFollowUps.some(({ invoice, isOverdue }) => isOverdue && invoice?.delivery?.status === "opened");
    const hasUnopenedOverdueFollowUp = urgentFollowUps.some(({ invoice, isOverdue }) => isOverdue && invoice?.delivery?.status !== "opened");
    const collectionsActionCards = [
      {
        label: "Overdue invoices",
        value: overdueInvoiceCount,
        targetPath: hasOpenedOverdueFollowUp ? "/invoices?focus=overdue_opened" : "/invoices?focus=overdue_unopened",
        helper:
          overdueInvoiceCount > 0
            ? hasOpenedOverdueFollowUp
              ? "Jump to overdue invoices the client already opened."
              : "Jump to overdue invoices that still need a delivery-first check."
            : "No overdue queue right now."
      },
      {
        label: "Overdue balance",
        value: overdueOpenBalance > 0 ? formatMoney(overdueOpenBalance) : "0",
        targetPath: hasOpenedOverdueFollowUp ? "/invoices?focus=overdue_opened" : "/invoices?focus=overdue_unopened",
        helper:
          overdueOpenBalance > 0
            ? "Open the riskiest overdue money queue."
            : "No overdue balance is waiting right now."
      },
      {
        label: "Open balance",
        value: totalOpenBalance > 0 ? formatMoney(totalOpenBalance) : "0",
        targetPath: "/invoices?focus=opened_unpaid",
        helper:
          totalOpenBalance > 0
            ? "Open invoices the client has already seen but not paid."
            : "No opened-unpaid queue right now."
      },
      {
        label: "Partial payments",
        value: partiallyPaidInvoices.length,
        targetPath: "/invoices?focus=partial_payments",
        helper:
          partiallyPaidInvoices.length > 0
            ? "Open balances that already have money in progress."
            : "No partial-payment recovery queue right now."
      }
    ];
    const suggestedAutomation = useMemo(
      () =>
        buildDashboardPriorityLane({
          variant: "suggested",
          topRecurring,
          topPartialPayment,
          topEstimate,
          estimateSummary: topEstimateSummary,
          recurringRecipient: topRecurring ? getRecurringAutoSendRecipient(topRecurring.invoice, clientMemory) : "",
          getClientName: getInvoiceClientName,
          formatDueDate: formatDateTime
        }),
      [clientMemory, getInvoiceClientName, topEstimate, topEstimateSummary, topPartialPayment, topRecurring]
    );
    const bestLane = useMemo(
      () =>
        buildDashboardPriorityLane({
          variant: "best",
          topFollowUp,
          topPartialPayment,
          topEstimate,
          topRecurring,
          repeatReadyClient,
          estimateSummary: topEstimateSummary,
          getClientName: getInvoiceClientName,
          formatDueDate: formatDateTime
        }),
      [getInvoiceClientName, repeatReadyClient, topEstimate, topEstimateSummary, topFollowUp, topPartialPayment, topRecurring]
    );

    const runDashboardTarget = (target) => {
      if (!target) {
        return;
      }
      if (target.type === "navigate") {
        navigate(target.path);
        return;
      }
      if (target.type === "open_client") {
        if (target.clientName) {
          navigate(`/clients?client=${encodeURIComponent(target.clientName)}`);
        }
        return;
      }
      if (target.type === "open_invoice") {
        if (target.invoiceId) {
          navigate(`/invoices?open=${encodeURIComponent(target.invoiceId)}`);
        }
        return;
      }
      if (target.type === "convert_estimate") {
        if (target.invoiceId) {
          void handleConvertEstimateToInvoice(activeInvoices.find((invoice) => invoice.invoiceId === target.invoiceId));
        }
      }
    };

    const reminderRecoveryCards = useMemo(() => {
      const reminderCandidates = Array.isArray(deliveryInfo?.reminders?.due) ? deliveryInfo.reminders.due : [];
      return reminderCandidates
        .slice(0, 4)
        .map((candidate) => {
          const invoice = activeInvoices.find((item) => item.invoiceId === candidate.invoiceId) ?? null;
          if (!invoice) {
            return null;
          }
          const deliveryStatus = invoice?.delivery?.status ?? "sent";
          const targetPath =
            deliveryStatus === "opened"
              ? "/invoices?focus=opened_unpaid"
              : candidate.reason === "past_due"
                ? "/invoices?focus=overdue_unopened"
                : "/invoices?focus=opened_unpaid";
          const reasonLabel =
            candidate.reason === "past_due"
              ? "Past due"
              : candidate.reason === "follow_up_window"
                ? "Follow-up window"
                : "Cooldown";
          const tone =
            candidate.reason === "past_due"
              ? "warning"
              : candidate.reason === "follow_up_window"
                ? "soft"
                : "info";
          return {
            candidate,
            invoice,
            targetPath,
            reasonLabel,
            tone
          };
        })
        .filter(Boolean);
    }, [activeInvoices, deliveryInfo]);

    const runRecentActivityAction = (entry, action) => {
      if (!entry?.invoice || !action) {
        return;
      }
      if (action.targetType === "navigate" && action.path) {
        navigate(action.path);
        return;
      }
      if (action.targetType === "open_client") {
        navigate(`/clients?client=${encodeURIComponent(entry.clientName || getInvoiceClientName(entry.invoice) || "")}`);
        return;
      }
      navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`);
    };

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-6xl py-6 md:py-10">
          <section className="nb-surface nb-surface--elevated mt-4 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-page">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="nb-kicker">Operator dashboard</p>
                <h1 className="nb-title mt-2 text-[2.1rem] md:text-5xl">
                  What needs attention next
                </h1>
                <p className="nb-copy mt-2 max-w-2xl">
                  A simple control view for open balances, repeat-work readiness, and recurring jobs that are getting close.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/")}>
                  Back to launcher
                </button>
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices")}>
                  Open library
                </button>
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/clients")}>
                  Open client workspace
                </button>
              </div>
            </div>
            {loading ? (
              <p className="mt-4 text-sm text-slate-500" role="status" aria-live="polite">
                Loading dashboard metrics…
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 text-sm font-semibold text-rose-600" role="alert">
                {error}
              </p>
            ) : null}
            {estimateNotice ? (
              <p className="mt-4 text-sm font-semibold text-emerald-700" role="status" aria-live="polite">
                {estimateNotice}
              </p>
            ) : null}
            {recurringNotice ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700" role="status" aria-live="polite">
                {recurringNotice}
              </p>
            ) : null}
          </section>

          <section className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {[
              ["Open balance", totalOpenBalance > 0 ? formatMoney(totalOpenBalance) : "0"],
              ["Overdue balance", overdueOpenBalance > 0 ? formatMoney(overdueOpenBalance) : "0"],
              ["Partial payments", partiallyPaidInvoices.length],
              ["Recurring due now", dueNowCount],
              ["Recurring due soon", dueSoonCount],
              ["Paid invoices", paidInvoices.length],
              ["Saved estimates", estimateInvoices.length]
            ].map(([label, value]) => (
              <div key={label} className="nb-stage-card">
                <p className="nb-stage-card__value text-2xl">{value}</p>
                <p className="nb-stage-card__label mt-2">
                  {label}
                </p>
              </div>
            ))}
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-billing-watch">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Billing recovery watch</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  Read Google Play state faster when testing resumes
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This keeps the most important billing signals together so we can tell whether a failed upgrade is Play account history, a missing entitlement, or a real backend problem.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/diagnostics")}>
                  Open diagnostics
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Google Play verify",
                  googlePlayBilling?.verificationAvailable ? "Ready" : "Needs setup"
                ],
                [
                  "Configured plans",
                  googlePlayPlanCount
                ],
                [
                  "Subscription records",
                  googlePlaySubscriptionCount
                ],
                [
                  "Active Play entitlements",
                  googlePlayActiveSubscriptionCount
                ]
              ].map(([label, value]) => (
                <div key={label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Package {googlePlayBilling?.packageName || "n/a"} · product {googlePlayBilling?.subscriptionProductId || "n/a"} · default plan{" "}
              {googlePlayBilling?.subscriptionBasePlanId || "n/a"}
            </p>
            {googlePlayNeedsRecovery ? (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                Google Play purchase history exists, but no active entitlement is unlocking Pro right now. Try Restore purchases first when the real-device test window opens.
              </p>
            ) : googlePlayBilling?.verificationAvailable ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">
                Google Play verification looks configured from the server side.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                Google Play verification still needs setup before real Android billing proof can pass cleanly.
              </p>
            )}
          {billingInfo?.warning ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">{billingInfo.warning}</p>
            ) : null}
            {googlePlayNeedsRecovery ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">
                If Google Play says the user already has the plan while NoteBill still shows Free, the account is probably stuck in old trial, extension, or test-plan history.
              </p>
            ) : null}
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-campaign-watch">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Campaign watch</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  Watch the cheap Search test for spend, review, and traction
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This keeps the live ad test visible in one place so we can see whether it is still waiting on review or actually spending. Ads actions are attribution signals, not verified purchases.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <a
                  href="https://ads.google.com/aw/campaigns"
                  target="_blank"
                  rel="noreferrer"
                  className="nb-btn-secondary"
                >
                  Open Google Ads
                </a>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Budget", campaignWatchConfigured ? formatMoney(campaignWatchBudget) : "n/a"],
                ["Impressions", campaignWatchConfigured ? campaignWatchImpressions : 0],
                ["Clicks", campaignWatchConfigured ? campaignWatchClicks : 0],
                ["Spend", campaignWatchConfigured ? formatMoney(campaignWatchCost) : "n/a"]
              ].map(([label, value]) => (
                <div key={label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Ads-reported actions", campaignWatchConfigured ? campaignWatchConversions : 0],
                ["Ads approved", campaignWatchApprovedAds],
                ["Verified Stripe subs", stripeActiveSubscriptionCount],
                ["Campaign state", campaignWatchEligibleStatus]
              ].map(([label, value]) => (
                <div key={label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={campaignWatchTone}>{campaignWatchSummary?.label || "Monitoring"}</StatusChip>
                  <StatusChip tone="soft">{campaignWatchCampaignLabel(campaignWatch)}</StatusChip>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {campaignWatchSummary?.detail ||
                    "The live Google Ads campaign watch will show a stronger status line once the account returns campaign data."}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {campaignWatch?.name
                    ? `Campaign ${campaignWatch.name} · status ${campaignWatch.status || "n/a"} · review ${campaignWatch.primaryStatus || "n/a"}`
                    : campaignWatchInfo?.warning || "No campaign data is available yet."}
                </p>
              </div>
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-landing-funnel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Landing funnel</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  Watch whether landing traffic turns into proof opens, app opens, and paid unlocks
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This is a date-ranged report built from the stored telemetry snapshot. It shows unique owners, event counts, step conversion, and drop-off so we can tell whether the page and app bridge are converting before we spend more on ads.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoice-app-on-phone")}>
                  Open landing page
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {landingFunnelRangeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    landingFunnelRange === option.id
                      ? "rounded-full bg-[#17493c] px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  }
                  onClick={() => setLandingFunnelRange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Range {landingFunnelReport.rangeLabel} · source {landingFunnelReport.trackedSourceLabel} · {landingFunnelReport.totalEvents} funnel events in this window.
            </p>
            <p className="mt-2 rounded-[18px] border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-900">
              App open is post-click engagement tracking, not verified install attribution. First app open is the first observed app open in our local telemetry/owner context. True Play Store install attribution would need a separate install-referrer implementation later.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {landingFunnelReport.stageRows.map((stage) => (
                <div key={stage.key} className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusChip tone={stage.tone}>{stage.stepRate}</StatusChip>
                      <StatusChip tone="soft">{stage.dropOff === "n/a" ? "Start step" : `${stage.dropOff} drop-off`}</StatusChip>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#17493c]">{stage.count}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{stage.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{stage.detail}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {stage.events} tracked events · {stage.event}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">Range correlation notes</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These are owner overlaps, not causal proof. They help answer whether sample opens seem to be moving people closer to upgrade.
                </p>
                <div className="mt-3 grid gap-2">
                  {[
                    [
                      "Proof -> unlock",
                      `${landingFunnelReport.notes.proofAndUnlockOwners} owners · ${landingFunnelReport.notes.proofToUnlockRate}`
                    ],
                    [
                      "Proof -> Play",
                      `${landingFunnelReport.notes.proofAndCtaOwners} owners`
                    ],
                    [
                      "Play -> app open",
                      `${landingFunnelReport.notes.ctaAndAppOpenOwners} owners · ${landingFunnelReport.notes.ctaToAppOpenRate}`
                    ],
                    [
                      "App open -> first open",
                      `${landingFunnelReport.notes.appOpenAndFirstAppOpenOwners} owners · ${landingFunnelReport.notes.appOpenToFirstOpenRate}`
                    ],
                    [
                      "First open -> first invoice",
                      `${landingFunnelReport.notes.firstAppOpenAndInvoiceStartOwners} owners · ${landingFunnelReport.notes.firstAppOpenToInvoiceStartRate}`
                    ],
                    [
                      "First invoice -> saved/sent",
                      `${landingFunnelReport.notes.invoiceStartAndCompleteOwners} owners · ${landingFunnelReport.notes.invoiceStartToCompleteRate}`
                    ],
                    [
                      "Play -> unlock",
                      `${landingFunnelReport.notes.ctaAndUnlockOwners} owners · ${landingFunnelReport.notes.ctaToUnlockRate}`
                    ],
                    [
                      "Checkout -> unlock",
                      `${landingFunnelReport.notes.checkoutOwners > 0 ? landingFunnelReport.notes.checkoutToUnlockRate : "n/a"}`
                    ]
                  ].map(([label, detail]) => (
                    <div key={label} className="rounded-[18px] border border-white/60 bg-white/70 px-3 py-2">
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">Attribution breakdown</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  First-touch attribution is used when available. If it is missing, the row falls back to Direct / unknown.
                </p>
                <div className="mt-3 grid gap-2">
                  {landingFunnelReport.sourceRows.length > 0 ? (
                    landingFunnelReport.sourceRows.map((row) => (
                      <div key={`${row.label}-${row.landingPath}`} className="rounded-[18px] border border-white/60 bg-white/70 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Source {row.source} · medium {row.medium} · campaign {row.campaign}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Landing path {row.landingPath}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {row.events} events · {row.unlockOwners} unlocks · {row.conversionRate} unlock rate
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">No attribution data in this range yet.</p>
                  )}
                </div>
              </div>
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">Supporting product events</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These help you see whether the app is actually being used beyond the landing page.
                </p>
                <div className="mt-3 grid gap-2">
                  {landingFunnelReport.supportingEvents.map((entry) => (
                    <div
                      key={entry.event}
                      className={
                        entry.status === "partial"
                          ? "rounded-[18px] border border-amber-100 bg-amber-50/80 px-3 py-2"
                          : "rounded-[18px] border border-white/60 bg-white/70 px-3 py-2"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                        <StatusChip tone={entry.status === "partial" ? "warning" : "soft"}>{entry.status}</StatusChip>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{entry.detail}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {entry.status === "partial"
                          ? "Tracked elsewhere; not unified into this report yet."
                          : entry.count > 0
                            ? `${entry.count} events in range`
                            : "Not seen in this range"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">Recent landing signals</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Source {landingFunnelReport.trackedSourceLabel}. These are the most recent funnel events in the selected range.
                </p>
                <div className="mt-3 grid gap-2">
                  {landingFunnelReport.recentLandingSignals.length > 0 ? (
                    landingFunnelReport.recentLandingSignals.map((event, index) => (
                      <div key={`${event.at}-${event.event}-${index}`} className="rounded-[18px] border border-white/60 bg-white/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                          <StatusChip tone={event.tone}>{event.event}</StatusChip>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {event.timeLabel}
                          {event.source ? ` · ${event.source}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">No recent landing funnel events have landed in this range yet.</p>
                  )}
                </div>
              </div>
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">Data gaps to close next</p>
                <div className="mt-3 grid gap-2">
                  {[
                    [
                      "App install attribution",
                      "Click-to-install is not verified yet; app_opened is post-click engagement tracking only. True install attribution would need an install-referrer layer."
                    ],
                    ["Device/platform split", "Not available in the current revenue snapshot."],
                    ["Paid vs organic split", "Only partial via UTM or gclid attribution."],
                    ["Paywall split", "billing_plan_viewed still covers both landing and in-app pricing views."],
                    ["Subscription cancelled", "No cancellation signal in revenue telemetry yet."],
                    ["Custom date range", "Simple presets are live first; custom ranges can come later."]
                  ].map(([label, detail]) => (
                    <div key={label} className="rounded-[18px] border border-amber-100 bg-amber-50/80 px-3 py-2">
                      <p className="text-sm font-semibold text-amber-900">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                <p className="text-sm font-semibold text-slate-900">What this can and cannot prove</p>
                <div className="mt-3 grid gap-2">
                  {[
                    "Unique owners are the dedupe key; sessions are not tracked separately.",
                    "App open and first app open are tracked as post-click engagement, but true install attribution is still unavailable.",
                    "Landing and unlock overlap are correlations, not causal proof.",
                    "The report uses retained local telemetry, not GA4, for the first version.",
                    "PDF export is only partially tracked here and stays marked as such.",
                    "billing_plan_viewed is still shared between landing and in-app pricing views."
                  ].map((note) => (
                    <div key={note} className="rounded-[18px] border border-white/60 bg-white/70 px-3 py-2">
                      <p className="text-xs leading-5 text-slate-600">{note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              This is a retained-event report, not a GA4 export. It is enough to compare today, 7 days, 30 days, and all time without pretending we have session-level analytics or install-referrer attribution we do not yet store.
            </p>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-auth-funnel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Sign-in funnel</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  Watch email sign-in requests, sends, and failures
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This shows whether the email sign-in path is actually moving people through, or if they are retrying because the link is missing, delayed, or failing.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/")}>
                  Open launcher
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Requests", revenueSignalsSummary?.emailSignInRequestedOwners ?? 0],
                ["Links sent", revenueSignalsSummary?.emailSignInLinkSentOwners ?? 0],
                ["Links opened", revenueSignalsSummary?.emailSignInLinkOpenedOwners ?? 0],
                ["Verified sign-ins", revenueSignalsSummary?.emailSignInLinkVerifiedOwners ?? 0]
              ].map(([label, value]) => (
                <div key={label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Request fails", revenueSignalsSummary?.emailSignInRequestFailedOwners ?? 0],
                ["Link previewed", revenueSignalsSummary?.emailSignInLinkPreviewedOwners ?? 0],
                ["Link failed", revenueSignalsSummary?.emailSignInLinkFailedOwners ?? 0],
                ["Signed in", revenueSignalsSummary?.accountSignedInOwners ?? 0]
              ].map(([label, value]) => (
                <div key={label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={recentAuthSignals.some((event) => event.event === "email_sign_in_link_failed") ? "warning" : "soft"}>
                    {recentAuthSignals.length > 0 ? `${recentAuthSignals.length} recent auth signals` : "No recent auth signals"}
                  </StatusChip>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {recentAuthSignals.length > 0
                    ? "Recent auth events are listed below so you can tell whether retries are caused by send, open, or verify trouble."
                    : "No recent email sign-in telemetry has landed yet."}
                </p>
                {revenueSignalsInfo?.source ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">Source {revenueSignalsInfo.source}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4">
              {recentAuthSignals.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {recentAuthSignals.map((event, index) => (
                    <div key={`${event.at}-${event.event}-${index}`} className="nb-focus-panel rounded-[22px] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {event.timeLabel}
                            {event.source ? ` · ${event.source}` : ""}
                          </p>
                        </div>
                        <StatusChip tone={event.tone}>{event.event}</StatusChip>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-user-behavior">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">User behavior</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  What people are actually doing in the app
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A compact read on sign-ins, drafting, checkout, and unlock activity so the dashboard shows real usage instead of just totals.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/ai-intake?mode=quick")}>
                  Open quick invoice
                </button>
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/dashboard")}>
                  Open main dashboard
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {userBehaviorSnapshot.cards.map((card) => (
                <div key={card.label} className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center">
                  <p className="text-xl font-semibold text-[#17493c]">{card.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{card.helper}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone="soft">
                    {userBehaviorSnapshot.topSignals.length > 0
                      ? `${userBehaviorSnapshot.topSignals.length} top signals`
                      : "No behavior signals yet"}
                  </StatusChip>
                  {revenueSignalsInfo?.source ? <StatusChip tone="soft">Source {revenueSignalsInfo.source}</StatusChip> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {userBehaviorSnapshot.topSignals.length > 0
                    ? "The most common actions are listed below so you can see which parts of the product are getting traction."
                    : "No behavior signals have landed yet."}
                </p>
              </div>
            </div>
            {userBehaviorSnapshot.topSignals.length > 0 ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {userBehaviorSnapshot.topSignals.map((signal) => (
                  <div key={signal.event} className="nb-focus-panel rounded-[22px] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{signal.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {formatCountLabel(signal.count, "owner", "owners")} touched this signal
                        </p>
                      </div>
                      <StatusChip tone={signal.tone}>{signal.event}</StatusChip>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-collections">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Collections snapshot</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  Keep the oldest balances moving
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A quick read on what still needs collection so the dashboard stays focused on money that has not closed yet.
                </p>
              </div>
              <div className="nb-mobile-actions">
                {urgentFollowUps[0]?.invoice ? (
                  <button
                    type="button"
                    className="nb-btn-primary"
                    onClick={() =>
                      navigate(
                        urgentFollowUps[0].invoice?.delivery?.status === "opened"
                          ? "/invoices?focus=overdue_opened"
                          : "/invoices?focus=overdue_unopened"
                      )
                    }
                  >
                    {urgentFollowUps[0].invoice?.delivery?.status === "opened"
                      ? "Open opened overdue queue"
                      : "Open overdue unopened queue"}
                  </button>
                ) : null}
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices?focus=partial_payments")}>
                  Open partial-payment queue
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {collectionsActionCards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                  onClick={() => navigate(card.targetPath)}
                >
                  <p className="text-xl font-semibold text-[#17493c]">{card.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{card.helper}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {overdueInvoiceCount > 0
                ? `${overdueInvoiceCount} invoice${overdueInvoiceCount === 1 ? "" : "s"} are overdue. Start with the oldest open item and keep the client context close.`
              : "No overdue invoices are waiting right now. The next collection move will appear here when balances fall behind."}
            </p>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-aging">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Collections aging</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  How old the open balances are
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  A simple age breakdown makes it easier to see whether balances are fresh, warming up, or starting to stall.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices?focus=opened_unpaid")}>
                  Open opened-unpaid queue
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {collectionsAgingSnapshot.cards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className="nb-focus-panel rounded-[24px] p-4 md:p-5 text-center transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                  onClick={() => navigate(card.targetPath || "/invoices")}
                >
                  <p className="text-xl font-semibold text-[#17493c]">{card.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {card.label}
                  </p>
                  {card.detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{card.detail}</p> : null}
                  {card.helper ? <p className="mt-2 text-xs leading-5 text-slate-500">{card.helper}</p> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-momentum">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="nb-kicker">Momentum snapshot</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">What moved this week</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  A quick read on the latest activity so the dashboard stays focused on momentum, not just totals.
                </p>
              </div>
              <StatusChip tone="soft">7-day window</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dashboardMomentum.map((item) => (
                <div key={item.label} className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                  <p className="text-xl font-semibold text-[#17493c]">{item.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-recent-activity">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="nb-kicker">Recent activity</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">What changed lately</h2>
              </div>
              <StatusChip tone="soft">{recentActivity.length} recent</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((entry) => (
                  <div
                    key={entry.invoice.invoiceId}
                    className="nb-focus-panel rounded-[24px] p-4 md:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.clientName}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {entry.invoice.invoiceNumber || "Saved invoice"}
                        </p>
                      </div>
                      <StatusChip tone="soft">{entry.activityLabel}</StatusChip>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {entry.updatedLabel || "Updated recently"} · {entry.amountLabel}
                    </p>
                    <div className="nb-mobile-actions mt-3">
                      <button
                        type="button"
                        className="nb-btn-primary"
                        onClick={() => runRecentActivityAction(entry, entry.primaryAction)}
                      >
                        {entry.primaryAction?.label || "Open invoice"}
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.clientName)}`)}
                      >
                        Open client
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No recent activity yet.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    As invoices are saved, sent, paid, or converted, they will surface here.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="nb-btn-primary" onClick={() => navigate("/ai-intake")}>
                      Start first invoice
                    </button>
                    <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices")}>
                      Open library
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-statement-activity">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="nb-kicker">Statement activity</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Recent follow-up actions</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Track when statements were copied, emailed, printed, or exported so collections work stays visible across clients.
                </p>
              </div>
              <StatusChip tone="soft">{recentStatementActivity.length} recent</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {recentStatementActivity.length > 0 ? (
                recentStatementActivity.map((entry) => (
                  <div key={entry.id} className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.clientName}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{entry.detail}</p>
                      </div>
                      <StatusChip tone={entry.actionTone}>{entry.actionLabel}</StatusChip>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {entry.timeLabel}
                      {entry.recipientEmail ? ` · ${entry.recipientEmail}` : ""}
                    </p>
                    <div className="nb-mobile-actions mt-3">
                      <button
                        type="button"
                        className="nb-btn-primary"
                        onClick={() =>
                          navigate(
                            `/clients?client=${encodeURIComponent(entry.clientName)}&focus=statement`
                          )
                        }
                      >
                        Open statement tools
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.clientName)}`)}
                      >
                        Review statement
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No statement activity yet.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Once statements are copied, emailed, printed, or downloaded, the latest actions will show up here.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="nb-btn-primary" onClick={() => navigate("/clients")}>
                      Open client workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-reminder-recovery">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">Reminder recovery</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Due reminders and follow-up timing</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  These are the invoices that are ready for a clean reminder send, grouped so the next collections move stays obvious.
                </p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-primary" onClick={() => navigate("/invoices?focus=opened_unpaid")}>
                  Open reminder queue
                </button>
                <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices?focus=overdue_unopened")}>
                  Open overdue-unopened queue
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {reminderRecoveryCards.length > 0 ? (
                reminderRecoveryCards.map((entry) => (
                  <div key={entry.candidate.invoiceId} className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {entry.invoice.invoiceNumber || "Saved invoice"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {getInvoiceClientName(entry.invoice) || "Client"} · {entry.candidate.recipientEmail}
                        </p>
                      </div>
                      <StatusChip tone={entry.tone}>{entry.reasonLabel}</StatusChip>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Next reminder {formatDateTime(entry.candidate.nextReminderAt)} · Last sent{" "}
                      {formatDateTime(entry.candidate.lastSentAt)}
                    </p>
                    <div className="nb-mobile-actions mt-3">
                      <button
                        type="button"
                        className="nb-btn-primary"
                        onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.candidate.invoiceId)}`)}
                      >
                        Open invoice
                      </button>
                      <button
                        type="button"
                        className="nb-btn-secondary"
                        onClick={() => navigate(entry.targetPath)}
                      >
                        Open reminder queue
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No reminder candidates right now.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Once sent invoices age into a reminder window, they will appear here so follow-up stays organized.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="nb-btn-primary" onClick={() => navigate("/invoices?focus=opened_unpaid")}>
                      Open collections queue
                    </button>
                    <button type="button" className="nb-btn-secondary" onClick={() => navigate("/invoices")}>
                      Open library
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

            <section className="nb-highlight-panel mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-automation">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">
                  {suggestedAutomation.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  {suggestedAutomation.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{suggestedAutomation.body}</p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-primary" onClick={() => runDashboardTarget(suggestedAutomation.primaryTarget)}>
                  {suggestedAutomation.primaryLabel}
                </button>
                {suggestedAutomation.secondaryLabel ? (
                  <button type="button" className="nb-btn-secondary" onClick={() => runDashboardTarget(suggestedAutomation.secondaryTarget)}>
                    {suggestedAutomation.secondaryLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

            <section className="nb-highlight-panel mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-best-lane">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="nb-kicker">
                  {bestLane.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 md:text-2xl">
                  {bestLane.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{bestLane.body}</p>
              </div>
              <div className="nb-mobile-actions">
                <button type="button" className="nb-btn-primary" onClick={() => runDashboardTarget(bestLane.primaryTarget)}>
                  {bestLane.primaryLabel}
                </button>
                {bestLane.secondaryLabel ? (
                  <button type="button" className="nb-btn-secondary" onClick={() => runDashboardTarget(bestLane.secondaryTarget)}>
                    {bestLane.secondaryLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-followups">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nb-kicker">Urgent follow-up</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Open invoices to watch first</h2>
                </div>
                <StatusChip tone="soft">{urgentFollowUps.length} queued</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {urgentFollowUps.length > 0 ? (
                  urgentFollowUps.map(({ invoice, dueDate, isOverdue }) => (
                    <button
                      key={invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                      onClick={() => navigate(`/invoices?open=${encodeURIComponent(invoice.invoiceId)}`)}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Saved invoice"} · {getInvoiceClientName(invoice) || "Client"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {dueDate ? `Due ${dueDate}` : "No due date yet"} · Balance{" "}
                            {formatMoney(Number(invoice.balanceDue || invoice.invoiceData?.finishedInvoice?.balanceDue || 0))}
                          </p>
                        </div>
                        <StatusChip tone={isOverdue ? "warning" : "soft"}>
                          {isOverdue ? "Overdue" : "Watch next"}
                        </StatusChip>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">Nothing urgent right now.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once sent invoices start stacking up, this queue will keep the most important ones near the top.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-primary" onClick={() => navigate("/invoices")}>
                        Open library
                      </button>
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate("/manual")}>
                        Start blank invoice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-recurring">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nb-kicker">Recurring work</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Due now and due soon</h2>
                </div>
                <StatusChip tone="soft">{recurringWork.length} tracked</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {recurringWork.length > 0 ? (
                  recurringWork.slice(0, 4).map((entry) => (
                    <div
                      key={entry.invoice.invoiceId}
                      className="nb-focus-panel rounded-[24px] p-4 md:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {getInvoiceClientName(entry.invoice) || entry.invoice.invoiceNumber || "Recurring invoice"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {entry.intervalDays}-day cadence · Next due{" "}
                            {Number.isFinite(entry.recurringSummary.nextDueMs)
                              ? new Date(entry.recurringSummary.nextDueMs).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })
                              : "soon"}
                          </p>
                          {entry.recurringSummary.lastAutoSendAt ? (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Last run {formatDateTime(entry.recurringSummary.lastAutoSendAt)}
                              {entry.recurringSummary.lastAutoSendRecipient
                                ? ` · ${entry.recurringSummary.lastAutoSendRecipient}`
                                : ""}
                            </p>
                          ) : null}
                          {entry.recurringSummary.autoSendRunCount ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {entry.recurringSummary.autoSendRunCount} recurring run
                              {entry.recurringSummary.autoSendRunCount === 1 ? "" : "s"} recorded
                              {entry.recurringSummary.lastAutoSendMode ? ` · ${entry.recurringSummary.lastAutoSendMode}` : ""}
                            </p>
                          ) : null}
                        </div>
                        <StatusChip tone={entry.recurringSummary.statusTone}>
                          {entry.recurringSummary.statusLabel}
                        </StatusChip>
                      </div>
                      <div className="nb-mobile-actions mt-3">
                        <button
                          type="button"
                          className="nb-btn-primary"
                          onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`)}
                        >
                          Open recurring invoice
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() =>
                            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(entry.invoice) || "")}`)
                          }
                        >
                          Open client workspace
                        </button>
                        {getRecurringAutoSendRecipient(entry.invoice, clientMemory) ? (
                          <button
                            type="button"
                            className="nb-btn-secondary border-emerald-200 bg-emerald-50 text-emerald-900"
                            onClick={() =>
                              toggleRecurringAutoSend(entry.invoice.invoiceId, !entry.recurringSummary.autoSendEnabled)
                            }
                          >
                            {entry.recurringSummary.autoSendEnabled ? "Pause auto-send" : "Arm auto-send"}
                          </button>
                        ) : null}
                        {entry.recurringSummary.autoSendEnabled &&
                        getRecurringAutoSendRecipient(entry.invoice, clientMemory) ? (
                          <button
                            type="button"
                            className="nb-btn-secondary border-emerald-200 bg-emerald-50 text-emerald-900"
                            onClick={() => void runRecurringAutoSend(entry.invoice)}
                          >
                            Run auto-send now
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No recurring schedules yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Set recurring cadence on repeat work and the dashboard will surface upcoming jobs here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-primary" onClick={() => navigate("/invoices")}>
                        Open library
                      </button>
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate("/clients")}>
                        Open client workspace
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-recurring-history">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nb-kicker">
                    Recurring send history
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Recent recurring sends</h2>
                </div>
                <StatusChip tone="soft">{recurringSendHistory.length} recent</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {recurringSendHistory.length > 0 ? (
                  recurringSendHistory.map((entry) => (
                    <div key={entry.invoice.invoiceId} className="nb-focus-panel rounded-[24px] p-4 md:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {getInvoiceClientName(entry.invoice) || entry.invoice.invoiceNumber || "Recurring invoice"}
                          </p>
                          {entry.recurringSummary.autoSendRunCount ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {entry.recurringSummary.autoSendRunCount} recurring run
                              {entry.recurringSummary.autoSendRunCount === 1 ? "" : "s"} recorded
                              {entry.recurringSummary.lastAutoSendMode ? ` · ${entry.recurringSummary.lastAutoSendMode}` : ""}
                            </p>
                          ) : null}
                          {Array.isArray(entry.recurringSummary.runHistoryPreview) &&
                          entry.recurringSummary.runHistoryPreview.length > 0 ? (
                            <div className="mt-3 space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                Recent runs
                              </p>
                              {entry.recurringSummary.runHistoryPreview.map((run, index) => (
                                <p key={`${entry.invoice.invoiceId}-run-${index}`} className="text-[11px] text-slate-400">
                                  {formatDateTime(run.runAt)}
                                  {run.recipient ? ` · ${run.recipient}` : ""}
                                  {run.mode ? ` · ${run.mode}` : ""}
                                </p>
                              ))}
                              {entry.recurringSummary.runHistoryOverflowCount > 0 ? (
                                <p className="text-[11px] text-slate-400">
                                  {entry.recurringSummary.runHistoryOverflowCount} more run
                                  {entry.recurringSummary.runHistoryOverflowCount === 1 ? "" : "s"} recorded
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Last run {formatDateTime(entry.recurringSummary.lastAutoSendAt)}
                            {entry.recurringSummary.lastAutoSendRecipient
                              ? ` · ${entry.recurringSummary.lastAutoSendRecipient}`
                              : ""}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {buildRecurringNextStepLabel(entry, {
                              formatDueDate: formatDateTime,
                              hasInvoice: Boolean(entry?.invoice)
                            })}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Next due{" "}
                            {Number.isFinite(entry.recurringSummary.nextDueMs)
                              ? new Date(entry.recurringSummary.nextDueMs).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })
                              : "soon"}
                          </p>
                        </div>
                        <StatusChip tone={entry.recurringSummary.statusTone}>
                          {entry.recurringSummary.statusLabel}
                        </StatusChip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="nb-btn-primary"
                          onClick={() => navigate(`/invoices?open=${encodeURIComponent(entry.invoice.invoiceId)}`)}
                        >
                          Open recurring invoice
                        </button>
                        <button
                          type="button"
                          className="nb-btn-secondary"
                          onClick={() =>
                            navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(entry.invoice) || "")}`)
                          }
                        >
                          Open client workspace
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No recurring sends yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once a recurring invoice runs, the latest activity will show up here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-primary" onClick={() => navigate("/invoices")}>
                        Open recurring-ready invoices
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="nb-surface mt-5 rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-repeat-ready">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="nb-kicker">Repeat-ready clients</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Clients closest to one-tap reuse</h2>
              </div>
              <StatusChip tone="soft">{repeatReadyClients.length} surfaced</StatusChip>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {repeatReadyClients.length > 0 ? (
                repeatReadyClients.map(({ entry, matchingServices, matchingInvoices, readinessScore }) => (
                  <button
                    key={entry.lookupKey}
                    type="button"
                    className="rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                    onClick={() => navigate(`/clients?client=${encodeURIComponent(entry.name)}`)}
                  >
                    <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.recipientEmail ? <StatusChip tone="soft">email</StatusChip> : null}
                      {entry.defaultNotes ? <StatusChip tone="soft">notes</StatusChip> : null}
                      {entry.recurringIntervalDays ? <StatusChip tone="soft">cadence</StatusChip> : null}
                      {matchingServices.length > 0 ? <StatusChip tone="success">services</StatusChip> : null}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {matchingInvoices.length} saved invoice{matchingInvoices.length === 1 ? "" : "s"} · readiness {readinessScore}/4
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                  <p className="text-sm font-semibold text-slate-900">No repeat-ready clients yet.</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    As client memory and saved services fill in, this will point out who is easiest to invoice again.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="nb-btn-primary" onClick={() => navigate("/clients")}>
                      Open client workspace
                    </button>
                    <button type="button" className="nb-btn-secondary" onClick={() => navigate("/settings/services")}>
                      Review saved services
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-estimates">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nb-kicker">Estimate watch</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Planning work that still needs a decision</h2>
                </div>
                <StatusChip tone="soft">{estimateInvoices.length} saved</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {estimateInvoices.length > 0 ? (
                  estimateInvoices.slice(0, 3).map((invoice) => {
                    const estimateSummary = buildEstimateWorkflowSummary(invoice);
                    return (
                      <div
                        key={invoice.invoiceId}
                        className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {invoice.invoiceNumber || "Saved estimate"} · {getInvoiceClientName(invoice) || "Client"}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {invoice.dueDate ? `Target ${invoice.dueDate}` : "No target date yet"} · {formatMoney(Number(invoice.total || invoice.invoiceData?.finishedInvoice?.total || 0))}
                            </p>
                          </div>
                          <StatusChip tone={estimateSummary.statusTone}>{estimateSummary.statusLabel.toLowerCase()}</StatusChip>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="nb-btn-primary"
                            onClick={() => void handleConvertEstimateToInvoice(invoice)}
                            disabled={estimateActionId === invoice.invoiceId}
                          >
                            {estimateActionId === invoice.invoiceId ? "Converting..." : "Convert to invoice"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={() =>
                              void handleSetEstimateReviewState(
                                invoice,
                                getEstimateReviewState(invoice) === "approved" ? "needs_review" : "approved"
                              )
                            }
                            disabled={estimateActionId === invoice.invoiceId}
                          >
                            {getEstimateReviewState(invoice) === "approved" ? "Mark needs review" : "Mark approved"}
                          </button>
                          <button
                            type="button"
                            className="nb-btn-secondary"
                            onClick={() =>
                              navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(invoice) || "")}`)
                            }
                          >
                            Open client workspace
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{estimateSummary.nextStepLabel}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No saved estimates yet.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Once quotes start landing, this lane will keep them from going stale.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="nb-btn-primary" onClick={() => navigate("/manual")}>
                        Start blank invoice
                      </button>
                      <button type="button" className="nb-btn-secondary" onClick={() => navigate("/ai-intake")}>
                        Start with Billie
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="nb-surface rounded-[26px] p-5 md:rounded-[30px] md:p-6 lg:p-7" data-testid="operator-dashboard-partials">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nb-kicker">Partial payments</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Balances that are close to closing</h2>
                </div>
                <StatusChip tone="soft">{partiallyPaidInvoices.length} open</StatusChip>
              </div>
              <div className="mt-4 space-y-3">
                {partiallyPaidInvoices.length > 0 ? (
                  partiallyPaidInvoices.slice(0, 3).map((invoice) => (
                    (() => {
                      const paymentRecords = getInvoicePaymentRecords(invoice);
                      const latestPaymentRecord = getInvoiceLatestPayment(invoice);
                      const partialPaymentCount = paymentRecords.length;
                      const total = Number(invoice?.total ?? invoice?.invoiceData?.finishedInvoice?.total ?? 0);
                      const balanceDue = getInvoiceOpenBalance(invoice);
                      const paymentProgressSummary = buildPaymentProgressSummary(total, balanceDue, paymentRecords, {
                        timelineLimit: 2
                      });
                      return (
                    <button
                      key={invoice.invoiceId}
                      type="button"
                      className="w-full rounded-[22px] border border-slate-100 bg-white/85 p-4 text-left transition hover:border-[#d5e5de] hover:bg-[#fbfcfa]"
                      onClick={() =>
                        navigate(`/clients?client=${encodeURIComponent(getInvoiceClientName(invoice) || "")}`)
                      }
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {invoice.invoiceNumber || "Saved invoice"} · {getInvoiceClientName(invoice) || "Client"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Remaining balance {formatMoney(paymentProgressSummary.balanceDue)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Progress {Math.round(paymentProgressSummary.progressPercent)}%
                            {paymentProgressSummary.balanceDue === 0
                              ? " complete"
                              : paymentProgressSummary.amountPaid > 0
                                ? " in progress"
                                : " awaiting payment"}
                          </p>
                          {latestPaymentRecord ? (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Latest payment {formatMoney(Number(latestPaymentRecord.amount ?? 0))}
                              {latestPaymentRecord.paidAt || latestPaymentRecord.recordedAt
                                ? ` · ${formatDateTime(latestPaymentRecord.paidAt ?? latestPaymentRecord.recordedAt)}`
                                : ""}
                              {latestPaymentRecord.note ? ` · ${latestPaymentRecord.note}` : ""}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {partialPaymentCount} payment record{partialPaymentCount === 1 ? "" : "s"} logged
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {paymentProgressSummary.nextStepLabel}
                          </p>
                        </div>
                        <StatusChip tone={paymentProgressSummary.statusTone}>partial</StatusChip>
                      </div>
                    </button>
                      );
                    })()
                  ))
                ) : (
                  <div className="rounded-[22px] border border-slate-100 bg-white/75 p-4">
                    <p className="text-sm font-semibold text-slate-900">No partial balances right now.</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      When a client pays part of an invoice, this lane will keep the remaining balance visible.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  window.InvoiceOperatorDashboardFeature = { OperatorDashboardPage };
})();
