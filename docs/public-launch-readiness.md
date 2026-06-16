# NoteBill Public Launch Readiness

## Early-June gate

Do not push hard on paid acquisition until this is true on a real Play-installed Android device:

- Google sign-in works
- sign-out works
- upgrade opens Google Play, not Stripe
- purchase or restore returns to NoteBill cleanly
- NoteBill unlocks Pro
- no `Unable to verify Google Play subscription` error

Organic launch can start once the latest Android build is live and this pass succeeds.

## Real-device proof checklist

Use the Play-installed Android app, not the browser version.

### Install freshness

- Open the app from the Play Store install
- Confirm the UI is the latest build, not the old blue version
- Confirm the app opens cleanly with no white screen or stale shell

### Auth

- Sign in with Google
- Confirm the app returns to NoteBill
- Sign out
- Confirm the sign-out button does not get stuck

### Billing

- Open the upgrade screen
- Confirm plans show correctly
- Confirm Android upgrade uses Google Play, not Stripe
- If the account already has Play history, try `Restore purchases` first

### Purchase / restore

- Complete one Google Play subscription flow when the account is eligible
- Confirm NoteBill becomes Pro
- Confirm a Pro-only action succeeds
- Run `Restore purchases`
- Confirm restore either succeeds or gives a clear sane result

### Deep links

- Open a NoteBill link on Android
- Confirm it opens the installed app, not the browser app

## Public-launch checklist

### Before posting publicly

- Upload the latest versioned AAB
- Confirm `npm run check:production-sanity` passes
- Confirm `npm run check:android-release` passes
- Confirm launch email / support path is working
- Confirm operator dashboard billing recovery watch loads

### Safe launch channels first

- Reddit posts in relevant communities
- Google Business Profile
- organic social posts
- founder/manual outreach

### Hold until billing proof is clean

- meaningful ad spend
- broad paid acquisition
- aggressive public promotion that could flood support

## Operator watch items after launch

- Google Play verification ready
- configured Google Play plan count
- Google Play subscription record count
- active Play entitlement count
- restore-first recovery state appearances
- payment verification failures

## Best-practice launch order

1. Ship latest Android build
2. Pass real-device billing proof
3. Soft public launch
4. Watch support/billing signals
5. Only then test paid growth
