/**
 * Hard money-safety invariant checker for the NoteBill Golden Corpus (Issue #55).
 *
 * Pure fixture evaluation — does not call the live pipeline or invent pricing.
 * Reuses the AG-082 / AG-088 / AG-094 contract: unknown ≠ default, free is subject-bound,
 * unresolved must stay visible, blockers prevent silent finalization.
 */

import type {
  CandidateLineItem,
  CandidateOutcome,
  ExpectedFact,
  ExpectedLineHint,
  ExpectedUnresolved,
  GoldenCase,
  MoneySafetyInvariantId
} from "./types.js";

const MONEY_TOLERANCE = 0.009;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export type InvariantViolation = {
  id: MoneySafetyInvariantId;
  message: string;
  lineDescription?: string;
};

export type InvariantCheckResult = {
  ok: boolean;
  violations: InvariantViolation[];
};

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return norm(text)
    .split(" ")
    .filter(Boolean);
}

/** Loose subject match: all significant tokens of needle appear in haystack. */
export function subjectMatches(haystack: string, needle: string): boolean {
  const needleTokens = tokens(needle).filter((t) => t.length > 2);
  if (needleTokens.length === 0) {
    return norm(haystack).includes(norm(needle));
  }
  const hay = new Set(tokens(haystack));
  return needleTokens.every((t) => hay.has(t) || [...hay].some((h) => h.includes(t) || t.includes(h)));
}

/** Stricter identity: same significant token set (order-insensitive). */
export function subjectsEquivalent(left: string, right: string): boolean {
  const leftTokens = tokens(left).filter((t) => t.length > 2).sort();
  const rightTokens = tokens(right).filter((t) => t.length > 2).sort();
  if (!leftTokens.length || !rightTokens.length) {
    return norm(left) === norm(right);
  }
  return leftTokens.join(" ") === rightTokens.join(" ");
}

function findLines(lines: CandidateLineItem[], match: string): CandidateLineItem[] {
  const re = new RegExp(match, "i");
  return lines.filter((line) => re.test(line.description));
}

function amountOf(line: CandidateLineItem): number | undefined {
  if (isFiniteNumber(line.amount)) {
    return line.amount;
  }
  if (isFiniteNumber(line.quantity) && isFiniteNumber(line.unitPrice)) {
    return line.quantity * line.unitPrice;
  }
  return undefined;
}

function factUnresolved(facts: ExpectedFact[], subject: string, field?: string): boolean {
  return facts.some(
    (fact) =>
      fact.state === "unresolved" &&
      subjectMatches(fact.subject, subject) &&
      (!field || !fact.field || fact.field === field)
  );
}

function factWaived(facts: ExpectedFact[], subject: string): boolean {
  return facts.some(
    (fact) =>
      (fact.state === "waived" || fact.state === "explicit_zero") && subjectMatches(fact.subject, subject)
  );
}

function unresolvedForSubject(
  unresolved: ExpectedUnresolved[],
  subject: string,
  field?: string
): ExpectedUnresolved | undefined {
  return unresolved.find(
    (item) =>
      subjectMatches(item.subject, subject) && (!field || item.field === field || field === item.field)
  );
}

function decisionCovers(
  outcome: CandidateOutcome,
  subject: string,
  field?: string
): boolean {
  const decisions = outcome.openDecisions ?? [];
  return decisions.some((decision) => {
    const blob = `${decision.prompt} ${decision.sourceSnippet ?? ""} ${decision.subjectHint ?? ""} ${decision.fieldHint ?? ""}`;
    const subjectOk = subjectMatches(blob, subject) || subjectMatches(decision.prompt, subject);
    if (!subjectOk) {
      return false;
    }
    if (!field) {
      return true;
    }
    const fieldHints: Record<string, RegExp> = {
      price: /\b(price|cost|unit\s*price|\$|amount)\b/i,
      cost: /\b(cost|price)\b/i,
      quantity: /\b(quantity|qty|count|how many)\b/i,
      rate: /\b(rate|\/hr|per hour|hourly)\b/i,
      hours: /\b(hours?|hrs?|duration)\b/i,
      amount: /\b(amount|total|price)\b/i,
      tax: /\btax\b/i,
      deposit: /\bdeposit\b/i,
      discount: /\bdiscount|credit\b/i
    };
    return fieldHints[field]?.test(blob) ?? true;
  });
}

