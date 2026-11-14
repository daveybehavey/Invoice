# NS-7: invoice chase scoping

Source baseline: `5cd4d7f3e0a8e64b1f93efffe8c459a14f6211b1`. Source audit only; proposals below are not implemented. Citations are repository-relative file:line references at this SHA. Production configuration and runtime behavior are UNVERIFIED.

## 1. Status and observation

There are four persisted invoice status literals: `draft`, `sent`, `paid`, `deleted` (`src/models/invoice.ts:352`). Creation starts from draft with payment reconciliation; subsequent saves reconcile payment-derived state (`src/services/savedInvoiceStore.ts:110`, `:138`). Explicit status actions enter through `src/server.ts:2275`; store mutations include deletion metadata and restoration (`src/services/savedInvoiceStore.ts:365`, `:386`, `:495`). Verified delivery can transition to sent (`src/services/savedInvoiceStore.ts:407`, `:441`); user payment recording/removal has separate routes (`src/server.ts:2302`, `:2314`). Settlement sets paid when the remaining minor-unit balance reaches zero (`src/services/invoicePaymentSettlement.ts:1249`, `:1279`).

Overdue and viewed are not additional lifecycle literals (`src/models/invoice.ts:352`). Due dates drive reminder timing, rather than a time-driven persisted status transition (`src/services/invoiceReminderScheduler.ts:233`). Open tracking DOES exist: pixel GET and opened POST endpoints (`src/server.ts:2073`, `:2253`), with `openedAt`, `openedByEmail`, and `openCount` delivery evidence (`src/services/invoiceDeliveryStore.ts:264`, `:267`, `:292`). Treat this as recorded open evidence, not proof that a human read the invoice; human-read reliability is UNVERIFIED.

## 2. Existing follow-up machinery

Five functional surfaces are present (counting related controls together):

1. Server reminder candidate selection and dispatch. Defaults are 14 days, 7-day cooldown, maximum 25 per run (`src/services/invoiceReminderScheduler.ts:74`). First timing uses a due date when applicable, otherwise last send plus follow-up days; subsequent timing uses cooldown (`:233-271`). The runner calls the actual reminder sender, not a draft generator (`:275-295`); individual sends require sent status, suppress unresolved delivery, reserve a claim, and dispatch email (`:317-434`).
2. Library reminder controls call individual and batch endpoints (`public/features/library/invoiceLibrary.jsx:1576`, `:1633`; `src/server.ts:2089`, `:2125`). Preview versus dispatch must remain distinct: these are capable of sending provider email, not merely producing drafts (`src/services/invoiceReminderScheduler.ts:280`, `:291`).
3. Launcher follow-up prioritization offers delivery review or reminder and invokes the reminder endpoint (`public/launcher.jsx:636`, `:659`, `:1719`).
4. Library suggested-note copying, snooze and dismissal already provide part of the desired manual workflow (`public/features/library/invoiceLibrary.jsx:2744-2761`, `:3517`). Browser notifications target the operator's browser, using permission and local Notification construction, not client push (`:623-648`).
5. Recurring controls include an armed-state check and a run action that calls invoice send with a remembered recipient (`public/features/library/invoiceLibrary.jsx:747-787`). The label “auto-send” must not be mistaken for evidence of a background scheduler.

Reminder restart confirmation is also an existing server policy surface, not new chase scope (`src/services/invoiceReminderScheduler.ts:105-119`; `src/server.ts:2172`, `:2199`). Email templates and transport are centralized in `src/services/invoiceEmailDelivery.ts:228-255`, `:683`, `:734`; providers include Resend and SMTP2GO (`:3`, `:299`, `:391`). Record-only outcomes are explicitly distinct from provider sends (`src/services/invoiceReminderScheduler.ts:285-295`).

No independent cron/queue/background reminder entry was found. Worker entry delegates HTTP to the server (`src/worker.ts:1-4`). Negative-search scope: all tracked source, public UI/service worker, scripts, native wrappers, package/config and deployment files; terms `reminder`, `overdue`, `dunning`, `follow.up`, `notification`, `scheduled`, `cron`, `setInterval`, `queue`, `worker`, `push`, `send`, `share`, `mailto`, `sms`. Search absence is bounded to this checkout; externally scheduled endpoint calls and deployed settings are UNVERIFIED. Existing endpoint runners can send without per-message composition/review once invoked; they are not suitable draft-generation dependencies (`src/services/invoiceReminderScheduler.ts:275-295`).

## 3. Send fence inventory

Six invoice-facing entry paths, grouped by initiating action (shared transports are not counted twice):

| Path | Trigger and fence |
| --- | --- |
| Initial send / explicit resend | Library user action posts `/api/invoices/:id/send`; server dispatches email (`public/features/library/invoiceLibrary.jsx:1419-1473`; `src/server.ts:1628`, `:1944`). |
| Individual reminder | Library user action calls send-reminder (`public/features/library/invoiceLibrary.jsx:1576`; `src/server.ts:2089`). |
| Launcher reminder | Launcher action calls the same endpoint (`public/launcher.jsx:1719`). |
| Batch reminder run | Library run action posts reminders/run; server runner dispatches candidates (`public/features/library/invoiceLibrary.jsx:1633`; `src/server.ts:2156`; `src/services/invoiceReminderScheduler.ts:280`). |
| Recurring run | Armed recurring action calls the existing invoice sender (`public/features/library/invoiceLibrary.jsx:758-767`). |
| Manual copy handoff | Reminder note and library/manual share packs copy text; user must paste and send externally (`public/features/library/invoiceLibrary.jsx:2761`, `:2903`; `public/features/manual/manualInvoiceCanvas.jsx:1230-1253`). |

