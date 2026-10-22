# NoteBill Golden Test Corpus — coverage matrix (Issue #55)

Initial corpus size: **40** cases (expansion path toward ~100).

## Categories

| Category | Cases |
|---|---:|
| `ambiguous_hours` | 2 |
| `contradictory_statements` | 2 |
| `decimal_hours_currency` | 2 |
| `deposit_paid` | 2 |
| `descriptive_non_billable` | 2 |
| `discounts_credits` | 2 |
| `free_no_charge` | 3 |
| `later_correction` | 3 |
| `missing_price` | 4 |
| `missing_quantity` | 2 |
| `money_safety_combo` | 2 |
| `multiple_jobs` | 2 |
| `same_noun_different_tasks` | 2 |
| `similar_material_names` | 2 |
| `two_workers` | 2 |
| `unit_vs_total_price` | 2 |
| `unknown_tax` | 2 |
| `voice_transcription` | 2 |

## Hard invariants referenced

| Invariant | Cases referencing |
|---|---:|
| `blockers_prevent_silent_finalization` | 27 |
| `deterministic_arithmetic_only` | 37 |
| `free_is_subject_bound` | 7 |
| `later_evidence_field_scoped` | 7 |
| `no_evidence_no_invented_money` | 39 |
| `unknown_price_not_zero` | 14 |
| `unknown_quantity_not_one` | 3 |
| `unresolved_facts_visible` | 28 |

## Prior AG scenario reuse

| AG | Cases |
|---|---:|
| AG-082 | 5 |
| AG-088 | 3 |
| AG-094 | 10 |

## Validation approach

- Fixtures live in `src/testdata/goldenCorpus/GOLDEN_CASES.ts`.
- Pure checker: `evaluateMoneySafetyInvariants` / `adversarialViolatesMoneySafety` in `invariants.ts`.
- Tests: `goldenCorpus.test.ts` (structure, category coverage, AG reuse, adversarial vs safe candidates).
- Does **not** mutate production billing, customer data, or deploy paths.
- Compatible with future wiring to `billingEvidence` (PR #53 / AG-094) without rewriting fixtures.

## Expansion path

- Add cases with the same `GoldenCase` shape; keep ids `GC-NNN`.
- Prefer tagging `relatedAG` when a case is a direct AG-082/088/094 reuse.
- Target denser coverage of voice-transcription, multi-job, and deposit edge cases first.
