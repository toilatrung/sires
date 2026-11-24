// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Khai báo bốn state machine library ở domain (PID-00024 S02, H3): đúng các cặp viết tay từ khối INSERT của
// docs/database/ddl/library.sql, và assertTransition của @sires/platform từ chối mọi cặp khác. Không cần database.

import { assertTransition, InvalidTransitionError } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { stateMachines } from './state-machines';

/** Chép tay từ library.sql (State machine 18.2), theo thứ tự của khối INSERT. */
const DDL_PAIRS = {
  discovered_result: ['New → Selected', 'New → Rejected', 'Selected → New', 'Selected → Imported'],
  reference_approval: ['Pending Approval → Trusted', 'Pending Approval → Rejected', 'Trusted → Revoked', 'Revoked → Trusted'],
  reference_indexing: [
    'Not Indexed → Queued', 'Not Indexed → Unavailable', 'Queued → Indexing', 'Indexing → Indexed', 'Indexing → Failed',
    'Failed → Queued', 'Unavailable → Queued', 'Indexed → Queued',
  ],
  project_reference_selection: ['Active → Removed', 'Removed → Active'],
} as const;

describe('state machine library (PID-00024 S02)', () => {
  it('khai báo đúng các cặp của DDL', () => {
    expect(Object.fromEntries(stateMachines.map((m) => [m.machine, m.transitions.map((t) => `${t.from} → ${t.to}`)])))
      .toEqual(DDL_PAIRS);
    // Không mã PRD, không actor: DDL không có; điều kiện chuyển do PID tính năng thêm.
    for (const machine of stateMachines) {
      for (const transition of machine.transitions) expect(transition).toMatchObject({ code: null, actors: [] });
    }
  });

  it('domain từ chối cặp ngoài bảng', () => {
    let accepted = 0;
    let rejected = 0;
    for (const machine of stateMachines) {
      const pairs = new Set<string>((DDL_PAIRS as Record<string, readonly string[]>)[machine.machine]);
      for (const from of machine.states) {
        for (const to of machine.states) {
          if (pairs.has(`${from} → ${to}`)) {
            expect(assertTransition(machine, from, to)).toMatchObject({ from, to });
            accepted += 1;
          } else {
            expect(() => assertTransition(machine, from, to), `${machine.machine}: ${from} → ${to}`).toThrow(InvalidTransitionError);
            rejected += 1;
          }
        }
      }
    }
    // 4² + 4² + 6² + 2² = 72 cặp có thứ tự (kể cả giữ nguyên trạng thái): 18 nhận, 54 từ chối.
    expect({ accepted, rejected }).toEqual({ accepted: 18, rejected: 54 });
  });
});
