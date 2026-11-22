// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// drizzle-kit chỉ dùng lúc phát triển để tạo migration (kiến trúc 6.10; PID-00017 H1):
//   pnpm --filter @sires/workspace exec drizzle-kit generate --custom --name <tên>
// Migration là SQL viết tay theo docs/database/ddl hoặc SQL sinh từ khai báo state machine (H2); chưa có schema
// Drizzle TypeScript (PID tính năng viết). Lúc chạy, migration áp bằng migrate() của drizzle-orm (src/db/migrate.ts).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './migrations',
  schema: './src/db/schema.ts',
});
