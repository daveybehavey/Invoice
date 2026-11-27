# S4 bug-class sweep — Invoice

Analysis only. Audited main: `08bf1a64d4634e6bae5dfe451a4a8748e65dc46f`. Repository: daveybehavey/Invoice (NoteBill). Review date: 2026-11-03 (America/Vancouver).

## Scope and confidence

This is one findings document, with no implementation changes. CONFIRMED means the stated failure was demonstrated locally or follows directly from the inspected execution path; it does not imply production occurrence. SUSPECTED means a relevant mechanism exists but a necessary reachability or impact condition remains unverified. The starMapAppV2 PRs #560/#557/#559/#558 are class definitions supplied by the operator, not evidence that Invoice has those same defects.

No checkout, Stripe, payments, HD download/DL-1, print-order, price/SKU/promo, production configuration/flag, rendering asset, or dependency changes are proposed by this PR. Existing StarMapCo rendering inputs are unchanged. No sends, provider calls, deployments, merges, or ready transitions were performed.

## Coverage

| Class | Result |
| --- | --- |
| (a) Silent degradation | C1 confirmed: business identity persistence failure is swallowed. |
| (b) Stale-snapshot persists | S1 suspected: stale wording response replaces fresher in-memory draft; durable persistence and UI concurrency not established. |
| (c) Feedback behind reveal | S2 suspected: specific review warnings hidden by default; computation already happens outside reveal, so only a partial class match. |
| (d) Config/test pins drift | C2 confirmed: test discovery pattern omits root regression suites under the inspected POSIX shell. This is discovery configuration drift, not a proven stale expected-value assertion. |

Read paths included business profile/logo storage and settings callers; manual draft storage/save handling; import extraction/preview; intake actions, orchestration, readiness, review model/card; repository persistence interface; provider/pipeline fallback boundaries; package test command; frontend build and service-worker registration/cache. This is a bounded source sweep, not proof that all other paths are defect-free. Protected operational systems were not exercised.

## CONFIRMED

### C1 — Branding persistence silently fails while reporting success (class a)

