// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing, không tạo sẵn extension nào; vai trò sires_manuscript_* theo database 3.2 — owner NOLOGIN, migrator
// đăng nhập với SET role = owner, _app áp RLS, _system và _purge BYPASSRLS — do test tự tạo tới khi compose cục bộ của
// PID-00159 có (H4); database dựng từ DDL tham chiếu và bản dump schema để so (S01); phiên theo vai trò dịch vụ và hàm
// mồi dữ liệu cho test hành vi DDL và trigger (S01, S02).

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgres, type StartedPostgres } from '@sires/testing';
import { Client } from 'pg';
import { MIGRATIONS_SCHEMA } from './migrate';

/** Thư mục DDL tham chiếu (chỉ đọc): src/db → gốc repo là bốn cấp. */
export const DDL_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'database', 'ddl');

/** Thứ tự chạy của docs/database/README.md: 00-common.sql rồi file của service. */
export const REFERENCE_DDL_FILES = ['00-common.sql', 'manuscript.sql'] as const;

export const ROLES = {
  owner: 'sires_manuscript_owner',
  migrator: 'sires_manuscript_migrator',
  app: 'sires_manuscript_app',
  system: 'sires_manuscript_system',
  purge: 'sires_manuscript_purge',
} as const;

/** Vai trò đăng nhập được (owner là NOLOGIN). */
export type LoginRole = Exclude<keyof typeof ROLES, 'owner'>;
/** Vai trò dịch vụ dùng cho phiên có giao dịch (asRole). */
export type ServiceRole = Exclude<LoginRole, 'migrator'>;

const ROLE_PASSWORD = 'sires-manuscript-test';

/**
 * Thuộc tính theo database 3.2: owner giữ đối tượng, không đăng nhập; migrator là thành viên owner, mỗi phiên chạy
 * bằng quyền owner nhờ ALTER ROLE … SET role (mã migration không SET ROLE), không SUPERUSER, CREATEDB, CREATEROLE,
 * BYPASSRLS; _app áp RLS; _system, _purge BYPASSRLS.
 */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.owner} NOLOGIN NOBYPASSRLS;
  CREATE ROLE ${ROLES.migrator} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}'
    IN ROLE ${ROLES.owner};
  ALTER ROLE ${ROLES.migrator} SET role = '${ROLES.owner}';
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface ManuscriptPostgres {
  readonly server: StartedPostgres;
  /** Tạo database rỗng; khi có vai trò, database thuộc sires_manuscript_owner như database 3.2. */
  createDatabase(name: string): Promise<void>;
  /** DSN tới `database`: superuser khi không nêu vai trò, ngược lại vai trò đăng nhập (kể cả migrator). */
  url(database: string, role?: LoginRole): string;
  /** Chạy SQL (có thể nhiều câu khi không có tham số) bằng superuser. */
  admin<R extends Record<string, unknown> = Record<string, unknown>>(
    database: string,
    text: string,
    values?: unknown[],
  ): Promise<R[]>;
  /**
   * Mở kết nối bằng vai trò dịch vụ, chạy `work` trong một giao dịch có `app.account_id` (khi nêu) rồi commit; lỗi thì
   * rollback và ném lại. Dùng cho test trigger, quyền, RLS như service thật (withAccountTransaction).
   */
  asRole<T>(
    database: string,
    role: ServiceRole,
    accountId: string | undefined,
    work: (client: Client) => Promise<T>,
  ): Promise<T>;
  /** Chạy 00-common.sql rồi manuscript.sql đọc từ docs/database/ddl bằng vai trò migrator, như migration. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL 16 + pgvector không tạo extension nào; `withRoles: false` cho ca thiếu vai trò (EC02). */
export async function startManuscriptPostgres(options: { withRoles?: boolean } = {}): Promise<ManuscriptPostgres> {
  const withRoles = options.withRoles ?? true;
  const server = await startPostgres({ extensions: [] });
  const url = (database: string, role?: LoginRole): string => {
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
    if (withRoles) await admin(server.database, CREATE_ROLES_SQL);
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
      await admin(server.database, `CREATE DATABASE ${name}${withRoles ? ` OWNER ${ROLES.owner}` : ''}`);
    },
    async applyReferenceDdl(database) {
      const sql = REFERENCE_DDL_FILES.map((file) => readFileSync(join(DDL_DIR, file), 'utf8')).join('\n');
      const client = new Client({ connectionString: url(database, 'migrator') });
      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    },
    async dumpSchema(database) {
      // stdout qua base64 vì exec của Testcontainers giải mã từng khúc: ký tự UTF-8 giữa hai khúc thành U+FFFD (#100).
      const result = await server.container.exec([
        'bash',
        '-o',
        'pipefail',
        '-c',
        'pg_dump "$@" | base64 -w 0',
        'pg_dump',
        '--schema-only',
        `--exclude-schema=${MIGRATIONS_SCHEMA}`,
        '-U',
        server.username,
        '-d',
        database,
      ]);
      if (result.exitCode !== 0) throw new Error(`pg_dump ${database} lỗi: ${result.stderr || result.output}`);
      return normalizeDump(Buffer.from(result.stdout.trim(), 'base64').toString('utf8'));
    },
    stop: () => server.stop(),
  };
}

