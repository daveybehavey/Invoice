import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const configuredReportPath = process.env.FLOW_FRICTION_REPORT_FILE;
const reportFilePath = configuredReportPath
  ? path.resolve(process.cwd(), configuredReportPath)
  : path.resolve(process.cwd(), "docs/flow-friction-latest.json");
const reportDir = path.dirname(reportFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const FLOW_FRICTION_REPORT_SNAPSHOT_KEY = "flow_friction_report";
const reportSource =
  runtimeStateBackend === "postgres"
    ? `postgres:app_runtime_snapshots/${FLOW_FRICTION_REPORT_SNAPSHOT_KEY}`
    : reportFilePath;

const FlowFrictionCheckSchema = z.object({
  name: z.string(),
  pass: z.boolean(),
  details: z.string().default("")
});

const FlowFrictionIssueSchema = z.union([
  z.string().transform((message) => ({
    severity: "info",
    message,
    details: ""
  })),
  z.object({
    severity: z.string().default("info"),
    message: z.string(),
    details: z.string().default("")
  })
]);

const FlowFrictionReportSchema = z.object({
  timestamp: z.string().default(""),
  baseUrl: z.string().default(""),
  checks: z.array(FlowFrictionCheckSchema).default([]),
  issues: z.array(FlowFrictionIssueSchema).default([])
});

type FlowFrictionReport = z.infer<typeof FlowFrictionReportSchema>;
export type FlowFrictionIssue = z.infer<typeof FlowFrictionIssueSchema>;

export type FlowFrictionSnapshot = FlowFrictionReport & {
  available: boolean;
  source: string;
  reason?: "missing_report" | "invalid_report";
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    issueCount: number;
  };
};

const EMPTY_FLOW_FRICTION_REPORT: FlowFrictionReport = {
  timestamp: "",
  baseUrl: "",
  checks: [],
  issues: []
};

export async function getFlowFrictionSnapshot(): Promise<FlowFrictionSnapshot> {
  if (runtimeStateBackend === "postgres") {
    try {
      const parsed = await readRuntimeSnapshot(
        FLOW_FRICTION_REPORT_SNAPSHOT_KEY,
        FlowFrictionReportSchema,
        EMPTY_FLOW_FRICTION_REPORT
      );
      if (isEmptyReport(parsed)) {
        return emptySnapshot("missing_report");
      }
      return {
        ...parsed,
        available: true,
        source: reportSource,
        summary: summarizeReport(parsed)
      };
    } catch (_error) {
      return emptySnapshot("invalid_report");
    }
  }

  try {
    const raw = await fs.readFile(reportFilePath, "utf8");
    const parsed = FlowFrictionReportSchema.parse(JSON.parse(raw));
    return {
      ...parsed,
      available: true,
      source: reportSource,
      summary: summarizeReport(parsed)
    };
  } catch (error) {
    if (isFileMissingError(error)) {
      return emptySnapshot("missing_report");
    }
    return emptySnapshot("invalid_report");
  }
}

export async function writeFlowFrictionReport(
  report: z.input<typeof FlowFrictionReportSchema>
): Promise<FlowFrictionReport> {
  const parsed = FlowFrictionReportSchema.parse(report);

  if (runtimeStateBackend === "postgres") {
    await mutateRuntimeSnapshot(
      FLOW_FRICTION_REPORT_SNAPSHOT_KEY,
      FlowFrictionReportSchema,
      EMPTY_FLOW_FRICTION_REPORT,
      async () => parsed
    );
    return parsed;
  }

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportFilePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function getFlowFrictionReportSource(): string {
  return reportSource;
}

function summarizeReport(report: FlowFrictionReport) {
  const totalChecks = report.checks.length;
  const passedChecks = report.checks.filter((check) => check.pass).length;
  const failedChecks = totalChecks - passedChecks;
  return {
    totalChecks,
    passedChecks,
    failedChecks,
    issueCount: report.issues.length
  };
}

function emptySnapshot(reason: FlowFrictionSnapshot["reason"]): FlowFrictionSnapshot {
  return {
    available: false,
    reason,
    source: reportSource,
    timestamp: "",
    baseUrl: "",
    checks: [],
    issues: [],
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      issueCount: 0
    }
  };
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isEmptyReport(report: FlowFrictionReport): boolean {
  return !report.timestamp && !report.baseUrl && report.checks.length === 0 && report.issues.length === 0;
}
