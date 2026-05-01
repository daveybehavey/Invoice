# Google Play Closed Testing Kit

Last updated: 2026-04-27

This is the practical NoteBill plan for getting through Google Play closed testing.

For the short handoff to send testers, use `docs/tester-packet.md`.

## Operating Blocks

Use these blocks to keep the test round tidy.

1. Release closeout: upload the current Android bundle, confirm Play Console has no blockers, and run `docs/smoke-pass-checklist.md`.
2. Tester invite: send the closed-test link and `docs/tester-packet.md` to the tester list.
3. First 48 hours: confirm testers installed, opened, and completed the core create/save/reopen/export path.
4. Feedback triage: log issues in `docs/tester-feedback-log.md`, grouped by workblock and severity.
5. Fix pass: fix blockers and major trust issues first; batch minor polish unless it hides a primary action.

## While The Clock Is Running

If testers are already opted in and the 14-day window is active, default to operational work instead of broad product changes.

Good use of the waiting window:

1. Watch for real-device feedback and log it quickly.
2. Keep Play Console metadata, release notes, and reviewer answers current.
3. Prepare the next higher-version Android bundle so a fast resubmission is ready if Play rejects an older build.
4. Tighten tester instructions, triage rules, and production-access answers.
5. Fix only blockers, major trust issues, or Play-review-specific problems.

Avoid during the waiting window:

1. Broad UI rewrites.
2. New workflow branches that testers are not already using.
3. Risky refactors that churn the tested surface.
4. Shipping untested feature ideas just to stay busy.

## Daily Closed-Test Loop

Use this once per day while the test is active:

1. Confirm the active Play build/version and whether any review warnings appeared.
2. Check whether new tester feedback arrived through the in-app Feedback path, email, or direct messages.
3. Log every issue in `docs/tester-feedback-log.md` with workblock and severity.
4. Update pass counts in the workblock rollup so patterns show up early.
5. If a blocker or major trust issue appears, decide whether it is worth breaking the no-churn rule.

Escalate immediately if any of these happen:

1. Testers cannot install or open the app.
2. Testers cannot create, save, reopen, or export an invoice.
3. Money, due dates, or invoice status feel untrustworthy.
4. Play Console flags a policy, target SDK, or app-access blocker.

## What Google currently requires

If your developer account is a **personal** account created after **November 13, 2023**, Google currently requires:

- at least **12 testers**
- in a **closed test**
- who stay **opted in continuously for 14 days**

Official sources:

- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9845334

Important notes:

- Testers need a Google Account or Google Workspace account.
- Testers count only if they remain opted in for the full 14 consecutive days.
- Friends, family, colleagues, classmates, and target-user communities are acceptable sources of testers.

## Fastest realistic tester plan for NoteBill

Aim for **15 to 18 invites**, not exactly 12. Some people will forget to opt in or stop responding.

Best mix:

1. Personal network: 4 to 6
   - friends
   - family
   - coworkers
   - former clients
2. Target users: 4 to 6
   - freelancers
   - contractors
   - tradespeople
   - solo service businesses
3. Broader network: 4 to 6
   - local business contacts
   - Slack or Discord groups
   - Facebook groups for contractors, freelancers, or local small businesses

For NoteBill, the strongest testers are people who already write invoices from rough notes.

## What testers actually need to do

Tell testers to do these 4 things:

1. Open the Google Play opt-in link and join the closed test.
2. Install NoteBill from the Play Store.
3. Use it at least 2 to 3 times during the next 14 days.
4. Send feedback from NoteBill's in-app Feedback page, by reply email, or through your form.

They do **not** need to use it every day nonstop. They do need to stay opted in.

## Copy-paste invite message

Subject:

`Can you help test my Android app for 2 weeks?`

Body:

```text
Hey - I'm launching an Android app called NoteBill and I need a small group of real testers for Google Play.

It helps freelancers, contractors, and service businesses turn rough notes into professional invoices.

What I need from you:
- Join the closed test from this Google Play link
- Install the app
- Try it a couple of times over the next 14 days
- Send me any honest feedback, bugs, confusing parts, or rough edges

Important: Google only counts testers who stay opted in for 14 continuous days, so please don't leave the test early.

Closed-test link:
[PASTE PLAY OPT-IN LINK]

Feedback:
Open NoteBill -> Show manage tools -> Feedback, or email support@notebill.app

Thank you - even a little testing helps a lot.
```

## Copy-paste reminder message

```text
Quick reminder on NoteBill testing: if you already joined, please stay opted in until [DATE 14 DAYS LATER] so Google counts the closed test correctly.

If you haven't tried it yet, the easiest test is:
1. Paste rough job notes
2. Build the invoice draft
3. Make one edit
4. Export or save it

Any bugs or confusing spots are genuinely helpful.
```

## Simple tester script

Give testers this exact script:

1. Open NoteBill.
2. Paste rough notes for a fake or real small job.
3. Generate the invoice draft.
4. Check whether the line items and totals look reasonable.
5. Edit one line manually.
6. Save the invoice.
7. Export the PDF.
8. Tell me:
   - what felt easy
   - what felt confusing
   - whether you would trust it for real work

## Feedback questions

Use these questions in email, Google Form, or Notion:

1. What kind of work do you do?
2. Did you install the app successfully?
3. What kind of notes did you test with?
4. Did the invoice draft look mostly correct?
5. What was confusing or frustrating?
6. Did anything feel broken or unreliable?
7. Would you trust this for a real invoice? Why or why not?
8. What one improvement would matter most?

## Production access answers draft

Google asks about your closed test, feedback, and readiness. These are safe starting points for NoteBill.

### How did you recruit testers?

```text
I recruited testers through my personal and professional network, plus people who match the app's target audience: freelancers, contractors, and small service businesses that regularly create invoices from rough notes.
```

### How did testers use the app?

```text
Testers installed the app through a closed test on Google Play and used it to turn rough notes into invoice drafts, review line items, make edits, save drafts, and export invoices. This matches the expected production use case for NoteBill.
```

### How did you collect feedback?

```text
I collected feedback through direct email replies and structured feedback questions. I focused on bugs, confusing steps, trust concerns around invoice accuracy, and whether users felt comfortable using the app for real work.
```

### What feedback did you receive?

```text
Testers mainly focused on clarity, trust, and workflow speed. The most useful feedback was around making the sign-in flow clearer, reducing friction when reviewing invoice details, and making it easier to understand what the app captured from messy notes before sending or saving.
```

### What changes did you make based on testing?

```text
Based on testing and internal verification, I improved the sign-in flow by switching from insecure email-only session creation to verified email-link sign-in, tightened review and decision handling, and kept saved invoice behavior scoped to the authenticated account.
```

### How did you decide the app was ready for production?

```text
I considered the app production-ready after closed-test feedback was addressed, the main invoice creation and editing flows were stable, public policy/support pages were live, and the automated test suite passed across API and UI coverage.
```

## Practical target dates

Once your 12 testers are opted in, mark:

- `Closed test start:` [DATE]
- `Earliest production access application:` [DATE + 14 DAYS]

Do not count from when you first sent the invite. Count from when enough testers are actually opted in.
