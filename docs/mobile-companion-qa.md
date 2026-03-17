# Mobile companion QA checklist

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

### iOS-specific notes (requires Mac/Xcode or cloud builder)
- Open `ios/App/App.xcworkspace`, select a development team, and run on the iPhone 15.
- Confirm file uploads via the iOS share sheet, that Billie retains state, and that the app regains focus when returning from Safari.

## Follow-up
- Capture any layout/permission issues in a shared doc (link to `docs/mobile-companion-qa.md`).
- Once you gain access to a Mac or CI, automate the build and provide TestFlight invites.
