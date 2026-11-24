// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing, vai trò sires_orchestration_app, _system, _purge theo database 3.2 — test tự tạo vai trò tới khi
// compose cục bộ của PID-00159 có (D4) —, database dựng từ DDL tham chiếu và bản dump schema để so (S01, S04, S05).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { MIGRATIONS_SCHEMA } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'orchestration.sql'] as const;

export const ROLES = {
  app: 'sires_orchestration_app',
  system: 'sires_orchestration_system',
  purge: 'sires_orchestration_purge',
} as const;

export type ServiceRole = keyof typeof ROLES;

const ROLE_PASSWORD = 'sires-orchestration-test';

/** Thuộc tính theo database 3.2: _app áp RLS; _system, _purge BYPASSRLS; cả ba LOGIN. */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface OrchestrationPostgres {
  readonly server: StartedPostgres;
  /** Tạo database rỗng (từ template1, nên không có extension vector của database mặc định — EC05). */
  createDatabase(name: string): Promise<void>;
  /** DSN tới `database`: superuser khi không nêu vai trò, ngược lại vai trò dịch vụ. */
  url(database: string, role?: ServiceRole): string;
  /** Chạy SQL (có thể nhiều câu khi không có tham số) bằng superuser. */
  admin<R extends Record<string, unknown> = Record<string, unknown>>(
    database: string,
    text: string,
    values?: unknown[],
  ): Promise<R[]>;
  /** Chạy 00-common.sql rồi orchestration.sql đọc từ docs/database/ddl bằng superuser. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle (EC04) và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL; `withRoles: false` cho ca thiếu vai trò (EC03). */
export async function startOrchestrationPostgres(options: { withRoles?: boolean } = {}): Promise<OrchestrationPostgres> {
  const server = await startPostgres();
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
export async function listTables(db: OrchestrationPostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 12 bảng của orchestration.sql, bản sao replica.project_state và 5 bảng nền tảng của 00-common.sql. */
export const EXPECTED_TABLES = [
  'app.agent_run', 'app.agent_run_debug_transcript', 'app.checkpoint', 'app.context_item', 'app.context_snapshot',
  'app.deliberation', 'app.deliberation_entry', 'app.deliberation_participant', 'app.idempotency_key', 'app.inbox',
  'app.interactive_agent_prompt', 'app.job_lock', 'app.outbox', 'app.state_transition', 'app.usage_ledger',
  'app.workflow', 'app.workflow_step', 'replica.project_state',
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
