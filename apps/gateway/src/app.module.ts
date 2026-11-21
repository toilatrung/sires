// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { manifest } from './manifest';
import { SessionModule } from './session';

@Module({
  imports: [HealthModule.forService(manifest), SessionModule],
})
export class AppModule {}
