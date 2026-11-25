// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Migration sires_identity (PID-00016 S01, S02): schema khớp DDL tham chiếu (PID-00016-AC02), quyền provider_secret
// (EC05), RLS (EC06), thiếu vai trò (EC07), state machine (EC08); lệnh migrate và values cho Job migration; hàm
// app.find_account_by_identity khi migration chạy bằng vai trò migrator thật (DBD-14). Cần Docker (Testcontainers).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareStateTransitionRows, findTransition, renderStateTransitionSql } from '@sires/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  enableMigratorLogin,
  EXPECTED_TABLES,
  type IdentityPostgres,
  listTables,
  ROLES,
  sqlState,
  startIdentityPostgres,
} from './db/database.testkit';
import { MIGRATIONS_FOLDER, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, MIGRATOR_URL_ENV, runMigrationCommand, runMigrations } from './db/migrate';
import { accountMachine, providerConnectionMachine, stateMachines } from './domain/state-machines';

const CONTAINER_TIMEOUT = 180_000;
const APP_ROOT = join(__dirname, '..');
const MIGRATED = 'identity_migrated';
const REFERENCE = 'identity_reference';
const ACTOR = JSON.stringify({ type: 'system', component: 'identity-test' });

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (l: string) => stdout.push(l), stderr: (l: string) => stderr.push(l) } };
}

/** Một tài khoản và một provider_connection (Untested), chèn bằng superuser. */
async function seedAccount(pg: IdentityPostgres, database: string, issuer = 'https://id.etroy.test'): Promise<{ accountId: string; connectionId: string; subject: string }> {
  const accountId = randomUUID();
  const connectionId = randomUUID();
  const subject = `sub-${accountId}`;
  await pg.admin(database, `INSERT INTO app.account (id, auth_issuer, auth_subject, display_name, created_by) VALUES ($1, $2, $3, 'Researcher', $4)`,
    [accountId, issuer, subject, ACTOR]);
  await pg.admin(database, `INSERT INTO app.provider_connection (id, account_id, name, provider, base_url, key_hint, created_by)
    VALUES ($1, $2, 'Anthropic', 'anthropic', 'https://api.anthropic.com', 'NOWN', $3)`, [connectionId, accountId, ACTOR]);
  return { accountId, connectionId, subject };
}

