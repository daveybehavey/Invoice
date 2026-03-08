# Phase 1 Modularization Plan (`public/launcher.jsx`)

## Goal
- Reduce `public/launcher.jsx` size and coupling without changing behavior.
- Keep existing routes, flows, and readiness logic functionally identical.

## Constraints
- No product logic redesign in this phase.
- No readiness/decision behavior changes in this phase.
- No visual redesign in this phase.
- Each slice must be testable and revertible.

## Baseline Before Refactor

1. Confirm clean baseline checks:
- `npm test`
- `npm run test:ui`
- `npm run test:friction`

2. Capture current baseline artifacts:
- latest friction JSON: `docs/flow-friction-latest.json`
- quick screenshots of AI intake key states (paste/review/decision/ready)

## Extraction Strategy (ordered, low-risk first)

### Slice 1: UI primitives (lowest risk)
- Extract stateless, shared UI primitives:
- icons
- small presentational cards/buttons
- no stateful logic

Output targets:
- `public/ui/primitives.jsx`

### Slice 2: Pure helpers and formatting utilities
- Extract pure helper functions:
- string/date/number formatters
- deterministic text cleanup helpers
- no side effects, no network calls

Output targets:
- `public/utils/formatters.js`
- `public/utils/intakeHelpers.js`

### Slice 3: Intake view components
- Extract large presentational sections from AI intake page:
- review snapshot card
- decisions card
- confirmation/CTA block
- bottom-sheet/mobile nav sections

Output targets:
- `public/features/intake/ReviewCard.jsx`
- `public/features/intake/DecisionCard.jsx`
- `public/features/intake/GenerateBar.jsx`

### Slice 4: Intake state orchestration
- Extract intake state + handlers into a focused hook/module:
- request lifecycle
- transition dispatching
- route-level orchestration

Output targets:
- `public/features/intake/useIntakeController.js`

Note:
- Keep canonical readiness function shared/consistent with backend contract.
- If FE/BE readiness logic still duplicates, centralize in a follow-up slice.

## Regression Checklist Per Slice

1. Automated checks:
- `npm test`
- targeted UI test(s) for touched flow (`npm run test:ui`)

2. Manual smoke checks:
- clean baseline text input (no decisions)
- messy input with explicit decisions
- labor follow-up flow
- ready-to-generate unlock
- post-generate handoff to editor

3. Visual check:
- desktop + mobile state progression unchanged.

4. Safety check:
- no new path allows money decision auto-resolution.

## Definition of Done (Phase 1)

- `public/launcher.jsx` reduced substantially (target: < 50% of current line count).
- Extracted modules have clear boundaries:
- presentational vs orchestration vs pure helpers.
- Regression checks pass for every slice.
- No behavioral diffs in intake state machine outcomes.
