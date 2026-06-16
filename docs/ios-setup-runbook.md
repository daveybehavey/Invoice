# iOS Setup Runbook

This is the shortest practical path to ship a NoteBill iOS build from Windows without buying a Mac.

## What we are using

- Existing Capacitor iOS shell in `ios/`
- GitHub Actions for macOS builds
- Apple Developer Program for signing and distribution

This repo already has the iOS workflow at [`.github/workflows/ios-testflight.yml`](../.github/workflows/ios-testflight.yml).

## What you should do first

1. Enroll in the Apple Developer Program.
2. Open App Store Connect and create or confirm the `NoteBill` app record.
3. Run `npm run check:ios-launch` in this repo.
4. Add the required GitHub Actions secrets.
5. Run the iOS workflow with `upload_testflight=false` first.
6. When the build is clean, rerun it with `upload_testflight=true`.

`npx cap sync ios` will generate the Xcode workspace on the build machine, so you do not need to commit a separate `.xcworkspace` file into the repo for this setup.

## GitHub secrets you will need

Add these in GitHub repo settings under Actions secrets:

- `APPLE_TEAM_ID`
- `IOS_DISTRIBUTION_CERT_BASE64`
- `IOS_DISTRIBUTION_CERT_PASSWORD`
- `IOS_PROVISION_PROFILE_BASE64`
- `IOS_PROVISION_PROFILE_NAME`
- `KEYCHAIN_PASSWORD`
- `APPSTORE_API_KEY_ID`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_API_PRIVATE_KEY`

## What each secret is for

- `APPLE_TEAM_ID`: your Apple Developer team id
- `IOS_DISTRIBUTION_CERT_BASE64`: base64-encoded `.p12` distribution cert
- `IOS_DISTRIBUTION_CERT_PASSWORD`: password for that cert
- `IOS_PROVISION_PROFILE_BASE64`: base64-encoded App Store provisioning profile
- `IOS_PROVISION_PROFILE_NAME`: exact provisioning profile name
- `KEYCHAIN_PASSWORD`: temporary macOS CI keychain password
- `APPSTORE_API_KEY_ID`: App Store Connect API key id
- `APPSTORE_ISSUER_ID`: App Store Connect issuer id
- `APPSTORE_API_PRIVATE_KEY`: App Store Connect private key contents

## Cheapest build path

Use GitHub Actions first.

Why:

- The iOS shell already exists, so this is build automation, not a rewrite.
- GitHub hosts the macOS runner.
- You can keep coding on Windows.

Only use a rented cloud Mac if you hit a native Xcode problem that is easier to debug interactively.

## Important note about Expo

Expo is not the best fit for this repo because NoteBill already has a Capacitor iOS shell and native plugins wired in. Expo would be a bigger rewrite.

## First build checklist

Before the first signed build:

- Confirm the bundle id is still `com.notebill.app`
- Confirm the app name is still `NoteBill`
- Confirm the web build passes
- Confirm `npm run check:mobile-wrapper` passes
- Confirm `npm run check:ios-launch` passes
- If you want the internal billing debug panel, set `INVOICE_INTERNAL_BILLING_DEBUG=1` only for that internal build environment.

## First workflow run

1. Open GitHub Actions.
2. Run `iOS TestFlight`.
3. Leave `upload_testflight` set to `false`.
4. Confirm the archive is produced and attached as an artifact.
5. Inspect the build logs if anything fails.

## Second workflow run

Once the archive build succeeds:

1. Keep the same secrets in place.
2. Set `upload_testflight` to `true`.
3. Run the workflow again.
4. Install the build from TestFlight on a real iPhone.

## After the first build

Fix only the issues the first device test exposes:

- layout overflow
- permissions
- share sheet behavior
- login flow
- any sign-in or billing edge cases

## The current recommendation

Do not buy a Mac yet unless you specifically want interactive native debugging.
Start with GitHub Actions, because it is the cheapest and most direct path for this repo.
