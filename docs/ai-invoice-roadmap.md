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
29. OCR quality iteration
   - Added richer OCR warnings for borderline captures (modest text volume, possible missed line breaks).
   - Keeps confidence gating unchanged while improving user visibility into extraction quality.
30. OCR warning reason specificity
   - OCR warning text now maps to plain-language "Recommended fixes" in the import UI.
   - Users get actionable guidance (crop tighter, improve lighting, capture straight-on, manual correction).
31. Intake completion micro-state polish
   - Decision/summary completion copy now uses consistent short phrasing across chat replies, decision toasts, and review "Next" status.
   - Decision follow-up copy tightened to a single directive ("Choose Add or Skip") with less repetition.
32. OCR warning copy refinement
   - Shortened OCR warning + action text for tighter mobile fit while keeping the same confidence safety gates.
   - Recommended fix bullets now use concise, action-first wording.
33. OCR confidence reason codes (debug/analytics-ready)
   - `/api/invoices/extract-notes` now returns structured `confidenceReasons[]` reason codes.
   - Import flow emits `invoice:ocr-metrics` debug events with confidence + reason codes.
   - Safety gates are unchanged (low-confidence still requires explicit user confirmation).
34. OCR confidence analytics sink
   - Added server-side OCR telemetry store with confidence/reason aggregations and recent event history.
   - Added `GET /api/telemetry/ocr-confidence` endpoint for internal diagnostics.
   - `/api/invoices/extract-notes` now records OCR confidence metrics on every successful extraction.
35. OCR metrics export bridge
   - Added configurable export bridge (`POST /api/telemetry/ocr-confidence/export`) to forward OCR telemetry snapshots externally.
   - Export now avoids duplicate sends by tracking the last exported snapshot timestamp.
   - Optional autosend hook added via `OCR_METRICS_EXPORT_AUTOSEND=true` after OCR extraction.
36. Messy-input regression expansion
   - Added a deterministic messy-input regression matrix covering baseline, ambiguous billing, explicit resolution, labor follow-up, and minute-based labor conversion.
   - Regression snapshots now assert capture state + decision outcomes in one place to prevent flow drift.
37. OCR export provider adapters
   - OCR telemetry export now supports `webhook`, `ga4`, and `segment` provider payloads.
   - Provider-specific config is environment-driven with safe fallback to webhook mode.
38. Internal intake diagnostics view
   - Added `/diagnostics` internal page to review OCR confidence metrics + flow friction snapshot checks.
   - Added `GET /api/telemetry/flow-friction` endpoint to surface latest scripted friction report data.
39. Telemetry trend baselining
   - Added `GET /api/telemetry/intake-trends` endpoint with rolling 24h/7d summaries for OCR low-confidence and friction failed-check rates.
   - Friction pass script now appends a compact history record each run for trend tracking.
   - Diagnostics page now visualizes these baseline trend summaries.
40. Persistence migration prep boundary
   - Added `savedInvoiceRepository` abstraction and routed invoice persistence API calls through it.
   - Added `GET /api/system/persistence` to expose active backend in diagnostics.
   - Behavior remains unchanged (`file` backend), but backend swap is now isolated.
41. Per-user scoping groundwork
   - Saved invoices now carry an `ownerId` and all invoice library CRUD is owner-scoped server-side.
   - Request owner is derived from `x-invoice-user-id` (or `x-user-id`), with a safe local default.
   - Added regression coverage proving cross-owner invoice reads are blocked.
42. Postgres invoice-store adapter (optional backend)
   - Added a `postgres` saved-invoice repository behind `savedInvoiceRepository` selection.
   - Controlled via `INVOICE_STORE_BACKEND=postgres` and `INVOICE_STORE_POSTGRES_URL` (or `DATABASE_URL`).
   - Auto mode remains file-backed when no Postgres URL is configured.
43. Frontend request owner propagation
   - Added a persistent per-device owner id (`invoiceOwnerId`) in browser storage.
   - API requests now send `x-invoice-user-id` automatically from the shared request helper.
   - Per-user invoice library scoping now works end-to-end without manual headers.
