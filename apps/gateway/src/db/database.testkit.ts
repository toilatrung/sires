// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing không tạo extension nào; năm vai trò sires_gateway_* theo database 3.2 do test tự tạo tới khi
// compose cục bộ của PID-00159 có (H4, H5, D4). Migration luôn chạy bằng vai trò migrator thật (LOGIN, thành viên
// owner, SET role owner; không SUPERUSER, không BYPASSRLS) như Job migration ở cụm (H7, DBD-14); superuser chỉ dùng
// để tạo vai trò, database và dữ liệu mẫu của test.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client, Pool } from 'pg';
import { MIGRATIONS_SCHEMA, runMigrations } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'gateway.sql'] as const;

/** Database của service (database 3.2); container của test tạo sẵn database này. */
export const GATEWAY_DATABASE = 'sires_gateway';

export const ROLES = {
  owner: 'sires_gateway_owner',
  migrator: 'sires_gateway_migrator',
  app: 'sires_gateway_app',
  system: 'sires_gateway_system',
  purge: 'sires_gateway_purge',
} as const;

const ROLE_PASSWORD = 'gateway-test';
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Năm vai trò theo database 3.2 (cấp cụm, tạo một lần mỗi container): owner NOLOGIN giữ đối tượng; migrator LOGIN,
 * thành viên owner, tự SET role owner (PID-00159 H3); _app LOGIN áp RLS; _system, _purge BYPASSRLS.
 */
export async function createRoles(admin: Pool): Promise<void> {
  await admin.query(`
    CREATE ROLE ${ROLES.owner} NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE ${ROLES.migrator} LOGIN PASSWORD '${ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS IN ROLE ${ROLES.owner};
    ALTER ROLE ${ROLES.migrator} SET role = '${ROLES.owner}';
    CREATE ROLE ${ROLES.app} LOGIN PASSWORD '${ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE ${ROLES.system} NOLOGIN BYPASSRLS;
    CREATE ROLE ${ROLES.purge} NOLOGIN BYPASSRLS;
  `);
}

/**
 * Owner sở hữu database để tạo schema app, replica, drizzle và các extension tin cậy (README mục Migration; QC Lần 2
 * G10). Từ PostgreSQL 15, schema public thuộc pg_database_owner nên owner của database cũng tạo được extension ở đó.
 */
export async function ownDatabase(admin: Pool, database: string): Promise<void> {
  if (!IDENTIFIER.test(database)) throw new Error(`Tên database không hợp lệ: ${database}`);
  await admin.query(`ALTER DATABASE ${database} OWNER TO ${ROLES.owner}`);
}

/** DSN tới `database` (mặc định database của container) bằng một vai trò đăng nhập của gateway. */
export function roleUrl(connectionUri: string, role: 'app' | 'migrator', database?: string): string {
  const url = new URL(connectionUri);
  url.username = ROLES[role];
  url.password = ROLE_PASSWORD;
  if (database) url.pathname = `/${database}`;
  return url.toString();
}

export function appRoleUrl(connectionUri: string, database?: string): string {
  return roleUrl(connectionUri, 'app', database);
}

export function migratorRoleUrl(connectionUri: string, database?: string): string {
  return roleUrl(connectionUri, 'migrator', database);
}

/** Chạy 00-common.sql rồi gateway.sql đọc từ docs/database/ddl, cùng một kết nối (của migrator khi so schema). */
export async function applyReferenceDdl(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const file of REFERENCE_DDL_FILES) await client.query(readFileSync(join(DDL_DIR, file), 'utf8'));
  } finally {
    await client.end();
  }
}

/**
 * pg_dump --schema-only trong container (giữ OWNER TO, GRANT, policy, extension), bỏ schema sổ phiên bản của
 * drizzle. stdout đi qua base64 vì exec của Testcontainers giải mã từng khúc: ký tự UTF-8 nằm giữa hai khúc thành
 * U+FFFD và phép so chập chờn (#100).
 */
export async function dumpSchema(postgres: StartedPostgres, database: string): Promise<string> {
  const result = await postgres.container.exec([
    'bash',
    '-o',
    'pipefail',
    '-c',
    'pg_dump "$@" | base64 -w 0',
    'pg_dump',
    '--schema-only',
    `--exclude-schema=${MIGRATIONS_SCHEMA}`,
    '-U',
    postgres.username,
    '-d',
    database,
  ]);
  if (result.exitCode !== 0) throw new Error(`pg_dump ${database} lỗi: ${result.stderr || result.output}`);
  return normalizeDump(Buffer.from(result.stdout.trim(), 'base64').toString('utf8'));
}

/**
 * Bỏ các dòng không thuộc schema: `\restrict`/`\unrestrict` (khóa ngẫu nhiên mỗi lần dump, pg_dump từ 16.10) và
 * chú thích phiên bản. Mọi dòng khác giữ nguyên để phép so bắt cả kiểu, mặc định, ràng buộc, index, hàm, RLS,
 * policy, quyền, chủ sở hữu và extension.
 */
function normalizeDump(dump: string): string {
  return dump
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\\(un)?restrict\b/.test(line) && !/^-- Dumped (from|by) /.test(line))
    .join('\n');
}

export interface GatewayDatabase {
  postgres: StartedPostgres;
  /** Superuser: chỉ để chuẩn bị và kiểm dữ liệu của test, không phải đường chạy của service. */
  admin: Pool;
  /** DSN của sires_gateway_app, vai trò service dùng lúc chạy (DATABASE_URL). */
  appUrl: string;
  stop(): Promise<void>;
}

/** Database cho test HTTP của phiên: vai trò thật, migration bằng migrator, service kết nối bằng _app (H7). */
export async function startGatewayDatabase(): Promise<GatewayDatabase> {
  const postgres = await startPostgres({ database: GATEWAY_DATABASE, extensions: [] });
  const admin = new Pool({ connectionString: postgres.connectionUri });
  try {
    await createRoles(admin);
    await ownDatabase(admin, GATEWAY_DATABASE);
    await runMigrations(migratorRoleUrl(postgres.connectionUri));
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
