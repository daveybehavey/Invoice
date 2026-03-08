import { getOcrMetricsSnapshot, updateOcrMetricsExportState } from "./ocrMetricsStore.js";

export type OcrMetricsExportResult = {
  attempted: boolean;
  exported: boolean;
  reason: string;
  target?: string;
  provider?: string;
  statusCode?: number;
  snapshotUpdatedAt?: string;
};

type OcrExportProvider = "webhook" | "ga4" | "segment";

type OcrExportRequest = {
  provider: OcrExportProvider;
  target: string;
  headers: Record<string, string>;
  body: string;
};

function getExportProvider(): OcrExportProvider {
  const raw = (process.env.OCR_METRICS_EXPORT_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "ga4" || raw === "segment") {
    return raw;
  }
  return "webhook";
}

function getWebhookTarget(): string {
  return (process.env.OCR_METRICS_EXPORT_URL ?? "").trim();
}

function getGa4Config():
  | { measurementId: string; apiSecret: string; endpoint: string }
  | null {
  const measurementId = (process.env.OCR_METRICS_GA4_MEASUREMENT_ID ?? "").trim();
  const apiSecret = (process.env.OCR_METRICS_GA4_API_SECRET ?? "").trim();
  if (!measurementId || !apiSecret) {
    return null;
  }
  const endpoint = (
    process.env.OCR_METRICS_GA4_ENDPOINT ?? "https://www.google-analytics.com/mp/collect"
  ).trim();
  if (!endpoint) {
    return null;
  }
  return { measurementId, apiSecret, endpoint };
}

function getSegmentConfig(): { writeKey: string; endpoint: string } | null {
  const writeKey = (process.env.OCR_METRICS_SEGMENT_WRITE_KEY ?? "").trim();
  if (!writeKey) {
    return null;
  }
  const endpoint = (
    process.env.OCR_METRICS_SEGMENT_ENDPOINT ?? "https://api.segment.io/v1/track"
  ).trim();
  if (!endpoint) {
    return null;
  }
  return { writeKey, endpoint };
}

function buildMetricsSummary(snapshot: Awaited<ReturnType<typeof getOcrMetricsSnapshot>>) {
  const totalEvents = Number(snapshot.totalEvents ?? 0);
  const confidenceCounts = snapshot.byConfidence ?? { high: 0, medium: 0, low: 0 };
  const confidenceReasons = snapshot.byReason ?? {};
  const totalWarnings = Array.isArray(snapshot.recentEvents)
    ? snapshot.recentEvents.reduce((sum, event) => sum + Number(event.warningCount ?? 0), 0)
    : 0;
  const lowShare = totalEvents > 0 ? confidenceCounts.low / totalEvents : 0;
  return {
    totalEvents,
    totalWarnings,
    highCount: Number(confidenceCounts.high ?? 0),
    mediumCount: Number(confidenceCounts.medium ?? 0),
    lowCount: Number(confidenceCounts.low ?? 0),
    lowShare: Number(lowShare.toFixed(4)),
    updatedAt: snapshot.updatedAt ?? "",
    confidenceReasons
  };
}

