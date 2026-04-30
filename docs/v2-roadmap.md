# NoteBill V2 Roadmap

Updated: April 27, 2026
Status: planning draft. Do not let this expand the current Google Play review scope.

Related strategy: see `docs/revenue-roadmap.md` for the larger path from tester-ready product to paid indie business.

## V2 Product Bet
NoteBill should become the fastest way for a solo operator to turn field notes into a professional invoice, send it, and follow up until it is paid.

The V2 bar is not "more features." The V2 bar is a calmer, more trustworthy invoice loop:

`capture work -> review money decisions -> send-ready invoice -> get paid -> remember what worked next time`

The business bet is that users will pay when this loop saves repeated admin time and helps them collect money with less friction.

## Current Baseline
- Web production is hosted on Cloudflare Workers.
- Android package is prepared for Google Play as `app.notebill.app`.
- Core flow supports messy notes, editing, saving, reopening, PDF export, optional email-link sign-in, optional send, optional hosted payment links, a tokenized customer portal view, and status/reminder controls.
- Photo notes can preview likely line items before parsing, which makes the import flow feel closer to a real capture tool.
- Manual editing includes a simple start/stop time capture card that can turn billable time into a line item.
- Manual editing also includes quick deposits and milestone note templates for bigger jobs.
- Manual editing also includes lightweight subscription/retainer note templates for recurring service plans.
- Manual editing also includes lightweight templates by trade for common service starting points.
- Manual editing also includes voice-note transcription, receipt/expense capture, and export/share packs for faster mobile capture and sharing.
- The import screen explicitly supports legacy files and keeps imported text editable for Billie-assisted cleanup later.
- Invoice Library includes a browser-notification foundation for reminder alerts and test reminders.
- Invoice Library includes reminder automation presets for gentler, standard, and firmer follow-up timing.
- Invoice Library follow-up reminders include a copyable reminder note preview for quick outreach.
- Invoice Library reminder test alerts now use reminder-style preview text instead of a generic ping.
- Payment and reminder status language has been tightened so the follow-up surface reads more professionally.
- Tests are deterministic and cover money guardrails, auth policy, persistence, delivery, billing, PDF export, and UI flows.

## V1.1: Review And Tester Hardening
Goal: make the submitted app safe to test, easy to explain, and boringly reliable.

- Keep runtime changes minimal while Play review is active.
- Run the current smoke checklist after review approval.
- Give testers a short script instead of open-ended feedback.
- Fix only blocker/major confusion first.
- Keep Play Console docs/assets aligned with the live app.
- Preserve current R8 mapping/AAB release discipline for every Android build.

Exit criteria:
- Testers can create, save, reopen, and export an invoice without help.
- Optional sign-in does not confuse reviewers or testers.
- No Play Console blocker remains unresolved.

## V1.2: First-Use Clarity And Trust
Goal: reduce "what do I do now?" moments before adding bigger V2 features.

- Sharpen launcher hero copy around one default path: start with notes.
- Add or improve sample/demo notes so testers can try the flow immediately. Launcher, intake, and empty-library sample-notes paths are in place.
- Make totals, tax, paid/unpaid, and payment-link status more scannable.
- Keep Billie status chips calm and consistent across intake/manual/library.
- Tighten empty states and recovery states in library, reminders, and billing surfaces.
- Add lightweight send-ready cues where users already save/export instead of adding another checklist screen.

Exit criteria:
- A first-time user reaches a draft quickly.
- Users understand that NoteBill never silently changes money.
- Payment/reminder states read like operations, not clutter.

## V2.0: Invoice Operations Loop
Goal: make NoteBill valuable after the first invoice, not just during invoice creation.

Priority pillars:
- Draft recovery: unfinished invoices should come back to the user at the right time.
- Action queue: the launcher should show what needs attention next. Initial invoice command center is in place, including one-tap reminders for stale or past-due sent invoices with a known recipient.
- Smart defaults: repeat clients/services should make future invoices faster without auto-changing money. Launcher can now start a fresh invoice from recent paid work.
- Send and follow-up: sending, due dates, reminders, paid/unpaid state, and resend actions should feel like one loop.
- Payment links: hosted payment-link generation should be deliberate, visible, and tied cleanly to paid status.
- Diagnostics: billing, delivery, AI, auth, persistence, and reminders need operator-visible health signals.
- Revenue signals: internal diagnostics should show activation and retention milestones before pricing changes.
- Trust controls: remembered client data must be visible and removable by the user.

Exit criteria:
- A user can come back days later and immediately see what needs action.
- Payment/reminder flows reduce manual follow-up work.
- The app feels more valuable after several invoices than it did on invoice one.

Revenue signal:
- A user creates a second invoice.
- A user reuses a paid invoice through invoice-again.
- A user reuses prior client/service memory.
- A user reuses saved client details, recipient email, or prior notes.
- A user applies a remembered recurring cadence to another invoice for the same client.
- A user sends or records a reminder.
- A user reaches a save/sync/send/reminder limit only after experiencing clear value.

Current instrumentation:
- Internal revenue-signal diagnostics track generation, saves, second saved invoice, sends, reminders, payment links, invoice-again starts, service-memory reuse, client-memory reuse, recurring schedule setup, checkout starts, and sign-ins.
- Diagnostics now include a paid-plan readiness recommendation that indicates whether we should focus next on activation, retention, collections-loop adoption, or soft paywall experiments.
- Signals are aggregate counters keyed by hashed owner IDs only.
- Do not store invoice text, customer names, customer emails, line items, amounts, or PDFs in revenue telemetry.

