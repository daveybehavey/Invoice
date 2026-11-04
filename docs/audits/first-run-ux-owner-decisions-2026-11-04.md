# First-run UX: draft stack and remaining owner decisions

2026-11-04. All eight findings have implementation proposals; none was found to have a false premise. This is completion of the requested draft-PR work, not approval, merge, deployment, or a production acceptance claim.

## Dependency and disposition record

The existing F3 implementation, [#108](https://github.com/daveybehavey/Invoice/pull/108), remains the keystone. The operator explicitly authorized the overlapping sibling work to be stacked on it. Highs were addressed before Mediums. Review ancestry is:

`main <- #108 <- #118 <- #119 <- #120 <- #121 <- #122 <- this docs PR`

| Finding | Issue | Implementation draft | Previous blocker record | Result |
| --- | --- | --- | --- | --- |
| F1: silent next steps | #100 | [#118](https://github.com/daveybehavey/Invoice/pull/118) | #111 | Notes submit; busy, missing-work, and pricing states respond visibly; readiness still gates editor entry. |
| F2: intake work lost | #101 | [#119](https://github.com/daveybehavey/Invoice/pull/119) | #112 | Identity-scoped tab recovery preserves notes and review across navigation/reload; reset and storage failures are explicit. #122 also protects an explicitly selected new sample from an old recovered review. |
| F3: manual-first completion | #102 | [#108](https://github.com/daveybehavey/Invoice/pull/108) | None | Original keystone retained and revalidated; manual save/export completes the applicable three-step checklist. |
| F4: autosave confusion | #103 | [#120](https://github.com/daveybehavey/Invoice/pull/120) | #115 | Device draft and library save have distinct feedback, a persistent reminder, and an explicit saved-invoice action. |
| F5: post-save guidance | #104 | [#120](https://github.com/daveybehavey/Invoice/pull/120) | #115 | PDF is the consistent finish; optional hosted-link guidance respects known availability. |
| F6: sign-in/save promise | #105 | [#121](https://github.com/daveybehavey/Invoice/pull/121) | #109 | Policy-aware wording precedes Save; an explicit one-time handoff restores editable content after same-tab sign-in without an automatic library save. |
| F7: premature review claim | #106 | [#122](https://github.com/daveybehavey/Invoice/pull/122) | #110 | Automatic milestone says Draft created; unresolved pricing receives accurate action wording and retains readiness gates. |
| F8: false library empty state | #107 | [#122](https://github.com/daveybehavey/Invoice/pull/122) | #110 | Failed/malformed loads show Retry; only successful empty loads show first-invoice prompts. |

The historical blocker PR bodies now link to their replacement drafts. Their code branches were not overwritten or merged. #115's prepared commit b8901f2 was recovered and adapted in #120, explicitly documented in its body.

Correction to the initial PR range: #113 is unrelated identity-persistence/test-discovery work, and #114 is a Node types dependency update. Neither is a first-run blocker record; neither was absorbed or modified. #116/#117 store/release documents were also left untouched.

## Validation and limits

Each implementation PR body records its own build, test counts, and limitations. The complete first-run browser selection on the final implementation stack passed **16/16**. It covers manual-first completion, actionable intake, recovery/reset/identity separation, storage failure, autosave/library distinction and retry, PDF finish and price guards, auth-policy wording and sign-in return, accurate draft-created wording, library retry, and explicit fresh sample handling.

The final implementation's recursive non-browser repository run reports **575 tests: 570 passed, 0 failed, 5 skipped**. The five skips require `INVOICE_TEST_POSTGRES_URL`; no live PostgreSQL test database was configured. Golden corpus is included once. Frontend build and TypeScript pass. The final docs PR body records its own rerun counts.

Full legacy browser coverage is **incomplete**. Initial bundled-browser setup failed; subsequent runs used installed Chrome through an untracked launch shim. Broad runs were stopped after existing UI waits stalled. The `decision CTA switches and undo restores unresolved decision state` test was reproduced on an isolated archive of the exact #108 head e7db886: 0 passed, 1 failed, waiting for Resolve decisions. This is evidence of a pre-existing failure, not evidence that every unrun UI test passes. Earlier PR bodies retain the full attempted-run counts. No hosted CI pass, mobile acceptance, deployment, or real email delivery is claimed.

## Decisions remaining for David

1. **Review and release authorization.** Decide who independently reviews the stack and when it may enter a separately authorized release process. The incomplete legacy browser suite must be addressed in that decision; choose whether to authorize a separate baseline-test remediation task before release evaluation. This task does not merge, mark ready, waive checks, or deploy.
2. **Retention scope for any broader follow-up.** The delivered intake recovery promise is within one browser tab, across navigation and reload. The explicit sign-in handoff is also tab-local, one-time, and limited to 30 minutes; the original device draft is retained. Decide whether the product should additionally promise closed-tab, cross-tab, cross-device, or longer-lived recovery. Those promises would require separately scoped persistence/account UX work; they are not claimed by these drafts.
3. **Disposition of historical blocker drafts.** Decide whether to close #109/#110/#111/#112/#115 as superseded after reviewing their replacements, or retain them as historical records. They remain drafts and were not closed by this task.
4. **SEC-07 cutover remains an independent owner decision.** No download cutover was performed or proposed here. This first-run stack does not resolve or authorize it.

No Terms or archived Terms edits, Play Console or store-listing changes, pricing/revenue claims, or customer contact were made. No backend auth policy, checkout/payment handler, production configuration, dependency, or deployment changes are part of this stack. Existing server-side ownership and money gates remain authoritative.

All eight findings are built as draft proposals. No implementation is left blocked on the former #108 file-overlap fence. Stop after publishing this final docs PR; the decisions above belong to David.
