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
   - Added the first `/api/auth/session` groundwork for authenticated account-scoped invoice access.
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
73. Freemium policy baseline (save limits + account plan visibility)
   - Added account-plan policy endpoint (`GET /api/account/plan`) with per-account monthly usage.
   - Added optional free-tier monthly save-limit enforcement for new invoices on `/api/invoices/save` (updates still allowed).
   - Launcher now surfaces plan usage status; manual save now shows plan-limit API errors directly.
74. Verified email-link auth hardening
   - Replaced insecure email-only session minting with verified email-link sign-in (`/api/auth/session` + `/api/auth/session/verify`).
   - Production auth readiness now requires both a strong session secret and a configured email delivery provider.
   - Frontend auth state now clears expired local sessions proactively and keeps request auth headers consistent across shared fetch paths.
   - Added API/UI coverage for plan usage display and save-limit behavior.
75. Provider-aware auth groundwork
   - Added shared auth-provider capability evaluation so the app can report which sign-in methods are implemented, configured, and actually available.
   - Launcher sign-in now loads provider readiness live from the backend, keeps email-link sign-in active, and honestly labels Google Sign-In as planned groundwork instead of a live path.
   - Persistence diagnostics now include auth provider capabilities so rollout checks can verify email-link readiness while Google OAuth is still pending.
74. Freemium upgrade-gate UX surfaces
   - Invoice Library now shows free-plan usage and a focused limit-reached banner when monthly save cap is exhausted.
   - Manual Export panel now surfaces plan usage and disables new saves when the free cap is reached (updates remain enabled).
   - Added UI coverage for library limit banner and manual save-disabled state at cap.
75. Freemium upgrade-link entry points
   - Account-plan payload now includes sanitized optional billing links (`upgradeUrl`, `billingPortalUrl`) from environment config.
   - Launcher, Invoice Library, and Manual Export limit states now surface direct "Upgrade plan" entry points when configured.
   - Added API/UI coverage to verify upgrade-link visibility and URL handling.
76. Launcher low-cognitive-load pass
   - Reworked launcher into clearer sections: `Start here`, `Other ways to start`, and `Manage`.
   - Added a context-aware `Resume last draft` shortcut for returning users.
   - Kept existing actions intact while reducing first-screen choice overload.
77. Launcher progressive disclosure refinement
   - Added a simple 3-step "how it works" checklist directly in `Start here` to reduce first-run uncertainty.
   - Moved alternate start paths behind a single "Need a different start?" reveal action.
   - Keeps power paths available while minimizing default homepage choice load.
78. Cognitive-load trim pass (launcher + intake review)
   - Launcher account strip now tucks billing/upgrade links behind a single `Plan options` reveal to reduce top-row action noise.
   - Intake review summary now keeps the top card focused on capture/decision essentials; recent-client context remains in expanded details.
79. Billie assistant modularization (phase 2)
   - Extracted manual assistant command parsing + preview diff helpers into `/features/manual/assistantCommandHelpers.js`.
   - Inspector panel now consumes one helper module for style/wording/tax/discount/payment/line commands.
   - Reduced inline command-logic surface area to simplify further assistant iteration.
80. Safe descriptions reword endpoint
   - Added `POST /api/invoices/reword-descriptions` for descriptions-only wording edits.
   - New pipeline path rewrites line-item wording only and preserves notes + all money fields.
   - Added API/UI regression coverage for route behavior and assistant routing.
81. Wording model fast-path defaults
   - Added dedicated wording-model resolution (`OPENAI_WORDING_MODEL`, optional fallback override).
   - Wording tasks now default to a fast wording model path without depending on the general parse model.
   - Added config tests to guard wording-model selection behavior.
82. Freemium billing-return consistency pass
   - Added billing-return notices to AI intake, import, manual editor, and invoice library so checkout success/cancel states are visible outside the launcher.
   - Import now uses Stripe Checkout directly when Stripe billing is configured instead of relying on static upgrade links only.
   - Added UI coverage for route-specific billing completion notices and import Stripe upgrade entry.
