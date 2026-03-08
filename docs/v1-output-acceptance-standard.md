# V1 Output Acceptance Standard (Send-Ready Contract)

This document defines when an AI-generated invoice is "send-ready" for V1.

## Goal
- Convert messy notes into a professional invoice that needs little or no manual rewriting.
- Keep money safety strict: no silent financial guessing.

## 1) Structural Requirements
- Clearly separate labor and materials when both are present.
- Labor lines must show explicit quantity x rate when billable.
- Show `subtotal`, `tax`, and `total` clearly.
- Never leave ambiguous totals (no soft language like "about $800").
- Keep line-item formatting consistent across the document.
- Avoid unnecessary narrative prose in invoice body lines.

If rate/tax/money intent is unclear:
- Do not guess.
- Keep decision open and require explicit user resolution.

## 2) Tone Requirements
- Professional, neutral, and client-facing.
- Not robotic and not overly corporate.
- No slang, filler, or hype.
- No exclamation-point style copy.

Examples to avoid:
- "fixed thing"
- "patched stuff"
- "kinda adjusted"

## 3) Rewording Contract
- Rewrite messy/internal shorthand into clean client-facing line descriptions.
- Expand abbreviations when helpful for client clarity.
- Preserve numeric values exactly (qty/rate/amount).
- Never invent quantities, rates, discounts, or tax settings.
- Never reinterpret ambiguous money text silently.

When ambiguity remains:
- Surface a decision or follow-up instead of auto-resolving.

## 4) Multi-Day Job Handling
- If job notes span multiple explicit dates:
  - either preserve date grouping clearly, or
  - consolidate cleanly with a clear service period.
- Do not output confusing narrative chronology in line items.

## 5) Out of Scope For This Gate
- Branding theme/style templates.
- Logo customization.
- Accent-color personalization.

Those are product features, not send-ready quality criteria.

## 6) Acceptance Matrix Rules
- Validate with at least 10 messy real-world trade inputs.
- Each case must pass structure + tone + money-safety checks.
- If generated output still needs substantial rewriting, case fails.
- Minor edits (optional wording preference) are acceptable.

## 7) Generate Readiness Rule
Generation is allowed only when all are true:
- No open money decisions.
- No labor pricing follow-up required.
- Output quality gate has zero blockers.

Warnings are allowed, blockers are not.

## 8) Severity Policy
Blockers (stop generate):
- `missing_line_items`
- `totals_missing`
- `totals_conflict`
- `labor_pricing_format`
- blank/missing client-facing line descriptions

Warnings (do not stop generate):
- tone/wording polish
- labor/material separation polish
- multi-day structure clarity

## 9) Rule Traceability
All rules are enforced in:
- `src/services/outputQualityGate.ts` (`evaluateInvoiceOutputQuality`)

Primary rule tests:
- `src/services/outputQualityGate.test.ts`:
  - `[rule:structure.line_items_present] ...`
  - `[rule:structure.totals_present] ...`
  - `[rule:structure.totals_consistent] ...`
  - `[rule:structure.separate_labor_materials] ...`
  - `[rule:structure.labor_pricing_format] ...`
  - `[rule:tone.client_facing] ...`
  - `[rule:rewording.non_empty_description] ...`
  - `[rule:multi_day.date_context] ...`

Integration check:
- `src/api.test.ts`:
  - `from-input quality gate warns on non-client-facing line wording without blocking generate`

## 10) Product Principle
AI assists interpretation and wording.
Deterministic systems own financial correctness and readiness.
