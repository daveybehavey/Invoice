# Mobile Wrapper Phase 2 Baseline

This project is still web-first. The goal of this phase is to keep iOS/Android packaging deterministic once we choose to ship stores, without changing product behavior.

## What exists now
- PWA shell: `public/manifest.webmanifest`, icons, service worker, mobile meta tags.
- Capacitor baseline config: `capacitor.config.json`.
- Installed packaging toolchain: `@capacitor/core`, `@capacitor/cli`.
- Readiness check command: `npm run check:mobile-wrapper`.

## Readiness command
Run:

```bash
npm run check:mobile-wrapper
```

This now validates:
- manifest launch metadata
- maskable app icons
- mobile HTML meta tags
- Capacitor config safety
- installed Capacitor packages

## Packaging commands
When we are ready to activate native packaging:

```bash
npx cap add ios
npx cap add android
npm run build:frontend
npx cap sync
npx cap open ios
npx cap open android
```

## Store readiness checklist
Before opening Xcode/Android Studio, confirm:
1. `npm run check:mobile-wrapper` passes.
2. `npm run check:launch` passes.
3. `notebill.app` production domain is live and healthy.
4. Stripe and delivery are both on production credentials.
5. Export/send/save flows have been smoke-tested on a phone-sized viewport.

## Cheapest iOS build path
If you want the lowest-cost no-Mac route for iOS/TestFlight, start here:

- [iOS GitHub Actions cheap path](./ios-github-actions-cheap-path.md)

## Guardrails
- Keep money logic server-side and deterministic.
- Keep auth/session checks enforced in API responses.
- Do not add mobile-only behavior that bypasses web guardrails.
- Treat Capacitor as a distribution shell, not a separate app architecture.
