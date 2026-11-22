// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dòng app.state_transition sinh từ khai báo (PID-00017 S03; H2) và trigger *_state trên database dựng từ migration:
// trigger cho cùng kết quả với hàm kiểm ở domain. Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareStateTransitionRows, findTransition, renderStateTransitionSql, type StateMachine } from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notificationMachine, pendingActionMachine, researchProjectMachine, stateMachines } from '../domain/state-machines';
import { insertProject, sqlState, startWorkspacePostgres, SYSTEM_ACTOR, type WorkspacePostgres } from './database.testkit';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

const MIGRATED = 'workspace_states';
const REFERENCE = 'workspace_states_reference';
const ROWS_SQL = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3';

describe('dòng chuyển trạng thái và trigger (PID-00017 S03)', () => {
  let pg: WorkspacePostgres;

  beforeAll(async () => {
    pg = await startWorkspacePostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    await runMigrations(pg.url(MIGRATED));
    await pg.applyReferenceDdl(REFERENCE);
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('bảng khớp khai báo và DDL (EC14)', async () => {
    const migrated = await pg.admin<{ machine: string; from_state: string; to_state: string; code: string | null }>(MIGRATED, ROWS_SQL);
    expect(compareStateTransitionRows(migrated, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    expect(migrated).toEqual(await pg.admin(REFERENCE, ROWS_SQL));
    expect(migrated).toHaveLength(6);
    // File migration là đúng SQL helper sinh, không sửa tay (bỏ ba dòng giấy phép và dòng trống).
    const file = readFileSync(join(MIGRATIONS_FOLDER, '0001_state_transition.sql'), 'utf8').replace(/\r\n/g, '\n');
    expect(file.split('\n').slice(4).join('\n')).toBe(renderStateTransitionSql(stateMachines));
  });

  it('trigger (NFR-MAINT-003-AC01; EC13)', async () => {
    const accountId = randomUUID();
    /** Dòng ở trạng thái `from`, chèn thẳng bằng _system; trả id. */
    const rowIn = async (machine: StateMachine, from: string): Promise<string> =>
      pg.asRole(MIGRATED, 'system', undefined, async (client) => {
        if (machine === researchProjectMachine) return (await insertProject(client, accountId, { status: from })).projectId;
        const id = randomUUID();
        if (machine === pendingActionMachine) {
          await client.query(
            `INSERT INTO app.pending_action (id, account_id, kind, object_type, object_id, status, created_by)
             VALUES ($1, $2, 'task_review', 'task', $3, $4, $5)`, [id, accountId, randomUUID(), from, SYSTEM_ACTOR]);
        } else {
          await client.query(
            `INSERT INTO app.notification (id, account_id, kind, message, status, created_by)
             VALUES ($1, $2, 'completion', 'Xong', $3, $4)`, [id, accountId, from, SYSTEM_ACTOR]);
        }
        return id;
      });
    const tables = new Map<StateMachine, string>([
      [researchProjectMachine, 'app.research_project'], [pendingActionMachine, 'app.pending_action'], [notificationMachine, 'app.notification'],
    ]);
    let accepted = 0;
    for (const [machine, table] of tables) {
      for (const from of machine.states) {
        for (const to of machine.states) {
          const id = await rowIn(machine, from);
          const outcome = await pg.asRole(MIGRATED, 'app', accountId, (client) =>
            client.query(`UPDATE ${table} SET status = $1 WHERE id = $2`, [to, id]))
            .then(() => 'accepted', (e: unknown) => sqlState(e));
          // Cùng trạng thái: trigger không coi là chuyển (domain thì từ chối, xem state-machines.spec.ts).
          const expected = from === to || findTransition(machine, from, to) !== undefined ? 'accepted' : '23514';
          expect(outcome, `${machine.machine}: ${from} → ${to}`).toBe(expected);
          if (from !== to && expected === 'accepted') accepted += 1;
        }
      }
    }
    expect(accepted).toBe(6);
  });
});
