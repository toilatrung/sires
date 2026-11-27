// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Migration sires_gateway (PID-00014 S01): schema khớp DDL tham chiếu, thiếu vai trò (EC13), RLS (EC16), lệnh
// migrate; app.find_session tra phiên trước tenant context (DBD-14, đóng DBQ-10, H7). Mọi migration chạy bằng vai trò
// migrator thật theo database 3.2 (không SUPERUSER, không BYPASSRLS), không bằng superuser của container.
// Cần Docker (Testcontainers).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uuidv7, withAccountTransaction } from '@sires/platform';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appRoleUrl,
  applyReferenceDdl,
  createRoles,
  dumpSchema,
  GATEWAY_DATABASE,
  migratorRoleUrl,
  ownDatabase,
  ROLES,
} from './db/database.testkit';
import {
  MIGRATIONS_FOLDER,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  runMigrationCommand,
  runMigrations,
} from './db/migrate';

const APP_ROOT = join(__dirname, '..');
const REFERENCE = 'gateway_reference';

/** 2 bảng của gateway.sql và 5 bảng nền tảng của 00-common.sql (gateway không có bản sao chỉ đọc). */
const EXPECTED_TABLES = [
  'app.idempotency_key',
  'app.inbox',
  'app.job_lock',
  'app.outbox',
  'app.session',
  'app.sse_event_log',
  'app.state_transition',
];

function capture() {
  const lines: string[] = [];
  const write = (line: string) => lines.push(line);
  return { lines, write };
}

