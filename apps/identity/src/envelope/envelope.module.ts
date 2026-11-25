// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Module envelope của identity (PID-00016 S03, S04): ProviderSecretService và cổng KMS. Cổng KMS hiện là KMS cục bộ
// đọc KEK từ cấu hình (H1); thiếu cấu hình thì identity không khởi động (EC10). KMS thật thay adapter này ở
// PID-00035, PID-00153.

import { Module } from '@nestjs/common';
import { createLogger } from '@sires/platform';
import { KMS_PORT } from './kms';
import { LocalKeyKms } from './local-kms';
import { ENVELOPE_LOGGER, ProviderSecretService } from './provider-secret.service';

@Module({
  providers: [
    { provide: KMS_PORT, useFactory: () => LocalKeyKms.fromEnv() },
    { provide: ENVELOPE_LOGGER, useFactory: () => createLogger({ service: 'identity' }) },
    ProviderSecretService,
  ],
  exports: [ProviderSecretService],
})
export class EnvelopeModule {}
