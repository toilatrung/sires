// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uuidv7, withAccountTransaction } from '@sires/platform';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appRoleUrl, createRoles, migratorRoleUrl } from './db/database.testkit';
import { runMigrationCommand, runMigrations } from './db/migrate';

describe('gateway migration — PostgreSQL 16 + pgvector', () => {
  let postgres: StartedPostgres;
  let admin: Pool;
  let app: Pool;
  const accountA = uuidv7();
  const accountB = uuidv7();

  beforeAll(async () => {
    postgres = await startPostgres({ database: 'sires_gateway' });
    admin = new Pool({ connectionString: postgres.connectionUri });
  }, 300_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await postgres?.stop();
  }, 60_000);

  it('thiếu vai trò thì migration lỗi (EC13) và rollback DDL', async () => {
    await expect(runMigrations(postgres.connectionUri)).rejects.toThrow();
    expect((await admin.query("select to_regclass('app.session') as name")).rows[0].name).toBeNull();
    // Drizzle creates its journal before the DDL transaction; discard that superuser-owned test artifact.
    await admin.query('DROP SCHEMA drizzle CASCADE');
  });

  it('áp lên database rỗng: schema khớp DDL, lệnh chạy lại không áp lại', async () => {
    await createRoles(admin);
    const output: string[] = [];
    expect(
      await runMigrationCommand(
        { DATABASE_MIGRATOR_URL: migratorRoleUrl(postgres.connectionUri) },
        (s) => output.push(s),
        (s) => output.push(s),
      ),
    ).toBe(0);
    await runMigrations(migratorRoleUrl(postgres.connectionUri));
    expect((await admin.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n).toBe(1);
    await admin.query('CREATE DATABASE gateway_reference');
    const referenceUrl = new URL(postgres.connectionUri);
    referenceUrl.pathname = '/gateway_reference';
    const reference = new Pool({ connectionString: referenceUrl.toString() });
    try {
      const ddl = join(__dirname, '../../../docs/database/ddl');
      await reference.query(readFileSync(join(ddl, '00-common.sql'), 'utf8'));
      await reference.query(readFileSync(join(ddl, 'gateway.sql'), 'utf8'));
      const dump = async (database: string) => {
        const result = await postgres.container.exec([
          'pg_dump',
          '-U',
          postgres.username,
          '-d',
          database,
          '--schema-only',
          '--no-owner',
          '--schema=app',
          '--schema=replica',
        ]);
        expect(result.exitCode).toBe(0);
        return result.output
          .split('\n')
          .filter((line) => !line.startsWith('--') && !line.startsWith('\\') && line.trim())
          .join('\n');
      };
      expect(await dump(postgres.database)).toBe(await dump('gateway_reference'));
      const extensions = await admin.query(
        "select extname from pg_extension where extname in ('pgcrypto','unaccent','pg_trgm') order by extname",
      );
      expect(extensions.rows.map((row) => row.extname)).toEqual(['pg_trgm', 'pgcrypto', 'unaccent']);
      app = new Pool({ connectionString: appRoleUrl(postgres.connectionUri) });
    } finally {
      await reference.end();
    }
  }, 60_000);

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
    const lines: string[] = [];
    const write = (line: string) => lines.push(line);
    expect(await runMigrationCommand({}, write, write)).toBe(1);
    expect(
      await runMigrationCommand({ DATABASE_MIGRATOR_URL: 'postgres://hidden-password@127.0.0.1:1/db' }, write, write),
    ).toBe(1);
    expect(lines.join('')).not.toContain('hidden-password');
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
    // Do not skip or mark as expected failure: H7 explicitly blocks merge until the approved DDL fixes this.
    const result = await app.query('select account_id from app.find_session($1)', [sidHash]);
    expect(result.rows).toEqual([{ account_id: accountA }]);
  });
});
