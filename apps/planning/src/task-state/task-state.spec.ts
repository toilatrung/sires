// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine Task và PlanVersion ở domain (PID-00023 S02, S04, S05): không cần database, không cần mạng
// (NFR-MAINT-004). Bảng mong đợi viết tay từ PRD 9.8 (S02) và PRD 18.2 (S05), không đọc lại từ khai báo.

import { InvalidTransitionError } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import {
  assertPlanVersionTransition,
  assertTaskTransition,
  checkDiscardDraftTask,
  checkTaskGuards,
  chooseReadinessTarget,
  decideTaskTransition,
  isTaskStatus,
  PLAN_VERSION_STATUSES,
  stateMachines,
  TASK_STATUSES,
  type TaskGuardFacts,
  type TaskTransition,
} from '.';

/** 28 cặp của PRD 9.8 (bảng ở slice S02). */
const EXPECTED_TASK: Record<string, string> = {
  'Draft → Blocked': 'T-01', 'Draft → Ready': 'T-02', 'Blocked → Ready': 'T-03', 'Ready → Blocked': 'T-04',
  'Ready → Queued': 'T-05', 'Failed → Queued': 'T-05', 'Queued → In Progress': 'T-06', 'Queued → Ready': 'T-07',
  'In Progress → Waiting for User': 'T-08', 'Waiting for User → In Progress': 'T-09',
  'In Progress → Ready': 'T-10', 'In Progress → Blocked': 'T-10', 'Waiting for User → Ready': 'T-10',
  'Waiting for User → Blocked': 'T-10', 'In Progress → In Review': 'T-11', 'In Progress → Failed': 'T-12',
  'Waiting for User → Failed': 'T-12', 'In Review → Ready': 'T-13', 'In Review → Completed': 'T-14',
  'In Review → Blocked': 'T-15', 'Failed → Blocked': 'T-16', 'Blocked → Cancelled': 'T-18',
  'Ready → Cancelled': 'T-18', 'Queued → Cancelled': 'T-18', 'In Review → Cancelled': 'T-18',
  'Failed → Cancelled': 'T-18', 'Completed → Ready': 'T-19', 'Completed → Blocked': 'T-19',
};

/** Actor theo cột Actor của PRD 9.8. */
const SYSTEM_CODES = ['T-01', 'T-02', 'T-03', 'T-04', 'T-06', 'T-08', 'T-09', 'T-11', 'T-12', 'T-16'];

function rejection(from: string, to: string): InvalidTransitionError {
  try {
    assertTaskTransition(from, to);
  } catch (error) {
    if (error instanceof InvalidTransitionError) return error;
    throw error;
  }
  throw new Error(`${from} → ${to} không bị từ chối`);
}

