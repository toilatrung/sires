// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Render the real shell (routes, services, providers) on a memory router with the fetch stub.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { expect } from 'vitest';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { Feature } from '../feature';
import { ShellProvider } from '../hooks';
import { createRoutes } from '../routes';
import { createShellServices, type BrowserNavigator } from '../services';
import type { DraftStorage } from '../drafts/store';
import { neutralFeatures } from './features';
import { shellStub, type FetchStub } from './stub';

export interface RenderShellOptions {
  path?: string;
  stub?: FetchStub;
  /**
   * Feature areas mounted before the neutral ones (e.g. a test screen with an input). The areas' real screens are
   * never mounted: every other path shows the shell's Placeholder (test/features.tsx, neutralFeatures).
   */
  features?: Feature[];
  storage?: DraftStorage;
}

export function testBrowser(): BrowserNavigator & { forms: Array<{ action: string; fields: Record<string, string> }>; assigned: string[] } {
  const forms: Array<{ action: string; fields: Record<string, string> }> = [];
  const assigned: string[] = [];
  return {
    forms,
    assigned,
    submitForm: (action, fields) => forms.push({ action, fields }),
    assign: (url) => assigned.push(url),
  };
}

export function renderShell(options: RenderShellOptions = {}) {
  const stub = options.stub ?? shellStub();
  const browser = testBrowser();
  const services = createShellServices({ fetch: stub.fetch, browser, i18n: i18next, storage: options.storage, sseRetryDelays: [10] });
  const { features: extra = [] } = options;
  const routes: RouteObject[] = createRoutes([...extra, ...neutralFeatures]);
  const router = createMemoryRouter(routes, { initialEntries: [options.path ?? '/dashboard'] });
  const detach = services.attachRouter(router as never);
  const user = userEvent.setup();
  const view = render(
    <ShellProvider services={services}>
      <RouterProvider router={router} />
    </ShellProvider>,
  );
  return {
    ...view,
    stub,
    services,
    router,
    browser,
    user,
    detach,
    unmountAll() {
      services.events.close();
      detach();
      view.unmount();
    },
  };
}

/** Wait until the frame shows the routed screen (session checked). */
export async function waitForFrame(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.queryByText(/Đang kiểm phiên|Checking your session/)).toBeNull();
  });
}

export function TestScreen({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}
