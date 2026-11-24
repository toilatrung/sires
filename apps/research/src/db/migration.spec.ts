// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00029-AC01, phần schema (S01): database dựng từ migration khớp database dựng từ DDL tham chiếu; chạy lại không đổi (EC03);
// thiếu vai trò thì dừng, không để schema dở (EC02). Cần Docker (Testcontainers).

import { migrationBehaviourTests } from './behaviour.testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPECTED_TABLES, listTables, type ResearchPostgres, ROLES, startResearchPostgres } from './database.testkit';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, runMigrationCommand, runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'research_migrated';
const REFERENCE = 'research_reference';
const MIGRATION_COUNT = 1;

describe('migration research — PID-00029-AC01', () => {
  let pg: ResearchPostgres;
  let migratedDump: string;

  beforeAll(async () => {
    pg = await startResearchPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    expect(await runMigrations(pg.migratorUrl(MIGRATED))).toEqual({ applied: MIGRATION_COUNT, total: MIGRATION_COUNT });
    await pg.applyReferenceDdl(REFERENCE);
    migratedDump = await pg.dumpSchema(MIGRATED);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('schema khớp DDL (PID-00029-AC01)', async () => {
    // So bằng pg_dump --schema-only của hai database cùng container, cùng vai trò: mọi bảng, cột, mặc định, ràng
    // buộc (kể cả DEFERRABLE, partial unique), index (GIN), trigger, hàm, RLS, policy, GRANT, REVOKE, extension và
    // cấu hình tìm kiếm. Schema drizzle (sổ phiên bản) bị loại khỏi dump (AC01).
    expect(migratedDump).toBe(await pg.dumpSchema(REFERENCE));

    // Chặn trường hợp hai dump giống nhau vì cùng rỗng: đủ 16 bảng và đối tượng tiêu biểu.
    expect(await listTables(pg, MIGRATED)).toEqual([...EXPECTED_TABLES]);
    for (const fragment of [
      'CREATE UNIQUE INDEX artifact_version_one_accepted_uq',
      'DEFERRABLE INITIALLY DEFERRED',
      'USING gin (search_tsv)',
      'ALTER TABLE ONLY app.claim FORCE ROW LEVEL SECURITY',
      'CREATE TEXT SEARCH CONFIGURATION app.sires_simple',
      'CREATE TRIGGER evidence_state BEFORE UPDATE OF status ON app.evidence',
      `GRANT SELECT,INSERT,UPDATE ON TABLE app.claim TO ${ROLES.app}`,
    ]) {
      expect(migratedDump).toContain(fragment);
    }

    // Container không tạo vector; database của research chỉ có extension của 00-common.sql (database 3.3).
    for (const database of [pg.server.database, MIGRATED]) {
      const vector = await pg.admin(database, `SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
      expect(vector, database).toEqual([]);
    }
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
    expect(ledger).toEqual([{ schema: MIGRATIONS_SCHEMA, grantees: [ROLES.owner] }]);
  });

  it('chạy lại (EC03)', async () => {
    expect(await runMigrations(pg.migratorUrl(MIGRATED))).toEqual({ applied: 0, total: MIGRATION_COUNT });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    const rows = await pg.admin<{ n: string }>(MIGRATED, 'SELECT count(*) AS n FROM app.state_transition');
    expect(rows).toEqual([{ n: '9' }]);
  });
});

describe('migration research — thiếu vai trò thì dừng (EC02)', () => {
  let pg: ResearchPostgres;
  const database = 'research_no_roles';

  beforeAll(async () => {
    pg = await startResearchPostgres({ withRoles: false });
    await pg.createDatabase(database);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('thiếu vai trò thì dừng', async () => {
    // GRANT của app.grant_standard('research') cần vai trò có sẵn (database 3.2; H4): PostgreSQL báo undefined_object
    // (42704) và cả giao dịch của migrator rollback. Migration không tạo vai trò.
    await expect(runMigrations(pg.url(database))).rejects.toSatisfy((error: unknown) =>
      JSON.stringify(messages(error)).includes('42704'),
    );
    const leftovers = await pg.admin<{ kind: string; name: string }>(
      database,
      `SELECT 'schema' AS kind, nspname AS name FROM pg_namespace WHERE nspname IN ('app', 'replica')
       UNION ALL SELECT 'extension', extname FROM pg_extension WHERE extname <> 'plpgsql'
       UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL SELECT 'role', rolname FROM pg_roles WHERE rolname LIKE 'sires\\_research\\_%'`,
    );
    expect(leftovers).toEqual([]);
    const recorded = await pg.admin<{ n: string }>(
      database,
      `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
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

function messages(error: unknown): string[] {
  const out: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    out.push(`${current.message} ${typeof code === 'string' ? code : ''}`);
    current = current.cause;
  }
  return out;
}

migrationBehaviourTests();
