// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00019-AC03 (S05): hành vi đã ghi trong chú thích của docs/database/ddl/orchestration.sql, 00-common.sql, chạy
// bằng vai trò sires_orchestration_app trên database dựng từ migration. Mỗi thao tác chạy trong giao dịch đặt
// app.account_id (withAccountTransaction của @sires/platform) rồi rollback, nên các ca không ảnh hưởng nhau.
// Ca cần dòng app.state_transition (S02, chờ helper PID-00158) để todo. Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { withAccountTransaction, type TenantDatabase } from '@sires/platform';
import { type SQL, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OrchestrationPostgres, ROLES, sqlState, startOrchestrationPostgres } from './database.testkit';
import { runMigrations } from './migrate';

const DATABASE = 'orch_behaviour';

/** SQLSTATE theo chú thích DDL. */
const CHECK_VIOLATION = '23514'; // tg_state_transition, tg_project_writable
const UNIQUE_VIOLATION = '23505'; // workflow_one_active_per_task_uq
const INTEGRITY_VIOLATION = '23000'; // tg_immutable, tg_agent_run_final
const INSUFFICIENT_PRIVILEGE = '42501'; // REVOKE UPDATE; chính sách RLS (WITH CHECK)

const A = randomUUID(); // tài khoản A
const B = randomUUID(); // tài khoản B
const project = {
  a: randomUUID(), // Active, của A
  b: randomUUID(), // Active, của B
  archived: randomUUID(), // Archived, của A
  deleted: randomUUID(), // Active nhưng đã xóa mềm, của A
  missing: randomUUID(), // không có dòng replica.project_state
};
const id = {
  workflow: randomUUID(),
  workflowB: randomUUID(),
  step: randomUUID(),
  deliberationStep: randomUUID(),
  runFinal: randomUUID(),
  runActive: randomUUID(),
  checkpoint: randomUUID(),
  promptOpen: randomUUID(),
  promptAnswered: randomUUID(),
  contextItem: randomUUID(),
  snapshotFresh: randomUUID(),
  snapshotOutdated: randomUUID(),
  deliberation: randomUUID(),
  entry: randomUUID(),
  usage: randomUUID(),
};
const connection = randomUUID();
const researcherA = JSON.stringify({ type: 'researcher', accountId: A });
const researcherB = JSON.stringify({ type: 'researcher', accountId: B });
const seeder = JSON.stringify({ type: 'system', component: 'pid-00019-test-seed' });

