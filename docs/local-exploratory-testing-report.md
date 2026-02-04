# Local Exploratory Testing Report

Date: 2026-02-04

## Coverage
Ran 10 randomized API scenarios plus targeted edge cases against local build.

## Randomized Scenarios (10)
1. Explicit hours + rate + material
2. Hours present, rate missing
3. Labor present, no hours/rate
4. Materials only
5. Discount intent in notes
6. Multi-day mixed pricing
7. Uploaded invoice text path
8. Ambiguous labor wording
9. High line-item count
10. Rate-only labor

## Outcomes
- Labor follow-up triggered correctly for missing labor pricing.
- No silent labor $0 finalization in standard missing-data paths.
- Follow-up continuation generated invoices successfully.
- Saved invoice flow remained explicit-only (no autosave).
- Print/PDF path is available through browser print dialog.

## Issues Found
1. **No-charge labor false follow-up**  
   - Case: "returned to inspect, no charge" with material cost.  
   - Previous behavior: asked for labor pricing even though labor was explicitly free.
   - Fix applied: treat explicit labor `amount: 0` as priced, so no follow-up is required.

2. **Discount intent not yet supported (expected gap)**  
   - Discount language in notes does not produce a discount line yet.
   - Tracked in `docs/discount-v1-spec.md`.

## Fixes Applied
- Updated labor pricing detection to treat explicit `amount` (including `0`) as priced.
- Added regression test:
  - `does not ask labor follow-up for explicit no-charge labor`

## Validation After Fix
- `npm run build` passed.
- `npm test` passed (7/7).

## Latest Validation (Post Discount + Invoice Number Updates)
- `npm run build` passed.
- `npm test` passed (12/12).
- Ran 10 additional randomized local API scenarios with mocked parser outputs:
  - Mixed priced/unpriced labor
  - Discount intent: none / explicit amount / follow-up required
  - Follow-up chaining: labor -> discount
  - Invariants verified: invoice number present, total math stable, total never negative
- Targeted quick check:
  - Phrase "off site" does **not** trigger a false discount flow.
