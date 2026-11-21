// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { ContextStoreModule } from './context-store';
import { DeliberationModule } from './deliberation';
import { EngineModule } from './engine';
import { manifest } from './manifest';
import { PromptsModule } from './prompts';
import { UsageModule } from './usage';

// Năm module con theo tickets 1.6; engine là lõi, module khác gọi engine qua engine/index.ts (PID-00019 S03).
@Module({
  imports: [
    HealthModule.forService(manifest),
    EngineModule,
    PromptsModule,
    ContextStoreModule,
    DeliberationModule,
    UsageModule,
  ],
})
export class AppModule {}
