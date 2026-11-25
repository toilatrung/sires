// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { EvidenceModule } from './evidence/evidence.module';
import { ClaimsModule } from './claims/claims.module';
import { VerificationModule } from './verification/verification.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { KpiModule } from './kpi/kpi.module';
import { manifest } from './manifest';

@Module({
  imports: [
    HealthModule.forService(manifest),
    EvidenceModule,
    ClaimsModule,
    VerificationModule,
    ArtifactsModule,
    DiagramsModule,
    KpiModule,
  ],
})
export class AppModule {}