/** Dữ liệu mồi, ghi bằng _system (BYPASSRLS; _app chỉ đọc replica.*). */
const SEED_SQL = `
  INSERT INTO replica.project_state (project_id, account_id, status, deleted_at, source_version) VALUES
    ('${project.a}', '${A}', 'Active', NULL, 1), ('${project.b}', '${B}', 'Active', NULL, 1),
    ('${project.archived}', '${A}', 'Archived', NULL, 2), ('${project.deleted}', '${A}', 'Active', now(), 3);
  INSERT INTO app.workflow (id, account_id, project_id, type, triggered_by, idempotency_key, created_by) VALUES
    ('${id.workflow}', '${A}', '${project.a}', 'discovery', '${researcherA}', 'seed-a', '${researcherA}'),
    ('${id.workflowB}', '${B}', '${project.b}', 'discovery', '${researcherB}', 'seed-b', '${researcherB}');
  INSERT INTO app.workflow_step (id, account_id, project_id, workflow_id, "order", kind, description, created_by) VALUES
    ('${id.step}', '${A}', '${project.a}', '${id.workflow}', 1, 'agent_run', 'bước mồi', '${seeder}'),
    ('${id.deliberationStep}', '${A}', '${project.a}', '${id.workflow}', 2, 'deliberation', 'thảo luận', '${seeder}');
  INSERT INTO app.agent_run (id, account_id, project_id, workflow_id, step_id, agent, provider_connection_id, provider,
      model, adapter_version, agent_definition_version, prompt_template_version, input_summary, context_manifest,
      status, structured_output, usage, ended_at, created_by) VALUES
    ('${id.runFinal}', '${A}', '${project.a}', '${id.workflow}', '${id.step}', 'discovery', '${connection}', 'anthropic',
      'model-x', 'a1', 'd1', 'p1', 'tóm tắt', '{}', 'Succeeded', '{}', '{"inputTokens": 10, "outputTokens": 20}', now(),
      '${seeder}'),
    ('${id.runActive}', '${A}', '${project.a}', '${id.workflow}', '${id.step}', 'discovery', '${connection}', 'anthropic',
      'model-x', 'a1', 'd1', 'p1', 'tóm tắt', '{}', 'Running', NULL, NULL, NULL, '${seeder}');
  INSERT INTO app.agent_run_debug_transcript (agent_run_id, account_id, project_id, prompt_ref, response_ref,
      captured_at, expires_at) VALUES
    ('${id.runFinal}', '${A}', '${project.a}', 'p.bin', 'r.bin', now(), now() + interval '30 days');
  INSERT INTO app.checkpoint (id, account_id, project_id, workflow_id, step_id, sequence, step_statuses,
      saved_output_refs, consistent, created_by) VALUES
    ('${id.checkpoint}', '${A}', '${project.a}', '${id.workflow}', '${id.step}', 1, '{}', '[]', true, '${seeder}');
  INSERT INTO app.interactive_agent_prompt (id, account_id, project_id, workflow_id, step_id, created_by_agent_run_id,
      type, question, pending_action, status, response, created_by) VALUES
    ('${id.promptOpen}', '${A}', '${project.a}', '${id.workflow}', '${id.step}', '${id.runActive}', 'approval',
      'Duyệt?', '{}', 'Open', NULL, '${seeder}'),
    ('${id.promptAnswered}', '${A}', '${project.a}', '${id.workflow}', '${id.step}', '${id.runActive}', 'approval',
      'Duyệt?', '{}', 'Answered', '{"text": "ok"}', '${seeder}');
  INSERT INTO app.context_item (id, account_id, project_id, scope, kind, content, source_type, source_id, created_by)
    VALUES ('${id.contextItem}', '${A}', '${project.a}', 'project', 'fact', '{"text": "mồi"}', 'researcher',
      '${randomUUID()}', '${researcherA}');
  BEGIN;
  INSERT INTO app.context_snapshot (id, account_id, project_id, deliberation_id, entities, outdated, created_by) VALUES
    ('${id.snapshotFresh}', '${A}', '${project.a}', '${id.deliberation}', '[]', false, '${seeder}'),
    ('${id.snapshotOutdated}', '${A}', '${project.a}', '${id.deliberation}', '[]', true, '${seeder}');
  INSERT INTO app.deliberation (id, account_id, project_id, workflow_id, step_id, problem_type, brief,
      context_snapshot_id, created_by) VALUES
    ('${id.deliberation}', '${A}', '${project.a}', '${id.workflow}', '${id.deliberationStep}', 'methodology', '{}',
      '${id.snapshotFresh}', '${seeder}');
  COMMIT;
  INSERT INTO app.deliberation_participant (deliberation_id, account_id, agent, provider_connection_id,
      provider_connection_name, provider, model) VALUES
    ('${id.deliberation}', '${A}', 'orchestrator', '${connection}', 'kết nối', 'anthropic', 'model-x');
  INSERT INTO app.deliberation_entry (id, account_id, project_id, workflow_id, deliberation_id, round, author,
      author_agent_run_id, type, content, created_by) VALUES
    ('${id.entry}', '${A}', '${project.a}', '${id.workflow}', '${id.deliberation}', 1, '{}', '${id.runActive}',
      'position', '{}', '${seeder}');
  INSERT INTO app.usage_ledger (id, account_id, project_id, source, source_id, provider_connection_id, provider, model,
      at) VALUES
    ('${id.usage}', '${A}', '${project.a}', 'agent_run', '${id.runFinal}', '${connection}', 'anthropic', 'model-x',
      now());
  INSERT INTO app.idempotency_key (account_id, key, operation, request_hash) VALUES
    ('${A}', 'seed-key-0001', 'createWorkflow', '\\x00');
`;

type Outcome = { ok: true; rowCount: number; rows: Record<string, unknown>[] } | { ok: false; code?: string; constraint?: string };

class Rollback extends Error {}

