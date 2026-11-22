// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine Task T-01–T-19 (PRD 9.8 là chuẩn; TASK-STATE-001), nơi khai báo duy nhất (NFR-MAINT-003, DEC-57):
// cùng khai báo cho hàm kiểm chuyển ở domain và dòng app.state_transition của migration 0001 (PID-00023 S02, S03;
// H2). PID-00049, PID-00074, PID-00075, PID-00091 dùng lại, không khai báo lại. 28 cặp; T-17 (bỏ Task Draft) không
// phải chuyển trạng thái mà là đặt deleted_at (database 5.3), nên không có cặp. Guard và chọn đích ở guards.ts (S04).

import { assertTransition, defineStateMachine, type StateTransition } from '@sires/platform';

/** 10 trạng thái của Task (PRD 9.8), đúng CHECK của app.task.status. */
export const TASK_STATUSES = [
  'Draft', 'Blocked', 'Ready', 'Queued', 'In Progress', 'Waiting for User', 'In Review', 'Completed', 'Failed',
  'Cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Mã chuyển trạng thái của PRD 9.8 (T-17 không có cặp nên không có ở đây). */
export type TaskTransitionCode =
  | 'T-01' | 'T-02' | 'T-03' | 'T-04' | 'T-05' | 'T-06' | 'T-07' | 'T-08' | 'T-09' | 'T-10'
  | 'T-11' | 'T-12' | 'T-13' | 'T-14' | 'T-15' | 'T-16' | 'T-18' | 'T-19';

const SYSTEM = ['system'] as const;
const RESEARCHER = ['researcher'] as const;
const RESEARCHER_OR_SYSTEM = ['researcher', 'system'] as const;

export const taskMachine = defineStateMachine({
  machine: 'task',
  states: TASK_STATUSES,
  transitions: [
    { from: 'Draft', to: 'Blocked', code: 'T-01', actors: SYSTEM },
    { from: 'Draft', to: 'Ready', code: 'T-02', actors: SYSTEM },
    { from: 'Blocked', to: 'Ready', code: 'T-03', actors: SYSTEM },
    { from: 'Ready', to: 'Blocked', code: 'T-04', actors: SYSTEM },
    { from: 'Ready', to: 'Queued', code: 'T-05', actors: RESEARCHER },
    { from: 'Failed', to: 'Queued', code: 'T-05', actors: RESEARCHER },
    { from: 'Queued', to: 'In Progress', code: 'T-06', actors: SYSTEM },
    { from: 'Queued', to: 'Ready', code: 'T-07', actors: RESEARCHER },
    { from: 'In Progress', to: 'Waiting for User', code: 'T-08', actors: SYSTEM },
    { from: 'Waiting for User', to: 'In Progress', code: 'T-09', actors: SYSTEM },
    { from: 'In Progress', to: 'Ready', code: 'T-10', actors: RESEARCHER },
    { from: 'In Progress', to: 'Blocked', code: 'T-10', actors: RESEARCHER },
    { from: 'Waiting for User', to: 'Ready', code: 'T-10', actors: RESEARCHER },
    { from: 'Waiting for User', to: 'Blocked', code: 'T-10', actors: RESEARCHER },
    { from: 'In Progress', to: 'In Review', code: 'T-11', actors: SYSTEM },
    { from: 'In Progress', to: 'Failed', code: 'T-12', actors: SYSTEM },
    { from: 'Waiting for User', to: 'Failed', code: 'T-12', actors: SYSTEM },
    { from: 'In Review', to: 'Ready', code: 'T-13', actors: RESEARCHER },
    { from: 'In Review', to: 'Completed', code: 'T-14', actors: RESEARCHER },
    { from: 'In Review', to: 'Blocked', code: 'T-15', actors: RESEARCHER },
    { from: 'Failed', to: 'Blocked', code: 'T-16', actors: SYSTEM },
    { from: 'Blocked', to: 'Cancelled', code: 'T-18', actors: RESEARCHER_OR_SYSTEM },
    { from: 'Ready', to: 'Cancelled', code: 'T-18', actors: RESEARCHER_OR_SYSTEM },
    { from: 'Queued', to: 'Cancelled', code: 'T-18', actors: RESEARCHER_OR_SYSTEM },
    { from: 'In Review', to: 'Cancelled', code: 'T-18', actors: RESEARCHER_OR_SYSTEM },
    { from: 'Failed', to: 'Cancelled', code: 'T-18', actors: RESEARCHER_OR_SYSTEM },
    { from: 'Completed', to: 'Ready', code: 'T-19', actors: RESEARCHER },
    { from: 'Completed', to: 'Blocked', code: 'T-19', actors: RESEARCHER },
  ],
});

/** Cặp đã khai báo của Task, với mã T-NN chắc chắn có. */
export type TaskTransition = StateTransition<TaskStatus> & { readonly code: TaskTransitionCode };

/** Có phải một trong 10 trạng thái của Task không (giá trị lạ như “Done” → false, EC10). */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Hàm kiểm chuyển của Task (PID-00023-AC01): cặp có trong bảng trả cặp kèm mã T-NN; cặp không có — kể cả cùng trạng
 * thái (EC06), từ Cancelled (EC07), từ Completed khác T-19 (EC08), giá trị ngoài 10 trạng thái — ném
 * InvalidTransitionError (`invalid_transition`, `currentState`). Chỉ kiểm cặp; guard ở guards.ts. Không gọi database
 * hay service khác (NFR-MAINT-004).
 */
export function assertTaskTransition(from: string, to: string): TaskTransition {
  return assertTransition(taskMachine, from, to) as TaskTransition;
}
