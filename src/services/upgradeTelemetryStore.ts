import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const configuredStorePath = process.env.UPGRADE_TELEMETRY_STORE_FILE;
const storeFilePath = configuredStorePath
  ? path.resolve(process.cwd(), configuredStorePath)
  : path.resolve(process.cwd(), "data/upgrade-telemetry.json");
const storeDir = path.dirname(storeFilePath);
const MAX_RECENT_EVENTS = 250;

const UpgradeTelemetryEventTypeSchema = z.enum([
  "warning_view",
  "limit_view",
  "upgrade_click",
  "checkout_started",
  "checkout_success",
  "checkout_cancelled",
  "billing_portal_opened"
]);

const UpgradeTelemetrySourceSchema = z.enum(["launcher", "intake", "manual", "library", "import", "unknown"]);

const UpgradeTelemetryEventSchema = z.object({
  at: z.string(),
  eventType: UpgradeTelemetryEventTypeSchema,
  source: UpgradeTelemetrySourceSchema,
  ownerId: z.string().default(""),
  planTier: z.enum(["free", "pro"]).nullable().default(null),
  remainingSaves: z.number().int().nullable().default(null)
});

const UpgradeTelemetrySnapshotSchema = z.object({
  totalEvents: z.number().int().nonnegative().default(0),
  byType: z.record(z.string(), z.number().int().nonnegative()).default({}),
  bySource: z.record(z.string(), z.number().int().nonnegative()).default({}),
  recentEvents: z.array(UpgradeTelemetryEventSchema).default([]),
  updatedAt: z.string().default("")
});

export type UpgradeTelemetryEventType = z.infer<typeof UpgradeTelemetryEventTypeSchema>;
export type UpgradeTelemetrySource = z.infer<typeof UpgradeTelemetrySourceSchema>;
type UpgradeTelemetrySnapshot = z.infer<typeof UpgradeTelemetrySnapshotSchema>;
type UpgradeTelemetryEvent = z.infer<typeof UpgradeTelemetryEventSchema>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function trackUpgradeTelemetryEvent(input: {
  eventType: UpgradeTelemetryEventType;
  source: UpgradeTelemetrySource;
  ownerId?: string | null;
  planTier?: "free" | "pro" | null;
  remainingSaves?: number | null;
  at?: string;
}): Promise<void> {
  await withMutationLock(async () => {
    const snapshot = await readSnapshot();
    const nextEvent = UpgradeTelemetryEventSchema.parse({
      at: input.at ?? new Date().toISOString(),
      eventType: input.eventType,
      source: input.source,
      ownerId: input.ownerId ?? "",
      planTier: input.planTier ?? null,
      remainingSaves:
        Number.isFinite(input.remainingSaves) && typeof input.remainingSaves === "number"
          ? Math.max(0, Math.round(input.remainingSaves))
          : null
    });
    snapshot.totalEvents += 1;
    snapshot.byType[nextEvent.eventType] = (snapshot.byType[nextEvent.eventType] ?? 0) + 1;
    snapshot.bySource[nextEvent.source] = (snapshot.bySource[nextEvent.source] ?? 0) + 1;
    snapshot.recentEvents = [...snapshot.recentEvents, nextEvent].slice(-MAX_RECENT_EVENTS);
    snapshot.updatedAt = nextEvent.at;
    await writeSnapshot(snapshot);
  });
}

export async function getUpgradeTelemetrySnapshot(): Promise<UpgradeTelemetrySnapshot> {
  return readSnapshot();
}

export async function getUpgradeTelemetryFunnelSummary(input?: {
  now?: Date;
}): Promise<{
  updatedAt: string;
  totalEvents: number;
  windows: {
    last24h: UpgradeTelemetryWindowSummary;
    last7d: UpgradeTelemetryWindowSummary;
  };
  recommendations: Array<{ id: string; severity: "info" | "warning"; message: string }>;
}> {
  const snapshot = await readSnapshot();
  const nowMs = (input?.now ?? new Date()).getTime();
  const events = snapshot.recentEvents;
  const last24hEvents = filterEventsInWindow(events, nowMs, 24 * 60 * 60 * 1000);
  const last7dEvents = filterEventsInWindow(events, nowMs, 7 * 24 * 60 * 60 * 1000);
  const last24h = summarizeWindow(last24hEvents);
  const last7d = summarizeWindow(last7dEvents);
  return {
    updatedAt: snapshot.updatedAt,
    totalEvents: snapshot.totalEvents,
    windows: {
      last24h,
      last7d
    },
    recommendations: buildRecommendations({ last24h, last7d })
  };
}

