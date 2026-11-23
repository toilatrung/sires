// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { Module } from '@nestjs/common';
import { HealthModule } from '@sires/platform';
import { WorkspaceAuthModule } from './auth/service-auth';
import { DatabaseModule } from './db/database.module';
import { manifest } from './manifest';

@Module({
  // Cấu hình database và khóa công khai service-auth đọc từ biến môi trường khi khởi động; thiếu thì không lên.
  imports: [HealthModule.forService(manifest), DatabaseModule, WorkspaceAuthModule.forRoot()],
})
export class AppModule {}
