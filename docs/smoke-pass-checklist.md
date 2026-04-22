# Smoke Pass Checklist

Use this before giving a build to testers and again after any Play Console review change.

For a copy-paste tester handoff, use `docs/tester-packet.md`.

## Core Flow
- Install the current Play/internal test build.
- Open the app from a fresh install.
- Optional: sign in with email-link auth. Enter an email inbox you control, open the secure link, and return to the app. There is no password.
- Start from the default notes/intake path.
- Paste messy job notes and generate a draft.
- Resolve any follow-up questions or billing decisions.
- Review the generated invoice and confirm line items, totals, tax, and client details.
- Edit one line item description and one line item amount.
- Open Export and confirm the send-ready check says whether client, line items, total, and payment terms look ready.
- Save to the library.
- Reopen the saved invoice and confirm status, totals, and details persisted.
- Export/download the PDF.
- Open Feedback from the launcher footer and from Manage, then confirm device details can be copied or auto-attached to the feedback email.
- Optional: send the invoice by email if delivery is configured.
- Optional: create/open a hosted payment link if Stripe payments are configured.
- Optional: mark sent, mark paid, and run reminder controls to confirm status copy is clear.

## Reviewer Access Check
- Confirm the app is usable without special credentials.
- Confirm optional sign-in explains email-link behavior clearly.
- Confirm no blocked screen requires a password, 2FA code, QR code, membership, location gate, or biometric login.

## Friction Buckets
- Activation: anything that slows the path from open app to draft ready.
- Trust: unclear totals, weird wording, missing validation, confusing paid/unpaid status.
- Billie: assistant status, suggestion clarity, refine speed, and whether users understand numbers are protected.
- Payment: payment-link visibility, paid/unpaid state clarity, reminder copy, and upgrade/paywall confusion.

## Notes To Capture
- Time to first draft.
- Time to send-ready invoice.
- Any UI flashes, blank loaders, or stuck states.
- Any moment where the tester asks, "What do I do now?"
- Screenshots for confusing review, payment, sign-in, or reminder states.

## Pass Bar
- A tester can create, save, reopen, and export a PDF invoice without help.
- Money-changing decisions are explicit and understandable.
- Optional auth does not block review or basic app use.
- No console-visible blocker prevents testing the core app.
