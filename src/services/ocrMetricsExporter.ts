import { getOcrMetricsSnapshot, updateOcrMetricsExportState } from "./ocrMetricsStore.js";

export type OcrMetricsExportResult = {
  attempted: boolean;
  exported: boolean;
  reason: string;
  target?: string;
  statusCode?: number;
  snapshotUpdatedAt?: string;
};

function getExportTarget(): string {
  return (process.env.OCR_METRICS_EXPORT_URL ?? "").trim();
}

export function isOcrMetricsExportConfigured(): boolean {
  return getExportTarget().length > 0;
}

export async function exportOcrMetricsSnapshot(options?: {
  force?: boolean;
}): Promise<OcrMetricsExportResult> {
  const force = Boolean(options?.force);
  const target = getExportTarget();
  if (!target) {
    return { attempted: false, exported: false, reason: "not_configured" };
  }
  if (typeof fetch !== "function") {
    return { attempted: false, exported: false, reason: "fetch_unavailable", target };
  }

  const snapshot = await getOcrMetricsSnapshot();
  const snapshotUpdatedAt = snapshot.updatedAt ?? "";
  if (!snapshot.totalEvents || !snapshotUpdatedAt) {
    return {
      attempted: false,
      exported: false,
      reason: "empty_snapshot",
      target,
      snapshotUpdatedAt
    };
  }

  if (!force && snapshot.exportState?.lastExportedUpdatedAt === snapshotUpdatedAt) {
    return {
      attempted: false,
      exported: false,
      reason: "no_new_metrics",
      target,
      snapshotUpdatedAt
    };
  }

  const attemptAt = new Date().toISOString();
  await updateOcrMetricsExportState({
    lastAttemptAt: attemptAt,
    lastResult: "attempting"
  });

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telemetry-source": "invoice-ocr-confidence"
    },
    body: JSON.stringify({
      sentAt: attemptAt,
      snapshot
    })
  });

  if (!response.ok) {
    await updateOcrMetricsExportState({
      lastResult: `http_${response.status}`
    });
    return {
      attempted: true,
      exported: false,
      reason: "export_failed",
      target,
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
    target,
    statusCode: response.status,
    snapshotUpdatedAt
  };
}
