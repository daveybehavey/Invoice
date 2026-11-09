# Core invoice domain (verified against source)

**Verified against:** `main` head `3f42124b7f2bb0151f22df62041030eb2ed0d3b8`  
**Rule:** every behaviour below is traced to the named module at that SHA. Where older docs disagree, **the code wins** (see drift findings at the end of the Phase 4 PR).

Fenced / future (named only — no design invented here): **NB-A-01** tax contract build; **SEC-07** cutover.

---

## 1. Lifecycle & status semantics — `src/services/invoiceDeliveryPolicy.ts`

### Purpose

Pure status-transition policy shared by the file and Postgres saved-invoice stores. It performs **no I/O and no arithmetic** beyond deciding flags; stores call it only after their serialization boundary and a fresh read.

### Status vocabulary

`SavedInvoiceStatus` (`src/models/invoice.ts`): `"draft" | "sent" | "paid" | "deleted"`.

### Public API

| Export | Guarantee |
| --- | --- |
| `decideInvoiceStatusTransition({ currentStatus, requestedStatus, purpose })` | Returns `{ nextStatus, transition, zeroBalanceDue, restoreTotalOnLeavePaid }` |
| `InvoiceStatusTransitionPurpose` | `"delivery" \| "lifecycle"` |

### Invariants & boundaries (as coded)

**`purpose === "delivery"`** (provider-ACCEPTED send completion only — callers must gate other outcomes first):

- Permits **only** `draft → sent` (`transition: true`).
- Any other pair is a no-op: `nextStatus = currentStatus`, `transition: false`.
- Always `zeroBalanceDue: false` and `restoreTotalOnLeavePaid: false` (delivery never rewrites money).

**`purpose === "lifecycle"`** (owner mark-sent / mark-paid / soft-delete and related):

- `nextStatus = requestedStatus` verbatim.
- `transition = requestedStatus !== currentStatus`.
- `zeroBalanceDue = (requestedStatus === "paid")` — stores then set `finishedInvoice.balanceDue = 0`.
- `restoreTotalOnLeavePaid = currentStatus === "paid" && requestedStatus !== "paid" && requestedStatus !== "deleted"` — stores may restore `balanceDue` to `total` when leaving paid for a non-deleted status **and** the stored balance is missing/≤0.
- Entering **`deleted` never** sets `restoreTotalOnLeavePaid` (delete is not a money event).

Odd-but-intended: lifecycle does **not** validate legal status graphs beyond applying the requested status; money side-effects are limited to the two flags above.

### Deliberately does not

- Recompute totals, tax, or payments.
- Own persistence locks (callers do).
- Implement reminder/due-date scheduling.

### Neighbours

- **Called by:** `savedInvoiceStore.ts` / `savedInvoicePostgresStore.ts` (`applyStatusToInvoiceData`, delivery completion).
- **Calls:** nothing (pure).

---

## 2. Money math — `src/lib/invoiceMath.ts` (+ frontend cousin)

### Purpose

Server-side deterministic normalisation of a `FinishedInvoice` after pipeline/schema parse. AI must not own these numbers.

### Public API

| Export | Guarantee |
| --- | --- |
| `normalizeInvoice(invoice)` | Returns a new finished invoice with normalised line amounts, `discountAmount`, `subtotal`, `total`, `balanceDue` |

### Algorithm (exact)

1. Each line: keep `quantity` / `unitPrice`; if `amount` missing, derive `quantity * unitPrice` when both are numbers; else leave amount unset. Assign `id` default `line_${index+1}` when missing. If amount is a number, `roundToCents(amount)` where `roundToCents = Math.round(value * 100) / 100`.
2. `subtotal = roundToCents(sum of (line.amount ?? 0))`.
3. `discountAmount = roundToCents(Math.max(0, invoice.discountAmount ?? 0))` — **not** clamped to subtotal.
4. `total = roundToCents(Math.max(0, subtotal - discountAmount))`.
5. `balanceDue = roundToCents(invoice.balanceDue ?? total)` — preserves an explicit balance when present.

### Deliberately does not

- Apply **tax** (no tax rate/amount in this module).
- Subtract payment records.
- Clamp discount to subtotal (contrast frontend helper below).
- Decide free/zero-line sendability (`invoiceSendGate.ts`).

### Neighbours

