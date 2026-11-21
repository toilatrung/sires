// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { runMigrations } from './migrations';

export const ACCOUNT_A = '0194a9b4-1234-7000-8000-000000000001';
export const ACCOUNT_B = '0194a9b4-1234-7000-8000-000000000002';
export const RECORD_ID = '0194a9b4-1234-7000-8000-000000000003';

/** Test-only provisioner. Production roles belong to Terraform; migration SQL never creates them. */
export async function createRoles(admin: Pool, service: string): Promise<void> {
  if (!/^[a-z][a-z0-9_-]*$/.test(service)) throw new TypeError('Tên service không hợp lệ');
  for (const [role, flags] of [
    ['owner', 'NOLOGIN NOBYPASSRLS'], ['app', 'LOGIN NOBYPASSRLS'],
    ['system', 'LOGIN BYPASSRLS'], ['purge', 'LOGIN BYPASSRLS'],
  ]) {
    await admin.query(`CREATE ROLE "sires_${service}_${role}" ${flags} PASSWORD 'sample-test'`);
  }
}

export function rolePool(postgres: StartedPostgres, role: 'app' | 'system'): Pool {
  return new Pool({ host: postgres.host, port: postgres.port, database: postgres.database,
    user: `sires_sample_${role}`, password: 'sample-test', max: 4 });
}

export async function startSampleDatabase() {
  const postgres = await startPostgres();
  const admin = new Pool({ connectionString: postgres.connectionUri });
  let app: Pool | undefined;
  let system: Pool | undefined;
  try {
    await createRoles(admin, 'sample');
    await runMigrations(postgres.connectionUri);
    app = rolePool(postgres, 'app');
    system = rolePool(postgres, 'system');
    const appPool = app;
    const systemPool = system;
    return {
      postgres, admin, app: appPool, system: systemPool,
      db: drizzle(appPool), systemDb: drizzle(systemPool),
      async stop() {
        await Promise.all([appPool.end(), systemPool.end(), admin.end()]);
        await postgres.stop();
      },
    };
  } catch (error) {
    await Promise.all([app?.end(), system?.end(), admin.end()]);
    await postgres.stop();
    throw error;
  }
}
