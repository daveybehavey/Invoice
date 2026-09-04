# NoteBill AI Work System Pilot

## Goal
Create a simple, reviewable loop where David plans with ChatGPT, work is dispatched through GitHub, Cursor or Codex implements it, and ChatGPT reviews the result before David approves consequential actions.

## Workflow

1. David and ChatGPT choose one outcome.
2. ChatGPT creates or updates a structured GitHub issue.
3. The issue is assigned to Codex Cloud or Cursor Cloud Agent.
4. The agent works on a dedicated branch and opens a pull request.
5. The agent supplies tests, logs, screenshots, or audit evidence as appropriate.
6. ChatGPT reviews the PR, commits, checks, and comments.
7. ChatGPT posts revision requests through GitHub when needed.
8. David approves or rejects merge, deploy, spending, billing, pricing, or other consequential actions.
9. The issue is closed with the final decision and next action.

## Tool responsibilities

| Tool | Primary role |
| --- | --- |
| ChatGPT | Planning, issue creation, review, prioritization, follow-up instructions |
| GitHub | Shared communication layer and permanent record |
| Codex Cloud | Primary autonomous repository implementation agent |
| Cursor Cloud Agent | Browser, visual, UI, debugging, and interactive implementation work |
| Local Cursor / Codex extension | Human-supervised local work |

## Standard issue structure

- Outcome
- Context
- Done when
- Evidence required
- Assigned agent
- Risk level
- Do not
- Human approval required

## Pilot sequence

### Pilot A — Codex
A Green-risk docs-only task that must:
- create a branch
- make only the requested documentation change
- open a PR
- report checks and assumptions
- accept one follow-up revision through GitHub

### Pilot B — Cursor
A Green-risk docs-only task that must:
- run as a Cursor Cloud Agent or Automation
- create a branch and PR
- provide a summary and evidence
- accept one follow-up revision through GitHub

### Pilot C — Real NoteBill task
Diagnose why Google Ads showed 0 impressions without changing campaigns, budgets, bidding, keywords, billing, pricing, or production systems.

## Success criteria

The pilot succeeds when:
- both agents can receive a structured GitHub task
- both return reviewable work through a PR or durable issue comment
- ChatGPT can inspect the result and send a revision
- David retains approval over merge and all Orange/Red actions
- the workflow reduces repeated explanation and local-machine dependence

## What is deliberately postponed

- custom MCP agent gateway
- direct autonomous deploys
- autonomous ad or billing changes
- multi-agent orchestration software
- broad production credentials

These should be considered only after at least five successful GitHub-mediated tasks.
