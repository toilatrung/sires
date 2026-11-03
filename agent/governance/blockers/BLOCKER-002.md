---
id: blocker-002-missing-contract
title: Authoritative Contract Not Provided
type: governance
domain: api
module: onboarding
tags: [blocker, contract, onboarding]
priority: 1
---
# Authoritative Contract Not Provided

## Usage Purpose

Record the missing contract that prevents contractual and interface baselining.

## Record Metadata

- **Blocker ID**: `BLOCKER-002`
- **Title**: `Authoritative Contract Not Provided`
- **Owner**: `contract-owner`
- **Reporter**: `coordinator`
- **Status**: `open`
- **Blocker Type**: `external`
- **Priority**: `1`
- **Created Date**: `2026-06-22`
- **Target Resolution Date**: `2026-06-22`

## Blocking Condition

No authoritative contract artifact exists in the supplied onboarding input or repository.

## Impact

- **Blocked Epics or Tasks**: `E-002, E-004`
- **Blocked Deliverables**: `approved contractual and interface baseline`
- **Schedule or Quality Impact**: `Obligations, interfaces, service levels, and acceptance conditions cannot be planned safely.`

## Related Files

- **Affected Records**: `docs/04-api/contract.md; .agent/planning/roadmap.md`
- **Issues**: `none`
- **Decisions**: `none`
- **Risks**: `none`
- **Change Requests**: `none`

## Resolution Plan

- **Required Action**: `Provide the authoritative contract with ownership, version, effective date, and approval status.`
- **Responsible Owner**: `contract-owner`
- **Dependency or Approval**: `contract owner approval`
- **Workaround**: `none`
- **Verification Method**: `Validate obligations, interfaces, acceptance terms, change control, and requirement traceability.`

## Completion Criteria

- [ ] The authoritative contract is stored with complete frontmatter.
- [ ] Obligations and interface clauses have stable identifiers.
- [ ] Ownership, version, effective date, and approval status are recorded.
- [ ] `docs/04-api/contract.md` is updated from `missing` to the validated state.

## Forbidden Actions

- Do not invent contractual terms or interfaces.
- Do not close this blocker using an unapproved draft without recording its status.
- Do not expand contract-dependent implementation tasks while this blocker is open.

## Output Requirements

- Preserve this record at `.agent/governance/blockers/BLOCKER-002.md`.
- Link validation evidence before setting status to `resolved`.
