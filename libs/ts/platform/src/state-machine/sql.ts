// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Rows and SQL of app.state_transition generated from machine declarations (PID-00158, DEC-57, DR-01). The SQL is fixed
// text pasted into a migration (architecture 6.10): a sync that only touches the machines passed in. The exact text is
// pinned by testdata/golden.txt; the Python twin (sires_common.state_machine) must produce the same bytes.

import { ensureStateMachine, type StateMachine } from './define';
import { StateMachineDefinitionError } from './errors';

/** One row of app.state_transition; `code` is null when the pair has no code. */
export interface StateTransitionRow {
  readonly machine: string;
  readonly fromState: string;
  readonly toState: string;
  readonly code: string | null;
}

/** A row as read with `SELECT machine, from_state, to_state, code FROM app.state_transition` (node-postgres). */
export interface DatabaseStateTransitionRow {
  readonly machine: string;
  readonly from_state: string;
  readonly to_state: string;
  readonly code: string | null;
}

export interface StateTransitionCodeMismatch {
  /** The declared row (with the declared code). */
  readonly expected: StateTransitionRow;
  /** The code found in the database. */
  readonly actualCode: string | null;
}

/** Result of compareStateTransitionRows: all three empty when the rows match the declarations. */
export interface StateTransitionDiff {
  /** Declared, not in the rows. */
  readonly missing: StateTransitionRow[];
  /** In the rows of a machine passed in, not declared. */
  readonly unexpected: StateTransitionRow[];
  /** Same pair, other code. */
  readonly codeMismatch: StateTransitionCodeMismatch[];
}

/** Drizzle-kit statement separator; a plain comment for PostgreSQL. */
export const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

const HEADER = '-- SQL sinh từ khai báo state machine; không sửa tay (DR-01, DEC-57).';

/** Orders strings by Unicode code point, like Python's default str order (not UTF-16 units, not localeCompare). */
export function compareCodePoints(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return codePointRank(x) - codePointRank(y);
  }
  return a.length - b.length;
}

// For well-formed UTF-16, the first differing unit decides the code point order once surrogates (U+D800–U+DFFF, which
// encode U+10000 and above) rank after U+E000–U+FFFF.
function codePointRank(unit: number): number {
  if (unit >= 0xe000) return unit - 0x800;
  if (unit >= 0xd800) return unit + 0x2000;
  return unit;
}

function compareRows(a: StateTransitionRow, b: StateTransitionRow): number {
  return (
    compareCodePoints(a.machine, b.machine) ||
    compareCodePoints(a.fromState, b.fromState) ||
    compareCodePoints(a.toState, b.toState)
  );
}

/** Checks the list (not empty, no two machines with one name) and passes data declarations through defineStateMachine. */
function machineList(machines: readonly unknown[]): StateMachine[] {
  if (!Array.isArray(machines) || machines.length === 0) {
    throw new StateMachineDefinitionError('', 'danh sách machine rỗng hoặc không phải danh sách');
  }
  const seen = new Set<string>();
  const list: StateMachine[] = [];
  for (const item of machines) {
    const machine = ensureStateMachine(item);
    if (seen.has(machine.machine)) {
      throw new StateMachineDefinitionError(machine.machine, 'hai machine trùng tên trong danh sách');
    }
    seen.add(machine.machine);
    list.push(machine);
  }
  return list.sort((a, b) => compareCodePoints(a.machine, b.machine));
}

function rowsOf(list: readonly StateMachine[]): StateTransitionRow[] {
  const rows: StateTransitionRow[] = [];
  for (const machine of list) {
    for (const t of machine.transitions) {
      rows.push({ machine: machine.machine, fromState: t.from, toState: t.to, code: t.code });
    }
  }
  return rows.sort(compareRows);
}

/** One row per declared pair, ordered by machine, from_state, to_state (code point); declaration order is ignored. */
export function stateTransitionRows(machines: readonly StateMachine[]): StateTransitionRow[] {
  return rowsOf(machineList(machines));
}

function literal(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}

function statementsOf(list: readonly StateMachine[], rows: readonly StateTransitionRow[]): [string, string] {
  const remove = [
    'DELETE FROM app.state_transition',
    `WHERE machine IN (${list.map((m) => literal(m.machine)).join(', ')})`,
    '  AND (machine, from_state, to_state) NOT IN (VALUES',
    `${rows.map((r) => `    (${literal(r.machine)}, ${literal(r.fromState)}, ${literal(r.toState)})`).join(',\n')});`,
  ].join('\n');
  const upsert = [
    'INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES',
    rows.map((r) => `  (${[r.machine, r.fromState, r.toState, r.code].map(literal).join(', ')})`).join(',\n'),
    'ON CONFLICT (machine, from_state, to_state) DO UPDATE SET code = EXCLUDED.code',
    '  WHERE app.state_transition.code IS DISTINCT FROM EXCLUDED.code;',
  ].join('\n');
  return [remove, upsert];
}

/**
 * The two statements of the sync, to run one by one (Alembic `op.execute` on asyncpg runs one statement per call):
 * DELETE of the pairs of these machines that are no longer declared, then INSERT … ON CONFLICT updating the code.
 */
export function stateTransitionStatements(machines: readonly StateMachine[]): [string, string] {
  const list = machineList(machines);
  return statementsOf(list, rowsOf(list));
}

/** The sync SQL for a migration file: two comment lines, DELETE, `--> statement-breakpoint`, INSERT; LF, ends with LF. */
export function renderStateTransitionSql(machines: readonly StateMachine[]): string {
  const list = machineList(machines);
  const rows = rowsOf(list);
  const [remove, upsert] = statementsOf(list, rows);
  const counts = list.map((m) => `${m.machine} (${m.transitions.length})`).join(', ');
  return [HEADER, `-- Machine (số cặp): ${counts}.`, remove, STATEMENT_BREAKPOINT, upsert, ''].join('\n');
}

function rowKey(machine: string, fromState: string, toState: string): string {
  return JSON.stringify([machine, fromState, toState]);
}

/**
 * Compares rows read from the database with the declarations, for the test run after every migration (DR-01). Rows
 * of machines not passed in are ignored. Accepts StateTransitionRow or the snake_case columns of the table.
 */
export function compareStateTransitionRows(
  actual: Iterable<StateTransitionRow | DatabaseStateTransitionRow>,
  machines: readonly StateMachine[],
): StateTransitionDiff {
  const list = machineList(machines);
  const names = new Set(list.map((m) => m.machine));
  const expected = new Map(rowsOf(list).map((row) => [rowKey(row.machine, row.fromState, row.toState), row]));

  const found = new Map<string, StateTransitionRow>();
  for (const raw of actual) {
    if (!names.has(raw.machine)) continue;
    const row: StateTransitionRow =
      'fromState' in raw
        ? { machine: raw.machine, fromState: raw.fromState, toState: raw.toState, code: raw.code ?? null }
        : { machine: raw.machine, fromState: raw.from_state, toState: raw.to_state, code: raw.code ?? null };
    found.set(rowKey(row.machine, row.fromState, row.toState), row);
  }

  const missing: StateTransitionRow[] = [];
  const codeMismatch: StateTransitionCodeMismatch[] = [];
  for (const [key, row] of expected) {
    const actualRow = found.get(key);
    if (actualRow === undefined) missing.push(row);
    else if (actualRow.code !== row.code) codeMismatch.push({ expected: row, actualCode: actualRow.code });
  }
  const unexpected = [...found].filter(([key]) => !expected.has(key)).map(([, row]) => row);
  return { missing, unexpected: unexpected.sort(compareRows), codeMismatch };
}
