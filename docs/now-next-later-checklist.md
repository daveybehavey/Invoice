# NoteBill Now / Next / Later Checklist

Updated: April 27, 2026
Purpose: Keep execution priority stable and reduce planning drift.

## Now (Do First)
- [x] Launch gate closeout
  - [x] Stripe live price + webhook secret verified.
  - [x] Resend delivery verified end-to-end.
  - [x] `npm run check:release` passes.
  - [x] Android AAB package name is `app.notebill.app`.
  - [x] R8 mapping file generated for Play Console crash deobfuscation.
- [x] Play Console submission unblock
  - [x] Store listing copy/assets prepared.
  - [x] Data safety CSV points to hosted NoteBill policy pages.
  - [x] App access notes explain optional email-link sign-in.
  - [x] Current changes are in Google review.
- [ ] Post-review smoke pass
  - [ ] Install current Play/internal build.
  - [ ] Create, save, reopen, export PDF.
  - [ ] Optional: sign in with email link.
  - [ ] Optional: send, payment link, reminders, statuses.
- [ ] Tester readiness
  - [ ] Confirm tester list.
  - [x] Add a sample-notes path so testers can try the core flow without inventing job notes.
  - [x] Prepare copy-paste tester packet and feedback questions.
  - [x] Add an in-app Feedback page and launcher shortcut for tester reports.
  - [x] Add one-tap device detail capture on the Feedback page for visual/mobile bug reports.
  - [x] Add empty-library sample-notes entry point for first-use recovery.
  - [x] Add manual export send-ready cue for client, line item, total, and payment terms.
  - [x] Split the smoke pass and tester handoff into clear workblocks.
  - [x] Add a workblock rollup to the tester feedback log.
  - [ ] Share tester instructions and smoke checklist.
  - [ ] Capture friction notes from real devices.

## Next (High Value After "Now")
- [ ] Triage Google Play review feedback quickly, without broad refactors.
- [ ] Run closed-test feedback loop and classify issues by blocker/major/minor.
- [ ] Tighten onboarding/activation copy based on first tester confusion.
- [x] Polish launcher option copy around the default notes-to-draft path.
- [x] Polish first-use empty-library recovery states and sample-job path.
- [x] Add first-invoice launcher nudge that pushes sample notes for faster activation.
- [x] Add launcher invoice command center for drafts, sent work, follow-ups, and open balance.
- [x] Add one-tap launcher reminders for stale sent invoices that already have a recipient.
- [x] Add launcher repeat-invoice shortcut for paid work.
- [x] Add privacy-conscious activation/retention revenue signals in diagnostics.
- [x] Surface repeat-client service memory in the manual editor.
- [x] Surface saved client details, recipient email, and prior note reuse.
- [x] Surface remembered recurring cadence for repeat clients.
- [x] Add memory controls so users can inspect/delete remembered client data.
  - [x] Add a visible saved service catalog so users can review, delete, and reuse remembered line items.
  - [x] Add a tokenized customer portal link and public invoice view for sent invoices.
  - [x] Add quick payment terms and structured due dates in manual invoices without changing totals.
  - [x] Add deposits and milestone note templates for larger jobs.
  - [x] Add subscription/retainer note templates for recurring service plans.
  - [x] Add lightweight templates by trade for common service starting points.
  - [x] Add receipt / expense capture from photos in the manual editor.
  - [x] Add browser-notification reminder alerts and test reminders in Invoice Library.
  - [x] Add reminder automation presets for gentler, standard, and firmer follow-up timing.
  - [x] Add a copyable reminder note preview for sent invoices that need attention.
  - [x] Make reminder test alerts use reminder-style preview text.
  - [x] Make legacy import more obvious in the import screen and keep imported text editable for Billie cleanup.
  - [x] Add a smart follow-up suggestion banner for sent invoices that need attention.
  - [x] Make follow-up reminders and launcher/library cues understand past-due structured due dates.
- [x] Keep reminder/follow-up cues scoped to invoices with an open balance.
- [x] Add launcher quick `Mark paid` action and make paid status clear balance due consistently.
- [ ] Identify first fair paid-plan moment from tester behavior.
- [x] Add diagnostics recommendation layer that flags whether to prioritize activation, retention, collections loop, or paid-plan tests.
- [x] Add basic activation/retention metric notes before changing pricing.
- [x] Polish payment/reminder status language after tester feedback.
- [ ] Continue low-risk modularization only behind passing tests.
- [ ] Convert tester findings into v1.1/v1.2 fixes before large v2 scope.

## Later (Higher Risk / Larger Scope)
- [ ] Revenue roadmap experiments: pricing page copy, upgrade moments, and paid-plan boundaries.
- [ ] Service memory and repeat-work suggestions.
- [ ] Billie Workspace as a guarded co-pilot surface.
- [ ] Layout Studio Lite (bounded invoice presentation controls, no full freeform canvas).
- [ ] Production observability dashboards + alerts.
- [ ] Offline/background sync + conflict handling.
- [ ] iOS release track (requires Apple developer + macOS build path).
- [ ] Upload old invoice and AI-edit (high variance ingestion).

## Scope Guardrails
- Do not weaken money guardrails to speed UX.
- Keep draft as source of truth; Billie applies validated patches only.
- Prefer bounded UX upgrades over broad feature expansion.
- Avoid risky runtime changes while a Play Console review is active unless they fix a blocker.
