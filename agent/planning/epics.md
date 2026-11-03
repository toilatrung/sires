---
id: epics-v1
title: Epics
type: planning
domain: governance
module: planning
tags: [epics, planning]
priority: 2
---
# Epics

## Purpose

Maintain the authoritative registry of bounded delivery outcomes that may be expanded into executable tasks.

## Ownership and Access

- **File Owner**: `planner`
- **Record Owner Rule**: every epic must name one accountable owner before `EPIC_READY`; `unassigned` is valid only in `EPIC_PROPOSED`.
- **Allowed Writers**: `planner` creates and prepares epics; `coordinator` synchronizes execution statuses; `governance` records approved scope corrections.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: scope changes after `EPIC_READY` require an approved change request.

## Update Triggers

- A milestone authorizes a new epic.
- Epic readiness criteria become satisfied or invalid.
- A child task starts, blocks, completes, or is cancelled.
- A linked risk, blocker, decision, or change request changes epic feasibility or scope.

## Status Model

- **Valid Statuses**: `EPIC_PROPOSED | EPIC_READY | EPIC_IN_PROGRESS | EPIC_BLOCKED | EPIC_DONE | EPIC_CANCELLED`
- `EPIC_PROPOSED -> EPIC_READY` requires owner, scope, acceptance criteria, dependencies, and governance links.
- `EPIC_READY -> EPIC_IN_PROGRESS` requires authorized task expansion and at least one executable task.
- `EPIC_IN_PROGRESS -> EPIC_BLOCKED` requires a linked blocker.
- `EPIC_BLOCKED -> EPIC_IN_PROGRESS` requires verified blocker resolution.
- `EPIC_IN_PROGRESS -> EPIC_DONE` requires all child tasks to be `done` or formally `cancelled` and all completion criteria to pass.
- `EPIC_CANCELLED` requires an approved change request and rationale.

## Epic Expansion Rule

- Create tasks only while the parent epic is `EPIC_READY`.
- Start tasks only after the parent epic becomes `EPIC_IN_PROGRESS`.
- Every expanded task must reference the epic ID and use `.agent/templates/task-template.md`.
- Expansion must not introduce scope absent from the epic or an approved change request.

## Relationships

- Epic template: `.agent/templates/epic-template.md`
- Parent milestones: `.agent/planning/milestones.md`
- Dependencies: `.agent/planning/dependency-graph.md`
- Expanded tasks: `.agent/execution/task-board.md`
- Current state: `.agent/execution/current-context.md`
- Governance and reports: `.agent/governance/` and `.agent/reports/`

## Conflict Handling

1. Stop expansion or status transition for the affected epic.
2. Compare the milestone, dependency graph, task board, and approved governance records.
3. Record state mismatch as an issue; use a blocker when execution cannot continue.
4. Resolve scope conflict through an approved change request.
5. Synchronize linked files after the authoritative state is established.

## Forbidden Actions

- Do not create tasks for an epic outside `EPIC_READY`.
- Do not start tasks unless the epic is `EPIC_IN_PROGRESS`.
- Do not use free-form or case-variant status values.
- Do not mark an epic `EPIC_DONE` with unmet criteria or active tasks.
- Do not silently modify baselined scope or delete lifecycle history.

## Epic Records

| Epic ID | Milestone ID | Outcome | Owner | Status | Task IDs | Acceptance Evidence | Governance Links |
|---|---|---|---|---|---|---|---|
| `E-001` | `M-001` | Validate and baseline the authoritative SRS without inferring missing requirements. | `project-sponsor` | `EPIC_PROPOSED` | `none` | `pending input` | `.agent/governance/blockers/BLOCKER-001.md` |
| `E-002` | `M-001` | Validate and baseline the authoritative contract without inferring obligations or interfaces. | `contract-owner` | `EPIC_PROPOSED` | `none` | `pending input` | `.agent/governance/blockers/BLOCKER-002.md` |
| `E-003` | `M-001` | Validate and baseline the authoritative architecture without inferring technical design. | `architecture-owner` | `EPIC_PROPOSED` | `none` | `pending input` | `.agent/governance/blockers/BLOCKER-003.md` |
| `E-004` | `M-002` | Reconcile requirements, contract obligations, and architecture traceability and record baseline approval status. | `governance` | `EPIC_PROPOSED` | `none` | `pending E-001, E-002, E-003` | `BLOCKER-001, BLOCKER-002, BLOCKER-003` |
