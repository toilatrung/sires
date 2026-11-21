// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Cấu hình ESLint của orchestration: cấu hình gốc của repo cộng luật ranh giới module con (PID-00019 S03).
// `eslint .` (target lint) chạy trong thư mục app nên ESLint nạp file này thay cho file gốc.
import root from '../../eslint.config.mjs';

/** Luật: ngoài engine/, chỉ được import engine qua điểm vào engine/index.ts (tickets 1.6; PID-00019-AC02, EC01). */
const engineBoundary = {
  files: ['src/**/*.ts'],
  ignores: ['src/engine/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/engine/**', '!**/engine/index', '!**/engine/index.js'],
        message: 'Module khác chỉ gọi engine qua giao diện ở engine/index.ts (import từ "../engine"), không import file nội bộ của engine/.',
      }],
    }],
  },
};

export default [...root, engineBoundary];
