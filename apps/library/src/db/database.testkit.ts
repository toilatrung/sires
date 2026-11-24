// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing không tạo extension nào, bốn vai trò sires_library_* theo database 3.2 — test tự tạo vai trò tới khi
// compose cục bộ của PID-00159 có (H7) —, database dựng từ DDL tham chiếu và bản dump schema để so (S01), phiên theo
// vai trò dịch vụ và dữ liệu mồi cho test hành vi DDL, trigger (S01, S02).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { MIGRATIONS_SCHEMA } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'library.sql'] as const;

export const ROLES = {
  owner: 'sires_library_owner',
  app: 'sires_library_app',
  system: 'sires_library_system',
  purge: 'sires_library_purge',
} as const;

export type ServiceRole = Exclude<keyof typeof ROLES, 'owner'>;

const ROLE_PASSWORD = 'sires-library-test';

/** Thuộc tính theo database 3.2: owner giữ đối tượng; _app áp RLS; _system, _purge BYPASSRLS. */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.owner} NOLOGIN;
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface LibraryPostgres {
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
  /** Chạy 00-common.sql rồi library.sql đọc từ docs/database/ddl bằng superuser. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL 16 + pgvector không tạo extension nào; `withRoles: false` cho ca thiếu vai trò (EC02). */
export async function startLibraryPostgres(options: { withRoles?: boolean } = {}): Promise<LibraryPostgres> {
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
      const result = await server.container.exec([
        'pg_dump', '--schema-only', `--exclude-schema=${MIGRATIONS_SCHEMA}`,
        '-U', server.username, '-d', database,
      ]);
      if (result.exitCode !== 0) throw new Error(`pg_dump ${database} lỗi: ${result.stderr || result.output}`);
      return normalizeDump(result.stdout);
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
export async function listTables(db: LibraryPostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 4 bảng của library.sql, bản sao replica.project_state và 5 bảng nền tảng của 00-common.sql. */
export const EXPECTED_TABLES = [
  'app.discovered_result', 'app.idempotency_key', 'app.inbox', 'app.job_lock', 'app.outbox',
  'app.project_reference_selection', 'app.reference', 'app.reference_metadata_version', 'app.state_transition',
  'replica.project_state',
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

/** ActorRef hợp lệ cho cột created_by, selected_by (app.is_actor_ref). */
export const SYSTEM_ACTOR = JSON.stringify({ type: 'system', component: 'library-test' });

/** ApprovalRecord hợp lệ (app.is_approval_record) cho cột approval của Reference (APR-04, duyệt reference). */
export function approvalRecord(referenceId: string): string {
  return JSON.stringify({
    approvedBy: { type: 'researcher', accountId: randomUUID() }, decision: 'approved', apr: 'APR-04',
    decidedAt: new Date().toISOString(), objectType: 'reference', objectId: referenceId, objectVersion: 1,
  });
}

/** Metadata 17.6 tối thiểu cho cột metadata (DDL không kiểm nội dung; dùng để có tiêu đề cho cột sinh). */
const METADATA = (title: string) => JSON.stringify({
  title, authors: [{ name: 'Nguyễn, An' }], identifiers: { sourceId: 'k', url: 'https://example.org/k' },
  source: 'bibtex', retrievedAt: '2026-11-24T00:00:00Z',
});

/**
 * Ghi bản sao vòng đời project vào replica.project_state (như consumer project.lifecycle_changed, vai trò _system);
 * `status: 'none'` không ghi gì (project chưa có bản sao). `client` là phiên _system đang mở giao dịch.
 */
export async function insertProjectState(
  client: Client,
  accountId: string,
  options: { status?: 'Active' | 'Archived' | 'none'; deleted?: boolean } = {},
): Promise<string> {
  const projectId = randomUUID();
  if ((options.status ?? 'Active') !== 'none') {
    await client.query(
      `INSERT INTO replica.project_state (project_id, account_id, status, deleted_at, source_version)
       VALUES ($1, $2, $3, $4, 1)`,
      [projectId, accountId, options.status ?? 'Active', options.deleted ? new Date() : null],
    );
  }
  return projectId;
}

export interface ReferenceOptions {
  readonly approvalStatus?: string;
  readonly indexingStatus?: string;
  readonly bibtexKey?: string;
  readonly doi?: string | null;
  readonly title?: string;
}

let bibtexCounter = 0;

/**
 * Chèn Reference nhập tay (origin manual). Luôn kèm ApprovalRecord và lý do thu hồi để mọi approval_status thỏa CHECK
 * reference_trusted_ck, reference_revoked_ck; `client` là phiên đang mở giao dịch. Trả id.
 */
export async function insertReference(client: Client, accountId: string, options: ReferenceOptions = {}): Promise<string> {
  const id = randomUUID();
  bibtexCounter += 1;
  await client.query(
    `INSERT INTO app.reference (id, account_id, metadata, doi, bibtex_key, origin, approval_status, indexing_status,
       approval, revocation, created_by)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, $8, $9, $10)`,
    [id, accountId, METADATA(options.title ?? 'Tài liệu mẫu'), options.doi ?? null, options.bibtexKey ?? `ref${bibtexCounter}`,
      options.approvalStatus ?? 'Pending Approval', options.indexingStatus ?? 'Not Indexed', approvalRecord(id),
      JSON.stringify({ reason: 'Thu hồi thử' }), SYSTEM_ACTOR],
  );
  return id;
}

/** Chèn ProjectReferenceSelection; `client` là phiên đang mở giao dịch. Trả id. */
export async function insertSelection(
  client: Client,
  accountId: string,
  projectId: string,
  referenceId: string,
  status = 'Active',
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.project_reference_selection (id, account_id, project_id, reference_id, status, selected_by, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [id, accountId, projectId, referenceId, status, SYSTEM_ACTOR],
  );
  return id;
}

/** Chèn DiscoveredResult; Imported thì kèm imported_reference_id (CHECK discovered_result_imported_ck). Trả id. */
export async function insertDiscoveredResult(client: Client, accountId: string, status = 'New'): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.discovered_result (id, account_id, source, query, metadata, source_url, status, imported_reference_id, created_by)
     VALUES ($1, $2, 'openalex', 'đô thị hóa', $3, 'https://openalex.org/W1', $4, $5, $6)`,
    [id, accountId, METADATA('Kết quả tìm kiếm'), status, status === 'Imported' ? randomUUID() : null, SYSTEM_ACTOR],
  );
  return id;
}