44. Lightweight auth session scaffolding
   - Added `/api/auth/session` endpoints with signed session tokens from user email.
   - Request owner resolution now prefers authenticated user identity over spoofable owner headers.
   - Launcher now supports basic sign-in/sign-out and propagates auth automatically on API requests.
45. Inline launcher sign-in modal
   - Replaced browser `prompt()` sign-in with an in-app modal.
   - Added inline email validation, Enter-to-submit, and Escape/Cancel close behavior.
   - Keeps launcher flow fast while removing browser-native prompt friction.
46. Cross-flow account visibility
   - Added compact account context link in AI intake and manual editor headers.
   - Users can see which account/session is active without returning to launcher first.
   - Account link routes back to launcher account controls for quick switching.
47. Persistence migration tooling + backend auto mode
   - Added `auto` backend mode for invoice-store selection (`file | postgres | auto`).
   - Added Postgres migration script: `npm run migrate:invoices:postgres` (supports `--dry-run`).
   - Diagnostics persistence endpoint now includes configured mode and Postgres URL presence.
48. Production persistence guardrails
   - Added a persistence policy evaluator (`productionReady`, `postgresRequired`, warnings).
   - Server now fails fast when Postgres is required but file storage is still active.
   - Diagnostics persistence endpoint now reports policy readiness for rollout checks.
49. Auth enforcement policy guardrails
   - Added production-aware auth requirement policy for invoice library endpoints.
   - When auth is required and no valid session is present, invoice library APIs return 401.
   - Diagnostics persistence endpoint now reports whether auth is currently required.
50. Invoice Library auth-required UX guard
   - Invoice Library now checks auth policy before loading invoice data.
   - When sign-in is required, UI shows a focused sign-in-required panel instead of generic API errors.
   - Added "Go to launcher sign-in" and "I signed in, retry" recovery actions.
51. Invoice Library account context strip
   - Library header now always shows current account context (`email` or `Local mode`).
   - Added quick "Manage" action to jump back to launcher account controls.
   - Added UI regression check for the local-mode account context text.
52. Manual save auth-required UX guard
   - Manual editor save now surfaces a clear sign-in-required error on 401 responses.
   - Added recovery actions directly in Export ("Go to launcher sign-in" + "I signed in, retry").
   - Added UI regression coverage for auth-required manual save behavior.
53. Manual save auth policy preflight
   - Manual editor now preloads auth policy from `/api/system/persistence` and blocks save locally when sign-in is required.
   - Keeps 401 handling as fallback, but prevents unnecessary failed save requests in auth-required mode.
   - Retry flow now refreshes session + policy before reattempting save.
54. Persistence backend default mode alignment
   - `INVOICE_STORE_BACKEND` now defaults to `auto` in code, matching `.env.example`.
   - With no Postgres URL configured, runtime still resolves to file backend (no local behavior change).
   - When a Postgres URL is present, backend resolves to Postgres without extra mode overrides.
55. Per-account client draft scoping
   - Draft handoff storage now uses account-scoped keys (`invoiceDraft` / `invoiceImportSeed`) via request identity.
   - Added backward-compatible fallback reads from legacy unscoped keys during transition.
   - Saved labor-rate suggestion memory is now account-scoped to avoid cross-account leakage.
56. Persistence migration diagnostics panel
   - Added `GET /api/system/persistence/migration` with file-store counts (invoices/owners/deleted) and dry-run command hint.
   - Diagnostics page now surfaces migration readiness context alongside runtime backend policy.
   - Added API and UI regression checks for migration diagnostics visibility.
57. Auth session secret production guardrail
   - Added auth-session policy evaluation (`authRequired`, secret configured, production-ready).
   - Server now fails fast when auth is required but `INVOICE_SESSION_SECRET` is missing or still a default placeholder.
   - Persistence diagnostics endpoints now include auth policy readiness + warnings for rollout checks.
58. Persistence/auth readiness CLI check
   - Added `npm run check:persistence` to print persistence + auth rollout readiness in one JSON report.
   - Report includes runtime policy status, auth-secret readiness, and legacy file-store counts.
   - Command exits non-zero when production readiness checks fail.
