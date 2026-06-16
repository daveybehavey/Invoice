import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const configuredStorePath = process.env.CLIENT_STATEMENT_ACTIVITY_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/client-statement-activity.json");
const storeDir = path.dirname(storeFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const STORE_KEY = "client_statement_activity";

const ClientStatementActivityActionSchema = z.enum([
  "viewed_statement",
  "copied_statement",
  "copied_follow_up",
  "emailed_statement",
  "printed_statement",
  "downloaded_pdf"
]);

const ClientStatementActivityEntrySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  clientName: z.string().min(1),
  clientKey: z.string().min(1),
  action: ClientStatementActivityActionSchema,
  detail: z.string().min(1),
  recipientEmail: z.string().email().optional(),
  recordedAt: z.string().datetime()
});

const ClientStatementActivityStoreSchema = z.object({
  entries: z.array(ClientStatementActivityEntrySchema).default([])
});

export type ClientStatementActivityAction = z.infer<typeof ClientStatementActivityActionSchema>;
export type ClientStatementActivityEntry = z.infer<typeof ClientStatementActivityEntrySchema>;

const EMPTY_STORE: z.infer<typeof ClientStatementActivityStoreSchema> = {
  entries: []
};

export async function recordClientStatementActivity(input: {
  ownerId: string;
  clientName: string;
  action: ClientStatementActivityAction;
  detail: string;
  recipientEmail?: string;
}): Promise<ClientStatementActivityEntry> {
  const clientName = normalizeText(input.clientName);
  if (!clientName) {
    throw new Error("Client name is required.");
  }
  const action = ClientStatementActivityActionSchema.parse(input.action);
  const entry = ClientStatementActivityEntrySchema.parse({
    id: randomUUID(),
    ownerId: normalizeText(input.ownerId),
    clientName,
    clientKey: normalizeClientKey(clientName),
    action,
    detail: normalizeText(input.detail),
    recipientEmail: input.recipientEmail ? normalizeEmail(input.recipientEmail) : undefined,
    recordedAt: new Date().toISOString()
  });
  if (!entry.ownerId) {
    throw new Error("Owner id is required.");
  }
  await mutateStore(async (store) => {
    store.entries.push(entry);
  });
  return entry;
}

export async function listClientStatementActivity(input: {
  ownerId: string;
  clientName: string;
  limit?: number;
}): Promise<ClientStatementActivityEntry[]> {
  const ownerId = normalizeText(input.ownerId);
  const clientKey = normalizeClientKey(input.clientName);
  if (!ownerId || !clientKey) {
    return [];
  }
  const limit = clampLimit(input.limit ?? 8);
  const store = await readStore();
  return store.entries
    .filter((entry) => entry.ownerId === ownerId && entry.clientKey === clientKey)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, limit);
}

export async function listRecentClientStatementActivity(input: {
  ownerId: string;
  limit?: number;
}): Promise<ClientStatementActivityEntry[]> {
  const ownerId = normalizeText(input.ownerId);
  if (!ownerId) {
    return [];
  }
  const limit = clampLimit(input.limit ?? 8);
  const store = await readStore();
  return store.entries
    .filter((entry) => entry.ownerId === ownerId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, limit);
}

async function readStore(): Promise<z.infer<typeof ClientStatementActivityStoreSchema>> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(STORE_KEY, ClientStatementActivityStoreSchema, EMPTY_STORE);
  }

  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return ClientStatementActivityStoreSchema.parse(parsed);
}

async function writeStore(store: z.infer<typeof ClientStatementActivityStoreSchema>): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function mutateStore(
  mutator: (store: z.infer<typeof ClientStatementActivityStoreSchema>) => void | Promise<void>
): Promise<void> {
  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(STORE_KEY, ClientStatementActivityStoreSchema, EMPTY_STORE, async (current) => {
      const next = ClientStatementActivityStoreSchema.parse(structuredClone(current));
      await mutator(next);
      return next;
    });
    return;
  }

  const store = await readStore();
  await mutator(store);
  await writeStore(store);
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, '{\n  "entries": []\n}\n', "utf8");
  }
}

function normalizeText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeClientKey(value: string | undefined): string {
  return normalizeText(value).toLowerCase();
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }
  return Math.max(1, Math.min(20, Math.round(value)));
}
