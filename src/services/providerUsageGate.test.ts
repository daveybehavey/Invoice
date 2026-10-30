import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.INVOICE_RUNTIME_STORE_BACKEND = "file";
process.env.INVOICE_PROVIDER_USAGE_STORE_FILE = path.join(
  os.tmpdir(),
  `invoice-provider-usage-unit-${randomUUID()}.json`
);

const { reserveProviderUsage } = await import("./providerUsageGate.js");

const storeFilePath = process.env.INVOICE_PROVIDER_USAGE_STORE_FILE;

async function resetStore(): Promise<void> {
  // The file backend re-reads the snapshot on every mutation, so
  // removing the file fully resets the gate between tests.
  await fs.rm(storeFilePath, { force: true });
}

test("reserveProviderUsage admits up to the per-principal limit and refuses beyond it", async () => {
  await resetStore();
  process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT = "3";
  process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT = "100";
  try {
    const principalId = `principal-${randomUUID()}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reservation = await reserveProviderUsage({ operationClass: "ocr", principalId });
      assert.equal(reservation.admitted, true);
    }
    const refused = await reserveProviderUsage({ operationClass: "ocr", principalId });
    assert.equal(refused.admitted, false);
  } finally {
    delete process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT;
    delete process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT;
  }
});

test("reserveProviderUsage admits exactly the limit under concurrency", async () => {
  await resetStore();
  process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT = "4";
  process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT = "100";
  try {
    const principalId = `principal-${randomUUID()}`;
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => reserveProviderUsage({ operationClass: "transcription", principalId }))
    );
    assert.equal(outcomes.filter((outcome) => outcome.admitted).length, 4);
  } finally {
    delete process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT;
    delete process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT;
  }
});

test("reserveProviderUsage enforces the application-wide limit across principals", async () => {
  await resetStore();
  process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT = "100";
  process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT = "2";
  try {
    const first = await reserveProviderUsage({
      operationClass: "ocr",
      principalId: `principal-${randomUUID()}`
    });
    const second = await reserveProviderUsage({
      operationClass: "ocr",
      principalId: `principal-${randomUUID()}`
    });
    const third = await reserveProviderUsage({
      operationClass: "ocr",
      principalId: `principal-${randomUUID()}`
    });
    assert.equal(first.admitted, true);
    assert.equal(second.admitted, true);
    assert.equal(third.admitted, false);
  } finally {
    delete process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT;
    delete process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT;
  }
});

test("reserveProviderUsage keeps operation classes in separate windows", async () => {
  await resetStore();
  process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT = "1";
  process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT = "100";
  try {
    const principalId = `principal-${randomUUID()}`;
    const ocr = await reserveProviderUsage({ operationClass: "ocr", principalId });
    const transcription = await reserveProviderUsage({ operationClass: "transcription", principalId });
    assert.equal(ocr.admitted, true);
    assert.equal(transcription.admitted, true);
  } finally {
    delete process.env.INVOICE_PROVIDER_USAGE_PER_PRINCIPAL_LIMIT;
    delete process.env.INVOICE_PROVIDER_USAGE_APP_LIMIT;
  }
});
