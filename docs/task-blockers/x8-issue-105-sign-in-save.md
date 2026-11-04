# X8 / issue #105: implementation blocked by open PR overlap

Issue: https://github.com/daveybehavey/Invoice/issues/105

Implementation stopped under the operator's standing fence: “If the scope collides with an open PR or a file another task owns, stop and say so in the PR body instead of forcing it.”

Open draft PR #108 (https://github.com/daveybehavey/Invoice/pull/108), “fix: complete onboarding through the manual-first invoice flow”, changes:

- public/utils/onboardingState.js
- src/onboardingState.test.ts
- src/ui.test.ts

Issue #105 explicitly identifies public/utils/onboardingState.js as the source of the unconditional optional-sign-in definition. Main still contains the helper “Optional, but helpful if you want saved work tied to your email.” Correcting that definition and verifying onboarding across auth policies overlaps #108's onboarding state and UI test scope. No overlapping application or test file was edited, and #108 was not absorbed into this branch.

After the overlap is resolved or explicitly authorized, the remaining work is to make the entry promise agree with actual save behavior for authRequired true and false, and verify that returning from sign-in resumes the existing invoice. The issue recommends policy-aware copy and draft preservation; this task has not changed auth requirements or selected a different product policy. No live deployment behavior was verified.

This branch records the blocker only. No application behavior, dependencies, rendering inputs/assets, checkout/Stripe/payments, DL-1, print-order pipeline, prices/SKUs/promo values, or production configuration/flags changed. No build, application tests, deployment, merge, or ready-for-review transition was performed. Issue #105 remains unresolved.
