# User Testing Plan (Current Build)

## Objective
Validate whether real users can complete the full loop:
`messy notes -> generate -> review/edit -> save -> reopen -> export PDF`

Secondary objective: confirm optional sign-in, send, payment-link, and reminder flows are understandable when available.

Copy-paste tester instructions live in `docs/tester-packet.md`.

## Test Sample
- 5 to 10 early feedback users for product learning.
- 12+ closed-test users for the Play Console testing window when required.
- Prefer target users: small service business owners, solo operators, tradespeople, freelancers, and contractors.

## Session Format
- 15 to 20 minutes each.
- Think-aloud encouraged.
- Moderator only helps if blocked.

## Tasks
1. Open NoteBill from a fresh install or browser session.
2. Paste messy job notes and generate an invoice draft.
3. Complete any follow-up questions or billing decisions.
4. Edit one line item description.
5. Edit one line item amount and confirm totals update as expected.
6. Save the invoice.
7. Reopen the saved invoice from the library.
8. Export/download the PDF.
9. Optional: sign in with email-link auth using an inbox the tester controls.
10. Optional: send the invoice or create a hosted payment link if the test environment is configured for it.

## What to Capture
- Time to first generated invoice.
- Time to saved/exported invoice.
- Number of clarification questions asked by user.
- Where user hesitates or gets stuck.
- Whether pricing/totals are trusted.
- Whether user believes output is sendable.
- Whether optional sign-in feels clear without a password.
- Whether payment/reminder labels make sense.

## Severity Labels
- Blocker: cannot complete flow.
- Major: completes flow with confusion/risk.
- Minor: friction but task still clear.

## Success Criteria
- >= 80% complete full flow without moderator intervention.
- <= 1 blocker across 5+ sessions.
- Majority report they would send output after light edits.
- No tester believes NoteBill changed money silently.
