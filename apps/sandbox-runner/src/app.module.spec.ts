// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

describe('sandbox-runner AppModule', () => {
  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'sandbox-runner', status: 'ok' });
  });
});
