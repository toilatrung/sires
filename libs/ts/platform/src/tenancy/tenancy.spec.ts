// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { note, startTenantDatabase, type TenantTestDatabase } from './postgres.testkit';
import { withAccountTransaction } from './transaction';
import { uuidv7 } from './uuid';

const ACCOUNT_A = uuidv7();
const ACCOUNT_B = uuidv7();
const NOTE_A1 = uuidv7();
const NOTE_A2 = uuidv7();
const NOTE_B1 = uuidv7();

describe('tenancy — withAccountTransaction trên PostgreSQL thật (RLS)', () => {
  let database: TenantTestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    database = await startTenantDatabase();
    await database.admin(
      'INSERT INTO app.note (id, account_id, body) VALUES ($1, $2, $3), ($4, $2, $5), ($6, $7, $8)',
      [NOTE_A1, ACCOUNT_A, 'a1', NOTE_A2, 'a2', NOTE_B1, ACCOUNT_B, 'b1'],
    );
    pool = new Pool({ connectionString: database.appUrl, max: 2 });
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await database?.stop();
  }, 60_000);

  it('vai trò _app không có BYPASSRLS và không sở hữu bảng', async () => {
    const [role] = await database.admin<{ rolbypassrls: boolean; owner: string }>(
      "SELECT r.rolbypassrls, t.tableowner AS owner FROM pg_roles r, pg_tables t WHERE r.rolname = 'sires_test_app' AND t.schemaname = 'app' AND t.tablename = 'note'",
    );
    expect(role).toEqual({ rolbypassrls: false, owner: 'sires' });
  });

  it('không đọc được dữ liệu tài khoản khác', async () => {
    const db = drizzle(pool);
    const seenByB = await withAccountTransaction(db, ACCOUNT_B, (tx) => tx.select().from(note));
    expect(seenByB.map((row) => row.id)).toEqual([NOTE_B1]);
    expect(seenByB.every((row) => row.accountId === ACCOUNT_B)).toBe(true);

    const aRowByB = await withAccountTransaction(db, ACCOUNT_B, (tx) =>
      tx.select().from(note).where(eq(note.id, NOTE_A1)),
    );
    expect(aRowByB).toEqual([]);

    const seenByA = await withAccountTransaction(db, ACCOUNT_A, (tx) => tx.select().from(note));
    expect(seenByA.map((row) => row.id).sort()).toEqual([NOTE_A1, NOTE_A2].sort());
  });

  it('thiếu account_id trả 0 dòng', async () => {
    const [{ total }] = await database.admin<{ total: number }>('SELECT count(*)::int AS total FROM app.note');
    expect(total).toBeGreaterThanOrEqual(3);

    const db = drizzle(pool);
    expect(await db.select().from(note)).toEqual([]);
    expect(await db.transaction((tx) => tx.select().from(note))).toEqual([]);
    const [{ visible }] = (await pool.query<{ visible: number }>('SELECT count(*)::int AS visible FROM app.note')).rows;
    expect(visible).toBe(0);
  });

  it('không lẫn giữa hai giao dịch', async () => {
    // Song song trên hai kết nối của cùng pool.
    const db = drizzle(pool);
    const readSlowly = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
      tx.execute(sql`select pg_sleep(0.2)`).then(() => tx.select().from(note));
    const [seenByA, seenByB] = await Promise.all([
      withAccountTransaction(db, ACCOUNT_A, readSlowly),
      withAccountTransaction(db, ACCOUNT_B, readSlowly),
    ]);
    expect(seenByA.every((row) => row.accountId === ACCOUNT_A)).toBe(true);
    expect(seenByA).toHaveLength(2);
    expect(seenByB.map((row) => row.id)).toEqual([NOTE_B1]);

    // Nối tiếp trên đúng một kết nối: giá trị SET LOCAL không còn sau khi giao dịch kết thúc.
    const single = new Pool({ connectionString: database.appUrl, max: 1 });
    try {
      const singleDb = drizzle(single);
      const [first, second] = await Promise.all([
        withAccountTransaction(singleDb, ACCOUNT_A, (tx) => tx.select().from(note)),
        withAccountTransaction(singleDb, ACCOUNT_B, (tx) => tx.select().from(note)),
      ]);
      expect(first.every((row) => row.accountId === ACCOUNT_A)).toBe(true);
      expect(second.map((row) => row.id)).toEqual([NOTE_B1]);
      const [{ setting, pid }] = (
        await single.query<{ setting: string | null; pid: number }>(
          "SELECT current_setting('app.account_id', true) AS setting, pg_backend_pid() AS pid",
        )
      ).rows;
      expect(setting ?? '').toBe('');
      expect(single.totalCount).toBe(1);
      expect(pid).toBeGreaterThan(0);
      expect(await singleDb.select().from(note)).toEqual([]);
    } finally {
      await single.end();
    }
  });

  it('rollback khi lỗi', async () => {
    const db = drizzle(pool);
    const temporary = uuidv7();
    const original = new Error('lỗi nghiệp vụ');
    await expect(
      withAccountTransaction(db, ACCOUNT_A, async (tx) => {
        await tx.insert(note).values({ id: temporary, accountId: ACCOUNT_A, body: 'tạm', rowVersion: 1 });
        throw original;
      }),
    ).rejects.toBe(original);
    expect(await database.admin('SELECT id FROM app.note WHERE id = $1', [temporary])).toEqual([]);
  });

  it('không ghi được dòng mang account_id của tài khoản khác', async () => {
    const db = drizzle(pool);
    await expect(
      withAccountTransaction(db, ACCOUNT_B, (tx) =>
        tx.insert(note).values({ id: uuidv7(), accountId: ACCOUNT_A, body: 'chéo', rowVersion: 1 }),
      ),
    ).rejects.toThrow();
    expect(await database.admin('SELECT id FROM app.note WHERE body = $1', ['chéo'])).toEqual([]);
  });

  it('từ chối accountId không phải UUID', async () => {
    const db = drizzle(pool);
    await expect(withAccountTransaction(db, '', (tx) => tx.select().from(note))).rejects.toBeInstanceOf(TypeError);
    await expect(
      withAccountTransaction(db, "x'; RESET app.account_id; --", (tx) => tx.select().from(note)),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
