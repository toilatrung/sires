// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Chỉ dùng trong test (tsconfig.build.json loại *.testkit.ts khỏi bản build). PostgreSQL 16 + pgvector của
// @sires/testing không tạo extension nào (EC01), bốn vai trò sires_research_* theo database 3.2 — test tự tạo vai
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
export const REFERENCE_DDL_FILES = ['00-common.sql', 'research.sql'] as const;

export const ROLES = {
  owner: 'sires_research_owner',
  app: 'sires_research_app',
  system: 'sires_research_system',
  purge: 'sires_research_purge',
} as const;

export type ServiceRole = Exclude<keyof typeof ROLES, 'owner'>;

const ROLE_PASSWORD = 'sires-research-test';

/** Thuộc tính theo database 3.2: owner giữ đối tượng; _app áp RLS; _system, _purge BYPASSRLS. */
const CREATE_ROLES_SQL = `
  CREATE ROLE ${ROLES.owner} NOLOGIN NOBYPASSRLS;
  CREATE ROLE sires_research_migrator LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}' IN ROLE ${ROLES.owner};
  ALTER ROLE sires_research_migrator SET role = '${ROLES.owner}';
  CREATE ROLE ${ROLES.app} LOGIN NOBYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.system} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
  CREATE ROLE ${ROLES.purge} LOGIN BYPASSRLS PASSWORD '${ROLE_PASSWORD}';
`;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface ResearchPostgres {
  readonly server: StartedPostgres;
  /** Tạo database rỗng. */
  createDatabase(name: string): Promise<void>;
  /** DSN tới `database`: superuser khi không nêu vai trò, ngược lại vai trò dịch vụ. */
  url(database: string, role?: ServiceRole): string;
  migratorUrl(database: string): string;
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
  asRole<T>(
    database: string,
    role: ServiceRole,
    accountId: string | undefined,
    work: (client: Client) => Promise<T>,
  ): Promise<T>;
  /** Chạy 00-common.sql rồi research.sql đọc từ docs/database/ddl bằng superuser. */
  applyReferenceDdl(database: string): Promise<void>;
  /** pg_dump --schema-only trong container, bỏ schema sổ phiên bản của drizzle (AC01) và dòng phụ thuộc lần chạy. */
  dumpSchema(database: string): Promise<string>;
  stop(): Promise<void>;
}

