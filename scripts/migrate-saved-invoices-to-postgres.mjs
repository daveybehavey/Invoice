#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";

const STATUS_VALUES = new Set(["draft", "sent", "paid", "deleted"]);
const SOURCE_TYPE_VALUES = new Set(["text_input", "upload"]);
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const dryRun = process.argv.includes("--dry-run");
const sourcePath = resolveSourcePath();
const connectionString = resolvePostgresUrl();

if (!connectionString) {
  console.error(
    "Missing INVOICE_STORE_POSTGRES_URL (or DATABASE_URL). Cannot migrate saved invoices."
  );
  process.exit(1);
}

const raw = await readSourceFile(sourcePath);
const invoices = normalizeInvoices(raw.invoices);

if (invoices.length === 0) {
  console.log(`No invoices found in ${sourcePath}. Nothing to migrate.`);
  process.exit(0);
}

const pool = new Pool({ connectionString });

try {
  await ensureSchema(pool);
  if (dryRun) {
    const ownerCounts = countByOwner(invoices);
    console.log(`[dry-run] Source file: ${sourcePath}`);
    console.log(`[dry-run] Invoices: ${invoices.length}`);
    console.log(`[dry-run] Owners: ${ownerCounts.length}`);
    ownerCounts.forEach(({ ownerId, count }) => {
      console.log(`  - ${ownerId}: ${count}`);
    });
    process.exit(0);
  }

  await pool.query("begin");
  for (const invoice of invoices) {
    await pool.query(
      `
        insert into saved_invoices (
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        on conflict (invoice_id) do update
        set owner_id = excluded.owner_id,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            status = excluded.status,
            previous_status = excluded.previous_status,
            deleted_at = excluded.deleted_at,
            source_type = excluded.source_type,
            invoice_data = excluded.invoice_data
      `,
      [
        invoice.invoiceId,
        invoice.ownerId,
        invoice.createdAt,
        invoice.updatedAt,
        invoice.status,
        invoice.previousStatus,
        invoice.deletedAt,
        invoice.sourceType,
        JSON.stringify(invoice.invoiceData)
      ]
    );
  }
  await pool.query("commit");
  console.log(`Migrated ${invoices.length} invoice(s) from ${sourcePath} to Postgres.`);
} catch (error) {
  await pool.query("rollback").catch(() => undefined);
  console.error("Migration failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}

function resolveSourcePath() {
  const configuredPath = process.env.INVOICE_STORE_FILE;
  if (configuredPath && configuredPath.trim()) {
    return path.resolve(process.cwd(), configuredPath.trim());
  }
  return path.resolve(process.cwd(), "data/saved-invoices.json");
}

function resolvePostgresUrl() {
  const explicit = process.env.INVOICE_STORE_POSTGRES_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const fallback = process.env.DATABASE_URL?.trim();
  return fallback || "";
}

async function readSourceFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Source file is not a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Unable to read source file "${filePath}": ${error instanceof Error ? error.message : error}`);
  }
}

function normalizeInvoices(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const now = new Date().toISOString();
  const normalized = [];
  for (const rawInvoice of input) {
    if (!rawInvoice || typeof rawInvoice !== "object") {
      continue;
    }
    const invoiceId = normalizeUuid(rawInvoice.invoiceId);
    if (!invoiceId) {
      continue;
    }
    const ownerId = normalizeString(rawInvoice.ownerId) || "local-default";
    const createdAt = normalizeDate(rawInvoice.createdAt) || now;
    const updatedAt = normalizeDate(rawInvoice.updatedAt) || createdAt;
    const status = STATUS_VALUES.has(rawInvoice.status) ? rawInvoice.status : "draft";
    const previousStatus = STATUS_VALUES.has(rawInvoice.previousStatus) ? rawInvoice.previousStatus : null;
    const deletedAt = normalizeDate(rawInvoice.deletedAt);
    const sourceType = SOURCE_TYPE_VALUES.has(rawInvoice.sourceType) ? rawInvoice.sourceType : "text_input";
    const invoiceData =
      rawInvoice.invoiceData && typeof rawInvoice.invoiceData === "object" ? rawInvoice.invoiceData : null;

    if (!invoiceData) {
      continue;
    }

    normalized.push({
      invoiceId,
      ownerId,
      createdAt,
      updatedAt,
      status,
      previousStatus,
      deletedAt,
      sourceType,
      invoiceData
    });
  }
  return normalized;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return uuidRegex.test(trimmed) ? trimmed : "";
}

function normalizeDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function countByOwner(invoices) {
  const counts = new Map();
  for (const invoice of invoices) {
    counts.set(invoice.ownerId, (counts.get(invoice.ownerId) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([ownerId, count]) => ({ ownerId, count }))
    .sort((left, right) => right.count - left.count);
}

async function ensureSchema(pool) {
  await pool.query(`
    create table if not exists saved_invoices (
      invoice_id uuid primary key,
      owner_id text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      status text not null check (status in ('draft', 'sent', 'paid', 'deleted')),
      previous_status text check (previous_status is null or previous_status in ('draft', 'sent', 'paid', 'deleted')),
      deleted_at timestamptz null,
      source_type text not null check (source_type in ('text_input', 'upload')),
      invoice_data jsonb not null
    );
  `);
  await pool.query(`
    create index if not exists saved_invoices_owner_updated_idx
    on saved_invoices(owner_id, updated_at desc);
  `);
  await pool.query(`
    create index if not exists saved_invoices_owner_status_idx
    on saved_invoices(owner_id, status);
  `);
}
