/**
 * NoteBill Golden Test Corpus (Issue #55).
 */
export type {
  BillingField,
  CandidateLineItem,
  CandidateOutcome,
  ExpectedFact,
  ExpectedLineHint,
  ExpectedUnresolved,
  GoldenCase,
  GoldenCategory,
  MoneySafetyInvariantId
} from "./types.js";

export {
  adversarialViolatesMoneySafety,
  evaluateMoneySafetyInvariants,
  listRequiredInvariantIds,
  subjectMatches
} from "./invariants.js";

export type { InvariantCheckResult, InvariantViolation } from "./invariants.js";

export { GOLDEN_CASES, GOLDEN_CASE_COUNT } from "./GOLDEN_CASES.js";
