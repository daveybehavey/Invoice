# V2 Billie Workspace Contract (Planning Draft)

Status: planning only. Not an active roadmap task.

## Product pillar
Billie Workspace positions NoteBill as an AI invoice co-pilot, not a separate chat tool.

## Goal
Let users build most of the invoice by chatting with Billie while seeing live draft updates in the same workspace.

## Assistant behavior rule
Billie proposes changes. The user always remains the final authority.

## Source-of-truth rule
The invoice draft is the only source of truth. Chat does not own state.
Billie emits structured patch objects, and only validated patches may apply to draft state.

## Internal model
Patch-based flow:
1. Billie suggests a patch.
2. Patch validator enforces guardrails.
3. Safe patch applies to draft.
4. UI highlights changed rows/fields.
5. Single-level undo stores the exact pre-patch snapshot.

Patch application should complete in under 300ms after the model response arrives.

## Patch boundaries
Billie patches may modify:
- Line-item description text.
- Notes and terms text.
- Non-money grouping/ordering presentation, only with explicit user notice.

Billie patches may NOT modify:
- Quantity.
- Unit price/rate.
- Tax settings.
- Subtotal/total math.
- Invoice number.
- Client identity.
- Business identity defaults.

## Money edit policy
Money-impacting requests must convert to structured decision controls (not freeform patch apply).

## Workspace UX contract
- Desktop: split workspace (Billie + live draft).
- Mobile: single workspace with mode switch (Chat, Draft, Decisions) and persistent composer.
- Action chips are first-class (`Refine wording`, `Simpler`, `More formal`, `Stronger`, etc.).
- Keep invoice preview primary; chat is assistive.

## Trust signals
- Show badge on safe text-only patch: `Numbers unchanged`.
- Show badge on blocked money request: `Money decision required`.
- Every patch supports `Undo last change`.

## Patch integrity rules
- Patches must be idempotent; applying the same patch twice must not compound changes.
- MVP undo depth is single-level only; undo restores the previous snapshot and does not revert separate manual edits.
- Change highlighting is transient and clears after 1-2 seconds.

## Failure modes
- Validation failure: `No changes applied.`
- AI timeout/error: draft stays unchanged; user can retry.
- Money-edit suggestion: do not patch; route to decision card.

## MVP scope (first slice only)
- Persistent Billie composer in workspace.
- Action chips above freeform input.
- Live preview updates with lightweight change highlight.
- Undo last Billie patch.
- Guardrail enforcement + failure handling.

Not in first slice:
- Full diff panel.
- Multi-step patch history UI.
- Autonomous auto-apply behavior.

## Acceptance criteria
1. User can complete messy-to-ready flow without leaving workspace.
2. Draft remains the single source of truth in all states.
3. Zero silent money mutations in tests.
4. Undo reliably reverts the last Billie patch.
5. Median time-to-ready improves for common messy inputs.

## Must not become
- Endless chat transcript with weak actionability.
- Dual state ownership between chat and draft.
- Casual free-text money edits without explicit controls.
