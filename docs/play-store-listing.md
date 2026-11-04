# AP4 — NoteBill Google Play listing pack (draft)

Reviewed against main `08bf1a64d4634e6bae5dfe451a4a8748e65dc46f`. This document replaces the earlier listing draft. Documentation only: no store fields or assets have been uploaded or submitted. Repository implementation establishes scope, not production availability or Android device acceptance. No roadmap item is presented as available.

## Listing fields

English draft. Counts include spaces and punctuation, excluding the code fences and headings. Title: 23/30 characters; short description: 68/80; full description: 1457/4,000.

### Title

```text
NoteBill: Invoice Maker
```

### Short description

```text
Turn job notes into editable invoices. Review, save and export PDFs.
```

### Full description

```text
Turn the notes from your latest job into an invoice you can review and edit. NoteBill helps freelancers, independent contractors and small service businesses organize rough job details into clear, itemized invoices.

START WITH YOUR JOB NOTES
Paste your notes and let Billie, NoteBill's AI assistant, prepare a structured draft. Review what it understood before moving on. When labor pricing is missing, NoteBill asks for more information so you can resolve it.

KEEP CONTROL OF THE DETAILS
Review descriptions, quantities, rates and totals. Edit line items manually and adjust the wording to suit your client. Use wording and tone controls to refine a description or the invoice text, then check the result before saving.

COME BACK TO SAVED WORK
Save invoices, reopen them to make changes, or duplicate a saved invoice as a starting point for another job. Update invoice status manually to keep track of your work.

EXPORT A PDF
Create a PDF of your invoice after reviewing the details.

Built for service work: from a freelance project to a repair, cleaning visit or consulting job. Start with what you wrote down, review the draft and finish with an invoice that describes the work clearly.

AI-generated drafts and wording need your review. Check customer details, descriptions, quantities, rates and totals before using an invoice. An internet connection is required for AI assistance and server-backed saved invoices; sign-in may be required to save.
```

## Screenshot shot-list

Planning only; screenshots were not captured or device-tested for AP4. Use the current Android UI, portrait phone captures in a consistent size, readable at store thumbnail scale. Keep captions outside the captured UI; never invent controls, hide unresolved warnings, or composite a future flow into a real screen. Check current Play Console asset requirements before a separately authorized submission.

Use fictional client “Example Services Client” and synthetic repair/cleaning/consulting notes throughout. Do not expose customer data, email addresses, account identifiers, tokens or production invoices. Any entered sample rates are isolated demonstration data, not changes to product prices, SKUs or promotions.

| Order | Caption | Actual screen and capture setup | Evidence / capture gate |
| --- | --- | --- | --- |
| 1 | Turn job notes into an invoice draft | AI intake with short, readable job notes entered and the existing draft action visible. Capture a settled state. | Intake screen; do not imply generation has completed before it has. |
| 2 | Review the details with Billie | Generated intake review with itemized work and visible review information. | Review card; preserve warnings and unresolved decisions. |
| 3 | Fill in missing labor pricing | A genuine missing-pricing follow-up, with the question and answer control visible. | Use notes omitting labor rates; capture only if the current build produces this state. No promise that every ambiguity is detected. |
| 4 | Edit descriptions and line items | Manual editor with the same fictional job, editable descriptions, quantities and rates, and totals visible. | Show an actual editable state. Do not suggest fully automatic approval. |
| 5 | Reopen saved work | Invoice library with synthetic saved invoices and the existing reopen action visible. | Use a permitted test account if sign-in is required; do not present a mock library as captured UI. |
| 6 | Export your reviewed invoice as PDF | Existing Export PDF control with the reviewed invoice; optionally capture the resulting PDF on a separate frame. | Verify export in the Android build before capture. No native share-sheet or email-send claim. If export fails, record the failure and withhold this shot. |

Shots 1–3: `public/features/intake/aiIntake.jsx` and `reviewCard.jsx`. Shot 4 and 6: `public/features/manual/manualInvoiceCanvas.jsx`. Shot 5: `public/features/library/invoiceLibrary.jsx`. Existing `marketing/play-store/` files are references only; AP4 does not modify or certify them. Avoid the old payment-handoff captions.

## Claim evidence and boundaries (reviewer notes; not store copy)

All links below are pinned to the reviewed main revision, excluding open-PR changes.

| Proposed claim | Repository evidence | Limit applied to copy |
| --- | --- | --- |
| Audience and notes-to-editable-invoice workflow | [README](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/README.md); [product identity](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/docs/technical-north-star.md) | Service-work examples describe the intended audience, not vertical-specific tooling or legal compliance. |
| AI draft, review and missing labor pricing | [intake review/readiness and controls](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L1588); [missing-pricing UI](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L3368) | Requires review; no error-free, autonomous or universal ambiguity-detection promise. |
| Manual edits and wording/tone refinement | [editor and inspector wiring](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/manual/manualInvoiceCanvas.jsx#L4642); [intake tone options](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/intake/aiIntake.jsx#L1729); README wording controls | Do not promise AI output is correct or financial decisions happen automatically. |
| Explicit save, reopen, duplicate and manual status | README core flow/API; [editor save/status handlers](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/manual/manualInvoiceCanvas.jsx#L1853); [library](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/library/invoiceLibrary.jsx) | Manual tracking; no automatic payment reconciliation or delivery confirmation claim. |
| PDF export | [editor PDF handler](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/manual/manualInvoiceCanvas.jsx#L1804); [Export PDF action](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/manual/manualInvoiceCanvas.jsx#L2500) | Android export still needs device acceptance. No promise of automatic email or native sharing. |
| Connectivity and possible sign-in | README OpenAI/server/persistence architecture; [save sign-in guard](https://github.com/daveybehavey/Invoice/blob/08bf1a64d4634e6bae5dfe451a4a8748e65dc46f/public/features/manual/manualInvoiceCanvas.jsx#L1877) | No offline-first, unconditional guest-save or cross-device guarantee. |

Conservative exclusions: payments/checkout, payment links, portals, reminders, recurring invoices, estimates, transcription, OCR/upload format coverage, repeat-work memory, accounting, tax/legal compliance, team tools, offline operation and availability guarantees. Some have repository implementations or mentions; AP4 does not assert runtime configuration or device readiness for them. No pricing, free/unlimited claim, ranking, testimonial or delivery-speed promise is included. No feature is inferred from a roadmap or QA checklist alone.

## Review record

- Read the existing listing, README, product identity and relevant current UI implementations.
- Open PRs #98, #99 and #108–#114 were checked: their changed files do not include this document and their stated scope does not own the listing pack. No changes from those PRs are included.
- Checked field character limits, trailing whitespace, claim/source mapping and docs-only scope. Application tests/build and Android screenshot/export acceptance were not run for this documentation change.
- Standing fences: DRAFT PR only; never merge, mark ready, enable auto-merge, deploy or submit to any store. Checkout/Stripe/payments code, DL-1, print-order pipeline, prices/SKUs/promo values and production config/flags untouched. No rendering code or assets changed; existing StarMapCo design bytes remain untouched. No rendering execution/comparison is claimed.
