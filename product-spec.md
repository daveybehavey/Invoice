# Product Spec: AI Invoice Translator & Generator

## Core Purpose
- This app turns messy, unstructured job notes or an uploaded invoice into a clean, professional, itemized invoice that a small service business owner is comfortable sending to a client.
- This app is not accounting software.
- This app is not a template editor.
- Product definition: "Paste messy job notes or upload an invoice and get a professional, itemized invoice you're comfortable sending - with control to tweak wording if needed."

## Non-Negotiable Behavior
- Users provide messy input first (plain text or uploaded invoice). Messy input is expected and normal.
- The AI parses input into:
  - Work sessions (grouped by date if present)
  - Individual tasks (itemized, not overly grouped)
  - Labor (hours x rate, if provided)
  - Materials
- The AI outputs a finished invoice, not suggestions.
- Tone defaults to neutral professional.
- Do not use legal language, threats, pressure, emotional wording, or defensive wording.
- Do not add justification unless explicitly requested.
- Allowed accounting-like capabilities:
  - Calculations (hours x rate, totals)
  - Invoice numbers
  - Dates and service periods
  - Materials line items
  - Balance due (if user specifies)

## Editing Model
- The AI is the primary author.
- The user is the reviewer.
- Every line item must support manual edit.
- Every line item must support "Change wording": regenerate only that line, preserving meaning and price.
- Users may request a full-invoice reword for tone change.
- Users must never start from a blank invoice.

## Progressive Questioning Rule
- The AI should attempt to generate using only the messy input.
- Ask follow-up questions only if essential information is missing.
- Ask one question at a time.
- Do not use large forms or wizards.

## Saving and Memory Rules
- Invoices are saved only when the user explicitly agrees.
- Saved invoices are editable documents, not accounting records.

## Explicitly Out-of-Scope Features
- Accounting or bookkeeping systems
- Expense tracking
- Tax logic or compliance claims
- Client management
- Dashboards or reports
- Template galleries
- Visual invoice designers
- Payment processing
- Any feature that does not directly improve the clarity, professionalism, or sendability of an invoice
