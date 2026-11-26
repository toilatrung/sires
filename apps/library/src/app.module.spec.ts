// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { DoiModule } from './doi/doi.module';
import { ImportersModule } from './importers/importers.module';
import { ReferencesModule } from './references/references.module';
import { SourcesModule } from './sources/sources.module';

describe('library AppModule', () => {
  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'library', status: 'ok' });
  });

  it('nạp bốn module con', async () => {
    // PID-00024 S03 (spec B4; tickets 1.6): sources, doi, importers, references được nạp và /health vẫn trả đúng.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    for (const module of [SourcesModule, DoiModule, ImportersModule, ReferencesModule]) {
      expect(moduleRef.get(module)).toBeInstanceOf(module);
    }
    const app = moduleRef.createNestApplication();
    try {
      await app.listen(0, '127.0.0.1');
      const response = await fetch(`${await app.getUrl()}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ service: 'library', status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