83. Launch readiness aggregation
   - Added `GET /api/system/launch` to aggregate persistence, auth, billing, delivery, and public-base-url readiness in one payload.
   - Added `npm run check:launch` for a single local launch-readiness check against `/health` + `/api/system/launch`.
   - Added API coverage and documented the launch check in the public-domain runbook.
84. Billie wording-model fallback polish
   - Model-backed wording rewrites now fall back to `OPENAI_MODEL` when no wording-specific override is configured.
   - Keeps one fast default path for Billie instead of silently dropping back to a slower hard-coded wording model.
   - Added config tests to lock the fallback behavior.
85. Launch billing mode hardening
   - Stripe diagnostics now expose test/live key mode so launch checks can catch test billing before public cutover.
   - Added launch-policy awareness for live billing mode in `/api/system/billing` and `/api/system/launch`.
   - Prevents false-positive launch readiness when Stripe is configured but still running on test keys.
86. Launch email verification tooling
   - Added provider-backed launch test email support with `npm run send:launch-email-test`.
   - Delivery diagnostics now include launch-test recipient readiness alongside provider configuration.
   - Gives one explicit pre-launch check that email delivery is truly working, not just tracking-only.
87. Release checklist + combined launch tooling
   - Added a dedicated web-launch checklist doc for NoteBill cutover.
   - Added `npm run check:release` to run launch and public-domain checks together.
   - Tightened launch runbook so the remaining launch steps are operational, not conceptual.
82. Client-aware labor suggestions + import pre-limit parity
   - Saved line-item memory now stores optional client context and prioritizes client matches during labor follow-up suggestions.
   - Follow-up quick replies now surface `Use client match` when a same-client rate is known.
   - Import screen now shows account-plan summary and pre-limit warnings, aligned with launcher/library/export freemium messaging.
83. Manual editor saved-item recommendations (client/service ranking)
   - Saved-item chips in manual editing now rank by current client match first, then service-term overlap, then recency.
   - Added visual `Client match`/`Service match` badges so one-tap reuse is explicit and low-cognitive-load.
   - Added UI coverage proving same-client saved rates rise to the top.
   - Preserves all existing actions while reducing first-screen scanning burden.
79. Mobile intake progress simplification
   - Intake step card now shows a compact default state on mobile (`Step X of 4` + progress bar), with optional `Show steps`.
   - Full step badges remain available on demand and stay always visible on desktop.
   - Added UI coverage to ensure mobile step expansion behavior stays deterministic.
80. Intake header clutter reduction
   - `New intake` now appears only after meaningful progress exists (not on first-load empty state).
   - Header status line now reflects current state (`Ready for notes`, `Waiting for your pricing input`, `Draft in progress`).
   - Keeps reset behavior unchanged while reducing first-screen noise.
81. Brand palette alignment pass (Dad colors baseline)
   - Updated NoteBill defaults to a blue-first palette rooted in `#093064`, `#6993D2`, and `#ACCCF0`.
   - Shifted launcher and intake primary CTA/focus states to the blue palette while keeping safety/warning semantics intact.
   - Updated manifest/theme defaults and brand icon color so install + browser surfaces match the in-app brand direction.
82. Brand palette rollout (library + import + style inputs)
   - Extended the blue-first palette across Invoice Library and Import flow primary actions, links, and focus states.
   - Kept semantic states (`Paid`, success confidence badges, warnings/errors) unchanged to preserve instant status recognition.
   - Updated manual style input focus treatment and Billie review-link accents to stay visually consistent with NoteBill branding.
83. Launcher cognitive-load trim (manage tools collapsed by default)
   - Changed launcher `Manage` tools to progressive disclosure on all viewports (`Show manage tools`).
   - Keeps power actions (`Invoice Library`, `Business Identity`) available while reducing default first-screen choice density.
   - Updated UI coverage so business settings flow expands manage tools before navigation.
84. Launcher modularization pass (phase 2 kickoff)
   - Extracted launcher UI sections into `features/launcher/launcherSections.jsx` (`AccountStrip`, `StartSection`, `AlternateStartsSection`, `ManageSection`, `AuthModal`).
   - Kept launcher behavior/copy unchanged while reducing `launcher.jsx` orchestration weight.
   - Updated script wiring in `index.html` and verified with full UI/API regression coverage.
