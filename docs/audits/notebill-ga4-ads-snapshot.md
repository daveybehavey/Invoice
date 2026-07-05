# NoteBill GA4 / Ads Snapshot

**Date:** 2026-07-04 (UTC)  
**Mode:** Read-only / ops / docs-only  
**Repo:** `C:\Users\david\Desktop\Invoice`  
**Prior docs:** `docs/audits/notebill-revenue-readiness-audit.md`, `docs/audits/notebill-revenue-funnel-snapshot.md`

---

## 1. Repo dirty status

| Item | Status |
| --- | --- |
| Branch | `main` @ `391a524` (prior funnel snapshot commit) |
| Working tree | **Heavily dirty** — unchanged by this pass |
| `package.json` / `package-lock.json` | **Already modified before this run** — hashes **unchanged** after all steps |
| Source files | **Not modified** |

---

## 2. Lock / unblock result

### Processes holding Invoice `esbuild.exe`

| Process | Count | Path / command |
| --- | ---: | --- |
| `esbuild.exe --service` | 6 | `C:\Users\david\Desktop\Invoice\node_modules\@esbuild\win32-x64\esbuild.exe` |
| `node.exe` (tsx tests) | ~30+ | `Invoice\node_modules\.bin\tsx --test …` |
| `node.exe` (tsx dev) | several | `Invoice\node_modules\tsx\dist\preflight.cjs` |
| Related clone | 1 | `Invoice-polish-clean\node_modules\tsx` |

**Read test:** file opens for read, but **`npm ci` still fails** on `unlink` (`EPERM`) because esbuild service processes keep the binary loaded.

### What to close (manual)

Close/stop in terminals or Task Manager:

1. Any **`npm run dev`** / **`npm test`** / **`tsx --test`** running under `C:\Users\david\Desktop\Invoice`
2. The **6 `esbuild.exe --service`** processes under that repo’s `node_modules\@esbuild\win32-x64\`
3. Optional: **`Invoice-polish-clean`** node/tsx if not needed

Then re-run **`npm ci`** from a fresh terminal.

**Not auto-killed** — too many shared `node.exe` processes (Cursor, Adobe, other repos) to safely bulk-stop.

---

## 3. Whether `npm ci` succeeded

**No.** Failed twice with:

```text
EPERM: operation not permitted, unlink
…\node_modules\@esbuild\win32-x64\esbuild.exe
```

`package.json` and `package-lock.json` did **not** change.

### dotenv workaround (node_modules only)

Copied `node_modules/dotenv` from `Invoice-live-baseline` (gitignored path). **Not a substitute for `npm ci`.** `node_modules` remains partially broken.

---

## 4. Whether report scripts succeeded

| Command | Result |
| --- | --- |
| `npm run check:google-growth-stack` | **Partial** — Google Play OK; GA4 + Ads failed |
| `npm run report:google-growth-summary` | **Failed** — `{ "ok": false, "error": "Bad Request" }` |
| `npm run report:google-conversion-readiness` | **Failed** — same |

---

## 5. Missing / broken credentials (names only — values not inspected)

All required variable **names** are present in `.env.local`:

| Variable | Present |
| --- | --- |
| `GOOGLE_ANALYTICS_PROPERTY_ID` | yes |
| `GOOGLE_ADS_CLIENT_ID` | yes |
| `GOOGLE_ADS_CLIENT_SECRET` | yes |
| `GOOGLE_ADS_REFRESH_TOKEN` | yes (but **invalid**) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | yes |
| `GOOGLE_ADS_CUSTOMER_ID` | yes |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | yes |

### Root cause (OAuth probe)

Refresh token exchange returns:

| Field | Value |
| --- | --- |
| HTTP status | 400 |
| `error` | `invalid_grant` |
| `error_description` | `Bad Request` |

The report scripts surface this as **"Bad Request"** — it is a **dead/expired `GOOGLE_ADS_REFRESH_TOKEN`**, not a missing env file.

**Fix (ops, not done here):** Regenerate `GOOGLE_ADS_REFRESH_TOKEN` with scopes:

- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/adwords`

Update `.env.local`, then re-run reports after `npm ci` succeeds.

### What did work

| Check | Result |
| --- | --- |
| Google Play service account | **OK** — auth succeeded for `app.notebill.app` |

---

## 6. GA4 7d / 30d sessions and key events

**Not available** — GA4 Data API calls never authenticated (invalid refresh token).

---

## 7. Google Ads 7d / 30d metrics

**Not available** — same OAuth failure.

