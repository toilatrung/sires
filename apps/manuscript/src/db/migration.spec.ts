// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// PID-00030 S01 trên PostgreSQL 16 + pgvector (Testcontainers; cần Docker): database dựng từ migration khớp database
// dựng từ DDL tham chiếu (PID-00030-AC01); chạy lại không đổi (EC03); thiếu vai trò thì dừng, không để schema dở
// (EC02); lệnh migrate của Job migration (P6, H3); hành vi DDL EC04–EC13 bằng đúng vai trò dịch vụ (_app có
// app.account_id, _system) như service thật.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approval,
  EXPECTED_TABLES,
  insertBibliography,
  insertBuild,
  insertFile,
  insertManuscript,
  insertProposal,
  insertRevision,
  listTables,
  type ManuscriptPostgres,
  ROLES,
  seedManuscript,
  seedProject,
  seedReference,
  type ServiceRole,
  sqlState,
  startManuscriptPostgres,
  SYSTEM_ACTOR,
} from './database.testkit';
import {
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  MIGRATOR_URL_ENV,
  runMigrationCommand,
  runMigrations,
} from './migrate';

const CONTAINER_TIMEOUT = 180_000;
const MIGRATED = 'manuscript_migrated';
const REFERENCE = 'manuscript_reference';
const DB = 'manuscript_ddl';
const MIGRATION_TAGS = ['0000_init', '0001_state_transition'] as const;
const MIGRATION_COUNT = MIGRATION_TAGS.length;
const APP_ROOT = join(__dirname, '..', '..');

/** Kết quả một câu lệnh: undefined khi qua, ngược lại SQLSTATE và thông báo lỗi. */
interface Outcome {
  readonly state: string | undefined;
  readonly message: string;
}