describe('state machine Task (PID-00023 S02)', () => {
  it('mọi cặp trạng thái (PID-00023-AC01, NFR-MAINT-003-AC01; EC06)', () => {
    let accepted = 0;
    let rejected = 0;
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        const pair = `${from} → ${to}`;
        const expected = EXPECTED_TASK[pair];
        if (expected) {
          expect(assertTaskTransition(from, to), pair).toMatchObject({ from, to, code: expected });
          accepted += 1;
        } else {
          const error = rejection(from, to);
          expect({ code: error.code, machine: error.machine, currentState: error.currentState, targetState: error.targetState }, pair)
            .toEqual({ code: 'invalid_transition', machine: 'task', currentState: from, targetState: to });
          rejected += 1;
        }
      }
    }
    // 10 trạng thái → 100 cặp có thứ tự (gồm 10 cặp cùng trạng thái, EC06): đúng 28 nhận, 72 từ chối.
    expect({ accepted, rejected }).toEqual({ accepted: 28, rejected: 72 });
    for (const status of TASK_STATUSES) expect(() => assertTaskTransition(status, status)).toThrow(InvalidTransitionError);
  });

  it('mọi cặp trạng thái — actor theo PRD 9.8', () => {
    for (const [pair, code] of Object.entries(EXPECTED_TASK)) {
      const [from, to] = pair.split(' → ') as [string, string];
      const expected = SYSTEM_CODES.includes(code) ? ['system'] : code === 'T-18' ? ['researcher', 'system'] : ['researcher'];
      expect(assertTaskTransition(from, to).actors, pair).toEqual(expected);
    }
  });

  it('Ready sang Completed bị từ chối (DATA-STATE-001-AC01, TASK-STATE-001-AC01)', () => {
    const error = rejection('Ready', 'Completed');
    expect(error.code).toBe('invalid_transition');
    expect(error.currentState).toBe('Ready');
  });

  it('cancelled là trạng thái cuối (EC07)', () => {
    for (const to of TASK_STATUSES) expect(() => assertTaskTransition('Cancelled', to), to).toThrow(InvalidTransitionError);
  });

  it('completed chỉ qua T-19 (EC08)', () => {
    const allowed = TASK_STATUSES.filter((to) => {
      try {
        return assertTaskTransition('Completed', to).code === 'T-19';
      } catch {
        return false;
      }
    });
    expect(allowed).toEqual(['Blocked', 'Ready']);
  });

  it('không có T-17 (EC09)', () => {
    const [task] = stateMachines;
    expect(task?.machine).toBe('task');
    expect(task?.transitions.filter((t) => t.code === 'T-17')).toEqual([]);
    expect(task?.transitions).toHaveLength(28);
  });

  it('status lạ không phải trạng thái Task (EC10, phần domain)', () => {
    expect(isTaskStatus('Done')).toBe(false);
    expect(isTaskStatus('ready')).toBe(false);
    expect(TASK_STATUSES.every(isTaskStatus)).toBe(true);
    expect(() => assertTaskTransition('Ready', 'Done')).toThrow(InvalidTransitionError);
  });
});

