// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import { defineConfig } from 'vitest/config';

// gateway is the only backend the SPA talks to (architecture 3.2); same origin in every environment.
const gateway = process.env.SIRES_GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  // msw serves its service worker in dev only, for the opt-in mock (PID-00013); builds emit nothing from it.
  plugins: [react(), msw()],
  server: {
    port: 5173,
    proxy: { '/api': gateway, '/auth': gateway, '/events': gateway },
  },
  test: {
    // UI tests render React in jsdom; pure modules may opt into `// @vitest-environment node`.
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/shell/test/setup.ts'],
    restoreMocks: true,
    // UI tests type and render the whole frame; leave headroom on loaded machines and CI runners.
    testTimeout: 20_000,
  },
});
