# Android Release Checklist

This checklist is for shipping `NoteBill` to the Google Play Store from a Windows machine.

## Release artifacts

- Confirm latest signed bundle exists:
  - `android/app/build/outputs/bundle/release/app-release.aab`
- Confirm latest native debug symbols zip exists:
  - `android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip`
- Upload the latest archived named bundle, not just `app-release.aab`.
- Upload the latest archived native symbols zip alongside the bundle only when the packaging script actually generated native debug metadata for that build.
- Current public-ready bundle:
  - `android/app/build/outputs/bundle/release/app-release-2.1.50.aab`
  - Native debug symbols were not generated for `2.1.50`, so do not upload a symbols zip for this build.
- Confirm package/application id is correct:
  - `app.notebill.app`
- Confirm the Android `versionCode` is higher than any bundle already uploaded to Play Console.
  - Play treats `versionCode`, not `versionName` or file name, as the update sequence.
- Confirm app name is correct:
  - `NoteBill`

## Signing safety

- Keep `android/notebill-release.keystore` out of git
- Keep `android/keystore.properties` out of git
- Back up the keystore in at least two safe places before publishing
- Record the keystore alias and passwords in your password manager
- Never rotate or lose the production signing key without an intentional recovery plan

## Build steps on Windows

```powershell
cd C:\Users\david\Desktop\Invoice
npm run check:android-release
npm run bundle:android:release
```

## App content checks

- Review app name, icon, splash, and package id
- Confirm there are no placeholder texts, debug notices, or internal diagnostics exposed to users
- Confirm privacy policy URL is ready
- Confirm support email is ready
- Confirm store description matches actual features

## Functional smoke pass on Android

- Launch the app from a fresh install
- Verify sign-in by email works if auth is used
- Paste messy notes and generate an invoice
- Import a PDF or image invoice and confirm extraction works
- If audio-note upload is intended for release, verify it works on-device
- Edit line items manually
- Save a draft and reopen it
- Duplicate a saved invoice
- Export or print PDF successfully
- Verify invoice status changes work
- If billing is enabled, confirm Google Play restore unlocks Pro correctly
- If billing is enabled, confirm Pro remains active after reinstall and reopen
- If invoice payment links are enabled, create one and verify it opens correctly

## Store listing assets

- Final app title
- Short description
- Full description
- App icon 512 x 512
- Feature graphic 1024 x 500
- At least 2 phone screenshots
- Privacy policy URL
- Support contact details

Current generated asset pack:

- `marketing/play-store/app-icon-512.png`
- `marketing/play-store/feature-graphic-1024x500.png`
- `marketing/play-store/phone-01-launcher.png`
- `marketing/play-store/phone-02-ai-intake.png`
- `marketing/play-store/phone-03-manual-editor.png`
- `marketing/play-store/phone-04-invoice-library.png`
- `marketing/play-store/phone-05-help-center.png`
- `marketing/play-store/phone-06-import.png`

Regenerate after UI changes:

```powershell
$env:PLAY_ASSET_BASE_URL = "https://app.notebill.app"
npm run assets:play-store
```

## Play Console setup tasks

- Create Play Console account and pay the one-time registration fee
- Create the app entry
- Choose app category:
  - likely `Business`
- Set target audience and content declarations
- Complete Data Safety form
- Upload privacy policy URL
- Upload the `.aab`
- Review release notes
- Confirm the release notes match the current public build, not an older closed-test draft

## Quality / policy checks

- No copyrighted demo content in screenshots
- No misleading claims about accounting, tax, legal, or compliance features
- No broken links in privacy policy or support pages
- All production endpoints use HTTPS
- No test Stripe keys or sandbox references in user-facing flows

## Nice-to-have before launch

- Add an internal release-notes template
- Add a privacy-policy draft to the repo if the website copy is not written yet
- Regenerate final screenshots from the current polished build before production listing updates
- Run one final smoke pass using the exact release build uploaded to Play
