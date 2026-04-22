# NoteBill Revenue Roadmap

Updated: April 21, 2026
Status: working strategy, not a promise or forecast.

## Revenue Ambition
Build NoteBill into a focused, trustworthy app that can eventually support serious small-business revenue.

The practical milestone path:
- First proof: 10 active testers who can create and send invoices without help.
- First money proof: 5 paying users who keep using it after the first invoice.
- First business proof: $1k MRR from a narrow user segment.
- Strong indie milestone: $5k MRR with low support burden and clear retention.
- Larger target: $100k ARR, roughly $8.3k MRR, from a product people trust enough to keep paying for.

## Core Business Thesis
Solo operators do not pay for "AI." They pay when NoteBill reliably helps them:
- Capture work before they forget details.
- Turn rough notes into a professional invoice.
- Send faster.
- Follow up without awkwardness.
- Reuse what worked last time.
- Get paid with less admin drag.

The product should earn revenue by becoming the invoice operations loop, not by becoming bloated accounting software.

## Best Customer Wedge
Start narrow, then expand:
- Primary wedge: solo trades and home-service operators who invoice from phone notes after jobs.
- Secondary wedge: freelancers and contractors with repeat clients and recurring work.
- Avoid early broad positioning like "for every business." It sounds bigger but converts worse.

Good early-user language:
- "Turn messy job notes into invoices."
- "Send the invoice before you leave the driveway."
- "Never forget to follow up."
- "Billie helps, you approve the money."

## Paid Plan Hypotheses
Keep the free tier useful enough to build trust. Charge for workflows that save repeated time or help collect money.

Potential tiers:
- Free: limited saves/month, local or basic saved history, export PDF, sample notes, core invoice generation.
- Starter around $9/month: more saves, server sync, saved client details, repeat-invoice shortcuts.
- Pro around $19/month: unlimited reasonable usage, email sending, reminders, payment links, client/service memory.
- Power around $39/month: higher limits, diagnostics, richer automation, priority support, advanced brand/layout controls.

Pricing must be tested. Do not lock this in until real users show where value is felt.

## Revenue Features That Fit The Product
These are good because they strengthen the invoice loop:
- Multi-device account sync.
- Saved clients and service defaults.
- One-tap invoice-again for repeat jobs.
- Send invoice and reminder emails from NoteBill.
- Payment-link generation and paid/unpaid tracking.
- Reminder schedules with clear user control.
- Client-facing invoice/payment pages.
- Branded PDF themes with safe layout controls.
- Simple job-note history tied to invoices.
- Export/download archive for trust and portability.

## Features To Avoid Until Much Later
These are dangerous because they expand scope before the core loop is proven:
- Full accounting ledger.
- Tax filing or compliance claims.
- Bank feeds.
- Payroll.
- Inventory management.
- Multi-user permissions.
- Full CRM.
- Freeform Canva-style design before invoices/reminders are excellent.
- Autonomous money decisions.

## V2 Revenue Priorities
Revenue work should be sequenced around retention, not just paywalls.

1. Activation
- Make the first invoice feel excellent on mobile.
- Keep sample notes and starter flows visible.
- Reduce any Play/tester confusion before adding friction.

2. Retention
- Make the launcher answer "what needs attention today?"
- Surface stale drafts, stale sent invoices, repeat-client shortcuts, and unpaid balance.
- Make follow-up reminders feel helpful, not naggy.

3. Monetization
- Identify the first fair paid moment.
- Likely candidates: more monthly saves, server sync, email sending, reminders, payment links, and saved client memory.
- Never paywall money safety, export access, or trust basics.

4. Expansion
- Billie Workspace for safe wording and presentation help.
- Layout Studio Lite for professional branding without chaos.
- Better repeat-client memory and service suggestions.

## Metrics That Matter
Track these before optimizing growth:
- First invoice completed.
- First invoice saved.
- First PDF exported or invoice sent.
- User returns within 7 days.
- User creates a second invoice.
- User uses invoice-again, reminder, or payment status.
- User hits a free-tier limit after real value.
- Paid conversion after repeated use.
- Reminder/payment feature usage.
- Support/confusion reports per active user.

Current instrumentation:
- Revenue signals are first-party, aggregate counters shown in internal diagnostics.
- Tracked events include invoice generation, saves, second invoice saved, send, reminder, payment link, invoice-again, service-memory reuse, client-memory reuse, recurring schedule setup, checkout, and sign-in.
- Owner IDs are hashed before storage.
- Revenue signals must not store invoice text, customer names, customer emails, line items, amounts, or PDF content.
- Client memory should remain inspectable and clearable, because trust controls are part of the paid-value surface rather than an afterthought.

## Positioning Test Ideas
Possible landing page angles:
- Speed: "Invoice from messy notes in minutes."
- Money recovery: "Send and follow up until it is paid."
- Trust: "AI helps write it. You approve every money decision."
- Mobile field workflow: "Built for invoicing between jobs."

Best early experiment:
- Test whether "get paid faster" or "make invoices faster" gets stronger interest from real service operators.

## Moat Strategy
The moat is not generic AI parsing. The moat should become:
- Phone-first invoice workflow polish.
- Deterministic money guardrails users trust.
- Client/service memory that gets better with use.
- Fast repeat-invoice and follow-up loops.
- A brand voice that feels calm, practical, and built for real operators.

## 100k Path Check
Back-of-the-envelope paths to $100k ARR:
- 438 users at $19/month.
- 214 users at $39/month.
- 300 users blended around $28/month.

That means the app does not need millions of users. It needs a few hundred people who truly rely on it.

## Current Revenue-Sensible Next Moves
- Finish tester smoke passes and fix high-friction mobile issues.
- Keep improving the launcher command center because it drives return usage.
- Watch the diagnostics revenue signals before changing pricing or paywalls.
- Keep repeat-client memory useful but transparent; users should always know what is remembered and be able to clear it.
- Add clearer paid-plan boundaries only after the core loop feels strong.
- Build one narrow repeat-client workflow at a time.
- Make sending, reminders, and payment links feel like one simple system.
- Collect real tester quotes and objections for pricing/positioning.
