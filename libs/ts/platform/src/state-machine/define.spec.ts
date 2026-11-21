// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { describe, expect, it } from 'vitest';
import { defineStateMachine, type StateMachineDeclaration } from './define';
import { StateMachineDefinitionError } from './errors';

const VALID = {
  machine: 'sample_job',
  states: ['Queued', 'Running', 'Waiting for User', 'Done'],
  transitions: [
    { from: 'Queued', to: 'Running', code: 'J-01', actors: ['system'] },
    { from: 'Running', to: 'Waiting for User', actors: ['agent', 'system'] },
    { from: 'Waiting for User', to: 'Running', code: 'J-02', actors: ['researcher'] },
    { from: 'Running', to: 'Done' },
  ],
} as const;

/** Builds a declaration from VALID with some fields replaced; bypasses the static types on purpose. */
function variant(patch: Record<string, unknown>): StateMachineDeclaration {
  return { ...VALID, ...patch } as unknown as StateMachineDeclaration;
}

function withPair(pair: Record<string, unknown>): StateMachineDeclaration {
  return variant({ transitions: [...VALID.transitions, pair] });
}

function definitionError(declaration: unknown): StateMachineDefinitionError {
  try {
    defineStateMachine(declaration as StateMachineDeclaration);
  } catch (error) {
    expect(error).toBeInstanceOf(StateMachineDefinitionError);
    return error as StateMachineDefinitionError;
  }
  throw new Error('defineStateMachine không ném lỗi');
}

