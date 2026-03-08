import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const configuredHistoryPath = process.env.FLOW_FRICTION_HISTORY_FILE;
const historyFilePath = configuredHistoryPath
  ? path.resolve(process.cwd(), configuredHistoryPath)
  : path.resolve(process.cwd(), "data/flow-friction-history.json");

const FlowFrictionHistoryEntrySchema = z.object({
  timestamp: z.string(),
  totalChecks: z.number().int().nonnegative(),
  failedChecks: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative()
});

const FlowFrictionHistorySchema = z.array(FlowFrictionHistoryEntrySchema);

export type FlowFrictionHistoryEntry = z.infer<typeof FlowFrictionHistoryEntrySchema>;

export async function getFlowFrictionHistory(): Promise<FlowFrictionHistoryEntry[]> {
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

export function getFlowFrictionHistoryPath(): string {
  return historyFilePath;
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
