# Browser Control Bridge

This repo now includes a small Playwright-based browser bridge for repeat dashboard work.

## What it is

- a local browser process with a persistent profile
- a tiny HTTP API for navigation, clicks, typing, screenshots, and page state
- useful for repeated Google Ads, GA4, Play Console, or other browser-only tasks

## Why this approach

- it reuses the Playwright dependency already in the repo
- it keeps browser state in a persistent profile
- it stays local to your machine instead of exposing credentials to a third-party tool

## Start it

```bash
npm run browser:control
```

By default this:

- opens a visible browser
- stores profile data under `.runtime/browser-control/profile`
- listens on `http://127.0.0.1:32123`

## Best-practice Chrome handoff

If you want me to work in your real signed-in Chrome session, do this:

1. Close any Chrome windows you do not need.
2. Start Chrome with remote debugging enabled.
3. Sign into Google in that Chrome window manually.
4. Start the browser bridge with `BROWSER_CONTROL_CDP_URL` pointed at Chrome.

Example Chrome launch on Windows:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\NoteBill-Chrome"
```

Then start the bridge:

```powershell
$env:BROWSER_CONTROL_CDP_URL='http://127.0.0.1:9222'
npm run browser:control
```

If Chrome is installed somewhere else, point the path at that `chrome.exe` instead.

## Useful environment variables

- `BROWSER_CONTROL_PORT` - change the local API port
- `BROWSER_CONTROL_HOST` - default host, keep this on `127.0.0.1`
- `BROWSER_CONTROL_HEADLESS` - set to `1` for a hidden browser
- `BROWSER_CONTROL_START_URL` - initial page to open
- `BROWSER_CONTROL_CHANNEL` - set to `chrome` or `msedge` if you want the installed browser
- `BROWSER_CONTROL_CDP_URL` - attach to an already running Chrome/Edge instance started with remote debugging
- `BROWSER_CONTROL_PROFILE_DIR` - custom persistent profile path

## Main endpoints

- `GET /health`
- `GET /state`
- `GET /pages`
- `POST /open`
- `POST /goto`
- `POST /click`
- `POST /fill`
- `POST /type`
- `POST /press`
- `POST /select`
- `POST /check`
- `POST /hover`
- `POST /scroll`
- `POST /wait`
- `POST /reload`
- `POST /content`
- `POST /evaluate`
- `POST /screenshot`
- `POST /close`

## Locator targets

Requests can use one of these target shapes:

- `{ "selector": "button.save" }`
- `{ "role": "button", "name": "Save" }`
- `{ "testId": "billing-submit" }`
- `{ "label": "Email" }`
- `{ "placeholder": "Search" }`
- `{ "text": "Open plan & billing" }`

## Example request

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:32123/goto `
  -ContentType "application/json" `
  -Body (@{ url = "https://app.notebill.app/invoice-app-on-phone" } | ConvertTo-Json)
```

## Best practice

- Keep the browser profile dedicated to dashboard work.
- Sign into Google once in that profile, then reuse it.
- Keep the port on localhost only.
- Use screenshots after major clicks so you can confirm what the page actually looks like.
