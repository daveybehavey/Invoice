# NoteBill Now / Next / Later Checklist

Updated: March 17, 2026
Purpose: Keep execution priority stable and reduce planning drift.

## Now (Do First)
- [x] Launch gate closeout
  - [x] Stripe live price + webhook secret verified.
  - [x] Resend delivery verified end-to-end.
  - [x] `npm run check:release` passes.
  - [ ] Manual smoke pass complete (send, pay, reopen, statuses).
- [x] Premium consistency pass
  - [x] Unified loading/empty/error/limit/success patterns across launcher/intake/editor/library.
- [ ] Billie refine smoothness
  - [ ] Preserve assistant presence while waiting.
  - [ ] Target `p50 < 2s`, `p95 < 5s` on refine actions.
- [x] Cognitive-load pass
  - [x] One dominant action per key screen.
  - [x] Secondary controls visually quieter.
- [ ] Roadmap hygiene
  - [ ] Mark shipped vs partial vs future items clearly.

## Next (High Value After "Now")
- [ ] Freemium optimization (usage meter + upgrade moments).
- [ ] Recurring/reminder expansion (policy and UX polish).
- [ ] Billie presence MVP (persistent, subtle status chip/bubble).
- [ ] Layout Studio Lite (bounded Canva-style controls, no full freeform canvas).
- [ ] Observability dashboards + alerts (billing/delivery/AI/reminders).
- [ ] Android companion QA + packaging polish.

## Later (Higher Risk / Larger Scope)
- [ ] Full Billie Workspace as primary interaction model.
- [ ] Full freeform Canva-style canvas editing.
- [ ] Billie mascot behavior + first-run guided assistant.
- [ ] Upload old invoice and AI-edit (high variance ingestion).
- [ ] Offline/background sync + conflict handling.
- [ ] iOS release track (requires Apple developer + macOS build path).

## Scope Guardrails
- Do not weaken money guardrails to speed UX.
- Keep draft as source of truth; Billie applies validated patches only.
- Prefer bounded UX upgrades over broad feature expansion.
