# Mobile Wrapper Phase 2 Baseline

This project is still web-first, but this baseline keeps iOS/Android packaging straightforward when we decide to ship stores.

## What exists now
- PWA baseline: manifest + icons + service worker.
- Capacitor baseline config: `capacitor.config.json`.
- Readiness check command: `npm run check:mobile-wrapper`.

## Readiness command
Run:

```bash
npm run check:mobile-wrapper
```

This validates the required app-shell artifacts and Capacitor config presence.

## When we activate store packaging
1. Install Capacitor packages:

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
```

2. Add native platforms:

```bash
npx cap add ios
npx cap add android
```

3. Build frontend, then sync:

```bash
npm run build:frontend
npx cap sync
```

4. Open native projects:

```bash
npx cap open ios
npx cap open android
```

## Guardrails
- Keep money logic server-side and deterministic.
- Keep auth/session checks enforced in API responses.
- Do not add mobile-only behavior that bypasses web guardrails.
