// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { createRoles } from './database.testkit';
import { runMigrationCommand, runMigrations } from './migrations';

let postgres: StartedPostgres;
let admin: Pool;

beforeAll(async () => {
  postgres = await startPostgres();
  admin = new Pool({ connectionString: postgres.connectionUri });
  await createRoles(admin, 'sample');
});
afterAll(async () => { await admin?.end(); await postgres?.stop(); });

it('áp lên database rỗng', async () => {
  expect(await runMigrationCommand({ DATABASE_MIGRATOR_URL: postgres.connectionUri })).toBe(0);
  expect((await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid = 'app.sample_record'::regclass`)).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  const rights = await admin.query(`SELECT
    has_table_privilege('sires_sample_app','app.sample_record','SELECT,INSERT,UPDATE') AS business,
    has_table_privilege('sires_sample_app','app.sample_record','DELETE') AS deletes,
    has_table_privilege('sires_sample_app','app.outbox','INSERT') AS outbox_insert,
    has_table_privilege('sires_sample_app','app.outbox','SELECT') AS outbox_read,
    has_table_privilege('sires_sample_app','app.inbox','INSERT') AS inbox_write`);
  expect(rights.rows[0]).toEqual({ business: true, deletes: false, outbox_insert: true, outbox_read: false, inbox_write: false });
});

it('thiếu vai trò thì migration lỗi (EC08)', async () => {
  // Roles are cluster-wide: use a separate container, not merely another database in the same cluster.
  const empty = await startPostgres();
  const check = new Pool({ connectionString: empty.connectionUri });
  try {
    await expect(runMigrations(empty.connectionUri)).rejects.toThrow();
    expect(await runMigrationCommand({ DATABASE_MIGRATOR_URL: empty.connectionUri })).toBe(1);
    expect((await check.query("SELECT to_regclass('app.sample_record') AS table_name")).rows[0].table_name).toBeNull();
    expect((await check.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n).toBe(0);
  } finally { await check.end(); await empty.stop(); }
}, 120_000);

it('chạy lại migrate không áp lại (EC09)', async () => {
  await runMigrations(postgres.connectionUri);
  const dumpSchema = async () => {
    // stdout qua base64 vì exec của Testcontainers giải mã từng khúc: ký tự UTF-8 giữa hai khúc thành U+FFFD.
    const result = await postgres.container.exec(['bash', '-o', 'pipefail', '-c', 'pg_dump "$@" | base64 -w 0',
      'pg_dump', '-U', postgres.username, '-d', postgres.database, '--schema-only', '--schema=app', '--schema=replica']);
    expect(result.exitCode, result.stderr).toBe(0);
    return Buffer.from(result.stdout.trim(), 'base64').toString('utf8');
  };
  const snapshot = async () => ({
    journal: (await admin.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows,
    schema: (await dumpSchema())
      .split('\n').filter((line) => !line.startsWith('\\restrict') && !line.startsWith('\\unrestrict')).join('\n'),
  });
  const before = await snapshot();
  expect(await runMigrationCommand({ DATABASE_MIGRATOR_URL: postgres.connectionUri })).toBe(0);
  expect(await snapshot()).toEqual(before);
  expect(before.journal).toHaveLength(2);
});
