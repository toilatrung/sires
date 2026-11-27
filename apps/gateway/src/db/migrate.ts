// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** Works from src/db and dist/db, including the production package deployed by pnpm. */
export const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');

/** drizzle's default ledger location; outside app and replica, so it is not part of the DDL. */
export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    await client.end();
  }
}

/** PostgreSQL SQLSTATE of an error, including one wrapped by drizzle in `cause`. */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

export async function runMigrationCommand(
  env: NodeJS.ProcessEnv,
  stdout: (text: string) => void,
  stderr: (text: string) => void,
): Promise<number> {
  if (!env.DATABASE_MIGRATOR_URL) {
    stderr('gateway migrate: DATABASE_MIGRATOR_URL is required\n');
    return 1;
  }
  try {
    await runMigrations(env.DATABASE_MIGRATOR_URL);
    stdout('gateway migrate: migrations applied\n');
    return 0;
  } catch (error) {
    // Connection errors can embed credentials. Never write the DSN or an unredacted exception; the SQLSTATE
    // (five characters, e.g. 42501 missing CREATE on the database, 42704 missing role) is safe and actionable.
    const code = sqlState(error);
    stderr(
      `gateway migrate: migration failed${code ? ` (SQLSTATE ${code})` : ''}; verify database roles, connectivity and SQL\n`,
    );
    return 1;
  }
}
