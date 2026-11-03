---
id: dep-graph-v1
title: Dependency Graph
type: planning
domain: architecture
module: planning
tags: [dependencies, epics, milestones]
priority: 2
---
# Dependency Graph

## Purpose

Maintain the authoritative directed relationships that constrain roadmap items, milestones, epics, and tasks.

## Ownership and Access

- **File Owner**: `planner`
- **Record Owner Rule**: every dependency edge must identify the owner responsible for validation and resolution.
- **Allowed Writers**: `planner`; `coordinator` may synchronize verified task dependencies; `governance` may record approved corrections.
- **Allowed Readers**: all authorized users and agents.
- **Write Requirement**: removing an approved scope dependency requires supporting decision or change-request evidence.

## Update Triggers

- A roadmap item, milestone, epic, or task is created, cancelled, or superseded.
- A dependency is discovered, satisfied, blocked, invalidated, or removed.
- A governance record changes sequencing or feasibility.

## Status Model

- **Valid Edge Statuses**: `active | satisfied | blocked | removed`
- `active` means the dependency remains applicable and unresolved.
- `satisfied` requires linked verification evidence.
- `blocked` requires a blocker or realized-risk link.
- `removed` requires a decision or approved change request and preserves the historical edge.

## Dependency Rules

- Edge direction is `Dependent ID -> Prerequisite ID`.
- **Valid Dependency Types**: `roadmap | milestone | epic | task | governance | external`.
- Self-dependencies and directed cycles are invalid.
- Every referenced ID must exist in its authoritative registry.

## Relationships

- Roadmap registry: `.agent/planning/roadmap.md`
- Milestone registry: `.agent/planning/milestones.md`
- Epic registry: `.agent/planning/epics.md`
- Task registry: `.agent/execution/task-board.md`
- Governance evidence: `.agent/governance/`

## Conflict Handling

1. Mark the disputed edge `blocked`; do not delete it.
2. Stop dependent work when the edge affects execution safety or authorization.
3. Record missing IDs, cycles, or contradictory evidence as an issue.
4. Resolve sequencing changes through a decision or approved change request.
5. Revalidate the graph before restoring the edge to `active` or `satisfied`.

## Forbidden Actions

- Do not create self-dependencies or cycles.
- Do not remove an edge to bypass a prerequisite.
- Do not reference undefined roadmap, milestone, epic, or task IDs.
- Do not mark an edge `satisfied` without evidence.
- Do not overwrite historical dependency states.

## Dependency Records

| Edge ID | Dependent ID | Prerequisite ID | Type | Owner | Status | Evidence | Governance Link |
|---|---|---|---|---|---|---|---|
| `EDGE-001` | `M-002` | `M-001` | `milestone` | `planner` | `active` | `.agent/planning/milestones.md` | `none` |
| `EDGE-002` | `E-004` | `E-001` | `epic` | `planner` | `active` | `.agent/planning/epics.md` | `BLOCKER-001` |
| `EDGE-003` | `E-004` | `E-002` | `epic` | `planner` | `active` | `.agent/planning/epics.md` | `BLOCKER-002` |
| `EDGE-004` | `E-004` | `E-003` | `epic` | `planner` | `active` | `.agent/planning/epics.md` | `BLOCKER-003` |
| `EDGE-005` | `E-001` | `BLOCKER-001` | `governance` | `project-sponsor` | `blocked` | `docs/01-business/srs.md` | `.agent/governance/blockers/BLOCKER-001.md` |
| `EDGE-006` | `E-002` | `BLOCKER-002` | `governance` | `contract-owner` | `blocked` | `docs/04-api/contract.md` | `.agent/governance/blockers/BLOCKER-002.md` |
| `EDGE-007` | `E-003` | `BLOCKER-003` | `governance` | `architecture-owner` | `blocked` | `docs/02-architecture/architecture.md` | `.agent/governance/blockers/BLOCKER-003.md` |