---

## 8. Web lane vs Android lane

| Lane | Monetization | This snapshot |
| --- | --- | --- |
| **Web revenue** | Stripe + GA4 `purchase` / `pro_unlock_verified` | GA4/Ads **blocked** by OAuth |
| **Android install / Play** | Google Play billing | Service-account auth **OK**; purchase proof not run here |

Do not mix lanes in Ads optimization (`docs/google-growth-ops.md`).

---

## 9. Funnel table (production telemetry fallback)

Because GA4/Ads could not run, numbers below are from **`GET https://app.notebill.app/api/telemetry/revenue-signals`** (same source as prior funnel snapshot). GA4 **sessions** column remains empty.

### All-time (production `byEvent`)

| Stage | 7d (GA4) | 30d (GA4) | All-time (telemetry) | Notes |
| --- | ---: | ---: | ---: | --- |
| Landing / sessions | — | — | — | Needs GA4 |
| `app_opened` | — | — | 3 | Under-tracked |
| `first_draft_started` | — | — | 25 | 18 unique owners |
| `billing_plan_viewed` | — | — | 122 | |
| `billing_plan_selected` | — | — | 19 | |
| `checkout_started` | — | — | 13 | |
| `pro_unlock_verified` | — | — | 5 | +1 lifetime |

### Recent telemetry buffer (partial 30d window)

| Stage | ~30d buffer | Notes |
| --- | ---: | --- |
| `first_draft_started` | 18 | Incomplete buffer |
| `billing_plan_viewed` | 10 | |
| `checkout_started` | 0 | |
| `pro_unlock_verified` | 0 | |

---

## 10. Biggest measured drop-off

Unchanged from production telemetry (GA4 could not confirm ads → app):

```text
billing_plan_viewed 122
  → billing_plan_selected 19   (~84% drop)
  → checkout_started 13
  → pro_unlock_verified 5 (+1 lifetime)
```

**Still cannot measure:** impressions/clicks → sessions → `app_opened` until OAuth is fixed.

---

## 11. Is data decision-ready?

**No — still partially decision-ready.**

| Question | Status |
| --- | --- |
| Billing UI → checkout drop-off | **Yes** (telemetry) |
| Ads → landing → app entry | **No** (GA4 blocked) |
| Ads spend vs conversions | **No** (Ads API blocked) |
| Android Play billing proven | **No** (auth OK; no fresh unlock proof) |

---

## 12. Recommended next ticket

**Ops first (before any code/pricing/ads/deploy):**

1. **Close Invoice esbuild/tsx processes** → run **`npm ci`** successfully.
2. **Regenerate `GOOGLE_ADS_REFRESH_TOKEN`** (invalid_grant) with Analytics + AdWords scopes → update `.env.local`.
3. Re-run **`report:google-growth-summary`** and **`report:google-conversion-readiness`**.

**Then choose product ticket:**

| If GA4 shows… | Ticket |
| --- | --- |
| Clicks/sessions OK, low `app_opened` | Landing / launcher |
| Sessions OK, low drafts | First-use / onboarding |
| Drafts OK, low billing views | Late paywall / generous free tier |
| Billing views OK, low selections | **Upgrade clarity / trust** (telemetry already points here) |
| Checkout starts OK, no unlocks | **Billing / checkout proof** |
| Mobile web share high | Play / deep-link routing |

**Current best pick (with existing telemetry only):** **Upgrade clarity + billing proof investigation** — but **do not implement** until GA4/Ads snapshot succeeds after OAuth fix.

---

## 13. Commands run this pass

```text
git status --short
Get-Process node, esbuild (Invoice paths)
npm ci                          → EPERM (esbuild locked)
npm install dotenv --no-save    → hung / incomplete; dotenv copied from baseline
npm run check:google-growth-stack
npm run report:google-growth-summary
npm run report:google-conversion-readiness
OAuth probe (token refresh + API status codes)
GET /api/telemetry/revenue-signals (production fallback)
```

---

## 14. GA4 / Ads snapshot after OAuth repair (attempt 2)

**Date:** 2026-07-04 (evening, UTC)  
**Context:** User closed terminals / fresh session assumed after restart guidance.

### 14.1 `npm ci`

| Check | Result |
| --- | --- |
| `npm ci` | **Succeeded** (exit 0, ~2m) |
| `node_modules/dotenv` | **Present** |
| `node_modules/@esbuild/win32-x64/esbuild.exe` | **Present** |
| `package.json` / `package-lock.json` | **Unchanged** (still pre-modified `M`, hashes same as before) |
| App/source files | **Not modified** by install |

