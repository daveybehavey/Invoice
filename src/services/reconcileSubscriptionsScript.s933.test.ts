import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// S93-3 item 2 (fix round): scripts/reconcile-subscriptions.ts is an
// operator entry point into the SAME entitlements store the server
// uses. It must load the server's environment (import "dotenv/config",
// as src/server.ts does) BEFORE any service import — the store
// resolves its backend and file path from process.env at module init —
// and it must refuse loudly when prerequisites are missing instead of
// silently reconciling against the default file store.

const repoRoot = process.cwd();
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const scriptPath = path.join(repoRoot, "scripts", "reconcile-subscriptions.ts");

type ScriptRun = { code: number | null; stdout: string; stderr: string };

async function runScript(input: {
  cwd: string;
  env: Record<string, string>;
  ids: string[];
}): Promise<ScriptRun> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [tsxCli, scriptPath, ...input.ids], {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`reconcile script timed out; stdout=${stdout} stderr=${stderr}`));
    }, 60_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** An environment with NO inherited Stripe/Invoice configuration. */
function scrubbedEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...extra
  };
}

function tombstonedSnapshot(subscriptionId: string): string {
  return `${JSON.stringify(
    {
      updatedAt: "2026-01-01T00:00:00.000Z",
      customers: {},
      subscriptions: {
        [subscriptionId]: {
          subscriptionId,
          customerId: "cus_env",
          email: "env@test.dev",
          ownerId: "owner-env",
          userId: "owner-env",
          status: "canceled",
          updatedAt: "2026-01-01T00:00:00.000Z",
          reconcileGeneration: 1,
          lastEventCreated: 100,
          reconciliationState: "verified",
          reconciledAt: "2026-01-01T00:00:00.000Z",
          cancellationTombstone: { eventId: "evt_env_cancel", eventCreated: 100 }
        }
      },
      eventReceipts: {}
    },
    null,
    2
  )}\n`;
}

test("the reconcile script loads .env like the server and resolves the configured entitlements store", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-s933-recon-script-"));
  const storePath = path.join(dir, "configured-entitlements.json");
  // A tombstoned record reports without any Stripe retrieval, so the
  // outcome depends only on WHICH store the script resolved.
  await fs.writeFile(storePath, tombstonedSnapshot("sub_envtomb"), "utf8");
  await fs.writeFile(
    path.join(dir, ".env"),
    `STRIPE_SECRET_KEY=sk_test_env_only\nSTRIPE_ENTITLEMENTS_STORE_FILE=${storePath}\n`,
    "utf8"
  );

  const run = await runScript({ cwd: dir, env: scrubbedEnv(), ids: ["sub_envtomb"] });
  assert.equal(run.code, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stdout, /sub_envtomb: tombstoned/);
});

test("the reconcile script refuses loudly when STRIPE_SECRET_KEY is not configured", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-s933-recon-script-"));
  const run = await runScript({ cwd: dir, env: scrubbedEnv(), ids: ["sub_anything"] });
  assert.equal(run.code, 2, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /STRIPE_SECRET_KEY is not configured/);
});

test("the reconcile script refuses when a Postgres store is configured without its URL", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-s933-recon-script-"));
  const run = await runScript({
    cwd: dir,
    env: scrubbedEnv({ STRIPE_SECRET_KEY: "sk_test_present", INVOICE_STORE_BACKEND: "postgres" }),
    ids: ["sub_anything"]
  });
  assert.equal(run.code, 2, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /Postgres entitlements store is configured/);
});
