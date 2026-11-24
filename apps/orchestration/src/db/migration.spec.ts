// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00019-AC01: database dựng từ migration khớp database dựng từ DDL tham chiếu (S01); dòng app.state_transition
// của database dựng từ migration bằng tập do helper PID-00158 sinh từ khai báo và bằng dòng của DDL (S02).
// Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compareStateTransitionRows,
  defineStateMachine,
  renderStateTransitionSql,
  stateTransitionRows,
} from '@sires/platform';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stateMachines, workflowStateMachine } from '../domain/state-machines';
import {
  EXPECTED_TABLES,
  listTables,
  type OrchestrationPostgres,
  ROLES,
  sqlState,
  startOrchestrationPostgres,
} from './database.testkit';
import { MIGRATIONS_FOLDER, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, runMigrationCommand, runMigrations } from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'orch_migrated';
const REFERENCE = 'orch_reference';
/** Migration trong migrations/, theo thứ tự journal. */
const MIGRATION_TAGS = ['0000_init', '0001_ec09_jsonb_helpers', '0002_state_transition'] as const;
const MIGRATION_COUNT = MIGRATION_TAGS.length;
/** Migration nạp dòng app.state_transition (S02). */
const STATE_TRANSITION_FILE = '0002_state_transition.sql';
const ROWS_SQL = 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3';

type StateTransitionDbRow = { machine: string; from_state: string; to_state: string; code: string | null };
type JournalEntry = { idx: number; when: number; tag: string };

