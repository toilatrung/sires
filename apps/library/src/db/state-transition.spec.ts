// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00024 S02: dòng app.state_transition sinh từ khai báo bốn machine của library bằng helper PID-00158 (H3) khớp
// khai báo và DDL tham chiếu (spec O1); trigger *_state trên database dựng từ migration chỉ nhận cặp trong bảng (EC10).
// Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareStateTransitionRows,
  type DatabaseStateTransitionRow,
  findTransition,
  renderStateTransitionSql,
  type StateMachine,
} from '@sires/platform';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  discoveredResultMachine,
  projectReferenceSelectionMachine,
  referenceApprovalMachine,
  referenceIndexingMachine,
  stateMachines,
} from '../domain/state-machines';
import {
  insertDiscoveredResult,
  insertProjectState,
  insertReference,
  insertSelection,
  type LibraryPostgres,
  sqlState,
  startLibraryPostgres,
} from './database.testkit';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

const MIGRATED = 'library_states';
const REFERENCE = 'library_states_reference';
const ROWS_SQL = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3';

interface Target {
  readonly machine: StateMachine;
  /** Tạo một dòng ở trạng thái `from` (phiên _system); trả id. */
  readonly create: (client: Client, from: string) => Promise<string>;
  /** UPDATE đổi cột trạng thái sang `to`. */
  readonly update: (client: Client, id: string, to: string) => Promise<unknown>;
}

describe('dòng chuyển trạng thái library (PID-00024 S02)', () => {
  let pg: LibraryPostgres;
  const accountId = randomUUID();
  let projectId = '';
  let trustedReferenceId = '';

  beforeAll(async () => {
    pg = await startLibraryPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    await runMigrations(pg.url(MIGRATED));
    await pg.applyReferenceDdl(REFERENCE);
    await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
      projectId = await insertProjectState(client, accountId);
      trustedReferenceId = await insertReference(client, accountId, { approvalStatus: 'Trusted' });
    });
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('khớp DDL tham chiếu', async () => {
    const migrated = await pg.admin<DatabaseStateTransitionRow & Record<string, unknown>>(MIGRATED, ROWS_SQL);
    // Đúng một nguồn: khai báo của library qua helper PID-00158 (H3, DR-01).
    expect(compareStateTransitionRows(migrated, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    // Bằng từng dòng (kể cả code NULL) với database dựng từ khối INSERT của library.sql.
    expect(migrated).toEqual(await pg.admin(REFERENCE, ROWS_SQL));
    expect(migrated).toHaveLength(18);
    // File migration chứa đúng SQL helper sinh, không sửa tay.
    const file = readFileSync(join(MIGRATIONS_FOLDER, '0000_init.sql'), 'utf8').replace(/\r\n/g, '\n');
    expect(file).toContain(renderStateTransitionSql(stateMachines));
    expect(file).not.toContain('INSERT INTO app.state_transition (machine, from_state, to_state) VALUES');
  });

  it('ngoài bảng bị từ chối', async () => {
    // EC10: mọi cặp có thứ tự của từng machine, UPDATE bằng _app như service thật (project Active, Reference Trusted
    // để trigger khác không chặn): cặp trong bảng qua, cặp ngoài bảng bị tg_state_transition từ chối (23514); giữ
    // nguyên trạng thái không phải là chuyển nên qua.
    const targets: Target[] = [
      {
        machine: discoveredResultMachine,
        create: (client, from) => insertDiscoveredResult(client, accountId, from),
        // CHECK discovered_result_imported_ck: Imported ⇔ có imported_reference_id.
        update: (client, id, to) => client.query(
          `UPDATE app.discovered_result SET status = $2,
             imported_reference_id = CASE WHEN $2 = 'Imported' THEN coalesce(imported_reference_id, gen_random_uuid()) END
           WHERE id = $1`, [id, to]),
      },
      {
        machine: referenceApprovalMachine,
        create: (client, from) => insertReference(client, accountId, { approvalStatus: from }),
        update: (client, id, to) => client.query('UPDATE app.reference SET approval_status = $2 WHERE id = $1', [id, to]),
      },
      {
        machine: referenceIndexingMachine,
        create: (client, from) => insertReference(client, accountId, { indexingStatus: from }),
        update: (client, id, to) => client.query('UPDATE app.reference SET indexing_status = $2 WHERE id = $1', [id, to]),
      },
      {
        machine: projectReferenceSelectionMachine,
        create: async (client, from) => {
          const referenceId = await insertReference(client, accountId, { approvalStatus: 'Trusted' });
          return insertSelection(client, accountId, projectId, referenceId, from);
        },
        update: (client, id, to) =>
          client.query('UPDATE app.project_reference_selection SET status = $2 WHERE id = $1', [id, to]),
      },
    ];
    expect(trustedReferenceId).not.toBe('');

    const outcomes: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const { machine, create, update } of targets) {
      const pairs = machine.states.flatMap((from) => machine.states.map((to) => ({ from, to })));
      const ids = await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
        const created: string[] = [];
        for (const { from } of pairs) created.push(await create(client, from));
        return created;
      });
      // Một phiên _app mỗi machine, mỗi cặp trong một savepoint để lỗi của cặp này không hủy cặp khác.
      await pg.asRole(MIGRATED, 'app', accountId, async (client) => {
        for (const [index, { from, to }] of pairs.entries()) {
          const key = `${machine.machine}: ${from} → ${to}`;
          await client.query('SAVEPOINT pair');
          outcomes[key] = await update(client, ids[index] as string, to).then(
            async () => {
              await client.query('RELEASE SAVEPOINT pair');
              return 'accepted';
            },
            async (error: unknown) => {
              await client.query('ROLLBACK TO SAVEPOINT pair');
              return sqlState(error) ?? String(error);
            },
          );
          expected[key] = from === to || findTransition(machine, from, to) !== undefined ? 'accepted' : '23514';
        }
      });
    }
    expect(outcomes).toEqual(expected);
    // 16 + 16 + 36 + 4 = 72 cặp có thứ tự: 18 chuyển trong bảng, 16 giữ nguyên, 38 bị từ chối.
    const values = Object.entries(outcomes);
    expect(values).toHaveLength(72);
    expect(values.filter(([key, v]) => v === 'accepted' && !/: (.+) → \1$/.test(key))).toHaveLength(18);
    expect(values.filter(([key, v]) => v === 'accepted' && /: (.+) → \1$/.test(key))).toHaveLength(16);
    expect(values.filter(([, v]) => v === '23514')).toHaveLength(38);
    // Ví dụ của EC10: Reference Trusted → Pending Approval; Discovered Result Rejected → Selected.
    expect(outcomes['reference_approval: Trusted → Pending Approval']).toBe('23514');
    expect(outcomes['discovered_result: Rejected → Selected']).toBe('23514');
  });
});
