# NoteBill Google Growth Ops

## Current status

- GA4 web tracking is live on:
  - `https://notebill.app`
  - `https://app.notebill.app`
  - `https://www.notebill.app`
- Android Firebase Analytics is wired
- GA4 Data API access is working
- Google Ads API access is working
- Google Play service-account auth is working

## Keep the lanes separate

Treat these as different systems:

1. `Web revenue lane`
   - Goal: real paid unlocks
   - Current truth signal: `pro_unlock_verified`
   - Current live lane: `NB | Mobile`

2. `Android install lane`
   - Goal: more qualified installs and activation
   - Truth signals should include install quality, not just cost per install

Do not mix these into one optimization loop.

## Commands

### Smoke test the whole Google stack

```bash
npm run check:google-growth-stack
```

Checks:
- GA4 Data API
- Google Ads API
- Google Play auth

### Pull the current 30-day growth snapshot

```bash
npm run report:google-growth-summary
```

Shows:
- GA4 sessions
- GA4 active users
- GA4 pageviews
- GA4 event count
- top web pages
- Google Ads impressions
- clicks
- spend
- conversions
- top campaigns

### Check whether launch conversions are visible in GA4 yet

```bash
npm run report:google-conversion-readiness
```

Shows:
- the exact launch events we care about
- whether GA4 has seen them in the last 7 days
- which ones are still missing from the property

### Align the live search campaign to revenue-first goals

```bash
npm run google-ads:align-conversion-goals
```

This previews the current `NB | Search | High Intent | ...` campaign goal mix and the exact biddable changes needed.

To apply the campaign-specific override:

```bash
npm run google-ads:align-conversion-goals -- --apply
```

Best-practice target for the NoteBill web revenue lane:

- keep `PURCHASE ~ WEBSITE` biddable
- keep `SUBSCRIBE_PAID ~ WEBSITE` biddable
- turn off app-install, app-purchase, signup, add-to-cart, and begin-checkout campaign goals for this search lane

This keeps the search campaign focused on paid-value outcomes instead of mixed engagement goals.

### Force GA4 DebugView for a live browser session

Open:

```text
https://app.notebill.app/?ga_debug=1
```

Then trigger the flow you want to inspect and check GA4 `DebugView`.

This turns on GA4 debug mode for that browser session without permanently changing production behavior for normal visitors.

### Fire the full launch-event bundle manually

In the browser console on `https://app.notebill.app/?ga_debug=1`, run:

```js
await window.InvoiceAnalytics.triggerLaunchDebugBundle("debug_manual");
```

This spaces out the launch events so GA4 DebugView has a cleaner chance to show:

- `billing_plan_viewed`
- `account_signed_in`
- `billing_plan_selected`
- `checkout_started`
- `pro_unlock_verified`
- `login`
- `begin_checkout`
- `select_item`
- `view_item_list`

## Key events to use

### Primary business conversion

- `pro_unlock_verified`

This is the strongest "someone truly became a paying user" signal.

### Secondary funnel events

- `checkout_started`
- `billing_plan_selected`
- `account_signed_in`

Use these to understand friction and funnel drop-off, but do not optimize bidding around them first.

## Android install-quality events

For Android install growth work, these are the events that matter most:

- `first_open`
- `first_draft_started`
- `first_invoice_saved`
- `first_invoice_reopened`
- `first_invoice_sent`
- `first_payment_link_added`
- `pro_unlock_verified`

If installs increase without movement on these later steps, the install campaign is weak even if store traffic looks good.

These milestone signals are now part of the app-side growth instrumentation, so we can start using them in reporting and operator review instead of guessing from installs alone.

## Android review prompt

The Android app now has a native in-app review path wired through the Google Play review flow.

Best-practice rule:

- never trigger it on first open
- never trigger it right after sign-in
- never trigger it right after a failed billing or restore moment

Current gating:

- first invoice sent, or
- first invoice saved plus first payment-link setup, or
- first invoice saved plus first reopen

This keeps the review ask tied to real value instead of hope or annoyance.

## GA4 setup

### Mark as key events

In GA4:

1. `Admin`
2. `Events`
3. Mark these as key events:
   - `pro_unlock_verified`
   - `checkout_started`
   - `billing_plan_selected`
   - `account_signed_in`

### Good sign before you do this

Run:

```bash
npm run report:google-conversion-readiness
```

If the event shows as seen, GA4 has already ingested it and the marking/import flow should be much smoother.

## Google Ads setup

### Import from GA4

In Google Ads:

1. `Goals`
2. `Conversions`
3. `+ New conversion action`
4. `Import`
5. `Google Analytics 4 properties`
6. `Web`
7. Select:
   - `pro_unlock_verified`
   - `checkout_started`
   - `billing_plan_selected`
   - `account_signed_in`

### Recommended conversion roles

- `purchase` -> `Primary`
- `pro_unlock_verified` -> internal unlock signal
- `checkout_started` -> `Secondary`
- `billing_plan_selected` -> `Secondary`
- `account_signed_in` -> `Secondary`

### Recommended campaign-goal scope

For the NoteBill web search lane, keep the campaign-level biddable goals narrow:

- `PURCHASE ~ WEBSITE`
- `SUBSCRIBE_PAID ~ WEBSITE`

Do not leave these biddable on the search lane unless you intentionally want broader optimization:

- `PURCHASE ~ APP`
- `DOWNLOAD ~ APP`
- `SIGNUP ~ WEBSITE`
- `ADD_TO_CART ~ WEBSITE`
- `BEGIN_CHECKOUT ~ WEBSITE`

## Best-practice operating rhythm

### Before launch

Run:

```bash
npm run check:google-growth-stack
npm run report:google-growth-summary
npm run report:google-conversion-readiness
```

Confirm:
- APIs still work
- traffic is visible
- key events are visible
- Ads account is reachable

If preparing an Android install lane too, also confirm:
- the current Play listing matches the app
- the public Android build is current
- the custom Play listing message is ready

### After launch

Check every day:

1. Are pageviews increasing?
2. Are `billing_plan_selected` and `checkout_started` happening?
3. Are any `pro_unlock_verified` events coming through?
4. Are top pages matching the pages you are promoting?

### Once ads start

Watch:
- impressions
- clicks
- spend
- conversions
- which landing pages get visits
- whether users reach `checkout_started`

## What to ignore for now

- vanity traffic with no billing or sign-in activity
- trying to optimize multiple primary conversions at once
- overcomplicated attribution work before real user volume exists
- cheap installs with no first-save or first-return behavior

## North-star rule

If a growth change does not improve one of these, it is probably not worth doing yet:

- more qualified visits
- more `billing_plan_selected`
- more `checkout_started`
- more `pro_unlock_verified`
