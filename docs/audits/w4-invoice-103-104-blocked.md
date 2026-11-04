# W4 blocked: Invoice issues #103 and #104

W4 must stop under the task's standing ownership fence.

The initial collision check found only PRs #98 (AGENTS.md) and #99 (audit document), with no overlap. The final pre-PR check found open PR #108, "fix: complete onboarding through the manual-first invoice flow", owning both public/utils/onboardingState.js and src/ui.test.ts. These files are required by the prepared W4 wording and regression updates.

Overlapping PR: https://github.com/daveybehavey/Invoice/pull/108
Issues: https://github.com/daveybehavey/Invoice/issues/103 and https://github.com/daveybehavey/Invoice/issues/104

The prepared implementation distinguished device autosave from library save, kept a persistent library-save reminder, offered reopening the saved invoice, and prioritized Download PDF after save with optional link/portal guidance. Five focused editor browser tests, the frontend/TypeScript build, and the invoice golden corpus passed. The older full onboarding test timed out at the intake Generate Invoice control; its unchanged test body reproduced that failure before the editor.

The implementation was published to this task branch before the final collision check discovered #108. A follow-up commit restores every application/test file to the base revision. The final PR diff contains this blocker document only. The implementation is not proposed for merging, and neither issue's acceptance check is claimed complete.

Resume only in a later authorized task after ownership of the overlapping files has been resolved. No product decision was needed; the blocker is concurrent file ownership.

This task produces one branch and one draft PR only. Do not merge, mark ready, enable auto-merge, or deploy. Protected payment handlers, checkout/Stripe services, DL-1, print orders, prices/SKUs/promotions, production configuration/flags, and StarMapCo designs are outside scope.
