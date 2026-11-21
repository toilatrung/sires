// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00158 S03: every `INSERT INTO app.state_transition` block of docs/database/ddl, declared again with the helper,
// gives the same rows on PostgreSQL 16 (pgvector/pgvector:pg16, Testcontainers). Needs Docker: without it startPostgres
// fails with DockerUnavailableError (EC16); the unit tests live in the other spec files.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineStateMachine, type StateMachine, type StateMachineDeclaration } from './define';
import {
  compareCodePoints,
  compareStateTransitionRows,
  renderStateTransitionSql,
  stateTransitionRows,
  type StateTransitionRow,
} from './sql';
import { countStateTransitionInserts, DdlFormatError, readStateTransitionInsert } from './testdata/ddl-inserts';

const DDL_DIR = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'database', 'ddl');
const TESTDATA = join(__dirname, 'testdata');

// Count of 18/11/2026 (spec 2.3, database 10.2). A DDL change that moves these numbers updates them in the same PR.
const EXPECTED_FILES: Record<string, { machines: number; pairs: number }> = {
  'identity.sql': { machines: 2, pairs: 10 },
  'knowledge.sql': { machines: 1, pairs: 7 },
  'library.sql': { machines: 4, pairs: 18 },
  'manuscript.sql': { machines: 3, pairs: 8 },
  'orchestration.sql': { machines: 7, pairs: 43 },
  'planning.sql': { machines: 2, pairs: 32 },
  'research.sql': { machines: 3, pairs: 9 },
  'workspace.sql': { machines: 3, pairs: 6 },
};
const TOTAL = { files: 8, machines: 25, pairs: 133 };

function ddlFiles(): string[] {
  return readdirSync(DDL_DIR)
    .filter((name) => name.endsWith('.sql') && name !== '00-common.sql')
    .sort();
}

function byKey(a: StateTransitionRow, b: StateTransitionRow): number {
  return (
    compareCodePoints(a.machine, b.machine) ||
    compareCodePoints(a.fromState, b.fromState) ||
    compareCodePoints(a.toState, b.toState)
  );
}

/** Declarations rebuilt from DDL rows: states are every value seen in a pair, in order of appearance. */
function declarationsFrom(rows: readonly StateTransitionRow[]): StateMachine[] {
  const grouped = new Map<string, { states: string[]; transitions: { from: string; to: string; code: string | null }[] }>();
  for (const row of rows) {
    const entry = grouped.get(row.machine) ?? { states: [], transitions: [] };
    for (const state of [row.fromState, row.toState]) if (!entry.states.includes(state)) entry.states.push(state);
    entry.transitions.push({ from: row.fromState, to: row.toState, code: row.code });
    grouped.set(row.machine, entry);
  }
  return [...grouped].map(([machine, entry]) => defineStateMachine({ machine, ...entry }));
}

describe('bộ đọc khối INSERT của DDL (không cần Docker)', () => {
  it('đọc 3 cột, 4 cột, nháy đơn nhân đôi và NULL', () => {
    const sql = "x;\nINSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES\n  ('m','A','B','C-1'), ('m','B','It''s',NULL);\nCREATE TRIGGER t;";
    const block = readStateTransitionInsert('mẫu.sql', sql);
    expect(block.rows).toEqual([
      { machine: 'm', fromState: 'A', toState: 'B', code: 'C-1' },
      { machine: 'm', fromState: 'B', toState: "It's", code: null },
    ]);
    expect(block.statement.endsWith("NULL);")).toBe(true);
  });

  it('báo lỗi nêu tên file khi khối INSERT đổi dạng', () => {
    const shapes = [
      'SELECT 1;',
      "INSERT INTO app.state_transition (machine, from_state, to_state) VALUES ('m','A','B');\nINSERT INTO app.state_transition (machine, from_state, to_state) VALUES ('m','B','A');",
      "INSERT INTO app.state_transition (machine, from_state, to_state, code, note) VALUES ('m','A','B',NULL,'x');",
      "INSERT INTO app.state_transition (machine, from_state, to_state) VALUES ('m','A');",
      "INSERT INTO app.state_transition (machine, from_state, to_state) VALUES ('m','A','B') -- chú thích\n;",
      "INSERT INTO app.state_transition (machine, from_state, to_state) SELECT 'm','A','B';",
      "INSERT INTO app.state_transition (machine, from_state, to_state) VALUES ('m','A',lower('B'));",
    ];
    for (const sql of shapes) {
      expect(() => readStateTransitionInsert('lạ.sql', sql), sql).toThrow(DdlFormatError);
      expect(() => readStateTransitionInsert('lạ.sql', sql), sql).toThrow(/^lạ\.sql: /);
    }
  });
});

