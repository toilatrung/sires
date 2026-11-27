// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

/**
 * Trần timeout cho test chạm PostgreSQL, RabbitMQ, MinIO thật qua Testcontainers (quy ước PO 24/11/2026, PC-04 A6):
 * test 60 s, hook 180 s. Mặc định của vitest (test 5 s, hook 10 s) quá sát khi máy hay runner CI có tải.
 *
 * Mỗi project dùng trong `vitest.config.ts` của mình, đọc từ đường dẫn con `@sires/testing/vitest` (không kéo
 * Testcontainers vào lúc nạp config):
 *
 * ```ts
 * import { defineConfig } from 'vitest/config';
 * import { TESTCONTAINERS_TIMEOUTS } from '@sires/testing/vitest';
 *
 * export default defineConfig({ test: { ...TESTCONTAINERS_TIMEOUTS } });
 * ```
 *
 * `beforeAll` dựng container vẫn có thể đặt timeout riêng lớn hơn.
 */
export const TESTCONTAINERS_TIMEOUTS: Readonly<{ testTimeout: number; hookTimeout: number }> = Object.freeze({
  testTimeout: 60_000,
  hookTimeout: 180_000,
});