85. App distribution prep (phase 2 baseline)
   - Added Capacitor baseline config (`capacitor.config.json`) to keep iOS/Android wrapper setup deterministic.
   - Added mobile-wrapper readiness command (`npm run check:mobile-wrapper`) to validate required app-shell artifacts.
   - Added `docs/mobile-wrapper-phase2.md` runbook covering activation steps (`cap add/sync/open`) without changing runtime behavior.
86. AI intake modularization pass (helpers extraction)
   - Extracted intake-local helper/constants into `features/intake/aiIntakeHelpers.js` (`initialIntakeMessages`, storage helpers, Billie preview helpers).
   - Wired `aiIntake.jsx` to consume the helper module via `window.InvoiceAIIntakeHelpers`.
   - Kept behavior unchanged while reducing orchestration file density.
87. Manual editor modularization pass (draft storage extraction)
   - Extracted manual draft hydration/storage helpers into `features/manual/manualDraftStorage.js`.
   - Updated `manualInvoiceCanvas.jsx` to consume `resolveInitialDraftMeta` from the helper module.
   - Preserved scoped-draft + legacy fallback behavior with no API flow changes.
88. Public domain readiness baseline (`notebill.app`)
   - Added a public-domain readiness check (`npm run check:public-domain`) covering user services + public URL health.
   - Added one-command helpers to run/stop the public preview stack (`npm run public:start`, `npm run public:stop`).
   - Added `docs/notebill-domain-runbook.md` with start/stop/check commands for local app + Cloudflare tunnel.
   - Keeps distribution setup repeatable without changing runtime invoice behavior.
89. Public stack reliability hardening
   - Added user-service installer script (`npm run public:install-services`) so service definitions stay reproducible after shell/NVM changes.
   - Public service now runs `npm run start` (stable app mode) instead of watch-mode dev server.
   - `public:start` now refreshes service definitions before startup to avoid path/runtime drift.
90. Billie quick-action simplification
   - Refined Billie quick actions to prioritize wording outcomes (`Formal descriptions`, `Simpler wording`, `Refine notes`) plus note visibility toggles.
   - Updated empty-conversation guidance to clearer, action-first examples (wording + payment link).
   - Keeps all money guardrails unchanged while reducing manual prompt crafting.
91. Decision wording cleanup (lower confusion)
   - Tightened decision snippet cleanup so prompts remove leading "Bill/Charge", stray quotes, and trailing punctuation before rendering.
   - Decision cards now avoid duplicated phrasing like `Bill Bill ...??` and produce cleaner Add/Skip action text.
   - Keeps decision safety logic unchanged; this is copy normalization only.
92. Decision card copy de-duplication
   - Removed repeated "Pick one option..." guidance from the quick decision card.
   - Hidden duplicate bottom helper text while quick decision actions are visible.
   - Renamed quick decision heading to "Needs your call" for a cleaner, less repetitive prompt.
   - Keeps the same decision flow/guardrails with less on-screen repetition.
93. Decision intro copy trim
   - Hidden the extra top-level "I found unclear money items…" line when the quick decision card is already visible.
   - Keeps the same safety message while reducing duplicate instructions in decision-heavy states.
94. Details toggle placement simplification
   - Moved review and decisions detail toggles out of top-right headers and into one consistent inline position under each summary.
   - Keeps all detail functionality while reducing header-action clutter and improving scan flow.
95. Stripe billing action baseline (freemium upgrade automation prep)
   - Added Stripe billing capability flags to `GET /api/account/plan` plus backend session endpoints: `POST /api/billing/checkout-session` and `POST /api/billing/portal-session`.
   - Launcher, Invoice Library, and Manual Export now use Stripe-backed button actions when configured, with existing static link fallback preserved.
   - Added API/UI regression coverage for billing capability flags and Stripe action rendering.
