# NoteBill Revenue Funnel Snapshot

**Date:** 2026-07-04 (UTC)  
**Mode:** Read-only / docs-only  
**Repo:** `C:\Users\david\Desktop\Invoice`  
**Prior audit:** `docs/audits/notebill-revenue-readiness-audit.md`

---

## 1. Repo safety status (before work)

| Check | Result |
| --- | --- |
| Branch | `main` @ `75f0915` (`docs: add NoteBill revenue/readiness audit`) |
| Remote | `origin` → `https://github.com/daveybehavey/Invoice.git` |
| Ahead/behind | **In sync with `origin/main`** (audit commit pushed earlier) |
| Working tree | **Heavily dirty** — many modified + untracked files (unchanged by this pass) |
| `package.json` / `package-lock.json` | **Already modified before this run** (`M` in `git status`) |

**Safety:** No source, package, or env files were modified by this snapshot pass.

---

## 2. Commands run

| Command | Result |
| --- | --- |
| `git status --short` | Dirty tree; package files pre-modified |
| `git branch -vv` | `main` tracking `origin/main` |
| `git log --oneline -5` | `75f0915` … `f1a71a8` |
| `git remote -v` | GitHub `daveybehavey/Invoice` |
| `npm ci` | **Failed** — `EPERM` unlink `node_modules\@esbuild\win32-x64\esbuild.exe` (file in use). Package files **unchanged** after attempt. |
| `npm run report:google-growth-summary` | **Failed** — `ERR_MODULE_NOT_FOUND: dotenv` |
| `npm run report:google-conversion-readiness` | **Failed** — `ERR_MODULE_NOT_FOUND: dotenv` |
| `GET https://app.notebill.app/api/telemetry/revenue-signals` | **Succeeded** — production read-only fallback |

---

## 3. Whether `npm ci` was run

**Attempted once.** Failed with Windows `EPERM` on `esbuild.exe`. Did not retry, reinstall, or alter package files.

`node_modules/dotenv` is **missing** (broken/partial install). `.env.local` **exists**; `.env` missing.

---

## 4. Whether GA4 / Ads reports succeeded

**No.** Both npm report scripts require the `dotenv` package (not installed). Even with `.env.local` present, reports could not load credentials.

### Env vars required by report scripts (names only — values not inspected)

