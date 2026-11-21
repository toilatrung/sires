// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { assertTransition, findTransition } from './check';
import { defineStateMachine } from './define';
import { InvalidTransitionError } from './errors';

// 4 states, 5 pairs, with and without code (PID-00158 S01).
const REVIEW = defineStateMachine({
  machine: 'review',
  states: ['Draft', 'In Review', 'Approved', 'Rejected'],
  transitions: [
    { from: 'Draft', to: 'In Review', code: 'R-01', actors: ['researcher'] },
    { from: 'In Review', to: 'Approved', code: 'APR-01', actors: ['researcher'] },
    { from: 'In Review', to: 'Rejected', code: 'R-02' },
    { from: 'Rejected', to: 'Draft', actors: ['researcher', 'system'] },
    { from: 'In Review', to: 'Draft' },
  ],
});

// Written by hand: every ordered pair of the 4 states, X → X included. A string or null is the expected code of an
// accepted pair; 'rejected' means InvalidTransitionError.
const EXPECTED: [string, string, string | null | 'rejected'][] = [
  ['Draft', 'Draft', 'rejected'],
  ['Draft', 'In Review', 'R-01'],
  ['Draft', 'Approved', 'rejected'],
  ['Draft', 'Rejected', 'rejected'],
  ['In Review', 'Draft', null],
  ['In Review', 'In Review', 'rejected'],
  ['In Review', 'Approved', 'APR-01'],
  ['In Review', 'Rejected', 'R-02'],
  ['Approved', 'Draft', 'rejected'],
  ['Approved', 'In Review', 'rejected'],
  ['Approved', 'Approved', 'rejected'],
  ['Approved', 'Rejected', 'rejected'],
  ['Rejected', 'Draft', null],
  ['Rejected', 'In Review', 'rejected'],
  ['Rejected', 'Approved', 'rejected'],
  ['Rejected', 'Rejected', 'rejected'],
];

describe('assertTransition, findTransition', () => {
  it('mọi cặp có thứ tự', () => {
    expect(EXPECTED).toHaveLength(REVIEW.states.length ** 2);
    for (const [from, to, expected] of EXPECTED) {
      const found = findTransition(REVIEW, from, to);
      if (expected === 'rejected') {
        expect(found, `${from} → ${to}`).toBeUndefined();
        let thrown: unknown;
        try {
          assertTransition(REVIEW, from, to);
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${from} → ${to}`).toBeInstanceOf(InvalidTransitionError);
        const error = thrown as InvalidTransitionError;
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('InvalidTransitionError');
        expect(error.code).toBe('invalid_transition');
        expect(error.machine).toBe('review');
        expect(error.currentState).toBe(from);
        expect(error.targetState).toBe(to);
        expect(error.message).toBe(`Chuyển trạng thái không hợp lệ cho review: ${from} → ${to}`);
      } else {
        expect(found, `${from} → ${to}`).toBeDefined();
        expect(found?.code).toBe(expected);
        expect(assertTransition(REVIEW, from, to)).toBe(found);
      }
    }
  });

  it('trả cặp kèm actors như khai báo', () => {
    expect(assertTransition(REVIEW, 'Rejected', 'Draft')).toEqual({
      from: 'Rejected',
      to: 'Draft',
      code: null,
      actors: ['researcher', 'system'],
    });
    expect(assertTransition(REVIEW, 'In Review', 'Rejected').actors).toEqual([]);
  });

  it('từ chối trạng thái không có trong khai báo', () => {
    expect(findTransition(REVIEW, 'Archived', 'Draft')).toBeUndefined();
    expect(() => assertTransition(REVIEW, 'Draft', 'Archived')).toThrow(InvalidTransitionError);
    expect(() => assertTransition(REVIEW, 'draft', 'in review')).toThrow(InvalidTransitionError);
  });
});