/** Khởi động PostgreSQL không có extension nào (EC01); `withRoles: false` cho ca thiếu vai trò (EC02). */
export async function startResearchPostgres(options: { withRoles?: boolean } = {}): Promise<ResearchPostgres> {
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
  const migratorUrl = (database: string) => {
    const dsn = new URL(url(database));
    dsn.username = 'sires_research_migrator';
    dsn.password = ROLE_PASSWORD;
    dsn.searchParams.set('options', `-c role=${ROLES.owner}`);
    return dsn.toString();
  };
  return {
    server,
    url,
    admin,
    migratorUrl,
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
      await admin(
        server.database,
        `CREATE DATABASE ${name}${(options.withRoles ?? true) ? ` OWNER ${ROLES.owner}` : ''}`,
      );
    },
    async applyReferenceDdl(database) {
      const sql = REFERENCE_DDL_FILES.map((file) => readFileSync(join(DDL_DIR, file), 'utf8')).join('\n');
      const client = new Client({ connectionString: migratorUrl(database) });
      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    },
    async dumpSchema(database) {
      const result = await server.container.exec([
        'pg_dump',
        '--schema-only',
        `--exclude-schema=${MIGRATIONS_SCHEMA}`,
        '-U',
        server.username,
        '-d',
        database,
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
export async function listTables(db: ResearchPostgres, database: string): Promise<string[]> {
  const rows = await db.admin<{ name: string }>(
    database,
    `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('app', 'replica') AND table_type = 'BASE TABLE' ORDER BY 1`,
  );
  return rows.map((row) => row.name);
}

/** 10 bảng service, replica.project_state và 5 bảng nền tảng. */
export const EXPECTED_TABLES = [
  'app.artifact',
  'app.artifact_version',
  'app.claim',
  'app.claim_evidence_link',
  'app.claim_revision',
  'app.evidence',
  'app.idempotency_key',
  'app.inbox',
  'app.job_lock',
  'app.outbox',
  'app.provenance_input',
  'app.state_transition',
  'app.verification_result',
  'replica.project_reference_scope',
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

export const SYSTEM_ACTOR = { type: 'system', component: 'research-test' };
export const AGENT_ACTOR = { type: 'agent', agent: 'analysis', instance: 'A', agentRunId: randomUUID() };
export const PROVENANCE = { createdBy: SYSTEM_ACTOR, inputs: [] };
export function approval(id: string) {
  return {
    approvedBy: { type: 'researcher', accountId: randomUUID() },
    decision: 'approved',
    apr: 'APR-05',
    decidedAt: new Date().toISOString(),
    objectType: 'artifact_version',
    objectId: id,
    objectVersion: 1,
  };
}
export async function seedProject(
  client: Client,
  accountId: string,
  projectId = randomUUID(),
  status = 'Active',
  deleted = false,
) {
  await client.query(
    `INSERT INTO replica.project_state (project_id, account_id, status, deleted_at, source_version)
    VALUES ($1,$2,$3,$4,1)`,
    [projectId, accountId, status, deleted ? new Date() : null],
  );
  return projectId;
}
export async function seedReference(
  client: Client,
  accountId: string,
  projectId: string,
  status = 'Trusted',
  scope: string | null = 'Active',
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO replica.reference_state (reference_id,account_id,approval_status,source_version)
    VALUES ($1,$2,$3,1)`,
    [id, accountId, status],
  );
  if (scope !== null)
    await client.query(
      `INSERT INTO replica.project_reference_scope
    (project_id,reference_id,account_id,status,source_version) VALUES ($1,$2,$3,$4,1)`,
      [projectId, id, accountId, scope],
    );
  return id;
}
export async function insertEvidence(
  client: Client,
  accountId: string,
  projectId: string,
  referenceId: string,
  options: { status?: string; actor?: object; provenance?: object | null } = {},
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.evidence (id,account_id,project_id,reference_id,chunk_id,quote,location,status,created_by,provenance)
    VALUES ($1,$2,$3,$4,$5,'Trích dẫn',$6,$7,$8,$9)`,
    [
      id,
      accountId,
      projectId,
      referenceId,
      randomUUID(),
      { page: 1 },
      options.status ?? 'Active',
      options.actor ?? SYSTEM_ACTOR,
      options.provenance ?? null,
    ],
  );
  return id;
}
export async function insertClaim(
  client: Client,
  accountId: string,
  projectId: string,
  options: {
    status?: string;
    support?: string;
    approval?: object | null;
    actor?: object;
    provenance?: object | null;
  } = {},
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.claim (id,account_id,project_id,statement,approval_status,support_status,approval,created_by,provenance)
    VALUES ($1,$2,$3,'Phát biểu',$4,$5,$6,$7,$8)`,
    [
      id,
      accountId,
      projectId,
      options.status ?? 'Draft',
      options.support ?? 'Supported',
      options.approval ?? null,
      options.actor ?? SYSTEM_ACTOR,
      options.provenance ?? null,
    ],
  );
  return id;
}
export async function insertArtifact(
  client: Client,
  accountId: string,
  projectId: string,
  actor: object = SYSTEM_ACTOR,
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.artifact (id,account_id,project_id,type,title,created_by)
    VALUES ($1,$2,$3,'note','Ghi chú',$4)`,
    [id, accountId, projectId, actor],
  );
  return id;
}
export async function insertVersion(
  client: Client,
  accountId: string,
  projectId: string,
  artifactId: string,
  options: {
    status?: string;
    approval?: object | null;
    content?: object | null;
    file?: string | null;
    provenance?: object | null;
    version?: number;
    actor?: object;
  } = {},
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.artifact_version
    (id,account_id,project_id,artifact_id,version_number,content,file_ref,format,content_hash,status,provenance,approval,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'json',$8,$9,$10,$11,$12)`,
    [
      id,
      accountId,
      projectId,
      artifactId,
      options.version ?? 1,
      'content' in options ? options.content : { text: 'Nội dung' },
      options.file ?? null,
      Buffer.alloc(32),
      options.status ?? 'Draft',
      'provenance' in options ? options.provenance : PROVENANCE,
      options.approval ?? null,
      options.actor ?? SYSTEM_ACTOR,
    ],
  );
  return id;
}
