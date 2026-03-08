import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const configuredReportPath = process.env.FLOW_FRICTION_REPORT_FILE;
const reportFilePath = configuredReportPath
  ? path.resolve(process.cwd(), configuredReportPath)
  : path.resolve(process.cwd(), "docs/flow-friction-latest.json");

const FlowFrictionCheckSchema = z.object({
  name: z.string(),
  pass: z.boolean(),
  details: z.string().default("")
});

const FlowFrictionReportSchema = z.object({
  timestamp: z.string().default(""),
  baseUrl: z.string().default(""),
  checks: z.array(FlowFrictionCheckSchema).default([]),
  issues: z.array(z.string()).default([])
});

type FlowFrictionReport = z.infer<typeof FlowFrictionReportSchema>;

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

export async function getFlowFrictionSnapshot(): Promise<FlowFrictionSnapshot> {
  try {
    const raw = await fs.readFile(reportFilePath, "utf8");
    const parsed = FlowFrictionReportSchema.parse(JSON.parse(raw));
    return {
      ...parsed,
      available: true,
      source: reportFilePath,
      summary: summarizeReport(parsed)
    };
  } catch (error) {
    if (isFileMissingError(error)) {
      return emptySnapshot("missing_report");
    }
    return emptySnapshot("invalid_report");
  }
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
    source: reportFilePath,
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