Current trust/control baseline:
- `/settings/memory` lets users inspect remembered client details, prior notes, send emails, and recurring cadences.
- Users can delete one remembered client or clear all remembered clients for the current local/account scope.
- Manual invoice payment-term quick picks add due-date language and a structured due date without touching totals.
- Reminder automation now treats structured due dates as first-class follow-up triggers before falling back to stale sent windows.
- Reminder and launcher follow-up cues use open balance, not just invoice total, so cleared invoices stay out of collections prompts.
- Launcher follow-up cards include a quick `Mark paid` path, backed by status updates that clear or restore balance due consistently.
- `/feedback` gives testers a direct in-app path for bug reports, screenshots, copied or auto-attached device details, and rough-edge notes.
- Manual export now surfaces a compact send-ready check for client, billable line item, total, and optional payment terms.

## V2.1 Candidate: Billie Workspace
Goal: make Billie feel like a co-pilot inside the invoice workspace, not a separate chat box.

Guardrails:
- Draft remains the only source of truth.
- Billie applies validated text/presentation patches only.
- Money-impacting requests route to explicit controls and decisions.
- Every safe patch shows a `Numbers unchanged` trust signal.
- Undo must restore the exact pre-patch snapshot.

First slice:
- Persistent Billie composer in the invoice workspace.
- Action chips for safe wording changes.
- Lightweight change highlight on applied safe patches.
- Clear blocked state for money-changing requests.

Not first slice:
- Fully autonomous invoice editing.
- Full freeform design canvas.
- Multi-agent chat history or complex patch timelines.

## V2.2 Candidate: Paid Workflow Boundaries
Goal: find the first paid moment that feels fair, useful, and obvious.

Good paid-plan candidates:
- More monthly saved invoices.
- Server sync across devices.
- Email sending from NoteBill.
- Reminder automation.
- Hosted payment links and paid/unpaid tracking.
- Saved client/service memory.

Guardrails:
- Do not paywall export access for a user's own invoice.
- Do not paywall correction of AI mistakes.
- Do not paywall money safety, review gates, or deterministic calculations.
- Do not make pricing changes until tester feedback confirms the core loop feels valuable.

## V2.3 Candidate: Service Memory And Repeat Work
Goal: make NoteBill faster and more useful for repeat customers without silently changing money.

First slices:
- Suggest prior service wording for the same client.
- Suggest prior rates as explicit one-tap choices.
- Show "last time you billed..." context in review and manual edit.
- Make recurring/repeat invoices feel deliberate and easy to adjust.
- Keep memory controls easy to find so repeat-work speed does not feel spooky.
- Expose a user-visible saved service catalog so users can review, delete, and reuse remembered line items.

Success signal:
- Repeat invoices take less time than first invoices.
- Users trust suggestions because money changes are explicit.
- Client/service memory becomes a reason to keep using NoteBill instead of a generic invoice app.

## Master Future Backlog
Sorted from highest expected value to larger or riskier bets.

### High Value
- Daily scratchpad / running notes so people can capture work quickly during the day and invoice later without retyping.
- Billie Workspace as a persistent co-pilot surface for drafting, revising, and moving work forward.
- Smarter recurring work and repeat-client memory so the app feels more useful every time someone comes back.
- Better onboarding from rough notes to first sent invoice.
- Workflow automations for send, follow-up, repeat invoice, and payment tracking.
- Analytics and diagnostics so we can see where users stall and what improves activation and retention.

### Medium Value
- Push notifications and richer reminder delivery.
- Legacy import for old invoices, PDFs, and maybe spreadsheets.
- AI-assisted edits on imported or pasted invoices.
- Native mobile hardening and more device-specific polish.
- Multi-currency / tax rules for broader use cases.
- Smart follow-up suggestions that recommend when to resend, nudge, or convert a paid job into repeat work.

### Later
- Offline-first sync with conflict handling.
- Team or multi-user support.
- Help center and support docs.
- Larger automation rules and batch actions.
- More advanced automation layers beyond the current command-center flow.
- Push beyond solo workflows only after the core loop is clearly winning.

## Technical Hygiene Track
This track can run between product releases as long as tests stay green.

- Continue modularizing large frontend orchestration files into feature helpers.
- Keep Android release docs, package metadata, and mapping-file steps current.
- Add targeted tests before changing auth, payment, persistence, or money-guardrail behavior.
- Avoid broad dependency updates during Play review unless a security issue requires it.
- Keep production secrets and keystores outside the repo.

## Decisions To Revisit After Tester Feedback
- Should optional sign-in stay optional for V1, or become required for saved multi-device invoices?
- Which tester flow creates the most confusion: intake, review, manual edit, library, payment, or reminder?
- Is Billie most valuable as a wording helper, a guided decision helper, or a persistent workspace companion?
- Should V2 emphasize "get paid faster" or "make invoices faster" in public copy?
- What is the first paid-plan moment that feels fair instead of pushy?

## What We Should Not Do Yet
- Do not start iOS release work until Android tester feedback is stable.
- Do not add full accounting/bookkeeping scope.
- Do not add freeform design tooling before core invoice operations are calmer.
- Do not weaken deterministic money rules for faster AI demos.
- Do not make production behavior changes while Play review is active unless they unblock review or fix a critical bug.
