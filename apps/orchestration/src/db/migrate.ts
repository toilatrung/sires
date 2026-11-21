// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Áp migration của sires_orchestration bằng migrate() của drizzle-orm (migrator node-postgres), không cần
// drizzle-kit: image production chỉ có phụ thuộc chạy (kiến trúc 6.10, D1; PID-00010 EC01). Dùng bởi Job migration
// (src/migrate.ts, migration.command ở deploy/values.yaml) và test.

import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

/** Biến môi trường chứa DSN của vai trò migrator (thành viên sires_orchestration_owner, database 3.2). */
export const MIGRATOR_URL_ENV = 'DATABASE_MIGRATOR_URL';

/**
 * Thư mục migrations/ của app (SQL và meta/_journal.json). Tính từ vị trí file: src/db khi chạy test, dist/db khi
 * chạy bản build; cả hai cùng cách gốc app hai cấp, và image có thư mục này nhờ trường `files` của package.json.
 */
export const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'migrations');

/** Schema và bảng sổ phiên bản của drizzle (mặc định của công cụ); ngoài app, replica nên không thuộc DDL (EC04). */
export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

export interface MigrationResult {
  /** Số migration áp mới ở lần chạy này (0 khi database đã ở bản mới nhất). */
  readonly applied: number;
  /** Tổng số migration đã ghi sổ sau lần chạy. */
  readonly total: number;
}

/**
 * Áp mọi migration chưa ghi sổ, trong một giao dịch của drizzle: lỗi ở bất kỳ câu nào thì rollback toàn bộ, lỗi
 * PostgreSQL được ném lại nguyên vẹn (EC03). Migration đã ghi sổ không áp lại (EC02).
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<MigrationResult> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const before = await countRecorded(client);
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
    const total = await countRecorded(client);
    return { applied: total - before, total };
  } finally {
    await client.end();
  }
}

async function countRecorded(client: Client): Promise<number> {
  const { rows } = await client.query<{ present: boolean }>('SELECT to_regclass($1) IS NOT NULL AS present', [
    `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  ]);
  if (!rows[0]?.present) return 0;
  const counted = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  return Number(counted.rows[0]?.n ?? 0);
}

export interface CommandIo {
  readonly env: NodeJS.ProcessEnv;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * Lệnh migrate (Job migration, `pnpm --filter @sires/orchestration migrate`). Trả mã thoát: 0 khi xong, 1 khi thiếu
 * DSN hoặc migration lỗi. Không in DSN (có mật khẩu).
 */
export async function runMigrationCommand(io: CommandIo): Promise<number> {
  const url = io.env[MIGRATOR_URL_ENV]?.trim();
  if (!url) {
    io.stderr(`orchestration migrate: thiếu biến môi trường ${MIGRATOR_URL_ENV} (DSN của vai trò migrator)`);
    return 1;
  }
  try {
    const result = await runMigrations(url);
    io.stdout(`orchestration migrate: áp ${result.applied} migration mới, đã ghi sổ ${result.total}`);
    return 0;
  } catch (error) {
    io.stderr(`orchestration migrate: lỗi, không áp migration nào — ${describeError(error)}`);
    return 1;
  }
}

/** Lỗi của drizzle bọc lỗi PostgreSQL trong `cause`; nêu cả mã SQLSTATE để người vận hành tra được. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    parts.push(typeof code === 'string' ? `${current.message} (SQLSTATE ${code})` : current.message);
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(' ← ') : String(error);
}
