// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Ba state machine của workspace (PRD 18.2; database 10.2), nơi khai báo duy nhất (DEC-57; PID-00017 S03, H2, H3):
// cùng khai báo cho hàm kiểm chuyển ở domain và dòng app.state_transition của migration 0001. Chỉ 6 cặp từ → đến
// của docs/database/ddl/workspace.sql, không điều kiện: điều kiện chuyển (như lưu trữ project khi không có Workflow
// hoạt động) do PID-00044, PID-00064 thêm, các PID đó dùng lại khai báo này. `stateMachines` là export mà lệnh
// sires-state-transition-sql đọc từ bản build (dist/domain/state-machines.js).

import { assertTransition, defineStateMachine, type StateTransition } from '@sires/platform';

export const RESEARCH_PROJECT_STATUSES = ['Active', 'Archived'] as const;
export type ResearchProjectStatus = (typeof RESEARCH_PROJECT_STATUSES)[number];

export const researchProjectMachine = defineStateMachine({
  machine: 'research_project',
  states: RESEARCH_PROJECT_STATUSES,
  transitions: [
    { from: 'Active', to: 'Archived' },
    { from: 'Archived', to: 'Active' },
  ],
});

export const PENDING_ACTION_STATUSES = ['Open', 'Resolved', 'Expired'] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

export const pendingActionMachine = defineStateMachine({
  machine: 'pending_action',
  states: PENDING_ACTION_STATUSES,
  transitions: [
    { from: 'Open', to: 'Resolved' },
    { from: 'Open', to: 'Expired' },
    { from: 'Expired', to: 'Resolved' },
  ],
});

export const NOTIFICATION_STATUSES = ['Unread', 'Read'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notificationMachine = defineStateMachine({
  machine: 'notification',
  states: NOTIFICATION_STATUSES,
  transitions: [{ from: 'Unread', to: 'Read' }],
});

/** Cặp khai báo, hoặc InvalidTransitionError (`invalid_transition`, `currentState`) — kể cả cùng trạng thái. */
export function assertResearchProjectTransition(from: string, to: string): StateTransition<ResearchProjectStatus> {
  return assertTransition(researchProjectMachine, from, to);
}

export function assertPendingActionTransition(from: string, to: string): StateTransition<PendingActionStatus> {
  return assertTransition(pendingActionMachine, from, to);
}

export function assertNotificationTransition(from: string, to: string): StateTransition<NotificationStatus> {
  return assertTransition(notificationMachine, from, to);
}

/** Mọi state machine của workspace, theo thứ tự khối INSERT của docs/database/ddl/workspace.sql. */
export const stateMachines = [researchProjectMachine, pendingActionMachine, notificationMachine];