59. Migration backlog risk signal
   - Added migration status evaluation to `/api/system/persistence/migration` (`backlogDetected`, `severity`, `message`).
   - Flags when legacy file-store invoices still exist while Postgres is already active.
   - Diagnostics UI now surfaces this migration status message for cutover safety visibility.
60. Strict migration completeness guardrail
   - Added `INVOICE_STORE_REQUIRE_MIGRATION_COMPLETE` policy (defaults to true in production when Postgres is required).
   - Server now fails fast in strict mode if legacy file-store invoices still exist while Postgres is active.
   - Persistence endpoints + `npm run check:persistence` now expose migration-required/readiness status.
61. Output quality gate (send-ready contract v1)
   - Added deterministic output-quality evaluation (`qualityGate`) to intake + labor-pricing responses.
   - Generate readiness now blocks on quality blockers in addition to follow-up/decision locks.
   - Expanded messy regression matrix to 10 trade-focused cases and added dedicated quality-gate tests.
62. True PDF export endpoint + manual editor integration
   - Added `POST /api/invoices/export-pdf` to generate downloadable PDF files from current invoice data.
   - Manual editor "Download PDF" now requests a real PDF file instead of relying on print fallback.
   - Added regression coverage for PDF response headers/content and validation errors.
63. Frontend production packaging
   - Added deterministic frontend build pipeline (`npm run build:frontend`) using esbuild + Tailwind CLI output.
   - Replaced runtime Babel + Tailwind CDN usage with precompiled `/dist` assets in `index.html`.
   - Wired `predev`, `prebuild`, `prestart`, and `pretest` hooks so packaged frontend is always current.
64. Modularization continuation (phase 1)
   - Extracted shared accent-theme logic to a dedicated utility (`/utils/brandTheme.js`).
   - Manual editor canvas + inspector now consume one brand-theme source of truth.
   - Reduced duplicated frontend logic while keeping behavior identical.
65. App distribution prep (phase 1)
   - Added installable web app metadata (`/manifest.webmanifest`) with NoteBill branding.
   - Added app icons (`public/icons/notebill-192.png`, `public/icons/notebill-512.png`, `public/icons/notebill.svg`).
   - Added service worker registration + static shell caching foundation (`/sw.js`) while excluding API requests.
66. Business identity defaults
   - Added a dedicated "Business Identity" setup screen at `/settings/business`.
   - Identity defaults are account-scoped (or owner-scoped in local mode) and include From details, style preset, accent color, and logo.
   - AI intake/import -> manual draft handoff now auto-applies these defaults without changing any money fields.
   - New UI coverage verifies manual + AI intake drafts receive saved business defaults.
67. Premium PDF output pass
   - Rebuilt PDF rendering with a structured, client-facing layout (header hierarchy, From/Bill To blocks, grouped line items, clean totals panel, notes/terms).
   - Added accent-color aware PDF styling and support for embedded PNG/JPEG logos from saved branding defaults.
   - Added client-side SVG logo conversion to PNG during upload so branding logos stay PDF-compatible.
   - Kept financial behavior deterministic: qty/rate/amount/totals are rendered from canonical invoice values only.
   - Extended export request payload to include branding fields (`accentColor`, `stylePreset`, `logoUrl`).
68. Payment link baseline (manual + Billie + PDF)
   - Added optional `paymentLinkUrl` to canonical invoice schema with URL validation.
   - Manual editor now supports payment-link entry plus local Billie commands ("set payment link", "clear payment link") with undo.
   - PDF export now renders a "Pay online" block when a payment link is present.
   - Saved/imported drafts now preserve payment links via `buildDraftFromFinishedInvoice`.
69. Invoice lifecycle status actions (library)
   - Added in-library status controls for Draft/Sent/Paid transitions without leaving the invoice list.
   - Status updates now apply inline on each card and preserve existing delete/restore flows.
   - Added UI coverage to verify status transitions persist (`draft -> sent -> paid`).
70. Invoice library status filters
   - Added list filters for `All`, `Draft`, `Sent`, and `Paid` with live counts.
   - Filtered empty states now explain what happened and reduce list-scanning on mobile/desktop.
   - Added UI coverage to verify sent/draft filtering behavior.
