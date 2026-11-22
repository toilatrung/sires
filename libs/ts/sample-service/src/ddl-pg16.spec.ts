// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { startPostgres } from '@sires/testing';
import { createRoles } from './database.testkit';

const DDL_FOLDER = join(__dirname, '../../../../docs/database/ddl');
const SERVICES = ['agent-core', 'audit', 'gateway', 'identity', 'knowledge', 'library',
  'manuscript', 'orchestration', 'planning', 'research', 'workspace'];

/** Keep multi-statement SQL intact (including PL/pgSQL); PostgreSQL reports the failing position (EC10). */
async function applyFile(db: Pool, service: string, file: string) {
  const source = readFileSync(join(DDL_FOLDER, file), 'utf8');
  try {
    await db.query(source);
  } catch (error) {
    const pg = error as Error & { position?: string; internalQuery?: string; where?: string };
    const offset = Math.max(0, Number(pg.position ?? 1) - 1);
    const line = source.slice(0, offset).split('\n').length;
    const statement = pg.internalQuery ?? pg.where ?? source.slice(Math.max(0, offset - 180), offset + 350);
    throw new Error(`${service}: ${file}:${line}, SQL gần vị trí ${offset + 1}:\n${statement}\n${pg.message}`, { cause: error });
  }
}

it('dựng 11 database từ DDL tham chiếu (PID-00006-AC04)', async () => {
  expect(readdirSync(DDL_FOLDER).filter((file) => file.endsWith('.sql')).sort())
    .toEqual(['00-common.sql', ...SERVICES.map((service) => `${service}.sql`)].sort());
  const postgres = await startPostgres();
  const admin = new Pool({ connectionString: postgres.connectionUri });
  const results: Array<Record<string, unknown>> = [];
  try {
    const version = (await admin.query('SHOW server_version_num')).rows[0].server_version_num;
    expect(Math.floor(Number(version) / 10_000)).toBe(16);
    for (const service of SERVICES) {
      await createRoles(admin, service.replaceAll('-', '_'));
      const name = `ddl_${service.replaceAll('-', '_')}`;
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
      const connection = new URL(postgres.connectionUri);
      connection.pathname = `/${name}`;
      const db = new Pool({ connectionString: connection.toString() });
      try {
        await applyFile(db, service, '00-common.sql');
        await applyFile(db, service, `${service}.sql`);
        expect((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='app'")).rows[0].n,
          `${service}: bảng app đã dựng`).toBeGreaterThan(5);
        const entry: Record<string, unknown> = { service, database: name, postgres: version, result: 'đạt' };
        if (service === 'knowledge') {
          const vector = (await db.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0].extversion as string;
          const [major, minor] = vector.split('.').map(Number);
          expect(major > 0 || minor >= 8).toBe(true);
          expect((await db.query(`SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
            WHERE attrelid='vec.emb_openai_text_embedding_3_small'::regclass AND attname='embedding'`)).rows)
            .toEqual([{ type: 'vector(1536)' }]);
          expect((await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='vec'
            AND indexname='emb_openai_text_embedding_3_small_hnsw_idx'`)).rows[0].indexdef).toContain('USING hnsw');
          entry.pgvector = vector;
          entry.embedding = 'vector(1536), HNSW';
        }
        results.push(entry);
      } finally { await db.end(); }
    }
    expect(results).toHaveLength(11);
    // Evidence emitted by a test reporter, no runtime logging of payloads or connection strings.
    process.stdout.write(`DDL PostgreSQL 16: ${JSON.stringify(results)}\n`);
  } finally { await admin.end(); await postgres.stop(); }
}, 180_000);
