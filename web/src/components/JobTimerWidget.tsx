import { useEffect, useState } from "react";
import { Clock, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { getJobTimerState, saveJobTimerState } from "../lib/localStore";
import { formatMoney, roundToCents } from "../lib/money";
import type { JobTimerState } from "../lib/types";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function roundHours(ms: number, roundingMinutes: 1 | 15 | 30): number {
  const rawMinutes = Math.max(1, ms / 60000);
  if (roundingMinutes === 1) {
    return Math.max(0.05, Math.round((rawMinutes / 60) * 100) / 100);
  }
  const roundedMins = Math.ceil(rawMinutes / roundingMinutes) * roundingMinutes;
  return Math.round((roundedMins / 60) * 100) / 100;
}

export function JobTimerWidget({
  defaultHourlyRate = 95,
  currency = "USD",
  onAddTime
}: {
  defaultHourlyRate?: number;
  currency?: string;
  onAddTime: (input: { description: string; hours: number; rate: number }) => void;
}) {
  const [timer, setTimer] = useState<JobTimerState>(() => getJobTimerState(defaultHourlyRate));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    saveJobTimerState(timer);
  }, [timer]);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [timer.running]);

  const elapsedMs =
    timer.accumulatedMs + (timer.running && timer.startedAtMs ? Math.max(0, nowMs - timer.startedAtMs) : 0);
  const billableHours = elapsedMs > 0 ? roundHours(elapsedMs, timer.roundingMinutes) : 0;
  const estimatedAmount = roundToCents(billableHours * timer.hourlyRate);

  const toggleRun = () => {
    const now = Date.now();
    if (timer.running) {
      const gained = timer.startedAtMs ? Math.max(0, now - timer.startedAtMs) : 0;
      setTimer((p) => ({
        ...p,
        running: false,
        startedAtMs: null,
        accumulatedMs: p.accumulatedMs + gained
      }));
    } else {
      setNowMs(now);
      setTimer((p) => ({
        ...p,
        running: true,
        startedAtMs: now
      }));
    }
  };

  const reset = () => {
    setTimer((p) => ({
      ...p,
      running: false,
      startedAtMs: null,
      accumulatedMs: 0
    }));
  };

  const handleAdd = () => {
    if (elapsedMs <= 0) return;
    onAddTime({
      description: timer.description.trim() || "On-site job labor",
      hours: billableHours,
      rate: timer.hourlyRate
    });
    reset();
  };

  return (
    <div className="rounded-xl border border-[#E2E7E3] bg-[#F5F6F2]/70 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${timer.running ? "animate-pulse text-[#0F5132]" : "text-[#47554E]"}`} />
          <span className="font-mono text-lg font-bold tabular-nums text-[#101915]">
            {formatDuration(elapsedMs)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleRun}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
              timer.running ? "bg-[#B45309] hover:bg-[#92400E]" : "bg-[#0F5132] hover:bg-[#146C43]"
            }`}
          >
            {timer.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{timer.running ? "Pause" : elapsedMs > 0 ? "Resume" : "Start Job"}</span>
          </button>
          {elapsedMs > 0 && (
            <button
              type="button"
              onClick={reset}
              title="Reset timer"
              className="rounded-lg border border-[#D9E0DC] bg-white p-1.5 text-[#6B7A72] hover:text-[#9F1239]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="text"
          value={timer.description}
          onChange={(e) => setTimer((p) => ({ ...p, description: e.target.value }))}
          placeholder="Labor description"
          className="sm:col-span-2 rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0F5132]"
        />
        <div className="flex items-center gap-1 rounded-lg border border-[#D9E0DC] bg-white px-2.5 py-1.5">
          <span className="text-xs text-[#6B7A72]">$</span>
          <input
            type="number"
            min="0"
            step="any"
            aria-label="Hourly rate"
            value={timer.hourlyRate}
            onChange={(e) =>
              setTimer((p) => ({ ...p, hourlyRate: Math.max(0, Number(e.target.value) || 0) }))
            }
            className="w-full font-mono text-xs outline-none"
          />
          <span className="text-[11px] text-[#6B7A72]">/hr</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-[#6B7A72]">Round:</span>
          {([1, 15, 30] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTimer((p) => ({ ...p, roundingMinutes: m }))}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                timer.roundingMinutes === m
                  ? "bg-[#101915] text-white"
                  : "bg-white text-[#47554E] border border-[#D9E0DC]"
              }`}
            >
              {m === 1 ? "Exact" : `${m}m`}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={elapsedMs <= 0}
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-lg bg-[#101915] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F5132] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>
            Add {billableHours || 0}h ({formatMoney(estimatedAmount, currency)})
          </span>
        </button>
      </div>
    </div>
  );
}