function checkLineHints(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const hint of caseDef.expectedLineHints) {
    const matches = findLines(outcome.lineItems, hint.descriptionMatch);
    if (matches.length === 0) {
      // Missing expected line is not always an invariant violation; only when money would be invented elsewhere.
      continue;
    }
    for (const line of matches) {
      const amount = amountOf(line);
      if (hint.amountMustBeAbsent) {
        if (isFiniteNumber(amount) && !(hint.allowExplicitZero && amount === 0)) {
          violations.push({
            id: "no_evidence_no_invented_money",
            message: `Line "${line.description}" must not carry an invented amount (got ${amount}).`,
            lineDescription: line.description
          });
        }
      }
      if (hint.quantityMustBeAbsent && isFiniteNumber(line.quantity)) {
        violations.push({
          id: "unknown_quantity_not_one",
          message: `Line "${line.description}" must not invent quantity (got ${line.quantity}).`,
          lineDescription: line.description
        });
      }
      if (hint.unitPriceMustBeAbsent && isFiniteNumber(line.unitPrice)) {
        if (!(hint.allowExplicitZero && line.unitPrice === 0)) {
          violations.push({
            id: "unknown_price_not_zero",
            message: `Line "${line.description}" must not invent unit price (got ${line.unitPrice}).`,
            lineDescription: line.description
          });
        }
      }
      if (isFiniteNumber(hint.amount) && isFiniteNumber(amount)) {
        if (Math.abs(amount - hint.amount) > MONEY_TOLERANCE) {
          violations.push({
            id: "deterministic_arithmetic_only",
            message: `Line "${line.description}" amount ${amount} != expected ${hint.amount}.`,
            lineDescription: line.description
          });
        }
      }
      if (isFiniteNumber(hint.quantity) && isFiniteNumber(line.quantity)) {
        if (Math.abs(line.quantity - hint.quantity) > MONEY_TOLERANCE) {
          violations.push({
            id: "deterministic_arithmetic_only",
            message: `Line "${line.description}" quantity ${line.quantity} != expected ${hint.quantity}.`,
            lineDescription: line.description
          });
        }
      }
    }
  }
  return violations;
}

function checkUnknownPriceNotZero(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const fact of caseDef.expectedFacts.filter((f) => f.state === "unresolved" && (f.field === "price" || f.field === "cost" || f.field === "rate"))) {
    const lines = outcome.lineItems.filter((line) => subjectMatches(line.description, fact.subject));
    for (const line of lines) {
      const amount = amountOf(line);
      const unit = line.unitPrice;
      if ((isFiniteNumber(amount) && amount === 0) || (isFiniteNumber(unit) && unit === 0)) {
        if (!factWaived(caseDef.expectedFacts, fact.subject)) {
          violations.push({
            id: "unknown_price_not_zero",
            message: `Unknown ${fact.field} for "${fact.subject}" must not be coerced to $0.`,
            lineDescription: line.description
          });
        }
      }
    }
  }
  return violations;
}

function checkUnknownQuantityNotOne(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const fact of caseDef.expectedFacts.filter((f) => f.state === "unresolved" && f.field === "quantity")) {
    const lines = outcome.lineItems.filter((line) => subjectMatches(line.description, fact.subject));
    for (const line of lines) {
      if (isFiniteNumber(line.quantity) && line.quantity === 1) {
        violations.push({
          id: "unknown_quantity_not_one",
          message: `Unknown quantity for "${fact.subject}" must not default to 1.`,
          lineDescription: line.description
        });
      }
      // Derived amount from invented qty is also forbidden.
      if (isFiniteNumber(line.amount) && isFiniteNumber(line.unitPrice) && line.quantity === 1) {
        violations.push({
          id: "unknown_quantity_not_one",
          message: `Amount for "${fact.subject}" must not be derived from default quantity 1.`,
          lineDescription: line.description
        });
      }
    }
  }
  return violations;
}

