// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// gateway is the only backend the SPA talks to (architecture 3.2); same origin in every environment.
const gateway = process.env.SIRES_GATEWAY_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': gateway, '/auth': gateway, '/events': gateway },
  },
});
