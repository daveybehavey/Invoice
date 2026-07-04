# NoteBill Revenue / Readiness Audit

**Date:** 2026-07-04  
**Mode:** Read-only / docs-only (no production, pricing, ads, or code changes)  
**Auditor:** Cursor agent (revenue/readiness pass)

## Repo located

| Field | Value |
| --- | --- |
| **Path** | `C:\Users\david\Desktop\Invoice` |
| **Product name** | NoteBill (package `invoice`, GitHub `daveybehavey/Invoice`) |
| **Candidates checked** | `C:\Users\david\Desktop\notebill` — not found; `C:\Users\david\Desktop\NoteBill` — not found |
| **Branch** | `main` @ `cbefed3` |
| **Remote** | `https://github.com/daveybehavey/Invoice.git` |
| **Working tree** | **Heavily dirty** — many modified and untracked files; **153 commits ahead of `origin/main`** |
| **Safe scripts run** | `git status`, `git log -5`, `git branch -vv`, `git remote -v` |
| **Skipped** | `npm run report:google-growth-summary` — `node_modules` present but incomplete (`dotenv` missing); per constraints, no `npm install` |

> **Deploy drift risk:** Production may not reflect the local tree. Any funnel or billing behavior inferred from the working copy should be validated against the live build before spending more on ads.

---

## What does NoteBill sell?

NoteBill is a **mobile-first AI invoice app** for solo service businesses (contractors, cleaners, handypeople). The wedge is **rough notes → clean invoice → send / follow up / get paid**, not generic “AI makes invoices.”

| Tier | Includes | Monetization surface |
| --- | --- | --- |
| **Free** | Create from Billie AI, scratchpad, import, or manual editor; review/edit; PDF export; open saved invoices; guest mode; **limited new saves/month** (25 in production per `accountPlanPolicy.ts`) | No payment required |
| **Pro** | Unlimited saves; send from NoteBill; reminders; hosted payment links; client portal; client/service memory; repeat-work shortcuts | **Google Play** on installed Android; **Stripe** on desktop/web |

Recommended positioning (from `docs/paid-boundary-v1.md`, `docs/public-launch-packet.md`):

- **Free:** draft, review, export  
- **Pro:** save more, send, remind, get paid, reuse  
- **Pricing shape (not locked publicly):** ~$19/mo Pro + optional lifetime

---

## Current primary conversion path

```text
Paid search / SEO landing page
  → app.notebill.app (launcher or intent URL)
    → Start invoice (AI intake / manual / import)
      → Draft + export (free, no paywall)
        → Save invoice (counts toward monthly free limit)
          → Hit save limit OR want Pro-only actions (send, reminders, payment links)
            → Upgrade prompt
              → Android native: Google Play purchase / restore
              → Web/desktop: Stripe Checkout
              → Android mobile browser: blocked — “open installed app” guard
```

**Lanes (documented in `docs/google-growth-ops.md`):**

1. **Web revenue lane** (`NB | Mobile` / Search) — truth signal: `pro_unlock_verified`  
2. **Android install lane** — separate goals; must not be mixed with web revenue optimization

---

## Where users could drop off

| Stage | Risk | Evidence |
| --- | --- | --- |
| **Landing → app open** | Ad/SEO traffic lands on SEO pages but never opens the SPA workflow | Operator dashboard tracks `billing_plan_viewed`, `app_opened`, `first_app_opened`; funnel exists but live counts not pulled (growth report blocked locally) |
| **First value before pay** | Free tier allows substantial use (25 saves/mo) before upgrade | `resolveFreeMonthlySaveLimit()` → 25 in production; paywall is **late** in the loop |
| **Guest mode** | Users can invoice without signing in; billing/account attachment delayed | Launcher supports guest mode; sign-in deferred |
| **Android browser from ads** | **Cannot upgrade in mobile web** — must install/open Play app | `getBillingEnvironment()` → `android-browser` mode disables Stripe; shows installed-app guard |
| **Platform mismatch** | Search ads may send **web** users while **primary Android monetization is Google Play** | `public-launch-readiness.md` requires Play billing proof on real device before hard paid acquisition |
| **Billing proof gate** | Docs explicitly say hold meaningful ad spend until Play purchase/restore/unlock works on device | Checklist in `docs/public-launch-readiness.md` |
| **AI intake friction** | Labor pricing follow-ups, readiness locks before generate | `README.md`, intake readiness telemetry |
| **Trust / positioning** | Schema.org `offers.price: "0"` on SEO pages; Pro price not on landing HTML | `public/invoice-app-for-contractors` (extensionless HTML file) |
| **Deploy lag** | 153 unpushed commits — live site may lack latest launcher/billing UX | `git branch -vv` |