96. Stripe webhook entitlement sync baseline
   - Added signed Stripe webhook endpoint: `POST /api/billing/stripe/webhook` (raw-body signature verification required).
   - Checkout/subscription webhook events now update persisted Stripe entitlements used by account-plan policy.
   - `GET /api/account/plan` and save-limit checks now honor active Stripe-backed Pro entitlement status.
   - Added API regression coverage for signed webhook promotion to Pro and signature-header guardrails.
97. Billing diagnostics visibility
   - Added `GET /api/system/billing` to expose Stripe readiness and entitlement health in one safe diagnostics payload.
   - Diagnostics page now includes a dedicated Billing diagnostics panel (provider/capability readiness + active entitlement summary + warnings).
   - Added API/UI regression coverage to keep billing observability deterministic during monetization rollout.
98. Client memory + autofill baseline
   - Manual saves now remember bill-to details by client name and reuse them in later matching drafts.
   - Autofill only applies contact/context fields; all money fields remain explicit and user-controlled.
   - Added UI coverage for save -> recall -> autofill behavior.
99. Reusable line-item library baseline
   - Manual saves now remember prior line items and expose one-tap reinsertion for repeat jobs.
   - Reinserted items preserve wording polish while keeping qty/rate editable.
   - Added UI coverage for line-item memory and insertion flow.
100. Invoice-again workflow baseline
   - Invoice Library now supports "Invoice again" from a saved invoice into a fresh draft with a new number/date.
   - Original invoice history remains immutable while enabling repeat-job speed.
   - Added UI coverage to verify new-draft handoff behavior.
101. Intake recent-client context baseline
   - AI intake review now surfaces recent saved jobs for matched clients to reduce omission risk on repeat work.
   - Context stays informational and non-monetary; users still make explicit money decisions.
   - Added API/UI coverage to verify recent-job retrieval ordering.
102. Billing return-state launcher notice
   - Launcher now shows explicit success/cancel notices when users return from Stripe checkout (`?billing=success|cancelled`).
   - Billing query params are removed after render to keep URLs clean and avoid repeated notices on refresh.
   - Added UI coverage for notice visibility and query-param cleanup.
103. Service-aware labor-rate suggestions (baseline)
   - Labor pricing follow-up now suggests a matched saved hourly rate when prior line-item wording overlaps current labor descriptions.
   - Suggestions still require explicit user tap; no labor rate is auto-applied.
   - Added UI coverage for matched-rate quick-reply visibility.
104. Launcher modularization continuation (phase 2)
   - Extracted launcher orchestration helpers into `features/launcher/launcherHelpers.js` (billing return-state parsing, plan-action derivation, option config, draft-resume detection).
   - Kept launcher behavior unchanged while reducing logic density in `launcher.jsx`.
   - Added script-load wiring for helper module and re-validated launcher UI behavior.
105. Intake modularization continuation (quick-reply extraction)
   - Replaced inline labor pricing quick-reply construction in `aiIntake.jsx` with `buildLaborQuickReplies(...)` from `features/intake/aiIntakeHelpers.js`.
   - Preserved behavior for hours suggestions and saved-rate suggestions while reducing orchestration density in `aiIntake.jsx`.
   - Re-validated labor follow-up UI coverage (saved-rate + matched-rate quick replies).
106. Review transparency panel (before vs after baseline)
   - Added a `Before and after` block in review details to show source-note context alongside client-facing draft wording.
   - Keeps money guardrails unchanged: this panel is visibility-only and does not mutate invoice amounts.
   - Added UI coverage for transparency-card visibility in review details.
107. Invoice-library follow-up reminder baseline
   - Added a `Follow-up reminders` banner in Invoice Library when sent invoices are stale (14+ days since last sent update).
   - Includes one-tap `Show sent invoices` focus action to reduce manual filtering friction.
   - Added UI coverage for stale-sent reminder visibility and filter action behavior.
108. Intake free-plan upgrade surface
   - AI Intake now loads account-plan usage and shows a focused free-limit banner near generate when monthly save cap is reached.
   - Banner keeps flow unblocked (users can still generate/edit) while clearly flagging that new saves require an upgrade.
   - Added UI coverage for intake limit messaging and upgrade entry-point visibility.
