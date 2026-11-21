// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineStateMachine, type StateMachine, type StateMachineDeclaration } from './define';
import { StateMachineDefinitionError } from './errors';
import {
  compareCodePoints,
  compareStateTransitionRows,
  renderStateTransitionSql,
  stateTransitionRows,
  stateTransitionStatements,
  STATEMENT_BREAKPOINT,
  type StateTransitionRow,
} from './sql';

const TESTDATA = join(__dirname, 'testdata');

function goldenDeclarations(): StateMachineDeclaration[] {
  return JSON.parse(readFileSync(join(TESTDATA, 'golden-machines.json'), 'utf8')) as StateMachineDeclaration[];
}

/** golden.txt as committed (LF); a Windows checkout with core.autocrlf=true turns it into CRLF (EC15). */
function goldenSql(): string {
  return readFileSync(join(TESTDATA, 'golden.txt'), 'utf8').replaceAll('\r', '');
}

function reversed(declaration: StateMachineDeclaration): StateMachineDeclaration {
  return { ...declaration, states: [...declaration.states].reverse(), transitions: [...declaration.transitions].reverse() };
}

const ORDER = defineStateMachine({
  machine: 'order',
  states: ['New', 'Paid', 'Shipped', 'Cancelled'],
  transitions: [
    { from: 'New', to: 'Paid', code: 'O-01' },
    { from: 'Paid', to: 'Shipped', code: 'O-02' },
    { from: 'New', to: 'Cancelled' },
    { from: 'Paid', to: 'Cancelled', code: 'O-03' },
  ],
});

const INVOICE = defineStateMachine({
  machine: 'invoice',
  states: ['Open', 'Closed'],
  transitions: [{ from: 'Open', to: 'Closed' }],
});

describe('stateTransitionRows', () => {
  it('trả một dòng mỗi cặp, sắp theo machine, from_state, to_state', () => {
    expect(stateTransitionRows([ORDER, INVOICE])).toEqual([
      { machine: 'invoice', fromState: 'Open', toState: 'Closed', code: null },
      { machine: 'order', fromState: 'New', toState: 'Cancelled', code: null },
      { machine: 'order', fromState: 'New', toState: 'Paid', code: 'O-01' },
      { machine: 'order', fromState: 'Paid', toState: 'Cancelled', code: 'O-03' },
      { machine: 'order', fromState: 'Paid', toState: 'Shipped', code: 'O-02' },
    ]);
  });

  it('so theo code point, không theo đơn vị UTF-16 hay locale', () => {
    // U+FF3A sorts before U+1D400 by code point, after it by UTF-16 unit (0xFF3A > 0xD835).
    expect(compareCodePoints('Ｚ', '𝐀')).toBeLessThan(0);
    expect(compareCodePoints('𝐀', 'Ｚ')).toBeGreaterThan(0);
    expect(compareCodePoints('Z', 'a')).toBeLessThan(0);
    expect(compareCodePoints('a', 'á')).toBeLessThan(0);
    expect(compareCodePoints('In', 'In Progress')).toBeLessThan(0);
    expect(compareCodePoints('𝐀', '𝐀')).toBe(0);
    expect(compareCodePoints('𝐀', '𝐁')).toBeLessThan(0);
    const values = ['𝐀', 'Ｚ', 'Đ', 'é', 'Z', 'a'];
    expect([...values].sort(compareCodePoints)).toEqual(['Z', 'a', 'é', 'Đ', 'Ｚ', '𝐀']);
  });
});

