# V2 Wording Refine Contract (Planning Draft)

Status: planning only. This defines quality and safety expectations for a future V2 feature.

## Goal
Provide one-tap post-generate language polish so users can improve client-facing wording without touching invoice math or structure.

## Feature surface
- Primary action: `Refine wording`
- Style modes:
  - `Professional` (default)
  - `More formal`
  - `Simpler`
  - `Stronger`

## In scope
- Rewrite `lineItems[].description`.
- Rewrite `notes` and `terms` text blocks.
- Preserve intent and factual meaning.

## Out of scope
- Any money or calculation change.
- Any line-item add/remove/merge/split.
- Any item reordering.
- Any date, client, invoice number, or tax configuration edits.

## Hard safety guardrails
The feature must reject output unless all checks pass:

1. Structural identity
- Same line item count.
- Same line item order and stable item ids.

2. Financial identity
- `quantity`, `unitPrice`, `amount`, `discount`, `taxRate`, `subtotal`, `total` unchanged.
- No new numeric values in rewritten fields that imply changed billing.

3. Document identity
- `invoiceNumber`, `issueDate`, `dueDate`, client identity, and business identity unchanged.

4. Scope identity
- Only allowed text fields are changed.

If any check fails, discard the suggestion and keep original values.

## UX contract
- Show a before/after preview for changed text.
- Show a trust label: `Numbers unchanged`.
- Actions: `Apply` and `Discard`.
- On safe-rewrite rejection, show: `Could not refine safely. No changes were applied.`

## Tone contract
- Professional, neutral, client-facing.
- No slang, no filler, no exclamation marks.
- Avoid robotic phrasing.
- Keep concise and specific service language.

Mode intent:
- Professional: clean neutral business wording.
- More formal: slightly more formal phrasing, still concise.
- Simpler: plain-language wording with minimal jargon.
- Stronger: clearer action verbs and confidence, no hype.

## Determinism expectations
- Same input + same mode should be stable in meaning.
- Any unsafe candidate must fail closed (no partial apply).
- Application path is always explicit user confirm (`Apply`).

## Acceptance checks
1. Rewriting a messy description changes wording only and preserves all numbers.
2. Rewriting notes/terms does not touch line-item structure.
3. Attempted tax or total mutation is blocked.
4. Attempted add/remove/reorder line items is blocked.
5. User can discard with zero state changes.
6. Mode toggles produce different style, same facts.

## Why this matters
This strengthens product identity: messy notes in, professional invoice out, with strict money safety.
