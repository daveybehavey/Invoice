import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

// S93-3 item 3, fix round 1 (Codex P2-2): /api/system/launch is
// operator-gated diagnostics, so scripts/check-launch-readiness.mjs must
// present a diagnostics operator's session credential, supplied via the
// LAUNCH_CHECK_OPERATOR_SESSION_TOKEN environment variable. With a
// credential the checker evaluates readiness on the merits; without one
// it reports itself UNCONFIGURED (configured: false, passed: null)
// instead of a misleading passed: false; with a bad credential it
// reports a genuine failed verdict (configured: true, passed: false).

process.env.NODE_ENV = "test";
process.env.INVOICE_STORE_BACKEND = "file";
const storeFilePath = path.join(os.tmpdir(), `invoice-s933-launchcheck-store-${randomUUID()}.json`);
process.env.INVOICE_STORE_FILE = storeFilePath;
process.env.INVOICE_STORE_REQUIRE_POSTGRES = "false";
process.env.INVOICE_EMAIL_SIGNIN_REDEMPTION_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-s933-launchcheck-redemption-${randomUUID()}.json`
);
process.env.APP_BASE_URL = "http://localhost:3000";

const [{ app }, { createAuthSessionForEmail }] = await Promise.all([
  import("./server.js"),
  import("./services/authSession.js")
]);

const operatorSession = createAuthSessionForEmail("launchcheck-operator@test.dev");
process.env.INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS = operatorSession.session.userId;

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/check-launch-readiness.mjs"
);

let server: Server;
let baseUrl: string;

before(async () => {
  await fs.mkdir(path.dirname(storeFilePath), { recursive: true });
  await fs.writeFile(storeFilePath, '{\n  "invoices": []\n}\n', "utf8");
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object", "the test server must bind an ephemeral port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.INVOICE_DIAGNOSTICS_OPERATOR_USER_IDS;
});

type CheckerResult = {
  configured?: boolean;
  passed?: boolean | null;
  launch?: { ready?: boolean } | null;
  checks?: Array<{ id: string; ok: boolean; detail: string }>;
};

async function runChecker(extraEnv: Record<string, string | undefined>): Promise<{
  exitCode: number;
  result: CheckerResult;
}> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    LAUNCH_CHECK_BASE_URL: baseUrl
  };
  delete env.LAUNCH_CHECK_OPERATOR_SESSION_TOKEN;
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  try {
    const { stdout } = await runNode(env);
    return { exitCode: 0, result: JSON.parse(stdout) as CheckerResult };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    const output = (failure.stdout ?? "") || (failure.stderr ?? "");
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      result: JSON.parse(output) as CheckerResult
    };
  }
}

function runNode(env: Record<string, string | undefined>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath],
      { env: env as NodeJS.ProcessEnv, timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

test("with an operator credential the checker evaluates launch readiness on the merits", async () => {
  const direct = await fetch(`${baseUrl}/api/system/launch`, {
    headers: { authorization: `Bearer ${operatorSession.token}` }
  });
  assert.equal(direct.status, 200, "the operator credential must open the launch diagnostics");
  const directPayload = (await direct.json()) as { ready?: boolean };

  const { exitCode, result } = await runChecker({
    LAUNCH_CHECK_OPERATOR_SESSION_TOKEN: operatorSession.token
  });
  assert.equal(result.configured, true);
  assert.equal(result.launch?.ready, directPayload.ready, "the checker must report the gated payload it read");
  assert.equal(
    result.passed,
    Boolean(directPayload.ready),
    "the verdict must come from the deployment's actual readiness, not the gate"
  );
  assert.equal(exitCode, result.passed ? 0 : 1);
});

test("without a credential the checker reports itself unconfigured, not a failed verdict", async () => {
  const { exitCode, result } = await runChecker({});
  assert.equal(exitCode, 1, "an unconfigured release gate must not pass silently");
  assert.equal(result.configured, false);
  assert.equal(result.passed, null, "unconfigured is distinct from a failed readiness verdict");
  assert.equal(result.launch, null, "the gated diagnostics must not be probed without a credential");
  const credentialCheck = result.checks?.find((check) => check.id === "operator-credential");
  assert.ok(credentialCheck, "the report must name the missing credential input");
  assert.ok(credentialCheck.detail.includes("LAUNCH_CHECK_OPERATOR_SESSION_TOKEN"));
});

test("with an invalid credential the checker reports a genuine failed verdict", async () => {
  const { exitCode, result } = await runChecker({
    LAUNCH_CHECK_OPERATOR_SESSION_TOKEN: "not-a-valid-session-token"
  });
  assert.equal(exitCode, 1);
  assert.equal(result.configured, true, "a supplied credential means the checker was configured");
  assert.equal(result.passed, false, "a 401 from the gate is a failed verdict, not an unconfigured report");
});
