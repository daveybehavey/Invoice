#!/usr/bin/env tsx
import "dotenv/config";
import process from "node:process";
import { evaluateSavedInvoicePersistencePolicy } from "../src/services/savedInvoiceRepository.js";
import { isInvoiceSessionSecretConfigured } from "../src/services/authSession.js";
import { getSavedInvoiceStoreSummary } from "../src/services/savedInvoiceStore.js";

async function main() {
  const persistence = evaluateSavedInvoicePersistencePolicy();
  const authRequired = resolveInvoiceRequireAuth(process.env.INVOICE_REQUIRE_AUTH, persistence.nodeEnv);
  const authSecretConfigured = isInvoiceSessionSecretConfigured();
  const authReady = !authRequired || authSecretConfigured;
  const fileStore = await getSavedInvoiceStoreSummary();
  const requireMigrationComplete = resolveInvoiceRequireMigrationComplete(
    process.env.INVOICE_STORE_REQUIRE_MIGRATION_COMPLETE,
    {
      nodeEnv: persistence.nodeEnv,
      requirePostgres: persistence.requirePostgres
    }
  );
  const migrationReady =
    !requireMigrationComplete || persistence.resolvedBackend !== "postgres" || fileStore.invoiceCount === 0;
  const report = {
    persistence,
    auth: {
      nodeEnv: persistence.nodeEnv,
      requireAuth: authRequired,
      sessionSecretConfigured: authSecretConfigured,
      productionReady: authReady,
      warning:
        authReady
          ? null
          : "Authentication is required, but INVOICE_SESSION_SECRET is missing or using an insecure default."
    },
    migration: {
      requireMigrationComplete,
      migrationReady,
      legacyInvoiceCount: fileStore.invoiceCount,
      warning:
        migrationReady
          ? null
          : "Migration completeness is required, but legacy file-store invoices are still present."
    },
    fileStore,
    next: {
      migrationDryRun: "npm run migrate:invoices:postgres -- --dry-run"
    }
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!persistence.productionReady || !authReady || !migrationReady) {
    process.exitCode = 1;
  }
}

function resolveInvoiceRequireAuth(value: string | undefined, nodeEnv: string): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return nodeEnv.toLowerCase() === "production";
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
}

function resolveInvoiceRequireMigrationComplete(
  value: string | undefined,
  context: { nodeEnv: string; requirePostgres: boolean }
): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return context.nodeEnv.toLowerCase() === "production" && context.requirePostgres;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
