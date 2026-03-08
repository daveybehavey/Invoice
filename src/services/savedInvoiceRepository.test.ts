import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSavedInvoiceRepository,
  evaluateSavedInvoicePersistencePolicy,
  resolveSavedInvoiceRequirePostgres,
  resolveSavedInvoiceRequireMigrationComplete,
  resolveSavedInvoiceBackendMode,
  resolveSavedInvoiceBackendFromValue
} from "./savedInvoiceRepository.js";

test("resolveSavedInvoiceBackendFromValue supports file and postgres", () => {
  assert.equal(resolveSavedInvoiceBackendFromValue(undefined), "file");
  assert.equal(resolveSavedInvoiceBackendFromValue(" file "), "file");
  assert.equal(resolveSavedInvoiceBackendFromValue("POSTGRES"), "postgres");
});

test("resolveSavedInvoiceBackendFromValue supports auto mode", () => {
  assert.equal(resolveSavedInvoiceBackendFromValue("auto"), "file");
  assert.equal(resolveSavedInvoiceBackendFromValue("auto", "postgres://example.test/invoice"), "postgres");
});

test("resolveSavedInvoiceBackendMode supports file/postgres/auto", () => {
  assert.equal(resolveSavedInvoiceBackendMode(undefined), "auto");
  assert.equal(resolveSavedInvoiceBackendMode("file"), "file");
  assert.equal(resolveSavedInvoiceBackendMode("postgres"), "postgres");
  assert.equal(resolveSavedInvoiceBackendMode("auto"), "auto");
});

test("resolveSavedInvoiceBackendFromValue falls back to file for unknown values", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: unknown) => {
    warnings.push(String(message));
  };

  try {
    assert.equal(resolveSavedInvoiceBackendFromValue("unknown"), "file");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unsupported INVOICE_STORE_BACKEND/);
});

test("createSavedInvoiceRepository defaults to file backend", () => {
  const repository = createSavedInvoiceRepository({ backend: "file" });
  assert.equal(repository.backend, "file");
});

test("createSavedInvoiceRepository auto mode falls back to file without postgres url", () => {
  const repository = createSavedInvoiceRepository({ backend: "auto", postgresUrl: "" });
  assert.equal(repository.backend, "file");
});

test("createSavedInvoiceRepository auto mode picks postgres when url is present", async () => {
  const repository = createSavedInvoiceRepository({
    backend: "auto",
    postgresUrl: "postgres://postgres:postgres@localhost:5432/invoice"
  });
  assert.equal(repository.backend, "postgres");
  if (typeof repository.dispose === "function") {
    await repository.dispose();
  }
});

test("createSavedInvoiceRepository requires postgres URL when backend is postgres", () => {
  assert.throws(
    () => createSavedInvoiceRepository({ backend: "postgres", postgresUrl: "" }),
    /INVOICE_STORE_POSTGRES_URL/
  );
});

test("createSavedInvoiceRepository supports postgres backend selection", async () => {
  const repository = createSavedInvoiceRepository({
    backend: "postgres",
    postgresUrl: "postgres://postgres:postgres@localhost:5432/invoice"
  });
  assert.equal(repository.backend, "postgres");
  if (typeof repository.dispose === "function") {
    await repository.dispose();
  }
});

test("resolveSavedInvoiceRequirePostgres defaults by environment when not set", () => {
  assert.equal(resolveSavedInvoiceRequirePostgres(undefined, "production"), true);
  assert.equal(resolveSavedInvoiceRequirePostgres(undefined, "test"), false);
  assert.equal(resolveSavedInvoiceRequirePostgres(undefined, "development"), false);
});

test("resolveSavedInvoiceRequirePostgres respects explicit env override values", () => {
  assert.equal(resolveSavedInvoiceRequirePostgres("true", "development"), true);
  assert.equal(resolveSavedInvoiceRequirePostgres("1", "development"), true);
  assert.equal(resolveSavedInvoiceRequirePostgres("false", "production"), false);
  assert.equal(resolveSavedInvoiceRequirePostgres("0", "production"), false);
});

test("resolveSavedInvoiceRequireMigrationComplete defaults to production + postgres requirement", () => {
  assert.equal(
    resolveSavedInvoiceRequireMigrationComplete(undefined, {
      nodeEnv: "production",
      requirePostgres: true
    }),
    true
  );
  assert.equal(
    resolveSavedInvoiceRequireMigrationComplete(undefined, {
      nodeEnv: "production",
      requirePostgres: false
    }),
    false
  );
  assert.equal(
    resolveSavedInvoiceRequireMigrationComplete(undefined, {
      nodeEnv: "development",
      requirePostgres: true
    }),
    false
  );
});

test("resolveSavedInvoiceRequireMigrationComplete respects explicit override values", () => {
  assert.equal(resolveSavedInvoiceRequireMigrationComplete("true"), true);
  assert.equal(resolveSavedInvoiceRequireMigrationComplete("1"), true);
  assert.equal(resolveSavedInvoiceRequireMigrationComplete("false"), false);
  assert.equal(resolveSavedInvoiceRequireMigrationComplete("0"), false);
});

test("evaluateSavedInvoicePersistencePolicy flags missing postgres when required", () => {
  const policy = evaluateSavedInvoicePersistencePolicy({
    modeValue: "auto",
    nodeEnv: "production",
    requirePostgresValue: "true",
    postgresUrl: ""
  });
  assert.equal(policy.resolvedBackend, "file");
  assert.equal(policy.requirePostgres, true);
  assert.equal(policy.requireMigrationComplete, true);
  assert.equal(policy.productionReady, false);
  assert.match(policy.warning ?? "", /Postgres is required/);
});

test("evaluateSavedInvoicePersistencePolicy is ready when postgres is resolved", () => {
  const policy = evaluateSavedInvoicePersistencePolicy({
    modeValue: "auto",
    nodeEnv: "production",
    requirePostgresValue: "true",
    postgresUrl: "postgres://example.test/invoice"
  });
  assert.equal(policy.resolvedBackend, "postgres");
  assert.equal(policy.requirePostgres, true);
  assert.equal(policy.requireMigrationComplete, true);
  assert.equal(policy.productionReady, true);
  assert.equal(policy.warning, undefined);
});
