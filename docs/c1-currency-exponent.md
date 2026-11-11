# DRAFT — C1 currency exponent fix

Base: origin/main 5cd4d7f3e0a8e64b1f93efffe8c459a14f6211b1. Branch: fix/currency-exponent.
Worktree: C:\Users\ReuseTechBC\projects\nb-q4.

Jack's 2026-11-11 PROCEED answer explicitly resolves the known overlap with PR #136 (removal of the unused toAmountMinor export). The preceding run had no source changes. Its inventory was reviewed and implementation completed here. No deployment, configuration, tax, or unrelated audit changes. This remains a draft for the full payments gate.

## Behavior and source

src/lib/currencyUnits.ts owns exact forward and reverse ISO conversions. Currency is required at every call; unknown/missing codes and N.A. exponents fail closed. Fractional minor units and unsafe integers are refused. All numeric exponent entries (0, 2, 3, 4) were transcribed from SIX ISO 4217 List One, published 2026-09-17 and fetched 2026-11-11:
https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml

Stripe's documented ISK/UGX API compatibility units differ from ISO. ISO arithmetic remains correct for these currencies, but Stripe link creation/reuse and settlement refuse them rather than send or interpret incorrect units. Unknown currencies likewise cannot reach the Stripe creator. Reference: https://docs.stripe.com/currencies#special-cases

The Stripe adapter also validates that the supplied minor amount equals the shared conversion of the invoice balance. The payment-link flow is the sole invoice Stripe charge creator. Checkout uses configured subscription price IDs; payment intents originate from invoice payment links. Webhook amount_received is already in minor units and is consumed unchanged. The settlement record and derived balances use the shared reverse helper, with no two-decimal rounding.

## Conversion inventory (final line numbers)

The removed unused rounded converter was invoicePaymentSettlement.ts:160 on the base. Its exact counterpart at base line 171 now lives in src/lib/currencyUnits.ts. Every forward/reverse conversion and supporting balance call follows:

### src/services/invoicePaymentSettlement.ts

- src/services/invoicePaymentSettlement.ts:187 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:206 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:210 — sumPaymentRecordsMinor
- src/services/invoicePaymentSettlement.ts:405 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:411 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:428 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:466 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:542 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:548 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:615 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:616 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:714 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:727 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:745 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:755 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:823 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:826 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:943 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:949 — sumPaymentRecordsMinor
- src/services/invoicePaymentSettlement.ts:960 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:970 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:1012 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:1018 — calculateInvoiceBalanceMinor
- src/services/invoicePaymentSettlement.ts:1035 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:1046 — getExactCollectibleBalanceMinor
- src/services/invoicePaymentSettlement.ts:1098 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:1217 — toAmountMinorExact
- src/services/invoicePaymentSettlement.ts:1227 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:1229 — sumPaymentRecordsMinor
- src/services/invoicePaymentSettlement.ts:1240 — toAmountMajor
- src/services/invoicePaymentSettlement.ts:1250 — toAmountMajor

### src/server.ts

- src/server.ts:2787 — getExactCollectibleBalanceMinor
- src/server.ts:2864 — getExactCollectibleBalanceMinor
- src/server.ts:2866 — toAmountMinorExact
- src/server.ts:2921 — getExactCollectibleBalanceMinor
- src/server.ts:2990 — toAmountMajor
- src/server.ts:3025 — toAmountMinorExact
- src/server.ts:3044 — calculateInvoiceBalanceMinor
- src/server.ts:3087 — toAmountMajor
- src/server.ts:3139 — calculateInvoiceBalanceMinor
- src/server.ts:3173 — toAmountMajor

### src/services/stripeBilling.ts

- src/services/stripeBilling.ts:347 — toAmountMinorExact

## Other sites inspected

- src/services/stripeBilling.ts:388 creates the payment link; :393 passes unit_amount unchanged; :385 stores the same amount in binding metadata; :963–964 reads PaymentIntent.amount_received unchanged.
- scripts/bootstrap-stripe-launch.mjs:84,94 compares/creates fixed subscription price amounts, not invoice totals; unchanged and not run.
- src/lib/invoiceMath.ts:46, src/services/invoicePdf.ts:1088, src/services/invoicePipeline.ts:1661,1665,1669 and public invoiceMoney/formatting helpers perform invoice calculation/allocation/formatting in major units, not Stripe conversions; unchanged. Percentage and time conversions were excluded.

## Local verification

All test commands stripped proxy environment variables in the child PowerShell process. No environment files or persistent configuration were changed.

- Baseline measured before source edits, on the fetched origin/main commit above.
- Repository npm test, using Git Bash as the per-command npm script shell to reproduce the shell glob expansion documented in AGENTS.md: baseline 224 tests / 219 pass / 0 fail / 5 skipped; final 244 tests / 239 pass / 0 fail / 5 skipped. The five Postgres integration tests require INVOICE_TEST_POSTGRES_URL, which is not configured.
- Explicit API suite: baseline 263 / 263 pass / 0 fail; final 274 / 274 pass / 0 fail.
- npm run build: baseline and final pass (frontend build plus tsc --noEmit).
- git diff --check: pass.
- Zero new failures in both completed comparable suites; 31 added passing tests.
- Initial Windows-default npm test was stopped without a final count: its unexpanded glob causes Node to include root-level tests, unlike the documented shell expansion. The known slow legacy UI suite was not completed and is not claimed green; see docs/ui-test-timeout-diagnosis.md. API coverage was run explicitly in full.

Exact commands (after removing proxy variables):

~~~powershell
npm --script-shell='C:/Program Files/Git/bin/bash.exe' test
npx tsx --test --test-concurrency=1 src/api.test.ts
npm run build
git diff --check
~~~

Evidence: src/api.test.ts contains HTTP save -> payment-link creator -> signed Stripe webhook -> stored paid record tests for JPY/KRW 100 -> 100, USD/CAD/EUR 100 -> 10000, BHD/KWD 100 -> 100000, and BHD 100.123 -> 100123 -> 100.123. ZZZ, ISK and UGX refuse before calling the provider. src/lib/currencyUnits.test.ts additionally covers fractional minor-unit refusal, round trips, manual-record balance and total-less reconstruction/duplication for exponents 0/2/3, exponent 4, invalid inputs, and an old JPY 10000 payment against JPY 100 remaining unmatched and unpaid.

## Delivery and limits

Local commit and q4.bundle are the review artifacts. No live Stripe charges or production data mutations were made. Existing incorrect charges/records are not migrated or refunded by this code change. GitHub CLI has no authenticated session here; no PR or CI execution is claimed. Push/bundle outcome is reported in the handoff.
