// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Bảy state machine của orchestration (PRD 18.2; database 10.2), nơi khai báo duy nhất (NFR-MAINT-003, DEC-57):
// PID-00046 và các PID module (prompts, context-store, deliberation) dùng lại, không khai báo lại (PID-00019 H1, D2).
// Chỉ có các cặp từ → đến của docs/database/ddl/orchestration.sql, không có điều kiện chuyển, mã hay actor.
//
// Khai báo bằng defineStateMachine của @sires/platform (helper PID-00158): helper kiểm khai báo khi nạp module (tên,
// trạng thái, cặp trùng, cặp X → X) và trả đối tượng đóng băng. `stateMachines` là export mà lệnh
// sires-state-transition-sql đọc từ bản build (dist/domain/state-machines.js) để sinh SQL của migration
// 0001_state_transition.sql; dòng app.state_transition không viết tay (DEC-57, database 10.2; PID-00019 S02).

import { defineStateMachine } from '@sires/platform';

/** Workflow (16 cặp; gồm Waiting for User → Paused, DEC-53). */
export const workflowStateMachine = defineStateMachine({
  machine: 'workflow',
  states: ['Created', 'Running', 'Waiting for User', 'Paused', 'Interrupted', 'Succeeded', 'Failed', 'Cancelled'],
  transitions: [
    { from: 'Created', to: 'Running' },
    { from: 'Running', to: 'Waiting for User' },
    { from: 'Waiting for User', to: 'Running' },
    { from: 'Running', to: 'Paused' },
    { from: 'Waiting for User', to: 'Paused' },
    { from: 'Paused', to: 'Running' },
    { from: 'Paused', to: 'Waiting for User' },
    { from: 'Running', to: 'Interrupted' },
    { from: 'Interrupted', to: 'Running' },
    { from: 'Running', to: 'Succeeded' },
    { from: 'Running', to: 'Failed' },
    { from: 'Created', to: 'Cancelled' },
    { from: 'Running', to: 'Cancelled' },
    { from: 'Waiting for User', to: 'Cancelled' },
    { from: 'Paused', to: 'Cancelled' },
    { from: 'Interrupted', to: 'Cancelled' },
  ],
});

/** WorkflowStep (11 cặp). */
export const workflowStepStateMachine = defineStateMachine({
  machine: 'workflow_step',
  states: ['Pending', 'Running', 'Waiting for User', 'Succeeded', 'Failed', 'Cancelled'],
  transitions: [
    { from: 'Pending', to: 'Running' },
    { from: 'Running', to: 'Succeeded' },
    { from: 'Running', to: 'Failed' },
    { from: 'Running', to: 'Waiting for User' },
    { from: 'Waiting for User', to: 'Running' },
    { from: 'Waiting for User', to: 'Pending' },
    { from: 'Waiting for User', to: 'Succeeded' },
    { from: 'Pending', to: 'Cancelled' },
    { from: 'Running', to: 'Cancelled' },
    { from: 'Waiting for User', to: 'Cancelled' },
    { from: 'Failed', to: 'Running' },
  ],
});

/** AgentRun (5 cặp); bất biến sau trạng thái cuối, trừ cờ discarded (trigger agent_run_final). */
export const agentRunStateMachine = defineStateMachine({
  machine: 'agent_run',
  states: ['Pending', 'Running', 'Succeeded', 'Failed', 'Cancelled'],
  transitions: [
    { from: 'Pending', to: 'Running' },
    { from: 'Running', to: 'Succeeded' },
    { from: 'Running', to: 'Failed' },
    { from: 'Pending', to: 'Cancelled' },
    { from: 'Running', to: 'Cancelled' },
  ],
});

/** InteractiveAgentPrompt (3 cặp); tên machine `prompt` như DDL; bất biến khi rời Open (trigger prompt_answer_once). */
export const promptStateMachine = defineStateMachine({
  machine: 'prompt',
  states: ['Open', 'Answered', 'Expired', 'Cancelled'],
  transitions: [
    { from: 'Open', to: 'Answered' },
    { from: 'Open', to: 'Expired' },
    { from: 'Open', to: 'Cancelled' },
  ],
});

/** ContextItem (2 cặp). */
export const contextItemStateMachine = defineStateMachine({
  machine: 'context_item',
  states: ['Active', 'Superseded', 'Retracted'],
  transitions: [
    { from: 'Active', to: 'Superseded' },
    { from: 'Active', to: 'Retracted' },
  ],
});

/** Deliberation (3 cặp). */
export const deliberationStateMachine = defineStateMachine({
  machine: 'deliberation',
  states: ['Running', 'Completed', 'Failed', 'Cancelled'],
  transitions: [
    { from: 'Running', to: 'Completed' },
    { from: 'Running', to: 'Failed' },
    { from: 'Running', to: 'Cancelled' },
  ],
});

/** DeliberationEntry (3 cặp). */
export const deliberationEntryStateMachine = defineStateMachine({
  machine: 'deliberation_entry',
  states: ['draft', 'final', 'retracted'],
  transitions: [
    { from: 'draft', to: 'final' },
    { from: 'draft', to: 'retracted' },
    { from: 'final', to: 'retracted' },
  ],
});

/** Danh sách mà lệnh sires-state-transition-sql đọc (export mặc định `stateMachines`), theo thứ tự khối INSERT của DDL. */
export const stateMachines = [
  workflowStateMachine,
  workflowStepStateMachine,
  agentRunStateMachine,
  promptStateMachine,
  contextItemStateMachine,
  deliberationStateMachine,
  deliberationEntryStateMachine,
] as const;
