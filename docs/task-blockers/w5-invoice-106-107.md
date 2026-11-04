# W5 Invoice #106 and #107: blocked by an open PR collision

Requested scope: implement issues #106 and #107 together on one branch and in one draft PR.

Implementation stopped at the final collision check. Open PR #108,
https://github.com/daveybehavey/Invoice/pull/108, owns changes to
`public/utils/onboardingState.js` and `src/ui.test.ts`, both needed by W5.
The initial collision check found only non-overlapping documentation PRs #98 and #99;
PR #108 appeared while W5 work was underway.

The standing instruction is: "If the scope collides with an open PR or a file
another task owns, stop and say so in the PR body instead of forcing it."
This branch therefore contains only this blocker note. Neither fix is delivered
by this PR; neither issue should be closed by it. PR #108 was not altered.

## Prepared approach, withheld from this branch

- #106: use the issue's recommended "Draft created" milestone wording, keep the
  stored milestone ID for compatibility, and explain that review and pricing
  decisions precede editor entry. The checklist editor action also needs to
  respect the existing readiness result: a regression showed it could otherwise
  enter the editor while the main action still read "Resolve decisions."
- #107: track invoice-fetch failure independently from general action errors,
  render "We couldn't load your invoices" with Retry, and suppress the empty
  library prompt until a successful empty response.

Before stopping, the unpublished implementation passed the frontend build,
TypeScript check, two focused Playwright browser regressions using installed
system Chromium through a workspace-only executable-path shim, and the existing
intake-readiness test file. Browser regressions covered failure then retry to an
empty library with notes/sample actions, and draft availability with an unresolved
decision followed by successful editor entry after resolution. These results
apply to the unpublished candidate, not to application changes in this PR.
The full suite was not run. The candidate patch and test logs remain in the
local workspace's `work/` directory and are not committed.

## Required coordination

Resolve file ownership with PR #108 before resuming W5. Do not combine, rebase
onto, modify, merge, or mark that PR ready as part of this task. W5 still needs
both issue fixes and their acceptance checks implemented together after the
collision is resolved.

No checkout/Stripe/payments code, DL-1, print-order pipeline, prices/SKUs/promo
values, production config/flags, dependencies, renderer, or design assets are
changed. Existing StarMapCo rendering code and inputs remain unchanged.
No deployment was performed. This PR must remain draft.
