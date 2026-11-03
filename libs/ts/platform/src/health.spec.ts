// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthController, HealthModule } from './health';

describe('HealthModule', () => {
  it('reports the service named in the manifest', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule.forService({ name: 'sample', port: 0 })],
    }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'sample', status: 'ok' });
  });
});