describe('migration identity — PID-00016-AC02', () => {
  let pg: IdentityPostgres;
  let migratedDump: string;

  beforeAll(async () => {
    pg = await startIdentityPostgres();
    await pg.createDatabase(MIGRATED);
    await pg.createDatabase(REFERENCE);
    // Lệnh migrate của service (cùng hàm mà node dist/migrate.js gọi), DSN ở DATABASE_MIGRATOR_URL.
    const run = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(MIGRATED) }, ...run.io })).toBe(0);
    expect(run.stdout).toEqual(['identity migrate: áp 2 migration mới, đã ghi sổ 2']);
    await pg.applyReferenceDdl(REFERENCE);
    migratedDump = await pg.dumpSchema(MIGRATED);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('áp lên database rỗng (PID-00016-AC02)', async () => {
    // So pg_dump --schema-only của hai database cùng container: bảng, cột (kể cả cột sinh), ràng buộc, index, view
    // (security_invoker), trigger, hàm (SECURITY DEFINER), policy, GRANT, REVOKE. Schema drizzle bị loại khỏi dump.
    expect(migratedDump).toBe(await pg.dumpSchema(REFERENCE));
    expect(await listTables(pg, MIGRATED)).toEqual([...EXPECTED_TABLES]);
    for (const fragment of [
      "CREATE VIEW app.analysis_same_model WITH (security_invoker='true')",
      'GENERATED ALWAYS AS (id) STORED',
      'SECURITY DEFINER',
      'DEFERRABLE INITIALLY DEFERRED',
      'ALTER TABLE ONLY app.provider_secret FORCE ROW LEVEL SECURITY',
      'CREATE TRIGGER provider_connection_state BEFORE UPDATE OF test_status ON app.provider_connection',
      `GRANT SELECT,INSERT,UPDATE ON TABLE app.account TO ${ROLES.app}`,
      `GRANT INSERT,DELETE ON TABLE app.provider_secret TO ${ROLES.app}`,
      `CREATE POLICY owner_lookup ON app.account FOR SELECT TO ${ROLES.owner} USING (true)`,
    ]) {
      expect(migratedDump).toContain(fragment);
    }
    // Chạy lại không đổi.
    expect(await runMigrations(pg.url(MIGRATED))).toEqual({ applied: 0, total: 2 });
    expect(await pg.dumpSchema(MIGRATED)).toBe(migratedDump);
    const ledger = await pg.admin(MIGRATED, `SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`);
    expect(ledger).toEqual([{ n: 2 }]);
  });

  it('áp lên database rỗng — lệnh migrate và giá trị Helm (S01)', () => {
    expect(MIGRATIONS_FOLDER).toBe(join(APP_ROOT, 'migrations'));
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as {
      files: string[]; scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string>;
    };
    // Image chỉ có `files` và phụ thuộc chạy: drizzle-orm, pg có; drizzle-kit chỉ ở devDependencies (PID-00010 EC01).
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'migrations']));
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['drizzle-orm', 'pg']));
    expect(Object.keys(pkg.dependencies)).not.toContain('drizzle-kit');
    expect(pkg.scripts.migrate).toBe('node dist/migrate.js');
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] };
    expect(journal.entries.map((entry) => entry.tag)).toEqual(['0000_init', '0001_state_transition']);
    const values = readFileSync(join(APP_ROOT, 'deploy', 'values.yaml'), 'utf8').replace(/\r\n/g, '\n');
    expect(values).toMatch(/^migration:\n {2}enabled: true\n {2}command: \["node", "dist\/migrate\.js"\]$/m);
  });

  it('quyền provider_secret (EC05)', async () => {
    const { accountId, connectionId } = await seedAccount(pg, MIGRATED);
    const run = (role: 'app' | 'system', text: string, values: unknown[]) =>
      pg.asRole(MIGRATED, role, accountId, (client) => client.query(text, values)).then(() => undefined, (e: unknown) => sqlState(e));
    const insert = `INSERT INTO app.provider_secret (connection_id, account_id, ciphertext, nonce, wrapped_dek, kek_version)
                    VALUES ($1, $2, '\\x01', '\\x000000000000000000000000', '\\x02', 'k1')`;
    // _app: INSERT được; SELECT, UPDATE bị từ chối. _system: SELECT được, UPDATE bị từ chối.
    expect(await run('app', insert, [connectionId, accountId])).toBeUndefined();
    expect(await run('app', 'SELECT ciphertext FROM app.provider_secret WHERE connection_id = $1', [connectionId])).toBe('42501');
    expect(await run('app', `UPDATE app.provider_secret SET kek_version = 'k2' WHERE connection_id = $1`, [connectionId])).toBe('42501');
    expect(await run('system', 'SELECT ciphertext FROM app.provider_secret WHERE connection_id = $1', [connectionId])).toBeUndefined();
    expect(await run('system', `UPDATE app.provider_secret SET kek_version = 'k2' WHERE connection_id = $1`, [connectionId])).toBe('42501');
    // _app có DELETE nhưng không có SELECT: DELETE có WHERE theo cột cần quyền SELECT cột đó nên bị từ chối; xóa key đi
    // qua ON DELETE CASCADE khi _app xóa provider_connection (khóa ngoại chạy bằng quyền chủ bảng).
    expect(await run('app', 'DELETE FROM app.provider_secret WHERE connection_id = $1', [connectionId])).toBe('42501');
    expect(await run('app', 'DELETE FROM app.provider_connection WHERE id = $1', [connectionId])).toBeUndefined();
    expect(await pg.admin(MIGRATED, 'SELECT 1 FROM app.provider_secret WHERE connection_id = $1', [connectionId])).toEqual([]);
  });

  it('RLS identity (EC06)', async () => {
    const a = await seedAccount(pg, MIGRATED);
    const b = await seedAccount(pg, MIGRATED);
    const visible = (accountId: string | undefined) =>
      pg.asRole(MIGRATED, 'app', accountId, async (client) => {
        const { rows } = await client.query<{ n: number }>(
          `SELECT (SELECT count(*) FROM app.account WHERE id = $1)::int
                + (SELECT count(*) FROM app.provider_connection WHERE account_id = $1)::int AS n`, [a.accountId]);
        return rows[0]?.n;
      });
    expect(await visible(a.accountId)).toBe(2);
    expect(await visible(b.accountId)).toBe(0);
    expect(await visible(undefined)).toBe(0);
    // Ghi cho tài khoản khác bị RLS từ chối.
    const state = await pg.asRole(MIGRATED, 'app', b.accountId, (client) =>
      client.query(`INSERT INTO app.provider_connection (account_id, name, provider, base_url, key_hint, created_by)
                    VALUES ($1, 'x', 'openai', 'https://api.openai.com', 'abcd', $2)`, [a.accountId, ACTOR]))
      .then(() => undefined, (e: unknown) => sqlState(e));
    expect(state).toBe('42501');
  });

  it('state machine account và provider_connection (EC08)', async () => {
    const rows = await pg.admin<{ machine: string; from_state: string; to_state: string; code: string | null }>(
      MIGRATED, 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3');
    expect(compareStateTransitionRows(rows, stateMachines)).toEqual({ missing: [], unexpected: [], codeMismatch: [] });
    expect(rows).toHaveLength(10);
    expect(rows).toEqual(await pg.admin(REFERENCE, 'SELECT machine, from_state, to_state, code FROM app.state_transition ORDER BY 1, 2, 3'));
    // File migration là đúng SQL helper sinh, không sửa tay (bỏ ba dòng giấy phép và dòng trống).
    const file = readFileSync(join(MIGRATIONS_FOLDER, '0001_state_transition.sql'), 'utf8').replace(/\r\n/g, '\n');
    expect(file.split('\n').slice(4).join('\n')).toBe(renderStateTransitionSql(stateMachines));

    // Trigger: mọi cặp khác trạng thái, bằng _app trong tài khoản; khớp hàm kiểm ở domain.
    for (const [machine, column, table] of [
      [accountMachine, 'status', 'app.account'],
      [providerConnectionMachine, 'test_status', 'app.provider_connection'],
    ] as const) {
      for (const from of machine.states) {
        for (const to of machine.states) {
          if (from === to) continue;
          const seeded = await seedAccount(pg, MIGRATED);
          const id = table === 'app.account' ? seeded.accountId : seeded.connectionId;
          if (from !== machine.states[0]) await pg.admin(MIGRATED, `ALTER TABLE ${table} DISABLE TRIGGER USER`).then(() =>
            pg.admin(MIGRATED, `UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [from, id])).finally(() =>
            pg.admin(MIGRATED, `ALTER TABLE ${table} ENABLE TRIGGER USER`));
          const outcome = await pg.asRole(MIGRATED, 'app', seeded.accountId, (client) =>
            client.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [to, id]))
            .then(() => 'accepted', (e: unknown) => sqlState(e));
          const expected = findTransition(machine, from, to) !== undefined ? 'accepted' : '23514';
          expect(outcome, `${machine.machine}: ${from} → ${to}`).toBe(expected);
        }
      }
    }
  });


  it('dumpSchema giữ nguyên ký tự UTF-8 nhiều byte (phép so schema không chập chờn, #100)', async () => {
    // Ký tự bị cắt giữa hai khúc stdout của docker exec thành U+FFFD; chú thích 720 KB đi qua nhiều khúc.
    const database = 'identity_utf8_probe';
    const text = 'đã kết thúc, bất biến 𝄞 '.repeat(20_000);
    await pg.createDatabase(database);
    await pg.admin(database, `CREATE TABLE public.utf8_probe (id int); COMMENT ON TABLE public.utf8_probe IS '${text}'`);
    const dump = await pg.dumpSchema(database);
    expect(dump.split(String.fromCodePoint(0xfffd)).length - 1).toBe(0);
    expect(dump.includes(`COMMENT ON TABLE public.utf8_probe IS '${text}';`)).toBe(true);
  });
});

// DBD-14 (PO 24/11/2026, đóng DBQ-10): app.find_account_by_identity là SECURITY DEFINER nên chạy bằng owner; owner
// không BYPASSRLS (database 3.2) và app.account bị FORCE RLS, nên hàm đọc qua policy owner_lookup (FOR SELECT TO owner).
// Các test khác chạy migration bằng superuser nên không phân biệt được; ở đây migration chạy bằng vai trò migrator thật
// (thành viên owner, SET role owner) và request gọi hàm bằng _app không có app.account_id, như lúc đăng nhập.
describe('migration identity — tra cứu trước tenant context bằng vai trò thật (DBD-14)', () => {
  let pg: IdentityPostgres;
  const database = 'identity_migrator';
  const ISSUER = 'https://id.etroy.test';

  beforeAll(async () => {
    pg = await startIdentityPostgres();
    await pg.createDatabase(database);
    const run = capture();
    const migratorUrl = await enableMigratorLogin(pg, database);
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: migratorUrl }, ...run.io })).toBe(0);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('migration chạy bằng quyền owner, không phải superuser', async () => {
    const rows = await pg.admin<{ owner: string; force: boolean }>(database,
      `SELECT pg_get_userbyid(c.relowner) AS owner, c.relforcerowsecurity AS force
       FROM pg_class c WHERE c.oid = 'app.account'::regclass`);
    expect(rows).toEqual([{ owner: ROLES.owner, force: true }]);
    const fn = await pg.admin<{ owner: string; definer: boolean }>(database,
      `SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS definer
       FROM pg_proc p WHERE p.oid = 'app.find_account_by_identity(text, text)'::regprocedure`);
    expect(fn).toEqual([{ owner: ROLES.owner, definer: true }]);
  });

  it('find_account_by_identity tìm thấy tài khoản khi chưa có tenant context', async () => {
    const { accountId, subject } = await seedAccount(pg, database, ISSUER);
    await seedAccount(pg, database, ISSUER);
    const found = await pg.asRole(database, 'app', undefined, async (client) =>
      (await client.query('SELECT id, status FROM app.find_account_by_identity($1, $2)', [ISSUER, subject])).rows);
    expect(found).toEqual([{ id: accountId, status: 'Active' }]);
    const missing = await pg.asRole(database, 'app', undefined, async (client) =>
      (await client.query('SELECT id FROM app.find_account_by_identity($1, $2)', [ISSUER, 'sub-khong-co'])).rows);
    expect(missing).toEqual([]);
  });

  it('_app vẫn bị RLS chặn khi đọc thẳng app.account (bản sửa không nới RLS cho request)', async () => {
    const a = await seedAccount(pg, database, ISSUER);
    const b = await seedAccount(pg, database, ISSUER);
    const read = (accountId: string | undefined) => pg.asRole(database, 'app', accountId, async (client) =>
      (await client.query<{ id: string }>('SELECT id FROM app.account WHERE id = ANY($1)', [[a.accountId, b.accountId]])).rows);
    expect(await read(undefined)).toEqual([]);
    expect(await read(a.accountId)).toEqual([{ id: a.accountId }]);
    // Cập nhật chéo tài khoản vẫn không chạm dòng nào.
    const updated = await pg.asRole(database, 'app', a.accountId, (client) =>
      client.query(`UPDATE app.account SET display_name = 'x' WHERE id = $1`, [b.accountId]));
    expect(updated.rowCount).toBe(0);
  });
});

describe('migration identity — thiếu vai trò thì migration lỗi (EC07)', () => {
  let pg: IdentityPostgres;
  const database = 'identity_no_roles';

  beforeAll(async () => {
    pg = await startIdentityPostgres({ withRoles: false });
    await pg.createDatabase(database);
  }, CONTAINER_TIMEOUT);

  afterAll(async () => {
    await pg?.stop();
  });

  it('thiếu vai trò thì migration lỗi', async () => {
    const run = capture();
    expect(await runMigrationCommand({ env: { [MIGRATOR_URL_ENV]: pg.url(database) }, ...run.io })).toBe(1);
    expect(run.stderr.join('\n')).toContain('SQLSTATE 42704');
    expect(run.stderr.join('\n')).not.toContain(pg.server.password);
    const leftovers = await pg.admin(database,
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'replica')
       UNION ALL SELECT rolname FROM pg_roles WHERE rolname LIKE 'sires\\_identity\\_%'`);
    expect(leftovers).toEqual([]);
  });
});
