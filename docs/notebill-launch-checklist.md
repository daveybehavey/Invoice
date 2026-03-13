# NoteBill Web Launch Checklist

This is the final web-launch gate for `notebill.app`.

## Required env state

- `APP_BASE_URL=https://app.notebill.app`
- `INVOICE_STORE_BACKEND=auto` or `postgres`
- Postgres configured and migrated
- `INVOICE_SESSION_SECRET` set to a strong non-default value
- Stripe configured:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_PRICE_ID`
  - `STRIPE_WEBHOOK_SECRET`
- Email delivery configured:
  - `INVOICE_EMAIL_PROVIDER=resend`
  - `RESEND_API_KEY`
  - `INVOICE_FROM_EMAIL`
  - `INVOICE_LAUNCH_TEST_EMAIL`

## Launch validation commands

```bash
npm run build
npm run check:persistence
npm run check:launch
npm run send:launch-email-test
npm run check:public-domain
```

## What `check:launch` now verifies

- persistence readiness
- auth/session-secret readiness
- Stripe billing readiness
- live/test Stripe key mode awareness
- email delivery readiness
- public base URL readiness

## What still requires manual confirmation

1. Complete one real upgrade flow in Stripe against the live price.
2. Confirm Stripe webhook receipt updates entitlements.
3. Confirm the launch test email lands in the real inbox.
4. Confirm invoice send from library uses provider mode, not tracking-only.
5. Confirm `https://app.notebill.app` loads the latest build.

## Release rule

Do not call the app launch-ready until:

- `check:launch` passes
- `send:launch-email-test` succeeds
- `check:public-domain` passes
- one manual Stripe + email smoke pass is complete
