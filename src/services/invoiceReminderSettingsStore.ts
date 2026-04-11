import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InvoiceReminderSettings, resolveInvoiceReminderSettings } from "./invoiceReminderScheduler.js";

const configuredStorePath = process.env.INVOICE_REMINDER_SETTINGS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/invoice-reminder-settings.json");
const storeDir = path.dirname(storeFilePath);

const ReminderSettingsEntrySchema = z.object({
  dueAfterDays: z.number().int().min(1).max(120),
  cooldownDays: z.number().int().min(1).max(60),
  maxPerRun: z.number().int().min(1).max(100),
  updatedAt: z.string()
});

const ReminderSettingsStoreSchema = z.object({
  owners: z.record(z.string(), ReminderSettingsEntrySchema).default({})
});

type ReminderSettingsStore = z.infer<typeof ReminderSettingsStoreSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function getStoredInvoiceReminderSettings(input: {
  ownerId: string;
}): Promise<{
  settings: InvoiceReminderSettings;
  source: "stored" | "default";
  updatedAt: string | null;
}> {
  const ownerId = normalizeOwnerId(input.ownerId);
  if (!ownerId) {
    return {
      settings: resolveInvoiceReminderSettings(),
      source: "default",
      updatedAt: null
    };
  }
  const store = await readStore();
  const entry = store.owners[ownerId];
  if (!entry) {
    return {
      settings: resolveInvoiceReminderSettings(),
      source: "default",
      updatedAt: null
    };
  }
  return {
    settings: resolveInvoiceReminderSettings({
      dueAfterDays: entry.dueAfterDays,
      cooldownDays: entry.cooldownDays,
      maxPerRun: entry.maxPerRun
    }),
    source: "stored",
    updatedAt: entry.updatedAt
  };
}

export async function saveStoredInvoiceReminderSettings(input: {
  ownerId: string;
  settings: Partial<InvoiceReminderSettings>;
}): Promise<{ settings: InvoiceReminderSettings; updatedAt: string }> {
  const ownerId = normalizeOwnerId(input.ownerId);
  if (!ownerId) {
    throw new Error("Missing owner id for reminder settings.");
  }
  return withMutationLock(async () => {
    const store = await readStore();
    const existing = store.owners[ownerId];
    const mergedSettings = resolveInvoiceReminderSettings({
      dueAfterDays: input.settings.dueAfterDays ?? existing?.dueAfterDays,
      cooldownDays: input.settings.cooldownDays ?? existing?.cooldownDays,
      maxPerRun: input.settings.maxPerRun ?? existing?.maxPerRun
    });
    const updatedAt = new Date().toISOString();
    store.owners[ownerId] = {
      dueAfterDays: mergedSettings.dueAfterDays,
      cooldownDays: mergedSettings.cooldownDays,
      maxPerRun: mergedSettings.maxPerRun,
      updatedAt
    };
    await writeStore(store);
    return {
      settings: mergedSettings,
      updatedAt
    };
  });
}

function normalizeOwnerId(value: string | undefined | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readStore(): Promise<ReminderSettingsStore> {
  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return ReminderSettingsStoreSchema.parse(parsed);
}

async function writeStore(store: ReminderSettingsStore): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(store, null, 2);
  await fs.writeFile(tempPath, `${content}\n`, "utf8");
  await fs.rename(tempPath, storeFilePath);
}

async function ensureStoreExists(): Promise<void> {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(
      storeFilePath,
      JSON.stringify(
        {
          owners: {}
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }
}
