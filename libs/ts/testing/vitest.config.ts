// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from 'vitest/config';
import { TESTCONTAINERS_TIMEOUTS } from './src/vitest/timeouts';

// Test của @sires/testing dựng container thật (PostgreSQL, RabbitMQ, MinIO). Đọc hằng từ mã nguồn của chính gói,
// vì gói chưa build khi chạy test của mình.
// Trần timeout chung của test dùng Testcontainers (PC-04 A6): test 60 s, hook 180 s.
export default defineConfig({
  test: { ...TESTCONTAINERS_TIMEOUTS },
});
