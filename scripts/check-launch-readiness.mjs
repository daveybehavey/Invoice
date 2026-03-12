import process from "node:process";

const timeoutMs = 12_000;
const baseUrl = (process.env.LAUNCH_CHECK_BASE_URL ?? "http://localhost:3000").trim();

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
  const [health, launch] = await Promise.all([fetchHealth(), fetchJson("/api/system/launch")]);

  const checks = [
    {
      id: "health",
      ok: health.ok,
      detail: health.ok ? `status ${health.status}` : `status ${health.status}`
    },
    ...(Array.isArray(launch.payload?.checks) ? launch.payload.checks : [])
  ];

  const result = {
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
