# Discount V1 Spec (Draft)

## Goal
Support simple, trustworthy discounts in the invoice flow without expanding into accounting features.

## In Scope
- One discount per invoice.
- Invoice-level fixed amount discount only.
- Optional short reason label (for display only).
- Displayed clearly in totals as a negative amount.

## Out of Scope
- Percentage discounts.
- Multiple stacked discounts.
- Coupons, promo systems, or codes.
- Tax logic changes.
- Discount analytics or reporting.

## User Experience
- If notes include a discount intent but no amount, ask one follow-up:
  - "I see you want to offer a discount. What discount amount should I apply?"
- If discount amount is provided in notes, apply directly.
- In workspace:
  - `Add discount` (amount + optional reason)
  - `Edit discount`
  - `Remove discount`

## Data Contract (V1)
- Extend finished invoice model with:
  - `discountAmount?: number`
  - `discountReason?: string`
- Calculation rules:
  - `subtotal = sum(lineItem.amount)`
  - `discount = max(0, discountAmount || 0)`
  - `total = max(0, subtotal - discount)`
  - `balanceDue = total` (unless user later specifies otherwise)

## Guardrails
- Never hide discount inside a line item.
- Never let total go below `0.00`.
- Keep discount reversible and explicit.
- Keep wording neutral/professional.

## Acceptance Criteria
- User can apply, edit, and remove one fixed discount.
- Summary shows discount line clearly.
- Exported/printed invoice includes discount line.
- Save/reopen preserves discount fields.
