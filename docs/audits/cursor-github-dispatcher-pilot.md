# Cursor GitHub Dispatcher Pilot (Issue #3)

**Date:** 2026-07-13 (UTC)  
**Mode:** Green — docs-only pilot evidence  
**Issue:** https://github.com/daveybehavey/Invoice/issues/3  
**Automation:** Cursor GitHub Dispatcher (`4ed9dde2-7d77-11f1-ba66-0e7d0216e441`)  
**Agent run:** https://cursor.com/agents/bc-e01bdac8-a529-4fa7-a01b-cd943eb222bc  
**AGENTS.md source:** `origin/chore/ai-work-system-pilot` (not yet on `main`)

---

## 1. Outcome

Document that NoteBill is connected to Cursor Automations, that a trusted `/cursor-run` path works, and that Cursor can return reviewable work through a branch and draft pull request without writing to `main`.

## 2. Required-field check (issue #3)

| Required item | Present in issue #3 |
| --- | --- |
| Outcome | Yes |
| Scope / Context | Yes (`Context` + `Done when` + `Do not`) |
| Risk level | Yes — Green for setup and docs-only pilot |
| Acceptance criteria | Yes (`Done when`) |
| Prohibited actions | Yes (`Do not`) |
| Required evidence | Yes (`Evidence required`) |

Issue body author: `daveybehavey`. Content is consistent with `AGENTS.md`.

## 3. Trusted trigger evidence

| Item | Value |
| --- | --- |
| Repository | `daveybehavey/Invoice` |
| Trusted actor | `daveybehavey` only |
| Trigger phrase | `/cursor-run` on a GitHub issue comment |
| Smoke-test issue | [#6](https://github.com/daveybehavey/Invoice/issues/6) (closed) |
| Smoke-test result | `DISPATCHER_OK`; no files, branches, PRs, deploys, secrets, or external settings changed |
| Status comment that requested this PR validation | [#issuecomment-4960482951](https://github.com/daveybehavey/Invoice/issues/3#issuecomment-4960482951) |

## 4. Operating decision (from David)

Because the Cursor Automation GitHub integration cannot currently post issue comments (`403 Resource not accessible by integration`):

- Implementation tasks return through a branch and draft PR.
- Read-only investigations that need a durable return record add a report under `docs/audits/` and open a draft PR.
- Do not broaden GitHub permissions until the PR-based loop is proven insufficient.

This document and its draft PR are the next validation named in that decision: a bounded Green-risk task that creates a draft PR for ChatGPT review and one revision request.

## 5. What this pilot PR changes

| Path | Change |
| --- | --- |
| `docs/audits/cursor-github-dispatcher-pilot.md` | Added (this file) |

No application code, config, secrets, Ads, Stripe, Google Play, pricing, billing, or production settings were modified.

## 6. Done-when progress for issue #3

| Criterion | Status |
| --- | --- |
| Repo connected to Cursor Cloud Agents / Automations | Met — dispatcher automation enabled and waking on trusted comments |
| Trusted GitHub issue/comment trigger configured | Met — `/cursor-run` from `daveybehavey` |
| Only David's trusted GitHub account can trigger write-capable work | Met by policy; automation owned by `davidiheslop@gmail.com` |
| Agent creates a branch and PR rather than writing to `main` | Met by this PR |
| Agent includes summary, checks, risks, and evidence | Met in this audit + PR body |
| Green-risk docs-only test completes successfully | Met by this docs-only change |
| ChatGPT can inspect the PR and post one follow-up revision | Pending ChatGPT action after this draft PR exists |

## 7. Checks run

| Check | Result |
| --- | --- |
| Read issue #3 body + comments | Pass |
| Read `AGENTS.md` from `origin/chore/ai-work-system-pilot` | Pass |
| Confirm Green risk / docs-only scope | Pass |
| Confirm no deploy / secrets / Ads / Stripe / Play / billing actions | Pass |
| `git status` after edit | Only this audit file staged for commit |
| Automated app test suite | Not required for docs-only Green change; not run |

## 8. Environment limitations

- Issue-comment write via `gh` returns `403 Resource not accessible by integration`.
- Cursor Automation Tools MCP can open/comment on pull requests, not issues.
- `AGENTS.md` lives on `chore/ai-work-system-pilot` (draft PR #1) and is not yet merged to `main`.
- This agent branch must not be merged without David's explicit approval.

## 9. Risks / uncertainty

- The status comment that advanced this pilot mentioned `/cursor-run` in reference to issue #6; this run treats David's explicit “next validation: … draft PR” instruction on issue #3, plus the issue’s Green pilot acceptance criteria, as authorization for this docs-only PR.
- ChatGPT revision-request loop is not proven until a follow-up comment lands on this PR and a second Cursor pass addresses it.
- Broader GitHub issue-write permission remains intentionally deferred.

## 10. Manual action still required

1. ChatGPT: review this draft PR and post one revision request through GitHub.
2. Cursor (on a later `/cursor-run` if needed): apply that revision on the same branch/PR.
3. David: approve merge of this PR and of PR #1 (`AGENTS.md`) when ready. Do not deploy from this work.
