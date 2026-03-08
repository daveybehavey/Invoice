import { getOcrMetricsSnapshot } from "./ocrMetricsStore.js";
import { getFlowFrictionHistory } from "./flowFrictionHistory.js";

type WindowSummary = {
  total: number;
  low: number;
  lowRate: number;
};

type FrictionWindowSummary = {
  runs: number;
  totalChecks: number;
  failedChecks: number;
  failedRate: number;
  issueRuns: number;
};

export type IntakeTelemetryTrends = {
  generatedAt: string;
  ocr: {
    last24h: WindowSummary;
    last7d: WindowSummary;
  };
  friction: {
    historyAvailable: boolean;
    last24h: FrictionWindowSummary;
    last7d: FrictionWindowSummary;
  };
};

export async function getIntakeTelemetryTrends(now = new Date()): Promise<IntakeTelemetryTrends> {
  const [ocrSnapshot, frictionHistory] = await Promise.all([
    getOcrMetricsSnapshot(),
    getFlowFrictionHistory()
  ]);

  const nowMs = now.getTime();
  const dayWindowMs = 24 * 60 * 60 * 1000;
  const weekWindowMs = 7 * dayWindowMs;

  const ocrLast24h = summarizeOcrWindow(ocrSnapshot.recentEvents, nowMs - dayWindowMs);
  const ocrLast7d = summarizeOcrWindow(ocrSnapshot.recentEvents, nowMs - weekWindowMs);

  const frictionLast24h = summarizeFrictionWindow(frictionHistory, nowMs - dayWindowMs);
  const frictionLast7d = summarizeFrictionWindow(frictionHistory, nowMs - weekWindowMs);

  return {
    generatedAt: now.toISOString(),
    ocr: {
      last24h: ocrLast24h,
      last7d: ocrLast7d
    },
    friction: {
      historyAvailable: frictionHistory.length > 0,
      last24h: frictionLast24h,
      last7d: frictionLast7d
    }
  };
}

function summarizeOcrWindow(
  recentEvents: Array<{ at: string; confidence: "high" | "medium" | "low" }> | undefined,
  windowStartMs: number
): WindowSummary {
  const events = Array.isArray(recentEvents)
    ? recentEvents.filter((event) => {
        const eventMs = Date.parse(event.at);
        return Number.isFinite(eventMs) && eventMs >= windowStartMs;
      })
    : [];
  const total = events.length;
  const low = events.filter((event) => event.confidence === "low").length;
  return {
    total,
    low,
    lowRate: total > 0 ? Number((low / total).toFixed(4)) : 0
  };
}

function summarizeFrictionWindow(
  history: Array<{ timestamp: string; totalChecks: number; failedChecks: number; issueCount: number }>,
  windowStartMs: number
): FrictionWindowSummary {
  const runs = history.filter((entry) => {
    const entryMs = Date.parse(entry.timestamp);
    return Number.isFinite(entryMs) && entryMs >= windowStartMs;
  });
  const totalChecks = runs.reduce((sum, run) => sum + Number(run.totalChecks ?? 0), 0);
  const failedChecks = runs.reduce((sum, run) => sum + Number(run.failedChecks ?? 0), 0);
  const issueRuns = runs.reduce((sum, run) => sum + (Number(run.issueCount ?? 0) > 0 ? 1 : 0), 0);
  return {
    runs: runs.length,
    totalChecks,
    failedChecks,
    failedRate: totalChecks > 0 ? Number((failedChecks / totalChecks).toFixed(4)) : 0,
    issueRuns
  };
}
