# NoteBill Now / Next / Later Checklist

Updated: March 19, 2026
Purpose: Keep execution priority stable and reduce planning drift.

## Now (Do First)
- [ ] Launch gate closeout
  - [x] Stripe live price + webhook secret verified.
  - [x] Resend delivery verified end-to-end.
  - [x] `npm run check:release` passes.
  - [x] Automated smoke subset passes (send, reminder, payment-link, sent/paid status tests).
  - [ ] Manual smoke pass complete (send, pay, reopen, statuses).
- [x] Premium consistency pass
  - [x] Unified loading/empty/error/limit/success patterns across launcher/intake/editor/library.
- [x] Billie refine smoothness
  - [x] Preserve assistant presence while waiting.
  - [x] Wording fast-path + tighter token budgets for refine actions.
  - [x] Added optional fast-first wording model chain (`OPENAI_WORDING_FAST_MODEL`) for low-latency rewrites.
  - [x] Expanded deterministic wording tones for common quick actions (`Professional`, `Simpler`, `More formal`).
  - [x] Target `p50 < 2s`, `p95 < 5s` on default quick-action tones (`Professional`): `npm run check:wording-latency -- --runs=3 --assert`.
  - [x] Added recurring model-tone monitoring command: `npm run check:wording-latency:model-tones`.
  - [x] Added repeatable latency check command: `npm run check:wording-latency -- --runs=3 --assert`.
- [x] Cognitive-load pass
  - [x] One dominant action per key screen.
  - [x] Secondary controls visually quieter.
- [x] Roadmap hygiene
  - [x] Mark shipped vs partial vs future items clearly.

## Next (High Value After "Now")
- [x] Freemium optimization (usage meter + upgrade moments).
  - [x] Expanded pre-limit warning copy to trigger at 3/2/1 remaining saves.
  - [x] Added early-upgrade CTA treatment in launcher/intake/manual/library warning states.
  - [x] Added upgrade conversion telemetry funnel (`/api/telemetry/upgrade-events`, `/api/telemetry/upgrade-funnel`) with diagnostics visibility.
  - [x] Tuned warning trigger timing from live usage funnel data via server `upgradeGuidance` (dynamic pre-limit thresholding).
  - [x] Tuned CTA copy variants by source (launcher/intake/import/manual/library) using funnel recommendation IDs.
- [x] Recurring/reminder expansion (policy and UX polish).
  - [x] Added owner-scoped persisted reminder automation settings (`GET/PUT /api/invoices/reminders/settings`) and merged defaults into reminder dry-run/run flows.
  - [x] Added “saved to account” confirmation and last-updated microcopy in library reminder controls.
- [x] Billie presence MVP (persistent, subtle status chip/bubble).
- [x] Layout Studio Lite (bounded Canva-style controls, no full freeform canvas).
  - [x] Added layout defaults in Business Identity (header layout + spacing density + notes/logo visibility).
  - [x] Auto-applied those defaults across new manual drafts and AI-generated drafts.
- [x] Observability dashboards + alerts (billing/delivery/AI/reminders/upgrade funnel).
  - [x] Added `npm run check:ops-health` plus assert-mode gate support.
  - [x] Added upgrade funnel metrics + recommendations panel in Diagnostics.
  - [x] Added `/api/system/ops-health` aggregate endpoint + Diagnostics "Ops health alerts" panel.
- [ ] Android companion QA + packaging polish.
  - [x] Added local readiness doctor command (`npm run check:android-local`) for SDK/adb/project validation.
  - [x] Added targeted mobile regression suite command (`npm run check:smoke:mobile`).
  - [x] Added one-command prep pipeline (`npm run check:android-prep`) plus strict connected-device mode.
  - [x] Added step-by-step emulator-first runbook section in `docs/mobile-companion-qa.md`.

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
