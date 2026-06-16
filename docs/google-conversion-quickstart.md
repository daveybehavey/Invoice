# NoteBill Conversion Quickstart

Use this after the app is uploaded and the GA4 events have shown up in DebugView or Events.

## Key events to mark in GA4

Start with these:

- `pro_unlock_verified` as the main value event
- `checkout_started`
- `billing_plan_selected`
- `account_signed_in`

Optional later:

- `billing_plan_viewed`
- `billing_manage_opened`

## GA4 steps

1. Open **Google Analytics** for the `notebill-tracking` property.
2. Go to **Admin**.
3. Under **Data display**, open **Events**.
4. Find the events above.
5. Mark them as **key events**.

## Google Ads steps

1. Open **Google Ads**.
2. Go to **Goals**.
3. Open **Conversions**.
4. Click **+ New conversion action**.
5. Choose **Import**.
6. Choose **Google Analytics 4 properties**.
7. Select the relevant web events.
8. Import them.

## Recommended optimization setup

- `purchase` = **Primary**
- `pro_unlock_verified` = internal unlock signal
- `checkout_started` = **Secondary**
- `billing_plan_selected` = **Secondary**
- `account_signed_in` = **Secondary**

## Campaign-goal cleanup

For the main NoteBill search campaign, keep the biddable campaign goals narrow:

- `PURCHASE ~ WEBSITE`
- `SUBSCRIBE_PAID ~ WEBSITE`

Preview the current goal mix:

```bash
npm run google-ads:align-conversion-goals
```

Apply the campaign-specific cleanup:

```bash
npm run google-ads:align-conversion-goals -- --apply
```

This prevents the search lane from inheriting broader account goals like app download, website signup, add to cart, or begin checkout.

## Current live implementation

- The web app emits `pro_unlock_verified` when Pro unlocks.
- The same unlock path also emits a standard GA4/Ads `purchase` event so Google Ads can optimize on the clearest revenue signal already present in the account.
- `session_start` should stay out of the primary conversion set because it is too noisy for ad optimization.

## Why this order

- `purchase` is the clearest current Ads conversion signal.
- `pro_unlock_verified` remains the product truth signal in the app and operator dashboard.
- The others are useful for funnel visibility.
- This keeps bidding and reporting focused on actual value instead of noisy engagement.

## What to do after import

1. Verify the conversions appear in Ads.
2. Keep an eye on `report:google-growth-summary`.
3. Use the launch packet and Play listing as the traffic-facing layer.
