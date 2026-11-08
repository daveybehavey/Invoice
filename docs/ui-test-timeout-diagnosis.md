# Legacy `src/ui.test.ts` timeout diagnosis

**Lane:** diagnosis only (narrow repair licence).  
**Date:** 2026-11-08  
**Base:** `main` @ `3f42124b7f2bb0151f22df62041030eb2ed0d3b8`  
**File identity:** `src/ui.test.ts` blob `81d5fa8925e3fdbaf1b79b7f846e57606a67b99a` (14803 lines), unmodified from that head.  
**Disposition:** **(b) product implicated — findings memo only; zero code/test changes.**

Every command below was run with proxy env vars stripped:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy …
```

---

## Start gate

| Check | Result |
| --- | --- |
| `origin/main` HEAD | `3f42124b` (`fix(web): serve a real /llms.txt instead of the SPA shell (#132)`) |
| `src/ui.test.ts` present / unmodified | yes |
| `npm test` (proxy stripped; does **not** include root `src/ui.test.ts`) | **224 tests, 219 pass, 0 fail, 5 skipped**, ~7.1s |
| Explicit `src/ui.test.ts` on pristine main | **reproduced red** (see below) |

Open draft PRs checked for collision (`#117`, `#116`, `#114`, `#113`, `#99`): docs/chore/findings only; none own this diagnosis file or a competing `ui.test.ts` fix.

---

## Reproduction (pristine main)

### Full file, no artificial Node `--test-timeout`

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  npx tsx --test --test-concurrency=1 --test-reporter=spec src/ui.test.ts
```

| Metric | Value |
| --- | --- |
| Wall clock | **1555.116s** (~25.9 min) |
| Reporter | `ℹ tests 252` / `pass 200` / `fail 52` / `cancelled 0` / `skipped 0` |
| Exit | non-zero |

This is **not** an infinite hang or open-handle teardown stall. The process exits cleanly after the last test. What looks like a “timeout” under short outer budgets is the sum of many Playwright default **30s** waits on UI that never appears.

### Short outer budget (why earlier runs look like a file-level hang)

With `--test-timeout=120000`, the runner cancelled mid-file after ~120s wall clock (`cancelled 1`, message `test timed out after 120000ms` on `src/ui.test.ts`) after only ~15 tests — three of which had already burned ~30s each on Playwright waits. That signature matches “the file times out,” but the underlying per-test mechanism is the 30s locator wait, not a stuck `before`/`after` hook.

### Isolation (bisection / name-pattern)

| Test | Alone | Suite | Stage |
| --- | --- | --- | --- |
| `manual, intake, and library can open the help center` | **pass** (~2.1s) | usually pass; one flaky miss observed once early | body (Playwright click) when it fails |
| `launcher sign-in modal shows provider readiness and email sign-in fails closed when delivery is unconfigured` | **fail** (~30.9s) | fail | **test body** — `locator.fill` on disabled input |
| `decision CTA switches and undo restores unresolved decision state` | **fail** (~30.8s) | fail | **test body** — `waitFor` “Resolve decisions” |
| Same family: decision undo / mobile generate CTA / many intake+Billie builds | fail alone or in suite | fail | **test body** after Build invoice |

Hooks (`before` browser+server listen, `beforeEach` store reset, `afterEach` runner reset, `after` close) complete. Failed isolates exit promptly after the Playwright timeout; no open-handle listing needed beyond “process exits with fail.”

### Proxy comparison (environment ruled out for the lead failure)

`decision CTA switches…` with dead proxies (`HTTP(S)_PROXY=http://127.0.0.1:9`) vs proxy-stripped: **same failure, same ~32s wall clock, same Playwright wait**. Proxy vars are not the mechanism for this timeout.

---

## Root cause (one mechanism)

**Primary mechanism:** `POST /api/invoices/from-input` is gated by `requireProviderDispatchSession` in `src/server.ts` (SEC-04 / S93-3). Without a validated session Bearer token from client `localStorage`, the route returns **`401 {"error":"Authentication required."}`** in every environment, including `NODE_ENV=test`.

Legacy UI tests call **Build invoice** as an unsigned guest. The API refuses; the intake UI never reaches decision/generate sticky CTAs; Playwright waits for those buttons until the **default 30s timeout**. That is the “hang.”

### Hard evidence

**Unauthenticated minimal repro** (same mocks as the test: `structuredDecisionDraft` + `decisionAudit`, click Build invoice):

- Network: `POST /api/invoices/from-input` → **401** `Authentication required.`
- Sticky panel buttons: **none** after 20s of polling
- UI remains on paste step (“Step 1 of 4: Paste”)

**Authenticated control** (same flow, but seed session the way the OCR UI test already documents):

```text
context.request.post(/api/auth/session/verify) +
context.addInitScript → localStorage invoiceSessionToken / invoiceAuthSession / invoiceOwnerId
```

- Network: `POST /api/invoices/from-input` → **200** with structured invoice payload
- Sticky buttons within ~500ms include **`Resolve decisions`**, `Add`, `Skip`
- Account chrome shows the signed-in email

So the product path **settles correctly when authenticated**. It does not deadlock. The legacy tests wait on UI that the product intentionally will not show without a session.

### In-repo contrast (already-known pattern)

`importing image notes requires OCR review before building draft` in `src/ui.test.ts` already comments and implements SEC-04 session seeding for provider dispatch. Most intake / Billie / labor-follow-up / review-details tests that call Build invoice **do not**.

### Secondary failure class (same disposition)

`launcher sign-in modal shows provider readiness and email sign-in fails closed when delivery is unconfigured`:

- Product disables `#launcher-auth-email` when `!emailLinkReady` (`public/features/launcher/launcherSections.jsx`).
- Test asserts fail-closed copy, then `fill()`s the disabled input.
- Playwright retries “element is not enabled” for 30s → TimeoutError.

That is also **product fail-closed UX vs stale test interaction**, not a harness leak.

### Classification

| Class | Verdict |
| --- | --- |
| Environment (proxy/port/fs/clock) | **No** — stripped vs dead-proxy identical; server listens; suite completes |
| Test harness (timeouts/setup/teardown/isolation/handles) | **Not the root mechanism** — no stuck hooks/open handles; short `--test-timeout` only truncates the long red run |
| Product code | **Yes** — SEC-04 session gate on JSON AI routes (`requireProviderDispatchSession` in `src/server.ts`); fail-closed disabled email field in launcher UI |

---

## Disposition

**(b) Product implicated → STOP.**

This PR contains **only this findings memo**. No product edits, no test edits, no assertion changes, no skips, no timeout raisings.

A future **authorized baseline-test remediation** (outside this lane) would need to seed validated sessions for AI-gated UI tests the same way the OCR test already does — that is test remediation against an intentional product fence, not a harness-only timeout fix. Weakening `requireProviderDispatchSession` or adding a test-only auth bypass in product code is explicitly out of licence for this programme.

### Out-of-scope confirmation

- No NB-A-01 tax work
- No edit to `src/services/stripeBilling.ts`
- No SEC-07 cutover work
- No price / payment / send changes

---

## Baseline numbers to judge later remediations against

| Suite | Command | Result |
| --- | --- | --- |
| Package regression | `npm test` (proxy stripped) | 224 / 219 pass / 0 fail / 5 skipped |
| Legacy UI | `npx tsx --test --test-concurrency=1 src/ui.test.ts` (proxy stripped) | 252 / 200 pass / **52 fail** / ~1555s |

Representative first-in-file body timeout (canonical known-red case from prior audits):  
`decision CTA switches and undo restores unresolved decision state` — waits for sticky **Resolve decisions** after Build invoice; fails at Playwright 30s because `/from-input` returned 401.
