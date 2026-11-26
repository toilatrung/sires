// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { features } from './shell/features';
import { initI18n } from './shell/i18n';
import { routes } from './shell/routes';
import './shell/styles/tokens.css';
import './shell/styles/base.css';

// Mock of the gateway for dev only (PID-00013): `pnpm --filter @sires/web dev:mock`. The guard is a build-time
// constant, false for `vite build` (mode production) even when NODE_ENV is not, so builds contain no mock code
// (shell/mock/build.spec.ts).
async function startMock() {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'production'
    && (import.meta.env.MODE === 'mock' || import.meta.env.VITE_SIRES_MOCK === '1')) {
    const { startMockWorker } = await import('./shell/mock/browser');
    await startMockWorker(features);
  }
}

initI18n();

void startMock().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={createBrowserRouter(routes)} />
    </StrictMode>,
  );
});