describe('renderStateTransitionSql', () => {
  it('xác định khi đổi thứ tự', () => {
    const declarations = goldenDeclarations();
    const first = renderStateTransitionSql(declarations.map((d) => defineStateMachine(d)));
    const second = renderStateTransitionSql(declarations.map((d) => defineStateMachine(d)));
    const reorderedMachines = renderStateTransitionSql([...declarations].reverse().map((d) => defineStateMachine(d)));
    const reorderedInside = renderStateTransitionSql(declarations.map((d) => defineStateMachine(reversed(d))));
    expect(second).toBe(first);
    expect(reorderedMachines).toBe(first);
    expect(reorderedInside).toBe(first);
    expect(stateTransitionStatements([...declarations].reverse().map((d) => defineStateMachine(reversed(d))))).toEqual(
      stateTransitionStatements(declarations.map((d) => defineStateMachine(d))),
    );
  });

  it('khớp golden.txt', () => {
    const sql = renderStateTransitionSql(goldenDeclarations().map((d) => defineStateMachine(d)));
    expect(sql).toBe(goldenSql());
    expect(sql).not.toContain('\r');
    expect(sql.endsWith(';\n')).toBe(true);
    expect(sql.endsWith('\n\n')).toBe(false);
    // Quotes doubled, no E'' or $$ quoting; the backslash stays literal (standard_conforming_strings).
    expect(sql).toContain("'Researcher''s Draft'");
    expect(sql).toContain("'N''02'");
    expect(sql).toContain("'Lưu\\trữ'");
    expect(sql).not.toMatch(/E'|\$\$/);
  });

  it('ghép hai dòng chú thích, câu DELETE, dấu tách drizzle-kit, câu INSERT', () => {
    const machines = [ORDER, INVOICE];
    const [remove, upsert] = stateTransitionStatements(machines);
    const sql = renderStateTransitionSql(machines);
    const lines = sql.split('\n');
    expect(lines[0]).toBe('-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).');
    expect(lines[1]).toBe('-- Machine (số cặp): invoice (1), order (4).');
    expect(sql).toBe(`${lines[0]}\n${lines[1]}\n${remove}\n${STATEMENT_BREAKPOINT}\n${upsert}\n`);
    expect(remove).toBe(
      [
        'DELETE FROM app.state_transition',
        "WHERE machine IN ('invoice', 'order')",
        '  AND (machine, from_state, to_state) NOT IN (VALUES',
        "    ('invoice', 'Open', 'Closed'),",
        "    ('order', 'New', 'Cancelled'),",
        "    ('order', 'New', 'Paid'),",
        "    ('order', 'Paid', 'Cancelled'),",
        "    ('order', 'Paid', 'Shipped'));",
      ].join('\n'),
    );
    expect(upsert).toBe(
      [
        'INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES',
        "  ('invoice', 'Open', 'Closed', NULL),",
        "  ('order', 'New', 'Cancelled', NULL),",
        "  ('order', 'New', 'Paid', 'O-01'),",
        "  ('order', 'Paid', 'Cancelled', 'O-03'),",
        "  ('order', 'Paid', 'Shipped', 'O-02')",
        'ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code',
        '  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;',
      ].join('\n'),
    );
  });

  it('danh sách machine sai', () => {
    const functions: [string, (machines: readonly StateMachine[]) => unknown][] = [
      ['stateTransitionRows', stateTransitionRows],
      ['stateTransitionStatements', stateTransitionStatements],
      ['renderStateTransitionSql', renderStateTransitionSql],
      ['compareStateTransitionRows', (machines) => compareStateTransitionRows([], machines)],
    ];
    const duplicate = defineStateMachine({ machine: 'order', states: ['A', 'B'], transitions: [{ from: 'A', to: 'B' }] });
    for (const [name, run] of functions) {
      expect(() => run([]), `${name}: rỗng`).toThrow(StateMachineDefinitionError);
      expect(() => run([]), `${name}: rỗng`).toThrow(/danh sách machine rỗng/);
      let error: unknown;
      try {
        run([ORDER, INVOICE, duplicate]);
      } catch (thrown) {
        error = thrown;
      }
      expect(error, `${name}: trùng tên`).toBeInstanceOf(StateMachineDefinitionError);
      expect((error as StateMachineDefinitionError).machine).toBe('order');
      expect((error as StateMachineDefinitionError).message).toContain('trùng tên');
      // A data declaration in the list goes through defineStateMachine and is checked the same way.
      const wrong = { machine: 'bad', states: ['A'], transitions: [{ from: 'A', to: 'A' }] } as unknown as StateMachine;
      expect(() => run([ORDER, wrong]), `${name}: khai báo sai`).toThrow(StateMachineDefinitionError);
    }
  });
});

describe('compareStateTransitionRows', () => {
  const declared = stateTransitionRows([ORDER, INVOICE]);
  const row = (machine: string, fromState: string, toState: string, code: string | null): StateTransitionRow => ({
    machine,
    fromState,
    toState,
    code,
  });

  it('so dòng', () => {
    // Rows of `order` as a database could hold them: New → Paid missing, Shipped → New extra, Paid → Shipped with
    // another code; rows of `other` are not declared here and must be ignored.
    const actual = [
      row('order', 'New', 'Cancelled', null),
      row('order', 'Paid', 'Cancelled', 'O-03'),
      row('order', 'Paid', 'Shipped', 'O-99'),
      row('order', 'Shipped', 'New', null),
      row('invoice', 'Open', 'Closed', null),
      row('other', 'X', 'Y', 'Z-01'),
    ];
    expect(compareStateTransitionRows(actual, [ORDER, INVOICE])).toEqual({
      missing: [row('order', 'New', 'Paid', 'O-01')],
      unexpected: [row('order', 'Shipped', 'New', null)],
      codeMismatch: [{ expected: row('order', 'Paid', 'Shipped', 'O-02'), actualCode: 'O-99' }],
    });

    // Only `order` passed in: the missing invoice row is not reported.
    expect(compareStateTransitionRows(actual.slice(0, 4), [ORDER]).missing).toEqual([row('order', 'New', 'Paid', 'O-01')]);

    // Matching rows, in any order, with rows of another machine: all three empty.
    const matching = [...declared].reverse().concat(row('other', 'X', 'Y', null));
    expect(compareStateTransitionRows(matching, [ORDER, INVOICE])).toEqual({ missing: [], unexpected: [], codeMismatch: [] });

    // Code NULL in the database versus a declared code, and the other way round.
    const nullCode = declared.map((r) => (r.code === 'O-01' ? { ...r, code: null } : r));
    expect(compareStateTransitionRows(nullCode, [ORDER, INVOICE]).codeMismatch).toEqual([
      { expected: row('order', 'New', 'Paid', 'O-01'), actualCode: null },
    ]);
    const extraCode = declared.map((r) => (r.machine === 'invoice' ? { ...r, code: 'I-01' } : r));
    expect(compareStateTransitionRows(extraCode, [ORDER, INVOICE]).codeMismatch).toEqual([
      { expected: row('invoice', 'Open', 'Closed', null), actualCode: 'I-01' },
    ]);
  });

  it('nhận dòng đọc thẳng từ bảng (cột snake_case)', () => {
    const database = declared.map((r) => ({ machine: r.machine, from_state: r.fromState, to_state: r.toState, code: r.code }));
    expect(compareStateTransitionRows(database, [ORDER, INVOICE])).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    const missingOne = database.filter((r) => !(r.machine === 'invoice'));
    expect(compareStateTransitionRows(missingOne, [ORDER, INVOICE]).missing).toEqual([row('invoice', 'Open', 'Closed', null)]);
  });
});