describe('migration manuscript — PID-00030-AC01', () => {
  let pg: ManuscriptPostgres;
  let migratedDump: string;

  beforeAll(async () => {
    pg = await startManuscriptPostgres();
    for (const database of [MIGRATED, REFERENCE, DB]) await pg.createDatabase(database);
    expect(await runMigrations(pg.url(MIGRATED, 'migrator'))).toEqual({
      applied: MIGRATION_COUNT,
      total: MIGRATION_COUNT,
    });
    await pg.applyReferenceDdl(REFERENCE);
    migratedDump = await pg.dumpSchema(MIGRATED);
    await runMigrations(pg.url(DB, 'migrator'));
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('schema khớp DDL (PID-00030-AC01)', async () => {
    // So pg_dump --schema-only của hai database cùng container, cùng vai trò migrator: extension, schema, bảng, cột,
    // kiểu, mặc định, ràng buộc (kể cả khóa ngoại DEFERRABLE, partial unique), index, hàm, trigger, RLS, policy,
    // GRANT, REVOKE, chủ sở hữu và cấu hình tìm kiếm. Schema drizzle (sổ phiên bản của công cụ) bị loại khỏi dump.
    expect(migratedDump).toBe(await pg.dumpSchema(REFERENCE));

    // Chặn trường hợp hai dump giống nhau vì cùng rỗng: đủ 13 bảng và các đối tượng tiêu biểu.
    expect(await listTables(pg, MIGRATED)).toEqual([...EXPECTED_TABLES]);
    for (const fragment of [
      'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
      'CREATE TEXT SEARCH CONFIGURATION app.sires_simple',
      'CREATE FUNCTION app.tg_change_proposal_accept()',
      'CREATE FUNCTION app.tg_bibliography_requires_trusted()',
      'CONSTRAINT manuscript_project_uq UNIQUE (project_id)',
      'ADD CONSTRAINT manuscript_current_revision_fk FOREIGN KEY (id, current_revision_id) REFERENCES app.manuscript_revision(manuscript_id, id) DEFERRABLE INITIALLY DEFERRED',
      `CREATE UNIQUE INDEX manuscript_file_path_uq ON app.manuscript_file USING btree (manuscript_id, path) WHERE (status = 'Active'::text)`,
      'CONSTRAINT build_idem_uq UNIQUE (revision_id, config_hash)',
      'CREATE TRIGGER change_proposal_accept BEFORE UPDATE OF status ON app.change_proposal',
      'CREATE TRIGGER manuscript_revision_immutable BEFORE UPDATE ON app.manuscript_revision',
      'CREATE TRIGGER manuscript_revision_project_writable BEFORE INSERT ON app.manuscript_revision',
      'CREATE TRIGGER build_state BEFORE UPDATE OF status ON app.build',
      'ALTER TABLE ONLY app.manuscript FORCE ROW LEVEL SECURITY',
      'CREATE POLICY tenant_isolation ON replica.reference_state',
      `GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE app.bibliography_entry TO ${ROLES.app}`,
      `GRANT SELECT,INSERT ON TABLE app.manuscript_revision TO ${ROLES.app}`,
      `GRANT SELECT ON TABLE replica.reference_state TO ${ROLES.app}`,
      `ALTER TABLE app.manuscript OWNER TO ${ROLES.owner}`,
    ]) {
      expect(migratedDump).toContain(fragment);
    }

    // Database của manuscript chỉ có extension của 00-common.sql (database 3.3); container không tạo sẵn vector.
    const extensions = await pg.admin<{ extname: string }>(MIGRATED, 'SELECT extname FROM pg_extension ORDER BY 1');
    expect(extensions.map((row) => row.extname)).toEqual(['pg_trgm', 'pgcrypto', 'plpgsql', 'unaccent']);

    // Mọi đối tượng của app, replica thuộc sires_manuscript_owner (database 3.2), không thuộc migrator hay superuser.
    const owners = await pg.admin<{ owner: string }>(
      MIGRATED,
      `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('app', 'replica')
       UNION SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('app', 'replica')
       UNION SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname IN ('app', 'replica', $1)`,
      [MIGRATIONS_SCHEMA],
    );
    expect(owners).toEqual([{ owner: ROLES.owner }]);

    // Sổ phiên bản của drizzle nằm ngoài app, replica; vai trò dịch vụ không có quyền trên nó.
    const ledger = await pg.admin<{ schema: string; grantees: string[] | null }>(
      MIGRATED,
      `SELECT n.nspname AS schema,
              (SELECT array_agg(DISTINCT grantee::text ORDER BY grantee::text) FROM information_schema.role_table_grants g
               WHERE g.table_schema = n.nspname AND g.table_name = c.relname AND g.grantee LIKE 'sires\\_%') AS grantees
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = $1`,
      [MIGRATIONS_TABLE],
    );
    expect(ledger).toEqual([{ schema: MIGRATIONS_SCHEMA, grantees: [ROLES.owner] }]);
  });

  it('chạy trên PostgreSQL 16 (EC01)', async () => {
    // Image của @sires/testing là PostgreSQL 16 + pgvector như compose cục bộ; migration ở beforeAll chạy bằng vai trò
    // migrator không đặc quyền và mỗi phiên của nó là owner (ALTER ROLE … SET role), không cần superuser.
    const [server] = await pg.admin<{ version: number; vector: boolean }>(
      MIGRATED,
      `SELECT current_setting('server_version_num')::int AS version,
              EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS vector`,
    );
    expect(server?.version).toBeGreaterThanOrEqual(160000);
    expect(server?.version).toBeLessThan(170000);
    expect(server?.vector).toBe(true);
    const [migrator] = await pg.admin<Record<string, boolean>>(
      MIGRATED,
      `SELECT rolsuper AS super, rolcreatedb AS createdb, rolcreaterole AS createrole, rolbypassrls AS bypassrls
       FROM pg_roles WHERE rolname = $1`,
      [ROLES.migrator],
    );
    expect(migrator).toEqual({ super: false, createdb: false, createrole: false, bypassrls: false });
    const client = await connect(pg.url(MIGRATED, 'migrator'));
    try {
      const { rows } = await client.query<{ current_user: string; session_user: string }>(
        'SELECT current_user, session_user',
      );
      expect(rows).toEqual([{ current_user: ROLES.owner, session_user: ROLES.migrator }]);
    } finally {
      await client.end();
    }
  });

  it('chạy lại (EC03)', async () => {
    expect(await runMigrations(pg.url(MIGRATED, 'migrator'))).toEqual({ applied: 0, total: MIGRATION_COUNT });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    expect(await pg.admin(MIGRATED, 'SELECT count(*)::int AS n FROM app.state_transition')).toEqual([{ n: 8 }]);
    const recorded = await pg.admin<{ n: number }>(
      MIGRATED,
      `SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    expect(recorded).toEqual([{ n: MIGRATION_COUNT }]);
  });

  it('chạy lại (EC03) — lệnh migrate của Job migration (P6, H3)', async () => {
    const database = 'manuscript_command';
    await pg.createDatabase(database);
    const first = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database, 'migrator') }, ...first.io })).toBe(
      0,
    );
    expect(first.stderr).toEqual([]);
    expect(first.stdout).toEqual([
      `manuscript migrate: áp ${MIGRATION_COUNT} migration mới, đã ghi sổ ${MIGRATION_COUNT}`,
    ]);
    expect(await pg.dumpSchema(database)).toBe(migratedDump);

    // Job migration chạy trước mỗi lần deploy: lần hai không áp gì, không lỗi, schema giữ nguyên.
    const second = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database, 'migrator') }, ...second.io })).toBe(
      0,
    );
    expect(second.stdout).toEqual([`manuscript migrate: áp 0 migration mới, đã ghi sổ ${MIGRATION_COUNT}`]);
    expect(await pg.dumpSchema(database)).toBe(migratedDump);

    // Thiếu DSN: mã thoát 1, không chạm database.
    for (const env of [{}, { [MIGRATOR_URL_ENV]: '  ' }]) {
      const run = capture();
      expect(await runMigrationCommand({ env, ...run.io })).toBe(1);
      expect(run.stdout).toEqual([]);
      expect(run.stderr).toEqual([
        `manuscript migrate: thiếu biến môi trường ${MIGRATOR_URL_ENV} (DSN của vai trò migrator)`,
      ]);
    }
  });

  it('chạy lại (EC03) — image có đủ thứ lệnh migrate cần (P6; PID-00010 EC01)', () => {
    // Thư mục migrations của bản build (dist/db → gốc app) là thư mục migrations/ của app.
    expect(MIGRATIONS_FOLDER).toBe(join(APP_ROOT, 'migrations'));
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      files: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // pnpm deploy --prod chỉ chép `files` và phụ thuộc chạy: dist/, migrations/ (gồm meta/_journal.json), drizzle-orm
    // và pg có mặt; drizzle-kit chỉ ở devDependencies.
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'migrations']));
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['drizzle-orm', 'pg']));
    expect(Object.keys(pkg.dependencies)).not.toContain('drizzle-kit');
    expect(Object.keys(pkg.devDependencies)).toContain('drizzle-kit');
    expect(pkg.scripts.migrate).toBe('node dist/migrate.js');

    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([...MIGRATION_TAGS]);

    // migration.command của deploy/values.yaml trùng script migrate (cùng điểm vào dist/migrate.js).
    const values = readFileSync(join(APP_ROOT, 'deploy', 'values.yaml'), 'utf8').replace(/\r\n/g, '\n');
    expect(values).toMatch(/^migration:\n {2}enabled: true\n {2}command: \["node", "dist\/migrate\.js"\]$/m);
  });

  describe('hành vi DDL (EC04–EC13)', () => {
    /** Chạy `work` bằng vai trò dịch vụ trong một giao dịch; trả SQLSTATE và thông báo khi lỗi (kể cả lỗi lúc COMMIT). */
    const attempt = (role: ServiceRole, accountId: string | undefined, work: (client: Client) => Promise<unknown>) =>
      pg.asRole(DB, role, accountId, work).then(
        (): Outcome => ({ state: undefined, message: '' }),
        (error: unknown): Outcome => ({
          state: sqlState(error) ?? String(error),
          message: (error as Error).message ?? '',
        }),
      );
    const run = async (role: ServiceRole, accountId: string | undefined, text: string, values?: unknown[]) =>
      (await attempt(role, accountId, (client) => client.query(text, values))).state;
    const asSystem = <T>(work: (client: Client) => Promise<T>) => pg.asRole(DB, 'system', undefined, work);

    it('RLS (EC04)', async () => {
      const a = await seedManuscript(pg, DB);
      const b = await seedManuscript(pg, DB);
      await asSystem(async (client) => {
        const referenceId = await seedReference(client, a.accountId);
        await insertFile(client, a, { path: 'main.tex' });
        await insertProposal(client, a);
        await insertBibliography(client, a, { referenceId, bibtexKey: 'smith2020' });
        await insertBuild(client, a);
        await client.query(
          `INSERT INTO app.idempotency_key (account_id, key, operation, request_hash) VALUES ($1, 'idem-key-0001', 'createManuscript', '\\x00')`,
          [a.accountId],
        );
      });
      // Bảng có RLS là đúng mọi bảng có account_id của app, replica trừ outbox, inbox (vai trò _app không đọc được).
      const tenantTables = (
        await pg.admin<{ name: string }>(
          DB,
          `SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity AND n.nspname IN ('app', 'replica') ORDER BY 1`,
        )
      ).map((row) => row.name);
      expect(tenantTables).toEqual([
        'app.bibliography_entry',
        'app.build',
        'app.change_proposal',
        'app.idempotency_key',
        'app.manuscript',
        'app.manuscript_file',
        'app.manuscript_revision',
        'replica.project_state',
        'replica.reference_state',
      ]);
      const visible = (accountId: string | undefined) =>
        pg.asRole(DB, 'app', accountId, async (client) => {
          const counts: Record<string, number> = {};
          for (const table of tenantTables) {
            const { rows } = await client.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM ${table} WHERE account_id = $1`,
              [a.accountId],
            );
            counts[table] = rows[0]?.n ?? -1;
          }
          return counts;
        });
      const all = (n: number) => Object.fromEntries(tenantTables.map((table) => [table, n]));
      expect(await visible(a.accountId)).toEqual(all(1));
      // Tài khoản B không thấy dòng nào của A; thiếu app.account_id: 0 dòng.
      expect(await visible(b.accountId)).toEqual(all(0));
      expect(await visible(undefined)).toEqual(all(0));
      // B sửa dòng của A: không thấy nên 0 dòng đổi.
      const updated = await pg.asRole(DB, 'app', b.accountId, (client) =>
        client.query(`UPDATE app.manuscript SET main_file = 'other.tex' WHERE id = $1`, [a.manuscriptId]),
      );
      expect(updated.rowCount).toBe(0);
      // Ghi dòng mang account_id của A khi đang là B: WITH CHECK của policy từ chối; ghi dòng của mình thì được.
      const idempotency = (accountId: string) =>
        run(
          'app',
          b.accountId,
          `INSERT INTO app.idempotency_key (account_id, key, operation, request_hash) VALUES ($1, $2, 'createManuscript', '\\x00')`,
          [accountId, `idem-${randomUUID()}`],
        );
      expect(await idempotency(a.accountId)).toBe('42501');
      expect(await idempotency(b.accountId)).toBeUndefined();
      expect(
        await run(
          'app',
          b.accountId,
          `INSERT INTO app.manuscript (account_id, project_id, init_mode, current_revision_id, created_by) VALUES ($1, $2, 'Blank', $3, $4)`,
          [a.accountId, a.projectId, randomUUID(), SYSTEM_ACTOR],
        ),
      ).toBe('42501');
      // Bản sao chỉ đọc với _app (grant_standard): ghi replica.* bị từ chối kể cả với dòng của chính tài khoản.
      expect(
        await run('app', a.accountId, `UPDATE replica.project_state SET status = 'Archived' WHERE project_id = $1`, [
          a.projectId,
        ]),
      ).toBe('42501');
      expect(
        await run(
          'app',
          a.accountId,
          `INSERT INTO replica.reference_state (reference_id, account_id, approval_status, bibtex_key, source_version) VALUES ($1, $2, 'Trusted', 'k', 1)`,
          [randomUUID(), a.accountId],
        ),
      ).toBe('42501');
    });

    it('một Manuscript mỗi project (EC05)', async () => {
      const a = await seedManuscript(pg, DB);
      const second = await attempt('app', a.accountId, (client) => insertManuscript(client, a.accountId, a.projectId));
      expect(second.state).toBe('23505');
      expect(second.message).toContain('manuscript_project_uq');
      // Đối chứng: project khác của cùng tài khoản thì tạo được.
      const projectId = await asSystem((client) => seedProject(client, a.accountId));
      expect(
        (await attempt('app', a.accountId, (client) => insertManuscript(client, a.accountId, projectId))).state,
      ).toBeUndefined();
    });

    it('Manuscript cần revision hiện hành (EC06)', async () => {
      const accountId = randomUUID();
      const projectId = await asSystem((client) => seedProject(client, accountId));
      // Chỉ chèn Manuscript: khóa ngoại hoãn manuscript_current_revision_fk từ chối lúc COMMIT.
      const alone = await attempt('app', accountId, (client) =>
        client.query(
          `INSERT INTO app.manuscript (account_id, project_id, init_mode, current_revision_id, created_by) VALUES ($1, $2, 'Blank', $3, $4)`,
          [accountId, projectId, randomUUID(), SYSTEM_ACTOR],
        ),
      );
      expect(alone.state).toBe('23503');
      expect(alone.message).toContain('manuscript_current_revision_fk');
      expect(
        await pg.admin(DB, 'SELECT count(*)::int AS n FROM app.manuscript WHERE project_id = $1', [projectId]),
      ).toEqual([{ n: 0 }]);
      // Revision hiện hành phải thuộc chính Manuscript đó.
      const a = await seedManuscript(pg, DB, { accountId });
      const otherProject = await asSystem((client) => seedProject(client, accountId));
      const borrowed = await attempt('app', accountId, (client) =>
        client.query(
          `INSERT INTO app.manuscript (account_id, project_id, init_mode, current_revision_id, created_by) VALUES ($1, $2, 'Blank', $3, $4)`,
          [accountId, otherProject, a.revisionId, SYSTEM_ACTOR],
        ),
      );
      expect(borrowed.state).toBe('23503');
      // Manuscript và revision đầu trong cùng giao dịch thì được.
      expect(
        (await attempt('app', accountId, (client) => insertManuscript(client, accountId, otherProject))).state,
      ).toBeUndefined();
    });

    it('ràng buộc revision (EC07)', async () => {
      const a = await seedManuscript(pg, DB);
      const proposalId = await asSystem((client) => insertProposal(client, a));
      const revision = (options: Parameters<typeof insertRevision>[2]) =>
        attempt('app', a.accountId, (client) => insertRevision(client, a, options));
      const rejected = async (options: Parameters<typeof insertRevision>[2], constraint: string) => {
        const outcome = await revision(options);
        expect(outcome.state, JSON.stringify(options)).toBe('23514');
        expect(outcome.message, JSON.stringify(options)).toContain(constraint);
      };
      // Revision số 1 có cha; revision sau không có cha.
      const fresh = await asSystem((client) => seedProject(client, a.accountId));
      const first = await attempt('app', a.accountId, async (client) => {
        const manuscriptId = randomUUID();
        const revisionId = randomUUID();
        await client.query(
          `INSERT INTO app.manuscript (id, account_id, project_id, init_mode, current_revision_id, created_by) VALUES ($1, $2, $3, 'Blank', $4, $5)`,
          [manuscriptId, a.accountId, fresh, revisionId, SYSTEM_ACTOR],
        );
        await insertRevision(
          client,
          { accountId: a.accountId, projectId: fresh, manuscriptId, revisionId },
          { id: revisionId, number: 1, parentId: a.revisionId, source: 'init' },
        );
      });
      expect(first.state).toBe('23514');
      expect(first.message).toContain('manuscript_revision_parent_ck');
      await rejected({ number: 2, parentId: null }, 'manuscript_revision_parent_ck');
      // source = change_proposal phải có change_proposal_id và ngược lại.
      await rejected({ number: 2, parentId: a.revisionId, source: 'change_proposal' }, 'manuscript_revision_source_ck');
      await rejected(
        { number: 2, parentId: a.revisionId, source: 'direct_edit', changeProposalId: proposalId },
        'manuscript_revision_source_ck',
      );
      // Đối chứng: revision hợp lệ ghi được; trùng số revision bị từ chối.
      expect(
        (await revision({ number: 2, parentId: a.revisionId, source: 'change_proposal', changeProposalId: proposalId }))
          .state,
      ).toBeUndefined();
      const duplicate = await revision({ number: 2, parentId: a.revisionId });
      expect(duplicate.state).toBe('23505');
      expect(duplicate.message).toContain('manuscript_revision_number_uq');

      // Revision bất biến: _app, _system không có quyền UPDATE; owner có quyền nhưng tg_immutable từ chối.
      const edit = `UPDATE app.manuscript_revision SET tree = '{"main.tex": "ff"}' WHERE id = '${a.revisionId}'`;
      expect(await run('app', a.accountId, edit)).toBe('42501');
      expect(await run('system', undefined, edit)).toBe('42501');
      expect(
        await pg.admin(DB, edit).then(
          () => undefined,
          (error: unknown) => sqlState(error),
        ),
      ).toBe('23000');
      expect(await pg.admin(DB, 'SELECT tree FROM app.manuscript_revision WHERE id = $1', [a.revisionId])).toEqual([
        { tree: { 'main.tex': '00' } },
      ]);
    });

    it('ràng buộc file (EC08)', async () => {
      const a = await seedManuscript(pg, DB);
      const file = (path: string, status: 'Active' | 'Deleted' = 'Active') =>
        attempt('app', a.accountId, (client) => insertFile(client, a, { path, status }));
      for (const path of ['/main.tex', 'chapters/../main.tex', '..', 'x'.repeat(301)]) {
        const outcome = await file(path);
        expect(outcome.state, path).toBe('23514');
        expect(outcome.message, path).toContain('manuscript_file_path_check');
      }
      expect((await file('x'.repeat(300))).state).toBeUndefined();
      expect((await file('chapters/intro.tex')).state).toBeUndefined();
      // Hai file Active cùng đường dẫn: partial unique manuscript_file_path_uq từ chối.
      const duplicate = await file('chapters/intro.tex');
      expect(duplicate.state).toBe('23505');
      expect(duplicate.message).toContain('manuscript_file_path_uq');
      // File Deleted không tính: ghi được file Deleted cùng đường dẫn, và sau khi xóa thì tạo lại được file Active.
      expect((await file('chapters/intro.tex', 'Deleted')).state).toBeUndefined();
      expect(
        await run(
          'app',
          a.accountId,
          `UPDATE app.manuscript_file SET status = 'Deleted', deleted_at = now() WHERE manuscript_id = $1 AND path = 'chapters/intro.tex' AND status = 'Active'`,
          [a.manuscriptId],
        ),
      ).toBeUndefined();
      expect((await file('chapters/intro.tex')).state).toBeUndefined();
      // Deleted phải đi cùng deleted_at.
      const half = await run(
        'app',
        a.accountId,
        `UPDATE app.manuscript_file SET status = 'Deleted' WHERE manuscript_id = $1 AND path = 'chapters/intro.tex' AND status = 'Active'`,
        [a.manuscriptId],
      );
      expect(half).toBe('23514');
    });

    it('proposal lỗi thời không chấp nhận được (EC09)', async () => {
      const a = await seedManuscript(pg, DB);
      const [stale, outdated] = await asSystem(async (client) => [
        await insertProposal(client, a),
        await insertProposal(client, a),
      ]);
      // Revision hiện hành đổi sang revision 2: hai proposal có base là revision 1 thành lỗi thời.
      await pg.asRole(DB, 'app', a.accountId, async (client) => {
        const next = await insertRevision(client, a, { number: 2, parentId: a.revisionId });
        await client.query('UPDATE app.manuscript SET current_revision_id = $1 WHERE id = $2', [next, a.manuscriptId]);
      });
      // Đủ citation check và phê duyệt: chỉ trigger change_proposal_accept (chạy trước trigger trạng thái) từ chối.
      const accept = await attempt('app', a.accountId, (client) =>
        client.query(
          `UPDATE app.change_proposal SET status = 'Accepted', citation_check_id = $1, citation_check_passed = true, approval = $2
           WHERE id = $3`,
          [randomUUID(), approval(stale), stale],
        ),
      );
      expect(accept.state).toBe('23514');
      expect(accept.message).toContain('đã lỗi thời');
      expect(await pg.admin(DB, 'SELECT status FROM app.change_proposal WHERE id = $1', [stale])).toEqual([
        { status: 'Proposed' },
      ]);
      // Proposal lỗi thời chuyển Outdated được.
      expect(
        await run('app', a.accountId, `UPDATE app.change_proposal SET status = 'Outdated' WHERE id = $1`, [outdated]),
      ).toBeUndefined();
    });

    it('Accepted cần citation check và phê duyệt (EC10)', async () => {
      const a = await seedManuscript(pg, DB);
      const insert = (options: Parameters<typeof insertProposal>[2]) =>
        attempt('app', a.accountId, (client) => insertProposal(client, a, { status: 'Accepted', ...options }));
      const update = async (passed: boolean | null, approved: boolean) => {
        const id = await asSystem((client) => insertProposal(client, a));
        return attempt('app', a.accountId, (client) =>
          client.query(
            `UPDATE app.change_proposal SET status = 'Accepted', citation_check_id = $1, citation_check_passed = $2, approval = $3
             WHERE id = $4`,
            [passed === null ? null : randomUUID(), passed, approved ? approval(id) : null, id],
          ),
        );
      };
      // “Chưa đạt” gồm citation check không đạt (false) và chưa có kết quả (NULL): PRD 18.2 chỉ cho Accepted khi đạt.
      const cases = [
        ['ghi mới, citation check không đạt', await insert({ citationCheckPassed: false, approved: true })],
        ['ghi mới, chưa có citation check', await insert({ citationCheckPassed: null, approved: true })],
        ['ghi mới, thiếu phê duyệt', await insert({ citationCheckPassed: true, approved: false })],
        ['chuyển Accepted, citation check không đạt', await update(false, true)],
        ['chuyển Accepted, chưa có citation check', await update(null, true)],
        ['chuyển Accepted, thiếu phê duyệt', await update(true, false)],
      ] as const;
      // So cả bảng một lần để lỗi nêu mọi ca lệch, không dừng ở ca đầu.
      expect(
        cases.map(([label, outcome]) => ({
          label,
          state: outcome.state,
          byCheck: outcome.message.includes('change_proposal_accept_ck'),
        })),
      ).toEqual(cases.map(([label]) => ({ label, state: '23514', byCheck: true })));
      // Đối chứng: đạt citation check và có phê duyệt thì chuyển được (nhánh chấp nhận kiểm thêm ở state-transition.spec.ts).
      expect((await update(true, true)).state).toBeUndefined();
    });

    it('bibliography chỉ từ Reference Trusted (EC11)', async () => {
      const a = await seedManuscript(pg, DB);
      const b = await seedManuscript(pg, DB);
      const [trusted, second, pending, revoked, foreign] = await asSystem(async (client) => [
        await seedReference(client, a.accountId),
        await seedReference(client, a.accountId),
        await seedReference(client, a.accountId, 'Pending Approval'),
        await seedReference(client, a.accountId, 'Revoked'),
        await seedReference(client, b.accountId),
      ]);
      const entry = (referenceId: string, bibtexKey: string) =>
        attempt('app', a.accountId, (client) => insertBibliography(client, a, { referenceId, bibtexKey }));
      // Không Trusted, chưa có trong bản sao, hay của tài khoản khác (RLS ẩn bản sao): trigger từ chối.
      for (const [label, referenceId] of [
        ['Pending Approval', pending],
        ['Revoked', revoked],
        ['chưa có bản sao', randomUUID()],
        ['tài khoản khác', foreign],
      ] as const) {
        const outcome = await entry(referenceId, `key-${label}`);
        expect(outcome.state, label).toBe('23514');
        expect(outcome.message, label).toContain('không Trusted');
      }
      expect((await entry(trusted, 'smith2020')).state).toBeUndefined();
      // Trùng BibTeX key hoặc trùng reference trong một Manuscript.
      const sameKey = await entry(second, 'smith2020');
      expect(sameKey.state).toBe('23505');
      expect(sameKey.message).toContain('bibliography_entry_key_uq');
      const sameReference = await entry(trusted, 'smith2020b');
      expect(sameReference.state).toBe('23505');
      expect(sameReference.message).toContain('bibliography_entry_reference_uq');
      // _app được xóa BibliographyEntry (grant_standard của manuscript), không được xóa bảng khác.
      expect(
        await run('app', a.accountId, 'DELETE FROM app.bibliography_entry WHERE manuscript_id = $1', [a.manuscriptId]),
      ).toBeUndefined();
      for (const table of ['manuscript', 'manuscript_file', 'manuscript_revision', 'change_proposal', 'build']) {
        expect(
          await run('app', a.accountId, `DELETE FROM app.${table} WHERE account_id = $1`, [a.accountId]),
          table,
        ).toBe('42501');
      }
    });

    it('build idempotent (EC12)', async () => {
      const a = await seedManuscript(pg, DB);
      const next = await asSystem((client) => insertRevision(client, a, { number: 2, parentId: a.revisionId }));
      const config = Buffer.alloc(32, 7);
      const build = (revisionId: string, configHash: Buffer) =>
        attempt('app', a.accountId, (client) => insertBuild(client, a, { revisionId, configHash }));
      expect((await build(a.revisionId, config)).state).toBeUndefined();
      const again = await build(a.revisionId, config);
      expect(again.state).toBe('23505');
      expect(again.message).toContain('build_idem_uq');
      // Khác cấu hình hoặc khác revision là build khác.
      expect((await build(a.revisionId, Buffer.alloc(32, 8))).state).toBeUndefined();
      expect((await build(next, config)).state).toBeUndefined();
    });

    it('chặn ghi theo vòng đời project (EC13)', async () => {
      for (const project of ['Archived', 'Deleted', 'none'] as const) {
        const a = await seedManuscript(pg, DB, { project });
        // _app tạo revision: tg_project_writable từ chối.
        const blocked = await attempt('app', a.accountId, (client) =>
          insertRevision(client, a, { number: 2, parentId: a.revisionId }),
        );
        expect(blocked.state, project).toBe('23514');
        expect(blocked.message, project).toContain('không ở trạng thái cho phép ghi');
        // _system (consumer, job) vẫn ghi được.
        await asSystem((client) => insertRevision(client, a, { number: 2, parentId: a.revisionId }));
      }
      // Đối chứng: project Active thì _app ghi được.
      const active = await seedManuscript(pg, DB);
      expect(
        (
          await attempt('app', active.accountId, (client) =>
            insertRevision(client, active, { number: 2, parentId: active.revisionId }),
          )
        ).state,
      ).toBeUndefined();
    });
  });
});

