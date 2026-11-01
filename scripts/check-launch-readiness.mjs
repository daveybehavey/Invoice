import process from "node:process";

// Launch readiness reads GET /api/system/launch, which is operator-only
// diagnostics (S93-3 item 3). The checker therefore needs a diagnostics
// operator's session credential, supplied through the environment —
// never hardcoded or committed:
//   LAUNCH_CHECK_OPERATOR_SESSION_TOKEN=<session token for a user ID in
//   the deployment's INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS allowlist>
// It is sent as `Authorization: Bearer <token>`, the same transport the
// product client uses. Without it the checker cannot evaluate readiness
// at all, so it reports itself UNCONFIGURED (passed: null,
// configured: false) instead of a misleading passed: false verdict.

const timeoutMs = 12_000;
const baseUrl = (
  process.env.LAUNCH_CHECK_BASE_URL ??
  process.env.APP_BASE_URL ??
  "https://app.notebill.app"
).trim();
const operatorSessionToken = (process.env.LAUNCH_CHECK_OPERATOR_SESSION_TOKEN ?? "").trim();
const checkerConfigured = operatorSessionToken.length > 0;

async function fetchJson(pathname, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      signal: controller.signal,
      headers: { accept: "application/json", ...headers }
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

async function fetchHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
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

async function main() {
  const health = await fetchHealth();
  const healthCheck = {
    id: "health",
    ok: health.ok,
    detail: `status ${health.status}`
  };

  if (!checkerConfigured) {
    const result = {
      configured: false,
      passed: null,
      baseUrl,
      timestamp: new Date().toISOString(),
      health: health.payload,
      launch: null,
      checks: [
        healthCheck,
        {
          id: "operator-credential",
          ok: false,
          detail:
            "LAUNCH_CHECK_OPERATOR_SESSION_TOKEN is not set; the operator-gated launch diagnostics were not evaluated. Set it to a session token for a diagnostics operator to run this check."
        }
      ]
    };
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const launch = await fetchJson("/api/system/launch", {
    authorization: `Bearer ${operatorSessionToken}`
  });

  const checks = [
    healthCheck,
    ...(Array.isArray(launch.payload?.checks) ? launch.payload.checks : [])
  ];

  const result = {
    configured: true,
    passed: Boolean(health.ok && launch.ok && launch.payload?.ready),
    baseUrl,
    timestamp: new Date().toISOString(),
    health: health.payload,
    launch: launch.payload,
    checks
  };

  const output = JSON.stringify(result, null, 2);
  if (result.passed) {
    console.log(output);
    return;
  }

  console.error(output);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[check-launch-readiness] failed", error);
  process.exitCode = 1;
});