---

## Is pricing clear?

**Partially, inside the app; weakly on cold-traffic surfaces.**

- Launcher plan strip explains monthly vs lifetime when plan actions are opened (`launcherSections.jsx`).
- `docs/paid-boundary-v1.md` recommends ~$19/mo but says **do not lock publicly** until payment proof is stronger.
- SEO landing pages use structured data with **$0 offer** only; no visible Pro price on the static HTML shell.
- `docs/public-launch-packet.md` says lead with workflow, then simple monthly/lifetime choice — good copy guidance, unclear if live traffic sees it before signup.

**Verdict:** A cold ad click may understand “free invoice app” better than “why pay $19/mo and when.”

---

## Is payment / upgrade flow clear?

**Yes on native Android and desktop web, with a known hole on Android browser.**

| Environment | Upgrade path | Clarity |
| --- | --- | --- |
| Android native (Capacitor) | Google Play subscription + lifetime; restore purchases | Documented; real-device proof still required |
| Desktop / web | Stripe Checkout + billing portal | `stripe-web` mode in `billingActions.js` |
| Android mobile browser | **No checkout** — redirect to installed app | Explicit guard in intake, library, inspector |

Billing signals tracked: `billing_plan_viewed`, `billing_plan_selected`, `checkout_started`, `pro_unlock_verified` (`billingActions.js`, `revenueAnalytics.js`, operator dashboard).

---

## Is tracking good enough to diagnose traffic → use → payment?

**Architecture is strong; operational readout was not verified in this pass.**

| Layer | Status |
| --- | --- |
| **GA4** | Documented live on `notebill.app`, `app.notebill.app`, `www.notebill.app` (`docs/google-growth-ops.md`) |
| **Server revenue signals** | `POST /api/telemetry/revenue-signals` + `revenueSignalsStore.ts` |
| **Operator dashboard** | Landing funnel report: landing → proof → CTA → app open → draft → checkout → unlock (`operatorDashboard.jsx`) |
| **CLI digest** | `npm run report:google-growth-summary`, `report:google-conversion-readiness`, Ads campaign scripts |
| **Key events** | `pro_unlock_verified`, `checkout_started`, `billing_plan_selected`, `account_signed_in`, `purchase` (GA4/Ads) |

**Gaps:**

- Could not run growth/conversion reports locally (broken `node_modules`).
- Funnel depends on owner-key attribution; guest users may fragment identity until sign-in.
- `docs/google-growth-ops.md` warns against mixing web revenue and install campaigns — misaligned Ads goals could optimize clicks without purchases.

**Before changing code, measure:**

1. 30-day GA4: sessions, top pages, event counts (`report:google-growth-summary`)
2. 7-day conversion readiness: which launch events GA4 has seen (`report:google-conversion-readiness`)
3. Operator dashboard funnel by UTM source/campaign for paid traffic
4. Count of `pro_unlock_verified` vs `billing_plan_viewed` vs `checkout_started`
5. Google Ads: impressions/clicks/spend vs imported `purchase` / `SUBSCRIBE_PAID` conversions
6. Play Console: install → first open → subscription attempts (Android lane)

---

## Obvious trust / positioning issues

1. **“AI invoice app” without collections proof** — paid value is send/remind/get paid; free tier already delivers a credible first invoice.
2. **$0 schema on SEO pages** — accurate for entry offer, may attract template/free seekers (negatives exist in GTM plan but traffic quality unknown).
3. **Android browser dead-end for upgrades** — high risk if mobile Search ads land on web URL instead of Play listing.
4. **Billing proof not closed** — `public-launch-readiness.md` gates aggressive promotion; spending on ads before proof is a documented anti-pattern.
5. **Repo ahead of remote by 153 commits** — external perception may lag internal readiness docs.

