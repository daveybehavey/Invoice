# NoteBill Play Console Submission Runbook

Use this while filling out Play Console so nothing gets skipped.

## 1. App setup

- App name: `NoteBill`
- Default language: choose the language you want for the listing, likely `en-US`
- App or game: `App`
- Free or paid: likely `Free`
- Category: likely `Business`

## 2. Package and artifact

- Confirm package name matches the Android app:
  - `app.notebill.app`
- Upload the signed release bundle:
  - Current latest bundle: `C:\Users\david\OneDrive\Desktop\Invoice\android\app\build\outputs\bundle\release\app-release.aab`
  - Named archived bundles live in the same folder, for example `app-release-1.0.13.aab`.
- For every Play Console update, confirm the bundle's Android `versionCode` is higher than any bundle already uploaded to Play.
- Do not rely on the file name alone. Play decides whether a bundle is an update from the package name plus `versionCode`.

Verified local bundle inventory:

| Bundle file | Package | Version name | Version code |
| --- | --- | --- | ---: |
| `app-release-1.0.13.aab` | `app.notebill.app` | `1.0.13` | 14 |
| `app-release-1.0.14.aab` | `app.notebill.app` | `1.0.14` | 15 |
| `app-release-1.0.15.aab` | `app.notebill.app` | `1.0.15` | 16 |
| `app-release-1.0.16.aab` | `app.notebill.app` | `1.0.16` | 17 |
| `app-release.aab` | `app.notebill.app` | `1.0.16` | 17 |

If Play Console has already accepted version code 14, do not upload `app-release-1.0.13.aab` again. Use the next unused higher version code instead.

## 3. Store listing

Prepare and enter:

- App name
- Short description
- Full description
- App icon
- Feature graphic
- Phone screenshots
- Support contact details
- Privacy policy URL

Use:

- [play-store-listing.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/play-store-listing.md)
- [google-play-production-access-answers.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/google-play-production-access-answers.md)

Generated local asset pack:

- `C:\Users\david\OneDrive\Desktop\Invoice\marketing\play-store`

Repeatable asset command:

```powershell
$env:PLAY_ASSET_BASE_URL = "https://app.notebill.app"
npm run assets:play-store
```

For local pre-deploy captures, run the app locally first and set `PLAY_ASSET_BASE_URL` to that local URL.

## 4. Privacy policy, support, and deletion URLs

Before using these in Play Console:

1. Review the public pages and confirm the contact details are current
2. Publish the site
3. Verify the URLs load over HTTPS on desktop and Android

Recommended URLs:

- `https://app.notebill.app/privacy`
- `https://app.notebill.app/support`
- `https://app.notebill.app/data-deletion`

Current app routes added for this:

- `/privacy`
- `/support`
- `/data-deletion`
- `/delete-account`

## 5. App content declarations

Work through:

- App access
- Ads declaration
- Content rating questionnaire
- Target audience
- News app declaration if shown
- Data Safety form

You should be able to answer:

- Ads: likely `No`
- News app: `No`

## 6. Data Safety review

Use:

- [data-safety-notes.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/data-safety-notes.md)

Double-check before submitting:

- Whether email sign-in is required in production
- Whether audio transcription is enabled in production
- Whether OCR/image import is enabled in production
- Whether telemetry export is enabled in production
- Whether Stripe billing is enabled in production
- Whether invoice email sending is enabled in production
- Whether the monitored support inbox is ready to handle account deletion requests

## 7. Policy-sensitive claims to avoid

Do not claim:

- bookkeeping or accounting compliance
- tax calculation or tax compliance
- legal advice
- guaranteed payment collection
- fully offline operation unless you verify it
- permissions or features the Android build does not actually use

## 8. Technical verification before rollout

- Install the release build on Android
- Open the app from a clean state
- Verify main launcher works
- Verify invoice generation from rough notes
- Verify save and reopen flow
- Verify PDF/export flow
- Verify import flow with an invoice file or image
- If enabled, verify audio transcription
- If enabled, verify billing upgrade flow
- If enabled, verify payment-link creation
- Verify privacy, support, and data deletion URLs open correctly from mobile browser

## 9. Release management

- Start with an internal or small testing track if you want a softer launch
- Read every Play warning after bundle upload
- Fix any policy, target SDK, or App Content blockers before production rollout
- Add concise release notes for the first release

### Copy-paste release notes

Use this for the first Android closed test release:

```text
NoteBill is ready for its first Android test build.

This version focuses on fast invoice creation from rough notes, manual review and editing, saved drafts, PDF export, scratchpad capture, repeat-client memory, and feedback tools.

Please report anything confusing, broken, slow, or visually off.
```

### Copy-paste app access note

Use this for the App access / reviewer instructions field:

```text
NoteBill does not require a password to review the core workflow. The app opens to the main invoice path, and optional sign-in uses an email link only.

Reviewers can use the sample notes or the scratchpad immediately after launch. No special credentials, QR codes, memberships, or 2-step codes are required for the main flow.

If you need help or device-specific access notes, contact support@notebill.app.
```

## 10. Final pre-submit check

- Privacy policy URL is public and accurate
- Support contact info is real and monitored
- Data deletion URL is public and monitored
- Screenshots match the current app UI
- The bundle uploaded is the same one you tested
- Keystore is backed up safely
- No secrets or keystore files are committed
- Store copy matches actual product behavior

## Companion docs

- [android-release-checklist.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/android-release-checklist.md)
- [privacy-policy.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/privacy-policy.md)
- [play-store-listing.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/play-store-listing.md)
- [data-safety-notes.md](c:/Users/david/OneDrive/Desktop/Invoice/docs/data-safety-notes.md)
