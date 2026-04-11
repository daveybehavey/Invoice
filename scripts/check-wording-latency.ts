import "dotenv/config";
import process from "node:process";
import { performance } from "node:perf_hooks";
import type { FinishedInvoice } from "../src/models/invoice.js";
import {
  changeDescriptionsWording,
  changeLineWording,
  changeNotesWording,
  rewordFullInvoice
} from "../src/services/invoicePipeline.js";

type ActionKey = "line" | "notes" | "descriptions" | "full";
type ActionSummary = {
  action: ActionKey | "combined";
  runs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
};

const ACTION_KEYS: ActionKey[] = ["line", "notes", "descriptions", "full"];
const DEFAULT_RUNS = 3;
const DEFAULT_TARGET_P50_MS = 2_000;
const DEFAULT_TARGET_P95_MS = 5_000;
const DEFAULT_TONE = "Professional";

const sampleInvoice: FinishedInvoice = {
  invoiceNumber: "NB-LATENCY-001",
  issueDate: "2026-03-19",
  customerName: "Latency Check Customer",
  currency: "USD",
  lineItems: [
    {
      id: "line-1",
      type: "labor",
      description: "faucet leak repair and cartridge install",
      quantity: 2,
      unitPrice: 95,
      amount: 190
    },
    {
      id: "line-2",
      type: "material",
      description: "replacement cartridge",
      quantity: 1,
      unitPrice: 18.75,
      amount: 18.75
    },
    {
      id: "line-3",
      type: "material",
      description: "washer kit",
      quantity: 1,
      unitPrice: 6,
      amount: 6
    }
  ],
  notes: "Please remit payment within 7 days. Thanks for your business.",
  subtotal: 214.75,
  taxRate: 5,
  taxAmount: 10.74,
  total: 225.49,
  balanceDue: 225.49
};

function parseIntegerFlag(args: string[], key: string, fallback: number): number {
  const prefix = `${key}=`;
  const raw = args.find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw.slice(prefix.length), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseNumberFlag(args: string[], key: string, fallback: number): number {
  const prefix = `${key}=`;
  const raw = args.find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return fallback;
  }
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseActions(args: string[]): ActionKey[] {
  const prefix = "--actions=";
  const raw = args.find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return ACTION_KEYS;
  }
  const parsed = raw
    .slice(prefix.length)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ActionKey => ACTION_KEYS.includes(value as ActionKey));
  return parsed.length > 0 ? parsed : ACTION_KEYS;
}

function parseStringFlag(args: string[], key: string, fallback: string): string {
  const prefix = `${key}=`;
  const raw = args.find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return fallback;
  }
  const value = raw.slice(prefix.length).trim();
  return value.length > 0 ? value : fallback;
}

function percentile(values: number[], targetPercentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(100, targetPercentile));
  const index = Math.ceil((clamped / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function summarize(action: ActionKey | "combined", durationsMs: number[]): ActionSummary {
  const runs = durationsMs.length;
  const minMs = Math.min(...durationsMs);
  const maxMs = Math.max(...durationsMs);
  const avgMs = durationsMs.reduce((sum, value) => sum + value, 0) / runs;
  return {
    action,
    runs,
    minMs,
    maxMs,
    avgMs,
    p50Ms: percentile(durationsMs, 50),
    p95Ms: percentile(durationsMs, 95)
  };
}

function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}

function cloneSampleInvoice(): FinishedInvoice {
  return {
    ...sampleInvoice,
    lineItems: sampleInvoice.lineItems.map((lineItem) => ({ ...lineItem }))
  };
}

async function runAction(action: ActionKey, tone: string): Promise<void> {
  const draft = cloneSampleInvoice();
  switch (action) {
    case "line":
      await changeLineWording(draft, "line-1", tone);
      return;
    case "notes":
      await changeNotesWording(draft, tone);
      return;
    case "descriptions":
      await changeDescriptionsWording(draft, tone);
      return;
    case "full":
      await rewordFullInvoice(draft, tone);
      return;
    default: {
      const neverAction: never = action;
      throw new Error(`Unsupported action "${neverAction}".`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: tsx scripts/check-wording-latency.ts [--runs=3] [--actions=line,notes,descriptions,full]");
    console.log("       [--target-p50=2000] [--target-p95=5000] [--assert] [--json]");
    console.log("       [--tone=Professional]");
    process.exit(0);
  }

  const runs = parseIntegerFlag(args, "--runs", DEFAULT_RUNS);
  const actions = parseActions(args);
  const tone = parseStringFlag(args, "--tone", DEFAULT_TONE);
  const targetP50 = parseNumberFlag(args, "--target-p50", DEFAULT_TARGET_P50_MS);
  const targetP95 = parseNumberFlag(args, "--target-p95", DEFAULT_TARGET_P95_MS);
  const shouldAssert = args.includes("--assert");
  const asJson = args.includes("--json");

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for wording-latency checks.");
  }

  const summaries: ActionSummary[] = [];
  const durationByAction = new Map<ActionKey, number[]>();
  for (const action of actions) {
    const durationsMs: number[] = [];
    for (let index = 0; index < runs; index += 1) {
      const start = performance.now();
      await runAction(action, tone);
      const elapsed = performance.now() - start;
      durationsMs.push(elapsed);
      console.log(`[${action}] run ${index + 1}/${runs} -> ${formatDuration(elapsed)}`);
    }
    durationByAction.set(action, durationsMs);
    summaries.push(summarize(action, durationsMs));
  }

  const combinedDurations = actions.flatMap((action) => durationByAction.get(action) ?? []);
  const combinedSummary = summarize("combined", combinedDurations);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          targetsMs: { p50: targetP50, p95: targetP95 },
          actions: summaries,
          combined: {
            runs: combinedSummary.runs,
            p50Ms: combinedSummary.p50Ms,
            p95Ms: combinedSummary.p95Ms,
            avgMs: combinedSummary.avgMs
          }
        },
        null,
        2
      )
    );
  } else {
    console.log("\nWording latency summary:");
    for (const summary of summaries) {
      console.log(
        `- ${summary.action}: p50 ${formatDuration(summary.p50Ms)}, p95 ${formatDuration(summary.p95Ms)}, avg ${formatDuration(summary.avgMs)}, min ${formatDuration(summary.minMs)}, max ${formatDuration(summary.maxMs)}`
      );
    }
    console.log(
      `- combined: p50 ${formatDuration(combinedSummary.p50Ms)}, p95 ${formatDuration(combinedSummary.p95Ms)}, avg ${formatDuration(combinedSummary.avgMs)}`
    );
    console.log(`- tone: ${tone}`);
    console.log(`- targets: p50 < ${formatDuration(targetP50)}, p95 < ${formatDuration(targetP95)}`);
  }

  if (shouldAssert) {
    const failed = summaries.filter((summary) => summary.p50Ms > targetP50 || summary.p95Ms > targetP95);
    if (failed.length > 0) {
      throw new Error(
        `Wording latency targets failed for: ${failed.map((summary) => summary.action).join(", ")}`
      );
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Wording latency check failed: ${message}`);
  process.exit(1);
});
