// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Test-only helper (excluded from the build): a real PostgreSQL 16 + pgvector with the reference DDL
// docs/database/ddl/00-common.sql, one tenant table with RLS, and the service roles of database 11.2.
// The shared Testcontainers fakes of libs/ts/testing arrive with PID-00004.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { integer, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

/** Same image as infra/local/compose.yaml. */
export const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';

const COMMON_DDL = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'database', 'ddl', '00-common.sql');

const appSchema = pgSchema('app');

/** A tenant table shaped like the business tables of the DDL: account_id, row_version, tg_row_version. */
export const note = appSchema.table('note', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull(),
  body: text('body').notNull(),
  rowVersion: integer('row_version').notNull(),
});

export interface TenantTestDatabase {
  /** Superuser connection string: bypasses RLS, used only to seed and to inspect. */
  adminUrl: string;
  /** Connection string of `sires_test_app`: LOGIN, NOBYPASSRLS, not the table owner. */
  appUrl: string;
  /** Runs SQL as the superuser. */
  admin<R extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<R[]>;
  stop(): Promise<void>;
}

const SETUP_SQL = `
  CREATE ROLE sires_test_app LOGIN PASSWORD 'sires-test-app' NOBYPASSRLS;
  CREATE ROLE sires_test_system NOLOGIN BYPASSRLS;
  CREATE ROLE sires_test_purge NOLOGIN BYPASSRLS;
  CREATE TABLE app.note (
    id           uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    account_id   uuid NOT NULL,
    body         text NOT NULL,
    row_version  integer NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
  );
  CREATE TRIGGER note_row_version BEFORE UPDATE ON app.note
    FOR EACH ROW EXECUTE FUNCTION app.tg_row_version();
  SELECT app.enable_tenant_rls();
  SELECT app.grant_standard('test');
`;

export async function startTenantDatabase(): Promise<TenantTestDatabase> {
  const container: StartedTestContainer = await new GenericContainer(POSTGRES_IMAGE)
    .withEnvironment({ POSTGRES_USER: 'sires', POSTGRES_PASSWORD: 'sires-test', POSTGRES_DB: 'sires_test' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const adminUrl = `postgres://sires:sires-test@${host}:${port}/sires_test`;
  const appUrl = `postgres://sires_test_app:sires-test-app@${host}:${port}/sires_test`;

  const admin = async <R extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<R[]> => {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      return (await client.query<R>(text, values)).rows;
    } finally {
      await client.end();
    }
  };

  await admin(readFileSync(COMMON_DDL, 'utf8'));
  await admin(SETUP_SQL);

  return {
    adminUrl,
    appUrl,
    admin,
    stop: async () => {
      await container.stop();
    },
  };
}
