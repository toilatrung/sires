// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** Works from src/db and dist/db, including the production package deployed by pnpm. */
export const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
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
  } catch {
    // Connection errors can embed credentials. Never write the DSN or an unredacted exception.
    stderr('gateway migrate: migration failed; verify database roles, connectivity and SQL\n');
    return 1;
  }
}
