# iOS GitHub Actions Cheap Path

NoteBill is already a Capacitor app, so the cheapest no-Mac path is to use GitHub Actions on a macOS runner for the iOS build step.

Start with the step-by-step runbook in [iOS Setup Runbook](./ios-setup-runbook.md) if you want the shortest path from Windows to a signed TestFlight build.

## Why this is the cheapest sane option

- No Mac purchase.
- No cloud Mac subscription.
- The native iOS shell is already committed in `ios/`.
- You can keep coding on Windows and let GitHub do the Apple-specific work.

## Cost reality

- Apple Developer Program is still required for App Store / TestFlight distribution.
- GitHub Actions is free on standard runners for public repositories.
- For private repositories, GitHub includes minutes depending on your plan, but macOS runners consume minutes at the higher macOS rate.
- That makes GitHub Actions the cheapest path in cash terms, but not literally free for every private-repo use case.

## What you need

Use these GitHub secrets / variables:

- `APPLE_TEAM_ID`
- `IOS_DISTRIBUTION_CERT_BASE64`
- `IOS_DISTRIBUTION_CERT_PASSWORD`
- `IOS_PROVISION_PROFILE_BASE64`
- `IOS_PROVISION_PROFILE_NAME`
- `KEYCHAIN_PASSWORD`
- `APPSTORE_API_KEY_ID`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_API_PRIVATE_KEY`

## What the workflow does

The workflow at [`.github/workflows/ios-testflight.yml`](../.github/workflows/ios-testflight.yml) will:

1. Install dependencies.
2. Validate mobile wrapper readiness.
3. Build the web assets.
4. Sync Capacitor iOS.
5. Install the Apple signing certificate and provisioning profile.
6. Archive and export an iOS IPA.
7. Save the IPA as a GitHub artifact.
8. Optionally upload the IPA to TestFlight.

## Best-practice setup order

1. Keep the iOS shell committed and the Capacitor config stable.
2. Add the GitHub Actions workflow.
3. Create the Apple signing certificate and provisioning profile.
4. Add the App Store Connect API key.
5. Run the workflow once with `upload_testflight=false`.
6. When the build is clean, run it again with `upload_testflight=true`.

## Notes

- The bundle ID in this project is `com.notebill.app`.
- The iOS project already exists, so this is build automation, not a rewrite.
- Before buying anything, run `npm run check:ios-launch` to see which repo-side pieces are already ready.
- If the build fails, the first things to check are the provisioning profile name, team ID, and certificate password.
