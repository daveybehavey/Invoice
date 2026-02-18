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
17. Manual editor polish (non-monetary)
   - Added "Quick clean descriptions" action in the Tone panel (desktop + mobile drawer).
   - Uses deterministic wording cleanup only; does not alter qty/rate/amount.
   - Added UI regression coverage for bulk clean behavior.
18. Mobile complexity gating pass
   - On mobile, review secondary content now starts collapsed behind a single "Show details" toggle.
   - Decisions + primary CTA stay visible; secondary panels are progressively disclosed.
19. Readiness debug panel (developer-only)
   - Added optional floating readiness panel with live snapshot + recent readiness events.
   - Enabled by `?readinessDebug=1` or `localStorage.invoiceReadinessDebug = "true"`.
20. Flow friction capture script
   - Added `npm run test:friction` scripted first-time-user pass.
   - Script logs ambiguity/hidden-state checks and writes `docs/flow-friction-latest.json`.

## Next (current priorities)
1. Friction follow-up tuning
   - Use `test:friction` output plus manual messy-input runs to tighten copy and action order.
2. Mobile editor navigation polish
   - Consolidate mobile actions for Manual Editor so style/tone/AI/export feel single-surface.
3. Future: image notes quality guardrails
   - Add explicit OCR confidence review UX before parse for lower-confidence uploads.

## Success Criteria (lean)
- Users can complete a messy intake without confusion.
- No money decisions happen without explicit confirmation.
- Post-generate edits feel safe and fast.
- Testing remains deterministic.
