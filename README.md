# NoteBill

**AI-assisted invoicing software that turns rough notes or uploaded invoice text into structured, editable invoices.**

NoteBill is a full-stack TypeScript application focused on making invoice creation faster without turning into a full accounting suite. It accepts messy input, extracts structured invoice data, handles missing pricing through targeted follow-up questions, supports wording/tone changes, and produces a clean invoice preview that can be printed or saved as PDF.

## Highlights

- AI-assisted parsing of free-form notes and uploaded invoice text
- Structured invoice generation with explicit labor-pricing safeguards
- Line-level and full-invoice wording/tone controls
- Saved invoice documents with reopen, duplicate, status, and edit flows
- Verified email-link and Google OAuth sign-in paths
- PostgreSQL-backed persistence
- Responsive React interface and mobile-wrapper tooling with Capacitor
- Automated regression, API, and browser-testing tooling
- Cloudflare deployment/readiness tooling

## Tech Stack

- **Frontend:** React 18, React Router, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Data:** PostgreSQL
- **AI:** OpenAI API
- **Testing:** Node test runner, Supertest, Playwright
- **Mobile:** Capacitor for Android/iOS wrappers
- **Infrastructure:** Cloudflare Wrangler
- **Other:** PDF parsing/generation, Google OAuth, Stripe launch tooling

## Engineering & QA

The project includes automated regression coverage for business-critical invoice behavior, including:

- preventing silent $0 labor finalization
- requiring explicit labor pricing when needed
- preserving numeric values during wording changes
- automatic invoice-number generation
- discount handling
- explicit-only save behavior

Related testing documentation is maintained in `docs/`, including exploratory-testing and user-testing plans.

## Core Flow

1. User enters rough invoice notes or uploads invoice text.
2. NoteBill converts the input into a structured invoice model.
3. Missing information is handled through focused follow-up questions rather than hidden assumptions.
4. The user reviews, edits, rewords, and finalizes the invoice.
5. The invoice can be saved, reopened, duplicated, assigned a manual status, printed, or exported through the browser PDF flow.

## API Surface

Key endpoints include:

- `POST /api/invoices/from-input`
- `POST /api/invoices/from-input/labor-pricing`
- `POST /api/invoices/from-input/discount`
- `POST /api/invoices/reword-line`
- `POST /api/invoices/reword-full`
- `POST /api/invoices/save`
- `GET /api/invoices`
- `GET /api/invoices/:id`
- `POST /api/invoices/:id/duplicate`
- `POST /api/invoices/:id/status`

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Set the required environment variables described in `.env.example`, including `OPENAI_API_KEY` for AI-assisted invoice processing.

### Validation

```bash
npm run build
npm test
```

Additional launch, persistence, Cloudflare, and mobile-wrapper checks are available through the scripts in `package.json`.

## Project Status

Active development. This repository demonstrates full-stack application development, API design, AI integration, persistence, authentication, automated testing, and deployment-readiness work.
