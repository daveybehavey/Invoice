(() => {
  const { useNavigate } = ReactRouterDOM;
  const { useCallback, useEffect, useMemo, useState } = React;
  const requestIdentity = window.InvoiceRequestIdentity;
  const apiFetch = requestIdentity?.apiFetch ?? window.fetch.bind(window);
  const billieTelemetryUtils = window.InvoiceBillieTelemetry;

  function StatusPill({ label, value, tone = "slate" }) {
    const toneClasses =
      tone === "green"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : tone === "red"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-700";
    return (
      <div className={`rounded-2xl border px-3 py-3 shadow-sm ${toneClasses}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
        <p className="mt-1 text-sm font-semibold">{value}</p>
      </div>
    );
  }

  function buildPaidPlanReadiness(summary) {
    const ownerCount = Number(summary?.ownerCount ?? 0);
    const activatedOwners = Number(summary?.activatedOwners ?? 0);
    const secondInvoiceOwners = Number(summary?.secondInvoiceOwners ?? 0);
    const sentInvoiceOwners = Number(summary?.sentInvoiceOwners ?? 0);
    const reminderOwners = Number(summary?.reminderOwners ?? 0);
    const paymentLinkOwners = Number(summary?.paymentLinkOwners ?? 0);
    const checkoutOwners = Number(summary?.checkoutOwners ?? 0);

    const activationRate = ownerCount > 0 ? activatedOwners / ownerCount : 0;
    const repeatRate = activatedOwners > 0 ? secondInvoiceOwners / activatedOwners : 0;
    const reminderRate = sentInvoiceOwners > 0 ? reminderOwners / sentInvoiceOwners : 0;
    const paymentLinkRate = sentInvoiceOwners > 0 ? paymentLinkOwners / sentInvoiceOwners : 0;

    if (ownerCount < 10) {
      return {
        stage: "Collect baseline",
        tone: "amber",
        focus: "Activation",
        nextTest: "Keep collecting tester behavior and fix the biggest first-run friction.",
        recommendation:
          "Not enough usage yet for monetization calls. Keep collecting tester behavior and fix top friction first."
      };
    }
    if (activationRate < 0.55) {
      return {
        stage: "Activation focus",
        tone: "amber",
        focus: "First invoice",
        nextTest: "Make the first saved invoice easier to reach from launch and sample notes.",
        recommendation:
          "Delay paywall work. Improve first-run clarity until more users reach a first saved invoice."
      };
    }
    if (repeatRate < 0.35) {
      return {
        stage: "Retention focus",
        tone: "amber",
        focus: "Second invoice",
        nextTest: "Improve repeat-client and reopen flows before pricing experiments.",
        recommendation:
          "Focus on second-invoice behavior first. Improve repeat-client and reopen flows before pricing experiments."
      };
    }
    if (reminderRate < 0.3 || paymentLinkRate < 0.25) {
      return {
        stage: "Collections loop focus",
        tone: "green",
        focus: "Follow-up loop",
        nextTest: "Test whether reminders and payment links reduce follow-up work on real invoices.",
        recommendation:
          "Core creation/retention is healthy. Next value unlock is reminders and payment-link adoption."
      };
    }
    if (checkoutOwners < Math.max(3, Math.floor(ownerCount * 0.05))) {
      return {
        stage: "Soft paywall ready",
        tone: "green",
        focus: "Paid moment",
        nextTest: "Run a small paid-plan prompt test at a value moment after second saved invoice or follow-up use.",
        recommendation:
          "Run a small paid-plan prompt test at a value moment (after second saved invoice or active follow-up usage)."
      };
    }
    return {
      stage: "Monetization signal live",
      tone: "green",
      focus: "Paid boundary",
      nextTest: "Continue fair paid-boundary tests and watch whether conversion quality stays healthy.",
      recommendation:
        "Users are showing paid intent. Continue fair paid-boundary tests and monitor conversion quality."
    };
  }

  function buildFeatureAdoptionFocus(summary) {
    const scratchpadOwners = Number(summary?.scratchpadOwners ?? 0);
    const serviceMemorySavedOwners = Number(summary?.serviceMemorySavedOwners ?? 0);
    const billieWorkspaceOwners = Number(summary?.billieWorkspaceOwners ?? 0);
    const scratchpadVoiceOwners = Number(summary?.scratchpadVoiceOwners ?? 0);

    if (scratchpadOwners === 0) {
      return {
        stage: "Grow capture",
        tone: "amber",
        focus: "Scratchpad",
        nextTest: "Make quick capture the default first move for new users.",
        recommendation:
          "Push the scratchpad harder before layering on more automation. Fast note capture is the cleanest on-ramp."
      };
    }
    if (serviceMemorySavedOwners === 0) {
      return {
        stage: "Grow reuse",
        tone: "amber",
        focus: "Service memory",
        nextTest: "Have users save one service from the draft after completing their first invoice.",
        recommendation:
          "The next multiplier is repeatable services. Save a line item once, then reuse it on the next job."
      };
    }
    if (billieWorkspaceOwners === 0) {
      return {
        stage: "Grow polish",
        tone: "green",
        focus: "Billie workspace",
        nextTest: "Ask Billie to refine wording on one invoice and measure whether users come back to it.",
        recommendation:
          "Wording polish is the easiest high-trust assistant step. It should feel helpful without changing totals."
      };
    }
    return {
      stage: "Feature loop live",
      tone: "green",
      focus: "Automation",
      nextTest: "Layer in more follow-up automation and watch whether users save time on repeat work.",
      recommendation:
        `Core future features are getting used. Scratchpad, service memory, and Billie all have signals${scratchpadVoiceOwners > 0 ? " including voice capture." : "."}`
    };
  }

  function IntakeDiagnostics() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [ocrSnapshot, setOcrSnapshot] = useState(null);
    const [frictionSnapshot, setFrictionSnapshot] = useState(null);
    const [trendSnapshot, setTrendSnapshot] = useState(null);
    const [revenueSnapshot, setRevenueSnapshot] = useState(null);
    const [systemInfo, setSystemInfo] = useState(null);
    const [migrationInfo, setMigrationInfo] = useState(null);
    const [billingInfo, setBillingInfo] = useState(null);
    const [deliveryInfo, setDeliveryInfo] = useState(null);
    const [launchInfo, setLaunchInfo] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState(null);
    const [reminderActionBusy, setReminderActionBusy] = useState(false);
    const [reminderActionResult, setReminderActionResult] = useState(null);
    const [launchEmailBusy, setLaunchEmailBusy] = useState(false);
    const [launchEmailResult, setLaunchEmailResult] = useState(null);

    const loadDiagnostics = useCallback(async ({ silent = false } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const [
          ocrResponse,
          frictionResponse,
          trendResponse,
          revenueResponse,
          systemResponse,
          migrationResponse,
          billingResponse,
          deliveryResponse,
          launchResponse
        ] =
          await Promise.all([
          apiFetch("/api/telemetry/ocr-confidence"),
          apiFetch("/api/telemetry/flow-friction"),
          apiFetch("/api/telemetry/intake-trends"),
          apiFetch("/api/telemetry/revenue-signals"),
          apiFetch("/api/system/persistence"),
          apiFetch("/api/system/persistence/migration"),
          apiFetch("/api/system/billing"),
          apiFetch("/api/system/delivery"),
          apiFetch("/api/system/launch")
        ]);
        const [
          ocrPayload,
          frictionPayload,
          trendPayload,
          revenuePayload,
          systemPayload,
          migrationPayload,
          billingPayload,
          deliveryPayload,
          launchPayload
        ] =
          await Promise.all([
          ocrResponse.json(),
          frictionResponse.json(),
          trendResponse.json(),
          revenueResponse.json(),
          systemResponse.json(),
          migrationResponse.json(),
          billingResponse.json(),
          deliveryResponse.json(),
          launchResponse.json()
        ]);
        if (!ocrResponse.ok) {
          throw new Error(ocrPayload?.error || "Failed to load OCR telemetry.");
        }
        if (!frictionResponse.ok) {
          throw new Error(frictionPayload?.error || "Failed to load friction telemetry.");
        }
        if (!trendResponse.ok) {
          throw new Error(trendPayload?.error || "Failed to load intake trends.");
        }
        if (!revenueResponse.ok) {
          throw new Error(revenuePayload?.error || "Failed to load revenue signals.");
        }
        if (!systemResponse.ok) {
          throw new Error(systemPayload?.error || "Failed to load system persistence info.");
        }
        if (!migrationResponse.ok) {
          throw new Error(migrationPayload?.error || "Failed to load persistence migration info.");
        }
        if (!billingResponse.ok) {
          throw new Error(billingPayload?.error || "Failed to load billing diagnostics.");
        }
        if (!deliveryResponse.ok) {
          throw new Error(deliveryPayload?.error || "Failed to load delivery diagnostics.");
        }
        if (!launchResponse.ok) {
          throw new Error(launchPayload?.error || "Failed to load launch diagnostics.");
        }
        setOcrSnapshot(ocrPayload);
        setFrictionSnapshot(frictionPayload);
        setTrendSnapshot(trendPayload);
        setRevenueSnapshot(revenuePayload);
        setSystemInfo(systemPayload);
        setMigrationInfo(migrationPayload);
        setBillingInfo(billingPayload);
        setDeliveryInfo(deliveryPayload);
        setLaunchInfo(launchPayload);
      } catch (loadError) {
        console.error("Failed to load intake diagnostics", loadError);
        setError(loadError?.message || "Failed to load diagnostics.");
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }, []);

    useEffect(() => {
      void loadDiagnostics();
    }, [loadDiagnostics]);

    const reasonRows = useMemo(() => {
      const byReason = ocrSnapshot?.byReason;
      if (!byReason || typeof byReason !== "object") {
        return [];
      }
      return Object.entries(byReason)
        .sort((left, right) => Number(right[1]) - Number(left[1]))
        .slice(0, 8);
    }, [ocrSnapshot]);

    const handleExportNow = async () => {
      setExporting(true);
      setExportResult(null);
      try {
        const response = await apiFetch("/api/telemetry/ocr-confidence/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to export OCR snapshot.");
        }
        setExportResult(payload);
        await loadDiagnostics({ silent: true });
      } catch (exportError) {
        console.error("Failed to export OCR telemetry", exportError);
        setExportResult({
          exported: false,
          reason: "export_failed",
          error: exportError?.message || "Failed to export OCR snapshot."
        });
      } finally {
        setExporting(false);
      }
    };

    const handlePreviewReminders = async () => {
      setReminderActionBusy(true);
      setReminderActionResult(null);
      try {
        const response = await apiFetch("/api/invoices/reminders/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun: true })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to preview due reminders.");
        }
        setReminderActionResult({
          mode: "preview",
          dueCount: Number(payload?.dueCount ?? 0),
          scannedCount: Number(payload?.scannedCount ?? 0),
          sentCount: 0,
          skippedCount: 0
        });
      } catch (reminderError) {
        console.error("Failed to preview reminders", reminderError);
        setReminderActionResult({
          mode: "preview",
          error: reminderError?.message || "Failed to preview due reminders."
        });
      } finally {
        setReminderActionBusy(false);
      }
    };

    const handleRunRemindersNow = async () => {
      setReminderActionBusy(true);
      setReminderActionResult(null);
      try {
        const response = await apiFetch("/api/invoices/reminders/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to run reminders.");
        }
        setReminderActionResult({
          mode: "run",
          dueCount: Number(payload?.dueCount ?? 0),
          scannedCount: Number(payload?.scannedCount ?? 0),
          sentCount: Number(payload?.sentCount ?? 0),
          skippedCount: Number(payload?.skippedCount ?? 0)
        });
        await loadDiagnostics({ silent: true });
      } catch (reminderError) {
        console.error("Failed to run reminders", reminderError);
        setReminderActionResult({
          mode: "run",
          error: reminderError?.message || "Failed to run reminders."
        });
      } finally {
        setReminderActionBusy(false);
      }
    };

    const handleSendLaunchTestEmail = async () => {
      setLaunchEmailBusy(true);
      setLaunchEmailResult(null);
      try {
        const response = await apiFetch("/api/system/delivery/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to send launch test email.");
        }
        setLaunchEmailResult({
          ok: true,
          recipientEmail: payload?.recipientEmail || "configured recipient",
          mode: payload?.mode || "provider",
          warning: payload?.warning || ""
        });
        await loadDiagnostics({ silent: true });
      } catch (launchEmailError) {
        console.error("Failed to send launch test email", launchEmailError);
        setLaunchEmailResult({
          ok: false,
          error: launchEmailError?.message || "Failed to send launch test email."
        });
      } finally {
        setLaunchEmailBusy(false);
      }
    };

    const ocrTotals = {
      total: Number(ocrSnapshot?.totalEvents ?? 0),
      high: Number(ocrSnapshot?.byConfidence?.high ?? 0),
      medium: Number(ocrSnapshot?.byConfidence?.medium ?? 0),
      low: Number(ocrSnapshot?.byConfidence?.low ?? 0)
    };

    const frictionSummary = frictionSnapshot?.summary ?? {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      issueCount: 0
    };

    const trend24h = trendSnapshot?.ocr?.last24h ?? { total: 0, low: 0, lowRate: 0 };
    const trend7d = trendSnapshot?.ocr?.last7d ?? { total: 0, low: 0, lowRate: 0 };
    const frictionTrend24h = trendSnapshot?.friction?.last24h ?? {
      runs: 0,
      totalChecks: 0,
      failedChecks: 0,
      failedRate: 0,
      issueRuns: 0
    };
    const frictionTrend7d = trendSnapshot?.friction?.last7d ?? {
      runs: 0,
      totalChecks: 0,
      failedChecks: 0,
      failedRate: 0,
      issueRuns: 0
    };
    const revenueSummary = revenueSnapshot?.summary ?? {
      ownerCount: 0,
      activatedOwners: 0,
      secondInvoiceOwners: 0,
      sentInvoiceOwners: 0,
      reminderOwners: 0,
      paymentLinkOwners: 0,
      repeatInvoiceOwners: 0,
      serviceMemoryOwners: 0,
      clientMemoryOwners: 0,
      recurringScheduleOwners: 0,
      checkoutOwners: 0,
      serviceMemorySavedOwners: 0,
      scratchpadOwners: 0,
      scratchpadVoiceOwners: 0,
      scratchpadInvoiceOwners: 0,
      billieWorkspaceOwners: 0
    };
    const revenueEventRows = Object.entries(revenueSnapshot?.byEvent ?? {}).sort(
      (left, right) => Number(right[1]) - Number(left[1])
    );
    const revenueActivationRate =
      revenueSummary.ownerCount > 0
        ? `${((revenueSummary.activatedOwners / revenueSummary.ownerCount) * 100).toFixed(0)}%`
        : "0%";
    const paidPlanReadiness = buildPaidPlanReadiness(revenueSummary);
    const featureAdoptionFocus = buildFeatureAdoptionFocus(revenueSummary);
    const persistenceReady = Boolean(systemInfo?.productionReady);
    const billingReady = Boolean(
      billingInfo?.capabilities?.checkoutAvailable &&
        billingInfo?.capabilities?.portalAvailable &&
        billingInfo?.capabilities?.webhookAvailable &&
        !billingInfo?.warning
    );
    const deliveryReady = Boolean(deliveryInfo?.capabilities?.configured && !deliveryInfo?.warning);
    const launchReady = Boolean(launchInfo?.ready);
    const migrationBacklog = Boolean(migrationInfo?.migrationStatus?.backlogDetected);
    const ocrLowRatePct = `${(trend24h.lowRate * 100).toFixed(1)}%`;
    const frictionFailedRatePct = `${(frictionTrend24h.failedRate * 100).toFixed(1)}%`;
    const intakeRefineSummary = billieTelemetryUtils?.getRefineSummary("intake") ?? null;
    const manualRefineSummary = billieTelemetryUtils?.getRefineSummary("manual") ?? null;
    const formatLatency = (value) =>
      billieTelemetryUtils?.formatDuration?.(value) ||
      (Number.isFinite(value) ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s` : "n/a");

    return (
      <div className="nb-page nb-page--quiet min-h-screen">
        <main className="nb-page-shell nb-page-shell--medium max-w-5xl py-8 md:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-3 py-1.5"
              onClick={() => navigate("/")}
            >
              Back
            </button>
            <button
              type="button"
              className="nb-btn-secondary rounded-full px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void loadDiagnostics({ silent: true })}
              disabled={refreshing || loading}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="nb-surface mt-4 rounded-[28px] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Internal diagnostics
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Intake telemetry</h1>
            <p className="mt-2 text-sm text-slate-600">
              Internal-only view of OCR confidence and friction checks for messy-input flow quality.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Invoice storage backend: {systemInfo?.invoiceStoreBackend || "n/a"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Config mode: {systemInfo?.configuredMode || "n/a"}
              {" · "}
              Postgres URL: {systemInfo?.postgresUrlConfigured ? "set" : "not set"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Node env: {systemInfo?.nodeEnv || "n/a"}
              {" · "}
              Postgres required: {systemInfo?.postgresRequired ? "yes" : "no"}
              {" · "}
              Ready: {systemInfo?.productionReady ? "yes" : "no"}
              {" · "}
              Auth required: {systemInfo?.authRequired ? "yes" : "no"}
            </p>
            {systemInfo?.warning ? (
              <p className="mt-1 text-xs text-amber-700">{systemInfo.warning}</p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              Default owner: {systemInfo?.defaultOwnerId || "n/a"}
            </p>
          </div>

          <section className="nb-surface mt-4 rounded-[28px] p-5">
            <h2 className="text-lg font-semibold text-slate-900">System health snapshot</h2>
            <p className="mt-1 text-xs text-slate-500">
              Quick view of rollout readiness and intake quality signals.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatusPill
                label="Persistence readiness"
                value={persistenceReady ? "Ready" : "Needs attention"}
                tone={persistenceReady ? "green" : "amber"}
              />
              <StatusPill
                label="Billing readiness"
                value={billingReady ? "Ready" : "Needs setup"}
                tone={billingReady ? "green" : "amber"}
              />
              <StatusPill
                label="Delivery readiness"
                value={deliveryReady ? "Ready" : "Tracking only"}
                tone={deliveryReady ? "green" : "amber"}
              />
              <StatusPill
                label="Launch gate"
                value={launchReady ? "Ready" : `${launchInfo?.warningCount ?? 0} warning${launchInfo?.warningCount === 1 ? "" : "s"}`}
                tone={launchReady ? "green" : "amber"}
              />
              <StatusPill
                label="OCR low-confidence (24h)"
                value={ocrLowRatePct}
                tone={trend24h.lowRate <= 0.2 ? "green" : trend24h.lowRate <= 0.35 ? "amber" : "red"}
              />
              <StatusPill
                label="Friction failed rate (24h)"
                value={frictionFailedRatePct}
                tone={
                  frictionTrend24h.failedRate <= 0.1
                    ? "green"
                    : frictionTrend24h.failedRate <= 0.25
                      ? "amber"
                      : "red"
                }
              />
            </div>
            {migrationBacklog ? (
              <p className="mt-2 text-xs text-amber-700">
                Legacy migration backlog detected. Complete migration before strict production cutover.
              </p>
            ) : null}
          </section>

          <section className="nb-surface mt-4 rounded-[28px] p-5">
            <h2 className="text-lg font-semibold text-slate-900">Revenue signals</h2>
            <p className="mt-1 text-xs text-slate-500">
              Privacy-conscious activation and retention counters. No invoice text, customer names, or emails are stored here.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatusPill label="Signal owners" value={String(revenueSummary.ownerCount)} />
              <StatusPill label="Activation rate" value={revenueActivationRate} tone="green" />
              <StatusPill label="Second invoice owners" value={String(revenueSummary.secondInvoiceOwners)} />
              <StatusPill label="Repeat invoice owners" value={String(revenueSummary.repeatInvoiceOwners)} />
              <StatusPill label="Sent invoice owners" value={String(revenueSummary.sentInvoiceOwners)} />
              <StatusPill label="Reminder owners" value={String(revenueSummary.reminderOwners)} />
              <StatusPill label="Payment link owners" value={String(revenueSummary.paymentLinkOwners)} />
              <StatusPill label="Service memory owners" value={String(revenueSummary.serviceMemoryOwners)} />
              <StatusPill label="Saved services" value={String(revenueSummary.serviceMemorySavedOwners)} />
              <StatusPill label="Client memory owners" value={String(revenueSummary.clientMemoryOwners)} />
              <StatusPill label="Recurring owners" value={String(revenueSummary.recurringScheduleOwners)} />
              <StatusPill label="Checkout starts" value={String(revenueSummary.checkoutOwners)} />
              <StatusPill label="Scratchpad saves" value={String(revenueSummary.scratchpadOwners)} />
              <StatusPill label="Voice captures" value={String(revenueSummary.scratchpadVoiceOwners)} />
              <StatusPill label="Scratchpad invoices" value={String(revenueSummary.scratchpadInvoiceOwners)} />
              <StatusPill label="Billie workspace" value={String(revenueSummary.billieWorkspaceOwners)} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Total events: {revenueSnapshot?.totalEvents ?? 0}
              {" | "}
              Updated: {revenueSnapshot?.updatedAt || "n/a"}
            </p>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Paid-plan readiness
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    paidPlanReadiness.tone === "green"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {paidPlanReadiness.stage}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Focus</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{paidPlanReadiness.focus}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next test</p>
                  <p className="mt-1 text-sm text-slate-700">{paidPlanReadiness.nextTest}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">{paidPlanReadiness.recommendation}</p>
            </div>
            {revenueEventRows.length > 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Event counts
                </div>
                <div className="divide-y divide-slate-100">
                  {revenueEventRows.map(([eventName, count]) => (
                    <div key={eventName} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">{eventName}</span>
                      <span className="text-slate-500">{String(count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                No revenue signals yet. They will appear after users build, save, send, follow up, start repeat invoices, use the scratchpad, save services, or refine with Billie.
              </p>
            )}
          </section>

          <section className="nb-surface mt-4 rounded-[28px] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Feature adoption</h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  featureAdoptionFocus.tone === "green"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {featureAdoptionFocus.stage}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This helps us see which future bets are actually getting used, not just shipped.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatusPill label="Scratchpad owners" value={String(revenueSummary.scratchpadOwners)} />
              <StatusPill label="Voice owners" value={String(revenueSummary.scratchpadVoiceOwners)} />
              <StatusPill label="Service savers" value={String(revenueSummary.serviceMemorySavedOwners)} />
              <StatusPill label="Billie owners" value={String(revenueSummary.billieWorkspaceOwners)} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Focus</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{featureAdoptionFocus.focus}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next test</p>
                <p className="mt-1 text-sm text-slate-700">{featureAdoptionFocus.nextTest}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-700">{featureAdoptionFocus.recommendation}</p>
          </section>

          <section className="nb-surface mt-4 rounded-[28px] p-5">
            <h2 className="text-lg font-semibold text-slate-900">Billie refine latency</h2>
            <p className="mt-1 text-xs text-slate-500">
              Client-captured timing for wording refine actions. Target: p50 under 2s, p95 under 5s.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intake Billie</p>
                <p className="mt-1 text-sm text-slate-700">
                  Last: <span className="font-semibold">{formatLatency(intakeRefineSummary?.lastMs)}</span>
                </p>
                <p className="text-sm text-slate-700">
                  p50: <span className="font-semibold">{formatLatency(intakeRefineSummary?.p50Ms)}</span>
                </p>
                <p className="text-sm text-slate-700">
                  p95: <span className="font-semibold">{formatLatency(intakeRefineSummary?.p95Ms)}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Samples: {intakeRefineSummary?.count ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manual Billie</p>
                <p className="mt-1 text-sm text-slate-700">
                  Last: <span className="font-semibold">{formatLatency(manualRefineSummary?.lastMs)}</span>
                </p>
                <p className="text-sm text-slate-700">
                  p50: <span className="font-semibold">{formatLatency(manualRefineSummary?.p50Ms)}</span>
                </p>
                <p className="text-sm text-slate-700">
                  p95: <span className="font-semibold">{formatLatency(manualRefineSummary?.p95Ms)}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Samples: {manualRefineSummary?.count ?? 0}</p>
              </div>
            </div>
          </section>

          <div className="nb-surface mt-4 rounded-[28px] p-5">
            <h2 className="text-lg font-semibold text-slate-900">Launch readiness</h2>
            <p className="mt-2 text-xs text-slate-500">
              Public base URL: {launchInfo?.publicBaseUrl || "n/a"}
              {" · "}
              Warnings: {launchInfo?.warningCount ?? 0}
            </p>
            <div className="mt-3 space-y-2">
              {(launchInfo?.checks ?? []).map((check) => (
                <div
                  key={check.id}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    check.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <p className="font-semibold uppercase tracking-wide">{check.id}</p>
                  <p className="mt-1">{check.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleSendLaunchTestEmail}
                disabled={loading || refreshing || launchEmailBusy || !deliveryInfo?.capabilities?.configured}
              >
                {launchEmailBusy ? "Sending..." : "Send launch test email"}
              </button>
            </div>
            {launchEmailResult ? (
              <p className={`mt-2 text-xs ${launchEmailResult.ok ? "text-emerald-700" : "text-rose-700"}`}>
                {launchEmailResult.ok
                  ? `Launch test email sent to ${launchEmailResult.recipientEmail} (${launchEmailResult.mode}).`
                  : launchEmailResult.error}
              </p>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Persistence migration</h2>
            <p className="mt-2 text-xs text-slate-500">
              Legacy file invoices: {migrationInfo?.fileStore?.invoiceCount ?? "n/a"}
              {" · "}
              owners: {migrationInfo?.fileStore?.ownerCount ?? "n/a"}
              {" · "}
              deleted: {migrationInfo?.fileStore?.deletedCount ?? "n/a"}
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">
              File path: {migrationInfo?.fileStore?.filePath || "n/a"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Dry-run command: {migrationInfo?.migrationCommand || "n/a"}
            </p>
            {migrationInfo?.migrationStatus?.message ? (
              <p
                className={`mt-2 text-xs ${
                  migrationInfo?.migrationStatus?.severity === "warn"
                    ? "text-amber-700"
                    : migrationInfo?.migrationStatus?.severity === "info"
                      ? "text-slate-700"
                      : "text-slate-500"
                }`}
              >
                {migrationInfo.migrationStatus.message}
              </p>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Billing diagnostics</h2>
            <p className="mt-2 text-xs text-slate-500">
              Provider: {billingInfo?.provider || "n/a"}
              {" · "}
              Checkout: {billingInfo?.capabilities?.checkoutAvailable ? "ready" : "not ready"}
              {" · "}
              Portal: {billingInfo?.capabilities?.portalAvailable ? "ready" : "not ready"}
              {" · "}
              Webhook: {billingInfo?.capabilities?.webhookAvailable ? "ready" : "not ready"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Secret key mode: {billingInfo?.capabilities?.secretKeyMode || "n/a"}
              {" · "}
              Publishable key mode: {billingInfo?.capabilities?.publishableKeyMode || "n/a"}
              {" · "}
              Launch requires live mode: {billingInfo?.launchPolicy?.requireLiveMode ? "yes" : "no"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Entitlements: {billingInfo?.entitlements?.activeSubscriptionCount ?? 0} active /{" "}
              {billingInfo?.entitlements?.subscriptionCount ?? 0} subscriptions
              {" · "}
              Customers: {billingInfo?.entitlements?.customerCount ?? 0}
              {" · "}
              Missing identity: {billingInfo?.entitlements?.missingIdentityCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Last entitlement update: {billingInfo?.entitlements?.updatedAt || "n/a"}
            </p>
            {billingInfo?.warning ? (
              <p className="mt-2 text-xs text-amber-700">{billingInfo.warning}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Delivery diagnostics</h2>
            <p className="mt-2 text-xs text-slate-500">
              Provider: {deliveryInfo?.provider || "n/a"}
              {" · "}
              Configured: {deliveryInfo?.capabilities?.configured ? "yes" : "no"}
              {" · "}
              From: {deliveryInfo?.capabilities?.fromEmail || "n/a"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              From domain: {deliveryInfo?.capabilities?.fromDomain || "n/a"}
              {" · "}
              Launch test recipient: {deliveryInfo?.capabilities?.launchTestRecipientConfigured ? "set" : "not set"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Domain verification: {deliveryInfo?.verification?.checked
                ? deliveryInfo?.verification?.ready
                  ? "verified"
                  : deliveryInfo?.verification?.domainStatus || "not ready"
                : "not checked"}
              {" · "}
              Sending capability: {deliveryInfo?.verification?.sendingCapability || "n/a"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sent count: {deliveryInfo?.summary?.sentCount ?? 0}
              {" · "}
              Opened count: {deliveryInfo?.summary?.openedCount ?? 0}
              {" · "}
              Provider sends: {deliveryInfo?.summary?.providerSendCount ?? 0}
              {" · "}
              Tracking-only sends: {deliveryInfo?.summary?.recordOnlyCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Last sent: {deliveryInfo?.summary?.lastSentAt || "n/a"}
              {" · "}
              Last opened: {deliveryInfo?.summary?.lastOpenedAt || "n/a"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Reminder due now: {deliveryInfo?.reminders?.dueCount ?? 0}
              {" · "}
              Reminder scanned sent invoices: {deliveryInfo?.reminders?.scannedCount ?? 0}
              {" · "}
              Owner: {deliveryInfo?.reminders?.ownerId || "n/a"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handlePreviewReminders}
                disabled={loading || refreshing || reminderActionBusy}
              >
                {reminderActionBusy ? "Working..." : "Preview due reminders"}
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleRunRemindersNow}
                disabled={loading || refreshing || reminderActionBusy}
              >
                {reminderActionBusy ? "Working..." : "Run reminders now"}
              </button>
            </div>
            {reminderActionResult ? (
              <p className={`mt-2 text-xs ${reminderActionResult?.error ? "text-rose-700" : "text-slate-600"}`}>
                {reminderActionResult?.error
                  ? reminderActionResult.error
                  : reminderActionResult.mode === "preview"
                    ? `Preview: ${reminderActionResult.dueCount} due from ${reminderActionResult.scannedCount} sent invoices.`
                    : `Run complete: ${reminderActionResult.sentCount} sent, ${reminderActionResult.skippedCount} failed/skipped, ${reminderActionResult.dueCount} due.`}
              </p>
            ) : null}
            {deliveryInfo?.warning ? (
              <p className="mt-2 text-xs text-amber-700">{deliveryInfo.warning}</p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">OCR confidence</h2>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleExportNow}
                disabled={loading || exporting}
              >
                {exporting ? "Exporting..." : "Export snapshot"}
              </button>
            </div>

            {loading ? (
              <p className="mt-3 text-sm text-slate-600">Loading telemetry...</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <StatusPill label="Total events" value={String(ocrTotals.total)} />
                  <StatusPill label="High" value={String(ocrTotals.high)} tone="green" />
                  <StatusPill label="Medium" value={String(ocrTotals.medium)} tone="amber" />
                  <StatusPill label="Low" value={String(ocrTotals.low)} tone="red" />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Last updated: {ocrSnapshot?.updatedAt || "n/a"}
                </p>

                {reasonRows.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-slate-200">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Top confidence reasons
                    </div>
                    <div className="divide-y divide-slate-100">
                      {reasonRows.map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="font-medium text-slate-700">{reason}</span>
                          <span className="text-slate-500">{String(count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Export state: {ocrSnapshot?.exportState?.lastResult ?? "never"} | Last success:{" "}
                  {ocrSnapshot?.exportState?.lastSuccessAt || "n/a"}
                </div>
              </>
            )}

            {exportResult ? (
              <div
                className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                  exportResult.exported
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                Export result: {exportResult.reason}
                {exportResult.provider ? ` (${exportResult.provider})` : ""}
                {exportResult.error ? ` — ${exportResult.error}` : ""}
              </div>
            ) : null}
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Trend baseline</h2>
            {loading ? (
              <p className="mt-3 text-sm text-slate-600">Loading trends...</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      OCR low confidence rate
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      24h: <span className="font-semibold">{(trend24h.lowRate * 100).toFixed(1)}%</span>{" "}
                      ({trend24h.low}/{trend24h.total})
                    </p>
                    <p className="text-sm text-slate-700">
                      7d: <span className="font-semibold">{(trend7d.lowRate * 100).toFixed(1)}%</span>{" "}
                      ({trend7d.low}/{trend7d.total})
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Friction failed-check rate
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      24h:{" "}
                      <span className="font-semibold">
                        {(frictionTrend24h.failedRate * 100).toFixed(1)}%
                      </span>{" "}
                      ({frictionTrend24h.failedChecks}/{frictionTrend24h.totalChecks}) across{" "}
                      {frictionTrend24h.runs} runs
                    </p>
                    <p className="text-sm text-slate-700">
                      7d:{" "}
                      <span className="font-semibold">
                        {(frictionTrend7d.failedRate * 100).toFixed(1)}%
                      </span>{" "}
                      ({frictionTrend7d.failedChecks}/{frictionTrend7d.totalChecks}) across{" "}
                      {frictionTrend7d.runs} runs
                    </p>
                  </div>
                </div>
                {!trendSnapshot?.friction?.historyAvailable ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Friction history is empty. Run <code>npm run test:friction</code> regularly to build trend
                    baseline.
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Flow friction checks</h2>
            {loading ? (
              <p className="mt-3 text-sm text-slate-600">Loading checks...</p>
            ) : frictionSnapshot?.available ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <StatusPill label="Total checks" value={String(frictionSummary.totalChecks)} />
                  <StatusPill label="Passed" value={String(frictionSummary.passedChecks)} tone="green" />
                  <StatusPill label="Failed" value={String(frictionSummary.failedChecks)} tone="red" />
                  <StatusPill label="Issues" value={String(frictionSummary.issueCount)} tone="amber" />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Snapshot timestamp: {frictionSnapshot?.timestamp || "n/a"}
                </p>
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Check</th>
                        <th className="px-3 py-2">Result</th>
                        <th className="px-3 py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {(frictionSnapshot?.checks ?? []).map((check) => (
                        <tr key={check.name}>
                          <td className="px-3 py-2 font-medium">{check.name}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                check.pass
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {check.pass ? "Pass" : "Fail"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{check.details || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {Array.isArray(frictionSnapshot?.issues) && frictionSnapshot.issues.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Issues</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
                      {frictionSnapshot.issues.map((issue, index) => {
                        const severity =
                          issue && typeof issue === "object" && typeof issue.severity === "string"
                            ? issue.severity.trim()
                            : "";
                        const message =
                          typeof issue === "string"
                            ? issue
                            : issue && typeof issue === "object" && typeof issue.message === "string"
                              ? issue.message
                              : "";
                        const details =
                          issue && typeof issue === "object" && typeof issue.details === "string"
                            ? issue.details.trim()
                            : "";
                        const label = severity ? `[${severity}] ${message}` : message;
                        return (
                          <li key={`${label || "issue"}-${index}`}>
                            {label}
                            {details ? ` (${details})` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No friction snapshot found yet. Run <code>npm run test:friction</code> to generate a
                fresh diagnostics snapshot.
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  window.InvoiceDiagnosticsFeature = {
    IntakeDiagnostics
  };
})();