type UpgradeTelemetryWindowSummary = {
  events: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  warningViews: number;
  limitViews: number;
  totalViews: number;
  upgradeClicks: number;
  checkoutStarts: number;
  checkoutSuccesses: number;
  checkoutCancels: number;
  clickRateFromViews: number | null;
  checkoutStartRateFromClicks: number | null;
  checkoutSuccessRateFromStarts: number | null;
};

function summarizeWindow(events: UpgradeTelemetryEvent[]): UpgradeTelemetryWindowSummary {
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
  }
  const warningViews = byType.warning_view ?? 0;
  const limitViews = byType.limit_view ?? 0;
  const totalViews = warningViews + limitViews;
  const upgradeClicks = byType.upgrade_click ?? 0;
  const checkoutStarts = byType.checkout_started ?? 0;
  const checkoutSuccesses = byType.checkout_success ?? 0;
  const checkoutCancels = byType.checkout_cancelled ?? 0;
  return {
    events: events.length,
    byType,
    bySource,
    warningViews,
    limitViews,
    totalViews,
    upgradeClicks,
    checkoutStarts,
    checkoutSuccesses,
    checkoutCancels,
    clickRateFromViews: ratio(upgradeClicks, totalViews),
    checkoutStartRateFromClicks: ratio(checkoutStarts, upgradeClicks),
    checkoutSuccessRateFromStarts: ratio(checkoutSuccesses, checkoutStarts)
  };
}

function buildRecommendations(input: {
  last24h: UpgradeTelemetryWindowSummary;
  last7d: UpgradeTelemetryWindowSummary;
}): Array<{ id: string; severity: "info" | "warning"; message: string }> {
  const recommendations: Array<{ id: string; severity: "info" | "warning"; message: string }> = [];
  const { last24h, last7d } = input;
  const clickRate24h = last24h.clickRateFromViews;
  const startRate24h = last24h.checkoutStartRateFromClicks;
  const successRate7d = last7d.checkoutSuccessRateFromStarts;

  if (last24h.totalViews >= 20 && clickRate24h !== null && clickRate24h < 0.06) {
    recommendations.push({
      id: "click-rate-low",
      severity: "warning",
      message: "Upgrade click-through is low after warning exposure. Tune warning copy or CTA prominence."
    });
  }
  if (last24h.upgradeClicks >= 10 && startRate24h !== null && startRate24h < 0.55) {
    recommendations.push({
      id: "checkout-start-rate-low",
      severity: "warning",
      message: "Many users click upgrade but do not reach checkout. Verify checkout action wiring and button placement."
    });
  }
  if (last7d.checkoutStarts >= 10 && successRate7d !== null && successRate7d < 0.35) {
    recommendations.push({
      id: "checkout-success-rate-low",
      severity: "warning",
      message: "Checkout success return rate is low. Recheck pricing clarity and checkout/cancel return copy."
    });
  }
  if (recommendations.length === 0 && last7d.events > 0) {
    recommendations.push({
      id: "funnel-stable",
      severity: "info",
      message: "Upgrade funnel signals are currently stable."
    });
  }
  return recommendations;
}

function filterEventsInWindow(events: UpgradeTelemetryEvent[], nowMs: number, windowMs: number): UpgradeTelemetryEvent[] {
  const minTime = nowMs - windowMs;
  return events.filter((event) => {
    const atMs = Date.parse(event.at);
    return Number.isFinite(atMs) && atMs >= minTime && atMs <= nowMs;
  });
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(4));
}

async function withMutationLock<T>(mutation: () => Promise<T>): Promise<T> {
  const runMutation = mutationQueue.then(mutation, mutation);
  mutationQueue = runMutation.then(
    () => undefined,
    () => undefined
  );
  return runMutation;
}

async function readSnapshot(): Promise<UpgradeTelemetrySnapshot> {
  await ensureStoreExists();
  const raw = await fs.readFile(storeFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return UpgradeTelemetrySnapshotSchema.parse(parsed);
}

async function writeSnapshot(snapshot: UpgradeTelemetrySnapshot): Promise<void> {
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
          byType: {},
          bySource: {},
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
