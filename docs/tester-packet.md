# NoteBill Tester Packet

Use this when inviting a tester or walking someone through the Android closed test.

Track incoming feedback in `docs/tester-feedback-log.md`.

## Short Invite

```text
Hey, can you help me test NoteBill?

It turns rough job notes into a professional invoice. The test should take about 10 minutes.

Please try this:
1. Install NoteBill from the test link.
2. Open the app.
3. Use the sample notes or paste rough notes for a small fake job.
4. Generate an invoice.
5. Make one edit.
6. Save it.
7. Reopen it from Invoice Library.
8. Export the PDF.

Then send me anything confusing, broken, slow, or ugly. Screenshots help a lot.
You can use the in-app Feedback page, or email support@notebill.app directly.

Important for Google Play: please stay opted in to the test for the full testing period.
```

## Tester Script

Ask the tester to do these in order:

1. Open NoteBill from a fresh install.
2. Tap the main notes/intake path.
3. Use the sample notes or paste this:

```text
Mike Johnson, 1423 Pine St.
April 18 fixed leaking kitchen faucet.
2.5 hours at $85/hr.
Used new supply line $18 and cartridge $32.
Please make it due in 14 days.
```

4. Generate the invoice draft.
5. Check whether client, line items, totals, and due date look right.
6. Edit one line description.
7. Edit one amount or quantity and confirm totals update.
8. Save the invoice.
9. Reopen it from Invoice Library.
10. Export/download the PDF.
11. Optional: try sign-in with an email link.
12. Optional: mark sent, mark paid, or send a reminder if those controls are available.
13. Open Manage -> Feedback and send one short note about anything confusing, broken, slow, or ugly.

## Feedback Questions

```text
1. What phone did you test on?
2. Did the app install and open normally?
3. Could you create an invoice without help?
4. Did anything look broken, cut off, overlapped, or hard to tap?
5. Did the generated invoice look trustworthy?
6. Did the totals and due date make sense?
7. Was sign-in clear, especially that it uses an email link and no password?
8. Could you save, reopen, and export the invoice?
9. What felt easiest?
10. What felt most confusing?
11. What one thing would make you more likely to use this again?
```

## In-App Feedback Path

- From the launcher, tap `Feedback`, or open `Show manage tools` and tap `Feedback`.
- Tap `Copy device details` if the bug is visual, device-specific, or hard to reproduce.
- Tap `Email feedback`.
- The email draft includes device details automatically; paste the copied details too if your email app strips them.
- Include a screenshot if the issue is visual.
- Include the phone model and Android version if possible.

## Severity Labels

- `Blocker`: The tester cannot complete create/save/reopen/export.
- `Major`: The tester completes the flow, but with confusion or trust risk.
- `Minor`: The tester completes the flow, but something feels rough.
- `Nice-to-have`: Useful idea, not needed before wider release.

## Pass Bar

- Tester can create, save, reopen, and export a PDF without help.
- Tester understands that money changes require explicit edits.
- Optional sign-in does not block the main flow.
- No mobile layout issue hides a primary button.
- Tester can explain what NoteBill is for after using it once.
