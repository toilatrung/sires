// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { AUDIT_DATABASE_CONFIG, readDatabaseConfig } from '../config/database';
import { AuditDatabase } from './database.module';
import { ACCOUNT_A, ACCOUNT_B, PROJECT, type AuditPostgres, insertEvent, startAuditPostgres } from './database.testkit';
import { runMigrations } from './migrate';

const DATABASE = 'sires_audit';
const EVENT = '0193a000-0000-7000-8000-000000000099';
const rejectCode = (code: string) => ({ code });

describe('audit DDL — PID-00018-AC01, CTX-AUDIT-001-AC04', () => {
  let pg: AuditPostgres;
  beforeAll(async () => {
    pg = await startAuditPostgres();
    await pg.createDatabase(DATABASE);
    await runMigrations(pg.url(DATABASE, 'migrator'));
  }, 180_000);
  afterAll(async () => { await pg?.stop(); });
  beforeEach(async () => {
    await pg.query(DATABASE, 'TRUNCATE app.audit_event, app.kpi_snapshot, app.audit_export');
    await pg.asRole(DATABASE, 'system', ACCOUNT_A, (client) => insertEvent(client, { id: EVENT }));
  });

  it.each(['app', 'system', 'purge', 'owner'] as const)('không sửa được — %s (EC06)', async (role) => {
    const row = await pg.asRole(DATABASE, role, ACCOUNT_A, (client) => client.query('SELECT id FROM app.audit_event WHERE id=$1', [EVENT]));
    expect(row.rowCount).toBe(1);
    await expect(pg.asRole(DATABASE, role, ACCOUNT_A, (client) => client.query("UPDATE app.audit_event SET summary='changed' WHERE id=$1", [EVENT])))
      .rejects.toMatchObject(rejectCode(role === 'owner' ? '23000' : '42501'));
    expect(await pg.query(DATABASE, 'SELECT summary FROM app.audit_event WHERE id=$1', [EVENT])).toEqual([{summary:null}]);
  });

  it('không xóa được trừ purge — hành vi theo DDL (EC07)', async () => {
    for (const role of ['app', 'system'] as const) {
      await expect(pg.asRole(DATABASE, role, ACCOUNT_A, (client) => client.query('DELETE FROM app.audit_event WHERE id=$1', [EVENT])))
        .rejects.toMatchObject(rejectCode('42501'));
      expect(await pg.query(DATABASE, 'SELECT id FROM app.audit_event WHERE id=$1', [EVENT])).toHaveLength(1);
    }
    expect((await pg.asRole(DATABASE, 'purge', undefined, (client) => client.query('DELETE FROM app.audit_event WHERE id=$1', [EVENT]))).rowCount).toBe(1);
  });

  it('chỉ system ghi — trùng id bị từ chối (EC08)', async () => {
    await expect(pg.asRole(DATABASE, 'app', ACCOUNT_A, (client) => insertEvent(client))).rejects.toMatchObject(rejectCode('42501'));
    const inserted = await pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client));
    expect(inserted.rowCount).toBe(1);
    await expect(pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client, { id: EVENT })))
      .rejects.toMatchObject(rejectCode('23505'));
  });

  const invalidCases = [
    {name:'agent thiếu agentRunId', input:{actor:{type:'agent',agent:'synthesis'}}},
    {name:'APR-11', input:{apr:'APR-11'}},
    {name:'summary 2001 ký tự', input:{summary:'a'.repeat(2001)}},
  ];
  it.each(invalidCases)('check — $name (EC09)', async ({input}) => {
    await expect(pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client, input)))
      .rejects.toMatchObject(rejectCode('23514'));
  });

  const invalidActors = [
    {name:'analysis thiếu instance (N1)', actor:{type:'agent',agent:'analysis',agentRunId:EVENT}},
    {name:'analysis instance null (N2)', actor:{type:'agent',agent:'analysis',agentRunId:EVENT,instance:null}},
    {name:'thiếu agent (N3)', actor:{type:'agent',agentRunId:EVENT}},
    {name:'agent null (N4)', actor:{type:'agent',agent:null,agentRunId:EVENT}},
    {name:'thiếu agent có instance (N5)', actor:{type:'agent',agentRunId:EVENT,instance:'A'}},
  ];
  const insertExport = (createdBy: unknown) => pg.asRole(DATABASE, 'system', undefined,
    (client) => client.query(`INSERT INTO app.audit_export (account_id,project_id,format,status,created_by)
      VALUES ($1,$2,'json','Queued',$3::jsonb) RETURNING id`, [ACCOUNT_A,PROJECT,JSON.stringify(createdBy)]));

  describe.each(['actor', 'created_by'] as const)('check — %s (EC09)', (field) => {
    it.each(invalidActors)('$name bị từ chối', async ({actor}) => {
      const result = field === 'actor'
        ? pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client, {actor}))
        : insertExport(actor);
      await expect(result).rejects.toMatchObject(rejectCode('23514'));
    });

    it('agent synthesis không instance hợp lệ', async () => {
      const actor = {type:'agent',agent:'synthesis',agentRunId:EVENT};
      if (field === 'actor') {
        const result = await pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client, {actor}));
        expect(result.rowCount).toBe(1);
        expect(result.rows[0].actor_type).toBe('agent');
      } else {
        expect((await insertExport(actor)).rowCount).toBe(1);
      }
    });
  });

  it('check — ActorRef hợp lệ sinh actor_type và summary 2000 ký tự (EC09)', async () => {
    for (const actor of [
      {type:'researcher',accountId:ACCOUNT_A}, {type:'system',component:'audit'},
      {type:'agent',agent:'analysis',agentRunId:EVENT,instance:'A'},
    ]) {
      const result = await pg.asRole(DATABASE, 'system', undefined, (client) => insertEvent(client, {actor, summary:'a'.repeat(2000),apr:'APR-10'}));
      expect(result.rows[0].actor_type).toBe(actor.type);
    }
  });

  it('rls — tài khoản B và thiếu context không đọc được dòng của A (EC10)', async () => {
    for (const account of [ACCOUNT_B, undefined]) {
      expect((await pg.asRole(DATABASE, 'app', account, (client) => client.query('SELECT * FROM app.audit_event'))).rows).toEqual([]);
    }
    expect((await pg.asRole(DATABASE, 'app', ACCOUNT_A, (client) => client.query('SELECT * FROM app.audit_event'))).rowCount).toBe(1);
    expect((await pg.asRole(DATABASE, 'system', undefined, (client) => client.query('SELECT * FROM app.audit_event'))).rowCount).toBe(1);
  });

  it('kpi snapshot — kỳ, mã và UNIQUE NULLS NOT DISTINCT (EC11)', async () => {
    const insert = (kpi: string, start: string, end: string, project: string | null = null) =>
      pg.asRole(DATABASE, 'system', undefined, (client) => client.query(`INSERT INTO app.kpi_snapshot
        (account_id,project_id,kpi,period_start,period_end) VALUES ($1,$2,$3,$4,$5)`, [ACCOUNT_A,project,kpi,start,end]));
    await insert('KPI-01','2026-01-01','2026-02-01');
    await expect(insert('KPI-01','2026-01-01','2026-02-01')).rejects.toMatchObject(rejectCode('23505'));
    await insert('KPI-01','2026-01-01','2026-02-01',PROJECT);
    await expect(insert('KPI-10','2026-01-01','2026-02-01')).rejects.toMatchObject(rejectCode('23514'));
    await expect(insert('KPI-02','2026-02-01','2026-02-01')).rejects.toMatchObject(rejectCode('23514'));
    await expect(insert('KPI-02','2026-03-01','2026-02-01')).rejects.toMatchObject(rejectCode('23514'));
  });

  it('audit export — row_version, format, status (EC12)', async () => {
    const insert = (format: string, status: string) => pg.asRole(DATABASE, 'system', undefined,
      (client) => client.query(`INSERT INTO app.audit_export (account_id,project_id,format,status,created_by)
        VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`, [ACCOUNT_A,PROJECT,format,status,JSON.stringify({type:'researcher',accountId:ACCOUNT_A})]));
    const {id} = (await insert('json','Queued')).rows[0];
    const update = (changes: string) => pg.asRole(DATABASE, 'app', ACCOUNT_A, (client) => client.query(
      `UPDATE app.audit_export SET ${changes} WHERE id=$1 RETURNING row_version, updated_at`, [id]));
    expect((await update("status='Running'")).rows[0]).toMatchObject({row_version:2,updated_at:expect.any(Date)});
    await expect(update('row_version=4')).rejects.toMatchObject(rejectCode('40001'));
    expect((await update("status='Succeeded',row_version=3")).rows[0].row_version).toBe(3);
    await expect(insert('xml','Queued')).rejects.toMatchObject(rejectCode('23514'));
    await expect(insert('csv','Unknown')).rejects.toMatchObject(rejectCode('23514'));
    expect((await insert('csv','Failed')).rowCount).toBe(1);
  });

  it('module database — helper tenancy cách ly tài khoản, pool được đóng (S03)', async () => {
    const moduleRef = await Test.createTestingModule({imports:[AppModule]})
      .overrideProvider(AUDIT_DATABASE_CONFIG).useValue(readDatabaseConfig({
        DATABASE_APP_URL:pg.url(DATABASE,'app'), DATABASE_SYSTEM_URL:pg.url(DATABASE,'system'),
      })).compile();
    await moduleRef.init();
    const db = moduleRef.get(AuditDatabase);
    try {
      expect(moduleRef.get(HealthController).check()).toEqual({service:'audit',status:'ok'});
      expect((await db.forAccount(ACCOUNT_A, (tx) => tx.execute(sql`SELECT id FROM app.audit_event`))).rows).toHaveLength(1);
      expect((await db.forAccount(ACCOUNT_B, (tx) => tx.execute(sql`SELECT id FROM app.audit_event`))).rows).toEqual([]);
      expect((await db.system.execute(sql`SELECT id FROM app.audit_event`)).rows).toHaveLength(1);
    } finally { await moduleRef.close(); }
    await expect(db.forAccount(ACCOUNT_A, (tx) => tx.execute(sql`SELECT 1`))).rejects.toThrow('pool');
  });
});
