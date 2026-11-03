---
id: blocker-001-missing-srs
title: Authoritative SRS Not Provided
type: governance
domain: business
module: onboarding
tags: [blocker, srs, onboarding]
priority: 1
---
# Authoritative SRS Not Provided

## Usage Purpose

Record the missing SRS that prevents requirements baselining and product-scope planning.

## Record Metadata

- **Blocker ID**: `BLOCKER-001`
- **Title**: `Authoritative SRS Not Provided`
- **Owner**: `project-sponsor`
- **Reporter**: `coordinator`
- **Status**: `open`
- **Blocker Type**: `external`
- **Priority**: `1`
- **Created Date**: `2026-06-22`
- **Target Resolution Date**: `2026-06-22`

## Blocking Condition

No authoritative SRS artifact exists in the supplied onboarding input or repository.

## Impact

- **Blocked Epics or Tasks**: `E-001, E-004`
- **Blocked Deliverables**: `approved requirements baseline and product roadmap scope`
- **Schedule or Quality Impact**: `Product milestones and implementation epics cannot be derived without guessing.`

## Related Files

- **Affected Records**: `docs/01-business/srs.md; .agent/planning/roadmap.md`
- **Issues**: `none`
- **Decisions**: `none`
- **Risks**: `none`
- **Change Requests**: `none`

## Resolution Plan

- **Required Action**: `Provide the authoritative SRS with ownership, version, and approval status.`
- **Responsible Owner**: `project-sponsor`
- **Dependency or Approval**: `SRS owner approval`
- **Workaround**: `none`
- **Verification Method**: `Validate required sections, identifiers, approval, and cross-document traceability.`

## Completion Criteria

- [ ] The authoritative SRS is stored with complete frontmatter.
- [ ] Requirements and exclusions have stable identifiers.
- [ ] Ownership, version, and approval status are recorded.
- [ ] `docs/01-business/srs.md` is updated from `missing` to the validated state.

## Forbidden Actions

- Do not infer or fabricate requirements.
- Do not close this blocker based on a verbal or unversioned summary.
- Do not expand product implementation tasks while this blocker is open.

## Output Requirements

- Preserve this record at `.agent/governance/blockers/BLOCKER-001.md`.
- Link validation evidence before setting status to `resolved`.
