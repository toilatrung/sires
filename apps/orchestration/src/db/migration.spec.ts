// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00019-AC01: database dựng từ migration khớp database dựng từ DDL tham chiếu (S01), khai báo state machine
// khớp dòng app.state_transition của DDL (S02, phần không cần helper PID-00158). Cần Docker (Testcontainers).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stateMachines } from '../domain/state-machines';
import {
  EXPECTED_TABLES,
  listTables,
  type OrchestrationPostgres,
  ROLES,
  startOrchestrationPostgres,
} from './database.testkit';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, runMigrationCommand, runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'orch_migrated';
const REFERENCE = 'orch_reference';
const UTF8_PROBE = 'orch_utf8_probe';
// Trộn ký tự 1, 2, 3 và 4 byte; 20 000 lần (720 KB) để stdout của pg_dump qua nhiều khúc của docker exec.
const UTF8_PROBE_TEXT = 'đã kết thúc, bất biến 𝄞 '.repeat(20_000);

describe('migration orchestration — PID-00019-AC01', () => {
  let pg: OrchestrationPostgres;
  let migratedDump: string;

  beforeAll(async () => {
    pg = await startOrchestrationPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    await runMigrations(pg.url(MIGRATED));
    await pg.applyReferenceDdl(REFERENCE);
    migratedDump = await pg.dumpSchema(MIGRATED);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('schema khớp DDL', async () => {
    const referenceDump = await pg.dumpSchema(REFERENCE);
    // Phép so bằng pg_dump --schema-only của cả hai database (cùng container, cùng vai trò): mọi bảng, cột, mặc
    // định, cột sinh, ràng buộc (kể cả DEFERRABLE), index (partial, INCLUDE, GIN), trigger, hàm, RLS, policy,
    // GRANT, extension và cấu hình tìm kiếm. Schema drizzle (sổ phiên bản) bị loại khỏi dump (EC04).
    expect(migratedDump).toBe(referenceDump);

    // Chặn trường hợp hai dump giống nhau vì cùng rỗng: đủ 18 bảng và các đối tượng tiêu biểu có mặt.
    expect(await listTables(pg, MIGRATED)).toEqual([...EXPECTED_TABLES]);
    for (const fragment of [
      'CREATE UNIQUE INDEX workflow_one_active_per_task_uq',
      'DEFERRABLE INITIALLY DEFERRED',
      'GENERATED ALWAYS AS',
      'USING gin (entities jsonb_path_ops)',
      'ALTER TABLE ONLY app.workflow FORCE ROW LEVEL SECURITY',
      'CREATE POLICY tenant_isolation ON replica.project_state',
      'CREATE TEXT SEARCH CONFIGURATION app.sires_simple',
      'CREATE TRIGGER workflow_state BEFORE UPDATE OF status ON app.workflow',
      `GRANT SELECT ON TABLE replica.project_state TO ${ROLES.app}`,
    ]) {
      expect(migratedDump).toContain(fragment);
    }
    // REVOKE cuối orchestration.sql có hiệu lực: checkpoint, usage_ledger chỉ ghi thêm.
    const privileges = await pg.admin<{ role: string; table: string; can_update: boolean }>(
      MIGRATED,
      `SELECT r AS role, t AS table, has_table_privilege(r, t, 'UPDATE') AS can_update
       FROM unnest($1::text[]) r, unnest(ARRAY['app.checkpoint', 'app.usage_ledger', 'app.workflow']) t ORDER BY 1, 2`,
      [[ROLES.app, ROLES.system]],
    );
    expect(privileges.filter((p) => p.can_update).map((p) => `${p.role} ${p.table}`)).toEqual([
      `${ROLES.app} app.workflow`,
      `${ROLES.system} app.workflow`,
    ]);
  });

  it('schema khớp DDL — extension và bảng sổ phiên bản (EC04, EC05)', async () => {
    const extensions = await pg.admin<{ extname: string }>(MIGRATED, 'SELECT extname FROM pg_extension ORDER BY 1');
    // vector chỉ có ở database mặc định của container (startPostgres), không thuộc DDL orchestration (database 3.3).
    expect(extensions.map((row) => row.extname)).toEqual(['pg_trgm', 'pgcrypto', 'plpgsql', 'unaccent']);
    const serverDefault = await pg.admin<{ extname: string }>(
      pg.server.database,
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(serverDefault).toHaveLength(1);

    // Sổ phiên bản của drizzle nằm ngoài app, replica: grant_standard không cấp quyền cho vai trò dịch vụ.
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

  it('chạy lại không đổi schema (EC02)', async () => {
    const second = await runMigrations(pg.url(MIGRATED));
    expect(second).toEqual({ applied: 0, total: 2 });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    const recorded = await pg.admin<{ n: string }>(
      MIGRATED,
      `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    expect(recorded).toEqual([{ n: '2' }]);
  });

  it('dumpSchema giữ nguyên ký tự UTF-8 nhiều byte (phép so schema không chập chờn)', async () => {
    // Ký tự bị cắt giữa hai khúc stdout thành U+FFFD; với chú thích dài, cách giải mã từng khúc gần như chắc chắn lỗi.
    await pg.createDatabase(UTF8_PROBE);
    await pg.admin(
      UTF8_PROBE,
      `CREATE TABLE public.utf8_probe (id int); COMMENT ON TABLE public.utf8_probe IS '${UTF8_PROBE_TEXT}'`,
    );
    const dump = await pg.dumpSchema(UTF8_PROBE);
    expect(dump.split(String.fromCodePoint(0xfffd)).length - 1).toBe(0);
    expect(dump.includes(`COMMENT ON TABLE public.utf8_probe IS '${UTF8_PROBE_TEXT}';`)).toBe(true);
  }, 60_000);

  // S02, phần không cần helper: khai báo khớp đúng 43 dòng mà khối INSERT của DDL tạo ra (EC06).
  it('state_transition sinh từ khai báo — khai báo khớp dòng của DDL (43 cặp)', async () => {
    const rows = await pg.admin<{ machine: string; from_state: string; to_state: string; code: string | null }>(
      REFERENCE,
      'SELECT machine, from_state, to_state, code FROM app.state_transition',
    );
    const key = (machine: string, from: string, to: string) => `${machine}: ${from} → ${to}`;
    const reference = new Set(rows.map((row) => key(row.machine, row.from_state, row.to_state)));
    const declared = new Set(
      stateMachines.flatMap((m) => m.transitions.map((t) => key(m.machine, t.from, t.to))),
    );
    // Báo đúng cặp lệch khi khai báo thiếu hoặc thừa (EC06).
    expect({
      missing: [...reference].filter((pair) => !declared.has(pair)),
      unexpected: [...declared].filter((pair) => !reference.has(pair)),
    }).toEqual({ missing: [], unexpected: [] });
    expect(reference.size).toBe(43);
    expect(rows.every((row) => row.code === null)).toBe(true);
    // Mỗi trạng thái của cặp nằm trong danh sách trạng thái của machine.
    for (const m of stateMachines) {
      const states: readonly string[] = m.states;
      for (const t of m.transitions) {
        expect(states, key(m.machine, t.from, t.to)).toEqual(expect.arrayContaining([t.from, t.to]));
      }
    }
  });

  it.todo(
    'state_transition sinh từ khai báo — dòng của database dựng từ migration bằng tập helper PID-00158 sinh ' +
      '(compareStateTransitionRows rỗng); chặn: chờ PID-00158',
  );
  it.todo('chuyển ngoài bảng bị từ chối (EC07: workflow Running → Created, check_violation); chặn: chờ PID-00158');
});

describe('migration orchestration — thiếu vai trò thì rollback (EC03)', () => {
  let pg: OrchestrationPostgres;
  const database = 'orch_no_roles';

  beforeAll(async () => {
    pg = await startOrchestrationPostgres({ withRoles: false });
    await pg.createDatabase(database);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('thiếu vai trò thì rollback', async () => {
    // GRANT của app.grant_standard('orchestration') cần vai trò có sẵn (database 3.2): PostgreSQL báo
    // undefined_object (42704) và cả giao dịch của migrator rollback.
    await expect(runMigrations(pg.url(database))).rejects.toSatisfy((error: unknown) => {
      const text = JSON.stringify(collectMessages(error));
      return text.includes('42704') || text.includes(ROLES.app);
    });

    const leftovers = await pg.admin<{ kind: string; name: string }>(
      database,
      `SELECT 'schema' AS kind, nspname AS name FROM pg_namespace WHERE nspname IN ('app', 'replica')
       UNION ALL SELECT 'extension', extname FROM pg_extension WHERE extname <> 'plpgsql'
       UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL SELECT 'text search config', cfgname FROM pg_ts_config WHERE cfgname = 'sires_simple'`,
    );
    expect(leftovers).toEqual([]);
    // Migrator tạo sổ phiên bản trước giao dịch; sổ không ghi dòng nào nên lần chạy sau áp lại từ đầu.
    const recorded = await pg.admin<{ n: string }>(
      database,
      `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    expect(recorded).toEqual([{ n: '0' }]);

    // Lệnh migrate báo lỗi PostgreSQL kèm SQLSTATE, mã thoát 1, không in DSN (có mật khẩu).
    const stdout: string[] = [];
    const stderr: string[] = [];
    const url = pg.url(database);
    const code = await runMigrationCommand({
      env: { DATABASE_MIGRATOR_URL: url },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    expect(code).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toContain('SQLSTATE 42704');
    expect(stderr.join('\n')).not.toContain(pg.server.password);
  });
});

function collectMessages(error: unknown): string[] {
  const out: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    out.push(`${current.message} ${typeof code === 'string' ? code : ''}`);
    current = current.cause;
  }
  return out;
}
