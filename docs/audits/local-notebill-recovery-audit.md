# Local NoteBill recovery audit

**Issue:** [#11](https://github.com/daveybehavey/Invoice/issues/11)  
**Status:** `BLOCKED_NO_LOCAL_MACHINE_ACCESS`  
**Date (UTC):** 2026-07-22  
**Agent run:** https://cursor.com/agents/bc-17079275-0d52-4643-8993-827194d175db  
**Risk:** Green (read-only) — no original working tree was available to inspect

## Executive finding

This dispatcher ran in a **Cursor Cloud sandbox**, not on David's Windows/WSL machine.

A fresh GitHub clone / cloud VM cannot inventory uncommitted, untracked, stashed, unpushed, orphan-branch, reflog, or duplicate-copy local NoteBill work.

**Issue #10 must pause** until a Cursor/local dispatcher with proven access to David's actual machine completes this audit. Continuing #10 from GitHub `main` alone risks overwriting or diverging from recoverable local work that this run could not see.

**Preservation source of truth:** unknown — not established. Do not treat cloud `main` as complete until local copies are inventoried.

## Environment proof (why blocked)

| Check | Result |
| --- | --- |
| Hostname | `cursor` |
| OS | Linux cloud VM (`6.12.94+`), not Windows/WSL |
| `/.dockerenv` | present |
| Cursor source | `automations` cloud agent (`usePrivateWorker: false`) |
| `/mnt/c`, `/mnt/wsl`, `/Users`, `%USERPROFILE%` paths | absent / empty |
| David's Windows/WSL project trees | not mounted, not reachable |
| Workspace | cloud clone of `daveybehavey/Invoice` at `/workspace` |

This matches the issue rule: if running only in a cloud sandbox or fresh clone, **stop immediately** and return `BLOCKED_NO_LOCAL_MACHINE_ACCESS`. No GitHub-only substitute audit was performed.

## Copy inventory

No local Windows/WSL NoteBill/Invoice copies were searchable from this environment.

The only tree present was the cloud workspace clone (GitHub remote). That clone was **not** treated as a David local original and was not used as a substitute inventory of local uncommitted work.

## Recoverable work inventory

Not available. Local uncommitted / unpushed / stash / reflog / duplicate-copy inventory requires machine access.

## Safe recovery plan (do not execute from cloud)

1. Re-run issue #11 from a **Cursor desktop / local / private-worker** dispatcher that can read David's Windows and WSL filesystems.
2. Prove local access (e.g. list `%USERPROFILE%` / `~/` project roots and at least one confirmed NoteBill path).
3. Read-only inventory every confirmed copy per the issue checklist.
4. Publish an updated sanitized report on branch `cursor/local-notebill-recovery-audit` (or a follow-up docs-only PR).
5. Only after David reviews the inventory: decide whether #10 may continue from GitHub `main` or must incorporate recovered local work first.
6. Any recovery copy/commit/stash/branch switch/merge/delete requires David's explicit approval.

## Issue #10 recommendation

| Question | Answer |
| --- | --- |
| May #10 continue from GitHub `main` now? | **No — pause** |
| Why? | Local recoverable work is unproven; #10 changes could diverge from or complicate recovery of unseen local work |
| Resume when? | After a successful local-machine audit (or David explicitly accepts the risk of proceeding without it) |

## Checks run

- Environment probes for Windows/WSL mounts and user home trees (read-only)
- Confirmed cloud agent identity via Cursor run/environment metadata
- Read issue #11 body + comments (author: `daveybehavey`)
- Read `AGENTS.md` from `origin/chore/ai-work-system-pilot`
- Confirmed issue #10 is open (stabilization from `main`)
- Attempted `gh issue comment` → **403** (integration lacks `issues:write`); durable report returned via this draft PR instead

## Evidence

Commands / probes used (sanitized):

- `uname -a`, `hostname`, `test -f /.dockerenv`
- `ls /mnt /mnt/c /mnt/wsl /Users` (no Windows/WSL user trees)
- Cursor `run-info`: source `automations`, `usePrivateWorker: false`
- `gh issue view 11` / `gh issue view 10`
- `git show origin/chore/ai-work-system-pilot:AGENTS.md`

## Risks or uncertainty

- Unknown whether valuable uncommitted NoteBill work exists on David's machine.
- Until local access succeeds, any claim that GitHub `main` is complete is unverified.
- Issue comment completion channel remains unavailable (403); this PR is the durable record.

## Files changed (this reporting checkout only)

- `docs/audits/local-notebill-recovery-audit.md` (this file)

No original local NoteBill working trees were modified (none were accessible).
