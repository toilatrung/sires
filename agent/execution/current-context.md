---
id: current-context
title: Current Context
type: execution
domain: governance
module: execution
tags: [context, execution, state]
priority: 1
---
# Current Context

## Purpose

Expose the minimal synchronized state for currently authorized execution without becoming a fixed or mandatory reading list.

## Ownership and Access

- **File Owner**: `coordinator`
- **State Owner Rule**: every active task retains its task owner; the coordinator owns cross-file synchronization.
- **Allowed Writers**: `coordinator`; an active task owner may update only fields directly attributable to that task.
- **Allowed Readers**: all authorized users and agents when current shared state is relevant to their task.
- **Write Requirement**: every update must identify the writer, trigger, and source record.

## Update Triggers

- An epic enters or leaves `EPIC_IN_PROGRESS` or `EPIC_BLOCKED`.
- A task enters or leaves `in-progress`, `blocked`, or `review`.
- An active blocker, decision, risk, or change request changes execution constraints.
- A coordinator hands work to another owner or closes an execution session.

## Status Model

- **Valid Context Statuses**: `current | stale | archived`
- **Valid Roadmap Statuses**: `ROADMAP_DRAFT | ROADMAP_APPROVED | ROADMAP_ACTIVE | ROADMAP_BLOCKED | ROADMAP_DONE | ROADMAP_CANCELLED`
- **Valid Epic Statuses**: `EPIC_PROPOSED | EPIC_READY | EPIC_IN_PROGRESS | EPIC_BLOCKED | EPIC_DONE | EPIC_CANCELLED`
- **Valid Task Statuses**: `pending | in-progress | blocked | review | done | cancelled`
- `current` requires all referenced states to match their authoritative registries.
- `stale` means a known registry change is not yet reconciled.
- `archived` means the context snapshot is retained but must not drive execution.

## Relationships

- Epic authority: `.agent/planning/epics.md`
- Task authority: `.agent/execution/task-board.md`
- Dependency authority: `.agent/planning/dependency-graph.md`
- Runtime governance: `.agent/governance/`
- Session audit: `.agent/execution/sessions-history.md`
- Context package template: `.agent/templates/context-package-template.md`

## Conflict Handling

1. Set context status to `stale`.
2. Stop transitions that depend on the disputed state.
3. Compare authoritative epic, task, dependency, and governance records.
4. Record unresolved disagreement as an issue or blocker.
5. Rebuild this state from resolved authoritative records and set status to `current`.

## Forbidden Actions

- Do not treat this file as a fixed required reading order.
- Do not use this file to override authoritative planning, task, or governance records.
- Do not list an active task without an owner and `in-progress`, `blocked`, or `review` status.
- Do not leave stale state marked `current`.
- Do not include secrets, credentials, personal data, or unrelated context.

## Current State

- **Context Revision**: `2`
- **Context Status**: `current`
- **Last Updated**: `2026-06-22`
- **Updated By**: `coordinator`
- **Update Trigger**: `project-onboarding-input-validation`
- **Planning Roadmap ID**: `R-001`
- **Planning Roadmap Status**: `ROADMAP_DRAFT`
- **Onboarding State**: `blocked`
- **Active Epic IDs**: `none`
- **Active Task IDs**: `none`
- **Active Blocker IDs**: `BLOCKER-001, BLOCKER-002, BLOCKER-003`
- **Active Decision IDs**: `none`
- **Active Risk IDs**: `none`
- **Active Change Request IDs**: `none`
- **Current Session ID**: `none`
