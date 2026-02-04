# Invoice API

Backend flow for:

- messy input or uploaded invoice text
- structured invoice model
- finished invoice output

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
  - If labor tasks exist without hours/rate (and no labor amount), response returns `needsFollowUp: true` with a single labor-pricing question.
- `POST /api/invoices/from-input/labor-pricing`
  - JSON body:
    - Hourly: `{ "structuredInvoice": { ... }, "laborPricing": { "billingType": "hourly", "rate": 95, "lineHours": [2.5, 2.5] } }`
    - Flat: `{ "structuredInvoice": { ... }, "laborPricing": { "billingType": "flat", "flatAmount": 285 } }`
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
