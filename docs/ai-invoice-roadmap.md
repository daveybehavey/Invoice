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
21. Friction follow-up tuning
   - Review-card guidance now uses clearer next-step language ("Use the Decisions card to choose Add or Skip.").
   - Removed duplicate decision reminder copy to reduce visual repetition.
22. Mobile editor navigation polish
   - Mobile tools now open in a bottom-sheet drawer instead of full-screen replacement.
   - Bottom bar shows active panel state and removes duplicate tab controls inside the drawer.
23. OCR confidence confirmation gate
   - Low-confidence OCR now requires an explicit user checkbox confirmation before draft build.
   - Guard resets cleanly when file/extracted text changes.
24. At-a-glance capture trust signal
   - Review summary now always shows a short "Captured:" preview line with first detected items.
   - Users can verify extraction quality without expanding details first.
25. Decision card simplification pass
   - One-decision mode now emphasizes a single next action ("Choose Add or Skip").
   - Decision card shows clear progress (Decision X of Y) and highlights Add/Skip actions.
   - Tax quick-choice controls are hidden while billing decisions are still open.
26. Review details placement polish
   - On mobile, details toggles now sit inline under each card summary instead of clustering in top-right headers.
   - Desktop keeps header controls; mobile uses explicit labels ("Show review details", "Show context details").
   - Reduces duplicate "Show details" ambiguity while preserving progressive disclosure.
27. Optional OCR image quality hinting
   - Added pre-extract image tips (lighting, crop, angle, sharpness) directly in photo-import flow.
   - Guidance appears before OCR extraction so users can improve first-pass results.
28. Decision outcome copy polish
   - Decision acknowledgements now include clearer outcomes ("Added"/"Skipped") plus remaining decision progress.
   - Completion acknowledgements now explicitly signal when all decisions are resolved and generate is ready.

## Next (current priorities)
1. OCR quality iteration (later)
   - Consider optional re-extract guidance and richer warning reasons for borderline OCR output.
2. OCR warning reason specificity
   - Map OCR warnings to plain-language actions (e.g., blur -> retake closer, skew -> recapture straight).
3. Intake completion micro-state polish
   - Keep decision/summary confirmation text compact and consistent across one-tap actions and chat replies.

## Success Criteria (lean)
- Users can complete a messy intake without confusion.
- No money decisions happen without explicit confirmation.
- Post-generate edits feel safe and fast.
- Testing remains deterministic.
