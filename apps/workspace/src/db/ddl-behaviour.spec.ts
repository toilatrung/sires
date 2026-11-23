// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Hành vi DDL workspace trên database dựng từ migration (PID-00017 S02; PID-00017-AC01 phần hành vi; database 12.4):
// chỉ kiểm điều có trong DDL, bằng vai trò dịch vụ và app.account_id như service thật. Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertProject, type SeededProject, sqlState, startWorkspacePostgres, SYSTEM_ACTOR, type WorkspacePostgres } from './database.testkit';
import { runMigrations } from './migrate';

const DB = 'workspace_ddl';
const WORKSPACE_TABLES = [
  'research_project', 'research_context_version', 'conversation', 'message', 'pending_action', 'notification', 'project_purge',
] as const;

describe('hành vi DDL workspace (PID-00017 S02, PID-00017-AC01)', () => {
  let pg: WorkspacePostgres;

  beforeAll(async () => {
    pg = await startWorkspacePostgres();
    await pg.createDatabase(DB);
    await runMigrations(pg.url(DB));
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  /** SQLSTATE khi câu lỗi trong phiên của vai trò; undefined khi qua. */
  const run = (role: 'app' | 'system', accountId: string | undefined, text: string, values?: unknown[]) =>
    pg.asRole(DB, role, accountId, (client) => client.query(text, values)).then(() => undefined, (e: unknown) => sqlState(e) ?? String(e));
  const newProject = (accountId = randomUUID(), options: { name?: string } = {}): Promise<SeededProject> =>
    pg.asRole(DB, 'system', undefined, (client) => insertProject(client, accountId, options));
  /** Conversation và một message của project, chèn bằng _system; trả id message. */
  const newMessage = async (project: SeededProject): Promise<{ conversationId: string; messageId: string }> => {
    const conversationId = randomUUID();
    const messageId = randomUUID();
    await pg.asRole(DB, 'system', undefined, async (client) => {
      await client.query(`INSERT INTO app.conversation (id, account_id, scope, project_id, created_by) VALUES ($1, $2, 'project', $3, $4)`,
        [conversationId, project.accountId, project.projectId, SYSTEM_ACTOR]);
      await client.query(`INSERT INTO app.message (id, account_id, project_id, conversation_id, sender, content, created_by)
        VALUES ($1, $2, $3, $4, $5, 'Xin chào', $5)`, [messageId, project.accountId, project.projectId, conversationId, SYSTEM_ACTOR]);
    });
    return { conversationId, messageId };
  };

  it('rls (EC06)', async () => {
    const a = await newProject();
    const b = await newProject();
    await newMessage(a);
    const visible = (accountId: string | undefined) =>
      pg.asRole(DB, 'app', accountId, async (client) => {
        const counts: number[] = [];
        for (const table of ['research_project', 'research_context_version', 'conversation', 'message']) {
          counts.push(Number((await client.query(`SELECT count(*) AS n FROM app.${table} WHERE account_id = $1`, [a.accountId])).rows[0]?.n));
        }
        return counts;
      });
    expect(await visible(a.accountId)).toEqual([1, 1, 1, 1]);
    expect(await visible(b.accountId)).toEqual([0, 0, 0, 0]);
    expect(await visible(undefined)).toEqual([0, 0, 0, 0]);
    // Ghi dòng mang account_id của A khi đang là B: WITH CHECK của policy từ chối.
    expect(await run('app', b.accountId,
      `INSERT INTO app.notification (account_id, kind, message, created_by) VALUES ($1, 'completion', 'x', $2)`, [a.accountId, SYSTEM_ACTOR])).toBe('42501');
    expect(await run('app', b.accountId,
      `INSERT INTO app.notification (account_id, kind, message, created_by) VALUES ($1, 'completion', 'x', $2)`, [b.accountId, SYSTEM_ACTOR])).toBeUndefined();
  });

  it('bất biến (EC07)', async () => {
    const project = await newProject();
    const { messageId } = await newMessage(project);
    for (const [table, sql] of [
      ['research_context_version', `UPDATE app.research_context_version SET research_question = 'Đổi' WHERE id = '${project.contextVersionId}'`],
      ['message', `UPDATE app.message SET content = 'Đổi' WHERE id = '${messageId}'`],
    ] as const) {
      expect(await run('app', project.accountId, sql), `_app ${table}`).toBe('42501');
      expect(await run('system', undefined, sql), `_system ${table}`).toBe('42501');
      // Vai trò sở hữu có quyền UPDATE nhưng trigger tg_immutable từ chối.
      expect(await pg.admin(DB, sql).then(() => undefined, (e: unknown) => sqlState(e)), `owner ${table}`).toBe('23000');
    }
    expect(await pg.admin(DB, 'SELECT content FROM app.message WHERE id = $1', [messageId])).toEqual([{ content: 'Xin chào' }]);
    expect(await pg.admin(DB, 'SELECT research_question FROM app.research_context_version WHERE id = $1', [project.contextVersionId]))
      .toEqual([{ research_question: 'Câu hỏi nghiên cứu' }]);
  });

  it('quyền _app (EC08)', async () => {
    const project = await newProject();
    await newMessage(project);
    for (const table of WORKSPACE_TABLES) {
      expect(await run('app', project.accountId, `DELETE FROM app.${table} WHERE account_id = $1`, [project.accountId]), table).toBe('42501');
    }
    expect(await pg.admin(DB, 'SELECT count(*)::int AS n FROM app.research_project WHERE id = $1', [project.projectId])).toEqual([{ n: 1 }]);
  });

  it('row_version (EC09)', async () => {
    const project = await newProject();
    const read = async () => (await pg.admin<{ row_version: number; updated_at: Date | null }>(DB,
      'SELECT row_version, updated_at FROM app.research_project WHERE id = $1', [project.projectId]))[0];
    expect(await read()).toEqual({ row_version: 1, updated_at: null });
    // Không đụng row_version: tự tăng 1, updated_at đặt.
    expect(await run('app', project.accountId, `UPDATE app.research_project SET short_description = 'Mô tả' WHERE id = $1`, [project.projectId])).toBeUndefined();
    const after = await read();
    expect(after?.row_version).toBe(2);
    expect(after?.updated_at).toBeInstanceOf(Date);
    // Đặt cũ + 1: qua; khác cũ + 1: serialization_failure.
    expect(await run('app', project.accountId, `UPDATE app.research_project SET name = 'Tên mới', row_version = 3 WHERE id = $1`, [project.projectId])).toBeUndefined();
    expect(await run('app', project.accountId, `UPDATE app.research_project SET name = 'Tên khác', row_version = 9 WHERE id = $1`, [project.projectId])).toBe('40001');
    expect((await read())?.row_version).toBe(3);
  });

  it('xóa mềm (EC10)', async () => {
    const project = await newProject();
    const softDelete = (purgeAfter: string, statusBefore: string | null) =>
      run('app', project.accountId,
        `UPDATE app.research_project SET deleted_at = now(), purge_after = now() + $1::interval, status_before_deletion = $2 WHERE id = $3`,
        [purgeAfter, statusBefore, project.projectId]);
    expect(await softDelete('30 days', null)).toBe('23514');
    expect(await softDelete('29 days', 'Active')).toBe('23514');
    expect(await softDelete('30 days', 'Active')).toBeUndefined();
    // Khôi phục (phần database của DATA-STATE-001-AC03): xóa cả ba cột thì qua, chỉ xóa deleted_at thì CHECK từ chối.
    expect(await run('app', project.accountId, 'UPDATE app.research_project SET deleted_at = NULL WHERE id = $1', [project.projectId])).toBe('23514');
    expect(await run('app', project.accountId,
      'UPDATE app.research_project SET deleted_at = NULL, purge_after = NULL, status_before_deletion = NULL WHERE id = $1', [project.projectId])).toBeUndefined();
  });

  it('pending action open duy nhất (EC11)', async () => {
    const accountId = randomUUID();
    const objectId = randomUUID();
    const insert = (status: string) =>
      run('app', accountId, `INSERT INTO app.pending_action (account_id, kind, object_type, object_id, status, created_by)
        VALUES ($1, 'plan_approval', 'plan_version', $2, $3, $4)`, [accountId, objectId, status, SYSTEM_ACTOR]);
    expect(await insert('Resolved')).toBeUndefined();
    expect(await insert('Open')).toBeUndefined();
    expect(await insert('Open')).toBe('23505');
    expect(await insert('Expired')).toBeUndefined();
    // Khác object: Open mới được.
    expect(await run('app', accountId, `INSERT INTO app.pending_action (account_id, kind, object_type, object_id, created_by)
        VALUES ($1, 'plan_approval', 'plan_version', $2, $3)`, [accountId, randomUUID(), SYSTEM_ACTOR])).toBeUndefined();
  });

  it('conversation scope (EC12)', async () => {
    const project = await newProject();
    const insert = (scope: string, projectId: string | null) =>
      run('app', project.accountId, `INSERT INTO app.conversation (account_id, scope, project_id, created_by) VALUES ($1, $2, $3, $4)`,
        [project.accountId, scope, projectId, SYSTEM_ACTOR]);
    expect(await insert('project', null)).toBe('23514');
    expect(await insert('global', project.projectId)).toBe('23514');
    expect(await insert('project', project.projectId)).toBeUndefined();
    expect(await insert('global', null)).toBeUndefined();
  });

  it('tìm không dấu (EC12)', async () => {
    const accountId = randomUUID();
    const target = await newProject(accountId, { name: 'Tài liệu tham khảo đô thị' });
    await newProject(accountId, { name: 'Kinh tế học' });
    const search = (text: string) =>
      pg.asRole(DB, 'app', accountId, async (client) =>
        (await client.query<{ id: string }>(`SELECT id FROM app.research_project WHERE search_tsv @@ plainto_tsquery('app.sires_simple', $1)`, [text]))
          .rows.map((row) => row.id));
    expect(await search('tai lieu')).toEqual([target.projectId]);
    expect(await search('Tài liệu')).toEqual([target.projectId]);
    expect(await search('vật lý')).toEqual([]);
  });
});
