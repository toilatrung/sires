---
id: task-board
title: Task Board
type: execution
domain: governance
module: execution
tags: [tasks, execution, board]
priority: 1
---
# Task Board

## Purpose

Maintain the authoritative registry of executable tasks and their lifecycle state.

## Ownership and Access

- **File Owner**: `coordinator`
- **Record Owner Rule**: every task must name one accountable owner before entering `in-progress`; `unassigned` is valid only while status is `pending`.
- **Allowed Writers**: `planner` creates tasks during authorized epic expansion; `coordinator` controls assignment and transitions; task owners update their own execution evidence and requested status.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: every transition must satisfy the lifecycle rule and link required evidence.

## Update Triggers

- An `EPIC_READY` epic is expanded into tasks.
- A task is assigned, started, blocked, submitted for review, completed, or cancelled.
- Acceptance criteria, dependencies, blockers, reviews, QA evidence, or commits change.

## Status Model

- **Valid Statuses**: `pending | in-progress | blocked | review | done | cancelled`
- `pending -> in-progress` requires an owner, sufficient context, satisfied dependencies, and parent epic `EPIC_IN_PROGRESS`.
- `in-progress -> blocked` requires a linked blocker.
- `in-progress -> review` requires implementation evidence and acceptance-criteria results.
- `review -> done` requires required review and QA evidence.
- `blocked -> in-progress` requires verified blocker resolution.
- `cancelled` requires an authorized rationale; `done` and `cancelled` are terminal.

## Epic Expansion Rule

- Create task records only when the parent epic is `EPIC_READY`.
- Transition the epic to `EPIC_IN_PROGRESS` before any task enters `in-progress`.
- Create each task from `.agent/templates/task-template.md` and preserve its acceptance and completion criteria.

## Relationships

- Parent epic registry: `.agent/planning/epics.md`
- Dependencies: `.agent/planning/dependency-graph.md`
- Current shared state: `.agent/execution/current-context.md`
- Session audit: `.agent/execution/sessions-history.md`
- Runtime governance and reports: `.agent/governance/` and `.agent/reports/`
- Commit mapping: `.agent/intelligence/git-nexus/task-commit-map.md`

## Conflict Handling

1. Do not apply the disputed transition.
2. Preserve the last verified task status.
3. Compare epic status, dependency records, blocker state, and report evidence.
4. Record unresolved state or ownership conflict as an issue; create a blocker if work cannot continue.
5. The coordinator applies the resolved transition and synchronizes current context.

## Forbidden Actions

- Do not create tasks outside authorized `EPIC_READY` expansion.
- Do not start tasks unless the parent epic is `EPIC_IN_PROGRESS`.
- Do not use free-form or case-variant status values.
- Do not mark a task `done` without acceptance and required report evidence.
- Do not delete cancelled or completed task history.
- Do not assign multiple accountable owners to one task.

## Task Records

| Task ID | Epic ID | Title | Owner | Status | Dependencies | Blocker IDs | Evidence Links | Updated Date |
|---|---|---|---|---|---|---|---|---|

No task records are registered.
