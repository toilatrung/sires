// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Pool } from 'pg';
import { runMigrations } from './migrate';

export async function createRoles(admin: Pool): Promise<void> {
  await admin.query(`
    CREATE ROLE sires_gateway_owner NOLOGIN;
    CREATE ROLE sires_gateway_app LOGIN PASSWORD 'gateway-test' NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE sires_gateway_system NOLOGIN BYPASSRLS;
    CREATE ROLE sires_gateway_purge NOLOGIN BYPASSRLS;
  `);
}

export function appRoleUrl(connectionUri: string): string {
  const url = new URL(connectionUri);
  url.username = 'sires_gateway_app';
  url.password = 'gateway-test';
  return url.toString();
}

export interface GatewayDatabase {
  postgres: StartedPostgres;
  admin: Pool;
  appUrl: string;
  stop(): Promise<void>;
}

export async function startGatewayDatabase(): Promise<GatewayDatabase> {
  const postgres = await startPostgres({ database: 'sires_gateway' });
  const admin = new Pool({ connectionString: postgres.connectionUri });
  try {
    await createRoles(admin);
    await runMigrations(postgres.connectionUri);
    return {
      postgres,
      admin,
      appUrl: appRoleUrl(postgres.connectionUri),
      async stop() {
        await admin.end();
        await postgres.stop();
      },
    };
  } catch (error) {
    await admin.end();
    await postgres.stop();
    throw error;
  }
}
