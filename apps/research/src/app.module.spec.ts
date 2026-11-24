// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { EvidenceModule } from './evidence/evidence.module';
import { ClaimsModule } from './claims/claims.module';
import { VerificationModule } from './verification/verification.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { KpiModule } from './kpi/kpi.module';
import { AppModule } from './app.module';

describe('research AppModule', () => {
  it('nạp module khung và giữ endpoint health', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'research', status: 'ok' });
    for (const module of [
      EvidenceModule,
      ClaimsModule,
      VerificationModule,
      ArtifactsModule,
      DiagramsModule,
      KpiModule,
    ]) {
      expect(moduleRef.get(module)).toBeInstanceOf(module);
    }
    const app = moduleRef.createNestApplication();
    try {
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ service: 'research', status: 'ok' });
    } finally {
      await app.close();
    }
  }, 30_000);
});
