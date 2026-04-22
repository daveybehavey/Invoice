#!/usr/bin/env tsx
import "dotenv/config";
import process from "node:process";
import { evaluateSavedInvoicePersistencePolicy } from "../src/services/savedInvoiceRepository.js";
import { getSavedInvoiceStoreSummary } from "../src/services/savedInvoiceStore.js";
import { getInvoiceAuthPolicy } from "../src/services/invoiceAuthPolicy.js";

async function main() {
  const persistence = evaluateSavedInvoicePersistencePolicy();
  const authPolicy = getInvoiceAuthPolicy({ nodeEnv: persistence.nodeEnv });
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
      nodeEnv: authPolicy.nodeEnv,
      requireAuth: authPolicy.requireAuth,
      sessionSecretConfigured: authPolicy.sessionSecretConfigured,
      emailProviderConfigured: authPolicy.emailProviderConfigured,
      productionReady: authPolicy.productionReady,
      warning: authPolicy.warning ?? null
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

  if (!persistence.productionReady || !authPolicy.productionReady || !migrationReady) {
    process.exitCode = 1;
  }
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
