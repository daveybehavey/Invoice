# NoteBill Data Safety Draft

This is a working draft for the Google Play Data Safety form, not legal advice.

Use it as a pre-fill guide, then confirm it against your real production setup before submission. A few answers depend on what is enabled in production, especially Stripe billing, email delivery, analytics/telemetry export, and whether sign-in is required.

## What the current Android wrapper shows

- Android manifest currently requests only `INTERNET`
- No camera permission declared
- No microphone permission declared
- No contacts, location, SMS, call log, or storage permission declared

Source:

- [AndroidManifest.xml](c:/Users/david/OneDrive/Desktop/Invoice/android/app/src/main/AndroidManifest.xml)

## Data types likely handled by the app

Based on the current codebase, NoteBill may handle:

- Email address
  - Used for lightweight account/session identity and billing context
- User-generated content
  - Messy notes, invoice text, uploaded invoice content, invoice drafts, notes/terms
- Audio files and transcripts
  - Audio note upload/transcription flow exists in the web app
- Images or invoice photos
  - OCR/import flow exists for uploaded invoice photos or image notes
- Financial info
  - Invoice amounts, line items, balances, payment status, customer names inside invoices
- App activity / diagnostics
  - OCR metrics, flow friction, telemetry-style diagnostics are present in the codebase

## Data sharing / third parties to review

Potential third-party processors visible in code:

- OpenAI
  - Invoice generation and file transcription / OCR related flows
- Stripe
  - Subscription checkout, billing portal, payment links, and webhook processing
- Email provider
  - Invoice sending and launch test email flows

This likely means some user data is processed by service providers, even if you answer "not shared" in the Play form. Google distinguishes app functionality/service providers from selling data, so review the exact wording carefully during submission.

## Conservative draft answers

Use these as a starting point, then adjust if your live setup differs.

### Is data collected?

Likely `Yes`.

Reason:

- The app sends invoice content and uploads to backend services
- The app may store saved invoices
- The app may collect email addresses for account/session identity

### Is data shared?

Probably `No` for "shared" in the Play form sense, if data is only sent to processors that help operate the app and not sold or used for advertising.

Pause and verify this before submission.

### Is all user data encrypted in transit?

Target answer should be `Yes` if production uses HTTPS everywhere.

Do not answer `Yes` unless the live Android app only talks to HTTPS endpoints in production.

### Can users request data deletion?

Unknown from the current codebase as a product policy.

The app supports deleting saved invoices, but that is not the same as account-level data deletion. You should decide:

- whether users can request deletion of account/session-linked data
- where that request is handled
- what your privacy policy says

## Per-category drafting notes

### Personal info

Email address:

- Collected: likely `Yes`
- Shared: likely `No` in the Play Data Safety sense, but may be processed by Stripe/email provider depending on flow
- Purpose candidates:
  - app functionality
  - account management

### Financial info

Invoice totals, payment-related invoice data, and customer billing details inside invoices:

- Collected: likely `Yes`
- Shared: likely `No` for advertising/sale; processed by service providers where needed
- Purpose candidates:
  - app functionality

### Audio files

If the audio-note transcription feature is available in production:

- Collected: likely `Yes`
- Purpose candidates:
  - app functionality

If you disable this flow for Android production, update the answer accordingly.

### Photos and files

Uploaded invoice PDFs and invoice photos/images:

- Collected: likely `Yes`
- Purpose candidates:
  - app functionality

### App activity / diagnostics

Telemetry-like diagnostics exist in the codebase.

- Collected: possibly `Yes`, depending on production configuration
- Purpose candidates:
  - analytics
  - app functionality

If diagnostics are internal-only and not enabled in production, you may be able to answer more narrowly.

## Open items to resolve before Play submission

1. Publish a privacy policy URL
2. Decide whether Android release includes audio transcription
3. Decide whether diagnostics/telemetry export is enabled in production
4. Confirm whether saved invoices are stored locally, on server, or both in the release environment
5. Confirm whether users have a deletion request path beyond deleting individual invoices
6. Confirm whether billing is active in the Android release and whether Stripe receives customer email

## File references

- [src/services/authSession.ts](c:/Users/david/OneDrive/Desktop/Invoice/src/services/authSession.ts)
- [src/services/stripeBilling.ts](c:/Users/david/OneDrive/Desktop/Invoice/src/services/stripeBilling.ts)
- [src/services/uploadTextExtractor.ts](c:/Users/david/OneDrive/Desktop/Invoice/src/services/uploadTextExtractor.ts)
- [src/server.ts](c:/Users/david/OneDrive/Desktop/Invoice/src/server.ts)
