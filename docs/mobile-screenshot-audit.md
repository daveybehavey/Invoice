# Mobile Screenshot Audit

Goal: identify the exact live mobile screens that should become App Store screenshots and make sure they look clean enough to ship.

## Audit rules

1. Use the current live mobile web build.
2. Prioritize the shortest path from rough notes to a send-ready invoice.
3. Avoid screenshots that show developer scaffolding, blank states, or crowded secondary controls.
4. Favor one primary action per screen.
5. Keep the story focused on getting paid, not on explaining the product category.

## Golden path to audit

Run the flow in this order:

1. Launcher
2. Quick AI invoice
3. Draft review
4. Manual edit or money review
5. Send-ready state
6. Client statement / follow-up
7. Repeat-work / library reuse

## Exact screens to capture

### 1. Launcher / entry screen

What to check:
- Is the first action obvious?
- Does the page immediately say Billie drafts fast and the user approves the money?
- Is the page free of crowding on mobile?

What to avoid:
- generic dashboard-heavy visuals
- too much pricing noise before the action
- any screen where the user has to guess where to start

### 2. Quick AI invoice

What to check:
- Paste notes prompt is obvious
- The mode feels faster than the guided wizard
- The action button is obvious
- The screen does not feel blocked by secondary UI

What to avoid:
- extra onboarding scaffolding
- crowded helper bars
- any bottom sheet hiding the main action

### 3. Draft review

What to check:
- The draft feels like a real invoice draft, not a blank form
- Money review is clear
- The next action is obvious

What to avoid:
- ambiguous states like "Needs your call"
- too many competing actions

### 4. Manual edit or money review

What to check:
- Edit controls are visible but not overwhelming
- The invoice can be finalized without confusion
- The user can still see the big picture

What to avoid:
- dense controls stacked too tightly
- scroll traps on small phones

### 5. Send-ready state

What to check:
- clear send/export path
- branded output looks polished
- the app feels like it helps finish the work

What to avoid:
- half-finished or debug-looking screens
- low-contrast button clusters

### 6. Client statement / follow-up

What to check:
- statement status is readable at a glance
- follow-up action is obvious
- repeat collections work feels calm and deliberate

What to avoid:
- walls of text
- unclear terms
- hidden primary action

### 7. Repeat-work / library reuse

What to check:
- the screen communicates memory and speed
- the next action is obvious
- the page still feels light on mobile

What to avoid:
- empty or confusing list states
- overloaded filters or chips

## Mobile devices to verify

At minimum, check these viewport classes:

1. Small phone
2. Large phone
3. Landscape phone

If possible, also confirm:

1. tablet portrait
2. tablet landscape

## Pass criteria

The app is screenshot-ready when:

1. Each screen has one clear primary action
2. No main action is blocked by sticky UI
3. No critical screen feels crowded
4. The product story is obvious without explanation
5. The screenshots make the app feel like a money-moving workflow, not a generic AI tool

## Recommended next step after the audit

Pick the best 5 to 7 screens from this flow and use them for App Store screenshots and future launch assets.