/**
 * Bỏ các dòng không thuộc schema: `\restrict`/`\unrestrict` (khóa ngẫu nhiên mỗi lần dump, pg_dump từ 16.10) và chú
 * thích phiên bản. Mọi dòng khác giữ nguyên để phép so bắt cả kiểu, mặc định, ràng buộc, index, trigger, hàm, RLS,
 * policy, quyền, chủ sở hữu, extension và cấu hình tìm kiếm.
 */
function normalizeDump(dump: string): string {
  return dump
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\\(un)?restrict\b/.test(line) && !/^-- Dumped (from|by) /.test(line))
    .join('\n');
}

/** Bảng (BASE TABLE) trong schema app, replica, dạng `schema.bảng`, đã sắp. */
export async function listTables(db: ManuscriptPostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 6 bảng app.* của manuscript.sql, hai bản sao replica.* và 5 bảng nền tảng của 00-common.sql. */
export const EXPECTED_TABLES = [
  'app.bibliography_entry',
  'app.build',
  'app.change_proposal',
  'app.idempotency_key',
  'app.inbox',
  'app.job_lock',
  'app.manuscript',
  'app.manuscript_file',
  'app.manuscript_revision',
  'app.outbox',
  'app.state_transition',
  'replica.project_state',
  'replica.reference_state',
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
export const SYSTEM_ACTOR = JSON.stringify({ type: 'system', component: 'manuscript-test' });

/** Provenance hợp lệ (app.is_provenance): createdBy là ActorRef, inputs là mảng tham chiếu có phiên bản. */
export const PROVENANCE = JSON.stringify({
  createdBy: { type: 'agent', agent: 'writing', agentRunId: 'run-1' },
  inputs: [],
});

/** ApprovalRecord hợp lệ (app.is_approval_record) cho Change Proposal, APR-05. */
export function approval(proposalId: string): string {
  return JSON.stringify({
    approvedBy: { type: 'researcher', accountId: randomUUID() },
    decision: 'approved',
    apr: 'APR-05',
    decidedAt: new Date().toISOString(),
    objectType: 'change_proposal',
    objectId: proposalId,
    objectVersion: 1,
  });
}

export type ProjectState = 'Active' | 'Archived' | 'Deleted' | 'none';

/** Mồi bản sao replica.project_state (vai trò _system); `none` không mồi. Trả project_id. */
export async function seedProject(client: Client, accountId: string, state: ProjectState = 'Active'): Promise<string> {
  const projectId = randomUUID();
  if (state !== 'none') {
    await client.query(
      `INSERT INTO replica.project_state (project_id, account_id, status, deleted_at, source_version)
       VALUES ($1, $2, $3, $4, 1)`,
      [projectId, accountId, state === 'Deleted' ? 'Active' : state, state === 'Deleted' ? new Date() : null],
    );
  }
  return projectId;
}

/** Mồi bản sao replica.reference_state (vai trò _system). Trả reference_id. */
export async function seedReference(client: Client, accountId: string, approvalStatus = 'Trusted'): Promise<string> {
  const referenceId = randomUUID();
  await client.query(
    `INSERT INTO replica.reference_state (reference_id, account_id, approval_status, metadata_version, bibtex_key, source_version)
     VALUES ($1, $2, $3, 1, $4, 1)`,
    [referenceId, accountId, approvalStatus, `key${referenceId.slice(0, 8)}`],
  );
  return referenceId;
}

export interface SeededManuscript {
  readonly accountId: string;
  readonly projectId: string;
  readonly manuscriptId: string;
  /** Revision số 1 (source init), là revision hiện hành lúc tạo. */
  readonly revisionId: string;
}

/**
 * Tạo Manuscript và revision đầu trong giao dịch đang mở của `client`, theo thứ tự của DDL: manuscript trỏ
 * current_revision_id tới revision chèn sau (manuscript_current_revision_fk DEFERRABLE INITIALLY DEFERRED).
 */
export async function insertManuscript(
  client: Client,
  accountId: string,
  projectId: string,
): Promise<SeededManuscript> {
  const manuscriptId = randomUUID();
  const revisionId = randomUUID();
  await client.query(
    `INSERT INTO app.manuscript (id, account_id, project_id, init_mode, current_revision_id, created_by)
     VALUES ($1, $2, $3, 'Default', $4, $5)`,
    [manuscriptId, accountId, projectId, revisionId, SYSTEM_ACTOR],
  );
  await insertRevision(
    client,
    { accountId, projectId, manuscriptId, revisionId },
    { id: revisionId, number: 1, parentId: null, source: 'init' },
  );
  return { accountId, projectId, manuscriptId, revisionId };
}

/** Dựng project (mặc định Active) và Manuscript có revision đầu bằng vai trò _system trong một giao dịch. */
export async function seedManuscript(
  pg: ManuscriptPostgres,
  database: string,
  options: { accountId?: string; project?: ProjectState } = {},
): Promise<SeededManuscript> {
  return pg.asRole(database, 'system', undefined, async (client) => {
    const accountId = options.accountId ?? randomUUID();
    const projectId = await seedProject(client, accountId, options.project ?? 'Active');
    return insertManuscript(client, accountId, projectId);
  });
}

export interface RevisionOptions {
  readonly id?: string;
  readonly number: number;
  readonly parentId: string | null;
  readonly source?: 'direct_edit' | 'change_proposal' | 'init';
  readonly changeProposalId?: string | null;
}

/** Chèn một ManuscriptRevision; trả id. */
export async function insertRevision(client: Client, ms: SeededManuscript, options: RevisionOptions): Promise<string> {
  const id = options.id ?? randomUUID();
  await client.query(
    `INSERT INTO app.manuscript_revision (id, account_id, project_id, manuscript_id, revision_number, parent_revision_id,
       changes, tree, source, change_proposal_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, '[]', '{"main.tex": "00"}', $7, $8, $9)`,
    [
      id,
      ms.accountId,
      ms.projectId,
      ms.manuscriptId,
      options.number,
      options.parentId,
      options.source ?? 'direct_edit',
      options.changeProposalId ?? null,
      SYSTEM_ACTOR,
    ],
  );
  return id;
}

/** Chèn một ManuscriptFile; trả id. Trạng thái Deleted kèm deleted_at (manuscript_file_deleted_ck). */
export async function insertFile(
  client: Client,
  ms: SeededManuscript,
  options: { path: string; status?: 'Active' | 'Deleted' },
): Promise<string> {
  const id = randomUUID();
  const status = options.status ?? 'Active';
  const hash = createHash('sha256').update(id).digest();
  await client.query(
    `INSERT INTO app.manuscript_file (id, account_id, project_id, manuscript_id, path, file_type, content_ref, content_hash,
       size_bytes, status, deleted_at, created_by)
     VALUES ($1, $2, $3, $4, $5, 'tex', $6, $7, 10, $8, $9, $10)`,
    [
      id,
      ms.accountId,
      ms.projectId,
      ms.manuscriptId,
      options.path,
      `manuscript/acct/${ms.accountId}/blobs/${hash.toString('hex')}`,
      hash,
      status,
      status === 'Deleted' ? new Date() : null,
      SYSTEM_ACTOR,
    ],
  );
  return id;
}

export interface ProposalOptions {
  readonly baseRevisionId?: string;
  readonly status?: string;
  readonly citationCheckPassed?: boolean | null;
  /** true: ApprovalRecord hợp lệ; false: NULL. */
  readonly approved?: boolean;
}

/** Chèn một ChangeProposal (mặc định Proposed, base = revision đầu); trả id. */
export async function insertProposal(
  client: Client,
  ms: SeededManuscript,
  options: ProposalOptions = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.change_proposal (id, account_id, project_id, manuscript_id, base_revision_id, diff,
       created_by_agent_run_id, citation_check_id, citation_check_passed, status, approval, provenance, created_by)
     VALUES ($1, $2, $3, $4, $5, '[{"path":"main.tex","hunks":[]}]', $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      ms.accountId,
      ms.projectId,
      ms.manuscriptId,
      options.baseRevisionId ?? ms.revisionId,
      randomUUID(),
      options.citationCheckPassed == null ? null : randomUUID(),
      options.citationCheckPassed ?? null,
      options.status ?? 'Proposed',
      options.approved ? approval(id) : null,
      PROVENANCE,
      SYSTEM_ACTOR,
    ],
  );
  return id;
}

/** Chèn một Build cho `revisionId` (mặc định revision đầu); config_hash ngẫu nhiên trừ khi nêu. Trả id. */
export async function insertBuild(
  client: Client,
  ms: SeededManuscript,
  options: { revisionId?: string; configHash?: Buffer; status?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.build (id, account_id, project_id, manuscript_id, revision_id, config_hash, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      ms.accountId,
      ms.projectId,
      ms.manuscriptId,
      options.revisionId ?? ms.revisionId,
      options.configHash ?? createHash('sha256').update(id).digest(),
      options.status ?? 'Queued',
      SYSTEM_ACTOR,
    ],
  );
  return id;
}

/** Chèn một BibliographyEntry; trả id. */
export async function insertBibliography(
  client: Client,
  ms: SeededManuscript,
  options: { referenceId: string; bibtexKey: string },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.bibliography_entry (id, account_id, project_id, manuscript_id, bibtex_key, reference_id, bibtex,
       generated_from_metadata_version, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
    [
      id,
      ms.accountId,
      ms.projectId,
      ms.manuscriptId,
      options.bibtexKey,
      options.referenceId,
      `@article{${options.bibtexKey}, title={T}}`,
      SYSTEM_ACTOR,
    ],
  );
  return id;
}