Adjacent outbound fences: requested sign-in email (`src/server.ts:526`; `src/services/invoiceEmailDelivery.ts:244`), contract-copy delivery (`src/server.ts:390`; `src/services/contractCopyDelivery.ts:341`), operator launch test (`src/server.ts:854`, `:942`) and explicit CLI launch test (`scripts/send-launch-test-email.ts:18`). These are four additional outbound entry families, not invoice-chase paths. Support/feedback mailto opens a user email client, directed to support (`public/launcher.jsx:2213`, `:2574`). Browser reminders notify the operator (`public/features/library/invoiceLibrary.jsx:648`). No client SMS, native share-intent, or remote client-push implementation was found in the bounded searches above; deployment-only integrations are UNVERIFIED.

## 4. Data available

| Existing field/evidence | Source and limitation |
| --- | --- |
| customerName, invoiceNumber, issueDate, dueDate, currency | Finished invoice schema (`src/models/invoice.ts:194-202`); optional fields can be missing. |
| total, balanceDue, paymentRecords | `src/models/invoice.ts:210-213`; use canonical money rather than generated arithmetic. |
| recipientEmail | Delivery summary (`src/services/invoiceDeliveryStore.ts:233`), not a guaranteed contact field on every invoice. |
| sentAt, sentToEmail, sendCount | Verified send evidence and attribution (`src/services/invoiceDeliveryStore.ts:236-252`, `:290`). Latest recipient must not be substituted for the recipient of historical acceptance. |
| openedAt, openedByEmail, openCount | `src/services/invoiceDeliveryStore.ts:264-292`; evidence is separate from status. |
| dueDate, nextReminderAt, lastSentAt, reason | Candidate shape (`src/services/invoiceReminderScheduler.ts:24-32`); derived scheduling data, not new invoice fields. |

Days overdue is a proposed derivation from dueDate and an explicit clock/timezone, not a persisted field in the finished invoice schema (`src/models/invoice.ts:194-220`). No new contact, consent or chase-draft field should be assumed from that schema. Cross-device editable chase-draft persistence is UNVERIFIED; the existing copy note alone does not establish it (`public/features/library/invoiceLibrary.jsx:2754-2761`).

## 5. Proposed smallest fixture-first shape (not current capability)

Start by assessing whether the existing copy-note surface already satisfies the practical need. If editable retained drafts are required, extend that surface rather than build another reminder engine. Proposed initial threshold: one draft at 1 calendar day overdue, only for sent invoices with positive canonical balance and a valid due date; no repeated escalation in v1. Do not use last-send age as a substitute for overdue. Evaluate on library load/refresh; background monitoring is out of this smallest proposal.

Proposed touches: `public/features/library/invoiceLibrary.jsx` for review/edit/copy UI; new pure `public/utils/chaseDraft.js` for eligibility and deterministic wording; new `public/utils/chaseDraftStorage.js` only if owner-scoped local persistence is approved; new `src/chaseDraft.test.ts` plus focused additions to `src/ui.test.ts`. Draft identity should include owner, invoice, due-date revision and threshold; suppress duplicates, invalidate on paid/deleted or changed money, preserve user edits, and avoid silently regenerating dismissed drafts. These are design requirements, not existing schema claims.

User reviews editable text inside the library, copies it, then personally sends in their chosen mail/message application. No send button or send endpoint in this feature. Existing copy behavior is the reuse point (`public/features/library/invoiceLibrary.jsx:2761`).

Fixture-first proof proposed for the later gate: synthetic missing-date, boundary/timezone, partial-payment, zero-balance, paid/deleted, recipient-mismatch, duplicate-refresh and edited-draft fixtures. Exercise threshold crossing, refresh, edit, dismiss and copy with a network interceptor that fails on any mutation/send request and a transport spy that must remain at zero. Add a dependency check preventing draft modules from importing send/dispatch modules. Assert unchanged invoice/delivery state. This proves the new flow has no send capability; it cannot prove all existing product sends have disappeared.

Must never touch in this scoped build: `src/server.ts`, `src/worker.ts`, `src/services/invoiceReminderScheduler.ts`, `invoiceEmailDelivery.ts`, `invoiceDeliveryStore.ts`, `invoicePaymentSettlement.ts`, `stripeBilling.ts`, authentication, saved-invoice repositories, money models/calculations, payment links, production flags/config, native wrappers or packages. Existing send-capable handlers in the shared library module must remain outside the new flow; if that cannot be isolated, stop and re-scope.

Jack/David decisions before any build brief: Is existing copy-note enough? Does NEVER send mean this feature or the whole product (the latter requires a separate send-policy change)? Is foreground evaluation acceptable? Approve threshold, timezone and no-date behavior; persisted versus ephemeral drafts and cross-device expectations; consent/retention/owner-switch behavior; treatment of unopened or ambiguous delivery and unresolved claims; interaction with existing reminder/recurring controls; dismissal/reset rules; wording and payment-link inclusion; and whether external copy/paste meets review-and-send acceptance. Any backend persistence or background job expands the gate. No build authorization is implied by this memo.

## 6. Verdict

**Viable-with-changes.** The status, due-date, payment and delivery evidence already exist (`src/models/invoice.ts:194-220`, `:352`; `src/services/invoiceDeliveryStore.ts:233-292`), and a copyable follow-up note already covers much of the manual handoff (`public/features/library/invoiceLibrary.jsx:2754-2761`). A narrowly isolated editable draft could be viable, but existing reminder runners actually dispatch email (`src/services/invoiceReminderScheduler.ts:275-295`). The next decision is whether any build is needed and what draft persistence/monitoring means; reusing the sender as a draft generator would violate the requested fence.
