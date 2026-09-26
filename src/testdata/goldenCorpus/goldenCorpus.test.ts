import assert from "node:assert/strict";
import test from "node:test";
import { GOLDEN_CASES, GOLDEN_CASE_COUNT } from "./GOLDEN_CASES.js";
import {
  adversarialViolatesMoneySafety,
  evaluateMoneySafetyInvariants,
  listRequiredInvariantIds
} from "./invariants.js";
import type { GoldenCategory, MoneySafetyInvariantId } from "./types.js";

const REQUIRED_CATEGORIES: GoldenCategory[] = [
  "missing_price",
  "missing_quantity",
  "later_correction",
  "two_workers",
  "ambiguous_hours",
  "free_no_charge",
  "deposit_paid",
  "unit_vs_total_price",
  "similar_material_names",
  "same_noun_different_tasks",
  "unknown_tax",
  "multiple_jobs",
  "voice_transcription",
  "contradictory_statements",
  "decimal_hours_currency",
  "discounts_credits",
  "descriptive_non_billable"
];

test("golden corpus has ~40 machine-readable cases", () => {
  assert.equal(GOLDEN_CASE_COUNT, GOLDEN_CASES.length);
  assert.ok(GOLDEN_CASES.length >= 40, `expected >=40 cases, got ${GOLDEN_CASES.length}`);
  assert.ok(GOLDEN_CASES.length <= 100, "initial corpus should stay under expansion ceiling docs");
});

test("golden corpus covers every Issue #55 required category", () => {
  const present = new Set(GOLDEN_CASES.map((c) => c.category));
  for (const category of REQUIRED_CATEGORIES) {
    assert.ok(present.has(category), `missing category: ${category}`);
  }
});

test("every case has unique id, messyInput, invariants, and candidates", () => {
  const ids = new Set<string>();
  for (const golden of GOLDEN_CASES) {
    assert.ok(golden.id && /^GC-\d{3}$/.test(golden.id), `bad id ${golden.id}`);
    assert.ok(!ids.has(golden.id), `duplicate id ${golden.id}`);
    ids.add(golden.id);
    assert.ok(golden.messyInput.trim().length > 10, `${golden.id} messyInput too short`);
    assert.ok(golden.invariants.length > 0, `${golden.id} missing invariants`);
    assert.ok(golden.candidates.length > 0, `${golden.id} missing candidates`);
    assert.ok(golden.expectedFacts.length > 0, `${golden.id} missing expectedFacts`);
    assert.ok(golden.rationale.trim().length > 0, `${golden.id} missing rationale`);
  }
});

test("hard money-safety invariant ids are all represented in the corpus", () => {
  const required = new Set(listRequiredInvariantIds());
  const seen = new Set<MoneySafetyInvariantId>();
  for (const golden of GOLDEN_CASES) {
    for (const id of golden.invariants) {
      seen.add(id);
    }
  }
  for (const id of required) {
    assert.ok(seen.has(id), `invariant never referenced: ${id}`);
  }
});

test("AG-082 / AG-088 / AG-094 scenarios are reused where valid", () => {
  const byAg = { "AG-082": 0, "AG-088": 0, "AG-094": 0 };
  for (const golden of GOLDEN_CASES) {
    for (const ag of golden.relatedAG ?? []) {
      byAg[ag] += 1;
    }
  }
  assert.ok(byAg["AG-082"] >= 3, `AG-082 reuse too low: ${byAg["AG-082"]}`);
  assert.ok(byAg["AG-088"] >= 2, `AG-088 reuse too low: ${byAg["AG-088"]}`);
  assert.ok(byAg["AG-094"] >= 4, `AG-094 reuse too low: ${byAg["AG-094"]}`);
});

test("adversarial candidates violate money-safety; safe candidates pass", () => {
  const failures: string[] = [];
  for (const golden of GOLDEN_CASES) {
    for (const candidate of golden.candidates) {
      const result = evaluateMoneySafetyInvariants(golden, candidate);
      if (candidate.expectViolations) {
        const tripped = adversarialViolatesMoneySafety(golden, candidate);
        if (!tripped) {
          failures.push(
            `${golden.id}/${candidate.label}: expected adversarial violations, got ok violations=${JSON.stringify(result.violations)}`
          );
        }
      } else if (!result.ok) {
        failures.push(
          `${golden.id}/${candidate.label}: safe candidate failed: ${result.violations.map((v) => v.id + ":" + v.message).join(" | ")}`
        );
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
});

test("unknown price must not coerce to $0 (GC-001 adversarial)", () => {
  const golden = GOLDEN_CASES.find((c) => c.id === "GC-001");
  assert.ok(golden);
  const bad = golden.candidates.find((c) => c.label === "invented-zero-acid");
  assert.ok(bad);
  assert.equal(adversarialViolatesMoneySafety(golden, bad), true);
  const result = evaluateMoneySafetyInvariants(golden, bad);
  assert.ok(result.violations.some((v) => v.id === "unknown_price_not_zero"));
});

test("unknown quantity must not default to 1 (GC-004 adversarial)", () => {
  const golden = GOLDEN_CASES.find((c) => c.id === "GC-004");
  assert.ok(golden);
  const bad = golden.candidates.find((c) => c.label === "default-qty-1");
  assert.ok(bad);
  assert.equal(adversarialViolatesMoneySafety(golden, bad), true);
  const result = evaluateMoneySafetyInvariants(golden, bad);
  assert.ok(result.violations.some((v) => v.id === "unknown_quantity_not_one"));
});

test("free/no-charge is subject-bound (GC-013 adversarial)", () => {
  const golden = GOLDEN_CASES.find((c) => c.id === "GC-013");
  assert.ok(golden);
  const bad = golden.candidates.find((c) => c.label === "baskets-zeroed");
  assert.ok(bad);
  assert.equal(adversarialViolatesMoneySafety(golden, bad), true);
  const result = evaluateMoneySafetyInvariants(golden, bad);
  assert.ok(result.violations.some((v) => v.id === "free_is_subject_bound"));
});

test("later evidence is field/subject scoped (GC-005 and GC-040)", () => {
  for (const id of ["GC-005", "GC-040"]) {
    const golden = GOLDEN_CASES.find((c) => c.id === id);
    assert.ok(golden, id);
    const adversarial = golden.candidates.find((c) => c.expectViolations);
    assert.ok(adversarial, `${id} missing adversarial`);
    assert.equal(adversarialViolatesMoneySafety(golden, adversarial), true);
  }
});

test("coverage matrix helper: category counts are non-zero", () => {
  const counts = new Map<string, number>();
  for (const golden of GOLDEN_CASES) {
    counts.set(golden.category, (counts.get(golden.category) ?? 0) + 1);
  }
  for (const category of REQUIRED_CATEGORIES) {
    assert.ok((counts.get(category) ?? 0) >= 1, category);
  }
});
