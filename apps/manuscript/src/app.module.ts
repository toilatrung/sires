// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { BibliographyModule } from './bibliography/bibliography.module';
import { BuildsModule } from './builds/builds.module';
import { KpiModule } from './kpi/kpi.module';
import { manifest } from './manifest';
import { ProposalsModule } from './proposals/proposals.module';
import { RevisionsModule } from './revisions/revisions.module';

/** Khung module của manuscript (PID-00030 S03), theo đường dẫn Module của các PID tính năng sau. */
export const MANUSCRIPT_MODULES = [RevisionsModule, ProposalsModule, BibliographyModule, BuildsModule, KpiModule];

@Module({
  imports: [HealthModule.forService(manifest), ...MANUSCRIPT_MODULES],
})
export class AppModule {}
