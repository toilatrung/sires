// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Test } from '@nestjs/testing';
import { HealthController } from '@sires/platform';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { ContextStoreModule } from './context-store';
import { DeliberationModule } from './deliberation';
import { EngineModule, WORKFLOW_ENGINE } from './engine';
import { PromptsModule } from './prompts';
import { UsageModule } from './usage';

describe('orchestration AppModule', () => {
  it('wires the health endpoint with this service manifest', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'orchestration', status: 'ok' });
  });

  // PID-00019-AC02: AppModule nạp đủ năm module con; giao diện engine tiêm được qua token xuất ở engine/index.ts.
  it('nạp đủ module con', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    for (const module of [EngineModule, PromptsModule, ContextStoreModule, DeliberationModule, UsageModule]) {
      expect(moduleRef.get(module, { strict: false }), module.name).toBeInstanceOf(module);
    }
    expect(moduleRef.get(WORKFLOW_ENGINE, { strict: false })).toBeDefined();
    expect(moduleRef.get(HealthController).check()).toEqual({ service: 'orchestration', status: 'ok' });
  });
});
