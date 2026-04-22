# Technical North Star

## Product Identity

### Target users
- Solo service providers who invoice from messy notes:
- Tradespeople (plumbing, electrical, HVAC, handyman, cleaning, etc.).
- Freelancers/independent contractors (design, web, consulting, media, etc.).

### Core promise
- Turn messy notes (text, photo, PDF) into a client-ready invoice quickly, with full user control over money decisions.

### Non-goals (explicitly out of scope for now)
- Full accounting or bookkeeping suite.
- Inventory/expense management.
- CRM/client lifecycle management.
- Team collaboration and role permissions.
- Banking, lending, payroll, or financial account management.
- Fully autonomous AI invoicing without user review.

## Product Principles

1. Deterministic money, AI-assisted language
- AI can parse/suggest/rewrite wording.
- Financial math, totals, and readiness gates must remain deterministic.

2. User authority on money decisions
- No tax, billing, discount, or pricing decision is finalized without explicit user action.
- Ambiguous input must stay unresolved.

3. Minimal cognitive load
- Mobile-first progressive disclosure.
- Show one primary next step at a time.
- Reveal details only on demand.

4. Preserve editability
- Generated draft is always editable.
- Post-generate "Edit with AI" may rewrite text but cannot silently mutate money.

## Canonical State Rules

### Canonical invoice state owns truth
- UI phase is a representation, not the source of truth.
- Readiness and gating derive from canonical state.

### Readiness contract
- A single readiness evaluator should drive:
- phase transitions
- generate-button state
- review status messaging

### Mutation rules
- All invoice mutations pass through the invoice pipeline/contract.
- No direct ad-hoc money mutation from UI widgets.

## Platform Direction

### Near-term
- Cloudflare-hosted web app remains the primary production surface.
- Android wrapper supports Play Console testing and store distribution.
- Keep one core product flow shared across web and Android.
- Keep flows mobile-first while preserving desktop usability.

### Mid-term
- Improve app-store release cadence, crash mapping, and tester feedback loops.
- Continue packaging work only when it preserves the shared web/app core.

## Data, Auth, and Persistence Direction

### Current state
- Local file-backed storage is acceptable for local/dev only.
- Production direction is server-side persistence, verified email-link auth, and provider-backed email delivery.
- Hosted payment links are optional invoice workflow features; NoteBill is not a banking, lending, or accounting product.

### Target state
- Per-user server-side persistence (Postgres/Supabase class architecture).
- User authentication (magic-link or equivalent low-friction auth).
- Multi-device continuity for saved invoices.
- Operational diagnostics for billing, delivery, AI, persistence, reminders, and Android releases.
- Privacy-conscious revenue diagnostics that track workflow milestones without invoice/customer content.

## Monetization (provisional)

- Free tier with practical usage limits.
- Paid tier for unlimited/higher limits and advanced workflow features.
- Do not block core trust/safety behavior behind paywalls.
- Revenue strategy lives in `docs/revenue-roadmap.md`; engineering choices should support retention before aggressive monetization.
- Paid features should map to repeated operational value: sync, saved memory, sends, reminders, payment links, and advanced workflow polish.
- The first serious revenue target is not mass scale; it is a few hundred loyal users with low support burden.
- Do not add aggressive paywalls before activation and repeat-use signals show where users actually feel value.

## Roadmap Guardrails

- Prioritize trust and determinism before UX polish flourishes.
- Avoid feature creep that increases cognitive load.
- Keep a hard boundary between AI interpretation and financial state authority.
- Add telemetry for funnel friction and unresolved-decision pain points before broad growth features.