describe('gateway migration — PostgreSQL 16 + pgvector, vai trò thật (database 3.2)', () => {
  let postgres: StartedPostgres;
  let admin: Pool;
  let app: Pool;
  const accountA = uuidv7();
  const accountB = uuidv7();

  beforeAll(async () => {
    postgres = await startPostgres({ database: GATEWAY_DATABASE, extensions: [] });
    admin = new Pool({ connectionString: postgres.connectionUri });
    await createRoles(admin);
    await ownDatabase(admin, GATEWAY_DATABASE);
    // Lệnh migrate của service (cùng hàm mà node dist/migrate.js gọi), đăng nhập bằng migrator như Job ở cụm.
    const run = capture();
    expect(
      await runMigrationCommand(
        { DATABASE_MIGRATOR_URL: migratorRoleUrl(postgres.connectionUri) },
        run.write,
        run.write,
      ),
    ).toBe(0);
    expect(run.lines).toEqual(['gateway migrate: migrations applied\n']);
    app = new Pool({ connectionString: appRoleUrl(postgres.connectionUri) });
  });

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await postgres?.stop();
  });

  it('áp lên database rỗng: schema khớp DDL, lệnh chạy lại không áp lại', async () => {
    // Database tham chiếu dựng từ 00-common.sql + gateway.sql cũng bằng migrator, nên phép so giữ cả OWNER TO, GRANT,
    // policy và extension (pg_dump đầy đủ, chỉ bỏ schema sổ của drizzle).
    await admin.query(`CREATE DATABASE ${REFERENCE}`);
    await ownDatabase(admin, REFERENCE);
    await applyReferenceDdl(migratorRoleUrl(postgres.connectionUri, REFERENCE));
    const migrated = await dumpSchema(postgres, GATEWAY_DATABASE);
    expect(migrated).toBe(await dumpSchema(postgres, REFERENCE));
    for (const fragment of [
      'SECURITY DEFINER',
      'ALTER TABLE ONLY app.session FORCE ROW LEVEL SECURITY',
      `CREATE POLICY owner_lookup ON app.session FOR SELECT TO ${ROLES.owner} USING (true)`,
      `ALTER FUNCTION app.find_session(p_sid_hash bytea) OWNER TO ${ROLES.owner}`,
      `GRANT ALL ON FUNCTION app.find_session(p_sid_hash bytea) TO ${ROLES.app}`,
      `GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE app.session TO ${ROLES.app}`,
    ]) {
      expect(migrated).toContain(fragment);
    }
    const tables = await admin.query<{ name: string }>(
      `select table_schema || '.' || table_name as name from information_schema.tables
       where table_schema in ('app', 'replica') and table_type = 'BASE TABLE' order by 1`,
    );
    expect(tables.rows.map((row) => row.name)).toEqual(EXPECTED_TABLES);
    const extensions = await admin.query(
      "select extname from pg_extension where extname in ('pgcrypto','unaccent','pg_trgm') order by extname",
    );
    expect(extensions.rows.map((row) => row.extname)).toEqual(['pg_trgm', 'pgcrypto', 'unaccent']);
    // Chạy lại không áp lại: sổ một dòng, schema không đổi.
    await runMigrations(migratorRoleUrl(postgres.connectionUri));
    const ledger = await admin.query(`select count(*)::int as n from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`);
    expect(ledger.rows[0].n).toBe(1);
    expect(await dumpSchema(postgres, GATEWAY_DATABASE)).toBe(migrated);
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual(['0000_init']);
    expect(MIGRATIONS_FOLDER).toBe(join(APP_ROOT, 'migrations'));
  });

  it('RLS gateway (EC16): đúng tài khoản, khác tài khoản và thiếu context', async () => {
    await admin.query(
      `insert into app.session (account_id, sid_hash, csrf_token_hash, absolute_expires_at)
      values ($1, decode('01','hex'), decode('02','hex'), now() + interval '1 day')`,
      [accountA],
    );
    const db = drizzle(app);
    const seenA = await withAccountTransaction(db, accountA, (tx) => tx.execute(sql`select * from app.session`));
    const seenB = await withAccountTransaction(db, accountB, (tx) => tx.execute(sql`select * from app.session`));
    expect(seenA.rows).toHaveLength(1);
    expect(seenB.rows).toHaveLength(0);
    expect((await app.query('select * from app.session')).rows).toHaveLength(0);
    await expect(
      withAccountTransaction(db, accountB, (tx) =>
        tx.execute(sql`
      insert into app.session (account_id,sid_hash,csrf_token_hash,absolute_expires_at)
      values (${accountA},decode('03','hex'),decode('04','hex'),now() + interval '1 day')
    `),
      ),
    ).rejects.toThrow();
    const role = (await app.query('select rolsuper, rolbypassrls from pg_roles where rolname=current_user')).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('lệnh migrate thiếu DSN hoặc DSN sai trả lỗi và không in bí mật', async () => {
    const run = capture();
    expect(await runMigrationCommand({}, run.write, run.write)).toBe(1);
    expect(
      await runMigrationCommand(
        { DATABASE_MIGRATOR_URL: 'postgres://hidden-password@127.0.0.1:1/db' },
        run.write,
        run.write,
      ),
    ).toBe(1);
    expect(run.lines.join('')).not.toContain('hidden-password');
  });

  it('DBQ-10 / G2: app.find_session phải đọc được phiên trước tenant context với vai trò thật', async () => {
    const owner = await admin.query(`
      select r.rolname, r.rolsuper, r.rolbypassrls
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where n.nspname='app' and p.proname='find_session'
    `);
    expect(owner.rows).toEqual([{ rolname: 'sires_gateway_owner', rolsuper: false, rolbypassrls: false }]);
    const sidHash = Buffer.alloc(32, 83);
    await admin.query(
      `insert into app.session (account_id, sid_hash, csrf_token_hash, absolute_expires_at)
       values ($1, $2, $3, now() + interval '1 day')`,
      [accountA, sidHash, Buffer.alloc(32, 84)],
    );
    // DBD-14: hàm chạy bằng owner đọc app.session qua policy owner_lookup; _app gọi khi chưa có app.account_id.
    const result = await app.query('select account_id from app.find_session($1)', [sidHash]);
    expect(result.rows).toEqual([{ account_id: accountA }]);
    // Policy chỉ cho owner và chỉ SELECT: _app đọc thẳng bảng khi chưa có context vẫn thấy 0 dòng (không nới RLS).
    expect((await app.query('select id from app.session where sid_hash = $1', [sidHash])).rows).toEqual([]);
  });
});

describe('gateway migration — thiếu vai trò (EC13)', () => {
  let postgres: StartedPostgres;
  let admin: Pool;

  beforeAll(async () => {
    postgres = await startPostgres({ database: GATEWAY_DATABASE, extensions: [] });
    admin = new Pool({ connectionString: postgres.connectionUri });
  });

  afterAll(async () => {
    await admin?.end();
    await postgres?.stop();
  });

  it('thiếu vai trò thì migration lỗi (EC13) và rollback DDL', async () => {
    // Chưa có vai trò sires_gateway_* nào nên không có migrator: chạy bằng superuser của container, để lỗi đến từ
    // DDL (vai trò trong CREATE POLICY, GRANT) chứ không từ đăng nhập.
    const run = capture();
    expect(await runMigrationCommand({ DATABASE_MIGRATOR_URL: postgres.connectionUri }, run.write, run.write)).toBe(1);
    expect(run.lines.join('')).toContain('SQLSTATE 42704');
    expect(run.lines.join('')).not.toContain(postgres.password);
    const leftovers = await admin.query(
      `select nspname as name from pg_namespace where nspname in ('app', 'replica')
       union all select rolname from pg_roles where rolname like 'sires\\_gateway\\_%'`,
    );
    expect(leftovers.rows).toEqual([]);
  });
});
