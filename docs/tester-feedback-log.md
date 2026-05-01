# NoteBill Tester Feedback Log

Use this during Android closed testing. Keep each issue small and actionable.

## Summary

- Test round:
- Build/version:
- Test window:
- Number of testers invited:
- Number of testers opted in:
- Number of testers who completed core flow:
- Feedback channels used: in-app Feedback page, email, direct message, or other

## Daily Snapshot

Use one short row per day during the active closed-test window.

| Date | Active Play build/version | New feedback count | New blocker/major count | Main pattern | Action taken |
| --- | --- | ---: | ---: | --- | --- |
|  |  |  |  |  |  |

## Workblock Rollup

Use this to see where testers are getting stuck without rereading every note.

| Workblock | Pass count | Blocker / major count | Common friction | Decision |
| --- | ---: | ---: | --- | --- |
| 1. Install/open |  |  |  |  |
| 2. First invoice |  |  |  |  |
| 3. Save/reopen/export |  |  |  |  |
| 4. Optional operations |  |  |  |  |
| 5. Feedback capture |  |  |  |  |

## Issue Log

| ID | Date | Tester/device | Channel | Workblock | Flow | Severity | What happened | Expected | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-001 |  |  | In-app feedback | 1. Install/open | Install/open |  |  |  | Open |

## Intake Template

```text
Tester/device:
Android version:
Build/version:
Workblock:
Severity:
What happened:
Expected:
Screenshot/video:
Can reproduce? Yes / No / Not sure
```

## Severity Guide

- `Blocker`: Tester cannot install, open, create, save, reopen, or export.
- `Major`: Tester completes the flow but with serious confusion or trust risk.
- `Minor`: Rough visual/copy/interaction issue that does not block completion.
- `Nice-to-have`: Product idea or preference.

## Flow Tags

- `Install/open`
- `Onboarding`
- `AI intake`
- `Review`
- `Manual editor`
- `Library`
- `PDF export`
- `Sign-in`
- `Send/reminder`
- `Payment`
- `Performance`
- `Visual/mobile`

## Decision Rules

- Fix all blockers before expanding v2 scope.
- Fix major trust/money issues before public release.
- Batch minor copy/layout issues unless they affect the primary mobile path.
- Keep screenshots with the issue ID when possible.
- If three testers hit the same minor issue, treat it as a major clarity issue.
- If no blocker or major issue appears, prefer keeping the tested build stable while the 14-day clock runs.
