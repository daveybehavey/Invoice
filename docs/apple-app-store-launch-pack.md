# Apple App Store Launch Pack

Status: draft
Goal: prepare NoteBill for a future iOS launch without needing a personal Mac right now.

Apple supports managing App Store Connect on the web and uploading builds through Xcode, Transporter, altool, or Xcode Cloud. App metadata can be edited in App Store Connect, and keywords are limited to 100 bytes total, separated by commas with no spaces.

## App information draft

### App name

`NoteBill`

### Subtitle

`Quick invoices, follow up`

This fits the short subtitle limit and stays focused on the core value.

### Primary category

Likely:
- Business

Potential secondary fit:
- Productivity

### Description draft

NoteBill helps service businesses and solo operators turn rough notes into clean invoices, statements, and follow-up faster on mobile.

Paste job notes, capture a voice note, or start from a draft Billie prepares for you. NoteBill keeps the money decisions visible so you stay in control before anything is sent.

What NoteBill helps you do:

- Turn rough notes into a send-ready invoice draft
- Review Billie’s draft before you approve the money
- Reuse client details, wording, and repeat work faster
- Send statements and keep follow-up organized
- Keep invoicing mobile-first and low-friction
- Export branded PDFs when you need a clean handoff

Who it is for:

- Contractors
- Cleaners
- Landscapers
- Plumbers
- Electricians
- Photographers
- Freelancers and solo service operators

What NoteBill is not:

- Not full accounting software
- Not a bookkeeping platform
- Not a blank template editor
- Not an autonomous money-deciding AI

Best-practice framing:
- Billie drafts fast.
- You approve the money.
- NoteBill helps you get from rough notes to a send-ready workflow without extra admin drag.

## Keywords draft

App Store Connect keywords are limited to 100 bytes total and should be comma-separated with no spaces around commas.

Draft keyword set:

```text
invoice,contractor invoice,service invoice,mobile invoice,statement,follow up,pdf
```

Why this set:
- covers the highest-intent search terms
- stays close to the product wedge
- avoids generic terms like `app`

## Screenshot plan

Apple allows 1 to 10 screenshots per localization, and App Store Connect accepts multiple iPhone display sizes.

Recommended iPhone screenshot story:

1. Quick AI invoice entry
2. Rough notes to draft screen
3. Money review / approval state
4. Send-ready invoice or PDF handoff
5. Client statement and follow-up flow
6. Repeat-work / library memory screen
7. Trust / FAQ or support-friendly screen

See also:
- [iOS screenshot capture checklist](./ios-screenshot-capture-checklist.md)
- [Apple App Store screenshot storyboard](./apple-app-store-screenshot-storyboard.md)

Recommended caption set:

1. Paste rough notes and start fast
2. Billie prepares the first draft
3. You stay in control of the money
4. Send a clean invoice or PDF handoff
5. Keep statements and follow-up organized
6. Reuse repeat work faster next time
7. Get the answer to "why not just use ChatGPT?"

## Asset checklist

Prepare these before the first iOS submission:

- App icon set
- 1 to 10 iPhone screenshots
- Privacy policy URL
- Support URL
- Marketing website URL
- App Store description
- Subtitle
- Keywords
- Age rating answers
- Advertising ID / data use declarations

## Recommended iOS launch sequence

1. Keep the web product and offer stable
2. Finalize the App Store metadata in this doc
3. Capture iPhone screenshots from the best mobile flow we already have
4. Use Xcode Cloud, a borrowed Mac, or a rented cloud Mac when ready
5. Upload to TestFlight first
6. Fix iOS-only issues
7. Submit to the App Store

## Current recommendation

Do not buy a Mac yet.

Keep the product and launch assets ready, then use the cheapest Mac build path when the iOS release is worth doing.
