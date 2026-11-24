// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00024 S01: database dựng từ migration khớp database dựng từ DDL tham chiếu (PID-00024-AC02); chạy trên
// PostgreSQL 16 (EC01); thiếu vai trò thì dừng, không để schema dở (EC02); chạy lại không đổi (EC03); hành vi DDL
// bằng vai trò dịch vụ và app.account_id như service thật (EC04–EC09). Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_TABLES,
  insertDiscoveredResult,
  insertProjectState,
  insertReference,
  insertSelection,
  type LibraryPostgres,
  listTables,
  ROLES,
  sqlState,
  startLibraryPostgres,
  SYSTEM_ACTOR,
} from './database.testkit';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, runMigrationCommand, runMigrations } from './migrate';

const MIGRATED = 'library_migrated';
const REFERENCE = 'library_reference';
const MIGRATION_COUNT = 1;
/** Số dòng app.state_transition của bốn machine (khối INSERT của library.sql). */
const TRANSITION_ROWS = 18;

/** Chạy `work` trong giao dịch của vai trò; trả SQLSTATE khi lỗi, undefined khi qua. */
type Outcome = Promise<string | undefined>;

describe('migration library — PID-00024-AC02', () => {
  let pg: LibraryPostgres;
  let migratedDump: string;

  beforeAll(async () => {
    pg = await startLibraryPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    expect(await runMigrations(pg.url(MIGRATED))).toEqual({ applied: MIGRATION_COUNT, total: MIGRATION_COUNT });
    await pg.applyReferenceDdl(REFERENCE);
    migratedDump = await pg.dumpSchema(MIGRATED);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  const as = (role: 'app' | 'system', accountId: string | undefined, work: (client: Client) => Promise<unknown>): Outcome =>
    pg.asRole(MIGRATED, role, accountId, work).then(() => undefined, (error: unknown) => sqlState(error) ?? String(error));
  const seed = <T>(work: (client: Client) => Promise<T>): Promise<T> => pg.asRole(MIGRATED, 'system', undefined, work);

  it('schema khớp DDL', async () => {
    // So bằng pg_dump --schema-only của hai database cùng container, cùng vai trò: mọi extension, schema, bảng, cột,
    // kiểu, mặc định, ràng buộc, index, hàm, trigger, RLS, policy, GRANT, REVOKE và cấu hình tìm kiếm. Schema drizzle
    // (sổ phiên bản) bị loại khỏi dump; dòng app.state_transition là dữ liệu, so ở state-transition.spec.ts (S02).
    expect(migratedDump).toBe(await pg.dumpSchema(REFERENCE));

    // Chặn trường hợp hai dump giống nhau vì cùng rỗng: đủ 10 bảng và đối tượng tiêu biểu.
    expect(await listTables(pg, MIGRATED)).toEqual([...EXPECTED_TABLES]);
    for (const fragment of [
      'CREATE TABLE replica.project_state',
      'title text GENERATED ALWAYS AS ((metadata ->> \'title\'::text)) STORED',
      'CONSTRAINT reference_bibtex_key_uq UNIQUE (account_id, bibtex_key)',
      'CREATE INDEX reference_doi_idx ON app.reference USING btree (account_id, doi) WHERE (doi IS NOT NULL)',
      'CREATE INDEX reference_title_trgm_idx ON app.reference USING gin (title public.gin_trgm_ops)',
      'ALTER TABLE ONLY app.reference FORCE ROW LEVEL SECURITY',
      'CREATE POLICY tenant_isolation ON replica.project_state',
      'CREATE TEXT SEARCH CONFIGURATION app.sires_simple',
      'CREATE TRIGGER reference_metadata_version_immutable BEFORE UPDATE ON app.reference_metadata_version',
      'CREATE TRIGGER project_reference_selection_trusted BEFORE INSERT OR UPDATE OF status ON app.project_reference_selection',
      "CREATE TRIGGER reference_approval_state BEFORE UPDATE OF approval_status ON app.reference FOR EACH ROW EXECUTE FUNCTION app.tg_state_transition('reference_approval', 'approval_status')",
      `GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE app.reference TO ${ROLES.app}`,
      `GRANT SELECT,INSERT,DELETE ON TABLE app.reference_metadata_version TO ${ROLES.app}`,
    ]) {
      expect(migratedDump).toContain(fragment);
    }

    // Database của library chỉ có extension của 00-common.sql (không có vector).
    const extensions = await pg.admin<{ extname: string }>(MIGRATED, 'SELECT extname FROM pg_extension ORDER BY 1');
    expect(extensions.map((row) => row.extname)).toEqual(['pg_trgm', 'pgcrypto', 'plpgsql', 'unaccent']);

    // Sổ phiên bản của drizzle nằm ngoài app, replica; vai trò dịch vụ không có quyền trên nó.
    const ledger = await pg.admin<{ schema: string; grantees: string[] | null }>(
      MIGRATED,
      `SELECT n.nspname AS schema,
              (SELECT array_agg(DISTINCT grantee::text) FROM information_schema.role_table_grants g
               WHERE g.table_schema = n.nspname AND g.table_name = c.relname AND g.grantee LIKE 'sires\\_%') AS grantees
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = $1`,
      [MIGRATIONS_TABLE],
    );
    expect(ledger).toEqual([{ schema: MIGRATIONS_SCHEMA, grantees: null }]);
  });

  it('chạy trên PostgreSQL 16', async () => {
    // EC01: DDL mới chạy thử trên PGlite (PostgreSQL 17); ở đây migration (beforeAll) và DDL tham chiếu đều chạy xong
    // trên PostgreSQL 16 của image pgvector — không có lỗi nào cần ghi DBQ.
    const [version] = await pg.admin<{ num: string }>(MIGRATED, `SELECT current_setting('server_version_num') AS num`);
    expect(Number(version?.num)).toBeGreaterThanOrEqual(160000);
    expect(Number(version?.num)).toBeLessThan(170000);
    const vector = await pg.admin(MIGRATED, `SELECT 1 FROM pg_available_extensions WHERE name = 'vector'`);
    expect(vector).toHaveLength(1);
    expect(await listTables(pg, REFERENCE)).toEqual([...EXPECTED_TABLES]);
  });

  it('chạy lại', async () => {
    // EC03: migration chỉ tiến; lần hai không áp gì, không lỗi, schema và dòng chuyển trạng thái giữ nguyên.
    expect(await runMigrations(pg.url(MIGRATED))).toEqual({ applied: 0, total: MIGRATION_COUNT });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    const rows = await pg.admin<{ n: string }>(MIGRATED, 'SELECT count(*) AS n FROM app.state_transition');
    expect(rows).toEqual([{ n: String(TRANSITION_ROWS) }]);
  });

  it('RLS', async () => {
    // EC04: _app (NOBYPASSRLS) chỉ thấy, ghi dòng của app.account_id; thiếu biến → 0 dòng; dòng mang account_id khác
    // bị từ chối (42501). Áp cho cả bốn bảng nghiệp vụ và bản sao replica.project_state.
    const a = randomUUID();
    const b = randomUUID();
    await seed(async (client) => {
      const projectId = await insertProjectState(client, a);
      const referenceId = await insertReference(client, a, { approvalStatus: 'Trusted' });
      await insertSelection(client, a, projectId, referenceId);
      await insertDiscoveredResult(client, a);
      await client.query(
        `INSERT INTO app.reference_metadata_version (account_id, reference_id, metadata_version, metadata, created_by)
         VALUES ($1, $2, 1, '{}', $3)`, [a, referenceId, SYSTEM_ACTOR]);
    });
    const count = (accountId: string | undefined) =>
      pg.asRole(MIGRATED, 'app', accountId, async (client) => {
        const result = await client.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM app.discovered_result WHERE account_id = $1)
                + (SELECT count(*) FROM app.reference WHERE account_id = $1)
                + (SELECT count(*) FROM app.reference_metadata_version WHERE account_id = $1)
                + (SELECT count(*) FROM app.project_reference_selection WHERE account_id = $1)
                + (SELECT count(*) FROM replica.project_state WHERE account_id = $1) AS n`, [a]);
        return Number(result.rows[0]?.n);
      });
    expect(await count(a)).toBe(5);
    expect(await count(b)).toBe(0);
    expect(await count(undefined)).toBe(0);

    // Ghi dòng của tài khoản A trong phiên tài khoản B, hoặc không có app.account_id: RLS từ chối.
    for (const session of [b, undefined]) {
      expect(await as('app', session, (client) => insertReference(client, a)), String(session)).toBe('42501');
      expect(await as('app', session, (client) => insertDiscoveredResult(client, a)), String(session)).toBe('42501');
    }
    // Sửa dòng của A từ phiên B: không thấy dòng nào nên không đổi gì.
    const updated = await pg.asRole(MIGRATED, 'app', b, async (client) =>
      (await client.query(`UPDATE app.reference SET indexing_status = 'Queued' WHERE account_id = $1`, [a])).rowCount);
    expect(updated).toBe(0);
    // Đối chứng: ghi đúng tài khoản qua.
    expect(await as('app', a, (client) => insertReference(client, a))).toBeUndefined();
  });

  it('chỉ chọn Reference Trusted', async () => {
    // EC05: tg_selection_requires_trusted từ chối selection Active trỏ tới Reference chưa Trusted (check_violation),
    // kể cả khi chọn lại (Removed → Active) sau khi Reference bị thu hồi.
    const accountId = randomUUID();
    const { projectId, pending, rejected, revoked, trusted } = await seed(async (client) => ({
      projectId: await insertProjectState(client, accountId),
      pending: await insertReference(client, accountId, { approvalStatus: 'Pending Approval' }),
      rejected: await insertReference(client, accountId, { approvalStatus: 'Rejected' }),
      revoked: await insertReference(client, accountId, { approvalStatus: 'Revoked' }),
      trusted: await insertReference(client, accountId, { approvalStatus: 'Trusted' }),
    }));
    for (const referenceId of [pending, rejected, revoked]) {
      expect(await as('app', accountId, (client) => insertSelection(client, accountId, projectId, referenceId))).toBe('23514');
      // _system (consumer, job) cũng không vượt được trigger này.
      expect(await as('system', undefined, (client) => insertSelection(client, accountId, projectId, referenceId))).toBe('23514');
    }
    // Removed thì ghi được với Reference chưa Trusted (không phải chọn vào project).
    expect(await as('app', accountId, (client) => insertSelection(client, accountId, projectId, pending, 'Removed'))).toBeUndefined();

    let selectionId = '';
    expect(await as('app', accountId, async (client) => {
      selectionId = await insertSelection(client, accountId, projectId, trusted);
    })).toBeUndefined();
    expect(await as('app', accountId, (client) =>
      client.query(`UPDATE app.project_reference_selection SET status = 'Removed' WHERE id = $1`, [selectionId]))).toBeUndefined();
    expect(await as('app', accountId, (client) =>
      client.query(`UPDATE app.reference SET approval_status = 'Revoked' WHERE id = $1`, [trusted]))).toBeUndefined();
    expect(await as('app', accountId, (client) =>
      client.query(`UPDATE app.project_reference_selection SET status = 'Active' WHERE id = $1`, [selectionId]))).toBe('23514');
  });

  it('chặn ghi theo vòng đời project', async () => {
    // EC06: tg_project_writable chặn _app ghi selection khi project Archived, đã xóa mềm hoặc chưa có bản sao;
    // _system vẫn ghi được (consumer, job — PRD 18.2).
    for (const options of [{ status: 'Archived' as const }, { deleted: true }, { status: 'none' as const }]) {
      const label = JSON.stringify(options);
      const accountId = randomUUID();
      const { projectId, referenceId } = await seed(async (client) => ({
        projectId: await insertProjectState(client, accountId, options),
        referenceId: await insertReference(client, accountId, { approvalStatus: 'Trusted' }),
      }));
      expect(await as('app', accountId, (client) => insertSelection(client, accountId, projectId, referenceId)), label).toBe('23514');
      let selectionId = '';
      expect(await as('system', undefined, async (client) => {
        selectionId = await insertSelection(client, accountId, projectId, referenceId);
      }), label).toBeUndefined();
      expect(await as('app', accountId, (client) =>
        client.query(`UPDATE app.project_reference_selection SET reason = 'x' WHERE id = $1`, [selectionId])), label).toBe('23514');
      expect(await as('system', undefined, (client) =>
        client.query(`UPDATE app.project_reference_selection SET status = 'Removed' WHERE id = $1`, [selectionId])), label).toBeUndefined();
    }
    // Đối chứng: project Active, _app ghi được.
    const accountId = randomUUID();
    const { projectId, referenceId } = await seed(async (client) => ({
      projectId: await insertProjectState(client, accountId),
      referenceId: await insertReference(client, accountId, { approvalStatus: 'Trusted' }),
    }));
    expect(await as('app', accountId, (client) => insertSelection(client, accountId, projectId, referenceId))).toBeUndefined();
  });

  it('lịch sử metadata bất biến', async () => {
    // EC07: _app, _system không có UPDATE trên reference_metadata_version (REVOKE cuối library.sql → 42501); vai trò
    // còn quyền UPDATE (ở test là superuser đã chạy migration, chủ sở hữu bảng) vẫn bị trigger tg_immutable chặn
    // (integrity_constraint_violation, 23000).
    const accountId = randomUUID();
    const referenceId = await seed(async (client) => {
      const id = await insertReference(client, accountId);
      await client.query(
        `INSERT INTO app.reference_metadata_version (account_id, reference_id, metadata_version, metadata, change_note, created_by)
         VALUES ($1, $2, 1, '{"title":"Bản 1"}', 'nhập', $3)`, [accountId, id, SYSTEM_ACTOR]);
      return id;
    });
    for (const role of ['app', 'system'] as const) {
      expect(await as(role, accountId, (client) =>
        client.query(`UPDATE app.reference_metadata_version SET change_note = 'sửa' WHERE reference_id = $1`, [referenceId])), role).toBe('42501');
    }
    expect(await pg.admin(MIGRATED, `UPDATE app.reference_metadata_version SET change_note = 'sửa' WHERE reference_id = $1`, [referenceId])
      .then(() => undefined, (error: unknown) => sqlState(error))).toBe('23000');
    // Ghi thêm bản mới vẫn được; _app được DELETE lịch sử khi xóa Reference (NFR-RET-003, grant_standard).
    expect(await as('app', accountId, (client) =>
      client.query(
        `INSERT INTO app.reference_metadata_version (account_id, reference_id, metadata_version, metadata, created_by)
         VALUES ($1, $2, 2, '{"title":"Bản 2"}', $3)`, [accountId, referenceId, SYSTEM_ACTOR]))).toBeUndefined();
    expect(await as('app', accountId, (client) =>
      client.query('DELETE FROM app.reference_metadata_version WHERE reference_id = $1', [referenceId]))).toBeUndefined();
    const left = await pg.admin<{ n: string }>(MIGRATED,
      'SELECT count(*) AS n FROM app.reference_metadata_version WHERE reference_id = $1', [referenceId]);
    expect(left).toEqual([{ n: '0' }]);
  });

  it('ràng buộc duy nhất', async () => {
    // EC08: bibtex_key duy nhất trong tài khoản (reference_bibtex_key_uq, 18.5) → 23505; khác tài khoản thì được.
    // DOI trùng chỉ cảnh báo ở tầng ứng dụng nên database ghi được (index thường reference_doi_idx).
    const a = randomUUID();
    const b = randomUUID();
    expect(await as('app', a, (client) => insertReference(client, a, { bibtexKey: 'nguyen2024urban', doi: '10.1000/xyz' }))).toBeUndefined();
    expect(await as('app', a, (client) => insertReference(client, a, { bibtexKey: 'nguyen2024urban' }))).toBe('23505');
    expect(await as('app', a, (client) => insertReference(client, a, { bibtexKey: 'tran2023', doi: '10.1000/xyz' }))).toBeUndefined();
    expect(await as('app', b, (client) => insertReference(client, b, { bibtexKey: 'nguyen2024urban', doi: '10.1000/xyz' }))).toBeUndefined();
    const rows = await pg.admin<{ n: string }>(MIGRATED, `SELECT count(*) AS n FROM app.reference WHERE doi = '10.1000/xyz'`);
    expect(rows).toEqual([{ n: '3' }]);
    // bibtex_key ngoài tập ký tự cho phép bị CHECK từ chối.
    expect(await as('app', a, (client) => insertReference(client, a, { bibtexKey: 'có dấu cách' }))).toBe('23514');
  });

  it('row_version', async () => {
    // EC09 (DATA-CONC-001): không đặt row_version thì trigger tăng 1; đặt đúng +1 được; giá trị khác bị từ chối
    // (serialization_failure, 40001). Áp cho cả bốn bảng có row_version của library.
    const accountId = randomUUID();
    const ids = await seed(async (client) => {
      const projectId = await insertProjectState(client, accountId);
      const reference = await insertReference(client, accountId, { approvalStatus: 'Trusted' });
      return {
        'app.reference': reference,
        'app.discovered_result': await insertDiscoveredResult(client, accountId),
        'app.project_reference_selection': await insertSelection(client, accountId, projectId, reference),
      };
    });
    const version = async (table: string, id: string) =>
      Number((await pg.admin<{ v: number }>(MIGRATED, `SELECT row_version AS v FROM ${table} WHERE id = $1`, [id]))[0]?.v);
    for (const [table, id] of Object.entries(ids)) {
      const update = (setRowVersion: string) => as('app', accountId, (client) =>
        client.query(`UPDATE ${table} SET updated_by = $2${setRowVersion} WHERE id = $1`, [id, SYSTEM_ACTOR]));
      expect(await update(''), table).toBeUndefined();
      expect(await version(table, id), table).toBe(2);
      expect(await update(', row_version = row_version + 1'), table).toBeUndefined();
      expect(await version(table, id), table).toBe(3);
      expect(await update(', row_version = row_version + 2'), table).toBe('40001');
      expect(await update(', row_version = 1'), table).toBe('40001');
      expect(await version(table, id), table).toBe(3);
      const [stamp] = await pg.admin<{ set: boolean }>(MIGRATED, `SELECT updated_at IS NOT NULL AS set FROM ${table} WHERE id = $1`, [id]);
      expect(stamp?.set, table).toBe(true);
    }
  });
});

describe('migration library — thiếu vai trò', () => {
  let pg: LibraryPostgres;
  const database = 'library_no_roles';

  beforeAll(async () => {
    pg = await startLibraryPostgres({ withRoles: false });
    await pg.createDatabase(database);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('thiếu vai trò', async () => {
    // EC02: GRANT của app.grant_standard('library') cần vai trò có sẵn (database 3.2; H7): PostgreSQL báo
    // undefined_object (42704) và cả giao dịch của migrator rollback. Migration không tạo vai trò.
    await expect(runMigrations(pg.url(database))).rejects.toSatisfy((error: unknown) => sqlState(error) === '42704');
    const leftovers = await pg.admin<{ kind: string; name: string }>(
      database,
      `SELECT 'schema' AS kind, nspname AS name FROM pg_namespace WHERE nspname IN ('app', 'replica')
       UNION ALL SELECT 'extension', extname FROM pg_extension WHERE extname <> 'plpgsql'
       UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL SELECT 'role', rolname FROM pg_roles WHERE rolname LIKE 'sires\\_library\\_%'`,
    );
    expect(leftovers).toEqual([]);
    const recorded = await pg.admin<{ n: string }>(database, `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`);
    expect(recorded).toEqual([{ n: '0' }]);

    // Lệnh migrate: mã thoát 1, nêu SQLSTATE, không in DSN (có mật khẩu).
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runMigrationCommand({
      env: { DATABASE_MIGRATOR_URL: pg.url(database) },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toContain('SQLSTATE 42704');
    expect(stderr.join('\n')).not.toContain(pg.server.password);
  });
});
