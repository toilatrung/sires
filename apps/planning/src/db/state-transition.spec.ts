// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Dòng app.state_transition sinh từ khai báo (PID-00023 S03, S05; H2) và trigger task_state, plan_version_state:
// trên database dựng từ migration, trigger cho cùng kết quả với hàm kiểm ở domain. Cần Docker (Testcontainers).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareStateTransitionRows, findTransition, renderStateTransitionSql } from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLAN_VERSION_STATUSES, planVersionMachine, stateMachines, TASK_STATUSES, taskMachine } from '../task-state';
import {
  insertTask,
  type PlanningPostgres,
  seedPlan,
  type SeededPlan,
  sqlState,
  startPlanningPostgres,
  SYSTEM_ACTOR,
} from './database.testkit';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'planning_states';
const REFERENCE = 'planning_states_reference';

interface Row extends Record<string, unknown> {
  machine: string;
  from_state: string;
  to_state: string;
  code: string | null;
}

const ROWS_SQL = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3';

describe('dòng chuyển trạng thái và trigger (PID-00023 S03, S05)', () => {
  let pg: PlanningPostgres;

  beforeAll(async () => {
    pg = await startPlanningPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    await runMigrations(pg.url(MIGRATED));
    await pg.applyReferenceDdl(REFERENCE);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('bảng khớp khai báo và DDL (EC11)', async () => {
    const migrated = await pg.admin<Row>(MIGRATED, ROWS_SQL);
    // Khớp khai báo domain (hàm so dòng của PID-00158): không thiếu, không thừa, mã đúng.
    expect(compareStateTransitionRows(migrated, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    // Khớp từng dòng (kể cả mã) với database dựng từ DDL tham chiếu.
    expect(migrated).toEqual(await pg.admin<Row>(REFERENCE, ROWS_SQL));
    expect(migrated.filter((row) => row.machine === 'task')).toHaveLength(28);
    expect(migrated.filter((row) => row.machine === 'plan_version')).toHaveLength(4);
  });

  it('bảng khớp khai báo và DDL — file migration là đúng SQL helper sinh, không sửa tay (EC11)', () => {
    const file = readFileSync(join(MIGRATIONS_FOLDER, '0001_state_transition.sql'), 'utf8').replace(/\r\n/g, '\n');
    // Ba dòng giấy phép và dòng trống do add-license.mjs thêm; phần còn lại phải bằng đầu ra của helper.
    const body = file.split('\n').slice(4).join('\n');
    expect(body).toBe(renderStateTransitionSql(stateMachines));
  });

  it('trigger task mọi cặp (DATA-STATE-001-AC01, NFR-MAINT-003-AC01)', async () => {
    const plan = await seedPlan(pg, MIGRATED);
    const pairs = TASK_STATUSES.flatMap((from) => TASK_STATUSES.filter((to) => to !== from).map((to) => ({ from, to })));
    const tasks = await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
      const ids: string[] = [];
      for (const { from } of pairs) ids.push(await insertTask(client, plan, { status: from }));
      return ids;
    });
    const outcomes = await pg.asRole(MIGRATED, 'app', plan.accountId, async (client) => {
      const result: { pair: string; accepted: boolean; sqlState?: string }[] = [];
      for (const [index, { from, to }] of pairs.entries()) {
        await client.query('SAVEPOINT pair');
        try {
          await client.query('UPDATE app.task SET status = $1 WHERE id = $2', [to, tasks[index]]);
          await client.query('RELEASE SAVEPOINT pair');
          result.push({ pair: `${from} → ${to}`, accepted: true });
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT pair');
          result.push({ pair: `${from} → ${to}`, accepted: false, sqlState: sqlState(error) });
        }
      }
      return result;
    });
    // 90 cặp khác trạng thái: trigger nhận đúng 28 cặp mà hàm kiểm ở domain nhận, từ chối 62 với check_violation.
    for (const [index, { from, to }] of pairs.entries()) {
      const outcome = outcomes[index];
      const expected = findTransition(taskMachine, from, to) !== undefined;
      expect(outcome, `${from} → ${to}`).toEqual(expected ? { pair: `${from} → ${to}`, accepted: true } : { pair: `${from} → ${to}`, accepted: false, sqlState: '23514' });
    }
    expect(outcomes.filter((o) => o.accepted)).toHaveLength(28);
    // Ready → Completed bị từ chối và Task giữ Ready (DATA-STATE-001-AC01, phần database).
    const readyToCompleted = pairs.findIndex((p) => p.from === 'Ready' && p.to === 'Completed');
    expect(await pg.admin(MIGRATED, 'SELECT status FROM app.task WHERE id = $1', [tasks[readyToCompleted]])).toEqual([{ status: 'Ready' }]);
  });

  it('cùng trạng thái (EC06)', async () => {
    // UPDATE giữ nguyên status không phải chuyển: trigger cho qua (domain thì từ chối, xem task-state.spec.ts).
    const plan = await seedPlan(pg, MIGRATED);
    const taskId = await pg.asRole(MIGRATED, 'system', undefined, (client) => insertTask(client, plan, { status: 'Ready' }));
    await pg.asRole(MIGRATED, 'app', plan.accountId, async (client) => {
      const updated = await client.query(`UPDATE app.task SET status = 'Ready' WHERE id = $1`, [taskId]);
      expect(updated.rowCount).toBe(1);
    });
    expect(await pg.admin(MIGRATED, 'SELECT status, row_version FROM app.task WHERE id = $1', [taskId])).toEqual([{ status: 'Ready', row_version: 2 }]);
  });

  it('plan_version (DATA-STATE-001-AC02, NFR-MAINT-003-AC01; EC15)', async () => {
    const approval = (objectId: string) =>
      JSON.stringify({
        approvedBy: { type: 'researcher', accountId: randomUUID() }, decision: 'approved', apr: 'APR-01',
        decidedAt: new Date().toISOString(), objectType: 'plan_version', objectId, objectVersion: 1,
      });
    // Một plan cho mỗi cặp: bản Draft mặc định bị hủy (deleted_at) để bản ở trạng thái nguồn không vướng partial unique.
    const versionIn = async (status: string): Promise<{ plan: SeededPlan; id: string }> => {
      const plan = await seedPlan(pg, MIGRATED);
      const id = randomUUID();
      await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
        await client.query('UPDATE app.plan_version SET deleted_at = now() WHERE id = $1', [plan.planVersionId]);
        await client.query(
          `INSERT INTO app.plan_version (id, account_id, project_id, plan_id, version_number, status, context_version_id,
             approval, rejection_reason, created_by)
           VALUES ($1, $2, $3, $4, 2, $5, $6, $7, $8, $9)`,
          [id, plan.accountId, plan.projectId, plan.planId, status, randomUUID(),
            ['Approved', 'Superseded'].includes(status) ? approval(id) : null,
            status === 'Rejected' ? 'Không đạt' : null, SYSTEM_ACTOR],
        );
      });
      return { plan, id };
    };
    let accepted = 0;
    for (const from of PLAN_VERSION_STATUSES) {
      for (const to of PLAN_VERSION_STATUSES) {
        if (from === to) continue;
        const { plan, id } = await versionIn(from);
        const outcome = await pg
          .asRole(MIGRATED, 'app', plan.accountId, (client) =>
            client.query(
              `UPDATE app.plan_version SET status = $1,
                 approval = CASE WHEN $1 = 'Approved' THEN $2::jsonb ELSE approval END,
                 rejection_reason = CASE WHEN $1 = 'Rejected' THEN 'Không đạt' ELSE rejection_reason END
               WHERE id = $3`,
              [to, approval(id), id],
            ),
          )
          .then(() => 'accepted', (error: unknown) => sqlState(error));
        const expected = findTransition(planVersionMachine, from, to) !== undefined;
        expect(outcome, `${from} → ${to}`).toBe(expected ? 'accepted' : '23514');
        if (expected) accepted += 1;
      }
    }
    expect(accepted).toBe(4);

    // EC15: duyệt bản mới khi đã có Approved, trong một giao dịch.
    const approvedTwo = async () => {
      const plan = await seedPlan(pg, MIGRATED);
      const oldId = randomUUID();
      const newId = randomUUID();
      await pg.asRole(MIGRATED, 'system', undefined, async (client) => {
        await client.query('UPDATE app.plan_version SET deleted_at = now() WHERE id = $1', [plan.planVersionId]);
        await client.query(
          `INSERT INTO app.plan_version (id, account_id, project_id, plan_id, version_number, status, context_version_id, approval, created_by)
           VALUES ($1, $2, $3, $4, 2, 'Approved', $5, $6, $7), ($8, $2, $3, $4, 3, 'Proposed', $5, NULL, $7)`,
          [oldId, plan.accountId, plan.projectId, plan.planId, randomUUID(), approval(oldId), SYSTEM_ACTOR, newId],
        );
      });
      return { plan, oldId, newId };
    };
    const ok = await approvedTwo();
    await pg.asRole(MIGRATED, 'app', ok.plan.accountId, async (client) => {
      await client.query(`UPDATE app.plan_version SET status = 'Superseded' WHERE id = $1`, [ok.oldId]);
      await client.query(`UPDATE app.plan_version SET status = 'Approved', approval = $1 WHERE id = $2`, [approval(ok.newId), ok.newId]);
    });
    expect(await pg.admin(MIGRATED, 'SELECT id, status FROM app.plan_version WHERE plan_id = $1 AND deleted_at IS NULL ORDER BY version_number', [ok.plan.planId]))
      .toEqual([{ id: ok.oldId, status: 'Superseded' }, { id: ok.newId, status: 'Approved' }]);

    const reversed = await approvedTwo();
    const error = await pg
      .asRole(MIGRATED, 'app', reversed.plan.accountId, async (client) => {
        await client.query(`UPDATE app.plan_version SET status = 'Approved', approval = $1 WHERE id = $2`, [approval(reversed.newId), reversed.newId]);
        await client.query(`UPDATE app.plan_version SET status = 'Superseded' WHERE id = $1`, [reversed.oldId]);
      })
      .then(() => undefined, (e: unknown) => e);
    expect(sqlState(error)).toBe('23505');
    expect((error as Error).message).toContain('plan_version_one_approved_uq');
  });
});
