import {
  InvoiceListItem,
  RecentClientContextItem,
  SavedInvoice,
  SavedInvoiceStatus
} from "../models/invoice.js";
import {
  deleteSavedInvoice,
  duplicateSavedInvoice,
  getSavedInvoiceById,
  getSavedInvoiceByPortalToken,
  listRecentClientContext,
  listSavedInvoiceMetadata,
  restoreSavedInvoice,
  saveInvoiceDocument,
  updateSavedInvoiceStatus
} from "./savedInvoiceStore.js";
import { PostgresSavedInvoiceRepository } from "./savedInvoicePostgresStore.js";

export type SavedInvoiceBackend = "file" | "postgres";
export type SavedInvoiceBackendMode = SavedInvoiceBackend | "auto";

export type SavedInvoicePersistencePolicy = {
  nodeEnv: string;
  configuredMode: SavedInvoiceBackendMode;
  resolvedBackend: SavedInvoiceBackend;
  postgresUrlConfigured: boolean;
  requirePostgres: boolean;
  requireMigrationComplete: boolean;
  productionReady: boolean;
  warning?: string;
};

export interface SavedInvoiceRepository {
  backend: SavedInvoiceBackend;
  dispose?(): Promise<void>;
  saveInvoiceDocument(input: {
    ownerId: string;
    invoiceId?: string;
    sourceType: SavedInvoice["sourceType"];
    invoiceData: SavedInvoice["invoiceData"];
  }): Promise<SavedInvoice>;
  listSavedInvoiceMetadata(includeDeleted: boolean, ownerId: string): Promise<InvoiceListItem[]>;
  listRecentClientContext(
    clientName: string,
    limit: number,
    ownerId: string
  ): Promise<RecentClientContextItem[]>;
  getSavedInvoiceById(invoiceId: string, ownerId: string): Promise<SavedInvoice>;
  getSavedInvoiceByPortalToken(invoiceId: string, portalAccessToken: string): Promise<SavedInvoice | null>;
  duplicateSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice>;
  updateSavedInvoiceStatus(
    invoiceId: string,
    status: SavedInvoiceStatus,
    ownerId: string
  ): Promise<SavedInvoice>;
  restoreSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice>;
  deleteSavedInvoice(invoiceId: string, ownerId: string): Promise<void>;
}

class FileSavedInvoiceRepository implements SavedInvoiceRepository {
  backend: SavedInvoiceBackend = "file";

  async dispose(): Promise<void> {
    return Promise.resolve();
  }

  async saveInvoiceDocument(input: {
    ownerId: string;
    invoiceId?: string;
    sourceType: SavedInvoice["sourceType"];
    invoiceData: SavedInvoice["invoiceData"];
  }): Promise<SavedInvoice> {
    return saveInvoiceDocument(input);
  }

  async listSavedInvoiceMetadata(includeDeleted = false, ownerId: string): Promise<InvoiceListItem[]> {
    return listSavedInvoiceMetadata(includeDeleted, ownerId);
  }

  async listRecentClientContext(
    clientName: string,
    limit: number,
    ownerId: string
  ): Promise<RecentClientContextItem[]> {
    return listRecentClientContext(clientName, limit, ownerId);
  }

  async getSavedInvoiceById(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    return getSavedInvoiceById(invoiceId, ownerId);
  }

  async getSavedInvoiceByPortalToken(
    invoiceId: string,
    portalAccessToken: string
  ): Promise<SavedInvoice | null> {
    return getSavedInvoiceByPortalToken(invoiceId, portalAccessToken);
  }

  async duplicateSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    return duplicateSavedInvoice(invoiceId, ownerId);
  }

  async updateSavedInvoiceStatus(
    invoiceId: string,
    status: SavedInvoiceStatus,
    ownerId: string
  ): Promise<SavedInvoice> {
    return updateSavedInvoiceStatus(invoiceId, status, ownerId);
  }

  async restoreSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    return restoreSavedInvoice(invoiceId, ownerId);
  }

  async deleteSavedInvoice(invoiceId: string, ownerId: string): Promise<void> {
    return deleteSavedInvoice(invoiceId, ownerId);
  }
}

type RepositoryFactoryOptions = {
  backend?: SavedInvoiceBackendMode;
  postgresUrl?: string;
};

let repository: SavedInvoiceRepository | null = null;
let resolvedBackend: SavedInvoiceBackend | null = null;
let resolvedBackendMode: SavedInvoiceBackendMode | null = null;

export function getSavedInvoiceRepository(): SavedInvoiceRepository {
  if (!repository) {
    resolvedBackendMode = resolveSavedInvoiceBackendMode(process.env.INVOICE_STORE_BACKEND);
    resolvedBackend = resolveSavedInvoiceBackendFromMode(resolvedBackendMode);
    repository = createSavedInvoiceRepository({ backend: resolvedBackendMode });
  }
  return repository;
}

export function getSavedInvoiceBackend(): SavedInvoiceBackend {
  if (!resolvedBackend) {
    resolvedBackendMode = resolveSavedInvoiceBackendMode(process.env.INVOICE_STORE_BACKEND);
    resolvedBackend = resolveSavedInvoiceBackendFromMode(resolvedBackendMode);
  }
  return resolvedBackend;
}

export function getSavedInvoiceBackendMode(): SavedInvoiceBackendMode {
  if (!resolvedBackendMode) {
    resolvedBackendMode = resolveSavedInvoiceBackendMode(process.env.INVOICE_STORE_BACKEND);
  }
  return resolvedBackendMode;
}

