---
id: roadmap-v1
title: Project Roadmap
type: planning
domain: governance
module: planning
tags: [roadmap, milestones, planning]
priority: 1
---
# Project Roadmap

## Purpose

Maintain the approved sequence of outcome-level roadmap items and their target windows without defining task-level implementation.

## Ownership and Access

- **File Owner**: `planner`
- **Record Owner Rule**: every roadmap item must name one accountable owner.
- **Allowed Writers**: `planner`; `governance` may record an approved status or scope correction.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: commitment, scope, or target-window changes require an approved change request.

## Update Triggers

- An approved change request adds, removes, resequences, or changes a roadmap commitment.
- A linked milestone enters `completed`, `blocked`, or `cancelled`.
- A dependency changes the feasibility or target window of a roadmap item.

## Status Model

- **Valid Statuses**: `ROADMAP_DRAFT | ROADMAP_APPROVED | ROADMAP_ACTIVE | ROADMAP_BLOCKED | ROADMAP_DONE | ROADMAP_CANCELLED`
- New or unapproved roadmaps must use `ROADMAP_DRAFT`.
- `ROADMAP_DRAFT -> ROADMAP_APPROVED` requires explicit governance approval and an owner.
- `ROADMAP_APPROVED -> ROADMAP_ACTIVE` requires at least one linked milestone in `in-progress`.
- `ROADMAP_ACTIVE -> ROADMAP_DONE` requires all linked milestones to be `completed` or formally `cancelled`.
- `ROADMAP_BLOCKED` requires a linked blocker or realized risk.
- `ROADMAP_CANCELLED` requires an approved change request and recorded rationale.

## Relationships

- Milestone definitions: `.agent/planning/milestones.md`
- Epic registry: `.agent/planning/epics.md`
- Dependency evidence: `.agent/planning/dependency-graph.md`
- Approved scope changes: `.agent/governance/change-requests/`
- Risks and blockers: `.agent/governance/risks/` and `.agent/governance/blockers/`

## Conflict Handling

1. Stop the affected roadmap update.
2. Preserve the current approved record and record the conflict as an issue.
3. Prefer the latest approved change request or decision over unapproved planning edits.
4. Require governance resolution when approved records conflict.
5. Synchronize milestones and dependencies after resolution.

## Forbidden Actions

- Do not add task-level implementation details.
- Do not change approved commitments without an approved change request.
- Do not mark an item `ROADMAP_DONE` while required milestones remain incomplete.
- Do not use free-form status values.
- Do not delete superseded or `ROADMAP_CANCELLED` roadmap history.

## Roadmap Records

| Roadmap ID | Outcome | Owner | Target Window | Status | Milestone IDs | Change Request |
|---|---|---|---|---|---|---|
| `R-001` | Establish an approved, cross-document SRS, contract, and architecture baseline for project planning. | `planner` | `unplanned` | `ROADMAP_DRAFT` | `M-001, M-002` | `none` |
