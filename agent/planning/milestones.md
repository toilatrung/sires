---
id: milestones-v1
title: Milestones
type: planning
domain: governance
module: planning
tags: [milestones, planning]
priority: 2
---
# Milestones

## Purpose

Maintain measurable delivery checkpoints that group epics under approved roadmap outcomes.

## Ownership and Access

- **File Owner**: `planner`
- **Record Owner Rule**: every milestone must name one accountable owner; `unassigned` is valid only while status is `proposed`.
- **Allowed Writers**: `planner`; `coordinator` may synchronize status from verified epic state; `governance` may record approved corrections.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: scope or target changes to approved milestones require an approved change request.

## Update Triggers

- A roadmap item is approved, changed, completed, or cancelled.
- A linked epic changes to `EPIC_BLOCKED`, `EPIC_DONE`, or `EPIC_CANCELLED`.
- A milestone dependency is added, resolved, blocked, or removed.

## Status Model

- **Valid Statuses**: `proposed | ready | in-progress | blocked | completed | cancelled`
- `proposed -> ready` requires an owner, target window, acceptance criteria, and dependency validation.
- `ready -> in-progress` requires at least one linked epic in `EPIC_IN_PROGRESS`.
- `in-progress -> blocked` requires a linked blocker.
- `in-progress -> completed` requires all linked epics to be `EPIC_DONE` or formally `EPIC_CANCELLED` and milestone criteria to pass.
- `cancelled` requires an approved change request and rationale.

## Relationships

- Parent roadmap items: `.agent/planning/roadmap.md`
- Child epics: `.agent/planning/epics.md`
- Milestone and epic dependencies: `.agent/planning/dependency-graph.md`
- Current execution state: `.agent/execution/current-context.md`
- Governance evidence: `.agent/governance/`

## Conflict Handling

1. Do not transition the affected milestone.
2. Compare roadmap approval, epic states, and dependency records.
3. Record unresolved disagreement as an issue or blocker.
4. Use an approved decision or change request to resolve scope or target conflicts.
5. Update all linked planning files in the same governed change.

## Forbidden Actions

- Do not create a milestone without a parent roadmap item.
- Do not use free-form status values.
- Do not mark a milestone `completed` with incomplete child epics.
- Do not remove dependencies to bypass a blocked state.
- Do not change approved scope without governed authorization.

## Milestone Records

| Milestone ID | Roadmap ID | Outcome | Owner | Target Window | Status | Epic IDs | Acceptance Evidence |
|---|---|---|---|---|---|---|---|
| `M-001` | `R-001` | Receive, validate, and baseline all three authoritative onboarding inputs. | `planner` | `unplanned` | `blocked` | `E-001, E-002, E-003` | `BLOCKER-001, BLOCKER-002, BLOCKER-003` |
| `M-002` | `R-001` | Reconcile the validated inputs and obtain approval for the initial planning baseline. | `governance` | `unplanned` | `proposed` | `E-004` | `pending` |