function buildExportRequest(
  snapshot: Awaited<ReturnType<typeof getOcrMetricsSnapshot>>,
  sentAt: string
): OcrExportRequest | null {
  const provider = getExportProvider();
  const metrics = buildMetricsSummary(snapshot);
  if (provider === "ga4") {
    const config = getGa4Config();
    if (!config) {
      return null;
    }
    const query = new URLSearchParams({
      measurement_id: config.measurementId,
      api_secret: config.apiSecret
    });
    return {
      provider,
      target: `${config.endpoint}?${query.toString()}`,
      headers: {
        "content-type": "application/json",
        "x-telemetry-source": "invoice-ocr-confidence"
      },
      body: JSON.stringify({
        client_id: "invoice-launcher-system",
        non_personalized_ads: true,
        events: [
          {
            name: "ocr_confidence_snapshot",
            params: {
              total_events: metrics.totalEvents,
              total_warnings: metrics.totalWarnings,
              confidence_high: metrics.highCount,
              confidence_medium: metrics.mediumCount,
              confidence_low: metrics.lowCount,
              low_share: metrics.lowShare,
              updated_at: metrics.updatedAt
            }
          }
        ]
      })
    };
  }
  if (provider === "segment") {
    const config = getSegmentConfig();
    if (!config) {
      return null;
    }
    const authToken = Buffer.from(`${config.writeKey}:`, "utf8").toString("base64");
    return {
      provider,
      target: config.endpoint,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${authToken}`,
        "x-telemetry-source": "invoice-ocr-confidence"
      },
      body: JSON.stringify({
        type: "track",
        event: "OCR Confidence Snapshot Exported",
        userId: "invoice-launcher-system",
        properties: metrics,
        timestamp: sentAt,
        context: {
          source: "invoice-ocr-confidence"
        }
      })
    };
  }

  const target = getWebhookTarget();
  if (!target) {
    return null;
  }
  return {
    provider: "webhook",
    target,
    headers: {
      "content-type": "application/json",
      "x-telemetry-source": "invoice-ocr-confidence"
    },
    body: JSON.stringify({
      sentAt,
      snapshot
    })
  };
}

export function isOcrMetricsExportConfigured(): boolean {
  const provider = getExportProvider();
  if (provider === "ga4") {
    return Boolean(getGa4Config());
  }
  if (provider === "segment") {
    return Boolean(getSegmentConfig());
  }
  return getWebhookTarget().length > 0;
}

export async function exportOcrMetricsSnapshot(options?: {
  force?: boolean;
}): Promise<OcrMetricsExportResult> {
  const force = Boolean(options?.force);
  const provider = getExportProvider();
  if (!isOcrMetricsExportConfigured()) {
    return { attempted: false, exported: false, reason: "not_configured", provider };
  }
  if (typeof fetch !== "function") {
    return { attempted: false, exported: false, reason: "fetch_unavailable", provider };
  }

  const snapshot = await getOcrMetricsSnapshot();
  const snapshotUpdatedAt = snapshot.updatedAt ?? "";
  if (!snapshot.totalEvents || !snapshotUpdatedAt) {
    return {
      attempted: false,
      exported: false,
      reason: "empty_snapshot",
      provider,
      snapshotUpdatedAt
    };
  }

  if (!force && snapshot.exportState?.lastExportedUpdatedAt === snapshotUpdatedAt) {
    return {
      attempted: false,
      exported: false,
      reason: "no_new_metrics",
      provider,
      snapshotUpdatedAt
    };
  }

  const attemptAt = new Date().toISOString();
  await updateOcrMetricsExportState({
    lastAttemptAt: attemptAt,
    lastResult: "attempting"
  });

  const request = buildExportRequest(snapshot, attemptAt);
  if (!request) {
    await updateOcrMetricsExportState({
      lastResult: "not_configured"
    });
    return {
      attempted: false,
      exported: false,
      reason: "not_configured",
      provider,
      snapshotUpdatedAt
    };
  }

  const response = await fetch(request.target, {
    method: "POST",
    headers: request.headers,
    body: request.body
  });

  if (!response.ok) {
    await updateOcrMetricsExportState({
      lastResult: `http_${response.status}`
    });
    return {
      attempted: true,
      exported: false,
      reason: "export_failed",
      target: request.target,
      provider: request.provider,
      statusCode: response.status,
      snapshotUpdatedAt
    };
  }

  await updateOcrMetricsExportState({
    lastSuccessAt: attemptAt,
    lastExportedUpdatedAt: snapshotUpdatedAt,
    lastResult: "success"
  });
  return {
    attempted: true,
    exported: true,
    reason: "exported",
    target: request.target,
    provider: request.provider,
    statusCode: response.status,
    snapshotUpdatedAt
  };
}