describe('hành vi DDL bằng vai trò _app — PID-00019-AC03', () => {
  let pg: OrchestrationPostgres;
  let pool: Pool;
  let appDb: TenantDatabase;

  beforeAll(async () => {
    pg = await startOrchestrationPostgres();
    await pg.createDatabase(DATABASE);
    await runMigrations(pg.url(DATABASE));
    const seed = new Client({ connectionString: pg.url(DATABASE, 'system') });
    await seed.connect();
    try {
      await seed.query(SEED_SQL);
    } finally {
      await seed.end();
    }
    pool = new Pool({ connectionString: pg.url(DATABASE, 'app'), max: 2 });
    appDb = drizzle({ client: pool });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await pg?.stop();
  });

  /** Chạy một câu bằng _app trong giao dịch của tài khoản `account`, luôn rollback; trả kết quả hoặc SQLSTATE. */
  async function asApp(account: string, query: SQL): Promise<Outcome> {
    let outcome: Outcome | undefined;
    try {
      await withAccountTransaction(appDb, account, async (tx) => {
        const result = await tx.execute(query);
        outcome = { ok: true, rowCount: result.rowCount ?? 0, rows: result.rows };
        throw new Rollback();
      });
    } catch (error) {
      if (error instanceof Rollback && outcome) return outcome;
      return { ok: false, code: sqlState(error), constraint: constraintOf(error) };
    }
    throw new Error('asApp: giao dịch không rollback');
  }

  const passes = (rowCount = 1) => ({ ok: true, rowCount });
  /** Bị từ chối với SQLSTATE `code` (và tên ràng buộc khi PostgreSQL nêu). */
  const rejected = (code: string, constraint?: string) => ({ ok: false, code, constraint });
  const strip = (o: Outcome) => (o.ok ? { ok: true, rowCount: o.rowCount } : o);

  it('kiểm tra tiền đề: _app là vai trò áp RLS, dữ liệu mồi có đủ', async () => {
    const [role] = await pg.admin<{ rolbypassrls: boolean; rolsuper: boolean }>(
      DATABASE,
      'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = $1',
      [ROLES.app],
    );
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
    const [{ n }] = await pg.admin<{ n: number }>(DATABASE, 'SELECT count(*)::int AS n FROM app.agent_run');
    expect(n).toBe(2);
  });

  it.todo(
    'chuyển ngoài bảng bị từ chối (ca 1: mỗi machine, check_violation; đối chứng: cặp có trong bảng đi qua); ' +
      'chặn: dòng app.state_transition chờ helper PID-00158 (S02)',
  );

  it('một Workflow chưa kết thúc cho mỗi Task (ca 2, DATA-IDEMP-002)', async () => {
    const task = randomUUID();
    const insert = (key: string, taskId: string, status = 'Created') => sql`
      INSERT INTO app.workflow (account_id, project_id, type, task_id, triggered_by, status, ended_at,
        idempotency_key, created_by)
      VALUES (${A}, ${project.a}, 'task_execution', ${taskId}, ${researcherA}::jsonb, ${status},
        CASE WHEN ${status} IN ('Succeeded', 'Failed', 'Cancelled') THEN now() END, ${key}, ${researcherA}::jsonb)`;
    // Hai câu trong cùng giao dịch: câu đầu tạo Workflow chưa kết thúc, câu sau thử Workflow chưa kết thúc thứ hai.
    const pair = async (secondKey: string, secondTask: string, secondStatus?: string) => {
      let outcome: Outcome | undefined;
      try {
        await withAccountTransaction(appDb, A, async (tx) => {
          await tx.execute(insert(`c2-first-${secondKey}`, task));
          const result = await tx.execute(insert(secondKey, secondTask, secondStatus));
          outcome = { ok: true, rowCount: result.rowCount ?? 0, rows: [] };
          throw new Rollback();
        });
      } catch (error) {
        if (error instanceof Rollback && outcome) return strip(outcome);
        return { ok: false, code: sqlState(error), constraint: constraintOf(error) };
      }
      throw new Error('không rollback');
    };
    expect(await pair('c2-second', task)).toEqual(rejected(UNIQUE_VIOLATION, 'workflow_one_active_per_task_uq'));
    for (const status of ['Running', 'Waiting for User', 'Paused', 'Interrupted']) {
      expect(await pair(`c2-${status}`, task, status), status).toEqual(
        rejected(UNIQUE_VIOLATION, 'workflow_one_active_per_task_uq'),
      );
    }
    // Đối chứng: Task khác, hoặc Workflow đã kết thúc của cùng Task, đi qua.
    expect(await pair('c2-other-task', randomUUID())).toEqual(passes());
    for (const status of ['Succeeded', 'Failed', 'Cancelled']) {
      expect(await pair(`c2-ended-${status}`, task, status), status).toEqual(passes());
    }
  });

  describe('bản ghi bất biến (ca 3–7)', () => {
    it('UPDATE checkpoint, usage_ledger bị từ chối (ca 3)', async () => {
      expect(await asApp(A, sql`UPDATE app.checkpoint SET consistent = false WHERE id = ${id.checkpoint}`)).toEqual(
        rejected(INSUFFICIENT_PRIVILEGE),
      );
      expect(await asApp(A, sql`UPDATE app.usage_ledger SET input_tokens = 1 WHERE id = ${id.usage}`)).toEqual(
        rejected(INSUFFICIENT_PRIVILEGE),
      );
      // Đối chứng: chỉ ghi thêm — INSERT đi qua.
      expect(
        strip(
          await asApp(A, sql`
            INSERT INTO app.checkpoint (account_id, project_id, workflow_id, step_id, sequence, step_statuses,
              saved_output_refs, consistent, created_by)
            VALUES (${A}, ${project.a}, ${id.workflow}, ${id.step}, 2, '{}', '[]', true, ${seeder}::jsonb)`),
        ),
      ).toEqual(passes());
      expect(
        strip(
          await asApp(A, sql`
            INSERT INTO app.usage_ledger (account_id, project_id, source, source_id, provider_connection_id, provider,
              model, at)
            VALUES (${A}, ${project.a}, 'embedding', ${randomUUID()}, ${connection}, 'openai', 'emb-1', now())`),
        ),
      ).toEqual(passes());
    });

    it('sửa prompt đã rời Open bị từ chối (ca 4)', async () => {
      expect(
        await asApp(A, sql`UPDATE app.interactive_agent_prompt SET question = 'khác' WHERE id = ${id.promptAnswered}`),
      ).toEqual(rejected(INTEGRITY_VIOLATION));
      expect(
        await asApp(A, sql`UPDATE app.interactive_agent_prompt SET response = '{"text": "lần hai"}'
                           WHERE id = ${id.promptAnswered}`),
      ).toEqual(rejected(INTEGRITY_VIOLATION));
      // Đối chứng: prompt còn Open sửa được.
      expect(
        strip(await asApp(A, sql`UPDATE app.interactive_agent_prompt SET question = 'Duyệt bản 2?'
                                 WHERE id = ${id.promptOpen}`)),
      ).toEqual(passes());
    });

    it('sửa agent_run ở trạng thái cuối bị từ chối, trừ cờ discarded (ca 5)', async () => {
      expect(await asApp(A, sql`UPDATE app.agent_run SET model = 'model-y' WHERE id = ${id.runFinal}`)).toEqual(
        rejected(INTEGRITY_VIOLATION),
      );
      expect(
        await asApp(A, sql`UPDATE app.agent_run SET usage = '{"inputTokens": 1, "outputTokens": 1}'
                           WHERE id = ${id.runFinal}`),
      ).toEqual(rejected(INTEGRITY_VIOLATION));
      // Đối chứng: đổi discarded (kết quả đến muộn, DATA-IDEMP-003) đi qua; row_version tăng đúng 1.
      const discarded = await asApp(
        A,
        sql`UPDATE app.agent_run SET discarded = true WHERE id = ${id.runFinal} RETURNING row_version`,
      );
      expect(discarded).toEqual({ ok: true, rowCount: 1, rows: [{ row_version: 2 }] });
    });

    it('đổi cột của context_item ngoài status, superseded_by_id bị từ chối (ca 6)', async () => {
      expect(
        await asApp(A, sql`UPDATE app.context_item SET content = '{"text": "sửa"}' WHERE id = ${id.contextItem}`),
      ).toEqual(rejected(INTEGRITY_VIOLATION));
      expect(await asApp(A, sql`UPDATE app.context_item SET kind = 'decision' WHERE id = ${id.contextItem}`)).toEqual(
        rejected(INTEGRITY_VIOLATION),
      );
      // Đối chứng không cần bảng chuyển trạng thái: cột mà tg_immutable luôn cho đổi (updated_by) đi qua.
      expect(
        strip(await asApp(A, sql`UPDATE app.context_item SET updated_by = ${researcherA}::jsonb
                                 WHERE id = ${id.contextItem}`)),
      ).toEqual(passes());
    });

    it.todo(
      'đổi cột của context_item ngoài status, superseded_by_id bị từ chối (ca 6) — đối chứng đổi status Active → ' +
        'Superseded cùng superseded_by_id đi qua; chặn: dòng app.state_transition chờ helper PID-00158 (S02)',
    );

    it('context_snapshot.outdated true → false bị từ chối (ca 7)', async () => {
      expect(
        await asApp(A, sql`UPDATE app.context_snapshot SET outdated = false WHERE id = ${id.snapshotOutdated}`),
      ).toEqual(rejected(INTEGRITY_VIOLATION));
      // Đối chứng: false → true (kèm changed_entities) đi qua.
      expect(
        strip(
          await asApp(A, sql`
            UPDATE app.context_snapshot SET outdated = true,
              changed_entities = ${JSON.stringify([{ type: 'plan_version', id: randomUUID(), newVersion: 2 }])}::jsonb
            WHERE id = ${id.snapshotFresh}`),
        ),
      ).toEqual(passes());
    });
  });

  it('RLS chặn đọc chéo tài khoản (ca 8)', async () => {
    const tables = await pg.admin<{ name: string }>(
      DATABASE,
      `SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity AND n.nspname IN ('app', 'replica')
       ORDER BY 1`,
    );
    // Mọi bảng có account_id trong app, replica (trừ outbox, inbox, job_lock, state_transition) bật và ép RLS.
    expect(tables.map((t) => t.name)).toEqual([
      'app.agent_run', 'app.agent_run_debug_transcript', 'app.checkpoint', 'app.context_item', 'app.context_snapshot',
      'app.deliberation', 'app.deliberation_entry', 'app.deliberation_participant', 'app.idempotency_key',
      'app.interactive_agent_prompt', 'app.usage_ledger', 'app.workflow', 'app.workflow_step', 'replica.project_state',
    ]);
    for (const { name } of tables) {
      const countOfA = sql`SELECT count(*)::int AS n FROM ${sql.raw(name)} WHERE account_id = ${A}`;
      // Đối chứng: tài khoản A thấy dòng của mình (mỗi bảng có ít nhất một dòng mồi của A).
      const own = await asApp(A, countOfA);
      expect(own.ok && (own.rows[0]?.n as number) > 0, `${name} — A thấy dòng của A`).toBe(true);
      // app.account_id = B: không thấy dòng nào của A.
      expect(await asApp(B, countOfA), `${name} — B đọc dòng của A`).toEqual({ ok: true, rowCount: 1, rows: [{ n: 0 }] });
    }
    // Ghi chéo cũng bị chặn: WITH CHECK của policy tenant_isolation.
    expect(
      await asApp(B, sql`
        INSERT INTO app.context_item (account_id, project_id, scope, kind, content, source_type, source_id, created_by)
        VALUES (${A}, ${project.a}, 'project', 'fact', '{}', 'researcher', ${randomUUID()}, ${researcherB}::jsonb)`),
    ).toEqual(rejected(INSUFFICIENT_PRIVILEGE));
    // Không đặt app.account_id: policy không khớp dòng nào (an toàn mặc định, 00-common.sql).
    const client = new Client({ connectionString: pg.url(DATABASE, 'app') });
    await client.connect();
    try {
      const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM app.workflow');
      expect(rows).toEqual([{ n: 0 }]);
    } finally {
      await client.end();
    }
  });

  it('project không Active chặn ghi Workflow (ca 9)', async () => {
    const insert = (projectId: string) => sql`
      INSERT INTO app.workflow (account_id, project_id, type, triggered_by, idempotency_key, created_by)
      VALUES (${A}, ${projectId}, 'discovery', ${researcherA}::jsonb, ${`c9-${projectId}`}, ${researcherA}::jsonb)`;
    for (const [label, projectId] of [
      ['Archived', project.archived],
      ['đã xóa mềm', project.deleted],
      ['không có trong replica.project_state', project.missing],
    ] as const) {
      expect(await asApp(A, insert(projectId)), label).toEqual(rejected(CHECK_VIOLATION));
    }
    // Đối chứng: project Active ghi được.
    expect(strip(await asApp(A, insert(project.a)))).toEqual(passes());
  });
});

function constraintOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const constraint = (current as Error & { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
    current = current.cause;
  }
  return undefined;
}
