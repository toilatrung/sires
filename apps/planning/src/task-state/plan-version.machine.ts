// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine PlanVersion (PRD 18.2; database 5.2), nơi khai báo duy nhất (PID-00023 S05, H4; DEC-57). Chỉ 4 cặp,
// không điều kiện: kiểm cấu trúc 18.5, lý do bắt buộc, giao dịch duyệt (Approved → Superseded rồi Proposed →
// Approved) thuộc PID-00049, PID đó dùng lại khai báo này. “(mới) → Draft”, rút lại (Proposed → Rejected rồi Draft
// mới) và hủy nháp (deleted_at) không phải đổi status trong database nên không có cặp.

import { assertTransition, defineStateMachine, type StateTransition } from '@sires/platform';

/** 5 trạng thái của PlanVersion, đúng CHECK của app.plan_version.status. */
export const PLAN_VERSION_STATUSES = ['Draft', 'Proposed', 'Approved', 'Rejected', 'Superseded'] as const;

export type PlanVersionStatus = (typeof PLAN_VERSION_STATUSES)[number];

export const planVersionMachine = defineStateMachine({
  machine: 'plan_version',
  states: PLAN_VERSION_STATUSES,
  transitions: [
    { from: 'Draft', to: 'Proposed' },
    { from: 'Proposed', to: 'Approved', code: 'APR-01' },
    { from: 'Proposed', to: 'Rejected' },
    { from: 'Approved', to: 'Superseded' },
  ],
});

/** Cặp khai báo của PlanVersion, hoặc InvalidTransitionError (`invalid_transition`, `currentState`). */
export function assertPlanVersionTransition(from: string, to: string): StateTransition<PlanVersionStatus> {
  return assertTransition(planVersionMachine, from, to);
}