---

## Files inspected (representative)

| Area | Paths |
| --- | --- |
| Positioning / GTM | `docs/paid-boundary-v1.md`, `docs/public-launch-readiness.md`, `docs/public-launch-packet.md`, `docs/go-to-market-plan.md`, `docs/no-network-growth-plan.md`, `docs/north-star-roadmap.md`, `docs/google-growth-ops.md`, `docs/google-conversion-quickstart.md` |
| Billing / plans | `public/utils/billingActions.js`, `public/utils/accountPlan.js`, `src/services/stripeBilling.ts`, `src/services/accountPlanPolicy.ts` |
| Analytics | `public/utils/revenueAnalytics.js`, `public/utils/googleAnalytics.js`, `public/features/settings/operatorDashboard.jsx` |
| Conversion surfaces | `public/features/launcher/launcherSections.jsx`, `public/launcher.jsx`, `public/features/intake/aiIntake.jsx` |
| SEO | `public/sitemap.xml`, `public/invoice-app-for-contractors` (landing HTML), sibling intent URLs in `public/` |
| Growth scripts | `scripts/report-google-growth-summary.mjs`, `scripts/report-google-conversion-readiness.mjs`, `package.json` scripts |
| Project meta | `README.md`, `package.json` |

---

## Biggest revenue / readiness concern

**Paid traffic is likely arriving, but the monetization path is split (web Stripe vs Android Google Play) with a known Android-browser upgrade dead-end, a late paywall (25 free saves), and documented requirements for real-device Play billing proof before scaling ads — while local repo is far ahead of `origin/main`, so live behavior may not match the documented launch gates.**

Impressions without paid users is consistent with: clicks → free draft/export → no save-limit pressure → no checkout, **or** mobile web traffic that cannot complete Play billing, **or** Ads optimizing on funnels that never reach `pro_unlock_verified`.

---

## Top 3 smallest next tickets

### 1. Revenue funnel snapshot (read-only ops, no code)

**Goal:** Quantify where traffic dies.

```bash
cd C:\Users\david\Desktop\Invoice
npm ci   # only if/when deps repair is explicitly approved
npm run report:google-growth-summary
npm run report:google-conversion-readiness
```

Plus operator dashboard landing funnel (7d / 30d) filtered by `utm_source=google` / paid campaigns.

**Done when:** Table shows sessions → `app_opened` → `first_draft_started` → `billing_plan_viewed` → `checkout_started` → `pro_unlock_verified` with counts.

### 2. Android Play billing proof on a real device (checklist only)

**Goal:** Close the gate in `docs/public-launch-readiness.md` before more ad spend.

Run the real-device checklist: install from Play → Google sign-in → upgrade opens **Play not Stripe** → purchase or restore → Pro unlock → no verification errors.

**Done when:** Checklist signed off; at least one real `pro_unlock_verified` from Play attributable in dashboard/GA4.

### 3. Mobile web upgrade path decision (docs + smallest UX ticket if needed)

**Goal:** Resolve Android-browser dead-end for paid Search traffic.

Options to decide (no implementation in this audit):

- Route mobile ads to Play Store listing / app deep link instead of web final URL, **or**
- Add one clear “Install NoteBill to upgrade” CTA with campaign-specific landing, **or**
- Accept web-only Stripe on mobile (product/policy decision; currently disabled).

**Done when:** Written decision + one campaign URL test showing upgrade intent is not blocked.

---

## What not to do yet

- Increase ad spend or broaden keywords (`docs/public-launch-readiness.md`, `docs/go-to-market-plan.md`)
- Change pricing or Stripe/Play products
- Ship code from the dirty 153-commit local tree without a deliberate release cut
- Treat impressions as success without `pro_unlock_verified` / `purchase` on the web revenue lane

---

## Related StarMapCo context (passive)

StarMapCo STAR-006 checkout-origin diagnostic is in **daily observation only** until ≥5 non-smoke labeled sessions (`browser` + `missing`). NoteBill is the **active** revenue investigation workstream.
