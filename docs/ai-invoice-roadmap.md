# AI Invoice Helper Roadmap

## Product North Star
AI feels like ChatGPT: powerful intake, explicit money decisions, and a safe editable draft.

## Shipped (as of 2026-02-18)
1. Post-generate AI edits
   - "Edit with AI" in manual editor with apply/discard guard.
2. Review step clarity
   - Review snapshot + progressive details.
3. Messy-input UX copy pass
   - Cleaner, shorter copy in intake + follow-up + decision blocks.
4. One-tap edit chips
   - Quick action chips (rate/hours/remove/update client/merge duplicates).
5. Decision wording simplification
   - Add/Skip wording and clearer decision explanations.
6. "What I understood" micro-summary
   - Found / Decisions / Next step summary line.
7. Undo last decision
   - Decision toast + undo rollback window.
8. Saved rate preset (local)
   - Reuses last hourly rate in labor follow-up.
9. Decision grouping/pagination
   - One-decision focus with optional "See all decisions".
10. Service period helper
   - Infers start/end range from multiple explicit dates.
11. Merge duplicate items suggestion
   - Detects duplicate parts and offers merge action.
12. Photo notes intake (OCR + required review)
   - Image OCR endpoint + required user text review before parsing.
   - Existing money decision/confirmation gates unchanged.
13. OCR and upload guardrails
   - 8MB upload cap, image-type checks, OCR warning surfacing.
14. Draft polish pass
   - Stronger line-item wording cleanup across intake + manual editor.
   - Description cleanup keeps all qty/rate/amount math untouched.
15. Canonical readiness contract
   - Readiness evaluator now drives phase transitions from intake/labor responses.
   - Generate CTA state and primary decision CTA derive from readiness lock state.
   - Follow-up state now prefers payload data over stale phase labels.
16. Readiness telemetry + auditability
   - Added debug-only readiness event logs for submit routing + response transitions.
   - Added readiness snapshot logs to quickly diagnose phase/readiness drift.
   - Enable via `?readinessDebug=1` or `localStorage.invoiceReadinessDebug = "true"`.

## Next (current priorities)
1. Manual editor polish (non-monetary)
   - Keep improving wording/grammar cleanup without mutating qty/rate/amount.
2. Mobile complexity gating pass
   - Keep one primary action visible; reveal secondary details progressively.
3. Readiness debug panel (optional)
   - Small developer-only drawer that shows current readiness snapshot live.

## Success Criteria (lean)
- Users can complete a messy intake without confusion.
- No money decisions happen without explicit confirmation.
- Post-generate edits feel safe and fast.
- Testing remains deterministic.
