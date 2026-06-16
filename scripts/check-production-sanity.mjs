import process from "node:process";

const timeoutMs = 12_000;
const baseUrl = normalizeBaseUrl(
  process.env.PRODUCTION_SANITY_BASE_URL ??
    process.env.LAUNCH_CHECK_BASE_URL ??
    process.env.APP_BASE_URL ??
    "https://app.notebill.app"
);

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}

async function fetchJson(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers ?? {})
      },
      method: options.method ?? "GET",
      body: options.body
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - start,
      payload
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildCheck(id, ok, detail) {
  return { id, ok: Boolean(ok), detail };
}

async function main() {
  const [health, launch, billing, delivery, authProviders] = await Promise.all([
    fetchJson("/health"),
    fetchJson("/api/system/launch"),
    fetchJson("/api/system/billing"),
    fetchJson("/api/system/delivery"),
    fetchJson("/api/auth/providers")
  ]);

  const checks = [
    buildCheck("health", health.ok, `status ${health.status} in ${health.durationMs}ms`),
    buildCheck(
      "launch",
      launch.ok && launch.payload?.ready,
      launch.ok && launch.payload?.ready
        ? `ready with ${launch.payload?.warningCount ?? 0} warnings`
        : launch.payload?.error || `status ${launch.status}`
    ),
    buildCheck(
      "billing",
      billing.ok && !billing.payload?.warning,
      billing.ok
        ? `${billing.payload?.provider || "unknown"}; checkout=${
            billing.payload?.capabilities?.checkoutAvailable ? "ready" : "not-ready"
          }; googlePlayVerify=${
            billing.payload?.capabilities?.googlePlay?.verificationAvailable ? "ready" : "not-ready"
          }`
        : billing.payload?.error || `status ${billing.status}`
    ),
    buildCheck(
      "delivery",
      delivery.ok && delivery.payload?.capabilities?.configured && !delivery.payload?.warning,
      delivery.ok
        ? `${delivery.payload?.provider || "unknown"}; configured=${
            delivery.payload?.capabilities?.configured ? "yes" : "no"
          }; sendingCapability=${delivery.payload?.verification?.sendingCapability || "n/a"}`
        : delivery.payload?.error || `status ${delivery.status}`
    ),
    buildCheck(
      "auth-providers",
      authProviders.ok,
      authProviders.ok
        ? `google=${
            Array.isArray(authProviders.payload?.providers)
              ? authProviders.payload.providers.some((provider) => provider?.id === "google" && provider?.available)
                ? "available"
                : "not-available"
              : "unknown"
          }; email-link=${
            Array.isArray(authProviders.payload?.providers)
              ? authProviders.payload.providers.some((provider) => provider?.id === "email_link" && provider?.available)
                ? "available"
                : "not-available"
              : "unknown"
          }`
        : authProviders.payload?.error || `status ${authProviders.status}`
    )
  ];

  const passed = checks.every((check) => check.ok);
  const payload = {
    passed,
    baseUrl,
    timestamp: new Date().toISOString(),
    snapshot: {
      launch: {
        warningCount: launch.payload?.warningCount ?? null,
        persistenceBackend: launch.payload?.persistence?.backend ?? launch.payload?.launch?.persistence?.backend ?? null,
        billingProvider: launch.payload?.billing?.provider ?? launch.payload?.launch?.billing?.provider ?? null,
        deliveryProvider: launch.payload?.delivery?.provider ?? launch.payload?.launch?.delivery?.provider ?? null
      },
      billing: {
        provider: billing.payload?.provider ?? null,
        checkoutAvailable: billing.payload?.capabilities?.checkoutAvailable ?? null,
        portalAvailable: billing.payload?.capabilities?.portalAvailable ?? null,
        invoicePaymentAvailable: billing.payload?.capabilities?.invoicePaymentAvailable ?? null,
        googlePlayVerificationAvailable: billing.payload?.capabilities?.googlePlay?.verificationAvailable ?? null,
        googlePlayBasePlanId: billing.payload?.capabilities?.googlePlay?.subscriptionBasePlanId ?? null,
        googlePlayLifetimeProductId: billing.payload?.capabilities?.googlePlay?.lifetimeProductId ?? null
      },
      delivery: {
        provider: delivery.payload?.provider ?? null,
        configured: delivery.payload?.capabilities?.configured ?? null,
        fromEmail: delivery.payload?.capabilities?.fromEmail ?? null,
        launchTestRecipientConfigured: delivery.payload?.capabilities?.launchTestRecipientConfigured ?? null,
        warning: delivery.payload?.warning ?? null
      }
    },
    checks
  };

  const output = JSON.stringify(payload, null, 2);
  if (passed) {
    console.log(output);
    return;
  }

  console.error(output);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        passed: false,
        baseUrl,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
