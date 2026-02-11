# AI Invoice Helper Roadmap

## Product North Star
AI feels like ChatGPT: powerful intake, explicit money decisions, and a safe editable draft.

## Now (1–2 days, high impact)
1. Post-generate AI edits
   - Add an "Edit with AI" drawer inside the manual invoice editor.
   - AI returns proposed changes + summary; user applies or discards.
2. Review step clarity
   - Review card shows only: Found, Decisions, Next step.
   - Details live behind the drawer.
3. Messy-input UX copy pass
   - Run 3 messy prompts and tighten wording only (no logic changes).

## Soon (low effort, high polish)
4. One-tap edit chips
   - Quick fixes like Change rate, Remove line item, Update client.
5. Decision wording simplification
   - "Include/Exclude" -> "Add/Skip".
6. "What I understood" micro-summary
   - One line after intake: "Captured 4 line items, 2 decisions."

## Later (nice polish / advanced)
7. Undo last decision
   - Allow quick rollback of the most recent decision action.
8. Saved rate preset (local)
   - Store last used hourly rate and offer it next time.
9. Decision grouping or pagination
   - Show one decision at a time when many exist.
10. Service period helper
    - Suggest date range when multiple dates appear.
11. Merge duplicate items suggestion
    - Detect similar parts and offer merge.

## Success Criteria (lean)
- Users can complete a messy intake without confusion.
- No money decisions happen without explicit confirmation.
- Post-generate edits feel safe and fast.
- Testing remains deterministic.

