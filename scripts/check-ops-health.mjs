import process from "node:process";

const timeoutMs = 12_000;
const baseUrl = (process.env.OPS_CHECK_BASE_URL ?? process.env.LAUNCH_CHECK_BASE_URL ?? "http://localhost:3000").trim();
const minOpenRate = parseNumberFlag("--min-open-rate=", 0.2);
const warningDueThreshold = parseIntegerFlag("--warning-due=", 10);
const criticalDueThreshold = parseIntegerFlag("--critical-due=", 25);
const shouldAssert = process.argv.includes("--assert");

function parseNumberFlag(prefix, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return fallback;
  }
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

function parseIntegerFlag(prefix, fallback) {
  const value = Math.round(parseNumberFlag(prefix, fallback));
  return Number.isFinite(value) ? value : fallback;
}

async function fetchJson(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildAlerts({ launch, billing, delivery, upgradeFunnel }) {
  const alerts = [];
  const pushAlert = (severity, key, message) => {
    alerts.push({ severity, key, message });
  };

  if (!launch.ok || !launch.payload?.ready) {
    pushAlert("critical", "launch", "Launch readiness is not green.");
  }
  if (!billing.ok) {
    pushAlert("critical", "billing_api", `Billing diagnostics endpoint failed (status ${billing.status}).`);
  } else {
    const capabilities = billing.payload?.capabilities ?? {};
    if (!capabilities.checkoutAvailable || !capabilities.webhookAvailable) {
      pushAlert("critical", "billing_capability", "Stripe checkout/webhook capability is incomplete.");
    }
    if (billing.payload?.launchPolicy?.requireLiveMode && !capabilities.liveMode) {
      pushAlert("critical", "billing_live_mode", "Launch policy requires live Stripe keys, but diagnostics report non-live mode.");
    }
    if ((billing.payload?.entitlements?.missingIdentityCount ?? 0) > 0) {
      pushAlert("warning", "billing_identity", "Some Stripe entitlements are missing account identity links.");
    }
  }

  if (!delivery.ok) {
    pushAlert("critical", "delivery_api", `Delivery diagnostics endpoint failed (status ${delivery.status}).`);
  } else {
    const configured = Boolean(delivery.payload?.capabilities?.configured);
    const verified = Boolean(delivery.payload?.verification?.ready);
    if (!configured || !verified) {
      pushAlert("critical", "delivery_config", "Email delivery is not fully configured/verified.");
    }

    const summary = delivery.payload?.summary ?? {};
    const sentCount = Number(summary.sentCount ?? 0);
    const openedCount = Number(summary.openedCount ?? 0);
    const openRate = sentCount > 0 ? openedCount / sentCount : null;
    if (openRate !== null && sentCount >= 20 && openRate < minOpenRate) {
      pushAlert(
        "warning",
        "delivery_open_rate",
        `Delivery open rate is low (${(openRate * 100).toFixed(1)}% across ${sentCount} sends).`
      );
    }

    const dueCount = Number(delivery.payload?.reminders?.dueCount ?? 0);
    if (dueCount >= criticalDueThreshold) {
      pushAlert("critical", "reminders_backlog", `Reminder backlog is high (${dueCount} currently due).`);
    } else if (dueCount >= warningDueThreshold) {
      pushAlert("warning", "reminders_backlog", `Reminder backlog warning (${dueCount} currently due).`);
    }
  }

  if (!upgradeFunnel.ok) {
    pushAlert("warning", "upgrade_funnel_api", `Upgrade funnel endpoint failed (status ${upgradeFunnel.status}).`);
  } else {
    const last24h = upgradeFunnel.payload?.windows?.last24h ?? {};
    const totalViews = Number(last24h?.totalViews ?? 0);
    const clickRate = Number(last24h?.clickRateFromViews ?? 0);
    if (totalViews >= 20 && clickRate < 0.06) {
      pushAlert(
        "warning",
        "upgrade_click_rate",
        `Upgrade click-through is low (${(clickRate * 100).toFixed(1)}% across ${totalViews} warning/limit views).`
      );
    }
    const recommendations = Array.isArray(upgradeFunnel.payload?.recommendations)
      ? upgradeFunnel.payload.recommendations
      : [];
    if (recommendations.some((item) => item?.severity === "warning")) {
      pushAlert("warning", "upgrade_funnel_recommendation", "Upgrade funnel has warning recommendations.");
    }
  }

  return alerts;
}

function applyThresholdOverrides(input) {
  const alerts = [];
  const pushAlert = (severity, key, message) => {
    alerts.push({ severity, key, message });
  };
  const sentCount = Number(input.metrics?.deliverySentCount ?? 0);
  const openedCount = Number(input.metrics?.deliveryOpenedCount ?? 0);
  const dueCount = Number(input.metrics?.remindersDueCount ?? 0);
  const openRate = sentCount > 0 ? openedCount / sentCount : null;
  if (openRate !== null && sentCount >= 20 && openRate < minOpenRate) {
    pushAlert(
      "warning",
      "delivery_open_rate_override",
      `Delivery open rate is below override threshold (${(openRate * 100).toFixed(1)}% < ${(minOpenRate * 100).toFixed(1)}%).`
    );
  }
  if (dueCount >= criticalDueThreshold) {
    pushAlert(
      "critical",
      "reminders_backlog_override",
      `Reminder backlog exceeds override critical threshold (${dueCount} >= ${criticalDueThreshold}).`
    );
  } else if (dueCount >= warningDueThreshold) {
    pushAlert(
      "warning",
      "reminders_backlog_override",
      `Reminder backlog exceeds override warning threshold (${dueCount} >= ${warningDueThreshold}).`
    );
  }
  return alerts;
}

async function main() {
  const opsHealth = await fetchJson("/api/system/ops-health");
  let result;
  if (opsHealth.ok) {
    const baseResult = {
      passed: Boolean(opsHealth.payload?.passed),
      baseUrl,
      timestamp: String(opsHealth.payload?.timestamp ?? new Date().toISOString()),
      summary: {
        criticalCount: Number(opsHealth.payload?.summary?.criticalCount ?? 0),
        warningCount: Number(opsHealth.payload?.summary?.warningCount ?? 0)
      },
      metrics: opsHealth.payload?.metrics ?? {},
      thresholds: {
        minOpenRate,
        warningDueThreshold,
        criticalDueThreshold
      },
      alerts: Array.isArray(opsHealth.payload?.alerts) ? [...opsHealth.payload.alerts] : []
    };
    const overrideAlerts = applyThresholdOverrides(baseResult);
    const mergedAlerts = [...baseResult.alerts, ...overrideAlerts];
    const criticalCount = mergedAlerts.filter((alert) => alert.severity === "critical").length;
    const warningCount = mergedAlerts.filter((alert) => alert.severity === "warning").length;
    result = {
      ...baseResult,
      passed: criticalCount === 0,
      summary: {
        criticalCount,
        warningCount
      },
      alerts: mergedAlerts
    };
  } else {
    const [launch, billing, delivery, upgradeFunnel] = await Promise.all([
      fetchJson("/api/system/launch"),
      fetchJson("/api/system/billing"),
      fetchJson("/api/system/delivery"),
      fetchJson("/api/telemetry/upgrade-funnel")
    ]);

    const alerts = buildAlerts({ launch, billing, delivery, upgradeFunnel });
    const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
    const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
    const deliverySentCount = Number(delivery.payload?.summary?.sentCount ?? 0);
    const deliveryOpenedCount = Number(delivery.payload?.summary?.openedCount ?? 0);
    const openRate =
      deliverySentCount > 0 ? Number((deliveryOpenedCount / deliverySentCount).toFixed(4)) : null;
    result = {
      passed: criticalCount === 0,
      baseUrl,
      timestamp: new Date().toISOString(),
      summary: {
        criticalCount,
        warningCount
      },
      metrics: {
        launchReady: Boolean(launch.payload?.ready),
        launchWarnings: Number(launch.payload?.warningCount ?? 0),
        billingLiveMode: Boolean(billing.payload?.capabilities?.liveMode),
        activeSubscriptions: Number(billing.payload?.entitlements?.activeSubscriptionCount ?? 0),
        deliveryConfigured: Boolean(delivery.payload?.capabilities?.configured),
        deliveryVerified: Boolean(delivery.payload?.verification?.ready),
        deliverySentCount,
        deliveryOpenedCount,
        deliveryOpenRate: openRate,
        remindersDueCount: Number(delivery.payload?.reminders?.dueCount ?? 0),
        upgradeViews24h: Number(upgradeFunnel.payload?.windows?.last24h?.totalViews ?? 0),
        upgradeClickRate24h:
          upgradeFunnel.payload?.windows?.last24h?.clickRateFromViews === null
            ? null
            : Number(upgradeFunnel.payload?.windows?.last24h?.clickRateFromViews ?? 0),
        upgradeCheckoutSuccessRate7d:
          upgradeFunnel.payload?.windows?.last7d?.checkoutSuccessRateFromStarts === null
            ? null
            : Number(upgradeFunnel.payload?.windows?.last7d?.checkoutSuccessRateFromStarts ?? 0)
      },
      thresholds: {
        minOpenRate,
        warningDueThreshold,
        criticalDueThreshold
      },
      alerts
    };
  }

  const output = JSON.stringify(result, null, 2);
  if (result.passed || !shouldAssert) {
    console.log(output);
    if (!result.passed) {
      process.exitCode = 1;
    }
    return;
  }

  console.error(output);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[check-ops-health] failed", error);
  process.exitCode = 1;
});
