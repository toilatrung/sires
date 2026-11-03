// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { defineConfig } from '@playwright/test';

// E2E_BASE_URL points at staging in CI (architecture 11.3); local default is the Vite dev server.
export default defineConfig({
  testDir: 'tests',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
});
