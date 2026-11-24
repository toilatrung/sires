// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

// src/db và dist/db đều cách gốc service hai cấp; không phụ thuộc cwd của Job.
export const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');
export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

async function countRecorded(client: Client): Promise<number> {
  const exists = await client.query('SELECT to_regclass($1) AS name', [`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`]);
  if (!exists.rows[0].name) return 0;
  const result = await client.query(`SELECT count(*) AS n FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`);
  return Number(result.rows[0].n);
}

/** Chỉ tiến; Drizzle áp các migration mới trong một giao dịch. Không tạo role. */
export async function runMigrations(connectionString: string, migrationsFolder = MIGRATIONS_FOLDER) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const before = await countRecorded(client);
    await migrate(drizzle(client), { migrationsFolder });
    const total = await countRecorded(client);
    return { applied: total - before, total };
  } finally {
    await client.end();
  }
}

export function sqlState(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

export async function runMigrationCommand(io: {
  env: NodeJS.ProcessEnv;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}): Promise<number> {
  const url = io.env.DATABASE_MIGRATOR_URL?.trim();
  if (!url) {
    io.stderr('audit migrate: thiếu DATABASE_MIGRATOR_URL');
    return 1;
  }
  try {
    const result = await runMigrations(url);
    io.stdout(`audit migrate: áp ${result.applied} migration mới, đã ghi sổ ${result.total}`);
    return 0;
  } catch (error) {
    // Không in DSN, query, params hoặc thông báo lỗi tùy ý có thể chứa credentials.
    const code = sqlState(error);
    io.stderr(`audit migrate: không kết nối hoặc áp migration được${code ? ` (SQLSTATE ${code})` : ''}`);
    return 1;
  }
}
