// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { DatabaseConfigError, loadDatabaseConfig } from './config/database.config';
import { APP_DB, DATABASE_CONFIG, SYSTEM_DB } from './db/database.module';

// Pool của node-postgres chỉ mở kết nối khi có truy vấn: các test này không cần database.
const ENV = {
  DATABASE_APP_URL: 'postgres://sires_planning_app:secret@db.internal:5432/sires_planning',
  DATABASE_SYSTEM_URL: 'postgres://sires_planning_system:secret@db.internal:5432/sires_planning',
};

describe('planning AppModule', () => {
  const saved = { ...process.env };
  beforeEach(() => Object.assign(process.env, ENV));
  afterEach(() => {
    process.env = { ...saved };
  });

  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'planning', status: 'ok' });
    await moduleRef.close();
  });

  it('nối database của hai vai trò từ cấu hình (S07)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(DATABASE_CONFIG)).toEqual({ appUrl: ENV.DATABASE_APP_URL, systemUrl: ENV.DATABASE_SYSTEM_URL, poolMax: 10 });
    expect(moduleRef.get(APP_DB)).toBeDefined();
    expect(moduleRef.get(SYSTEM_DB)).not.toBe(moduleRef.get(APP_DB));
    await moduleRef.close();
  });

  it('thiếu cấu hình database thì không khởi động (S07)', async () => {
    delete process.env.DATABASE_SYSTEM_URL;
    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow('thiếu biến môi trường DATABASE_SYSTEM_URL');
  });
});

describe('loadDatabaseConfig (S07)', () => {
  it('kiểm biến, không lộ giá trị', () => {
    expect(loadDatabaseConfig({ ...ENV, DATABASE_POOL_MAX: '4' }).poolMax).toBe(4);
    for (const [env, message] of [
      [{ DATABASE_SYSTEM_URL: ENV.DATABASE_SYSTEM_URL }, 'thiếu biến môi trường DATABASE_APP_URL'],
      [{ ...ENV, DATABASE_APP_URL: '  ' }, 'thiếu biến môi trường DATABASE_APP_URL'],
      [{ ...ENV, DATABASE_APP_URL: 'mysql://u:secret@h/db' }, 'DATABASE_APP_URL phải bắt đầu bằng postgres://'],
      [{ ...ENV, DATABASE_SYSTEM_URL: 'secret không phải url' }, 'DATABASE_SYSTEM_URL không phải URL hợp lệ'],
      [{ ...ENV, DATABASE_POOL_MAX: '0' }, 'DATABASE_POOL_MAX phải là số nguyên ≥ 1'],
    ] as const) {
      let error: unknown;
      try {
        loadDatabaseConfig(env);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DatabaseConfigError);
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).not.toContain('secret');
    }
  });
});