function checkNoInventedMoney(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const knownMoneySubjects = caseDef.expectedFacts.filter(
    (f) =>
      f.state === "known" &&
      typeof f.value === "number" &&
      (f.field === "price" || f.field === "cost" || f.field === "rate" || f.field === "amount" || f.field === "discount" || f.field === "deposit")
  );
  const waivedSubjects = caseDef.expectedFacts.filter((f) => f.state === "waived" || f.state === "explicit_zero");

  for (const line of outcome.lineItems) {
    const amount = amountOf(line);
    if (!isFiniteNumber(amount)) {
      continue;
    }
    if (amount === 0) {
      continue;
    }

    const hasKnown = knownMoneySubjects.some((fact) => subjectMatches(line.description, fact.subject));
    const waived = waivedSubjects.some((f) => subjectMatches(line.description, f.subject));
    const unresolvedPrice = caseDef.expectedUnresolved.some(
      (u) =>
        subjectMatches(line.description, u.subject) &&
        (u.field === "price" || u.field === "cost" || u.field === "rate" || u.field === "amount" || u.field === "hours")
    );

    if (unresolvedPrice && !hasKnown) {
      const hasVisibleGap =
        (outcome.openDecisions?.length ?? 0) > 0 ||
        outcome.needsFollowUp === true ||
        outcome.qualityGateStatus === "needs_review" ||
        outcome.qualityGateStatus === "blocked";
      if (!hasVisibleGap) {
        violations.push({
          id: "no_evidence_no_invented_money",
          message: `Positive amount ${amount} on "${line.description}" invents money despite unresolved pricing evidence.`,
          lineDescription: line.description
        });
      }
    }

    if (!hasKnown && !waived && !unresolvedPrice) {
      const anyKnownMoney = knownMoneySubjects.length > 0;
      const matchesAnyHint = caseDef.expectedLineHints.some((hint) =>
        new RegExp(hint.descriptionMatch, "i").test(line.description)
      );
      if (anyKnownMoney && !matchesAnyHint) {
        violations.push({
          id: "no_evidence_no_invented_money",
          message: `Positive amount ${amount} on "${line.description}" has no supporting known evidence.`,
          lineDescription: line.description
        });
      }
    }
  }

  const knownDiscount = caseDef.expectedFacts.find(
    (f) => f.kind === "discount" && f.state === "known" && typeof f.value === "number"
  );
  if (knownDiscount && isFiniteNumber(outcome.discountAmount)) {
    if (Math.abs(outcome.discountAmount - (knownDiscount.value as number)) > MONEY_TOLERANCE) {
      violations.push({
        id: "deterministic_arithmetic_only",
        message: `Discount ${outcome.discountAmount} != expected ${knownDiscount.value}.`
      });
    }
  }
  const unresolvedDiscount = caseDef.expectedUnresolved.some((u) => u.field === "discount");
  if (unresolvedDiscount && isFiniteNumber(outcome.discountAmount) && outcome.discountAmount > 0) {
    const visible =
      (outcome.openDecisions?.length ?? 0) > 0 ||
      outcome.needsFollowUp === true ||
      outcome.qualityGateStatus === "needs_review" ||
      outcome.qualityGateStatus === "blocked";
    if (!visible) {
      violations.push({
        id: "no_evidence_no_invented_money",
        message: `Invented discountAmount ${outcome.discountAmount} while discount remains unresolved.`
      });
    }
  }

  return violations;
}

