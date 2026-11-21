// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { AUDIT_DATABASE_CONFIG, readDatabaseConfig } from './config/database';

const ENV = {
  DATABASE_APP_URL: 'postgres://sires_audit_app:test@127.0.0.1/sires_audit',
  DATABASE_SYSTEM_URL: 'postgres://sires_audit_system:test@127.0.0.1/sires_audit',
  DATABASE_MIGRATOR_URL: 'postgres://sires_audit_migrator:test@127.0.0.1/sires_audit',
};

describe('audit AppModule', () => {
  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUDIT_DATABASE_CONFIG).useValue(readDatabaseConfig(ENV)).compile();
    try { expect(moduleRef.get(HealthController).check()).toEqual({ service: 'audit', status: 'ok' }); }
    finally { await moduleRef.close(); }
  });

  it('thiếu cấu hình database thì không khởi động', async () => {
    await expect(Test.createTestingModule({imports:[AppModule]})
      .overrideProvider(AUDIT_DATABASE_CONFIG).useFactory({factory: () => readDatabaseConfig({})}).compile())
      .rejects.toThrow('DATABASE_APP_URL');
    for (const name of Object.keys(ENV)) {
      const env = {...ENV, [name]:undefined};
      expect(() => readDatabaseConfig(env)).toThrow(name);
    }
  });

  it('URL lỗi không lộ cấu hình nhạy cảm', () => {
    const secret = 'known-test-password';
    try {
      readDatabaseConfig({...ENV, DATABASE_SYSTEM_URL:`https://user:${secret}@host/sires_audit`});
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('DATABASE_SYSTEM_URL');
      expect(String(error)).not.toContain(secret);
    }
  });
});
