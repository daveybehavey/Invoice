# NoteBill Play Console Privacy Fix — Checklist for David

Companion to the legal-docs cleanup PR (Terms/Privacy 2026-10-20.1). The repo
changes remove the residential street address and the extra contact emails
from the served legal documents and the in-app Support page. The items below
can only be done by the account owner in Play Console — nothing here has been
changed yet.

## A. Developer contact details shown publicly

The Play listing's "About the developer" / "App support" sections currently
publish personal contact details (legal name, personal email, home street
address, personal phone). Work through:

- [ ] **Listing support email** — Play Console → your app → Grow → Store
      presence → Main store listing → Contact details: set the support email
      to `support@notebill.app` (the single standardized address; it is the
      only address the app's contact flows, legal documents, and support
      pages now publish).
- [ ] **Contact website** — same screen: set the website to
      `https://notebill.app` (or the support page) if it points anywhere
      personal.
- [ ] **Developer account contact email** — Play Console → Settings →
      Developer account: the email shown publicly for the developer should
      also be `support@notebill.app`.
- [ ] Remove the personal phone number from any listing/account field that
      shows it publicly. NoteBill has no public phone contact anywhere in the
      product — the listing should match that.

### Decision needed: developer postal address + developer name

The developer **postal address** is an account-level field, not a per-app
listing field, and Google displays it publicly for personal (individual)
developer accounts. It cannot simply be deleted. Options — your call:

1. **Convert to an organization account.** Requires a D-U-N-S number and
   organization documentation. The public developer name becomes the
   organization name (e.g. EuroDigital) and the address becomes the
   organization's address. Cleanest end state; most paperwork; account-type
   changes are effectively one-way and re-trigger identity verification.
2. **Use a business / virtual mailing address.** Rent a real, deliverable
   business address (e.g. a Victoria virtual-office or mailbox service that
   permits use as a business address) and put that on the account instead of
   the residential address. Small monthly cost; the address is still public,
   but it is not your home.
3. **Leave as-is.** Zero effort, but the residential address stays publicly
   displayed on the listing for as long as the account is a personal account
   with that address on file.

Whichever option you pick also settles the related repo item: the current
Terms (section 13, notices) still carries the full postal address because a
notices clause needs a deliverable postal address. Once a business mailing
address exists, that line can be swapped in a follow-up legal version bump.

## B. Replace screenshot 3 (signed-in personal email visible)

One of the current phone screenshots shows the app's Account row signed in
with a personal email address. Replace it with a demo-data capture:

- [ ] In the app, sign in with a demo/test account (or a state that shows no
      real account identity) and load demo invoice data — no real customer
      names, amounts, or email addresses in frame.
- [ ] Navigate to the same screen the current third screenshot shows, with
      the Account row visible, and confirm the row shows only the demo
      identity.
- [ ] Capture at the same resolution/aspect as the existing phone
      screenshots (see `marketing/play-store/` and
      `scripts/generate-play-store-assets.mjs` for the existing asset set).
- [ ] Play Console → Grow → Store presence → Main store listing → Phone
      screenshots: replace the third image in place (keep the ordering),
      then Save.
- [ ] Re-open the public listing afterwards and confirm no screenshot shows
      a personal email, name, or avatar.

## C. Support-email consistency pass on the listing

After the repo PR deploys, the served documents all publish exactly one
contact address: `support@notebill.app`. Make the console match:

- [ ] Main store listing → Contact details email = `support@notebill.app`.
- [ ] Search the full description, short description, and release notes for
      any other email address (older listings used a contact@ address and
      others) and replace every public mention with `support@notebill.app`.
- [ ] Policy → Privacy policy URL: confirm it points at the served policy
      (`https://app.notebill.app/privacy`). After the PR deploys, that page
      shows version 2026-10-20.1 with a locality-only address and the
      support@ contact.
- [ ] Policy → Data deletion URL: confirm it points at the served
      data-deletion page, which routes requests to the same support address.

## D. Final verification (after A–C and the repo deploy)

- [ ] Open the public Play listing (signed out / incognito): "About the
      developer" and "App support" show no personal email, no personal
      phone, and — once the section A decision is executed — no residential
      address.
- [ ] Open `https://app.notebill.app/privacy` and
      `https://app.notebill.app/terms`: privacy shows "Victoria, BC,
      Canada"; Terms §1 shows the locality address (the §13 postal line is
      the known exception pending the section A decision).
- [ ] Open the in-app Support page: the Contact section lists only the
      support email and the website.