109. Launcher draft recovery inbox
   - Launcher now surfaces recent saved draft invoices with one-tap resume actions, so unfinished work is easy to recover.
   - Resume actions hydrate the canonical manual draft safely from saved invoice data.
   - Added UI coverage for draft-recovery visibility and resume handoff.
110. Invoice Library follow-up reminder controls
   - Follow-up reminder banner now includes `Snooze 7 days` and `Dismiss` controls.
   - Reminder suppression is persisted per scoped account/owner to avoid repeat prompt fatigue.
   - Added UI coverage for snooze behavior and persistence across reload.
111. Review transparency polish (before vs after)
   - Review details now show a compact cleaned-lines summary plus an explicit full-comparison toggle.
   - Full comparison expands to structured source-note vs client-facing wording lists for trust verification.
   - Added UI coverage for summary + expanded comparison visibility.
112. Free-plan pre-limit warning surface
   - Added a focused warning (`1 save left this month before upgrade is required.`) in Launcher, AI Intake, Invoice Library, and Manual Export.
   - Keeps users informed before hard limits without blocking existing free-plan workflows.
   - Added UI coverage for launcher + manual pre-limit messaging.
113. Diagnostics health mini-summary
   - Diagnostics now includes a top-level health snapshot card for persistence readiness, billing readiness, OCR low-confidence rate, and friction failed-check rate.
   - Keeps rollout status and quality signals visible in one quick-scan panel.
   - Added UI coverage for health snapshot visibility.
114. Manual smart-rate quick apply (client/service match)
   - Manual line items now show a one-tap `Use suggested $X/hr` action when rate is blank and a saved match exists.
   - Suggestions prioritize same-client history first, then service wording overlap, then recency.
   - Added UI coverage for apply-flow behavior and visible rate-fill confirmation.
115. Billie quick-action wording expansion
   - Added a first-class `Stronger wording` quick action alongside Formal/Simpler/Notes actions in the manual Billie panel.
   - Wording command parsing now maps stronger/assertive phrasing to a dedicated `Stronger` tone request.
   - Added UI coverage confirming the new quick action stays on the safe descriptions-only reword route.
116. Manual smart-rate helper modularization
   - Extracted client/service smart-rate ranking and one-tap suggestion logic into `features/manual/smartRateSuggestions.js`.
   - `manualInvoiceCanvas.jsx` now consumes helper exports for saved-item ranking and per-line rate suggestions.
   - Keeps behavior unchanged while reducing orchestration complexity in the manual canvas.
117. Advanced smart-rate defaults (usage-weighted ranking)
   - Line-item memory now tracks `usageCount` per saved entry and increments on repeated saves.
   - Intake and manual smart-rate suggestion ranking now uses client match + service overlap + usage frequency before recency.
   - Added UI coverage proving labor follow-up picks the higher-usage client match when wording overlap is tied.
118. Multi-day service timeline preview
   - Review details now include a compact `Service timeline` card grouped by session date.
   - Timeline rows show per-day item count, labor duration, and captured amount for faster trust checks.
   - Added UI coverage for timeline visibility on multi-day messy intake.
119. Follow-up reminder "invoice again" shortcut
   - Follow-up reminder banner in Invoice Library now includes a one-tap `Invoice again oldest` action.
   - Users can jump from stale sent reminders directly into a fresh duplicate draft without searching the list first.
   - Added UI coverage for reminder shortcut visibility.
120. Recurring reminder baseline (monthly + invoice-again)
   - Invoice Library cards now support recurring cadence controls (`weekly`, `biweekly`, `monthly`, and custom day counts) plus `Pause recurring` per invoice.
   - Added a `Recurring reminders` panel that surfaces the next due recurring invoice with direct `Invoice again next due`.
   - Added UI coverage for recurring set/pause flow and due reminder open behavior.
121. Invoice Library draft recovery inbox
   - Added a stale-draft reminder panel for draft invoices untouched for 7+ days.
   - Users can jump directly into the oldest stale draft with one tap or filter to all draft invoices.
   - Added UI coverage for stale draft detection and resume-oldest behavior.
