import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateIntakeReadiness } from "./intakeReadiness.js";

test("returns paste state when no invoice is captured yet", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "collecting",
    followUp: null,
    finishedInvoice: null,
    openDecisionCount: 0,
    pendingLaborRate: null
  });

  assert.equal(readiness.canGenerate, false);
  assert.equal(readiness.lockReason, "missing_input");
  assert.equal(readiness.wizardStep, "paste");
  assert.equal(readiness.targetPhase, "collecting");
});

test("returns labor_hours_missing when follow-up is open and rate is already known", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "awaiting_follow_up",
    followUp: { type: "labor_pricing" },
    finishedInvoice: { lineItems: [] },
    openDecisionCount: 0,
    pendingLaborRate: 95
  });

  assert.equal(readiness.canGenerate, false);
  assert.equal(readiness.needsFollowUp, true);
  assert.equal(readiness.needsLaborHoursOnly, true);
  assert.equal(readiness.lockReason, "labor_hours_missing");
  assert.equal(readiness.wizardStep, "decisions");
  assert.equal(readiness.targetPhase, "awaiting_follow_up");
});

test("blocks generation while open decisions remain", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "ready_to_summarize",
    followUp: null,
    finishedInvoice: { lineItems: [{ id: "line-1" }] },
    openDecisionCount: 2,
    pendingLaborRate: null
  });

  assert.equal(readiness.canGenerate, false);
  assert.equal(readiness.lockReason, "open_decisions");
  assert.equal(readiness.openDecisionCount, 2);
  assert.equal(readiness.wizardStep, "decisions");
});

test("marks summary state as confirmable when invoice is complete and has no open decisions", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "ready_to_summarize",
    followUp: null,
    finishedInvoice: { lineItems: [{ id: "line-1" }] },
    openDecisionCount: 0,
    pendingLaborRate: null
  });

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.needsSummaryConfirmation, true);
  assert.equal(readiness.lockReason, "ready");
  assert.equal(readiness.wizardStep, "confirm");
  assert.equal(readiness.targetPhase, "ready_to_summarize");
});

test("keeps ready_to_generate when invoice is complete and already confirmed", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "ready_to_generate",
    followUp: null,
    finishedInvoice: { lineItems: [{ id: "line-1" }] },
    openDecisionCount: 0,
    pendingLaborRate: null
  });

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.needsSummaryConfirmation, false);
  assert.equal(readiness.wizardStep, "confirm");
  assert.equal(readiness.targetPhase, "ready_to_generate");
});

test("does not stay in follow-up when phase says awaiting but followUp data is cleared", () => {
  const readiness = evaluateIntakeReadiness({
    intakePhase: "awaiting_follow_up",
    followUp: null,
    finishedInvoice: { lineItems: [{ id: "line-1" }] },
    openDecisionCount: 0,
    pendingLaborRate: null
  });

  assert.equal(readiness.needsFollowUp, false);
  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.targetPhase, "ready_to_summarize");
});
