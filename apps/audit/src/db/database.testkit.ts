// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres } from '@sires/testing';
import { Client, type QueryResultRow } from 'pg';

export const DDL_DIR = join(__dirname, '../../../../docs/database/ddl');
export const ROLES = {
  owner: 'sires_audit_owner', app: 'sires_audit_app', system: 'sires_audit_system', purge: 'sires_audit_purge',
} as const;
export const ACCOUNT_A = '0193a000-0000-7000-8000-00000000000a';
export const ACCOUNT_B = '0193a000-0000-7000-8000-00000000000b';
export const PROJECT = '0193a000-0000-7000-8000-000000000001';
const PASSWORD = 'audit-test-password';

export async function startAuditPostgres(withRoles = true) {
  const server = await startPostgres({ extensions: [] });
  const url = (database: string, role?: 'app' | 'system' | 'purge' | 'migrator') => {
    const parsed = new URL(server.connectionUri);
    parsed.pathname = `/${database}`;
    if (role) { parsed.username = `sires_audit_${role}`; parsed.password = PASSWORD; }
    return parsed.toString();
  };
  const query = async <R extends QueryResultRow = QueryResultRow>(database: string, sql: string, values?: unknown[]) => {
    const client = new Client({ connectionString: url(database) });
    try { await client.connect(); return (await client.query<R>(sql, values)).rows; }
    finally { await client.end(); }
  };
  try {
    if (withRoles) await query(server.database, `
      CREATE ROLE ${ROLES.owner} NOLOGIN;
      CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${PASSWORD}';
      CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${PASSWORD}';
      CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${PASSWORD}';
      CREATE ROLE sires_audit_migrator LOGIN PASSWORD '${PASSWORD}';
      GRANT ${ROLES.owner} TO sires_audit_migrator;
      ALTER ROLE sires_audit_migrator SET role = '${ROLES.owner}';
    `);
  } catch (error) { await server.stop(); throw error; }
  return {
    server, url, query,
    async createDatabase(database: string) {
      if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error('Tên database kiểm thử không hợp lệ');
      await query(server.database, `CREATE DATABASE ${database}${withRoles ? ` OWNER ${ROLES.owner}` : ''}`);
    },
    async reference(database: string) {
      const client = new Client({ connectionString: url(database, withRoles ? 'migrator' : undefined) });
      try {
        await client.connect();
        await client.query(['00-common.sql', 'audit.sql'].map((f) => readFileSync(join(DDL_DIR, f), 'utf8')).join('\n'));
      } finally { await client.end(); }
    },
    async dump(database: string) {
      const result = await server.container.exec(['pg_dump', '--schema-only', '--exclude-schema=drizzle', '-U', server.username, '-d', database]);
      if (result.exitCode !== 0) throw new Error('pg_dump schema lỗi');
      return result.stdout.replace(/\r\n/g, '\n').split('\n')
        .filter((line) => !/^\\(un)?restrict\b/.test(line) && !/^-- Dumped (from|by) /.test(line)).join('\n');
    },
    async asRole<T>(database: string, role: keyof typeof ROLES, account: string | undefined, work: (client: Client) => Promise<T>): Promise<T> {
      const client = new Client({ connectionString: url(database) });
      try {
        await client.connect();
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${ROLES[role]}`);
        if (account) await client.query("SELECT set_config('app.account_id', $1, true)", [account]);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { await client.end(); }
    },
    stop: () => server.stop(),
  };
}

export type AuditPostgres = Awaited<ReturnType<typeof startAuditPostgres>>;

export async function insertEvent(client: Client, options: {
  id?: string; actor?: unknown; apr?: string | null; summary?: string | null; account?: string;
} = {}) {
  return client.query(`INSERT INTO app.audit_event
    (id, account_id, project_id, source_service, actor, action, object_type, object_id, apr, summary, at)
    VALUES (coalesce($1::uuid, app.uuid_v7()), $2, $3, 'audit-test', $4::jsonb, 'created', 'project', $3, $5, $6, now()) RETURNING id, actor_type`,
  [options.id ?? null, options.account ?? ACCOUNT_A, PROJECT, JSON.stringify(options.actor ?? {type: 'system', component: 'audit-test'}), options.apr ?? null, options.summary ?? null]);
}
