// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { DoiModule } from './doi/doi.module';
import { ImportersModule } from './importers/importers.module';
import { manifest } from './manifest';
import { ReferencesModule } from './references/references.module';
import { SourcesModule } from './sources/sources.module';

@Module({
  imports: [HealthModule.forService(manifest), SourcesModule, DoiModule, ImportersModule, ReferencesModule],
})
export class AppModule {}
