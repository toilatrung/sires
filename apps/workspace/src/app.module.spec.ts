// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { DatabaseConfigError, loadDatabaseConfig } from './config/database.config';
import { APP_DB, DATABASE_CONFIG, SYSTEM_DB } from './db/database.module';

// Pool của node-postgres chỉ mở kết nối khi có truy vấn: các test này không cần database. WorkspaceAuthModule đọc
// khóa công khai khi app.module.ts được nạp; vi.hoisted đặt seed trước mọi import.
const ENV = {
  DATABASE_APP_URL: 'postgres://sires_workspace_app:secret@db.internal:5432/sires_workspace',
  DATABASE_SYSTEM_URL: 'postgres://sires_workspace_system:secret@db.internal:5432/sires_workspace',
};
vi.hoisted(() => {
  process.env.SERVICE_AUTH_DEV_SEED = 'workspace-app-module-test-seed';
});

describe('workspace AppModule', () => {
  const saved = { ...process.env };
  beforeEach(() => Object.assign(process.env, ENV));
  afterEach(() => {
    process.env = { ...saved };
  });

  const compile = () => Test.createTestingModule({ imports: [AppModule] }).compile();

  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'workspace', status: 'ok' });
    await moduleRef.close();
  });

  it('nối database của hai vai trò từ cấu hình (S04)', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(DATABASE_CONFIG)).toEqual({ appUrl: ENV.DATABASE_APP_URL, systemUrl: ENV.DATABASE_SYSTEM_URL, poolMax: 10 });
    expect(moduleRef.get(SYSTEM_DB)).not.toBe(moduleRef.get(APP_DB));
    await moduleRef.close();
  });

  it('thiếu cấu hình database thì không khởi động (S04)', async () => {
    delete process.env.DATABASE_APP_URL;
    await expect(compile()).rejects.toThrow('thiếu biến môi trường DATABASE_APP_URL');
  });

  it('loadDatabaseConfig không lộ giá trị (S04)', () => {
    let error: unknown;
    try {
      loadDatabaseConfig({ ...ENV, DATABASE_APP_URL: 'mysql://u:secret@h/db' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DatabaseConfigError);
    expect((error as Error).message).not.toContain('secret');
  });
});
