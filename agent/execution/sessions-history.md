---
id: sessions-history
title: Sessions History
type: execution
domain: governance
module: execution
tags: [sessions, history, audit]
priority: 3
---
# Sessions History

## Purpose

Maintain an append-only audit of agent execution sessions, their ownership, scope, outcome, and produced evidence.

## Ownership and Access

- **File Owner**: `coordinator`
- **Record Owner Rule**: each session has one accountable session owner.
- **Allowed Writers**: a session owner may append and finalize its own session record; `coordinator` may reconcile links and record superseding corrections.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: existing finalized rows are append-only; corrections require a new linked correction row.

## Update Triggers

- An authorized execution session starts.
- Session ownership, scope, task links, or blocking state changes.
- A session ends, fails, is cancelled, or hands work to another session.
- A correction to a finalized session record is approved.

## Status Model

- **Valid Outcomes**: `in-progress | completed | partial | blocked | failed | cancelled | corrected`
- `in-progress` requires an owner and at least one authorized task or governance scope.
- `completed` requires produced-output and evidence links.
- `partial` requires explicit remaining work.
- `blocked` requires a blocker ID.
- `failed` requires failure evidence and follow-up disposition.
- `corrected` must link the superseded session row.

## Relationships

- Active shared state: `.agent/execution/current-context.md`
- Task authority: `.agent/execution/task-board.md`
- Epic authority: `.agent/planning/epics.md`
- Runtime governance: `.agent/governance/`
- Runtime reports: `.agent/reports/`
- Commit traceability: `.agent/intelligence/git-nexus/`

## Conflict Handling

1. Do not edit or delete a finalized historical row.
2. Append a `corrected` row that identifies the disputed session ID.
3. Link the issue, decision, or change request resolving the conflict.
4. The coordinator synchronizes current context and task state when the correction affects active work.

## Forbidden Actions

- Do not rewrite or delete finalized session history.
- Do not record `completed` without output or evidence links.
- Do not omit failed, blocked, partial, or cancelled outcomes.
- Do not combine unrelated task scopes into one session record.
- Do not store secrets, credentials, personal data, or sensitive raw output.

## Session Records

| Session ID | Start Date | End Date | Owner | Task or Scope IDs | Outcome | Summary | Output and Evidence Links | Supersedes |
|---|---|---|---|---|---|---|---|---|
| `S001` | `2026-06-22` | `2026-06-22` | `bootstrap` | `repository-skeleton` | `completed` | Initialized the framework repository skeleton. | `AGENT.md`; `.agent/`; `docs/` | `none` |
| `S002` | `2026-06-22` | `2026-06-22` | `coordinator` | `R-001; M-001; M-002; E-001; E-002; E-003; E-004` | `blocked` | Created the draft onboarding hierarchy; authoritative SRS, contract, and architecture inputs were not provided. | `docs/01-business/srs.md`; `docs/04-api/contract.md`; `docs/02-architecture/architecture.md`; `BLOCKER-001`; `BLOCKER-002`; `BLOCKER-003` | `none` |
