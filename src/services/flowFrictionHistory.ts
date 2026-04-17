import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  isRuntimeStatePostgresEnabled,
  mutateRuntimeSnapshot,
  readRuntimeSnapshot
} from "./postgresRuntimeState.js";

const configuredHistoryPath = process.env.FLOW_FRICTION_HISTORY_FILE;
const historyFilePath = configuredHistoryPath
  ? path.resolve(process.cwd(), configuredHistoryPath)
  : path.resolve(process.cwd(), "data/flow-friction-history.json");
const historyDir = path.dirname(historyFilePath);
const runtimeStateBackend = isRuntimeStatePostgresEnabled() ? "postgres" : "file";
const FLOW_FRICTION_HISTORY_SNAPSHOT_KEY = "flow_friction_history";
const historySource =
  runtimeStateBackend === "postgres"
    ? `postgres:app_runtime_snapshots/${FLOW_FRICTION_HISTORY_SNAPSHOT_KEY}`
    : historyFilePath;

const FlowFrictionHistoryEntrySchema = z.object({
  timestamp: z.string(),
  totalChecks: z.number().int().nonnegative(),
  failedChecks: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative()
});

const FlowFrictionHistorySchema = z.array(FlowFrictionHistoryEntrySchema);

export type FlowFrictionHistoryEntry = z.infer<typeof FlowFrictionHistoryEntrySchema>;

export async function getFlowFrictionHistory(): Promise<FlowFrictionHistoryEntry[]> {
  if (runtimeStateBackend === "postgres") {
    return readRuntimeSnapshot(FLOW_FRICTION_HISTORY_SNAPSHOT_KEY, FlowFrictionHistorySchema, []);
  }

  try {
    const raw = await fs.readFile(historyFilePath, "utf8");
    const parsed = FlowFrictionHistorySchema.parse(JSON.parse(raw));
    return parsed;
  } catch (error) {
    if (isFileMissingError(error)) {
      return [];
    }
    return [];
  }
}

export async function appendFlowFrictionHistoryEntry(
  entry: FlowFrictionHistoryEntry
): Promise<FlowFrictionHistoryEntry[]> {
  const parsedEntry = FlowFrictionHistoryEntrySchema.parse(entry);
  if (runtimeStateBackend === "postgres") {
    return mutateRuntimeSnapshot(
      FLOW_FRICTION_HISTORY_SNAPSHOT_KEY,
      FlowFrictionHistorySchema,
      [],
      async (current) => [...current, parsedEntry].slice(-400)
    );
  }

  await fs.mkdir(historyDir, { recursive: true });
  const history = await getFlowFrictionHistory();
  const nextHistory = [...history, parsedEntry].slice(-400);
  await fs.writeFile(historyFilePath, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");
  return nextHistory;
}

export function getFlowFrictionHistoryPath(): string {
  return historySource;
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
