// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from 'vitest/config';
import { TESTCONTAINERS_TIMEOUTS } from '@sires/testing/vitest';

// Test của @sires/platform dựng PostgreSQL, RabbitMQ thật (outbox, inbox, audit, state machine, telemetry khi chạy
// song song). telemetry.spec.ts từng hết giờ ở 5 s mặc định.
// Trần timeout chung của test dùng Testcontainers (PC-04 A6): test 60 s, hook 180 s.
export default defineConfig({
  test: { ...TESTCONTAINERS_TIMEOUTS },
});
