// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

export const MIGRATIONS_FOLDER = join(__dirname, '..', 'migrations');

/** Migrator/owner DSN; runtime _app credentials must never run migrations. */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

export async function runMigrationCommand(env: NodeJS.ProcessEnv): Promise<number> {
  const url = env.DATABASE_MIGRATOR_URL;
  if (!url?.trim()) {
    process.stderr.write('sample-service migrate: thiếu DATABASE_MIGRATOR_URL\n');
    return 1;
  }
  try {
    await runMigrations(url);
    process.stdout.write('sample-service migrate: hoàn tất\n');
    return 0;
  } catch {
    // Avoid leaking credentials from connection errors. Test callers can inspect runMigrations' cause.
    process.stderr.write('sample-service migrate: migration lỗi; kiểm tra database và vai trò\n');
    return 1;
  }
}
