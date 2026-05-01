# NoteBill Roadmap Implementation Matrix

Updated: May 1, 2026
Purpose: show what is implemented, partially implemented, or not started so roadmap decisions stay grounded in product reality.

## Snapshot
- Core checklist status: 18 of 34 top-level items done in `docs/now-next-later-checklist.md`.
- Product reality is ahead of the checklist in a few places, especially Billie Workspace, repeat-work memory, Layout Studio Lite, legacy import, and diagnostics.

## Implemented
| Area | Priority | Status | Notes |
| --- | --- | --- | --- |
| Core notes-to-invoice flow | High | Implemented | Rough notes to structured draft, review, generate manual invoice, save, reopen, export PDF. |
| Launcher activation path | High | Implemented | Sample notes, first-invoice nudge, command center, repeat-invoice shortcut. |
| Send and follow-up loop | High | Implemented | Send, reminders, statuses, open-balance-aware cues, mark paid, reminder presets. |
| Payment-link and client portal basics | High | Implemented | Hosted payment link generation, tokenized public portal, safer public response shape. |
| Memory controls | High | Implemented | `/settings/memory`, client deletion, recurring cadence memory, service catalog page. |
| Reminder diagnostics and revenue signals | High | Implemented | Aggregate signals, paid-plan readiness recommendation, diagnostics notes. |
| Tester/feedback tooling | Medium | Implemented | In-app Feedback page, device details capture, tester packet docs, smoke/tester workblocks. |
| Capture helpers | Medium | Implemented | Voice notes, receipt capture, time capture, deposits, retainers, trade templates. |

## Partial
| Area | Priority | Status | Notes |
| --- | --- | --- | --- |
| Billie Workspace | High | Partial | Persistent composer, chips, safe rewrites, blocked money edits, undo, transient highlight live. Still needs a more unified co-pilot flow across review and manual surfaces. |
| Service memory and repeat work | High | Partial | Saved service catalog, same-client suggestions, rate suggestions, recommended saved work, and "last time you billed..." context in manual and intake review are live. Still needs stronger recurring/repeat orchestration. |
| Layout Studio Lite | Medium | Partial | Style presets, accent color, header layout, spacing density, logo visibility, notes visibility already ship. Still lacks a deliberate named layout-studio surface. |
| Legacy import and AI cleanup | Medium | Partial | Legacy import path and editable imported text are live. Richer old-invoice ingestion and more robust cleanup workflow remain open. |
| Observability dashboards and alerts | Medium | Partial | Diagnostics and readiness recommendations are live. Operator-facing dashboards and alert delivery are still open. |
| Low-risk modularization | Medium | Partial | Some large surfaces are still orchestration-heavy, but targeted modular work is happening behind tests. |

## Not Started
| Area | Priority | Status | Notes |
| --- | --- | --- | --- |
| Paid workflow boundaries | High | Not started | First fair paid moment is still a product decision, not a locked implementation. |
| Offline/background sync | High | Not started | No conflict-handling sync layer yet. |
| iOS release track | Medium | Not started | Android-first still. |
| Team or multi-user support | Medium | Not started | Product remains solo-operator focused. |
| Multi-currency / broader tax rules | Medium | Not started | Current tax handling is intentionally narrow and deterministic. |
| Rich push notifications | Medium | Not started | Browser reminder groundwork exists, but broader push delivery does not. |
| Large automation rules / batch actions | Medium | Not started | Current automation is still bounded to follow-up and reminder flows. |
| Help center / support docs | Low | Not started | Support route exists, but fuller help content is still ahead. |

## Best Next Product Lanes
1. Billie Workspace: make review and manual editing feel like one guarded co-pilot experience.
2. Repeat-work loop: strengthen recurring and repeat-work suggestions without auto-changing money.
3. Paid boundaries: wait for tester behavior, then define the first fair upgrade wall.