**Conclusion:** Local dependency blocker **cleared**. Reports can run once OAuth is fixed.

### 14.2 Refresh token regeneration

| Check | Result |
| --- | --- |
| `GOOGLE_ADS_REFRESH_TOKEN` in `.env.local` | Present |
| Token refresh probe | **Still fails** — HTTP 400, `invalid_grant`, `Bad Request` |
| Token updated this pass | **No** — requires manual Google OAuth consent |

**Manual regeneration (ops — user must complete):**

1. Confirm Google Cloud OAuth client redirect URI includes **`http://localhost:8080/`** (or set `GOOGLE_ADS_OAUTH_REDIRECT_URI` in `.env.local` to match your GCP console entry).
2. Open the authorize URL (built from `GOOGLE_ADS_CLIENT_ID` in `.env.local`):

   ```text
   https://accounts.google.com/o/oauth2/v2/auth
     ?response_type=code
     &client_id=<GOOGLE_ADS_CLIENT_ID>
     &redirect_uri=http://localhost:8080/
     &scope=https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/adwords
     &access_type=offline
     &prompt=consent
   ```

3. Sign in with the Google account that owns GA4 + Ads access. Approve scopes.
4. Copy the `code` query param from the redirect URL (browser may show “can’t connect” — the code is still in the address bar).
5. Exchange code for tokens (run locally; reads secrets from `.env.local`, does not print them):

   ```powershell
   cd C:\Users\david\Desktop\Invoice
   # Set $code to the value from step 4, then run a local exchange script or:
   # POST https://oauth2.googleapis.com/token with grant_type=authorization_code,
   # client_id, client_secret, redirect_uri, code
   ```

6. Paste the returned **`refresh_token`** into `.env.local` as `GOOGLE_ADS_REFRESH_TOKEN` (do not commit).

7. Re-run:

   ```powershell
   npm run check:google-growth-stack
   npm run report:google-growth-summary
   npm run report:google-conversion-readiness
   ```

**Cursor pause point:** After step 6, re-run Part 3 of the unblock prompt to fill GA4/Ads numbers below.

### 14.3 Report scripts (this pass)

| Command | Result |
| --- | --- |
| `npm run check:google-growth-stack` | **Partial** — Google Play OK; GA4 + Ads failed (`Bad Request` / invalid_grant) |
| `npm run report:google-growth-summary` | **Failed** — `{ "ok": false, "error": "Bad Request" }` |
| `npm run report:google-conversion-readiness` | **Failed** — same |

### 14.4 GA4 7d / 30d sessions and events

**Not available** — OAuth still blocked.

### 14.5 Google Ads 7d / 30d metrics

**Not available** — OAuth still blocked.

### 14.6 Web lane vs Android lane

| Lane | This pass |
| --- | --- |
| Web revenue (GA4/Ads) | **Blocked** — invalid refresh token |
| Android Play (service account) | **OK** — auth succeeded for `app.notebill.app` |

### 14.7 Funnel table (production telemetry fallback — unchanged)

| Stage | GA4 7d | GA4 30d | Telemetry (all-time) |
| --- | ---: | ---: | ---: |
| Sessions / landing | — | — | — |
| `app_opened` | — | — | 3 |
| `first_draft_started` | — | — | 25 |
| `billing_plan_viewed` | — | — | 122 |
| `billing_plan_selected` | — | — | 19 |
| `checkout_started` | — | — | 13 |
| `pro_unlock_verified` | — | — | 5 (+1 lifetime) |

### 14.8 Biggest measured drop-off

Still **billing_plan_viewed → billing_plan_selected → checkout_started → pro_unlock_verified** (122 → 19 → 13 → 5). GA4 cannot yet confirm ads → sessions → app entry.

### 14.9 Decision-ready?

**No.** Dependency install is fixed; **OAuth is the remaining blocker** before GA4/Ads numbers and a confident product ticket.

### 14.10 Recommended next ticket

1. **Complete OAuth refresh token regeneration** (manual steps above).
2. Re-run report scripts and append GA4/Ads numbers to this section.
3. **Then** choose product work:

| If GA4 shows… | Ticket |
| --- | --- |
| Billing views OK, low selections | Upgrade clarity / trust |
| Checkout starts OK, no unlocks | Billing / checkout proof |
| Sessions OK, low `app_opened` | Landing / launcher |

**Do not start pricing, deploy, ad scaling, or code changes until step 2 succeeds.**