**Evidence:** [writeProfile catch](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/utils/businessProfile.js#L111) (111–117), [saveBusinessProfile](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/utils/businessProfile.js#L143) (143–149), [settings save handler](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/settings/businessIdentity.jsx#L252) (252–272).

writeProfile catches every localStorage.setItem failure and returns normally. saveBusinessProfile returns the normalized profile regardless of whether the write succeeded. The settings caller then sets “Business identity saved.” and clears its error. Its catch cannot observe the storage error that was swallowed.

**Trigger / consequence:** storage quota exhaustion or denied writes, including a large logo, can discard saved branding/default identity. The current view can look updated while a subsequent read returns the old profile or defaults. This loses the promised reuse on later drafts.

**Validation:** an inline Node vm loaded the unmodified utility with synthetic browser globals. localStorage.getItem returned null and setItem threw a synthetic quota error. saveBusinessProfile({fromDetails: "Synthetic Company"}) returned that name without throwing; the next getBusinessProfile().fromDetails was empty. Both assertions passed. The browser UI itself was not run.

**Follow-up design, separately authorized:** return a persistence outcome or propagate the write failure; show success only after persistence. Verify failure retains the previous stored profile and exposes a recoverable error. Do not silently remove logo/branding to make the write appear successful.

### C2 — Default test selection omits root regression files on POSIX (class d)

**Evidence:** [test script](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/package.json#L15) (15–16); root suites include [API coverage](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/src/api.test.ts#L1), [UI coverage](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/src/ui.test.ts#L1), and [legal regression coverage](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/src/legalFoundation.test.ts#L1).

The command uses unquoted `src/**/*.test.ts` plus the golden corpus path. In the inspected /bin/sh, ** is expanded as a single path component rather than recursive globstar. Existing nested matches cause the shell to replace the pattern before tsx receives it. Consequently, root `src/*.test.ts` files are omitted, even if tsx could expand an unexpanded recursive pattern on another platform.

**Validation:** ran /bin/sh with printf of the exact two script path arguments, without launching tests. Compared the resulting paths with fs.readdirSync("src"). There were 22 selected path arguments (including the explicit corpus), 14 root test files, and **zero selected root files**. This proves omission on this shell; no claim is made about Windows or a differently configured npm script-shell.

**Impact:** a successful default test run on this platform can miss API/UI/legal and other root guard suites. No assertion failure or production regression is claimed. Existing historical Terms pins are intentional version coverage, not automatically stale expectations.

**Follow-up design, separately authorized:** use deterministic cross-platform file discovery and assert inclusion of root and nested suites. Validate the selected manifest before running applicable suites. This PR changes neither package scripts nor protected regression code.

## SUSPECTED — do not treat as validated user-visible defects

### S1 — Wording completion applies the request-time invoice over newer draft state (class b analogue)

**Evidence:** [request capture and response application](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/actions.js#L446) (446–501), [scoped wording request](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/actions.js#L517) (517–575), [merge and setFinishedInvoice](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/actions.js#L353) (353–409). Local handlers [saved wording](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L1126) (1126–1187) and [saved notes](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L1189) (1189–1240) replace draft state without advancing requestIdRef.

The response path does call getState(), but still merges against state.finishedInvoice captured before awaits; latestState supplies surrounding metadata rather than a revision check on the invoice. The request ID excludes newer requests, not necessarily intervening local edits.

**Isolated mechanism reproduced:** a deferred synthetic reword-line response was started with notes “old note”; the harness changed current draft notes to “newer local note” without changing the request ID. Completing the response restored “old note”. The assertion passed using the unmodified action factory and no network.

**Why suspected:** the harness directly changes state. It does not prove a user can invoke the competing local action while isTyping is true; many review controls are disabled then. No persisted invoice overwrite was demonstrated, so this is not a confirmed durable stale-snapshot defect.

**Next evidence:** browser test with a deferred mocked response; attempt each real local edit/undo/import action while it is pending. Promote only if an enabled action can change the invoice and completion loses it; separately test explicit save/reopen if durable impact is alleged. Consider revision rejection or field-scoped application only after that evidence.

### S2 — Specific incompleteness feedback is inside collapsed review details (partial class c match)

**Evidence:** [collapsed default](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L374), [expanded visibility](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L1593) (1593–1595), [warning computation](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/reviewModel.js#L285) (285–291), [hidden unparsed content and warnings](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/reviewCard.jsx#L798) (798–845).

Missing-amount, labor-gap, and unparsed-detail messages render only when showReviewExpandedSections is true. However, these facts are already computed outside the reveal. [Always-visible summary](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/reviewCard.jsx#L230) (230–247) displays decisions/next action, and [summary model](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/reviewModel.js#L194) (194–213) reports decision/quality-blocker counts. Therefore the mere hidden detail is not proof that required feedback is absent.

**Potential condition:** an unparsed or incomplete item that is not represented in decisions/quality blockers could receive “Ready to generate” in the compact summary while its specific warning remains hidden.

**Why suspected:** no reachable server payload was demonstrated with that mismatch. Directly manufacturing inconsistent payloads would not establish a production path. The original class describes computation deferred until reveal; this candidate concerns visibility only.

**Next evidence:** drive synthetic source text through the real intake pipeline with mocked provider output and inspect the default collapsed UI. Confirm the first actionable warning is visible before expansion, with consistent generation gating. If summary/quality gates already cover every reachable case, close this candidate.

## Validation and collision record

- Base SHA matched the clean local checkout and GitHub recursive tree. No tracked/untracked changes existed during the read-only sweep.
- Two inline Node vm checks used synthetic data only; both passed with the limited meanings described above.
- POSIX test-selection enumeration passed; it executed no test files.
- Full npm test, build, browser tests, operational scripts, sends, and deployments were not run. A documentation-only change does not establish application test success.
- Open PR checks before analysis and before document creation found only #98, which adds AGENTS.md. Its file ownership does not overlap docs/audits/s4-invoice-bug-class-sweep.md. Open issue review found no explicit ownership of that new report path. Existing issues are context, not authorization to implement their work.
- No fixes, issue creation, outbound messages, merges, ready transitions, auto-merge, or deployment commands are part of this task. Any later implementation needs a separately scoped task and a fresh collision check.
