# Invoice API

Backend flow for:

- messy input or uploaded invoice text
- structured invoice model
- finished invoice output
- sendable invoice document preview
- browser print and PDF (via print dialog)

## Setup

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`.

## Run

```bash
npm run dev
```

Open `http://localhost:3000` for the minimal UI skeleton.

## Tests

```bash
npm test
```

Current regression tests cover:
- labor-pricing follow-up instead of $0 labor finalization
- no silent labor-hour assumptions
- explicit labor pricing produces expected line amounts
- auto-generated invoice numbers when missing
- discount detection (explicit amount + follow-up path)
- line rewording preserves numeric values
- explicit-only save behavior (no auto-save)

Related planning/testing docs:
- `docs/user-testing-plan.md`
- `docs/local-exploratory-testing-report.md`
- `docs/discount-v1-spec.md`

## Prompt Source of Truth

`system.md` is loaded at runtime as the system prompt for:

- parsing messy input
- invoice generation
- per-line wording changes
- full-invoice rewording

No duplicated system prompt text exists in code.

## API Endpoints

- `POST /api/invoices/from-input`
  - JSON body: `{ "messyInput": "...", "uploadedInvoiceText": "..." }`
  - or multipart form-data with `invoiceFile` and optional `messyInput`
  - Can return `needsFollowUp: true` with one follow-up at a time:
    - `followUp.type = "labor_pricing"` when labor pricing is missing
  - Discount behavior: explicit discount amounts in notes are auto-applied; if no amount is provided, no discount question is asked.
  - UI behavior: if no tone guidance is detected in notes, UI asks one tone question before final wording is finalized.
- `POST /api/invoices/from-input/labor-pricing`
  - JSON body:
    - Hourly: `{ "structuredInvoice": { ... }, "laborPricing": { "billingType": "hourly", "rate": 95, "lineHours": [2.5, 2.5] }, "sourceText": "original notes (optional)" }`
    - Flat: `{ "structuredInvoice": { ... }, "laborPricing": { "billingType": "flat", "flatAmount": 285 }, "sourceText": "original notes (optional)" }`
  - Returns invoice-ready output.
- `POST /api/invoices/from-input/discount`
  - JSON body: `{ "invoice": { ... }, "discountAmount": 20, "discountReason": "optional" }`
- `POST /api/invoices/reword-line`
  - JSON body: `{ "invoice": { ... }, "lineItemId": "line_1", "tone": "more concise" }`
- `POST /api/invoices/reword-full`
  - JSON body: `{ "invoice": { ... }, "tone": "friendly" }`

## Persistence (Intentional Narrow Scope)

- No auto-save exists.
- Saving only happens through explicit user action: `POST /api/invoices/save`.
- Saved invoices are editable documents, not accounting records.

### Persistence Endpoints

- `POST /api/invoices/save`
  - Create body:
    ```json
    {
      "confirmSave": true,
      "sourceType": "text_input",
      "invoiceData": {
        "structuredInvoice": { "...": "..." },
        "finishedInvoice": { "...": "..." }
      }
    }
    ```
  - Update existing invoice by including `invoiceId` in the same body.
- `GET /api/invoices`
  - Returns minimal metadata only: `invoiceId`, `createdAt`, `updatedAt`, `status`, `sourceType`
- `GET /api/invoices/:id`
  - Returns the full saved invoice document for reopening/editing
- `POST /api/invoices/:id/duplicate`
  - Duplicates a saved invoice into a new `draft`
- `POST /api/invoices/:id/status`
  - Body: `{ "status": "draft" | "sent" | "paid" }`
  - Manual-only status change; no automatic transitions