function readJournal(folder: string = MIGRATIONS_FOLDER): { entries: JournalEntry[] } & Record<string, unknown> {
  return JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
}

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
      // Chữ tiếng Việt trong thân hàm đọc đúng (bản dump không có U+FFFD do giải mã theo chunk).
      'Agent Run % đã kết thúc, bất biến',
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
    expect(second).toEqual({ applied: 0, total: MIGRATION_COUNT });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    const recorded = await pg.admin<{ n: string }>(
      MIGRATED,
      `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    expect(recorded).toEqual([{ n: String(MIGRATION_COUNT) }]);
    // SQL đồng bộ của helper chạy lại không đổi dòng nào (sổ phiên bản đã chặn chạy lại; đây là lớp thứ hai).
    expect(await pg.admin<StateTransitionDbRow>(MIGRATED, ROWS_SQL)).toHaveLength(43);
  });

  // S02 (PID-00019-AC01 phần dữ liệu, EC06): ba nguồn bằng nhau — tập helper sinh từ khai báo, dòng của database
  // dựng từ migration, dòng của database dựng từ DDL (43 dòng của bảy machine).
  it('state_transition sinh từ khai báo', async () => {
    const migrated = await pg.admin<StateTransitionDbRow>(MIGRATED, ROWS_SQL);
    const reference = await pg.admin<StateTransitionDbRow>(REFERENCE, ROWS_SQL);
    const noDiff = { missing: [], unexpected: [], codeMismatch: [] };
    expect(compareStateTransitionRows(migrated, stateMachines)).toEqual(noDiff);
    expect(compareStateTransitionRows(reference, stateMachines)).toEqual(noDiff);
    expect(migrated).toEqual(reference);
    expect(migrated).toHaveLength(43);
    expect(stateTransitionRows(stateMachines)).toHaveLength(43);
    const perMachine = Object.fromEntries(stateMachines.map((m) => [m.machine, m.transitions.length]));
    expect(perMachine).toEqual({
      workflow: 16, workflow_step: 11, agent_run: 5, prompt: 3, context_item: 2, deliberation: 3, deliberation_entry: 3,
    });

    // Dòng vào database chỉ qua migration 0002, là đúng SQL helper sinh (bỏ ba dòng giấy phép và dòng trống); không
    // migration nào khác có khối INSERT viết tay (D2, DEC-57).
    const file = readFileSync(join(MIGRATIONS_FOLDER, STATE_TRANSITION_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(file.split('\n').slice(4).join('\n')).toBe(renderStateTransitionSql(stateMachines));
    const sqlWithoutComments = (name: string) =>
      readFileSync(join(MIGRATIONS_FOLDER, name), 'utf8')
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');
    const inserting = readdirSync(MIGRATIONS_FOLDER)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => /INSERT\s+INTO\s+app\.state_transition\b/i.test(sqlWithoutComments(name)));
    expect(inserting).toEqual([STATE_TRANSITION_FILE]);

    // Khai báo lệch DDL (thiếu một cặp, thừa một cặp): phép so chỉ ra đúng cặp lệch (EC06).
    const drifted = defineStateMachine({
      machine: 'workflow',
      states: workflowStateMachine.states,
      transitions: [
        ...workflowStateMachine.transitions.filter((t) => !(t.from === 'Running' && t.to === 'Paused')),
        { from: 'Succeeded', to: 'Running' },
      ],
    });
    const otherMachines = stateMachines.filter((m) => m.machine !== 'workflow');
    expect(compareStateTransitionRows(migrated, [drifted, ...otherMachines])).toEqual({
      missing: [{ machine: 'workflow', fromState: 'Succeeded', toState: 'Running', code: null }],
      unexpected: [{ machine: 'workflow', fromState: 'Running', toState: 'Paused', code: null }],
      codeMismatch: [],
    });
  });

  it('chuyển ngoài bảng bị từ chối', async () => {
    // EC07: sau khi migration nạp dòng, trigger workflow_state (tg_state_transition) từ chối Running → Created với
    // check_violation, kể cả với superuser; đối chứng Running → Paused (có trong bảng) đi qua. Mỗi lần thử chạy trong
    // giao dịch riêng rồi rollback.
    const attempt = async (to: string) => {
      const client = new Client({ connectionString: pg.url(MIGRATED) });
      await client.connect();
      const account = randomUUID();
      const project = randomUUID();
      const actor = JSON.stringify({ type: 'researcher', accountId: account });
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO replica.project_state (project_id, account_id, status, deleted_at, source_version)
           VALUES ($1, $2, 'Active', NULL, 1)`,
          [project, account],
        );
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO app.workflow (account_id, project_id, type, triggered_by, status, idempotency_key, created_by)
           VALUES ($1, $2, 'discovery', $3, 'Running', 'ec07', $3) RETURNING id`,
          [account, project, actor],
        );
        const updated = await client.query<{ status: string }>(
          'UPDATE app.workflow SET status = $1 WHERE id = $2 RETURNING status',
          [to, rows[0]?.id],
        );
        return { accepted: updated.rows };
      } catch (error) {
        return { code: sqlState(error), message: error instanceof Error ? error.message : String(error) };
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    };
    expect(await attempt('Created')).toEqual({
      code: '23514',
      message: 'Chuyển trạng thái không hợp lệ cho workflow: Running → Created',
    });
    expect(await attempt('Paused')).toEqual({ accepted: [{ status: 'Paused' }] });
  });

  it('áp lần lượt 0000 → 0001_ec09 → 0002 trên cùng database', async () => {
    // Migrator của drizzle-orm chỉ áp migration có `when` (journal) lớn hơn `created_at` của dòng cuối trong sổ: một
    // migration có `when` nhỏ hơn migration đã áp bị bỏ qua mà không báo lỗi. Journal phải tăng dần theo idx.
    const journal = readJournal();
    expect(journal.entries.map((entry) => entry.tag)).toEqual([...MIGRATION_TAGS]);
    expect(journal.entries.map((entry) => entry.idx)).toEqual([0, 1, 2]);
    for (let i = 1; i < journal.entries.length; i += 1) {
      expect(journal.entries[i]!.when, journal.entries[i]!.tag).toBeGreaterThan(journal.entries[i - 1]!.when);
    }

    // Database đã ở 0001_ec09 (như database dựng từ main trước PR này), rồi chạy lệnh với đủ migration.
    const database = 'orch_stepwise';
    await pg.createDatabase(database);
    const partial = mkdtempSync(join(tmpdir(), 'orch-migrations-'));
    try {
      mkdirSync(join(partial, 'meta'));
      for (const entry of journal.entries.slice(0, 2)) {
        copyFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(partial, `${entry.tag}.sql`));
      }
      writeFileSync(
        join(partial, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
      );
      expect(await runMigrations(pg.url(database), partial)).toEqual({ applied: 2, total: 2 });
    } finally {
      rmSync(partial, { recursive: true, force: true });
    }
    expect(await pg.admin(database, ROWS_SQL)).toEqual([]);

    expect(await runMigrations(pg.url(database))).toEqual({ applied: 1, total: MIGRATION_COUNT });
    const rows = await pg.admin<StateTransitionDbRow>(database, ROWS_SQL);
    expect(compareStateTransitionRows(rows, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    expect(rows).toHaveLength(43);
    // Cùng schema với database áp một lần, và sổ ghi đúng `when` của từng migration theo thứ tự.
    expect(await pg.dumpSchema(database)).toBe(migratedDump);
    const ledger = await pg.admin<{ created_at: string }>(
      database,
      `SELECT created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY id`,
    );
    expect(ledger.map((row) => Number(row.created_at))).toEqual(journal.entries.map((entry) => entry.when));
  });
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
