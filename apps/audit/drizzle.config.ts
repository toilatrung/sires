// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from 'drizzle-kit';

// CLI bắt buộc tham số schema ngay cả với --custom. Module runner không export bảng;
// chỉ dùng generate --custom, không tạo schema TypeScript cho truy vấn (PID-00045).
export default defineConfig({ dialect: 'postgresql', out: './migrations', schema: './src/db/migrate.ts' });
