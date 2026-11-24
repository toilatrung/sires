// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { BibliographyModule } from './bibliography/bibliography.module';
import { BuildsModule } from './builds/builds.module';
import { KpiModule } from './kpi/kpi.module';
import { ProposalsModule } from './proposals/proposals.module';
import { RevisionsModule } from './revisions/revisions.module';

describe('manuscript AppModule', () => {
  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'manuscript', status: 'ok' });
    await moduleRef.close();
  });

  it('nạp module khung (spec B3)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    for (const module of [RevisionsModule, ProposalsModule, BibliographyModule, BuildsModule, KpiModule]) {
      expect(moduleRef.get(module), module.name).toBeInstanceOf(module);
    }
    // Service vẫn khởi động với khung module và /health trả đúng qua HTTP.
    const app = moduleRef.createNestApplication();
    try {
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ service: 'manuscript', status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
