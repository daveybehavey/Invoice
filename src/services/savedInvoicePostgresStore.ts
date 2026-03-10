import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  InvoiceListItem,
  InvoiceListItemSchema,
  RecentClientContextItem,
  RecentClientContextItemSchema,
  SavedInvoice,
  SavedInvoiceSchema,
  SavedInvoiceStatus
} from "../models/invoice.js";

type SavedInvoiceRow = {
  invoice_id: string;
  owner_id: string;
  created_at: string | Date;
  updated_at: string | Date;
  status: SavedInvoiceStatus;
  previous_status: SavedInvoiceStatus | null;
  deleted_at: string | Date | null;
  source_type: SavedInvoice["sourceType"];
  invoice_data: SavedInvoice["invoiceData"];
};

type SaveInvoiceInput = {
  ownerId: string;
  invoiceId?: string;
  sourceType: SavedInvoice["sourceType"];
  invoiceData: SavedInvoice["invoiceData"];
};

export class PostgresSavedInvoiceRepository {
  readonly backend = "postgres" as const;
  private readonly pool: Pool;
  private readyPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString
    });
  }

  async saveInvoiceDocument(input: SaveInvoiceInput): Promise<SavedInvoice> {
    await this.ensureReady();
    const now = new Date().toISOString();

    if (input.invoiceId) {
      const result = await this.pool.query<SavedInvoiceRow>(
        `
          update saved_invoices
          set source_type = $3,
              invoice_data = $4::jsonb,
              updated_at = $5,
              deleted_at = null
          where invoice_id = $1 and owner_id = $2
          returning
            invoice_id,
            owner_id,
            created_at,
            updated_at,
            status,
            previous_status,
            deleted_at,
            source_type,
            invoice_data
        `,
        [input.invoiceId, input.ownerId, input.sourceType, JSON.stringify(input.invoiceData), now]
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`Invoice "${input.invoiceId}" was not found.`);
      }
      return parseSavedInvoiceRow(row);
    }

    const invoice = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      sourceType: input.sourceType,
      invoiceData: input.invoiceData
    });

    const result = await this.pool.query<SavedInvoiceRow>(
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
        returning
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
      `,
      [
        invoice.invoiceId,
        invoice.ownerId,
        invoice.createdAt,
        invoice.updatedAt,
        invoice.status,
        invoice.previousStatus ?? null,
        invoice.deletedAt ?? null,
        invoice.sourceType,
        JSON.stringify(invoice.invoiceData)
      ]
    );

    return parseSavedInvoiceRow(result.rows[0]);
  }

  async listSavedInvoiceMetadata(includeDeleted = false, ownerId: string): Promise<InvoiceListItem[]> {
    await this.ensureReady();
    const result = await this.pool.query<SavedInvoiceRow>(
      `
        select
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
        from saved_invoices
        where owner_id = $1
          and ($2::boolean or status <> 'deleted')
        order by updated_at desc
      `,
      [ownerId, includeDeleted]
    );

    return result.rows.map((row) =>
      InvoiceListItemSchema.parse({
        invoiceId: row.invoice_id,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
        status: row.status,
        sourceType: row.source_type,
        invoiceNumber:
          row.invoice_data.finishedInvoice.invoiceNumber ?? row.invoice_data.structuredInvoice.invoiceNumber,
        total: row.invoice_data.finishedInvoice.total
      })
    );
  }

  async listRecentClientContext(
    clientName: string,
    limit: number,
    ownerId: string
  ): Promise<RecentClientContextItem[]> {
    await this.ensureReady();
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName) {
      return [];
    }
    const clampedLimit = Math.max(1, Math.min(limit, 5));
    const result = await this.pool.query<SavedInvoiceRow>(
      `
        select
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
        from saved_invoices
        where owner_id = $1
          and status <> 'deleted'
          and lower(coalesce(invoice_data->'finishedInvoice'->>'customerName', '')) = lower($2)
        order by updated_at desc
        limit $3
      `,
      [ownerId, normalizedClientName, clampedLimit]
    );

    return result.rows.map((row) =>
      RecentClientContextItemSchema.parse({
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_data.finishedInvoice.invoiceNumber,
        updatedAt: toIsoString(row.updated_at),
        servicePeriodStart: row.invoice_data.finishedInvoice.servicePeriodStart,
        servicePeriodEnd: row.invoice_data.finishedInvoice.servicePeriodEnd,
        total: row.invoice_data.finishedInvoice.total,
        notes: row.invoice_data.finishedInvoice.notes,
        lineItemDescriptions: (row.invoice_data.finishedInvoice.lineItems ?? [])
          .map((lineItem) => lineItem.description?.trim())
          .filter((description): description is string => Boolean(description))
          .slice(0, 4)
      })
    );
  }

  async getSavedInvoiceById(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    await this.ensureReady();
    const result = await this.pool.query<SavedInvoiceRow>(
      `
        select
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
        from saved_invoices
        where invoice_id = $1 and owner_id = $2
      `,
      [invoiceId, ownerId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }
    return parseSavedInvoiceRow(row);
  }

  async duplicateSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    await this.ensureReady();
    const existing = await this.getSavedInvoiceById(invoiceId, ownerId);
    const now = new Date().toISOString();
    const duplicated = SavedInvoiceSchema.parse({
      invoiceId: randomUUID(),
      ownerId,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      sourceType: existing.sourceType,
      invoiceData: existing.invoiceData
    });

    const result = await this.pool.query<SavedInvoiceRow>(
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
        returning
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
      `,
      [
        duplicated.invoiceId,
        duplicated.ownerId,
        duplicated.createdAt,
        duplicated.updatedAt,
        duplicated.status,
        duplicated.previousStatus ?? null,
        duplicated.deletedAt ?? null,
        duplicated.sourceType,
        JSON.stringify(duplicated.invoiceData)
      ]
    );

    return parseSavedInvoiceRow(result.rows[0]);
  }

  async updateSavedInvoiceStatus(
    invoiceId: string,
    status: SavedInvoiceStatus,
    ownerId: string
  ): Promise<SavedInvoice> {
    await this.ensureReady();
    const now = new Date().toISOString();

    const result = await this.pool.query<SavedInvoiceRow>(
      `
        update saved_invoices
        set status = $3,
            updated_at = $4,
            previous_status = case
              when $3 = 'deleted' then
                case
                  when status = 'deleted' then previous_status
                  else status
                end
              else null
            end,
            deleted_at = case
              when $3 = 'deleted' then $4
              else null
            end
        where invoice_id = $1 and owner_id = $2
        returning
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
      `,
      [invoiceId, ownerId, status, now]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }
    return parseSavedInvoiceRow(row);
  }

  async restoreSavedInvoice(invoiceId: string, ownerId: string): Promise<SavedInvoice> {
    await this.ensureReady();
    const now = new Date().toISOString();
    const result = await this.pool.query<SavedInvoiceRow>(
      `
        update saved_invoices
        set status = coalesce(previous_status, 'draft'),
            updated_at = $3,
            previous_status = null,
            deleted_at = null
        where invoice_id = $1 and owner_id = $2 and status = 'deleted'
        returning
          invoice_id,
          owner_id,
          created_at,
          updated_at,
          status,
          previous_status,
          deleted_at,
          source_type,
          invoice_data
      `,
      [invoiceId, ownerId, now]
    );

    const restoredRow = result.rows[0];
    if (restoredRow) {
      return parseSavedInvoiceRow(restoredRow);
    }

    return this.getSavedInvoiceById(invoiceId, ownerId);
  }

  async deleteSavedInvoice(invoiceId: string, ownerId: string): Promise<void> {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        delete from saved_invoices
        where invoice_id = $1 and owner_id = $2
      `,
      [invoiceId, ownerId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Invoice "${invoiceId}" was not found.`);
    }
  }

  async dispose(): Promise<void> {
    await this.pool.end();
  }

  private async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.ensureSchema();
    }
    await this.readyPromise;
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
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
    await this.pool.query(`
      create index if not exists saved_invoices_owner_updated_idx
      on saved_invoices(owner_id, updated_at desc);
    `);
    await this.pool.query(`
      create index if not exists saved_invoices_owner_status_idx
      on saved_invoices(owner_id, status);
    `);
  }
}

function parseSavedInvoiceRow(row: SavedInvoiceRow): SavedInvoice {
  return SavedInvoiceSchema.parse({
    invoiceId: row.invoice_id,
    ownerId: row.owner_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    status: row.status,
    previousStatus: row.previous_status ?? undefined,
    deletedAt: row.deleted_at ? toIsoString(row.deleted_at) : undefined,
    sourceType: row.source_type,
    invoiceData: row.invoice_data
  });
}

function toIsoString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}
