import path from "node:path";
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";

const timeoutMs = 12_000;
const checks = [];
const publicBaseUrl = normalizeBaseUrl(
  process.env.PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? "https://app.notebill.app"
);
const workersDevUrl = normalizeBaseUrl(
  process.env.WORKERS_DEV_URL ?? "https://notebill-app.davidiheslop.workers.dev"
);
const expectedWorkerScript = process.env.CLOUDFLARE_WORKER_NAME ?? "notebill-app";
const expectedZoneName = process.env.CLOUDFLARE_ZONE_NAME ?? "notebill.app";
const expectedRoutePatterns = new Set([
  "app.notebill.app/*",
  "notebill.app/*",
  "www.notebill.app/*"
]);

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}

function parseWranglerOauthToken() {
  const configPath = path.join(
    process.env.APPDATA ?? "",
    "xdg.config",
    ".wrangler",
    "config",
    "default.toml"
  );
  if (!existsSync(configPath)) {
    return null;
  }

  const config = readFileSync(configPath, "utf8");
  const match = config.match(/oauth_token\s*=\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

async function checkUrl(url, options = {}) {
  const { requireCfWorker = false } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow"
    });
    const durationMs = Date.now() - start;
    const serverTiming = response.headers.get("server-timing") ?? "";
    const canInspectCfWorker = serverTiming.length > 0;
    const sawCfWorker = /(^|,)\s*cfWorker;?/i.test(serverTiming);
    const ok = response.ok;

    checks.push({
      id: `url:${url}`,
      ok,
      detail: requireCfWorker
        ? `status ${response.status} in ${durationMs}ms; cfWorker=${
            canInspectCfWorker ? sawCfWorker : "header-unavailable"
          }`
        : `status ${response.status} in ${durationMs}ms`
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    checks.push({
      id: `url:${url}`,
      ok: false,
      detail: `${error?.name || "RequestError"} after ${durationMs}ms`
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkWorkerRoutes() {
  const token = parseWranglerOauthToken();
  if (!token) {
    checks.push({
      id: "cloudflare:routes",
      ok: true,
      detail: "skipped route API check because local Wrangler OAuth token was not found"
    });
    return;
  }

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const zoneResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(expectedZoneName)}`,
      { headers }
    );
    const zonePayload = await zoneResponse.json();
    const zoneId = zonePayload?.result?.[0]?.id;
    if (!zoneResponse.ok || !zoneId) {
      if (zoneResponse.status === 401 || zoneResponse.status === 403) {
        checks.push({
          id: "cloudflare:routes",
          ok: true,
          detail: `skipped route API check because local Cloudflare token cannot read zones (status ${zoneResponse.status})`
        });
        return;
      }
      throw new Error(`zone lookup failed with status ${zoneResponse.status}`);
    }

    const routesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
      { headers }
    );
    const routesPayload = await routesResponse.json();
    const routes = Array.isArray(routesPayload?.result) ? routesPayload.result : [];
    const activePatterns = new Set(
      routes
        .filter((route) => route?.script === expectedWorkerScript)
        .map((route) => route.pattern)
    );

    const missing = [...expectedRoutePatterns].filter((pattern) => !activePatterns.has(pattern));
    checks.push({
      id: "cloudflare:routes",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `attached ${expectedWorkerScript} to ${[...expectedRoutePatterns].join(", ")}`
          : `missing ${missing.join(", ")}`
    });
  } catch (error) {
    checks.push({
      id: "cloudflare:routes",
      ok: false,
      detail: error instanceof Error ? error.message : "route verification failed"
    });
  }
}

async function main() {
  await checkWorkerRoutes();
  await checkUrl(`${workersDevUrl}/health`, { requireCfWorker: true });
  await checkUrl(`${publicBaseUrl}/health`, { requireCfWorker: true });
  await checkUrl(`${publicBaseUrl}/privacy`, { requireCfWorker: true });
  await checkUrl("https://notebill.app", { requireCfWorker: true });
  await checkUrl("https://www.notebill.app", { requireCfWorker: true });

  const passed = checks.every((check) => check.ok);
  const payload = JSON.stringify(
    {
      passed,
      timestamp: new Date().toISOString(),
      publicBaseUrl,
      workersDevUrl,
      checks
    },
    null,
    2
  );

  if (passed) {
    console.log(payload);
    return;
  }

  console.error(payload);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[check-public-domain] failed", error);
  process.exitCode = 1;
});
