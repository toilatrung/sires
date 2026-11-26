// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ShellProvider } from './shell/hooks';
import { initI18n } from './shell/i18n';
import { routes } from './shell/routes';
import { createShellServices } from './shell/services';
import './shell/styles/tokens.css';
import './shell/styles/motion.css';
import './shell/styles/base.css';
import './shell/styles/shell.css';

/**
 * The single hook for API mocks (PID-00013): if `src/mocks/index.ts` exists and exports `startMocks()`, it runs
 * before the first render and decides by itself whether mocks are on (for example from an env flag). The shell
 * stays unaware of how mocks work; without that file nothing happens.
 */
const mockModules = import.meta.glob<{ startMocks?: () => Promise<void> | void }>('./mocks/index.ts');

async function startMocks(): Promise<void> {
  const load = mockModules['./mocks/index.ts'];
  if (load) await (await load()).startMocks?.();
}

async function main(): Promise<void> {
  await startMocks();
  initI18n();
  const services = createShellServices();
  const router = createBrowserRouter(routes);
  services.attachRouter(router);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ShellProvider services={services}>
        <RouterProvider router={router} />
      </ShellProvider>
    </StrictMode>,
  );
}

void main();
