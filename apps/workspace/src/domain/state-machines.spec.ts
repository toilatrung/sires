// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// State machine workspace ở domain (PID-00017 S03; NFR-MAINT-003-AC01 phần workspace): mọi cặp có thứ tự của từng
// machine, so với bảng mong đợi viết tay từ PRD 18.2. Không cần database, không cần mạng.

import { InvalidTransitionError } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import {
  assertNotificationTransition,
  assertPendingActionTransition,
  assertResearchProjectTransition,
  NOTIFICATION_STATUSES,
  PENDING_ACTION_STATUSES,
  RESEARCH_PROJECT_STATUSES,
  stateMachines,
} from './state-machines';

const CASES = [
  { machine: 'research_project', states: RESEARCH_PROJECT_STATUSES, check: assertResearchProjectTransition,
    expected: ['Active → Archived', 'Archived → Active'] },
  { machine: 'pending_action', states: PENDING_ACTION_STATUSES, check: assertPendingActionTransition,
    expected: ['Open → Resolved', 'Open → Expired', 'Expired → Resolved'] },
  { machine: 'notification', states: NOTIFICATION_STATUSES, check: assertNotificationTransition,
    expected: ['Unread → Read'] },
] as const;

describe('state machine workspace (PID-00017 S03)', () => {
  it('mọi cặp (NFR-MAINT-003-AC01; EC13)', () => {
    let accepted = 0;
    let rejected = 0;
    for (const { machine, states, check, expected } of CASES) {
      for (const from of states) {
        for (const to of states) {
          const pair = `${from} → ${to}`;
          if ((expected as readonly string[]).includes(pair)) {
            expect(check(from, to), `${machine}: ${pair}`).toMatchObject({ from, to, code: null });
            accepted += 1;
          } else {
            let error: unknown;
            try {
              check(from, to);
            } catch (caught) {
              error = caught;
            }
            expect(error, `${machine}: ${pair}`).toBeInstanceOf(InvalidTransitionError);
            expect(error).toMatchObject({ code: 'invalid_transition', machine, currentState: from, targetState: to });
            rejected += 1;
          }
        }
      }
    }
    // 2×2 + 3×3 + 2×2 = 17 cặp có thứ tự: 6 nhận, 11 từ chối (gồm cùng trạng thái, EC13).
    expect({ accepted, rejected }).toEqual({ accepted: 6, rejected: 11 });
    // EC13: Resolved → Open, Read → Unread, Archived → Archived bị từ chối ở domain.
    expect(() => assertPendingActionTransition('Resolved', 'Open')).toThrow(InvalidTransitionError);
    expect(() => assertNotificationTransition('Read', 'Unread')).toThrow(InvalidTransitionError);
    expect(() => assertResearchProjectTransition('Archived', 'Archived')).toThrow(InvalidTransitionError);
  });

  it('mọi cặp — danh sách machine xuất cho helper sinh migration', () => {
    expect(stateMachines.map((m) => [m.machine, m.transitions.length])).toEqual([
      ['research_project', 2], ['pending_action', 3], ['notification', 1],
    ]);
  });
});
