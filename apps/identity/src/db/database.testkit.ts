// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing không tạo extension nào, bốn vai trò sires_identity_* theo database 3.2 — test tự tạo vai trò tới
// khi compose cục bộ của PID-00159 có (H6, D4) —, database dựng từ DDL tham chiếu và bản dump schema để so (S01),
// phiên theo vai trò dịch vụ cho test quyền, RLS, trigger (S01, S02, S03).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { MIGRATIONS_SCHEMA } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'identity.sql'] as const;


export const ROLES = {
  owner: 'sires_identity_owner',
  app: 'sires_identity_app',
  system: 'sires_identity_system',
  purge: 'sires_identity_purge',
} as const;

export type ServiceRole = Exclude<keyof typeof ROLES, 'owner'>;

const ROLE_PASSWORD = 'sires-identity-test';

/** Thuộc tính theo database 3.2: owner giữ đối tượng; _app áp RLS; _system, _purge BYPASSRLS. */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.owner} NOLOGIN;
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Vai trò đăng nhập chạy migration theo database 3.2 (tên chốt ngày 21/11/2026, PID-00159 H3). */
export const MIGRATOR_ROLE = 'sires_identity_migrator';

/**
 * Dựng vai trò migrator như hạ tầng thật (database 3.2): LOGIN, thành viên của owner, `ALTER ROLE … SET role` về owner
 * nên mọi phiên chạy bằng quyền owner (không SUPERUSER, không BYPASSRLS) và đối tượng do migration tạo thuộc owner.
 * Owner được CREATE trên `database` (schema app, replica, drizzle) và schema public (extension tin cậy). Trả DSN của
 * migrator tới `database` — dùng cho test DBD-14, nơi chạy migration bằng superuser che mất lỗi (DBQ-10).
 */
export async function enableMigratorLogin(pg: IdentityPostgres, database: string): Promise<string> {
  await pg.admin(pg.server.database, `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${MIGRATOR_ROLE}') THEN
        CREATE ROLE ${MIGRATOR_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
          PASSWORD '${ROLE_PASSWORD}';
      END IF;
    END $$;
    GRANT ${ROLES.owner} TO ${MIGRATOR_ROLE};
    ALTER ROLE ${MIGRATOR_ROLE} SET role = '${ROLES.owner}';`);
  await pg.admin(pg.server.database, `GRANT CREATE ON DATABASE ${database} TO ${ROLES.owner}`);
  await pg.admin(database, `GRANT CREATE ON SCHEMA public TO ${ROLES.owner}`);
  const url = new URL(pg.url(database));
  url.username = MIGRATOR_ROLE;
  url.password = ROLE_PASSWORD;
  return url.toString();
}

export interface IdentityPostgres {
  readonly server: StartedPostgres;
  /** Tạo database rỗng. */
  createDatabase(name: string): Promise<void>;
  /** DSN tới `database`: superuser khi không nêu vai trò, ngược lại vai trò dịch vụ. */
  url(database: string, role?: ServiceRole): string;
  /** Chạy SQL (có thể nhiều câu khi không có tham số) bằng superuser. */
  admin<R extends Record<string, unknown> = Record<string, unknown>>(
    database: string,
    text: string,
    values?: unknown[],
  ): Promise<R[]>;
  /**
   * Mở kết nối bằng vai trò dịch vụ, chạy `work` trong một giao dịch có `app.account_id` (khi nêu) rồi commit; lỗi
   * thì rollback và ném lại. Dùng cho test trigger, quyền, RLS như service thật (withAccountTransaction).
   */
  asRole<T>(database: string, role: ServiceRole, accountId: string | undefined, work: (client: Client) => Promise<T>): Promise<T>;
  /** Chạy 00-common.sql rồi identity.sql đọc từ docs/database/ddl bằng superuser. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL không có extension nào; `withRoles: false` cho ca thiếu vai trò (EC07). */
export async function startIdentityPostgres(options: { withRoles?: boolean } = {}): Promise<IdentityPostgres> {
  const server = await startPostgres({ extensions: [] });
  const url = (database: string, role?: ServiceRole): string => {
    const user = role ? ROLES[role] : server.username;
    const password = role ? ROLE_PASSWORD : server.password;
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${server.host}:${server.port}/${database}`;
  };
  const admin = async <R extends Record<string, unknown>>(
    database: string,
    text: string,
    values?: unknown[],
  ): Promise<R[]> => {
    const client = new Client({ connectionString: url(database) });
    await client.connect();
    try {
      return (await client.query<R>(text, values)).rows;
    } finally {
      await client.end();
    }
  };
  try {
    if (options.withRoles ?? true) await admin(server.database, CREATE_ROLES_SQL);
  } catch (error) {
    await server.stop();
    throw error;
  }
  return {
    server,
    url,
    admin,
    async asRole(database, role, accountId, work) {
      const client = new Client({ connectionString: url(database, role) });
      await client.connect();
      try {
        await client.query('BEGIN');
        if (accountId !== undefined) await client.query(`SELECT set_config('app.account_id', $1, true)`, [accountId]);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
    async createDatabase(name) {
      if (!IDENTIFIER.test(name)) throw new Error(`Tên database không hợp lệ: ${name}`);
      await admin(server.database, `CREATE DATABASE ${name}`);
    },
    async applyReferenceDdl(database) {
      const sql = REFERENCE_DDL_FILES.map((file) => readFileSync(join(DDL_DIR, file), 'utf8')).join('\n');
      await admin(database, sql);
    },
    async dumpSchema(database) {
      // stdout qua base64 vì exec của Testcontainers giải mã từng khúc: ký tự UTF-8 giữa hai khúc thành U+FFFD (#100).
      const result = await server.container.exec([
        'bash', '-o', 'pipefail', '-c', 'pg_dump "$@" | base64 -w 0', 'pg_dump',
        '--schema-only', `--exclude-schema=${MIGRATIONS_SCHEMA}`,
        '-U', server.username, '-d', database,
      ]);
      if (result.exitCode !== 0) throw new Error(`pg_dump ${database} lỗi: ${result.stderr || result.output}`);
      return normalizeDump(Buffer.from(result.stdout.trim(), 'base64').toString('utf8'));
    },
    stop: () => server.stop(),
  };
}

/**
 * Bỏ các dòng không thuộc schema: `\restrict`/`\unrestrict` (khóa ngẫu nhiên mỗi lần dump, pg_dump từ 16.10) và
 * chú thích phiên bản. Mọi dòng khác giữ nguyên để phép so bắt cả kiểu, mặc định, ràng buộc, index, trigger, hàm,
 * RLS, policy, quyền, extension và cấu hình tìm kiếm.
 */
function normalizeDump(dump: string): string {
  return dump
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\\(un)?restrict\b/.test(line) && !/^-- Dumped (from|by) /.test(line))
    .join('\n');
}

/** Bảng (BASE TABLE) trong schema app, replica, dạng `schema.bảng`, đã sắp. */
export async function listTables(db: IdentityPostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 5 bảng của identity.sql và 5 bảng nền tảng của 00-common.sql (identity không có bản sao chỉ đọc). */
export const EXPECTED_TABLES = [
  'app.account', 'app.agent_model_assignment', 'app.idempotency_key', 'app.inbox', 'app.job_lock', 'app.outbox',
  'app.provider_connection', 'app.provider_secret', 'app.state_transition', 'app.verification_thresholds',
] as const;

/** SQLSTATE của lỗi PostgreSQL, kể cả khi drizzle bọc lỗi trong `cause`. */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