71. Manual export status controls
   - Added status controls in the manual Export panel for saved invoices (`Mark sent`, `Mark paid`, `Mark draft`).
   - Manual flow now keeps saved status in local draft handoff so reopened invoices show the current lifecycle state.
   - Added UI coverage to verify manual save -> sent -> paid status flow.
72. Library pay-link quick action
   - Invoice library now surfaces `Open pay link` when a saved invoice includes a payment URL.
   - Added payment-link metadata to invoice list payloads for file and Postgres backends.
   - Added UI coverage to verify pay-link action visibility in the library.

## Next (current priorities)
1. Modularization continuation
   - Continue splitting large frontend orchestration files into focused modules/hooks.
2. App distribution prep (phase 2)
   - Prepare mobile wrapper strategy (Capacitor-style) after output quality polish is complete.

## Success Criteria (lean)
- Users can complete a messy intake without confusion.
- No money decisions happen without explicit confirmation.
- Post-generate edits feel safe and fast.
- Testing remains deterministic.

## V1 Status
Production Beta – Feature Complete.

## V2 Backlog (Strategic Planning Only - Not Active Roadmap Tasks)
This backlog is planning-only. Items below are intentionally not scheduled and do not change V1 scope.

### Retention Layer
Ordered by leverage (highest first); complexity is the tie-breaker.
1. Client memory + autofill
   - Description: Save per-client billing details, usual service language, and default terms so repeat invoices start mostly prefilled. Keep all money values user-confirmed.
   - Why it beats Excel: Excel makes users re-enter context each time; this removes repetitive setup work on every job.
   - Estimated complexity: Medium
   - Impact score: Retention
   - Dependency: Existing account-scoped persistence (shipped)
2. Reusable line-item library
   - Description: Let users save common service/material line items and insert them with one tap, including cleaned client-facing wording.
   - Why it beats Excel: Faster than copy/paste and less error-prone than manually duplicating rows.
   - Estimated complexity: Low
   - Impact score: Retention
   - Dependency: Manual editor item actions (shipped)
3. One-tap "invoice again" from previous job
   - Description: Duplicate a prior invoice into a new draft with editable dates/amounts while keeping the original immutable in history.
   - Why it beats Excel: Repeat work turns into quick edits instead of rebuilding from old files.
   - Estimated complexity: Low
   - Impact score: Retention
   - Dependency: Saved invoice library + duplicate action baseline
4. Customer-level recent-job context
   - Description: Show recent invoices and notes for the selected customer during intake so users can reuse phrasing and avoid omissions.
   - Why it beats Excel: Provides structured context at creation time instead of searching folders manually.
   - Estimated complexity: Medium
   - Impact score: Retention
   - Dependency: Client memory + scoped invoice history

### Revenue Layer
Ordered by leverage (highest first); complexity is the tie-breaker.
1. Built-in payment links (invoice-to-paid flow)
   - Description: Add optional payment links to exported/sent invoices with clear paid/unpaid status in the library.
   - Why it beats Excel: Excel tracks totals, not payment completion; this closes the loop and increases product value directly.
   - Estimated complexity: High
   - Impact score: Revenue
   - Dependency: Payments provider integration
2. Free-to-paid plan gating
   - Description: Add account limits (for example invoices/month or exports) with in-app upgrade prompts tied to real usage moments.
   - Why it beats Excel: Converts active usage into monetization without blocking initial value.
   - Estimated complexity: Medium
   - Impact score: Revenue
   - Dependency: Auth + account identity (shipped), billing integration
3. Send-from-app + delivery tracking
   - Description: Allow sending invoices directly by email with sent/opened status and resend actions.
   - Why it beats Excel: Removes manual attachment workflows and provides delivery visibility users cannot get from spreadsheets.
   - Estimated complexity: Medium
   - Impact score: Revenue
   - Dependency: Transactional email provider + audit logging
4. Automated reminders + optional late-fee rule
   - Description: Optional reminder schedule for unpaid invoices, with explicit user-controlled late-fee behavior.
   - Why it beats Excel: Automates follow-up collections work that is usually manual and forgotten.
   - Estimated complexity: High
   - Impact score: Revenue
   - Dependency: Payment status tracking + send-from-app flow