- **Called by:** `invoicePipeline.ts` (many emit/normalize paths); characterised in portal reconciliation tests.
- **Frontend cousin:** `public/utils/invoiceMoney.js` → `window.InvoiceMoneyUtils.computeInvoiceTotals` — used by editor/portal surfaces. That helper **does** clamp discount to subtotal, apply `taxRate` after discount, and subtract payment-record amounts for `balanceDue`. It is **not** byte-identical to `normalizeInvoice`; see drift finding.

---

## 3. Due-date & reminder timing — `src/services/invoiceReminderScheduler.ts`

### Purpose

Schedule reminder candidates for **sent** invoices from due dates and send history. Due-date parsing is date-only UTC.

### Public functions (core)

| Export | Guarantee |
| --- | --- |
| `resolveInvoiceReminderSettings(overrides?)` | `{ dueAfterDays, cooldownDays, maxPerRun }` from overrides/env with clamps (defaults **14 / 7 / 25**; env `INVOICE_REMINDER_*`) |
| `resolveInvoiceReminderTiming({ dueDate, lastSentAt, sendCount, settings })` | Next reminder instant + reason, or `null` if `lastSentAt` is not parseable |
| `listDueInvoiceReminderCandidates` / `runDueInvoiceReminders` / `sendInvoiceReminderById` | I/O paths that list/send; send path re-checks status `sent`, send-gate, delivery claims |

### Due-date normalisation (private `normalizeInvoiceDueDate`)

- Trim; take leading `YYYY-MM-DD`; validate; interpret as `T00:00:00.000Z`. Invalid → `undefined`.

### Timing rules (`resolveInvoiceReminderTiming`)

- `sendCount <= 1`: if normalised due date ms **>** `lastSentMs`, next reminder is that due midnight UTC (`reason: "past_due"`); else `lastSentMs + dueAfterDays` (`"follow_up_window"`).
- `sendCount > 1`: `lastSentMs + cooldownDays` (`"cooldown"`).

### Deliberately does not

- Mutate invoice status (reminders require `status === "sent"`).
- Bypass `invoiceSendIsBlocked`.

### Neighbours

- Delivery claim store / email delivery; send gate; saved-invoice repository.

---

## 4. PDF / export shaping — `src/services/invoicePdf.ts`

### Purpose

Render a finished invoice into a PDF buffer for download/print. **Shaping layer:** lays out caller-supplied finished-invoice fields; it is not the system of record for money.

### Public API

| Export | Guarantee |
| --- | --- |
| `createInvoicePdfBuffer(input)` | Returns a `Buffer` of a pdf-lib document (Letter 612×792, Helvetica) |
| `buildPdfFilename(invoiceNumber?, documentType?)` | `Invoice-` or `Estimate-` + sanitised number or `Draft` + `.pdf` |

### Input contract (`InvoicePdfInput`)

- Required: `invoice: FinishedInvoice`.
- Optional presentation: `fromDetails`, `billToDetails`, logo URL/visibility, accent colour, style preset, header layout (`split` \| `centered`), spacing density, registration block, notes visibility.

### Shaping behaviour (verified)

- Document type: `invoice.documentType === "estimate"` → title/filename **ESTIMATE** / `Estimate-…`; else **INVOICE** / `Invoice-…`.
- Header shows issue date (`issueDate` or `"Not set"`) and due date when non-empty.
- Line items section renders descriptions/qty/rate/amount from the finished invoice.
- Totals panel reads stored money fields:
  - `subtotal` (fallback: sum of line amounts),
  - `discountAmount`,
  - `total` (fallback: `subtotal - discount`),
  - **Tax row** = residual `total - (subtotal - discount)` (not a separate taxRate input),
  - `balanceDue` (fallback: `total`).
- Notes omitted when `notesVisible === false`; logo omitted when `logoVisible === false`.

### Deliberately does not

- Call `normalizeInvoice` or recompute tax from a rate.
- Send email or change status.
- Implement NB-A-01 tax schema fields.

### Neighbours

- Server download/export routes; consumes finished invoice already gated/persisted upstream.

---

## Cross-cutting neighbours

| Concern | Module |
| --- | --- |
| Canonical shapes / Zod | `src/models/invoice.ts` |
| Pipeline emit + wording | `src/services/invoicePipeline.ts` |
| Send / share blocked when $0 non-waived or open billing decision | `src/services/invoiceSendGate.ts` |
| Settlement / payment records (payments-fenced detail) | `src/services/invoicePaymentSettlement.ts` (do not edit under programme fences) |