describe('state machine trên PostgreSQL 16 — đối chiếu docs/database/ddl', () => {
  let postgres: StartedPostgres;
  let client: Client;

  const readRows = async (): Promise<StateTransitionRow[]> => {
    const result = await client.query<{ machine: string; from_state: string; to_state: string; code: string | null }>(
      'SELECT machine, from_state, to_state, code FROM app.state_transition',
    );
    return result.rows
      .map((r) => ({ machine: r.machine, fromState: r.from_state, toState: r.to_state, code: r.code }))
      .sort(byKey);
  };
  const clear = async (): Promise<void> => {
    await client.query('DELETE FROM app.state_transition');
  };

  beforeAll(async () => {
    postgres = await startPostgres({ extensions: [] });
    client = new Client({ connectionString: postgres.connectionUri });
    await client.connect();
    await client.query(readFileSync(join(DDL_DIR, '00-common.sql'), 'utf8'));
  }, 300_000);

  afterAll(async () => {
    await client?.end();
    await postgres?.stop();
  }, 60_000);

  it('khớp mọi khối INSERT của docs/database/ddl', async () => {
    const files = ddlFiles();
    const withBlock = files.filter((name) => countStateTransitionInserts(readFileSync(join(DDL_DIR, name), 'utf8')) > 0);
    expect(withBlock).toEqual(Object.keys(EXPECTED_FILES).sort());

    let machines = 0;
    let pairs = 0;
    for (const name of withBlock) {
      const block = readStateTransitionInsert(name, readFileSync(join(DDL_DIR, name), 'utf8'));

      // (1) The DDL block itself.
      await clear();
      await client.query(block.statement);
      const ddlRows = await readRows();
      expect(ddlRows, `${name}: bộ đọc`).toEqual([...block.rows].sort(byKey));

      // (2) The same machines declared with the helper.
      await clear();
      const declared = declarationsFrom(block.rows);
      await client.query(renderStateTransitionSql(declared));
      const generated = await readRows();
      expect(generated, `${name}: dòng sinh từ helper`).toEqual(ddlRows);
      expect(stateTransitionRows(declared), `${name}: stateTransitionRows`).toEqual(ddlRows);
      expect(compareStateTransitionRows(generated, declared)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });

      expect({ machines: declared.length, pairs: ddlRows.length }, name).toEqual(EXPECTED_FILES[name]);
      machines += declared.length;
      pairs += ddlRows.length;
    }
    expect({ files: withBlock.length, machines, pairs }).toEqual(TOTAL);
  });

  it('chạy lần hai không đổi', async () => {
    for (const name of Object.keys(EXPECTED_FILES)) {
      const block = readStateTransitionInsert(name, readFileSync(join(DDL_DIR, name), 'utf8'));
      const sql = renderStateTransitionSql(declarationsFrom(block.rows));
      await clear();
      await client.query(sql);
      const first = await readRows();
      const { rows: before } = await client.query<{ ctid: string; xmin: string }>(
        'SELECT ctid::text, xmin::text FROM app.state_transition ORDER BY ctid',
      );

      // Multi-statement query: one result per statement (DELETE, INSERT … ON CONFLICT).
      const results = (await client.query(sql)) as unknown as { command: string; rowCount: number | null }[];
      expect(results.map((r) => [r.command, r.rowCount]), name).toEqual([
        ['DELETE', 0],
        ['INSERT', 0],
      ]);
      expect(await readRows(), name).toEqual(first);
      const { rows: after } = await client.query<{ ctid: string; xmin: string }>(
        'SELECT ctid::text, xmin::text FROM app.state_transition ORDER BY ctid',
      );
      expect(after, `${name}: không có dòng nào được ghi lại`).toEqual(before);
    }
  });

  it('đồng bộ một machine', async () => {
    const planning = readStateTransitionInsert('planning.sql', readFileSync(join(DDL_DIR, 'planning.sql'), 'utf8'));
    const [planVersion, task] = ['plan_version', 'task'].map(
      (machine) => declarationsFrom(planning.rows.filter((r) => r.machine === machine))[0]!,
    );
    const taskRows = stateTransitionRows([task!]);
    const planRows = stateTransitionRows([planVersion!]);

    // task (A) drifts from its declaration: one pair missing, one extra pair, one pair with another code. plan_version
    // (B) also holds a row that is not declared: the sync for A must leave every row of B as it is.
    const dropped = taskRows.find((r) => r.fromState === 'Draft' && r.toState === 'Ready')!;
    const recoded = taskRows.find((r) => r.fromState === 'In Review' && r.toState === 'Completed')!;
    const extra: StateTransitionRow = { machine: 'task', fromState: 'Completed', toState: 'Draft', code: 'T-99' };
    const planExtra: StateTransitionRow = { machine: 'plan_version', fromState: 'Rejected', toState: 'Draft', code: null };
    const seeded = [
      ...taskRows.filter((r) => r !== dropped).map((r) => (r === recoded ? { ...r, code: 'T-00' } : r)),
      extra,
      ...planRows,
      planExtra,
    ];
    await clear();
    for (const r of seeded) {
      await client.query('INSERT INTO app.state_transition (machine, from_state, to_state, code) VALUES ($1, $2, $3, $4)', [
        r.machine,
        r.fromState,
        r.toState,
        r.code,
      ]);
    }
    const before = await readRows();
    expect(compareStateTransitionRows(before, [task!])).toEqual({
      missing: [dropped],
      unexpected: [extra],
      codeMismatch: [{ expected: recoded, actualCode: 'T-00' }],
    });

    await client.query(renderStateTransitionSql([task!]));
    const after = await readRows();
    expect(after.filter((r) => r.machine === 'task')).toEqual(taskRows);
    expect(after.filter((r) => r.machine !== 'task')).toEqual(before.filter((r) => r.machine !== 'task'));
    expect(compareStateTransitionRows(after, [task!])).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    expect(compareStateTransitionRows(after, [planVersion!])).toEqual({ missing: [], unexpected: [planExtra], codeMismatch: [] });
  });

  it('chạy golden.txt cho đúng dòng của bộ mẫu', async () => {
    const declarations = JSON.parse(readFileSync(join(TESTDATA, 'golden-machines.json'), 'utf8')) as StateMachineDeclaration[];
    const machines = declarations.map((d) => defineStateMachine(d));
    await clear();
    await client.query(readFileSync(join(TESTDATA, 'golden.txt'), 'utf8').replaceAll('\r', ''));
    expect(await readRows()).toEqual(stateTransitionRows(machines));
  });
});