### Differentiation Layer
Ordered by leverage (highest first); complexity is the tie-breaker.
1. Billie Workspace - AI Co-Pilot Mode
   - Label: V2.1 Candidate — Not active. Requires explicit activation decision.
   - Description: Keep Billie and live invoice preview in one workspace so users can chat, apply safe patches, and watch updates immediately. Draft remains the single source of truth; Billie only proposes validated patches.
   - Why it beats Excel: Excel cannot provide guided conversational edits with instant, guarded draft evolution in one place.
   - Estimated complexity: Medium
   - Impact score: Differentiation
   - Dependency: Existing intake/manual draft flow, decision guardrails, and patch validation contracts
2. Wording refine modes (safe rewrite)
   - Description: Add first-class post-generate wording actions (`Refine wording`, `More formal`, `Simpler`, `Stronger`) that only rewrite phrasing and never alter money or structure.
   - Why it beats Excel: Converts rough notes into polished client-ready language in one step while keeping financial trust boundaries intact.
   - Estimated complexity: Medium
   - Impact score: Differentiation
   - Dependency: Existing post-generate AI edit flow + deterministic money guardrails
3. Multi-format intake quality pass (text/image/pdf)
   - Description: Improve extraction consistency across text, photo notes, and PDFs with stronger review surfaces and confidence feedback.
   - Why it beats Excel: Turns unstructured field notes into structured invoices without manual transcription.
   - Estimated complexity: Medium
   - Impact score: Differentiation
   - Dependency: OCR pipeline + output-quality gate (shipped)
4. "Before vs after" transparency panel
   - Description: Show raw notes alongside cleaned client-facing line items so users can trust what changed and why.
   - Why it beats Excel: Excel provides no intelligent transformation or change explainability.
   - Estimated complexity: Low
   - Impact score: Differentiation
   - Dependency: Existing wording-cleanup and review details controls
5. Multi-day job timeline synthesizer
   - Description: Convert scattered dated notes into a clear service timeline and grouped labor/material structure before final draft.
   - Why it beats Excel: Reduces complex job reconstruction effort from minutes to seconds.
   - Estimated complexity: Medium
   - Impact score: Differentiation
   - Dependency: Date parsing + service period helper (shipped)
6. Voice-note to invoice intake
   - Description: Accept spoken job notes, transcribe them, and run the same decision-safe invoice pipeline.
   - Why it beats Excel: Enables truly mobile-first capture right after a job without typing.
   - Estimated complexity: High
   - Impact score: Differentiation
   - Dependency: Speech-to-text provider + intake normalization

### Infrastructure / Distribution (non-core)
Ordered by leverage (highest first); complexity is the tie-breaker.
1. Frontend modularization phase 2
   - Description: Continue breaking large orchestration files into focused modules/hooks to improve maintainability and release safety.
   - Why it beats Excel: More reliable releases and faster iteration deliver product improvements sooner.
   - Estimated complexity: Medium
   - Impact score: Differentiation
   - Dependency: Current modularization phase 1 baseline (shipped)
2. Mobile wrapper + store packaging baseline
   - Description: Wrap the web app for iOS/Android distribution with stable auth, storage, and export behavior.
   - Why it beats Excel: Native install/discovery and home-screen usage lower friction in field workflows.
   - Estimated complexity: High
   - Impact score: Differentiation
   - Dependency: PWA baseline (shipped), mobile QA pass
3. Production observability dashboards
   - Description: Add first-class dashboards/alerts for intake failures, quality-gate blocks, and export errors.
   - Why it beats Excel: Spreadsheet workflows cannot self-monitor reliability or quality regressions.
   - Estimated complexity: Medium
   - Impact score: Retention
   - Dependency: Existing telemetry endpoints (shipped)
4. Background sync + offline recovery hardening
   - Description: Improve offline draft handling, queued actions, and conflict-safe sync for weak connectivity environments.
   - Why it beats Excel: Keeps job-to-invoice flow stable even with poor internet in the field.
   - Estimated complexity: High
   - Impact score: Retention
   - Dependency: Mobile wrapper baseline + server conflict strategy
