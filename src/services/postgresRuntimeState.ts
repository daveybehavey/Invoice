import { Client } from "pg";
import { z } from "zod";

export type RuntimeStateBackend = "file" | "postgres";

let snapshotTableReadyPromise: Promise<void> | null = null;

export function resolveRuntimeStateBackend(): RuntimeStateBackend {
  const override = normalizeBackendValue(process.env.INVOICE_RUNTIME_STORE_BACKEND);
  if (override) {
    return override === "postgres" && resolveRuntimeStatePostgresUrl() ? "postgres" : "file";
  }

  const invoiceStoreBackend = normalizeInvoiceStoreBackend(process.env.INVOICE_STORE_BACKEND);
  if (invoiceStoreBackend === "file") {
    return "file";
  }

  return resolveRuntimeStatePostgresUrl() ? "postgres" : "file";
}

export function isRuntimeStatePostgresEnabled(): boolean {
  return resolveRuntimeStateBackend() === "postgres";
}

function createRuntimeStatePostgresClient(): Client {
  const connectionString = resolveRuntimeStatePostgresUrl();
  if (!connectionString) {
    throw new Error(
      "INVOICE_STORE_POSTGRES_URL (or DATABASE_URL) is required when runtime state uses Postgres."
    );
  }

  return new Client({ connectionString });
}

export async function ensureRuntimeSnapshotTable(): Promise<void> {
  if (!snapshotTableReadyPromise) {
    snapshotTableReadyPromise = createRuntimeSnapshotTable();
  }
  await snapshotTableReadyPromise;
}

export async function readRuntimeSnapshot<TSchema extends z.ZodTypeAny>(
  storeKey: string,
  schema: TSchema,
  fallback: z.output<TSchema>
): Promise<z.output<TSchema>> {
  await ensureRuntimeSnapshotTable();
  const client = createRuntimeStatePostgresClient();
  await client.connect();
  try {
    const result = await client.query<{ snapshot: unknown }>(
      `
        select snapshot
        from app_runtime_snapshots
        where store_key = $1
      `,
      [storeKey]
    );
    const snapshot = result.rows[0]?.snapshot;
    return schema.parse(snapshot ?? fallback);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function mutateRuntimeSnapshot<TSchema extends z.ZodTypeAny>(
  storeKey: string,
  schema: TSchema,
  fallback: z.output<TSchema>,
  mutator: (
    current: z.output<TSchema>
  ) => z.output<TSchema> | Promise<z.output<TSchema>>
): Promise<z.output<TSchema>> {
  await ensureRuntimeSnapshotTable();
  const client = createRuntimeStatePostgresClient();
  await client.connect();
  try {
    await client.query("begin");
    const current = await readRuntimeSnapshotForUpdate(client, storeKey, schema, fallback);
    const next = schema.parse(await mutator(current));
    await client.query(
      `
        insert into app_runtime_snapshots (store_key, snapshot, updated_at)
        values ($1, $2::jsonb, $3)
        on conflict (store_key)
        do update set
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at
      `,
      [storeKey, JSON.stringify(next), new Date().toISOString()]
    );
    await client.query("commit");
    return next;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function normalizeBackendValue(value: string | undefined): RuntimeStateBackend | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "file" || normalized === "postgres") {
    return normalized;
  }
  return undefined;
}

function normalizeInvoiceStoreBackend(value: string | undefined): "file" | "postgres" | "auto" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "file" || normalized === "postgres" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

function resolveRuntimeStatePostgresUrl(): string | undefined {
  const configured = process.env.INVOICE_STORE_POSTGRES_URL?.trim();
  if (configured) {
    return configured;
  }
  const fallback = process.env.DATABASE_URL?.trim();
  return fallback || undefined;
}

async function createRuntimeSnapshotTable(): Promise<void> {
  const client = createRuntimeStatePostgresClient();
  await client.connect();
  try {
    await client.query(`
      create table if not exists app_runtime_snapshots (
        store_key text primary key,
        snapshot jsonb not null,
        updated_at timestamptz not null
      );
    `);
    await client.query(`
      alter table app_runtime_snapshots enable row level security;
    `);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readRuntimeSnapshotForUpdate<TSchema extends z.ZodTypeAny>(
  client: Client,
  storeKey: string,
  schema: TSchema,
  fallback: z.output<TSchema>
): Promise<z.output<TSchema>> {
  const result = await client.query<{ snapshot: unknown }>(
    `
      select snapshot
      from app_runtime_snapshots
      where store_key = $1
      for update
    `,
    [storeKey]
  );
  const snapshot = result.rows[0]?.snapshot;
  return schema.parse(snapshot ?? fallback);
}
