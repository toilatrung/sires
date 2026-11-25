// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { LOCAL_KMS_ENV, ProviderSecretService } from './envelope';

describe('identity AppModule', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env[LOCAL_KMS_ENV.kek] = randomBytes(32).toString('base64');
    process.env[LOCAL_KMS_ENV.keyId] = 'local-kek-1';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'identity', status: 'ok' });
    expect(moduleRef.get(ProviderSecretService)).toBeInstanceOf(ProviderSecretService);
  });

  it('thiếu cấu hình KEK thì không khởi động (EC10)', async () => {
    const kek = process.env[LOCAL_KMS_ENV.kek] as string;
    delete process.env[LOCAL_KMS_ENV.keyId];
    const error = await Test.createTestingModule({ imports: [AppModule] }).compile().catch((e: unknown) => e);
    expect(String(error)).toContain(`thiếu cấu hình KMS cục bộ ${LOCAL_KMS_ENV.keyId}`);
    expect(String(error)).not.toContain(kek);
  });
});
