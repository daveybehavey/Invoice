export type IntakePhase =
  | "collecting"
  | "awaiting_follow_up"
  | "ready_to_summarize"
  | "ready_to_generate";

export type IntakeLockReason =
  | "ready"
  | "labor_hours_missing"
  | "labor_pricing_missing"
  | "open_decisions"
  | "output_quality_review"
  | "review_required"
  | "missing_input";

export type IntakeWizardStep = "paste" | "review" | "decisions" | "confirm";

export interface IntakeReadinessInput {
  intakePhase: IntakePhase;
  followUp: unknown;
  finishedInvoice: unknown;
  openDecisionCount: number;
  qualityBlockerCount?: number;
  pendingLaborRate: number | null | undefined;
}

export interface IntakeReadinessState {
  hasFinishedInvoice: boolean;
  needsFollowUp: boolean;
  needsLaborHoursOnly: boolean;
  openDecisionCount: number;
  qualityBlockerCount: number;
  canGenerate: boolean;
  needsSummaryConfirmation: boolean;
  lockReason: IntakeLockReason;
  helperText: string;
  wizardStep: IntakeWizardStep;
  targetPhase: IntakePhase;
}

const HELPER_TEXT_BY_REASON: Record<IntakeLockReason, string> = {
  ready: "Ready to generate.",
  labor_hours_missing: "Add missing hours to continue.",
  labor_pricing_missing: "Add labor pricing to continue.",
  open_decisions: "Choose Add or Skip to continue.",
  output_quality_review: "Review flagged items to continue.",
  review_required: "Review the draft, then generate.",
  missing_input: "Paste notes to start."
};

export function evaluateIntakeReadiness({
  intakePhase,
  followUp,
  finishedInvoice,
  openDecisionCount,
  qualityBlockerCount,
  pendingLaborRate
}: IntakeReadinessInput): IntakeReadinessState {
  const normalizedDecisionCount =
    Number.isFinite(openDecisionCount) && openDecisionCount > 0 ? Math.floor(openDecisionCount) : 0;
  const normalizedQualityBlockerCount =
    Number.isFinite(qualityBlockerCount) && Number(qualityBlockerCount) > 0
      ? Math.floor(Number(qualityBlockerCount))
      : 0;
  const hasFinishedInvoice = Boolean(finishedInvoice);
  // Data authority first: follow-up payload drives follow-up state, not phase labels.
  const needsFollowUp = Boolean(followUp);
  const needsLaborHoursOnly = needsFollowUp && Number.isFinite(pendingLaborRate);
  const canGenerate =
    hasFinishedInvoice &&
    normalizedDecisionCount === 0 &&
    normalizedQualityBlockerCount === 0 &&
    !needsFollowUp;
  const needsSummaryConfirmation = canGenerate && intakePhase !== "ready_to_generate";

  let lockReason: IntakeLockReason = "missing_input";
  if (canGenerate) {
    lockReason = "ready";
  } else if (needsLaborHoursOnly) {
    lockReason = "labor_hours_missing";
  } else if (needsFollowUp) {
    lockReason = "labor_pricing_missing";
  } else if (normalizedDecisionCount > 0) {
    lockReason = "open_decisions";
  } else if (normalizedQualityBlockerCount > 0) {
    lockReason = "output_quality_review";
  } else if (hasFinishedInvoice) {
    lockReason = "review_required";
  }

  const wizardStep: IntakeWizardStep = (() => {
      if (!hasFinishedInvoice && !needsFollowUp) {
        return "paste";
      }
      if (needsFollowUp || normalizedDecisionCount > 0) {
        return "decisions";
      }
      if (normalizedQualityBlockerCount > 0) {
        return "review";
      }
      if (hasFinishedInvoice && normalizedDecisionCount === 0) {
        return "confirm";
      }
    return "review";
  })();

  const targetPhase: IntakePhase = (() => {
    if (needsFollowUp) {
      return "awaiting_follow_up";
    }
    if (!hasFinishedInvoice) {
      return "collecting";
    }
    if (normalizedDecisionCount > 0) {
      return "ready_to_summarize";
    }
    if (intakePhase === "ready_to_generate") {
      return "ready_to_generate";
    }
      return "ready_to_summarize";
    })();

  return {
    hasFinishedInvoice,
    needsFollowUp,
    needsLaborHoursOnly,
    openDecisionCount: normalizedDecisionCount,
    qualityBlockerCount: normalizedQualityBlockerCount,
    canGenerate,
    needsSummaryConfirmation,
    lockReason,
    helperText: HELPER_TEXT_BY_REASON[lockReason],
    wizardStep,
    targetPhase
  };
}
