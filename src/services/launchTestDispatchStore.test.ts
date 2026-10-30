import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.INVOICE_RUNTIME_STORE_BACKEND = "file";
process.env.INVOICE_LAUNCH_TEST_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-launch-test-unit-${randomUUID()}.json`
);

const { buildLaunchTestIdempotencyKey, recordLaunchTestClaimOutcome, reserveLaunchTestClaim } =
  await import("./launchTestDispatchStore.js");

const storeFilePath = process.env.INVOICE_LAUNCH_TEST_STORE_FILE;

async function resetStore(): Promise<void> {
  await fs.rm(storeFilePath, { force: true });
}

test("reserveLaunchTestClaim reserves once and returns the same claim for the same binding", async () => {
  await resetStore();
  const actionId = `action-${randomUUID()}`;
  const first = await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "Ops@Test.dev"
  });
  assert.equal(first.outcome, "reserved");
  if (first.outcome === "reserved") {
    assert.equal(first.claim.state, "reserved");
    assert.equal(first.claim.recipientEmail, "ops@test.dev");
  }

  const second = await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "ops@test.dev"
  });
  assert.equal(second.outcome, "existing");
});

test("reserveLaunchTestClaim conflicts when the binding changes", async () => {
  await resetStore();
  const actionId = `action-${randomUUID()}`;
  await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "one@test.dev"
  });

  const differentRecipient = await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "two@test.dev"
  });
  assert.equal(differentRecipient.outcome, "conflict");

  const differentOperator = await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_someone_else",
    recipientEmail: "one@test.dev"
  });
  assert.equal(differentOperator.outcome, "conflict");
});

test("reserveLaunchTestClaim admits exactly one of many concurrent reservations", async () => {
  await resetStore();
  const actionId = `action-${randomUUID()}`;
  const outcomes = await Promise.all(
    Array.from({ length: 6 }, () =>
      reserveLaunchTestClaim({
        actionId,
        operatorUserId: "usr_operator",
        recipientEmail: "ops@test.dev"
      })
    )
  );
  assert.equal(outcomes.filter((outcome) => outcome.outcome === "reserved").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.outcome === "existing").length, 5);
});

test("reserveLaunchTestClaim enforces the per-operator daily limit on fresh actions", async () => {
  await resetStore();
  process.env.INVOICE_LAUNCH_TEST_PER_OPERATOR_DAILY_LIMIT = "2";
  process.env.INVOICE_LAUNCH_TEST_GLOBAL_DAILY_LIMIT = "100";
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reserved = await reserveLaunchTestClaim({
        actionId: `action-${randomUUID()}`,
        operatorUserId: "usr_operator",
        recipientEmail: "ops@test.dev"
      });
      assert.equal(reserved.outcome, "reserved");
    }
    const limited = await reserveLaunchTestClaim({
      actionId: `action-${randomUUID()}`,
      operatorUserId: "usr_operator",
      recipientEmail: "ops@test.dev"
    });
    assert.equal(limited.outcome, "limit_reached");
  } finally {
    delete process.env.INVOICE_LAUNCH_TEST_PER_OPERATOR_DAILY_LIMIT;
    delete process.env.INVOICE_LAUNCH_TEST_GLOBAL_DAILY_LIMIT;
  }
});

test("recordLaunchTestClaimOutcome settles a claim with its recorded outcome", async () => {
  await resetStore();
  const actionId = `action-${randomUUID()}`;
  await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "ops@test.dev"
  });

  const updated = await recordLaunchTestClaimOutcome({
    actionId,
    state: "settled",
    outcomeMode: "provider",
    outcomeProvider: "resend",
    outcomeProviderMessageId: "msg_123",
    outcomeWarning: null
  });
  assert.ok(updated);
  assert.equal(updated.state, "settled");
  assert.equal(updated.outcomeProviderMessageId, "msg_123");

  const replay = await reserveLaunchTestClaim({
    actionId,
    operatorUserId: "usr_operator",
    recipientEmail: "ops@test.dev"
  });
  assert.equal(replay.outcome, "existing");
  if (replay.outcome === "existing") {
    assert.equal(replay.claim.state, "settled");
    assert.equal(replay.claim.outcomeMode, "provider");
  }
});

test("buildLaunchTestIdempotencyKey is stable per action", () => {
  assert.equal(buildLaunchTestIdempotencyKey("action-1"), "launch-test:action-1");
  assert.equal(buildLaunchTestIdempotencyKey("action-1"), buildLaunchTestIdempotencyKey("action-1"));
  assert.notEqual(buildLaunchTestIdempotencyKey("action-1"), buildLaunchTestIdempotencyKey("action-2"));
});
