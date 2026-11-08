# Test-harness hardening — Phase 3 (NoteBill marathon)

**Base head:** `3f42124b7f2bb0151f22df62041030eb2ed0d3b8`  
**Exclusion:** `src/ui.test.ts` not run as a fix target and not edited (sibling #133 owns its known-red signature).

## House rule

Every suite invocation used proxy env vars stripped:
`env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy …`

## Run matrix

| Run | Ordering | Command shape | tests | pass | fail | skipped |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| npm-1 | package.json glob order | `tsx --test --test-concurrency=1 src/**/*.test.ts` + goldenCorpus | 224 | 219 | 0 | 5 |
| npm-2 | same | same | 224 | 219 | 0 | 5 |
| npm-3 | same | same | 224 | 219 | 0 | 5 |
| rev-1 | reverse file list | all `src/**/*.test.ts` + root `src/*.test.ts` **except** `ui.test.ts` + goldenCorpus | 628 | 623 | 0 | 5 |
| rev-2 | reverse again | same expanded set | 628 | 623 | 0 | 5 |
| shuf-1 | `shuf` file order | same expanded set | 628 | 623 | 0 | 5 |
| shuf-2 | independent `shuf` | same expanded set | 628 | 623 | 0 | 5 |

**Failures observed:** none outside the excluded `ui.test.ts` (which was not executed in this matrix).

Note: the expanded set is larger than `npm test` because Node’s non-globstar `src/**/*.test.ts` does not pick up root-level `src/*.test.ts`. Expanding the file list (still excluding `ui.test.ts`) is the reordering vehicle; counts differ by design, not by flake.

## Flakes claimed

**None.** No order-dependence, wall-clock failure, or unseeded-randomness failure reproduced across the matrix.

## Residual risk findings (not fixed — no reproduction)

These patterns exist in test files (excluding `ui.test.ts`) but did **not** fail in the matrix. Listed for a future lane if they ever reproduce:

| Class | Location | Note |
| --- | --- | --- |
| Unseeded randomness / port pick | `src/serverStartup.sec08.test.ts` (`Math.random()` port) | Collision theoretically possible; never hit in 7 runs |
| Wall-clock relative | `authSession.test.ts`, `emailSignInRedemptionStore.test.ts`, `requestIdentity.test.ts`, parts of `api.test.ts` | Uses `Date.now()` with relative offsets; stable in matrix |
| Short real sleeps | several delivery/settlement/API tests (`setTimeout` 10–250ms) | Timing waits; no flake observed |

## Fix evidence

No test-file fixes landed. No assertions weakened, no tests deleted/skipped, no timeouts raised. `src/ui.test.ts` untouched (blob `81d5fa8925e3fdbaf1b79b7f846e57606a67b99a`).
