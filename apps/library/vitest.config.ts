// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from 'vitest/config';

// Test của library chạm PostgreSQL thật qua Testcontainers (migration, trigger, pg_dump qua docker exec). Mặc định
// của vitest (test 5 s, hook 10 s) quá sát khi máy hay runner CI có tải. Quy ước PO 24/11/2026 (PC-04 A6): test 60 s,
// hook 180 s. Khi @sires/testing có hằng chung cho quy ước này (luồng platform) thì chuyển sang dùng hằng đó.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
