# NoteBill Android Install Growth Plan

Last updated: 2026-06-07

## Goal

Grow Android installs without muddying the current web revenue test.

This plan exists so we do not accidentally optimize for cheap installs that never become useful users.

## Core rule

Treat these as two separate lanes:

1. `Web revenue lane`
   - Current job: prove paid search traffic can turn into real `pro_unlock_verified` events.
   - Current live lane: `NB | Mobile`

2. `Android install lane`
   - Future job: increase qualified Android installs and first-use activation.
   - This should not reuse the same success criteria as the web revenue lane.

## What success actually means

For Android install growth, installs alone are not enough.

The real chain is:

1. Install
2. First open
3. First draft started
4. First save
5. First return
6. First send or first payment-link setup
7. `pro_unlock_verified`

If installs go up but steps 3 through 7 stay weak, the campaign is not healthy.

## Current status

Already in place:

- Public Play listing copy is stronger
- Public screenshots are improved
- Public Android billing is fixed
- Current public Android build has first-session and trust-flow polish
- GA4 + Ads + Play auth are working
- Revenue lane tracking is measurable

Still needed before we spend on Android installs:

- a clean install-specific message
- a custom Play listing that matches that message
- a simple install-quality dashboard habit

Already wired now:

- install-quality milestone tracking:
  - `first_draft_started`
  - `first_invoice_saved`
  - `first_invoice_reopened`
  - `first_invoice_sent`
  - `first_payment_link_added`
- Android in-app review gating tied to real value moments

## Best-practice launch order

### Phase 0 - Prep only

Do this before any install spend:

1. Keep the current Play listing healthy and current
2. Prepare one custom Play listing for install traffic
3. Keep the Android app visually in sync with the web product
4. Decide what install-quality events we trust
5. Decide where the in-app review prompt should fire

### Phase 1 - Small install test

When ready:

1. Launch one small Android install campaign
2. Use one custom Play listing only
3. Keep budget small
4. Let it run long enough to see install quality, not just top-of-funnel clicks

### Phase 2 - Expansion only after proof

Only expand if we see:

- healthy installs
- real first-save and first-return behavior
- some path toward `pro_unlock_verified`

If install quality is weak, fix listing/product activation before adding more spend.

## Recommended first install angle

Start with one angle only:

### Mobile-first invoicing

Primary promise:

`Turn rough notes into a client-ready invoice from your phone.`

Why this angle first:

- matches the current strongest paid-search lane
- matches the best-performing landing-page direction so far
- fits the actual product
- is easy to understand in a Play listing in a few seconds

Do not start with:

- generic "AI invoicing"
- broad bookkeeping language
- contractor-only positioning
- feature-stuffed screenshots

## Custom Play listing strategy

Start with one custom listing for Android-install traffic.

### Listing theme

- phone-first
- rough notes to clean invoice
- repeat work and follow-up as support value
- practical, calm, non-enterprise tone

### First three screenshots should prove

1. this is easy on a phone
2. it starts from messy real-world notes
3. it becomes a clean invoice without blank-template busywork

### Recommended custom-listing message stack

Short description direction:

`Turn rough notes into clean invoices and follow-up from your phone.`

Screenshot story:

1. Start with rough notes
2. Billie builds the invoice draft
3. Save, send, and get paid with a cleaner handoff
4. Reopen and follow up without losing your place

## Review-prompt strategy

Use the Google Play in-app review flow only after real value moments.

Good candidate moments:

1. first successful save
2. first successful send
3. first successful reopen after a save
4. first real Pro unlock followed by a successful use moment

Avoid:

- prompting on first open
- prompting before the user has saved anything
- prompting right after sign-in only
- prompting when billing or restore just failed

Recommended first implementation:

- ask after first successful save plus one additional meaningful action
- for example: first save, then later first reopen or first send

Current implementation:

- the Android prompt only becomes eligible after one of these:
  - first send
  - first save plus first payment-link setup
  - first save plus first reopen
- the prompt is Android-native only
- it uses a device cooldown so we do not keep asking

This keeps the prompt tied to actual trust, not hope.

## Measurement plan

### What we already trust

- `first_open` from Android/Firebase
- `account_signed_in`
- `billing_plan_selected`
- `checkout_started`
- `pro_unlock_verified`

### What we should add next if missing

These are high-value install-quality events:

- `first_draft_started`
- `first_invoice_saved`
- `first_invoice_reopened`
- `first_invoice_sent`
- `first_payment_link_added`

These are better activation signals than pageviews or generic sessions.

Status note:

- these milestone events are now live and should be treated as the default install-quality language going forward

### What to optimize for first

For install campaigns, watch:

1. installs
2. first opens
3. first saves
4. first returns

For revenue campaigns, keep watching:

1. `billing_plan_selected`
2. `checkout_started`
3. `pro_unlock_verified`

Do not collapse these into one fuzzy "success" number.

## Campaign structure recommendation

When we are ready to test installs:

- Campaign type: Android app installs
- Start with one campaign only
- One message angle only
- One custom Play listing only
- Small budget only

Do not run:

- multiple install themes at once
- multiple custom listings at once
- install and revenue goals mixed in the same campaign decision process

## Product prep that helps installs without spending money

These are worth doing even before an install campaign:

1. keep first-session clarity strong
2. keep save/reopen trust high
3. keep send/payment handoff credible
4. add review prompts only after value moments
5. keep Play screenshots and listing in sync with the live app

## What not to do

Do not:

- optimize install spend around pageviews
- broaden Android acquisition before one message proves itself
- create multiple store-listing variants before the first one teaches us anything
- prompt for reviews too early
- let public Android lag behind the web product again

## Immediate next actions

1. Keep the current `NB | Mobile` revenue lane running separately
2. Keep the public Android build synced to the live web trust/conversion improvements
3. Prepare one custom Play listing around the mobile-first invoice angle
4. Watch the install-quality events in operator review and GA4
5. Keep the in-app review trigger tied to real value moments only

## Decision gate before spending on installs

We should only turn on the Android install lane when we can say yes to these:

- Is the public Android build current?
- Is the Play listing current?
- Do we have one clear install message?
- Do we know what activation events we will watch?
- Do we know what failure looks like?

If the answer is no to any of those, prep is still the right move.
