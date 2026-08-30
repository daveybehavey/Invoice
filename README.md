<div align="center">

# NoteBill

**AI-assisted invoicing software that turns rough notes or uploaded invoice text into structured, editable invoices.**

Full-stack TypeScript · React · Express · PostgreSQL · OpenAI · Automated QA

</div>

---

## Overview

NoteBill is a full-stack application focused on one practical workflow: turning incomplete, messy invoice notes into a professional invoice without hiding important assumptions from the user.

The application structures free-form input, asks focused follow-up questions when pricing is missing, supports wording/tone changes, persists saved invoice documents, and produces a clean print/PDF-ready result.

## Highlights

- AI-assisted parsing of rough notes and uploaded invoice text
- Structured invoice generation with explicit pricing safeguards
- Focused follow-up questions instead of silent labor/price assumptions
- Line-level and full-invoice wording controls
- Saved invoice documents with reopen, edit, duplicate, and status flows
- Verified email-link and Google OAuth authentication paths
- PostgreSQL-backed persistence
- Responsive React interface
- Automated regression, API, and browser-testing tooling
- Capacitor mobile-wrapper readiness and Cloudflare deployment tooling

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, React Router, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Data | PostgreSQL |
| AI | OpenAI API |
| Auth | Email-link sessions, Google OAuth |
| QA | Node test runner, Supertest, Playwright |
| Mobile | Capacitor |
| Infrastructure | Cloudflare / Wrangler |

## Engineering & QA

Automated regression coverage protects invoice behavior that is easy to get subtly wrong:

- no silent `$0` labor finalization
- no hidden labor-hour assumptions
- explicit pricing produces expected line amounts
- invoice numbers are generated when missing
- discount handling follows explicit user intent
- numeric values are preserved during wording changes
- saved documents are created only through explicit user action

Related exploratory and user-testing documentation is maintained under `docs/`.

## Core Flow

1. Enter rough invoice notes or upload invoice text.
2. NoteBill converts the input into a structured invoice model.
3. Missing information is resolved through targeted follow-up questions.
4. Review, edit, and reword the invoice.
5. Save, reopen, duplicate, update status, print, or export through the browser PDF flow.

## API Surface

Key endpoints include invoice creation, labor-pricing follow-up, discounts, line/full rewording, persistence, duplication, reopening, and manual status changes.

```text
POST /api/invoices/from-input
POST /api/invoices/from-input/labor-pricing
POST /api/invoices/from-input/discount
POST /api/invoices/reword-line
POST /api/invoices/reword-full
POST /api/invoices/save
GET  /api/invoices
GET  /api/invoices/:id
POST /api/invoices/:id/duplicate
POST /api/invoices/:id/status
```

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

### Validation

```bash
npm run build
npm test
```

Additional launch, persistence, Cloudflare, browser, and mobile-readiness checks are available through `package.json`.

---

<div align="center">

**Active development** · Full-stack application engineering, AI integration, data persistence, authentication, and automated QA.

</div>
