// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test-only reader (excluded from the build): the `INSERT INTO app.state_transition (…) VALUES …;` statement of a
// docs/database/ddl file and its rows. Any other shape fails with the file name (PID-00158 EC20): the DDL is the
// reference (DEC-57), so a new shape must be looked at, never skipped.

import type { StateTransitionRow } from '../sql';

export interface DdlStateTransitionInsert {
  readonly file: string;
  /** The statement as written in the DDL, from INSERT to the closing semicolon. */
  readonly statement: string;
  readonly rows: StateTransitionRow[];
}

const START = 'INSERT INTO app.state_transition';
const COLUMNS_3 = ['machine', 'from_state', 'to_state'];
const COLUMNS_4 = [...COLUMNS_3, 'code'];

export class DdlFormatError extends Error {
  override readonly name = 'DdlFormatError';

  constructor(file: string, detail: string) {
    super(`${file}: không đọc được khối INSERT INTO app.state_transition — ${detail}`);
  }
}

/** Number of `INSERT INTO app.state_transition` statements in a DDL file. */
export function countStateTransitionInserts(sql: string): number {
  return sql.split(START).length - 1;
}

export function readStateTransitionInsert(file: string, sql: string): DdlStateTransitionInsert {
  const count = countStateTransitionInserts(sql);
  if (count !== 1) throw new DdlFormatError(file, `cần đúng 1 câu, có ${count}`);
  const start = sql.indexOf(START);
  let i = start + START.length;
  const fail = (detail: string): never => {
    const line = sql.slice(0, i).split('\n').length;
    throw new DdlFormatError(file, `${detail} (dòng ${line})`);
  };
  const skipSpace = (): void => {
    while (i < sql.length && /\s/.test(sql[i]!)) i += 1;
  };
  const expect = (token: string): void => {
    skipSpace();
    if (!sql.startsWith(token, i)) fail(`cần ${JSON.stringify(token)}`);
    i += token.length;
  };

  expect('(');
  const close = sql.indexOf(')', i);
  if (close < 0) fail('thiếu ")" sau danh sách cột');
  const columns = sql
    .slice(i, close)
    .split(',')
    .map((c) => c.trim());
  const known = [COLUMNS_3, COLUMNS_4].find((c) => c.join() === columns.join());
  if (known === undefined) fail(`danh sách cột ${JSON.stringify(columns)} không phải (machine, from_state, to_state[, code])`);
  i = close + 1;
  expect('VALUES');

  const rows: StateTransitionRow[] = [];
  for (;;) {
    expect('(');
    const values: (string | null)[] = [];
    for (;;) {
      skipSpace();
      if (sql.startsWith('NULL', i)) {
        values.push(null);
        i += 4;
      } else if (sql[i] === "'") {
        let value = '';
        i += 1;
        for (;;) {
          if (i >= sql.length) fail('chuỗi không đóng');
          if (sql[i] === "'") {
            if (sql[i + 1] === "'") {
              value += "'";
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          value += sql[i];
          i += 1;
        }
        values.push(value);
      } else {
        fail('giá trị không phải chuỗi hay NULL');
      }
      skipSpace();
      if (sql[i] === ',') {
        i += 1;
        continue;
      }
      if (sql[i] === ')') {
        i += 1;
        break;
      }
      fail('cần "," hoặc ")" trong một dòng');
    }
    if (values.length !== known!.length) fail(`dòng có ${values.length} giá trị, cần ${known!.length}`);
    const [machine, fromState, toState, code = null] = values;
    if (machine === null || fromState === null || toState === null) fail('machine, from_state, to_state không được NULL');
    rows.push({ machine: machine!, fromState: fromState!, toState: toState!, code });
    skipSpace();
    if (sql[i] === ',') {
      i += 1;
      continue;
    }
    if (sql[i] === ';') {
      i += 1;
      break;
    }
    fail('cần "," hoặc ";" sau một dòng');
  }
  return { file, statement: sql.slice(start, i), rows };
}
