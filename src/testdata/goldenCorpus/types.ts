/**
 * NoteBill Golden Test Corpus — shared types (Issue #55).
 * Machine-readable fixtures for adversarial messy-billing scenarios.
 */

export type GoldenCategory =
  | "missing_price"
  | "missing_quantity"
  | "later_correction"
  | "two_workers"
  | "ambiguous_hours"
  | "free_no_charge"
  | "deposit_paid"
  | "unit_vs_total_price"
  | "similar_material_names"
  | "same_noun_different_tasks"
  | "unknown_tax"
  | "multiple_jobs"
  | "voice_transcription"
  | "contradictory_statements"
  | "decimal_hours_currency"
  | "discounts_credits"
  | "descriptive_non_billable"
  | "money_safety_combo";

/** Hard money-safety invariants from Issue #55. */
export type MoneySafetyInvariantId =
  | "unknown_price_not_zero"
  | "unknown_quantity_not_one"
  | "no_evidence_no_invented_money"
  | "free_is_subject_bound"
  | "deterministic_arithmetic_only"
  | "unresolved_facts_visible"
  | "blockers_prevent_silent_finalization"
  | "later_evidence_field_scoped";

export type BillingField = "quantity" | "price" | "cost" | "rate" | "hours" | "amount" | "tax" | "deposit" | "discount";

export type ExpectedFact = {
  subject: string;
  kind: "material" | "labor" | "job" | "payment" | "tax" | "discount" | "note";
  field?: BillingField;
  /** known | unresolved | waived | explicit_zero */
  state: "known" | "unresolved" | "waived" | "explicit_zero";
  value?: number;
  note?: string;
};

export type ExpectedUnresolved = {
  subject: string;
  field: BillingField;
  reason: string;
};

export type ExpectedLineHint = {
  descriptionMatch: string; // regex source
  type?: "labor" | "material" | "discount" | "other";
  /** If set, amount must equal this (deterministic). */
  amount?: number | null;
  /** If true, amount/unitPrice must be absent or undefined (not invented). */
  amountMustBeAbsent?: boolean;
  quantity?: number | null;
  quantityMustBeAbsent?: boolean;
  unitPrice?: number | null;
  unitPriceMustBeAbsent?: boolean;
  /** Explicit $0 only when waived/free for this subject. */
  allowExplicitZero?: boolean;
};

export type CandidateLineItem = {
  id?: string;
  type?: "labor" | "material" | "discount" | "other";
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
};

export type CandidateOutcome = {
  /** Label for adversarial / safe fixture. */
  label: string;
  lineItems: CandidateLineItem[];
  openDecisions?: Array<{ prompt: string; kind?: string; sourceSnippet?: string; subjectHint?: string; fieldHint?: string }>;
  assumptions?: string[];
  needsFollowUp?: boolean;
  qualityGateStatus?: "pass" | "needs_review" | "blocked";
  subtotal?: number;
  total?: number;
  taxRate?: number;
  discountAmount?: number;
  depositApplied?: number;
  /** Marks this outcome as intentionally unsafe for negative tests. */
  expectViolations?: boolean;
  /** If set, only these invariant ids are expected to fire (subset check). */
  expectedViolationIds?: MoneySafetyInvariantId[];
};

export type GoldenCase = {
  id: string;
  category: GoldenCategory;
  title: string;
  messyInput: string;
  expectedFacts: ExpectedFact[];
  expectedUnresolved: ExpectedUnresolved[];
  expectedLineHints: ExpectedLineHint[];
  /** Invariants that must never be violated for this case. */
  invariants: MoneySafetyInvariantId[];
  rationale: string;
  /** Prior AG scenarios reused where valid. */
  relatedAG?: Array<"AG-082" | "AG-088" | "AG-094">;
  /** Expansion tags toward ~100 corpus. */
  tags?: string[];
  /** Known-bad and known-good candidate outcomes for the invariant checker. */
  candidates: CandidateOutcome[];
};