export function isSavedInvoicePostgresUrlConfigured(): boolean {
  return Boolean(resolvePostgresUrl());
}

export function getSavedInvoicePersistencePolicy(): SavedInvoicePersistencePolicy {
  return evaluateSavedInvoicePersistencePolicy();
}

export function assertSavedInvoicePersistencePolicy(): SavedInvoicePersistencePolicy {
  const policy = evaluateSavedInvoicePersistencePolicy();
  if (!policy.productionReady) {
    throw new Error(
      [
        "Invoice persistence is not production-ready.",
        `Configured mode "${policy.configuredMode}" resolved to "${policy.resolvedBackend}".`,
        "Set INVOICE_STORE_POSTGRES_URL (or DATABASE_URL), or set INVOICE_STORE_REQUIRE_POSTGRES=false to override."
      ].join(" ")
    );
  }
  return policy;
}

export function createSavedInvoiceRepository(
  options: RepositoryFactoryOptions = {}
): SavedInvoiceRepository {
  const mode = resolveSavedInvoiceBackendMode(options.backend);
  const backend = resolveSavedInvoiceBackendFromMode(mode, options.postgresUrl);
  if (backend === "postgres") {
    const postgresUrl = resolvePostgresUrl(options.postgresUrl);
    if (!postgresUrl) {
      throw new Error(
        "INVOICE_STORE_POSTGRES_URL (or DATABASE_URL) is required when INVOICE_STORE_BACKEND=postgres."
      );
    }
    return new PostgresSavedInvoiceRepository(postgresUrl);
  }
  return new FileSavedInvoiceRepository();
}

export function resolveSavedInvoiceBackendMode(value: string | undefined): SavedInvoiceBackendMode {
  const configured = (value ?? "auto").trim().toLowerCase();
  if (configured === "file" || configured === "postgres" || configured === "auto") {
    return configured;
  }
  console.warn(`Unsupported INVOICE_STORE_BACKEND="${configured}". Falling back to "file".`);
  return "file";
}

export function resolveSavedInvoiceBackendFromValue(
  value: string | undefined,
  explicitPostgresUrl?: string
): SavedInvoiceBackend {
  return resolveSavedInvoiceBackendFromMode(resolveSavedInvoiceBackendMode(value), explicitPostgresUrl);
}

function resolveSavedInvoiceBackendFromMode(
  mode: SavedInvoiceBackendMode,
  explicitPostgresUrl?: string
): SavedInvoiceBackend {
  if (mode === "postgres") {
    return "postgres";
  }
  if (mode === "auto") {
    return resolvePostgresUrl(explicitPostgresUrl) ? "postgres" : "file";
  }
  return "file";
}

export function resolveSavedInvoiceRequirePostgres(
  value: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  return (nodeEnv ?? "").trim().toLowerCase() === "production";
}

export function evaluateSavedInvoicePersistencePolicy(options?: {
  modeValue?: string | undefined;
  postgresUrl?: string | undefined;
  nodeEnv?: string | undefined;
  requirePostgresValue?: string | undefined;
  requireMigrationCompleteValue?: string | undefined;
}): SavedInvoicePersistencePolicy {
  const configuredMode = resolveSavedInvoiceBackendMode(options?.modeValue ?? process.env.INVOICE_STORE_BACKEND);
  const postgresUrlConfigured = Boolean(resolvePostgresUrl(options?.postgresUrl));
  const resolvedBackend = resolveSavedInvoiceBackendFromMode(configuredMode, options?.postgresUrl);
  const nodeEnv = (options?.nodeEnv ?? process.env.NODE_ENV ?? "development").trim() || "development";
  const requirePostgres = resolveSavedInvoiceRequirePostgres(
    options?.requirePostgresValue ?? process.env.INVOICE_STORE_REQUIRE_POSTGRES,
    nodeEnv
  );
  const requireMigrationComplete = resolveSavedInvoiceRequireMigrationComplete(
    options?.requireMigrationCompleteValue ?? process.env.INVOICE_STORE_REQUIRE_MIGRATION_COMPLETE,
    {
      nodeEnv,
      requirePostgres
    }
  );
  const productionReady = !requirePostgres || resolvedBackend === "postgres";

  return {
    nodeEnv,
    configuredMode,
    resolvedBackend,
    postgresUrlConfigured,
    requirePostgres,
    requireMigrationComplete,
    productionReady,
    warning: productionReady
      ? undefined
      : "Postgres is required, but invoice persistence is currently using the file backend."
  };
}

export function resolveSavedInvoiceRequireMigrationComplete(
  value: string | undefined,
  context: { nodeEnv?: string | undefined; requirePostgres?: boolean } = {}
): boolean {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    return parsed;
  }
  const nodeEnv = (context.nodeEnv ?? process.env.NODE_ENV ?? "development").trim().toLowerCase();
  const requirePostgres = context.requirePostgres ?? resolveSavedInvoiceRequirePostgres(undefined, nodeEnv);
  return requirePostgres && nodeEnv === "production";
}

function resolvePostgresUrl(explicitValue?: string): string | undefined {
  const fromOptions = explicitValue?.trim();
  if (fromOptions) {
    return fromOptions;
  }

  const fromStoreEnv = process.env.INVOICE_STORE_POSTGRES_URL?.trim();
  if (fromStoreEnv) {
    return fromStoreEnv;
  }

  const fromDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (fromDatabaseUrl) {
    return fromDatabaseUrl;
  }

  return undefined;
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
