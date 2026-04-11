# Mobile companion QA checklist

## Android quickstart (Windows/Linux, emulator-first)
Use this when you want the fastest local proof before phone wiring.

One command baseline:
- `npm run check:android-prep`

Strict mode (requires a connected emulator/phone):
- `npm run check:android-prep:strict`

1. In project root, run `npm run check:android-local`.
2. Run web-mobile regression suite: `npm run check:smoke:mobile`.
3. If `android/` is missing, run `npm run cap:sync` then `npx cap add android`.
4. Open Android Studio and use `Open` -> select the project `android` folder.
5. In Android Studio, open `Device Manager` and start a Pixel emulator (Android 14+).
6. In project root, run `npm run cap:sync` after any web UI change.
7. In Android Studio, press Run on the `app` target.
8. Verify these flows on emulator:
   - launcher -> start with Billie
   - intake -> resolve decision -> generate
   - manual -> send/export -> library status update
9. If app looks stale, run `npm run cap:sync` again, then re-run app.

## Initial setup
1. Keep Android/iOS Capacitor projects in sync (`npm run build && npx cap copy && npx cap sync`).
2. Document bundle id, app name, and web URL used in `capacitor.config.json` for both platforms.
3. Determine the target devices: Galaxy S24 (Android) and iPhone 15.

## Device-specific tests
### Intake & Billie
- Launch the app, sign in, paste messy notes, resolve the decisions review, and build the draft.
- Check Billie workspace presence: status chip, button states, highlight behavior, and assistant actions.
- Ensure voice-note upload/transcription UI works (mic permission, audio file selection). 

### Manual invoice & exports
- Open manual editor, adjust a line item, run Billie polish, and confirm inline highlights.
- Generate PDF/export and verify sharing options (email, Files, share sheet) behave.
- Check keyboard handling for invoice fields and that the invoice stays centered on screen.

### Payment/links
- Trigger payment-link creation, copy the URL, open in the system browser, and confirm you reach the hosted checkout.
- Use reminders/payment status to mark an invoice paid and verify the library reflects it (status chip, amount, timeline). 

### Device behavior
- Confirm camera/microphone prompts show proper purpose text.
- Test offline/reconnect flows: close the app while syncing, reopen, and confirm you can continue working.
- Validate `prefers-reduced-motion` surfaces on mobile (Billie highlights should respect the setting, no flashy motion).

### Android-specific notes
- Use Android Studio to run the `app` module, confirm the assets copy, and watch logs for permission requests and errors.
- If `adb devices` shows no devices, restart `adb` (`adb kill-server && adb start-server`) and re-open the emulator.
- If builds fail after dependency updates, run `npx cap sync android` before trying Gradle sync again.

### iOS-specific notes (requires Mac/Xcode or cloud builder)
- Open `ios/App/App.xcworkspace`, select a development team, and run on the iPhone 15.
- Confirm file uploads via the iOS share sheet, that Billie retains state, and that the app regains focus when returning from Safari.

## Follow-up
- Capture any layout/permission issues in a shared doc (link to `docs/mobile-companion-qa.md`).
- Once you gain access to a Mac or CI, automate the build and provide TestFlight invites.