122. Send-from-library baseline with delivery tracking
   - Invoice Library now supports `Send invoice`/`Resend invoice` with recipient email capture.
   - Added delivery state tracking (`sent/opened`, timestamps, counts) plus one-tap `Mark opened`.
   - API list/get responses now include per-invoice delivery summaries for status visibility.
123. Provider-backed email delivery + tracking-pixel opens
   - Added optional provider send path (`INVOICE_EMAIL_PROVIDER=resend`) with fallback to tracking-only mode when provider config is missing.
   - Send flow now stores provider metadata (`mode`, `provider`, `messageId`) and supports open tracking via signed token pixel route.
   - Added delivery diagnostics endpoint/panel (`GET /api/system/delivery`) for provider readiness + send/open telemetry.
124. Follow-up reminder quick resend action
   - Follow-up reminder banner now supports one-tap `Resend oldest` when a prior recipient email is known.
   - Resend action bypasses extra prompts and reuses tracked recipient delivery context.
   - Added UI coverage ensuring reminder resend runs without dialog prompts and increments delivery send counts.
125. Send flow UX pass (inline recipient composer)
   - Replaced browser prompt-based send flow with inline recipient composer directly on invoice cards.
   - First send now captures recipient inline; resends reuse known recipient without extra prompts.
   - Keeps delivery guardrails intact while reducing send-flow cognitive load on desktop/mobile.
126. Automated reminder endpoints + one-tap follow-up action
   - Added reminder APIs (`POST /api/invoices/:id/send-reminder`, `POST /api/invoices/reminders/run`) with dry-run support and deterministic due/cooldown rules.
   - Follow-up reminder banner now sends true reminder emails (or tracked reminders in record-only mode) instead of generic resends.
   - Delivery diagnostics now includes reminder candidate preview counts (`due now`, `scanned sent invoices`) for fast operational checks.
127. Reminder operations controls in diagnostics
   - Delivery diagnostics now supports one-tap `Preview due reminders` and `Run reminders now` actions.
   - Reminder preview is now owner-scoped from request identity (instead of static local-default owner) to match account context.
   - Added API/UI regression coverage for owner-scoped reminder visibility and diagnostics control rendering.
128. Billie safe-wording fast path
   - Formal/neutral description cleanup now uses a deterministic fast path when notes are blank, instead of always waiting on a model round-trip.
   - Common “make this cleaner/more formal” Billie flows now feel materially faster without touching money or structure.
129. Hosted invoice payment-link generation
   - Saved invoices can now create Stripe-hosted payment links directly from the manual editor/export tools.
   - Send flow auto-generates and persists a payment link before delivery when Stripe invoice payments are configured.
130. Stripe payment-to-paid webhook baseline
   - Added `payment_intent.succeeded` handling for hosted invoice-payment links.
   - Matching saved invoices are now marked `paid` and their `balanceDue` is cleared when Stripe confirms payment.
131. Voice-note intake baseline
   - Intake now accepts uploaded/recorded audio notes, transcribes them, and appends the transcript into editable intake text before parsing.
   - Keeps the same review + decision guardrails as typed input instead of creating a separate audio-only flow.
132. Mobile/store packaging hardening baseline
   - Added installed Capacitor toolchain, stronger manifest metadata, safer Capacitor transport defaults, and a stricter `npm run check:mobile-wrapper`.
   - Packaging docs now include the real pre-store checklist instead of only a placeholder baseline.
133. Launch gate verification pass (web)
   - Verified live launch readiness with `npm run check:release` (launch + public-domain checks passing).
   - Verified provider-backed launch email delivery with `npm run send:launch-email-test`.
   - Confirms live Stripe mode + verified Resend domain in one operational pass.
134. Cross-surface consistency pass (launcher/intake/manual/library)
   - Unified plan-limit warning treatments onto shared banner/button patterns in intake decisions and manual export.
   - Simplified invoice-library status/payment/recurring visual language to shared chip/button primitives.
   - Reduced cross-screen color drift so secondary actions stay quieter and the primary CTA remains clear.
135. Freemium usage-meter rollout (cross-surface)
   - Added a shared plan-usage meter component style and wired it into launcher, import, intake decisions, manual export, and library account surfaces.
   - Free-plan usage now shows consistent `used/limit`, remaining saves, and progress-tone states (normal/warning/limit) across all primary workflows.
   - Keeps billing logic unchanged; this is visibility + conversion UX hardening.
