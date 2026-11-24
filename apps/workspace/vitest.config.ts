// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from 'vitest/config';

// Test của workspace chạm PostgreSQL thật qua Testcontainers (migration, trigger, pg_dump qua docker exec).
// Mặc định của vitest (test 5 s, hook 10 s) quá sát: trên máy hay runner CI có tải, các ca này
// vượt 5 s dù mã đúng. Đặt trần rõ cho cả app; beforeAll dựng container vẫn giữ 180 s riêng.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
