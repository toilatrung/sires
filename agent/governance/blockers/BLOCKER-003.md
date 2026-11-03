---
id: blocker-003-missing-architecture
title: Authoritative Architecture Documents Not Provided
type: governance
domain: architecture
module: onboarding
tags: [blocker, architecture, onboarding]
priority: 1
---
# Authoritative Architecture Documents Not Provided

## Usage Purpose

Record the missing architecture input that prevents technical baselining and feasibility planning.

## Record Metadata

- **Blocker ID**: `BLOCKER-003`
- **Title**: `Authoritative Architecture Documents Not Provided`
- **Owner**: `architecture-owner`
- **Reporter**: `coordinator`
- **Status**: `open`
- **Blocker Type**: `external`
- **Priority**: `1`
- **Created Date**: `2026-06-22`
- **Target Resolution Date**: `2026-06-22`

## Blocking Condition

No authoritative architecture artifact exists in the supplied onboarding input or repository.

## Impact

- **Blocked Epics or Tasks**: `E-003, E-004`
- **Blocked Deliverables**: `approved technical architecture baseline`
- **Schedule or Quality Impact**: `Components, integrations, data flows, deployment constraints, and quality tradeoffs cannot be planned safely.`

## Related Files

- **Affected Records**: `docs/02-architecture/architecture.md; .agent/planning/roadmap.md`
- **Issues**: `none`
- **Decisions**: `none`
- **Risks**: `none`
- **Change Requests**: `none`

## Resolution Plan

- **Required Action**: `Provide the authoritative architecture documents with ownership, version, and approval status.`
- **Responsible Owner**: `architecture-owner`
- **Dependency or Approval**: `architecture owner approval`
- **Workaround**: `none`
- **Verification Method**: `Validate boundaries, components, dependencies, quality attributes, decisions, and requirement traceability.`

## Completion Criteria

- [ ] The authoritative architecture documents are stored with complete frontmatter.
- [ ] Components, dependencies, constraints, and decisions are explicit.
- [ ] Ownership, version, and approval status are recorded.
- [ ] `docs/02-architecture/architecture.md` is updated from `missing` to the validated state.

## Forbidden Actions

- Do not infer architecture or technology choices.
- Do not close this blocker based on diagrams without governing narrative and approval state.
- Do not expand architecture-dependent implementation tasks while this blocker is open.

## Output Requirements

- Preserve this record at `.agent/governance/blockers/BLOCKER-003.md`.
- Link validation evidence before setting status to `resolved`.
