// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Hành vi DDL planning trên database dựng từ migration (PID-00023 S06; cổng PH-01, database 12.4): chỉ kiểm điều
// có trong DDL, bằng vai trò dịch vụ và app.account_id như service thật. Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  insertTask,
  type PlanningPostgres,
  seedPlan,
  type SeededPlan,
  sqlState,
  startPlanningPostgres,
  SYSTEM_ACTOR,
} from './database.testkit';
import { runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const DB = 'planning_ddl';

const approval = (objectType: string, objectId: string, apr = 'APR-01') =>
  JSON.stringify({
    approvedBy: { type: 'researcher', accountId: randomUUID() }, decision: 'approved', apr,
    decidedAt: new Date().toISOString(), objectType, objectId, objectVersion: 1,
  });

describe('hành vi DDL planning (PID-00023 S06)', () => {
  let pg: PlanningPostgres;

  beforeAll(async () => {
    pg = await startPlanningPostgres();
    await pg.createDatabase(DB);
    await runMigrations(pg.url(DB));
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  /** SQLSTATE khi `work` lỗi trong phiên _app của tài khoản; undefined khi qua. */
  const asApp = (accountId: string | undefined, work: (q: (text: string, values?: unknown[]) => Promise<unknown>) => Promise<unknown>) =>
    pg.asRole(DB, 'app', accountId, (client) => work((text, values) => client.query(text, values)))
      .then(() => undefined, (error: unknown) => sqlState(error) ?? String(error));
  const newTask = (plan: SeededPlan, options: Parameters<typeof insertTask>[2] = {}) =>
    pg.asRole(DB, 'system', undefined, (client) => insertTask(client, plan, options));
  const insertVersion = (plan: SeededPlan, status: string, versionNumber: number, extra: { deleted?: boolean } = {}) =>
    asApp(plan.accountId, (q) => {
      const id = randomUUID();
      return q(
        `INSERT INTO app.plan_version (id, account_id, project_id, plan_id, version_number, status, context_version_id,
           approval, rejection_reason, deleted_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, plan.accountId, plan.projectId, plan.planId, versionNumber, status, randomUUID(),
          ['Approved', 'Superseded'].includes(status) ? approval('plan_version', id) : null,
          status === 'Rejected' ? 'Không đạt' : null, extra.deleted ? new Date() : null, SYSTEM_ACTOR],
      );
    });

  it('status lạ (EC10)', async () => {
    const plan = await seedPlan(pg, DB);
    const error = await pg.asRole(DB, 'system', undefined, (client) => insertTask(client, plan, { status: 'Done' }))
      .then(() => undefined, (e: unknown) => sqlState(e));
    expect(error).toBe('23514');
    const taskId = await newTask(plan, { status: 'Ready' });
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.task SET status = 'Done' WHERE id = $1`, [taskId]))).toBe('23514');
  });

  it('plan version bất biến (EC16)', async () => {
    const plan = await seedPlan(pg, DB);
    const id = plan.planVersionId;
    // Draft: sửa nội dung được.
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.plan_version SET goals = '[{"text":"Mục tiêu"}]' WHERE id = $1`, [id]))).toBeUndefined();
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.plan_version SET status = 'Proposed' WHERE id = $1`, [id]))).toBeUndefined();
    // Khác Draft: sửa cột nội dung bị plan_version_frozen từ chối (integrity_constraint_violation).
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.plan_version SET goals = '[]' WHERE id = $1`, [id]))).toBe('23000');
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.plan_version SET change_summary = 'x' WHERE id = $1`, [id]))).toBe('23000');
    // Đổi status, rejection_reason vẫn được (phần database của DATA-STATE-002-AC01).
    expect(await asApp(plan.accountId, (q) =>
      q(`UPDATE app.plan_version SET status = 'Rejected', rejection_reason = 'Thiếu phương pháp' WHERE id = $1`, [id]))).toBeUndefined();
  });

  it('một bản mở, một bản Approved (DATA-STATE-001-AC02; EC17)', async () => {
    const plan = await seedPlan(pg, DB); // đã có v1 Draft
    expect(await insertVersion(plan, 'Draft', 2)).toBe('23505');
    expect(await insertVersion(plan, 'Proposed', 2)).toBe('23505');
    expect(await insertVersion(plan, 'Approved', 2)).toBeUndefined();
    // Bản Approved thứ hai cùng plan: plan_version_one_approved_uq từ chối.
    expect(await insertVersion(plan, 'Approved', 3)).toBe('23505');
    // Bản mở cũ bị hủy (deleted_at) hoặc Rejected thì tạo được Draft mới.
    expect(await asApp(plan.accountId, (q) => q('UPDATE app.plan_version SET deleted_at = now() WHERE id = $1', [plan.planVersionId]))).toBeUndefined();
    expect(await insertVersion(plan, 'Draft', 4)).toBeUndefined();
    const other = await seedPlan(pg, DB);
    expect(await asApp(other.accountId, (q) =>
      q(`UPDATE app.plan_version SET status = 'Proposed' WHERE id = $1`, [other.planVersionId]))).toBeUndefined();
    expect(await asApp(other.accountId, (q) =>
      q(`UPDATE app.plan_version SET status = 'Rejected', rejection_reason = 'x' WHERE id = $1`, [other.planVersionId]))).toBeUndefined();
    expect(await insertVersion(other, 'Draft', 2)).toBeUndefined();
  });

  it('project không active (EC18)', async () => {
    for (const options of [{ projectStatus: 'none' as const }, { projectStatus: 'Archived' as const }, { projectDeleted: true }]) {
      const plan = await seedPlan(pg, DB, options);
      const label = JSON.stringify(options);
      // _app: ghi task, plan_version bị tg_project_writable từ chối.
      expect(await asApp(plan.accountId, (q) => q(`UPDATE app.plan_version SET goals = '[]' WHERE id = $1`, [plan.planVersionId])), label).toBe('23514');
      expect(await insertVersion(plan, 'Rejected', 2), label).toBe('23514');
      const taskId = await newTask(plan, { status: 'Ready' });
      expect(await asApp(plan.accountId, (q) => q(`UPDATE app.task SET status = 'Blocked' WHERE id = $1`, [taskId])), label).toBe('23514');
      // _system vẫn ghi được (consumer, job).
      await pg.asRole(DB, 'system', undefined, (client) => client.query(`UPDATE app.task SET status = 'Blocked' WHERE id = $1`, [taskId]));
    }
  });

  it('phụ thuộc (EC19)', async () => {
    const plan = await seedPlan(pg, DB);
    const [t1, t2, t3] = [await newTask(plan), await newTask(plan), await newTask(plan)];
    const dep = (from: string, to: string, version = plan.planVersionId) =>
      asApp(plan.accountId, (q) =>
        q('INSERT INTO app.task_dependency (account_id, plan_version_id, task_id, depends_on_task_id) VALUES ($1, $2, $3, $4)',
          [plan.accountId, version, from, to]));
    expect(await dep(t1, t2)).toBeUndefined();
    expect(await dep(t2, t1)).toBeUndefined();
    expect(await dep(t3, t1)).toBeUndefined();
    const cycles = await pg.admin<{ task_id: string }>(DB, 'SELECT task_id FROM app.plan_version_cycles($1) ORDER BY 1', [plan.planVersionId]);
    expect(cycles.map((row) => row.task_id)).toEqual([t1, t2].sort());
    // Tự phụ thuộc: CHECK; Task của version khác (không có task_definition ở version này): khóa ngoại.
    expect(await dep(t3, t3)).toBe('23514');
    const elsewhere = await seedPlan(pg, DB, { accountId: plan.accountId });
    const foreign = await newTask(elsewhere);
    expect(await dep(t3, foreign)).toBe('23503');
  });

  it('task review (EC20)', async () => {
    const plan = await seedPlan(pg, DB);
    const taskId = await newTask(plan, { status: 'In Review' });
    const review = (outcome: string, reasonCode: string | null, withApproval: boolean) =>
      asApp(plan.accountId, (q) =>
        q(`INSERT INTO app.task_review (account_id, project_id, task_id, outcome, reason_code, approval, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [plan.accountId, plan.projectId, taskId, outcome, reasonCode, withApproval ? approval('task', taskId, 'APR-03') : null, SYSTEM_ACTOR]));
    expect(await review('returned', null, false)).toBe('23514');
    expect(await review('blocked', null, false)).toBe('23514');
    expect(await review('accepted', null, false)).toBe('23514');
    expect(await review('returned', 'quality_insufficient', false)).toBeUndefined();
    expect(await review('blocked', 'missing_input', false)).toBeUndefined();
    expect(await review('accepted', null, true)).toBeUndefined();
  });

  it('bất biến và quyền (EC21)', async () => {
    const plan = await seedPlan(pg, DB);
    const [t1, t2] = [await newTask(plan, { status: 'In Review' }), await newTask(plan)];
    await pg.asRole(DB, 'system', undefined, async (client) => {
      await client.query(
        `INSERT INTO app.readiness_result (account_id, project_id, task_id, plan_version_id, passed, checks, created_by)
         VALUES ($1, $2, $3, $4, true, '[]', $5)`, [plan.accountId, plan.projectId, t1, plan.planVersionId, SYSTEM_ACTOR]);
      await client.query(
        `INSERT INTO app.task_review (account_id, project_id, task_id, outcome, reason_code, created_by)
         VALUES ($1, $2, $3, 'returned', 'other', $4)`, [plan.accountId, plan.projectId, t1, SYSTEM_ACTOR]);
      await client.query(
        `INSERT INTO app.task_dependency (account_id, plan_version_id, task_id, depends_on_task_id) VALUES ($1, $2, $3, $4)`,
        [plan.accountId, plan.planVersionId, t1, t2]);
      await client.query(
        `INSERT INTO app.task_input_ref (account_id, task_id, input_type, input_id, input_version) VALUES ($1, $2, 'reference', $3, 1)`,
        [plan.accountId, t1, randomUUID()]);
    });
    // UPDATE ba bảng chỉ ghi thêm: _app, _system không có quyền (REVOKE cuối planning.sql).
    for (const role of ['app', 'system'] as const) {
      for (const sql of [
        `UPDATE app.task_definition SET description = 'x' WHERE task_id = $1`,
        `UPDATE app.readiness_result SET passed = false WHERE task_id = $1`,
        `UPDATE app.task_review SET feedback = 'x' WHERE task_id = $1`,
      ]) {
        const state = await pg.asRole(DB, role, plan.accountId, (client) => client.query(sql, [t1]))
          .then(() => undefined, (e: unknown) => sqlState(e));
        expect(state, `${role}: ${sql}`).toBe('42501');
      }
    }
    // Vai trò có quyền UPDATE (chủ sở hữu) vẫn bị tg_immutable chặn.
    expect(await pg.admin(DB, `UPDATE app.task_review SET feedback = 'x' WHERE task_id = $1`, [t1]).then(() => undefined, (e: unknown) => sqlState(e))).toBe('23000');
    // _app chỉ DELETE task_dependency, task_input_ref.
    expect(await asApp(plan.accountId, (q) => q('DELETE FROM app.task_dependency WHERE task_id = $1', [t1]))).toBeUndefined();
    expect(await asApp(plan.accountId, (q) => q('DELETE FROM app.task_input_ref WHERE task_id = $1', [t1]))).toBeUndefined();
    for (const table of ['task', 'task_definition', 'task_review', 'readiness_result', 'plan_version', 'phase', 'research_plan']) {
      expect(await asApp(plan.accountId, (q) => q(`DELETE FROM app.${table} WHERE account_id = $1`, [plan.accountId])), table).toBe('42501');
    }
  });

  it('rls (EC22)', async () => {
    const a = await seedPlan(pg, DB);
    const b = await seedPlan(pg, DB);
    await newTask(a);
    const count = (accountId: string | undefined) =>
      pg.asRole(DB, 'app', accountId, async (client) => {
        const rows = await client.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM app.task WHERE account_id = $1)
                + (SELECT count(*) FROM app.plan_version WHERE account_id = $1)
                + (SELECT count(*) FROM app.research_plan WHERE account_id = $1) AS n`, [a.accountId]);
        return Number(rows.rows[0]?.n);
      });
    expect(await count(a.accountId)).toBe(3);
    // Tài khoản B không thấy dòng nào của A; thiếu app.account_id: 0 dòng.
    expect(await count(b.accountId)).toBe(0);
    expect(await count(undefined)).toBe(0);
    // Ghi cho tài khoản khác bị RLS từ chối.
    expect(await asApp(b.accountId, (q) =>
      q('INSERT INTO app.research_plan (account_id, project_id, created_by) VALUES ($1, $2, $3)', [a.accountId, randomUUID(), SYSTEM_ACTOR]))).toBe('42501');
  });

  it('task check (EC23)', async () => {
    const plan = await seedPlan(pg, DB);
    const taskId = await newTask(plan, { status: 'Ready' });
    const update = (sql: string) => asApp(plan.accountId, (q) => q(sql, [taskId]));
    expect(await update(`UPDATE app.task SET active_workflow_id = gen_random_uuid() WHERE id = $1`)).toBe('23514');
    expect(await update(`UPDATE app.task SET needs_review = true WHERE id = $1`)).toBe('23514');
    expect(await update(`UPDATE app.task SET needs_review_reasons = '[{"cause":"x"}]' WHERE id = $1`)).toBe('23514');
    expect(await update(`UPDATE app.task SET needs_review = true, needs_review_reasons = '[{"cause":"x"}]' WHERE id = $1`)).toBeUndefined();
    expect(await update(`UPDATE app.task SET stable_key = 'X-001' WHERE id = $1`)).toBe('23514');
    expect(await update(`UPDATE app.task SET stable_key = 'T-12' WHERE id = $1`)).toBe('23514');
    // Đối chứng: Queued có Workflow hoạt động được.
    const queued = await newTask(plan, { status: 'Queued' });
    expect(await asApp(plan.accountId, (q) => q(`UPDATE app.task SET active_workflow_id = gen_random_uuid() WHERE id = $1`, [queued]))).toBeUndefined();
  });

  it('tạo task (EC24)', async () => {
    const plan = await seedPlan(pg, DB);
    // _app tạo Task mới: task_definition trước rồi task, cùng giao dịch (khóa ngoại DEFERRABLE).
    const taskId = await pg.asRole(DB, 'app', plan.accountId, (client) =>
      insertTask(client, plan, { title: 'Tổng quan tài liệu về đô thị hóa', stableKey: 'T-042' }));
    // search_tsv có stable_key và tiêu đề; tìm không dấu: “tong quan do thi” khớp tiêu đề có dấu.
    const search = (text: string) =>
      pg.asRole(DB, 'app', plan.accountId, async (client) =>
        (await client.query<{ id: string }>(
          `SELECT id FROM app.task WHERE search_tsv @@ plainto_tsquery('app.sires_simple', $1)`, [text])).rows.map((row) => row.id));
    expect(await search('T-042')).toEqual([taskId]);
    expect(await search('tong quan do thi')).toEqual([taskId]);
    expect(await search('Tổng quan')).toEqual([taskId]);
    expect(await search('kinh tế')).toEqual([]);
    // Thiếu task_definition: khóa ngoại kiểm lúc commit.
    const missing = await pg.asRole(DB, 'app', plan.accountId, (client) =>
      client.query(
        `INSERT INTO app.task (account_id, project_id, plan_id, stable_key, current_definition_id, created_by)
         VALUES ($1, $2, $3, 'T-043', $4, $5)`, [plan.accountId, plan.projectId, plan.planId, randomUUID(), SYSTEM_ACTOR]))
      .then(() => undefined, (e: unknown) => sqlState(e));
    expect(missing).toBe('23503');
  });

  // Lỗi EC09 (PID-00029; PO 24/11/2026): CHECK coi NULL là đạt, nên ba hàm kiểm JSON của 00-common.sql phải trả false
  // khi JSON thiếu trường. plan_version có cả ba hàm trong CHECK (updated_by, provenance, approval).
  it('hàm kiểm JSON trả false thay vì NULL (EC09 của PID-00029)', async () => {
    const plan = await seedPlan(pg, DB);
    const runId = randomUUID();
    const system = JSON.parse(SYSTEM_ACTOR) as Record<string, unknown>;
    const agent = (fields: Record<string, unknown>) => ({ type: 'agent', agentRunId: runId, ...fields });
    const provenance = (fields: Record<string, unknown>) => JSON.stringify({ createdBy: system, inputs: [], ...fields });
    const approvalWithout = (field: string) => {
      const record = JSON.parse(approval('plan_version', plan.planVersionId)) as Record<string, unknown>;
      delete record[field];
      return JSON.stringify(record);
    };
    const cases: ReadonlyArray<readonly [string, 'is_actor_ref' | 'is_provenance' | 'is_approval_record', string | null, boolean]> = [
      ['actor: analysis thiếu instance', 'is_actor_ref', JSON.stringify(agent({ agent: 'analysis' })), false],
      ['actor: thiếu agent', 'is_actor_ref', JSON.stringify(agent({})), false],
      ['actor: agent null', 'is_actor_ref', JSON.stringify(agent({ agent: null })), false],
      ['actor: analysis có instance (đối chứng)', 'is_actor_ref', JSON.stringify(agent({ agent: 'analysis', instance: 'A' })), true],
      ['actor: agent khác analysis, không instance (đối chứng)', 'is_actor_ref', JSON.stringify(agent({ agent: 'discovery' })), true],
      ['provenance: thiếu inputs', 'is_provenance', JSON.stringify({ createdBy: system }), false],
      ['provenance: createdBy thiếu agent', 'is_provenance', provenance({ createdBy: agent({}) }), false],
      ['provenance: đủ (đối chứng)', 'is_provenance', provenance({ createdBy: agent({ agent: 'synthesis' }) }), true],
      ['approval: thiếu approvedBy', 'is_approval_record', approvalWithout('approvedBy'), false],
      ['approval: thiếu decision', 'is_approval_record', approvalWithout('decision'), false],
      ['approval: thiếu apr', 'is_approval_record', approvalWithout('apr'), false],
      ['approval: đủ (đối chứng)', 'is_approval_record', approval('plan_version', plan.planVersionId), true],
      ['approval: NULL (đối chứng)', 'is_approval_record', null, true],
    ];

    // Gọi thẳng hàm: kết quả phải là false hoặc true, không bao giờ NULL.
    const returned: Record<string, unknown> = {};
    for (const [name, fn, value] of cases) {
      returned[name] = (await pg.admin<{ result: boolean | null }>(DB, `SELECT app.${fn}($1::jsonb) AS result`, [value]))[0]?.result;
    }
    expect(returned).toEqual(Object.fromEntries(cases.map(([name, , , expected]) => [name, expected])));

    // CHECK của plan_version, ghi bằng _app như service thật: ca false bị từ chối (23514), ca đối chứng qua.
    const column = { is_actor_ref: 'updated_by', is_provenance: 'provenance', is_approval_record: 'approval' } as const;
    const written: Record<string, unknown> = {};
    for (const [name, fn, value] of cases) {
      written[name] = await asApp(plan.accountId, (q) =>
        q(`UPDATE app.plan_version SET ${column[fn]} = $1 WHERE id = $2`, [value, plan.planVersionId]));
    }
    expect(written).toEqual(Object.fromEntries(cases.map(([name, , , expected]) => [name, expected ? undefined : '23514'])));
  });
});