function checkFreeSubjectBound(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  if (!caseDef.invariants.includes("free_is_subject_bound")) {
    return violations;
  }
  const waived = caseDef.expectedFacts.filter((f) => f.state === "waived" || f.state === "explicit_zero");
  if (waived.length === 0) {
    return violations;
  }
  for (const line of outcome.lineItems) {
    const amount = amountOf(line);
    if (!(isFiniteNumber(amount) && amount === 0)) {
      continue;
    }
    const matchedWaiver = waived.some((f) => subjectsEquivalent(line.description, f.subject));
    if (matchedWaiver) {
      continue;
    }
    // Shared noun with a waived subject but not the same identity => unauthorized $0 leak.
    const sharesNounWithWaiver = waived.some((f) => {
      const waiverTokens = tokens(f.subject).filter((t) => t.length >= 3);
      const lineToks = new Set(tokens(line.description));
      const overlap = waiverTokens.filter((t) => lineToks.has(t));
      return overlap.length > 0 && !subjectsEquivalent(line.description, f.subject);
    });
    if (sharesNounWithWaiver) {
      violations.push({
        id: "free_is_subject_bound",
        message: `Explicit free/no-charge must not authorize $0 on sibling line "${line.description}".`,
        lineDescription: line.description
      });
    }
  }
  return violations;
}

function checkDeterministicArithmetic(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const line of outcome.lineItems) {
    if (isFiniteNumber(line.quantity) && isFiniteNumber(line.unitPrice) && isFiniteNumber(line.amount)) {
      const expected = line.quantity * line.unitPrice;
      if (Math.abs(expected - line.amount) > MONEY_TOLERANCE) {
        violations.push({
          id: "deterministic_arithmetic_only",
          message: `Line "${line.description}" amount ${line.amount} != qty*rate ${expected}.`,
          lineDescription: line.description
        });
      }
    }
  }
  if (isFiniteNumber(outcome.subtotal)) {
    const sum = outcome.lineItems.reduce((acc, line) => {
      const amount = amountOf(line);
      return acc + (isFiniteNumber(amount) ? amount : 0);
    }, 0);
    // Only enforce when every line has a determinate amount or is explicitly absent.
    const allDeterminate = outcome.lineItems.every((line) => isFiniteNumber(amountOf(line)));
    if (allDeterminate && Math.abs(sum - outcome.subtotal) > MONEY_TOLERANCE) {
      violations.push({
        id: "deterministic_arithmetic_only",
        message: `Subtotal ${outcome.subtotal} != sum of line amounts ${sum}.`
      });
    }
  }
  return violations;
}

function checkUnresolvedVisible(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const item of caseDef.expectedUnresolved) {
    const covered =
      decisionCovers(outcome, item.subject, item.field) ||
      (outcome.needsFollowUp === true && decisionCovers(outcome, item.subject)) ||
      (outcome.qualityGateStatus === "needs_review" || outcome.qualityGateStatus === "blocked");
    // Also accept a line that has the field explicitly absent (visible gap) AND a decision/blocker.
    const lines = outcome.lineItems.filter((line) => subjectMatches(line.description, item.subject));
    const fieldAbsentOnLine = lines.some((line) => {
      if (item.field === "quantity") {
        return !isFiniteNumber(line.quantity);
      }
      if (item.field === "price" || item.field === "cost" || item.field === "rate" || item.field === "amount") {
        return !isFiniteNumber(line.unitPrice) && !isFiniteNumber(line.amount);
      }
      return true;
    });
    if (!covered && !(fieldAbsentOnLine && (outcome.openDecisions?.length ?? 0) > 0)) {
      // If quality gate silently passes with no decisions, that's a violation.
      if (outcome.qualityGateStatus === "pass" && (outcome.openDecisions?.length ?? 0) === 0) {
        violations.push({
          id: "unresolved_facts_visible",
          message: `Unresolved ${item.field} for "${item.subject}" is not visible (no decision/blocker).`
        });
      } else if ((outcome.openDecisions?.length ?? 0) === 0 && outcome.needsFollowUp !== true) {
        violations.push({
          id: "unresolved_facts_visible",
          message: `Unresolved ${item.field} for "${item.subject}" lacks an open decision or follow-up.`
        });
      }
    }
  }
  return violations;
}

function checkBlockersPreventSilentFinalization(
  caseDef: GoldenCase,
  outcome: CandidateOutcome
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  if (caseDef.expectedUnresolved.length === 0) {
    return violations;
  }
  if (outcome.qualityGateStatus === "pass" && (outcome.openDecisions?.length ?? 0) === 0 && outcome.needsFollowUp !== true) {
    violations.push({
      id: "blockers_prevent_silent_finalization",
      message: "Outcome claims qualityGate pass with unresolved billing facts and no decisions/follow-up."
    });
  }
  return violations;
}