describe('defineStateMachine', () => {
  it('nhận khai báo hợp lệ', () => {
    const machine = defineStateMachine(VALID);
    expect(machine.machine).toBe('sample_job');
    expect(machine.states).toEqual(['Queued', 'Running', 'Waiting for User', 'Done']);
    expect(machine.transitions).toEqual([
      { from: 'Queued', to: 'Running', code: 'J-01', actors: ['system'] },
      { from: 'Running', to: 'Waiting for User', code: null, actors: ['agent', 'system'] },
      { from: 'Waiting for User', to: 'Running', code: 'J-02', actors: ['researcher'] },
      { from: 'Running', to: 'Done', code: null, actors: [] },
    ]);
  });

  it('nhận code null và actors rỗng như khi không khai báo', () => {
    const machine = defineStateMachine({
      machine: 'a1',
      states: ['A', 'B'],
      transitions: [{ from: 'A', to: 'B', code: null, actors: [] }],
    });
    expect(machine.transitions).toEqual([{ from: 'A', to: 'B', code: null, actors: [] }]);
  });

  it('nhận giá trị có nháy đơn, khoảng trắng giữa và ký tự không phải ASCII', () => {
    const machine = defineStateMachine({
      machine: 'quotes',
      states: ["Researcher's Draft", 'Đã duyệt', '𝐀 mới'],
      transitions: [
        { from: "Researcher's Draft", to: 'Đã duyệt', code: "APR'01" },
        { from: 'Đã duyệt', to: '𝐀 mới' },
      ],
    });
    expect(machine.states).toEqual(["Researcher's Draft", 'Đã duyệt', '𝐀 mới']);
  });

  describe('từ chối khai báo sai', () => {
    const cases: [string, unknown, string, string][] = [
      ['tên machine chữ hoa', variant({ machine: 'Sample_job' }), 'Sample_job', '"Sample_job"'],
      ['tên machine có khoảng trắng', variant({ machine: 'sample job' }), 'sample job', '"sample job"'],
      ['tên machine có gạch nối', variant({ machine: 'sample-job' }), 'sample-job', '"sample-job"'],
      ['tên machine bắt đầu bằng số', variant({ machine: '1job' }), '1job', '"1job"'],
      ['tên machine có xuống dòng cuối', variant({ machine: 'sample_job\n' }), 'sample_job\n', '"sample_job\\n"'],
      ['tên machine rỗng', variant({ machine: '' }), '', '""'],
      ['tên machine không phải chuỗi', variant({ machine: 42 }), '42', '42'],
      ['states rỗng', variant({ states: [] }), 'sample_job', 'states'],
      ['states không phải danh sách', variant({ states: 'Queued' }), 'sample_job', 'states'],
      ['trạng thái trùng', variant({ states: [...VALID.states, 'Running'] }), 'sample_job', '"Running"'],
      ['transitions rỗng', variant({ transitions: [] }), 'sample_job', 'transitions'],
      ['transitions không phải danh sách', variant({ transitions: {} }), 'sample_job', 'transitions'],
      ['cặp trùng', withPair({ from: 'Queued', to: 'Running', code: 'J-01' }), 'sample_job', '"Queued" → "Running"'],
      ['cặp trùng khác mã', withPair({ from: 'Running', to: 'Done', code: 'J-09' }), 'sample_job', '"Running" → "Done"'],
      ['cặp X → X', withPair({ from: 'Done', to: 'Done' }), 'sample_job', '"Done" → "Done"'],
      ['from ngoài states', withPair({ from: 'Archived', to: 'Done' }), 'sample_job', '"Archived"'],
      ['to ngoài states', withPair({ from: 'Done', to: 'Archived' }), 'sample_job', '"Archived"'],
      ['trạng thái rỗng', variant({ states: [...VALID.states, ''] }), 'sample_job', 'rỗng'],
      ['trạng thái có U+0000', variant({ states: [...VALID.states, 'Do\u0000ne'] }), 'sample_job', '"Do\\u0000ne"'],
      ['trạng thái có U+001F', variant({ states: [...VALID.states, 'Do\u001fne'] }), 'sample_job', '"Do\\u001fne"'],
      ['trạng thái có U+007F', variant({ states: [...VALID.states, 'Do\u007fne'] }), 'sample_job', '"Do\u007fne"'],
      ['trạng thái có tab giữa', variant({ states: [...VALID.states, 'Do\tne'] }), 'sample_job', '"Do\\tne"'],
      ['trạng thái có khoảng trắng đầu', variant({ states: [...VALID.states, ' Archived'] }), 'sample_job', '" Archived"'],
      ['trạng thái có khoảng trắng cuối', variant({ states: [...VALID.states, 'Archived '] }), 'sample_job', '"Archived "'],
      ['trạng thái có NBSP cuối', variant({ states: [...VALID.states, 'Archived\u{a0}'] }), 'sample_job', '"Archived\u{a0}"'],
      ['trạng thái có U+3000 đầu', variant({ states: [...VALID.states, '\u{3000}Archived'] }), 'sample_job', '"\u{3000}Archived"'],
      ['trạng thái có surrogate lẻ', variant({ states: [...VALID.states, 'A\ud800'] }), 'sample_job', 'surrogate'],
      ['trạng thái không phải chuỗi', variant({ states: [...VALID.states, 7] }), 'sample_job', '7'],
      ['from rỗng', withPair({ from: '', to: 'Done' }), 'sample_job', 'from rỗng'],
      ['to thiếu', withPair({ from: 'Done' }), 'sample_job', 'undefined'],
      ['code rỗng', withPair({ from: 'Done', to: 'Queued', code: '' }), 'sample_job', 'rỗng'],
      ['code có khoảng trắng cuối', withPair({ from: 'Done', to: 'Queued', code: 'J-03 ' }), 'sample_job', '"J-03 "'],
      ['code có ký tự điều khiển', withPair({ from: 'Done', to: 'Queued', code: 'J\n03' }), 'sample_job', '"J\\n03"'],
      ['code không phải chuỗi', withPair({ from: 'Done', to: 'Queued', code: 3 }), 'sample_job', '3'],
      ['actor ngoài ba giá trị', withPair({ from: 'Done', to: 'Queued', actors: ['admin'] }), 'sample_job', '"admin"'],
      ['actor viết hoa', withPair({ from: 'Done', to: 'Queued', actors: ['Researcher'] }), 'sample_job', '"Researcher"'],
      ['actors không phải danh sách', withPair({ from: 'Done', to: 'Queued', actors: 'agent' }), 'sample_job', '"agent"'],
      ['cặp không phải object', variant({ transitions: ['Queued → Running'] }), 'sample_job', '"Queued → Running"'],
      ['khai báo không phải object', null, '', 'null'],
    ];

    it.each(cases)('%s', (_name, declaration, machine, wrongValue) => {
      const error = definitionError(declaration);
      expect(error.machine).toBe(machine);
      expect(error.reason).toContain(wrongValue);
      expect(error.message).toContain(wrongValue);
      if (machine !== '') expect(error.message).toContain(JSON.stringify(machine));
    });
  });

  it('không sửa được', () => {
    const states = ['A', 'B', 'C'];
    const actors: ('agent' | 'system')[] = ['agent'];
    const transitions = [
      { from: 'A', to: 'B', code: 'X-01', actors },
      { from: 'B', to: 'C' },
    ];
    const machine = defineStateMachine({ machine: 'frozen', states, transitions });

    expect(Object.isFrozen(machine)).toBe(true);
    expect(Object.isFrozen(machine.states)).toBe(true);
    expect(Object.isFrozen(machine.transitions)).toBe(true);
    expect(machine.transitions.every((t) => Object.isFrozen(t) && Object.isFrozen(t.actors))).toBe(true);

    const writable = machine as unknown as {
      machine: string;
      states: string[];
      transitions: { code: string | null; actors: string[] }[];
    };
    expect(() => {
      writable.machine = 'other';
    }).toThrow(TypeError);
    expect(() => writable.states.push('D')).toThrow(TypeError);
    expect(() => {
      writable.states[0] = 'Z';
    }).toThrow(TypeError);
    expect(() => writable.transitions.pop()).toThrow(TypeError);
    expect(() => {
      writable.transitions[0]!.code = 'X-99';
    }).toThrow(TypeError);
    expect(() => writable.transitions[0]!.actors.push('researcher')).toThrow(TypeError);

    // The declaration given in is copied: changing it later does not change the machine.
    states.push('D');
    actors.push('system');
    transitions.push({ from: 'C', to: 'A' });
    expect(machine.states).toEqual(['A', 'B', 'C']);
    expect(machine.transitions).toEqual([
      { from: 'A', to: 'B', code: 'X-01', actors: ['agent'] },
      { from: 'B', to: 'C', code: null, actors: [] },
    ]);
  });
});
