// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module domain của state machine planning (PID-00023 S02, S04, S05). `stateMachines` là danh sách mà lệnh
// sires-state-transition-sql của @sires/platform đọc từ bản build (dist/task-state/index.js) để sinh migration
// dòng app.state_transition (S03, S05; H2).

import { planVersionMachine } from './plan-version.machine';
import { taskMachine } from './task.machine';

export {
  assertTaskTransition,
  isTaskStatus,
  TASK_STATUSES,
  taskMachine,
  type TaskStatus,
  type TaskTransition,
  type TaskTransitionCode,
} from './task.machine';
export {
  assertPlanVersionTransition,
  PLAN_VERSION_STATUSES,
  planVersionMachine,
  type PlanVersionStatus,
} from './plan-version.machine';
export {
  checkDiscardDraftTask,
  checkTaskGuards,
  chooseReadinessTarget,
  decideTaskTransition,
  type GuardResult,
  type TaskGuardFacts,
  type TaskGuardName,
  type TaskTransitionDecision,
} from './guards';

/** Mọi state machine của planning, theo thứ tự khối INSERT của docs/database/ddl/planning.sql. */
export const stateMachines = [taskMachine, planVersionMachine];
