import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// SEC-08 (S52-5 / S63-3 §2 / S66-6): startup must refuse before any listener
// accepts requests when production tries to disable authentication. Each
// case boots the real server entrypoint in a child process with isolated
// store files and with the persistence/migration prerequisites satisfied
// (file backend, Postgres not required), so the auth-policy assertion is
// the only assertion that can refuse boot.

const STRONG_SECRET = "super-strong-session-secret";
const BOOT_TIMEOUT_MS = 90_000;

type BootResult = { outcome: "listening" | "exited"; code: number | null; output: string };

function bootEnv(port: number, overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const tag = randomUUID();
  const tmp = (name: string) => path.join(os.tmpdir(), `invoice-sec08-boot-${name}-${tag}.json`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    INVOICE_STORE_BACKEND: "file",
    INVOICE_STORE_FILE: tmp("store"),
    INVOICE_STORE_REQUIRE_POSTGRES: "false",
    OCR_METRICS_STORE_FILE: tmp("ocr"),
    FLOW_FRICTION_REPORT_FILE: tmp("ffr"),
    FLOW_FRICTION_HISTORY_FILE: tmp("ffh"),
    STRIPE_ENTITLEMENTS_STORE_FILE: tmp("ent"),
    INVOICE_DELIVERY_STORE_FILE: tmp("del"),
    REVENUE_SIGNALS_STORE_FILE: tmp("rev"),
    INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE: tmp("redemption"),
    INVOICE_PROVIDER_USAGE_STORE_FILE: tmp("usage"),
    INVOICE_LAUNCH_TEST_STORE_FILE: tmp("launch"),
    APP_BASE_URL: `http://localhost:${port}`,
    PORT: String(port),
    // Provider readiness via Google so the email provider can stay
    // unconfigured; the session secret is strong unless a case removes it.
    GOOGLE_CLIENT_ID: "google-client-id-for-boot-tests",
    GOOGLE_CLIENT_SECRET: "google-client-secret-for-boot-tests",
    INVOICE_SESSION_SECRET: STRONG_SECRET
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

async function bootServer(overrides: Record<string, string | undefined>): Promise<BootResult> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = bootEnv(port, overrides);
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const child: ChildProcess = spawn(process.execPath, [tsxCli, "src/server.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group: the tsx CLI runs the app in a child of its own, and
    // killing only the CLI would orphan a listening server.
    detached: true
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output = (output + String(chunk)).slice(-65536);
  });
  child.stderr?.on("data", (chunk) => {
    output = (output + String(chunk)).slice(-65536);
  });

  try {
    return await new Promise<BootResult>((resolve) => {
      let settled = false;
      let poll: NodeJS.Timeout | undefined;
      const finish = (result: BootResult) => {
        if (!settled) {
          settled = true;
          clearTimeout(deadline);
          if (poll) {
            clearInterval(poll);
          }
          resolve(result);
        }
      };
      const deadline = setTimeout(() => {
        finish({ outcome: "exited", code: null, output: `${output}\n<boot timed out>` });
      }, BOOT_TIMEOUT_MS);
      child.on("exit", (code) => {
        finish({ outcome: "exited", code, output });
      });
      poll = setInterval(() => {
        const socket = net.connect(port, "127.0.0.1");
        socket.once("connect", () => {
          socket.end();
          finish({ outcome: "listening", code: null, output });
        });
        socket.once("error", () => {
          socket.destroy();
        });
      }, 250);
    });
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
}

test(
  "SEC-08 startup: production with INVOICE_REQUIRE_AUTH=false refuses before listening",
  { timeout: BOOT_TIMEOUT_MS + 30_000 },
  async () => {
    const result = await bootServer({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: "false" });
    assert.equal(result.outcome, "exited", `server must refuse to boot; output:\n${result.output}`);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Invoice auth policy is not production-ready/);
    assert.match(result.output, /INVOICE_REQUIRE_AUTH=false is prohibited in production/);
  }
);

test(
  "SEC-08 startup: production false aliases 0 and OFF refuse before listening",
  { timeout: 2 * BOOT_TIMEOUT_MS + 30_000 },
  async () => {
    for (const alias of ["0", "OFF"]) {
      const result = await bootServer({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: alias });
      assert.equal(result.outcome, "exited", `alias ${alias} must refuse boot; output:\n${result.output}`);
      assert.match(result.output, /Invoice auth policy is not production-ready/);
      assert.match(result.output, /prohibit/i);
    }
  }
);

test(
  "SEC-08 startup: production with the flag unset boots when prerequisites are satisfied",
  { timeout: BOOT_TIMEOUT_MS + 30_000 },
  async () => {
    const result = await bootServer({ NODE_ENV: "production", INVOICE_REQUIRE_AUTH: undefined });
    assert.equal(result.outcome, "listening", `server must boot; output:\n${result.output}`);
  }
);

test(
  "SEC-08 startup: production auth-required without a strong session secret refuses",
  { timeout: BOOT_TIMEOUT_MS + 30_000 },
  async () => {
    const result = await bootServer({
      NODE_ENV: "production",
      INVOICE_REQUIRE_AUTH: "true",
      INVOICE_SESSION_SECRET: undefined
    });
    assert.equal(result.outcome, "exited", `server must refuse boot; output:\n${result.output}`);
    assert.match(result.output, /Invoice auth policy is not production-ready/);
    assert.match(result.output, /INVOICE_SESSION_SECRET/);
    assert.match(result.output, /Google/, "the error must describe email or Google prerequisites");
  }
);

test(
  "SEC-08 startup: non-production with the flag disabled still boots",
  { timeout: BOOT_TIMEOUT_MS + 30_000 },
  async () => {
    const result = await bootServer({ NODE_ENV: "development", INVOICE_REQUIRE_AUTH: "false" });
    assert.equal(result.outcome, "listening", `server must boot; output:\n${result.output}`);
  }
);