describe('guard và chọn đích (PID-00023 S04)', () => {
  const t = (from: string, to: string): TaskTransition => assertTaskTransition(from, to);

  it('guard T-14 (TASK-STATE-001-AC04; EC12)', () => {
    // Một criterion chưa đạt: từ chối, trả tên guard; Task giữ In Review (hàm không đổi trạng thái).
    const decision = decideTaskTransition('In Review', 'Completed', { allCriteriaPassed: false, requiredOutputsAccepted: true });
    expect(decision).toMatchObject({ allowed: false, failed: ['all_criteria_passed'] });
    expect(decision.transition.code).toBe('T-14');
    expect(checkTaskGuards(t('In Review', 'Completed'), { allCriteriaPassed: true, requiredOutputsAccepted: false }))
      .toEqual({ passed: false, failed: ['required_outputs_accepted'] });
    expect(checkTaskGuards(t('In Review', 'Completed'), { allCriteriaPassed: false, requiredOutputsAccepted: false }))
      .toEqual({ passed: false, failed: ['all_criteria_passed', 'required_outputs_accepted'] });
    expect(decideTaskTransition('In Review', 'Completed', { allCriteriaPassed: true, requiredOutputsAccepted: true }))
      .toMatchObject({ allowed: true });
  });

  it('guard workflow (EC13)', () => {
    // T-05 kích hoạt: guard RC-01–RC-09 (Workflow hoạt động do PID-00074 ánh xạ active_workflow_exists từ dữ kiện đó).
    expect(checkTaskGuards(t('Ready', 'Queued'), { readinessRc01ToRc09Passed: false }))
      .toEqual({ passed: false, failed: ['readiness_rc01_rc09_passed'] });
    // T-18 hủy khi có Workflow hoạt động: từ chối.
    for (const from of ['Blocked', 'Ready', 'Queued', 'In Review', 'Failed']) {
      expect(checkTaskGuards(t(from, 'Cancelled'), { hasActiveWorkflow: true }), from)
        .toEqual({ passed: false, failed: ['no_active_workflow'] });
      expect(checkTaskGuards(t(from, 'Cancelled'), { hasActiveWorkflow: false }), from).toEqual({ passed: true });
    }
    // T-07 hủy kích hoạt khi Workflow đã Running: từ chối.
    expect(checkTaskGuards(t('Queued', 'Ready'), { workflowRunning: true })).toEqual({ passed: false, failed: ['workflow_not_running'] });
    expect(checkTaskGuards(t('Queued', 'Ready'), { workflowRunning: false })).toEqual({ passed: true });
  });

  it('chọn đích theo readiness (EC14)', () => {
    expect(chooseReadinessTarget(true)).toBe('Ready');
    expect(chooseReadinessTarget(false)).toBe('Blocked');
    for (const from of ['In Progress', 'Waiting for User']) {
      expect(checkTaskGuards(t(from, 'Ready'), { readinessRc01ToRc08Passed: true }), from).toEqual({ passed: true });
      expect(checkTaskGuards(t(from, 'Blocked'), { readinessRc01ToRc08Passed: false }), from).toEqual({ passed: true });
      expect(checkTaskGuards(t(from, 'Ready'), { readinessRc01ToRc08Passed: false }), from)
        .toEqual({ passed: false, failed: ['target_matches_readiness'] });
      expect(checkTaskGuards(t(from, 'Blocked'), { readinessRc01ToRc08Passed: true }), from)
        .toEqual({ passed: false, failed: ['target_matches_readiness'] });
    }
    expect(checkTaskGuards(t('Completed', 'Ready'), { reason: 'Sửa kết quả', readinessRc01ToRc08Passed: true })).toEqual({ passed: true });
    expect(checkTaskGuards(t('Completed', 'Blocked'), { reason: 'Sửa kết quả', readinessRc01ToRc08Passed: false })).toEqual({ passed: true });
    expect(checkTaskGuards(t('Completed', 'Ready'), { reason: 'Sửa kết quả', readinessRc01ToRc08Passed: false }))
      .toEqual({ passed: false, failed: ['target_matches_readiness'] });
  });

  // Bảng guard của S04: mỗi mã một ca đạt, một ca không đạt (mã không có guard: luôn đạt).
  const cases: { pair: [string, string]; pass: TaskGuardFacts; fail?: TaskGuardFacts; failed?: string[] }[] = [
    { pair: ['Draft', 'Blocked'], pass: { readinessRc01ToRc08Passed: false }, fail: { readinessRc01ToRc08Passed: true }, failed: ['readiness_rc01_rc08_not_passed'] },
    { pair: ['Draft', 'Ready'], pass: { readinessRc01ToRc08Passed: true }, fail: { readinessRc01ToRc08Passed: false }, failed: ['readiness_rc01_rc08_passed'] },
    { pair: ['Blocked', 'Ready'], pass: { readinessRc01ToRc08Passed: true }, fail: { readinessRc01ToRc08Passed: false }, failed: ['readiness_rc01_rc08_passed'] },
    { pair: ['Ready', 'Blocked'], pass: { readinessRc01ToRc08Passed: false }, fail: { readinessRc01ToRc08Passed: true }, failed: ['readiness_rc01_rc08_not_passed'] },
    { pair: ['Ready', 'Queued'], pass: { readinessRc01ToRc09Passed: true }, fail: { readinessRc01ToRc09Passed: false }, failed: ['readiness_rc01_rc09_passed'] },
    { pair: ['Failed', 'Queued'], pass: { readinessRc01ToRc09Passed: true }, fail: { readinessRc01ToRc09Passed: false }, failed: ['readiness_rc01_rc09_passed'] },
    { pair: ['Queued', 'In Progress'], pass: {} },
    { pair: ['Queued', 'Ready'], pass: { workflowRunning: false }, fail: { workflowRunning: true }, failed: ['workflow_not_running'] },
    { pair: ['In Progress', 'Waiting for User'], pass: {} },
    { pair: ['Waiting for User', 'In Progress'], pass: {} },
    { pair: ['In Progress', 'Ready'], pass: { readinessRc01ToRc08Passed: true }, fail: { readinessRc01ToRc08Passed: false }, failed: ['target_matches_readiness'] },
    { pair: ['In Progress', 'In Review'], pass: { requiredOutputsPresent: true }, fail: { requiredOutputsPresent: false }, failed: ['required_outputs_present'] },
    { pair: ['In Progress', 'Failed'], pass: {} },
    { pair: ['Waiting for User', 'Failed'], pass: {} },
    { pair: ['In Review', 'Ready'], pass: { feedback: 'Thiếu nguồn', reasonCode: 'missing_evidence' }, fail: { feedback: '  ', reasonCode: 'missing_evidence' }, failed: ['feedback_and_reason_code_given'] },
    { pair: ['In Review', 'Completed'], pass: { allCriteriaPassed: true, requiredOutputsAccepted: true }, fail: { allCriteriaPassed: false, requiredOutputsAccepted: true }, failed: ['all_criteria_passed'] },
    { pair: ['In Review', 'Blocked'], pass: { reason: 'Chờ dữ liệu', reasonCode: 'blocked_input' }, fail: { reason: 'Chờ dữ liệu', reasonCode: null }, failed: ['reason_and_reason_code_given'] },
    { pair: ['Failed', 'Blocked'], pass: { readinessRc01ToRc08Passed: false }, fail: { readinessRc01ToRc08Passed: true }, failed: ['readiness_rc01_rc08_not_passed'] },
    { pair: ['Ready', 'Cancelled'], pass: { hasActiveWorkflow: false }, fail: { hasActiveWorkflow: true }, failed: ['no_active_workflow'] },
    { pair: ['Completed', 'Ready'], pass: { reason: 'Mở lại', readinessRc01ToRc08Passed: true }, fail: { reason: '', readinessRc01ToRc08Passed: true }, failed: ['reason_given'] },
  ];

  it('mỗi guard một ca đạt, một ca không đạt (bảng guard)', () => {
    const codes = new Set<string>();
    for (const { pair, pass, fail, failed } of cases) {
      const transition = t(...pair);
      codes.add(transition.code);
      expect(checkTaskGuards(transition, pass), pair.join(' → ')).toEqual({ passed: true });
      if (fail) expect(checkTaskGuards(transition, fail), pair.join(' → ')).toEqual({ passed: false, failed });
    }
    // Mọi mã có cặp đều có ca (T-17 có hàm riêng bên dưới).
    expect([...codes].sort()).toEqual([...new Set(Object.values(EXPECTED_TASK))].sort());
  });

  it('T-17: bỏ Task Draft khi chưa từng thuộc baseline (EC09)', () => {
    expect(checkDiscardDraftTask({ everInBaseline: false })).toEqual({ passed: true });
    expect(checkDiscardDraftTask({ everInBaseline: true })).toEqual({ passed: false, failed: ['never_in_baseline'] });
  });

  it('thiếu dữ kiện là lỗi của bên gọi, không phải guard không đạt', () => {
    expect(() => checkTaskGuards(t('In Review', 'Completed'), { allCriteriaPassed: true })).toThrow(/thiếu dữ kiện requiredOutputsAccepted/);
    expect(() => decideTaskTransition('Ready', 'Done', {})).toThrow(InvalidTransitionError);
  });
});

describe('state machine PlanVersion, phần domain (PID-00023 S05)', () => {
  it('plan_version — 4 cặp nhận, các cặp còn lại từ chối (NFR-MAINT-003-AC01; EC15)', () => {
    const expected: Record<string, string | null> = {
      'Draft → Proposed': null, 'Proposed → Approved': 'APR-01', 'Proposed → Rejected': null, 'Approved → Superseded': null,
    };
    let rejected = 0;
    for (const from of PLAN_VERSION_STATUSES) {
      for (const to of PLAN_VERSION_STATUSES) {
        const pair = `${from} → ${to}`;
        if (pair in expected) {
          expect(assertPlanVersionTransition(from, to).code, pair).toBe(expected[pair]);
        } else {
          expect(() => assertPlanVersionTransition(from, to), pair).toThrow(InvalidTransitionError);
          rejected += 1;
        }
      }
    }
    expect(rejected).toBe(21);
    expect(() => assertPlanVersionTransition('Approved', 'Draft')).toThrow(InvalidTransitionError);
    expect(() => assertPlanVersionTransition('Rejected', 'Proposed')).toThrow(InvalidTransitionError);
  });
});
