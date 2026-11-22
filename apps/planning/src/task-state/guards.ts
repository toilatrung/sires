// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Guard và chọn đích của T-01–T-19 (PID-00023 S04, H3): đúng cột Guard của PRD 9.8, không thêm guard nào. Hàm thuần
// nhận dữ kiện do bên gọi tính (readiness của PID-00075; Workflow, đầu ra, criterion của PID-00074, PID-00091), trả
// đạt hoặc tên guard không đạt; không đọc database, không gọi service khác (NFR-MAINT-004). Ánh xạ guard không đạt
// sang ErrorCode, mã HTTP do bên gọi làm (readiness_failed, active_workflow_exists, action_not_allowed_in_state…).

import { assertTaskTransition, type TaskStatus, type TaskTransition, type TaskTransitionCode } from './task.machine';

/** Tên guard (cột Guard của PRD 9.8); trả về khi guard không đạt. */
export type TaskGuardName =
  /** T-02, T-03: RC-01–RC-08 đạt. */
  | 'readiness_rc01_rc08_passed'
  /** T-01, T-04, T-16: một trong RC-01–RC-08 không đạt. */
  | 'readiness_rc01_rc08_not_passed'
  /** T-05: RC-01–RC-09 đạt. */
  | 'readiness_rc01_rc09_passed'
  /** T-07: Workflow chưa Running. */
  | 'workflow_not_running'
  /** T-10, T-19: đích (Ready hoặc Blocked) theo readiness RC-01–RC-08 (EC14). */
  | 'target_matches_readiness'
  /** T-11: có đủ đầu ra bắt buộc. */
  | 'required_outputs_present'
  /** T-13: phản hồi và reasonCode không rỗng. */
  | 'feedback_and_reason_code_given'
  /** T-14: mọi acceptance criterion đánh dấu đạt (TASK-STATE-001-AC04, EC12). */
  | 'all_criteria_passed'
  /** T-14: mọi đầu ra bắt buộc có version Accepted. */
  | 'required_outputs_accepted'
  /** T-15: lý do và reasonCode không rỗng. */
  | 'reason_and_reason_code_given'
  /** T-18: không có Workflow hoạt động (EC13). */
  | 'no_active_workflow'
  /** T-19: có ghi lý do. */
  | 'reason_given'
  /** T-17: Task chưa từng thuộc baseline. */
  | 'never_in_baseline';

/**
 * Dữ kiện cho guard. Mỗi mã chỉ đọc dữ kiện nó cần (bảng guard ở S04); thiếu dữ kiện cần thì ném TypeError (lỗi của
 * bên gọi, không phải guard không đạt).
 */
export interface TaskGuardFacts {
  /** RC-01–RC-08 đều đạt (T-01–T-04, T-16; chọn đích T-10, T-19). */
  readonly readinessRc01ToRc08Passed?: boolean;
  /** RC-01–RC-09 đều đạt (T-05). */
  readonly readinessRc01ToRc09Passed?: boolean;
  /** Task có Workflow hoạt động (T-18). */
  readonly hasActiveWorkflow?: boolean;
  /** Workflow của Task đã Running (T-07). */
  readonly workflowRunning?: boolean;
  /** Có đủ đầu ra bắt buộc (T-11). */
  readonly requiredOutputsPresent?: boolean;
  /** Mọi acceptance criterion đánh dấu đạt (T-14). */
  readonly allCriteriaPassed?: boolean;
  /** Mọi đầu ra bắt buộc có version Accepted (T-14). */
  readonly requiredOutputsAccepted?: boolean;
  /** Phản hồi của Researcher (T-13). */
  readonly feedback?: string | null;
  /** Lý do (T-15, T-19). */
  readonly reason?: string | null;
  /** reasonCode của TaskReview (T-13, T-15). */
  readonly reasonCode?: string | null;
}

export type GuardResult = { readonly passed: true } | { readonly passed: false; readonly failed: readonly TaskGuardName[] };

const PASSED: GuardResult = { passed: true };

function result(failed: TaskGuardName[]): GuardResult {
  return failed.length === 0 ? PASSED : { passed: false, failed };
}

type TextFact = 'feedback' | 'reason' | 'reasonCode';
type BooleanFact = Exclude<keyof TaskGuardFacts, TextFact>;

/** Dữ kiện có mặt (null được với dữ kiện chuỗi: nghĩa là rỗng). */
function need<K extends keyof TaskGuardFacts>(facts: TaskGuardFacts, key: K, code: TaskTransitionCode): Exclude<TaskGuardFacts[K], undefined> {
  const value = facts[key];
  if (value === undefined) throw new TypeError(`Guard ${code}: thiếu dữ kiện ${key}`);
  return value as Exclude<TaskGuardFacts[K], undefined>;
}