136. Library reminder automation controls (retention operations)
   - Added owner-scoped reminder automation settings (`dueAfterDays`, `cooldownDays`, `maxPerRun`) in Invoice Library with persisted local defaults.
   - Added one-tap `Preview due now` and `Run due reminders` actions that call the deterministic reminders-run endpoint with overrides.
   - Keeps reminder safety rules unchanged while making follow-up automation operational from the library surface.
137. Billie runtime presence + refine latency visibility
   - Added a shared Billie status-chip treatment (`ready`, `working`, `safe`, `warning`) and applied it across intake, manual workspace, launcher/import/library cues.
   - Added local refine telemetry (`last`, `p50`, `p95`) for intake/manual wording actions and surfaced summary labels in active Billie UI states.
   - Diagnostics now includes a Billie refine-latency panel so perceived assistant responsiveness can be tracked over time.
138. Client memory trust controls
   - Added a launcher-accessible Memory screen at `/settings/memory`.
   - Users can inspect remembered client details, send emails, prior notes, and recurring cadences.
   - Users can delete one remembered client or clear all remembered clients for the current local/account scope.
139. Quick payment terms
   - Added one-tap `Due on receipt`, `Net 7`, `Net 14`, and `Net 30` terms in the manual editor.
   - Terms are added to invoice notes and now set a structured due date without changing totals, tax, discounts, line items, or payment status.
   - Reapplying a term replaces the prior quick-term line instead of duplicating stale due-date language.
   - Due dates now persist through saved invoice metadata and show in the invoice library.
140. Due-date-aware follow-up reminders
   - Reminder candidate selection now uses structured due dates as first-class triggers when the due date falls after the original send.
   - Launcher and Invoice Library follow-up cues prioritize past-due sent invoices before generic stale sent invoices.
   - Date-only due dates render as local calendar dates in the UI so mobile users do not see off-by-one due dates.
141. Open-balance reminder safety
   - Saved invoice metadata now includes `balanceDue` so lightweight lists can distinguish outstanding work from cleared work.
   - Reminder automation skips sent invoices with no open balance even if they are stale or past due.
   - Launcher and Invoice Library follow-up cues now use open balance instead of raw invoice total for collections prompts.
142. Launcher quick paid action
   - Follow-up cards in the launcher now include a secondary `Mark paid` action for fast offline-payment cleanup.
   - Generic status updates now clear `balanceDue` when marked paid and restore it from total when moved back to sent/draft from paid.
   - Added regression coverage for status/balance consistency and launcher action visibility.

## Next (current priorities)
1. Optional modularization continuation
   - Continue splitting large frontend orchestration files into focused modules/hooks as non-blocking hygiene work.

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
1. Advanced smart rate defaults by service + client
   - Description: Expand rate suggestions into stronger client/service weighting, confidence ranking, and optional one-tap apply inside manual editing.
   - Why it beats Excel: Cuts repetitive pricing setup while keeping money control explicit.
   - Estimated complexity: Medium
   - Impact score: Retention
   - Dependency: Line-item memory + service-aware labor-rate suggestion baseline (shipped)
2. Recurring invoice reminders
   - Description: Expand reminders into explicit recurring schedules per client/service (weekly/monthly/custom) with one-tap prefilled invoice-again actions.
   - Why it beats Excel: Prevents missed billing cycles without manual calendar management.
   - Estimated complexity: Medium
   - Impact score: Retention
   - Dependency: Invoice-again baseline + sent follow-up reminder baseline (shipped)
3. "Draft recovery inbox" for abandoned work
   - Description: Surface stale unfinished drafts with one-tap resume actions and lightweight guidance.
   - Why it beats Excel: Reduces lost progress and unfinished invoices that normally disappear in manual workflows.
   - Estimated complexity: Low
   - Impact score: Retention
   - Dependency: Existing scoped draft persistence (shipped)

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
   - Dependency: Payment status tracking + send-from-app flow + sent follow-up reminder baseline (shipped)

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
