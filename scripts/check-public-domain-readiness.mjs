import process from "node:process";
import { execSync } from "node:child_process";

const checks = [];

function checkService(name) {
  try {
    const output = execSync(`systemctl --user is-active ${name}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const ok = output === "active";
    checks.push({
      id: `service:${name}`,
      ok,
      detail: ok ? "active" : output || "unknown"
    });
  } catch (_error) {
    checks.push({
      id: `service:${name}`,
      ok: false,
      detail: "inactive"
    });
  }
}

async function checkUrl(url) {
  const timeoutMs = 12_000;
  const start = Date.now();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: abortController.signal });
    const durationMs = Date.now() - start;
    checks.push({
      id: `url:${url}`,
      ok: response.ok,
      detail: `status ${response.status} in ${durationMs}ms`
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

async function main() {
  checkService("notebill-dev.service");
  checkService("notebill-tunnel.service");

  await checkUrl("http://localhost:3000");
  await checkUrl("https://app.notebill.app");
  await checkUrl("https://notebill.app");
  await checkUrl("https://www.notebill.app");

  const passed = checks.every((check) => check.ok);
  const result = {
    passed,
    timestamp: new Date().toISOString(),
    checks
  };

  const payload = JSON.stringify(result, null, 2);
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