| Script | Required variables |
| --- | --- |
| `report:google-growth-summary` | `GOOGLE_ANALYTICS_PROPERTY_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| `report:google-conversion-readiness` | `GOOGLE_ANALYTICS_PROPERTY_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` (OAuth token must include Analytics readonly scope) |

**Unblock path (ops, not done here):** Close apps locking `esbuild.exe` → `npm ci` → re-run both report scripts.

---

## 5. Funnel data sources

| Source | Coverage | Notes |
| --- | --- | --- |
| GA4 7d / 30d | **Not available** | Reports blocked locally |
| Google Ads 30d | **Not available** | Reports blocked locally |
| Production `GET /api/telemetry/revenue-signals` | **Available** | All-time `byEvent` totals + **28-event recent buffer** (2026-06-12 → 2026-07-04) |
| Unique owners (telemetry rollup) | **Partial** | 139 owners; some stages (e.g. `billingPlanViewed`, `proUnlockVerified`) do not rollup cleanly on owner objects |

---

## 6. Funnel tables

### All-time — production telemetry (`byEvent` event counts)

| Stage | Count | Notes |
| --- | ---: | --- |
| Landing/session (GA4) | — | Not pulled |
| `app_opened` | 3 | Severely under-tracked vs other stages |
| `first_app_opened` | 1 | |
| `first_draft_started` | 25 | 18 unique owners (rollup) |
| `invoice_generated` | 20 | 14 unique owners |
| `billing_plan_viewed` | 122 | High repeat views; owner rollup shows 0 (aggregation gap) |
| `billing_plan_selected` | 19 | |
| `checkout_started` | 13 | 6 unique owners |
| `pro_unlock_verified` | 5 | 0 on owner rollup — events exist in `byEvent` only |
| `lifetime_unlock_verified` | 1 | |

### All-time — unique owners (production telemetry rollup)

| Stage | Unique owners |
| --- | ---: |
| Total tracked owners | 139 |
| `first_draft_started` | 18 |
| `invoice_generated` | 14 |
| `checkout_started` | 6 |
| `pro_unlock_verified` | 0 (rollup mismatch — see `byEvent` = 5) |

### 7-day — recent events buffer only (not full GA4)

| Stage | Count | Notes |
| --- | ---: | --- |
| Landing/session | — | |
| `app_opened` | 0 | |
| `first_draft_started` | 0 | |
| `billing_plan_viewed` | 1 | |
| `checkout_started` | 0 | |
| `pro_unlock_verified` | 0 | |

### 30-day — recent events buffer only (not full GA4)

| Stage | Count | Notes |
| --- | ---: | --- |
| Landing/session | — | |
| `app_opened` | 0 | |
| `first_draft_started` | 18 | |
| `billing_plan_viewed` | 10 | |
| `checkout_started` | 0 | |
| `pro_unlock_verified` | 0 | |

> **Caveat:** The API returns at most ~100 recent raw events; the live buffer had 28 events. **30-day counts are incomplete** for checkout/unlock. Use all-time `byEvent` for checkout/unlock trends until GA4 reports run.

---

## 7. Google Ads / GA4 conversion readiness

**Not measured in this pass** (scripts did not run).

From `docs/google-growth-ops.md` (documentation only):

- **Web revenue lane** truth signal: `pro_unlock_verified` (+ GA4 `purchase`)
- **Android install lane** is separate — do not mix optimization loops
- Recommended search campaign goals: `PURCHASE ~ WEBSITE`, `SUBSCRIBE_PAID ~ WEBSITE` only

---

## 8. Android lane vs web lane

| Lane | Monetization | This snapshot |
| --- | --- | --- |
| Web | Stripe checkout on non-Android-browser | `checkout_started` = 13 all-time; 0 in 30d recent buffer |
| Android native | Google Play | `pro_unlock_verified` + `lifetime_unlock_verified` = 6 events all-time; `google_play_verification_failed` = 0 in `byEvent` |
| Android mobile browser | Upgrade blocked (open installed app) | Not directly visible in telemetry |

Cannot confirm Ads final URLs (web vs Play) without GA4/Ads reports.

---

## 9. Biggest measured drop-off

**Primary (all-time telemetry):** `billing_plan_viewed` (122) → `billing_plan_selected` (19) → `checkout_started` (13) → `pro_unlock_verified` (5).

- **~84%** of billing-plan views do not become a plan selection.
- **~54%** of checkout starts do not become a verified Pro unlock (13 → 6 total unlocks).
- **`app_opened` is essentially missing** (3 events / 0 owner rollup) — cannot validate ads → app entry; GA4 sessions required.

**Secondary (30d recent buffer):** Draft activity (`first_draft_started` = 18) with **zero** `checkout_started` and **zero** unlocks — consistent with “free draft value, no recent paid conversion,” but buffer is incomplete for checkout events.

---

## 10. Is data decision-ready?

**Partially — not enough to pick a code ticket with confidence.**

| Question | Answer |
| --- | --- |
| Where do users drop off? | **Billing view → selection/checkout** is the strongest signal; **checkout → unlock** is second. |
| Is Android billing proven? | **6 all-time verified unlock events** exist in telemetry, but **0 unlocks in 30d recent window**; real-device Play proof checklist still not validated in this pass. |
| Is ads → app measurable? | **No** — need GA4 sessions + fixed `app_opened` tracking. |
| Can we scale ads? | **No** — per prior audit + missing GA4/Ads import confirmation. |

---

## 11. Top 3 next actions

1. **Unblock local reports** — release `esbuild.exe` lock, run `npm ci`, then `report:google-growth-summary` + `report:google-conversion-readiness` to fill GA4 7d/30d sessions and Ads impressions/clicks/conversions.
2. **Android Play billing proof** — real-device checklist (`docs/public-launch-readiness.md`); confirm at least one fresh `pro_unlock_verified` attributable to Play (not test noise).
3. **Billing view → checkout diagnosis** — read-only: operator dashboard landing funnel + GA4 `billing_plan_viewed` vs `billing_plan_selected` by device/source; decide if next ticket is **upgrade clarity/trust** (views without selection) vs **checkout proof** (starts without unlock).

---

## 12. Recommended next ticket (from decision matrix)

| Signal observed | Next ticket |
| --- | --- |
| Billing views (122) >> selections (19) | **Pricing/trust/upgrade clarity** — users see plan UI but do not select |
| Checkout starts (13) >> unlocks (6) | **Billing/checkout proof** — payment flow not completing |
| `app_opened` missing; GA4 unknown | **Run GA4 snapshot first** before landing/launcher code |
| Android web traffic (unmeasured) | **Play/deep-link routing** — only after GA4 shows mobile web share |

**Pick today:** **Billing/checkout proof + upgrade clarity investigation** (read-only ops first: GA4 reports + operator dashboard), not pricing changes or deploys.

---

## 13. Commit / safety note

This file is the only intended tracked change from this pass. Do not commit existing dirty working-tree files.