describe('migration manuscript — thiếu vai trò (EC02)', () => {
  let pg: ManuscriptPostgres;
  const database = 'manuscript_no_roles';

  beforeAll(async () => {
    pg = await startManuscriptPostgres({ withRoles: false });
    await pg.createDatabase(database);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('thiếu vai trò (EC02)', async () => {
    // GRANT của app.grant_standard('manuscript') cần vai trò có sẵn (database 3.2; H4): PostgreSQL báo undefined_object
    // (42704) và cả giao dịch của migrate() rollback. Migration không tạo vai trò. Chạy bằng superuser để lỗi chỉ do
    // thiếu vai trò dịch vụ.
    const error = await runMigrations(pg.url(database)).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(sqlState(error)).toBe('42704');
    const leftovers = await pg.admin<{ kind: string; name: string }>(
      database,
      `SELECT 'schema' AS kind, nspname AS name FROM pg_namespace WHERE nspname IN ('app', 'replica')
       UNION ALL SELECT 'extension', extname FROM pg_extension WHERE extname <> 'plpgsql'
       UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL SELECT 'role', rolname FROM pg_roles WHERE rolname LIKE 'sires\\_manuscript\\_%'`,
    );
    expect(leftovers).toEqual([]);
    const recorded = await pg.admin<{ n: number }>(
      database,
      `SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    );
    expect(recorded).toEqual([{ n: 0 }]);

    // Lệnh migrate: mã thoát 1, nêu lỗi PostgreSQL và SQLSTATE, không in DSN (có mật khẩu) hay văn bản migration.
    const run = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database) }, ...run.io })).toBe(1);
    expect(run.stdout).toEqual([]);
    expect(run.stderr).toHaveLength(1);
    expect(run.stderr[0]).toMatch(
      /^manuscript migrate: lỗi, không áp migration nào — .*sires_manuscript_app.* \(SQLSTATE 42704\)$/,
    );
    expect(run.stderr[0]).not.toContain(pg.server.password);
    expect(run.stderr[0]).not.toContain('CREATE');
  });
});

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) },
  };
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}
