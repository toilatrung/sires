// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing không tạo extension nào (EC03), bốn vai trò sires_workspace_* theo database 3.2 — test tự tạo vai
// trò tới khi compose cục bộ của PID-00159 có (H4) —, database dựng từ DDL tham chiếu và bản dump schema để so
// (S01), phiên theo vai trò dịch vụ cho test hành vi DDL và trigger (S02, S03).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { MIGRATIONS_SCHEMA } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'workspace.sql'] as const;

export const ROLES = {
  owner: 'sires_workspace_owner',
  app: 'sires_workspace_app',
  system: 'sires_workspace_system',
  purge: 'sires_workspace_purge',
} as const;

export type ServiceRole = Exclude<keyof typeof ROLES, 'owner'>;

const ROLE_PASSWORD = 'sires-workspace-test';

/** Thuộc tính theo database 3.2: owner giữ đối tượng; _app áp RLS; _system, _purge BYPASSRLS. */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.owner} NOLOGIN;
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface WorkspacePostgres {
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
  /** Chạy 00-common.sql rồi workspace.sql đọc từ docs/database/ddl bằng superuser. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle (EC04) và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL không có extension nào (EC03); `withRoles: false` cho ca thiếu vai trò (EC02). */
export async function startWorkspacePostgres(options: { withRoles?: boolean } = {}): Promise<WorkspacePostgres> {
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
      // stdout qua base64 vì exec của Testcontainers giải mã từng khúc: ký tự UTF-8 giữa hai khúc thành U+FFFD.
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
export async function listTables(db: WorkspacePostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 7 bảng của workspace.sql và 5 bảng nền tảng của 00-common.sql (workspace sở hữu project nên không có bản sao). */
export const EXPECTED_TABLES = [
  'app.conversation', 'app.idempotency_key', 'app.inbox', 'app.job_lock', 'app.message', 'app.notification',
  'app.outbox', 'app.pending_action', 'app.project_purge', 'app.research_context_version', 'app.research_project',
  'app.state_transition',
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

/** ActorRef hợp lệ cho cột created_by (app.is_actor_ref). */
export const SYSTEM_ACTOR = JSON.stringify({ type: 'system', component: 'workspace-test' });

export interface SeededProject {
  readonly accountId: string;
  readonly projectId: string;
  readonly contextVersionId: string;
}

/**
 * Tạo ResearchProject (mặc định Active) và ResearchContextVersion đầu trong một giao dịch, theo thứ tự của DDL:
 * project trỏ current_context_version_id tới bản ghi chèn sau (khóa ngoại DEFERRABLE). `client` là phiên đang mở
 * giao dịch (của asRole).
 */
export async function insertProject(
  client: Client,
  accountId: string,
  options: { name?: string; status?: string } = {},
): Promise<SeededProject> {
  const projectId = randomUUID();
  const contextVersionId = randomUUID();
  await client.query(
    `INSERT INTO app.research_project (id, account_id, name, status, current_context_version_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectId, accountId, options.name ?? 'Đề tài mẫu', options.status ?? 'Active', contextVersionId, SYSTEM_ACTOR],
  );
  await client.query(
    `INSERT INTO app.research_context_version (id, account_id, project_id, version_number, research_question, confirmed_by, created_by)
     VALUES ($1, $2, $3, 1, 'Câu hỏi nghiên cứu', $4, $5)`,
    [contextVersionId, accountId, projectId, JSON.stringify({ type: 'researcher', accountId }), SYSTEM_ACTOR],
  );
  return { accountId, projectId, contextVersionId };
}
