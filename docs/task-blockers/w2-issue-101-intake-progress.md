# W2 — issue #101 blocked by file ownership overlap

Issue: https://github.com/daveybehavey/Invoice/issues/101

Implementation remains unresolved. Stop required by the task's standing fence:

> If the scope collides with an open PR or a file another task owns, stop and say so in the PR body instead of forcing it.

The initial open-PR check found only documentation PRs #98 and #99. During the final check, newly opened draft PR #108 appeared:
https://github.com/daveybehavey/Invoice/pull/108

PR #108 changes `public/utils/onboardingState.js`, `src/onboardingState.test.ts`, and `src/ui.test.ts`. The prepared #101 fix also added acceptance coverage in `src/ui.test.ts`. This is a file ownership collision; no attempt was made to move tests elsewhere to work around it or incorporate #108.

The unpublished experiment preserved identity-scoped intake notes, messages, review and decision state, and retry context; restored date values; reset the saved session on New intake; reconciled the visible next action when work was absent; and disclosed storage failures before navigation. It passed the frontend/TypeScript build and four focused browser regressions using installed system Chromium: review → launcher → return → reload → editor handoff, unsubmitted notes/reset, storage failure disclosure, and corrupt snapshots/identity isolation. Those results describe only the unpublished experiment. No implementation or tests are included in this PR, and no delivered acceptance check is claimed.

After the overlap is resolved or explicitly authorized, resume #101 against the current base and rerun its acceptance check: type a unique job, reach review, visit the launcher, return, reload, recover the same work, and exercise the editor action. Also cover unsubmitted notes, reset, failed/corrupt storage, interrupted requests, follow-up decisions, seed precedence, and identity boundaries as appropriate.

No product decision was made that requires an answer. This PR changes only this blocker document. No checkout/Stripe/payments, HD download system (DL-1), print orders, prices/SKUs/promos, production configuration/flags, dependencies, rendering code, or design assets changed. No deployment performed. Existing StarMapCo rendering inputs remain unchanged.

One task, one branch, one draft PR. Do not merge, mark ready, or deploy.
