import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { OcrConfidenceReason } from "./uploadTextExtractor.js";

const configuredStorePath = process.env.OCR_METRICS_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/ocr-metrics.json");
const storeDir = path.dirname(storeFilePath);
const MAX_RECENT_EVENTS = 50;

const OcrMetricsEventSchema = z.object({
  at: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReasons: z.array(z.string()).default([]),
  warningCount: z.number().int().nonnegative().default(0)
});

const OcrMetricsSnapshotSchema = z.object({
  totalEvents: z.number().int().nonnegative().default(0),
  byConfidence: z
    .object({
      high: z.number().int().nonnegative().default(0),
      medium: z.number().int().nonnegative().default(0),
      low: z.number().int().nonnegative().default(0)
    })
    .default({ high: 0, medium: 0, low: 0 }),
  byReason: z.record(z.string(), z.number().int().nonnegative()).default({}),
  recentEvents: z.array(OcrMetricsEventSchema).default([]),
  updatedAt: z.string().default("")
});

type OcrMetricsSnapshot = z.infer<typeof OcrMetricsSnapshotSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function trackOcrConfidenceMetric(input: {
  confidence: "high" | "medium" | "low";
  confidenceReasons: OcrConfidenceReason[];
  warningCount: number;
}): Promise<void> {
  await withMutationLock(async () => {
    const snapshot = await readSnapshot();
    const now = new Date().toISOString();
    const nextWarningCount =
      Number.isFinite(input.warningCount) && input.warningCount > 0
        ? Math.floor(input.warningCount)
        : 0;
    const uniqueReasons = Array.from(new Set(input.confidenceReasons)).filter(Boolean);

    snapshot.totalEvents += 1;
    snapshot.byConfidence[input.confidence] += 1;
    uniqueReasons.forEach((reason) => {
      const current = snapshot.byReason[reason] ?? 0;
      snapshot.byReason[reason] = current + 1;
    });
    snapshot.recentEvents = [
      ...snapshot.recentEvents,
      {
        at: now,
        confidence: input.confidence,
        confidenceReasons: uniqueReasons,
        warningCount: nextWarningCount
      }
    ].slice(-MAX_RECENT_EVENTS);
    snapshot.updatedAt = now;

    await writeSnapshot(snapshot);
  });
}

export async function getOcrMetricsSnapshot(): Promise<OcrMetricsSnapshot> {
  return readSnapshot();
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<OcrMetricsSnapshot> {
  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return OcrMetricsSnapshotSchema.parse(parsed);
}

async function writeSnapshot(snapshot: OcrMetricsSnapshot): Promise<void> {
  await ensureStoreExists();
  const tempPath = `${storeFilePath}.tmp`;
  const content = JSON.stringify(snapshot, null, 2);
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
          totalEvents: 0,
          byConfidence: { high: 0, medium: 0, low: 0 },
          byReason: {},
          recentEvents: [],
          updatedAt: ""
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }
}
