// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AuditPostgres, startAuditPostgres } from './database.testkit';
import { runMigrations, sqlState } from './migrate';

describe('migration audit — PID-00018-AC01', () => {
  let pg: AuditPostgres;
  beforeAll(async () => {
    pg = await startAuditPostgres();
    await pg.createDatabase('audit_migrated');
    await pg.createDatabase('audit_reference');
    await runMigrations(pg.url('audit_migrated', 'migrator'));
    await pg.reference('audit_reference');
  }, 180_000);
  afterAll(async () => { await pg?.stop(); });

  it('schema khớp DDL tham chiếu', async () => {
    const dump = await pg.dump('audit_migrated');
    expect(dump).toBe(await pg.dump('audit_reference'));
    const tables = await pg.query('audit_migrated', "SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename");
    expect(tables.map((r) => r.tablename)).toEqual(['audit_event', 'audit_export', 'idempotency_key', 'inbox', 'job_lock', 'kpi_snapshot', 'outbox', 'state_transition']);
    expect(dump).toContain('CREATE TRIGGER audit_event_append_only BEFORE UPDATE');
    expect(dump).toContain('GENERATED ALWAYS AS');
    expect(dump).toContain('UNIQUE NULLS NOT DISTINCT');
    expect(await pg.query('audit_migrated', 'SELECT extname FROM pg_extension ORDER BY extname'))
      .toEqual(['pg_trgm', 'pgcrypto', 'plpgsql', 'unaccent'].map((extname) => ({extname})));
    expect(await pg.query('audit_migrated', 'SELECT * FROM app.state_transition')).toEqual([]);
    expect(dump).not.toContain('drizzle.__drizzle_migrations');
    const owners = await pg.query('audit_migrated', "SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'app'");
    expect(owners).toEqual([{tableowner: 'sires_audit_owner'}]);
  });

  it('chạy lần hai không đổi', async () => {
    const before = await pg.dump('audit_migrated');
    expect(await runMigrations(pg.url('audit_migrated', 'migrator'))).toEqual({applied: 0, total: 1});
    expect(await pg.dump('audit_migrated')).toBe(before);
  });
});

it.each([false, 'migrator-only'] as const)('thiếu vai trò thì dừng — %s (EC02)', async (roles) => {
  const pg = await startAuditPostgres(roles);
  try {
    await pg.createDatabase('audit_no_roles');
    await expect(runMigrations(pg.url('audit_no_roles', roles ? 'migrator' : undefined)))
      .rejects.toSatisfy((error: unknown) => sqlState(error) === '42704');
    expect(await pg.query('audit_no_roles', "SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'replica')")).toEqual([]);
    expect(await pg.query('audit_no_roles', "SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'")).toEqual([]);
    expect(await pg.query('audit_no_roles', 'SELECT count(*)::integer AS n FROM drizzle.__drizzle_migrations')).toEqual([{n:0}]);
    expect(await pg.query('audit_no_roles', "SELECT rolname FROM pg_roles WHERE rolname LIKE 'sires_audit_%' ORDER BY rolname"))
      .toEqual(roles ? [{rolname:'sires_audit_migrator'}, {rolname:'sires_audit_owner'}] : []);
  } finally { await pg.stop(); }
}, 180_000);