function needBoolean(facts: TaskGuardFacts, key: BooleanFact, code: TaskTransitionCode): boolean {
  const value: unknown = need(facts, key, code);
  if (typeof value !== 'boolean') throw new TypeError(`Guard ${code}: dữ kiện ${key} phải là boolean`);
  return value;
}

/** Chuỗi có ký tự khác khoảng trắng (null, undefined, rỗng → không). */
function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Đích của T-10 và T-19 theo readiness RC-01–RC-08: đạt → Ready, không → Blocked (PRD 9.8; EC14). */
export function chooseReadinessTarget(readinessRc01ToRc08Passed: boolean): Extract<TaskStatus, 'Ready' | 'Blocked'> {
  return readinessRc01ToRc08Passed ? 'Ready' : 'Blocked';
}

/**
 * Guard của một cặp đã khai báo (cột Guard của PRD 9.8). T-06, T-08, T-09, T-12 không có guard nên luôn đạt. Trả mọi
 * guard không đạt của mã đó (T-14 có hai).
 */
export function checkTaskGuards(transition: Pick<TaskTransition, 'code' | 'to'>, facts: TaskGuardFacts): GuardResult {
  const { code, to } = transition;
  switch (code) {
    case 'T-02':
    case 'T-03':
      return result(needBoolean(facts, 'readinessRc01ToRc08Passed', code) ? [] : ['readiness_rc01_rc08_passed']);
    case 'T-01':
    case 'T-04':
    case 'T-16':
      return result(needBoolean(facts, 'readinessRc01ToRc08Passed', code) ? ['readiness_rc01_rc08_not_passed'] : []);
    case 'T-05':
      return result(needBoolean(facts, 'readinessRc01ToRc09Passed', code) ? [] : ['readiness_rc01_rc09_passed']);
    case 'T-06':
    case 'T-08':
    case 'T-09':
    case 'T-12':
      return PASSED;
    case 'T-07':
      return result(needBoolean(facts, 'workflowRunning', code) ? ['workflow_not_running'] : []);
    case 'T-10':
      return result(chooseReadinessTarget(needBoolean(facts, 'readinessRc01ToRc08Passed', code)) === to ? [] : ['target_matches_readiness']);
    case 'T-11':
      return result(needBoolean(facts, 'requiredOutputsPresent', code) ? [] : ['required_outputs_present']);
    case 'T-13':
      return result(present(need(facts, 'feedback', code)) && present(need(facts, 'reasonCode', code)) ? [] : ['feedback_and_reason_code_given']);
    case 'T-14': {
      const failed: TaskGuardName[] = [];
      if (!needBoolean(facts, 'allCriteriaPassed', code)) failed.push('all_criteria_passed');
      if (!needBoolean(facts, 'requiredOutputsAccepted', code)) failed.push('required_outputs_accepted');
      return result(failed);
    }
    case 'T-15':
      return result(present(need(facts, 'reason', code)) && present(need(facts, 'reasonCode', code)) ? [] : ['reason_and_reason_code_given']);
    case 'T-18':
      return result(needBoolean(facts, 'hasActiveWorkflow', code) ? ['no_active_workflow'] : []);
    case 'T-19': {
      const failed: TaskGuardName[] = [];
      if (!present(need(facts, 'reason', code))) failed.push('reason_given');
      if (chooseReadinessTarget(needBoolean(facts, 'readinessRc01ToRc08Passed', code)) !== to) failed.push('target_matches_readiness');
      return result(failed);
    }
    default: {
      const unknown: never = code;
      throw new TypeError(`Không có guard cho mã ${String(unknown)}`);
    }
  }
}

export type TaskTransitionDecision =
  | { readonly allowed: true; readonly transition: TaskTransition }
  | { readonly allowed: false; readonly transition: TaskTransition; readonly failed: readonly TaskGuardName[] };

/**
 * Kiểm cặp rồi guard: cặp ngoài bảng ném InvalidTransitionError (`invalid_transition`); cặp có trong bảng trả quyết
 * định kèm mã T-NN và tên guard không đạt (nếu có). Trạng thái Task không đổi ở đây: bên gọi ghi khi `allowed`.
 */
export function decideTaskTransition(from: string, to: string, facts: TaskGuardFacts): TaskTransitionDecision {
  const transition = assertTaskTransition(from, to);
  const guard = checkTaskGuards(transition, facts);
  return guard.passed ? { allowed: true, transition } : { allowed: false, transition, failed: guard.failed };
}

/**
 * Guard của T-17 (bỏ Task Draft): Task chưa từng thuộc baseline. T-17 không phải chuyển trạng thái mà là đặt
 * deleted_at trên Task Draft (database 5.3; EC09), nên không đi qua hàm kiểm cặp: PID-00049 gọi hàm này trước khi
 * đặt deleted_at.
 */
export function checkDiscardDraftTask(facts: { readonly everInBaseline: boolean }): GuardResult {
  return result(facts.everInBaseline ? ['never_in_baseline'] : []);
}