function checkLaterEvidenceFieldScoped(caseDef: GoldenCase, outcome: CandidateOutcome): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  if (!caseDef.invariants.includes("later_evidence_field_scoped")) {
    return violations;
  }
  // If quantity remains unresolved but a later cost/price is known, quantity must stay absent.
  const unresolvedQty = caseDef.expectedUnresolved.filter((u) => u.field === "quantity");
  const knownCost = caseDef.expectedFacts.filter(
    (f) => f.state === "known" && (f.field === "cost" || f.field === "price") && typeof f.value === "number"
  );
  for (const qty of unresolvedQty) {
    for (const cost of knownCost) {
      if (!subjectMatches(qty.subject, cost.subject) && !subjectMatches(cost.subject, qty.subject)) {
        continue;
      }
      const lines = outcome.lineItems.filter((line) => subjectMatches(line.description, qty.subject));
      for (const line of lines) {
        if (isFiniteNumber(line.quantity)) {
          violations.push({
            id: "later_evidence_field_scoped",
            message: `Later ${cost.field}=${cost.value} must not resolve quantity for "${qty.subject}".`,
            lineDescription: line.description
          });
        }
        if (isFiniteNumber(line.unitPrice) && Math.abs((line.unitPrice as number) - (cost.value as number)) <= MONEY_TOLERANCE) {
          // price may be set — that's fine; only quantity resolution is forbidden
        }
      }
    }
  }
  return violations;
}

const CHECKERS: Array<(caseDef: GoldenCase, outcome: CandidateOutcome) => InvariantViolation[]> = [
  checkLineHints,
  checkUnknownPriceNotZero,
  checkUnknownQuantityNotOne,
  checkNoInventedMoney,
  checkFreeSubjectBound,
  checkDeterministicArithmetic,
  checkUnresolvedVisible,
  checkBlockersPreventSilentFinalization,
  checkLaterEvidenceFieldScoped
];

/**
 * Evaluate a candidate invoice outcome against a golden case's hard money-safety invariants.
 * Returns every violation found (not short-circuit).
 */
export function evaluateMoneySafetyInvariants(
  caseDef: GoldenCase,
  outcome: CandidateOutcome
): InvariantCheckResult {
  const enabled = new Set(caseDef.invariants);
  const violations: InvariantViolation[] = [];
  for (const checker of CHECKERS) {
    for (const violation of checker(caseDef, outcome)) {
      if (enabled.has(violation.id)) {
        violations.push(violation);
      }
    }
  }
  // Deduplicate by id+message
  const seen = new Set<string>();
  const deduped = violations.filter((v) => {
    const key = `${v.id}:${v.message}:${v.lineDescription ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return { ok: deduped.length === 0, violations: deduped };
}

/**
 * True when an adversarial (expected-unsafe) candidate violates money safety.
 * Used by negative tests: adversarial fixtures MUST trip the checker.
 */
export function adversarialViolatesMoneySafety(
  caseDef: GoldenCase,
  outcome: CandidateOutcome
): boolean {
  const result = evaluateMoneySafetyInvariants(caseDef, outcome);
  if (!result.ok && outcome.expectedViolationIds && outcome.expectedViolationIds.length > 0) {
    const fired = new Set(result.violations.map((v) => v.id));
    // Prefer cases that hit at least one declared id; still count any violation as adversarial.
    if (outcome.expectedViolationIds.some((id) => fired.has(id))) {
      return true;
    }
  }
  return !result.ok;
}

export function listRequiredInvariantIds(): MoneySafetyInvariantId[] {
  return [
    "unknown_price_not_zero",
    "unknown_quantity_not_one",
    "no_evidence_no_invented_money",
    "free_is_subject_bound",
    "deterministic_arithmetic_only",
    "unresolved_facts_visible",
    "blockers_prevent_silent_finalization",
    "later_evidence_field_scoped"
  ];
}

